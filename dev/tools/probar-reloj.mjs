/* Pruebas del reloj, sin navegador.
 *
 * El reloj es la pieza contra la que se cronometra todo, y sus fallos se ven
 * como "la letra va mal" — un sintoma que se confunde con otras cinco causas.
 * Aqui se le pone un elemento de video falso y se comprueba que el tiempo que
 * devuelve es el que tiene que ser.
 *
 *   node dev/tools/probar-reloj.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (f) => readFileSync(join(raiz, f), 'utf8');

/* El reloj pide su elemento con punto('video'), que vive en 10-puntos.js y
   necesita un DOM. Se sustituye por un doble que devuelve el video falso, y asi
   el resto del modulo se prueba tal cual, sin tocarlo. */
/* Y el tiempo de pared se sustituye tambien. Sin esto la prueba del fallo
   reportado no probaria nada: en node, performance.now() vale unos milisegundos,
   asi que el calculo equivocado daba un numero pequeno y pasaba de casualidad. El
   fallo solo aparece con la pestana abierta un rato, y eso hay que poder
   simularlo. */
const fuente = [
  leer('mods/youtube-music/live-lyrics/src/05-prologo.js').replace('__VERSION__', 'prueba'),
  'const performance = globalThis.__reloj;',
  /* Dos puntos distintos desde que el reloj mira tambien al reproductor: el
     doble tiene que poder dar uno sin el otro, que es como se prueba el
     respaldo al <video>. */
  "const punto = (n) => (n === 'moviePlayer' ? globalThis.__mp : globalThis.__video);",
  leer('mods/youtube-music/live-lyrics/src/20-reloj.js'),
].join('\n');

let ahora = 0;
globalThis.__reloj = { now: () => ahora };
const avanzar = (ms) => { ahora += ms; };

const { Reloj } = new Function(`${fuente}\n return { Reloj };`)();

// --- Doble del elemento de video -----------------------------------------
const hacerVideo = (props = {}) => ({
  currentTime: 0,
  duration: 200,
  paused: false,
  playbackRate: 1,
  isConnected: true,
  _oyentes: {},
  addEventListener(ev, f) { (this._oyentes[ev] = this._oyentes[ev] || []).push(f); },
  emitir(ev) { for (const f of this._oyentes[ev] || []) f(); },
  ...props,
});

/* Doble de #movie_player. Los metodos son los que cuelga el codigo de YouTube,
   no propiedades del DOM: el reloj los usa para no leer el tiempo del flujo
   cosido. `null` en su sitio prueba el respaldo. */
const hacerReproductor = (tiempo, duracion) => ({
  isConnected: true,
  buscado: null,
  getCurrentTime: () => tiempo,
  getDuration: () => duracion,
  seekTo(s) { this.buscado = s; },
});

let fallos = 0;
let hechas = 0;
const ok = (nombre, condicion, detalle) => {
  hechas++;
  if (condicion) { console.log(`  ok    ${nombre}`); return; }
  fallos++;
  console.log(`  FALLO ${nombre}${detalle ? `\n        ${detalle}` : ''}`);
};
const grupo = (n) => console.log(`\n${n}`);

const reiniciar = (video, reproductor = null) => {
  globalThis.__video = video;
  globalThis.__mp = reproductor;
  Reloj._video = null;
  Reloj._mpNodo = null;
  Reloj._mpApi = null;
  Reloj._ultimoReal = 0;
  Reloj._marcaReal = 0;
  Reloj._congelado = 0;
  Reloj._anuncio = false;
  Reloj._duracion = 0;
  Reloj.video();          // engancha
};

// --- El fallo reportado ---------------------------------------------------
grupo('Arranque con currentTime en cero exacto');
{
  /* EL FALLO: en el instante de un cambio de pista, currentTime vale 0 exacto.
     Como el valor no ha CAMBIADO respecto al inicial, la marca de tiempo no se
     actualizaba, y la extrapolacion salia desde cero absoluto: o sea
     performance.now() entero, que son los segundos que lleva abierta la pestana.
     Con la pestana abierta un rato, el reloj devolvia cientos de segundos y la
     letra aparecia directamente en la ultima linea. */
  ahora = 600000;                   // diez minutos con la pestana abierta
  const v = hacerVideo({ currentTime: 0, paused: false });
  reiniciar(v);
  const t = Reloj.tiempo();
  ok('con la pagina abierta un rato, el tiempo sigue siendo ~0', t < 1,
    `devolvio ${t.toFixed(1)}s, que son exactamente los segundos que lleva abierta la pagina`);
}

grupo('Lo que ya funcionaba, que tiene que seguir funcionando');
{
  const v = hacerVideo({ currentTime: 42, paused: false });
  reiniciar(v);
  const t = Reloj.tiempo();
  ok('lee el tiempo real del video', Math.abs(t - 42) < 0.05, `devolvio ${t}`);

  v.currentTime = 43;
  const t2 = Reloj.tiempo();
  ok('sigue el valor cuando avanza', Math.abs(t2 - 43) < 0.05, `devolvio ${t2}`);
}

grupo('En pausa no avanza');
{
  const v = hacerVideo({ currentTime: 30, paused: true });
  reiniciar(v);
  Reloj.tiempo();
  const a = Reloj.tiempo();
  const b = Reloj.tiempo();
  ok('dos lecturas seguidas dan lo mismo', a === b, `${a} contra ${b}`);
  ok('y es el tiempo del video', Math.abs(a - 30) < 0.05, `devolvio ${a}`);
}

grupo('El tope de extrapolacion');
{
  /* Si el video deja de refrescar currentTime — decodificacion atascada, pestana
     en segundo plano — extrapolar sin limite acaba dando un tiempo que no existe.
     Se permite adelantarse un poco, que es para lo que esta, pero no despegarse. */
  const v = hacerVideo({ currentTime: 10, paused: false });
  reiniciar(v);
  Reloj.tiempo();
  avanzar(60000);                   // un minuto sin que el video refresque nada
  const t = Reloj.tiempo();
  ok('no se aleja mas de lo razonable del ultimo valor real', t <= 10 + 1.5,
    `devolvio ${t.toFixed(1)} partiendo de 10`);
}

grupo('Nunca por encima de la duracion');
{
  const v = hacerVideo({ currentTime: 199.9, duration: 200, paused: false });
  reiniciar(v);
  Reloj._leerDuracion();
  Reloj.tiempo();
  avanzar(30000);
  const t = Reloj.tiempo();
  ok('se queda dentro de la cancion', t <= 200.01, `devolvio ${t.toFixed(2)} con duracion 200`);
}

grupo('Anuncios');
{
  const v = hacerVideo({ currentTime: 80, paused: false });
  reiniciar(v);
  Reloj.tiempo();
  Reloj._anuncio = true;
  Reloj._congelado = 80;
  v.currentTime = 3;                // el anuncio empieza por su cuenta
  ok('congelado en el ultimo tiempo bueno', Math.abs(Reloj.tiempo() - 80) < 0.01, `devolvio ${Reloj.tiempo()}`);
  ok('el estado lo dice', Reloj.estado() === 'anuncio');
  ok('y la duracion no se lee durante el anuncio', (() => {
    Reloj._duracion = 200;
    v.duration = 15;
    Reloj._leerDuracion();
    return Reloj._duracion === 200;
  })(), 'la duracion del anuncio no puede pisar la de la cancion');
}

grupo('La cola cosida: el <video> no se reinicia entre pistas');
{
  /* MEDIDO EN VIVO el 2026-08-06, radio de "Panamiur (Remix)": el <video> daba
     currentTime 612 y duration 665.9 mientras la cancion iba por 2:56 de 3:50.
     Los dos numeros llevan el mismo desfase, 436s, que es donde empieza la
     pista dentro del flujo. Leyendo el <video> la letra saldria adelantada eso
     mismo, y la busqueda pediria una cancion de 11 minutos que no existe. */
  const v = hacerVideo({ currentTime: 612, duration: 665.9, paused: false });
  reiniciar(v, hacerReproductor(176, 229.6));

  const t = Reloj.tiempo();
  ok('el tiempo es el de la cancion, no el del flujo', Math.abs(t - 176) < 0.05,
    `devolvio ${t.toFixed(1)}s; el flujo iba por 612s`);

  const d = Reloj.duracion();
  ok('la duracion es la de la cancion, no la del flujo', Math.abs(d - 229.6) < 0.05,
    `devolvio ${d}s; el flujo dura 665.9s`);

  ok('y es la duracion con la que LRCLIB tiene la letra', Math.abs(d - 230) <= 12,
    'el filtro de 50-lrclib.js descarta a mas de 12s, que es lo que dejaba el panel sin letra');
}

grupo('La cola cosida: buscar habla en tiempo de cancion');
{
  const v = hacerVideo({ currentTime: 612, duration: 665.9, paused: false });
  const mp = hacerReproductor(176, 229.6);
  reiniciar(v, mp);

  Reloj.buscar(30);
  ok('el salto va por seekTo con el segundo de la cancion', mp.buscado === 30,
    `seekTo recibio ${mp.buscado}`);
  ok('y no se escribe en el <video>, que mandaria a otra pista', v.currentTime === 612,
    `currentTime quedo en ${v.currentTime}`);
}

grupo('Sin reproductor, el respaldo al <video> intacto');
{
  /* El caso de siempre: una cancion abierta suelta, sin cosido, o una build
     donde esos metodos ya no esten. Los dos tiempos coinciden y el reloj tiene
     que seguir funcionando como antes. */
  const v = hacerVideo({ currentTime: 55, duration: 200, paused: false });
  reiniciar(v, null);
  const t = Reloj.tiempo();
  ok('el tiempo sale del <video>', Math.abs(t - 55) < 0.05, `devolvio ${t}`);
  ok('la duracion tambien', Reloj.duracion() === 200, `devolvio ${Reloj.duracion()}`);

  Reloj.buscar(12);
  ok('y el salto se escribe en el <video>', v.currentTime === 12, `currentTime quedo en ${v.currentTime}`);
}

console.log(`\n${hechas - fallos}/${hechas} pruebas pasan`);
if (fallos) { console.log(`${fallos} FALLO(S)`); process.exit(1); }

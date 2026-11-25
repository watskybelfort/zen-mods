/* Pruebas del almacen de Letra Viva, sin navegador.
 *
 * El almacen guarda tres cosas que el usuario nota cuando fallan y que no dan
 * ningun error cuando estan mal: los ajustes, el desfase de cada cancion y la
 * cache de letras. Los tres fallos se ven como sintomas distintos y ninguno se
 * parece a su causa:
 *
 *   - Una cache que no caduca sirve para siempre el reparto de palabras de una
 *     version anterior del mod, pero solo en las canciones que ya habias oido.
 *   - Unos ajustes que se guardan enteros y no se mezclan con los valores por
 *     defecto dejan a `undefined` cada opcion nueva, o sea apagada.
 *   - Un desfase que se pierde obliga a cuadrar la misma cancion cada vez.
 *
 * Aqui se le pone un localStorage de mentira y un reloj de mentira; el parcial
 * del almacen se carga tal cual, sin copiarlo.
 *
 *   node dev/tools/probar-almacen.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (f) => readFileSync(join(raiz, f), 'utf8');

/* --- El banco ------------------------------------------------------------- */
const datos = new Map();
let escriturasQueFallas = 0;

globalThis.localStorage = {
  getItem(k) { return datos.has(k) ? datos.get(k) : null; },
  setItem(k, v) {
    if (escriturasQueFallas > 0) { escriturasQueFallas--; throw new Error('QuotaExceededError'); }
    datos.set(k, String(v));
  },
  removeItem(k) { datos.delete(k); },
  clear() { datos.clear(); },
};

let ahora = Date.UTC(2026, 0, 1);
Date.now = () => ahora;
const avanzarDias = (d) => { ahora += d * 24 * 3600 * 1000; };

const fuente = [
  leer('mods/youtube-music/live-lyrics/src/05-prologo.js').replace('__VERSION__', 'prueba'),
  leer('mods/youtube-music/live-lyrics/src/45-almacen.js'),
].join('\n');

const motor = new Function(`
  ${fuente}
  return { Almacen, Ajustes, Desfases, Cache };
`)();

const { Almacen, Ajustes, Desfases, Cache } = motor;

// --- Arnes ----------------------------------------------------------------
let fallos = 0;
let hechas = 0;

const ok = (nombre, condicion, detalle) => {
  hechas++;
  if (condicion) { console.log(`  ok    ${nombre}`); return; }
  fallos++;
  console.log(`  FALLO ${nombre}${detalle ? `\n        ${detalle}` : ''}`);
};

const grupo = (nombre) => console.log(`\n${nombre}`);

/* Se usa solo para la prueba de "almacen lleno": el aviso de consola que emite
   el codigo ahi es correcto y no ensena nada que esta prueba no diga ya. */
const callar = (f) => {
  const w = console.warn;
  console.warn = () => {};
  try { return f(); } finally { console.warn = w; }
};

// --- Ajustes --------------------------------------------------------------
grupo('Ajustes: lo que no se ha guardado nunca');
{
  Ajustes._v = null;
  const v = Ajustes.cargar();
  ok('sin nada guardado salen los valores por defecto',
    v.porPalabra === true && v.usarSubtitulos === true && v.desfase === 0,
    JSON.stringify(v));
  ok('el tamaño por defecto es el del escenario', v.tamano === 44, String(v.tamano));
}

grupo('Ajustes: un guardado viejo no apaga las opciones nuevas');
{
  /* EL FALLO: se guardo el objeto entero cuando solo existian cuatro claves. Si
     al cargar se devuelve tal cual en lugar de mezclarlo con los valores por
     defecto, toda opcion anadida despues vale `undefined`, y los interruptores
     que se dibujan con `!== false` salen apagados sin que nadie los apagara. */
  datos.set('zen-letra:ajustes', JSON.stringify({ porPalabra: false, desfase: 0.4 }));
  Ajustes._v = null;
  const v = Ajustes.cargar();
  ok('lo que el usuario habia cambiado se respeta', v.porPalabra === false && v.desfase === 0.4,
    JSON.stringify({ porPalabra: v.porPalabra, desfase: v.desfase }));
  ok('y lo que no estaba en el guardado toma su valor por defecto',
    v.usarSubtitulos === true && v.tamano === 44,
    JSON.stringify({ usarSubtitulos: v.usarSubtitulos, tamano: v.tamano }));
}

grupo('Ajustes: se guardan con la marca del mod');
{
  Ajustes.set('tamano', 30);
  const crudo = datos.get('zen-letra:ajustes');
  ok('la clave lleva el prefijo, para no chocar con la pagina',
    !!crudo && !datos.has('ajustes'), [...datos.keys()].join(', '));
  ok('y el valor llega a una carga nueva', (() => {
    Ajustes._v = null;
    return Ajustes.get('tamano') === 30;
  })());
}

// --- Desfase por cancion --------------------------------------------------
grupo('Desfase por cancion');
{
  Desfases._m = null;
  Desfases.poner('video-1', 1.23456);
  ok('se redondea a milesimas al guardar', Desfases.de('video-1') === 1.235,
    String(Desfases.de('video-1')));
  ok('una cancion sin desfase devuelve cero', Desfases.de('video-2') === 0);

  /* Volver a cero tiene que BORRAR la entrada: si se guardara un 0, cada cancion
     que se toco una vez se quedaria en el mapa para siempre. */
  Desfases.poner('video-1', 0.0004);
  ok('un desfase practicamente cero borra la entrada',
    Desfases.de('video-1') === 0 && !('video-1' in Desfases._m),
    JSON.stringify(Desfases._m));

  for (let i = 0; i <= 500; i++) Desfases.poner(`v${i}`, 0.5);
  const claves = Object.keys(Desfases._cargar());
  ok('el mapa no crece sin limite: se queda en 500', claves.length === 500, `${claves.length} entradas`);
  ok('y las que se van son las mas viejas', Desfases.de('v0') === 0 && Desfases.de('v500') === 0.5);
}

// --- Cache ----------------------------------------------------------------
grupo('Cache: guardar y recuperar');
{
  datos.clear();
  Cache.guardar('aaa', { fuente: 'lrclib', lineaDeTiempo: { lineas: [] } });
  const e = Cache.obtener('aaa');
  ok('devuelve lo guardado', e && e.fuente === 'lrclib', JSON.stringify(e));
  ok('y le pone la hora de guardado', e && e.at === ahora, e && String(e.at));
  ok('lo que no se guardo devuelve null', Cache.obtener('bbb') === null);

  Cache.guardar('aaa', { fuente: 'lrclib' });
  ok('guardar dos veces la misma no duplica el indice', Cache.cuantas() === 1, `${Cache.cuantas()}`);
}

grupo('Cache: cuanto dura un acierto');
{
  datos.clear();
  Cache.guardar('larga', { fuente: 'lrclib' });
  avanzarDias(29);
  ok('a los 29 dias sigue sirviendo', !!Cache.obtener('larga'));

  avanzarDias(2);
  ok('a los 31 se descarta', Cache.obtener('larga') === null);
  ok('y se borra del almacen, no se queda ocupando', datos.get('zen-letra:cache:larga') === undefined);
}

grupo('Cache: un fallo caduca antes que un acierto');
{
  /* Las canciones sin letra son las que mas se repiten en una cola. Sin cache
     de fallo se pregunta por ellas cada vuelta; con la misma caducidad que un
     acierto, una cancion que estrena letra tarda un mes en verse. */
  datos.clear();
  Cache.guardar('vacia', { vacio: true });
  Cache.guardar('llena', { fuente: 'lrclib' });
  avanzarDias(4);
  ok('a los 4 dias el fallo ya no se sirve', Cache.obtener('vacia') === null);
  ok('pero el acierto de ese mismo dia si', !!Cache.obtener('llena'));
}

grupo('Cache: tope y vaciado');
{
  datos.clear();
  for (let i = 0; i <= 300; i++) Cache.guardar(`c${i}`, { fuente: 'lrclib' });
  ok('el indice no pasa del tope', Cache.cuantas() === 300, `${Cache.cuantas()}`);
  ok('la mas vieja se borra tambien del almacen',
    datos.get('zen-letra:cache:c0') === undefined && datos.get('zen-letra:cache:c1') !== undefined);

  Cache.vaciar();
  ok('vaciar deja el indice a cero', Cache.cuantas() === 0, `${Cache.cuantas()}`);
  ok('y no deja entradas sueltas',
    [...datos.keys()].every((k) => !k.startsWith('zen-letra:cache:') || k === 'zen-letra:cache:indice'),
    [...datos.keys()].join(', '));
}

grupo('Almacen: cuando el navegador dice que esta lleno');
{
  /* localStorage lleno: se tira la cache —que se puede volver a bajar— y se
     reintenta. Perder los ajustes del usuario no es una opcion; perder cache
     es gratis. */
  datos.clear();
  Cache.guardar('d1', { fuente: 'lrclib' });
  escriturasQueFallas = 1;
  const guardado = callar(() => Almacen.escribir('ajustes', { tamano: 30 }));
  ok('el ajuste se acaba guardando', guardado === true && !!datos.get('zen-letra:ajustes'));
  ok('y para hacer sitio se vacio la cache', Cache.cuantas() === 0, `${Cache.cuantas()}`);
}

console.log(`\n${hechas - fallos}/${hechas} pruebas pasan`);
if (fallos) { console.log(`${fallos} FALLO(S)`); process.exit(1); }

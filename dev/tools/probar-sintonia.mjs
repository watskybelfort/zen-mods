/* Pruebas de Zen Sintonia, sin navegador.
 *
 * El inyector tiene dos lados y los dos son dificiles de probar a mano: el que
 * corre dentro de la pagina hace falta YouTube Music sonando, y el privilegiado
 * hace falta reiniciar Zen entero para ver una linea de consola. Aqui se le
 * ponen dobles a los dos ambitos — Services, Cu, XHR, y un DOM de mentira — y se
 * comprueba lo que de verdad importa:
 *
 *   1. Que solo se inyecte en music.youtube.com.
 *   2. Que lo que sale por la red sea lo que suena, y no otra cosa.
 *   3. Que el lado privilegiado NO SE FIE del lado de la pagina: destino de la
 *      portada, tamanos, tipos. Esa parte es la que justifica que exista un
 *      saneador, y es la que nadie prueba a mano nunca.
 *
 *   node dev/tools/probar-sintonia.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fuente = readFileSync(join(raiz, 'mods/youtube-music/obs-now-playing/nativo/proceso.js'), 'utf8');

/* --- El banco de pruebas --------------------------------------------------
   Monta el inyector con todo falso alrededor y devuelve los mandos: el DOM que
   ve el recolector, el reloj, las prefs y la lista de lo que salio por la red. */
const montar = ({ host = 'music.youtube.com', esTope = true } = {}) => {
  const envios = [];
  const consola = [];
  const intervalos = [];
  const oyentesPagina = {};
  let reloj = 1000000;
  let observador = null;

  const prefs = { 'zen.sintonia.puerto': 9463, 'zen.sintonia.encendido': true };

  // --- El video y la pagina que ve el recolector ---------------------------
  const video = {
    paused: false, ended: false, currentTime: 12.5, duration: 210,
    _oyentes: {},
    addEventListener(ev, fn) { (this._oyentes[ev] = this._oyentes[ev] || []).push(fn); },
    disparar(ev) { for (const fn of (this._oyentes[ev] || [])) fn(); },
  };
  const pagina = {
    titulo: 'Titulo por DOM',
    byline: 'Artista por DOM • Album por DOM • 2024',
    clasesReproductor: [],
    metadata: {
      title: 'Cancion de prueba',
      artist: 'Artista de prueba',
      album: 'Album de prueba',
      artwork: [
        { src: 'https://lh3.googleusercontent.com/abc=w60-h60-l90-rj', sizes: '60x60' },
        { src: 'https://lh3.googleusercontent.com/abc=w544-h544-l90-rj', sizes: '544x544' },
      ],
    },
  };

  const doc = {
    location: { host },
    querySelector(sel) {
      if (sel === 'video') return video;
      if (sel === '#movie_player') return { classList: { contains: (c) => pagina.clasesReproductor.includes(c) } };
      if (sel === 'ytmusic-player-bar .title') return { textContent: pagina.titulo };
      if (sel === 'ytmusic-player-bar .byline') return { textContent: pagina.byline };
      return null;
    },
  };
  doc.defaultView = { top: null };
  doc.defaultView.top = esTope ? doc.defaultView : {};

  // --- Los dobles del ambito privilegiado ----------------------------------
  const Services = {
    console: { logStringMessage: (m) => consola.push(m) },
    prefs: {
      getIntPref: (n, d) => (n in prefs ? prefs[n] : d),
      getBoolPref: (n, d) => (n in prefs ? prefs[n] : d),
    },
    io: {
      newURI: (s) => {
        const u = new URL(s);                       // lanza si no es una URL, igual que nsIIOService
        return { scheme: u.protocol.replace(':', ''), host: u.host, spec: u.href };
      },
    },
    obs: { addObserver: (o) => { observador = o; } },
  };

  const Cu = {
    Sandbox: () => ({}),
    cloneInto: (o) => o,
    evalInSandbox: (codigo, caja) => {
      // El recolector se inyecta como texto; aqui se le dan por parametro los
      // globales que en la pagina de verdad le llegan por el prototipo del
      // sandbox. Es la unica forma de probar el mismo texto que se inyecta.
      const fn = new Function('__zenSintonia', 'document', 'navigator', 'setInterval', 'addEventListener', 'Date', codigo);
      fn(
        caja.__zenSintonia,
        doc,
        { mediaSession: { get metadata() { return pagina.metadata; } } },
        (cb, ms) => { intervalos.push({ cb, ms }); return intervalos.length; },
        (ev, fn2) => { (oyentesPagina[ev] = oyentesPagina[ev] || []).push(fn2); },
        { now: () => reloj },
      );
    },
  };

  const Ci = { nsIRequest: { LOAD_ANONYMOUS: 1 } };

  // El estado con el que contesta el widget falso. Se puede cambiar desde la
  // prueba: un 400 tiene que quejarse, y para XHR un 400 llega por onload, no
  // por onerror.
  const respuesta = { estado: 204 };

  function XHRFalso() {
    this.channel = { loadFlags: 0 };
    this.cabeceras = {};
    this.status = 0;
  }
  XHRFalso.prototype.open = function (metodo, url) { this.metodo = metodo; this.url = url; };
  XHRFalso.prototype.setRequestHeader = function (k, v) { this.cabeceras[k] = v; };
  XHRFalso.prototype.send = function (cuerpo) {
    envios.push({ metodo: this.metodo, url: this.url, cabeceras: this.cabeceras, cuerpo: JSON.parse(cuerpo) });
    this.status = respuesta.estado;
    if (this.onload) this.onload();
  };

  new Function('Services', 'Cu', 'Ci', 'XMLHttpRequest', 'Date', fuente)(
    Services, Cu, Ci, XHRFalso, { now: () => reloj },
  );

  return {
    envios, consola, pagina, video, prefs, oyentesPagina, respuesta,
    inyectar: () => observador.observe(doc),
    // El primer intervalo es el sondeo del recolector; el segundo re-engancha el
    // video. Aqui interesa el primero.
    tic: () => intervalos[0].cb(),
    avanzar: (ms) => { reloj += ms; },
    ultimo: () => envios[envios.length - 1],
  };
};

// --- Corredor -------------------------------------------------------------
let hechas = 0;
let fallos = 0;
const grupo = (n) => console.log(`\n${n}`);
const ok = (que, cond, detalle = '') => {
  hechas++;
  if (cond) { console.log(`  ok   ${que}`); return; }
  fallos++;
  console.log(`  FALLA ${que}${detalle ? ' -> ' + detalle : ''}`);
};

grupo('Donde se inyecta');
{
  const m = montar({ host: 'www.youtube.com' });
  m.inyectar();
  ok('en youtube.com a secas no se inyecta', m.envios.length === 0, `mando ${m.envios.length}`);

  const m2 = montar({ host: 'music.youtube.com', esTope: false });
  m2.inyectar();
  ok('en un iframe de music.youtube.com tampoco', m2.envios.length === 0, `mando ${m2.envios.length}`);

  const m3 = montar();
  m3.inyectar();
  ok('en la pestana de verdad si', m3.envios.length === 1, `mando ${m3.envios.length}`);

  const m4 = montar();
  m4.prefs['zen.sintonia.encendido'] = false;
  m4.inyectar();
  ok('y con la pref apagada, no', m4.envios.length === 0, `mando ${m4.envios.length}`);

  const m5 = montar();
  m5.inyectar();
  m5.inyectar();
  ok('el mismo documento no se inyecta dos veces', m5.envios.length === 1, `mando ${m5.envios.length}`);
}

grupo('Lo que se manda');
{
  const m = montar();
  m.inyectar();
  const e = m.ultimo();
  ok('va por POST al puerto de la pref', e.metodo === 'POST' && e.url === 'http://127.0.0.1:9463/sintonia', e.url);
  ok('el destino es loopback', e.url.startsWith('http://127.0.0.1:'), e.url);
  ok('el titulo sale de mediaSession', e.cuerpo.titulo === 'Cancion de prueba', e.cuerpo.titulo);
  ok('el artista tambien', e.cuerpo.artista === 'Artista de prueba', e.cuerpo.artista);
  ok('dice que suena', e.cuerpo.sonando === true);
  ok('lleva la fuente marcada', e.cuerpo.fuente === 'ytm', e.cuerpo.fuente);
  ok('lleva el tiempo', e.cuerpo.posicion === 12.5 && e.cuerpo.duracion === 210, `${e.cuerpo.posicion}/${e.cuerpo.duracion}`);
}

grupo('La portada');
{
  const m = montar();
  m.inyectar();
  ok('se pide la grande, no la de 60px', m.ultimo().cuerpo.portada === 'https://lh3.googleusercontent.com/abc=w600-h600-l90-rj', m.ultimo().cuerpo.portada);

  const m2 = montar();
  m2.pagina.metadata.artwork = [{ src: 'https://evil.example/pixel.png', sizes: '544x544' }];
  m2.inyectar();
  ok('una portada de un sitio ajeno se descarta', m2.ultimo().cuerpo.portada === '', m2.ultimo().cuerpo.portada);

  const m3 = montar();
  m3.pagina.metadata.artwork = [{ src: 'http://lh3.googleusercontent.com/abc=w544-h544', sizes: '544x544' }];
  m3.inyectar();
  ok('y una por http tambien, aunque el host valga', m3.ultimo().cuerpo.portada === '', m3.ultimo().cuerpo.portada);

  const m4 = montar();
  m4.pagina.metadata.artwork = [];
  m4.inyectar();
  ok('sin portada no se rompe nada', m4.ultimo().cuerpo.portada === '' && m4.ultimo().cuerpo.titulo === 'Cancion de prueba');
}

grupo('El respaldo por DOM');
{
  const m = montar();
  m.pagina.metadata = null;
  m.inyectar();
  const c = m.ultimo().cuerpo;
  ok('sin mediaSession, el titulo sale de la barra', c.titulo === 'Titulo por DOM', c.titulo);
  ok('y el artista, de la byline', c.artista === 'Artista por DOM', c.artista);
  ok('y el album, del segundo trozo', c.album === 'Album por DOM', c.album);
}

grupo('Anuncios');
{
  const m = montar();
  m.pagina.clasesReproductor = ['ad-showing'];
  m.pagina.metadata = { title: 'Anuncio de algo', artist: '' };
  m.inyectar();
  ok('el anuncio viaja marcado', m.ultimo().cuerpo.anuncio === true);
  ok('y el widget recibe el titulo del anuncio para poder ignorarlo', m.ultimo().cuerpo.titulo === 'Anuncio de algo');
}

grupo('El ritmo');
{
  const m = montar();
  m.inyectar();
  m.avanzar(1000);
  m.tic();
  ok('sin cambios y sin latido, no se repite', m.envios.length === 1, `mando ${m.envios.length}`);

  m.pagina.metadata = { title: 'Otra cancion', artist: 'Otro' };
  m.avanzar(1000);
  m.tic();
  ok('al cambiar de cancion, sale al momento', m.envios.length === 2, `mando ${m.envios.length}`);

  m.avanzar(3500);
  m.tic();
  ok('y el latido sale aunque no cambie nada', m.envios.length === 3, `mando ${m.envios.length}`);
}

grupo('Un corte del cortafuegos no se pierde');
{
  // La razon de que el puente devuelva si salio. Se fuerza un corte y se
  // comprueba que la cancion nueva llega igual en el paso siguiente, en lugar
  // de quedarse esperando al latido con el tema anterior en pantalla.
  const m = montar();
  m.inyectar();                                   // sale la primera
  m.pagina.metadata = { title: 'La nueva', artist: 'Alguien' };
  m.tic();                                        // mismo milisegundo: cortado
  ok('el corte no manda nada', m.envios.length === 1, `mando ${m.envios.length}`);
  m.avanzar(1000);
  m.tic();
  ok('pero el paso siguiente reintenta', m.envios.length === 2, `mando ${m.envios.length}`);
  ok('y llega la cancion nueva', m.ultimo().cuerpo.titulo === 'La nueva', m.ultimo().cuerpo.titulo);
}

grupo('El cortafuegos del lado privilegiado');
{
  const m = montar();
  m.inyectar();
  const antes = m.envios.length;
  m.avanzar(300);
  // Dos disparos del video en el mismo milisegundo: el recolector los deja
  // pasar (son eventos de verdad), y el que corta es el lado privilegiado.
  m.video.disparar('play');
  m.video.disparar('pause');
  ok('cinco por segundo como mucho', m.envios.length === antes + 1, `mando ${m.envios.length - antes} de golpe`);

  m.avanzar(300);
  m.video.disparar('play');
  ok('pasado el margen, vuelve a pasar', m.envios.length === antes + 2, `mando ${m.envios.length - antes}`);
}

grupo('El saneador no se fia de la pagina');
{
  const m = montar();
  m.pagina.metadata = { title: 'x'.repeat(5000), artist: 'y'.repeat(5000) };
  m.inyectar();
  const c = m.ultimo().cuerpo;
  ok('los textos se recortan a 300', c.titulo.length === 300 && c.artista.length === 300, `${c.titulo.length}/${c.artista.length}`);

  const m2 = montar();
  m2.video.currentTime = -50;
  m2.video.duration = Infinity;
  m2.inyectar();
  const c2 = m2.ultimo().cuerpo;
  ok('un tiempo imposible se queda en cero', c2.posicion === 0 && c2.duracion === 0, `${c2.posicion}/${c2.duracion}`);

  const m3 = montar();
  m3.inyectar();
  const antes = m3.envios.length;
  m3.avanzar(1000);
  ok('una pagina sin nada que decir no manda nada', (() => {
    // El unico camino a la red es `enviar`, y ya se probo que solo acepta JSON
    // valido; aqui se comprueba que un cuerpo sin titulo no se manda.
    m3.pagina.metadata = { title: '', artist: '' };
    m3.pagina.titulo = '';
    m3.pagina.byline = '';
    m3.tic();
    return m3.envios.length === antes;
  })(), `mando ${m3.envios.length - antes}`);
}

grupo('Cuando el widget contesta mal');
{
  // ESTE GRUPO EXISTE POR UN FALLO REAL. El widget registraba su listener solo
  // como "http://localhost:PUERTO/" y aqui se empuja a 127.0.0.1; HTTP.sys
  // enruta por la cabecera Host, no por IP, asi que devolvia 400 desde el
  // kernel. Y como para XHR un 400 llega por onload, el mod lo daba por bueno:
  // estuvo mandando al vacio sin una sola linea en ningun log.
  const m = montar();
  m.respuesta.estado = 400;
  m.inyectar();
  ok('un 400 se queja', m.consola.some((l) => l.includes('400')), m.consola.join(' | '));
  ok('y dice por donde mirar', m.consola.some((l) => l.includes('Host')), m.consola.join(' | '));

  const antes = m.consola.length;
  m.avanzar(1000);
  m.pagina.metadata = { title: 'Otra mas', artist: 'X' };
  m.tic();
  m.avanzar(1000);
  m.pagina.metadata = { title: 'Y otra', artist: 'X' };
  m.tic();
  ok('pero solo una vez por proceso', m.consola.length === antes, `${m.consola.length - antes} quejas de mas`);

  const m2 = montar();
  m2.respuesta.estado = 204;
  m2.inyectar();
  ok('un 204 no dice nada', !m2.consola.some((l) => l.includes('contesto')), m2.consola.join(' | '));
}

grupo('La despedida');
{
  const m = montar();
  m.inyectar();
  m.avanzar(1000);
  for (const fn of (m.oyentesPagina.pagehide || [])) fn();
  const e = m.ultimo();
  ok('al cerrar la pestana avisa', e.cuerpo.cerrando === true);
  ok('y dice que ya no suena', e.cuerpo.sonando === false);
}

grupo('El puerto');
{
  const m = montar();
  m.prefs['zen.sintonia.puerto'] = 9500;
  m.inyectar();
  ok('se lee de la pref', m.ultimo().url === 'http://127.0.0.1:9500/sintonia', m.ultimo().url);

  const m2 = montar();
  m2.prefs['zen.sintonia.puerto'] = 80;
  m2.inyectar();
  ok('un puerto fuera de rango cae al de por defecto', m2.ultimo().url === 'http://127.0.0.1:9463/sintonia', m2.ultimo().url);
}

console.log(`\n${hechas - fallos}/${hechas} pruebas pasan`);
if (fallos) { console.log(`${fallos} FALLO(S)`); process.exit(1); }

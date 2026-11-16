/* Pruebas de Zen Remoto, sin navegador.
 *
 * Cubre la parte pura: el extractor contra respuestas reales de YouTube Music
 * (mods/youtube-music/phone-remote/sonda/muestras, sesion anonima), la validacion de ordenes, las redes
 * permitidas, el Host contra DNS rebinding y el QR contra la libreria de Python.
 * Lo que depende de la pagina y del servidor se prueba en vivo con
 * mods/youtube-music/phone-remote/sonda/vivo.mjs.
 *
 *   node dev/tools/probar-remoto.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requerir = createRequire(import.meta.url);
const P = requerir(join(raiz, 'mods/youtube-music/phone-remote/nativo/puro.js'));
const Q = requerir(join(raiz, 'mods/youtube-music/phone-remote/nativo/qr.js'));
const muestra = (n) => JSON.parse(fs.readFileSync(join(raiz, 'mods/youtube-music/phone-remote/sonda/muestras', n + '.json'), 'utf8'));

let bien = 0;
let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); bien++; } catch (e) { mal++; console.log(`  FALLA  ${nombre}\n         ${e.message}`); }
};
const igual = (a, b, msg = '') => { if (a !== b) throw new Error(`${msg} esperaba ${JSON.stringify(b)}, llego ${JSON.stringify(a)}`); };
const cierto = (c, msg) => { if (!c) throw new Error(msg); };

// --- Extractor ---------------------------------------------------------------
prueba('busqueda: el destacado es el artista y lleva sus canciones', () => {
  const s = P.secciones(muestra('buscar'));
  const items = s.flatMap((g) => g.items);
  igual(items[0].tipo, 'artista');
  igual(items[0].titulo, 'Bad Bunny');
  cierto(items[0].ep.browseEndpoint, 'el artista se abre con browseEndpoint');
  const canciones = items.filter((i) => i.tipo === 'cancion');
  cierto(canciones.length >= 5, 'hay canciones en la busqueda');
  cierto(canciones.every((c) => c.ep.watchEndpoint && c.videoId), 'cada cancion se reproduce y tiene videoId');
  cierto(canciones.every((c) => c.img.startsWith('https://')), 'cada cancion tiene portada');
});

prueba('busqueda por canciones: el grupo se llama Songs y trae artista y album', () => {
  const s = P.secciones(muestra('buscar-canciones'));
  igual(s[0].titulo, 'Songs');
  const c = s[0].items[0];
  igual(c.tipo, 'cancion');
  cierto(/Bad Bunny/.test(c.sub), 'el subtitulo lleva el artista: ' + c.sub);
  cierto(c.menu.siguiente && c.menu.final, 'se puede poner a continuacion y al final de la cola');
  igual(c.menu.siguiente.posicion, 'INSERT_AFTER_CURRENT_VIDEO');
  cierto(P.continuacion(muestra('buscar-canciones')), 'la busqueda filtrada se puede continuar');
});

prueba('filtros de la busqueda', () => {
  const f = P.filtros(muestra('buscar'));
  cierto(f.length >= 5, 'hay chips');
  cierto(f.some((x) => x.nombre === 'Songs' && x.params), 'esta Songs con params');
});

prueba('album: pistas sin "video", cabecera con reproducir y aleatorio', () => {
  const r = muestra('album');
  const s = P.secciones(r);
  const pistas = s[0].items;
  igual(pistas.length, 17);
  cierto(pistas.every((p) => p.tipo === 'cancion'), 'las pistas de un album son canciones');
  igual(pistas[0].dur, '3:04');
  const c = P.cabecera(r, 'MPREb_tZC7e1H5mfm');
  igual(c.titulo, 'DeBÍ TiRAR MáS FOToS');
  cierto(c.reproducir && c.reproducir.watchPlaylistEndpoint, 'el album se reproduce entero');
  cierto(c.aleatorio && /wAEB8gEC/.test(c.aleatorio.watchPlaylistEndpoint.params), 'y en aleatorio');
  cierto(c.img.startsWith('https://'), 'con portada');
});

prueba('artista: estanterias con titulo', () => {
  const s = P.secciones(muestra('artista'));
  const titulos = s.map((g) => g.titulo);
  cierto(titulos.includes('Top songs') && titulos.includes('Albums'), titulos.join(', '));
  cierto(s.find((g) => g.titulo === 'Albums').items.every((i) => i.tipo === 'album'), 'los albumes se abren como album');
});

prueba('playlist: reproducir sale del browseId aunque el boton vaya por entidades', () => {
  const r = muestra('playlist');
  const c = P.cabecera(r, 'VLRDCLAK5uy_nDL8KeBrUagwyISwNmyEiSfYgz1gVCesg');
  igual(c.reproducir.watchPlaylistEndpoint.playlistId, 'RDCLAK5uy_nDL8KeBrUagwyISwNmyEiSfYgz1gVCesg');
  igual(P.secciones(r)[0].items.length, 49);
  cierto(P.continuacion(r), 'hay continuacion');
});

prueba('inicio: carruseles', () => {
  const s = P.secciones(muestra('inicio'));
  cierto(s.length >= 2 && s.every((g) => g.titulo), 'cada carrusel con titulo');
  igual(P.cabecera(muestra('inicio'), 'FEmusic_home').reproducir, null, 'el inicio no se toca entero');
});

prueba('sugerencias: textos y elementos', () => {
  const g = P.sugerencias(muestra('sugerencias'));
  igual(g.textos[0], 'bad bunny');
  cierto(g.items.length >= 3, 'hay elementos sugeridos');
});

prueba('cola: elementos listos para ADD_ITEMS', () => {
  const e = P.elementosDeCola(muestra('cola'));
  igual(e.length, 1);
  const c = P.deCola(e[0]);
  igual(c.titulo, 'Never Gonna Give You Up');
  igual(c.dur, '3:34');
  igual(c.videoId, 'dQw4w9WgXcQ');
});

prueba('el extractor no se cae con basura', () => {
  igual(P.secciones(null).length, 0);
  igual(P.secciones({ contents: [1, 'a', null, { x: { musicResponsiveListItemRenderer: {} } }] }).length, 0);
  igual(P.cabecera({}, 7).reproducir, null);
});

// --- Validacion --------------------------------------------------------------
prueba('validar: ordenes buenas', () => {
  igual(P.validar({ orden: 'siguiente' }).orden, 'siguiente');
  igual(P.validar({ orden: 'volumen', args: { v: 40 } }).args.v, 40);
  igual(P.validar({ orden: 'buscar', args: { q: '  bad bunny ' } }).args.q, 'bad bunny');
  igual(P.validar({ orden: 'encolar', args: { ref: 'a1', donde: 'final' } }).orden, 'encolar');
  igual(P.validar({ orden: 'pagina', args: { id: 'biblioteca' } }).args.id, 'biblioteca');
  igual(P.validar({ orden: 'tocar', args: { ref: 'z9', modo: 'aleatorio' } }).args.modo, 'aleatorio');
  igual(P.validar({ orden: 'tocar', args: { ref: 'z9' } }).orden, 'tocar');
});

prueba('validar: ordenes malas', () => {
  const malas = [
    null, [], 'siguiente', { orden: 'borrarTodo' }, { orden: '__proto__' }, { orden: 'constructor' },
    { orden: 'volumen', args: { v: 101 } }, { orden: 'volumen', args: { v: '40' } }, { orden: 'volumen' },
    { orden: 'posicion', args: { s: -1 } }, { orden: 'posicion', args: { s: NaN } },
    { orden: 'buscar', args: { q: '' } }, { orden: 'buscar', args: { q: 'x'.repeat(201) } },
    { orden: 'abrir', args: { ref: '../x' } }, { orden: 'abrir', args: { ref: { watchEndpoint: {} } } },
    { orden: 'siguiente', args: { extra: 1 } }, { orden: 'megusta', args: { valor: 'ODIO' } },
    { orden: 'saltar', args: { i: 1.5 } }, { orden: 'tocar', args: { ref: 'a', modo: 'loco' } }, { orden: 'pagina', args: { id: 'FEmusic_x' } },
  ];
  for (const m of malas) cierto(P.validar(m).error, 'deberia rechazar ' + JSON.stringify(m));
});

// --- Red ---------------------------------------------------------------------
prueba('redes privadas si, publicas y VPN de IP publica no', () => {
  for (const ip of ['192.168.1.20', '10.0.0.5', '172.16.0.1', '172.31.255.255', '127.0.0.1', '::ffff:192.168.1.2', '::1', 'fe80::1']) cierto(P.esPrivada(ip), ip);
  for (const ip of ['26.10.20.30', '8.8.8.8', '172.32.0.1', '192.169.0.1', '1.1.1.1', '300.1.1.1', '', null, 'localhost']) cierto(!P.esPrivada(ip), ip);
});

prueba('Host: IP literal con el puerto, nunca un nombre (DNS rebinding)', () => {
  cierto(P.hostValido('192.168.1.50:8642', 8642), 'ip con puerto');
  cierto(P.hostValido('localhost:8642', 8642), 'localhost');
  for (const h of ['evil.com:8642', '192.168.1.50:80', '192.168.1.50', 'a.192.168.1.50:8642', '', null, '192.168.1.50:8642 x']) cierto(!P.hostValido(h, 8642), String(h));
});

// --- QR ----------------------------------------------------------------------
let hayPython = true;
try { execFileSync('python', ['-c', 'import qrcode'], { stdio: 'ignore' }); } catch (e) { hayPython = false; }
if (hayPython) {
  prueba('QR identico a python qrcode en versiones 1-10 y todas las mascaras', () => {
    const casos = ['hola', 'http://192.168.1.50:8642/#c=123456', 'x'.repeat(60), 'x'.repeat(100), 'a'.repeat(110), 'y'.repeat(140), 'ñandú ' + 'z'.repeat(190)];
    for (const t of casos) {
      const v = Q.version(Buffer.byteLength(t));
      for (let mk = 0; mk < 8; mk++) {
        const py = execFileSync('python', [join(raiz, 'mods/youtube-music/phone-remote/sonda/qr-python.py'), t, String(v), String(mk)]).toString().trim();
        const js = JSON.stringify(Q.matriz(t, { mascara: mk }).map((f) => f.map(Number)));
        igual(js, py, `v${v} m${mk}`);
      }
    }
  });
} else {
  console.log('  (sin python qrcode: se salta la comparacion del QR)');
}
prueba('QR: svg y texto largo', () => {
  cierto(Q.svg('http://192.168.1.50:8642/#c=1').startsWith('<svg'), 'svg');
  let fallo = false;
  try { Q.matriz('x'.repeat(300)); } catch (e) { fallo = true; }
  cierto(fallo, 'un texto que no cabe avisa');
});

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);

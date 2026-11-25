/* Pruebas de Zen Descargas, sin navegador.
 *
 * Cubre la parte pura (validacion de mensajes, ids, la linea de yt-dlp, la lectura
 * de su salida y el progreso). Con --vivo ademas baja de verdad un video corto
 * ("Me at the zoo", 19 s) en audio y en video con las herramientas que dejo el
 * instalador, y comprueba los archivos con ffprobe.
 *
 *   node dev/tools/probar-descargas.mjs
 *   node dev/tools/probar-descargas.mjs --vivo [--perfil <ruta>]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requerir = createRequire(import.meta.url);
const P = requerir(path.join(raiz, 'mods/youtube-music/downloader/nativo/puro.js'));

let bien = 0;
let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); bien++; } catch (e) { mal++; console.log(`  FALLA  ${nombre}\n         ${e.message}`); }
};
const igual = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} esperaba ${JSON.stringify(b)}, llego ${JSON.stringify(a)}`); };
const cierto = (c, msg) => { if (!c) throw new Error(msg); };

// --- Ids ---------------------------------------------------------------------
prueba('ids validos e invalidos', () => {
  cierto(P.esId('jNQXAC9IVRw'), 'id normal');
  cierto(P.esId('a-b_c-d_e-f'), 'con - y _');
  for (const m of ['', 'jNQXAC9IVR', 'jNQXAC9IVRww', 'jNQXAC9IVR"', '../../etc/x', null, 12345678901, '--exec=cmd']) cierto(!P.esId(m), 'acepto ' + m);
});
prueba('id desde las URL de YouTube y solo de ellas', () => {
  igual(P.idDeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123'), 'jNQXAC9IVRw');
  igual(P.idDeUrl('https://music.youtube.com/watch?v=jNQXAC9IVRw'), 'jNQXAC9IVRw');
  igual(P.idDeUrl('https://www.youtube.com/shorts/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  igual(P.idDeUrl('https://youtu.be/jNQXAC9IVRw'), 'jNQXAC9IVRw');
  igual(P.idDeUrl('https://www.youtube.com/live/jNQXAC9IVRw?si=x'), 'jNQXAC9IVRw');
  igual(P.idDeUrl('https://evil.com/watch?v=jNQXAC9IVRw'), null);
  igual(P.idDeUrl('https://youtube.com.evil.com/watch?v=jNQXAC9IVRw'), null);
  igual(P.idDeUrl('https://www.youtube.com/'), null);
});

// --- Mensajes ----------------------------------------------------------------
prueba('validar: lo permitido pasa limpio', () => {
  igual(P.validar({ tipo: 'descargar', id: 'jNQXAC9IVRw', modo: 'audio', titulo: 'Hola\u0000\nmundo', extra: 1 }), { tipo: 'descargar', id: 'jNQXAC9IVRw', modo: 'audio', titulo: 'Hola  mundo' });
  igual(P.validar({ tipo: 'ajuste', clave: 'calidad', valor: '720' }), { tipo: 'ajuste', clave: 'calidad', valor: '720' });
  igual(P.validar({ tipo: 'ajuste', clave: 'cookies', valor: true }), { tipo: 'ajuste', clave: 'cookies', valor: true });
  igual(P.validar({ tipo: 'cancelar', trabajo: '1abc' }), { tipo: 'cancelar', trabajo: '1abc' });
  igual(P.validar({ tipo: 'hola', basura: 'x' }), { tipo: 'hola' });
});
prueba('validar: lo demas se descarta', () => {
  const malos = [
    null, [], 'x', { tipo: 'exec' },
    { tipo: 'descargar', id: 'jNQXAC9IVRw', modo: 'exe' },
    { tipo: 'descargar', id: 'https://evil', modo: 'audio' },
    { tipo: 'descargar', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', modo: 'audio' },
    { tipo: 'ajuste', clave: 'calidad', valor: '--exec' },
    { tipo: 'ajuste', clave: 'carpeta', valor: 'C:\\' },
    { tipo: 'ajuste', clave: 'constructor', valor: 'x' },
    { tipo: 'ajuste', clave: '__proto__', valor: 'mp3' },
    { tipo: 'ajuste', clave: 'cookies', valor: 'true' },
    { tipo: 'mostrar', trabajo: '../x' },
    { tipo: 'mostrar', trabajo: 'C:\\Windows' },
    { tipo: '__proto__' },
  ];
  for (const m of malos) igual(P.validar(m), null, JSON.stringify(m));
  cierto(P.validar({ tipo: 'descargar', id: 'jNQXAC9IVRw', modo: 'video', titulo: 'x'.repeat(5000) }).titulo.length === 200, 'titulo recortado');
});

prueba('validar: los mensajes sin datos que llevan trabajo', () => {
  igual(P.validar({ tipo: 'adios' }), { tipo: 'adios' });
  igual(P.validar({ tipo: 'carpeta' }), { tipo: 'carpeta' });
  igual(P.validar({ tipo: 'quitar', trabajo: '1abc' }), { tipo: 'quitar', trabajo: '1abc' });
  igual(P.validar({ tipo: 'quitar' }), null);
});

// --- Iconos ------------------------------------------------------------------
prueba('iconos: la forma sale de la primera letra y los numeros no pierden digitos', () => {
  // Los dos puntos de la nota y el marco del video: ahi se comia el primer digito
  // de la primera coordenada.
  igual(P.formaIcono('C6 18 3'), { forma: 'circle', atributos: { cx: '6', cy: '18', r: '3' } });
  igual(P.formaIcono('C17 16 3'), { forma: 'circle', atributos: { cx: '17', cy: '16', r: '3' } });
  igual(P.formaIcono('R3 5 18 14 3'), { forma: 'rect', atributos: { x: '3', y: '5', width: '18', height: '14', rx: '3' } });
});
prueba('iconos: trazados normales y rellenos', () => {
  igual(P.formaIcono('M12 4v11'), { forma: 'path', atributos: { d: 'M12 4v11' } });
  igual(P.formaIcono('FM10 9.2v5.6l4.8-2.8z'), { forma: 'path', atributos: { d: 'M10 9.2v5.6l4.8-2.8z' }, relleno: true });
});
prueba('iconos: los del panel dan formas y numeros completos', () => {
  const motor = fs.readFileSync(path.join(raiz, 'mods/youtube-music/downloader/nativo/motor.js'), 'utf8');
  const desde = motor.indexOf('const ICONOS = {');
  const bloque = desde > -1 ? motor.slice(desde, motor.indexOf('};', desde)) : '';
  const piezas = (bloque.match(/'[^']+'/g) || []).map((p) => p.slice(1, -1));
  cierto(piezas.length >= 14, 'no encontre los iconos de motor.js');
  for (const d of piezas) {
    const f = P.formaIcono(d);
    if (f.forma === 'path') continue;
    for (const v of Object.values(f.atributos)) cierto(/^\d+(\.\d+)?$/.test(v), `${d}: ${v} no es un numero`);
  }
});

// --- Argumentos --------------------------------------------------------------
const base = { carpeta: 'C:\\Users\\x\\Downloads', temporal: 'C:\\t', ffmpeg: 'C:\\ff', js: { nombre: 'deno', ruta: 'C:\\deno.exe' }, calidad: '1080', audio: 'mp3', cookies: null };
prueba('argumentos: la URL la pone el mod y va despues de --', () => {
  const a = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'audio' }, base);
  igual(a.slice(-2), ['--', 'https://www.youtube.com/watch?v=jNQXAC9IVRw']);
  cierto(a.includes('--ignore-config') && a.includes('--no-playlist'), 'sin config del usuario ni listas');
  cierto(!a.some((x) => /--exec|--batch-file|--load-info/.test(x)), 'nada de ejecutar');
});
prueba('argumentos: rechaza ids y modos raros', () => {
  for (const t of [{ id: '--exec=calc', modo: 'audio' }, { id: 'jNQXAC9IVRw', modo: 'x' }]) {
    let lanzo = false;
    try { P.argumentos(t, base); } catch { lanzo = true; }
    cierto(lanzo, 'no lanzo con ' + JSON.stringify(t));
  }
});
prueba('argumentos: musica MP3 con portada y M4A sin recodificar', () => {
  const mp3 = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'audio' }, base);
  cierto(mp3.join(' ').includes('--audio-format mp3 --audio-quality 0'), 'mp3 a calidad maxima');
  cierto(mp3.includes('--embed-thumbnail') && mp3.includes('--embed-metadata'), 'portada y etiquetas');
  const m4a = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'audio' }, { ...base, audio: 'm4a' });
  cierto(m4a.join(' ').includes('-f ba[ext=m4a]/ba -x --audio-format m4a'), 'm4a original');
});
prueba('argumentos: video con techo de resolucion, MP4 y H.264 preferido', () => {
  const v = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'video' }, base);
  cierto(v.join(' ').includes('-S res:1080,vcodec:h264,acodec:m4a --merge-output-format mp4'), v.join(' '));
  const max = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'video' }, { ...base, calidad: 'max' });
  cierto(max.join(' ').includes('-S res,vcodec:h264'), 'max sin techo');
});
prueba('argumentos: sin ffmpeg, lo que no necesita juntar', () => {
  const a = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'audio' }, { ...base, ffmpeg: null });
  cierto(!a.includes('-x') && !a.includes('--ffmpeg-location'), 'no convierte');
  const v = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'video' }, { ...base, ffmpeg: null });
  cierto(v.join(' ').includes('-f b --'), 'mejor archivo unico');
});
prueba('argumentos: la sesion solo si se pide', () => {
  cierto(!P.argumentos({ id: 'jNQXAC9IVRw', modo: 'audio' }, base).includes('--cookies-from-browser'), 'sin sesion');
  const c = P.argumentos({ id: 'jNQXAC9IVRw', modo: 'audio' }, { ...base, cookies: 'C:\\perfil' });
  igual(c[c.indexOf('--cookies-from-browser') + 1], 'firefox:C:\\perfil');
});

// --- Salida de yt-dlp -----------------------------------------------------------
prueba('leer: progreso, titulo, archivo, procesado y errores', () => {
  igual(P.leerLinea(P.MARCA + 'P 1024 309288 682607.64 3\r'), { tipo: 'progreso', bajado: 1024, total: 309288, velocidad: 682607.64, eta: 3 });
  igual(P.leerLinea(P.MARCA + 'P 1024 NA NA NA'), { tipo: 'progreso', bajado: 1024, total: 0, velocidad: 0, eta: null });
  igual(P.leerLinea(P.MARCA + 'T Me at the zoo'), { tipo: 'titulo', titulo: 'Me at the zoo' });
  igual(P.leerLinea(P.MARCA + 'F C:\\D\\Me at the zoo.mp3'), { tipo: 'archivo', ruta: 'C:\\D\\Me at the zoo.mp3' });
  igual(P.leerLinea('[ExtractAudio] Destination: x.mp3'), { tipo: 'procesando' });
  igual(P.leerLinea('ERROR: [youtube] x: Sign in to confirm you\u2019re not a bot').tipo, 'error');
  igual(P.leerLinea('[youtube] Extracting URL'), null);
});
prueba('errores: cada caso conocido tiene su codigo', () => {
  igual(P.explicarError('[youtube] x: Sign in to confirm you\u2019re not a bot.').codigo, 'bot');
  igual(P.explicarError('Private video. Sign in if you have access').codigo, 'privado');
  igual(P.explicarError('Requested format is not available').codigo, 'ytdlp');
  igual(P.explicarError('algo raro').codigo, 'otro');
});
prueba('progreso: video en dos partes no retrocede', () => {
  let e;
  const pasos = [[0, 1000], [500, 1000], [1000, 1000], [10, 100], [100, 100]];
  const vistos = pasos.map(([b, t]) => (e = P.progreso(e, { bajado: b, total: t }, 'video', true)).pct);
  cierto(vistos.every((v, i) => i === 0 || v >= vistos[i - 1]), 'retrocedio: ' + vistos);
  igual(vistos[2], 90);
  cierto(vistos[4] >= 98, 'casi al final: ' + vistos[4]);
});

prueba('progreso: el audio avanza sobre 99 y sin total no inventa', () => {
  igual(P.progreso(null, { bajado: 50, total: 100 }, 'audio', false).pct, 49.5);
  igual(P.progreso(null, { bajado: 50, total: 0 }, 'audio', false).pct, 0);
});

// --- En vivo ----------------------------------------------------------------------
if (process.argv.includes('--vivo')) {
  const z = await import(pathToFileURL(path.join(raiz, 'installer/lib/zen.mjs')).href);

  /* El parseo se hace con el mismo ayudante que los instaladores, y no a mano.
     Antes, `--perfil` al final de la linea o escrito con una errata se ignoraba
     en silencio: la prueba seguia contra el perfil por defecto y el fallo
     aparecia mas tarde como «no se encontro profiles.ini», que no menciona el
     argumento. */
  let opciones;
  try {
    opciones = z.parsearArgs(process.argv.slice(2), { interruptores: ['vivo'], claves: ['perfil'] });
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  let perfil = opciones.perfil;
  if (perfil) {
    if (!fs.existsSync(perfil)) {
      console.error(`El perfil no existe: ${perfil}. Revisa la ruta de --perfil.`);
      process.exit(2);
    }
  } else {
    try { perfil = z.resolverPerfil(); }
    catch (e) { console.error(e.message); process.exit(2); }
  }

  const herramientas = path.join(perfil, 'chrome/zen-descargas/herramientas.json');
  if (!fs.existsSync(herramientas)) {
    console.error(`No existe ${herramientas}. Instala Zen Descargas antes de la prueba en vivo: node installer/instalar-descargas.mjs`);
    process.exit(2);
  }
  const h = JSON.parse(fs.readFileSync(herramientas, 'utf8'));
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'zd-vivo-'));
  const ffDir = h.ffmpeg ? path.dirname(h.ffmpeg) : null;
  const ffprobe = ffDir ? path.join(ffDir, 'ffprobe' + (process.platform === 'win32' ? '.exe' : '')) : null;
  for (const modo of ['audio', 'video']) {
    const args = P.argumentos({ id: 'jNQXAC9IVRw', modo }, { ...base, carpeta, temporal: path.join(carpeta, 'tmp'), ffmpeg: ffDir, js: h.deno ? { nombre: 'deno', ruta: h.deno } : { nombre: 'node', ruta: h.node } });
    const t0 = Date.now();
    const r = spawnSync(h.ytdlp, args, { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
    const lineas = (r.stdout + r.stderr).split('\n').map(P.leerLinea).filter(Boolean);
    const fin = lineas.find((l) => l.tipo === 'archivo');
    prueba(`vivo ${modo}: yt-dlp termina y dice el archivo (${((Date.now() - t0) / 1000).toFixed(1)} s)`, () => {
      igual(r.status, 0, (lineas.find((l) => l.tipo === 'error') || {}).texto);
      cierto(lineas.some((l) => l.tipo === 'progreso'), 'no hubo progreso');
      cierto(fin && fs.existsSync(fin.ruta), 'no existe el archivo');
      console.log('         ' + path.basename(fin.ruta) + ' · ' + (fs.statSync(fin.ruta).size / 1024).toFixed(0) + ' KB');
    });
    if (fin && ffprobe && fs.existsSync(ffprobe)) {
      const pr = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'json', fin.ruta], { encoding: 'utf8' });
      const flujos = JSON.parse(pr.stdout || '{"streams":[]}').streams;
      prueba(`vivo ${modo}: el archivo trae lo que toca`, () => {
        if (modo === 'audio') {
          cierto(flujos.some((s) => s.codec_name === 'mp3'), 'no es mp3: ' + JSON.stringify(flujos));
          const portada = flujos.find((s) => s.codec_type === 'video');
          cierto(portada && portada.width === portada.height, 'portada no cuadrada: ' + JSON.stringify(portada));
        } else {
          cierto(fin.ruta.endsWith('.mp4'), 'no es mp4');
          cierto(flujos.some((s) => s.codec_type === 'video') && flujos.some((s) => s.codec_type === 'audio'), 'falta imagen o sonido: ' + JSON.stringify(flujos));
        }
      });
    }
  }
  fs.rmSync(carpeta, { recursive: true, force: true });
}

console.log(`\n  ${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);

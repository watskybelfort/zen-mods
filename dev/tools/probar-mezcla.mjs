/* Pruebas de Zen Mezcla, sin navegador.
 *
 * Cubre la parte pura: leer los contenedores, elegir el tramo, los tiempos, las
 * reglas y las curvas. Lo que depende del reproductor real se prueba en vivo con
 * mods/youtube-music/crossfade/sonda/vivo.mjs.
 *
 *   node dev/tools/probar-mezcla.mjs
 */
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = createRequire(import.meta.url)(join(raiz, 'mods/youtube-music/crossfade/nativo/puro.js'));

let bien = 0;
let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); bien++; } catch (e) { mal++; console.log(`  FALLA  ${nombre}\n         ${e.message}`); }
};
const igual = (a, b, msg = '') => {
  if (a !== b) throw new Error(`${msg} esperaba ${b}, llego ${a}`);
};
const cerca = (a, b, tol, msg = '') => {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg} esperaba ${b} +-${tol}, llego ${a}`);
};

// --- Generadores de contenedor ---------------------------------------------
const bytes = (...x) => Uint8Array.from(x.flat());
const be = (v, n) => Array.from({ length: n }, (_, i) => Math.floor(v / 256 ** (n - 1 - i)) % 256);

const cabeceraWebm = (escala) => bytes(
  [0x1a, 0x45, 0xdf, 0xa3, 0x80],
  escala ? [0x2a, 0xd7, 0xb1, 0x83, ...be(escala, 3)] : [],
);
const cluster = (tc, relleno = [0xa3, 0x85, 1, 2, 3, 4, 5], desconocido = false) => {
  const cuerpo = [0xe7, 0x82, ...be(tc, 2), ...relleno];
  const tam = desconocido
    ? [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
    : [0x10 | ((cuerpo.length >> 24) & 0x0f), ...be(cuerpo.length, 3)];
  return bytes([0x1f, 0x43, 0xb6, 0x75], tam, cuerpo);
};

const caja = (tipo, cuerpo = []) => bytes(be(8 + cuerpo.length, 4), [...tipo].map((c) => c.charCodeAt(0)), cuerpo);
const mdhd = (escala) => caja('mdhd', [0, 0, 0, 0, ...be(0, 4), ...be(0, 4), ...be(escala, 4), ...be(0, 4)]);
const moov = (escala) => caja('moov', [...caja('trak', [...caja('mdia', [...mdhd(escala)])])]);
const moof = (base) => caja('moof', [...caja('traf', [...caja('tfdt', [0, 0, 0, 0, ...be(base, 4)])])]);

// --- WebM ------------------------------------------------------------------
prueba('webm: encuentra clusters y sus tiempos', () => {
  const b = P.concatenar([cabeceraWebm(), cluster(1000), cluster(6000), cluster(11000)]);
  const l = P.leerContenedor(b);
  igual(l.tipo, 'webm');
  igual(l.segmentos.length, 3);
  igual(l.segmentos[1].t, 6);
});
prueba('webm: respeta el TimecodeScale de la cabecera', () => {
  const l = P.leerContenedor(P.concatenar([cabeceraWebm(500000), cluster(1000)]));
  igual(l.segmentos[0].t, 0.5);
});
prueba('webm: un falso ID dentro del audio no cuenta como cluster', () => {
  const trampa = [0x1f, 0x43, 0xb6, 0x75, 0x85, 1, 2, 3, 4, 5];
  const l = P.leerContenedor(P.concatenar([cabeceraWebm(), cluster(1000, [0xa3, 0x8a, ...trampa]), cluster(2000)]));
  igual(l.segmentos.length, 2);
});
prueba('webm: tamano desconocido llega hasta el siguiente cluster', () => {
  const b = P.concatenar([cabeceraWebm(), cluster(1000, [1, 2], true), cluster(2000)]);
  const l = P.leerContenedor(b);
  igual(l.segmentos[0].fin, l.segmentos[1].ini);
});
prueba('webm: sin clusters no hay nada que leer', () => {
  igual(P.leerContenedor(P.concatenar([cabeceraWebm(), bytes([1, 2, 3, 4, 5, 6, 7, 8])])), null);
});

// --- MP4 -------------------------------------------------------------------
const mp4 = (...cajas) => P.concatenar([caja('ftyp', [1, 2, 3, 4]), moov(44100), ...cajas]);
prueba('mp4: encuentra fragmentos y usa la escala de mdhd', () => {
  const l = P.leerContenedor(mp4(moof(44100), caja('mdat', [1]), moof(88200), caja('mdat', [2])));
  igual(l.tipo, 'mp4');
  igual(l.segmentos.length, 2);
  igual(l.segmentos[1].t, 2);
});
prueba('mp4: el segmento incluye su mdat', () => {
  const l = P.leerContenedor(mp4(moof(0), caja('mdat', [1, 2, 3])));
  const [s] = l.segmentos;
  igual(s.fin - s.ini, moof(0).length + 11);
});
prueba('mp4: se resincroniza tras bytes rotos', () => {
  const l = P.leerContenedor(mp4(moof(0), caja('mdat', [1]), bytes([9, 9, 9, 9, 9, 9, 9, 9, 9]), moof(44100), caja('mdat', [2])));
  igual(l.segmentos.length, 2);
});

prueba('mp4: un mdat a medio bajar no cuenta', () => {
  const b = mp4(moof(0), caja('mdat', [1]), moof(44100), caja('mdat', [2, 3, 4, 5]));
  const l = P.leerContenedor(b.subarray(0, b.length - 2));
  igual(l.segmentos.length, 1);
});
prueba('mp4: un moof sin su mdat no cuenta', () => {
  igual(P.leerContenedor(mp4(moof(0), caja('mdat', [1]), moof(44100))).segmentos.length, 1);
});
prueba('webm: un cluster a medio bajar no cuenta', () => {
  const b = P.concatenar([cabeceraWebm(), cluster(1000), cluster(2000)]);
  igual(P.leerContenedor(b.subarray(0, b.length - 3)).segmentos.length, 1);
});

// --- Recortar --------------------------------------------------------------
prueba('recortar: empieza en el segmento que contiene el punto pedido', () => {
  const b = P.concatenar([cabeceraWebm(), cluster(1000), cluster(6000), cluster(11000)]);
  const r = P.recortar(P.leerContenedor(b), b, 7);
  igual(r.base, 6);
  igual(P.leerContenedor(r.bytes).segmentos.length, 2);
});
prueba('recortar: un segmento repetido por un salto cuenta una vez', () => {
  const b = P.concatenar([cabeceraWebm(), cluster(1000), cluster(6000), cluster(6000), cluster(11000)]);
  const r = P.recortar(P.leerContenedor(b), b, 0);
  igual(P.leerContenedor(r.bytes).segmentos.length, 3);
});
prueba('recortar: respeta el tope, para simular un final sin bajar', () => {
  const b = P.concatenar([cabeceraWebm(), cluster(1000), cluster(6000), cluster(11000)]);
  igual(P.leerContenedor(P.recortar(P.leerContenedor(b), b, 0, 7).bytes).segmentos.length, 2);
});
prueba('recortar: los ordena aunque se bajaran desordenados', () => {
  const b = P.concatenar([cabeceraWebm(), cluster(11000), cluster(1000)]);
  const r = P.recortar(P.leerContenedor(b), b, 0);
  igual(r.base, 1);
});

// --- Tiempos ---------------------------------------------------------------
const tono = (seg, amp, sr = 1000) => Float32Array.from({ length: seg * sr }, (_, i) => amp * Math.sin(i / 3));
prueba('finMusical: ignora el silencio del final', () => {
  const pcm = new Float32Array(10000);
  pcm.set(tono(7, 0.5));
  cerca(P.finMusical([pcm], 1000), 7, 0.06);
});
prueba('finMusical: una cancion sin silencio acaba en su final', () => {
  cerca(P.finMusical([tono(5, 0.5)], 1000), 5, 0.06);
});
prueba('finMusical: todo silencio da cero', () => {
  igual(P.finMusical([new Float32Array(1000)], 1000), 0);
});
prueba('relevo: deja sitio para el fundido y la carga', () => {
  igual(P.momentoDeRelevo({ finMusica: 200, fundido: 8, ahora: 170 }), 189.5);
});
prueba('relevo: nunca antes de poder alinear', () => {
  igual(P.momentoDeRelevo({ finMusica: 200, fundido: 8, ahora: 189 }), 191.6);
});
prueba('cola: basta con lo que de para un fundido', () => {
  igual(P.colaSuficiente({ finMusica: 209, ahora: 200 }), true);
  igual(P.colaSuficiente({ finMusica: 205, ahora: 200 }), false);
});
prueba('preparar: va por delante del ultimo momento', () => {
  if (P.momentoDePreparar(200, 12) >= P.ultimoMomento(200, 12)) throw new Error('orden');
});

// --- Reglas ----------------------------------------------------------------
const base = { activa: true, anuncio: false, duracion: 200, repetirUna: false, velocidad: 1, enDisco: false, mezclarDiscos: false };
const casos = [
  ['normal', {}, null], ['apagada', { activa: false }, 'apagada'], ['anuncio', { anuncio: true }, 'anuncio'],
  ['corta', { duracion: 40 }, 'corta'], ['directo', { duracion: Infinity }, 'corta'],
  ['repetir una', { repetirUna: true }, 'repetir una'], ['velocidad', { velocidad: 1.25 }, 'velocidad'],
  ['disco', { enDisco: true }, 'disco'], ['disco permitido', { enDisco: true, mezclarDiscos: true }, null],
];
for (const [nombre, cambio, esperado] of casos) {
  prueba(`regla: ${nombre}`, () => igual(P.motivoParaNoMezclar({ ...base, ...cambio }), esperado));
}

// --- Curvas ----------------------------------------------------------------
prueba('curvas: empiezan y acaban donde deben', () => {
  const { sube, baja } = P.curvas(512);
  igual(sube[0], 0); igual(sube[511], 1); igual(baja[511], 0);
  cerca(baja[0], 1, 1e-6);
});
prueba('curvas: la suma no pasa de 1,21', () => {
  const { sube, baja } = P.curvas(512);
  for (let i = 0; i < 512; i++) if (sube[i] + baja[i] > 1.21) throw new Error(`suma ${sube[i] + baja[i]}`);
});
prueba('curvas: la potencia no se hunde mas de 2 dB', () => {
  const { sube, baja } = P.curvas(512);
  for (let i = 0; i < 512; i++) {
    const db = 10 * Math.log10(sube[i] ** 2 + baja[i] ** 2);
    if (db < -2) throw new Error(`${db} dB en ${i}`);
  }
});
prueba('volumen: solo baja la que se va', () => {
  igual(P.razonDeVolumen(-14, -9), 1);
  cerca(P.razonDeVolumen(-8, -14), 0.5012, 0.001);
});
prueba('volumen: tope de 6 dB', () => cerca(P.razonDeVolumen(-5, -25), 0.5012, 0.001));
prueba('volumen: sin dato no toca nada', () => igual(P.razonDeVolumen(undefined, -9), 1));

// --- Alineacion ------------------------------------------------------------
const ruido = (n) => {
  let x = 12345;
  return Float32Array.from({ length: n }, () => { x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff; return x / 0x3fffffff - 1; });
};
const graves = (a) => { const s = new Float32Array(a.length); for (let i = 1; i < a.length; i++) s[i] = s[i - 1] * 0.9 + a[i] * 0.1; return s; };
for (const lag of [0, 7, -584, 1096, -3333]) {
  prueba(`desfase: encuentra ${lag}`, () => {
    const b = graves(ruido(32768));
    const a = new Float32Array(30000);
    const orig = 1000;
    for (let i = 0; i < a.length; i++) a[i] = b[i + orig + lag] ?? 0;
    const c = new Float32Array(30000);
    for (let i = 0; i < c.length; i++) c[i] = b[i + orig];
    const r = P.desfase(a, c, 7200);
    igual(r.l, lag);
    if (r.c < 0.99) throw new Error(`correlacion ${r.c}`);
  });
}
prueba('desfase: dos senales sin relacion dan correlacion baja', () => {
  const a = graves(ruido(30000));
  const b = graves(ruido(60000)).subarray(30000);
  if (P.desfase(a, b, 7200).c > 0.5) throw new Error('correlacion alta');
});

// --- Lo que suena ----------------------------------------------------------
prueba('formato: Opus 251 no esta al maximo', () => {
  const f = P.describirFormato({ codecs: 'av01.0.01M.08 (396) / opus (251)', itag: 251 });
  igual(f.nombre, 'Opus'); igual(f.alMaximo, false);
});
prueba('formato: AAC 141 si', () => igual(P.describirFormato({ codecs: 'mp4a.40.2', itag: 141 }).alMaximo, true));
prueba('formato: el bitrate real gana a la tabla', () => igual(P.describirFormato({ codecs: 'opus', itag: 251, kbps: 150 }).kbps, 150));

console.log(`${bien} pruebas bien, ${mal} mal`);
process.exit(mal ? 1 : 0);

/* Zen Mezcla — la parte pura.
 *
 * Todo lo que no toca el navegador: leer los contenedores, decidir tiempos y
 * calcular curvas. Va aparte para que dev/tools/probar-mezcla.mjs lo ejecute en Node
 * tal cual, sin dobles. En el navegador se evalua en la misma caja que motor.js.
 */
'use strict';

const ZenMezclaPuro = (() => {
  const LIMITES = Object.freeze({
    fundidoMin: 3,
    fundidoMax: 12,
    fundidoDefecto: 8,
    margenCarga: 2.5,      // lo que puede tardar en entrar la siguiente
    alineacion: 2.6,       // lo que se tarda en alinear antes del relevo
    colchon: 12,           // antelacion extra con la que se prepara la cola
    duracionMinima: 60,    // una cancion mas corta no se mezcla
    umbralFinDb: -48,      // por debajo de esto, el final ya es silencio
    umbralEntradaDb: -42,  // por encima de esto, la nueva ya suena
    esperaEntrada: 2.5,    // lo maximo que se espera a que la nueva arranque
    hueco: 0.15,           // caida a mitad de fundido para no saturar
    limiteLkfs: 6,         // lo maximo que se iguala, en dB
    correlacionMinima: 0.95, // por debajo, cola y reproductor no son lo mismo
  });

  const concatenar = (trozos) => {
    const total = trozos.reduce((a, t) => a + t.length, 0);
    const salida = new Uint8Array(total);
    let p = 0;
    for (const t of trozos) { salida.set(t, p); p += t.length; }
    return salida;
  };

  // --- WebM --------------------------------------------------------------
  // Un vint de EBML: el primer byte dice cuanto mide. Todo unos es "tamano
  // desconocido", que es legal en un Cluster.
  const leerVint = (b, p) => {
    const primero = b[p];
    if (!primero) return null;
    let ancho = 1;
    let mascara = 0x80;
    while (!(primero & mascara)) { mascara >>= 1; ancho++; }
    if (p + ancho > b.length) return null;
    let valor = primero & (mascara - 1);
    let todoUnos = valor === mascara - 1;
    for (let i = 1; i < ancho; i++) {
      valor = valor * 256 + b[p + i];
      if (b[p + i] !== 0xff) todoUnos = false;
    }
    return { ancho, valor, desconocido: todoUnos };
  };

  const entero = (b, p, n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + b[p + i];
    return v;
  };

  const buscarBytes = (b, patron, desde, hasta) => {
    const fin = Math.min(hasta, b.length) - patron.length;
    fuera: for (let i = desde; i <= fin; i++) {
      for (let j = 0; j < patron.length; j++) if (b[i + j] !== patron[j]) continue fuera;
      return i;
    }
    return -1;
  };

  const ID_CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
  const ID_ESCALA = [0x2a, 0xd7, 0xb1];

  const leerWebm = (b) => {
    const segmentos = [];
    let inicial = -1;
    let p = 0;
    for (;;) {
      p = buscarBytes(b, ID_CLUSTER, p, b.length);
      if (p < 0) break;
      const tam = leerVint(b, p + 4);
      if (tam) {
        const cuerpo = p + 4 + tam.ancho;
        // Un Cluster de verdad empieza por su Timecode. Es lo que descarta las
        // coincidencias casuales dentro del audio comprimido.
        if (b[cuerpo] === 0xe7) {
          const largo = leerVint(b, cuerpo + 1);
          if (largo && largo.valor >= 1 && largo.valor <= 8) {
            const valorEn = cuerpo + 1 + largo.ancho;
            if (inicial < 0) inicial = p;
            const fin = tam.desconocido ? -1 : cuerpo + tam.valor;
            if (fin <= b.length) segmentos.push({ t: entero(b, valorEn, largo.valor), ini: p, fin });
            p = fin > p ? Math.min(fin, b.length) : cuerpo;
            continue;
          }
        }
      }
      p += 4;
    }
    if (inicial < 0) return null;

    let escala = 1e6;
    const en = buscarBytes(b, ID_ESCALA, 0, inicial);
    if (en >= 0) {
      const largo = leerVint(b, en + 3);
      if (largo && largo.valor >= 1 && largo.valor <= 8) {
        escala = entero(b, en + 3 + largo.ancho, largo.valor) || escala;
      }
    }
    for (let i = 0; i < segmentos.length; i++) {
      const s = segmentos[i];
      s.t = s.t * escala / 1e9;
      if (s.fin < 0) s.fin = i + 1 < segmentos.length ? segmentos[i + 1].ini : b.length;
      s.fin = Math.min(s.fin, b.length);
    }
    return { tipo: 'webm', inicial: b.subarray(0, inicial), segmentos };
  };

  // --- MP4 fragmentado ------------------------------------------------------
  const tipoCaja = (b, p) => String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
  const u32 = (b, p) => entero(b, p, 4);
  const TIPOS_MP4 = new Set(['ftyp', 'styp', 'moov', 'moof', 'mdat', 'sidx', 'free', 'emsg', 'mfra']);

  const escalaMp4 = (b, desde, hasta) => {
    const en = buscarBytes(b, [0x6d, 0x64, 0x68, 0x64], desde, hasta);   // mdhd
    if (en < 0) return 0;
    const version = b[en + 4];
    return u32(b, en + (version === 1 ? 24 : 16));
  };

  const tiempoMoof = (b, desde, hasta, escala) => {
    const en = buscarBytes(b, [0x74, 0x66, 0x64, 0x74], desde, hasta);   // tfdt
    if (en < 0) return null;
    const version = b[en + 4];
    const base = version === 1 ? entero(b, en + 8, 8) : u32(b, en + 8);
    return base / escala;
  };

  const leerMp4 = (b) => {
    let p = 0;
    let fin = -1;
    let escala = 0;
    const segmentos = [];
    while (p + 8 <= b.length) {
      const tam = u32(b, p);
      const tipo = tipoCaja(b, p);
      if (tam < 8 || !TIPOS_MP4.has(tipo)) {
        // Un salto de posicion deja cajas a medias: se busca el siguiente moof.
        const sig = buscarBytes(b, [0x6d, 0x6f, 0x6f, 0x66], p + 1, b.length);
        if (sig < 4) break;
        p = sig - 4;
        continue;
      }
      if (tipo === 'moov' && !escala) escala = escalaMp4(b, p, p + tam);
      if (tipo === 'moof') {
        if (fin < 0) fin = p;
        const t = escala && p + tam <= b.length ? tiempoMoof(b, p, p + tam, escala) : null;
        if (t !== null) segmentos.push({ t, ini: p, fin: 0 });
      }
      // Un mdat a medio bajar rompe la decodificacion de todo el tramo: un
      // segmento solo cuenta cuando ha llegado entero.
      if (tipo === 'mdat' && segmentos.length && !segmentos[segmentos.length - 1].fin && p + tam <= b.length) {
        segmentos[segmentos.length - 1].fin = p + tam;
      }
      p += tam;
    }
    if (fin < 0 || !escala) return null;
    return { tipo: 'mp4', inicial: b.subarray(0, fin), segmentos: segmentos.filter((s) => s.fin) };
  };

  const leerContenedor = (b) => {
    if (b.length < 12) return null;
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return leerWebm(b);
    return leerMp4(b);
  };

  // Lo que se le da al decodificador: cabecera + segmentos desde `desde`. Un
  // segmento repetido por un salto de posicion cuenta una vez, y gana el ultimo,
  // que es el que el reproductor dio por bueno.
  const recortar = (lectura, b, desde, hasta = Infinity) => {
    if (!lectura || !lectura.segmentos.length) return null;
    const porTiempo = new Map();
    for (const s of lectura.segmentos) porTiempo.set(s.t, s);
    const orden = [...porTiempo.values()].sort((x, y) => x.t - y.t);
    let primero = 0;
    for (let i = 0; i < orden.length; i++) if (orden[i].t <= desde) primero = i;
    const elegidos = orden.slice(primero).filter((s) => s.t <= hasta);
    if (!elegidos.length) return null;
    return {
      base: elegidos[0].t,
      bytes: concatenar([lectura.inicial, ...elegidos.map((s) => b.subarray(s.ini, s.fin))]),
    };
  };

  // --- Tiempos ---------------------------------------------------------------
  // Donde acaba la musica de verdad, en segundos desde el inicio del PCM. Una
  // cancion con 6 s de silencio al final no debe gastar ahi su fundido.
  const finMusical = (canales, sr, umbralDb = LIMITES.umbralFinDb) => {
    const paso = Math.max(1, Math.round(sr * 0.05));
    const umbral = 10 ** (umbralDb / 20);
    const n = canales[0].length;
    for (let fin = n; fin > 0; fin -= paso) {
      const ini = Math.max(0, fin - paso);
      let suma = 0;
      for (const c of canales) for (let i = ini; i < fin; i++) suma += c[i] * c[i];
      if (Math.sqrt(suma / ((fin - ini) * canales.length)) > umbral) return fin / sr;
    }
    return 0;
  };

  const momentoDePreparar = (duracion, fundido) =>
    duracion - (fundido + LIMITES.margenCarga + LIMITES.colchon);

  // Sin el final exacto tambien se mezcla, si lo guardado da para un fundido.
  const colaSuficiente = ({ finMusica, ahora }) =>
    finMusica - ahora >= LIMITES.alineacion + LIMITES.margenCarga + LIMITES.fundidoMin;

  const ultimoMomento = (duracion, fundido) =>
    duracion - (fundido + LIMITES.margenCarga + LIMITES.alineacion);

  // El relevo: cuando el reproductor pasa a la siguiente y la cola sigue sola.
  const momentoDeRelevo = ({ finMusica, fundido, ahora }) => Math.max(
    finMusica - fundido - LIMITES.margenCarga,
    ahora + LIMITES.alineacion,
  );

  // --- Reglas ----------------------------------------------------------------
  const motivoParaNoMezclar = (s) => {
    if (!s.activa) return 'apagada';
    if (s.anuncio) return 'anuncio';
    if (!Number.isFinite(s.duracion) || s.duracion < LIMITES.duracionMinima) return 'corta';
    if (s.repetirUna) return 'repetir una';
    if (s.velocidad !== 1) return 'velocidad';
    if (s.enDisco && !s.mezclarDiscos) return 'disco';
    return null;
  };

  // --- Curvas ----------------------------------------------------------------
  // Igual potencia con una caida suave a mitad: dos masteres fuertes sumados
  // saturan, y la caida deja la suma en 1,2 como mucho.
  const curvas = (puntos, razonFinal = 1) => {
    const sube = new Float32Array(puntos);
    const baja = new Float32Array(puntos);
    for (let i = 0; i < puntos; i++) {
      const x = i / (puntos - 1);
      const caida = 1 - LIMITES.hueco * Math.sin(Math.PI * x);
      sube[i] = Math.sin(x * Math.PI / 2) * caida;
      baja[i] = Math.cos(x * Math.PI / 2) * caida * (1 + (razonFinal - 1) * x);
    }
    sube[puntos - 1] = 1;
    baja[puntos - 1] = 0;
    return { sube, baja };
  };

  // Solo baja la que se va: subirla podria saturar, y de la nueva no se toca nada.
  const razonDeVolumen = (lkfsVieja, lkfsNueva) => {
    if (!Number.isFinite(lkfsVieja) || !Number.isFinite(lkfsNueva)) return 1;
    const db = Math.min(0, Math.max(-LIMITES.limiteLkfs, lkfsNueva - lkfsVieja));
    return 10 ** (db / 20);
  };

  // --- Alineacion ------------------------------------------------------------
  const diezmar = (a, f) => {
    const n = Math.floor(a.length / f);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let t = 0;
      for (let j = 0; j < f; j++) t += a[i * f + j];
      s[i] = t / f;
    }
    return s;
  };

  const correlar = (a, b, desde, hasta, paso) => {
    let mejor = -2;
    let lag = 0;
    const n = Math.min(a.length, b.length);
    const margen = Math.max(Math.abs(desde), Math.abs(hasta));
    if (n <= margen * 2) return { c: 0, l: 0 };
    for (let l = desde; l <= hasta; l++) {
      let s = 0;
      let x = 0;
      let y = 0;
      for (let i = margen; i < n - margen; i += paso) {
        const u = a[i];
        const w = b[i + l];
        s += u * w; x += u * u; y += w * w;
      }
      const c = s / Math.sqrt(x * y + 1e-12);
      if (c > mejor) { mejor = c; lag = l; }
    }
    return { c: mejor, l: lag };
  };

  // a[i] se parece a b[i + l]. l negativo: `a` va por detras de `b`.
  const desfase = (a, b, radio) => {
    const f = 8;
    const grueso = correlar(diezmar(a, f), diezmar(b, f), -Math.ceil(radio / f), Math.ceil(radio / f), 2);
    const centro = grueso.l * f;
    return correlar(a, b, centro - f * 2, centro + f * 2, 2);
  };

  const rms = (a) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s / Math.max(1, a.length));
  };

  // --- Lo que suena ----------------------------------------------------------
  const KBPS_POR_ITAG = Object.freeze({ 139: 48, 140: 128, 141: 256, 249: 50, 250: 70, 251: 130, 774: 256 });

  const describirFormato = ({ codecs, itag, kbps }) => {
    const codigo = Number(itag);
    const nombre = /opus/i.test(codecs || '') ? 'Opus' : /mp4a|aac/i.test(codecs || '') ? 'AAC' : (codecs || 'desconocido');
    const media = kbps || KBPS_POR_ITAG[codigo] || 0;
    return { nombre, itag: codigo || 0, kbps: media, alMaximo: media >= 200 };
  };

  return Object.freeze({
    LIMITES, concatenar, leerVint, leerContenedor, recortar, finMusical,
    momentoDePreparar, ultimoMomento, momentoDeRelevo, motivoParaNoMezclar, colaSuficiente,
    curvas, razonDeVolumen, desfase, rms, describirFormato,
  });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ZenMezclaPuro;

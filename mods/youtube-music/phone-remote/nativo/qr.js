/* Zen Remoto — codigo QR para emparejar el movil.
 *
 * Solo lo que hace falta para una direccion de la red de casa: modo byte, nivel de
 * correccion M, versiones 1 a 10 (hasta 213 bytes). Sigue el estandar ISO/IEC 18004
 * con la estructura de la implementacion de referencia de Nayuki (MIT), escrita de
 * nuevo y recortada.
 *
 * Se comprueba modulo a modulo contra la libreria `qrcode` de Python, mascara por
 * mascara (dev/tools/probar-remoto.mjs).
 *
 *   ZenRemotoQR.matriz('http://192.168.1.5:8642/#c=123456')  -> boolean[][]
 *   ZenRemotoQR.svg(texto)                                    -> '<svg ...>'
 */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.ZenRemotoQR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Nivel M: [codewords de correccion por bloque, bloques del grupo 1, datos por
  // bloque del grupo 1, bloques del grupo 2, datos por bloque del grupo 2].
  const BLOQUES_M = [
    null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  ];
  const ALINEACION = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const FORMATO_M = 0;

  const datosDe = (v) => { const b = BLOQUES_M[v]; return b[1] * b[2] + b[3] * b[4]; };
  const bitsDeLongitud = (v) => (v < 10 ? 8 : 16);

  const utf8 = (s) => {
    const bin = unescape(encodeURIComponent(String(s)));
    const out = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // --- Reed-Solomon sobre GF(256), polinomio 0x11D -----------------------------
  const mul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  };
  const divisor = (grado) => {
    const r = new Array(grado).fill(0);
    r[grado - 1] = 1;
    let raizG = 1;
    for (let i = 0; i < grado; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = mul(r[j], raizG);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      raizG = mul(raizG, 0x02);
    }
    return r;
  };
  const resto = (datos, div) => {
    const r = new Array(div.length).fill(0);
    for (const b of datos) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= mul(c, f); });
    }
    return r;
  };

  // --- Codewords ---------------------------------------------------------------
  const codewords = (bytes, v) => {
    const bits = [];
    const poner = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
    poner(0b0100, 4);
    poner(bytes.length, bitsDeLongitud(v));
    for (const b of bytes) poner(b, 8);
    const capacidad = datosDe(v) * 8;
    poner(0, Math.min(4, capacidad - bits.length));
    poner(0, (8 - (bits.length % 8)) % 8);
    for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) poner(relleno, 8);
    const datos = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      datos.push(b);
    }

    const [ec, n1, d1, n2, d2] = BLOQUES_M[v];
    const div = divisor(ec);
    const bloques = [];
    let k = 0;
    for (let i = 0; i < n1 + n2; i++) {
      const largo = i < n1 ? d1 : d2;
      const d = datos.slice(k, k + largo);
      k += largo;
      bloques.push({ d, e: resto(d, div) });
    }
    const out = [];
    const maxD = Math.max(d1, d2);
    for (let i = 0; i < maxD; i++) for (const b of bloques) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ec; i++) for (const b of bloques) out.push(b.e[i]);
    return out;
  };

  // --- Matriz ------------------------------------------------------------------
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  const construir = (v, cw, mascara) => {
    const n = v * 4 + 17;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const fija = Array.from({ length: n }, () => new Array(n).fill(false));
    const poner = (x, y, oscuro) => { m[y][x] = oscuro; fija[y][x] = true; };

    for (let i = 0; i < n; i++) { poner(6, i, i % 2 === 0); poner(i, 6, i % 2 === 0); }
    const buscador = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < n && y >= 0 && y < n) poner(x, y, d !== 2 && d !== 4);
        }
      }
    };
    buscador(3, 3); buscador(n - 4, 3); buscador(3, n - 4);
    const pos = ALINEACION[v];
    const ult = pos.length - 1;
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === ult) || (i === ult && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poner(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }

    const formato = (mk) => {
      const datos = (FORMATO_M << 3) | mk;
      let r = datos;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((datos << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) poner(8, i, bit(b, i));
      poner(8, 7, bit(b, 6));
      poner(8, 8, bit(b, 7));
      poner(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) poner(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) poner(n - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) poner(8, n - 15 + i, bit(b, i));
      poner(8, n - 8, true);
    };
    formato(0);

    if (v >= 7) {
      let r = v;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (v << 12) | r;
      for (let i = 0; i < 18; i++) {
        const a = n - 11 + (i % 3);
        const c = Math.floor(i / 3);
        poner(a, c, bit(b, i));
        poner(c, a, bit(b, i));
      }
    }

    let i = 0;
    for (let der = n - 1; der >= 1; der -= 2) {
      if (der === 6) der = 5;
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = der - j;
          const subiendo = ((der + 1) & 2) === 0;
          const y = subiendo ? n - 1 - vert : vert;
          if (!fija[y][x] && i < cw.length * 8) {
            m[y][x] = bit(cw[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }

    const cond = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ][mascara];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fija[y][x] && cond(x, y)) m[y][x] = !m[y][x];
    formato(mascara);
    return m;
  };

  // --- Penalizacion para elegir mascara ---------------------------------------
  const penalizacion = (m) => {
    const n = m.length;
    let p = 0;
    const lineas = (get) => {
      for (let a = 0; a < n; a++) {
        let racha = 1;
        for (let b = 1; b <= n; b++) {
          if (b < n && get(a, b) === get(a, b - 1)) racha++;
          else { if (racha >= 5) p += 3 + (racha - 5); racha = 1; }
        }
        // Patron parecido al buscador: 1011101 con cuatro claros a un lado.
        for (let b = 0; b + 10 < n + 4; b++) {
          const s = [];
          for (let k = -4; k < 11; k++) { const c = b + k; s.push(c >= 0 && c < n ? get(a, c) : false); }
          const centro = s.slice(4, 11).map(Number).join('');
          if (centro === '1011101') {
            const izq = s.slice(0, 4).every((x) => !x);
            const der = s.slice(11, 15).every((x) => !x);
            if (izq || der) p += 40;
          }
        }
      }
    };
    lineas((a, b) => m[a][b]);
    lineas((a, b) => m[b][a]);
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    let oscuros = 0;
    for (const fila of m) for (const c of fila) if (c) oscuros++;
    const k = Math.ceil(Math.abs(oscuros * 20 - n * n * 10) / (n * n)) - 1;
    p += Math.max(0, k) * 10;
    return p;
  };

  const version = (largo) => {
    for (let v = 1; v <= 10; v++) {
      const cabe = datosDe(v) * 8 - 4 - bitsDeLongitud(v);
      if (largo * 8 <= cabe) return v;
    }
    return 0;
  };

  const matriz = (texto, opciones = {}) => {
    const bytes = utf8(texto);
    const v = opciones.version || version(bytes.length);
    if (!v || datosDe(v) * 8 - 4 - bitsDeLongitud(v) < bytes.length * 8) throw new Error('texto demasiado largo para el QR');
    const cw = codewords(bytes, v);
    if (Number.isInteger(opciones.mascara)) return construir(v, cw, opciones.mascara);
    let mejor = null;
    let puntos = Infinity;
    for (let mk = 0; mk < 8; mk++) {
      const m = construir(v, cw, mk);
      const p = penalizacion(m);
      if (p < puntos) { puntos = p; mejor = m; }
    }
    return mejor;
  };

  // Un solo <path> con un cuadrado por modulo oscuro y cuatro de margen.
  const svg = (texto, color = '#000', fondo = '#fff') => {
    const m = matriz(texto);
    const n = m.length;
    const t = n + 8;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="${fondo}"/><path d="${d}" fill="${color}"/></svg>`;
  };

  return { matriz, svg, version, codewords };
});

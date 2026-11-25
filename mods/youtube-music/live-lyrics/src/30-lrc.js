/* --- LRC a linea de tiempo -------------------------------------------------
   LRC es el formato de toda la vida: una marca por linea y el texto detras.
   Lo que llega de LRCLIB en `syncedLyrics` es exactamente esto (comprobado
   contra su API: las marcas vienen en [mm:ss.xx]).

     [00:14.94]primera linea
     [00:18.20]segunda linea

   Tres cosas del formato que hay que respetar y casi nadie implementa:

   - UNA LINEA PUEDE LLEVAR VARIAS MARCAS. `[00:12.00][01:30.00]estribillo` es
     la forma canonica de no repetir el texto de un estribillo. Si solo se lee
     la primera marca, el estribillo aparece una vez y el resto de la cancion se
     queda sin letra a partir de ahi.
   - LA ETIQUETA [offset:] MANDA. Son milisegundos, y positivo significa que la
     letra va ADELANTADA respecto al audio, o sea que hay que restarlo. Es del
     propio archivo, distinto del desfase que ajusta el usuario.
   - LRC MEJORADO LLEVA TIEMPOS POR PALABRA, con marcas <mm:ss.xx> dentro del
     texto. LRCLIB casi nunca los trae, pero cuando estan son tiempos REALES y
     valen infinitamente mas que cualquier interpolacion nuestra, asi que se
     parsean y se marca la linea de tiempo como `porPalabra`.

   Salida normalizada, la misma forma para todos los proveedores:

     { fuente, porPalabra, lineas: [ { inicio, fin, texto, palabras[], interludio } ] }

   Los tiempos son segundos con decimales, no milisegundos, porque es lo que
   devuelve el reloj y asi no hay conversiones repartidas por el codigo. */

const RE_MARCA = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const RE_MARCA_PALABRA = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const RE_META = /^\[(ar|ti|al|by|offset|length|re|ve):([^\]]*)\]\s*$/i;

/* Las centesimas son dos digitos y las milesimas tres. Si vienen tres,
   dividir por 100 daria un tiempo diez veces mayor: hay que mirar cuantos
   digitos son, no asumir. */
const aSegundos = (min, seg, frac) => {
  let f = 0;
  if (frac) f = parseInt(frac, 10) / Math.pow(10, frac.length);
  return parseInt(min, 10) * 60 + parseInt(seg, 10) + f;
};

const parsearLrc = (texto, fuente = 'lrc') => {
  if (!texto || typeof texto !== 'string') return null;

  let offsetMs = 0;
  const crudas = [];

  for (const linea of texto.split(/\r?\n/)) {
    const meta = linea.match(RE_META);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') {
        const n = parseInt(meta[2].trim(), 10);
        if (Number.isFinite(n)) offsetMs = n;
      }
      continue;
    }

    RE_MARCA.lastIndex = 0;
    const marcas = [];
    let m;
    while ((m = RE_MARCA.exec(linea))) marcas.push({ t: aSegundos(m[1], m[2], m[3]), fin: m.index + m[0].length });
    if (!marcas.length) continue;

    /* El texto es lo que queda DESPUES de la ultima marca. Cortar por la
       primera dejaria las demas marcas dentro del texto. */
    const resto = linea.slice(marcas[marcas.length - 1].fin);
    for (const marca of marcas) crudas.push({ inicio: marca.t, bruto: resto });
  }

  if (!crudas.length) return null;

  crudas.sort((a, b) => a.inicio - b.inicio);

  const lineas = [];
  let algunaPorPalabra = false;

  for (const cruda of crudas) {
    const inicio = Math.max(0, cruda.inicio - offsetMs / 1000);
    const { texto: limpio, palabras } = extraerPalabrasMejoradas(cruda.bruto, inicio, offsetMs);
    if (palabras) algunaPorPalabra = true;

    /* Una linea sin texto en LRC es un marcador de pausa, no un error: se
       guarda como interludio para que el render pinte el latido de espera en
       lugar de un hueco vacio. */
    const vacia = !limpio.trim();
    lineas.push({ inicio, fin: 0, texto: limpio.trim(), palabras, interludio: vacia });
  }

  /* Dos marcas al mismo tiempo con el mismo texto es basura de algunas bases:
     se queda la primera. */
  const unicas = lineas.filter((l, i) => i === 0 || !(Math.abs(l.inicio - lineas[i - 1].inicio) < 0.01 && l.texto === lineas[i - 1].texto));

  for (let i = 0; i < unicas.length; i++) {
    unicas[i].fin = i + 1 < unicas.length ? unicas[i + 1].inicio : unicas[i].inicio + 6;
  }

  return { fuente, porPalabra: algunaPorPalabra, lineas: unicas };
};

/* LRC mejorado: <00:12.34>palabra <00:12.98>otra. Devuelve palabras con
   tiempos reales, o null si la linea no lleva marcas por dentro. El fin de cada
   palabra es el inicio de la siguiente; la ultima se cierra fuera, cuando ya se
   conoce el inicio de la linea siguiente. */
const extraerPalabrasMejoradas = (bruto, inicioLinea, offsetMs) => {
  RE_MARCA_PALABRA.lastIndex = 0;
  if (!RE_MARCA_PALABRA.test(bruto)) return { texto: bruto, palabras: null };

  RE_MARCA_PALABRA.lastIndex = 0;
  const trozos = [];
  let m;
  let ultimo = null;
  let cursor = 0;

  while ((m = RE_MARCA_PALABRA.exec(bruto))) {
    if (ultimo) {
      ultimo.texto = bruto.slice(cursor, m.index);
      trozos.push(ultimo);
    } else {
      /* Texto ANTES de la primera marca: "Hola <00:12.00>mundo". No trae hora
         propia, asi que empieza cuando empieza la linea. Descartarlo borraba
         "Hola" del texto y de la vista. */
      const antes = bruto.slice(0, m.index).trim();
      if (antes) trozos.push({ inicio: inicioLinea, fin: 0, texto: antes });
    }
    ultimo = { inicio: Math.max(0, aSegundos(m[1], m[2], m[3]) - offsetMs / 1000), fin: 0, texto: '' };
    cursor = m.index + m[0].length;
  }
  if (ultimo) { ultimo.texto = bruto.slice(cursor); trozos.push(ultimo); }

  const palabras = trozos
    .map((t) => ({ inicio: t.inicio, fin: 0, texto: t.texto.trim() }))
    .filter((t) => t.texto);

  if (!palabras.length) return { texto: bruto.replace(RE_MARCA_PALABRA, ''), palabras: null };

  for (let i = 0; i < palabras.length - 1; i++) palabras[i].fin = palabras[i + 1].inicio;
  palabras[palabras.length - 1].fin = palabras[palabras.length - 1].inicio + 0.6;

  return { texto: palabras.map((p) => p.texto).join(' '), palabras };
};

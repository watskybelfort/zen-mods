/* --- De linea a palabra: la interpolacion ---------------------------------
   Aqui se fabrica el efecto de Apple Music con datos que no lo traen.

   Lo que llega de LRCLIB es una marca por LINEA. El relleno que avanza dentro
   de la linea, palabra por palabra, hay que inventarselo — y esa es la parte
   que decide si el mod parece de verdad o parece un cronometro. Es lo mismo que
   hace el karaoke de Spicetify cuando no tiene richsync.

   REPARTIR POR NUMERO DE LETRAS ES LO OBVIO Y ESTA MAL. Cantar cuesta tiempo
   por SILABA, no por letra: "strength" son ocho letras y una silaba, y "idea"
   son cuatro letras y tres silabas. Repartiendo por letras, la palabra larga de
   una silaba se come el tiempo de las cortas y el relleno se queda atras justo
   en las palabras que se cantan rapido. Se cuentan grupos de vocales, que es
   una aproximacion barata a las silabas y funciona igual en castellano y en
   ingles.

   Y EL TIEMPO DE LA LINEA NO ES EL TIEMPO DE CANTARLA. El fin de una linea es
   el inicio de la siguiente, asi que una linea antes de un solo de guitarra
   "dura" veinte segundos. Repartidos entre sus palabras, la ultima palabra
   tardaria cinco segundos en rellenarse: el efecto se muere. De ahi el techo
   por silaba: las palabras se acaban cuando se acaban y lo que sobra hasta la
   linea siguiente pasa a ser interludio, que es lo que hace que salga el
   latido de espera igual que en Apple Music. */

const SEG_POR_SILABA = 0.34;      // ritmo de canto tipico
const TECHO_POR_SILABA = 0.52;    // mas que esto ya no es cantar, es sostener
const HUECO_INTERLUDIO = 4.5;     // a partir de aqui el hueco merece latido
/* Kana, ideogramas y hangul. Se construye desde cadena ASCII por lo mismo que
   RE_PESTANA_LETRA: un rango escrito con caracteres literales es una
   oportunidad de que el parcial llegue mal formado tras concatenarse. */
const CJK = new RegExp('[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af]');

/* No parte hiatos: "idea" cuenta 2 grupos (i, ea) y no 3 silabas. Asumido a
   proposito. Un silabeador de verdad son cientos de reglas por idioma, y aqui
   el numero no se muestra en ningun sitio: solo decide que proporcion del tiempo
   de la linea se lleva cada palabra, donde equivocarse en una silaba de tres
   mueve el relleno unas decimas que nadie ve. Comprobado en dev/tools/probar-lrc.mjs. */
const silabas = (palabra) => {
  /* En japones, chino y coreano no hay espacios y cada caracter es una unidad
     de canto, asi que el conteo de vocales latinas no dice nada. */
  if (CJK.test(palabra)) return Math.max(1, palabra.replace(/\s/g, '').length);
  const grupos = palabra.toLowerCase().match(/[aeiouyáéíóúàèìòùâêîôûäëïöüãõæœ]+/g);
  return Math.max(1, grupos ? grupos.length : 1);
};

/* Trocear conservando lo que se ve. Los signos de puntuacion viajan pegados a
   su palabra para que el relleno no deje una coma flotando a medio color. */
const trocear = (texto) => {
  if (CJK.test(texto) && !/\s/.test(texto.trim())) return texto.trim().split('');
  return texto.trim().split(/\s+/).filter(Boolean);
};

const interpolarLinea = (linea) => {
  if (linea.palabras || linea.interludio || !linea.texto) return linea;

  const trozos = trocear(linea.texto);
  if (!trozos.length) return linea;

  const pesos = trozos.map(silabas);
  const total = pesos.reduce((a, b) => a + b, 0);

  const disponible = Math.max(0.2, linea.fin - linea.inicio);
  const techo = total * TECHO_POR_SILABA;
  /* El suelo evita el otro extremo: dos lineas pegadas a 0.3s de distancia
     dejarian el relleno tan rapido que no se ve. Se permite invadir un poco la
     linea siguiente antes que no ver nada. */
  const suelo = Math.min(disponible * 1.15, total * SEG_POR_SILABA * 0.6);
  const util = Math.max(suelo, Math.min(disponible, techo));

  const palabras = [];
  let acum = 0;
  for (let i = 0; i < trozos.length; i++) {
    const desde = linea.inicio + (acum / total) * util;
    acum += pesos[i];
    const hasta = linea.inicio + (acum / total) * util;
    palabras.push({ inicio: desde, fin: hasta, texto: trozos[i] });
  }

  return { ...linea, palabras };
};

/* Cierra la ultima palabra de cada linea del LRC mejorado, mete los interludios
   y deja la linea de tiempo lista para el render. Se hace en una pasada aparte
   porque los interludios necesitan saber donde acaba de cantar una linea y
   donde empieza la siguiente, o sea las dos a la vez. */
const componerLineaDeTiempo = (bruta) => {
  if (!bruta || !bruta.lineas || !bruta.lineas.length) return null;

  const lineas = bruta.lineas.map((l) => {
    if (!l.palabras) return interpolarLinea(l);
    /* Por palabra real: la ultima se cierra contra el fin de la linea, no con
       los 0.6s de relleno que puso el parser sin conocer la linea siguiente. */
    const ps = l.palabras.map((p) => ({ ...p }));
    const ultima = ps[ps.length - 1];
    ultima.fin = Math.min(Math.max(ultima.fin, ultima.inicio + 0.25), l.fin);
    return { ...l, palabras: ps };
  });

  const conInterludios = [];

  /* Intro: si la primera linea tarda en entrar, el latido ocupa la espera. Sin
     esto la pantalla arranca vacia y parece que no hay letra. */
  if (lineas[0].inicio > HUECO_INTERLUDIO) {
    conInterludios.push({ inicio: 0, fin: lineas[0].inicio, texto: '', palabras: null, interludio: true });
  }

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    conInterludios.push(l);

    const finCanto = l.palabras && l.palabras.length ? l.palabras[l.palabras.length - 1].fin : l.fin;
    const siguiente = lineas[i + 1];
    if (!siguiente) continue;
    if (siguiente.inicio - finCanto > HUECO_INTERLUDIO) {
      conInterludios.push({ inicio: finCanto, fin: siguiente.inicio, texto: '', palabras: null, interludio: true });
    }
  }

  return {
    fuente: bruta.fuente,
    porPalabra: !!bruta.porPalabra,
    lineas: conInterludios,
    /* Cuanto dura la letra. Sirve para avisar de un desajuste grave: si la
       letra acaba a los 2:10 y la cancion dura 5:30, es que la version no
       coincide y el desfase no lo va a arreglar. */
    finLetra: conInterludios[conInterludios.length - 1].fin,
  };
};

/* Busqueda de la linea activa. Binaria porque el render la pide en cada frame:
   una letra larga son 80 lineas, y recorrerlas linealmente 60 veces por segundo
   es trabajo regalado. Devuelve el indice de la ultima linea que ya empezo. */
const lineaEn = (lineas, t) => {
  let lo = 0;
  let hi = lineas.length - 1;
  let res = -1;
  while (lo <= hi) {
    const med = (lo + hi) >> 1;
    if (lineas[med].inicio <= t) { res = med; lo = med + 1; } else { hi = med - 1; }
  }
  return res;
};

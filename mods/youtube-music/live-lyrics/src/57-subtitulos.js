/* --- Proveedor: los subtitulos de YouTube ------------- COMPROBADO EN VIVO -
   La fuente que ya estaba dentro de la pagina y nadie usaba. YouTube tiene los
   subtitulos de muchos videos cronometrados, y tiene una ventaja que ninguna
   base de letras puede tener: estan cronometrados contra ESTA pista, la que
   suena, no contra el master que alguien eligio en otra base de datos. O sea que
   el problema de "la letra parece de otra version del tema" no existe aqui, y el
   ajuste de desfase tampoco hace falta.

   Y en los automaticos los tiempos son POR PALABRA de verdad, como el richsync
   de Musixmatch, sin token y sin saltarse las condiciones de nadie.

   POR QUE VA LA ULTIMA DE LA CADENA, aun con esas dos ventajas: el texto de un
   subtitulo automatico sale de reconocer voz cantada, y eso se equivoca. Una
   letra humana ligeramente desfasada, que el usuario arregla con Alt+izquierda
   una vez, vale mas que una transcripcion perfectamente cronometrada que dice
   otra cosa. Asi que primero quien tiene el texto bueno, y esto para cuando no
   lo tenga nadie — que es justo el caso para el que se pidio.

   PARA QUE PISTAS SIRVE, medido el 2026-07-31 sobre music.youtube.com:

     "- Topic" (el audio que YTM sirve por defecto)   ninguna, nunca
     videoclips oficiales y subidas normales           8 de 10 tenian

   Los art tracks de los canales automaticos no llevan subtitulos y no los van a
   llevar: no hay nadie que los suba y YouTube no le pasa el reconocedor a un
   audio con una foto. Asi que esto no cubre la cola de canciones normal — cubre
   los videoclips, los directos, los covers y las subidas de usuario, que es
   donde ademas LRCLIB flojea mas.

   DE DONDE SALE LA LISTA. Del propio reproductor, con getPlayerResponse(), que
   ya la tiene cargada. No hay peticion, ni clave de API, ni scraping: la
   respuesta del reproductor ya se la trajo YouTube Music al empezar la pista.
   La unica peticion que sale es la del texto en si, a la URL firmada que viene
   dentro — firmada y con caducidad, por eso no se guarda nunca en cache.

   Forma comprobada de la respuesta:

     getPlayerResponse().captions.playerCaptionsTracklistRenderer
       captionTracks[]        { baseUrl, languageCode, kind, vssId, name }
                              kind === 'asr' SOLO en los automaticos
       audioTracks[]          { defaultCaptionTrackIndex, captionTrackIndices }
       defaultAudioTrackIndex

   Y el texto, pidiendo la baseUrl con &fmt=json3:

     { events: [ { tStartMs, dDurationMs, aAppend, segs: [ { utf8, tOffsetMs } ] } ] } */

const YT_TIMEDTEXT = '&fmt=json3';

/* Un texto que es todo el una acotacion entre corchetes o parentesis no es
   letra: es una descripcion de sonido. [Music], [Aplausos], [Risas], [♪♪♪].
   Se comprueba ANTES de sanear, y el orden importa — sanear quita los corchetes,
   asi que hacerlo al reves deja "Music" suelto como si fuera un verso, que es
   exactamente lo que salia en la primera medicion. */
const RE_ACOTACION = /^[[(][^\])]*[\])][.,!?]?$/;

/* Las notas musicales se escriben con escape y no como literal. El parcial pasa
   por concatenacion y por conversion de fin de linea antes de llegar al
   navegador, y un caracter fuera del ASCII en la fuente es una oportunidad de
   que la expresion llegue mal formada sin que nadie lo note. Mismo motivo que la
   expresion de la pestana de letra en 10-puntos.js. */
const RE_NOTAS = new RegExp('[\\u266a\\u266b\\u266c]', 'g');

const esAcotacion = (crudo) => RE_ACOTACION.test(
  String(crudo || '').replace(RE_NOTAS, '').replace(/\s+/g, ' ').trim(),
);

/* Fuera las notas y los corchetes decorativos, y fuera tambien los angulos: el
   texto acaba dentro de un LRC mejorado, donde `<` y `>` delimitan las marcas de
   palabra. Un `>>` de un subtitulo de television — que los llevan — se leeria
   como una marca rota y partiria la linea. */
const sanearSub = (s) => String(s || '')
  .replace(/[<>[\]]/g, ' ')
  .replace(RE_NOTAS, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* --- Los dos cortes ----------------------------------------------- MEDIDO -
   Una transcripcion que no entendio el audio no da error: da lineas sueltas y
   sin sentido, repartidas por la cancion. Pasa de verdad — el videoclip de
   MONACO de Bad Bunny, que es español, tiene subtitulo automatico declarado en
   INGLES, y lo que sale es "demonon", "fore", "foree", "speee for".

   Eso hay que tirarlo, porque ensenar la letra equivocada no se corrige, se
   sufre. Y se distingue con un numero: cuantas palabras por segundo hay entre la
   primera y la ultima. Medido sobre cinco pistas reales:

     Anti-Hero        manual  en    2.09    buena
     Givenchy         manual  es    3.01    buena
     Columbia         auto    es    2.02    buena
     Never Gonna...   auto    en    1.40    buena
     MONACO           auto    en    0.46    BASURA

   El hueco entre 1.40 y 0.46 es grande y no esta cerca de ninguna de las dos
   cosas, asi que el corte va en 0.8. Se mide entre la primera palabra y la
   ultima, no sobre la cancion entera, para que una intro instrumental larga o
   una coda no hundan la cuenta de una transcripcion que si es buena. */
const DENSIDAD_MINIMA = 0.8;
const LINEAS_MINIMAS = 6;

/* --- El corte de linea, para los automaticos ---------------------- MEDIDO -
   Los subtitulos automaticos no vienen en versos: vienen en una tira continua
   que la ventana rodante parte donde le toca, y parte a mitad de frase — medido:
   "We're no strangers to" / "love. You know the rules and so".

   Como cada palabra trae su tiempo real, se puede rehacer el reparto. Se corta
   en un silencio largo, o cuando la linea ya es larga y ademas hay un respiro:
   los dos umbrales juntos evitan las dos formas de quedar mal — cortar a mitad
   de una palabra sostenida, y dejar un parrafo de cuarenta palabras que no cabe
   en la pantalla. */
const HUECO_LINEA = 1.2;      // silencio que corta siempre
const RESPIRO = 0.35;         // pausa que corta solo si la linea ya va larga
const LARGO_BLANDO = 26;
const LARGO_DURO = 52;

/* Las mayusculas de los subtitulos de emision. Anti-Hero viene entero en
   mayusculas — medido: el 100% de las letras — y en una vista de karaoke a 44px
   eso es un grito. Se baja solo cuando esta casi todo en alta, para no tocar un
   texto que use las mayusculas a proposito.

   El "I" del ingles se devuelve a su sitio porque es la unica palabra de una
   letra que se escribe siempre en alta, y `\bi\b` la coge tambien dentro de
   "i'm" y "i've" — el apostrofo es limite de palabra. */
const MAYUS_LIMITE = 0.85;

const bajarMayusculas = (lineas, idioma) => {
  const todo = lineas.map((l) => l.texto).join('');
  const letras = todo.replace(/[^\p{L}]/gu, '').length;
  const altas = todo.replace(/[^\p{Lu}]/gu, '').length;
  if (!letras || altas / letras < MAYUS_LIMITE) return lineas;

  const ingles = /^en/i.test(idioma || '');
  const arreglar = (t) => {
    let s = t.toLocaleLowerCase();
    if (ingles) s = s.replace(/\bi\b/g, 'I');
    return s.charAt(0).toLocaleUpperCase() + s.slice(1);
  };
  return lineas.map((l) => ({
    ...l,
    texto: arreglar(l.texto),
    palabras: l.palabras ? l.palabras.map((p) => ({ ...p, texto: p.texto })) : null,
  }));
};

/* Los subtitulos escritos a mano: una entrada por rotulo, con el texto entero
   dentro. No hay tiempos por palabra, asi que esto acaba en LRC normal y la
   interpolacion de 35-palabras.js se encarga del relleno — igual que con LRCLIB.

   Dos rotulos en el MISMO instante se juntan en una linea. Pasa con los rotulos
   pintados por partes (medido en Anti-Hero: "I SHOULD NOT BE LEFT TO MY OWN" y
   "DEVICES, THEY COME WITH PRICES..." los dos en 28.32), y si no se juntaran
   quedaria una linea de duracion cero que el render no llega a ensenar. */
const subtitulosPorRotulo = (eventos) => {
  const lineas = [];
  for (const e of eventos) {
    const crudo = e.segs.map((s) => s.utf8).join('').replace(/\n/g, ' ');
    if (esAcotacion(crudo)) continue;
    const texto = sanearSub(crudo);
    if (!texto) continue;

    const t = (Number(e.tStartMs) || 0) / 1000;
    const previa = lineas[lineas.length - 1];
    if (previa && Math.abs(previa.inicio - t) < 0.01) { previa.texto += ` ${texto}`; continue; }
    lineas.push({ inicio: t, texto, palabras: null });
  }
  return lineas;
};

/* Los automaticos: cada trozo es una palabra con su desplazamiento dentro del
   evento, o sea tiempos por palabra REALES. Se juntan todos en una tira y se
   reparte en lineas con los umbrales de arriba.

   Los eventos con `aAppend` se saltan: son el salto de linea de la ventana
   rodante, traen un "\n" por todo contenido y no anaden ninguna palabra. Y no
   hay palabras repetidas entre eventos — comprobado, la tira es continua. */
const subtitulosPorPalabra = (eventos) => {
  const trozos = [];
  for (const e of eventos) {
    const base = Number(e.tStartMs) || 0;
    for (const s of e.segs) {
      if (esAcotacion(s.utf8)) continue;
      const texto = sanearSub(s.utf8);
      if (!texto) continue;
      trozos.push({ inicio: (base + (Number(s.tOffsetMs) || 0)) / 1000, texto });
    }
  }

  const lineas = [];
  let actual = null;
  for (let i = 0; i < trozos.length; i++) {
    const p = trozos[i];
    const hueco = actual ? p.inicio - trozos[i - 1].inicio : 0;
    const largo = actual ? actual.texto.length : 0;
    const corta = !actual || hueco > HUECO_LINEA || largo >= LARGO_DURO ||
                  (largo >= LARGO_BLANDO && hueco >= RESPIRO);
    if (corta) { actual = { inicio: p.inicio, texto: '', palabras: [] }; lineas.push(actual); }
    actual.palabras.push(p);
    actual.texto = actual.texto ? `${actual.texto} ${p.texto}` : p.texto;
  }
  return lineas;
};

/* json3 a LRC, que es el formato que el motor ya sabe leer. Lo mismo que hace
   55-musixmatch.js con el richsync, y por lo mismo: la cache sigue guardando
   texto, el parser ya sabe marcar la linea de tiempo como porPalabra, y no hay
   una segunda representacion que mantener por todo el codigo.

   Devuelve { lrc, porPalabra } o { rechazo } con el motivo. */
const json3ALrc = (datos, idioma) => {
  const eventos = ((datos && datos.events) || []).filter((e) => Array.isArray(e.segs) && !e.aAppend);
  if (!eventos.length) return { rechazo: 'la pista no trae ningun evento con texto' };

  /* Que haya desplazamientos es lo que decide la via, y no que la pista sea
     automatica: hay automaticas sin ellos y no se puede dar por supuesto. */
  const porPalabra = eventos.some((e) => e.segs.some((s) => s.tOffsetMs !== undefined));
  let lineas = (porPalabra ? subtitulosPorPalabra(eventos) : subtitulosPorRotulo(eventos))
    .filter((l) => l.texto);

  if (lineas.length < LINEAS_MINIMAS) return { rechazo: `solo ${lineas.length} lineas con texto` };

  const palabras = lineas.reduce((n, l) => n + l.texto.split(' ').length, 0);
  const tramo = lineas[lineas.length - 1].inicio - lineas[0].inicio;
  const densidad = palabras / Math.max(1, tramo);
  if (densidad < DENSIDAD_MINIMA) {
    return { rechazo: `${densidad.toFixed(2)} palabras/s: el reconocedor no entendio este audio` };
  }

  lineas = bajarMayusculas(lineas, idioma);

  const lrc = lineas.map((l) => (l.palabras
    ? `[${marcaLrc(l.inicio)}]${l.palabras.map((p) => `<${marcaLrc(p.inicio)}>${p.texto}`).join(' ')}`
    : `[${marcaLrc(l.inicio)}]${l.texto}`)).join('\n');

  return { lrc, porPalabra, lineas: lineas.length, densidad };
};

/* --- La eleccion de pista ----------------------------------------- MEDIDO -
   Es la decision que decide si esto sirve o miente, porque `captionTracks` no
   son versiones de lo mismo: son idiomas distintos, y varios son TRADUCCIONES
   subidas como pista. Anti-Hero trae trece — zh-Hans, zh-Hant, en, fr, de, hi,
   id-ID, ja, ko, ko-KR, ms, pt-BR, es. Coger la de es ahi seria ensenar la letra
   traducida al español mientras suena en ingles.

   1. Lo que el propio reproductor encenderia: la pista por defecto de la banda
      de audio por defecto. Es la respuesta correcta cuando esta, porque la pone
      YouTube sabiendo cual es el idioma original. Medido en Anti-Hero: apunta a
      `en`, la 2 de 13.
   2. Cuando no esta — y no siempre esta, medido en Givenchy y en Columbia — el
      idioma de la pista AUTOMATICA delata el idioma del audio, porque ese lo
      dedujo YouTube escuchando. Con el se elige la escrita a mano de ese mismo
      idioma, que es el mejor de los dos mundos: texto humano y idioma bueno.
   3. Si no, la escrita a mano que haya.
   4. Y si no, la automatica. */
const elegirPista = (lista) => {
  const pistas = (lista && lista.captionTracks) || [];
  if (!pistas.length) return null;

  const bandas = lista.audioTracks || [];
  const banda = bandas[lista.defaultAudioTrackIndex || 0];
  const porDefecto = banda && banda.defaultCaptionTrackIndex;
  if (porDefecto !== undefined && pistas[porDefecto]) {
    return { pista: pistas[porDefecto], porque: 'la que encenderia el reproductor' };
  }

  const auto = pistas.find((p) => p.kind === 'asr');
  if (auto) {
    const aMano = pistas.find((p) => p.kind !== 'asr' && p.languageCode === auto.languageCode);
    if (aMano) return { pista: aMano, porque: `escrita a mano en el idioma que oyo YouTube (${auto.languageCode})` };
  }

  const aMano = pistas.find((p) => p.kind !== 'asr');
  if (aMano) return { pista: aMano, porque: 'la unica escrita a mano' };

  return auto ? { pista: auto, porque: 'automatica, no hay otra' } : null;
};

const RE_ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;

const ProveedorSubtitulos = {
  nombre: 'subtitulos',

  disponible() { return Ajustes.get('usarSubtitulos') !== false; },

  /* LA FRONTERA CON EL REPRODUCTOR --------------------------------- MEDIDO -
     `getPlayerResponse` no es una propiedad del DOM: es un metodo que el codigo
     de YouTube le colgo al elemento. Y ahi hay dos mundos distintos:

       - Con gestor de userscripts, lo que se ve del elemento es un envoltorio
         de rayos X, que ensena el DOM estandar y esconde lo que la pagina le
         anadio. El metodo no aparece. `wrappedJSObject` es la puerta al objeto
         de verdad, y en Firefox el gestor la deja abierta.
       - Con el cargador nativo no hace falta, porque su caja se crea con
         wantXrays en false a proposito (ver mods/youtube-music/live-lyrics/nativo/proceso.js): ahi el
         motor ve la pagina tal cual.

     De ahi `wrappedJSObject || elemento`, que cubre los dos sin preguntar en
     cual estamos. Y el resultado se clona a un objeto nuestro con JSON antes de
     mirarlo por dentro: lo que cruza la frontera son datos planos, que es la
     misma leccion que costo el puente del cargador nativo. Se clona solo la
     rama de subtitulos y no la respuesta entera, que pesa cientos de kilobytes.  */
  _leerDelReproductor() {
    const mp = punto('moviePlayer');
    if (!mp) return null;

    let crudo = mp;
    try { if (mp.wrappedJSObject) crudo = mp.wrappedJSObject; } catch (e) { /* no hay rayos X */ }
    if (typeof crudo.getPlayerResponse !== 'function') return null;

    try {
      const respuesta = crudo.getPlayerResponse();
      if (!respuesta) return null;
      const detalles = respuesta.videoDetails;
      const rama = respuesta.captions && respuesta.captions.playerCaptionsTracklistRenderer;
      return {
        video: detalles ? String(detalles.videoId || '') : '',
        lista: rama ? JSON.parse(JSON.stringify(rama)) : null,
      };
    } catch (e) {
      log('no se pudo leer la respuesta del reproductor:', e && e.message);
      return null;
    }
  },

  /* El reproductor puede ir un paso por detras del tema: mediaSession cambia
     antes de que la respuesta nueva este cargada, y durante un anuncio la que
     hay es la DEL ANUNCIO. Coger esa seria pedir los subtitulos de la cuna de
     un anuncio y cronometrarlos contra la cancion. Asi que se espera a que el
     reproductor diga el mismo video que nos pidieron. */
  async _esperarAlReproductor(id) {
    const primera = this._leerDelReproductor();
    if (!primera) { log('subtitulos: este reproductor no da getPlayerResponse'); return null; }

    /* Fuera de /watch el id es una firma de titulo+artista, no un id de video:
       ahi no hay nada que comparar y lo que diga el reproductor es lo que suena. */
    if (!RE_ID_VIDEO.test(id.id)) return primera;
    if (primera.video === id.id) return primera;

    for (let i = 0; i < 12; i++) {
      await dormir(250);
      const d = this._leerDelReproductor();
      if (d && d.video === id.id) return d;
    }
    log(`subtitulos: el reproductor sigue en otro video (${id.id} pedido)`);
    return null;
  },

  async buscar(id) {
    const datos = await this._esperarAlReproductor(id);
    if (!datos) return null;
    if (!datos.lista) { log('subtitulos: este video no tiene ninguno'); return null; }

    const elegida = elegirPista(datos.lista);
    if (!elegida) { log('subtitulos: la lista vino vacia'); return null; }

    const { pista, porque } = elegida;
    const automatica = pista.kind === 'asr';
    log(`subtitulos: ${pista.languageCode}${automatica ? ' automatico' : ' a mano'} — ${porque}`);

    /* La baseUrl viene firmada y con caducidad dentro. Por eso se pide entera y
       tal cual, y por eso no se guarda: lo que va a cache es el LRC ya hecho. */
    const r = await Red.json(`${pista.baseUrl}${YT_TIMEDTEXT}`);
    if (!r.ok) { log('subtitulos: la peticion del texto fallo:', r.error); return null; }

    const hecho = json3ALrc(r.datos, pista.languageCode);
    if (hecho.rechazo) {
      log(`subtitulos descartados — ${hecho.rechazo}. Mejor sin letra que con la equivocada`);
      return null;
    }

    log(`subtitulos: ${hecho.lineas} lineas, ${hecho.porPalabra ? 'tiempos por palabra REALES' : 'por rotulo'}, ${hecho.densidad.toFixed(2)} palabras/s`);
    return {
      texto: hecho.lrc,
      fuente: automatica ? 'youtube-auto' : 'youtube',
      porPalabra: hecho.porPalabra,
    };
  },
};

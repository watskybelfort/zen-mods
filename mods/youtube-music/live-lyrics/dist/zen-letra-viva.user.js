// ==UserScript==
// @name         Zen Letra Viva
// @namespace    https://github.com/watskybelfort/zen-mods
// @version      1.2.1
// @description  La letra corre con la cancion en YouTube Music: karaoke palabra a palabra, escenario en lugar del video, pantalla completa y mini tira sobre la barra. Y pone el videoclip cuando la cancion lo tiene.
// @author       local
// @homepageURL  https://github.com/watskybelfort/zen-mods
// @match        https://music.youtube.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      lrclib.net
// @connect      apic-desktop.musixmatch.com
// @connect      www.youtube.com
// @noframes
// ==/UserScript==

/* Generado por installer/compilar-letra.mjs desde mods/youtube-music/live-lyrics/src/ — NO EDITAR A MANO.
   20 parciales, version 1.2.1.
   Para cambiar algo se edita el parcial y se vuelve a ejecutar el build. */

(() => {
/* ===== 05-prologo.js ===================================================== */
/* --- Prologo --------------------------------------------------------------
   El motor entero vive dentro de UNA sola funcion anonima que arma
   dev/powershell/Build-LetraViva.ps1 concatenando los parciales de mods/youtube-music/live-lyrics/src/ en
   orden numerico. Es el mismo patron que userContent.css, que se arma con los
   parciales de web/: cada archivo se lee solo y el entregable es uno.

   Consecuencia practica: todos los parciales comparten el mismo cierre. Cada
   uno cuelga lo suyo de LV y nadie escribe en el objeto global de la pagina,
   asi que YouTube Music no ve nada nuestro y no hay colision posible con su
   codigo. La unica salida al exterior es window.__zenLetra, y es de solo
   lectura para depurar. */
'use strict';

const LV = {
  version: '1.2.1',
  /* Prefijo de TODA clase, id y clave de almacen que escribimos. Un solo
     sitio del que salen, para que se puedan barrer de una pasada. */
  marca: 'zen-letra',
  debug: false,
  /* Cada parcial que traiga estilos los empuja aqui y el arranque los inyecta
     todos en UNA hoja. Asi el orden de los parciales no decide si una vista
     encuentra su CSS declarado, y sobre todo no hay cinco elementos <style>
     nuestros repartidos por el head. */
  hojas: [],
};

const log = (...a) => { if (LV.debug) console.log('%c[letra]', 'color:#d97757;font-weight:600', ...a); };
const warn = (...a) => console.warn('[letra]', ...a);

/* EL IDIOMA ---------------------------------------------------------------
   Lo que se ve sale en el idioma de la pagina de YouTube Music, que es el que el
   usuario tiene puesto en su cuenta (<html lang>), o en el que fuerce la pref
   zen.mods.idioma ('es' / 'en'), que llega del cargador como __zenIdioma. Si no
   es espanol, en ingles. Se mira cada vez y no una sola al arrancar: el lang se
   puede cambiar sin recargar. */
const idioma = () => {
  const forzado = typeof __zenIdioma === 'string' ? __zenIdioma : '';
  if (forzado === 'es' || forzado === 'en') return forzado;
  const l = (document.documentElement && document.documentElement.lang) || navigator.language || '';
  return /^es\b/i.test(l) ? 'es' : 'en';
};
const tr = (en, es) => (idioma() === 'es' ? es : en);

/* --- Utilidades ---------------------------------------------------------- */

const limitar = (n, min, max) => (n < min ? min : n > max ? max : n);

/* Clases con la marca delante, para no repetir el prefijo en cada plantilla. */
const c = (...partes) => partes.map((p) => `${LV.marca}-${p}`).join(' ');

const crear = (tag, clases, props) => {
  const el = document.createElement(tag);
  if (clases) el.className = clases;
  if (props) Object.assign(el, props);
  return el;
};

/* Espera a que un selector exista. YouTube Music es una SPA que construye el
   reproductor despues del primer pintado, asi que a document-start no hay casi
   nada: sin esto, cualquier querySelector del arranque devuelve null y el mod
   parece no cargar. Un MutationObserver en lugar de un intervalo porque el
   arbol de Polymer se rehace por partes y queremos enterarnos en el momento,
   no hasta 200 ms despues.

   SE OBSERVA `document`, NO `document.documentElement` ------------- MEDIDO -
   A document-start, que es cuando entra este script, `document.documentElement`
   TODAVIA ES NULL: el parser aun no ha emitido la etiqueta <html>. Pasarle null
   a observe() lanza "parameter 1 is not of type 'Node'", y como esto se llama
   desde el arranque, la excepcion se llevaba por delante el resto del arranque
   entero — el mod quedaba cargado y completamente muerto, sin una sola senal.
   El nodo Document si es observable y ya existe, asi que sirve de raiz. */
const esperar = (selector, limiteMs = 30000) => new Promise((resolve) => {
  const ya = document.querySelector(selector);
  if (ya) return resolve(ya);

  let reloj = 0;
  const obs = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    obs.disconnect();
    clearTimeout(reloj);
    resolve(el);
  });
  obs.observe(document.documentElement || document, { childList: true, subtree: true });
  reloj = setTimeout(() => { obs.disconnect(); resolve(null); }, limiteMs);
});

/* Vigila que un nodo nuestro siga colgado donde lo pusimos. Polymer rehace
   sus contenedores al cambiar de pagina o de estado del reproductor y se
   lleva por delante lo que le hayamos metido dentro; el sintoma es que la
   vista desaparece sola al volver de una busqueda. `montar` se vuelve a
   llamar cuando eso pasa. */
const vigilarMontaje = (contenedor, nodo, montar) => {
  const obs = new MutationObserver(() => {
    if (!nodo.isConnected && contenedor.isConnected) {
      log('remontando', nodo.className);
      montar();
    }
  });
  obs.observe(contenedor, { childList: true });
  return obs;
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===== 10-puntos.js ====================================================== */
/* --- Los puntos de enganche ---------------------------------------- MEDIDO -
   Medido en vivo sobre music.youtube.com el 2026-07-30, sesion sin cuenta,
   con el reproductor abierto en /watch. Cada entrada dice de que depende y que
   se pierde si desaparece, porque el fallo tipico de esto no es una excepcion:
   es un querySelector que devuelve null y una vista que simplemente no sale.

   Estructura medida del reproductor:

     ytmusic-player-page#player-page  [player-page-ui-state=FULL_PLAYER_VIEW]
       div.content
         div#main-panel                  781 x 1037   <- caratula y video
           div#av-id.av
           ytmusic-player#player         781 x 440
             div#song-image                (0x0 en modo video)
             div#song-video                781 x 440
             div#song-media-window
           ytmusic-info-panel-overview-view-model
         div#side-panel.side-panel        476 x 1085   <- pestanas
           tp-yt-paper-tabs.tab-header-container
           ytmusic-tab-renderer#tab-renderer

   Y las cuatro pestanas, en este orden: "Up next", "Lyrics", "Comments",
   "Related".

   POR QUE NO USAMOS LA PESTANA DE LETRA DE YTM COMO CONTENEDOR. Medido: la
   pestana "Lyrics" sale con el atributo `disabled` y `aria-disabled=true`
   cuando la app no tiene letra para el tema. O sea que el sitio donde
   "naturalmente" iria nuestro panel esta deshabilitado exactamente en el caso
   en que el mod hace falta. Por eso montamos panel propio en #side-panel y no
   dependemos de la seleccion de Polymer para nada. */

const PUNTOS = {
  app: {
    sel: ['ytmusic-app'],
    para: 'la raiz de la aplicacion; de aqui cuelga la vista de pantalla completa',
    critico: true,
  },
  paginaReproductor: {
    sel: ['ytmusic-player-page#player-page', 'ytmusic-player-page'],
    para: 'la pagina del reproductor. Su atributo player-page-ui-state dice si esta abierta o minimizada',
    critico: true,
  },
  panelPrincipal: {
    sel: ['#main-panel'],
    para: 'donde viven la caratula y el video: es el ancla de la vista escenario',
    critico: true,
  },
  panelLateral: {
    sel: ['#side-panel'],
    para: 'la columna de pestanas: es el ancla de la vista panel',
    critico: true,
  },
  reproductor: {
    sel: ['ytmusic-player#player', '#player'],
    para: 'el bloque de caratula/video que la vista escenario tapa',
    critico: false,
  },
  conmutadorAV: {
    sel: ['#av-id ytmusic-av-toggle', 'ytmusic-av-toggle'],
    para: 'el conmutador Song/Video. De sus atributos sale si la cancion tiene videoclip (playback-mode, toggle-disabled) y de su button.video-button, ponerlo',
    critico: false,
  },
  pestanas: {
    sel: ['#side-panel #tabsContainer', '#tabsContainer'],
    para: 'la fila de pestanas; de su alto (48px medidos) sale donde empieza nuestro panel',
    critico: false,
  },
  contenidoPestana: {
    sel: ['ytmusic-tab-renderer#tab-renderer', '#tab-renderer'],
    para: 'el contenido de la pestana activa, que el panel tapa mientras esta puesto',
    critico: false,
  },
  moviePlayer: {
    sel: ['#movie_player'],
    para: 'de sus clases sale la deteccion de anuncio, que es lo que evita que la letra se dispare sola; y de su getPlayerResponse() sale la lista de subtitulos del video',
    critico: true,
  },
  video: {
    sel: ['video'],
    para: 'EL RELOJ. currentTime de aqui es contra lo que se cronometra todo',
    critico: true,
  },
  barra: {
    sel: ['ytmusic-player-bar'],
    para: 'la barra de abajo, 72px medidos: de ahi sale la altura a la que flota la mini tira',
    critico: false,
  },
  barraDerecha: {
    sel: ['ytmusic-player-bar #right-controls', 'ytmusic-player-bar .right-controls'],
    para: 'donde se inyecta nuestro boton de letra',
    critico: false,
  },
  menuExpansible: {
    sel: ['ytmusic-player-bar #expanding-menu'],
    para: 'referencia para colocar el boton a su izquierda; si falta, el boton va al final y no pasa nada',
    critico: false,
  },
  barraTitulo: {
    sel: ['ytmusic-player-bar .title'],
    para: 'titulo del tema por DOM, respaldo de mediaSession',
    critico: false,
  },
  barraByline: {
    sel: ['ytmusic-player-bar .byline'],
    para: 'artista y album por DOM, respaldo de mediaSession',
    critico: false,
  },
};

/* Resuelve un punto probando sus selectores en orden y devuelve el primero que
   exista. No cachea el elemento: en una SPA el nodo de ayer puede estar
   desconectado hoy, y devolver un nodo huerfano es peor que devolver null
   porque escribir en el no da error y no se ve nada. Cachea solo CUAL de los
   selectores acerto, que es lo que le interesa al informe. */
const aciertos = new Map();

const punto = (nombre) => {
  const def = PUNTOS[nombre];
  if (!def) { warn('punto inexistente:', nombre); return null; }
  for (const sel of def.sel) {
    const el = document.querySelector(sel);
    if (el) { aciertos.set(nombre, sel); return el; }
  }
  aciertos.set(nombre, null);
  return null;
};

const puntos = (nombre) => {
  const def = PUNTOS[nombre];
  if (!def) return [];
  for (const sel of def.sel) {
    const els = document.querySelectorAll(sel);
    if (els.length) { aciertos.set(nombre, sel); return [...els]; }
  }
  aciertos.set(nombre, null);
  return [];
};

/* Las pestanas se piden aparte porque no son un punto unico sino una lista, y
   porque lo que nos interesa de ellas es la de letra: la usamos solo para
   saber si YTM tiene letra propia, nunca como contenedor.

   La expresion se construye desde una cadena ASCII con los escapes dentro en
   lugar de escribirse como literal con caracteres japoneses. El parcial pasa por
   concatenacion y por conversion de fin de linea antes de llegar al navegador, y
   un caracter fuera del ASCII en la fuente es una oportunidad de que la
   expresion llegue mal formada al otro lado sin que nadie lo note. */
const RE_PESTANA_LETRA = new RegExp('letra|lyric|liedtext|parole|testo|\\u6b4c\\u8a5e', 'i');
const pestanaLetra = () => {
  const tabs = document.querySelectorAll('#tabsContainer tp-yt-paper-tab.tab-header');
  /* Por texto no vale: la interfaz esta traducida. Medido que la de letra es
     la segunda de cuatro, pero fiarse del indice es fragil, asi que se cruzan
     las dos cosas: el indice 1 como pista y el texto en varios idiomas como
     confirmacion, y con que una de las dos acierte, sirve. */
  const porTexto = [...tabs].find((t) => RE_PESTANA_LETRA.test(t.textContent || ''));
  return porTexto || tabs[1] || null;
};

/* --- El informe ----------------------------------------------------------
   Esto es lo que hace que el mod no se quede obsoleto en silencio. Sale por
   window.__zenLetra.doctor() y dice, punto por punto, si sigue existiendo.
   Lo mismo que hace dev/powershell/Doctor.ps1 con el CSS, pero desde dentro de la
   pagina, que es el unico sitio desde el que se puede comprobar el DOM de una
   web ajena. */
const informe = () => {
  const filas = Object.entries(PUNTOS).map(([nombre, def]) => {
    const el = punto(nombre);
    return {
      punto: nombre,
      estado: el ? 'ok' : (def.critico ? 'ROTO' : 'ausente'),
      critico: def.critico,
      selector: aciertos.get(nombre) || def.sel[0],
      respaldoUsado: !!el && aciertos.get(nombre) !== def.sel[0],
      para: def.para,
    };
  });
  const rotos = filas.filter((f) => f.estado === 'ROTO');
  console.table(filas.map(({ punto: p, estado, selector, respaldoUsado }) => ({ punto: p, estado, selector, respaldo: respaldoUsado })));
  if (rotos.length) {
    console.warn(`[letra] ${rotos.length} punto(s) critico(s) roto(s). YouTube Music cambio su DOM:`);
    for (const r of rotos) console.warn(`  - ${r.punto} (${r.selector}) -> ${r.para}`);
  } else {
    log('todos los puntos criticos en pie');
  }
  return filas;
};

/* ===== 20-reloj.js ======================================================= */
/* --- El reloj -------------------------------------------------------- MEDIDO -
   Contra esto se cronometra todo. Es el `currentTime` del elemento de video, y
   tiene tres trampas que hay que resolver aqui y no en el render.

   TRAMPA 1: LOS ANUNCIOS. Medido en vivo: mientras suena un anuncio,
   #movie_player lleva las clases `ad-showing` y `ad-interrupting`, y el
   currentTime del video es el DEL ANUNCIO, empezando por cero. Si el reloj no
   lo distingue, en cada corte publicitario la letra salta al principio y
   vuelve a correr sola. Y la duracion tambien es la del anuncio, que es lo que
   usamos para elegir la version correcta de la letra: con un anuncio de 15s
   delante, la busqueda pediria una cancion de 15 segundos.

   Mientras hay anuncio el reloj se congela en el ultimo tiempo bueno y avisa
   del estado. No se pone a cero: al volver del anuncio la cancion sigue donde
   estaba, asi que congelar es lo que hace que no se note el corte.

   TRAMPA 2: currentTime NO AVANZA A 60 FPS. Gecko lo actualiza cuando llega
   un frame de media, no cuando se pinta la pagina. Si el relleno de la palabra
   leyera el valor crudo, avanzaria a escalones y el efecto se ve como una
   cinta que tirita. Por eso el reloj extrapola: guarda el ultimo valor real
   con su marca de performance.now() y, entre lectura y lectura, suma el tiempo
   transcurrido por la velocidad de reproduccion. Cuando llega un valor real se
   resincroniza.

   TRAMPA 3: LOS SALTOS. Si el usuario arrastra la barra de progreso, la
   extrapolacion queda invalidada de golpe. Un salto se detecta porque el valor
   real se aparta del extrapolado mas de lo que cabe en un frame, y entonces el
   reloj lo anuncia para que el render deje de animar y se replante en la linea
   nueva en lugar de recorrer el camino con easing.

   TRAMPA 4: EL <video> NO SE REINICIA ENTRE PISTAS. En una cola de radio
   (`list=RDAMVM...`) YTM sirve varias canciones seguidas sobre el MISMO
   MediaSource: el elemento no se reconstruye al cambiar de tema y su
   currentTime no vuelve a cero, sigue contando. Medido en vivo el 2026-08-06
   sobre la radio de "Panamiur (Remix)": el <video> decia currentTime 612s y
   duration 665.9s mientras la barra de YTM ensenaba 2:56 de 3:50. El desfase es
   el mismo en los dos numeros —436s—, que es donde empieza la pista dentro del
   flujo cosido.

   Leer el <video> en crudo rompe DOS cosas a la vez, y la segunda no parece un
   fallo del reloj: la letra saldria 436 segundos adelantada, y la busqueda
   pediria una cancion de 11 minutos que no existe, asi que ninguna version pasa
   el filtro de duracion de 50-lrclib.js y el panel dice "nadie tiene la letra"
   teniendola LRCLIB con la duracion correcta.

   El reproductor si sabe el tiempo bueno: en ese mismo instante
   #movie_player.getCurrentTime() daba 215.5s y getDuration() 229.6s, que es lo
   que ensena la barra y lo que casa con LRCLIB (229-230s). Son metodos que
   cuelga el codigo de YouTube, no propiedades del DOM, asi que hay que
   atravesar los rayos X igual que en 57-subtitulos.js. El <video> se queda de
   respaldo entero: si un dia esos metodos no estan, el reloj vuelve a lo de
   antes, que en reproduccion normal —una cancion abierta suelta— era y sigue
   siendo correcto. */

/* Cuanto se le permite al reloj adelantarse al ultimo valor real del video.
   Milisegundos de sobra para tapar el hueco entre frames de media; cualquier cosa
   por encima ya no es suavizado, es invencion. */
const TOPE_ADELANTO = 1;

const Reloj = {
  _video: null,
  _ultimoReal: 0,        // ultimo currentTime que dio el video
  _marcaReal: 0,         // performance.now() de ese momento
  _congelado: 0,         // tiempo bueno guardado mientras hay anuncio
  _anuncio: false,
  _duracion: 0,          // solo se escribe cuando NO hay anuncio
  _oyentesSalto: new Set(),
  _mpNodo: null,         // el #movie_player que ya inspeccionamos
  _mpApi: null,          // ese mismo, con los rayos X atravesados (TRAMPA 4)

  /* El reproductor con sus metodos a la vista, o null si esta build no los da.
     Se resuelve una vez por nodo y no en cada frame: atravesar los rayos X es
     barato pero no gratis, y el reloj pregunta sesenta veces por segundo.

     `wrappedJSObject` es la puerta al objeto real de la pagina. Con gestor de
     userscripts el codigo corre en un sandbox con vision de rayos X, que ensena
     el DOM pero esconde lo que el codigo de la pagina le colgo encima: sin
     atravesarlos, getCurrentTime no aparece. Con el cargador nativo no hay
     rayos X y el propio elemento ya sirve. De ahi el `|| mp`, que cubre los dos
     casos sin preguntar cual es. Mismo trato que en 57-subtitulos.js. */
  _api() {
    const mp = punto('moviePlayer');
    if (!mp) return null;
    if (mp !== this._mpNodo) {
      this._mpNodo = mp;
      let crudo = mp;
      try { if (mp.wrappedJSObject) crudo = mp.wrappedJSObject; } catch (e) { /* no hay rayos X */ }
      this._mpApi = typeof crudo.getCurrentTime === 'function' ? crudo : null;
      if (!this._mpApi) warn('el reproductor no da getCurrentTime: el reloj se cae al <video>');
    }
    return this._mpApi;
  },

  /* El tiempo REAL de la pista, sin extrapolar. Del reproductor si contesta, y
     del <video> si no. Es el unico sitio donde se decide de donde sale. */
  _leerTiempo() {
    const api = this._api();
    if (api) {
      try {
        const t = api.getCurrentTime();
        if (Number.isFinite(t)) return t;
      } catch (e) { /* se cae al <video> */ }
    }
    const v = this.video();
    return v ? v.currentTime : 0;
  },

  /* El elemento se vuelve a pedir si el que teniamos se desconecto. YTM
     reconstruye el reproductor al cambiar entre cancion y video, y un nodo
     desconectado sigue respondiendo currentTime: el ultimo que tuvo. O sea que
     el reloj se quedaria clavado sin dar ningun error. */
  video() {
    if (!this._video || !this._video.isConnected) {
      this._video = punto('video');
      if (this._video) this._enganchar(this._video);
    }
    return this._video;
  },

  _enganchar(v) {
    /* LA MARCA SE PONE AQUI, Y ESTO ARREGLA UN FALLO REPORTADO EN USO -- MEDIDO -
       Naciendo las dos en cero, habia un caso que rompia todo: en el instante de
       un cambio de pista, currentTime vale CERO EXACTO. Como el valor no ha
       cambiado respecto al inicial, la rama que actualiza la marca no entraba, y
       la extrapolacion se hacia desde el cero absoluto — o sea que devolvia
       performance.now() entero, que son los segundos que lleva abierta la
       pestana. Con la pestana abierta diez minutos, el reloj decia 600s y la letra
       aparecia directamente en la ultima linea.

       El sintoma reportado fue exactamente ese: "hay temas en los que la letra
       aparece directamente al final". Solo pasaba en las canciones donde la
       primera lectura caia justo en el cero, que es lo que lo hacia parecer
       aleatorio. Comprobado en dev/tools/probar-reloj.mjs. */
    this._ultimoReal = this._leerTiempo();
    this._marcaReal = performance.now();

    v.addEventListener('seeked', () => this._resincronizar(true));
    v.addEventListener('playing', () => this._resincronizar(false));
    v.addEventListener('ratechange', () => this._resincronizar(false));
    v.addEventListener('durationchange', () => this._leerDuracion());
    this._leerDuracion();
  },

  _leerDuracion() {
    if (this._anuncio) return;                       // TRAMPA 1
    const api = this._api();                         // TRAMPA 4
    if (api) {
      try {
        const d = api.getDuration();
        if (Number.isFinite(d) && d > 1) { this._duracion = d; return; }
      } catch (e) { /* se cae al <video> */ }
    }
    const v = this.video();
    if (v && Number.isFinite(v.duration) && v.duration > 1) this._duracion = v.duration;
  },

  _resincronizar(esSalto) {
    const v = this.video();
    if (!v) return;
    this._ultimoReal = this._leerTiempo();
    this._marcaReal = performance.now();
    if (esSalto) for (const f of this._oyentesSalto) { try { f(); } catch (e) { warn(e); } }
  },

  alSaltar(f) { this._oyentesSalto.add(f); return () => this._oyentesSalto.delete(f); },

  /* Se llama una vez al arrancar. Observa el atributo class de #movie_player
     en lugar de leerlo en cada frame: el estado de anuncio cambia dos veces por
     corte, no sesenta veces por segundo. */
  vigilarAnuncios() {
    const mp = punto('moviePlayer');
    if (!mp) { warn('sin #movie_player: no se pueden distinguir los anuncios'); return; }

    const leer = () => {
      const hay = mp.classList.contains('ad-showing') || mp.classList.contains('ad-interrupting');
      if (hay === this._anuncio) return;
      this._anuncio = hay;
      if (hay) {
        this._congelado = this._tiempoCrudo();
        log('anuncio: reloj congelado en', this._congelado.toFixed(2));
      } else {
        /* Al salir del anuncio el video vuelve a la cancion pero currentTime
           tarda un frame o dos en reflejarlo. Resincronizar aqui evita un
           parpadeo de la letra en el punto de vuelta. */
        this._resincronizar(true);
        this._leerDuracion();
        log('fin del anuncio: reloj suelto');
      }
    };

    new MutationObserver(leer).observe(mp, { attributes: true, attributeFilter: ['class'] });
    leer();
  },

  _tiempoCrudo() {
    const v = this.video();
    if (!v) return 0;

    const real = this._leerTiempo();
    const ahora = performance.now();

    /* TRAMPA 2: extrapolar entre lecturas reales. */
    if (real !== this._ultimoReal) {
      const previsto = this._ultimoReal + ((ahora - this._marcaReal) / 1000) * (v.playbackRate || 1);
      /* TRAMPA 3: un salto es apartarse mas de lo que cabe entre dos frames de
         media. 0.35s es holgado para 24 fps y estrecho para un arrastre de
         barra, que mueve segundos. */
      if (Math.abs(real - previsto) > 0.35) {
        for (const f of this._oyentesSalto) { try { f(); } catch (e) { warn(e); } }
      }
      this._ultimoReal = real;
      this._marcaReal = ahora;
      return real;
    }

    if (v.paused) return this._ultimoReal;

    /* DOS TOPES A LA EXTRAPOLACION. Adelantarse unas decimas es para lo que
       esta — tapa el escalon entre frame y frame de media. Adelantarse mas es
       siempre un error, porque significa que el video lleva un rato sin refrescar
       currentTime: pestana en segundo plano, decodificacion atascada o buffer
       vacio. Sin tope, el reloj se inventa un tiempo que no existe y la letra se
       va al final de la cancion. Y nunca por encima de la duracion, que es un
       limite que el propio medio no puede pasar. */
    const adelanto = Math.min(((ahora - this._marcaReal) / 1000) * (v.playbackRate || 1), TOPE_ADELANTO);
    const previsto = this._ultimoReal + adelanto;
    return this._duracion ? Math.min(previsto, this._duracion) : previsto;
  },

  /* El tiempo de la CANCION en segundos, que es lo unico que el render
     necesita saber. Con anuncio devuelve el congelado. */
  tiempo() { return this._anuncio ? this._congelado : this._tiempoCrudo(); },

  /* Se relee en cada consulta y no solo con `durationchange`. Con la cola
     cosida (TRAMPA 4) ese evento no vuelve a saltar al cambiar de pista —el
     medio es el mismo—, asi que la duracion guardada seria la de la cancion
     anterior justo cuando 50-lrclib.js la necesita para elegir version. */
  duracion() { this._leerDuracion(); return this._duracion; },

  estado() {
    const v = this.video();
    if (!v) return 'sin-video';
    if (this._anuncio) return 'anuncio';
    return v.paused ? 'pausa' : 'sonando';
  },

  /* Los segundos que entran son de la CANCION, no del flujo. Con la cola cosida
     (TRAMPA 4) escribirlos en v.currentTime mandaria el reproductor 436
     segundos atras, o sea a otra cancion: por eso el salto va por seekTo, que
     habla en el mismo tiempo que getCurrentTime. El <video> sigue de respaldo
     para el caso sin cosido, donde los dos tiempos coinciden. */
  buscar(segundos) {
    const v = this.video();
    if (!v || this._anuncio) return false;      // durante un anuncio, ni tocarlo
    const destino = Math.max(0, segundos);
    const api = this._api();
    let hecho = false;
    if (api && typeof api.seekTo === 'function') {
      try { api.seekTo(destino, true); hecho = true; } catch (e) { /* se cae al <video> */ }
    }
    if (!hecho) v.currentTime = destino;
    this._resincronizar(true);
    return true;
  },
};

/* ===== 25-tema.js ======================================================== */
/* --- Identidad del tema ---------------------------------------------- MEDIDO -
   Para pedir la letra hay que saber QUE suena, y no hay una sola fuente fiable
   en YouTube Music. Se cruzan tres, en este orden:

   1. navigator.mediaSession.metadata. Es la mejor: la pone la propia app para
      los controles del sistema operativo, esta limpia de adornos y cambia en el
      momento exacto en que cambia la pista. Medido en vivo: trae `title` y
      `artist` siempre, `album` NO (venia vacio), y una entrada de `artwork`.
      Ojo con leerla: en un userscript con permisos, el objeto llega por Xray, y
      cualquier acceso puede fallar segun el gestor. De ahi el try/catch.

   2. La barra del reproductor. `.title` y `.byline` de ytmusic-player-bar.
      Es el respaldo cuando mediaSession no esta, y la unica via al album,
      porque el byline lo lleva. Medido: para canciones el byline es
      "Artista • Album • Ano" y para videos "Artista • N visualizaciones", asi
      que la segunda parte solo es album si no parece un contador.

   3. La URL. El parametro `v` de /watch es el identificador de video, que es la
      clave con la que se guarda todo en cache y el desfase. Es lo unico
      estable: titulo y artista cambian de idioma segun la cuenta.

   NORMALIZAR NO ES COSMETICA. Los titulos de YouTube Music llevan adornos que
   ninguna base de letras tiene indexados: "(Official Video)", "(Remastered
   2011)", "(Visualizer)". Buscar con el adorno puesto es la primera causa de
   "no hay letra para este tema" cuando si la hay. Y los canales automaticos de
   YouTube llevan " - Topic" pegado al nombre del artista. */

const RUIDO_TITULO = [
  /\((?:official\s+)?(?:music\s+)?video(?:\s+clip)?\)/gi,
  /\((?:official\s+)?(?:audio|lyrics?|lyric\s+video|visuali[sz]er|visual)\)/gi,
  /\[(?:official\s+)?(?:music\s+)?video\]/gi,
  /\[(?:official\s+)?(?:audio|lyrics?|visuali[sz]er)\]/gi,
  /\((?:re-?master(?:ed)?|remasterizado)(?:\s+\d{4})?\)/gi,
  /\((?:video\s+)?oficial\)/gi,
  /\((?:letra|letras)\)/gi,
  /\(HD\)|\(HQ\)|\(4K\)/gi,
];

const limpiarTitulo = (t) => {
  let s = t || '';
  for (const r of RUIDO_TITULO) s = s.replace(r, ' ');
  return s.replace(/\s{2,}/g, ' ').trim();
};

const limpiarArtista = (a) => (a || '')
  .replace(/\s+-\s+Topic$/i, '')
  .replace(/\s*VEVO$/i, '')
  .trim();

/* "Artista • Album • 2010" contra "Artista • 1.6M de visualizaciones".
   Un contador siempre empieza por digito, y un ano son cuatro digitos solos;
   lo que queda en medio y no es ninguna de las dos cosas, es el album. */
const parecePorContador = (s) => /^\d/.test(s.trim()) || /(views|visualizaciones|reproducciones|likes|me gusta)/i.test(s);

const desdeByline = (texto) => {
  const partes = (texto || '').split('•').map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return { artista: '', album: '' };
  const artista = limpiarArtista(partes[0]);
  let album = '';
  for (const p of partes.slice(1)) {
    if (parecePorContador(p)) continue;
    if (/^\d{4}$/.test(p)) continue;             // ano
    album = p;
    break;
  }
  return { artista, album };
};

const Tema = {
  _actual: null,
  _oyentes: new Set(),
  _vigilando: false,

  _deMediaSession() {
    try {
      const m = navigator.mediaSession && navigator.mediaSession.metadata;
      if (!m || !m.title) return null;
      return {
        titulo: String(m.title || ''),
        artista: String(m.artist || ''),
        album: String(m.album || ''),
        arte: (() => { try { const a = m.artwork; return a && a.length ? String(a[a.length - 1].src) : ''; } catch { return ''; } })(),
      };
    } catch (e) {
      log('mediaSession ilegible, se usa la barra:', e && e.message);
      return null;
    }
  },

  _deLaBarra() {
    const t = punto('barraTitulo');
    if (!t) return null;
    const titulo = (t.textContent || '').trim();
    if (!titulo) return null;
    const b = punto('barraByline');
    const { artista, album } = desdeByline(b && b.textContent);
    return { titulo, artista, album, arte: '' };
  },

  _idDeVideo() {
    const p = new URLSearchParams(location.search);
    const v = p.get('v');
    if (v) return v;
    /* Fuera de /watch (navegando por la app con algo sonando) la URL no lleva
       el id. Se cae a una firma de titulo+artista: no es un id de YouTube, pero
       sirve igual para lo unico que usamos el id — indexar cache y desfase. */
    return null;
  },

  /* Lo que se le pide a los proveedores. Ya normalizado, porque normalizar en
     el proveedor lo haria dos veces distinto en dos sitios. */
  identidad() {
    const base = this._deMediaSession() || this._deLaBarra();
    if (!base || !base.titulo) return null;

    const barra = base.album ? null : this._deLaBarra();   // solo por el album
    const titulo = limpiarTitulo(base.titulo);
    const artista = limpiarArtista(base.artista) || (barra ? barra.artista : '');
    const album = base.album || (barra ? barra.album : '');
    const id = this._idDeVideo() || `firma:${titulo}::${artista}`;

    return {
      id,
      titulo,
      tituloCrudo: base.titulo,
      artista,
      album,
      arte: base.arte,
      duracion: Reloj.duracion(),
      /* La firma decide si el tema CAMBIO. La duracion queda fuera a proposito:
         llega despues que el titulo y cambiaria la firma dos veces por tema,
         disparando dos busquedas de letra para la misma cancion. */
      firma: `${id}|${titulo}|${artista}`,
    };
  },

  alCambiar(f) { this._oyentes.add(f); return () => this._oyentes.delete(f); },

  _avisar(id) {
    this._actual = id;
    log('tema:', id ? `${id.artista} — ${id.titulo}` : '(nada)');
    for (const f of this._oyentes) { try { f(id); } catch (e) { warn(e); } }
  },

  /* Se comprueba por sondeo y no por eventos de la app. YTM emite
     `yt-navigate-finish`, pero no lo emite al pasar de una cancion a la
     siguiente dentro de la misma cola, que es justo el caso que mas importa.
     Dos veces por segundo comparar dos cadenas no se nota en ningun sitio, y a
     cambio funciona igual el dia que ellos renombren su evento. */
  vigilar() {
    if (this._vigilando) return;
    this._vigilando = true;

    const comprobar = () => {
      const id = this.identidad();
      const firmaVieja = this._actual ? this._actual.firma : null;
      const firmaNueva = id ? id.firma : null;
      if (firmaNueva !== firmaVieja) this._avisar(id);
      else if (id && this._actual && !this._actual.duracion && id.duracion) {
        /* Misma cancion, pero ya sabemos cuanto dura. No es un cambio de tema:
           se actualiza en silencio para que la busqueda por duracion la tenga. */
        this._actual.duracion = id.duracion;
      }
    };

    setInterval(comprobar, 400);
    const v = Reloj.video();
    if (v) for (const ev of ['loadedmetadata', 'emptied', 'durationchange']) v.addEventListener(ev, comprobar);
    comprobar();
  },

  actual() { return this._actual; },
};

/* ===== 28-video.js ======================================================= */
/* --- El videoclip, cuando la cancion lo tiene ---------------------- MEDIDO -
   YouTube Music sirve por defecto el ART TRACK: el audio del canal automatico
   "- Topic", con la caratula fija. Cuando el tema tiene ademas videoclip, la
   aplicacion no lo pone sola — ofrece un conmutador Song/Video y hay que
   pulsarlo cancion por cancion. Ese es justo el gesto que un mod puede quitar
   de en medio, porque es siempre el mismo y siempre en el mismo sitio.

   Medido en vivo el 2026-08-02 sobre music.youtube.com. El conmutador es
   `ytmusic-av-toggle`, vive dentro de `#av-id` en `#main-panel`, y lleva su
   estado entero en atributos, que es lo que lo hace legible sin tocar nada:

     playback-mode                    ATV_PREFERRED | OMV_PREFERRED | NONE
     toggle-disabled                  presente = no se puede conmutar
     audio-only-playback-available    presente = existe la version de solo audio
     is-video-playback-mode-selected  cual de los dos esta puesto ahora

   Dentro hay dos botones, `button.song-button` y `button.video-button`.
   Cambiar es pulsar el segundo: no hay API, y no hace falta que la pagina del
   reproductor este abierta — el elemento existe y responde con el reproductor
   minimizado, medido con su rectangulo a 0x0.

   SIN SESION ESTO NO FUNCIONA, Y NO ES UN FALLO NUESTRO ----------- MEDIDO -
   Sin cuenta iniciada, `toggle-disabled` sale puesto en las tres pistas
   probadas — incluida una con `audio-only-playback-available` presente, o sea
   que la contrapartida existia y aun asi estaba bloqueado. Lo decide YouTube
   Music. Por eso `estado()` distingue "esta cancion no tiene video" de "no se
   puede conmutar": son dos cosas distintas, y solo una de las dos tiene
   arreglo por parte de quien lo usa. */

const VIDEO_SONDEO_MS = 300;      // cada cuanto se mira mientras la pista se asienta
const VIDEO_VENTANA_MS = 12000;   // cuanto se insiste antes de dejarlo estar
const VIDEO_MEMORIA = 60;         // pistas recordadas para no forzar dos veces

const Video = {
  _reloj: 0,
  _hasta: 0,
  _pista: null,
  /* Las pistas ya atendidas. Existe por una razon concreta: si el usuario
     vuelve a "Song" a mano, la pista de audio vuelve a aparecer como cambio de
     tema, y sin memoria el mod la empujaria otra vez al video. Una pelea con el
     usuario es peor que no hacer nada. Se acota porque una cola larga no puede
     hacer crecer esto sin fin, y olvidar lo viejo es justo lo que se quiere:
     la misma cancion, mañana, vuelve a merecer su videoclip. */
  _atendidas: new Set(),
  _orden: [],

  conmutador() { return punto('conmutadorAV'); },

  /* Todo lo que se puede saber sin tocar nada. */
  lectura() {
    const t = this.conmutador();
    if (!t) return { conmutador: false };
    return {
      conmutador: true,
      modo: t.getAttribute('playback-mode') || '',
      enVideo: t.getAttribute('is-video-playback-mode-selected') === 'true',
      bloqueado: t.hasAttribute('toggle-disabled'),
      hayAudioDetras: t.hasAttribute('audio-only-playback-available'),
      hayBoton: !!t.querySelector('button.video-button'),
    };
  },

  /* Por que esta como esta, con palabras. Es lo que sale por
     window.__zenLetra.estado() y lo unico que permite distinguir desde fuera
     un tema sin videoclip de una sesion sin iniciar. */
  estado() {
    const l = this.lectura();
    if (!Ajustes.get('preferirVideo')) return { puesto: false, dice: 'apagado en el menu' };
    if (!l.conmutador) return { puesto: true, dice: 'no encuentro el conmutador de YouTube Music' };
    if (l.enVideo) return { puesto: true, dice: 'ya esta sonando el video', modo: l.modo };
    if (l.modo === 'NONE') return { puesto: true, dice: 'esta cancion no tiene video', modo: l.modo };
    if (l.bloqueado) {
      return {
        puesto: true,
        modo: l.modo,
        dice: l.hayAudioDetras
          ? 'YouTube Music no deja conmutar: lo tipico es no tener la sesion iniciada'
          : 'esta cancion no tiene video',
      };
    }
    return { puesto: true, dice: 'hay video y se puede poner', modo: l.modo };
  },

  /* --- Los anuncios ------------------------------------------------ MEDIDO -
     Durante un anuncio no se toca NADA: el conmutador es el de la cancion que
     viene, no el del anuncio, y pulsarlo ahi es pedirle a la aplicacion que
     recargue en mitad de un corte publicitario.

     Y NO BASTA CON PREGUNTARLE AL RELOJ. El reloj se entera de los anuncios por
     sondeo, asi que entre que empieza uno y el reloj lo sabe hay una ventana —
     y esa ventana es exactamente cuando esto se dispara, porque al empezar el
     anuncio la aplicacion cambia mediaSession al anuncio y eso llega aqui como
     cambio de tema. Medido: el titulo pasaba a "Con Bion3 fortalece las
     defensas naturales de tu organismo". La primera version preguntaba solo al
     reloj y pulsaba el videoclip con el anuncio en marcha; lo canto la prueba
     que ponia la clase y miraba el mismo tick. La clase se lee en vivo, que no
     tiene retardo y cuesta lo mismo. */
  hayAnuncio() {
    if (Reloj.estado() === 'anuncio') return true;
    const mp = punto('moviePlayer');
    return !!mp && (mp.classList.contains('ad-showing') || mp.classList.contains('ad-interrupting'));
  },

  /* Se pulsa el boton y ya esta. Devuelve si se llego a pulsar, que es lo que
     decide si hay que avisar al usuario: un salto de la reproduccion sin
     explicacion se lee como un fallo de YouTube Music. */
  poner() {
    const t = this.conmutador();
    if (!t) return false;
    const boton = t.querySelector('button.video-button');
    if (!boton) return false;
    try { boton.click(); } catch (e) { warn('no se pudo pulsar el video:', e && e.message); return false; }
    return true;
  },

  /* --- El intento, que es lo unico con algo de logica --------------------
     Tras un cambio de pista, YouTube Music tarda en dejar los atributos del
     conmutador en su sitio: al principio no hay elemento, luego lo hay con el
     modo vacio, y solo despues aparece si tiene contrapartida. Por eso esto no
     mira una vez, sino que sondea durante una ventana y se rinde. Sondeo y no
     MutationObserver por lo mismo que Tema.vigilar: Polymer rehace el bloque
     entero, y un observador sobre un nodo que van a reemplazar deja de servir
     sin avisar. */
  atender(id) {
    clearTimeout(this._reloj);
    this._reloj = 0;
    if (!id || !Ajustes.get('preferirVideo')) return;

    /* La clave es el id de video: es lo unico estable, y es ademas lo que
       cambia cuando la conmutacion funciona — o sea que el propio exito nos
       trae aqui otra vez con una pista distinta, ya en modo video, y el
       intento se acaba solo sin ningun contador de por medio. */
    const clave = id.id;
    if (!clave || this._atendidas.has(clave)) return;

    this._pista = clave;
    this._hasta = Date.now() + VIDEO_VENTANA_MS;
    this._mirar();
  },

  _mirar() {
    this._reloj = 0;
    const id = Tema.actual();
    if (!id || id.id !== this._pista) return;          // ya cambio la cancion

    if (this.hayAnuncio()) {
      /* EL TIEMPO DE ANUNCIO NO CUENTA. La ventana existe para no insistir
         eternamente sobre una pista que no va a conmutar; agotarla mientras
         suena publicidad seria darse por vencido antes de haber mirado una sola
         vez. Y peor: `_recordar` marcaria el id de la cancion como atendido —
         durante el anuncio la URL sigue siendo la suya — y al volver la cancion
         de verdad ya no se le pondria el video. */
      this._hasta = Date.now() + VIDEO_VENTANA_MS;
    } else {
      const l = this.lectura();
      if (l.conmutador && l.enVideo) { this._recordar(this._pista); return; }
      if (l.conmutador && l.modo && !l.bloqueado && l.hayBoton) {
        this._recordar(this._pista);
        if (this.poner()) {
          log('video: conmutado en', this._pista);
          Aviso.decir(tr('Switching to the video', 'Poniendo el vídeo'));
        }
        return;
      }
      /* Un NONE ya resuelto es una respuesta, no una espera: esta cancion no
         tiene video y no la va a tener dentro de tres segundos. */
      if (l.conmutador && l.modo === 'NONE') { this._recordar(this._pista); return; }
    }

    if (Date.now() > this._hasta) {
      log('video: sin conmutador utilizable para', this._pista, this.estado().dice);
      this._recordar(this._pista);
      return;
    }
    this._reloj = setTimeout(() => this._mirar(), VIDEO_SONDEO_MS);
  },

  _recordar(clave) {
    if (this._atendidas.has(clave)) return;
    this._atendidas.add(clave);
    this._orden.push(clave);
    while (this._orden.length > VIDEO_MEMORIA) this._atendidas.delete(this._orden.shift());
  },

  /* Encender el interruptor con una cancion ya sonando tiene que hacer algo
     ahora, no en la siguiente: si no, parece que no funciona. Y olvidar la
     pista actual es lo que permite que el intento se repita. */
  reconsiderar() {
    const id = Tema.actual();
    if (!id) return;
    this._atendidas.delete(id.id);
    this.atender(id);
  },
};

/* `dice` es una clave interna (la logica la compara); esto es lo que se le
   ensena al usuario, en su idioma. */
const textoVideo = (dice) => ({
  'apagado en el menu': tr('Turned off in the menu', 'Apagado en el menú'),
  'no encuentro el conmutador de YouTube Music': tr("Can't find YouTube Music's video switch", 'No encuentro el conmutador de YouTube Music'),
  'ya esta sonando el video': tr('The video is already playing', 'Ya está sonando el vídeo'),
  'esta cancion no tiene video': tr('This song has no video', 'Esta canción no tiene vídeo'),
  'YouTube Music no deja conmutar: lo tipico es no tener la sesion iniciada': tr("YouTube Music won't switch, usually because you're not signed in", 'YouTube Music no deja cambiar: lo típico es no tener la sesión iniciada'),
  'hay video y se puede poner': tr('This song has a video', 'Hay vídeo y se puede poner'),
}[dice] || dice);

/* ===== 30-lrc.js ========================================================= */
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

/* ===== 35-palabras.js ==================================================== */
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

/* ===== 40-red.js ========================================================= */
/* --- La capa de red -------------------------------------------------------
   Una sola funcion para pedir JSON, con tres implementaciones detras, porque el
   motor tiene que correr en dos sitios distintos y en uno de ellos ni siquiera
   hay CORS de por medio:

   1. GM_xmlhttpRequest, cuando corre bajo un gestor de userscripts. Es la via
      buena: el gestor hace la peticion desde fuera de la pagina, asi que no hay
      CORS que negociar y los dominios permitidos se declaran en la cabecera con
      @connect. Preferida siempre que exista.
   2. fetch, cuando no hay gestor. Funciona solo si el servidor manda cabeceras
      CORS permisivas. Si no las manda, el navegador bloquea la respuesta y no
      hay nada que hacer desde dentro de la pagina — por eso el diagnostico lo
      dice con esas palabras, en lugar de dejar un "failed to fetch" pelado que
      parece que el sitio esta caido.
   3. El puente, que instala el cargador nativo. Cuando el motor corre inyectado
      desde el chrome de Zen, la peticion la hace el proceso padre, que es
      privilegiado: no tiene origen, asi que CORS no le aplica. El protocolo se
      define aqui para que el cargador nativo solo tenga que implementarlo.

   Y una cortesia que no es opcional: LRCLIB es un servicio gratuito mantenido
   por una persona. Hay un minimo entre peticiones y las peticiones identicas en
   vuelo se comparten, para no pedir tres veces lo mismo cuando el usuario pasa
   rapido de cancion. */

const ESPERA_MINIMA_MS = 350;
const CLIENTE = () => `zen-letra-viva ${LV.version} (https://github.com/watskybelfort/zen-mods)`;

/* LA CABECERA DE CORTESIA ES DE LRCLIB, Y SOLO DE LRCLIB ------------ MEDIDO -
   `Lrclib-Client` dice quien llama, y con LRCLIB eso es educacion: es un
   servicio gratuito mantenido por una persona. Mandarsela ademas a todos los
   demas parecia inofensivo y no lo era.

   Una cabecera que no esta en la lista segura de CORS convierte la peticion en
   "no simple", y entonces el navegador manda antes un OPTIONS de permiso.
   `api/timedtext` de YouTube no contesta a ese OPTIONS, asi que la peticion se
   muere sin llegar a salir. Medido contra el servicio, desde music.youtube.com
   y por fetch:

     sin cabeceras propias    200, 32623 bytes
     solo Accept              200, 32623 bytes    (Accept si esta en la lista)
     con Lrclib-Client        TypeError: Failed to fetch

   O sea que no era un descuido cosmetico: era el proveedor de subtitulos entero
   sin funcionar justo en la instalacion mas comun, la que no tiene gestor ni
   cargador nativo y va por fetch. Por GM y por el puente no se nota, porque esos
   no pasan por CORS — que es exactamente lo que hace que un fallo asi sobreviva
   a las pruebas de quien lo escribe. */
const ES_LRCLIB = /^https:\/\/([a-z0-9-]+\.)*lrclib\.net(\/|$)/i;

const Red = {
  _ultima: 0,
  _enVuelo: new Map(),
  /* Cuenta los fallos de TRANSPORTE — los que no llegaron a hablar con el
     servidor. Sirve para no confundir "esta cancion no tiene letra" con "no pude
     preguntar", que es una distincion que solo importa por la cache: guardar un
     vacio por un corte de red envenena la entrada durante dias. */
  fallosDeTransporte: 0,

  /* El puente se busca en dos sitios, y no es por indecision.

     El cargador nativo evalua el motor en un sandbox cuyo prototipo es el window
     de la pagina, asi que ahi `window` ES el window de YouTube Music. Si el puente
     se colgara de el, quedaria a la vista del propio codigo de YouTube — y un
     puente es, literalmente, una forma de hacer peticiones sin CORS. Asi que el
     cargador lo deja como global DEL SANDBOX, que solo ve nuestro codigo, y aqui
     se mira tambien ahi. `typeof` sobre un identificador que no existe es seguro
     incluso en modo estricto; leerlo directamente seria un ReferenceError. */
  puente() {
    if (window.__zenLetraPuente && typeof window.__zenLetraPuente.pedir === 'function') return window.__zenLetraPuente;
    if (typeof __zenLetraPuente !== 'undefined' && __zenLetraPuente && typeof __zenLetraPuente.pedir === 'function') return __zenLetraPuente;
    return null;
  },

  via() {
    if (typeof GM_xmlhttpRequest === 'function') return 'gm';
    if (this.puente()) return 'puente';
    if (typeof fetch === 'function') return 'fetch';
    return 'ninguna';
  },

  async _cortesia() {
    const desde = performance.now() - this._ultima;
    if (desde < ESPERA_MINIMA_MS) await dormir(ESPERA_MINIMA_MS - desde);
    this._ultima = performance.now();
  },

  /* Devuelve { ok, estado, datos, error }. No lanza: un proveedor que se cae no
     puede tumbar la cadena de proveedores, y envolver cada llamada en try/catch
     en cada sitio es como se olvida uno. */
  async json(url, opciones = {}) {
    const clave = `${url}`;
    if (this._enVuelo.has(clave)) return this._enVuelo.get(clave);

    const promesa = this._json(url, opciones).finally(() => this._enVuelo.delete(clave));
    this._enVuelo.set(clave, promesa);
    return promesa;
  },

  async _json(url, opciones) {
    await this._cortesia();
    const via = this.via();
    const cabeceras = {
      Accept: 'application/json',
      ...(ES_LRCLIB.test(url) ? { 'Lrclib-Client': CLIENTE() } : null),
      ...(opciones.cabeceras || {}),
    };
    const limite = opciones.limiteMs || 12000;

    try {
      if (via === 'gm') return this._contarSiEsTransporte(await this._porGm(url, cabeceras, limite));
      if (via === 'puente') return this._contarSiEsTransporte(await this.puente().pedir({ url, cabeceras, limiteMs: limite }));
      if (via === 'fetch') return this._contarSiEsTransporte(await this._porFetch(url, cabeceras, limite));
      this.fallosDeTransporte++;
      return { ok: false, estado: 0, error: 'sin ninguna via de red disponible' };
    } catch (e) {
      this.fallosDeTransporte++;
      return { ok: false, estado: 0, error: (e && e.message) || String(e) };
    }
  },

  _porGm(url, cabeceras, limiteMs) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: cabeceras,
        timeout: limiteMs,
        responseType: 'text',
        onload: (r) => resolve(this._interpretar(r.status, r.responseText, url)),
        onerror: () => resolve({ ok: false, estado: 0, error: `la peticion fallo (${url})` }),
        ontimeout: () => resolve({ ok: false, estado: 0, error: `se agoto el tiempo (${limiteMs}ms)` }),
      });
    });
  },

  async _porFetch(url, cabeceras, limiteMs) {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), limiteMs);
    try {
      /* Sin credenciales a proposito: no queremos mandar cookies de terceros a
         un servicio de letras, y ademas con credentials la respuesta exigiria
         Allow-Origin explicito en lugar de comodin. */
      const r = await fetch(url, { headers: cabeceras, credentials: 'omit', signal: corte.signal, cache: 'no-store' });
      const texto = await r.text();
      return this._interpretar(r.status, texto, url);
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, estado: 0, error: `se agoto el tiempo (${limiteMs}ms)` };
      return {
        ok: false,
        estado: 0,
        error: `sin gestor de userscripts la peticion va por fetch y el servidor tiene que permitir CORS; este la rechazo (${(e && e.message) || e})`,
      };
    } finally {
      clearTimeout(reloj);
    }
  },

  _contarSiEsTransporte(r) {
    /* Estado 0 significa que no hubo respuesta HTTP: ni 404 ni 500, nada. O sea
       que del servidor no sabemos nada, y desde luego no que no tenga la letra. */
    if (r && !r.ok && r.estado === 0) this.fallosDeTransporte++;
    return r;
  },

  _interpretar(estado, texto, url) {
    /* 404 no es un error: en LRCLIB significa "no tengo esa cancion", que es una
       respuesta perfectamente valida y muy comun. Distinguirlo importa porque un
       404 se puede guardar en cache y un 500 no. */
    if (estado === 404) return { ok: false, estado, datos: null, error: 'no encontrado' };
    if (estado < 200 || estado >= 300) return { ok: false, estado, error: `respuesta ${estado} de ${url}` };
    try {
      return { ok: true, estado, datos: JSON.parse(texto) };
    } catch {
      return { ok: false, estado, error: 'la respuesta no era JSON' };
    }
  },
};

/* ===== 45-almacen.js ===================================================== */
/* --- Almacen: ajustes, cache y desfase ------------------------------------
   Dos implementaciones detras de la misma puerta, por lo mismo que la red:
   GM_setValue si hay gestor de userscripts, localStorage si no.

   QUE SE GUARDA EN CACHE Y QUE NO. Se guarda el TEXTO en crudo tal como lo dio
   el proveedor, no la linea de tiempo ya compuesta. Dos razones: ocupa una
   fraccion, y sobre todo que si manana se afina la interpolacion, la cache vieja
   se recompone con las reglas nuevas en lugar de servir para siempre el reparto
   de palabras de la version anterior — que es un fallo especialmente molesto,
   porque solo se nota en las canciones que ya habias escuchado.

   Y SE GUARDAN LOS FALLOS. Un "no tengo esa cancion" tambien va a cache, con
   caducidad mas corta. Sin eso, cada vuelta a un tema sin letra vuelve a
   preguntar por lo mismo, y son las canciones raras las que mas se repiten en
   las colas de uno. */

const VIDA_ACIERTO = 30 * 24 * 3600 * 1000;   // la letra de una cancion no cambia
const VIDA_FALLO = 3 * 24 * 3600 * 1000;      // pero la base de datos crece
const TOPE_CACHE = 300;                        // entradas antes de tirar las viejas

const hayGm = typeof GM_setValue === 'function' && typeof GM_getValue === 'function';

const Almacen = {
  via: hayGm ? 'gm' : 'localStorage',

  _clave(k) { return `${LV.marca}:${k}`; },

  leer(k, pordefecto = null) {
    try {
      if (hayGm) {
        const v = GM_getValue(this._clave(k), undefined);
        return v === undefined ? pordefecto : v;
      }
      const s = localStorage.getItem(this._clave(k));
      return s === null ? pordefecto : JSON.parse(s);
    } catch (e) {
      warn('no se pudo leer', k, e && e.message);
      return pordefecto;
    }
  },

  escribir(k, v) {
    try {
      if (hayGm) { GM_setValue(this._clave(k), v); return true; }
      localStorage.setItem(this._clave(k), JSON.stringify(v));
      return true;
    } catch (e) {
      /* localStorage lleno. Se vacia la cache y se reintenta una vez: perder
         cache es gratis, perder los ajustes del usuario no. */
      warn('no se pudo escribir', k, e && e.message);
      if (!hayGm) { Cache.vaciar(); try { localStorage.setItem(this._clave(k), JSON.stringify(v)); return true; } catch { /* nada mas que hacer */ } }
      return false;
    }
  },

  borrar(k) {
    try {
      if (hayGm) { GM_deleteValue(this._clave(k)); return; }
      localStorage.removeItem(this._clave(k));
    } catch { /* da igual */ }
  },
};

/* --- Ajustes -------------------------------------------------------------- */

const AJUSTES_POR_DEFECTO = {
  /* Cuanto se adelanta o atrasa la letra, en segundos. Global, se suma al
     desfase por cancion. */
  desfase: 0,
  /* Fuentes. Musixmatch va apagado: necesita un token que pone el usuario. Los
     subtitulos de YouTube van encendidos porque no necesitan nada — ni token, ni
     gestor, ni permiso — y solo entran cuando no hay letra de nadie mas. */
  usarLrclib: true,
  usarMusixmatch: false,
  tokenMusixmatch: '',
  usarSubtitulos: true,
  /* Poner el videoclip cuando la cancion lo tiene, en lugar de la caratula fija
     del art track. Encendido, porque es lo que se pidio y porque no puede
     estropear nada: cuando no hay video no pasa absolutamente nada. Lo que si
     hace es gastar mas datos, asi que el interruptor esta en el menu y lo dice. */
  preferirVideo: true,
  /* Vista con la que se abre la letra al pulsar el boton. */
  vistaPorDefecto: 'escenario',
  /* La mini tira sobre la barra, encendida aparte de la vista. */
  miniTira: false,
  /* El relleno palabra a palabra. Apagarlo deja el resaltado por linea, estilo
     Spotify basico, que es lo que algunos prefieren para leer. */
  porPalabra: true,
  /* Tamano de referencia de la letra, EN PIXELES. Es el del escenario; cada vista
     aplica su factor sobre este (el panel la mitad, la pantalla completa un
     tercio mas). En pixeles y no en rem porque YouTube Music pone la raiz del
     documento en 10px: cualquier rem nuestro saldria al 62.5% de lo pedido. */
  tamano: 44,
  debug: false,
};

const Ajustes = {
  _v: null,

  cargar() {
    const guardados = Almacen.leer('ajustes', {}) || {};
    this._v = { ...AJUSTES_POR_DEFECTO, ...guardados };
    LV.debug = !!this._v.debug;
    return this._v;
  },

  get(k) { if (!this._v) this.cargar(); return this._v[k]; },

  set(k, v) {
    if (!this._v) this.cargar();
    this._v[k] = v;
    Almacen.escribir('ajustes', this._v);
    if (k === 'debug') LV.debug = !!v;
    return v;
  },

  todos() { if (!this._v) this.cargar(); return { ...this._v }; },
};

/* --- Desfase por cancion --------------------------------------------------
   El desfase global no basta. La causa tipica de desincronizacion es que la
   pista de YouTube Music no es el mismo master que cronometro la base de datos:
   un video con intro habla, una version en directo, un remaster con medio
   segundo de silencio delante. Eso es por cancion, no por instalacion, asi que
   se guarda con el id del video y se recupera solo la proxima vez.

   Se guarda TODO junto en una entrada y no una por cancion: son unos pocos
   bytes por tema y asi se puede recortar cuando crezca sin recorrer el almacen. */

const Desfases = {
  _m: null,

  _cargar() { if (!this._m) this._m = Almacen.leer('desfases', {}) || {}; return this._m; },

  de(id) { return this._cargar()[id] || 0; },

  poner(id, segundos) {
    const m = this._cargar();
    if (Math.abs(segundos) < 0.001) delete m[id];
    else m[id] = Math.round(segundos * 1000) / 1000;

    const claves = Object.keys(m);
    if (claves.length > 500) for (const k of claves.slice(0, claves.length - 500)) delete m[k];

    Almacen.escribir('desfases', m);
    return segundos;
  },
};

/* --- Cache de letras ------------------------------------------------------ */

const Cache = {
  _indice() { return Almacen.leer('cache:indice', []) || []; },

  obtener(id) {
    const e = Almacen.leer(`cache:${id}`, null);
    if (!e) return null;
    const vida = e.vacio ? VIDA_FALLO : VIDA_ACIERTO;
    if (Date.now() - (e.at || 0) > vida) { Almacen.borrar(`cache:${id}`); return null; }
    return e;
  },

  guardar(id, entrada) {
    Almacen.escribir(`cache:${id}`, { ...entrada, at: Date.now() });

    const idx = this._indice().filter((k) => k !== id);
    idx.push(id);
    /* Se tiran las mas viejas por orden de entrada, no por ultimo uso: llevar
       cuenta del uso obligaria a escribir en el almacen en cada reproduccion,
       y eso es escritura en disco cada tres minutos para ahorrar unos kilobytes. */
    while (idx.length > TOPE_CACHE) Almacen.borrar(`cache:${idx.shift()}`);
    Almacen.escribir('cache:indice', idx);
  },

  vaciar() {
    for (const k of this._indice()) Almacen.borrar(`cache:${k}`);
    Almacen.escribir('cache:indice', []);
    log('cache vaciada');
  },

  cuantas() { return this._indice().length; },
};

/* ===== 50-lrclib.js ====================================================== */
/* --- Proveedor: LRCLIB --------------------------------- COMPROBADO EN VIVO -
   API abierta, sin clave, mantenida por una persona. Comprobado contra el
   servicio: /api/search devuelve un ARRAY de objetos con estas claves —

     id, name, trackName, artistName, albumName, duration (segundos),
     instrumental (bool), plainLyrics, syncedLyrics

   y `syncedLyrics` es texto LRC con marcas [mm:ss.xx]. NO hay ninguna clave con
   tiempos por palabra: por eso la interpolacion de 35-palabras.js no es un
   adorno, es la unica via al efecto de Apple Music con esta fuente.

   LA BUSQUEDA VA EN CASCADA, y el orden no es capricho. /api/get exige
   coincidencia exacta de artista, titulo y duracion, y cuando acierta es la
   respuesta correcta sin discusion. Pero falla con cualquier diferencia de
   puntuacion o de edicion, y entonces hace falta /api/search, que devuelve
   candidatos entre los que hay que elegir. Ir directo a search seria peor: da
   varias versiones del mismo tema y elegir mal es como salen las letras que van
   desincronizadas de principio a fin.

   LA DURACION ES EL DESEMPATE BUENO. Titulo y artista se escriben de veinte
   maneras; la duracion es un numero. Dos versiones de la misma cancion que
   difieren en mas de dos o tres segundos tienen tiempos distintos, asi que
   elegir por cercania de duracion es lo que evita cronometrar una cancion
   contra el master equivocado. */

const LRCLIB = 'https://lrclib.net';

const parametros = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
};

/* Parecido entre dos cadenas, 0 a 1, por trigramas. No hace falta nada mas
   fino: sirve para descartar que un "Remix" se cuele como si fuera el original,
   no para ordenar un catalogo. */
const parecido = (a, b) => {
  const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const tri = (s) => { const t = new Set(); const p = `  ${s} `; for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3)); return t; };
  const tx = tri(x);
  const ty = tri(y);
  let comunes = 0;
  for (const t of tx) if (ty.has(t)) comunes++;
  return (2 * comunes) / (tx.size + ty.size);
};

/* Si dos nombres de artista comparten alguna palabra con peso. Las cortas se
   descartan porque "de", "la" y "los" los comparte media discografia. */
const comparteNombre = (a, b) => {
  const trozos = (s) => new Set(
    String(s || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
  const x = trozos(a);
  for (const t of trozos(b)) if (x.has(t)) return true;
  return false;
};

const ProveedorLrclib = {
  nombre: 'lrclib',

  disponible() { return Ajustes.get('usarLrclib') !== false; },

  /* Devuelve { texto, fuente, instrumental } o null. El texto es LRC en crudo,
     que es lo que se guarda en cache. */
  async buscar(id) {
    const duracion = id.duracion > 1 ? Math.round(id.duracion) : null;

    // 1. Coincidencia exacta, con album si lo tenemos y con duracion.
    if (duracion) {
      const exacta = await this._get({
        artist_name: id.artista, track_name: id.titulo, album_name: id.album, duration: duracion,
      });
      if (exacta) return exacta;

      // 2. Sin album: el album de la barra viene mal escrito mas veces que bien.
      if (id.album) {
        const sinAlbum = await this._get({ artist_name: id.artista, track_name: id.titulo, duration: duracion });
        if (sinAlbum) return sinAlbum;
      }
    }

    // 3. Busqueda amplia y eleccion por duracion. Ultimo recurso.
    return this._buscarYElegir(id, duracion);
  },

  async _get(campos) {
    const r = await Red.json(`${LRCLIB}/api/get?${parametros(campos)}`);
    if (!r.ok) {
      if (r.estado !== 404) log('lrclib /get:', r.error);
      return null;
    }
    return this._interpretar(r.datos);
  },

  async _buscarYElegir(id, duracion) {
    /* Se pregunta por campos y no por `q` libre: con q= el servicio busca en
       todo y devuelve cosas de otros artistas con titulo parecido. */
    const r = await Red.json(`${LRCLIB}/api/search?${parametros({ track_name: id.titulo, artist_name: id.artista })}`);
    if (!r.ok || !Array.isArray(r.datos) || !r.datos.length) {
      /* Segundo intento solo por titulo: pasa cuando el artista de YTM lleva
         colaboraciones que la base indexa de otra forma. */
      const soloTitulo = await Red.json(`${LRCLIB}/api/search?${parametros({ track_name: id.titulo })}`);
      if (!soloTitulo.ok || !Array.isArray(soloTitulo.datos) || !soloTitulo.datos.length) return null;
      return this._elegir(soloTitulo.datos, id, duracion);
    }
    return this._elegir(r.datos, id, duracion);
  },

  /* --- EL FILTRO, QUE VA ANTES DE PUNTUAR --------------------- MEDIDO EN USO -
     Esto empezo siendo solo una puntuacion, y estaba mal de raiz: tener letra
     sincronizada sumaba 100 puntos y el umbral era 60, asi que CUALQUIER
     candidato con letra pasaba el corte por si solo. El parecido del titulo y del
     artista sumaba 25 y 15, o sea que solo reordenaba — no podia vetar a nadie.

     Sintoma real, con "Una Copa" de Homer El Mero Mero y Emanero: la busqueda por
     artista no encontro nada, la de solo titulo devolvio otra cancion que se
     llama parecido, y como traia letra sincronizada se acepto. Una letra que no
     tiene nada que ver, presentada con la misma confianza que una correcta.

     Ahora hay puertas que se cierran, y solo se puntua a quien las pasa. Y si no
     pasa nadie, se dice que no hay letra: es la respuesta correcta, y ademas es
     la unica que el usuario puede corregir a mano. Ensenar la letra equivocada no
     se corrige, se sufre. */
  _pasaElFiltro(c, id, duracion, pt, pa) {
    /* El titulo tiene que parecerse, sin excepcion. */
    if (pt < 0.5) return 'el titulo no se parece';

    /* Y el artista tambien, si sabemos cual es. La excepcion es para los temas
       con colaboraciones, donde una base lista "A" y YouTube Music "A, B y C": el
       parecido por trigramas baja mucho aunque sea el mismo tema.

       PERO LA EXCEPCION EXIGE QUE COMPARTAN ALGUN NOMBRE. Sin eso era una puerta
       abierta: con el titulo identico y la duracion clavada aceptaba a CUALQUIER
       artista, que es casi el mismo fallo que se venia a arreglar. Dos canciones
       distintas pueden llamarse igual y durar lo mismo; lo que no hacen es
       compartir el nombre del artista. */
    if (id.artista && pa < 0.34) {
      const duracionClava = duracion && Number.isFinite(c.duration) && Math.abs(c.duration - duracion) <= 3;
      if (!(pt > 0.85 && duracionClava && comparteNombre(c.artistName, id.artista))) return 'el artista no se parece';
    }

    /* Doce segundos de diferencia ya no son otra edicion del mismo tema: son otro
       tema. Y cronometrar contra la pista equivocada se ve como una letra que se
       desincroniza sola y no hay ajuste que la arregle. */
    if (duracion && Number.isFinite(c.duration) && Math.abs(c.duration - duracion) > 12) {
      return `la duracion se aparta ${Math.round(Math.abs(c.duration - duracion))}s`;
    }

    return null;
  },

  _elegir(candidatos, id, duracion) {
    const descartados = [];
    const aptos = candidatos.filter((c) => {
      const motivo = this._pasaElFiltro(c, id, duracion,
        parecido(c.trackName, id.titulo), parecido(c.artistName, id.artista));
      if (motivo) descartados.push({ dur: c.duration, motivo });
      return !motivo;
    });

    if (LV.debug && descartados.length) log(`lrclib: ${descartados.length} candidato(s) descartados`, descartados.slice(0, 5));
    if (!aptos.length) { log('lrclib: ningun candidato pasa el filtro; mejor sin letra que con la equivocada'); return null; }

    const puntuados = aptos.map((c) => {
      let punto = 0;

      /* Con letra sincronizada es lo unico que nos sirve de verdad. Una entrada
         con solo texto plano es el ultimo recurso: se muestra, pero sin correr. */
      if (c.syncedLyrics) punto += 100;
      else if (c.instrumental) punto += 40;
      else if (c.plainLyrics) punto += 10;

      /* La duracion pesa mas que el parecido del texto, por lo dicho arriba:
         es lo unico que distingue dos versiones del mismo tema. */
      if (duracion && Number.isFinite(c.duration)) {
        const dif = Math.abs(c.duration - duracion);
        if (dif <= 2) punto += 60;
        else if (dif <= 5) punto += 30;
        else if (dif <= 12) punto += 5;
        else punto -= Math.min(40, dif);
      }

      punto += 25 * parecido(c.trackName, id.titulo);
      punto += 15 * parecido(c.artistName, id.artista);
      if (id.album) punto += 10 * parecido(c.albumName, id.album);

      return { c, punto };
    }).sort((a, b) => b.punto - a.punto);

    if (LV.debug) {
      log('lrclib candidatos:', puntuados.slice(0, 5).map((p) => ({
        dur: p.c.duration, sinc: !!p.c.syncedLyrics, inst: !!p.c.instrumental, punto: Math.round(p.punto),
      })));
    }

    /* Ya no hace falta umbral: quien llega hasta aqui ha pasado las puertas, y la
       puntuacion solo decide cual de los validos es el mejor. El umbral de antes
       daba una falsa sensacion de control — 60 puntos los alcanzaba cualquiera
       solo por traer letra sincronizada. */

    /* La lista ordenada se guarda para poder ofrecer la SIGUIENTE. Aunque el
       filtro deje fuera lo que no tiene que ver, sigue habiendo temas con varias
       versiones legitimas — directo, remix, edicion de album — y desde fuera no
       hay forma de saber cual suena. Que el usuario pueda decir "esta no es" y
       pasar a la siguiente vale mas que cualquier heuristica nuestra. */
    this._candidatos = { id: id.id, lista: puntuados.map((p) => p.c), i: 0 };

    const mejor = puntuados[0];
    return mejor ? this._interpretar(mejor.c) : null;
  },

  /* La siguiente version de la lista, o null si se acabaron. */
  otra(id) {
    const g = this._candidatos;
    if (!g || g.id !== id.id || g.i + 1 >= g.lista.length) return null;
    g.i++;
    log(`lrclib: version ${g.i + 1} de ${g.lista.length}`);
    return this._interpretar(g.lista[g.i]);
  },

  cuantasVersiones(id) {
    const g = this._candidatos;
    return g && g.id === id.id ? { total: g.lista.length, actual: g.i + 1 } : null;
  },

  _interpretar(d) {
    if (!d) return null;
    if (d.instrumental) return { texto: '', fuente: 'lrclib', instrumental: true };
    if (d.syncedLyrics) return { texto: d.syncedLyrics, fuente: 'lrclib', instrumental: false };
    /* Texto plano: no se puede cronometrar, pero se puede mostrar. Se devuelve
       marcado para que el render lo pinte quieto y lo diga, en lugar de fingir
       una sincronizacion que no existe. */
    if (d.plainLyrics) return { texto: d.plainLyrics, fuente: 'lrclib-plano', plano: true, instrumental: false };
    return null;
  },
};

/* ===== 55-musixmatch.js ================================================== */
/* --- Proveedor: Musixmatch richsync ----------------------- COMPROBADO EN VIVO -
   La unica fuente con tiempos POR PALABRA de verdad. Es lo que usa Spotify para
   su karaoke, y frente a la interpolacion de 35-palabras.js la diferencia se nota
   en las palabras sostenidas y en los cambios de ritmo dentro de una linea, que
   es justo donde una interpolacion lineal se queda corta.

   VA APAGADO POR DEFECTO, y no por pereza:

   1. Necesita un usertoken que no es publico. Lo pone el usuario desde el menu.
   2. Es una API no oficial: esto se salta su autenticacion, o sea que va contra
      sus condiciones de uso. Con LRCLIB no hay esa duda — es abierta y esta hecha
      para esto. Aqui la decision es del usuario, informada, y por eso el
      interruptor esta a mano y en apagado.
   3. Se rompera. Cuando cambien el nombre de un campo, este proveedor devuelve
      null y LRCLIB sigue funcionando: la cadena de proveedores esta hecha para
      que la fuente fragil no arrastre a la solida.

   NECESITA GESTOR DE USERSCRIPTS O CARGADOR NATIVO. La peticion lleva una
   cabecera Cookie, y el navegador NO deja poner esa cabecera desde fetch — la
   gestiona el. Con GM_xmlhttpRequest si se puede, porque la hace el gestor desde
   fuera de la pagina. Asi que sin gestor este proveedor se declara no disponible
   en lugar de fallar en cada cancion.

   Formas comprobadas de la respuesta:
     macro.subtitles.get  -> message.body.macro_calls
                             ["matcher.track.get"].message.body.track
                                 .commontrack_id / .track_id
                             ["track.subtitles.get"].message.body
                                 .subtitle_list[0].subtitle.subtitle_body
     track.richsync.get   -> message.body.richsync.richsync_body, que es una CADENA
                             con JSON dentro: [ { ts, te, l:[ {c, o} ], x } ]
                             ts/te   inicio y fin de la linea, en segundos
                             l       las palabras
                             c       el texto de la palabra
                             o       su desplazamiento */

const MXM = 'https://apic-desktop.musixmatch.com/ws/1.1';
const MXM_APP = 'web-desktop-app-v1.0';

/* [mm:ss.xx], que es lo que espera nuestro parser de LRC. */
const marcaLrc = (t) => {
  const seg = Math.max(0, t);
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

/* EL DESPLAZAMIENTO DE CADA PALABRA PUEDE VENIR DE DOS FORMAS -------- MEDIDO -
   En el formato de Musixmatch, `o` es el desplazamiento de la palabra dentro de
   su linea, o sea relativo a `ts`. Pero hay implementaciones por ahi que lo
   tratan como absoluto, y no seria la primera vez que una API no oficial devuelve
   una cosa u otra segun la pista. Equivocarse aqui no da error: da una letra
   cronometrada contra el minuto equivocado.

   Asi que en lugar de elegir de antemano, se prueban las dos y se queda la que
   deja las palabras DENTRO de su propia linea. Si ninguna encaja, se cae a
   relativo, que es lo documentado. */
const interpretarPalabras = (entrada) => {
  const ts = Number(entrada.ts) || 0;
  const te = Number(entrada.te) || ts;
  const palabras = Array.isArray(entrada.l) ? entrada.l : [];
  if (!palabras.length) return null;

  const cabe = (inicios) => inicios.every((v) => v >= ts - 0.05 && v <= te + 0.05) &&
                            inicios.every((v, i) => i === 0 || v >= inicios[i - 1] - 0.001);

  const relativos = palabras.map((p) => ts + (Number(p.o) || 0));
  const absolutos = palabras.map((p) => Number(p.o) || 0);

  const inicios = cabe(relativos) ? relativos : cabe(absolutos) ? absolutos : relativos;
  return palabras.map((p, i) => ({ texto: String(p.c || ''), inicio: inicios[i] }));
};

/* Richsync a LRC mejorado. Convertir a un formato que el motor ya sabe leer, en
   lugar de meter una segunda representacion por todo el codigo: la cache sigue
   guardando texto, el parser ya marca la linea de tiempo como porPalabra y no hay
   una ruta paralela que mantener. */
const richsyncALrc = (entradas) => {
  const lineas = [];
  for (const e of entradas) {
    const palabras = interpretarPalabras(e);
    if (!palabras) continue;
    let linea = `[${marcaLrc(Number(e.ts) || 0)}]`;
    for (const p of palabras) {
      /* Las palabras de Musixmatch ya traen su espacio delante o detras cuando
         toca, asi que se pegan tal cual y no se anade separador: anadirlo parte
         las contracciones y las palabras con apostrofo. */
      linea += `<${marcaLrc(p.inicio)}>${p.texto}`;
    }
    lineas.push(linea);
  }
  return lineas.length ? lineas.join('\n') : null;
};

/* El subtitulo normal, por linea, para cuando la cancion no tiene richsync. Viene
   en JSON con el tiempo desglosado en minutos, segundos y centesimas. */
const subtituloALrc = (cadena) => {
  let lista;
  try { lista = JSON.parse(cadena); } catch { return null; }
  if (!Array.isArray(lista) || !lista.length) return null;
  const lineas = [];
  for (const l of lista) {
    const t = l.time || {};
    const total = Number.isFinite(t.total) ? t.total
      : (Number(t.minutes) || 0) * 60 + (Number(t.seconds) || 0) + (Number(t.hundredths) || 0) / 100;
    lineas.push(`[${marcaLrc(total)}]${String(l.text || '')}`);
  }
  return lineas.join('\n');
};

const ProveedorMusixmatch = {
  nombre: 'musixmatch',

  disponible() {
    if (!Ajustes.get('usarMusixmatch')) return false;
    if (!Ajustes.get('tokenMusixmatch')) { log('musixmatch encendido pero sin token'); return false; }
    /* Sin gestor no se puede poner la cabecera Cookie, y sin ella la API
       responde 401 a todo. Mejor declararse no disponible que fallar 200 veces. */
    const via = Red.via();
    if (via !== 'gm' && via !== 'puente') {
      log('musixmatch necesita gestor de userscripts o cargador nativo: la cabecera Cookie no se puede poner desde fetch');
      return false;
    }
    return true;
  },

  async buscar(id) {
    const token = Ajustes.get('tokenMusixmatch');
    const comun = {
      format: 'json',
      namespace: 'lyrics_richsynched',
      subtitle_format: 'mxm',
      app_id: MXM_APP,
      usertoken: token,
    };

    const macro = await Red.json(`${MXM}/macro.subtitles.get?${parametros({
      ...comun,
      q_track: id.titulo,
      q_artist: id.artista,
      q_artists: id.artista,
      q_album: id.album,
      q_duration: id.duracion ? Math.round(id.duracion) : '',
      f_subtitle_length: id.duracion ? Math.round(id.duracion) : '',
    })}`, { cabeceras: { Cookie: 'x-mxm-token-guid=' } });

    if (!macro.ok) { log('musixmatch macro:', macro.error); return null; }

    const llamadas = this._ruta(macro.datos, ['message', 'body', 'macro_calls']);
    if (!llamadas) { log('musixmatch: la respuesta no trae macro_calls; cambio el formato'); return null; }

    const pista = this._ruta(llamadas, ['matcher.track.get', 'message', 'body', 'track']) || {};
    const idComun = pista.commontrack_id;

    // 1. Richsync, que es la razon de tener este proveedor.
    if (idComun) {
      const rico = await Red.json(`${MXM}/track.richsync.get?${parametros({
        ...comun,
        commontrack_id: idComun,
        q_duration: id.duracion ? Math.round(id.duracion) : '',
        f_subtitle_length: id.duracion ? Math.round(id.duracion) : '',
      })}`, { cabeceras: { Cookie: 'x-mxm-token-guid=' } });

      const cuerpo = rico.ok && this._ruta(rico.datos, ['message', 'body', 'richsync', 'richsync_body']);
      if (cuerpo) {
        let entradas = null;
        try { entradas = JSON.parse(cuerpo); } catch { warn('musixmatch: richsync_body no era JSON'); }
        if (Array.isArray(entradas) && entradas.length) {
          const lrc = richsyncALrc(entradas);
          if (lrc) {
            log(`musixmatch: richsync con ${entradas.length} lineas, tiempos por palabra REALES`);
            return { texto: lrc, fuente: 'musixmatch', porPalabra: true };
          }
        }
      }
    }

    // 2. Sin richsync, el subtitulo por linea. Sigue siendo util: sus tiempos son
    //    buenos y la interpolacion se encarga de las palabras.
    const sub = this._ruta(llamadas, ['track.subtitles.get', 'message', 'body', 'subtitle_list', 0, 'subtitle', 'subtitle_body']);
    if (sub) {
      const lrc = subtituloALrc(sub);
      if (lrc) { log('musixmatch: subtitulo por linea'); return { texto: lrc, fuente: 'musixmatch', porPalabra: false }; }
    }

    return null;
  },

  /* Camino a prueba de nulos. La respuesta viene anidada seis niveles y con
     claves que llevan puntos en el nombre, asi que un acceso directo es una
     excepcion esperando a que Musixmatch cambie una capa. */
  _ruta(obj, camino) {
    let n = obj;
    for (const k of camino) {
      if (n === null || n === undefined) return null;
      n = n[k];
    }
    return n === undefined ? null : n;
  },
};

/* ===== 57-subtitulos.js ================================================== */
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

/* ===== 60-proveedores.js ================================================= */
/* --- Quien pide la letra y en que orden -----------------------------------
   Una sola pieza por encima de los proveedores, para que el render no sepa nunca
   de donde salio la letra ni tenga que enterarse de que hay cache.

   EL ESTADO ES EXPLICITO Y TIENE SEIS VALORES, no dos. Un booleano "hay letra o
   no" es lo que produce esas interfaces en las que no se distingue si esta
   cargando, si no hay letra, o si el mod se ha roto. Aqui:

     vacio        no suena nada
     buscando     hay peticion en marcha
     lista        letra sincronizada, corre
     plano        hay texto pero SIN tiempos: se muestra quieto y se dice
     instrumental el proveedor dice que no tiene letra porque no la tiene
     sin-letra    nadie la tiene

   La diferencia entre `plano`, `instrumental` y `sin-letra` es justo la que hace
   que el usuario sepa si merece la pena buscarla a mano o si esta perdiendo el
   tiempo.

   EL DESFASE NO SE APLICA A LA LINEA DE TIEMPO. Se resta del reloj en el
   momento de pintar. Asi ajustarlo es instantaneo y no obliga a recomponer nada:
   con 80 lineas y sus palabras, recomponer en cada pulsacion de tecla se notaria
   justo mientras el usuario intenta afinar. */

/* El orden es el que importa: Musixmatch primero PORQUE trae tiempos por palabra
   reales, y eso le gana a la mejor interpolacion posible. Pero es la fuente
   fragil, asi que va delante justamente para que cuando falle — y va a fallar —
   LRCLIB conteste detras sin que el usuario note nada. Si estuviera detras, una
   cancion con letra en LRCLIB nunca llegaria a pedir la version buena.

   Y los subtitulos de YouTube al final, aun teniendo la mejor sincronizacion de
   las tres — es la unica fuente cronometrada contra la pista que suena de
   verdad. Van ultimos por el TEXTO: salen de reconocer voz cantada y se
   equivocan. Una letra humana algo desfasada, que el usuario cuadra con
   Alt+izquierda una sola vez y se le guarda, vale mas que una transcripcion
   clavada que dice otra cosa. */
const PROVEEDORES = () => [ProveedorMusixmatch, ProveedorLrclib, ProveedorSubtitulos];

const Letra = {
  _gen: 0,
  _estado: { clave: 'vacio', lineaDeTiempo: null, fuente: null, mensaje: '', id: null },
  _oyentes: new Set(),

  _oyentesDesfase: new Set(),

  estado() { return this._estado; },

  alCambiar(f) { this._oyentes.add(f); return () => this._oyentes.delete(f); },

  /* El desfase tiene su propia senal, aparte del cambio de estado. Si avisara por
     alCambiar, cada pulsacion de ajuste reconstruiria el DOM de las 80 lineas
     — carisimo, y encima justo mientras el usuario esta afinando a base de
     pulsaciones seguidas. Los oyentes de desfase solo tienen que repintar el
     indicador y volver a colocar la vista. */
  alDesfase(f) { this._oyentesDesfase.add(f); return () => this._oyentesDesfase.delete(f); },

  _avisarDesfase() {
    for (const f of this._oyentesDesfase) { try { f(this.desfase()); } catch (e) { warn(e); } }
  },

  _poner(parcial) {
    this._estado = { ...this._estado, ...parcial };
    for (const f of this._oyentes) { try { f(this._estado); } catch (e) { warn(e); } }
  },

  /* Segundos que hay que restarle al reloj. Suma el ajuste global y el de esta
     cancion en concreto. Positivo = la letra sale mas tarde. */
  desfase() {
    const id = this._estado.id;
    return (Ajustes.get('desfase') || 0) + (id ? Desfases.de(id) : 0);
  },

  ajustarDesfase(delta) {
    const id = this._estado.id;
    if (!id) return 0;
    const nuevo = Math.round((Desfases.de(id) + delta) * 1000) / 1000;
    Desfases.poner(id, nuevo);
    this._avisarDesfase();
    return nuevo;
  },

  reiniciarDesfase() {
    const id = this._estado.id;
    if (id) Desfases.poner(id, 0);
    this._avisarDesfase();
    return 0;
  },

  /* Se llama en cada cambio de tema. La generacion evita la carrera clasica:
     el usuario pasa tres canciones seguidas, las tres peticiones vuelven en
     cualquier orden y la primera en volver pinta la letra de la cancion
     equivocada. Cada busqueda comprueba que sigue siendo la vigente antes de
     escribir el estado. */
  async cargar(id, { ignorarCache = false } = {}) {
    const gen = ++this._gen;
    const vigente = () => gen === this._gen;

    if (!id) { this._poner({ clave: 'vacio', lineaDeTiempo: null, fuente: null, mensaje: '', id: null }); return; }

    this._poner({ clave: 'buscando', lineaDeTiempo: null, fuente: null, mensaje: '', id: id.id });

    if (!ignorarCache) {
      const guardada = Cache.obtener(id.id);
      if (guardada) {
        log('cache:', id.id, guardada.fuente || '(vacio)');
        this._aplicar(guardada, id, true);
        return;
      }
    }

    /* La duracion llega un poco despues que el titulo, y es el desempate bueno
       de la busqueda. Merece la pena esperarla un momento: pedir sin ella
       significa elegir version a ciegas. */
    if (!id.duracion) {
      for (let i = 0; i < 10 && !Reloj.duracion(); i++) await dormir(200);
      if (!vigente()) return;
      id = { ...id, duracion: Reloj.duracion() };
    }

    /* Se anota antes de preguntar para saber, al final, si algun proveedor se
       quedo sin poder hablar con su servidor. */
    const fallosAntes = Red.fallosDeTransporte;

    /* EL TEXTO SIN CRONOMETRAR NO CORTA LA CADENA ---------------------------
       Una entrada de solo texto plano contaba como respuesta y paraba la
       busqueda ahi mismo. O sea que un tema con letra sin cronometrar en LRCLIB
       nunca llegaba a preguntar a la fuente siguiente — y desde que existen los
       subtitulos de YouTube eso es cambiar una letra que CORRE por una que se
       queda quieta, que es justo lo que este mod existe para evitar.

       Asi que el texto plano se guarda a un lado y la cadena sigue. Solo se usa
       si detras no aparece nada cronometrado, que es cuando de verdad es lo
       mejor que hay.

       `instrumental` SI corta, y no es una inconsistencia: ahi una persona
       afirmo que este tema no tiene letra. Seguir preguntando despues de eso
       solo puede acabar en un reconocedor de voz inventandose versos sobre una
       pista sin voz. */
    let respaldoPlano = null;

    for (const p of PROVEEDORES()) {
      if (!p.disponible()) continue;
      let res = null;
      try {
        res = await p.buscar(id);
      } catch (e) {
        warn(`proveedor ${p.nombre} se cayo:`, e && e.message);
      }
      if (!vigente()) return;
      if (!res) continue;

      if (res.plano) {
        if (!respaldoPlano) { respaldoPlano = res; log(`${p.nombre} tiene el texto pero sin cronometrar; se guarda por si no hay nada mejor`); }
        continue;
      }

      const entrada = { texto: res.texto, fuente: res.fuente, plano: false, instrumental: !!res.instrumental, porPalabra: !!res.porPalabra };
      Cache.guardar(id.id, entrada);
      this._aplicar(entrada, id, false);
      return;
    }

    if (!vigente()) return;

    if (respaldoPlano) {
      const entrada = { texto: respaldoPlano.texto, fuente: respaldoPlano.fuente, plano: true, instrumental: false, porPalabra: false };
      Cache.guardar(id.id, entrada);
      this._aplicar(entrada, id, false);
      return;
    }

    /* NO SE GUARDA UN VACIO SI LO QUE FALLO FUE LA RED ------------------------
       "Nadie tiene la letra" y "no pude preguntar" acaban los dos sin letra, pero
       significan cosas opuestas, y la diferencia solo se nota dias despues: un
       vacio guardado dura tres dias, asi que un rato sin conexion — o un puente
       roto — deja marcadas como vacias todas las canciones que sonaron mientras
       tanto, y siguen saliendo vacias cuando ya todo va bien. Pasa exactamente
       eso al estrenar el cargador nativo: 18 canciones envenenadas antes de que
       la primera peticion llegara a salir. */
    const huboCorte = Red.fallosDeTransporte > fallosAntes;
    if (!huboCorte) {
      Cache.guardar(id.id, { vacio: true });
    } else {
      log('no se guarda el vacio: la red fallo, no la busqueda');
    }

    this._poner({
      clave: 'sin-letra',
      lineaDeTiempo: null,
      fuente: null,
      mensaje: huboCorte ? tr("Couldn't reach the lyrics providers (see window.__zenLetra.probarRed())", 'No se pudo preguntar a nadie: mira window.__zenLetra.probarRed()') : tr('Nobody has the lyrics for this', 'Nadie tiene la letra de esta canción'),
      id: id.id,
    });
  },

  _aplicar(entrada, id, deCache) {
    if (entrada.vacio) {
      this._poner({ clave: 'sin-letra', lineaDeTiempo: null, fuente: null, mensaje: tr('Nobody has the lyrics for this', 'Nadie tiene la letra de esta canción'), id: id.id });
      return;
    }
    if (entrada.instrumental) {
      this._poner({ clave: 'instrumental', lineaDeTiempo: null, fuente: entrada.fuente, mensaje: tr('Instrumental', 'Instrumental'), id: id.id });
      return;
    }
    if (entrada.plano) {
      this._poner({
        clave: 'plano',
        lineaDeTiempo: { fuente: entrada.fuente, porPalabra: false, lineas: entrada.texto.split(/\r?\n/).map((t) => ({ inicio: 0, fin: 0, texto: t, palabras: null, interludio: !t.trim() })), finLetra: 0 },
        fuente: entrada.fuente,
        mensaje: tr('Only unsynced lyrics available', 'Solo hay letra sin sincronizar'),
        id: id.id,
      });
      return;
    }

    const linea = componerLineaDeTiempo(parsearLrc(entrada.texto, entrada.fuente));
    if (!linea) {
      this._poner({ clave: 'sin-letra', lineaDeTiempo: null, fuente: entrada.fuente, mensaje: tr("The lyrics that came back couldn't be read", 'La letra que llegó no se pudo leer'), id: id.id });
      return;
    }

    /* Aviso de version equivocada. Si la letra se acaba mucho antes de que se
       acabe la cancion, no es un desfase: es otra edicion del tema, y el usuario
       tiene que saberlo porque ningun ajuste de desfase lo va a arreglar. */
    const dur = id.duracion || Reloj.duracion();
    let mensaje = '';
    if (dur > 30 && linea.finLetra > 0 && linea.finLetra < dur * 0.6) {
      mensaje = tr('These lyrics seem to be from another version of the song', 'La letra parece de otra versión de la canción');
      log(`la letra acaba en ${linea.finLetra.toFixed(0)}s y la cancion dura ${dur.toFixed(0)}s`);
    }

    this._poner({ clave: 'lista', lineaDeTiempo: linea, fuente: entrada.fuente, mensaje, id: id.id });
    log(`letra ${deCache ? 'de cache' : 'nueva'}: ${linea.lineas.length} lineas, ${linea.porPalabra ? 'tiempos por palabra REALES' : 'palabras interpoladas'}`);
  },

  /* "Esta no es" ------------------------------------------------------------
     Pasa a la siguiente version de la lista que ya se trajo, sin volver a
     preguntar. Es la salida para los temas con varias versiones legitimas —
     directo, remix, edicion de album — donde desde fuera no hay forma de saber
     cual suena, y tambien la red de seguridad para cuando el filtro deja pasar
     algo que no era.

     Si se acabaron las versiones, se vuelve a buscar desde cero saltandose la
     cache, que es lo unico que queda por probar. */
  otraVersion() {
    const id = Tema.actual();
    if (!id) return null;

    const otra = ProveedorLrclib.otra(id);
    if (otra) {
      const entrada = { texto: otra.texto, fuente: otra.fuente, plano: !!otra.plano, instrumental: !!otra.instrumental };
      Cache.guardar(id.id, entrada);
      this._aplicar(entrada, id, false);
      return ProveedorLrclib.cuantasVersiones(id);
    }

    Almacen.borrar(`cache:${id.id}`);
    this.cargar(id, { ignorarCache: true });
    return null;
  },

  /* Vuelve a pedirla saltandose la cache. */
  recargar() {
    const id = Tema.actual();
    if (!id) return;
    Almacen.borrar(`cache:${id.id}`);
    return this.cargar(id, { ignorarCache: true });
  },
};

/* ===== 70-estilos.js ===================================================== */
/* --- Los estilos ----------------------------------------------------------
   Una sola hoja para las cuatro vistas. Se inyecta en la pagina, no en
   userContent.css, por dos razones: el CSS de usuario no puede depender de una
   variable que cambia sesenta veces por segundo, y porque asi el mod es una sola
   pieza que se instala sola.

   EL RELLENO SE HACE CON background-clip:text Y NO CON DOS CAPAS SUPERPUESTAS.
   La alternativa clasica es pintar la palabra dos veces, una apagada y otra
   encendida recortada con clip-path. Funciona, pero duplica el texto en el arbol
   y en el arbol de accesibilidad, y con una letra de 80 lineas eso es el doble de
   nodos para nada. Con un degradado de dos paradas duras sobre el mismo nodo, el
   corte esta donde diga --f y el texto sigue siendo uno.

   EL CONTRASTE ES EL DE SIEMPRE EN ESTE REPO. La ventana es de cristal y por
   debajo puede pasar cualquier cosa, incluida una caratula clara. Texto blanco
   sobre eso no se lee, asi que las vistas grandes llevan su propio velo oscuro
   con blur, igual que la barra del reproductor, y el texto lleva sombra: sin la
   sombra, la palabra apagada al 30% desaparece del todo sobre un fondo claro. */

const CSS = `
/* TODAS LAS MEDIDAS DE TEXTO VAN EN PIXELES ------------------------- MEDIDO -
   Esta hoja estuvo escrita en rem, que es lo razonable en una pagina propia. Aqui
   no: YouTube Music pone el tamano de raiz del documento en 10px, no en los 16px
   de fabrica — es un truco viejo para que 1rem sea 10px y las cuentas salgan
   redondas. Consecuencia: TODO lo que escribimos en rem se renderizaba al 62.5%
   de lo disenado. Medido: --zl-tamano en 3rem daba 30px de texto, el pie de
   0.68rem daba 6.8px y la mini tira 10.5px.

   El sintoma es "se ve muy pequeno", que parece cuestion de gusto y no lo era. En
   pixeles, lo que decide el tamano es esta hoja y no lo que la pagina anfitriona
   haga con su raiz. */
.zen-letra-raiz {
  --zl-on: rgb(255 255 255 / 0.97);
  --zl-off: rgb(255 255 255 / 0.32);
  --zl-pasado: rgb(255 255 255 / 0.40);
  --zl-tamano: 44px;
  --zl-easing: cubic-bezier(0.22, 0.61, 0.24, 1);
  font-family: Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
  color: var(--zl-on);
  overflow: hidden;
  position: relative;
  contain: paint;
}

/* El velo. Blur mas tinte, no solo blur: difuminar una caratula clara devuelve
   un borron claro y el texto blanco sigue sin leerse. Mismo razonamiento y
   misma receta que la barra del reproductor en mods/appearance/acrylic-glass/web/50-sites.css. */
.zen-letra-velo {
  background: rgb(10 10 12 / 0.58);
  backdrop-filter: blur(34px) saturate(135%);
}

/* --- El panel TAPA, no flota ------------------------------------- MEDIDO -
   Probado con velo translucido y esta mal: por debajo del panel esta la lista de
   "A continuacion" de YouTube Music, con su titulo y sus miniaturas, y al 58% de
   tinte se leian las dos cosas a la vez. No es cuestion de subir el tinte hasta
   que tape — el panel SUSTITUYE el contenido de la pestana, asi que ese contenido
   se esconde mientras esta puesto.

   Con visibility y no con display: display:none saca el nodo del flujo y Polymer
   recalcula la pestana entera al volver, con su parpadeo. visibility lo deja donde
   esta, invisible y sin poder recibir el raton. */
ytmusic-player-page[zen-letra-panel] #tab-renderer { visibility: hidden !important; }

.zen-letra-panel {
  background: rgb(8 9 11 / 0.88);
  backdrop-filter: blur(30px) saturate(130%);
  /* Un poco mas de luz que en las vistas grandes: la tipografia del panel es
     pequena y al 32% de blanco una linea de 1.3rem no se lee. */
  --zl-off: rgb(255 255 255 / 0.40);
  --zl-pasado: rgb(255 255 255 / 0.46);
}
.zen-letra-panel .zen-letra-l { opacity: 0.42; }
.zen-letra-panel .zen-letra-l[data-e="futura"] { opacity: calc(0.42 - var(--d, 0) * 0.04); }

/* El aire de arriba y de abajo — el que permite que la primera y la ultima linea
   lleguen al punto de foco — lo pone el motor en pixeles, NO aqui en porcentaje.
   Medido: un padding en porcentaje se resuelve contra el ANCHO del contenedor
   tambien en vertical, asi que un 45% arriba y abajo en una caja de 413x726 daba
   186px en lugar de 327, y la linea activa se centraba al 25% de la altura en
   lugar de al 42%. Es de esas reglas que parecen funcionar porque el numero que
   sale es plausible.

   (Y ojo con los comentarios de aqui dentro: esto es una plantilla de JavaScript,
   asi que una comilla invertida la cierra. Lo caza node --check en el build.) */
.zen-letra-pista {
  will-change: transform;
  transition: transform 0.72s var(--zl-easing);
  padding: 0;
}
.zen-letra-raiz[data-salto="1"] .zen-letra-pista { transition: none; }

/* --- Una linea ----------------------------------------------------------- */
.zen-letra-l {
  font-size: var(--zl-tamano);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.22;
  margin: 0 0 0.62em;
  padding: 0.06em 0.1em;
  color: var(--zl-off);
  text-shadow: 0 1px 14px rgb(0 0 0 / 0.55);
  transform-origin: left center;
  transition: opacity 0.5s var(--zl-easing), filter 0.5s var(--zl-easing), transform 0.5s var(--zl-easing);
  cursor: pointer;
  opacity: 0.34;
}
.zen-letra-l:hover { opacity: 0.75; }

/* Ya cantadas: se quedan encendidas pero atras. Sin desenfoque, porque lo que
   uno mira cuando vuelve la vista es la linea de antes, no la de despues. */
.zen-letra-l[data-e="pasada"] { color: var(--zl-pasado); opacity: 0.5; }

/* La que suena. El salto de escala es pequeno a proposito: mas de esto y el
   texto se mueve tanto al cambiar de linea que cuesta leerlo. */
.zen-letra-l[data-e="activa"] {
  opacity: 1;
  transform: scale(1.028);
  filter: none;
}

/* Las de mas adelante se van desenfocando con la distancia, que es lo que hace
   que la vista caiga sola en la linea que suena. --d lo pone el motor. */
.zen-letra-l[data-e="futura"] {
  opacity: calc(0.34 - var(--d, 0) * 0.045);
  filter: blur(calc(var(--d, 0) * 0.7px));
}

.zen-letra-p {
  background-image: linear-gradient(90deg,
    var(--zl-on) 0%, var(--zl-on) var(--f, 0%),
    var(--zl-off) var(--f, 0%), var(--zl-off) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  /* El relleno de la palabra activa se anima solo dentro de la palabra: la
     transicion tapa el escalon entre frame y frame cuando el video da un valor
     de tiempo a saltos. */
  transition: none;
}
/* Cuando la linea no es la activa no hace falta degradado: pintar 80 lineas con
   background-clip cuesta, y solo una necesita el corte. */
.zen-letra-l:not([data-e="activa"]) .zen-letra-p {
  background-image: none;
  color: inherit;
}

/* --- Interludio: el latido de espera ------------------------------------- */
.zen-letra-l[data-int="1"] { display: flex; gap: 0.34em; align-items: center; cursor: default; }
.zen-letra-l[data-int="1"] i {
  width: 0.34em; height: 0.34em; border-radius: 50%;
  background: var(--zl-off);
  transform: scale(0.8);
  transition: background-color 0.25s linear, transform 0.25s var(--zl-easing);
}
.zen-letra-l[data-int="1"] i[data-on="1"] { background: var(--zl-on); transform: scale(1.22); }

/* --- Estados sin letra --------------------------------------------------- */
.zen-letra-aviso {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; gap: 8px;
  align-items: center; justify-content: center;
  text-align: center; padding: 32px;
  font-size: 15px; font-weight: 500;
  color: rgb(255 255 255 / 0.72);
  text-shadow: 0 1px 10px rgb(0 0 0 / 0.6);
}
.zen-letra-aviso b { font-size: 18px; font-weight: 700; color: rgb(255 255 255 / 0.9); }
.zen-letra-aviso small { font-size: 13px; color: rgb(255 255 255 / 0.5); max-width: 26ch; line-height: 1.4; }

.zen-letra-girando {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgb(255 255 255 / 0.22);
  border-top-color: rgb(255 255 255 / 0.85);
  animation: zen-letra-gira 0.8s linear infinite;
}
@keyframes zen-letra-gira { to { transform: rotate(360deg); } }

/* --- Pie: de donde viene la letra y el desfase --------------------------- */
.zen-letra-pie {
  position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px;
  font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
  color: rgb(255 255 255 / 0.42);
  background: linear-gradient(transparent, rgb(0 0 0 / 0.35));
  opacity: 0; transition: opacity 0.25s;
  pointer-events: none;
}
.zen-letra-raiz:hover .zen-letra-pie { opacity: 1; }
.zen-letra-pie .zen-letra-desfase { margin-left: auto; font-variant-numeric: tabular-nums; }

/* --- Degradados de borde ----------------------------------------- MEDIDO -
   El corte recto arriba y abajo delata que hay una caja. Con la mascara, las
   lineas entran y salen desvaneciendose.

   LA MASCARA VA EN LA PISTA, NO EN LA RAIZ. Estuvo en la raiz y el sintoma fue
   desconcertante: en pantalla completa, la cabecera y la barra del reproductor de
   YouTube Music se veian nitidas por encima de la letra, como si la superposicion
   no estuviera delante. Medido con elementFromPoint: SI estaba delante, en los
   tres puntos. Lo que pasaba es que mask-image no recorta solo el texto — recorta
   el elemento entero, incluido su fondo Y el resultado de su backdrop-filter. En
   la franja donde la mascara es transparente desaparecia el velo, asi que por ahi
   se veia la pagina sin filtrar ni oscurecer.

   Aplicada a la pista, el texto sigue desvaneciendose en los bordes y el velo
   tapa de arriba abajo, que es lo que hace de esto una vista y no una ventana. */
.zen-letra-raiz[data-mascara="1"] .zen-letra-pista {
  mask-image: linear-gradient(transparent, #000 12%, #000 84%, transparent);
}

/* --- Movimiento reducido -------------------------------------------------
   Quien pide menos movimiento no quiere una letra que se desliza, se escala y se
   desenfoca. Se queda el relleno de la palabra, que es la informacion, y se va
   todo lo demas. */
@media (prefers-reduced-motion: reduce) {
  .zen-letra-pista { transition: none; }
  .zen-letra-l { transition: opacity 0.2s linear; transform: none !important; filter: none !important; }
  .zen-letra-l[data-e="futura"] { opacity: 0.36; }
}
`;

LV.hojas.push(CSS);

/* La pista de salida de la vista de pantalla completa. Vive aqui y no en su
   parcial porque es de las cuatro cosas que comparten todas las vistas. */
LV.hojas.push(`
.zen-letra-salida {
  position: absolute; top: 20px; right: 22px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: rgb(255 255 255 / 0.34);
  pointer-events: none;
}
`);

const meterEstilos = () => {
  const id = `${LV.marca}-estilos`;
  if (document.getElementById(id)) return;
  const s = crear('style', null, { id, textContent: LV.hojas.join('\n') });
  (document.head || document.documentElement).appendChild(s);
};

/* ===== 75-render.js ====================================================== */
/* --- El motor de pintado --------------------------------------------------
   Una Escena es una caja con la letra dentro. Hay cuatro vistas y todas usan la
   misma Escena con distinto tamano y sitio; la mini tira es la excepcion y va
   aparte, porque no es una lista con scroll sino dos lineas.

   TRES DECISIONES DE RENDIMIENTO, porque esto corre en cada frame mientras suena
   musica y tiene que costar practicamente nada:

   1. EL DESPLAZAMIENTO SE MUEVE AL CAMBIAR DE LINEA, NO EN CADA FRAME. La
      tentacion es recalcular el translate continuamente para que la letra suba
      suave. Es al reves: si se escribe transform en cada frame, el navegador no
      puede interpolar nada y el movimiento sale peor, ademas de costar un
      recalculo de estilo por frame. Se escribe una vez por linea y lo interpola
      la transicion CSS con su easing.

   2. SOLO SE TOCAN LAS PALABRAS DE LA LINEA ACTIVA. Las demas no tienen
      degradado (lo apaga el CSS), asi que escribirles --f no haria nada visible y
      si costaria. Y dentro de la activa solo se escribe la palabra cuyo relleno
      ha cambiado.

   3. EL BUCLE SE PARA. Sin nada que pintar — en pausa, sin letra, sin vista
      abierta — no hay rAF pedido. Un bucle vacio a 60fps en un reproductor de
      musica que se deja abierto horas es bateria regalada. */

const FOCO = 0.42;   // a que altura de la caja se centra la linea que suena

class Escena {
  constructor(nombre, opciones = {}) {
    this.nombre = nombre;
    this.opciones = opciones;
    this.raiz = null;
    this.pista = null;
    this.nodos = [];
    this.lineaDeTiempo = null;
    this.iActiva = -1;
    this.iPalabra = -1;
    this.visible = false;
  }

  construir() {
    if (this.raiz) return this.raiz;

    this.raiz = crear('div', `${c('raiz')} ${this.opciones.clase || ''}`.trim());
    this.raiz.dataset.vista = this.nombre;
    if (this.opciones.velo) this.raiz.classList.add(c('velo'));
    if (this.opciones.mascara !== false) this.raiz.dataset.mascara = '1';
    this.aplicarTamano();

    this.pista = crear('div', c('pista'));
    this.raiz.appendChild(this.pista);

    this.pie = crear('div', c('pie'));
    this.raiz.appendChild(this.pie);

    /* Pulsar una linea salta a ella. Es la funcion que uno espera de una letra
       sincronizada en cuanto la ve correr, y sale gratis: ya sabemos el tiempo de
       cada linea. Se delega en la pista y no se pone un oyente por linea. */
    this.pista.addEventListener('click', (e) => {
      const l = e.target.closest(`.${c('l')}`);
      if (!l || l.dataset.int === '1') return;
      const i = Number(l.dataset.i);
      const linea = this.lineaDeTiempo && this.lineaDeTiempo.lineas[i];
      if (!linea) return;
      /* Se le suma el desfase porque el tiempo de la linea esta en tiempo de
         letra y el reloj del video esta en tiempo de audio. Sin esto, en una
         cancion con desfase ajustado, pulsar una linea salta al sitio de al lado. */
      Reloj.buscar(linea.inicio + Letra.desfase() - 0.15);
      Motor.despertar();
    });

    /* Si cambia el tamano de la caja, el centrado calculado ya no vale. Pasa al
       abrir y cerrar la barra lateral de YTM y al cambiar de vista. */
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => { this._ajustarAire(); this.iActiva = -1; Motor.despertar(); }).observe(this.raiz);
    }

    return this.raiz;
  }

  /* EL TAMANO ES UN FACTOR, NO UN NUMERO POR VISTA -------------------- MEDIDO -
     Antes cada vista traia su tamano fijo en rem y el ajuste del menu los pisaba
     todos con el mismo valor: subir la letra del escenario ponia el panel, que es
     una columna estrecha, a la misma medida que una vista a pantalla completa.

     Ahora la vista declara su PROPORCION respecto al tamano que elige el usuario
     — el escenario es la referencia, el panel la mitad, la pantalla completa un
     tercio mas — y el ajuste mueve las cuatro a la vez sin descuadrar ninguna. */
  aplicarTamano() {
    if (!this.raiz) return;
    const factor = this.opciones.factor || 1;
    const base = Ajustes.get('tamano') || 44;
    this.raiz.style.setProperty('--zl-tamano', `${Math.round(base * factor)}px`);
  }

  /* El aire de arriba y de abajo va en pixeles y calculado desde el alto real,
     por lo dicho en 70-estilos.js: en porcentaje se resolveria contra el ancho.
     Arriba, lo que hace falta para que la primera linea pueda subir hasta el punto
     de foco; abajo, lo que sobra para que la ultima tambien llegue en lugar de
     quedarse a media caja. */
  _ajustarAire() {
    if (!this.pista || !this.raiz) return;
    const alto = this.raiz.clientHeight;
    if (!alto) return;
    this.pista.style.paddingTop = `${Math.round(alto * FOCO)}px`;
    this.pista.style.paddingBottom = `${Math.round(alto * (1 - FOCO))}px`;
  }

  /* Rehace el contenido. Se llama al cambiar de cancion o de estado, nunca en un
     frame. */
  poner(estado) {
    this.construir();
    this.lineaDeTiempo = estado.clave === 'lista' || estado.clave === 'plano' ? estado.lineaDeTiempo : null;
    this.iActiva = -1;
    this.iPalabra = -1;
    this.pista.textContent = '';
    this.nodos = [];
    const avisoViejo = this.raiz.querySelector(`.${c('aviso')}`);
    if (avisoViejo) avisoViejo.remove();

    if (!this.lineaDeTiempo) { this._pintarAviso(estado); this._pintarPie(estado); return; }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.lineaDeTiempo.lineas.length; i++) {
      const linea = this.lineaDeTiempo.lineas[i];
      const nodo = crear('div', c('l'));
      nodo.dataset.i = String(i);

      if (linea.interludio) {
        nodo.dataset.int = '1';
        for (let k = 0; k < 3; k++) nodo.appendChild(crear('i'));
      } else if (linea.palabras && Ajustes.get('porPalabra') !== false && estado.clave === 'lista') {
        for (let k = 0; k < linea.palabras.length; k++) {
          const p = crear('span', c('p'), { textContent: linea.palabras[k].texto });
          nodo.appendChild(p);
          if (k < linea.palabras.length - 1) nodo.appendChild(document.createTextNode(' '));
        }
      } else {
        nodo.textContent = linea.texto;
      }

      frag.appendChild(nodo);
      this.nodos.push(nodo);
    }
    this.pista.appendChild(frag);

    /* La letra plana no corre: se deja legible y quieta, y el pie explica por
       que. Fingir un desplazamiento sobre tiempos que no existen es peor que no
       tenerlos. */
    if (estado.clave === 'plano') {
      this.pista.style.transform = 'translateY(0)';
      this.pista.style.transition = 'none';
      this.raiz.style.overflowY = 'auto';
      for (const n of this.nodos) { n.dataset.e = 'pasada'; n.style.cursor = 'default'; }
    } else {
      this.pista.style.transition = '';
      this.raiz.style.overflowY = 'hidden';
    }

    this._ajustarAire();
    this._pintarPie(estado);
    Motor.despertar();
  }

  _pintarAviso(estado) {
    const aviso = crear('div', c('aviso'));
    if (estado.clave === 'buscando') {
      aviso.appendChild(crear('div', c('girando')));
      aviso.appendChild(crear('div', null, { textContent: tr('Looking for the lyrics', 'Buscando la letra') }));
    } else if (estado.clave === 'instrumental') {
      aviso.appendChild(crear('b', null, { textContent: tr('Instrumental', 'Instrumental') }));
      aviso.appendChild(crear('small', null, { textContent: tr('The database says this song has no lyrics', 'La base de datos dice que esta canción no tiene letra') }));
    } else if (estado.clave === 'sin-letra') {
      aviso.appendChild(crear('b', null, { textContent: tr('No lyrics', 'Sin letra') }));
      aviso.appendChild(crear('small', null, { textContent: tr("Nobody has synced lyrics for this song. If the title has extras, switching to another version of the song sometimes helps.", 'Nadie tiene la letra sincronizada de esta canción. Si el título trae adornos, a veces aparece cambiando de versión de la canción.') }));
    } else {
      aviso.appendChild(crear('small', null, { textContent: tr('Play something and the lyrics show up here', 'Pon algo y la letra sale aquí') }));
    }
    this.raiz.appendChild(aviso);
  }

  _pintarPie(estado) {
    if (!this.pie) return;
    this.pie.textContent = '';
    if (estado.clave === 'vacio' || estado.clave === 'buscando') return;

    /* Que ponga AUTOMATICOS cuando lo son no es un detalle: ese texto sale de
       reconocer voz cantada y se equivoca. Diciendolo, una palabra rara se lee
       como lo que es; callandolo, parece que el mod trae la letra mal. */
    const de = {
      lrclib: 'LRCLIB',
      'lrclib-plano': 'LRCLIB, sin cronometrar',
      musixmatch: 'Musixmatch, palabra a palabra',
      youtube: 'Subtitulos de YouTube',
      'youtube-auto': 'Subtitulos automaticos de YouTube',
    };
    const fuente = de[estado.fuente] || estado.fuente || '';
    if (fuente) this.pie.appendChild(crear('span', null, { textContent: fuente }));
    if (estado.mensaje) this.pie.appendChild(crear('span', null, { textContent: `— ${estado.mensaje}` }));

    this.desfaseNodo = crear('span', c('desfase'));
    this.pie.appendChild(this.desfaseNodo);
    this._pintarDesfase();
  }

  _pintarDesfase() {
    if (!this.desfaseNodo) return;
    const d = Letra.desfase();
    this.desfaseNodo.textContent = Math.abs(d) < 0.001 ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}s`;
  }

  /* El frame. `t` ya viene en tiempo de letra: el desfase se resto fuera. */
  pintar(t, hubaSalto) {
    if (!this.lineaDeTiempo || !this.visible) return;
    const lineas = this.lineaDeTiempo.lineas;

    const i = limitar(lineaEn(lineas, t), 0, lineas.length - 1);

    if (i !== this.iActiva) {
      this._cambiarLinea(i, hubaSalto);
      this.iActiva = i;
      this.iPalabra = -1;
      this._pintarDesfase();
    }

    this._pintarRelleno(lineas[i], t);
  }

  _cambiarLinea(i, hubaSalto) {
    /* Con un salto de barra no se recorre el camino con easing: se aparece. Un
       easing de 0.7s recorriendo cuarenta lineas es un borron que marea. */
    this.raiz.dataset.salto = hubaSalto ? '1' : '0';

    for (let k = 0; k < this.nodos.length; k++) {
      const n = this.nodos[k];
      const e = k < i ? 'pasada' : k === i ? 'activa' : 'futura';
      if (n.dataset.e !== e) n.dataset.e = e;
      if (e === 'futura') {
        /* La distancia se topa: mas alla de seis lineas el desenfoque ya no
           aumenta nada visible y el blur es caro. */
        const d = Math.min(k - i, 6);
        n.style.setProperty('--d', String(d));
      } else if (n.style.getPropertyValue('--d')) {
        n.style.removeProperty('--d');
      }
      /* Las que quedan lejos por detras se pueden dejar de pintar del todo. Con
         una letra larga esto quita del compositor la mayoria de los nodos. */
      const lejos = Math.abs(k - i) > 14;
      if (lejos !== (n.style.contentVisibility === 'hidden')) n.style.contentVisibility = lejos ? 'hidden' : '';
    }

    const activa = this.nodos[i];
    if (!activa) return;
    const alto = this.raiz.clientHeight || 1;
    const destino = activa.offsetTop + activa.offsetHeight / 2 - alto * FOCO;
    this.pista.style.transform = `translateY(${-Math.max(0, destino).toFixed(1)}px)`;

    if (hubaSalto) {
      /* Devolver la transicion en el frame siguiente: si se devuelve ya, el
         navegador coge el cambio de transform y el de transition juntos y anima
         el salto igualmente. */
      requestAnimationFrame(() => { if (this.raiz) this.raiz.dataset.salto = '0'; });
    }
  }

  _pintarRelleno(linea, t) {
    const nodo = this.nodos[this.iActiva];
    if (!nodo) return;

    if (linea.interludio) {
      /* Los tres puntos se encienden repartiendo el hueco. Es lo que dice que la
         cancion sigue viva cuando no hay nada que cantar. */
      const total = Math.max(0.1, linea.fin - linea.inicio);
      const avance = limitar((t - linea.inicio) / total, 0, 1);
      const puntos = nodo.children;
      for (let k = 0; k < puntos.length; k++) {
        const on = avance > (k + 1) / (puntos.length + 1) ? '1' : '0';
        if (puntos[k].dataset.on !== on) puntos[k].dataset.on = on;
      }
      return;
    }

    if (!linea.palabras || Ajustes.get('porPalabra') === false) return;

    const palabras = linea.palabras;
    const spans = nodo.querySelectorAll(`.${c('p')}`);
    if (!spans.length) return;

    for (let k = 0; k < palabras.length && k < spans.length; k++) {
      const p = palabras[k];
      let f;
      if (t >= p.fin) f = 100;
      else if (t <= p.inicio) f = 0;
      else f = ((t - p.inicio) / Math.max(0.001, p.fin - p.inicio)) * 100;

      /* Solo se escribe si el valor cambio de verdad. Redondear a un entero es
         lo que hace que en la practica se escriba una sola palabra por frame en
         lugar de todas. */
      const redondo = f === 0 || f === 100 ? f : Math.round(f);
      if (spans[k]._f !== redondo) {
        spans[k].style.setProperty('--f', `${redondo}%`);
        spans[k]._f = redondo;
      }
    }
  }

  mostrar(v) {
    this.visible = v;
    if (this.raiz) this.raiz.style.display = v ? '' : 'none';
    if (v) { this.iActiva = -1; Motor.despertar(); }
  }
}

/* --- El bucle -------------------------------------------------------------- */

const Motor = {
  escenas: new Set(),
  _pedido: 0,
  _huboSalto: false,

  anadir(e) { this.escenas.add(e); return e; },
  quitar(e) { this.escenas.delete(e); },

  arrancar() {
    Letra.alCambiar((estado) => {
      for (const e of this.escenas) e.poner(estado);
      this.despertar();
    });
    /* Un cambio de desfase no rehace nada: repinta el indicador y obliga a
       recolocar la vista en el frame siguiente, poniendo la linea activa a -1
       para que se recalcule cual es y donde va. */
    Letra.alDesfase(() => {
      for (const e of this.escenas) {
        if (e._pintarDesfase) e._pintarDesfase();
        e.iActiva = -1;
      }
      this.despertar();
    });

    Reloj.alSaltar(() => { this._huboSalto = true; this.despertar(); });
    /* Al pausar hay que dar un frame mas: el ultimo relleno se queda a medias si
       se corta el bucle justo al pausar. */
    const v = Reloj.video();
    if (v) for (const ev of ['play', 'pause', 'seeked', 'ratechange']) v.addEventListener(ev, () => this.despertar());
  },

  despertar() {
    if (this._pedido) return;
    this._pedido = requestAnimationFrame(() => { this._pedido = 0; this._frame(); });
  },

  _frame() {
    const activas = [...this.escenas].filter((e) => e.visible);
    if (!activas.length) return;                  // nada abierto: no se sigue

    const t = Reloj.tiempo() - Letra.desfase();
    const salto = this._huboSalto;
    this._huboSalto = false;

    for (const e of activas) {
      try { e.pintar(t, salto); } catch (err) { warn('pintando', e.nombre, err); }
    }

    /* Se sigue solo si hay algo que se mueva. En pausa el relleno esta quieto,
       asi que no hace falta otro frame; al reanudar, el oyente de `play`
       despierta el bucle. */
    const sonando = Reloj.estado() === 'sonando';
    const conLetra = activas.some((e) => e.lineaDeTiempo);
    if (sonando && conLetra) this.despertar();
  },
};

/* ===== 80-vistas.js ====================================================== */
/* --- Las vistas -----------------------------------------------------------
   Cada vista es un sitio donde colgar una Escena. El registro existe para que
   anadir una vista sea escribir una definicion y nada mas: el motor, el estado y
   los controles no se enteran de cuantas hay.

   Una definicion tiene:
     anfitrion()  -> el elemento de YouTube Music donde va colgada
     colocar(raiz, anfitrion) -> deja la raiz donde tenga que estar
     escena       -> opciones de la Escena (tamano, velo, clase)
     exclusiva    -> si al abrirla se cierran las demas (todas menos la tira)

   POR QUE SE SUPERPONE Y NO SE SUSTITUYE. La vista escenario tapa la caratula y
   el video, que es lo que se pidio, pero el elemento de video NO se oculta: sigue
   ahi debajo, reproduciendo. Ocultarlo es la via rapida a que YouTube Music pare
   la reproduccion o deje de decodificar, y ademas es lo que hace que al cerrar la
   letra el video vuelva negro. Tapar con un velo opaco se ve igual y no toca
   nada de su maquinaria. */

const Vistas = {
  registro: new Map(),
  abiertas: new Set(),
  _observadores: new Map(),

  registrar(nombre, def) { this.registro.set(nombre, def); },

  _asegurarPosicionado(anfitrion) {
    /* Una superposicion absoluta necesita un ancestro posicionado. Si el
       anfitrion de YTM es `static`, la nuestra se colocaria respecto al primer
       ancestro que si lo este — normalmente el body — y aparece en cualquier
       sitio menos donde toca. Se comprueba y solo se toca si hace falta. */
    if (getComputedStyle(anfitrion).position === 'static') anfitrion.style.position = 'relative';
  },

  abrir(nombre) {
    const def = this.registro.get(nombre);
    if (!def) { warn('vista desconocida:', nombre); return false; }

    if (def.exclusiva !== false) for (const otra of [...this.abiertas]) {
      const d = this.registro.get(otra);
      if (d && d.exclusiva !== false) this.cerrar(otra);
    }

    const anfitrion = def.anfitrion();
    if (!anfitrion) { log('la vista', nombre, 'no tiene donde colgarse todavia'); return false; }

    if (!def._escena) {
      /* `crear` existe para las vistas que no son una lista con scroll. La mini
         tira trae el suyo; lo unico que se le exige es la misma interfaz que
         espera el Motor: construir, poner, pintar y mostrar. */
      def._escena = def.crear ? def.crear() : new Escena(nombre, def.escena || {});
      Motor.anadir(def._escena);
    }
    const raiz = def._escena.construir();

    /* Una vista fija no necesita ancestro posicionado, y tocarle la posicion al
       anfitrion cuando no hace falta es cambiar la maquetacion de YouTube Music
       para nada. */
    if (def.fijo !== true) this._asegurarPosicionado(anfitrion);
    const montar = () => def.colocar(raiz, anfitrion);
    montar();

    /* Polymer rehace sus contenedores al navegar y se lleva por delante lo que
       le hayamos metido. Sin esto, la letra desaparece sola al volver de una
       busqueda y parece que el mod se cayo. */
    if (!this._observadores.has(nombre)) this._observadores.set(nombre, vigilarMontaje(anfitrion, raiz, montar));

    if (def.alAbrir) def.alAbrir(raiz, anfitrion);
    def._escena.poner(Letra.estado());
    def._escena.mostrar(true);
    this.abiertas.add(nombre);
    Almacen.escribir('vistas-abiertas', [...this.abiertas]);
    log('vista abierta:', nombre);
    return true;
  },

  cerrar(nombre) {
    const def = this.registro.get(nombre);
    if (!def || !def._escena) return;
    def._escena.mostrar(false);
    if (def.alCerrar) def.alCerrar(def._escena.raiz);
    const obs = this._observadores.get(nombre);
    if (obs) { obs.disconnect(); this._observadores.delete(nombre); }
    if (def._escena.raiz && def._escena.raiz.isConnected) def._escena.raiz.remove();
    this.abiertas.delete(nombre);
    Almacen.escribir('vistas-abiertas', [...this.abiertas]);
  },

  alternar(nombre) {
    if (this.abiertas.has(nombre)) { this.cerrar(nombre); return false; }
    return this.abrir(nombre);
  },

  estaAbierta(nombre) { return this.abiertas.has(nombre); },

  /* Si habia una vista puesta la sesion anterior, se vuelve a poner. Que la
     letra siga donde la dejaste es la mitad de la sensacion de que esto es parte
     de la aplicacion y no un anadido.

     MENOS LA PANTALLA COMPLETA, Y ESTO SE APRENDIO A GOLPES. Restaurandola,
     abrir YouTube Music te planta una superposicion sobre TODA la ventana antes
     de haber puesto una cancion, con la barra del reproductor debajo y sin nada
     que sugiera como salir. La primera vez que paso fue en la prueba automatica,
     que no consiguio pulsar el boton porque la vista restaurada le interceptaba
     el raton — o sea que el sintoma es literalmente "la aplicacion no responde".
     Ninguna aplicacion restaura un modo inmersivo al arrancar, y por esto. */
  restaurar() {
    const guardadas = Almacen.leer('vistas-abiertas', []) || [];
    for (const n of guardadas) {
      const def = this.registro.get(n);
      if (def && def.noRestaurar) { log('no se restaura', n, 'a proposito'); continue; }
      this.abrir(n);
    }
  },
};

/* --- Vista panel ---------------------------------------------------- MEDIDO -
   En la columna de la derecha, encima del contenido de la pestana. Es la que
   menos molesta: deja la caratula o el video a la vista y la letra al lado.

   Va colgada de #side-panel y NO de la pestana de letra de YTM, por lo medido en
   10-puntos.js: esa pestana sale `disabled` cuando la app no tiene letra propia,
   o sea justo cuando este mod hace falta.

   El desplazamiento vertical sale del alto real de la fila de pestanas (48px
   medidos) en lugar de un numero escrito a mano: si un dia YTM cambia el alto de
   esa fila, esto se ajusta solo. */
Vistas.registrar('panel', {
  anfitrion: () => punto('panelLateral'),
  /* Media parte del tamano de referencia: la columna es estrecha y a tamano
     completo casi ninguna linea cabe sin partirse en dos. */
  escena: { factor: 0.5, velo: true, clase: c('panel') },
  colocar: (raiz, anfitrion) => {
    const pestanas = punto('pestanas');
    const arriba = pestanas ? pestanas.offsetHeight : 48;
    Object.assign(raiz.style, {
      position: 'absolute',
      left: '0', right: '0', bottom: '0',
      top: `${arriba}px`,
      zIndex: '3',
      borderRadius: '8px',
      padding: '0 1.2rem',
    });
    anfitrion.appendChild(raiz);
  },
  /* El atributo va en la pagina del reproductor y no en el panel lateral porque
     es donde puede engancharlo una regla de CSS que llegue a #tab-renderer sin
     depender de la jerarquia exacta de en medio. */
  alAbrir: () => { const pp = punto('paginaReproductor'); if (pp) pp.setAttribute('zen-letra-panel', ''); },
  alCerrar: () => { const pp = punto('paginaReproductor'); if (pp) pp.removeAttribute('zen-letra-panel'); },
});

/* ===== 82-escenario.js =================================================== */
/* --- Vista escenario ------------------------------------------------ MEDIDO -
   La que se pidio: ocupa el sitio donde sale la cancion y el video, con las
   lineas grandes y centradas, y deja la barra del reproductor y la navegacion
   donde estan.

   Va colgada de #main-panel (medido 781x1037 con la ventana a 1500), que es el
   contenedor de la caratula y el video dentro de la pagina del reproductor. Se
   superpone con inset 0: el elemento de video sigue debajo, reproduciendo. Eso
   no es pereza — ocultarlo es la via rapida a que YouTube Music deje de
   decodificar o pare, y encima el blur del velo, al muestrear lo que hay detras,
   convierte el propio video en el fondo difuminado de la letra. Sale gratis y es
   exactamente el fondo que usan Apple Music y Spotify. */

const CSS_ESCENARIO = `
.zen-letra-escenario {
  padding: 0 clamp(24px, 5%, 64px);
  border-radius: 10px;
}
/* El tamano que pide el usuario, con suelo y techo. El techo va en cqw — ancho
   del contenedor — para que en una ventana estrecha las lineas no se partan
   todas en dos.

   EL TOPE NO PUEDE MANDAR EN EL CASO NORMAL, que es el error que se cometio dos
   veces seguidas. Con 4.6cqw, un escenario de 679px recortaba a 26px una letra
   pedida de 44px; con 6cqw la recortaba a 36px. En los dos casos el tope decidia
   SIEMPRE, asi que el ajuste del usuario no movia nada en esta vista y el control
   parecia roto. Con 9cqw el tope solo entra por debajo de unos 490px de ancho, que
   es la ventana estrecha para la que estaba pensado; por encima manda lo que pide
   el usuario, que es lo que tiene que pasar. */
.zen-letra-escenario .zen-letra-l,
.zen-letra-completa .zen-letra-l {
  font-size: clamp(22px, 9cqw, var(--zl-tamano));
  text-wrap: balance;
}
.zen-letra-escenario, .zen-letra-completa { container-type: inline-size; }

.zen-letra-completa {
  padding: 0 clamp(32px, 12vw, 224px);
}
`;

LV.hojas.push(CSS_ESCENARIO);

Vistas.registrar('escenario', {
  anfitrion: () => punto('panelPrincipal'),
  /* La referencia: el tamano que elige el usuario es exactamente este. */
  escena: { factor: 1, velo: true, clase: c('escenario') },
  colocar: (raiz, anfitrion) => {
    Object.assign(raiz.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '4',
    });
    anfitrion.appendChild(raiz);
  },
});

/* --- Vista pantalla completa ----------------------------------------------
   Solo la letra, encima de todo. No usa la API de pantalla completa del
   navegador a proposito: en Zen eso pondria un fondo negro opaco del compositor
   y se perderia el acrilico de la ventana, que es justo lo que hace que esto se
   vea como se ve. Una superposicion fija sobre toda la ventana da lo mismo por
   fuera y conserva el cristal.

   Tapa tambien la barra del reproductor, asi que se sale con Escape — y lo dice,
   porque una pantalla de la que no se sabe salir es una trampa. */

const ESCAPE = {
  handler: null,
  poner(alSalir) {
    this.quitar();
    this.handler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); alSalir(); } };
    /* En captura: YouTube Music tiene sus propios oyentes de teclado y algunos
       paran la propagacion antes de que llegue al documento. */
    document.addEventListener('keydown', this.handler, true);
  },
  quitar() {
    if (this.handler) document.removeEventListener('keydown', this.handler, true);
    this.handler = null;
  },
};

Vistas.registrar('completa', {
  anfitrion: () => punto('app') || document.body,
  /* Un tercio mas grande que el escenario: hay toda la ventana para gastar. */
  escena: { factor: 1.35, velo: true, clase: c('completa'), mascara: true },
  colocar: (raiz, anfitrion) => {
    Object.assign(raiz.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
    });
    anfitrion.appendChild(raiz);
  },
  /* Fija respecto a la ventana: no hay que tocarle la posicion al anfitrion. */
  fijo: true,
  /* Y no se restaura al arrancar. El motivo, en Vistas.restaurar. */
  noRestaurar: true,
  alAbrir: (raiz) => {
    ESCAPE.poner(() => { Vistas.cerrar('completa'); Controles.refrescar(); });
    /* Se comprueba antes de anadirla: la raiz de la escena se reutiliza entre
       aperturas, asi que sin esto se iria acumulando una pista por cada vez que
       se abre la vista. */
    if (!raiz.querySelector(`.${c('salida')}`)) {
      raiz.appendChild(crear('div', c('salida'), { textContent: tr('Esc to exit', 'Esc para salir') }));
    }
  },
  alCerrar: () => ESCAPE.quitar(),
});

/* ===== 86-tira.js ======================================================== */
/* --- Vista mini tira ------------------------------------------------ MEDIDO -
   Dos lineas flotando sobre la barra del reproductor: la que suena y la que
   viene. Para cuando estas navegando por la aplicacion y no quieres abrir la
   letra, pero la quieres ver.

   NO ES UNA ESCENA CON DOS LINEAS. La Escena es una lista larga que se desplaza,
   y aqui no hay desplazamiento: hay dos huecos fijos donde el texto se
   reemplaza. Reutilizarla obligaria a apagarle el scroll, el aire, la mascara y
   la mitad de su comportamiento — mas trabajo que escribir las cuarenta lineas
   que hacen falta. Lo que si comparte es la interfaz que espera el Motor
   (poner, pintar, mostrar), asi que el bucle la trata igual que a las demas sin
   saber que es distinta.

   La altura sale del alto real de ytmusic-player-bar (72px medidos) y no de un
   numero escrito a mano, para que siga en su sitio si YTM cambia la barra. */

const CSS_TIRA = `
.zen-letra-tira {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  max-width: min(832px, 68vw);
  padding: 10px 22px;
  border-radius: 14px;
  background: rgb(8 9 11 / 0.72);
  backdrop-filter: blur(26px) saturate(130%);
  border: 1px solid rgb(255 255 255 / 0.08);
  font-family: Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
  text-align: center;
  /* Que no se coma los clics de lo que hay debajo. La tira es informativa; solo
     su propio contenido responde al raton. */
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.zen-letra-tira[data-hay="1"] { opacity: 1; }

.zen-letra-tira-ahora {
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  line-height: 1.3;
  color: rgb(255 255 255 / 0.34);
  text-shadow: 0 1px 10px rgb(0 0 0 / 0.6);
}
.zen-letra-tira-luego {
  font-size: 13px; font-weight: 500;
  line-height: 1.3;
  color: rgb(255 255 255 / 0.32);
  text-shadow: 0 1px 10px rgb(0 0 0 / 0.6);
}
.zen-letra-tira .zen-letra-p {
  background-image: linear-gradient(90deg,
    rgb(255 255 255 / 0.97) 0%, rgb(255 255 255 / 0.97) var(--f, 0%),
    rgb(255 255 255 / 0.34) var(--f, 0%), rgb(255 255 255 / 0.34) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
@media (prefers-reduced-motion: reduce) {
  .zen-letra-tira { transition: none; }
}
`;

LV.hojas.push(CSS_TIRA);

class Tira {
  constructor() {
    this.nombre = 'tira';
    this.raiz = null;
    this.lineaDeTiempo = null;
    this.visible = false;
    this.iActiva = -1;
  }

  construir() {
    if (this.raiz) return this.raiz;
    this.raiz = crear('div', c('tira'));
    this.raiz.dataset.vista = 'tira';
    this.ahora = crear('div', c('tira-ahora'));
    this.luego = crear('div', c('tira-luego'));
    this.raiz.appendChild(this.ahora);
    this.raiz.appendChild(this.luego);
    return this.raiz;
  }

  poner(estado) {
    this.construir();
    this.lineaDeTiempo = estado.clave === 'lista' ? estado.lineaDeTiempo : null;
    this.iActiva = -1;
    this.raiz.dataset.hay = this.lineaDeTiempo ? '1' : '0';
    if (!this.lineaDeTiempo) { this.ahora.textContent = ''; this.luego.textContent = ''; }
    this._colocar();
    Motor.despertar();
  }

  _colocar() {
    const barra = punto('barra');
    const alto = barra ? barra.offsetHeight : 72;
    this.raiz.style.bottom = `${alto + 12}px`;
  }

  pintar(t) {
    if (!this.lineaDeTiempo || !this.visible) return;
    const lineas = this.lineaDeTiempo.lineas;
    const i = limitar(lineaEn(lineas, t), 0, lineas.length - 1);

    if (i !== this.iActiva) {
      this.iActiva = i;
      this._texto(lineas, i);
      this._colocar();
    }

    /* El relleno, solo en la de arriba. La siguiente no se rellena: es un
       adelanto, no algo que este sonando. */
    const linea = lineas[i];
    if (!linea.palabras || linea.interludio || Ajustes.get('porPalabra') === false) return;
    const spans = this.ahora.querySelectorAll(`.${c('p')}`);
    for (let k = 0; k < linea.palabras.length && k < spans.length; k++) {
      const p = linea.palabras[k];
      const f = t >= p.fin ? 100 : t <= p.inicio ? 0 : Math.round(((t - p.inicio) / Math.max(0.001, p.fin - p.inicio)) * 100);
      if (spans[k]._f !== f) { spans[k].style.setProperty('--f', `${f}%`); spans[k]._f = f; }
    }
  }

  _texto(lineas, i) {
    const linea = lineas[i];
    this.ahora.textContent = '';

    if (linea.interludio) {
      /* En un interludio la tira no se queda vacia: adelanta lo que viene, que es
         mas util que tres puntos en un espacio de dos lineas. */
      this.ahora.textContent = '· · ·';
    } else if (linea.palabras && Ajustes.get('porPalabra') !== false) {
      for (let k = 0; k < linea.palabras.length; k++) {
        this.ahora.appendChild(crear('span', c('p'), { textContent: linea.palabras[k].texto }));
        if (k < linea.palabras.length - 1) this.ahora.appendChild(document.createTextNode(' '));
      }
    } else {
      this.ahora.textContent = linea.texto;
    }

    const siguiente = lineas.slice(i + 1).find((l) => !l.interludio && l.texto);
    this.luego.textContent = siguiente ? siguiente.texto : '';
  }

  mostrar(v) {
    this.visible = v;
    if (this.raiz) this.raiz.style.display = v ? '' : 'none';
    if (v) { this.iActiva = -1; this._colocar(); Motor.despertar(); }
  }
}

Vistas.registrar('tira', {
  /* Al body y no a ytmusic-app: la tira es fija respecto a la ventana y no
     necesita nada de la jerarquia de la aplicacion, asi que cuanto mas arriba
     cuelgue, menos posibilidades hay de que Polymer se la lleve. */
  anfitrion: () => document.body,
  /* No exclusiva: la tira acompana a cualquier otra vista, o va sola mientras
     navegas. Es la unica que convive. */
  exclusiva: false,
  fijo: true,
  crear: () => new Tira(),
  colocar: (raiz, anfitrion) => { anfitrion.appendChild(raiz); },
});

/* ===== 90-controles.js =================================================== */
/* --- El boton de la barra ------------------------------------------- MEDIDO -
   Sin una forma de abrir la letra, todo lo anterior no existe. El boton va en
   #right-controls de ytmusic-player-bar, a la izquierda de #expanding-menu, que
   es donde YTM pone sus propios botones de la derecha (medido: ahi viven el
   deslizador de volumen, el menu expansible y dos yt-icon-button).

   Se pinta un <button> nuestro y no un yt-icon-button: sus elementos son de
   Polymer y crearlos a mano desde fuera obliga a que la clase este registrada y
   a rellenar propiedades internas. Un boton normal con el mismo tamano y la misma
   opacidad se ve identico y no depende de nada suyo. */

const CSS_CONTROLES_HOJA = `
.zen-letra-boton {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; padding: 0; margin: 0 2px;
  background: none; border: 0; border-radius: 50%;
  color: inherit; cursor: pointer;
  opacity: 0.68; transition: opacity 0.15s, background-color 0.15s;
  flex: 0 0 auto;
}
.zen-letra-boton:hover { opacity: 1; background: rgb(255 255 255 / 0.1); }
.zen-letra-boton[data-on="1"] { opacity: 1; }
.zen-letra-boton[data-on="1"]::after {
  content: ''; position: absolute; bottom: 5px;
  width: 4px; height: 4px; border-radius: 50%; background: currentColor;
}
.zen-letra-boton { position: relative; }
.zen-letra-boton svg { width: 22px; height: 22px; fill: currentColor; }

/* --- El aviso ------------------------------------------------------------
   Un ajuste de desfase que no dice en cuanto se quedo es inservible: uno pulsa
   a ciegas hasta que cuadra y no puede volver atras. El aviso flota sobre la
   barra y se va solo. */
.zen-letra-aviso-flotante {
  position: fixed;
  left: 50%;
  transform: translateX(-50%) translateY(6px) scale(0.98);
  z-index: 10000;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgb(30 30 32 / 0.9);
  backdrop-filter: blur(30px) saturate(1.8);
  border: 1px solid rgb(255 255 255 / 0.1);
  box-shadow: 0 12px 30px rgb(0 0 0 / 0.35);
  font: 500 14px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: rgb(255 255 255 / 0.95);
  -webkit-font-smoothing: antialiased;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.zen-letra-aviso-flotante[data-ver="1"] { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }

/* --- El menu -------------------------------------------------------------
   Un userscript no sale en Ajustes > Zen Mods, asi que sus opciones tienen que
   vivir en algun sitio de la propia pagina o no existen.

   ESTILO DE LOS MODS (16-11-2026): el de la app del movil de Zen Remoto, con
   aire de iOS. Lamina oscura esmerilada con esquinas de 18px, secciones como
   grupos redondeados con separadores finos, interruptores de iOS con el acento
   rosa de los mods, y la letra del sistema (SF en Mac, Segoe UI en Windows). */
.zen-letra-menu {
  position: fixed;
  z-index: 10001;
  width: 330px;
  padding: 8px 10px 10px;
  border-radius: 18px;
  background: rgb(30 30 32 / 0.92);
  backdrop-filter: blur(30px) saturate(1.8);
  border: 1px solid rgb(255 255 255 / 0.1);
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.5);
  font: 400 14px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: rgb(255 255 255 / 0.92);
  -webkit-font-smoothing: antialiased;
  /* Con quince opciones el menu no cabe en todas las ventanas: abrir() le pone
     un max-height y esto lo vuelve desplazable en vez de dejarlo salirse. */
  overflow-y: auto;
  overscroll-behavior: contain;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 0.25) transparent;
}
.zen-letra-menu h4 {
  margin: 14px 12px 6px;
  font-size: 12px; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;
  color: rgb(235 235 245 / 0.55);
}
.zen-letra-menu h4:first-child { margin-top: 6px; }
.zen-letra-menu .zen-letra-grupo { border-radius: 12px; background: rgb(255 255 255 / 0.06); overflow: hidden; }
.zen-letra-menu button {
  position: relative;
  display: flex; align-items: center; gap: 10px;
  width: 100%; min-height: 40px; padding: 8px 12px;
  background: none; border: 0; border-radius: 0;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.zen-letra-menu button + button::before {
  content: ''; position: absolute; top: 0; left: 12px; right: 0; height: 1px;
  background: rgb(255 255 255 / 0.08);
}
.zen-letra-menu button:hover { background: rgb(255 255 255 / 0.06); }
.zen-letra-menu button:active { background: rgb(255 255 255 / 0.1); }
.zen-letra-menu .zen-letra-texto { flex: 1; min-width: 0; }
.zen-letra-menu .zen-letra-tecla { flex: none; font-size: 12px; color: rgb(235 235 245 / 0.45); font-variant-numeric: tabular-nums; }
.zen-letra-interruptor {
  flex: none; position: relative; width: 42px; height: 26px; border-radius: 13px;
  background: rgb(120 120 128 / 0.36); transition: background-color 0.2s ease;
}
.zen-letra-interruptor::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 4px rgb(0 0 0 / 0.3);
  transition: transform 0.22s cubic-bezier(0.3, 0.7, 0.4, 1);
}
.zen-letra-menu button[data-on="1"] .zen-letra-interruptor { background: #ff5c7a; }
.zen-letra-menu button[data-on="1"] .zen-letra-interruptor::after { transform: translateX(16px); }
@media (prefers-reduced-motion: reduce) {
  .zen-letra-interruptor, .zen-letra-interruptor::after, .zen-letra-aviso-flotante { transition: none; }
}
`;

LV.hojas.push(CSS_CONTROLES_HOJA);

/* --- Avisos --------------------------------------------------------------- */

const Aviso = {
  nodo: null,
  reloj: 0,

  decir(texto) {
    if (!this.nodo) {
      this.nodo = crear('div', c('aviso-flotante'));
      document.body.appendChild(this.nodo);
    }
    const barra = punto('barra');
    this.nodo.style.bottom = `${(barra ? barra.offsetHeight : 72) + 66}px`;
    this.nodo.textContent = texto;
    this.nodo.dataset.ver = '1';
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => { if (this.nodo) this.nodo.dataset.ver = '0'; }, 1600);
  },
};

/* --- Teclado --------------------------------------------------------- MEDIDO -
   TODOS LOS ATAJOS LLEVAN ALT. YouTube Music ya usa las teclas sueltas: espacio
   para pausar, flechas para moverse por la cancion y el volumen, j/k/l para
   saltar, y las cifras para ir al porcentaje de la pista. Coger una tecla suelta
   es quitarle una funcion a la aplicacion, y encima una que el usuario ya tiene
   en los dedos. Con Alt no hay nada que pisar.

   Y no se hace nada si el foco esta escribiendo: con el buscador abierto, una
   letra no puede significar dos cosas. */

const escribiendo = () => {
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || a.isContentEditable ||
         (a.getAttribute && a.getAttribute('role') === 'textbox');
};

const PASO_DESFASE = 0.1;

/* SE MIRA e.code Y NO e.key ----------------------------------------- MEDIDO -
   Con Alt pulsado, `key` no trae la letra: trae el caracter que produce esa
   combinacion en la distribucion del teclado, que en varias es un simbolo o una
   tecla muerta. Medido en la prueba automatica: Alt+M no disparaba nada porque
   `key` no valia 'm'. `code` es la posicion fisica de la tecla, no cambia con la
   distribucion ni con los modificadores, y es lo que hay que usar en un atajo. */
const ATAJOS = [
  { codigo: 'KeyL', tecla: 'Alt+L', nombre: tr('Open or close the lyrics', 'Abrir o cerrar la letra'), hacer: () => { Vistas.alternar(Ajustes.get('vistaPorDefecto') || 'escenario'); Controles.refrescar(); } },
  { codigo: 'KeyP', tecla: 'Alt+P', nombre: tr('Side panel', 'Panel al lado'), hacer: () => { Vistas.alternar('panel'); Controles.refrescar(); } },
  { codigo: 'KeyE', tecla: 'Alt+E', nombre: tr('Stage', 'Escenario'), hacer: () => { Vistas.alternar('escenario'); Controles.refrescar(); } },
  { codigo: 'KeyF', tecla: 'Alt+F', nombre: tr('Full screen', 'Pantalla completa'), hacer: () => { Vistas.alternar('completa'); Controles.refrescar(); } },
  { codigo: 'KeyM', tecla: 'Alt+M', nombre: tr('Mini strip', 'Mini tira'), hacer: () => { Vistas.alternar('tira'); Controles.refrescar(); } },
  { codigo: 'ArrowLeft', tecla: 'Alt+←', nombre: tr('Lyrics earlier', 'La letra, antes'), hacer: () => Aviso.decir(explicarDesfase(Letra.ajustarDesfase(-PASO_DESFASE))) },
  { codigo: 'ArrowRight', tecla: 'Alt+→', nombre: tr('Lyrics later', 'La letra, después'), hacer: () => Aviso.decir(explicarDesfase(Letra.ajustarDesfase(PASO_DESFASE))) },
  { codigo: 'Digit0', tecla: 'Alt+0', nombre: tr('Reset the offset', 'Quitar el ajuste'), hacer: () => { Letra.reiniciarDesfase(); Aviso.decir(tr('Offset reset', 'Desfase a cero')); } },
  {
    codigo: 'KeyR',
    tecla: 'Alt+R',
    nombre: tr('Wrong lyrics: try another version', 'No es esta: prueba otra versión'),
    hacer: () => {
      const r = Letra.otraVersion();
      Aviso.decir(r ? tr(`Version ${r.actual} of ${r.total}`, `Versión ${r.actual} de ${r.total}`) : tr('Looking for other lyrics from scratch', 'Buscando otra letra desde cero'));
    },
  },
  /* El tamano tambien por teclado: es lo que se toca mientras se escucha, y abrir
     un menu para cada paso rompe justo lo que se estaba haciendo. Se aceptan las
     dos teclas de cada signo, la de la fila de numeros y la del teclado numerico,
     porque en un teclado espanol el + de arriba lleva Shift y con Alt puesto la
     combinacion se vuelve incomoda. */
  { codigo: 'Equal', tecla: 'Alt++', nombre: tr('Bigger lyrics', 'Letra más grande'), hacer: () => subirTamano(4) },
  { codigo: 'NumpadAdd', tecla: 'Alt++', nombre: tr('Bigger lyrics', 'Letra más grande'), hacer: () => subirTamano(4) },
  { codigo: 'Minus', tecla: 'Alt+-', nombre: tr('Smaller lyrics', 'Letra más pequeña'), hacer: () => subirTamano(-4) },
  { codigo: 'NumpadSubtract', tecla: 'Alt+-', nombre: tr('Smaller lyrics', 'Letra más pequeña'), hacer: () => subirTamano(-4) },
];

const subirTamano = (paso) => {
  const nuevo = limitar((Ajustes.get('tamano') || 44) + paso, 18, 96);
  Ajustes.set('tamano', nuevo);
  aplicarTamano();
  Aviso.decir(tr(`Lyrics at ${nuevo}px`, `Letra a ${nuevo}px`));
};

/* El signo se explica con palabras y no con un numero pelado: "+0.3s" no dice si
   la letra va antes o despues, y es justo lo unico que uno necesita saber
   mientras lo esta ajustando. */
const explicarDesfase = (d) => {
  if (Math.abs(d) < 0.001) return tr('Lyrics in time with the audio', 'Letra a tiempo con el audio');
  const s = Math.abs(d).toFixed(1);
  return d > 0 ? tr(`Lyrics ${s}s later`, `Letra ${s}s más tarde`) : tr(`Lyrics ${s}s earlier`, `Letra ${s}s antes`);
};

/* El contador no es decoracion: si esto se instalara dos veces, cada pulsacion
   haria el trabajo dos veces — y con el ajuste de desfase eso significa que cada
   paso mueve 0.2s en lugar de 0.1s, que es exactamente lo que midio la prueba.
   Un atajo que hace el doble de lo que dice es un fallo dificil de ver a mano,
   porque el efecto es plausible. */
let vecesTeclado = 0;

const teclaDe = (codigo) => { const a = ATAJOS.find((x) => x.codigo === codigo); return a ? a.tecla : ''; };

const ponerTeclado = () => {
  if (vecesTeclado) { warn('el teclado ya estaba puesto; no se instala otra vez'); return; }
  vecesTeclado++;

  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (escribiendo()) return;
    const atajo = ATAJOS.find((a) => a.codigo === e.code);
    if (!atajo) return;
    e.preventDefault();
    e.stopPropagation();
    try { atajo.hacer(); } catch (err) { warn('atajo', atajo.codigo, err); }
  }, true);
};

/* Un icono de letra: lineas de texto de largos distintos, que es como lo dibujan
   todos y se reconoce al instante. Va en SVG propio y no con la fuente de iconos
   de YouTube, que en Windows 10 no siempre esta.

   SE CONSTRUYE CON EL DOM Y NO CON innerHTML ---------------------- MEDIDO -
   YouTube Music sirve la pagina con Trusted Types exigido por CSP
   (require-trusted-types-for). Asignar una cadena a innerHTML ahi lanza
   "This document requires 'TrustedHTML' assignment", y como esto corre en el
   arranque, la excepcion se llevaba por delante el boton, el teclado y el menu de
   golpe. Lo canto el try/catch del arranque, que para esto estaba.

   createElementNS no pasa por el filtro porque no hay cadena que analizar: son
   nodos ya construidos. Y hay que usarlo con el espacio de nombres de SVG —
   createElement('svg') haria un elemento HTML desconocido que no pinta nada. */
const NS_SVG = 'http://www.w3.org/2000/svg';

const icono = () => {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const trazo = document.createElementNS(NS_SVG, 'path');
  trazo.setAttribute('d', 'M4 6h16v2H4zm0 4h11v2H4zm0 4h16v2H4zm0 4h8v2H4z');
  svg.appendChild(trazo);
  return svg;
};

const Controles = {
  boton: null,

  poner() {
    const barra = punto('barraDerecha');
    if (!barra) { log('sin #right-controls: el boton se pondra cuando aparezca'); return false; }
    if (this.boton && this.boton.isConnected) return true;

    const b = crear('button', c('boton'));
    b.type = 'button';
    b.appendChild(icono());
    b.title = tr('Synced lyrics (right-click for options)', 'Letra sincronizada (clic derecho: opciones)');
    b.setAttribute('aria-label', tr('Synced lyrics', 'Letra sincronizada'));
    b.addEventListener('click', (e) => {
      /* ytmusic-player-bar abre y cierra el reproductor grande con cualquier
         clic que le llegue en burbuja (medido el 16-11-2026 con un raton real
         por BiDi), igual que hacia con el clic derecho (ver abajo). */
      e.stopPropagation();
      /* Con Alt, el menu. Es el modificador de todos los atajos, asi que es el
         que la mano ya asocia con este mod. */
      if (e.altKey) { Menu.alternar(b); return; }
      Vistas.alternar(Ajustes.get('vistaPorDefecto') || 'escenario');
      this.refrescar();
    });
    /* Y con el boton derecho tambien, que es donde lo busca cualquiera.

       SE CORTA LA PROPAGACION, Y preventDefault NO BASTA ------------- MEDIDO -
       Medido en vivo el 2026-08-02, despues de una actualizacion de YouTube
       Music: ytmusic-player-bar escucha `contextmenu` en fase de BURBUJA y abre
       su propio menu de cancion — "Start mix", "Play next", "Add to queue" —,
       un tp-yt-iron-dropdown de 242x514 que ademas corta ahi la propagacion (el
       evento nunca llega a document).

       preventDefault solo cancela el menu del navegador. El de YouTube Music no
       es el del navegador: se abre por codigo y no mira defaultPrevented. Por
       eso salian los dos a la vez, encimados sobre el mismo trozo de pantalla, y
       pulsar una opcion era una loteria.

       Nuestro escuchador esta en el boton, que es descendiente de la barra: en
       burbuja va ANTES que el suyo. Con stopPropagation el de la barra no llega
       a enterarse, y medido asi el dropdown de YouTube ya no aparece. */
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      Menu.alternar(b);
    });

    const menu = punto('menuExpansible');
    if (menu && menu.parentElement === barra) barra.insertBefore(b, menu);
    else barra.insertBefore(b, barra.firstChild);

    this.boton = b;
    /* Si Polymer rehace la barra, el boton vuelve. */
    vigilarMontaje(barra, b, () => {
      const m = punto('menuExpansible');
      if (m && m.parentElement === barra) barra.insertBefore(b, m); else barra.appendChild(b);
    });

    this.refrescar();
    return true;
  },

  refrescar() {
    if (!this.boton) return;
    const abierta = Vistas.abiertas.size > 0;
    this.boton.dataset.on = abierta ? '1' : '0';
    this.boton.setAttribute('aria-pressed', abierta ? 'true' : 'false');
    Menu.refrescar();
  },
};

/* --- El menu --------------------------------------------------------------
   Un userscript no aparece en Ajustes > Zen Mods, que es donde viven las
   opciones de los otros cinco mods del repo. Asi que o sus ajustes estan en la
   propia pagina, o solo existen para quien abra la consola. */

const Menu = {
  nodo: null,

  alternar(ancla) {
    if (this.nodo) { this.cerrar(); return; }
    this.abrir(ancla);
  },

  abrir(ancla) {
    this.nodo = crear('div', c('menu'));

    // Cada titulo abre un grupo redondeado (estilo iOS); las opciones van dentro.
    let grupo = null;
    const titulo = (t) => {
      this.nodo.appendChild(crear('h4', null, { textContent: t }));
      grupo = crear('div', c('grupo'));
      this.nodo.appendChild(grupo);
    };
    const separador = () => {};

    const opcion = (texto, tecla, activo, alPulsar) => {
      const b = crear('button');
      b.type = 'button';
      b.appendChild(crear('span', c('texto'), { textContent: texto }));
      if (tecla) b.appendChild(crear('span', c('tecla'), { textContent: tecla }));
      if (activo !== null) {
        b.dataset.on = activo ? '1' : '0';
        b.setAttribute('role', 'switch');
        b.setAttribute('aria-checked', activo ? 'true' : 'false');
        b.appendChild(crear('span', c('interruptor')));
      }
      b.addEventListener('click', (e) => { e.stopPropagation(); alPulsar(); this.refrescar(); });
      (grupo || this.nodo).appendChild(b);
      return b;
    };

    titulo(tr('Where the lyrics show', 'Dónde sale la letra'));
    /* Las teclas que muestra el menu salen de ATAJOS y no escritas otra vez aqui:
       si un dia se cambia un atajo, lo que pone el menu cambia con el. */
    for (const [nombre, etiqueta, codigo] of [
      ['escenario', tr('Instead of the video', 'En lugar del vídeo'), 'KeyE'],
      ['panel', tr('In the side column', 'En la columna de al lado'), 'KeyP'],
      ['completa', tr('Full screen', 'Pantalla completa'), 'KeyF'],
      ['tira', tr('Mini strip above the player bar', 'Mini tira sobre la barra'), 'KeyM'],
    ]) {
      opcion(etiqueta, teclaDe(codigo), Vistas.estaAbierta(nombre), () => { Vistas.alternar(nombre); Controles.refrescar(); });
    }

    separador();
    titulo(tr('Playback', 'Qué suena'));
    /* El unico ajuste del menu que no va sobre la letra sino sobre la
       reproduccion. Vive aqui porque un userscript no sale en Ajustes > Zen
       Mods y este es el unico sitio de la pagina donde el mod tiene voz.
       Al encenderlo se reconsidera la cancion que ya esta sonando: si esperara
       a la siguiente, parecería que el interruptor no hace nada. */
    opcion(tr('Play the video when the song has one', 'Poner el vídeo cuando la canción lo tenga'), null, Ajustes.get('preferirVideo') !== false, () => {
      const encendiendo = Ajustes.get('preferirVideo') === false;
      Ajustes.set('preferirVideo', encendiendo);
      if (!encendiendo) { Aviso.decir(tr('Audio with the cover art it is', 'Se quedará el audio con la carátula')); return; }
      Video.reconsiderar();
      /* Y si no se puede, se dice por que: sin sesion iniciada YouTube Music no
         deja conmutar, y callarse eso deja al usuario creyendo que es el mod. */
      const e = Video.estado();
      if (!/se puede poner|ya esta sonando/.test(e.dice)) Aviso.decir(textoVideo(e.dice));
    });

    separador();
    titulo(tr('Look', 'Cómo se ve'));
    opcion(tr('Word-by-word fill', 'Relleno palabra a palabra'), null, Ajustes.get('porPalabra') !== false, () => {
      Ajustes.set('porPalabra', Ajustes.get('porPalabra') === false);
      /* Esto si cambia la forma de las lineas, asi que aqui SI hay que rehacer. */
      for (const e of Motor.escenas) e.poner(Letra.estado());
    });
    /* En pixeles, en pasos de 4. El tope de arriba es alto a proposito: en una
       pantalla grande con la vista completa, 96px se lee desde el sofa. */
    opcion(tr(`Bigger (now ${Ajustes.get('tamano') || 44}px)`, `Más grande (ahora ${Ajustes.get('tamano') || 44}px)`), teclaDe('Equal'), null, () => subirTamano(4));
    opcion(tr('Smaller', 'Más pequeña'), teclaDe('Minus'), null, () => subirTamano(-4));

    separador();
    titulo(tr('Sync', 'Sincronización'));
    opcion(explicarDesfase(Letra.desfase()), `${teclaDe('ArrowLeft')} / ${teclaDe('ArrowRight')}`, null, () => {});
    opcion(tr('Reset the offset for this song', 'Quitar el ajuste de esta canción'), teclaDe('Digit0'), null, () => { Letra.reiniciarDesfase(); Aviso.decir(tr('Offset reset', 'Desfase a cero')); });
    opcion(tr('Wrong lyrics: try another version', 'No es esta: prueba otra versión'), teclaDe('KeyR'), null, () => {
      const r = Letra.otraVersion();
      Aviso.decir(r ? tr(`Version ${r.actual} of ${r.total}`, `Versión ${r.actual} de ${r.total}`) : tr('Looking for other lyrics from scratch', 'Buscando otra letra desde cero'));
    });

    separador();
    titulo(tr('Lyrics sources', 'De dónde sale la letra'));
    opcion(tr('LRCLIB: open, line by line', 'LRCLIB: abierta, por líneas'), null, Ajustes.get('usarLrclib') !== false, () => Ajustes.set('usarLrclib', Ajustes.get('usarLrclib') === false));
    opcion(tr('Musixmatch: word by word', 'Musixmatch: palabra a palabra'), null, !!Ajustes.get('usarMusixmatch'), () => {
      const encendiendo = !Ajustes.get('usarMusixmatch');
      Ajustes.set('usarMusixmatch', encendiendo);
      if (!encendiendo) return;
      if (!Ajustes.get('tokenMusixmatch')) { pedirTokenMusixmatch(); return; }
      const via = Red.via();
      if (via !== 'gm' && via !== 'puente') Aviso.decir(tr('Musixmatch needs a userscript manager', 'Musixmatch necesita un gestor de userscripts'));
    });
    if (Ajustes.get('usarMusixmatch')) {
      opcion(Ajustes.get('tokenMusixmatch') ? tr('Change the Musixmatch token', 'Cambiar el token de Musixmatch') : tr('Musixmatch token missing', 'Falta el token de Musixmatch'), null, null, () => pedirTokenMusixmatch());
    }
    /* Encendida por defecto, al contrario que Musixmatch, porque no pide nada:
       ni token, ni gestor, ni permiso de nadie. Y solo entra cuando no hay letra
       de las otras dos, asi que encenderla no le quita sitio a ninguna. */
    opcion(tr('YouTube captions, when nobody else has them', 'Subtítulos de YouTube, cuando no la tiene nadie'), null, Ajustes.get('usarSubtitulos') !== false, () => {
      const encendiendo = Ajustes.get('usarSubtitulos') === false;
      Ajustes.set('usarSubtitulos', encendiendo);
      Aviso.decir(encendiendo ? tr('Used on the next song without lyrics', 'Se usarán en la próxima canción sin letra') : tr('YouTube captions off', 'Subtítulos de YouTube apagados'));
    });
    opcion(tr(`Forget saved lyrics (${Cache.cuantas()})`, `Olvidar lo guardado (${Cache.cuantas()})`), null, null, () => { Cache.vaciar(); Aviso.decir(tr('Saved lyrics cleared', 'Guardado borrado')); });

    document.body.appendChild(this.nodo);

    /* Colocado respecto al boton, y girado hacia dentro si no cabe: la barra del
       reproductor esta pegada al borde de abajo y a la derecha, asi que el menu
       casi siempre tiene que subir y desplazarse a la izquierda.

       Y SI NO CABE EN NINGUNO DE LOS DOS LADOS, NO SE VOLTEA ------- MEDIDO -
       El menu mide 573px de alto con las opciones por defecto, y una linea mas
       si Musixmatch esta encendido. Medido el 2026-08-02 con la ventana a 640 de
       alto: no cabia encima, asi que el volteo de antes lo mandaba debajo del
       boton, a y=634 sobre un viewport de 640 — 567 de sus 573 pixeles fuera de
       la pantalla. El menu estaba abierto y era invisible e impulsable, que es
       la peor de las formas de fallar porque no parece un fallo.

       Voltear solo vale cuando al otro lado SI cabe. Cuando no cabe en ninguno,
       lo que hay que hacer es quedarse en el lado con mas hueco y recortarse a
       ese hueco: la hoja ya deja el menu desplazable, asi que no se pierde
       ninguna opcion. */
    const MARGEN = 8;   // aire contra el borde de la ventana
    const HUECO = 10;   // separacion entre el boton y el menu

    const r = ancla.getBoundingClientRect();
    const m = this.nodo.getBoundingClientRect();

    const x = Math.min(Math.max(MARGEN, r.left + r.width / 2 - m.width / 2), window.innerWidth - m.width - MARGEN);

    const sitioEncima = r.top - HUECO - MARGEN;
    const sitioDebajo = window.innerHeight - r.bottom - HUECO - MARGEN;

    let y;
    if (m.height <= sitioEncima) y = r.top - m.height - HUECO;
    else if (m.height <= sitioDebajo) y = r.bottom + HUECO;
    else if (sitioEncima >= sitioDebajo) { this.nodo.style.maxHeight = `${Math.round(sitioEncima)}px`; y = MARGEN; }
    else { this.nodo.style.maxHeight = `${Math.round(sitioDebajo)}px`; y = r.bottom + HUECO; }

    this.nodo.style.left = `${Math.round(x)}px`;
    this.nodo.style.top = `${Math.round(y)}px`;

    /* Se cierra al pulsar fuera. En el frame siguiente, porque el clic que lo
       abrio todavia esta subiendo por el arbol y lo cerraria al instante. */
    setTimeout(() => {
      this._fuera = (ev) => { if (this.nodo && !this.nodo.contains(ev.target) && ev.target !== ancla) this.cerrar(); };
      document.addEventListener('pointerdown', this._fuera, true);
    }, 0);
  },

  cerrar() {
    if (this._fuera) document.removeEventListener('pointerdown', this._fuera, true);
    this._fuera = null;
    if (this.nodo) this.nodo.remove();
    this.nodo = null;
  },

  /* Pulsar una opcion rehace el menu entero, que es lo que hace que la opcion
     de al lado se entere del cambio. Pero si el menu venia recortado y
     desplazado, rehacerlo lo devolvia arriba del todo: uno pulsaba "Letra mas
     grande" y la opcion se le iba de debajo del raton. Por eso se guarda por
     donde iba y se vuelve a dejar ahi. */
  refrescar() {
    if (!this.nodo) return;
    const ancla = Controles.boton;
    const porDonde = this.nodo.scrollTop;
    this.cerrar();
    if (!ancla) return;
    this.abrir(ancla);
    this.nodo.scrollTop = porDonde;
  },
};

/* El token se pide con un prompt del navegador y no con un campo dentro del menu.
   Un campo de texto propio obliga a manejar foco, pegado y validacion, y esto se
   hace una vez en la vida de la instalacion. Lo que si hace falta es DECIR de
   donde sale el token, porque nadie lo sabe de memoria. */
const pedirTokenMusixmatch = () => {
  const actual = Ajustes.get('tokenMusixmatch') || '';
  const puesto = window.prompt(
    tr('Musixmatch user token.\n\n' +
      'Get it from the Musixmatch desktop app: Ctrl+Shift+I to open the developer\n' +
      'tools, Network tab, Ctrl+R to reload, filter by "apic" and the token is in\n' +
      'the parameters of any of those requests.\n\n' +
      'Note: the API is unofficial and using it this way goes against its terms of\n' +
      'use. Leave the token empty to turn this source off and use LRCLIB only.',
    'Token de usuario de Musixmatch.\n\n' +
      'Se saca de la aplicación de escritorio de Musixmatch: Ctrl+Mayús+I para abrir las\n' +
      'herramientas, pestaña Red, Ctrl+R para recargar, se filtra por "apic" y el token\n' +
      'está en los parámetros de cualquiera de esas peticiones.\n\n' +
      'Ojo: la API no es oficial y usarla así va contra sus condiciones de uso. Con el\n' +
      'token vacío, esta fuente se apaga y solo se usa LRCLIB.'),
    actual,
  );
  if (puesto === null) return;                       // canceló
  const limpio = puesto.trim();
  Ajustes.set('tokenMusixmatch', limpio);
  if (!limpio) { Ajustes.set('usarMusixmatch', false); Aviso.decir(tr('Musixmatch off', 'Musixmatch apagado')); return; }
  Aviso.decir(tr('Token saved. It will be used on the next song', 'Token guardado. Se usará en la próxima canción'));
};

const aplicarTamano = () => {
  /* Cada escena aplica el suyo con su propio factor: el panel es la mitad que el
     escenario y la pantalla completa un tercio mas. Poner el mismo numero en las
     cuatro es lo que hacia antes, y dejaba la columna estrecha del panel con
     letra de vista completa. */
  for (const e of Motor.escenas) if (e.aplicarTamano) e.aplicarTamano();
  /* El tamano cambia el alto de las lineas, asi que el centrado calculado deja
     de valer y hay que recolocar. */
  for (const e of Motor.escenas) { if (e._ajustarAire) e._ajustarAire(); e.iActiva = -1; }
  Motor.despertar();
};

/* ===== 99-epilogo.js ===================================================== */
/* --- Arranque -------------------------------------------------------------
   El userscript entra a document-start, cuando la pagina esta practicamente
   vacia: a esa altura no hay reproductor, no hay barra y no hay video. Asi que
   arrancar es esperar al primer punto critico y solo entonces empezar.

   Se espera al elemento de video y no a ytmusic-app porque la app aparece
   enseguida y el video tarda: si arrancaramos con la app, el reloj naceria sin
   fuente y habria que reintentar desde dentro. */

const arrancar = async () => {
  /* UNA SOLA VEZ POR DOCUMENTO -------------------------------------- MEDIDO -
     Este archivo llamaba a arrancar() dos veces: una envuelta en el catch y otra
     al final, resto de una edicion. Y arrancar dos veces no da ningun error: da
     dos bucles de pintado, dos vigilantes de tema y dos oyentes de teclado. Con
     dos oyentes, cada pulsacion de ajuste movia el desfase 0.2s en lugar de 0.1s,
     que es lo que midio la prueba — un atajo que hace el doble de lo que dice, y
     de los fallos mas dificiles de ver a mano porque el efecto sigue siendo
     plausible.

     Quitada la llamada de mas, la guarda se queda: con un gestor de userscripts
     hay otras formas de que el paquete se evalue dos veces en la misma pagina
     (inyeccion en dos contextos, o el script instalado dos veces). La marca se
     pone ANTES del primer await, porque entre el await y su vuelta cabe
     perfectamente la segunda ejecucion. */
  if (window.__zenLetraVivo) { log('ya hay una instancia en esta pagina; esta no arranca'); return; }
  window.__zenLetraVivo = true;

  const video = await esperar('video');
  if (!video) { warn('no aparecio ningun elemento de video en 30s; el mod no arranca'); return; }

  Ajustes.cargar();
  meterEstilos();
  Reloj.video();
  Reloj.vigilarAnuncios();
  Motor.arrancar();

  /* La letra se pide al cambiar el tema, no en un bucle: el unico momento en
     que hace falta pedirla es cuando cambia lo que suena. */
  Tema.alCambiar((id) => Letra.cargar(id));
  /* Y por el mismo sitio se decide si esta cancion tiene videoclip. Va como
     oyente aparte y no dentro del anterior para que una excepcion suya no se
     lleve por delante la carga de la letra, que es lo que hace este mod. */
  Tema.alCambiar((id) => Video.atender(id));
  Tema.vigilar();

  /* La barra tarda mas en aparecer que el video, asi que el boton se intenta y,
     si no puede, se espera a que exista en lugar de darse por vencido. */
  if (!Controles.poner()) {
    esperar('ytmusic-player-bar #right-controls').then(() => Controles.poner());
  }
  ponerTeclado();
  Vistas.restaurar();
  Controles.refrescar();

  log(`Zen Letra Viva ${LV.version} en pie (red por ${Red.via()}, almacen ${Almacen.via})`);
  if (LV.debug) informe();
};

/* La unica salida al exterior, y solo para depurar a mano desde la consola de
   la pagina. Nada de la logica lee de aqui. Se asigna ANTES de arrancar para
   que este disponible aunque el arranque se caiga: es justo cuando hace falta. */
window.__zenLetra = Object.freeze({
  version: LV.version,
  /* Lo lee Zen Remoto para enseñar la letra en el movil. `firma` cambia cuando
     cambia la cancion, llega la letra o se toca el desfase, y es barata: el
     remoto la mira dos veces por segundo. `letra` es una copia plana, sin las
     palabras sueltas: lo de dentro del mod no se puede tocar desde fuera. */
  firma: () => {
    const l = Letra.estado();
    return [l.id, l.clave, l.lineaDeTiempo ? l.lineaDeTiempo.lineas.length : 0, Letra.desfase()].join('|');
  },
  letra: () => {
    const l = Letra.estado();
    const lt = l.lineaDeTiempo;
    const lineas = lt ? lt.lineas.map((x) => ({ i: x.inicio, f: x.fin, t: x.texto, p: !!x.interludio })) : [];
    return {
      id: l.id, clave: l.clave, fuente: l.fuente, mensaje: l.mensaje,
      desfase: Letra.desfase(),
      sincronizada: lineas.some((x) => x.i > 0),
      lineas,
    };
  },
  doctor: informe,
  puntos: PUNTOS,
  debug: (v = true) => { LV.debug = v; return `depuracion ${v ? 'encendida' : 'apagada'}`; },
  arrancar,
  /* Lo que se mira cuando la letra va desincronizada: si el estado dice
     `anuncio` el reloj esta congelado a proposito, y si la duracion sale
     absurda es que se leyo durante un anuncio. */
  estado: () => {
    const l = Letra.estado();
    return {
      reloj: { tiempo: +Reloj.tiempo().toFixed(3), estado: Reloj.estado(), duracion: +Reloj.duracion().toFixed(1) },
      tema: Tema.actual(),
      letra: {
        clave: l.clave,
        fuente: l.fuente,
        mensaje: l.mensaje,
        lineas: l.lineaDeTiempo ? l.lineaDeTiempo.lineas.length : 0,
        porPalabra: l.lineaDeTiempo ? l.lineaDeTiempo.porPalabra : false,
        desfase: Letra.desfase(),
      },
      via: { red: Red.via(), almacen: Almacen.via, cache: Cache.cuantas() },
      /* Por que suena el audio y no el videoclip, que sin esto solo se puede
         averiguar mirando atributos de Polymer a mano. Distingue "esta cancion
         no tiene video" de "YouTube Music no deja conmutar", que es la
         diferencia entre no hay nada que hacer y falta iniciar sesion. */
      video: Video.estado(),
    };
  },
  /* Las vistas se exponen para poder abrirlas y cerrarlas desde la consola: es
     lo que permite probar una vista sin depender de acertarle al boton. */
  vistas: {
    abrir: (n) => Vistas.abrir(n),
    cerrar: (n) => Vistas.cerrar(n),
    alternar: (n) => Vistas.alternar(n),
    abiertas: () => [...Vistas.abiertas],
    hay: () => [...Vistas.registro.keys()],
  },
  /* Diagnostico de red. Existe porque el fallo del puente entre compartimentos no
     daba ninguna senal: las peticiones salian, volvian, y el motor recibia un
     objeto cuyas propiedades no podia leer. El sintoma era "nadie tiene la letra
     de ninguna cancion", que se parece muchisimo a un problema de la base de
     datos y no lo era. Esto lo distingue en una linea: si `ok` es true pero
     `clavesVisibles` sale vacio, el problema es la frontera, no la red. */
  probarRed: async () => {
    const r = await Red.json('https://lrclib.net/api/search?track_name=test');
    let claves = [];
    try { claves = Object.keys(r || {}); } catch (e) { claves = ['ILEGIBLE: ' + e.message]; }
    let sonda = null;
    /* La sonda solo existe con el cargador nativo, y dice que globales hay de
       verdad en el proceso privilegiado. Adivinarlo costo tres reinicios. */
    try { const p = Red.puente(); if (p && p.sonda) sonda = p.sonda(); } catch (e) { sonda = 'no se pudo sondear: ' + e.message; }
    return {
      via: Red.via(),
      ok: r && r.ok,
      estado: r && r.estado,
      error: r && r.error,
      mecanismo: r && r.mecanismo,
      clavesVisibles: claves,
      resultados: (r && r.datos && r.datos.length) || 0,
      sonda,
    };
  },
  /* El conmutador cancion/video, para poder mirarlo y forzarlo a mano. Sin
     esto, comprobar por que una cancion no salta al videoclip obliga a leer
     atributos de Polymer desde la consola. */
  video: {
    estado: () => Video.estado(),
    lectura: () => Video.lectura(),
    poner: () => Video.poner(),
    reconsiderar: () => Video.reconsiderar(),
  },
  ajustes: () => Ajustes.todos(),
  ajustar: (k, v) => Ajustes.set(k, v),
  recargar: () => Letra.recargar(),
  vaciarCache: () => Cache.vaciar(),
});

/* El catch NO es decoracion. Una excepcion aqui deja el mod cargado y muerto: el
   gestor de userscripts no reporta nada, la consola de la pagina esta llena de
   ruido de YouTube y el sintoma es indistinguible de "no se instalo". Ya paso dos
   veces — un observe() sobre documentElement todavia nulo, y un innerHTML contra
   la politica de Trusted Types de YouTube Music. Las dos las encontro esta linea.
   Que grite con nuestra marca delante y diga que hacer. */
arrancar().catch((e) => {
  console.error('[letra] el arranque se cayo, el mod no esta funcionando:', e);
  console.error('[letra] pega esto en un issue junto con window.__zenLetra.doctor()');
});


})();

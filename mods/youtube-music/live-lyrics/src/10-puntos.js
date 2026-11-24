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

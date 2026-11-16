/* Zen Remoto: la pagina del movil. Sin dependencias.
 *
 * Habla con el servidor de Zen por /api: el estado llega por espera larga
 * (/api/estado?v=N contesta en cuanto algo cambia, o a los 25 s) y las ordenes van
 * por POST /api/orden. La posicion de la cancion se interpola aqui: el PC solo la
 * manda cuando cambia de verdad.
 *
 * Nada de lo que llega se pinta con innerHTML: todo es textContent y atributos, y
 * las imagenes solo si son https.
 */
(() => {
  'use strict';

  /* EL IDIOMA: el del movil. En espanol si el movil esta en espanol; si no, en
     ingles. El HTML viene escrito en espanol y se traduce al cargar con el mismo
     diccionario que los textos de aqui. */
  const ES = /^es\b/i.test(navigator.language || '');
  const EN = {
    "Remoto": "Remote",
    "Conectando con el PC…": "Connecting to the PC…",
    "Si no avanza, comprueba que el móvil está en la misma wifi y que Zen está abierto.": "If it doesn't move on, check that the phone is on the same Wi-Fi and that Zen is open.",
    "Reintentar": "Try again",
    "Controla la música del PC": "Control your PC's music",
    "En el PC, en YouTube Music, pulsa el botón del móvil de la barra del reproductor y escanea el código. O escribe aquí el número que sale debajo.": "On the PC, in YouTube Music, tap the phone button in the player bar and scan the code. Or type the number shown under it here.",
    "Código del PC": "PC code",
    "Emparejar": "Pair",
    "Atrás": "Back",
    "Inicio": "Home",
    "YouTube Music no está abierto en el PC": "YouTube Music isn't open on the PC",
    "Ábrelo en Zen y aparecerá aquí.": "Open it in Zen and it'll show up here.",
    "Abrir en el PC": "Open on the PC",
    "Sonando": "Now playing",
    "Bajar": "Close",
    "Ver la letra": "Show lyrics",
    "No me gusta": "Dislike",
    "Me gusta": "Like",
    "Anuncio en el PC": "Ad playing on the PC",
    "Posición": "Position",
    "Aleatorio": "Shuffle",
    "Anterior": "Previous",
    "Reproducir": "Play",
    "Siguiente": "Next",
    "Repetir": "Repeat",
    "Silenciar": "Mute",
    "Volumen del PC": "PC volume",
    "Buscar": "Search",
    "Canciones, artistas, álbumes": "Songs, artists, albums",
    "Buscar en YouTube Music": "Search YouTube Music",
    "Borrar": "Clear",
    "Biblioteca": "Library",
    "Cola": "Queue",
    "Letra": "Lyrics",
    "Detalle": "Details",
    "Ver lo que suena": "Show what is playing",
    "Secciones": "Sections",
    "Sin conexión con el PC. Reintentando…": "No connection to the PC. Retrying…",
    "Canción": "Song",
    "Vídeo": "Video",
    "Álbum": "Album",
    "Artista": "Artist",
    "Playlist": "Playlist",
    "Episodio": "Episode",
    "Podcast": "Podcast",
    "El PC no contestó a tiempo": "The PC didn't answer in time",
    "Demasiado rápido, espera un momento": "Too fast, wait a moment",
    "Esa lista ya no está. Vuelve a abrirla.": "That list isn't there anymore. Open it again.",
    "No se pudo: ": "Couldn't do it: ",
    "Ese código no es. Mira el que sale ahora en el PC.": "That's not the code. Check the one showing on the PC now.",
    "Abre primero el panel del móvil en YouTube Music, en el PC.": "First open the phone panel in YouTube Music, on the PC.",
    "Demasiados intentos. Espera unos minutos.": "Too many attempts. Wait a few minutes.",
    "No se pudo emparejar. ¿Estás en la misma wifi que el PC?": "Couldn't pair. Are you on the same Wi-Fi as the PC?",
    "Son seis cifras.": "It's six digits.",
    "Sin título": "Untitled",
    "Portada de ": "Cover of ",
    "Pausar": "Pause",
    "Repetir una": "Repeat one",
    "Repetir todo": "Repeat all",
    "Quitar silencio": "Unmute",
    "Abriendo YouTube Music en el PC": "Opening YouTube Music on the PC",
    "No se pudo abrir": "Couldn't open it",
    "A continuación": "Up next",
    "Sonando en el PC": "Playing on the PC",
    "Explícito": "Explicit",
    "Más opciones de ": "More options for ",
    "Cargar más": "Load more",
    "Cargando…": "Loading…",
    "Reproducir en aleatorio": "Shuffle play",
    "Sonando en aleatorio": "Shuffling",
    "Reproducir a continuación": "Play next",
    "Sonará a continuación": "Plays next",
    "Añadir a la cola": "Add to queue",
    "Añadido a la cola": "Added to queue",
    "Iniciar radio": "Start radio",
    "Radio en el PC": "Radio on the PC",
    "Abrir": "Open",
    "Radio": "Radio",
    "Aquí no hay nada": "Nothing here",
    "Esta página no tiene canciones que mostrar.": "This page has no songs to show.",
    "Vuelve atrás e inténtalo otra vez.": "Go back and try again.",
    "Sin resultados": "No results",
    "Prueba con otras palabras.": "Try other words.",
    "No se pudo buscar": "Couldn't search",
    "Comprueba que YouTube Music sigue abierto en el PC.": "Check that YouTube Music is still open on the PC.",
    "Todo": "All",
    "Nada que sugerir todavía": "Nothing to suggest yet",
    "Pon algo de música y YouTube Music empezará a recomendarte.": "Play some music and YouTube Music will start recommending.",
    "No se pudo cargar el inicio": "Couldn't load Home",
    "Playlists": "Playlists",
    "Álbumes": "Albums",
    "Artistas": "Artists",
    "Canciones": "Songs",
    "Historial": "History",
    "Para ti": "For you",
    "Inicia sesión en YouTube Music en el PC para ver tu biblioteca.": "Sign in to YouTube Music on the PC to see your library.",
    "Esta sección está vacía.": "This section is empty.",
    "No se pudo cargar": "Couldn't load it",
    "La cola está vacía": "The queue is empty",
    "Busca algo y pulsa «Añadir a la cola».": "Search for something and tap “Add to queue”.",
    "No se pudo cargar la cola": "Couldn't load the queue",
    "No se pudo traer la letra": "Couldn't get the lyrics",
    "Letra Viva no está en el PC": "Live Lyrics isn't on the PC",
    "La letra sale del mod Zen Letra Viva. Instálalo en Zen y aparecerá aquí.": "Lyrics come from the Live Lyrics mod. Install it in Zen and they'll show up here.",
    "Buscando la letra…": "Looking for the lyrics…",
    "Instrumental": "Instrumental",
    "Sin letra": "No lyrics",
    "Nadie tiene la letra de esta canción.": "Nobody has the lyrics for this song.",
    "Esta letra no tiene tiempos: no se puede seguir.": "These lyrics have no timing, so they can't follow along.",
    "Letra: ": "Lyrics: "
  };
  const T = (es) => (ES ? es : (EN[es] ?? es));
  document.documentElement.lang = ES ? 'es' : 'en';
  if (!ES) {
    for (const n of document.querySelectorAll('[aria-label], [placeholder], [title], [alt]')) {
      for (const a of ['aria-label', 'placeholder', 'title', 'alt']) {
        const v = n.getAttribute(a);
        if (v && EN[v]) n.setAttribute(a, EN[v]);
      }
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const k = t.nodeValue.replace(/\s+/g, ' ').trim();
      if (k && EN[k]) t.nodeValue = t.nodeValue.replace(t.nodeValue.trim(), EN[k]);
    }
    document.title = EN[document.title] || document.title;
  }

  const $ = (id) => document.getElementById(id);
  const crear = (tag, clase, texto) => {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null && texto !== '') n.textContent = texto;
    return n;
  };
  const NS = 'http://www.w3.org/2000/svg';
  const icono = (nombre) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '/iconos.svg#' + nombre);
    s.appendChild(u);
    return s;
  };
  const imgSegura = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : '');
  const ponerImg = (img, url) => {
    const u = imgSegura(url);
    if (u) { if (img.getAttribute('src') !== u) img.src = u; } else img.removeAttribute('src');
  };
  const reloj = (s) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  const TIPOS = { cancion: T('Canción'), video: T('Vídeo'), album: T('Álbum'), artista: T('Artista'), playlist: T('Playlist'), episodio: T('Episodio'), podcast: T('Podcast') };

  // --- Red --------------------------------------------------------------------
  class ErrorApi extends Error {
    constructor(estado, cuerpo) {
      super((cuerpo && cuerpo.error) || 'error ' + estado);
      this.estado = estado;
      this.cuerpo = cuerpo;
    }
  }
  const api = async (ruta, cuerpo, opciones = {}) => {
    // Ninguna peticion se queda colgada: 10 s, o 35 s la espera larga del estado.
    const tope = new AbortController();
    const timer = setTimeout(() => tope.abort(), opciones.signal ? 35000 : 10000);
    if (opciones.signal) opciones.signal.addEventListener('abort', () => tope.abort(), { once: true });
    const init = { credentials: 'same-origin', cache: 'no-store', signal: tope.signal };
    if (cuerpo !== undefined) {
      init.method = 'POST';
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(cuerpo);
    }
    let r;
    let datos = null;
    try {
      r = await fetch(ruta, init);
      try { datos = await r.json(); } catch (e) { datos = null; }
    } finally {
      clearTimeout(timer);
    }
    if (r.status === 401 && ruta !== '/api/emparejar') { mostrarEmparejar(); throw new ErrorApi(401, datos); }
    if (!r.ok) throw new ErrorApi(r.status, datos);
    return datos || {};
  };

  const MENSAJES = {
    'sin-pestana': T('YouTube Music no está abierto en el PC'),
    'la pestana no contesto': T('El PC no contestó a tiempo'),
    'despacio': T('Demasiado rápido, espera un momento'),
    'esa lista ya no esta; vuelve a abrirla': T('Esa lista ya no está. Vuelve a abrirla.'),
  };
  const orden = async (nombre, args) => {
    try {
      const r = await api('/api/orden', { orden: nombre, args });
      return r.datos || {};
    } catch (e) {
      if (e.estado !== 401) aviso(MENSAJES[e.message] || T('No se pudo: ') + e.message);
      throw e;
    }
  };

  // --- Avisos -----------------------------------------------------------------
  let timerAviso = 0;
  const aviso = (texto) => {
    const t = $('toast');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => { t.hidden = true; }, 2600);
  };

  // --- Emparejar --------------------------------------------------------------
  const mostrarEmparejar = () => {
    detenerEstado();
    $('vista-cargando').hidden = true;
    $('app').hidden = true;
    $('vista-emparejar').hidden = false;
    setTimeout(() => $('codigo').focus(), 50);
  };
  const emparejar = async (codigo) => {
    const err = $('codigo-error');
    err.textContent = '';
    try {
      await api('/api/emparejar', { codigo });
      arrancar();
    } catch (e) {
      const m = e.cuerpo && e.cuerpo.error;
      err.textContent = m === 'codigo-malo' ? T('Ese código no es. Mira el que sale ahora en el PC.')
        : m === 'abre-el-panel' ? T('Abre primero el panel del móvil en YouTube Music, en el PC.')
        : m === 'demasiados-intentos' ? T('Demasiados intentos. Espera unos minutos.')
        : T('No se pudo emparejar. ¿Estás en la misma wifi que el PC?');
      mostrarEmparejar();
    }
  };
  $('form-codigo').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = $('codigo').value.replace(/\D/g, '');
    if (c.length !== 6) { $('codigo-error').textContent = T('Son seis cifras.'); return; }
    emparejar(c);
  });
  $('codigo').addEventListener('input', () => {
    const d = $('codigo').value.replace(/\D/g, '').slice(0, 6);
    $('codigo').value = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d;
    if (d.length === 6) emparejar(d);
  });

  // --- Estado en vivo ---------------------------------------------------------
  let E = null;          // ultimo estado del PC
  let recibido = 0;      // cuando llego (reloj del movil)
  let edad = 0;          // cuanto tenia ya al salir del PC
  let version = 0;
  let control = null;
  let activo = false;
  let arrastrando = false;
  let volTocado = 0;

  const posicion = () => {
    if (!E || !E.listo) return 0;
    let p = E.pos + (E.sonando && !E.cargando ? (edad + (Date.now() - recibido)) / 1000 : 0);
    if (E.dur > 0) p = Math.min(p, E.dur);
    return p;
  };

  const bucleEstado = async () => {
    activo = true;
    let espera = 500;
    while (activo) {
      control = new AbortController();
      try {
        const r = await api('/api/estado?v=' + version, undefined, { signal: control.signal });
        $('conexion').hidden = true;
        espera = 500;
        version = r.v || 0;
        recibido = Date.now();
        edad = r.edad || 0;
        if (r.sinPestana) E = { sinPestana: true };
        else E = r.estado || { listo: false };
        pintarEstado();
      } catch (e) {
        // Parar solo si se paro a proposito (activo en false). Un AbortError con
        // el bucle activo es el tope de 35 s: se reintenta como cualquier fallo.
        if (!activo) break;
        if (e.estado === 401) break;
        $('conexion').hidden = false;
        await new Promise((r) => setTimeout(r, espera));
        espera = Math.min(espera * 2, 5000);
      }
    }
  };
  const detenerEstado = () => {
    activo = false;
    if (control) control.abort();
  };
  // Safari congela las peticiones de una pestana en segundo plano: al volver, se
  // relanza la espera para no quedarse con un estado viejo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !$('app').hidden) {
      detenerEstado();
      version = 0;
      setTimeout(bucleEstado, 0);
    }
  });

  let firmaCola = '';
  let firmaLetra = null;
  const pintarEstado = () => {
    const sin = !!(E && E.sinPestana);
    $('sin-pestana').hidden = !sin;
    $('reproductor').hidden = sin;
    $('mini').hidden = sin || !E || !E.listo || hojaAbierta;
    if (sin && hojaAbierta) cerrarSonando();
    if (sin || !E || !E.listo) {
      $('fondo').classList.remove('con-imagen');
      return;
    }
    $('ahora-titulo').textContent = E.titulo || T('Sin título');
    $('ahora-titulo').classList.remove('cargando-texto');
    $('ahora-artista').textContent = [E.artista, E.album].filter(Boolean).join(' · ');
    ponerImg($('ahora-img'), E.img);
    $('ahora-img').alt = E.titulo ? T('Portada de ') + E.titulo : '';
    const img = imgSegura(E.img);
    const fondo = $('fondo');
    if (img) {
      // La url ya se comprobo https; se escapa por si trae comillas.
      // En una variable: la imagen la pinta #fondo::before, difuminada y recortada.
      fondo.style.setProperty('--arte', `url("${img.replace(/["\\]/g, '')}")`);
      fondo.classList.add('con-imagen');
    } else fondo.classList.remove('con-imagen');
    $('ahora-anuncio').hidden = !E.anuncio;

    const tocar = E.sonando ? 'pausa' : 'play';
    $('i-tocar').setAttribute('href', '/iconos.svg#' + tocar);
    $('i-mini').setAttribute('href', '/iconos.svg#' + tocar);
    $('b-tocar').setAttribute('aria-label', E.sonando ? T('Pausar') : T('Reproducir'));
    $('mini-tocar').setAttribute('aria-label', E.sonando ? T('Pausar') : T('Reproducir'));
    $('b-aleatorio').setAttribute('aria-pressed', String(!!E.aleatorio));
    $('b-repetir').setAttribute('aria-pressed', String(E.repetir !== 'NONE'));
    $('i-repetir').setAttribute('href', '/iconos.svg#' + (E.repetir === 'ONE' ? 'repetiruna' : 'repetir'));
    $('b-repetir').setAttribute('aria-label', E.repetir === 'ONE' ? T('Repetir una') : E.repetir === 'ALL' ? T('Repetir todo') : T('Repetir'));
    $('b-megusta').setAttribute('aria-pressed', String(E.megusta === 'LIKE'));
    $('b-nomegusta').setAttribute('aria-pressed', String(E.megusta === 'DISLIKE'));
    $('b-megusta').disabled = $('b-nomegusta').disabled = !E.sesion;

    if (Date.now() - volTocado > 1500) {
      $('volumen').value = E.vol;
      pintarRango($('volumen'));
      $('t-vol').textContent = String(E.vol);
    }
    $('b-silencio').setAttribute('aria-pressed', String(!!E.silencio));
    $('i-volumen').setAttribute('href', '/iconos.svg#' + (E.silencio || E.vol === 0 ? 'silencio' : E.vol < 40 ? 'volbajo' : 'volumen'));
    $('b-silencio').setAttribute('aria-label', E.silencio ? T('Quitar silencio') : T('Silenciar'));

    $('mini-titulo').textContent = E.titulo || '';
    $('mini-artista').textContent = E.artista || '';
    ponerImg($('mini-img'), E.img);
    $('t-dur').textContent = reloj(E.dur);

    if (E.letra !== undefined && E.letra !== firmaLetra) {
      firmaLetra = E.letra;
      if (vistaActual === 'letra') cargarLetra();
    }
    if (E.cola && E.cola.firma !== firmaCola) {
      firmaCola = E.cola.firma;
      if (vistaActual === 'cola') cargarCola();
    }
    pintarPosicion();
  };

  const pintarRango = (r) => {
    const max = Number(r.max) || 1;
    r.style.setProperty('--p', (Number(r.value) / max) * 100 + '%');
  };
  const pintarPosicion = () => {
    if (!E || !E.listo) return;
    const p = posicion();
    const fr = E.dur > 0 ? p / E.dur : 0;
    if (!arrastrando) {
      $('progreso').value = Math.round(fr * 1000);
      pintarRango($('progreso'));
      $('t-pos').textContent = reloj(p);
    }
    $('mini-progreso').style.width = (fr * 100).toFixed(2) + '%';
  };
  setInterval(() => { if (document.visibilityState === 'visible') pintarPosicion(); }, 250);

  // --- Controles --------------------------------------------------------------
  // Cambio optimista: se pinta ya y el siguiente estado del PC lo confirma.
  const pulsar = (id, fn) => $(id).addEventListener('click', fn);
  pulsar('b-tocar', () => {
    if (E && E.listo) { E.pos = posicion(); recibido = Date.now(); edad = 0; E.sonando = !E.sonando; pintarEstado(); }
    orden('alternar').catch(() => {});
  });
  pulsar('mini-tocar', () => $('b-tocar').click());
  pulsar('b-siguiente', () => orden('siguiente').catch(() => {}));
  pulsar('mini-siguiente', () => orden('siguiente').catch(() => {}));
  pulsar('b-anterior', () => orden('anterior').catch(() => {}));
  pulsar('b-aleatorio', () => orden('aleatorio').catch(() => {}));
  pulsar('b-repetir', () => orden('repetir').catch(() => {}));
  pulsar('b-megusta', () => orden('megusta', { valor: 'LIKE' }).catch(() => {}));
  pulsar('b-nomegusta', () => orden('megusta', { valor: 'DISLIKE' }).catch(() => {}));
  pulsar('b-silencio', () => orden('silencio', { on: !(E && E.silencio) }).catch(() => {}));
  pulsar('mini-abrir', () => abrirSonando());
  pulsar('abrir-ytm', async () => {
    try { await api('/api/orden', { orden: 'abrirYTM' }); aviso(T('Abriendo YouTube Music en el PC')); } catch (e) { aviso(T('No se pudo abrir')); }
  });

  const prog = $('progreso');
  prog.addEventListener('input', () => {
    arrastrando = true;
    pintarRango(prog);
    if (E && E.dur) $('t-pos').textContent = reloj((Number(prog.value) / 1000) * E.dur);
  });
  prog.addEventListener('change', () => {
    arrastrando = false;
    if (!E || !E.dur) return;
    const s = (Number(prog.value) / 1000) * E.dur;
    E.pos = s; recibido = Date.now(); edad = 0;
    orden('posicion', { s }).catch(() => {});
  });

  // El volumen se manda mientras se arrastra, como mucho cada 120 ms.
  const vol = $('volumen');
  let timerVol = 0;
  let ultimoVol = -1;
  const mandarVol = () => {
    timerVol = 0;
    const v = Number(vol.value);
    if (v === ultimoVol) return;
    ultimoVol = v;
    orden('volumen', { v }).catch(() => {});
  };
  vol.addEventListener('input', () => {
    volTocado = Date.now();
    pintarRango(vol);
    $('t-vol').textContent = vol.value;
    if (!timerVol) timerVol = setTimeout(mandarVol, 120);
  });
  vol.addEventListener('change', () => { volTocado = Date.now(); clearTimeout(timerVol); mandarVol(); });

  // --- Vistas -----------------------------------------------------------------
  let vistaActual = 'inicio';
  let ultimaPestana = 'inicio';
  const PESTANAS = ['inicio', 'buscar', 'biblioteca', 'cola'];
  const pila = [];   // paginas de detalle abiertas, para "Atras"
  const TITULOS = { inicio: T('Inicio'), buscar: T('Buscar'), biblioteca: T('Biblioteca'), cola: T('A continuación'), pagina: '', letra: T('Letra') };

  // --- Sonando: la hoja -------------------------------------------------------
  // Sube desde la mini barra y tapa la pestana en la que estabas, como en la app
  // de YouTube Music. Se baja con la flecha, con Escape o deslizandola hacia
  // abajo desde arriba del todo; lo que queda debajo es esa misma pestana, con
  // la mini barra.
  let hojaAbierta = false;
  const hoja = $('vista-ahora');
  const abrirSonando = () => {
    if (!E || !E.listo || E.sinPestana) return;
    hojaAbierta = true;
    hoja.style.transform = '';
    hoja.classList.add('abierta');
    hoja.setAttribute('aria-hidden', 'false');
    document.body.classList.add('con-hoja');
    $('mini').hidden = true;
    hoja.scrollTop = 0;
    pintarPosicion();
  };
  const cerrarSonando = () => {
    hojaAbierta = false;
    hoja.style.transform = '';
    hoja.classList.remove('abierta', 'arrastrando');
    hoja.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('con-hoja');
    $('mini').hidden = !E || !E.listo || !!E.sinPestana;
  };
  $('cerrar-sonando').addEventListener('click', cerrarSonando);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hojaAbierta) cerrarSonando(); });

  // Deslizar hacia abajo: solo si la hoja esta arriba del todo y el gesto empieza
  // fuera de los deslizadores (progreso y volumen se arrastran en horizontal y no
  // deben bajar la hoja). Mas de 110 px, o un gesto rapido, la baja; si no,
  // vuelve a su sitio.
  let arrastre = null;
  hoja.addEventListener('touchstart', (e) => {
    if (!hojaAbierta || hoja.scrollTop > 0 || e.touches.length !== 1) { arrastre = null; return; }
    if (e.target.closest('input[type="range"]')) { arrastre = null; return; }
    arrastre = { y0: e.touches[0].clientY, x0: e.touches[0].clientX, t0: Date.now(), dy: 0, vertical: null };
  }, { passive: true });
  hoja.addEventListener('touchmove', (e) => {
    if (!arrastre) return;
    const dy = e.touches[0].clientY - arrastre.y0;
    const dx = e.touches[0].clientX - arrastre.x0;
    if (arrastre.vertical === null && (Math.abs(dy) > 8 || Math.abs(dx) > 8)) arrastre.vertical = Math.abs(dy) > Math.abs(dx) && dy > 0;
    if (!arrastre.vertical) return;
    arrastre.dy = Math.max(0, dy);
    hoja.classList.add('arrastrando');
    hoja.style.transform = 'translateY(' + arrastre.dy + 'px)';
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  hoja.addEventListener('touchend', () => {
    if (!arrastre) return;
    const { dy, t0, vertical } = arrastre;
    arrastre = null;
    hoja.classList.remove('arrastrando');
    if (!vertical) return;
    const rapido = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6;
    if (dy > 110 || rapido) cerrarSonando();
    else hoja.style.transform = '';
  });

  const irA = (v, opciones = {}) => {
    if (v !== 'pagina') pila.length = 0;
    vistaActual = v;
    if (PESTANAS.includes(v)) ultimaPestana = v;
    document.body.dataset.vista = v;
    for (const id of ['inicio', 'buscar', 'biblioteca', 'cola', 'pagina', 'letra']) $('vista-' + id).hidden = id !== v;
    const pestana = v === 'pagina' ? (pila[0] && pila[0].desde) || 'buscar' : v === 'letra' ? ultimaPestana : v;
    for (const b of document.querySelectorAll('.pestanas button')) {
      if (b.dataset.vista === pestana) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    $('atras').hidden = v !== 'pagina' && v !== 'letra';
    $('titulo-vista').textContent = opciones.titulo || TITULOS[v];
    $('mini').hidden = hojaAbierta || !E || !E.listo || !!E.sinPestana;
    if (!opciones.sinSubir) window.scrollTo(0, 0);
    if (v === 'cola') cargarCola();
    if (v === 'inicio') cargarInicio(false);
    if (v === 'letra') { letraIndice = -1; cargarLetra(); }
    if (v === 'biblioteca' && !bibliotecaCargada) abrirBiblioteca('biblioteca');
  };
  for (const b of document.querySelectorAll('.pestanas button')) b.addEventListener('click', () => irA(b.dataset.vista));
  $('atras').addEventListener('click', () => {
    if (vistaActual === 'letra') { irA(ultimaPestana); abrirSonando(); return; }
    pila.pop();
    const ant = pila[pila.length - 1];
    if (ant) { pintarPagina(ant.datos, ant.titulo); irA('pagina', { titulo: ant.titulo, sinSubir: true }); window.scrollTo(0, ant.scroll || 0); }
    else irA(volverA);
  });
  let volverA = 'buscar';

  // --- Listas -----------------------------------------------------------------
  const esqueleto = (n = 6) => {
    const f = crear('div', 'filas esqueleto');
    for (let i = 0; i < n; i++) {
      const fila = crear('div', 'fila');
      const c = crear('div', 'fila-cuerpo');
      c.appendChild(crear('div', 'sin-imagen'));
      const t = crear('div', 'fila-texto');
      const a = crear('span', 'barra-e'); a.style.width = 120 + ((i * 37) % 90) + 'px';
      const b = crear('span', 'barra-e'); b.style.width = 70 + ((i * 53) % 60) + 'px'; b.style.marginTop = '8px';
      t.append(a, b);
      c.appendChild(t);
      fila.appendChild(c);
      f.appendChild(fila);
    }
    return f;
  };
  const vacio = (titulo, texto) => {
    const v = crear('div', 'vacio');
    v.appendChild(crear('h2', null, titulo));
    if (texto) v.appendChild(crear('p', 'suave', texto));
    return v;
  };

  const subtitulo = (it, conTipo) => {
    const partes = [];
    if (conTipo && TIPOS[it.tipo]) partes.push(TIPOS[it.tipo]);
    if (it.sub) partes.push(it.sub);
    return partes.join(' · ');
  };

  // Tocar un elemento: lo que se abre (album, artista, playlist) abre su pagina;
  // lo demas suena.
  const usar = async (it) => {
    if (it.abre) { abrirDetalle(it); return; }
    try { await orden('tocar', { ref: it.ref }); aviso(T('Sonando en el PC')); } catch (e) { /* ya avisado */ }
  };

  const filaDe = (it, opciones = {}) => {
    const fila = crear('div', 'fila' + (it.tipo === 'artista' ? ' redonda' : ''));
    const cuerpo = crear('button', 'fila-cuerpo');
    cuerpo.type = 'button';
    if (opciones.numero) cuerpo.appendChild(crear('span', 'numero', String(opciones.numero)));
    else {
      const img = crear('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      ponerImg(img, it.img);
      if (!img.getAttribute('src')) cuerpo.appendChild(crear('div', 'sin-imagen'));
      else cuerpo.appendChild(img);
    }
    const t = crear('div', 'fila-texto');
    t.appendChild(crear('strong', null, it.titulo));
    const sub = crear('span');
    if (it.explicito) { const e = crear('span', 'explicito', 'E'); e.setAttribute('aria-label', T('Explícito')); sub.appendChild(e); }
    sub.appendChild(document.createTextNode(subtitulo(it, opciones.conTipo) + (it.dur ? (it.sub ? ' · ' : '') + it.dur : '')));
    t.appendChild(sub);
    cuerpo.appendChild(t);
    cuerpo.addEventListener('click', () => usar(it));
    fila.appendChild(cuerpo);
    if (it.encola || it.toca || it.radio) {
      const m = crear('button', 'icono-boton');
      m.type = 'button';
      m.setAttribute('aria-label', T('Más opciones de ') + it.titulo);
      m.appendChild(icono('mas'));
      m.addEventListener('click', () => abrirHoja(it));
      fila.appendChild(m);
    }
    return fila;
  };

  const tarjetaDe = (it) => {
    const b = crear('button', 'tarjeta' + (it.tipo === 'artista' ? ' redonda' : ''));
    b.type = 'button';
    const img = crear('img');
    img.alt = '';
    img.loading = 'lazy';
    ponerImg(img, it.img);
    b.appendChild(img.getAttribute('src') ? img : crear('div', 'sin-imagen'));
    b.appendChild(crear('strong', null, it.titulo));
    if (it.sub) b.appendChild(crear('span', null, it.sub));
    b.addEventListener('click', () => usar(it));
    let pulsado = 0;
    b.addEventListener('touchstart', () => { pulsado = setTimeout(() => { pulsado = -1; abrirHoja(it); }, 500); }, { passive: true });
    b.addEventListener('touchend', (e) => { if (pulsado === -1) e.preventDefault(); clearTimeout(pulsado); });
    b.addEventListener('touchmove', () => clearTimeout(pulsado), { passive: true });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); abrirHoja(it); });
    return b;
  };

  // Un grupo se pinta como carrusel si casi todo son tarjetas (albumes, playlists,
  // artistas) y como filas si hay canciones.
  const pintarSecciones = (cont, secciones, opciones = {}) => {
    for (const g of secciones) {
      if (!g.items.length) continue;
      const bloque = crear('section', 'grupo');
      if (g.titulo) bloque.appendChild(crear('h2', null, g.titulo));
      const abren = g.items.filter((x) => x.abre).length;
      if (!opciones.siempreFilas && g.items.length > 2 && abren / g.items.length > 0.7) {
        const c = crear('div', 'carrusel');
        for (const it of g.items) c.appendChild(tarjetaDe(it));
        bloque.appendChild(c);
      } else {
        const f = crear('div', 'filas');
        g.items.forEach((it, i) => f.appendChild(filaDe(it, { conTipo: opciones.conTipo, numero: opciones.numerar && !it.img ? i + 1 : 0 })));
        bloque.appendChild(f);
      }
      cont.appendChild(bloque);
    }
  };

  const botonMas = (cont, ref, opciones) => {
    if (!ref) return;
    const caja = crear('div', 'mas');
    const b = crear('button', 'boton', T('Cargar más'));
    b.type = 'button';
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.textContent = T('Cargando…');
      try {
        const d = await orden('mas', { ref });
        caja.remove();
        const m = d.mas || {};
        pintarSecciones(cont, m.secciones || [], Object.assign({}, opciones, { siempreFilas: true }));
        botonMas(cont, m.mas, opciones);
      } catch (e) {
        b.disabled = false;
        b.textContent = T('Cargar más');
      }
    });
    caja.appendChild(b);
    cont.appendChild(caja);
  };

  // --- Hoja de acciones ---------------------------------------------------------
  const cerrarHoja = () => { $('hoja').hidden = true; $('hoja-fondo').hidden = true; };
  $('hoja-fondo').addEventListener('click', cerrarHoja);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });
  const abrirHoja = (it) => {
    ponerImg($('hoja-img'), it.img);
    $('hoja-titulo').textContent = it.titulo;
    $('hoja-sub').textContent = subtitulo(it, true);
    const acc = $('hoja-acciones');
    acc.replaceChildren();
    const accion = (ic, texto, fn) => {
      const b = crear('button', 'accion');
      b.type = 'button';
      b.append(icono(ic), document.createTextNode(texto));
      b.addEventListener('click', async () => { cerrarHoja(); try { await fn(); } catch (e) { /* ya avisado */ } });
      acc.appendChild(b);
    };
    if (it.toca) accion('play', T('Reproducir'), async () => { await orden('tocar', { ref: it.ref }); aviso(T('Sonando en el PC')); });
    if (it.abre && it.toca) accion('aleatorio', T('Reproducir en aleatorio'), async () => { await orden('tocar', { ref: it.ref, modo: 'aleatorio' }); aviso(T('Sonando en aleatorio')); });
    if (it.encola) {
      accion('siguientecola', T('Reproducir a continuación'), async () => { await orden('encolar', { ref: it.ref, donde: 'siguiente' }); aviso(T('Sonará a continuación')); });
      accion('anadir', T('Añadir a la cola'), async () => { await orden('encolar', { ref: it.ref, donde: 'final' }); aviso(T('Añadido a la cola')); });
    }
    if (it.radio) accion('radio', T('Iniciar radio'), async () => { await orden('tocar', { ref: it.ref, modo: 'radio' }); aviso(T('Radio en el PC')); });
    if (it.abre) accion('lista', T('Abrir'), async () => abrirDetalle(it));
    $('hoja-fondo').hidden = false;
    $('hoja').hidden = false;
  };

  // --- Pagina de detalle -----------------------------------------------------------
  const pintarPagina = (p, titulo) => {
    const cont = $('pagina');
    cont.replaceChildren();
    const cab = crear('div', 'pagina-cabeza' + (p.tipo === 'artista' ? ' redonda' : ''));
    if (imgSegura(p.img)) { const img = crear('img'); img.alt = ''; ponerImg(img, p.img); cab.appendChild(img); }
    cab.appendChild(crear('h2', null, p.titulo || titulo));
    if (p.sub) cab.appendChild(crear('p', 'suave', p.sub));
    const acc = crear('div', 'pagina-acciones');
    const boton = (ic, texto, ref, primario, avisoTxt) => {
      if (!ref) return;
      const b = crear('button', 'boton' + (primario ? ' primario' : ''));
      b.type = 'button';
      b.append(icono(ic), document.createTextNode(texto));
      b.addEventListener('click', async () => { try { await orden('tocar', { ref }); aviso(avisoTxt); } catch (e) { /* ya avisado */ } });
      acc.appendChild(b);
    };
    boton('play', T('Reproducir'), p.reproducir, true, T('Sonando en el PC'));
    boton('aleatorio', T('Aleatorio'), p.aleatorio, false, T('Sonando en aleatorio'));
    boton('radio', T('Radio'), p.radio, false, T('Radio en el PC'));
    if (acc.children.length) cab.appendChild(acc);
    cont.appendChild(cab);
    const op = { numerar: true };
    pintarSecciones(cont, p.secciones || [], op);
    if (!(p.secciones || []).length) cont.appendChild(vacio(T('Aquí no hay nada'), T('Esta página no tiene canciones que mostrar.')));
    botonMas(cont, p.mas, op);
  };
  const abrirDetalle = async (it) => {
    if (vistaActual !== 'pagina') volverA = vistaActual;
    if (pila.length) pila[pila.length - 1].scroll = window.scrollY;
    const cont = $('pagina');
    cont.replaceChildren(esqueleto(8));
    const entrada = { titulo: it.titulo, datos: null, desde: volverA };
    pila.push(entrada);
    irA('pagina', { titulo: it.titulo });
    try {
      const d = await orden('abrir', { ref: it.ref });
      if (!d.pagina) { pila.pop(); irA(volverA); return; }
      d.pagina.tipo = it.tipo;
      entrada.datos = d.pagina;
      if (pila[pila.length - 1] === entrada) pintarPagina(d.pagina, it.titulo);
    } catch (e) {
      if (pila[pila.length - 1] === entrada) cont.replaceChildren(vacio(T('No se pudo abrir'), T('Vuelve atrás e inténtalo otra vez.')));
    }
  };

  // --- Buscar -------------------------------------------------------------------
  let busquedaActual = '';
  let filtroActual = null;
  let timerSug = 0;
  let pedidaSug = 0;
  const q = $('q');

  const buscar = async (texto, filtro) => {
    texto = texto.trim();
    if (!texto) return;
    busquedaActual = texto;
    filtroActual = filtro || null;
    q.blur();
    $('sugerencias').hidden = true;
    const res = $('resultados');
    res.replaceChildren(esqueleto(8));
    try {
      const args = { q: texto };
      if (filtro) args.filtro = filtro;
      const d = await orden('buscar', args);
      if (busquedaActual !== texto) return;
      const b = d.busqueda || {};
      pintarFiltros(b.filtros || [], texto);
      res.replaceChildren();
      if (!(b.secciones || []).length) { res.appendChild(vacio(T('Sin resultados'), T('Prueba con otras palabras.'))); return; }
      pintarSecciones(res, b.secciones, { conTipo: !filtro, siempreFilas: true });
      botonMas(res, b.mas, { conTipo: !filtro });
    } catch (e) {
      res.replaceChildren(vacio(T('No se pudo buscar'), T('Comprueba que YouTube Music sigue abierto en el PC.')));
    }
  };

  const pintarFiltros = (filtros, texto) => {
    const c = $('filtros');
    c.replaceChildren();
    if (!filtros.length) { c.hidden = true; return; }
    const chip = (nombre, ref, puesto) => {
      const b = crear('button', 'chip', nombre);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!!puesto));
      b.addEventListener('click', () => buscar(texto, ref));
      c.appendChild(b);
    };
    chip(T('Todo'), null, !filtros.some((f) => f.puesto));
    for (const f of filtros) chip(f.nombre, f.puesto ? null : f.ref, f.puesto);
    c.hidden = false;
  };

  const sugerir = async () => {
    const texto = q.value.trim();
    const n = ++pedidaSug;
    if (!texto) { $('sugerencias').hidden = true; return; }
    try {
      const d = await orden('sugerir', { q: texto });
      if (n !== pedidaSug || document.activeElement !== q) return;
      const s = d.sugerencias || {};
      const c = $('sugerencias');
      c.replaceChildren();
      for (const t of s.textos || []) {
        const b = crear('button', 'sugerencia');
        b.type = 'button';
        b.append(icono('buscar'), document.createTextNode(t));
        b.addEventListener('click', () => { q.value = t; buscar(t); });
        c.appendChild(b);
      }
      if ((s.items || []).length) {
        const f = crear('div', 'filas');
        for (const it of s.items) f.appendChild(filaDe(it, { conTipo: true }));
        c.appendChild(f);
      }
      c.hidden = !c.children.length;
    } catch (e) { /* sin sugerencias */ }
  };

  q.addEventListener('input', () => {
    $('q-borrar').hidden = !q.value;
    clearTimeout(timerSug);
    timerSug = setTimeout(sugerir, 220);
  });
  q.addEventListener('focus', () => { if (q.value.trim()) sugerir(); });
  $('form-buscar').addEventListener('submit', (e) => { e.preventDefault(); buscar(q.value); });
  $('q-borrar').addEventListener('click', () => {
    q.value = '';
    $('q-borrar').hidden = true;
    $('sugerencias').hidden = true;
    $('filtros').hidden = true;
    $('resultados').replaceChildren();
    q.focus();
  });

  // --- Inicio -------------------------------------------------------------------
  // La portada de YouTube Music: sugeridos, escuchado hace poco, mezclas... Se
  // pide al entrar y se vuelve a pedir si han pasado mas de 10 minutos.
  let inicioPedido = 0;
  const cargarInicio = async (forzar) => {
    if (!forzar && Date.now() - inicioPedido < 10 * 60 * 1000) return;
    inicioPedido = Date.now();
    const cont = $('inicio');
    if (!cont.children.length) cont.replaceChildren(esqueleto(8));
    try {
      const d = await orden('pagina', { id: 'inicio' });
      const p = d.pagina || {};
      cont.replaceChildren();
      if (!(p.secciones || []).length) { cont.appendChild(vacio(T('Nada que sugerir todavía'), T('Pon algo de música y YouTube Music empezará a recomendarte.'))); return; }
      pintarSecciones(cont, p.secciones, {});
      botonMas(cont, p.mas, {});
    } catch (e) {
      inicioPedido = 0;
      if (e.estado !== 401) cont.replaceChildren(vacio(T('No se pudo cargar el inicio'), T('Comprueba que YouTube Music sigue abierto en el PC.')));
    }
  };

  // --- Biblioteca ---------------------------------------------------------------
  const BIBLIOTECA = [
    ['biblioteca', T('Playlists')],
    ['megusta', T('Me gusta')],
    ['albumes', T('Álbumes')],
    ['artistas', T('Artistas')],
    ['canciones', T('Canciones')],
    ['historial', T('Historial')],
    ['inicio', T('Para ti')],
  ];
  let bibliotecaCargada = false;
  let paginaBiblio = 'biblioteca';
  const chipsBiblio = () => {
    const c = $('biblio-chips');
    c.replaceChildren();
    for (const [id, nombre] of BIBLIOTECA) {
      const b = crear('button', 'chip', nombre);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(id === paginaBiblio));
      b.addEventListener('click', () => abrirBiblioteca(id));
      c.appendChild(b);
    }
  };
  const abrirBiblioteca = async (id) => {
    paginaBiblio = id;
    bibliotecaCargada = true;
    chipsBiblio();
    const cont = $('biblio');
    cont.replaceChildren(esqueleto(8));
    try {
      const d = await orden('pagina', { id });
      if (paginaBiblio !== id) return;
      const p = d.pagina || {};
      cont.replaceChildren();
      if (id === 'megusta' && (p.reproducir || p.aleatorio)) {
        const acc = crear('div', 'pagina-acciones');
        acc.style.justifyContent = 'flex-start';
        acc.style.paddingTop = '12px';
        for (const [ic, txt, ref, prim] of [['play', T('Reproducir'), p.reproducir, true], ['aleatorio', T('Aleatorio'), p.aleatorio, false]]) {
          if (!ref) continue;
          const b = crear('button', 'boton' + (prim ? ' primario' : ''));
          b.type = 'button';
          b.append(icono(ic), document.createTextNode(txt));
          b.addEventListener('click', () => orden('tocar', { ref }).then(() => aviso(T('Sonando en el PC')), () => {}));
          acc.appendChild(b);
        }
        cont.appendChild(acc);
      }
      if (!(p.secciones || []).length) {
        cont.appendChild(vacio(T('Aquí no hay nada'), E && E.listo && !E.sesion ? T('Inicia sesión en YouTube Music en el PC para ver tu biblioteca.') : T('Esta sección está vacía.')));
        return;
      }
      pintarSecciones(cont, p.secciones, { siempreFilas: id !== 'inicio' });
      botonMas(cont, p.mas, { siempreFilas: true });
    } catch (e) {
      cont.replaceChildren(vacio(T('No se pudo cargar'), T('Comprueba que YouTube Music sigue abierto en el PC.')));
    }
  };

  // --- Cola -----------------------------------------------------------------------
  let pidiendoCola = false;
  const cargarCola = async () => {
    if (pidiendoCola) return;
    pidiendoCola = true;
    const cont = $('cola');
    if (!cont.children.length) cont.replaceChildren(esqueleto(8));
    try {
      const d = await orden('cola');
      const c = d.cola || { items: [] };
      cont.replaceChildren();
      if (!c.items.length) { cont.appendChild(vacio(T('La cola está vacía'), T('Busca algo y pulsa «Añadir a la cola».'))); return; }
      const f = crear('div', 'filas');
      let actual = null;
      for (const it of c.items) {
        const fila = crear('div', 'fila' + (it.actual ? ' actual' : ''));
        const b = crear('button', 'fila-cuerpo');
        b.type = 'button';
        const img = crear('img');
        img.alt = '';
        img.loading = 'lazy';
        ponerImg(img, it.img);
        b.appendChild(img.getAttribute('src') ? img : crear('div', 'sin-imagen'));
        const t = crear('div', 'fila-texto');
        t.appendChild(crear('strong', null, it.titulo));
        t.appendChild(crear('span', null, [it.sub, it.dur].filter(Boolean).join(' · ')));
        b.appendChild(t);
        if (it.actual) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => { if (!it.actual) orden('saltar', { i: it.i }).catch(() => {}); });
        fila.appendChild(b);
        f.appendChild(fila);
        if (it.actual) actual = fila;
      }
      cont.appendChild(f);
      if (c.total > c.desde + c.items.length) cont.appendChild(crear('p', 'suave mas', (ES ? `Y ${c.total - c.desde - c.items.length} más` : `And ${c.total - c.desde - c.items.length} more`)));
      if (actual && vistaActual === 'cola') actual.scrollIntoView({ block: 'center' });
    } catch (e) {
      cont.replaceChildren(vacio(T('No se pudo cargar la cola'), T('Comprueba que YouTube Music sigue abierto en el PC.')));
    } finally {
      pidiendoCola = false;
    }
  };

  // --- Letra ---------------------------------------------------------------------
  // La pone Zen Letra Viva en el PC. Aqui solo se pinta y se sigue el reloj: la
  // linea que toca es la del instante (posicion - desfase), igual que en el PC.
  let L = null;
  let letraIndice = -1;
  let tocadoLetra = 0;
  let pidiendoLetra = 0;
  $('b-letra').addEventListener('click', () => { cerrarSonando(); irA('letra'); });
  const contLetra = $('letra');
  for (const ev of ['touchmove', 'wheel']) contLetra.addEventListener(ev, () => { tocadoLetra = Date.now(); }, { passive: true });

  const cargarLetra = async () => {
    const n = ++pidiendoLetra;
    if (!contLetra.children.length) contLetra.replaceChildren(esqueleto(6));
    try {
      const d = await orden('letra');
      if (n !== pidiendoLetra) return;
      L = d.letra || { disponible: false };
      pintarLetra();
    } catch (e) {
      if (n === pidiendoLetra) contLetra.replaceChildren(vacio(T('No se pudo traer la letra'), T('Comprueba que YouTube Music sigue abierto en el PC.')));
    }
  };

  const pintarLetra = () => {
    letraIndice = -1;
    contLetra.classList.remove('plana');
    if (!L.disponible) {
      contLetra.replaceChildren(vacio(T('Letra Viva no está en el PC'), T('La letra sale del mod Zen Letra Viva. Instálalo en Zen y aparecerá aquí.')));
      return;
    }
    if (L.clave === 'buscando' || L.clave === 'vacio') {
      contLetra.replaceChildren(vacio(T('Buscando la letra…')));
      return;
    }
    if (!L.lineas.length) {
      contLetra.replaceChildren(vacio(L.clave === 'instrumental' ? T('Instrumental') : T('Sin letra'), L.clave === 'instrumental' ? '' : (L.mensaje || T('Nadie tiene la letra de esta canción.'))));
      return;
    }
    const frag = document.createDocumentFragment();
    if (!L.sincronizada) {
      contLetra.classList.add('plana');
      frag.appendChild(crear('p', 'letra-nota', T('Esta letra no tiene tiempos: no se puede seguir.')));
    }
    L.lineas.forEach((l, i) => {
      const b = crear(L.sincronizada ? 'button' : 'p', 'letra-linea' + (l.p ? ' pausa' : ''), l.p ? '•••' : (l.t || ' '));
      if (L.sincronizada) {
        b.type = 'button';
        b.dataset.i = String(i);
        b.addEventListener('click', () => {
          const s = Math.max(0, l.i + (L.desfase || 0));
          if (E && E.listo) { E.pos = s; recibido = Date.now(); edad = 0; }
          tocadoLetra = 0;
          orden('posicion', { s }).catch(() => {});
        });
      }
      frag.appendChild(b);
    });
    if (L.fuente) frag.appendChild(crear('p', 'letra-nota', T('Letra: ') + L.fuente));
    contLetra.replaceChildren(frag);
    seguirLetra(true);
  };

  const seguirLetra = (forzar) => {
    if (vistaActual !== 'letra' || !L || !L.sincronizada || !L.lineas.length) return;
    const t = posicion() - (L.desfase || 0);
    let idx = -1;
    for (let i = 0; i < L.lineas.length; i++) { if (L.lineas[i].i <= t) idx = i; else break; }
    if (idx === letraIndice && !forzar) return;
    letraIndice = idx;
    const nodos = contLetra.querySelectorAll('.letra-linea');
    nodos.forEach((n, i) => {
      n.classList.toggle('actual', i === idx);
      n.classList.toggle('pasada', i < idx);
    });
    // Si el usuario esta desplazando a mano, se le deja tres segundos.
    if (idx >= 0 && Date.now() - tocadoLetra > 3000) {
      const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      nodos[idx].scrollIntoView({ block: 'center', behavior: forzar || reducir ? 'auto' : 'smooth' });
    }
  };
  setInterval(() => { if (document.visibilityState === 'visible') seguirLetra(false); }, 200);

  // --- Arranque --------------------------------------------------------------------
  const arrancar = async () => {
    try {
      await api('/api/yo');
    } catch (e) {
      if (e.estado !== 401) { $('conexion').hidden = false; setTimeout(arrancar, 3000); }
      return;
    }
    $('conexion').hidden = true;
    $('vista-cargando').hidden = true;
    $('vista-emparejar').hidden = true;
    $('app').hidden = false;
    irA('inicio');
    if (!activo) bucleEstado();
  };

  // El QR del PC trae el codigo en el fragmento (#c=123456): no viaja al servidor
  // en la url, y se borra de la barra en cuanto se lee.
  // iOS restaura la app de la pantalla de inicio desde memoria: si se quedo a medio
  // arrancar, se vuelve a intentar.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && $('app').hidden && $('vista-emparejar').hidden) arrancar();
  });

  const m = location.hash.match(/(?:^#|&)c=(\d{6})\b/);
  if (m) {
    history.replaceState(null, '', location.pathname);
    emparejar(m[1]);
  } else arrancar();
})();

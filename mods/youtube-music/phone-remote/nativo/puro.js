/* Zen Remoto — la parte pura. Sin DOM, sin red: se prueba en node con las
 * respuestas reales guardadas en mods/youtube-music/phone-remote/sonda/muestras (dev/tools/probar-remoto.mjs).
 *
 * Dos cosas:
 *
 *   Extraer   convierte lo que devuelve la API interna de YouTube Music (la misma
 *             que usa la pagina: /search, /browse, /music/get_queue) en listas
 *             planas que el movil sabe pintar.
 *   Validar   el esquema de cada orden que llega del movil. Lo comprueba el
 *             servidor ANTES de pasarla a la pagina, y la pagina otra vez.
 *
 * EL EXTRACTOR NO SIGUE LA FORMA DE CADA PAGINA, BUSCA LOS ELEMENTOS ---------------
 * YouTube Music cambia la disposicion de sus respuestas a menudo: la busqueda paso
 * de un `musicShelfRenderer` por tipo a un `itemSectionRenderer` por resultado sin
 * avisar. Lo que casi no cambia son los elementos: `musicResponsiveListItemRenderer`
 * (filas), `musicTwoRowItemRenderer` (tarjetas), `musicCardShelfRenderer` (el
 * resultado destacado) y `playlistPanelVideoRenderer` (la cola). Asi que se recorre
 * el arbol entero, se agrupa por la estantería que los contiene y se lee cada
 * elemento por su cuenta. Una disposicion nueva cambia los grupos, no rompe la lista.
 *
 * LOS ENDPOINTS NO SALEN DE LA PAGINA -------------------------------------------
 * Cada elemento trae sus endpoints (reproducir, abrir, encolar). No viajan al movil:
 * el motor los guarda y el movil recibe una referencia corta. Asi el movil no puede
 * pedirle a la pagina que ejecute un endpoint inventado, solo uno que la propia
 * pagina le dio. Aqui los endpoints se devuelven tal cual; los guarda `ref` (que
 * pasa el motor).
 */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.ZenRemotoPuro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // --- Texto ------------------------------------------------------------------
  const texto = (t) => {
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t.simpleText) return String(t.simpleText);
    if (Array.isArray(t.runs)) return t.runs.map((r) => (r && r.text) || '').join('');
    if (t.content) return String(t.content);
    return '';
  };

  // Las palabras con las que YouTube Music etiqueta el tipo en el subtitulo. Van en
  // los idiomas que se pueden ver en la cuenta del usuario; si no casa ninguna, el
  // tipo sale del endpoint, que no depende del idioma.
  const ETIQUETAS = /^(song|canci[oó]n|video|v[ií]deo|album|[aá]lbum|single|sencillo|ep|artist|artista|playlist|lista|episode|episodio|podcast|profile|perfil)$/i;

  const quitarEtiqueta = (partes) => (partes.length > 1 && ETIQUETAS.test(partes[0].trim()) ? partes.slice(1) : partes);

  // " • " separa los campos del subtitulo. Se parte por runs, no por texto, para no
  // romper titulos que llevan un punto medio de verdad.
  const camposDe = (t) => {
    if (!t || !Array.isArray(t.runs)) return texto(t) ? [texto(t)] : [];
    const out = [];
    let actual = '';
    for (const r of t.runs) {
      const s = (r && r.text) || '';
      if (s.trim() === '•') { if (actual.trim()) out.push(actual.trim()); actual = ''; } else actual += s;
    }
    if (actual.trim()) out.push(actual.trim());
    return out;
  };

  // --- Imagen -----------------------------------------------------------------
  // La mas cercana a `ancho` por arriba. Las de googleusercontent llevan el tamano en
  // la url (=w120-h120) y se pueden pedir mas grandes, pero no se toca: lo que se
  // pide de mas es ancho de banda del movil.
  const imagen = (nodo, ancho = 226) => {
    const lista = [];
    const juntar = (o, prof) => {
      if (!o || typeof o !== 'object' || prof > 6) return;
      if (Array.isArray(o.thumbnails)) { lista.push(...o.thumbnails); return; }
      for (const k of ['thumbnail', 'musicThumbnailRenderer', 'thumbnailRenderer', 'croppedSquareThumbnailRenderer', 'foregroundThumbnail']) {
        if (o[k]) juntar(o[k], prof + 1);
      }
    };
    juntar(nodo, 0);
    const validas = lista.filter((x) => x && typeof x.url === 'string' && /^https:\/\//.test(x.url));
    if (!validas.length) return '';
    validas.sort((a, b) => (a.width || 0) - (b.width || 0));
    const buena = validas.find((x) => (x.width || 0) >= ancho) || validas[validas.length - 1];
    return buena.url;
  };

  // --- Endpoints --------------------------------------------------------------
  const esReproducir = (ep) => !!(ep && (ep.watchEndpoint || ep.watchPlaylistEndpoint));
  const esAbrir = (ep) => !!(ep && ep.browseEndpoint && typeof ep.browseEndpoint.browseId === 'string');

  const tipoDePagina = (ep) => {
    try { return ep.browseEndpoint.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType || ''; } catch (e) { return ''; }
  };
  const tipoDeVideo = (ep) => {
    try { return ep.watchEndpoint.watchEndpointMusicSupportedConfigs.watchEndpointMusicConfig.musicVideoType || ''; } catch (e) { return ''; }
  };

  const TIPO_PAGINA = {
    MUSIC_PAGE_TYPE_ALBUM: 'album',
    MUSIC_PAGE_TYPE_AUDIOBOOK: 'album',
    MUSIC_PAGE_TYPE_ARTIST: 'artista',
    MUSIC_PAGE_TYPE_USER_CHANNEL: 'artista',
    MUSIC_PAGE_TYPE_LIBRARY_ARTIST: 'artista',
    MUSIC_PAGE_TYPE_PLAYLIST: 'playlist',
    MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE: 'podcast',
    MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE: 'episodio',
  };

  // Primer endpoint que cumpla `cond` buscando en las claves de siempre, a poca
  // profundidad: el de la portada, el del titulo o el del propio elemento.
  const endpointEn = (nodo, cond) => {
    const ver = [];
    const meter = (x) => { if (x && typeof x === 'object') ver.push(x); };
    meter(nodo && nodo.navigationEndpoint);
    meter(nodo && nodo.onTap);
    try { meter(nodo.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint); } catch (e) { /* sin portada */ }
    try { meter(nodo.thumbnailOverlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint); } catch (e) { /* sin portada */ }
    const columnas = (nodo && nodo.flexColumns) || [];
    for (const c of columnas) {
      const runs = (c && c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text && c.musicResponsiveListItemFlexColumnRenderer.text.runs) || [];
      for (const r of runs) meter(r && r.navigationEndpoint);
    }
    if (nodo && nodo.title && Array.isArray(nodo.title.runs)) for (const r of nodo.title.runs) meter(r && r.navigationEndpoint);
    return ver.find(cond) || null;
  };

  // Las entradas del menu de tres puntos que interesan: reproducir a continuacion,
  // anadir a la cola, aleatorio, mezcla (radio) y las paginas de artista y album.
  const menuDe = (nodo) => {
    const out = {};
    const items = (nodo && nodo.menu && nodo.menu.menuRenderer && nodo.menu.menuRenderer.items) || [];
    for (const it of items) {
      const nav = it.menuNavigationItemRenderer;
      const srv = it.menuServiceItemRenderer;
      if (srv && srv.serviceEndpoint && srv.serviceEndpoint.queueAddEndpoint) {
        const q = srv.serviceEndpoint.queueAddEndpoint;
        const clave = q.queueInsertPosition === 'INSERT_AFTER_CURRENT_VIDEO' ? 'siguiente' : 'final';
        if (q.queueTarget && !out[clave]) out[clave] = { queueTarget: q.queueTarget, posicion: q.queueInsertPosition };
      }
      if (nav && nav.navigationEndpoint) {
        const icono = (nav.icon && nav.icon.iconType) || '';
        const ep = nav.navigationEndpoint;
        if (icono === 'MUSIC_SHUFFLE' && esReproducir(ep) && !out.aleatorio) out.aleatorio = ep;
        else if (icono === 'MIX' && esReproducir(ep) && !out.radio) out.radio = ep;
        else if (icono === 'ARTIST' && esAbrir(ep) && !out.artista) out.artista = ep;
        else if (icono === 'ALBUM' && esAbrir(ep) && !out.album) out.album = ep;
      }
    }
    return out;
  };

  const duracionEn = (nodo) => {
    const fijas = (nodo && nodo.fixedColumns) || [];
    for (const f of fijas) {
      const t = texto(f && f.musicResponsiveListItemFixedColumnRenderer && f.musicResponsiveListItemFixedColumnRenderer.text);
      if (/^\d+(:\d\d)+$/.test(t.trim())) return t.trim();
    }
    return '';
  };

  // --- Elementos --------------------------------------------------------------
  // Cada uno devuelve { tipo, titulo, sub, img, dur, explicito, videoId, ep, menu }
  // o null si no se puede ni reproducir ni abrir (los avisos, los anuncios).
  const fila = (n) => {
    const cols = (n.flexColumns || []).map((c) => c && c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text);
    const titulo = texto(cols[0]);
    let partes = [];
    for (const c of cols.slice(1)) partes = partes.concat(camposDe(c));
    const etiqueta = partes.length ? partes[0].trim() : '';
    partes = quitarEtiqueta(partes);

    const reproducir = endpointEn(n, esReproducir);
    const abrir = esAbrir(n.navigationEndpoint) ? n.navigationEndpoint : null;
    const menu = menuDe(n);
    let videoId = (n.playlistItemData && n.playlistItemData.videoId) || '';
    if (!videoId && reproducir && reproducir.watchEndpoint) videoId = reproducir.watchEndpoint.videoId || '';

    let tipo;
    if (abrir) tipo = TIPO_PAGINA[tipoDePagina(abrir)] || 'otro';
    else if (reproducir && reproducir.watchEndpoint) {
      // Las pistas de un album llevan a veces el tipo del videoclip (OMV) aunque
      // sean la cancion: solo es video si la etiqueta lo dice o si es de usuario.
      const tv = tipoDeVideo(reproducir);
      tipo = tv === 'MUSIC_VIDEO_TYPE_PODCAST_EPISODE' ? 'episodio'
        : /^v[ií]deo$/i.test(etiqueta) || tv === 'MUSIC_VIDEO_TYPE_UGC' ? 'video'
        : 'cancion';
    } else if (reproducir) tipo = 'playlist';
    else return null;

    const badges = JSON.stringify(n.badges || []);
    return {
      tipo,
      titulo,
      sub: partes.join(' · '),
      img: imagen(n),
      dur: duracionEn(n),
      explicito: /EXPLICIT/.test(badges),
      videoId,
      ep: abrir || reproducir,
      reproducir: abrir ? reproducir : null,
      menu,
    };
  };

  const tarjeta = (n) => {
    const titulo = texto(n.title);
    const partes = quitarEtiqueta(camposDe(n.subtitle));
    const abrir = esAbrir(n.navigationEndpoint) ? n.navigationEndpoint : null;
    const reproducir = endpointEn(n, esReproducir);
    if (!abrir && !reproducir) return null;
    let tipo;
    if (abrir) tipo = TIPO_PAGINA[tipoDePagina(abrir)] || 'otro';
    else if (reproducir.watchEndpoint) tipo = tipoDeVideo(reproducir) === 'MUSIC_VIDEO_TYPE_ATV' ? 'cancion' : 'video';
    else tipo = 'playlist';
    return {
      tipo,
      titulo,
      sub: partes.join(' · '),
      img: imagen(n.thumbnailRenderer || n),
      dur: '',
      explicito: /EXPLICIT/.test(JSON.stringify(n.subtitleBadges || [])),
      videoId: (reproducir && reproducir.watchEndpoint && reproducir.watchEndpoint.videoId) || '',
      ep: abrir || reproducir,
      reproducir: abrir ? reproducir : null,
      menu: menuDe(n),
    };
  };

  const destacado = (n) => {
    const ep = (n.title && n.title.runs && n.title.runs[0] && n.title.runs[0].navigationEndpoint) || n.onTap || null;
    const reproducir = endpointEn(n, esReproducir);
    if (!esAbrir(ep) && !reproducir) return null;
    const abrir = esAbrir(ep) ? ep : null;
    let tipo = abrir ? (TIPO_PAGINA[tipoDePagina(abrir)] || 'otro') : (tipoDeVideo(reproducir) === 'MUSIC_VIDEO_TYPE_ATV' ? 'cancion' : 'video');
    return {
      tipo,
      titulo: texto(n.title),
      sub: quitarEtiqueta(camposDe(n.subtitle)).join(' · '),
      img: imagen(n),
      dur: '',
      explicito: false,
      videoId: (reproducir && reproducir.watchEndpoint && reproducir.watchEndpoint.videoId) || '',
      ep: abrir || reproducir,
      reproducir: abrir ? reproducir : null,
      menu: menuDe(n),
    };
  };

  // Un elemento de la cola. Puede venir envuelto: cuando hay version de audio y de
  // video, la cola guarda las dos y suena la "primaria".
  const deCola = (x) => {
    const r = (x && x.playlistPanelVideoRenderer)
      || (x && x.playlistPanelVideoWrapperRenderer && x.playlistPanelVideoWrapperRenderer.primaryRenderer && x.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer);
    if (!r) return null;
    const partes = camposDe(r.longBylineText || r.shortBylineText);
    return {
      titulo: texto(r.title),
      sub: partes.slice(0, 2).join(' · '),
      img: imagen(r, 120),
      dur: texto(r.lengthText),
      videoId: r.videoId || '',
      ep: r.navigationEndpoint || null,
      actual: !!r.selected,
    };
  };

  // --- Recorrido --------------------------------------------------------------
  const LECTORES = {
    musicResponsiveListItemRenderer: fila,
    musicTwoRowItemRenderer: tarjeta,
    musicCardShelfRenderer: destacado,
  };

  // Las estanterias dan el titulo del grupo. Una que no tenga titulo hereda el de
  // su madre, o se queda en '' y el movil la pinta sin cabecera.
  const tituloDeEstanteria = (k, v) => {
    if (k === 'musicCarouselShelfRenderer') {
      const h = v.header && (v.header.musicCarouselShelfBasicHeaderRenderer || v.header.musicCarouselShelfHeaderRenderer);
      return texto(h && h.title);
    }
    if (k === 'musicShelfRenderer' || k === 'musicPlaylistShelfRenderer' || k === 'gridRenderer') {
      const h = v.header && (v.header.musicShelfHeaderRenderer || v.header.gridHeaderRenderer);
      return texto(v.title) || texto(h && h.title);
    }
    if (k === 'musicCardShelfRenderer') return texto(v.header && v.header.musicCardShelfHeaderBasicRenderer && v.header.musicCardShelfHeaderBasicRenderer.title);
    return null;
  };
  const ESTANTERIAS = new Set(['musicCarouselShelfRenderer', 'musicShelfRenderer', 'musicPlaylistShelfRenderer', 'gridRenderer', 'musicCardShelfRenderer']);
  // Ramas que se saltan: menus, cabeceras de pagina y dialogos llevan endpoints pero
  // no son resultados.
  const SALTAR = new Set(['menu', 'menuRenderer', 'header', 'microformat', 'background', 'frameworkUpdates', 'continuationItemRenderer', 'modal', 'modalEndpoint', 'onEmptyQueue']);

  const secciones = (raizRespuesta, tope = 400) => {
    const grupos = [];
    let actual = null;
    let total = 0;
    const abrirGrupo = (titulo) => {
      if (actual && actual.titulo === titulo) return;
      actual = { titulo, items: [] };
      grupos.push(actual);
    };
    const visitar = (o, tituloHeredado, prof) => {
      if (!o || typeof o !== 'object' || prof > 40 || total >= tope) return;
      if (Array.isArray(o)) { for (const x of o) visitar(x, tituloHeredado, prof + 1); return; }
      for (const [k, v] of Object.entries(o)) {
        if (SALTAR.has(k) || !v || typeof v !== 'object') continue;
        let titulo = tituloHeredado;
        if (ESTANTERIAS.has(k)) {
          const t = tituloDeEstanteria(k, v);
          if (t !== null && t !== '') titulo = t;
        }
        const lector = LECTORES[k];
        if (lector) {
          let item = null;
          try { item = lector(v); } catch (e) { item = null; }
          if (item && (item.titulo || item.sub)) {
            if (!actual || actual.titulo !== (titulo || '')) abrirGrupo(titulo || '');
            actual.items.push(item);
            total++;
          }
          // El destacado de la busqueda lleva dentro sus propias filas (las
          // canciones del artista): se recorren en su propio grupo.
          if (k === 'musicCardShelfRenderer' && v.contents) visitar(v.contents, titulo || '', prof + 1);
          continue;
        }
        visitar(v, titulo, prof + 1);
      }
    };
    visitar(raizRespuesta && raizRespuesta.contents, '', 0);
    // La segunda columna del album (las canciones) va en secondaryContents, que ya
    // cuelga de contents. Lo de `continuationContents` es la pagina siguiente.
    if (raizRespuesta && raizRespuesta.continuationContents) visitar(raizRespuesta.continuationContents, '', 0);
    if (raizRespuesta && raizRespuesta.onResponseReceivedActions) visitar(raizRespuesta.onResponseReceivedActions, '', 0);
    return grupos.filter((g) => g.items.length);
  };

  // --- Paginas ----------------------------------------------------------------
  // Cabecera de album, playlist o artista: titulo, subtitulo, imagen y los endpoints
  // de reproducir y aleatorio. Una playlist ya no trae endpoint de reproducir (el
  // boton va por entidades), asi que se construye desde su browseId.
  const cabecera = (r, browseId) => {
    const buscar = (o, nombres, prof = 0) => {
      if (!o || typeof o !== 'object' || prof > 12) return null;
      for (const n of nombres) if (o[n]) return o[n];
      for (const v of Object.values(o)) {
        const x = buscar(v, nombres, prof + 1);
        if (x) return x;
      }
      return null;
    };
    const nombres = ['musicResponsiveHeaderRenderer', 'musicImmersiveHeaderRenderer', 'musicVisualHeaderRenderer', 'musicDetailHeaderRenderer', 'musicEditablePlaylistDetailHeaderRenderer', 'musicHeaderRenderer'];
    let h = buscar(r && r.header, nombres) || buscar(r && r.contents, nombres);
    if (h && h.header) h = buscar(h, nombres) || h;
    const out = { titulo: '', sub: '', img: '', reproducir: null, aleatorio: null, radio: null };
    if (h) {
      out.titulo = texto(h.title);
      const partes = [texto(h.straplineTextOne)].concat(camposDe(h.subtitle)).concat(camposDe(h.secondSubtitle)).filter(Boolean);
      out.sub = partes.join(' · ');
      out.img = imagen(h.thumbnail || h.foregroundThumbnail || h, 544);
      const botones = JSON.stringify([h.buttons, h.playButton, h.startRadioButton, h.menu]);
      try {
        const lista = JSON.parse(botones);
        const todos = [];
        const juntar = (o) => {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) { o.forEach(juntar); return; }
          for (const [k, v] of Object.entries(o)) {
            if ((k === 'navigationEndpoint' || k === 'playNavigationEndpoint') && esReproducir(v)) todos.push(v);
            else juntar(v);
          }
        };
        juntar(lista);
        const aleat = todos.find((e) => e.watchPlaylistEndpoint && /wAEB8gEC/.test(e.watchPlaylistEndpoint.params || ''));
        const radio = todos.find((e) => e.watchPlaylistEndpoint && /^RD/.test(e.watchPlaylistEndpoint.playlistId || ''));
        out.reproducir = todos.find((e) => e !== aleat && e !== radio) || null;
        out.aleatorio = aleat || null;
        out.radio = radio || null;
      } catch (e) { /* sin botones */ }
    }
    // Sin endpoint propio: la lista sale del browseId (VL<lista>) o de la primera
    // cancion que lo diga.
    let lista = '';
    if (typeof browseId === 'string' && /^VL./.test(browseId)) lista = browseId.slice(2);
    if (!lista && out.reproducir && out.reproducir.watchPlaylistEndpoint) lista = out.reproducir.watchPlaylistEndpoint.playlistId;
    // Solo en paginas con cabecera (album, playlist): el inicio o la biblioteca no
    // son una lista que se pueda tocar entera, aunque su primera fila lleve una.
    if (!lista && h) {
      const s = JSON.stringify((r && r.contents) || {});
      const m = s.match(/"watchEndpoint":\{"videoId":"[^"]+","playlistId":"([^"]+)"/);
      if (m) lista = m[1];
    }
    if (lista && /^[\w-]{2,80}$/.test(lista)) {
      if (!out.reproducir) out.reproducir = { watchPlaylistEndpoint: { playlistId: lista } };
      if (!out.aleatorio) out.aleatorio = { watchPlaylistEndpoint: { playlistId: lista, params: 'wAEB8gECKAE%3D' } };
    }
    return out;
  };

  // Token para pedir la pagina siguiente de una lista larga, si lo hay.
  const continuacion = (r) => {
    let token = null;
    const buscar = (o, prof) => {
      if (token || !o || typeof o !== 'object' || prof > 40) return;
      if (o.continuationCommand && typeof o.continuationCommand.token === 'string') { token = o.continuationCommand.token; return; }
      if (o.nextContinuationData && typeof o.nextContinuationData.continuation === 'string') { token = o.nextContinuationData.continuation; return; }
      for (const v of Object.values(o)) buscar(v, prof + 1);
    };
    buscar(r && (r.continuationContents || r.onResponseReceivedActions || r.contents), 0);
    return token;
  };

  // Los filtros de la busqueda (Canciones, Videos, Albumes...) son chips con su
  // propio `params`.
  const filtros = (r) => {
    const out = [];
    const buscar = (o, prof) => {
      if (!o || typeof o !== 'object' || prof > 14) return;
      if (o.chipCloudChipRenderer) {
        const c = o.chipCloudChipRenderer;
        const se = c.navigationEndpoint && c.navigationEndpoint.searchEndpoint;
        if (se && typeof se.params === 'string') out.push({ nombre: texto(c.text), params: se.params, puesto: !!c.isSelected });
        return;
      }
      for (const v of Object.values(o)) buscar(v, prof + 1);
    };
    buscar(r && r.contents, 0);
    return out;
  };

  const sugerencias = (r) => {
    const textos = [];
    const buscar = (o, prof) => {
      if (!o || typeof o !== 'object' || prof > 12) return;
      if (o.searchSuggestionRenderer) {
        const s = o.searchSuggestionRenderer;
        const q = s.navigationEndpoint && s.navigationEndpoint.searchEndpoint && s.navigationEndpoint.searchEndpoint.query;
        if (q) textos.push(String(q));
        return;
      }
      for (const v of Object.values(o)) buscar(v, prof + 1);
    };
    buscar(r && r.contents, 0);
    const items = [];
    for (const g of secciones(r, 10)) items.push(...g.items);
    return { textos: textos.slice(0, 8), items: items.slice(0, 5) };
  };

  // La respuesta de /music/get_queue trae los elementos listos para meter en la cola.
  const elementosDeCola = (r) => ((r && r.queueDatas) || []).map((x) => x && x.content).filter(Boolean);

  // --- Validar ----------------------------------------------------------------
  // Una orden es { orden, args }. Todo lo que no case con el esquema se rechaza con
  // un mensaje, nunca se corrige en silencio.
  const REF = /^[a-z0-9]{1,12}$/;
  const PAGINAS = ['inicio', 'biblioteca', 'megusta', 'historial', 'albumes', 'artistas', 'canciones'];

  const ESQUEMA = {
    alternar: {},
    reproducir: {},
    pausar: {},
    siguiente: {},
    anterior: {},
    posicion: { s: 'segundos' },
    volumen: { v: 'porcentaje' },
    silencio: { on: 'booleano' },
    megusta: { valor: ['LIKE', 'DISLIKE'] },
    aleatorio: {},
    repetir: {},
    saltar: { i: 'indice' },
    buscar: { q: 'consulta', filtro: 'filtro?' },
    sugerir: { q: 'consulta' },
    abrir: { ref: 'ref' },
    tocar: { ref: 'ref', modo: 'modo?' },
    encolar: { ref: 'ref', donde: ['siguiente', 'final'] },
    mas: { ref: 'ref' },
    pagina: { id: PAGINAS },
    cola: {},
    letra: {},
  };

  const validar = (o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: 'la orden no es un objeto' };
    const nombre = o.orden;
    if (typeof nombre !== 'string' || !Object.prototype.hasOwnProperty.call(ESQUEMA, nombre)) return { error: 'orden desconocida' };
    const esquema = ESQUEMA[nombre];
    const args = o.args === undefined ? {} : o.args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { error: 'args no es un objeto' };
    for (const k of Object.keys(args)) if (!Object.prototype.hasOwnProperty.call(esquema, k)) return { error: 'argumento de sobra: ' + k };
    const limpio = {};
    for (const [k, tipo] of Object.entries(esquema)) {
      const v = args[k];
      const opcional = typeof tipo === 'string' && tipo.endsWith('?');
      if (v === undefined || v === null) {
        if (opcional) continue;
        return { error: 'falta ' + k };
      }
      const t = typeof tipo === 'string' ? tipo.replace(/\?$/, '') : tipo;
      if (Array.isArray(t)) {
        if (!t.includes(v)) return { error: k + ' fuera de lista' };
      } else if (t === 'segundos') {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 86400) return { error: k + ' fuera de rango' };
      } else if (t === 'porcentaje') {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return { error: k + ' fuera de rango' };
      } else if (t === 'indice') {
        if (!Number.isInteger(v) || v < 0 || v > 20000) return { error: k + ' fuera de rango' };
      } else if (t === 'booleano') {
        if (typeof v !== 'boolean') return { error: k + ' no es booleano' };
      } else if (t === 'consulta') {
        if (typeof v !== 'string' || !v.trim() || v.length > 200) return { error: k + ' vacia o larga' };
      } else if (t === 'ref') {
        if (typeof v !== 'string' || !REF.test(v)) return { error: k + ' no es una referencia' };
      } else if (t === 'modo') {
        if (!['normal', 'aleatorio', 'radio'].includes(v)) return { error: k + ' fuera de lista' };
      } else if (t === 'filtro') {
        if (typeof v !== 'string' || !REF.test(v)) return { error: k + ' no es un filtro' };
      }
      limpio[k] = typeof v === 'string' ? v.trim() : v;
    }
    return { orden: nombre, args: limpio };
  };

  // --- Utilidades ---------------------------------------------------------------
  // "3:04" o "1:02:03" a segundos.
  const segundos = (t) => {
    if (typeof t !== 'string' || !/^\d+(:\d\d)+$/.test(t.trim())) return 0;
    return t.trim().split(':').reduce((acc, x) => acc * 60 + Number(x), 0);
  };

  // Redes de casa. El servidor solo contesta a estas: una VPN con IPs publicas
  // (Radmin usa 26.0.0.0/8) no entra aunque tenga ruta.
  const esPrivada = (ip) => {
    if (typeof ip !== 'string') return false;
    let s = ip.trim().toLowerCase();
    if (s.startsWith('::ffff:')) s = s.slice(7);
    const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      if ([m[1], m[2], m[3], m[4]].some((x) => Number(x) > 255)) return false;
      return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
    }
    return s === '::1' || /^fe[89ab][0-9a-f]:/.test(s) || /^f[cd][0-9a-f]{2}:/.test(s);
  };

  // El Host de cada peticion tiene que ser una IP literal o localhost, con el puerto
  // del servidor. Un nombre cualquiera es la firma de un ataque de DNS rebinding: una
  // web de fuera que hace que su dominio resuelva a esta IP para hablar con el
  // servidor desde el navegador del usuario.
  const hostValido = (host, puerto) => {
    if (typeof host !== 'string') return false;
    const m = host.trim().toLowerCase().match(/^(\d{1,3}(?:\.\d{1,3}){3}|localhost|\[[0-9a-f:]+\])(?::(\d{1,5}))?$/);
    if (!m) return false;
    return Number(m[2] || 80) === Number(puerto);
  };

  return {
    texto, camposDe, imagen, fila, tarjeta, destacado, deCola,
    secciones, cabecera, continuacion, filtros, sugerencias, elementosDeCola,
    validar, ESQUEMA, PAGINAS, segundos, esPrivada, hostValido,
  };
});

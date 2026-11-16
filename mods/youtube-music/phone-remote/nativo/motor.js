/* Zen Remoto — el motor. Corre en la pestana de YouTube Music, en una caja con el
 * principal de la pagina, y hace de mando a distancia de esa pestana.
 *
 *   Estado    lo que suena, cada medio segundo, y solo se envia si cambio
 *   Ordenes   las del movil, ya validadas por el servidor; aqui otra vez
 *   Red       busqueda y paginas por la API interna de la propia pagina
 *   Panel     el boton de la barra con el QR para emparejar el movil
 *
 * TODO SE HACE CON LAS PIEZAS DE LA PAGINA, NO SIMULANDO CLICS SOBRE LO QUE SE VE --
 * Medido el 15-11-2026 en music.youtube.com (cliente 1.20261110):
 *
 *   ytmusic-app.networkManager.fetch(ruta, cuerpo)   la API con la sesion del usuario
 *   ytmusic-app.inst.handleNavigationEndpoint(ep)    reproducir o abrir lo que sea
 *   ytmusic-player-queue.dispatch({type:'ADD_ITEMS'}) meter en la cola
 *   ytmusic-app.getState()                           el estado (redux) de la pagina
 *
 * `handleNavigationEndpoint` solo hace caso a un endpoint COMPLETO, como los que
 * vienen en las respuestas: con `{watchEndpoint:{videoId}}` a pelo no pasa nada. Y
 * `ytmusic-app.navigate` no es navegar a un endpoint: recibe un browseId.
 *
 * Los clics se quedan para lo que la pagina guarda en la barra y en ningun otro
 * sitio: repetir, aleatorio, me gusta, silencio. El volumen va por el deslizador
 * de la barra, porque su escala no es la del reproductor (42 en la barra son 15 en
 * `setVolume`) y moverlo por el reproductor deja la barra desincronizada.
 *
 * LA REGLA: nada de aqui puede romper la pagina. Todo va en try y lo peor que
 * pasa es que el movil reciba un error.
 */
(() => {
  'use strict';

  if (window.__zenRemoto) return;
  const P = ZenRemotoPuro;

  // El idioma: el de la pagina de YouTube Music (el de la cuenta) o el forzado
  // por la pref compartida zen.mods.idioma (llega del cargador como __zenIdioma).
  const idioma = () => {
    const f = typeof __zenIdioma === 'string' ? __zenIdioma : '';
    if (f === 'es' || f === 'en') return f;
    const l = (document.documentElement && document.documentElement.lang) || navigator.language || '';
    return /^es\b/i.test(l) ? 'es' : 'en';
  };
  const tr = (en, es) => (idioma() === 'es' ? es : en);
  // Los errores del servidor llegan como codigos y se cuentan aqui.
  const textoError = (e) => {
    if (!e) return '';
    if (e === 'sin-ip') return tr("Can't find this computer's IP on your home network.", 'No encuentro la IP del equipo en la red de casa.');
    const m = /^puerto:(\d+)$/.exec(e);
    if (m) return tr(`Couldn't open port ${m[1]}: is another app using it?`, `No pude abrir el puerto ${m[1]}: ¿lo usa otra aplicación?`);
    return e;
  };
  const Q = ZenRemotoQR;
  const puente = __zenRemotoPuente;

  const registro = [];
  const nota = (k, datos) => {
    registro.push({ t: Math.round(performance.now()), k, ...(datos || {}) });
    if (registro.length > 300) registro.shift();
  };

  // Objetos creados en el compartimento de la pagina. La pagina compara tipos de
  // sus propios objetos y uno de la caja no siempre pasa.
  const JSONPagina = window.JSON;
  const aPagina = (o) => JSONPagina.parse(JSON.stringify(o));

  const app = () => document.querySelector('ytmusic-app');
  const rep = () => document.querySelector('#movie_player');
  const barra = () => document.querySelector('ytmusic-player-bar');
  const red = async (ruta, cuerpo) => {
    const a = app();
    if (!a || !a.networkManager) throw new Error('la pagina aun no esta lista');
    const r = await a.networkManager.fetch(ruta, aPagina(cuerpo));
    // Se copia a la caja: lo que se lee despues no toca objetos de la pagina.
    return JSON.parse(JSON.stringify(r));
  };
  const navegar = (ep) => {
    const a = app();
    if (!a || !a.inst) throw new Error('la pagina aun no esta lista');
    a.inst.handleNavigationEndpoint(aPagina(Object.assign({ clickTrackingParams: '' }, ep)));
  };
  const estadoPagina = () => { try { return app().getState(); } catch (e) { return null; } };

  // --- Referencias ---------------------------------------------------------------
  // El movil nunca ve un endpoint: recibe una referencia corta a uno que la pagina
  // dio. Se guardan las ultimas 4000; una vieja da "ya no esta" y el movil recarga.
  const Refs = {
    mapa: new Map(),
    n: 0,
    guardar(v) {
      const id = (++this.n).toString(36);
      this.mapa.set(id, v);
      if (this.mapa.size > 4000) this.mapa.delete(this.mapa.keys().next().value);
      return id;
    },
    leer(id) {
      const v = this.mapa.get(id);
      if (!v) throw new Error('esa lista ya no esta; vuelve a abrirla');
      return v;
    },
  };

  const paraMovil = (it) => {
    const abre = !!(it.ep && it.ep.browseEndpoint);
    return {
      ref: Refs.guardar({ tipo: 'item', it }),
      tipo: it.tipo,
      titulo: String(it.titulo || '').slice(0, 200),
      sub: String(it.sub || '').slice(0, 300),
      img: it.img || '',
      dur: it.dur || '',
      explicito: !!it.explicito,
      abre,
      // Un album o una playlist se pueden tocar sin abrirlos.
      toca: !abre || !!it.reproducir || !!(it.menu && (it.menu.aleatorio || it.menu.radio)),
      encola: !!(it.menu && (it.menu.siguiente || it.menu.final)) || (!abre && !!it.videoId),
      radio: !!(it.menu && it.menu.radio),
    };
  };
  const seccionesParaMovil = (grupos) => grupos.map((g) => ({ titulo: g.titulo, items: g.items.map(paraMovil) }));
  const masDe = (r, ruta, cuerpo) => {
    const token = P.continuacion(r);
    return token ? Refs.guardar({ tipo: 'mas', ruta, token, cuerpo }) : null;
  };

  // --- Estado --------------------------------------------------------------------
  const textoDe = (sel) => {
    const n = barra() && barra().querySelector(sel);
    return n ? String(n.title || n.textContent || '').trim() : '';
  };

  const portada = () => {
    const ms = navigator.mediaSession && navigator.mediaSession.metadata;
    let mejor = '';
    try {
      const arte = [...(ms && ms.artwork) || []];
      arte.sort((a, b) => parseInt(b.sizes, 10) - parseInt(a.sizes, 10));
      if (arte[0]) mejor = arte[0].src;
    } catch (e) { /* sin mediaSession */ }
    if (!mejor) {
      const img = barra() && barra().querySelector('.image');
      mejor = (img && img.src) || '';
    }
    return /^https:\/\//.test(mejor) ? mejor.replace(/=w\d+-h\d+/, '=w544-h544') : '';
  };

  const firmaCola = (items, sel) => {
    let h = 0;
    const s = items.map((x) => { const c = P.deCola(x); return c ? c.videoId : '?'; }).join(',') + '|' + sel;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + items.length;
  };

  // La letra la pone Zen Letra Viva, que vive en su propia caja y deja su API en
  // window.__zenLetra. Si no esta instalado, el movil lo dice y ya.
  const letraViva = () => {
    const l = window.__zenLetra;
    return l && typeof l.letra === 'function' && typeof l.firma === 'function' ? l : null;
  };
  const firmaLetra = () => {
    try { const l = letraViva(); return l ? String(l.firma()) : 'sin-mod'; } catch (e) { return 'error'; }
  };

  const leerEstado = () => {
    const m = rep();
    const st = estadoPagina();
    if (!m || !st || typeof m.getVideoData !== 'function') return { listo: false };
    const vd = m.getVideoData() || {};
    const pl = st.player || {};
    const q = st.queue || {};
    const byline = textoDe('.byline');
    const partes = byline.split(' • ').map((x) => x.trim()).filter(Boolean);
    const sl = barra() && barra().querySelector('#volume-slider');
    const like = barra() && barra().querySelector('ytmusic-like-button-renderer');
    const items = q.items || [];
    // El indice de la cola sale de la API de la cola: `selectedItemIndex` del estado
    // se queda atras al tocar una pista de un album (medido: 0 con la segunda sonando).
    let sel = -1;
    try { sel = Number(app().queue.getCurrentItemIndex()); } catch (e) { /* sin cola */ }
    if (!Number.isInteger(sel)) sel = Number.isInteger(q.selectedItemIndex) ? q.selectedItemIndex : -1;
    // "Artista • Album • 2025" en una cancion; "Artista • 123M views • 465K likes"
    // en un video. Solo hay album si el ultimo campo es un ano.
    const conAlbum = partes.length >= 3 && /^\d{4}$/.test(partes[partes.length - 1]);
    let ps = -1;
    try { ps = m.getPlayerState(); } catch (e) { /* sin estado */ }
    return {
      listo: true,
      videoId: vd.video_id || '',
      titulo: textoDe('.title') || vd.title || '',
      artista: partes[0] || vd.author || '',
      album: conAlbum ? partes.slice(1, -1).join(' • ') : '',
      anio: conAlbum ? partes[partes.length - 1] : '',
      img: portada(),
      dur: Number(m.getDuration()) || 0,
      pos: Number(m.getCurrentTime()) || 0,
      sonando: ps === 1 || (ps === 3 && !!pl.isPlaying),
      cargando: ps === 3,
      anuncio: !!pl.adPlaying,
      vol: sl ? Math.round(Number(sl.value)) : Math.round(Number(m.getVolume()) || 0),
      silencio: !!(m.isMuted && m.isMuted()),
      repetir: q.repeatMode || 'NONE',
      aleatorio: !!q.shuffleEnabled,
      megusta: (like && like.getAttribute('like-status')) || 'INDIFFERENT',
      cola: { firma: firmaCola(items, sel), total: items.length, actual: sel },
      letra: firmaLetra(),
      sesion: !document.querySelector('ytmusic-nav-bar a.sign-in-link, ytmusic-nav-bar [href*="ServiceLogin"]'),
    };
  };

  // Se envia si cambio algo que no sea la posicion, si la posicion salto (busqueda,
  // cancion nueva) o cada cuatro segundos como latido. El movil interpola el resto.
  let ultimo = null;
  let ultimoEnvio = 0;
  const comparable = (e) => JSON.stringify(Object.assign({}, e, { pos: 0 }));
  const vigilar = () => {
    let e;
    try { e = leerEstado(); } catch (err) { nota('error', { en: 'estado', m: String(err) }); return; }
    const ahora = Date.now();
    let enviar = !ultimo || comparable(e) !== comparable(ultimo.e) || ahora - ultimoEnvio > 4000;
    if (!enviar && ultimo && e.listo) {
      const esperada = ultimo.e.pos + (ultimo.e.sonando ? (ahora - ultimo.t) / 1000 : 0);
      if (Math.abs(e.pos - esperada) > 1.5) enviar = true;
    }
    if (!enviar) return;
    ultimo = { e, t: ahora };
    ultimoEnvio = ahora;
    try { puente.enviar(JSON.stringify({ tipo: 'estado', estado: e, t: ahora })); } catch (err) { nota('error', { en: 'enviar', m: String(err) }); }
  };

  // --- Ordenes -------------------------------------------------------------------
  const pulsar = (sel) => {
    const b = barra() && barra().querySelector(sel);
    if (!b) throw new Error('no encuentro el boton ' + sel);
    (b.querySelector('button') || b).click();
  };

  const PAGINAS = {
    inicio: 'FEmusic_home',
    biblioteca: 'FEmusic_liked_playlists',
    megusta: 'VLLM',
    historial: 'FEmusic_history',
    albumes: 'FEmusic_liked_albums',
    artistas: 'FEmusic_library_corpus_track_artists',
    canciones: 'FEmusic_liked_videos',
  };

  const abrirPagina = async (browseId, params) => {
    const cuerpo = { browseId };
    if (typeof params === 'string' && params) cuerpo.params = params;
    const r = await red('/browse', cuerpo);
    const cab = P.cabecera(r, browseId);
    return {
      pagina: {
        titulo: cab.titulo,
        sub: cab.sub,
        img: cab.img,
        reproducir: cab.reproducir ? Refs.guardar({ tipo: 'ep', ep: cab.reproducir }) : null,
        aleatorio: cab.aleatorio ? Refs.guardar({ tipo: 'ep', ep: cab.aleatorio }) : null,
        radio: cab.radio ? Refs.guardar({ tipo: 'ep', ep: cab.radio }) : null,
        secciones: seccionesParaMovil(P.secciones(r)),
        mas: masDe(r, '/browse', cuerpo),
      },
    };
  };

  const encolar = async (it, donde) => {
    const elegido = (it.menu && (donde === 'siguiente' ? it.menu.siguiente || it.menu.final : it.menu.final || it.menu.siguiente)) || null;
    const objetivo = elegido ? elegido.queueTarget : (it.videoId ? { videoId: it.videoId } : null);
    if (!objetivo) throw new Error('esto no se puede poner en la cola');
    const cuerpo = objetivo.videoId ? { videoIds: [objetivo.videoId] } : objetivo.playlistId ? { playlistId: objetivo.playlistId } : null;
    if (!cuerpo) throw new Error('esto no se puede poner en la cola');
    const a = app();
    const q = document.querySelector('ytmusic-player-queue');
    const st = estadoPagina();
    const lista = (st && st.queue && st.queue.items) || [];
    // Con la cola vacia no hay donde meterlo: se reproduce y ya.
    if (!lista.length || !q || typeof q.dispatch !== 'function') {
      navegar((objetivo.onEmptyQueue) || (objetivo.videoId ? { watchEndpoint: { videoId: objetivo.videoId } } : { watchPlaylistEndpoint: { playlistId: objetivo.playlistId } }));
      return { ok: true, reproducido: true };
    }
    const r = await red('/music/get_queue', cuerpo);
    const items = P.elementosDeCola(r);
    if (!items.length) throw new Error('YouTube Music no devolvio nada para la cola');
    const actual = Number(a.queue.getCurrentItemIndex());
    const indice = donde === 'siguiente' ? (Number.isInteger(actual) ? actual + 1 : lista.length) : lista.length;
    q.dispatch(aPagina({
      type: 'ADD_ITEMS',
      payload: { nextQueueItemId: st.queue.nextQueueItemId, index: indice, items, shuffleEnabled: false, shouldAssignIds: true },
    }));
    return { ok: true, n: items.length };
  };

  const tocar = (v, modo) => {
    if (v.tipo === 'ep') { navegar(v.ep); return; }
    if (v.tipo !== 'item') throw new Error('esto no se puede tocar');
    const it = v.it;
    if (modo === 'radio' && it.menu && it.menu.radio) { navegar(it.menu.radio); return; }
    if (modo === 'aleatorio' && it.menu && it.menu.aleatorio) { navegar(it.menu.aleatorio); return; }
    if (it.ep && it.ep.browseEndpoint) {
      const ep = it.reproducir || (it.menu && (it.menu.aleatorio || it.menu.radio));
      if (!ep) throw new Error('esto se abre, no se toca');
      navegar(ep);
      return;
    }
    navegar(it.ep);
  };

  const ORDENES = {
    alternar() {
      const m = rep();
      if (m.getPlayerState() === 1) m.pauseVideo(); else m.playVideo();
    },
    reproducir() { rep().playVideo(); },
    pausar() { rep().pauseVideo(); },
    siguiente() { try { pulsar('.next-button'); } catch (e) { rep().nextVideo(); } },
    anterior() { try { pulsar('.previous-button'); } catch (e) { rep().previousVideo(); } },
    posicion({ s }) {
      const m = rep();
      const d = Number(m.getDuration()) || 0;
      m.seekTo(d ? Math.min(s, Math.max(0, d - 1)) : s, true);
    },
    volumen({ v }) {
      const sl = barra() && barra().querySelector('#volume-slider');
      const m = rep();
      if (m.isMuted && m.isMuted() && v > 0) { try { pulsar('.volume'); } catch (e) { m.unMute(); } }
      if (sl) {
        sl.value = v;
        sl.dispatchEvent(new CustomEvent('change', { bubbles: true }));
      } else m.setVolume(v);
    },
    silencio({ on }) {
      const m = rep();
      if (!!(m.isMuted && m.isMuted()) === on) return;
      try { pulsar('.volume'); } catch (e) { if (on) m.mute(); else m.unMute(); }
    },
    megusta({ valor }) {
      const like = barra() && barra().querySelector('ytmusic-like-button-renderer');
      if (!like) throw new Error('no hay boton de me gusta');
      const b = like.querySelector(valor === 'LIKE' ? '#button-shape-like button' : '#button-shape-dislike button');
      if (!b) throw new Error('no hay boton de me gusta');
      b.click();
    },
    aleatorio() { pulsar('.shuffle'); },
    repetir() { pulsar('.repeat'); },
    saltar({ i }) {
      const items = app().queue.getItems();
      const c = items[i] && P.deCola(items[i]);
      if (!c || !c.ep) throw new Error('ese elemento de la cola ya no esta');
      navegar(c.ep);
    },
    cola() {
      const items = app().queue.getItems() || [];
      const sel = Number(app().queue.getCurrentItemIndex());
      // Las de antes de la actual se cuentan pero solo se mandan las diez ultimas:
      // una cola de 500 no tiene por que viajar entera cada vez.
      const desde = Math.max(0, sel - 10);
      const hasta = Math.min(items.length, desde + 200);
      const lista = [];
      for (let i = desde; i < hasta; i++) {
        const c = P.deCola(items[i]);
        if (c) lista.push({ i, titulo: c.titulo, sub: c.sub, img: c.img, dur: c.dur, actual: i === sel });
      }
      return { cola: { total: items.length, actual: sel, desde, items: lista } };
    },
    letra() {
      const l = letraViva();
      if (!l) return { letra: { disponible: false } };
      const c = JSON.parse(JSON.stringify(l.letra() || {}));
      const num = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0);
      return {
        letra: {
          disponible: true,
          clave: String(c.clave || ''),
          fuente: String(c.fuente || '').slice(0, 60),
          mensaje: String(c.mensaje || '').slice(0, 200),
          desfase: num(c.desfase),
          sincronizada: !!c.sincronizada,
          lineas: (Array.isArray(c.lineas) ? c.lineas : []).slice(0, 600).map((x) => ({
            i: num(x.i), f: num(x.f), t: String(x.t || '').slice(0, 300), p: !!x.p,
          })),
        },
      };
    },
    async buscar({ q, filtro }) {
      const cuerpo = { query: q };
      if (filtro) {
        const f = Refs.leer(filtro);
        if (f.tipo !== 'filtro') throw new Error('filtro desconocido');
        cuerpo.params = f.params;
      }
      const r = await red('/search', cuerpo);
      return {
        busqueda: {
          q,
          filtros: P.filtros(r).map((f) => ({ nombre: f.nombre, ref: Refs.guardar({ tipo: 'filtro', params: f.params }), puesto: f.puesto })),
          secciones: seccionesParaMovil(P.secciones(r)),
          mas: masDe(r, '/search', cuerpo),
        },
      };
    },
    async sugerir({ q }) {
      const r = await red('/music/get_search_suggestions', { input: q });
      const s = P.sugerencias(r);
      return { sugerencias: { textos: s.textos, items: s.items.map(paraMovil) } };
    },
    async abrir({ ref }) {
      const v = Refs.leer(ref);
      if (v.tipo === 'item' && v.it.ep && v.it.ep.browseEndpoint) {
        return abrirPagina(v.it.ep.browseEndpoint.browseId, v.it.ep.browseEndpoint.params);
      }
      tocar(v, 'normal');
      return { ok: true };
    },
    tocar({ ref, modo }) {
      tocar(Refs.leer(ref), modo || 'normal');
      return { ok: true };
    },
    async encolar({ ref, donde }) {
      const v = Refs.leer(ref);
      if (v.tipo !== 'item') throw new Error('esto no se puede poner en la cola');
      return encolar(v.it, donde);
    },
    async mas({ ref }) {
      const v = Refs.leer(ref);
      if (v.tipo !== 'mas') throw new Error('no hay mas');
      const cuerpo = Object.assign({}, v.cuerpo, { continuation: v.token });
      const r = await red(v.ruta, cuerpo);
      return { mas: { secciones: seccionesParaMovil(P.secciones(r)), mas: masDe(r, v.ruta, v.cuerpo) } };
    },
    async pagina({ id }) {
      return abrirPagina(PAGINAS[id]);
    },
  };

  const atender = async (msg) => {
    const { id, orden, args } = msg;
    const v = P.validar({ orden, args });
    if (v.error) return { id, ok: false, error: v.error };
    try {
      const r = await ORDENES[v.orden](v.args);
      setTimeout(vigilar, 150);
      return { id, ok: true, datos: r || {} };
    } catch (e) {
      nota('error', { en: v.orden, m: String((e && e.message) || e) });
      return { id, ok: false, error: String((e && e.message) || e).slice(0, 200) };
    }
  };

  // El puente llama aqui con cada mensaje del servidor, en texto. Va en el global
  // de la caja y no en `window`: los scripts de la pagina no pueden mandarle
  // ordenes al motor haciendose pasar por el movil.
  globalThis.__zenRemotoRecibir = (texto) => {
    let msg;
    try { msg = JSON.parse(String(texto)); } catch (e) { return; }
    if (msg && msg.tipo === 'orden') {
      atender(msg).then((r) => {
        try { puente.enviar(JSON.stringify(Object.assign({ tipo: 'respuesta' }, r))); } catch (e) { nota('error', { en: 'responder', m: String(e) }); }
      });
    } else if (msg && msg.tipo === 'info') {
      Panel.info = msg.info;
      Panel.pintar();
    } else if (msg && msg.tipo === 'hola') {
      ultimo = null;
      vigilar();
    }
  };

  // --- Panel ---------------------------------------------------------------------
  // La letra es la de la pagina (Roboto), la misma que usa Zen Mezcla en su panel:
  // lo que se pone en YouTube Music tiene que leerse como YouTube Music.
  const svgNs = 'http://www.w3.org/2000/svg';
  // ESTILO DE LOS MODS (16-11-2026): el de la app del movil, con aire de iOS.
  const CSS = `
.zr-boton { width: 40px; height: 40px; margin: 0 2px; padding: 8px; border: 0; border-radius: 50%; background: none;
  color: rgb(255 255 255 / 0.7); cursor: pointer; flex: none; position: relative; }
.zr-boton:hover { color: #fff; background: rgb(255 255 255 / 0.1); }
.zr-boton[data-conectado="true"] { color: #fff; }
.zr-boton[data-conectado="true"]::after { content: ""; position: absolute; right: 8px; bottom: 8px; width: 7px; height: 7px;
  border-radius: 50%; background: #34c759; box-shadow: 0 0 0 2px #212121; }
.zr-boton svg { display: block; width: 24px; height: 24px; }
.zr-panel { position: fixed; z-index: 2147483000; width: 320px; padding: 16px 12px 12px; border-radius: 18px; box-sizing: border-box;
  background: rgb(30 30 32 / 0.92); backdrop-filter: blur(30px) saturate(1.8);
  border: 1px solid rgb(255 255 255 / 0.1); box-shadow: 0 24px 60px rgb(0 0 0 / 0.5);
  color: rgb(255 255 255 / 0.92); font: 400 14px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.zr-panel[hidden] { display: none; }
.zr-titulo { padding: 0 6px 4px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: #fff; }
.zr-suave { padding: 0 6px; color: rgb(235 235 245 / 0.6); font-size: 13px; }
.zr-qr { display: block; width: 188px; height: 188px; margin: 14px auto 12px; padding: 10px; box-sizing: border-box; border-radius: 16px; overflow: hidden; background: #fff; }
.zr-qr svg { display: block; width: 100%; height: 100%; }
.zr-codigo { text-align: center; font-size: 30px; font-weight: 600; letter-spacing: 0.16em; font-variant-numeric: tabular-nums; color: #fff; }
.zr-url { text-align: center; margin-top: 2px; user-select: all; }
.zr-grupo { margin-top: 14px; border-radius: 12px; background: rgb(255 255 255 / 0.06); overflow: hidden; }
.zr-fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 6px 12px; box-sizing: border-box; }
.zr-fila .zr-suave { padding: 0; }
.zr-panel button.zr-accion { border: 0; border-radius: 999px; padding: 6px 12px; background: rgb(255 92 122 / 0.16); color: #ff7a93;
  font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.zr-panel button.zr-accion:hover { background: rgb(255 92 122 / 0.26); }
.zr-error { margin: 10px 6px 0; color: #ffc46b; font-size: 13px; }
`;

  const Panel = {
    boton: null, nodo: null, partes: {}, info: null, abierto: false,

    crear(tag, clase, texto) {
      const n = document.createElement(tag);
      if (clase) n.className = clase;
      if (texto) n.textContent = texto;
      return n;
    },

    icono() {
      const s = document.createElementNS(svgNs, 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2');
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
      const r = document.createElementNS(svgNs, 'rect');
      for (const [k, v] of Object.entries({ x: 6, y: 2, width: 12, height: 20, rx: 2.5 })) r.setAttribute(k, v);
      s.appendChild(r);
      const p = document.createElementNS(svgNs, 'path');
      p.setAttribute('d', 'M11 18h2');
      s.appendChild(p);
      return s;
    },

    montarPanel() {
      const n = this.crear('div', 'zr-panel');
      n.hidden = true;
      n.appendChild(this.crear('div', 'zr-titulo', tr('Control from your phone', 'Controlar desde el móvil')));
      n.appendChild(this.crear('div', 'zr-suave', tr('On the same Wi-Fi, scan the code with your phone, or open the address and type the number.', 'Con el móvil en la misma wifi, escanea el código o abre la dirección y escribe el número.')));
      this.partes.qr = this.crear('div', 'zr-qr');
      n.appendChild(this.partes.qr);
      this.partes.codigo = this.crear('div', 'zr-codigo');
      n.appendChild(this.partes.codigo);
      this.partes.url = this.crear('div', 'zr-url zr-suave');
      n.appendChild(this.partes.url);
      this.partes.error = this.crear('div', 'zr-error');
      n.appendChild(this.partes.error);
      const fila = this.crear('div', 'zr-fila');
      const grupo = this.crear('div', 'zr-grupo');
      this.partes.dispositivos = this.crear('span', 'zr-suave');
      fila.appendChild(this.partes.dispositivos);
      const olvidar = this.crear('button', 'zr-accion', tr('Forget phones', 'Olvidar móviles'));
      olvidar.type = 'button';
      olvidar.title = tr('Paired phones will have to scan the code again', 'Los móviles emparejados tendrán que volver a escanear el código');
      olvidar.addEventListener('click', () => {
        try { puente.enviar(JSON.stringify({ tipo: 'olvidar' })); } catch (e) { /* nada */ }
      });
      this.partes.olvidar = olvidar;
      fila.appendChild(olvidar);
      grupo.appendChild(fila);
      n.appendChild(grupo);
      document.body.appendChild(n);
      this.nodo = n;
      document.addEventListener('pointerdown', (e) => {
        if (n.hidden || n.contains(e.target) || (this.boton && this.boton.contains(e.target))) return;
        this.cerrar();
      }, true);
    },

    pedirInfo() {
      try { puente.enviar(JSON.stringify({ tipo: 'info', abierto: this.abierto })); } catch (e) { /* nada */ }
    },

    cerrar() {
      this.abierto = false;
      if (this.nodo) this.nodo.hidden = true;
      // Cerrar el panel caduca el codigo: solo vale mientras se esta mirando.
      this.pedirInfo();
    },

    pintar() {
      const i = this.info;
      if (this.boton) this.boton.dataset.conectado = String(!!(i && i.conectados > 0));
      if (!this.nodo || this.nodo.hidden) return;
      if (!i) { this.partes.codigo.textContent = '…'; return; }
      this.partes.error.textContent = textoError(i.error);
      this.partes.error.hidden = !i.error;
      if (i.url && i.codigo) {
        const enlace = `${i.url}/#c=${i.codigo}`;
        if (this.partes.qr.dataset.texto !== enlace) {
          this.partes.qr.dataset.texto = enlace;
          try {
            // Se construye con createElementNS desde la matriz: nada de parsear
            // texto (DOMParser no funciona igual dentro de la caja, medido).
            const m = Q.matriz(enlace);
            const n = m.length;
            const t = n + 8;
            let d = '';
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
            const s = document.createElementNS(svgNs, 'svg');
            s.setAttribute('viewBox', `0 0 ${t} ${t}`);
            s.setAttribute('shape-rendering', 'crispEdges');
            s.setAttribute('role', 'img');
            s.setAttribute('aria-label', tr('QR code to pair your phone', 'Código QR para emparejar el móvil'));
            const p = document.createElementNS(svgNs, 'path');
            p.setAttribute('d', d);
            p.setAttribute('fill', '#000');
            s.appendChild(p);
            this.partes.qr.replaceChildren(s);
          } catch (e) {
            nota('error', { en: 'qr', m: String(e) });
            this.partes.qr.replaceChildren();
          }
        }
        this.partes.qr.hidden = false;
        this.partes.codigo.textContent = i.codigo.replace(/(\d{3})(\d{3})/, '$1 $2');
        this.partes.url.textContent = i.url.replace(/^http:\/\//, '');
      } else {
        this.partes.qr.hidden = true;
        this.partes.codigo.textContent = i.bloqueado ? tr('Paused', 'En pausa') : '…';
        this.partes.url.textContent = i.url ? i.url.replace(/^http:\/\//, '') : '';
      }
      const n = i.dispositivos || 0;
      this.partes.dispositivos.textContent = n === 0 ? tr('No phones paired', 'Ningún móvil emparejado') : n === 1 ? tr('1 phone paired', '1 móvil emparejado') : tr(`${n} phones paired`, `${n} móviles emparejados`);
      this.partes.olvidar.hidden = n === 0;
    },

    colocar() {
      const r = this.boton.getBoundingClientRect();
      this.nodo.style.right = Math.max(8, innerWidth - r.right - 8) + 'px';
      this.nodo.style.bottom = Math.max(8, innerHeight - r.top + 8) + 'px';
    },

    ponerBoton() {
      const b0 = document.querySelector('ytmusic-player-bar #right-controls, ytmusic-player-bar .right-controls');
      if (!b0 || (this.boton && this.boton.isConnected)) return;
      if (!this.nodo) {
        const st = this.crear('style');
        st.textContent = CSS;
        document.documentElement.appendChild(st);
        this.montarPanel();
      }
      const b = this.boton || this.crear('button', 'zr-boton');
      if (!this.boton) {
        b.type = 'button';
        b.title = tr('Control from your phone', 'Controlar desde el móvil');
        b.setAttribute('aria-label', tr('Control from your phone', 'Controlar desde el móvil'));
        b.appendChild(this.icono());
        b.addEventListener('click', (e) => {
          // ytmusic-player-bar abre y cierra el reproductor grande con cualquier clic
          // que le llegue en burbuja (medido el 16-11-2026 con un raton real por
          // BiDi). El boton corta la propagacion: pulsarlo solo hace lo suyo.
          e.stopPropagation();
          if (this.nodo.hidden) {
            this.abierto = true;
            this.nodo.hidden = false;
            this.colocar();
            this.pintar();
            this.pedirInfo();
          } else this.cerrar();
        });
      }
      const menu = b0.querySelector('#expanding-menu');
      if (menu && menu.parentElement === b0) b0.insertBefore(b, menu);
      else b0.insertBefore(b, b0.firstChild);
      this.boton = b;
      this.pintar();
    },
  };

  // --- Arranque --------------------------------------------------------------------
  setInterval(vigilar, 500);
  setInterval(() => {
    try { Panel.ponerBoton(); } catch (e) { nota('error', { en: 'panel', m: String(e) }); }
    // Con el panel abierto se refresca el codigo: caduca y cambia solo.
    if (Panel.abierto) Panel.pedirInfo();
  }, 2000);
  addEventListener('pagehide', () => { try { puente.enviar(JSON.stringify({ tipo: 'adios' })); } catch (e) { /* nada */ } });

  window.__zenRemoto = Object.freeze({
    estado: () => leerEstado(),
    registro: () => registro.slice(),
  });
  Panel.pedirInfo();
  nota('arranque');
})();

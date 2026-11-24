/* Zen Descargas — el boton y el panel, dentro de la pagina.
 *
 * En YouTube sale como una pastilla mas junto a "Me gusta" y "Compartir" (y como
 * boton redondo en los Shorts); en YouTube Music, en la barra del reproductor, al
 * lado de los otros mods. Un clic abre el panel: Cancion o Video, y listo. La
 * descarga la hace el proceso padre (descargador.js); aqui solo se pide y se pinta.
 *
 * Todo va dentro de shadow roots cerrados: el CSS de YouTube no entra, y el de
 * aqui no sale.
 */
(() => {
  'use strict';

  if (window.__zenDescargasPuesto) return;
  window.__zenDescargasPuesto = true;

  const P = ZenDescargasPuro;
  const puente = __zenDescargasPuente;
  const MUSICA = location.host === 'music.youtube.com';

  const idioma = () => {
    const f = typeof __zenIdioma === 'string' ? __zenIdioma : '';
    if (f === 'es' || f === 'en') return f;
    const l = (document.documentElement && document.documentElement.lang) || navigator.language || '';
    return /^es\b/i.test(l) ? 'es' : 'en';
  };
  const tr = (en, es) => (idioma() === 'es' ? es : en);
  const decimal = (n) => tr(String(n), String(n).replace('.', ','));

  const enviar = (m) => { try { puente.enviar(JSON.stringify(m)); } catch (e) { /* el puente se fue */ } };

  // --- Estado que manda el padre ------------------------------------------------
  let estado = { listo: false, ffmpeg: false, carpeta: null, ajustes: { calidad: '1080', audio: 'mp3', cookies: false }, trabajos: [] };
  let aviso = null; // texto corto encima de la lista (rechazos)

  globalThis.__zenDescargasRecibir = (texto) => {
    let m;
    try { m = JSON.parse(texto); } catch (e) { return; }
    if (m.tipo === 'estado') {
      estado = m;
      pintar();
    } else if (m.tipo === 'rechazo') {
      aviso = {
        repetido: tr('Already downloading.', 'Ya se está descargando.'),
        cola: tr('The queue is full. Wait for some to finish.', 'La cola está llena. Espera a que terminen algunas.'),
        limite: tr('Too many at once. Wait a minute.', 'Demasiadas de golpe. Espera un minuto.'),
      }[m.motivo] || null;
      pintar();
      setTimeout(() => { aviso = null; pintar(); }, 4000);
    }
  };

  // --- Lo que suena ---------------------------------------------------------------
  // La API del reproductor es la misma en YouTube y en YouTube Music. En los Shorts
  // el reproductor es otro, y si no hay ninguno se mira la URL.
  const actual = () => {
    const ids = MUSICA ? ['movie_player'] : (location.pathname.startsWith('/shorts/') ? ['shorts-player'] : ['movie_player']);
    for (const i of ids) {
      const r = document.getElementById(i);
      try {
        const d = r && typeof r.getVideoData === 'function' ? r.getVideoData() : null;
        if (d && P.esId(d.video_id)) {
          // En YouTube el reproductor de la portada (vista previa) tambien tiene datos:
          // solo cuenta el de la pagina del video.
          if (!MUSICA && !/^\/(watch|shorts\/|live\/)/.test(location.pathname)) break;
          const deUrl = P.idDeUrl(location.href);
          if (!MUSICA && deUrl && deUrl !== d.video_id) return { id: deUrl, titulo: document.title.replace(/ - YouTube$/, ''), autor: '' };
          return { id: d.video_id, titulo: d.title || '', autor: d.author || '' };
        }
      } catch (e) { /* sigue */ }
    }
    if (MUSICA) return null;
    const id = P.idDeUrl(location.href);
    return id ? { id, titulo: document.title.replace(/ - YouTube$/, ''), autor: '' } : null;
  };

  const trabajosDe = (id) => estado.trabajos.filter((t) => t.id === id);
  const activo = (t) => ['cola', 'bajando', 'procesando'].includes(t.fase);

  // --- Iconos -------------------------------------------------------------------------
  const svgNs = 'http://www.w3.org/2000/svg';
  const ICONOS = {
    bajar: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
    nota: ['M9 18V5l11-2v13', 'C6 18 3', 'C17 16 3'],
    video: ['R3 5 18 14 3', 'FM10 9.2v5.6l4.8-2.8z'],
    carpeta: ['M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z'],
    cerrar: ['M6 6l12 12', 'M18 6L6 18'],
    hecho: ['M5 12.5l4.5 4.5L19 7'],
    otra: ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4.5V9h4.5'],
  };
  const icono = (nombre) => {
    const s = document.createElementNS(svgNs, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    for (const d of ICONOS[nombre]) {
      let n;
      if (d[0] === 'C') {
        const [x, y, r] = d.slice(1).split(' ');
        n = document.createElementNS(svgNs, 'circle');
        n.setAttribute('cx', x); n.setAttribute('cy', y); n.setAttribute('r', r);
      } else if (d[0] === 'R') {
        const [x, y, w, h, r] = d.slice(1).split(' ');
        n = document.createElementNS(svgNs, 'rect');
        n.setAttribute('x', x); n.setAttribute('y', y); n.setAttribute('width', w); n.setAttribute('height', h); n.setAttribute('rx', r);
      } else if (d[0] === 'F') {
        n = document.createElementNS(svgNs, 'path');
        n.setAttribute('d', d.slice(1));
        n.setAttribute('fill', 'currentColor');
        n.setAttribute('stroke', 'none');
      } else {
        n = document.createElementNS(svgNs, 'path');
        n.setAttribute('d', d);
      }
      s.appendChild(n);
    }
    return s;
  };
  const el = (tag, clase, texto) => {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  };

  // --- Estilos ------------------------------------------------------------------------
  // El panel lleva el estilo comun de los mods (el de Zen Remoto y Mezcla): lamina
  // esmerilada, grupos redondeados, acento rosa, letra del sistema.
  const LETRA = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const CSS_PANEL = `
:host { all: initial; }
.panel { position: fixed; z-index: 2147483000; width: 340px; max-height: min(560px, calc(100vh - 24px)); overflow: auto; padding: 14px 12px 12px;
  border-radius: 18px; box-sizing: border-box; background: rgb(30 30 32 / 0.92); backdrop-filter: blur(30px) saturate(1.8);
  border: 1px solid rgb(255 255 255 / 0.1); box-shadow: 0 24px 60px rgb(0 0 0 / 0.5); color: rgb(255 255 255 / 0.92);
  font: 400 14px/1.35 ${LETRA}; -webkit-font-smoothing: antialiased; scrollbar-width: thin; }
.panel[hidden] { display: none; }
.cabeza { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 4px 6px; }
.cabeza h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: #fff; }
.cruz { width: 28px; height: 28px; padding: 5px; border: 0; border-radius: 50%; background: rgb(255 255 255 / 0.08); color: rgb(235 235 245 / 0.7); cursor: pointer; }
.cruz:hover { background: rgb(255 255 255 / 0.14); color: #fff; }
.cruz svg, .accion svg, .mini svg { display: block; width: 100%; height: 100%; }
.que { margin: 0 6px 12px; color: rgb(235 235 245 / 0.6); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.grupo { border-radius: 12px; background: rgb(255 255 255 / 0.06); overflow: hidden; }
.accion { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 8px 12px; border: 0; background: none;
  color: inherit; font: inherit; text-align: left; cursor: pointer; box-sizing: border-box; }
.accion + .accion::before, .fila + .fila::before { content: ''; position: absolute; top: 0; left: 52px; right: 0; height: 1px; background: rgb(255 255 255 / 0.08); }
.accion:hover { background: rgb(255 255 255 / 0.05); }
.accion:disabled { opacity: 0.45; cursor: default; background: none; }
.accion .ico { flex: none; width: 28px; height: 28px; padding: 5px; border-radius: 8px; background: #ff5c7a; color: #fff; box-sizing: border-box; }
.accion .ico.video { background: #5e8bff; }
.accion .txt { flex: 1; min-width: 0; }
.accion b { display: block; font-weight: 500; color: #fff; }
.accion small { display: block; color: rgb(235 235 245 / 0.6); font-size: 12px; }
.seccion { margin: 16px 6px 6px; font-size: 12px; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; color: rgb(235 235 245 / 0.55); }
.segmentos { display: flex; padding: 2px; border-radius: 9px; background: rgb(118 118 128 / 0.24); }
.segmentos button { flex: 1; min-width: 0; height: 28px; border: 0; border-radius: 7px; background: none; color: rgb(255 255 255 / 0.85); font: 500 13px/1 ${LETRA}; cursor: pointer; }
.segmentos button[aria-pressed="true"] { background: rgb(99 99 102); color: #fff; box-shadow: 0 3px 8px rgb(0 0 0 / 0.12), 0 3px 1px rgb(0 0 0 / 0.04); }
.fila { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 6px 12px; box-sizing: border-box; }
.fila .txt { flex: 1; min-width: 0; }
.fila small { display: block; color: rgb(235 235 245 / 0.55); font-size: 12px; }
input[type=checkbox] { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 42px; height: 26px; margin: 0;
  border-radius: 13px; background: rgb(120 120 128 / 0.36); cursor: pointer; transition: background-color 0.2s ease; }
input[type=checkbox]::after { content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 4px rgb(0 0 0 / 0.3); transition: transform 0.22s cubic-bezier(0.3, 0.7, 0.4, 1); }
input[type=checkbox]:checked { background: #ff5c7a; }
input[type=checkbox]:checked::after { transform: translateX(16px); }
button:focus-visible, input:focus-visible { outline: 2px solid #ff5c7a; outline-offset: 2px; }
.lista .fila { min-height: 56px; }
.lista .fila .txt b { display: block; font-weight: 500; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lista .fila .txt small { font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lista .fila .txt small.mal { color: #ff8a80; white-space: normal; }
.barra { height: 4px; margin-top: 6px; border-radius: 2px; background: rgb(255 255 255 / 0.1); overflow: hidden; }
.barra i { display: block; height: 100%; width: 0; border-radius: 2px; background: #ff5c7a; transition: width 0.25s linear; }
.barra.espera i { width: 30%; animation: ir 1.2s ease-in-out infinite; }
@keyframes ir { 0% { transform: translateX(-100%); } 100% { transform: translateX(340%); } }
.mini { flex: none; width: 30px; height: 30px; padding: 6px; border: 0; border-radius: 50%; background: rgb(255 255 255 / 0.08); color: rgb(235 235 245 / 0.8); cursor: pointer; box-sizing: border-box; }
.mini:hover { background: rgb(255 255 255 / 0.16); color: #fff; }
.vacio { padding: 14px 12px; color: rgb(235 235 245 / 0.5); font-size: 13px; text-align: center; }
.nota { margin: 10px 6px 0; color: #ffc46b; font-size: 13px; }
.pie { display: flex; align-items: center; gap: 8px; margin: 12px 6px 0; }
.pie button { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: #ff5c7a; font: 500 13px/1.3 ${LETRA}; cursor: pointer; }
.pie button svg { width: 16px; height: 16px; }
.pie span { margin-left: auto; color: rgb(235 235 245 / 0.4); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; direction: rtl; }
@media (prefers-reduced-motion: reduce) { input[type=checkbox], input[type=checkbox]::after, .barra i { transition: none; } .barra.espera i { animation: none; } }
`;

  // La pastilla de YouTube imita las suyas (Me gusta, Compartir): mismas variables
  // de color, la letra de la pagina y su misma altura, para que no se note el injerto.
  const CSS_PASTILLA = `
:host { display: inline-flex; flex: none; margin-left: 8px; }
button { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px 0 12px; border: 0; border-radius: 18px;
  background: var(--yt-spec-badge-chip-background, rgb(255 255 255 / 0.1)); color: var(--yt-spec-text-primary, #f1f1f1);
  font: 500 14px/36px "Roboto", "Arial", sans-serif; white-space: nowrap; cursor: pointer; }
button:hover { background: var(--yt-spec-button-chip-background-hover, rgb(255 255 255 / 0.2)); }
button:focus-visible { outline: 2px solid var(--yt-spec-call-to-action, #3ea6ff); outline-offset: 2px; }
svg { width: 22px; height: 22px; flex: none; }
button[data-fase="activa"] { color: #ff5c7a; }
:host([redondo]) { margin: 0 0 16px; }
:host([redondo]) button { flex-direction: column; justify-content: center; width: 48px; height: 48px; padding: 0; border-radius: 50%; gap: 0; font-size: 0; }
:host([flotante]) { position: fixed; right: 24px; bottom: 24px; z-index: 2147482000; margin: 0; }
:host([flotante]) button { box-shadow: 0 6px 20px rgb(0 0 0 / 0.35); background: rgb(40 40 40 / 0.92); color: #fff; }
`;
  // En YouTube Music, un boton redondo como los de Mezcla y Remoto.
  const CSS_BARRA = `
:host { display: inline-flex; flex: none; }
button { width: 40px; height: 40px; margin: 0 2px; padding: 8px; border: 0; border-radius: 50%; background: none; color: rgb(255 255 255 / 0.7); cursor: pointer; }
button:hover { color: #fff; background: rgb(255 255 255 / 0.1); }
button[data-fase="activa"] { color: #ff5c7a; }
button:focus-visible { outline: 2px solid #ff5c7a; outline-offset: 2px; }
svg { display: block; width: 24px; height: 24px; }
`;

  // --- El panel -----------------------------------------------------------------------
  const Panel = {
    host: null, raiz: null, nodo: null, partes: {}, ancla: null,

    montar() {
      if (this.host && this.host.isConnected) return;
      this.host = document.createElement('zen-descargas-panel');
      this.raiz = this.host.attachShadow({ mode: 'closed' });
      const st = el('style');
      st.textContent = CSS_PANEL;
      this.raiz.appendChild(st);

      const n = el('div', 'panel');
      n.hidden = true;
      n.setAttribute('role', 'dialog');
      n.setAttribute('aria-label', tr('Download', 'Descargar'));

      const cabeza = el('div', 'cabeza');
      cabeza.appendChild(el('h2', null, tr('Download', 'Descargar')));
      const cruz = el('button', 'cruz');
      cruz.type = 'button';
      cruz.setAttribute('aria-label', tr('Close', 'Cerrar'));
      cruz.appendChild(icono('cerrar'));
      cruz.addEventListener('click', () => this.cerrar());
      cabeza.appendChild(cruz);
      n.appendChild(cabeza);

      this.partes.que = el('p', 'que');
      n.appendChild(this.partes.que);

      const acciones = el('div', 'grupo');
      const accion = (modo, ico, titulo) => {
        const b = el('button', 'accion');
        b.type = 'button';
        const i = el('span', 'ico' + (modo === 'video' ? ' video' : ''));
        i.appendChild(icono(ico));
        b.appendChild(i);
        const t = el('span', 'txt');
        t.appendChild(el('b', null, titulo));
        const s = el('small');
        t.appendChild(s);
        b.appendChild(t);
        b.addEventListener('click', () => this.pedir(modo));
        acciones.appendChild(b);
        return { b, s };
      };
      this.partes.audio = accion('audio', 'nota', tr('Song', 'Canción'));
      this.partes.video = accion('video', 'video', tr('Video', 'Vídeo'));
      // En YouTube Music lo normal es la cancion; en YouTube, el video.
      if (!MUSICA) acciones.insertBefore(this.partes.video.b, this.partes.audio.b);
      n.appendChild(acciones);

      this.partes.nota = el('p', 'nota');
      this.partes.nota.hidden = true;
      n.appendChild(this.partes.nota);

      const segmentos = (titulo, clave, opciones) => {
        n.appendChild(el('div', 'seccion', titulo));
        const g = el('div', 'segmentos');
        g.setAttribute('role', 'group');
        g.setAttribute('aria-label', titulo);
        const botones = opciones.map(([valor, texto]) => {
          const b = el('button', null, texto);
          b.type = 'button';
          b.dataset.valor = valor;
          b.addEventListener('click', () => enviar({ tipo: 'ajuste', clave, valor }));
          g.appendChild(b);
          return b;
        });
        n.appendChild(g);
        return botones;
      };
      this.partes.calidad = segmentos(tr('Video quality', 'Calidad del vídeo'), 'calidad',
        [['max', tr('Best', 'Máx.')], ['1080', '1080p'], ['720', '720p'], ['480', '480p']]);
      this.partes.formato = segmentos(tr('Music format', 'Formato de la música'), 'audio',
        [['mp3', 'MP3'], ['m4a', tr('M4A (original)', 'M4A (original)')]]);

      n.appendChild(el('div', 'seccion', tr('Options', 'Opciones')));
      const opciones = el('div', 'grupo');
      const fila = el('label', 'fila');
      const ft = el('span', 'txt');
      ft.appendChild(el('span', null, tr('Use my YouTube session', 'Usar mi sesión de YouTube')));
      ft.appendChild(el('small', null, tr('For age-restricted videos or when YouTube asks if you are a bot.', 'Para vídeos con restricción de edad o cuando YouTube pregunta si eres un bot.')));
      fila.appendChild(ft);
      const casilla = el('input');
      casilla.type = 'checkbox';
      casilla.addEventListener('change', () => enviar({ tipo: 'ajuste', clave: 'cookies', valor: casilla.checked }));
      fila.appendChild(casilla);
      this.partes.cookies = casilla;
      opciones.appendChild(fila);
      n.appendChild(opciones);

      n.appendChild(el('div', 'seccion', tr('Downloads', 'Descargas')));
      this.partes.lista = el('div', 'grupo lista');
      n.appendChild(this.partes.lista);

      const pie = el('div', 'pie');
      const carpeta = el('button');
      carpeta.type = 'button';
      carpeta.appendChild(icono('carpeta'));
      carpeta.appendChild(document.createTextNode(tr('Open folder', 'Abrir carpeta')));
      carpeta.addEventListener('click', () => enviar({ tipo: 'carpeta' }));
      pie.appendChild(carpeta);
      this.partes.ruta = el('span');
      pie.appendChild(this.partes.ruta);
      n.appendChild(pie);

      this.raiz.appendChild(n);
      this.nodo = n;
      document.documentElement.appendChild(this.host);
    },

    abierto() { return !!(this.nodo && !this.nodo.hidden); },

    abrir(ancla) {
      this.montar();
      this.ancla = ancla;
      this.nodo.hidden = false;
      this.pintar();
      this.colocar();
      enviar({ tipo: 'hola' });
    },

    cerrar() { if (this.nodo) this.nodo.hidden = true; },

    alternar(ancla) { if (this.abierto() && this.ancla === ancla) this.cerrar(); else this.abrir(ancla); },

    colocar() {
      if (!this.ancla || !this.nodo) return;
      const r = this.ancla.getBoundingClientRect();
      const ancho = 340;
      const s = this.nodo.style;
      s.left = Math.max(8, Math.min(innerWidth - ancho - 8, r.right - ancho)) + 'px';
      // Del lado del boton donde haya mas sitio, y nunca mas alto que ese sitio (si no
      // cabe, el panel se desplaza por dentro). Medido: con la pagina bajada, la
      // pastilla de YouTube queda a media altura y el panel se salia por arriba.
      const arriba = r.top - 16;
      const abajo = innerHeight - r.bottom - 16;
      s.maxHeight = Math.max(200, Math.min(560, Math.max(arriba, abajo))) + 'px';
      if (arriba >= abajo) { s.top = ''; s.bottom = Math.max(8, innerHeight - r.top + 8) + 'px'; }
      else { s.bottom = ''; s.top = Math.max(8, r.bottom + 8) + 'px'; }
    },

    pedir(modo) {
      const a = actual();
      if (!a) return;
      enviar({ tipo: 'descargar', id: a.id, modo, titulo: MUSICA && a.autor ? `${a.autor} - ${a.titulo}` : a.titulo });
    },

    textoTrabajo(t) {
      const tipo = t.modo === 'audio' ? tr('Song', 'Canción') : tr('Video', 'Vídeo');
      switch (t.fase) {
        case 'cola': return `${tipo} · ${tr('Waiting…', 'En espera…')}`;
        case 'bajando': {
          const partes = [`${tipo} · ${decimal(Math.floor(t.pct))} %`];
          if (t.velocidad > 0) partes.push(decimal((t.velocidad / 1048576).toFixed(1)) + ' MB/s');
          if (t.eta != null && t.eta > 0) partes.push(t.eta >= 60 ? Math.round(t.eta / 60) + ' min' : t.eta + ' s');
          return partes.join(' · ');
        }
        case 'procesando': return `${tipo} · ${tr('Finishing…', 'Terminando…')}`;
        case 'hecha': return t.nombre || tr('Done', 'Listo');
        case 'cancelada': return `${tipo} · ${tr('Canceled', 'Cancelada')}`;
        case 'error': return t.error ? t.error[idioma()] || t.error.en : tr('Failed', 'Falló');
        default: return '';
      }
    },

    pintarLista() {
      const lista = this.partes.lista;
      lista.textContent = '';
      if (!estado.trabajos.length) {
        lista.appendChild(el('div', 'vacio', tr('Nothing downloaded yet.', 'Todavía no hay descargas.')));
        return;
      }
      for (const t of estado.trabajos) {
        const f = el('div', 'fila');
        const txt = el('div', 'txt');
        txt.appendChild(el('b', null, t.titulo || t.id));
        const s = el('small', t.fase === 'error' ? 'mal' : null, this.textoTrabajo(t));
        txt.appendChild(s);
        if (activo(t)) {
          const barra = el('div', 'barra' + (t.fase !== 'bajando' || !t.pct ? ' espera' : ''));
          const i = el('i');
          if (t.fase === 'bajando' && t.pct) i.style.width = Math.min(100, t.pct) + '%';
          barra.appendChild(i);
          txt.appendChild(barra);
        }
        f.appendChild(txt);
        const boton = (ico, etiqueta, fn) => {
          const b = el('button', 'mini');
          b.type = 'button';
          b.title = etiqueta;
          b.setAttribute('aria-label', etiqueta);
          b.appendChild(icono(ico));
          b.addEventListener('click', fn);
          f.appendChild(b);
        };
        if (activo(t)) boton('cerrar', tr('Cancel', 'Cancelar'), () => enviar({ tipo: 'cancelar', trabajo: t.trabajo }));
        else if (t.fase === 'hecha') boton('carpeta', tr('Show in folder', 'Mostrar en la carpeta'), () => enviar({ tipo: 'mostrar', trabajo: t.trabajo }));
        else {
          boton('otra', tr('Try again', 'Reintentar'), () => {
            enviar({ tipo: 'quitar', trabajo: t.trabajo });
            enviar({ tipo: 'descargar', id: t.id, modo: t.modo, titulo: t.titulo });
          });
        }
        lista.appendChild(f);
      }
    },

    pintar() {
      if (!this.nodo || this.nodo.hidden) return;
      const a = actual();
      const aj = estado.ajustes;
      this.partes.que.textContent = a ? (a.autor && MUSICA ? `${a.titulo} · ${a.autor}` : a.titulo) : tr('Play something to download it.', 'Reproduce algo para descargarlo.');

      const enCurso = a ? trabajosDe(a.id).filter(activo) : [];
      const sub = (modo) => {
        if (enCurso.some((t) => t.modo === modo)) return tr('Downloading…', 'Descargando…');
        if (modo === 'audio') return estado.ffmpeg ? (aj.audio === 'm4a' ? tr('M4A, original quality, with cover', 'M4A, calidad original, con portada') : tr('MP3, best quality, with cover', 'MP3, máxima calidad, con portada')) : 'M4A';
        if (!estado.ffmpeg) return tr('MP4 (best single file)', 'MP4 (el mejor archivo único)');
        return 'MP4 · ' + (aj.calidad === 'max' ? tr('best quality', 'máxima calidad') : aj.calidad + 'p');
      };
      for (const modo of ['audio', 'video']) {
        const p = this.partes[modo];
        p.s.textContent = sub(modo);
        p.b.disabled = !a || !estado.listo || enCurso.some((t) => t.modo === modo);
      }
      for (const b of this.partes.calidad) b.setAttribute('aria-pressed', String(b.dataset.valor === aj.calidad));
      for (const b of this.partes.formato) b.setAttribute('aria-pressed', String(b.dataset.valor === aj.audio));
      this.partes.cookies.checked = !!aj.cookies;

      let nota = aviso || '';
      if (!estado.listo) nota = tr('The downloader is not ready: yt-dlp is missing. Run the Downloader installer again.', 'El descargador no está listo: falta yt-dlp. Vuelve a ejecutar el instalador de Descargas.');
      else if (!estado.ffmpeg && !nota) nota = tr('Without ffmpeg there is no MP3 or HD video. Run the installer again to add it.', 'Sin ffmpeg no hay MP3 ni vídeo HD. Vuelve a ejecutar el instalador para añadirlo.');
      this.partes.nota.textContent = nota;
      this.partes.nota.hidden = !nota;

      this.partes.ruta.textContent = estado.carpeta || '';
      this.partes.ruta.title = estado.carpeta || '';
      this.pintarLista();
    },
  };

  // --- Los botones ---------------------------------------------------------------------
  const Boton = {
    host: null, boton: null, sitio: null,

    crear(css, conTexto) {
      const host = document.createElement('zen-descargas-boton');
      const raiz = host.attachShadow({ mode: 'closed' });
      const st = el('style');
      st.textContent = css;
      raiz.appendChild(st);
      const b = el('button');
      b.type = 'button';
      b.title = tr('Download song or video', 'Descargar canción o vídeo');
      b.setAttribute('aria-label', tr('Download', 'Descargar'));
      b.appendChild(icono('bajar'));
      if (conTexto) { this.texto = el('span', null, tr('Download', 'Descargar')); b.appendChild(this.texto); } else this.texto = null;
      b.addEventListener('click', (e) => {
        // La barra de YouTube Music abre el reproductor grande con cualquier clic que
        // le llegue en burbuja: el boton se queda con el suyo.
        e.stopPropagation();
        Panel.alternar(host);
      });
      raiz.appendChild(b);
      this.host = host;
      this.boton = b;
      return host;
    },

    // Donde va, segun la pagina. Devuelve [contenedor, antesDe, css, conTexto, modo].
    sitioActual() {
      if (MUSICA) {
        // El mismo sitio que Mezcla y Remoto: antes del menu desplegable de la barra.
        const barra = document.querySelector('ytmusic-player-bar #right-controls, ytmusic-player-bar .right-controls');
        if (!barra) return null;
        const menu = barra.querySelector('#expanding-menu');
        return { donde: barra, antes: menu && menu.parentElement === barra ? menu : barra.firstChild, css: CSS_BARRA, texto: false, modo: 'barra' };
      }
      if (location.pathname.startsWith('/shorts/')) {
        // La columna de Me gusta / Comentar / Compartir del Short que esta en pantalla
        // (medido el 19-11-2026: reel-action-bar-view-model, una por Short cargado).
        const visible = [...document.querySelectorAll('reel-action-bar-view-model, ytd-reel-video-renderer[is-active] #actions')]
          .find((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && r.bottom > 0; });
        if (visible) {
          const pivote = visible.querySelector(':scope > pivot-button-view-model');
          return { donde: visible, antes: pivote, css: CSS_PASTILLA, texto: false, modo: 'redondo' };
        }
        return { donde: document.documentElement, antes: null, css: CSS_PASTILLA, texto: false, modo: 'flotante' };
      }
      if (/^\/(watch|live\/)/.test(location.pathname)) {
        const fila = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
        if (fila) return { donde: fila, antes: null, css: CSS_PASTILLA, texto: true, modo: 'pastilla' };
      }
      return null;
    },

    poner() {
      const s = this.sitioActual();
      if (!s) {
        if (this.host && this.host.isConnected) this.host.remove();
        if (Panel.abierto() && !MUSICA) Panel.cerrar();
        return;
      }
      const clave = s.modo;
      if (!this.host || this.sitio !== clave) {
        if (this.host) this.host.remove();
        this.crear(s.css, s.texto);
        this.sitio = clave;
        if (s.modo === 'redondo') this.host.setAttribute('redondo', '');
        if (s.modo === 'flotante') { this.host.setAttribute('redondo', ''); this.host.setAttribute('flotante', ''); }
      }
      if (this.host.parentNode !== s.donde) s.donde.insertBefore(this.host, s.antes || null);
      this.pintar();
    },

    pintar() {
      if (!this.boton) return;
      const a = actual();
      const enCurso = a ? trabajosDe(a.id).filter(activo) : [];
      this.boton.dataset.fase = enCurso.length ? 'activa' : '';
      if (this.texto) {
        const t = enCurso[0];
        this.texto.textContent = t ? (t.fase === 'bajando' && t.pct ? decimal(Math.floor(t.pct)) + ' %' : tr('Downloading…', 'Descargando…')) : tr('Download', 'Descargar');
      }
    },
  };

  const pintar = () => {
    try { Boton.pintar(); Panel.pintar(); } catch (e) { /* sigue */ }
  };

  // --- Arranque ------------------------------------------------------------------------
  // YouTube cambia de video sin recargar: se repasa cada segundo (barato: dos
  // querySelector) y tambien al terminar cada navegacion.
  const repasar = () => {
    try { Boton.poner(); if (Panel.abierto()) { Panel.pintar(); Panel.colocar(); } } catch (e) { /* sigue */ }
  };
  setInterval(repasar, 1000);
  addEventListener('yt-navigate-finish', () => setTimeout(repasar, 50));
  addEventListener('resize', () => { if (Panel.abierto()) Panel.colocar(); }, { passive: true });

  // Cerrar al hacer clic fuera o con Escape.
  addEventListener('pointerdown', (e) => {
    if (!Panel.abierto()) return;
    const ruta = e.composedPath();
    if (ruta.includes(Panel.host) || (Boton.host && ruta.includes(Boton.host))) return;
    Panel.cerrar();
  }, { capture: true });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && Panel.abierto()) { Panel.cerrar(); if (Boton.boton) Boton.boton.focus(); }
  }, { capture: true });

  addEventListener('pagehide', () => enviar({ tipo: 'adios' }));
  enviar({ tipo: 'hola' });
})();

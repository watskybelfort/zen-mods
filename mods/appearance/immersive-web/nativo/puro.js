/* Zen Inmersivo — la parte pura. Decide que CSS va en cada web.
 *
 * Es el sustituto nativo de la extension Zen Internet (sameerasw, MIT). Lo que se
 * ve —lo que se oculta, la transparencia, los efectos al pasar el raton, el
 * buscador inmersivo de YouTube, la barra lateral de YouTube Music— no esta en la
 * extension: esta en su catalogo publico, styles.json del repo my-internet (MIT),
 * que trae para cada web una lista de "funciones" con nombre y su CSS. La
 * extension es el motor que elige cuales aplicar. Esto es ese motor.
 *
 * TRADUCCION FIEL, RAREZAS INCLUIDAS ------------------------------------------
 * Se copia la logica de background.js v3.2.0 (shouldApplyStyling, applyCSSToTab y
 * applyCSS) tal cual, aunque haya cosas que hoy no se escribirian asi: el orden de
 * las comprobaciones decide que hoja gana cuando varias casan, y cambiarlo cambia
 * lo que se ve en alguna web. Se prueba contra el motor de la propia extension,
 * ejecutado en node, en todas las webs del catalogo (dev/tools/probar-inmersivo.mjs).
 *
 * Ajustes (los mismos de la extension, con nombres propios):
 *   global      enableStyling, forceStyling, whitelistMode, whitelistStyleMode,
 *               disableTransparency, disableHover, disableFooter,
 *               disableDarkReader, autoUpdate
 *   sitios      { host: { "<funcion>": false, movableLiveChat: false } }
 *   sinTema     skipThemingList: webs excluidas (o incluidas, en modo lista blanca)
 *   sinForzar   skipForceThemingList: lo mismo para el modo "forzar en todas"
 *   fondo       fallbackBackgroundList: webs con fondo de respaldo, sin transparencia
 *   mapeo       userStylesMapping: alias propios, ademas de los del catalogo
 */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.ZenInmersivoPuro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GLOBAL_DEFECTO = {
    enableStyling: true,
    autoUpdate: true,
    forceStyling: false,
    whitelistMode: false,
    whitelistStyleMode: false,
    disableTransparency: false,
    disableHover: false,
    disableFooter: false,
    disableDarkReader: false,
  };

  const normalizar = (h) => (typeof h === 'string' && h.startsWith('www.') ? h.substring(4) : String(h || ''));

  const ajustesCompletos = (a) => {
    a = a && typeof a === 'object' ? a : {};
    const g = Object.assign({}, GLOBAL_DEFECTO);
    if (a.global && typeof a.global === 'object') {
      for (const k of Object.keys(GLOBAL_DEFECTO)) if (typeof a.global[k] === 'boolean') g[k] = a.global[k];
    }
    const lista = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : []);
    const sitios = {};
    if (a.sitios && typeof a.sitios === 'object') {
      for (const [h, v] of Object.entries(a.sitios)) if (v && typeof v === 'object') sitios[h] = v;
    }
    const mapeo = {};
    if (a.mapeo && typeof a.mapeo === 'object') {
      for (const [k, v] of Object.entries(a.mapeo)) if (Array.isArray(v)) mapeo[k] = lista(v);
    }
    return { global: g, sitios, sinTema: lista(a.sinTema), sinForzar: lista(a.sinForzar), fondo: lista(a.fondo), mapeo };
  };

  // Mapeo del catalogo mas el del usuario, sin repetir.
  const mapeoJunto = (catalogo, ajustes) => {
    const m = {};
    const base = (catalogo && catalogo.mapping) || {};
    for (const [k, v] of Object.entries(base)) m[k] = Array.isArray(v) ? v.slice() : [];
    for (const [k, v] of Object.entries(ajustes.mapeo || {})) {
      if (!m[k]) m[k] = [];
      for (const t of v) if (!m[k].includes(t)) m[k].push(t);
    }
    return m;
  };

  // La cache de la extension (preloadStyles): clave sin ".css" y, ademas, cada web
  // mapeada con el CSS de su origen.
  const claves = (catalogo, mapeo) => {
    const c = new Set();
    for (const web of Object.keys((catalogo && catalogo.website) || {})) {
      c.add(web.replace('.css', ''));
      for (const m of mapeo[web] || []) c.add(normalizar(m));
    }
    return c;
  };

  // shouldApplyStyling de background.js.
  const debeAplicar = (host, catalogo, ajustes, mapeo, cache) => {
    const g = ajustes.global;
    if (!g.enableStyling) return { si: false, motivo: 'globally_disabled' };
    const n = normalizar(host);
    let especifico = false;
    if (cache.has(n) || cache.has(`www.${n}`)) especifico = true;
    else {
      for (const s of cache) {
        if (s.startsWith('+')) {
          const b = s.slice(1);
          if (n === b || n.endsWith(`.${b}`)) { especifico = true; break; }
        } else if (s.startsWith('-')) {
          const b = s.slice(1);
          const dom = b.split('.').slice(0, -1).join('.');
          const partes = n.split('.');
          const hd = partes.length > 1 ? partes.slice(0, -1).join('.') : n;
          if (dom && hd && hd === dom) { especifico = true; break; }
        } else if (n !== s && n.endsWith(`.${s}`) && !s.startsWith('-')) { especifico = true; break; }
      }
    }
    if (!especifico) {
      for (const destinos of Object.values(mapeo)) if (destinos.includes(n)) { especifico = true; break; }
    }
    if (especifico) {
      const en = ajustes.sinTema.includes(n);
      if (g.whitelistStyleMode) return { si: en, motivo: en ? 'whitelisted' : 'not_whitelisted' };
      return { si: !en, motivo: en ? 'blacklisted' : 'not_blacklisted' };
    }
    if (g.forceStyling) {
      const en = ajustes.sinForzar.includes(n);
      if (g.whitelistMode) return { si: en, motivo: en ? 'force_whitelisted' : 'force_not_whitelisted' };
      return { si: !en, motivo: en ? 'force_blacklisted' : 'force_not_blacklisted' };
    }
    return { si: false, motivo: 'no_styling_rules' };
  };

  // El "mejor" archivo del catalogo para un host (el bucle de applyCSSToTab). El
  // de la rama de fondo de respaldo es casi igual pero no del todo: el `+` no es
  // excluyente con lo demas. Se reproducen los dos.
  const mejorClave = (host, catalogo, ramaFondo) => {
    let mejor = null;
    let largo = 0;
    for (const key of Object.keys((catalogo && catalogo.website) || {})) {
      const nombre = key.replace('.css', '');
      const nn = normalizar(nombre);
      if (host === nn) { mejor = key; break; }
      if (ramaFondo) {
        if (nombre.startsWith('+') && (host === nombre.slice(1) || host.endsWith(`.${nombre.slice(1)}`)) && nombre.slice(1).length > largo) {
          mejor = key; largo = nombre.slice(1).length;
        }
        if (nombre.startsWith('-')) {
          const b = nombre.slice(1);
          const dom = b.split('.').slice(0, -1).join('.');
          const p = host.split('.');
          const hd = p.length > 1 ? p.slice(0, -1).join('.') : host;
          if (dom && hd && hd === dom && dom.length > largo) { mejor = key; largo = dom.length; }
        }
        if (host !== nn && host.endsWith(`.${nn}`) && !nombre.startsWith('-') && nn.length > largo) { mejor = key; largo = nn.length; }
        continue;
      }
      if (nombre.startsWith('+')) {
        const b = nombre.slice(1);
        if ((host === b || host.endsWith(`.${b}`)) && b.length > largo) { mejor = key; largo = b.length; }
      } else if (nombre.startsWith('-')) {
        const b = nombre.slice(1);
        const dom = b.split('.').slice(0, -1).join('.');
        const p = host.split('.');
        const hd = p.length > 1 ? p.slice(0, -1).join('.') : host;
        if (dom && hd && hd === dom && dom.length > largo) { mejor = key; largo = dom.length; }
      } else if (host !== nn && host.endsWith(`.${nn}`) && !nombre.startsWith('-') && nn.length > largo) {
        mejor = key; largo = nn.length;
      }
    }
    return mejor;
  };

  const FONDO_CSS = '\nhtml{\n    background-color: light-dark(#fff, #111);\n}\n';
  const FONDO_CSS_RAMA = '\nhtml {\n    background-color: light-dark(#fff, #111);\n}\n';

  const tipo = (f, css) => {
    const l = f.toLowerCase();
    return {
      transparencia: l.includes('transparency'),
      hover: l.includes('hover'),
      pie: l.includes('footer'),
      darkreader: l.includes('darkreader') || String(css).toLowerCase().includes('darkreader'),
    };
  };

  // applyCSS de background.js.
  const juntar = (host, funciones, ajustes) => {
    const g = ajustes.global;
    const n = normalizar(host);
    const fondo = ajustes.fondo.includes(n);
    const propios = ajustes.sitios[n] || {};
    let css = '';
    for (const [f, c] of Object.entries(funciones || {})) {
      const t = tipo(f, c);
      if (t.transparencia && (g.disableTransparency || fondo)) continue;
      if (t.hover && g.disableHover) continue;
      if (t.pie && g.disableFooter) continue;
      if (t.darkreader && g.disableDarkReader) continue;
      if (propios[f] === false) continue;
      // El chat superpuesto por CSS se salta si esta el chat movible (por JS).
      if (n === 'youtube.com' && f.toLowerCase().includes('transparent overlay chat') && propios.movableLiveChat !== false) continue;
      css += c + '\n';
    }
    if (fondo) css += FONDO_CSS;
    return css;
  };

  // Lo que la extension mandaria a la pestana: { css, motivo, clave }. `css` vacio
  // es "quitar los estilos".
  const cssPara = (hostOriginal, catalogo, ajustesBrutos) => {
    const ajustes = ajustesCompletos(ajustesBrutos);
    const host = normalizar(hostOriginal);
    const web = (catalogo && catalogo.website) || {};
    const mapeo = mapeoJunto(catalogo, ajustes);
    const cache = claves(catalogo, mapeo);
    const estado = debeAplicar(host, catalogo, ajustes, mapeo, cache);
    const fondo = ajustes.fondo.includes(host);

    if (estado.motivo === 'globally_disabled') return { css: '', motivo: estado.motivo, clave: null };
    if (!estado.si && !fondo) return { css: '', motivo: estado.motivo, clave: null };

    if (fondo) {
      let css = FONDO_CSS_RAMA;
      const clave = mejorClave(host, catalogo, true);
      const funciones = clave ? web[clave] : null;
      if (funciones) {
        const propios = ajustes.sitios[host] || {};
        for (const [f, c] of Object.entries(funciones)) {
          const t = tipo(f, c);
          if (!t.transparencia && !t.hover && !t.pie && propios[f] !== false) css += c + '\n';
        }
      }
      return { css, motivo: 'fallback', clave };
    }

    const clave = mejorClave(host, catalogo, false);
    if (clave) return { css: juntar(host, web[clave], ajustes), motivo: estado.motivo, clave };
    for (const [origen, destinos] of Object.entries(mapeo)) {
      if (destinos.includes(host)) {
        if (web[origen]) return { css: juntar(host, web[origen], ajustes), motivo: estado.motivo, clave: origen };
        break;
      }
    }
    if (ajustes.global.forceStyling && web['example.com.css']) {
      return { css: juntar(host, web['example.com.css'], ajustes), motivo: estado.motivo, clave: 'example.com.css' };
    }
    return { css: '', motivo: estado.motivo, clave: null };
  };

  // Las funciones de una web, para el menu: nombre visible, descripcion (lo que va
  // tras el `$`), si esta puesta y si un interruptor global la anula.
  const funcionesDe = (hostOriginal, catalogo, ajustesBrutos) => {
    const ajustes = ajustesCompletos(ajustesBrutos);
    const host = normalizar(hostOriginal);
    const r = cssPara(host, catalogo, ajustes);
    const web = (catalogo && catalogo.website) || {};
    const funciones = r.clave ? web[r.clave] : null;
    const propios = ajustes.sitios[host] || {};
    const g = ajustes.global;
    const out = [];
    if (host === 'youtube.com') {
      out.push({ id: 'movableLiveChat', nombre: 'Movable Live Chat', descripcion: 'Make the live chat window draggable in theater mode', puesta: propios.movableLiveChat !== false, anulada: false });
    }
    for (const [f, c] of Object.entries(funciones || {})) {
      // La extension corta por el primer guion ("yt-Transparency" -> "Transparency"),
      // y con eso "timed comments pop-up" salia como "up". Aqui solo se quita un
      // prefijo corto sin espacios, que es la convencion del catalogo.
      let nombre = f.replace(/^[a-z0-9]{1,6}-(?=\S)/i, '');
      let descripcion = '';
      if (nombre.includes('$')) {
        const p = nombre.split('$');
        nombre = p[0].trim();
        descripcion = p.slice(1).join('$').trim();
      }
      const t = tipo(f, c);
      const anulada = (g.disableTransparency && t.transparencia) || (g.disableHover && t.hover) || (g.disableFooter && t.pie) || (g.disableDarkReader && t.darkreader);
      out.push({ id: f, nombre, descripcion, puesta: propios[f] !== false, anulada: !!anulada });
    }
    return { host, clave: r.clave, motivo: r.motivo, generico: r.clave === 'example.com.css', funciones: out };
  };

  // Un catalogo tiene que tener esta forma para aceptarlo (lo que baja de la red
  // pasa por aqui antes de guardarse).
  const catalogoValido = (c) => {
    if (!c || typeof c !== 'object' || !c.website || typeof c.website !== 'object') return false;
    const webs = Object.entries(c.website);
    if (webs.length < 50) return false;
    for (const [k, v] of webs) {
      if (typeof k !== 'string' || !k.endsWith('.css') || !v || typeof v !== 'object') return false;
      for (const css of Object.values(v)) if (typeof css !== 'string') return false;
    }
    if (c.mapping !== undefined && (typeof c.mapping !== 'object' || c.mapping === null)) return false;
    return true;
  };

  return { GLOBAL_DEFECTO, normalizar, ajustesCompletos, cssPara, funcionesDe, catalogoValido, mejorClave };
});

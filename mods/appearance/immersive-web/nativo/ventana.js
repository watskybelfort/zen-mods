// Zen Inmersivo — la parte de cada ventana: el submenu del clic derecho y los
// atajos. Es lo que en la extension era el popup de la barra y sus "commands".
//
//   Clic derecho > Zen Inmersivo
//     Estilos en <web>                     encender o apagar esta web
//     <cada funcion del tema de esa web>   una casilla por funcion
//     Fondo de respaldo en <web>           fondo solido en vez de transparente
//     Ajustes generales >                  los interruptores globales
//
//   Alt+Shift+U  estilos en esta web        Alt+Shift+G  estilos en todas
//   Alt+Shift+O  transparencia global       Alt+Shift+B  fondo de respaldo aqui
//   (los mismos de la extension, con el mismo aviso animado en la pagina)
//
// No ve el ambito del servicio: lee y escribe la pref de ajustes y lee sharedData.
// El servicio se entera del cambio de la pref y lo publica a las pestanas.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  // EL IDIOMA de los menus: el de la interfaz de Zen, o el que fuerce la pref
  // compartida zen.mods.idioma ('auto' | 'es' | 'en'). Se mira al abrir el menu.
  const idioma = () => {
    let f = 'auto';
    try { f = SV.prefs.getStringPref('zen.mods.idioma', 'auto'); } catch (e) { /* auto */ }
    if (f === 'es' || f === 'en') return f;
    try { return /^es\b/i.test(SV.locale.appLocaleAsBCP47) ? 'es' : 'en'; } catch (e) { return 'en'; }
  };
  const tr = (en, es) => (idioma() === 'es' ? es : en);

  const PREF_AJUSTES = 'zen.inmersivo.ajustes';
  const PREF_FECHA = 'zen.inmersivo.catalogo.fecha';
  const ID_MENU = 'contentAreaContextMenu';
  const ID_RAIZ = 'zen-inmersivo-menu';
  const VECINOS = ['zen-cristal-menu', 'context-savepage', 'context-take-screenshot', 'context-viewsource', 'context-selectall'];

  const registrar = (msg) => { try { SV.console.logStringMessage('[inmersivo] ' + msg); } catch (e) { /* nada */ } };

  const menu = document.getElementById(ID_MENU);
  if (!menu || document.getElementById(ID_RAIZ)) return;

  // El motor puro, para saber que funciones tiene cada web.
  const ambito = {};
  try { SV.scriptloader.loadSubScript('resource://zen-nativo/zen-inmersivo/puro.js', ambito); } catch (e) { registrar('sin puro.js en la ventana: ' + e); return; }
  const P = ambito.ZenInmersivoPuro || window.ZenInmersivoPuro;
  if (!P) { registrar('puro.js no dejo ZenInmersivoPuro'); return; }

  const sd = () => SV.ppmm.sharedData;
  let catalogo = null;
  let catalogoTexto = null;
  const elCatalogo = () => {
    const t = sd().get('zen-inmersivo:catalogo');
    if (t && t !== catalogoTexto) { try { catalogo = JSON.parse(t); catalogoTexto = t; } catch (e) { catalogo = null; } }
    return catalogo;
  };
  const leerTodo = () => { try { return JSON.parse(SV.prefs.getStringPref(PREF_AJUSTES, '{}')) || {}; } catch (e) { return {}; } };
  const ajustes = () => P.ajustesCompletos(leerTodo());
  // Se conserva lo que no es de puro.js (la posicion del chat).
  const guardar = (nuevos) => {
    const todo = leerTodo();
    const limpio = P.ajustesCompletos(nuevos);
    if (todo.chat) limpio.chat = todo.chat;
    SV.prefs.setStringPref(PREF_AJUSTES, JSON.stringify(limpio));
  };
  const activo = () => sd().get('zen-inmersivo:activo') === true;

  const hostActual = () => {
    try {
      const uri = gBrowser.selectedBrowser.currentURI;
      if (!uri || (uri.scheme !== 'http' && uri.scheme !== 'https')) return '';
      return P.normalizar(uri.host);
    } catch (e) { return ''; }
  };

  const avisar = (texto, encendido) => {
    try {
      const bc = gBrowser.selectedBrowser.browsingContext;
      if (bc) SV.ppmm.broadcastAsyncMessage('zen-inmersivo:aviso', { bc: bc.id, texto, encendido });
    } catch (e) { /* sin aviso */ }
  };

  const alternarEnLista = (lista, host) => {
    const i = lista.indexOf(host);
    if (i === -1) lista.push(host); else lista.splice(i, 1);
  };

  // --- Las acciones (las mismas del menu y de los atajos) -------------------------
  const ACCIONES = {
    sitio() {
      const h = hostActual();
      if (!h) return;
      const a = ajustes();
      alternarEnLista(a.sinTema, h);
      guardar(a);
      const en = a.sinTema.includes(h);
      avisar(tr('Site styles', 'Estilos de la web'), a.global.whitelistStyleMode ? en : !en);
    },
    global() {
      const a = ajustes();
      a.global.enableStyling = !a.global.enableStyling;
      guardar(a);
      avisar(tr('Styles on all sites', 'Estilos en todas las webs'), a.global.enableStyling);
    },
    transparencia() {
      const a = ajustes();
      a.global.disableTransparency = !a.global.disableTransparency;
      guardar(a);
      avisar(tr('Transparency', 'Transparencia'), !a.global.disableTransparency);
    },
    fondo() {
      const h = hostActual();
      if (!h) return;
      const a = ajustes();
      alternarEnLista(a.fondo, h);
      guardar(a);
      avisar(tr('Fallback background', 'Fondo de respaldo'), a.fondo.includes(h));
    },
  };

  // --- Atajos ------------------------------------------------------------------
  // En captura y en la ventana, antes que la pagina. Solo con el mod activo: con
  // la extension puesta, los atajos son suyos.
  const TECLAS = { KeyU: 'sitio', KeyG: 'global', KeyO: 'transparencia', KeyB: 'fondo' };
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const accion = TECLAS[e.code];
    if (!accion || !activo()) return;
    e.preventDefault();
    e.stopPropagation();
    try { ACCIONES[accion](); } catch (err) { registrar('atajo: ' + err); }
  }, true);

  // --- El submenu ---------------------------------------------------------------
  const crear = (etiqueta, atributos) => {
    const n = document.createXULElement(etiqueta);
    for (const [k, v] of Object.entries(atributos || {})) n.setAttribute(k, v);
    return n;
  };
  const casilla = (label, marcada, alPulsar, extra = {}) => {
    const n = crear('menuitem', Object.assign({ type: 'checkbox', label }, extra));
    if (marcada) n.setAttribute('checked', 'true');
    n.addEventListener('command', alPulsar);
    return n;
  };

  const raiz = crear('menu', { id: ID_RAIZ, label: tr('Immersive Web', 'Zen Inmersivo') });
  const popup = crear('menupopup', { id: 'zen-inmersivo-popup' });
  raiz.appendChild(popup);
  const vecino = VECINOS.map((id) => document.getElementById(id)).find((n) => n && n.parentNode === menu);
  if (vecino) menu.insertBefore(raiz, vecino); else menu.appendChild(raiz);

  const hace = (t) => {
    if (!t) return tr('never', 'nunca');
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return tr('just now', 'hace un momento');
    if (m < 60) return tr(`${m} min ago`, `hace ${m} min`);
    const h = Math.round(m / 60);
    return h < 48 ? tr(`${h} h ago`, `hace ${h} h`) : tr(`${Math.round(h / 24)} days ago`, `hace ${Math.round(h / 24)} días`);
  };

  const llenar = () => {
    popup.replaceChildren();
    const a = ajustes();
    const h = hostActual();
    const cat = elCatalogo();

    if (sd().get('zen-inmersivo:extension') === true) {
      popup.appendChild(crear('menuitem', { label: tr('Zen Internet is still on: turn it off to use this mod', 'Zen Internet sigue activa: desactívala para usar este mod'), disabled: 'true' }));
      return;
    }
    if (!cat) {
      popup.appendChild(crear('menuitem', { label: tr('No catalog: reinstall the mod', 'Sin catálogo: reinstala el mod'), disabled: 'true' }));
      return;
    }

    if (h) {
      const info = P.funcionesDe(h, cat, a);
      const blanca = a.global.whitelistStyleMode;
      const enLista = a.sinTema.includes(h);
      popup.appendChild(casilla(tr(`Styles on ${h}`, `Estilos en ${h}`), blanca ? enLista : !enLista, () => ACCIONES.sitio(), { acceltext: tr('Alt+Shift+U', 'Alt+Mayús+U') }));
      const tema = info.clave ? (info.generico ? tr('Generic theme (forced)', 'Tema genérico (forzado)') : tr('Theme: ', 'Tema: ') + info.clave.replace(/\.css$/, '').replace(/^[+-]/, '')) : tr('This site has no theme', 'Esta web no tiene tema');
      popup.appendChild(crear('menuitem', { label: tema, disabled: 'true' }));
      if (info.funciones.length) {
        popup.appendChild(crear('menuseparator'));
        for (const f of info.funciones) {
          const item = casilla(f.nombre + (f.anulada ? tr(' (overridden)', ' (anulada)') : ''), f.puesta, () => {
            const b = ajustes();
            const propios = Object.assign({}, b.sitios[h] || {});
            if (f.puesta) propios[f.id] = false; else delete propios[f.id];
            if (Object.keys(propios).length) b.sitios[h] = propios; else delete b.sitios[h];
            guardar(b);
          });
          if (f.descripcion) item.setAttribute('tooltiptext', f.descripcion);
          if (f.anulada) item.setAttribute('disabled', 'true');
          popup.appendChild(item);
        }
      }
      popup.appendChild(crear('menuseparator'));
      popup.appendChild(casilla(tr(`Fallback background on ${h}`, `Fondo de respaldo en ${h}`), a.fondo.includes(h), () => ACCIONES.fondo(), {
        acceltext: tr('Alt+Shift+B', 'Alt+Mayús+B'), tooltiptext: tr('Solid background instead of transparent, for sites that are hard to read over the glass', 'Fondo sólido en vez de transparente, para webs que se leen mal sobre el cristal'),
      }));
    }

    const generales = crear('menu', { label: tr('General settings', 'Ajustes generales') });
    const pg = crear('menupopup');
    const g = a.global;
    const interruptor = (label, valor, clave, invertido, extra) => pg.appendChild(casilla(label, valor, () => {
      const b = ajustes();
      b.global[clave] = !b.global[clave];
      guardar(b);
    }, extra));
    pg.appendChild(casilla(tr('Styles on all sites', 'Estilos en todas las webs'), g.enableStyling, () => ACCIONES.global(), { acceltext: tr('Alt+Shift+G', 'Alt+Mayús+G') }));
    pg.appendChild(casilla(tr('Transparency', 'Transparencia'), !g.disableTransparency, () => ACCIONES.transparencia(), { acceltext: tr('Alt+Shift+O', 'Alt+Mayús+O') }));
    interruptor(tr('Hover effects', 'Efectos al pasar el ratón'), !g.disableHover, 'disableHover');
    interruptor(tr('Footers', 'Pies de página'), !g.disableFooter, 'disableFooter');
    interruptor(tr('Dark Reader tweaks', 'Ajustes para Dark Reader'), !g.disableDarkReader, 'disableDarkReader');
    pg.appendChild(crear('menuseparator'));
    interruptor(tr('Force a theme on sites without one', 'Forzar un tema en webs sin tema'), g.forceStyling, 'forceStyling', false, { tooltiptext: tr("Applies the generic theme to sites that don't have their own", 'Aplica el tema genérico a las webs que no tienen uno propio') });
    interruptor(tr('Site list: only the chosen ones', 'Lista de webs: solo las elegidas'), g.whitelistStyleMode, 'whitelistStyleMode', false, { tooltiptext: tr('With this on, "Styles on <site>" becomes an allow list', 'Con esto, "Estilos en <web>" pasa a ser una lista blanca') });
    if (g.forceStyling) interruptor(tr('Force: only on the chosen ones', 'Forzar: solo en las elegidas'), g.whitelistMode, 'whitelistMode');
    pg.appendChild(crear('menuseparator'));
    interruptor(tr('Update the catalog automatically', 'Actualizar el catálogo solo'), g.autoUpdate, 'autoUpdate', false, { tooltiptext: tr('Every 2 hours, like the extension', 'Cada 2 horas, como la extensión') });
    const ultima = Number(SV.prefs.getStringPref(PREF_FECHA, '0')) || 0;
    const actualizar = crear('menuitem', { label: tr(`Check for new themes now (last: ${hace(ultima)})`, `Buscar temas nuevos ahora (último: ${hace(ultima)})`) });
    actualizar.addEventListener('command', () => SV.obs.notifyObservers(null, 'zen-inmersivo:bajar'));
    pg.appendChild(actualizar);
    generales.appendChild(pg);
    if (h) popup.appendChild(crear('menuseparator'));
    popup.appendChild(generales);
  };

  menu.addEventListener('popupshowing', (ev) => {
    if (ev.target !== menu) return;
    let encendido = true;
    try { encendido = SV.prefs.getBoolPref('zen.inmersivo.encendido', true); } catch (e) { /* si */ }
    raiz.hidden = !encendido;
    raiz.setAttribute('label', tr('Immersive Web', 'Zen Inmersivo'));
    if (encendido) { try { llenar(); } catch (e) { registrar('no pude llenar el menu: ' + e); } }
  });
})();

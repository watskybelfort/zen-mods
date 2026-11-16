// Zen Modo Oscuro — la entrada "Activar modo oscuro" del clic derecho
//
// Lo carga el cargador nativo en cada ventana de navegador, con `loadSubScript`,
// asi que corre DENTRO del ambito de la ventana: `document`, `gBrowser` y
// compania estan a mano sin pedirlos.
//
// Todo lo que hace es escribir una pref. Quien oscurece es el inyector de
// contenido (proceso.js), que escucha esa pref y arranca el motor en los
// documentos del sitio. Dos piezas, una direccion: pref -> motor.
//
// POR QUE UNA ENTRADA SUELTA Y NO DENTRO DE "ZEN CRISTAL". Zen Sin Cristal
// metio lo suyo en un submenu porque tiene cuatro acciones. Esto es una sola, y
// se usa mas que ninguna de aquellas: al clic derecho tiene que estar a la
// vista, con la palabra "modo oscuro" escrita, no un nivel mas abajo. El
// precio —una linea nuestra en un menu de Firefox— es el que el otro mod
// evito, y aqui compensa.
//
// DONDE: justo antes del submenu "Zen Cristal" si esta (los dos hablan de lo
// mismo: como se ve esta pagina), y si no, en el grupo de acciones sobre "esta
// pagina", igual que el otro.
//
// NINGUN ID NUESTRO EMPIEZA POR `context-`: browser-context.js cuelga un listener
// de `command` del propio #contentAreaContextMenu con un switch sobre
// `event.target.id` que remata en `startsWith("context-pdfjs-")`. Con el prefijo
// `zen-oscuro-` no hay forma de chocar, ni hoy ni cuando anadan casos nuevos.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const PREF_SITIOS = 'zen.modooscuro.sitios';
  const PREF_ENCENDIDO = 'zen.modooscuro.encendido';
  const PREF_TODO = 'zen.modooscuro.todo';

  const ID_ITEM = 'zen-oscuro-item';
  const ID_MENU = 'contentAreaContextMenu';

  // El submenu de Zen Sin Cristal, si esta puesto. Se mira por su id y no se
  // depende de el: si no existe se cae a los vecinos de siempre.
  const ID_CRISTAL = 'zen-cristal-menu';
  const VECINOS = ['context-savepage', 'context-take-screenshot', 'context-viewsource', 'context-selectall'];

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[modo-oscuro] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  const menu = document.getElementById(ID_MENU);
  if (!menu) {
    registrar('no hay #' + ID_MENU + ' en esta ventana: sin entrada de menu');
    return;
  }

  // Volver a cargarlo en la misma ventana no debe dejar dos entradas: pasa al
  // reinstalar sin reiniciar.
  if (document.getElementById(ID_ITEM)) return;

  // --- La lista -------------------------------------------------------------
  const partir = (crudo) => String(crudo || '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^\.+/, ''))
    .filter(Boolean);

  const leer = () => {
    try { return partir(SV.prefs.getStringPref(PREF_SITIOS, '')); } catch (e) { return []; }
  };

  // Se guarda separado por comas y espacio: es lo que mejor se lee en about:config.
  const escribir = (lista) => {
    try { SV.prefs.setStringPref(PREF_SITIOS, lista.join(', ')); } catch (e) { registrar('no pude escribir la lista: ' + e); }
  };

  const leerBool = (pref, defecto) => {
    try { return SV.prefs.getBoolPref(pref, defecto); } catch (e) { return defecto; }
  };

  // --- Que sitio es este ----------------------------------------------------
  // El dominio base y no el host: oscurecer `www.ejemplo.com` tiene que
  // oscurecer `ejemplo.com`, o el interruptor pareceria no funcionar en cuanto
  // el sitio te mueva de subdominio. `getBaseDomainFromHost` sabe de sufijos
  // publicos (`ejemplo.com.co`, `ejemplo.co.uk`); recortar por puntos no.
  // Lanza con las IP y con hosts de una sola etiqueta: ahi el host ya es la
  // respuesta.
  const sitioActual = () => {
    let uri = null;
    try { uri = gBrowser.selectedBrowser.currentURI; } catch (e) { return ''; }
    if (!uri || (uri.scheme !== 'http' && uri.scheme !== 'https')) return '';
    let host = '';
    try { host = uri.host; } catch (e) { return ''; }
    if (!host) return '';
    try { return SV.eTLD.getBaseDomainFromHost(host).toLowerCase(); } catch (e) { return host.toLowerCase(); }
  };

  // --- La entrada ------------------------------------------------------------
  const item = document.createXULElement('menuitem');
  item.id = ID_ITEM;
  item.setAttribute('label', 'Activar modo oscuro');

  const vecino = document.getElementById(ID_CRISTAL)
    || VECINOS.map((id) => document.getElementById(id)).find((n) => n && n.parentNode === menu);
  if (vecino && vecino.parentNode === menu) menu.insertBefore(item, vecino);
  else menu.appendChild(item);

  item.addEventListener('command', () => {
    const sitio = sitioActual();
    if (!sitio) return;
    const lista = leer();
    const i = lista.indexOf(sitio);
    if (i >= 0) lista.splice(i, 1);
    else lista.push(sitio);
    escribir(lista);
  });

  // --- Cuando se abre el menu -------------------------------------------------
  // Todo se recalcula en el popupshowing y nada se cachea: la lista la puede
  // haber cambiado otra ventana, el panel de mods o about:config.
  menu.addEventListener('popupshowing', (ev) => {
    // Los submenus burbujean su propio popupshowing hasta aqui.
    if (ev.target !== menu) return;

    // Sin sitio no hay nada que oscurecer: about:, file:, el visor de PDF, la
    // pagina de nueva pestana. Es lo mismo que decide el inyector.
    const sitio = sitioActual();
    item.hidden = !leerBool(PREF_ENCENDIDO, true) || !sitio;
    if (item.hidden) return;

    if (leerBool(PREF_TODO, false)) {
      // Con "oscurecer todas las paginas" puesto, la lista no pinta nada: la
      // entrada se queda a la vista, apagada y diciendo por que.
      item.setAttribute('label', 'Modo oscuro en todas las paginas (Ajustes > Zen Mods)');
      item.setAttribute('disabled', 'true');
    } else {
      item.removeAttribute('disabled');
      item.setAttribute('label', (leer().includes(sitio) ? 'Desactivar modo oscuro (' : 'Activar modo oscuro (') + sitio + ')');
    }

    // nsContextMenu ya ordeno los separadores con los `hidden` del clic anterior;
    // se le pide que lo repita con los de este. La funcion solo existe con el
    // menu abierto, de ahi el `typeof`.
    try { if (typeof menu.showHideSeparators === 'function') menu.showHideSeparators(); } catch (e) { /* cosmetico */ }
  });
})();

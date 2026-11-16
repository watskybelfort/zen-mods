// Zen Web Apps — la ventana de app no usa la barra unica
//
// Lo carga el cargador nativo en cada ventana de navegador, con `loadSubScript`,
// asi que corre DENTRO del ambito de la ventana: `document` y los globales de
// Zen estan a mano sin pedirlos.
//
// POR QUE HACE FALTA UNA PIEZA NATIVA EN UN MOD QUE ERA SOLO CSS -------------
// Hasta Zen 1.22.1b las ventanas de aplicacion web se montaban SIN barra unica:
// `#nav-bar` —con la URL, atras/adelante y los botones de ventana— colgaba de
// `#zen-appcontent-navbar-container`, una franja horizontal arriba del
// contenido y FUERA de `#navigator-toolbox`. Con eso, ocultar el toolbox
// quitaba la barra lateral y no quitaba nada mas: es lo que hace el CSS de este
// mod, y por eso bastaba con CSS.
//
// En 1.22.2b eso cambio, y no por un renombrado sino por conducta. Medido
// sobre los omni.ja de la build:
//
//   ZenUIManager.mjs:992   hidesTabsToolbar = raiz.hasAttribute('popup-window')
//   browser-init.js:116    'popup-window' solo se pone si !window.toolbar.visible
//
// Una ventana de app NO es un popup, asi que ya no cuenta como "sin barra de
// pestanas", y `isSingleToolbar` (ZenUIManager.mjs:1323) sale verdadero tambien
// ahi. Zen entonces mueve `#nav-bar` DENTRO del toolbox
// (`titlebar.parentNode.moveBefore(navBar, titlebar)`) y, segun de que lado
// tengas la barra lateral, los botones de ventana acaban dentro tambien.
//
// A partir de ahi el CSS del mod se aparta SOLO, que es lo que tiene que hacer:
// su guarda `:not(:has(.titlebar-buttonbox-container, #urlbar-container))`
// existe justo para no dejarte una ventana que no se puede cerrar. El mod no
// fallo; lo que faltaba era decirle a Zen que esa ventana no usa barra unica.
//
// QUE HACE, EXACTAMENTE ------------------------------------------------------
// Redefine `hidesTabsToolbar` a `true` en las ventanas con [taskbartab]. Es
// quirurgico por dos motivos que se comprobaron antes de escribir una linea:
//
//   - es un getter perezoso POR VENTANA (`ChromeUtils.defineLazyGetter`), o sea
//     configurable y sin efecto en las demas ventanas;
//   - y se lee en UN SOLO SITIO de todo el arbol, dentro de `isSingleToolbar`.
//
// El atajo evidente —ponerle `popup-window` a la raiz— haria lo mismo de paso y
// ademas apagaria el modo compacto (ZenCompactMode.mjs:168), cambiaria la barra
// de titulo y la conducta de LoginHelper. Nada de eso lo ha pedido nadie.
//
// Y deshacer la disposicion no lo hace este script: lo hace Zen. Con
// `isSingleToolbar` falso, `_updateEvent()` entra en su rama
// `else if (this._hasSetSingleToolbar)`, devuelve `#nav-bar` a su padre
// original, quita `zen-single-toolbar` de la raiz y recoloca los botones de
// ventana. Es el mismo camino que recorre cuando apagas la barra unica a mano.
//
// SI ESTA PIEZA NO ESTA, EL MOD NO ROMPE NADA: el CSS sigue apartandose y la
// ventana de app se queda como la deja Zen. Sin efecto, nunca rota.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  // La declara mods/utilities/web-apps/preferences.json, asi que sale en
  // Ajustes > Zen Mods > Zen Web Apps. El valor por defecto de aqui es el que
  // vale si el mod de CSS no esta instalado y la pref no existe todavia.
  const PREF = 'zen-web-apps.restore-top-bar';
  const MARCA = '__zenWebApps';

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[zen-web-apps] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  // UNA VENTANA NORMAL NO SE TOCA JAMAS. Es la primera linea a proposito: todo
  // lo que viene despues da por hecho que esto es una ventana de app.
  if (!document.documentElement.hasAttribute('taskbartab')) return;

  // Volver a cargarlo en la misma ventana no debe apilar observadores ni perder
  // el descriptor original. Pasa al reinstalar sin reiniciar.
  if (window[MARCA]) return;
  const estado = { puesto: false, original: null };
  window[MARCA] = estado;

  const gestor = () => window.gZenVerticalTabsManager;

  // `_updateEvent` es la pasada de disposicion entera de Zen, la misma que
  // corre cuando cambias una pref de la barra lateral. Trae su propio
  // try/catch, pero la llamada puede fallar antes de entrar.
  const rehacer = () => {
    try { gestor()._updateEvent(); } catch (e) { registrar('no pude rehacer la disposicion: ' + e); }
  };

  const poner = () => {
    const g = gestor();
    if (!g || estado.puesto) return;
    estado.original = Object.getOwnPropertyDescriptor(g, 'hidesTabsToolbar') || null;
    Object.defineProperty(g, 'hidesTabsToolbar', {
      value: true,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    estado.puesto = true;
    rehacer();
  };

  // Se devuelve el descriptor guardado y no un getter equivalente escrito a
  // mano: si algun dia Zen cambia lo que ese getter mira, apagar la opcion
  // tiene que devolver la conducta de ESA build, no la que supusimos aqui.
  const quitar = () => {
    const g = gestor();
    if (!g || !estado.puesto) return;
    if (estado.original) Object.defineProperty(g, 'hidesTabsToolbar', estado.original);
    else delete g.hidesTabsToolbar;
    estado.puesto = false;
    rehacer();
  };

  const encendido = () => {
    try { return SV.prefs.getBoolPref(PREF, true); } catch (e) { return true; }
  };

  const aplicar = () => {
    try { if (encendido()) poner(); else quitar(); } catch (e) { registrar('no pude aplicar: ' + e); }
  };

  // El interruptor de Ajustes tiene que notarse sin reiniciar la ventana, que
  // es como se prueba una opcion: se pulsa y se mira.
  const observador = { observe: () => aplicar() };
  try {
    SV.prefs.addObserver(PREF, observador);
    window.addEventListener('unload', () => {
      try { SV.prefs.removeObserver(PREF, observador); } catch (e) { /* la ventana se va igual */ }
    }, { once: true });
  } catch (e) {
    registrar('sin observador de ' + PREF + ': ' + e);
  }

  // CUANDO ARRANCAR ------------------------------------------------- MEDIDO -
  // `gZenVerticalTabsManager.init()` sale de `gZenStartup.init()`, colgado de
  // `MozBeforeInitialXULLayout` (ZenStartup.mjs:212), y el cargador engancha
  // los scripts de ventana en el evento `load`. O sea que normalmente llegamos
  // despues y solo hay que rehacer la disposicion.
  //
  // Pero llegar ANTES seria peor que llegar tarde: `init()` llama a
  // `defineLazyGetter` sobre esta misma propiedad, o sea que pisaria lo que
  // hubieramos definido, en silencio. Por eso la senal de "ya puedo" no es un
  // temporizador ni el evento de carga, sino que la propiedad EXISTA: si tiene
  // descriptor, `init()` ya paso.
  //
  // Y no se espera a `gZenStartup.promiseInitialized`, que seria lo natural:
  // esa promesa cuelga de `gZenWorkspaces.promiseInitialized`, y los espacios
  // de trabajo son precisamente lo que ZenSpaceManager se salta en las
  // ventanas con [taskbartab] (ZenSpaceManager.mjs:661). Esperarla es
  // arriesgarse a esperar para siempre justo en la unica ventana que importa.
  const listo = () => {
    const g = gestor();
    return !!g && !!Object.getOwnPropertyDescriptor(g, 'hidesTabsToolbar');
  };

  const esperar = (quedan) => {
    if (listo()) { aplicar(); return; }
    if (quedan <= 0) { registrar('gZenVerticalTabsManager no llego a tiempo; la ventana se queda como la deja Zen'); return; }
    window.setTimeout(() => esperar(quedan - 1), 100);
  };

  esperar(30);
})();

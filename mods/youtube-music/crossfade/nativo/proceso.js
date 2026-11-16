// Zen Mezcla — inyector de proceso de contenido.
//
// Mete puro.js y motor.js en la pestana de YouTube Music antes de que corra
// ningun script suyo: el motor tiene que envolver MediaSource antes de que el
// reproductor lo use.
//
// La caja lleva el principal de la pagina. Este mod no tiene puente ni red, asi
// que lo unico privilegiado de aqui es leer sharedData y la pref del interruptor.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const SITIO = 'music.youtube.com';
  const PREF_ENCENDIDO = 'zen.mezcla.encendido';

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[mezcla] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  const leer = (clave) => {
    try { return SV.cpmm.sharedData.get(clave) || null; } catch (e) { return null; }
  };

  const puestos = new WeakSet();

  const inyectar = (doc) => {
    const win = doc.defaultView;
    if (!win || puestos.has(doc)) return;
    puestos.add(doc);

    const puro = leer('zen-mezcla:puro');
    const motor = leer('zen-mezcla:motor');
    if (!puro || !motor) { registrar('sharedData no trae el motor; reinstala con instalar-mezcla.mjs'); return; }

    const caja = Cu.Sandbox(win, {
      sandboxPrototype: win,
      wantXrays: false,
      sameZoneAs: win,
      sandboxName: 'zen-mezcla',
    });

    // El idioma forzado por la pref compartida zen.mods.idioma ('auto' | 'es' | 'en').
    // Con 'auto', el motor usa el idioma de la propia pagina.
    try { caja.__zenIdioma = SV.prefs.getStringPref('zen.mods.idioma', 'auto'); } catch (e) { caja.__zenIdioma = 'auto'; }

    try {
      Cu.evalInSandbox(puro + '\n' + motor, caja, undefined, 'zen-mezcla.js', 1);
    } catch (e) {
      registrar('el motor no arranco: ' + e);
    }
  };

  const observador = {
    observe(doc) {
      try {
        if (!doc || !doc.location || doc.location.host !== SITIO) return;
        if (doc.defaultView && doc.defaultView.top !== doc.defaultView) return;
        if (!SV.prefs.getBoolPref(PREF_ENCENDIDO, true)) return;
        inyectar(doc);
      } catch (e) {
        registrar('fallo observando un documento: ' + e);
      }
    },
  };

  // Mismo momento que Letra Viva y Sintonia: ya hay raiz y aun no hay scripts.
  SV.obs.addObserver(observador, 'document-element-inserted');
  registrar('inyector en pie en este proceso');
})();

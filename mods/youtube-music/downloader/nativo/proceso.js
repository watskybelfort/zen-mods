// Zen Descargas — inyector de proceso de contenido.
//
// Mete puro.js y motor.js en cada pestana de YouTube y YouTube Music y hace de
// puente entre el boton de la pagina y el descargador, que vive en el proceso
// padre (descargador.js).
//
//   pagina -> padre   cpmm 'zen-descargas:desde-pagina'  { id, msg }
//   padre  -> pagina  ppmm 'zen-descargas:a-pagina'      { destino, msg }
//
// Cada documento lleva un id al azar; el padre le habla a uno por su id o a todos
// con '*'. Lo que cruza es texto JSON parseado aqui, asi ningun objeto de la caja
// sale de ella. El puente queda en el global de la caja, no en `window`: los
// scripts de YouTube no lo ven.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const SITIOS = ['www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
  const PREF_ENCENDIDO = 'zen.descargas.encendido';
  const MAX_MENSAJE = 4096;

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[descargas] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  const leer = (clave) => {
    try { return SV.cpmm.sharedData.get(clave) || null; } catch (e) { return null; }
  };

  const nuevoId = () => SV.uuid.generateUUID().toString().replace(/[{}-]/g, '').slice(0, 12);

  const cajas = new Map();
  const puestos = new WeakSet();

  const inyectar = (doc) => {
    const win = doc.defaultView;
    if (!win || puestos.has(doc)) return;
    puestos.add(doc);

    const puro = leer('zen-descargas:puro');
    const motor = leer('zen-descargas:motor');
    if (!puro || !motor) { registrar('sharedData no trae el motor; reinstala con instalar-descargas.mjs'); return; }

    const id = nuevoId();
    const caja = Cu.Sandbox(win, {
      sandboxPrototype: win,
      wantXrays: false,
      sameZoneAs: win,
      sandboxName: 'zen-descargas',
    });

    const enviar = (texto) => {
      const s = String(texto);
      if (s.length > MAX_MENSAJE) return;
      let msg;
      try { msg = JSON.parse(s); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      try { SV.cpmm.sendAsyncMessage('zen-descargas:desde-pagina', { id, msg }); } catch (e) { registrar('no pude avisar al descargador: ' + e); }
      if (msg.tipo === 'adios') cajas.delete(id);
    };
    caja.__zenDescargasPuente = Cu.cloneInto({ enviar }, caja, { cloneFunctions: true });
    try { caja.__zenIdioma = SV.prefs.getStringPref('zen.mods.idioma', 'auto'); } catch (e) { caja.__zenIdioma = 'auto'; }

    try {
      Cu.evalInSandbox(puro + '\n;' + motor, caja, undefined, 'zen-descargas.js', 1);
    } catch (e) {
      registrar('el motor no arranco: ' + e);
      return;
    }
    cajas.set(id, { caja, doc: Cu.getWeakReference(doc) });
  };

  const entregar = (id, c, msg) => {
    if (!c.doc.get()) { cajas.delete(id); return; }
    try {
      const recibir = c.caja.__zenDescargasRecibir;
      if (typeof recibir === 'function') recibir(JSON.stringify(msg));
    } catch (e) {
      registrar('no pude entregar un mensaje a la pagina: ' + e);
    }
  };

  SV.cpmm.addMessageListener('zen-descargas:a-pagina', ({ data }) => {
    if (!data || !data.msg) return;
    if (data.destino === '*') { for (const [id, c] of cajas) entregar(id, c, data.msg); return; }
    const c = cajas.get(data.destino);
    if (c) entregar(data.destino, c, data.msg);
  });

  const observador = {
    observe(doc) {
      try {
        if (!doc || !doc.location || !SITIOS.includes(doc.location.host)) return;
        if (doc.defaultView && doc.defaultView.top !== doc.defaultView) return;
        if (!SV.prefs.getBoolPref(PREF_ENCENDIDO, true)) return;
        inyectar(doc);
      } catch (e) {
        registrar('fallo observando un documento: ' + e);
      }
    },
  };

  // Ya hay raiz y aun no hay scripts, como los demas mods de YouTube Music.
  SV.obs.addObserver(observador, 'document-element-inserted');
})();

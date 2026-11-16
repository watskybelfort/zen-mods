// Zen Remoto — inyector de proceso de contenido.
//
// Mete puro.js, qr.js y motor.js en cada pestana de YouTube Music y hace de
// puente entre el motor y el servidor, que vive en el proceso padre (servidor.js).
//
//   pagina -> padre   cpmm 'zen-remoto:desde-pagina'  { id, msg }
//   padre  -> pagina  ppmm 'zen-remoto:a-pagina'      { destino, msg }
//
// Cada documento lleva un id al azar. El padre le habla a uno por su id, o a todos
// con '*'. Lo que cruza son datos planos: el motor manda texto JSON y aqui se
// parsea, asi ningun objeto de la caja sale de ella.
//
// El puente queda en el global de la caja, no en `window`: la pagina no lo ve, asi
// que ningun script de YouTube puede hablar con el servidor haciendose pasar por
// el motor.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const SITIO = 'music.youtube.com';
  const PREF_ENCENDIDO = 'zen.remoto.encendido';
  const MAX_MENSAJE = 4 * 1024 * 1024;

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[remoto] ' + msg); } catch (e) { /* nada que hacer */ }
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

    const puro = leer('zen-remoto:puro');
    const qr = leer('zen-remoto:qr');
    const motor = leer('zen-remoto:motor');
    if (!puro || !qr || !motor) { registrar('sharedData no trae el motor; reinstala con instalar-remoto.mjs'); return; }

    const id = nuevoId();
    const caja = Cu.Sandbox(win, {
      sandboxPrototype: win,
      wantXrays: false,
      sameZoneAs: win,
      sandboxName: 'zen-remoto',
    });

    const enviar = (texto) => {
      const s = String(texto);
      if (s.length > MAX_MENSAJE) { registrar('mensaje demasiado grande, descartado'); return; }
      let msg;
      try { msg = JSON.parse(s); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      try { SV.cpmm.sendAsyncMessage('zen-remoto:desde-pagina', { id, msg }); } catch (e) { registrar('no pude avisar al servidor: ' + e); }
      if (msg.tipo === 'adios') cajas.delete(id);
    };
    caja.__zenRemotoPuente = Cu.cloneInto({ enviar }, caja, { cloneFunctions: true });

    try {
      Cu.evalInSandbox(puro + '\n;' + qr + '\n;' + motor, caja, undefined, 'zen-remoto.js', 1);
    } catch (e) {
      registrar('el motor no arranco: ' + e);
      return;
    }
    cajas.set(id, { caja, doc: Cu.getWeakReference(doc) });
  };

  const entregar = (id, c, msg) => {
    if (!c.doc.get()) { cajas.delete(id); return; }
    try {
      const recibir = c.caja.__zenRemotoRecibir;
      if (typeof recibir === 'function') recibir(JSON.stringify(msg));
    } catch (e) {
      registrar('no pude entregar un mensaje a la pagina: ' + e);
    }
  };

  SV.cpmm.addMessageListener('zen-remoto:a-pagina', ({ data }) => {
    if (!data || !data.msg) return;
    if (data.destino === '*') { for (const [id, c] of cajas) entregar(id, c, data.msg); return; }
    const c = cajas.get(data.destino);
    if (c) entregar(data.destino, c, data.msg);
  });

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

  // Mismo momento que Mezcla y Letra Viva: ya hay raiz y aun no hay scripts.
  SV.obs.addObserver(observador, 'document-element-inserted');
})();

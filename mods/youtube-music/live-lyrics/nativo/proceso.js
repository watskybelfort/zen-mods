// Zen Letra Viva — inyector de proceso de contenido
//
// Se copia tal cual, sin generar nada: el motor no viaja dentro de este archivo,
// se lee de sharedData, que es donde lo dejo config.js. El motivo largo esta en
// config.js; el corto es que asi el motor no se transforma por el camino y el
// archivo que corre es el mismo .user.js que se instalaria en un gestor.
//
// Corre una vez por proceso de contenido, con principal de sistema.
//
// POR QUE UN PROCESS SCRIPT Y NO UN ACTOR DE VENTANA. Un JSWindowActor es el
// mecanismo moderno y seria lo correcto para casi todo, pero aqui obliga a
// registrar una sustitucion de resource:// en cada proceso para que el modulo del
// actor se pueda resolver, y a repartir el trabajo entre padre e hijo con
// mensajes. Un process script con privilegios ya corre EN el proceso de
// contenido: ve el documento cuando nace, puede crear el sandbox de la pagina, y
// puede hacer fetch sin CORS porque su principal es el del sistema. Las tres
// cosas que hacen falta, sin plumbing entre procesos.

'use strict';

(() => {
  // SERVICES YA NO SE IMPORTA ------------------------------------------ MEDIDO -
  // Igual que en config.js: en Gecko 153 el modulo
  // resource://gre/modules/Services.sys.mjs ya no existe, porque `Services` paso
  // a ser un global automatico en todo contexto con principal de sistema.
  // Importarlo lanza "Failed to load". El global primero, el import de respaldo.
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const CLAVE = 'zen-letra:motor';
  const SITIO = 'music.youtube.com';

  // Los unicos destinos a los que el puente hace peticiones. La lista NO es
  // decoracion: el puente existe porque puede pedir sin CORS, o sea que es
  // exactamente la clase de cosa que no se deja abierta. Aunque el motor solo se
  // inyecta en YouTube Music, la comprobacion se hace aqui, del lado
  // privilegiado, donde no la puede tocar nada de la pagina.
  // www.youtube.com esta por los subtitulos: api/timedtext sirve el texto ya
  // cronometrado del video que suena. Es el mismo sitio del que viene la pagina,
  // asi que no abre ningun destino nuevo de verdad — pero se declara igual,
  // porque la lista solo vale si nadie la salta.
  const PERMITIDOS = new Set(['lrclib.net', 'apic-desktop.musixmatch.com', 'www.youtube.com']);

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[letra] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  const motor = () => {
    try { return SV.cpmm.sharedData.get(CLAVE) || null; } catch (e) { return null; }
  };

  // --- El puente de red ---------------------------------------------------
  // Aqui el principal es el del sistema, asi que fetch no pasa por CORS. Es la
  // ventaja de verdad del cargador nativo sobre el userscript sin gestor: puede
  // hablar con Musixmatch, que necesita una cabecera Cookie que el navegador no
  // deja poner desde una pagina.
  /* LA SONDA ---------------------------------------------------------- MEDIDO -
     Dice que hay de verdad en este ambito. Existe porque adivinarlo salio caro:
     cada suposicion equivocada costaba un reinicio completo de Zen para
     descubrir la siguiente. Con esto, una sola vuelta da la lista entera.

     Lo aprendido hasta ahora, en Gecko 153: `Services` es global y NO se importa,
     `setTimeout` NO existe, y el contract ID de XMLHttpRequest — el de toda la
     vida, '@mozilla.org/xmlextras/xmlhttprequest;1' — YA NO ESTA REGISTRADO. */
  const sondear = () => {
    const tipo = (nombre, valor) => { try { return typeof valor; } catch (e) { return 'error: ' + e; } };
    const modulo = (url) => { try { ChromeUtils.importESModule(url); return 'ok'; } catch (e) { return String((e && e.message) || e).slice(0, 90); } };
    return {
      XMLHttpRequest: tipo('XMLHttpRequest', typeof XMLHttpRequest === 'undefined' ? undefined : XMLHttpRequest),
      fetch: typeof fetch,
      setTimeout: typeof setTimeout,
      URL: typeof URL,
      TextDecoder: typeof TextDecoder,
      Services: typeof Services,
      ccXhrRegistrado: (() => { try { return !!Cc['@mozilla.org/xmlextras/xmlhttprequest;1']; } catch (e) { return 'error'; } })(),
      NetUtil: modulo('resource://gre/modules/NetUtil.sys.mjs'),
      Timer: modulo('resource://gre/modules/Timer.sys.mjs'),
    };
  };

  // UN PROCESS SCRIPT NO ES UNA VENTANA ------------------------------- MEDIDO -
  // Esto se escribio con fetch, AbortController, setTimeout y URL, que es lo
  // normal en una pagina. Aqui no hay nada de eso: el ambito de un process script
  // es un gestor de mensajes con principal de sistema, no un objeto window. El
  // error que llego de la instalacion real fue exactamente
  //
  //     "setTimeout is not defined"
  //
  // y setTimeout era solo el primero de los cuatro; los otros tres habrian ido
  // cayendo de uno en uno, un reinicio de Zen por cada descubrimiento.
  //
  // Asi que se quitan las cuatro suposiciones de golpe y se usa XPCOM, que en
  // este ambito existe por definicion:
  //
  //   nsIURI    en lugar de URL      — parsea y da scheme y host
  //   XHR       en lugar de fetch    — y con principal de sistema tampoco pasa
  //                                    por CORS, que es lo que se buscaba
  //   .timeout  en lugar de setTimeout + AbortController — el propio XHR lo trae
  //
  // De paso desaparece el temporizador, que era la pieza que faltaba y la que
  // obligaba a inventarse un reloj en un sitio que no tiene ninguno.
  const pedirDeVerdad = (peticion) => new Promise((resolver) => {
    let uri;
    try { uri = SV.io.newURI(String((peticion && peticion.url) || '')); } catch (e) {
      resolver({ ok: false, estado: 0, error: 'url invalida' });
      return;
    }
    if (uri.scheme !== 'https') { resolver({ ok: false, estado: 0, error: 'solo https' }); return; }
    if (!PERMITIDOS.has(uri.host)) {
      registrar('el puente rechazo ' + uri.host + ': no esta en la lista de destinos');
      resolver({ ok: false, estado: 0, error: 'destino no permitido: ' + uri.host });
      return;
    }

    const cabeceras = (peticion && peticion.cabeceras) || {};
    const limite = Math.min(30000, (peticion && peticion.limiteMs) || 12000);

    const interpretar = (estado, texto, mecanismo) => {
      if (estado === 404) return { ok: false, estado, datos: null, error: 'no encontrado', mecanismo };
      if (estado < 200 || estado >= 300) return { ok: false, estado, error: 'respuesta ' + estado, mecanismo };
      try { return { ok: true, estado, datos: JSON.parse(texto), mecanismo }; }
      catch (e) { return { ok: false, estado, error: 'la respuesta no era JSON', mecanismo }; }
    };

    /* CASCADA DE MECANISMOS. Se probaron uno a uno a base de reiniciar Zen, que
       es carisimo en tiempo del usuario. Ahora se intentan en orden y se sigue con
       el siguiente si el anterior no existe en este ambito, asi que da igual cual
       falte: alguno contestara. El que acabe funcionando viaja en la respuesta,
       para no volver a preguntarselo nunca. */

    // 1. XMLHttpRequest como global. El contract ID de XPCOM ya no vale — medido:
    //    '@mozilla.org/xmlextras/xmlhttprequest;1' esta sin registrar en Gecko
    //    153 — pero el constructor global sigue existiendo en ambitos de sistema.
    if (typeof XMLHttpRequest === 'function') {
      try {
        const xhr = new XMLHttpRequest();
        try { xhr.mozBackgroundRequest = true; } catch (e) { /* no en todas las versiones */ }
        xhr.open('GET', uri.spec, true);
        xhr.timeout = limite;
        try { xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS; } catch (e) { /* equivale a credentials: omit */ }
        for (const clave of Object.keys(cabeceras)) {
          // Cada cabecera por separado: si uno la rechaza, que no se lleve por
          // delante a las demas. La de Cookie es la que necesita Musixmatch, y es
          // justo la que el navegador no deja poner desde una pagina.
          try { xhr.setRequestHeader(clave, String(cabeceras[clave])); } catch (e) { registrar('cabecera rechazada: ' + clave); }
        }
        xhr.onload = () => resolver(interpretar(xhr.status, xhr.responseText, 'xhr'));
        xhr.onerror = () => resolver({ ok: false, estado: 0, error: 'la peticion fallo', mecanismo: 'xhr' });
        xhr.ontimeout = () => resolver({ ok: false, estado: 0, error: 'se agoto el tiempo', mecanismo: 'xhr' });
        xhr.send();
        return;
      } catch (e) {
        registrar('XMLHttpRequest fallo, se prueba el canal: ' + e);
      }
    }

    // 2. Un canal de red por XPCOM. Es la via de mas abajo del navegador y la que
    //    no depende de que este ambito tenga globales de ventana.
    try {
      const { NetUtil } = ChromeUtils.importESModule('resource://gre/modules/NetUtil.sys.mjs');
      const canal = NetUtil.newChannel({ uri: uri.spec, loadUsingSystemPrincipal: true });
      try { canal.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS; } catch (e) { /* da igual */ }
      const http = canal.QueryInterface(Ci.nsIHttpChannel);
      for (const clave of Object.keys(cabeceras)) {
        try { http.setRequestHeader(clave, String(cabeceras[clave]), false); } catch (e) { registrar('cabecera rechazada: ' + clave); }
      }
      NetUtil.asyncFetch(canal, (flujo, resultado) => {
        if (!Components.isSuccessCode(resultado)) { resolver({ ok: false, estado: 0, error: 'la peticion fallo', mecanismo: 'canal' }); return; }
        let texto = '';
        try {
          const cuantos = flujo.available();
          texto = cuantos ? NetUtil.readInputStreamToString(flujo, cuantos, { charset: 'UTF-8' }) : '';
        } catch (e) {
          resolver({ ok: false, estado: 0, error: 'no se pudo leer la respuesta: ' + e, mecanismo: 'canal' });
          return;
        }
        let estado = 200;
        try { estado = http.responseStatus; } catch (e) { /* se queda en 200 */ }
        resolver(interpretar(estado, texto, 'canal'));
      });
      return;
    } catch (e) {
      registrar('el canal fallo, se prueba fetch: ' + e);
    }

    // 3. fetch, si por casualidad esta. Sin tiempo de espera: no hay temporizador
    //    en este ambito, y colgarse es mejor que no intentarlo.
    if (typeof fetch === 'function') {
      fetch(uri.spec, { method: 'GET', headers: cabeceras, credentials: 'omit' })
        .then((r) => r.text().then((t) => resolver(interpretar(r.status, t, 'fetch'))))
        .catch((e) => resolver({ ok: false, estado: 0, error: String((e && e.message) || e), mecanismo: 'fetch' }));
      return;
    }

    resolver({ ok: false, estado: 0, error: 'ningun mecanismo de red disponible en este ambito', sonda: sondear() });
  });

  // --- La inyeccion --------------------------------------------------------
  const inyectar = (doc) => {
    const win = doc.defaultView;
    if (!win) return;

    const codigo = motor();
    if (!codigo) { registrar('sharedData no trae el motor; reinstala con Install-LetraNativa.ps1'); return; }

    // wantXrays en false y el window como prototipo: el motor ve el DOM de la
    // pagina tal cual, igual que un userscript. El principal del sandbox es el de
    // la pagina, NO el del sistema: el motor no tiene ni necesita privilegios.
    // Lo unico privilegiado que toca es el puente, y solo por su unica funcion.
    const caja = Cu.Sandbox(win, {
      sandboxPrototype: win,
      wantXrays: false,
      sameZoneAs: win,
      sandboxName: 'zen-letra-viva',
    });

    // LA FRONTERA ENTRE COMPARTIMENTOS ------------------------------- MEDIDO -
    // Exportar `pedir` tal cual NO basta, y el sintoma es de los que enganan:
    // la peticion sale, la respuesta llega, y el motor recibe un objeto que no
    // puede leer. Porque `pedir` es una funcion privilegiada: devuelve una
    // promesa del compartimento del sistema, que resuelve a un objeto del
    // sistema. El motor corre con el principal de la PAGINA, y un compartimento
    // menos privilegiado no puede tocar las propiedades de uno mas privilegiado
    // — los wrappers de seguridad se lo impiden. Ni excepcion ni aviso: `ok` sale
    // undefined, todas las peticiones parecen fallar, y el mod dice que nadie
    // tiene la letra de ninguna cancion.
    //
    // Asi que la promesa se crea EN el compartimento de la caja (caja.Promise es
    // el Promise de la pagina) y el resultado se clona hacia ella. Lo que cruza
    // la frontera son datos planos, no objetos con dueno.
    const pedir = (peticion) => new caja.Promise((resolver) => {
      const devolver = (r) => { try { resolver(Cu.cloneInto(r, caja)); } catch (e) { registrar('no se pudo devolver la respuesta: ' + e); } };
      pedirDeVerdad(peticion).then(devolver, (e) => devolver({ ok: false, estado: 0, error: String((e && e.message) || e) }));
    });

    // El puente se deja como global DEL SANDBOX y no en window: colgarlo del
    // window lo pondria a la vista del propio codigo de YouTube Music, y esto
    // hace peticiones sin CORS. Asi solo lo ve nuestro motor, que lo busca en los
    // dos sitios (ver Red.puente en 40-red.js).
    // La sonda viaja con el puente para que el diagnostico del motor pueda
    // preguntar que hay en este ambito sin que nadie tenga que abrir la consola
    // del navegador ni reiniciar nada.
    const sonda = () => Cu.cloneInto(sondear(), caja);

    caja.__zenLetraPuente = Cu.cloneInto({ pedir, sonda }, caja, { cloneFunctions: true });

    try {
      Cu.evalInSandbox(codigo, caja, undefined, 'zen-letra-viva.js', 1);
    } catch (e) {
      registrar('el motor no arranco en ' + doc.location.host + ': ' + e);
    }
  };

  const observador = {
    observe(sujeto) {
      try {
        const doc = sujeto;
        if (!doc || !doc.location) return;
        // El host se comprueba antes de tocar nada: este observador ve TODOS los
        // documentos del proceso, incluidos los iframes de anuncios.
        if (doc.location.host !== SITIO) return;
        // Solo el documento de primer nivel. YouTube Music mete iframes de
        // publicidad y de reproductor, y el motor dentro de un iframe no
        // encontraria ni barra ni pestanas: seria una instancia inutil
        // compitiendo por el reloj con la buena.
        if (doc.defaultView && doc.defaultView.top !== doc.defaultView) return;
        inyectar(doc);
      } catch (e) {
        registrar('fallo observando un documento: ' + e);
      }
    },
  };

  // document-element-inserted es el momento en que el documento ya tiene su
  // elemento raiz pero todavia no ha corrido ningun script de la pagina, o sea el
  // equivalente exacto de @run-at document-start.
  SV.obs.addObserver(observador, 'document-element-inserted');
  registrar('inyector en pie en este proceso');
})();

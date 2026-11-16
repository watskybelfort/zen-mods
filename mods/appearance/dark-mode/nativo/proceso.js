// Zen Modo Oscuro — inyector de proceso de contenido
//
// Corre una vez por proceso de contenido, con principal de sistema. En cada
// documento cuyo sitio este en la lista (o en todos, con `zen.modooscuro.todo`)
// hace dos cosas: pone el atributo `zen-modo-oscuro` en el elemento raiz, y
// arranca Dark Reader dentro de la pagina.
//
// El atributo lo lee la capa web (web/*.css): las laminas CLARAS que ella pone a
// sitios como Shopify o Meta —blanco translucido sobre el cristal— se apartan
// cuando esta puesto, porque ahora quien oscurece es el motor. Es el mismo
// acuerdo de dentro de casa que `zen-sin-cristal`, y se vigila igual
// (dev/tools/probar-css.mjs).
//
// POR QUE DARK READER Y NO UN FILTRO invert() ------------------------------------
// Un `filter: invert(1) hue-rotate(180deg)` sobre <html> oscurece cualquier
// pagina sin leer una sola regla, pero invierte tambien las fotos (hay que
// reinvertirlas una a una), apaga `backdrop-filter` en todo el arbol y obliga a
// repintar la pagina entera en cada fotograma. Dark Reader hace lo otro: recorre
// las hojas de estilo y recalcula cada color —y las variables CSS, y las
// imagenes que lo necesitan—, o sea que produce un tema oscuro de verdad.
//
// COMO SE EJECUTA EL MOTOR ------------------------------------------- MEDIDO -
// Igual que el de Zen Letra Viva: un sandbox con el PRINCIPAL DE LA PAGINA, el
// window como prototipo y sin Xray, o sea lo mismo que un userscript. El motor
// no tiene ni necesita privilegios. Lo unico privilegiado que toca es el puente
// de red, y solo por su unica funcion.
//
// El motor se publica desde el cargador en sharedData (clave CLAVE_MOTOR) y
// llega aqui sin transformar, salvo UN ajuste en memoria:
//
//   - La shim de `window.chrome`. Dark Reader esta escrito para correr como
//     extension y, en su build de libreria, hace `window.chrome = {}` para
//     simular `chrome.runtime`. En el sandbox `window` es la ventana REAL de la
//     pagina, o sea que habria creado un `window.chrome` visible para el sitio, y
//     hay webs que husmean eso para decidir que navegador son. Se sustituye por
//     una variable local del motor.
//   - El proxy de hojas. Dark Reader lo monta metiendo un `<script>` en linea en
//     la pagina (para enterarse de insertRule y de los shadow roots), y con una
//     CSP estricta el navegador lo bloquea, ensucia la consola y manda a la web
//     un informe de violacion. Esta ajustado para que lo ejecute el sandbox, que
//     no esta sujeto a la CSP de la pagina: misma funcion, sin el script.
//   - Y se le declara `define`, `module`, `exports` y `require` locales: su
//     envoltura UMD toma el camino AMD si encuentra un `define` global, y
//     Facebook tiene uno. Medido: sin esto `DarkReader` no llegaba a existir en
//     las paginas de Meta y el modo oscuro no hacia nada, sin ningun error.
//
// EL PUENTE DE RED NO ES UN FETCH LIBRE ---------------------------------------
// Dark Reader necesita leer hojas de estilo de otros dominios (el CDN de cada
// sitio) y la pagina no puede, por CORS. En su extension, el fondo del navegador
// lo hace por el. Aqui lo hace este archivo con principal de sistema, y eso es
// exactamente la clase de cosa que no se deja abierta: una pagina que pudiera
// pedir cualquier URL por este canal leeria cosas de la red interna del usuario
// (su router, un servicio en localhost) y las veria reflejadas en el CSS que el
// motor genera. Asi que el puente aplica la misma politica que el propio Dark
// Reader aplica a sus peticiones y alguna mas:
//
//   - solo https, solo el puerto por defecto, y nunca una IP, `localhost` ni un
//     host sin punto ni de red local (.local, .internal, .lan, .home, ...)
//   - solo contestan hojas de estilo (`text/css`) e imagenes (`image/*`); lo que
//     no sea eso se rechaza ENTERO, sin devolverlo
//   - sin cookies ni credenciales, con un tope de tamano
//   - y el motor lo llama solo cuando la peticion directa de la pagina ha fallado
//
// UN PROCESS SCRIPT NO ES UNA VENTANA: aqui no hay fetch, setTimeout ni URL. Se
// usan XPCOM y NetUtil, igual que el puente de Letra Viva.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const CLAVE_MOTOR = 'zen-oscuro:motor';
  const CLAVE_ARREGLOS = 'zen-oscuro:arreglos';

  const PREF_SITIOS = 'zen.modooscuro.sitios';
  const PREF_ENCENDIDO = 'zen.modooscuro.encendido';
  const PREF_TODO = 'zen.modooscuro.todo';
  const PREF_BRILLO = 'zen.modooscuro.brillo';
  const PREF_CONTRASTE = 'zen.modooscuro.contraste';
  const PREF_SEPIA = 'zen.modooscuro.sepia';
  const PREF_DEPURAR = 'zen.modooscuro.depurar';

  // El nombre que buscan las guardas de la capa web. Si se cambia aqui hay que
  // cambiarlo en mods/appearance/acrylic-glass/web/50-sites.css y mods/appearance/acrylic-glass/web/90-exclusions.css: no hay forma de que
  // uno se entere del otro, y el sintoma de no hacerlo es que el sitio sale con
  // la lamina clara ENCIMA del tema oscuro.
  const ATRIBUTO = 'zen-modo-oscuro';

  // Con `zen.modooscuro.todo` el motor no se enciende a ciegas: se mide la pagina
  // y solo se oscurece si el area de la ventana que cubren superficies CLARAS y
  // opacas llega a este tanto. Un 15% deja fuera el logo blanco o un banner y
  // coge lo que importa: las tarjetas blancas de Shopify o de Meta, el fondo
  // blanco de un wiki. Una pagina oscura de fabrica (GitHub, YouTube) da 0.
  const UMBRAL_CLARA = 0.15;
  const ESPERA_MEDIDA_MS = 1200;

  const MAX_CSS = 3 * 1024 * 1024;
  const MAX_IMAGEN = 12 * 1024 * 1024;

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[modo-oscuro] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  // --- Los ajustes ----------------------------------------------------------
  const partir = (crudo) => String(crudo || '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^\.+/, ''))
    .filter(Boolean);

  const entero = (pref, defecto, min, max) => {
    let v = defecto;
    try { v = SV.prefs.getIntPref(pref, defecto); } catch (e) { /* por defecto */ }
    return Math.min(max, Math.max(min, v));
  };

  let encendido = true;
  let todo = false;
  let sitios = [];
  let tema = { brightness: 100, contrast: 100, sepia: 0 };

  const releer = () => {
    try { encendido = SV.prefs.getBoolPref(PREF_ENCENDIDO, true); } catch (e) { encendido = true; }
    try { todo = SV.prefs.getBoolPref(PREF_TODO, false); } catch (e) { todo = false; }
    try { sitios = partir(SV.prefs.getStringPref(PREF_SITIOS, '')); } catch (e) { sitios = []; }
    tema = {
      brightness: entero(PREF_BRILLO, 100, 50, 150),
      contrast: entero(PREF_CONTRASTE, 100, 50, 150),
      sepia: entero(PREF_SEPIA, 0, 0, 100),
    };
  };

  // Un dominio de la lista cubre sus subdominios y no cruza sufijos, igual que el
  // `domain()` del CSS.
  const casa = (host) => {
    if (!host) return false;
    const h = host.toLowerCase();
    return sitios.some((s) => h === s || h.endsWith('.' + s));
  };

  // --- Que documentos se miran ----------------------------------------------
  // El motor solo tiene sentido en paginas web de verdad: se saltan about:,
  // chrome:, resource: (el visor de PDF), moz-extension:, view-source:, y todo lo
  // que no sea HTML (imagenes sueltas, XML, texto plano).
  const esPaginaWeb = (doc, win) => {
    let proto = '';
    try { proto = win.location.protocol; } catch (e) { return false; }
    const top = win.top === win;
    if (proto !== 'http:' && proto !== 'https:') {
      // Un iframe `about:blank` o `srcdoc` hereda el sitio de su padre.
      if (top || (proto !== 'about:')) return false;
    }
    const tipo = String(doc.contentType || '');
    return tipo === 'text/html' || tipo === 'application/xhtml+xml';
  };

  // El host que decide. En un iframe es el del documento de ARRIBA cuando se
  // puede leer: una aplicacion embebida (Shopify mete las apps en iframes de
  // otro dominio) tiene que oscurecerse con la pagina que la rodea, o queda una
  // caja blanca dentro del tema oscuro. Si el de arriba vive en otro proceso no
  // se puede leer desde aqui y se usa el del propio iframe. Limite conocido.
  const anfitrionDe = (win) => {
    try {
      if (win.top && win.top !== win) {
        const h = win.top.location.hostname;
        if (h) return h;
      }
    } catch (e) { /* el de arriba esta en otro proceso */ }
    try { return win.location.hostname || ''; } catch (e) { return ''; }
  };

  // --- El motor --------------------------------------------------------------
  let motorListo; // undefined = sin mirar, null = no hay, string = el codigo

  const SHIM = /if \(!window\.chrome\) \{\s*window\.chrome = \{\};\s*\}\s*if \(!chrome\.runtime\) \{\s*chrome\.runtime = \{\};\s*\}/;

  // El bloque que crea `<script class="darkreader--proxy">`, lo cuelga del <head>
  // y lo quita. `injectProxy` es una funcion del propio motor y no necesita nada
  // de fuera salvo `document` y los prototipos del DOM, que el sandbox ve.
  const PROXY = /const proxyScript = createOrUpdateScript\("darkreader--proxy"\);\s*proxyScript\.append\(\s*`\(\$\{injectProxy\}\)\(\$\{enableStyleSheetsProxy\}, \$\{enableCustomElementRegistryProxy\}\)`\s*\);\s*document\.head\.insertBefore\(proxyScript, rootVarsStyle\.nextSibling\);\s*proxyScript\.remove\(\);/;

  const motor = () => {
    if (motorListo !== undefined) return motorListo;
    let texto = null;
    try { texto = SV.cpmm.sharedData.get(CLAVE_MOTOR) || null; } catch (e) { texto = null; }
    if (!texto) {
      registrar('sharedData no trae el motor; reinstala con node installer/instalar-modo-oscuro.mjs');
      motorListo = null;
      return null;
    }
    if (SHIM.test(texto)) {
      texto = texto.replace(SHIM, 'var chrome = { runtime: {} };');
    } else {
      // El motor cambio por dentro y el ajuste ya no encuentra su sitio. Sigue
      // funcionando, pero deja un `window.chrome` en las paginas.
      registrar('el motor ya no trae la shim de window.chrome que se esperaba: se usa sin aislar');
    }
    if (PROXY.test(texto)) {
      texto = texto.replace(PROXY, 'injectProxy(enableStyleSheetsProxy, enableCustomElementRegistryProxy);');
    } else {
      // Sigue funcionando: el motor intenta su <script> en linea y, si la CSP de
      // la pagina lo impide, se las arregla sin el proxy.
      registrar('el motor ya no trae el bloque del proxy que se esperaba: se deja con su <script> en linea');
    }
    motorListo = '(function () { var define, module, exports, require;\n' + texto + '\n})();';
    return motorListo;
  };

  // --- Los arreglos por sitio ---------------------------------------------------
  // La base de arreglos de Dark Reader (installer/lib/arreglos-oscuro.mjs explica el
  // formato), publicada por el cargador como JSON. Se lee y se indexa UNA vez por
  // proceso, la primera vez que hace falta: son ~760 KB y la mayoria de los
  // procesos no oscurecen nada.
  //
  // El indice es por dominio: cada URL de cada seccion se reduce a su host sin
  // `*.` ni esquema, y se busca por el host de la pagina y por cada uno de sus
  // padres (admin.shopify.com -> shopify.com -> com). La URL con ruta
  // (`ejemplo.com/foro`) guarda su ruta aparte y se comprueba despues.
  let arreglos; // undefined = sin mirar, null = no hay, { secciones, indice }
  const cargarArreglos = () => {
    if (arreglos !== undefined) return arreglos;
    arreglos = null;
    let crudo = null;
    try { crudo = SV.cpmm.sharedData.get(CLAVE_ARREGLOS) || null; } catch (e) { crudo = null; }
    if (!crudo) return arreglos;
    try {
      const secciones = JSON.parse(crudo);
      const indice = new Map();
      secciones.forEach((sec, n) => {
        for (const url of sec.u) {
          if (url === '*') continue;
          const sinEsquema = url.replace(/^\^/, '').replace(/\$$/, '').replace(/^.*?\/{2,3}/, '');
          const corte = sinEsquema.indexOf('/');
          const host = (corte < 0 ? sinEsquema : sinEsquema.slice(0, corte)).replace(/^\*\./, '').toLowerCase();
          const ruta = corte < 0 ? '' : sinEsquema.slice(corte).replace(/\*$/, '');
          if (!host || host.includes('*')) continue;
          if (!indice.has(host)) indice.set(host, []);
          indice.get(host).push({ n, ruta });
        }
      });
      arreglos = { secciones, indice };
    } catch (e) {
      registrar('no pude leer la base de arreglos: ' + e);
    }
    return arreglos;
  };

  // Lo que se le pasa a `DarkReader.enable` como segundo argumento: los arreglos
  // comunes (la seccion `*`, siempre la primera) y los de cada seccion que casa
  // con la pagina, sumados. `null` si no hay base.
  const arreglosPara = (win) => {
    const base = cargarArreglos();
    if (!base) return null;
    let host = '';
    let ruta = '/';
    try { host = win.location.hostname.toLowerCase().replace(/^www\./, ''); ruta = win.location.pathname || '/'; } catch (e) { return null; }
    const elegidas = new Set([0]);
    const partes = host.split('.');
    for (let i = 0; i < partes.length; i++) {
      for (const { n, ruta: r } of base.indice.get(partes.slice(i).join('.')) || []) {
        if (!r || ruta.startsWith(r)) elegidas.add(n);
      }
    }
    const fix = { url: [], invert: [], css: '', ignoreInlineStyle: [], ignoreImageAnalysis: [], ignoreCSSUrl: [] };
    const quitar = new Set();
    for (const n of elegidas) {
      const sec = base.secciones[n];
      if (!sec) continue;
      fix.invert.push(...(sec.i || []));
      for (const q of sec.q || []) quitar.add(q);
      fix.ignoreInlineStyle.push(...(sec.s || []));
      fix.ignoreImageAnalysis.push(...(sec.g || []));
      fix.ignoreCSSUrl.push(...(sec.x || []));
      if (sec.c) fix.css += (fix.css ? String.fromCharCode(10) : '') + sec.c;
    }
    // Los ajustes propios (`q`) le quitan al resultado selectores que la base de
    // Dark Reader invierte donde no toca. Ver ARREGLOS_PROPIOS en
    // installer/lib/arreglos-oscuro.mjs.
    if (quitar.size) fix.invert = fix.invert.filter((s) => !quitar.has(s));
    return fix;
  };

  // --- El puente de red -------------------------------------------------------
  const SUFIJOS_LOCALES = ['.local', '.localdomain', '.internal', '.intranet', '.lan', '.home', '.corp', '.direct', '.test', '.zz'];

  const hostPermitido = (host) => {
    const h = String(host || '').toLowerCase().replace(/\.$/, '');
    if (!h || h.indexOf('.') < 0) return false;           // sin punto: localhost, un nombre de red local
    if (h.includes(':') || h.startsWith('[')) return false; // IPv6
    if (/^[0-9.]+$/.test(h) || /^0x[0-9a-f]+$/i.test(h.split('.').pop())) return false; // IPv4 o parecido
    if (h === 'localhost' || h.endsWith('.localhost')) return false;
    return !SUFIJOS_LOCALES.some((s) => h.endsWith(s));
  };

  const pedirDeVerdad = (url, origen) => new Promise((resolver) => {
    let uri;
    try { uri = SV.io.newURI(String(url || '')); } catch (e) { resolver({ ok: false, error: 'url invalida' }); return; }
    if (uri.scheme !== 'https' || uri.port !== -1 || !hostPermitido(uri.host)) {
      registrar('el puente rechazo ' + uri.spec.slice(0, 80) + ': destino no permitido');
      resolver({ ok: false, error: 'destino no permitido' });
      return;
    }
    try {
      const { NetUtil } = ChromeUtils.importESModule('resource://gre/modules/NetUtil.sys.mjs');
      const canal = NetUtil.newChannel({ uri: uri.spec, loadUsingSystemPrincipal: true });
      // Sin cookies: la misma peticion que haria `credentials: 'omit'`.
      canal.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
      const http = canal.QueryInterface(Ci.nsIHttpChannel);
      if (origen) { try { http.setRequestHeader('Referer', origen + '/', false); } catch (e) { /* da igual */ } }
      NetUtil.asyncFetch(canal, (flujo, resultado) => {
        if (!Components.isSuccessCode(resultado)) { resolver({ ok: false, error: 'la peticion fallo' }); return; }
        let estado = 0;
        let tipo = '';
        try { estado = http.responseStatus; } catch (e) { /* 0 */ }
        try { tipo = String(http.contentType || '').toLowerCase(); } catch (e) { /* vacio */ }
        if (estado < 200 || estado >= 300) { resolver({ ok: false, error: 'respuesta ' + estado }); return; }
        const css = tipo === 'text/css';
        const imagen = tipo.startsWith('image/');
        if (!css && !imagen) { resolver({ ok: false, error: 'tipo no permitido: ' + tipo }); return; }
        try {
          const cuantos = flujo.available();
          if (cuantos > (css ? MAX_CSS : MAX_IMAGEN)) { resolver({ ok: false, error: 'demasiado grande' }); return; }
          resolver({ ok: true, bytes: NetUtil.readInputStream(flujo, cuantos), tipo });
        } catch (e) {
          resolver({ ok: false, error: 'no se pudo leer: ' + e });
        }
      });
    } catch (e) {
      resolver({ ok: false, error: 'el canal fallo: ' + e });
    }
  });

  // --- Los documentos ----------------------------------------------------------
  // Por documento: su sandbox con el motor (o null mientras no se ha necesitado)
  // y si esta encendido ahora mismo.
  const estado = new WeakMap();
  const vistos = new Set();

  const barrer = () => { for (const ref of vistos) if (!ref.deref()) vistos.delete(ref); };

  const ejecutar = (caja, codigo, nombre) => {
    try { Cu.evalInSandbox(codigo, caja, undefined, nombre, 1); return true; } catch (e) {
      registrar(nombre + ' fallo: ' + e);
      return false;
    }
  };

  const crearCaja = (doc, win) => {
    const codigo = motor();
    if (!codigo) return null;

    const caja = Cu.Sandbox(win, {
      sandboxPrototype: win,
      wantXrays: false,
      sameZoneAs: win,
      sandboxName: 'zen-modo-oscuro',
    });

    // La promesa se crea EN el compartimento de la caja y el resultado se clona
    // hacia ella: lo que cruza la frontera son datos planos. Es la leccion que
    // costo Letra Viva (ver su proceso.js, "LA FRONTERA ENTRE COMPARTIMENTOS").
    let origen = '';
    try { origen = win.location.origin; } catch (e) { /* sin origen */ }
    const pedir = (url) => new caja.Promise((resolver) => {
      const devolver = (r) => { try { resolver(Cu.cloneInto(r, caja)); } catch (e) { registrar('no se pudo devolver la respuesta: ' + e); } };
      pedirDeVerdad(url, origen).then(devolver, (e) => devolver({ ok: false, error: String((e && e.message) || e) }));
    });
    // Con `zen.modooscuro.depurar` puesta, los fallos de red del motor se vuelcan
    // a la consola del navegador (Ctrl+Shift+J). Lo que el motor no puede leer
    // —una imagen, una hoja de otro dominio— se queda sin oscurecer sin ningun
    // aviso, y esto es lo unico que dice por que.
    let depurar = false;
    try { depurar = SV.prefs.getBoolPref(PREF_DEPURAR, false); } catch (e) { /* apagado */ }
    const avisar = (msg) => { if (depurar) registrar(String(msg).slice(0, 300)); };
    caja.__zenOscuroPuente = Cu.cloneInto({ pedir, avisar, depurar }, caja, { cloneFunctions: true });

    if (!ejecutar(caja, codigo, 'zen-modo-oscuro-motor.js')) return null;
    // Un `fetch` PROPIO DEL SANDBOX, no el de la pagina: se define en el global
    // del sandbox y la pagina no lo ve. Hace una sola cosa, mejorar `http:` a
    // `https:` —lo mismo que Firefox hace por su cuenta con las imagenes pasivas
    // de contenido mixto—. Hace falta porque hay paginas que piden sus imagenes
    // de fondo por http (static.xx.fbcdn.net en las de Meta), el motor las lee con
    // fetch para decidir si oscurecerlas, y un fetch http desde una pagina https
    // lo bloquea el propio navegador. Sin esto esas imagenes se quedan claras.
    if (!ejecutar(caja, `
      const __fetchPagina = fetch;
      globalThis.fetch = (entrada, opciones) => {
        const u = (typeof entrada === 'string') ? entrada : (entrada && entrada.url) || String(entrada);
        const destino = /^http:\\/\\//i.test(u) ? 'https://' + u.slice(7) : entrada;
        const p = __fetchPagina(destino, opciones);
        if (__zenOscuroPuente.depurar) p.then(
          (r) => { if (!r.ok) __zenOscuroPuente.avisar('fetch ' + r.status + ' ' + u); },
          (e) => __zenOscuroPuente.avisar('fetch fallo ' + u + ' :: ' + e)
        );
        return p;
      };
      DarkReader.setFetchMethod(async (url) => {
        const r = await __zenOscuroPuente.pedir(String(url));
        if (!r || !r.ok) __zenOscuroPuente.avisar('puente ' + url + ' :: ' + ((r && r.error) || 'sin respuesta'));
        if (!r || !r.ok) throw new Error('zen-modo-oscuro: ' + ((r && r.error) || 'sin respuesta'));
        return new Response(r.bytes, { status: 200, headers: { 'Content-Type': r.tipo } });
      });
    `, 'zen-modo-oscuro-puente.js')) return null;
    return caja;
  };

  // --- Medir si una pagina es clara ---------------------------------------------
  // Corre DENTRO de la pagina, en un sandbox sin el motor: leer colores calculados
  // desde aqui, con Xray, costaria varias veces mas, y esto se paga en cada
  // pagina cuando `todo` esta puesto. Se mide lo que cubre el cristal vacio: la
  // capa web ya deja `html` y `body` transparentes, asi que lo que cuenta son las
  // superficies que la pagina pinta ENCIMA.
  //
  // Devuelve una fraccion de 0 a 1 del area de la ventana (con solape: es una
  // medida de "cuanto blanco hay", no un area exacta). Cuenta `html` y `body`
  // tambien, por los sitios donde un rescate les devuelve el lienzo solido.
  const CODIGO_MEDIR = String.raw`(() => {
    const alfa = (c) => {
      const s = String(c).trim(); if (!s || s === 'transparent') return 0;
      const b = s.match(/\/\s*([\d.]+)(%?)\s*\)\s*$/); if (b) return b[2] ? parseFloat(b[1]) / 100 : parseFloat(b[1]);
      const m = s.match(/-?[\d.]+(?:e-?\d+)?/g); if (!m) return 0;
      if (/^(rgba|hsla)\(/.test(s) && m.length === 4) return parseFloat(m[3]);
      return 1;
    };
    const luz = (c) => {
      const s = String(c).trim();
      let m = s.match(/^rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      if (m) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]); }
      m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/); if (m) return 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3];
      m = s.match(/^okl(?:ab|ch)\(([\d.]+)(%?)/); if (m) { const L = m[2] ? +m[1] / 100 : +m[1]; return Math.pow(L, 3); }
      m = s.match(/^lab\(([\d.]+)/); if (m) return Math.pow(+m[1] / 100, 3);
      return 0.5;
    };
    const W = innerWidth, H = innerHeight, AV = W * H;
    if (!AV || !document.body) return 0;
    let area = 0, n = 0;
    for (const el of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
      if (++n > 2500) break;
      const r = el.getBoundingClientRect();
      if (el !== document.documentElement && el !== document.body && (r.width < 80 || r.height < 30)) continue;
      const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(W, r.right), y1 = Math.min(H, r.bottom);
      if (x1 <= x0 || y1 <= y0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      if (alfa(cs.backgroundColor) < 0.5) continue;
      if (luz(cs.backgroundColor) > 0.5) area += (x1 - x0) * (y1 - y0);
    }
    return Math.min(1, area / AV);
  })()`;

  const medirClaridad = (win) => {
    try {
      const caja = Cu.Sandbox(win, { sandboxPrototype: win, wantXrays: false, sameZoneAs: win, sandboxName: 'zen-modo-oscuro-medida' });
      const v = Cu.evalInSandbox(CODIGO_MEDIR, caja, undefined, 'zen-modo-oscuro-medida.js', 1);
      return typeof v === 'number' ? v : 0;
    } catch (e) {
      registrar('no pude medir la pagina: ' + e);
      return 0;
    }
  };

  // Mide una vez por documento, cuando ya ha cargado y ha pasado un rato: antes de
  // eso las tarjetas todavia no estan pintadas y todo parece oscuro. Se guarda en
  // el estado del documento y `aplicar` vuelve a decidir con el numero.
  const medirCuandoToque = (doc, win, est) => {
    if (est.claridad !== undefined || est.midiendo) return;
    est.midiendo = true;
    const hacer = () => {
      const t = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
      est.reloj = t; // sin una referencia viva el recolector se lo lleva antes de que suene
      t.initWithCallback({
        notify() {
          est.midiendo = false;
          est.reloj = null;
          try { est.claridad = medirClaridad(win); aplicar(doc); } catch (e) { /* documento cerrado */ }
        },
      }, ESPERA_MEDIDA_MS, Ci.nsITimer.TYPE_ONE_SHOT);
    };
    if (doc.readyState === 'complete') hacer();
    else win.addEventListener('load', hacer, { once: true });
  };

  const aplicar = (doc) => {
    try {
      const raiz = doc.documentElement;
      const win = doc.defaultView;
      if (!raiz || !win || !esPaginaWeb(doc, win)) return;

      const enLista = casa(anfitrionDe(win));
      let est = estado.get(doc);
      if (!est) { est = { caja: undefined, activo: false }; estado.set(doc, est); }

      // Lo que esta en la lista se oscurece siempre, que es lo que se pidio. Con
      // `todo`, solo si la pagina es clara: ver UMBRAL_CLARA.
      let quiere = encendido && enLista;
      if (encendido && !enLista && todo) {
        if (est.activo) quiere = true; // ya medida y encendida: no se vuelve a decidir
        else {
          medirCuandoToque(doc, win, est);
          quiere = est.claridad !== undefined && est.claridad >= UMBRAL_CLARA;
        }
      }

      if (quiere) {
        if (est.caja === undefined) est.caja = crearCaja(doc, win);
        if (!est.caja) return;
        // Se vuelve a encender aunque ya lo estuviera: los ajustes pueden haber
        // cambiado, y `enable` sobre un tema ya puesto solo lo actualiza.
        const fixes = arreglosPara(win);
        if (ejecutar(est.caja, 'DarkReader.enable(' + JSON.stringify(tema) + ', ' + JSON.stringify(fixes) + ');', 'zen-modo-oscuro-encender.js')) {
          est.activo = true;
          raiz.setAttribute(ATRIBUTO, '');
        }
      } else {
        if (est && est.activo && est.caja) {
          ejecutar(est.caja, 'DarkReader.disable();', 'zen-modo-oscuro-apagar.js');
          est.activo = false;
        }
        raiz.removeAttribute(ATRIBUTO);
      }
    } catch (e) {
      // Un documento que se cierra mientras se le mira lanza al tocar el DOM. No
      // es un fallo del mod y no merece una linea en la consola.
    }
  };

  const repasar = () => {
    releer();
    for (const ref of vistos) {
      const doc = ref.deref();
      if (doc) aplicar(doc);
      else vistos.delete(ref);
    }
  };

  const observadorDeDocumentos = {
    observe(sujeto) {
      try {
        const doc = sujeto;
        if (!doc || !doc.documentElement) return;
        if (vistos.size > 400) barrer();
        vistos.add(new WeakRef(doc));
        aplicar(doc);
      } catch (e) {
        registrar('fallo mirando un documento: ' + e);
      }
    },
  };

  const observadorDePrefs = {
    observe() {
      try { repasar(); } catch (e) { registrar('fallo repasando: ' + e); }
    },
  };

  releer();

  // document-element-inserted: ya hay <html> y todavia no ha corrido ningun
  // script de la pagina, o sea el equivalente de @run-at document-start. Con el
  // motor encendido a esa hora no hay un fogonazo blanco antes del oscuro.
  SV.obs.addObserver(observadorDeDocumentos, 'document-element-inserted');
  for (const p of [PREF_SITIOS, PREF_ENCENDIDO, PREF_TODO, PREF_BRILLO, PREF_CONTRASTE, PREF_SEPIA]) {
    SV.prefs.addObserver(p, observadorDePrefs);
  }
})();

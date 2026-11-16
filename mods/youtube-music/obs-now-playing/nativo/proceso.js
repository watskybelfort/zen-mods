// Zen Sintonia — inyector de proceso de contenido
//
// Corre una vez por proceso de contenido, con principal de sistema, y hace dos
// cosas: poner el recolector dentro de la pestana de YouTube Music, y ser el
// unico que habla con el widget.
//
// POR QUE EXISTE ESTE MOD -------------------------------------------- MEDIDO -
// El widget de musica lee SMTC, la API de media de Windows, y filtra por
// SourceAppUserModelId. Chromium publica una sesion POR PESTANA, asi que en Arc
// el filtro 'youtube|ytm|music' acertaba. Gecko publica UNA SOLA sesion para
// todo el navegador — la del controlador principal, que es lo ultimo que se
// puso a sonar — y su identidad es la del ejecutable, suene lo que suene.
//
// O sea que desde fuera del navegador NO HAY NINGUN CAMPO que distinga la
// pestana de YouTube Music de un video suelto o de una playlist. Eso no se
// arregla afinando el filtro: el dato no existe ahi. Se arregla trayendolo de
// donde si existe, que es dentro de la propia pagina. Se comprueba con
// dev\powershell\Sondear-Media.ps1.
//
// POR QUE LA RED LA HACE ESTE LADO Y NO LA PAGINA
// El recolector podria hacer el POST el mismo, pero desde una pagina https a
// http://127.0.0.1 hay tres cosas que pueden decir que no: el bloqueo de
// contenido mixto, CORS, y sobre todo la CSP de YouTube Music, que es de ellos
// y puede cambiar cualquier martes. Aqui el principal es el del sistema: no hay
// documento, no hay origen, no hay CSP. La peticion sale siempre.
//
// A cambio, este lado es privilegiado, asi que no se fia de nada de lo que le
// llegue: valida destino, tamano y cada campo. Ver `limpiar`.

'use strict';

(() => {
  // Igual que en el cargador: en Gecko 153 `Services` es un global automatico en
  // todo contexto con principal de sistema, y el modulo que se importaba ya no
  // existe. El global primero, el import de respaldo para builds anteriores.
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const SITIO = 'music.youtube.com';
  const RUTA = '/sintonia';

  const PREF_PUERTO = 'zen.sintonia.puerto';
  const PREF_ENCENDIDO = 'zen.sintonia.encendido';
  const PUERTO_DEFECTO = 9463;

  // De donde se acepta una portada. El widget se descarga esa URL desde el
  // servidor, o sea que es una URL que sale de la pagina y acaba pidiendola otro
  // proceso: exactamente la clase de cosa que se acota. Son los cuatro sitios
  // desde los que YouTube Music sirve caratulas.
  const PORTADAS = new Set([
    'lh3.googleusercontent.com',
    'yt3.ggpht.com',
    'yt3.googleusercontent.com',
    'i.ytimg.com',
  ]);

  const LIMITE_CUERPO = 16 * 1024;   // lo que se acepta del recolector
  const LIMITE_TEXTO = 300;          // por campo de texto

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[sintonia] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  const pref = (nombre, defecto, entero) => {
    try {
      return entero ? SV.prefs.getIntPref(nombre, defecto) : SV.prefs.getBoolPref(nombre, defecto);
    } catch (e) { return defecto; }
  };

  const puerto = () => {
    const p = pref(PREF_PUERTO, PUERTO_DEFECTO, true);
    return (Number.isInteger(p) && p > 1023 && p < 65536) ? p : PUERTO_DEFECTO;
  };

  // --- Lo que cruza de la pagina a aqui ------------------------------------
  // Llega como CADENA, no como objeto. Es a proposito: un objeto creado en el
  // compartimento de la pagina cruza envuelto en wrappers de seguridad y leerlo
  // desde aqui es un campo de minas de Xrays y getters ajenos. Una cadena es un
  // primitivo: cruza sin dueno y sin sorpresas. Aqui se parsea, se valida campo
  // por campo y se vuelve a serializar. Lo que sale hacia el widget lo compuso
  // este lado, no la pagina.
  const recorte = (v) => (typeof v === 'string' ? v.slice(0, LIMITE_TEXTO) : '');

  const limpiarPortada = (v) => {
    if (typeof v !== 'string' || v.length > 1024) return '';
    let uri;
    try { uri = SV.io.newURI(v); } catch (e) { return ''; }
    if (uri.scheme !== 'https') return '';
    if (!PORTADAS.has(uri.host)) return '';
    return uri.spec;
  };

  const limpiar = (crudo) => {
    if (typeof crudo !== 'string' || crudo.length > LIMITE_CUERPO) return null;
    let d;
    try { d = JSON.parse(crudo); } catch (e) { return null; }
    if (!d || typeof d !== 'object') return null;

    const num = (v, tope) => {
      const n = Number(v);
      return (Number.isFinite(n) && n >= 0 && n <= tope) ? Math.round(n * 100) / 100 : 0;
    };

    return {
      fuente: 'ytm',
      pestana: recorte(d.pestana),
      cerrando: !!d.cerrando,
      sonando: !!d.sonando,
      anuncio: !!d.anuncio,
      titulo: recorte(d.titulo),
      artista: recorte(d.artista),
      album: recorte(d.album),
      portada: limpiarPortada(d.portada),
      posicion: num(d.posicion, 86400),
      duracion: num(d.duracion, 86400),
    };
  };

  // --- El envio -------------------------------------------------------------
  // XHR y no fetch: medido en este mismo ambito para Zen Letra Viva, el
  // constructor global de XMLHttpRequest existe y el contract ID de XPCOM ya no
  // esta registrado. Y el propio XHR trae timeout, que aqui hace falta porque en
  // un process script NO HAY setTimeout.
  let quejas = 0;
  let ultimoEnvio = 0;
  let enVuelo = 0;

  // DEVUELVE SI SALIO, Y ESO NO ES DECORACION ------------------------------
  // La primera version cortaba en silencio, y las pruebas dejaron ver el
  // agujero: el recolector apunta lo ultimo que mando para no repetirse, asi
  // que un corte invisible le hacia creer que el widget ya sabia la cancion
  // nueva. Resultado: hasta un latido entero — tres segundos — con el tema
  // anterior en pantalla, y ni un aviso en ningun sitio.
  //
  // Con el booleano, el recolector solo apunta lo que de verdad salio, y lo
  // cortado se reintenta en el siguiente paso. Un corte pasa de ser un error
  // silencioso a ser un retraso de un segundo que se arregla solo.
  const enviar = (crudo) => {
    const d = limpiar(crudo);
    if (!d) return false;

    // Cortafuegos contra un recolector que se vuelva loco. El ritmo normal es
    // uno cada segundo o segundo y medio; esto deja pasar hasta cinco por
    // segundo y corta el resto.
    const ahora = Date.now();
    if (ahora - ultimoEnvio < 200) return false;
    if (enVuelo > 4) return false;
    ultimoEnvio = ahora;

    const url = 'http://127.0.0.1:' + puerto() + RUTA;
    try {
      const xhr = new XMLHttpRequest();
      try { xhr.mozBackgroundRequest = true; } catch (e) { /* no en todas las versiones */ }
      xhr.open('POST', url, true);
      xhr.timeout = 4000;
      try { xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS; } catch (e) { /* equivale a credentials: omit */ }
      try { xhr.setRequestHeader('Content-Type', 'application/json'); } catch (e) { /* raro, pero no fatal */ }
      enVuelo++;
      const fin = () => { enVuelo = Math.max(0, enVuelo - 1); };

      // UN 400 NO ES UN ERROR DE RED, Y AHI ESTUVO EL FALLO -------- MEDIDO -
      // La primera version daba por bueno todo lo que no fuera onerror. Para
      // XHR, un 400 o un 404 son respuestas correctas: llegan por onload. O sea
      // que el mod podia estar mandando al vacio indefinidamente creyendo que
      // todo iba bien, sin una linea en ningun log.
      //
      // Y paso de verdad: el widget registraba su listener como
      // "http://localhost:PUERTO/" y aqui se empuja a 127.0.0.1 — a proposito,
      // para no depender de resolver un nombre. HTTP.sys no enruta por IP sino
      // por la cabecera Host, asi que devolvia 400 desde el kernel, sin que el
      // script del widget llegara a verlo. El sintoma era un widget que decia
      // "corriendo" y "sin cancion" a la vez.
      //
      // El widget ya registra los dos prefijos. Esto es para que, si alguna vez
      // vuelve a pasar algo parecido, se sepa en un vistazo en lugar de en una
      // tarde.
      xhr.onload = () => {
        fin();
        if (xhr.status >= 200 && xhr.status < 300) return;
        if (quejas > 0) return;
        quejas++;
        registrar(
          'el widget contesto ' + xhr.status + ' a ' + url + '. Si es 400, casi '
          + 'seguro que su listener solo esta registrado como localhost: HTTP.sys '
          + 'enruta por la cabecera Host, no por IP. Actualiza widgets\\music\\server.ps1',
        );
      };
      xhr.ontimeout = fin;
      xhr.onerror = () => {
        fin();
        // Que el widget no este levantado es lo NORMAL: solo corre mientras se
        // streamea. Se avisa una vez por proceso y nunca mas, porque si no la
        // consola se llena de una queja cada segundo y medio durante horas.
        if (quejas === 0) {
          quejas++;
          registrar('el widget no contesta en ' + url + '. Es normal si no esta levantado (start-widget.bat)');
        }
      };
      xhr.send(JSON.stringify(d));
      return true;
    } catch (e) {
      enVuelo = Math.max(0, enVuelo - 1);
      if (quejas === 0) { quejas++; registrar('no se pudo enviar: ' + e); }
      return false;
    }
  };

  // --- El recolector, que corre DENTRO de la pagina -------------------------
  // Se escribe como funcion normal y se inyecta con toString(). Asi el codigo de
  // la pagina lo revisa el parser de JS al cargar este archivo, en lugar de ser
  // una cadena que nadie mira hasta que corre; y no hace falta ni un segundo
  // archivo ni escapar nada. Es la misma leccion que dejo escrita el cargador:
  // el codigo que viaja como texto se rompe por el escapado, y el fallo aparece
  // lejos de donde se escribio.
  //
  // REGLA: esta funcion NO puede cerrar sobre nada de aqui arriba. Al pasar por
  // toString() se queda solo con su cuerpo; cualquier variable de fuera llegaria
  // como "no esta definida" ya dentro de la pagina. Todo lo que necesita entra
  // por `puente`.
  const RECOLECTOR = function (puente) {
    'use strict';

    const CONF = puente.config;
    const LATIDO = CONF.latidoMs;
    const PASO = CONF.pasoMs;

    // Un id por pestana. El widget puede estar recibiendo de dos pestanas de
    // YouTube Music a la vez, y sin esto la que esta en pausa pisaria a la que
    // suena.
    const PESTANA = String(Math.random()).slice(2, 10);

    const q = (sel) => { try { return document.querySelector(sel); } catch (e) { return null; } };
    const txt = (el) => ((el && el.textContent) || '').trim();

    /* LA PORTADA, MAS GRANDE ------------------------------------------ MEDIDO -
       Las caratulas de YouTube Music vienen de googleusercontent con el tamano
       pedido en la propia URL, en la cola: ...=w60-h60-l90-rj. mediaSession
       declara varias medidas y la mayor suele ser 544. Reescribir la cola pide
       la grande al mismo CDN, que es gratis y se nota: el widget la pinta a 116
       px de diametro en una fuente de OBS que puede estar escalada. */
    const AMPLIAR = /=w\d+-h\d+/;
    const grande = (url) => (typeof url === 'string' && AMPLIAR.test(url) ? url.replace(AMPLIAR, '=w600-h600') : url);

    const dePortada = (md) => {
      let mejor = '';
      let area = -1;
      const arte = (md && md.artwork) || [];
      for (const a of arte) {
        if (!a || typeof a.src !== 'string') continue;
        const medida = String(a.sizes || '').split('x');
        const s = (Number(medida[0]) || 0) * (Number(medida[1]) || 0);
        if (s >= area) { area = s; mejor = a.src; }
      }
      return grande(mejor);
    };

    /* De donde sale cada dato, y en que orden ---------------------------------
       navigator.mediaSession.metadata primero. Es API estandar y es JUSTO lo que
       YouTube Music le da al navegador para que lo muestre el sistema: si eso
       dejara de existir, tampoco saldria la cancion en el panel de volumen de
       Windows, o sea que se enterarian ellos antes que nosotros.

       El DOM es el respaldo, y va detras a proposito: la barra del reproductor
       es suya y le pueden cambiar las clases cualquier dia. Los selectores son
       los mismos que Zen Letra Viva tiene medidos en mods\youtube-music\live-lyrics\src\10-puntos.js. */
    const delDom = () => {
      const titulo = txt(q('ytmusic-player-bar .title'));
      const linea = txt(q('ytmusic-player-bar .byline'));
      // La byline es "Artista <bullet> Album <bullet> Ano". El separador se
      // escribe con su escape y no con el caracter: este archivo se copia tal
      // cual al perfil y lo lee el cargador de scripts del navegador, y un
      // caracter fuera del ASCII en una cadena de CODIGO es una oportunidad de
      // que llegue mal decodificado sin que nadie lo note. En un comentario da
      // igual; en un separador que decide un split, no.
      const partes = linea.split('\u2022').map((p) => p.trim()).filter(Boolean);
      return { titulo, artista: partes[0] || '', album: partes[1] || '' };
    };

    const esAnuncio = () => {
      const mp = q('#movie_player');
      if (!mp || !mp.classList) return false;
      // 'ad-showing' es la que Zen Letra Viva tiene medida y documentada en el
      // contrato: mientras esta puesta, el video que suena es el anuncio y su
      // titulo no es una cancion.
      return mp.classList.contains('ad-showing') || mp.classList.contains('ad-interrupting');
    };

    const leer = () => {
      const v = q('video');
      const md = (navigator.mediaSession && navigator.mediaSession.metadata) || null;
      const dom = delDom();
      const anuncio = esAnuncio();

      return {
        pestana: PESTANA,
        cerrando: false,
        anuncio,
        sonando: !!(v && !v.paused && !v.ended),
        titulo: (md && md.title) || dom.titulo || '',
        artista: (md && md.artist) || dom.artista || '',
        album: (md && md.album) || dom.album || '',
        portada: dePortada(md) || '',
        posicion: (v && Number.isFinite(v.currentTime)) ? v.currentTime : 0,
        duracion: (v && Number.isFinite(v.duration)) ? v.duration : 0,
      };
    };

    // Se envia cuando cambia algo que se ve, y si no, un latido de vez en cuando.
    // El latido no es opcional: el widget oculta la tarjeta cuando deja de
    // recibir, y esa es justamente la garantia de que nada mas puede aparecer
    // ahi. Sin latido, una cancion en pausa se desvaneceria sola.
    let ultimaClave = '';
    let ultimoEnvio = 0;

    const clave = (d) => [d.titulo, d.artista, d.sonando, d.anuncio].join('|');

    const publicar = (forzar) => {
      let d;
      try { d = leer(); } catch (e) { return; }
      // Sin titulo no hay nada que mostrar, y ademas es el estado de los
      // primeros segundos de carga de la pagina.
      if (!d.titulo && !d.anuncio) return;

      const k = clave(d);
      const ahora = Date.now();
      if (!forzar && k === ultimaClave && (ahora - ultimoEnvio) < LATIDO) return;

      // Se apunta DESPUES y solo si salio de verdad. El puente puede cortar por
      // su cortafuegos de ritmo, y apuntarlo igualmente seria decirse a uno
      // mismo que el widget ya se entero. Si corto, el siguiente paso lo
      // reintenta, que como mucho es un segundo tarde.
      let salio = false;
      try { salio = puente.enviar(JSON.stringify(d)); } catch (e) { /* el otro lado ya se queja */ }
      if (!salio) return;

      ultimaClave = k;
      ultimoEnvio = ahora;
    };

    const despedirse = () => {
      // El widget se oculta solo cuando caduca lo ultimo recibido, pero si la
      // pestana se cierra o navega fuera es mejor decirlo: asi la tarjeta se va
      // en el acto y no se queda unos segundos mintiendo en pantalla.
      try {
        puente.enviar(JSON.stringify({ pestana: PESTANA, cerrando: true, sonando: false, titulo: '', artista: '' }));
      } catch (e) { /* nada que hacer */ }
    };

    // El sondeo es la via principal porque en una SPA el cambio de cancion no
    // dispara ningun evento del que uno pueda fiarse: el mismo elemento de video
    // sigue ahi y solo cambian los metadatos.
    setInterval(() => publicar(false), PASO);

    // Y los eventos del video, para que play/pausa se noten al instante en lugar
    // de tardar hasta un paso entero.
    const engancharVideo = () => {
      const v = q('video');
      if (!v || v.__zenSintonia) return;
      v.__zenSintonia = true;
      for (const ev of ['play', 'pause', 'ended', 'loadedmetadata', 'emptied']) {
        try { v.addEventListener(ev, () => publicar(true), { passive: true }); } catch (e) { /* da igual */ }
      }
    };
    engancharVideo();
    setInterval(engancharVideo, 4000);   // YouTube Music rehace el video al navegar

    addEventListener('pagehide', despedirse, { capture: true });

    publicar(true);
  };

  // --- La inyeccion ---------------------------------------------------------
  const puestos = new WeakSet();

  const inyectar = (doc) => {
    const win = doc.defaultView;
    if (!win) return;
    if (puestos.has(doc)) return;
    puestos.add(doc);

    // wantXrays en false y el window como prototipo: el recolector ve el DOM de
    // la pagina tal cual, igual que un userscript. El principal del sandbox es el
    // de la pagina, NO el del sistema: el recolector no tiene ni necesita
    // privilegios. Lo unico privilegiado que toca es `enviar`, y solo puede
    // mandar una cadena a un puerto de loopback.
    const caja = Cu.Sandbox(win, {
      sandboxPrototype: win,
      wantXrays: false,
      sameZoneAs: win,
      sandboxName: 'zen-sintonia',
    });

    // UNA SOLA CLONACION, Y NO DOS. La config iba clonada por su cuenta y
    // metida despues en el objeto del puente, que se clona tambien. Eso es
    // pedirle al clonador que copie un objeto que YA ES de la caja estando
    // dentro de uno del sistema, y esa es la clase de cosa que lanza "could not
    // clone object" en tiempo de ejecucion y deja el mod muerto en la pagina —
    // donde ningun doble de prueba lo puede ver, porque el clonador solo existe
    // de verdad dentro del navegador. Se construye entero aqui y se clona una
    // vez.
    //
    // El puente se deja como global DEL SANDBOX y no en window: colgarlo del
    // window lo pondria a la vista del propio codigo de YouTube Music.
    caja.__zenSintonia = Cu.cloneInto({
      enviar,
      config: {
        latidoMs: 3000,   // cada cuanto se repite aunque no cambie nada
        pasoMs: 1000,     // cada cuanto se mira si cambio algo
      },
    }, caja, { cloneFunctions: true });

    try {
      Cu.evalInSandbox(
        '(' + RECOLECTOR.toString() + ')(__zenSintonia);',
        caja, undefined, 'zen-sintonia-recolector.js', 1,
      );
    } catch (e) {
      registrar('el recolector no arranco: ' + e);
    }
  };

  const observador = {
    observe(sujeto) {
      try {
        const doc = sujeto;
        if (!doc || !doc.location) return;
        // El host se comprueba antes de tocar nada: este observador ve TODOS los
        // documentos del proceso.
        if (doc.location.host !== SITIO) return;
        // Solo el documento de primer nivel. Los iframes de anuncio y de
        // reproductor no tienen ni barra ni mediaSession, y una segunda
        // instancia dentro de uno solo serviria para pelearse por el widget.
        if (doc.defaultView && doc.defaultView.top !== doc.defaultView) return;
        if (!pref(PREF_ENCENDIDO, true, false)) return;
        inyectar(doc);
      } catch (e) {
        registrar('fallo observando un documento: ' + e);
      }
    },
  };

  // document-element-inserted es el momento en que el documento ya tiene su
  // elemento raiz pero todavia no ha corrido ningun script de la pagina.
  SV.obs.addObserver(observador, 'document-element-inserted');
  registrar('inyector en pie en este proceso');
})();

// ===========================================================================
// Zen Hardening — nivel 'balanced' (siempre se aplica)
// ---------------------------------------------------------------------------
// Reduce superficie de ataque sin que se note al navegar. Nada de lo que hay
// aqui rompe sitios normales.
//
// Que NO hace esto: parchear vulnerabilidades. Un fallo de corrupcion de
// memoria en Gecko vive en xul.dll y solo lo arregla la build nueva. Lo que se
// consigue reduciendo superficie es que cuando exista una ventana de exposicion
// (entre el aviso de Mozilla y la build de Zen) haya menos codigo alcanzable
// desde una pagina web.
//
// Usa dev\powershell\Check-ZenExposure.ps1 para saber si estas en una de esas ventanas.
// ===========================================================================

// Proteccion contra rastreo en modo estricto. Ademas de privacidad, corta la
// carga de scripts de terceros, que es por donde llega la mayoria de los
// exploits reales: casi nunca te ataca la web que visitas, te ataca el anuncio
// o el script incrustado que esa web carga sin mirar.
user_pref("browser.contentblocking.category", "strict");
user_pref("privacy.trackingprotection.enabled", true);

// HTTPS obligatorio. Sin esto, cualquiera en tu red puede inyectar contenido en
// una peticion HTTP en claro; con una vulnerabilidad sin parchear eso pasa de
// molestia a ejecucion de codigo. Las webs que solo tengan HTTP pediran
// confirmacion en vez de cargarse en silencio.
user_pref("dom.security.https_only_mode", true);

// Bloquea imagenes/media en claro dentro de paginas HTTPS. Es el mismo
// razonamiento: contenido no autenticado que atraviesa los decodificadores.
user_pref("security.mixed_content.block_display_content", true);

// Prefetch y prefetch de DNS: conexiones y descargas que tu no pediste, hechas
// a destinos que decide la pagina. Menos peticiones automaticas, menos ocasiones
// de tocar codigo de red con datos de un tercero.
user_pref("network.dns.disablePrefetch", true);
user_pref("network.prefetch-next", false);

// pdf.js ejecuta JavaScript incrustado en los PDF y soporta formularios XFA.
// Un PDF es un archivo que abres sin pensar, y ese motor ha tenido CVEs
// propios. Apagarlo solo rompe formularios PDF interactivos, que son rarisimos.
user_pref("pdfjs.enableScripting", false);
user_pref("pdfjs.enableXfa", false);

// ---------------------------------------------------------------------------
// Lo que deliberadamente NO se toca, y por que
// ---------------------------------------------------------------------------
//
// privacy.resistFingerprinting — NO. Fuerza prefers-color-scheme a 'light'
//   pasando por encima de layout.css.prefers-color-scheme.content-override, que
//   es justo la pref con la que Acrylic Zen mantiene las webs en oscuro. Con RFP
//   activo todas las webs se pintarian claras sobre un cristal oscuro y el texto
//   negro quedaria ilegible. Es una decision de diseno de Mozilla, no un bug
//   (bugzilla 1732114 y 1535189). Si algun dia lo quieres, hay que apagar antes
//   la capa web del mod.
//
// security.sandbox.content.level — NO. En Windows ya viene en el nivel mas alto
//   que soporta la plataforma. Escribir un numero a ojo aqui es tan facil que
//   acabe BAJANDO el sandbox como subiendolo, y no hay forma de comprobar el
//   valor efectivo sin arrancar el navegador. Se deja el que trae Zen.
//
// javascript.enabled — NO. Apagar JS entero no es un nivel de seguridad, es
//   dejar de tener navegador. Para eso esta uBlock Origin en modo medio, que
//   bloquea scripts de terceros y te deja decidir sitio por sitio.

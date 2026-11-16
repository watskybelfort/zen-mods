// ===========================================================================
// Zen Hardening — nivel 'strict'
// ---------------------------------------------------------------------------
// Aqui esta el unico cambio de este repo con impacto de seguridad de primer
// orden: quitarle el JIT a las paginas web.
//
// Por que el JIT. Para ir rapido, el motor de JavaScript compila el codigo de
// la pagina a codigo maquina en tiempo real y lo ejecuta. Eso obliga a tener
// memoria que es escribible y ejecutable a la vez, que es exactamente la
// condicion que un atacante necesita para convertir un fallo de memoria en
// ejecucion de codigo. Es la parte mas compleja y mas optimizada del motor, y
// por eso concentra una fraccion enorme de los CVE: mirando los datos de V8,
// alrededor del 45% de sus vulnerabilidades estan en el JIT.
//
// No es teorico ni antiguo. En el aviso MFSA de este mismo mes hay un
// CVE-2026-15718 clasificado como critical, titulado "Invalid pointer in the
// JavaScript: WebAssembly component". Ese es el tipo de fallo que estas prefs
// dejan fuera de alcance.
//
// El truco que hace esto asumible: jit_trustedprincipals. Apaga el JIT para el
// contenido web y lo DEJA ENCENDIDO para el codigo privilegiado del propio
// navegador (la interfaz de Zen, sus paneles, las extensiones). Sin esa pref,
// apagar el JIT dejaria la interfaz entera arrastrandose.
//
// IMPORTANTE: jit_trustedprincipals solo surte efecto si 'ion' y 'baselinejit'
// estan ambas en false. Si una de las dos queda en true, se ignora en silencio.
// Por eso las tres van juntas y no tiene sentido aplicar una suelta.
//
// Coste real: las webs con mucho JavaScript (editores online, hojas de calculo,
// mapas, juegos) van notablemente mas lentas. Navegacion, lectura, video y
// redes sociales apenas se enteran.
// ===========================================================================

// Compilador optimizador. El de mayor superficie: es donde viven las
// optimizaciones especulativas y los bugs de type confusion.
user_pref("javascript.options.ion", false);

// Compilador de primer nivel. Tiene que apagarse tambien o el de arriba no
// cuenta: sigue habiendo generacion de codigo en tiempo de ejecucion.
user_pref("javascript.options.baselinejit", false);

// La pref que hace todo esto usable: el navegador conserva JIT para su propio
// codigo, las webs no. Solo se lee cuando las dos anteriores estan en false.
user_pref("javascript.options.jit_trustedprincipals", true);

// asm.js: ruta de compilacion adelantada, anterior a WebAssembly. Ya casi nadie
// la usa y sigue siendo codigo generado en caliente.
user_pref("javascript.options.asmjs", false);

// WebAssembly para contenido web. Es codigo binario compilado a nativo dentro
// del navegador; su superficie es enorme y es la componente del CVE critico
// citado arriba. wasm_trustedprincipals mantiene wasm disponible para el propio
// navegador, igual que jit_trustedprincipals con el JIT.
//
// Rompe: Figma, Google Earth, emuladores web, algun editor de video online.
user_pref("javascript.options.wasm", false);
user_pref("javascript.options.wasm_trustedprincipals", true);

// WebRTC. Abre sockets y mete en juego los decodificadores de media con datos
// que llegan directos de otro par, no del servidor. Ademas filtra tu IP local
// aunque uses VPN.
//
// Rompe: videollamadas en el navegador (Meet, Jitsi, Discord web, WhatsApp web
// con llamadas). Si usas alguna a diario, quitate esta linea.
user_pref("media.peerconnection.enabled", false);

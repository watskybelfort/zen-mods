// Zen Web Apps — prefs que encienden el autoconfig.
//
// Va en <instalacion de Zen>/defaults/pref/, que es:
//   Windows   C:\Program Files\Zen Browser\defaults\pref\
//   macOS     /Applications/Zen.app/Contents/Resources/defaults/pref/
//
// Las tres son de la APLICACION, no del perfil: el cargador de autoconfig las
// lee antes de que exista un perfil, asi que no sirve ponerlas en user.js. Son
// las mismas que siembran Zen Letra Viva, Zen Sintonia y Zen Sin Cristal, y
// estan repetidas a proposito: cada mod nativo tiene que poder instalarse solo,
// sin los otros. Declarar el mismo valor por defecto cuatro veces no molesta a
// nadie.
//
// general.config.filename dice que archivo del directorio de instalacion se
// ejecuta. obscure_value a 0 es lo que permite que ese archivo sea texto normal:
// el valor por defecto es 13, y con el el navegador espera el archivo cifrado
// con un ROT-13 heredado de Netscape. Con 13 y un archivo en claro, el cargador
// lee basura y no dice nada.
//
// sandbox_enabled a false es lo que le deja usar Services y Components. Sin eso
// el config.js corre en un entorno sin nada dentro y falla en la primera linea.

pref('general.config.filename', 'config.js');
pref('general.config.obscure_value', 0);
pref('general.config.sandbox_enabled', false);

// --- La del mod ------------------------------------------------------------
// El interruptor, que ADEMAS sale en Ajustes > Zen Mods > Zen Web Apps porque
// lo declara mods/utilities/web-apps/preferences.json. Se declara tambien aqui para
// que la pieza nativa tenga un valor por defecto de verdad cuando esta
// instalada sin el mod de CSS: sin esto, `getBoolPref` cae al respaldo escrito
// en ventana.js, que hace lo mismo pero no se ve en about:config.
//
// Apagarla devuelve la ventana de app a lo que hace Zen de fabrica en 1.22.2b:
// barra unica, con la URL y los botones de ventana dentro de la barra lateral.
// O sea que apagarla NO es "quitar la barra lateral de otra forma", es volver a
// verla. El mod entero se apaga desde el interruptor del propio Zen Mod.
pref('zen-web-apps.restore-top-bar', true);

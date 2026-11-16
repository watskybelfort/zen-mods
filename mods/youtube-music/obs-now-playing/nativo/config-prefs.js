// Zen Sintonia — prefs que encienden el autoconfig y ajustan el mod.
//
// Va en <instalacion de Zen>/defaults/pref/, que es:
//   Windows   C:\Program Files\Zen Browser\defaults\pref\
//   macOS     /Applications/Zen.app/Contents/Resources/defaults/pref/
//
// Las tres primeras son de la
// APLICACION, no del perfil: el cargador de autoconfig las lee antes de que
// exista un perfil, asi que no sirve ponerlas en user.js. Son las mismas que
// siembra Zen Letra Viva, y estan repetidas a proposito: cada mod nativo tiene
// que poder instalarse solo, sin el otro. Declarar el mismo valor por defecto
// dos veces no molesta a nadie.
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

// --- Las del mod -----------------------------------------------------------
// Estas dos si se pueden cambiar en caliente desde about:config; el puerto se
// lee en cada envio, asi que basta recargar la pestana de YouTube Music.
//
// El puerto tiene que ser EL MISMO que el del widget. 9463 es el que trae por
// defecto widgets\music\server.ps1; si alli se arranca con -Port, aqui hay que
// ponerlo igual.
pref('zen.sintonia.encendido', true);
pref('zen.sintonia.puerto', 9463);

// Idioma de lo que muestran los mods: 'auto' (el de la pagina o el de Zen), 'es' o 'en'.
// Compartida por todos los mods; con valor por defecto para que llegue a las paginas.
pref('zen.mods.idioma', 'auto');

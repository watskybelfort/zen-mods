// Zen Sin Cristal — prefs que encienden el autoconfig y guardan la lista.
//
// Va en <instalacion de Zen>/defaults/pref/, que es:
//   Windows   C:\Program Files\Zen Browser\defaults\pref\
//   macOS     /Applications/Zen.app/Contents/Resources/defaults/pref/
//
// Las tres primeras son de la APLICACION, no del perfil: el cargador de
// autoconfig las lee antes de que exista un perfil, asi que no sirve ponerlas en
// user.js. Son las mismas que siembran Zen Letra Viva y Zen Sintonia, y estan
// repetidas a proposito: cada mod nativo tiene que poder instalarse solo, sin
// los otros. Declarar el mismo valor por defecto dos veces no molesta a nadie.
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
// La lista de sitios apagados. Se escribe sola al pulsar la entrada del menu,
// pero es texto normal y se puede editar a mano aqui o en about:config. Vale
// coma, punto y coma o espacios como separador.
//
// NO SE ASOMA AL PANEL DE MODS, y no por olvido: las opciones que salen ahi las
// declara mods/appearance/acrylic-glass/preferences.json, y de ahi las lee el instalador para
// sembrar su valor por defecto en cada pasada. O sea que una lista puesta ahi se
// quedaria vacia cada vez que se reinstala la capa web. Este es el unico dato
// del mod que escribe el usuario de su mano; no puede vivir en un sitio que lo
// pise.
//
// UN DOMINIO CUBRE SUS SUBDOMINIOS y no cruza sufijos, exactamente igual que el
// `domain()` de las reglas del CSS: `ejemplo.com` apaga `www.ejemplo.com` pero
// NO `ejemplo.com.co`.
//
// Que este VACIA por defecto es la respuesta correcta: la lista de sitios que a
// uno se le rompen no la puede adivinar nadie, y sembrarla con ejemplos seria
// apagarle el cristal a alguien sin que lo haya pedido.
pref('zen.sincristal.sitios', '');

// El interruptor general del mod. En false el menu se esconde y ningun documento
// se marca, o sea que vuelve el cristal en todos los sitios sin tener que vaciar
// la lista. Se cambia en caliente: la pref llega replicada a los procesos de
// contenido y las paginas abiertas se enteran solas.
pref('zen.sincristal.encendido', true);

// El timbre de la lista de paginas pendientes de revisar. NO lleva la lista:
// lleva "<cuantas>@<milisegundos>", que es algo que cambia siempre, y su unico
// trabajo es que las demas ventanas se enteren de que el archivo cambio. Leida
// en about:config contesta ademas "cuantas hay" y "cuando se toco".
//
// LA LISTA VIVE EN UN ARCHIVO, no aqui:
//
//   <perfil>/zen-cristal-pendientes.json
//
// Y no es una pref por tres motivos, ninguno de estilo: crece sin techo y las
// prefs se replican a TODOS los procesos de contenido, que no la leen; una pref
// llega al disco cuando Gecko vuelca prefs.js, que es perezoso, y el punto
// entero de esto es poder pasarle el archivo a alguien sin cerrar el navegador;
// y dos sitios donde vive el mismo dato es un sitio que pierde en silencio.
//
// Igual que la lista de sitios, TAMPOCO se asoma al panel de mods, y por lo
// mismo: lo que sale ahi lo resiembra el instalador de la capa web en cada
// pasada, y se llevaria por delante lo que el usuario hubiese guardado.
pref('zen.sincristal.pendientes.sello', '');

// Idioma de lo que muestran los mods: 'auto' (el de la pagina o el de Zen), 'es' o 'en'.
// Compartida por todos los mods; con valor por defecto para que llegue a las paginas.
pref('zen.mods.idioma', 'auto');

// Zen Modo Oscuro — prefs que encienden el autoconfig y guardan la lista.
//
// Va en <instalacion de Zen>/defaults/pref/, que es:
//   Windows   C:\Program Files\Zen Browser\defaults\pref\
//   macOS     /Applications/Zen.app/Contents/Resources/defaults/pref/
//
// Las tres primeras son de la APLICACION, no del perfil: el cargador de
// autoconfig las lee antes de que exista un perfil, asi que no sirve ponerlas en
// user.js. Son las mismas que siembran los demas mods nativos y estan repetidas
// a proposito: cada uno tiene que poder instalarse solo, sin los otros.
// Declarar el mismo valor por defecto dos veces no molesta a nadie.
//
// general.config.filename dice que archivo del directorio de instalacion se
// ejecuta. obscure_value a 0 es lo que permite que ese archivo sea texto normal.
// sandbox_enabled a false es lo que le deja usar Services y Components.

pref('general.config.filename', 'config.js');
pref('general.config.obscure_value', 0);
pref('general.config.sandbox_enabled', false);

// --- Las del mod -----------------------------------------------------------

// La lista de sitios con el modo oscuro puesto. La escribe sola la entrada del
// clic derecho, pero es texto normal y se puede editar a mano aqui o en
// about:config. Vale coma, punto y coma o espacios como separador.
//
// UN DOMINIO CUBRE SUS SUBDOMINIOS y no cruza sufijos, igual que `domain()` en
// las reglas del CSS: `ejemplo.com` oscurece `www.ejemplo.com` pero NO
// `ejemplo.com.co`.
//
// NO SE ASOMA AL PANEL DE MODS, y no por olvido: lo que sale ahi lo siembra el
// instalador general en cada pasada con su valor por defecto, y una lista puesta
// ahi se vaciaria cada vez que se reinstala. Es el unico dato que el usuario
// escribe de su mano; no puede vivir donde algo lo pisa.
//
// Vacia por defecto: ninguna web se oscurece sin que alguien lo haya pedido.
pref('zen.modooscuro.sitios', '');

// El interruptor general. En false se esconde la entrada del menu y ningun
// documento se oscurece, sin vaciar la lista. Esta SI se asoma al panel de mods
// (mods/appearance/dark-mode/preferences.json), porque es un booleano y se puede
// sembrar sin que moleste: el valor por defecto de aqui y el de alli coinciden.
pref('zen.modooscuro.encendido', true);

// Oscurecer TODAS las paginas http(s), no solo las de la lista. Tambien en el
// panel de mods. Cuesta un poco de CPU en cada pagina (el motor analiza sus
// hojas de estilo), y las que ya son oscuras no se tocan: el motor lo detecta.
pref('zen.modooscuro.todo', false);

// Ajustes del motor, para quien los quiera. Solo en about:config: son enteros, y
// el panel de mods no puede escribir enteros (un desplegable escribe un atributo
// y una cadena una variable CSS, ninguna de las dos llega a codigo nativo).
//
//   brillo      50-150, 100 es el de fabrica del motor
//   contraste   50-150, 100 es el de fabrica del motor
//   sepia       0-100, 0 es sin tinte calido
pref('zen.modooscuro.brillo', 100);
pref('zen.modooscuro.contraste', 100);
pref('zen.modooscuro.sepia', 0);

// Vuelca a la consola del navegador (Ctrl+Shift+J, lineas "[modo-oscuro]") lo que
// el motor no pudo leer: una imagen, una hoja de estilo de otro dominio, un
// destino que el puente rechazo. Sin esto, algo que se queda claro no dice por
// que. Se mira al crear cada documento, asi que hay que recargar la pagina.
pref('zen.modooscuro.depurar', false);

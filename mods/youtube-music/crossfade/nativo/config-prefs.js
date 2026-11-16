// Zen Mezcla — prefs que encienden el autoconfig y el interruptor del mod.
//
// Va en <instalacion de Zen>/defaults/pref/. Las tres primeras son de la
// aplicacion y estan repetidas a proposito, igual que en los otros mods nativos:
// cada uno tiene que poder instalarse solo.

pref('general.config.filename', 'config.js');
pref('general.config.obscure_value', 0);
pref('general.config.sandbox_enabled', false);

// El interruptor de emergencia. En false no se inyecta nada en la pagina; basta
// con recargar la pestana de YouTube Music. La mezcla del dia a dia se apaga
// desde el boton de la barra del reproductor.
pref('zen.mezcla.encendido', true);

// Idioma de lo que muestran los mods: 'auto' (el de la pagina o el de Zen), 'es' o 'en'.
// Compartida por todos los mods; con valor por defecto para que llegue a las paginas.
pref('zen.mods.idioma', 'auto');

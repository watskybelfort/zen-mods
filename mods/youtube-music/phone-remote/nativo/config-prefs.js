// Zen Remoto — prefs que encienden el autoconfig y las del mod.
//
// Va en <instalacion de Zen>/defaults/pref/. Las tres primeras son de la
// aplicacion y estan repetidas a proposito, igual que en los otros mods nativos:
// cada uno tiene que poder instalarse solo.

pref('general.config.filename', 'config.js');
pref('general.config.obscure_value', 0);
pref('general.config.sandbox_enabled', false);

// En false se cierra el puerto al momento y no se inyecta nada en las pestanas
// nuevas de YouTube Music.
pref('zen.remoto.encendido', true);
// El puerto del servidor en la red de casa. Cambiarlo lo reabre al momento.
pref('zen.remoto.puerto', 8642);

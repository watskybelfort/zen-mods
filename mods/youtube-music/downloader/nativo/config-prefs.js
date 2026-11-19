// Zen Descargas — prefs que encienden el autoconfig y las del mod.
//
// Va en <instalacion de Zen>/defaults/pref/. Las tres primeras son de la
// aplicacion y estan repetidas a proposito, igual que en los otros mods nativos:
// cada uno tiene que poder instalarse solo.

pref('general.config.filename', 'config.js');
pref('general.config.obscure_value', 0);
pref('general.config.sandbox_enabled', false);

// En false no sale el boton en las pestanas nuevas y el descargador no acepta pedidos.
pref('zen.descargas.encendido', true);
// Calidad del video: 'max', '2160', '1440', '1080', '720' o '480'. Se cambia en el panel.
pref('zen.descargas.calidad', '1080');
// Formato de la musica: 'mp3' (el que abre todo) o 'm4a' (el original, sin recodificar).
pref('zen.descargas.audio', 'mp3');
// Usar la sesion de YouTube de Zen (sus cookies) para lo que pide iniciar sesion:
// restriccion de edad, "confirma que no eres un bot". Apagada de fabrica.
pref('zen.descargas.cookies', false);
// Aviso del sistema al terminar cada descarga.
pref('zen.descargas.avisos', true);

// Idioma de lo que muestran los mods: 'auto' (el de la pagina o el de Zen), 'es' o 'en'.
// Compartida por todos los mods; con valor por defecto para que llegue a las paginas.
pref('zen.mods.idioma', 'auto');

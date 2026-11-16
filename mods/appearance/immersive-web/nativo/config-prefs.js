// Zen Inmersivo — prefs que encienden el autoconfig y las del mod.
//
// Va en <instalacion de Zen>/defaults/pref/. Las tres primeras son de la
// aplicacion y estan repetidas a proposito, igual que en los otros mods nativos.

pref('general.config.filename', 'config.js');
pref('general.config.obscure_value', 0);
pref('general.config.sandbox_enabled', false);

// Interruptor de emergencia: en false no se pinta nada (se nota al momento).
pref('zen.inmersivo.encendido', true);
// Los ajustes (JSON). Vacio = los de la extension por defecto: todo encendido.
pref('zen.inmersivo.ajustes', '{}');

// Al instalar, desactiva la extension Zen Internet una sola vez (se reactiva en
// about:addons; el mod no vuelve a tocarla).
pref('zen.inmersivo.retirar-extension', true);

// Idioma de lo que muestran los mods: 'auto' (el de la pagina o el de Zen), 'es' o 'en'.
// Compartida por todos los mods; con valor por defecto para que llegue a las paginas.
pref('zen.mods.idioma', 'auto');

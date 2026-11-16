// ===========================================================================
// Zen Hardening — nivel 'paranoid'
// ---------------------------------------------------------------------------
// Equivalente aproximado al nivel "Safest" de Tor Browser. Esto ya se nota al
// navegar todos los dias. Tiene sentido como medida temporal cuando
// Check-ZenExposure.ps1 dice EXPUESTO y Zen todavia no ha publicado la build,
// no tanto como configuracion permanente.
// ===========================================================================

// Interprete baseline: aunque se llame interprete, genera codigo maquina al
// arrancar. Apagarlo deja el motor en interpretacion pura, sin nada escribible
// y ejecutable a la vez para el contenido web. Es el ultimo trozo de JIT que
// quedaba vivo tras el nivel strict, y tambien el que mas rendimiento cuesta.
user_pref("javascript.options.blinterp", false);

// El motor de expresiones regulares tambien compila a nativo, y ha tenido sus
// propios CVE. Cae en el mismo saco.
user_pref("javascript.options.native_regexp", false);

// WebGL. Entrega datos de la pagina directamente a los drivers graficos, que
// son codigo de terceros fuera del sandbox y una fuente clasica de fallos
// explotables. Es de lo mas rentable que se puede apagar.
//
// Rompe: mapas en 3D, visores de modelos, juegos web, algunos graficos.
user_pref("webgl.disabled", true);

// Service workers: codigo de la pagina que queda registrado y puede ejecutarse
// en segundo plano, incluso sin la pestana abierta. Reduce la superficie
// persistente, que es la que sobrevive a cerrar el navegador.
//
// Rompe: modo sin conexion, notificaciones push, y algunas apps web tardan mas
// en cargar porque pierden su cache.
user_pref("dom.serviceWorkers.enabled", false);

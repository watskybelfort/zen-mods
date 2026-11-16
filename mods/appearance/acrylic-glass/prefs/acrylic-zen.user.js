// ===========================================================================
// Acrylic Zen — preferencias COMUNES
// ---------------------------------------------------------------------------
// Estas son las prefs que el CSS del mod NO puede tocar y que valen igual en
// Windows y en macOS.
//
// Las que encienden el cristal viven aparte, porque el compositor es distinto
// en cada sistema y una pref de uno no existe en el otro:
//
//     mods/appearance/acrylic-glass/prefs/windows.user.js   el backdrop de DWM (mica / acrilico)
//     mods/appearance/acrylic-glass/prefs/macos.user.js     la NSVisualEffectView de Cocoa (vibrancy)
//
// `installer/instalar.mjs` lee este archivo y le superpone el de la plataforma en
// la que corre, en ese orden. Las tres piezas juntas son la unica fuente de
// verdad de las prefs.
// ===========================================================================

// Acrilico interno de Zen: barra de direcciones difuminada y barra flotante del
// modo compacto. Complementa al cristal del sistema en las zonas donde el
// compositor no llega (dentro de la propia ventana).
//
// Es comun a los dos sistemas porque en el CSS de Zen esta puesta como
// `@media -moz-pref("zen.theme.acrylic-elements")` sin ninguna condicion de
// plataforma (zen-omnibox.css, zen-compact-mode.css, zen-browser-container.css).
// El valor de fabrica si cambia: `true` en Windows, `false` en macOS.
user_pref("zen.theme.acrylic-elements", true);

// Permite que las paginas que no pintan su propio fondo (nueva pestana,
// about:blank, etc.) dejen ver el cristal. Las webs que si definen fondo
// siguen siendo opacas, asi que no se rompe la legibilidad.
user_pref("browser.tabs.allow_transparent_browser", true);

// Zen tapa la ventana con un gris solido (InactiveCaption) al perder el foco.
// Con cristal eso corta el efecto en seco cada vez que cambias de app.
//
// En macOS ademas hace algo que no se adivina por el nombre: Zen la lee en
// `VibrancyManager.mm` y, cuando esta en false, devuelve
// `NSVisualEffectStateActive` en lugar de `FollowsWindowActiveState`. O sea que
// no solo evita el gris de Zen, sino que le dice a Cocoa que no apague la
// vibrancy al perder el foco. Misma linea, dos efectos, el mismo resultado.
user_pref("zen.view.grey-out-inactive-windows", false);

// Carga <perfil>/chrome/userContent.css, que es lo que quita el fondo opaco de
// las paginas web. Sin esto la ventana es de cristal pero cada web sigue
// pintando su propio fondo encima y tapandolo.
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);

// Animaciones dirigidas por scroll (animation-timeline: scroll()). Es lo que
// permite que el buscador de YouTube se aparte al alejarte del principio de la
// pagina sin necesidad de JavaScript. Si ya viene activa, Zen descarta esta
// linea al cerrar; si no, la enciende.
user_pref("layout.css.scroll-driven-animations.enabled", true);

// Apariencia de las webs: 0 = oscuro, 1 = claro, 2 = automatico.
// Forzar oscuro no es cosmetica opcional: el cristal va tenido de oscuro, y un
// sitio en modo claro deja texto negro sobre ese cristal, que es ilegible. En
// oscuro el texto es claro y el cristal se lee bien.
// Si prefieres que cada web use su tema, pon 2 y sube la opacidad del velo de
// contenido en Ajustes > Zen Mods > Acrylic Zen.
user_pref("layout.css.prefers-color-scheme.content-override", 0);

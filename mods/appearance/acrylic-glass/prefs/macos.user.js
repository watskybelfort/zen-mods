// ===========================================================================
// Acrylic Zen — preferencias de macOS
// ---------------------------------------------------------------------------
// El equivalente de las de Windows, con otro compositor debajo. Aqui no hay DWM
// ni backdrop de ventana: el cristal lo dibuja una `NSVisualEffectView` que
// Gecko monta cuando encuentra `-moz-default-appearance: -moz-sidebar` en un
// elemento. Zen ya se lo pone a `#zen-browser-background`:
//
//     /* zen-browser-ui.css */
//     #zen-browser-background {
//       @media (-moz-platform: macos) {
//         -moz-default-appearance: -moz-sidebar;
//         appearance: auto;
//       }
//     }
//
// De ahi salen las dos consecuencias que mandan en todo lo demas:
//
//   1. EL MOD NO DEBE TOCAR `appearance` DE ESE ELEMENTO. Es la vista de
//      vibrancy; ponerle `appearance: none` apaga el cristal entero. Solo se le
//      pone un `background-color` translucido encima, como tinte.
//   2. NO HAY BACKDROP PARA LOS POPUPS que haya que encender: en macOS los
//      menus ya son ventanas con vibrancy nativa. La rama de emulacion con
//      `backdrop-filter` sobra, y de hecho estorba.
//
// Como en Windows, la ventana ya viene declarada transparente por Zen
// (`#main-window` dentro de `@media (-moz-windows-mica) or (-moz-platform:
// macos)`), asi que el trabajo del mod es el mismo en los dos sistemas: retirar
// las capas opacas que Zen pinta encima.
// ===========================================================================

// EL INTERRUPTOR CLAVE. Elige el material de la NSVisualEffectView de la
// barra lateral, que es la que hace de cristal de toda la ventana. Zen lo
// traduce en `src/widget/cocoa/VibrancyManager-mm.patch`:
//
//   1  NSVisualEffectMaterialHUDWindow             <- el de fabrica de Zen
//   2  NSVisualEffectMaterialFullScreenUI
//   3  NSVisualEffectMaterialPopover
//   4  NSVisualEffectMaterialMenu
//   5  NSVisualEffectMaterialToolTip
//   6  NSVisualEffectMaterialHeaderView
//   7  NSVisualEffectMaterialUnderWindowBackground  <- y cualquier otro valor
//
// No es una escala de opacidad aunque lo parezca: son materiales del sistema y
// cada uno tiene su propia mezcla de desenfoque, saturacion y tinte, que ademas
// cambia con el modo claro/oscuro. El orden util, de mas a menos cristal, es
// mas o menos 1 -> 3 -> 4 -> 6 -> 7.
//
// Se deja en 1 porque es el que va con el preset por defecto del mod ("glass",
// maxima transparencia) y es ademas el de fabrica de Zen, asi que esta linea no
// cambia nada de por si: esta para que se vea que existe y donde se toca. Si el
// cristal te resulta excesivo, 6 es el punto intermedio comodo.
//
// El mod NO lo expone en Ajustes > Zen Mods, y no por olvido: las opciones de
// un mod solo pueden escribir prefs booleanas (checkbox); los desplegables
// escriben un atributo en el DOM y las cadenas una variable CSS, y ninguna de
// las dos cosas llega a `zen.widget.macos.window-material`, que es un entero
// que lee codigo nativo. Se cambia aqui o en about:config.
user_pref("zen.widget.macos.window-material", 1);

// Que la vibrancy muestree lo que hay DETRAS DE LA VENTANA y no el contenido de
// la propia ventana. Es la diferencia entre cristal de verdad y un desenfoque
// de lo que ya se ve: sin esto el efecto existe pero no deja ver el escritorio
// ni las ventanas de detras, que es justo lo que se busca.
//
// Es el equivalente conceptual de DWMSBT_TRANSIENTWINDOW frente a mica en
// Windows, y tiene la misma trampa: mirar solo hacia dentro da un resultado
// plano que se confunde con "el mod no funciona".
//
// Zen ya envia la de la barra lateral en true de fabrica; la del titulo no
// viene declarada y se queda en el valor de Gecko. Se ponen las dos explicitas
// para que el marco entero muestree igual y no haya una franja distinta arriba.
user_pref("widget.macos.sidebar-blend-mode.behind-window", true);
user_pref("widget.macos.titlebar-blend-mode.behind-window", true);

// Popovers nativos para los paneles. Con vibrancy detras, un panel dibujado por
// Gecko sobre cristal se ve sucio; el popover del sistema trae su propio
// material y sus propias sombras, que es lo que espera macOS.
// Viene activa de fabrica en Zen; explicita por si se toco antes.
user_pref("widget.macos.native-popovers", true);

// ===========================================================================
// Acrylic Zen — preferencias de WINDOWS
// ---------------------------------------------------------------------------
// Las que hacen que DWM, el compositor de Windows, dibuje acrilico REAL detras
// de la ventana de Zen. Es exactamente lo que haria Mica For Everyone, pero
// pedido por el propio navegador y afectando solo a Zen.
//
// `installer/instalar.mjs` las aplica encima de `acrylic-zen.user.js` cuando corre
// en Windows. En macOS no se leen: estas prefs no existen en esa build.
// ===========================================================================

// Habilita el soporte de backdrop de DWM en la ventana principal.
// Ya viene activo por defecto en Zen; se deja explicito por si se toco antes.
user_pref("widget.windows.mica", true);

// EL INTERRUPTOR CLAVE, y el numero NO es el que parece. Esta pref es un indice
// interno de Gecko, que se traduce al enum de dwmapi.h antes de llamar a DWM, de
// modo que su valor y el de DWM_SYSTEMBACKDROP_TYPE no coinciden. Medido con
// DwmGetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE = 38) sobre la ventana de Zen:
//
//   pref 2  ->  DWMSBT_TRANSIENTWINDOW (3)  acrilico: difumina lo que hay DETRAS
//   pref 3  ->  DWMSBT_TABBEDWINDOW    (4)  mica alt: solo tinte del ESCRITORIO
//
// Escribir 3 pensando que es DWMSBT_TRANSIENTWINDOW se sale de rango y Gecko cae
// a mica alt, que es peor que no tocar nada. La trampa esta en que mica y mica
// alt muestrean unicamente el fondo de escritorio y jamas las ventanas de
// detras: sobre un escritorio de color solido oscuro dan negro plano, sintoma
// identico a "el mod no funciona".
//
// Zen ya envia 2 de fabrica (browser\omni.ja -> defaults/preferences/firefox.js),
// asi que esta linea es un seguro por si alguien la habia cambiado, no un cambio.
user_pref("widget.windows.mica.toplevel-backdrop", 2);

// Backdrop propio para menus y paneles emergentes (son ventanas aparte, DWM
// tiene que difuminarlos por separado; backdrop-filter no puede hacerlo).
user_pref("widget.windows.mica.popups", true);

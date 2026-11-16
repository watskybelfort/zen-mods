# Acrylic Zen

Cristal del sistema detrás de Zen Browser: acrílico en Windows 11 y vibrancy en macOS.

**En Windows, el acrílico lo pone el mod
[Translucent Windows](https://windhawk.net/mods/translucent-windows) de Undisputed00x, en
[Windhawk](https://windhawk.net).** Es gracias a ese mod que el efecto funciona: sin él la
ventana de Zen se queda sólida. Sus ajustes, más abajo en *Requisitos*.

El efecto no lo dibuja este CSS. Lo dibuja el compositor —DWM en Windows, a través de
Translucent Windows; una
`NSVisualEffectView` en macOS— y este mod solo se encarga de retirar las capas
opacas que Zen pinta encima, para que ese cristal se vea. Como son las mismas
capas en los dos sistemas, el CSS es casi todo compartido.

## Requisitos

Comunes:

- Las prefs aplicadas (las pone el instalador). Sin ellas el mod no hace nada
  visible: el `background-color` translucido que aplica se veria sobre el fondo
  opaco de siempre.
- Transparencias activadas en el sistema.
- En Windows, [Windhawk](https://windhawk.net) con el mod **Translucent Windows**
  (Undisputed00x): tipo *Acrylic blur*, `AccentBlurBehind` `8C000000`, `ExtendFrame` y
  `ImmersiveDarkTitle` activados, `BackgroundEffects` en *Acrylic blur* `3A232323` y
  `FlyoutsEffects` activado.

| | Windows | macOS |
| --- | --- | --- |
| Version minima | 11 22H2 (build 22621) | 11 Big Sur |
| Transparencias | *Configuracion > Personalizacion > Colores* | *Ajustes > Accesibilidad > Pantalla > Reducir transparencia*, **desactivado** |
| Prefs del cristal | `mods/appearance/acrylic-glass/prefs/windows.user.js` | `mods/appearance/acrylic-glass/prefs/macos.user.js` |

## La opcion de macOS que no esta en Ajustes

El material del cristal se elige con `zen.widget.macos.window-material` en
`about:config`, y no desde *Ajustes > Zen Mods*. No es un olvido: las opciones de
un mod solo pueden escribir prefs booleanas —un desplegable escribe un atributo
en el DOM y una cadena una variable CSS— y esto es un entero que lee codigo
nativo. Ninguno de los dos mecanismos llega hasta ahi.

Los siete valores salen del parche `VibrancyManager-mm.patch` de Zen:

| | Material | |
| --- | --- | --- |
| `1` | HUDWindow | el mas transparente, y el de fabrica de Zen |
| `2` | FullScreenUI | |
| `3` | Popover | |
| `4` | Menu | |
| `5` | ToolTip | |
| `6` | HeaderView | el punto intermedio comodo |
| `7` | UnderWindowBackground | el mas discreto |

No es una escala de opacidad aunque lo parezca: son materiales del sistema y cada
uno trae su propia mezcla de desenfoque, saturacion y tinte, que ademas cambia
con el modo claro/oscuro.

## Opciones

| Opcion | Que hace |
| --- | --- |
| **Intensidad del cristal** | `glass` (todo transparente), `balanced` (marco de cristal, contenido legible), `subtle` (solo un toque). |
| **Contenido web translucido** | Deja ver el cristal en las paginas que no pintan fondo propio. Apagalo si alguna web se ve rara. |
| **Difuminar menus y paneles** | Cristal tambien en menus contextuales y popups. |
| **Mantener el cristal sin foco** | Evita que la ventana se apague en gris al cambiar de aplicacion. |
| **Difuminar la pagina al buscar** | El buscador que sale con Ctrl+T (y con Ctrl+L) se planta en el centro con la pagina entera nitida detras. Con esto, mientras buscas la ventana se difumina y se apaga, y lo unico que se lee es lo que escribes. |
| **Modo rendimiento** | Quita los `backdrop-filter` y el truco de capas de `zen.theme.acrylic-elements`. Subelo si notas tirones al hacer scroll. |
| **Buscador flotante de YouTube** | Al pulsar el buscador, salta al centro de la ventana y difumina la pagina detras. Apagado, el buscador se queda en la barra como lo trae YouTube. |
| **Buscador flotante de YouTube Music** | Lo mismo dentro de la app de musica: en reposo vive en la barra —ahi si centrado de verdad, que de fabrica no lo esta— y al usarlo salta al centro con la pagina difuminada detras. Apagado, el buscador vuelve a ser el suyo. |
| **Opacidad / color / blur** | Ajuste fino. Dejalos vacios para que mande la intensidad. |

Los dos de YouTube son los unicos interruptores de este mod que **no**
actuan sobre el marco sino dentro de una pagina, asi que quien los lee no es
`chrome.css` sino la capa web (`mods\appearance\acrylic-glass\web\50-sites.css` -> `userContent.css`). El de
Ctrl+T no: ese buscador es de Zen, vive en el marco, y lo apaga el `chrome.css`
como el resto. Los de YouTube pueden hacerlo porque
userContent.css se carga como hoja de **usuario**, y a `-moz-pref` le basta con
que la hoja no sea de autor. El resto de tipos de opcion no llegan ahi: los
desplegables escriben un atributo en un `<div>` del marco y las cadenas una
variable en su raiz, y ninguna de las dos cosas existe dentro de la pagina.

## Variables para otros mods

Reutilizalas en lugar de colores fijos y la intensidad seguira mandando:

```css
--az-veil          /* velo del marco */
--az-content-veil  /* velo del area de contenido */
--az-panel-veil    /* velo de popups */
--az-scrim-veil    /* velo de ventana entera, el de buscar */
--az-hairline      /* borde de 1px sobre cristal */
--az-blur-e        /* radio de blur interno */
```

# Acrylic Zen

Cristal **real** del sistema en Zen Browser, sin herramientas externas y sin
tocar ninguna otra aplicacion.

En **Windows 11** es el acrilico de DWM que pone el mod
[Translucent Windows](https://windhawk.net/mods/translucent-windows) de
Undisputed00x, dentro de [Windhawk](https://windhawk.net) (ajustes en INSTALAR.md).
Medido el 16-11-2026 con `dev/tools/cristal.mjs`: el backdrop que Gecko pide por su
cuenta se queda en AUTO, asi que el acrilico que se ve es el de ese mod, y este
repo solo quita las capas opacas de Zen para que se vea.

En **macOS** es la vibrancy de Cocoa: una `NSVisualEffectView` que Gecko monta
solo, dentro del propio proceso. No hay nada que inyectar.

En macOS: cero procesos residentes, cero inyeccion, y un efecto que solo
afecta a Zen.

## Como funciona

Son tres piezas que se necesitan mutuamente. La primera cambia con el sistema;
las otras dos son las mismas en ambos.

**1. Las prefs** — hacen que el compositor dibuje cristal. `mods/appearance/acrylic-glass/prefs/` tiene las
comunes en `acrylic-zen.user.js` y las de cada motor aparte, porque una pref de
un sistema sencillamente no existe en el otro. El instalador lee la comun y le
superpone la de la plataforma donde corre.

**En Windows** (`mods/appearance/acrylic-glass/prefs/windows.user.js`) la clave es
`widget.windows.mica.toplevel-backdrop = 2`, que resulta ser el valor que Zen ya
trae de fabrica. Ojo con el numero, porque invita al error: esa pref **no es el
enum de `dwmapi.h`**, sino un indice interno de Gecko que se traduce antes de
llamar a DWM. Comprobado preguntandole a Windows con
`DwmGetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE)`:

| pref | Backdrop que aplica DWM | Que muestrea |
| --- | --- | --- |
| `2` | `DWMSBT_TRANSIENTWINDOW` (3), acrilico | lo que hay **detras de la ventana** |
| `3` | `DWMSBT_TABBEDWINDOW` (4), mica alt | **solo el fondo de escritorio** |

Escribir un `3` creyendo que es `DWMSBT_TRANSIENTWINDOW` se sale de rango y Gecko
cae a mica alt, que es peor que no tocar nada. Y como mica alt no mira las
ventanas de detras, sobre un escritorio de **color solido oscuro** da negro
plano: el sintoma es indistinguible de "el mod no funciona".

**En macOS** (`mods/appearance/acrylic-glass/prefs/macos.user.js`) no hay backdrop de ventana que encender: el
cristal aparece cuando Gecko encuentra `-moz-default-appearance: -moz-sidebar` en
un elemento, y Zen ya se lo pone a `#zen-browser-background`. Lo que se elige con
prefs es **que material** y **que muestrea**:

| pref | Que hace |
| --- | --- |
| `zen.widget.macos.window-material` | El material de la `NSVisualEffectView`, de 1 a 7 |
| `widget.macos.sidebar-blend-mode.behind-window` | Que muestree **detras de la ventana** y no su propio contenido |
| `widget.macos.titlebar-blend-mode.behind-window` | Lo mismo para la franja del titulo |

Los siete materiales salen del parche `VibrancyManager-mm.patch` de Zen y no son
una escala de opacidad aunque lo parezcan: cada uno es un material del sistema
con su propia mezcla de desenfoque, saturacion y tinte, y cambia con el modo
claro/oscuro. `1` (HUDWindow) es el mas transparente y el de fabrica de Zen; `6`
(HeaderView) es el punto intermedio comodo; `7` (UnderWindowBackground) el mas
discreto.

La trampa aqui es la de `behind-window`: sin ella hay efecto, pero muestrea el
contenido de la propia ventana en vez de lo que hay detras. Se ve un desenfoque
y no se ve el escritorio — el mismo genero de decepcion que mica alt en Windows.

Esa pref **no** esta en Ajustes > Zen Mods, y no por olvido: las opciones de un
mod solo pueden escribir prefs booleanas; los desplegables escriben un atributo
en el DOM y las cadenas una variable CSS, y ninguna de las dos cosas llega a un
entero que lee codigo nativo. Se cambia en `about:config`.

**2. El mod** (`mods/appearance/acrylic-glass/`) — deja que ese cristal se vea. Aqui las dos
plataformas vuelven a juntarse, y esa es la razon de que el CSS sea casi todo
compartido: con las prefs solas casi no se nota, porque Zen pinta encima las
**mismas** capas opacas en los dos sistemas.

| Capa | Valor por defecto |
| --- | --- |
| `#zen-browser-background::after` | `--zen-main-browser-background` (`#1b1b1b`) |
| `#zen-toolbar-background::after` | idem, en modo compacto |
| `#zen-main-app-wrapper` | `--zen-themed-toolbar-bg-transparent` |
| `browser[type="content"]` | `light-dark(#fff, rgb(32,32,32))` |

El mod las sustituye por velos translucidos parametrizados. El gradiente de
espacio de trabajo de Zen no se pierde: se conserva como tinte de color sobre el
cristal, respetando `--zen-background-opacity` para que el crossfade al cambiar
de espacio siga funcionando.

De las reglas del mod, solo dos se bifurcan por plataforma, y las dos por el
mismo motivo: en macOS `#zen-browser-background` **es** la vista de vibrancy.

- **El velo del marco se pinta con `box-shadow: inset`, no con
  `background-color`.** Un frame con `appearance` nativa no pinta el fondo del
  autor. Esta medido, no deducido: tres capturas de la ventana por caso, con un
  magenta opaco para que la diferencia no se confunda con el ruido del cristal
  —el acrilico muestrea lo que hay detras, asi que dos capturas nunca son
  identicas byte a byte, pero el tamano del PNG si es estable.

  | caso | PNG | |
  | --- | --- | --- |
  | sin nada | ~45,3 KB | control |
  | `background-color: #f0f` opaco | ~45,2 KB | **no pinta** |
  | `box-shadow: inset 0 0 0 100vmax #f0f` | ~51,9 KB | **si pinta** |

  Sin esto el desplegable "Intensidad" se quedaba a medias en macOS: movia el
  gradiente y el velo del contenido, pero el tinte del marco no se inmutaba.

- **Los popups entran por la rama del tinte, no por la de la emulacion.** En
  Windows eso pasa con `widget.windows.mica.popups`; en macOS pasa siempre,
  porque los menus y popovers de Cocoa ya traen vibrancy nativa. Anadirles
  `backdrop-filter` encima difumina por segunda vez y deja el panel lechoso.

Y una regla que **no** esta, a proposito: el mod nunca toca `appearance` de ese
elemento. Ponerle `appearance: none` apaga el cristal de toda la ventana.

Hay dos sitios donde el mod no quita capas sino que **anade** una, y los dos por
el mismo motivo: cuando dos cosas legibles quedan una encima de otra, con el
cristal puesto se leen las dos a la vez. Pasa al abrir el buscador con Ctrl+T y
al abrir un enlace en vista rapida (Glance). En los dos casos la pagina de
detras se difumina con `filter` sobre el `browser` —no con `backdrop-filter`,
que sobre una pagina sin fondo no tiene nada que fotografiar— y la de delante
recupera un velo lo bastante denso para tapar lo que quede. Se apagan por
separado desde *Ajustes > Zen Mods*.

**3. La capa web** (`web/*.css` → `<perfil>/chrome/userContent.css`) — hace que
las paginas dejen ver el cristal.

Con las dos piezas anteriores la ventana ya es de cristal, pero cada web sigue
tapandolo, porque una pagina es opaca al pintar **ella misma** su fondo
(`body { background: #fff }`). Eso vive dentro del documento, asi que ninguna
herramienta que actue sobre la ventana puede tocarlo: Mica For Everyone tampoco,
por mucho que se instale. La unica via es inyectar CSS dentro de la pagina.

`userContent.css` se carga como hoja de **origen usuario**, y en la cascada CSS
el `!important` de usuario le gana al `!important` del autor. Por eso no hacen
falta trucos de especificidad: la regla entra aunque el sitio insista. Necesita
`toolkit.legacyUserProfileCustomizations.stylesheets = true`, que instalan las
prefs.

### El limite de contraste, y como se gestiona

El cristal va tenido de oscuro. Un sitio que se pinta en claro tiene el texto en
negro: al quitarle el fondo blanco ese texto queda sobre el acrilico oscuro y
desaparece. No es un fallo del CSS sino contraste puro, y **no hay forma en CSS
de detectar si una pagina se esta renderizando clara u oscura**, asi que no se
puede decidir automaticamente.

Se ataca por dos lados:

1. Se fuerza `color-scheme: dark` en el documento y
   `layout.css.prefers-color-scheme.content-override = 0`. Con eso todo sitio
   que **sepa** pintarse oscuro lo hace, y esos quedan perfectos.
2. Los que no saben (Wikipedia sin cuenta, webs viejas) van a la lista de
   rescate de `mods/appearance/acrylic-glass/web/90-exclusions.css`, donde recuperan su fondo solido.
3. Y hay un tercero, que es Google Drive: sitios que **si** tienen tema oscuro,
   pero como ajuste **suyo**, no del navegador. Forzar no sirve, porque no
   escuchan al navegador; rescatar tampoco, porque no hace falta. Se enciende el
   suyo (en Drive: *Configuracion > Aspecto > Oscuro*) y a partir de ahi el CSS
   solo tiene que quitar fondos.

   Drive ademas ensena por que esto no se puede hacer a medias: sirve su tema
   oscuro en dos mitades, los tokens de color —que si se pueden forzar desde el
   `userContent.css`— y unas reglas de arreglo para sus componentes viejos que
   cuelgan de una clase de hash del `<body>`, que no. Forzando solo los tokens
   la pantalla principal queda perfecta y los menus viejos se quedan a medias.
   O esta encendido el oscuro del sitio, o el dominio vuelve a la lista de
   rescate. Esta contado entero en su bloque de `mods/appearance/acrylic-glass/web/50-sites.css`.

Si una web se te ve "vacia", con solo los enlaces visibles, es esto. Y como la
lista de rescate no puede adivinar la web a la que entraste hoy por primera vez,
hay un cuarto camino que no pasa por el CSS: **Zen Sin Cristal**, que pone un
interruptor en el menu del clic derecho. Clic derecho > *Ver ejemplo.com sin
cristal*, y esa web vuelve a verse como en un navegador normal, en el acto y sin
recargar. Se cuenta abajo, con los demas mods que no pintan nada.

Para dejarlo escrito en el repo —lo que conviene cuando ya sabes que un sitio
siempre se rompe— sigue siendo la lista de rescate. Anade su dominio y vuelve a
ejecutar el instalador:

```css
@-moz-document domain(ejemplo.com) {
  html { color-scheme: normal !important; }
  html, body { background-color: Canvas !important; }
}
```

## Los mods de este documento

Este documento nace con el cristal y detalla sobre todo los mods de apariencia.
La lista completa, con los cinco de YouTube Music, esta en
[`README.md`](../README.md).

El instalador copia todas las subcarpetas de `mods/<categoria>/` que tengan
`theme.json` **y que apliquen a tu sistema**, y cada una aparece por separado en
*Ajustes > Zen Mods*, con su propio interruptor y sus opciones. Se activan y
desactivan una a una sin desinstalar nada, y se anaden mods nuevos sin tocar el
instalador.

| Mod | Que hace | Donde |
| --- | --- | --- |
| **Acrylic Zen** | El cristal. Retira las capas opacas para que se vea el acrilico de DWM o la vibrancy de Cocoa. Es el unico que necesita las prefs. | Windows · macOS |
| **Zen Motion** | Movimiento y tipografia: buscador animado con los resultados en cascada, apertura de pestanas, micro-interacciones y Montserrat en la interfaz. | Windows · macOS |
| **Zen Claude Link** | Avisa de que hay un agente conectado a la sesion: una pastilla flotante con un punto que late, colocable en cualquier esquina. Sin nadie conectado no pinta nada. | Windows · macOS |
| **Zen Traffic Lights** | Minimizar, maximizar y cerrar como en macOS: tres circulos de color con el simbolo dentro solo al pasar el raton. | Windows |
| **Zen Web Apps** | Quita la barra lateral en las ventanas de aplicacion web, donde siempre esta vacia y en modo compacto asoma cada vez que el raton roza el borde. Desde Zen 1.22.2b necesita ademas una pieza nativa (`node installer/instalar-web-apps.mjs`): ver *Las ventanas de aplicacion web*. | Windows |
| **Zen Modo Oscuro** | Un modo oscuro de verdad para cualquier pagina, desde el clic derecho: *Activar modo oscuro*. Usa Dark Reader de motor y se aparta de las laminas claras de Shopify o Meta. Necesita su pieza nativa (`node installer/instalar-modo-oscuro.mjs`): ver *Y un cuarto: Zen Modo Oscuro*. | Windows · macOS |

Los seis son independientes; las opciones de cada uno estan en su `readme.md`.

**Que un mod no aplique no es que "no haga nada".** Zen Traffic Lights y
Zen Web Apps son de
Windows y en macOS se **omiten**, no se instalan apagados. Zen Traffic Lights
imita en Windows los semaforos que macOS ya trae de fabrica, y ahi el DOM
enganosamente coincide —los `<toolbarbutton class="titlebar-button">` existen en
las dos builds—, asi que instalarlo dibujaria un segundo juego de semaforos
encima del nativo, ligeramente descuadrado. Zen Web Apps cuelga de las Taskbar
Tabs, que son de Windows.

Lo declara cada `theme.json` con `plataformas`, y el CSS ademas se autogatea con
`@media not (-moz-platform: macos)`, por si la carpeta llega copiada a mano. El
instalador tambien **retira** un mod que no aplique si lo encuentra instalado de
antes, que es lo que pasa con un perfil sincronizado entre un PC y un Mac.

### Y uno que no es CSS: Zen Letra Viva

La letra corriendo con la cancion en YouTube Music, estilo Apple Music: relleno
palabra a palabra, escenario en lugar del video, pantalla completa y mini tira
sobre la barra. Vive en `mods/youtube-music/live-lyrics/` y **no** es un Zen Mod, porque no se puede: una
letra que corre necesita leer el reloj del reproductor y pintar sesenta veces por
segundo, o sea JavaScript dentro de la pagina.

Ni Apple Music ni Spotify calculan la sincronizacion — no hay analisis de audio.
Se traen la letra ya cronometrada y la comparan con `video.currentTime`. Lo que
YouTube Music no da son precisamente los tiempos: su letra es plana. Asi que este
mod los trae de LRCLIB, y opcionalmente de Musixmatch, y los hace cuadrar con la
pista de YouTube Music, que no siempre es la misma edicion del tema.

Y cuando no los tiene nadie, quedan **los subtitulos del propio YouTube**, que en
los videoclips y las subidas de usuario suelen estar y traen algo que ninguna base
de letras puede tener: los tiempos de la pista que suena, no los de otra edicion.
En los automaticos son ademas tiempos por palabra reales. Van los ultimos porque
ese texto sale de reconocer voz cantada y se equivoca, y una transcripcion que no
entendio el audio se descarta antes de ensenarla.

Y ya que esta dentro de la pagina, hace una cosa mas que no va de letra: **pone el
videoclip cuando la cancion lo tiene**. YouTube Music sirve el art track — el
audio del canal `- Topic` con la caratula fija — y para el video ofrece un
conmutador que hay que pulsar cancion por cancion; el mod lo pulsa. Se apaga en el
menu. Necesita la sesion iniciada: sin cuenta, YouTube Music bloquea ese
conmutador y no hay nada que hacer desde fuera.

Se instala de dos formas, con la misma pieza:

```bash
node installer/compilar-letra.mjs                 # arma mods/youtube-music/live-lyrics/dist/zen-letra-viva.user.js
node installer/instalar-letra.mjs             # sin extensiones (como administrador)
```

O arrastrando ese `.user.js` a un gestor de userscripts, si prefieres iterar
rapido. Todo lo demas — las cuatro vistas, los atajos, el ajuste de desfase, que
hacer si va desincronizada y como saber si YouTube Music cambio su DOM — esta en
[`mods/youtube-music/live-lyrics/readme.md`](mods/youtube-music/live-lyrics/readme.md).

### Y otro que tampoco pinta nada: Zen Sintonia

La pestana de YouTube Music le cuenta al widget de musica de OBS que suena, y
**nada mas del navegador puede colarse ahi**. Vive en `mods/youtube-music/obs-now-playing/`.

El motivo es de los que no se adivinan. El widget lee SMTC, la API de media de
Windows, y elige la sesion por aplicacion. **Chromium publica una sesion por
pestana**, asi que una PWA de YouTube Music sale con identidad propia y el
filtro acierta — por eso funcionaba en Arc. **Gecko publica una sola sesion para
todo el navegador**, la del ultimo que se puso a sonar, con la identidad del
ejecutable. El filtro no casa nunca, el widget se cae a su respaldo de
"cualquier cosa que suene", y en mitad del stream aparece la playlist que
acabas de abrir en otra pestana.

O sea que **el dato no existe fuera del navegador**: no hay regex que ajustar.
Se ve en vivo, poniendo musica y abriendo otra pestana con cualquier video:

```bash
.\dev\powershell\Sondear-Media.ps1 -Vigilar        # solo Windows: aqui no hay SMTC que sondear
```

Asi que el mod lo trae de donde si existe. Corre dentro de la pestana, lee
`navigator.mediaSession` — que es lo mismo que YouTube Music le da al navegador
para que Windows lo muestre — y lo empuja al widget desde el lado privilegiado,
que no pasa por CORS ni por la CSP de la pagina.

```bash
node installer/instalar-sintonia.mjs        # una vez; necesita escribir en la instalacion
node dev/tools/probar-sintonia.mjs            # 40 pruebas, sin navegador
```

**En macOS se instala y funciona, pero el motivo de arriba no existe.** El
problema es de SMTC, que es de Windows; el equivalente de macOS es
`MPNowPlayingInfoCenter` y los widgets de OBS para Mac no suelen leerlo. Lo que
si sigue valiendo es la solucion, porque no depende del sistema: el puente HTTP a
`127.0.0.1` es el mismo, y cualquier cosa que sepa leer ese endpoint funciona
igual. Lo que no se puede prometer alli es el widget, no el puente.

El resto — las tres decisiones de diseno, las prefs, y que mirar cuando el
widget no muestre nada — esta en [`mods/youtube-music/obs-now-playing/readme.md`](mods/youtube-music/obs-now-playing/readme.md).

### Y un tercero: Zen Sin Cristal, el interruptor por sitio

Apaga el acrilico en una web concreta desde el propio navegador. Clic derecho en
la pagina > **Zen Cristal > Ver ejemplo.com sin cristal**, y esa web recupera su
fondo. Vive en
[`mods/appearance/glass-toggle/`](mods/appearance/glass-toggle/readme.md).

Existe por el limite de contraste de mas arriba: la lista de rescate cubre los
sitios que ya conocemos, pero no la web a la que entras hoy por primera vez.

Lo interesante es **lo que NO hace**, porque marca la diferencia entre "volver al
fondo por defecto" y "taparlo con otro". No pinta nada: pone una marca en el
documento y las reglas del cristal dejan de casar, asi que la pagina recupera
**su** fondo —su color, su imagen, su degradado— y no un sustituto nuestro. Eso
no se puede hacer desde una regla que llegue despues, y conviene saber por que
antes de intentarlo: nuestras reglas viven en una hoja de **usuario** con
`!important`, y ahi `revert` retrocede al origen del **navegador**, saltandose
justo lo que se quiere recuperar. Un `Canvas` de sustituto, en una web que ya era
oscura, la dejaria blanca con su texto claro encima. Asi que la decision va en el
selector, antes: las reglas de `mods/appearance/acrylic-glass/web/00-base.css`, `10-wrappers.css` y
`20-aggressive.css` llevan una guarda que las apaga donde esta la marca.

```bash
node installer/instalar-sin-cristal.mjs     # una vez; necesita escribir en la instalacion
```

La lista vive en `zen.sincristal.sitios` y se puede editar a mano en
`about:config`. Un dominio cubre sus subdominios y no cruza sufijos, igual que el
`domain()` del CSS. Lo que se queda fuera —los 38 sitios con bloque propio en
`50-sites.css`, los iframes de terceros, las paginas sin dominio— esta en su
[readme](mods/appearance/glass-toggle/readme.md).

### Y un cuarto: Zen Modo Oscuro

Un modo oscuro de verdad para cualquier pagina, desde el mismo clic derecho: **Activar
modo oscuro (ejemplo.com)**. Existe por las webs que no saben ser oscuras. Shopify, el
Administrador de anuncios de Meta, el panel de Stripe o PayPal son interfaces de trabajo
pensadas solo en claro, y lo unico que la capa web podia hacerles era una lamina blanca
translucida sobre el cristal: legible, pero una mancha clara en un navegador oscuro. Vive
en [`mods/appearance/dark-mode/`](mods/appearance/dark-mode/readme.md).

El motor es [Dark Reader](https://darkreader.org/) (MIT), copiado tal cual. Se eligio
sobre un filtro `invert(1)` por lo que se nota: genera un tema —recalcula cada color, y
las variables CSS, que es como estan hechos Shopify y Meta— en vez de invertir la imagen,
asi que fotos y logos se quedan como estan y `backdrop-filter` sigue funcionando. Y con
el motor viene su base de arreglos por sitio (iconos, logos, degradados de Wikipedia o
Facebook), compilada a JSON al instalar.

Tres decisiones que conviene saber:

- **Con el modo oscuro puesto, la capa web se aparta.** Las laminas claras y los rescates
  de fondo blanco pintan con `!important` de usuario, que le gana al de Dark Reader: sin
  apartarse quedaria texto claro sobre lamina blanca. Llevan la guarda
  `:not(:where([zen-modo-oscuro]))`, de especificidad cero como la de Zen Sin Cristal, y
  `node dev/tools/probar-css.mjs` la exige.
- **El puente de red no es un fetch libre.** Dark Reader tiene que leer hojas de estilo
  de otros dominios, y la pagina no puede por CORS: lo hace el inyector con principal de
  sistema, y eso es justo lo que no se deja abierto. Solo https publico, solo `text/css`
  e `image/*`, sin cookies; nunca una IP, `localhost` ni la red local.
- **Con "oscurecer todas las paginas" solo se oscurecen las claras.** Dark Reader encima
  de una pagina ya oscura la empeora, asi que el inyector mide que parte de la ventana
  cubren superficies claras y opacas y solo enciende el motor a partir del 15%. Lo que
  esta en tu lista se oscurece siempre.

```bash
node installer/instalar-modo-oscuro.mjs     # una vez; necesita escribir en la instalacion
node installer/instalar.mjs                 # la entrada en Zen Mods y las guardas web
```

### Los botones de ventana

Esta seccion entera es de **Windows**. En macOS los semaforos los dibuja AppKit y
no hay nada que arreglar; lo que si hay es una opcion de Zen que quiza no
conozcas, `zen.widget.mac.mono-window-controls`, que los convierte en tres puntos
del color del titulo hasta que pasas el raton.

De fabrica salen como rectangulos porque en Windows Firefox no usa iconos para
esos tres botones: pinta el glifo con la tipografia `Segoe Fluent Icons` desde
la propiedad `content` del boton, y el boton estira a todo el alto de la barra,
asi que al apuntarlo se ilumina el rectangulo entero.

**Zen Traffic Lights** reaprovecha esa misma estructura sin tocar el DOM: el
`::before` deja de heredar el glifo y pasa a ser el circulo, y un `::after`
dibuja el simbolo con gradientes en lugar de con tipografia — que es lo unico
que funciona igual en Windows 10, donde `Segoe Fluent Icons` no existe.

Lo que **no** hace es moverlos a la izquierda, y no por pereza: Zen decide media
disposicion de la barra segun `isWindowsStyledButtons`, asi que forzar el lado
desde CSS deja la barra descuadrada. Eso ya lo trae resuelto Zen, en
`about:config`:

```
zen.view.experimental-force-window-controls-left = true
```

Tampoco toca `-moz-default-appearance` del boton de maximizar: es la marca por
la que Gecko le dice a Windows donde cae ese boton, y sin ella se pierde el menu
de **Snap Layouts** al posarse encima.

### Las ventanas de aplicacion web

Tambien de **Windows**. Las Taskbar Tabs son una funcion de la barra de tareas y
el boton que las instala solo aparece alli, aunque la pref exista en las tres
builds. En macOS `browser.taskbarTabs.enabled` se puede poner a `true` y no
pasara nada: por eso Zen Web Apps no se instala ahi en lugar de instalarse y
quedarse mudo.

Zen no tiene soporte propio de PWA, pero hereda de Firefox 143 las **Taskbar
Tabs**. En `about:config`:

```
browser.taskbarTabs.enabled = true
```

Con eso la barra de direcciones gana un boton *"Anadir a la barra de tareas"*
que instala la web como app, con su icono y su acceso directo. Lo que abre no es
una ventana especial: es el mismo `browser.xhtml` con un atributo en la raiz
(`taskbartab`), y Zen no lo trata distinto — su CSS no menciona `taskbartab` ni
una vez—, asi que le monta la barra lateral entera aunque ahi dentro las
pestanas, los essentials y los espacios ya vengan colapsados. **Zen Web Apps** la
retira; el `readme.md` del mod explica por que eso no te deja sin boton de
cerrar.

**Desde Zen 1.22.2b hace falta ademas una pieza nativa**, y conviene saber por
que, porque es el fallo mas dificil de ver que ha dado este repo. Zen cambio
`hidesTabsToolbar` para que mire solo `[popup-window]`
(`ZenUIManager.mjs:992`), y una ventana de app no es un popup: paso a montarse
con **barra unica**, o sea con la URL y los botones de ventana DENTRO del
toolbox. Ahi la guarda del mod hace lo que se escribio para que hiciera —
apartarse, para no dejar una ventana que no se puede cerrar— y la barra lateral
vuelve a verse. No se murio ningun selector: el contrato estatico daba los 124
enganches en verde.

```bash
node installer/instalar-web-apps.mjs        # una vez; necesita escribir en la instalacion
```

Lo que hace esa pieza es una sola cosa: redefinir `hidesTabsToolbar` a `true` en
las ventanas con `[taskbartab]`. Deshacer la disposicion la hace **Zen**, por su
propia rama de vuelta atras, que es la que usa cuando apagas la barra unica a
mano. Se apaga desde *Ajustes > Zen Mods > Zen Web Apps*, y una actualizacion de
Zen se la lleva por delante como a los otros mods nativos (`--solo-instalacion`
la vuelve a poner).

Dos detalles de estas ventanas que conviene tener a mano antes de escribir CSS
para ellas:

- la raiz **no** se llama `main-window`, sino `taskbartab-<uuid>`
- no se inyecta el `<div id="theme-...">` de las preferencias, asi que ahi solo
  funcionan las opciones leidas con `@media -moz-pref()`

### El agente conectado a la sesion

Chrome enseña una banda cuando un agente maneja el navegador. Zen no, pero **el
motor si lo sabe**: en `browser.js` vive `gRemoteControl`, suscrito a
`devtools-socket`, `marionette-listening` y `remote-listening`, y mientras haya
alguien escuchando pone `remotecontrol="true"` en la raiz del documento
(comprobado en Zen 1.21.9b / Gecko 153, `browser.js:3830`).

De ahi cuelga **Zen Claude Link** entero. No es una marca decorativa que se
enciende a mano: es el navegador declarando su propio estado, en vivo. Aparece
cuando el agente abre el canal y desaparece cuando lo cierra, sin que nadie
tenga que acordarse.

Lo que el atributo **no** dice es *quien* esta conectado: DevTools, Marionette y
el RemoteAgent ponen el mismo atributo, y el componente concreto solo llega al
`aria-label` del icono, fuera del alcance del CSS. Por eso la etiqueta de la
pastilla se elige en las opciones en vez de detectarse.

**Abrir el canal.** Con Zen cerrado:

```bash
node installer/enlace-claude.mjs
```

Tu Zen de siempre, tu perfil de siempre, mas el RemoteAgent escuchando. En
Gecko 153 **ya no queda CDP** —la carpeta `chrome/remote/content/cdp` no existe
en el `omni.ja` de esta build—, asi que aunque el flag se siga llamando
`--remote-debugging-port`, lo que levanta es **WebDriver BiDi**. Un cliente que
solo hable CDP no encontrara ni `/json/version`.

El script exige Zen cerrado, y no por manía: con Zen abierto la capa de remoting
de Gecko le pasa la linea de comandos a la instancia que ya corre, que se limita
a abrir una pestaña, y el proceso nuevo muere sin arrancar el agente. Acabarias
con Zen abierto, sin canal y sin indicador.

**Señalar lo que se ve raro.** La otra mitad. `dev/tools/senalar.js` arma un selector
en la pagina: pasas el raton, se ilumina lo que hay debajo, haces clic y sale el
informe con la regla `@-moz-document` ya escrita para pegar en `mods/appearance/acrylic-glass/web/50-sites.css`.

Lo que lo hace util no es iluminar —eso ya lo hace el inspector— sino que **no se
queda en el elemento que has pulsado: sube por los ancestros hasta el primero que
pinta de verdad**. Casi nunca coinciden, y ese desfase es literalmente el fallo
que se repite en el historial de este repo: la banda de ChatGPT estaba en un
ancestro, la fila de iconos del compositor de X era hermana y no descendiente.
Ademas mira las tres cosas que tapan sin ser un color —degradado,
`backdrop-filter` y `opacity` de un ancestro— y si el valor sale de un `var()`
propone atacar el token en lugar del selector, que sobrevive a los rediseños.

**Lo que esto abre.** Un puerto de depuracion da control del navegador a quien
pueda hablar con el: tus sesiones abiertas, tus cookies, tu historial. Queda en
`127.0.0.1` y no se toca `--remote-allow-hosts`, asi que no entra nadie desde la
red, pero cualquier proceso que corra como tu en esta maquina si. Es el mismo
trato que se acepta al automatizar Chrome, solo que aqui esta escrito. Se cierra
al cerrar Zen, y no hay ninguna pref persistente que lo deje abierto: si no
lanzas el script, no hay canal.

## Instalacion

Necesitas **Node.js** (cualquier version 18 o superior; no hay que instalar
ninguna dependencia, el repo no tiene `package.json` ni lo quiere). Cierra Zen
del todo y ejecuta:

```bash
node installer/instalar.mjs
```

El mismo comando en Windows y en macOS. El instalador detecta la plataforma,
detecta el perfil por defecto leyendo `profiles.ini` (respeta la seccion
`[Install...]`, que es la que manda cuando hay varios perfiles), guarda un backup
de `zen-themes.json`, `zen-themes.css`, `userContent.css`, `prefs.js` y `user.js`
en `<perfil>/acrylic-zen-backup/<fecha>/`, y luego copia los mods que apliquen,
los registra, recompila la hoja de mods, siembra los valores por defecto de sus
opciones y aplica las prefs de su plataforma.

Donde esta cada cosa:

| | Windows | macOS |
| --- | --- | --- |
| Perfil | `%APPDATA%\zen\Profiles\` | `~/Library/Application Support/zen/Profiles/` |
| Instalacion | `C:\Program Files\Zen Browser\` | `/Applications/Zen.app/Contents/Resources/` |

Lo de macOS tiene trampa y merece la pena decirlo: el directorio de instalacion a
efectos de Gecko es `Contents/Resources`, no `Contents/MacOS`, donde esta el
binario. Es lo que Gecko resuelve como `XCurProcD`, y contra eso se resuelven
`general.config.filename` y `defaults/pref`. Se reconoce porque ahi es donde
estan `application.ini` y los `omni.ja`. Solo importa para los mods nativos
(Letra Viva y Sintonia); el resto vive en el perfil.

Al abrir Zen: **Ajustes > Zen Mods > Acrylic Zen** para intensidad y tintes. En
macOS, el material del cristal no esta ahi sino en `about:config`
(`zen.widget.macos.window-material`), por lo que explica *Como funciona*.

**Los `.ps1` siguen en el repo** pero ya no son el camino documentado: hicieron
el trabajo hasta que hubo que correr en dos sistemas, y se conservan por si
alguien los tiene en un script. Las dos excepciones son de verdad Windows y no
tienen equivalente: `dev/powershell/Get-ZenBackdrop.ps1`, que le pregunta a DWM por el
backdrop de la ventana (`node dev/tools/cristal.mjs` lo llama por ti), y
`dev/powershell/Sondear-Media.ps1`, que lee SMTC.

### Por que hace falta un instalador y no basta con copiar la carpeta

Dos detalles de `ZenMods.mjs` hacen que un mod puesto a mano no llegue a
funcionar:

- **La hoja de mods no se regenera en el arranque.** Zen concatena todos los
  mods en `<perfil>/chrome/zen-themes.css` y al arrancar se limita a *insertar*
  ese archivo. Solo lo reescribe cuando algo toca la pref
  `zen.mods.updated-value-observer` (es decir, desde su propia interfaz) o tras
  la comprobacion periodica de actualizaciones. Registrar el mod en
  `zen-themes.json` no basta: hasta que no pasa una de esas dos cosas su CSS no
  se aplica. El instalador recompila el archivo replicando el formato de
  `nsZenMods.#writeStylesheet`.
- **Los valores por defecto de las opciones tampoco se siembran al arrancar.**
  `#setDefaults` solo corre dentro de esa misma regeneracion. Sin sembrarlos,
  las opciones de tipo checkbox quedan sin definir, que para `@media -moz-pref`
  equivale a `false`, y el mod arrancaria con la mitad de sus interruptores
  apagados. El instalador las escribe leyendo `preferences.json`.

Zen reordena y reescribe `prefs.js` al salir, y descarta las lineas cuyo valor
coincide con el de fabrica. Que desaparezcan las prefs clave es normal, y pasa en
los dos sistemas por el mismo motivo: ya venian puestas. En Windows son
`widget.windows.mica` (`true`) y `widget.windows.mica.toplevel-backdrop` (`2`);
en macOS, `zen.widget.macos.window-material` (`1`) y
`widget.macos.sidebar-blend-mode.behind-window` (`true`). No busques esas lineas
para comprobar si el cristal esta puesto — no van a estar. Preguntaselo al
sistema:

```bash
node dev/tools/cristal.mjs
```

Esa herramienta contesta cosas distintas segun donde corra, y conviene saberlo
antes de fiarse: en Windows le pregunta a DWM por la ventana y hay una respuesta
de verdad. **En macOS no hay equivalente** — no existe API publica para preguntar
desde fuera si una ventana ajena tiene vibrancy ni con que material—, asi que lo
que informa es lo que se PIDE: el material del perfil, el modo de muestreo, si
"Reducir transparencia" lo esta apagando y si la version de macOS da para tanto.
Eso cubre todas las causas de que no se vea cristal salvo una, que el CSS no
aplique, y esa se mide desde dentro con `node dev/tools/probar-vivo.mjs`.

### Opciones del instalador

| Flag | Efecto |
| --- | --- |
| `--perfil <ruta>` | Instalar en un perfil concreto en vez del de por defecto. |
| `--mods <lista>` | Instalar solo esos mods, por el nombre de su carpeta (`acrylic-glass,motion,…`). Los demas no se tocan. |
| `--idioma <es o en>` | Idioma de las opciones en *Ajustes > Zen Mods*; por defecto, el del sistema. |
| `--forzar` | Instalar tambien los mods que no aplican a esta plataforma. Para preparar un perfil desde otro sistema, no para uso normal. |
| `--bloquear` | Escribir las prefs en `user.js` en lugar de `prefs.js`. Se reaplican en cada arranque y about:config deja de poder cambiarlas de forma permanente. Por defecto se escriben en `prefs.js` para que sigan siendo editables a mano. |
| `--nivel-web <nivel>` | Cuanto se insiste en vaciar el fondo de las paginas. |

Niveles de `--nivel-web`:

| Nivel | Que vacia | Cuando usarlo |
| --- | --- | --- |
| `safe` | Solo `html` y `body`. | Si algo se ve raro y quieres el minimo riesgo. |
| `full` | + los contenedores raiz de frameworks (`#root`, `#__next`, `#app`…). **Por defecto.** | El equilibrio: cubre la mayoria de sitios sin tocar tarjetas ni paneles. |
| `aggressive` | + los primeros descendientes del `body` y los landmarks. | Maximo efecto. Es un cheque en blanco: si un sitio pone su tarjeta de contenido como `body > div`, esa tarjeta tambien se vacia. |
| `off` | Nada. Borra `userContent.css`. | Dejar solo el cristal de la ventana. |

El archivo se **genera** concatenando los parciales de `web/`, asi que el nivel
elige QUE parciales entran y se decide al instalar. Para cambiarlo, vuelve a
ejecutar el instalador con otro `--nivel-web`.

Que sea un archivo generado no quiere decir que la capa web sea inmovil: **si
puede leer las opciones de tipo checkbox de un mod**, porque son prefs y
`userContent.css` es hoja de usuario, que es todo lo que `-moz-pref` pide. Asi
funcionan los interruptores de los buscadores flotantes de YouTube y de YouTube
Music. Lo que no llega a la pagina son
los otros dos tipos de opcion —desplegables y cadenas— porque esos Zen los
escribe en el DOM del marco, que dentro del documento no existe.

### Si algo sale mal

Antes de desinstalar hay dos pasos menos drasticos.

**Apagar los mods sin borrar nada.** Existe porque el caso malo es justo el que
no te deja usar los interruptores de Zen: si un mod rompe la interfaz no puedes
llegar a *Ajustes > Zen Mods* para apagarlo. Esto se hace desde fuera, con Zen
cerrado:

```bash
node installer/apagar-mods.mjs                 # todos, de fabrica al arrancar
node installer/apagar-mods.mjs --encender         # volver a encenderlos
node installer/apagar-mods.mjs --encender --solo <id>   # uno a uno, para dar con el culpable
```

**Volver a un backup.** El instalador guarda copia de `zen-themes.json`,
`zen-themes.css`, `userContent.css`, `prefs.js` y `user.js` con fecha, mas un
`manifest.json` que dice con que version de Zen se hizo, que commit del repo,
que nivel de capa web y que prefs:

```bash
node installer/restaurar.mjs --lista
node installer/restaurar.mjs --sello 20260729-214204
```

Solo devuelve los archivos que hay en la copia. Si uno no estaba —porque antes no
existia— lo dice y lo deja como esta, en vez de borrarlo por deduccion.

### Desinstalar

```bash
node installer/desinstalar.mjs
```

Borra el mod, lo desregistra y quita las lineas `user_pref` que puso el
instalador, con lo que cada pref vuelve a su valor por defecto de Zen. Con
`--conservar-prefs` solo quita el CSS.

## Seguridad

Zen es un fork de Firefox mantenido por un equipo pequeno, y la duda razonable
es si eso te deja expuesto. Conviene separar dos cosas que suelen mezclarse.

**Un mod no puede blindar el navegador.** Los mods de este repo son CSS: pintan.
Las vulnerabilidades que importan —corrupcion de memoria en Gecko, escapes de
sandbox, fallos del JIT— viven en codigo C++/Rust dentro de `xul.dll`. Ningun
CSS, ningun `userChrome`, ninguna pref las parchea. Lo unico que las arregla es
la build nueva.

**El riesgo real no es "Zen es inseguro", es no saber si estas expuesto ahora.**
Mozilla publica el parche y el aviso a la vez, asi que entre el aviso y la build
de Zen hay un intervalo en el que el fallo es publico y tu binario todavia no lo
lleva. Ese intervalo no se ve desde `about:support`: te dice tu version, pero no
contra que compararla.

Medido sobre releases reales de julio de 2026, ese intervalo fue de **1 dia**
para el parche de emergencia de Firefox 152.0.6 (que salio con exploit publico)
y de **4 dias** para Firefox 153. No son semanas.

### Saber si estas expuesto

```bash
node dev/tools/exposicion.mjs
```

Cruza tres fuentes: la version de Gecko de tu `application.ini`, el
`product-details` de Mozilla y los avisos MFSA machine-readable del repositorio
oficial de advisories de Mozilla. Un aviso te afecta si arregla una version de
Firefox posterior a la tuya. No usa listas de terceros.

| Flag | Efecto |
| --- | --- |
| `--json` | Salida JSON para encadenarlo. |
| `--profundidad <n>` | Cuantos avisos revisar (20 por defecto, cubre meses). |
| `--suponer-gecko <ver>` | Calcula el informe como si tuvieras esa version. Sirve para comprobar que la alarma dispara. |

Codigos de salida: `0` al dia · `1` detras pero sin avisos pendientes · `2` con
CVE abiertos · `3` no se pudo determinar. Con eso se puede automatizar.

### Reducir superficie de ataque

```bash
node installer/blindar.mjs --nivel strict
```

No parchea nada; quita codigo del alcance de una pagina web, para que cuando
exista esa ventana de exposicion haya menos motor alcanzable.

| Nivel | Que apaga | Coste |
| --- | --- | --- |
| `balanced` | Rastreo en modo estricto, HTTPS obligatorio, prefetch, JavaScript y XFA en los PDF. **Por defecto.** | Ninguno perceptible. |
| `strict` | + JIT de JavaScript, asm.js y WebAssembly **para contenido web**, WebRTC. | Webs con mucho JS mas lentas; sin videollamadas; sin Figma ni Google Earth. |
| `paranoid` | + interprete baseline, regex nativo, WebGL, service workers. | Equivalente al "Safest" de Tor. Sin mapas 3D, juegos web ni modo offline. |

La pieza que hace `strict` asumible es `javascript.options.jit_trustedprincipals`:
apaga el JIT para las paginas y lo **deja encendido para el codigo privilegiado
del navegador**, asi que la interfaz de Zen sigue yendo fina. Solo surte efecto
si `ion` y `baselinejit` estan ambas en `false`; por eso las tres van juntas.
El JIT concentra alrededor del 45% de los CVE del motor de JavaScript.

Se instala aparte del acrilico a proposito: quien quiera el mod por estetica no
deberia quedarse sin JIT sin pedirlo. Tiene backup propio, `--bloquear` para escribir
en `user.js`, y `--revertir` para deshacerlo entero. Bajar de nivel limpia las prefs
del nivel anterior en vez de dejarlas puestas.

### Por que no se toca `privacy.resistFingerprinting`

Es la pref que todo el mundo recomienda y aqui seria contraproducente: fuerza
`prefers-color-scheme` a `light` por encima de
`layout.css.prefers-color-scheme.content-override`, que es justo la pref con la
que este mod mantiene las webs en oscuro. Con RFP activo, todas las paginas se
pintarian claras sobre cristal oscuro y el texto negro quedaria ilegible. Es una
decision de diseno de Mozilla, no un bug. Si la quieres, apaga antes la capa web
(`--nivel-web off`).

Tampoco se toca `security.sandbox.content.level`: en Windows ya viene en el nivel
mas alto que soporta la plataforma, y escribir un numero a ojo es tan facil que
lo baje como que lo suba.

## Estructura

```
mods/                      los mods, por categoria; cada carpeta con theme.json
                           se instala sola
  appearance/
    acrylic-glass/         el cristal de la ventana
      theme.json           manifiesto que se registra en zen-themes.json.
                           `plataformas` dice donde aplica; sin esa clave, en todas
      chrome.css           el CSS
      preferences.json     las opciones que salen en Ajustes > Zen Mods
      readme.md
      prefs/
        acrylic-zen.user.js  las prefs comunes a los dos sistemas
        windows.user.js      el backdrop de DWM: mica y acrilico
        macos.user.js        la vibrancy de Cocoa: material y modo de muestreo
      web/                 la capa de contenido, se concatena en userContent.css
        00-base.css        html/body + esquema oscuro forzado   (siempre)
        10-wrappers.css    contenedores raiz de frameworks      (nivel full)
        20-aggressive.css  descendientes del body               (nivel aggressive)
        45-emergentes.css  velo para los emergentes de cualquier sitio (siempre)
        50-sites.css       ajustes por sitio (@-moz-document)
        90-exclusions.css  lista de rescate y exclusiones       (siempre, la ultima)
        readme.md          el catalogo de los 38 sitios y como se anade uno;
                           las cinco primeras llevan la guarda de Zen Sin
                           Cristal, 90-exclusions no, y su cabecera dice por que
    motion/                movimiento y tipografia
    traffic-lights/        botones de ventana estilo macOS        (solo Windows)
    dark-mode/             el modo oscuro del clic derecho, con Dark Reader de motor
      nativo/proceso.js    inyector: arranca el motor, el puente de red, los arreglos
      nativo/ventana.js    la entrada "Activar modo oscuro" del clic derecho
      nativo/config-prefs.js  las prefs, y la lista de sitios
      motor/               Dark Reader 4.9.133 sin tocar, su licencia y su base de
                           arreglos por sitio (dynamic-theme-fixes.config)
    glass-toggle/          Zen Sin Cristal: apagar el acrilico en un sitio suelto
      nativo/proceso.js    marca los documentos del dominio apagado
      nativo/ventana.js    la entrada del clic derecho, una por ventana
      nativo/config-prefs.js  las prefs, y la lista de sitios
      readme.md
    immersive-web/         Zen Inmersivo: sustituto nativo de la extension Zen Internet
      nativo/              inyector, parte pura, servicio y ventanas
      catalogo/styles.json el catalogo de estilos de my-internet (667 webs)
      readme.md
  utilities/
    web-apps/              las ventanas de app web, sin barra lateral  (solo Windows)
      nativo/ventana.js    la unica mitad no-CSS: le dice a Zen que esa ventana
                           no usa barra unica
      nativo/config-prefs.js  las prefs del autoconfig, y su interruptor
    agent-indicator/       el indicador de agente conectado (Zen Claude Link)
    privacy-hardening/     blindaje, se acumulan por nivel; lo aplica blindar.mjs
      00-balanced.user.js  red, PDF y rastreo          (siempre)
      10-strict.user.js    JIT y wasm fuera del contenido web
      20-paranoid.user.js  WebGL, service workers, resto del JIT
  youtube-music/
    live-lyrics/           Zen Letra Viva (src/, dist/); su propio readme
    crossfade/             Zen Mezcla: fundido entre canciones; su propio readme
    phone-remote/          Zen Remoto: YouTube Music del PC desde el movil; movil/ y nativo/
    downloader/            Zen Descargas: boton Descargar en YouTube y YouTube Music
                           (el instalador deja yt-dlp en el bin/ del perfil); su readme
    obs-now-playing/       Zen Sintonia: la cancion de YouTube Music para el widget de OBS
      nativo/proceso.js    inyector + recolector + el puente hacia el widget
      nativo/config-prefs.js  las prefs que lo encienden, y el puerto
      readme.md
core/
  config.js                el cargador de autoconfig, COMPARTIDO por los mods nativos
                           (general.config.filename admite un archivo, no una lista)
installer/                   todo Node, el mismo comando en los dos sistemas
  menu.mjs                 el menu de Install.cmd / Install.command
  lib/zen.mjs              perfil, plataforma, prefs, recompilado de la hoja
  lib/nativo.mjs           donde van config.js y defaults/pref en cada sistema
  lib/zip.mjs              lector de zip para los omni.ja, sin dependencias
  lib/arreglos-oscuro.mjs  los arreglos propios de Dark Mode, con su medida
  instalar.mjs
  desinstalar.mjs
  restaurar.mjs            volver a un backup del instalador, por fecha
  apagar-mods.mjs          apagar los mods sin borrar nada (interruptor de panico)
  blindar.mjs              blindaje por niveles, con --revertir
  enlace-claude.mjs        arranca Zen con el canal de agente abierto
  compilar-letra.mjs       arma mods/youtube-music/live-lyrics/dist/zen-letra-viva.user.js
  instalar-letra.mjs       Zen Letra Viva sin extensiones (cargador nativo)
  instalar-sintonia.mjs    Zen Sintonia (cargador nativo, mismo config.js)
  instalar-sin-cristal.mjs Zen Sin Cristal (cargador nativo, mismo config.js)
  instalar-modo-oscuro.mjs Zen Modo Oscuro (cargador nativo, mismo config.js)
  instalar-mezcla.mjs      Zen Mezcla (cargador nativo, mismo config.js)
  instalar-remoto.mjs      Zen Remoto (cargador nativo, mismo config.js, con pieza en el padre)
  instalar-inmersivo.mjs   Zen Inmersivo (cargador nativo: paginas, padre y ventanas)
  instalar-descargas.mjs   Zen Descargas (cargador nativo; descarga yt-dlp y lo
                           verifica por SHA-256 antes de dejarlo en el perfil)
  instalar-web-apps.mjs    la pieza nativa de Zen Web Apps (mismo config.js; el
                           unico mod nativo sin inyector: no toca ninguna pagina)
dev/contract/              de que depende cada mod, en formato legible por maquina
  <mod>.json               un archivo por mod, mas instalador.json. Los enganches
                           llevan `plataformas` cuando solo existen en un motor
  baseline.json            estado validado en Windows
  baseline.macos.json      y en macOS: son distintos y no se pueden compartir
dev/tools/
  doctor.mjs               un solo comando: lo que se ejecuta cuando Zen se actualiza
  probar-contrato.mjs      si una build de Zen rompe algun mod, sin instalarla
  probar-zeninternet.mjs   si Zen Internet cambio su hoja en algun sitio del catalogo
  probar-vivo.mjs          sobre el Zen abierto: que los mods hacen efecto de verdad
  probar-css.mjs           comentarios rotos, llaves descuadradas y guardas que faltan
  probar-mensajes.mjs      mensajes de commit con un BOM delante del asunto
  paginas-nuevas.mjs       que sitios visitas y todavia no tienen bloque
  exposicion.mjs           CVEs conocidos sin parchear en tu build
  cristal.mjs              que dice el compositor: DWM en Windows, las prefs de
                           vibrancy en macOS, que es todo lo que se puede saber alli
  auditar-opacos.js        capas opacas que tapan el cristal
  senalar.js               senalar algo en una pagina y sacar el parche hecho
  zen-agente.mjs           manejar Zen desde fuera por el canal BiDi del RemoteAgent
  poner-guarda.mjs         la pasada unica que puso las guardas de Zen Sin Cristal
  probar-mezcla.mjs        contenedores, tiempos, reglas y curvas de Zen Mezcla, sin navegador
  probar-remoto.mjs        extractor, validacion, redes y QR de Zen Remoto, sin navegador
  probar-inmersivo.mjs     paridad de Zen Inmersivo con el motor de Zen Internet, en 1351 webs
  probar-sintonia.mjs      los dos lados del puente de Sintonia, sin navegador
  probar-descargas.mjs     validacion, ids, linea de yt-dlp y progreso de Zen Descargas
  probar-lrc.mjs           el conversor de LRC de Letra Viva
  probar-almacen.mjs       ajustes, desfase por cancion y cache de Letra Viva
  probar-reloj.mjs         el reloj de Letra Viva
dev/powershell/
  Get-ZenBackdrop.ps1      SOLO WINDOWS: le pregunta a DWM por el backdrop de la
                           ventana. Necesita P/Invoke; cristal.mjs lo llama por ti
  Sondear-Media.ps1        SOLO WINDOWS: que publica como "media que suena", y cual
                           cogeria el widget. La sonda que ensena por que hace falta
                           Sintonia. No hay equivalente en macOS: alli no hay SMTC
  resto de .ps1            los originales de Windows; ya no son el camino documentado
dev/MAINTENANCE.md         de que depende cada mod y que hacer cuando Zen se actualice
```

## Cuando Zen saque una version nueva

Una actualizacion de Zen no desinstala los mods —los archivos del perfil
sobreviven—, asi que el riesgo no es que desaparezcan: es que un selector
renombrado deje de aplicar **sin dar ningun error**.

```bash
node dev/tools/probar-contrato.mjs --ruta-zen "<carpeta de la build nueva>"   # antes de actualizar
node dev/tools/doctor.mjs                                                   # despues
```

El primero abre los `omni.ja` de una build que todavia no has instalado y dice si
te va a romper algo. El segundo lo revisa todo de una vez: perfil, mods
registrados, que el CSS instalado sea el del repo, que este dentro de la hoja
compilada, que las opciones esten sembradas, los enganches del contrato y los
CVE pendientes. `dev/MAINTENANCE.md` explica de que depende cada mod y que hacer
con cada resultado.

## Convivir con otro mod o plugin

Los mods se concatenan en `<perfil>/chrome/zen-themes.css` por orden de
instalacion, asi que **el ultimo en instalarse gana** cuando ambos usan
`!important` sobre el mismo selector. Si instalas otro mod despues y pierdes el
cristal, reinstala este.

Para que el otro mod herede la intensidad en lugar de pelearse con ella,
reutiliza sus variables (`--az-veil`, `--az-content-veil`, `--az-panel-veil`,
`--az-scrim-veil`, `--az-hairline`, `--az-blur-e`) en vez de colores fijos. La
seccion 10 de `chrome.css` documenta los puntos de enganche.

## Limitaciones

Comunes a los dos sistemas:

- El cristal difumina lo que hay **detras de la ventana**, no el escritorio
  completo. Sobre una ventana maximizada de otra app veras esa app difuminada, no
  el fondo de pantalla. Es asi por diseno en DWM y en Cocoa.
- Si el sistema tiene las transparencias apagadas, el mod se autodesactiva y Zen
  recupera su aspecto solido (`prefers-reduced-transparency`). Es deliberado: sin
  nada detras, el cristal se veria sobre negro.
- `zen.theme.acrylic-elements` tiene coste de repintado; los propios
  desarrolladores de Zen lo marcan como lento. Si notas tirones, activa el modo
  rendimiento del mod.

Solo en Windows:

- **Hace falta Windows 11 22H2+ (build 22621).** En Windows 10 no existe
  `DWMSBT_TRANSIENTWINDOW`; el mod se queda en un tinte plano.
- En las **ventanas de aplicacion web** la raiz no es `#main-window` sino
  `#taskbartab-<uuid>`. Hasta el 24-09-2026 eso dejaba el cristal a medias —sin
  la capa de brillo ni la regla de la ventana sin foco— y a Zen Motion sin
  Montserrat. Hoy las reglas de raiz de los dos mods nombran las dos formas,
  `:root:is(#main-window, [taskbartab])`. Lo que sigue sin llegar son los
  desplegables de los mods: ahi Zen no inyecta el `<div id="theme-...">`, y los
  presets de intensidad se quedan en el de fabrica.

Solo en macOS:

- **Hace falta macOS 11 Big Sur o superior**, que es donde `NSVisualEffectView`
  gana los materiales que usa Zen. Por debajo, el material se cae a uno plano.
- **"Reducir transparencia" no desmonta la vista, la pinta opaca.** Por eso la
  salvaguarda de accesibilidad es mas necesaria aqui que en Windows: sin ella no
  te quedarias sin cristal, te quedarias con una lamina gris encima.
- **El material no se puede poner en Ajustes > Zen Mods.** Un mod solo escribe
  prefs booleanas y esto es un entero que lee codigo nativo. Va en
  `about:config`.
- **No se puede medir el cristal desde fuera.** macOS no expone ninguna API
  publica para preguntar si una ventana ajena tiene vibrancy, asi que no hay
  equivalente de `DwmGetWindowAttribute`. `node dev/tools/cristal.mjs` informa de lo
  que se pide; lo que se obtiene se mide desde dentro, con
  `node dev/tools/probar-vivo.mjs`.
- **Los mods nativos rompen la firma del bundle.** Letra Viva y Sintonia escriben
  dentro de `Zen.app`, y eso invalida el sello de *hardened runtime*:
  `codesign --verify` pasa a fallar. La app sigue abriendo —Gatekeeper comprueba
  la firma la primera vez y esa ya esta aprobada— pero si macOS vuelve a
  preguntarte por permisos de microfono o pantalla, es por esto. Los mods de CSS
  no tocan el bundle y no tienen este problema.
- **Zen Sintonia funciona, pero su motivo no existe aqui.** El puente HTTP es el
  mismo; lo que no hay es el widget de OBS que lo consumia, que lee SMTC y es de
  Windows. Tienes el endpoint; lo que lo lea tiene que hablar HTTP.

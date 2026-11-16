# Zen Web Apps

Las ventanas de aplicacion web —las que se abren desde el acceso directo que
crea *"Anadir a la barra de tareas"*— sin la barra lateral de Zen.

> **Solo Windows.** Las Taskbar Tabs son una funcion de la barra de tareas y el
> boton que las instala solo aparece alli, aunque la pref
> `browser.taskbarTabs.enabled` exista tambien en la build de macOS. Ponerla a
> `true` en un Mac no hace nada.
>
> Este mod es, de los cinco, el unico que seria inofensivo instalar en cualquier
> sitio: todas sus reglas cuelgan de `:root[taskbartab]`, un atributo que sin
> Taskbar Tabs no existe nunca. Aun asi el instalador lo omite en macOS, porque
> un mod que aparece en *Ajustes > Zen Mods* con su interruptor y sus opciones y
> no puede hacer nada es peor que no estar: invita a encenderlo y a buscar por
> que no funciona.

## Se instala en dos pasos

Desde Zen 1.22.2b este mod tiene dos mitades y **hacen falta las dos**:

```bash
node installer/instalar.mjs              # el CSS, con los otros cuatro mods
node installer/instalar-web-apps.mjs     # la pieza nativa (pide administrador)
```

Una sin la otra no rompe nada, pero tampoco termina el trabajo:

| Lo que hay | Lo que ves en una ventana de app |
| --- | --- |
| Solo el CSS | La barra lateral sigue puesta. El CSS se aparta solo, a proposito — abajo esta el por que. |
| Solo la pieza nativa | La URL vuelve a su franja de arriba, pero la barra lateral vacia se queda: no hay ninguna regla que la quite. |
| Las dos | Lo que se buscaba: franja arriba, sin barra lateral. |

La pieza nativa escribe en el directorio de instalacion de Zen, asi que **una
actualizacion de Zen se la lleva por delante** (el CSS, que vive en el perfil,
sobrevive). Cuando pase:

```bash
node installer/instalar-web-apps.mjs --solo-instalacion
```

## El problema

Firefox 143 trajo las **Taskbar Tabs**: con `browser.taskbarTabs.enabled` en
`true`, la barra de direcciones gana un boton que instala la web como app. Lo
que se abre no es una ventana especial, es `browser.xhtml` con un atributo en la
raiz:

```html
<html id="taskbartab-<uuid>" taskbartab="<uuid>" ...>
```

Zen lo hereda de Firefox y **no lo trata distinto** — su CSS no menciona
`taskbartab` ni una vez—, asi que la ventana se monta con la barra lateral
completa. Solo que ahi dentro no queda nada que enseñar. Medido sobre una
ventana de app real en Zen 1.21.9b:

| Pieza | Estado en una ventana de app |
| --- | --- |
| `#TabsToolbar` / `#tabbrowser-tabs` | `visibility: collapse` — los colapsa `TaskbarTabsChrome.init` llamando a `TabBarVisibility.update` |
| `.zen-essentials-container` | `visibility: collapse` |
| Espacios de trabajo | no se montan: `ZenSpaceManager` se salta las ventanas con `taskbartab` |
| `#titlebar` | `visibility: hidden` en modo compacto |

Un panel vacio de 207px. Y en modo compacto, un panel vacio que vuelve a asomar
sobre la app cada vez que el raton roza el borde de la pantalla.

## Lo que cambio en Zen 1.22.2b, y por que el mod se quedo sin efecto

Merece la pena contarlo entero porque es el modo de fallo mas dificil de ver de
todos: **no se murio ningun selector**. El verificador estatico daba los 124
enganches del repo en su sitio, el Doctor daba los cinco mods instalados y en la
hoja, y la barra lateral volvia a verse igual.

Lo que cambio fue una decision de Zen, medido sobre los `omni.ja` de la build:

```
ZenUIManager.mjs:992    hidesTabsToolbar = raiz.hasAttribute('popup-window')
browser-init.js:116     'popup-window' solo se pone si !window.toolbar.visible
```

Una ventana de app **no es un popup**, asi que dejo de contar como ventana "sin
barra de pestanas" y `isSingleToolbar` (`ZenUIManager.mjs:1323`) paso a salir
verdadero tambien ahi. A partir de ese momento Zen hace en las ventanas de app lo
mismo que en las normales:

| | Hasta 1.22.1b | Desde 1.22.2b |
| --- | --- | --- |
| `#nav-bar` | en `#zen-appcontent-navbar-container`, **fuera** del toolbox | `titlebar.parentNode.moveBefore(navBar, titlebar)`: **dentro** |
| Botones de ventana | en la franja de arriba | dentro del toolbox, en `#zen-sidebar-top-buttons` o en `#nav-bar` segun tu configuracion |
| Raiz | sin `zen-single-toolbar` | `zen-single-toolbar="true"` |

Y ahi la guarda del CSS hizo exactamente lo que se escribio para que hiciera:
**apartarse**. Con la URL y los botones de ventana dentro del toolbox, ocultarlo
habria dejado una ventana de app que no se puede cerrar.

O sea que el mod no fallo, se protegio. Lo que faltaba era decirle a Zen que esa
ventana no usa barra unica — que es lo que Zen mismo daba por hecho hasta la
build anterior.

## Que hace el mod

Dos cosas, una por mitad.

### La pieza nativa: devolver la franja de arriba

`mods/utilities/web-apps/nativo/ventana.js` corre una vez por ventana, con privilegios,
y en las ventanas normales sale en la primera linea. En las de app hace una sola
cosa: redefinir `hidesTabsToolbar` a `true`.

Es quirurgico, y las dos razones se comprobaron antes de escribir una linea de
codigo:

- es un **getter perezoso por ventana** (`ChromeUtils.defineLazyGetter`), o sea
  configurable y sin efecto en las demas ventanas;
- y se lee en **un unico sitio** de todo el arbol, dentro de `isSingleToolbar`.

A partir de ahi no hace nada mas: **deshacer la disposicion la hace Zen**. Con
`isSingleToolbar` falso, su `_updateEvent()` entra en la rama
`else if (this._hasSetSingleToolbar)`, devuelve `#nav-bar` a su contenedor de
arriba, quita `zen-single-toolbar` de la raiz y recoloca los botones de ventana.
Es el mismo camino que recorre cuando apagas la barra unica a mano: codigo suyo,
probado por ellos.

El atajo evidente —ponerle `popup-window` a la raiz— habria conseguido lo mismo
de paso y ademas habria apagado el modo compacto (`ZenCompactMode.mjs:168`),
cambiado la barra de titulo y la conducta de `LoginHelper`. Nada de eso lo ha
pedido nadie.

### El CSS: retirar la barra lateral

Tres propiedades sobre `#navigator-toolbox`, y cada una tapa un agujero
distinto:

| Propiedad | Para que |
| --- | --- |
| `visibility: collapse` | Lo mismo que usa Zen para las ventanas sin chrome. En flex saca la caja del reparto en lugar de dejar el hueco. |
| `opacity: 0` | La visibilidad **la puede revertir un descendiente**, y el modo compacto hace justo eso: al detectar hover le pone `visibility: visible` a `#titlebar`, que es hijo del toolbox. La opacidad se aplica al subarbol entero y no se puede deshacer desde dentro. |
| `pointer-events: none` | El revelado de compacto se engancha con `mouseover`/`mouseleave` sobre el propio toolbox (`ZenCompactMode.mjs`). Sin eventos no hay revelado. |

Queda una via mas, la geometrica: el manejador de `mouseleave` de la raiz mira
que borde de pantalla cruzo el raton y pone el atributo por coordenadas, sin
tocar el elemento. Ese sigue funcionando, pero solo mueve un panel con opacidad
cero: no se ve nada.

## Por que no te quedas sin boton de cerrar

Es la pregunta correcta, y desde 1.22.2b tiene dos respuestas encadenadas.

La primera es la pieza nativa: con la ventana montada sin barra unica, `#nav-bar`
—con la URL, los botones de navegacion y `.titlebar-buttonbox-container`— vuelve
a colgar de `#zen-appcontent-navbar-container`, arriba del contenido y **fuera**
del toolbox. Eso es lo que hace que ocultar la barra lateral no se lleve nada por
delante.

La segunda es la guarda, que sigue en su sitio y no se ha tocado:

```css
#navigator-toolbox:not(:has(.titlebar-buttonbox-container, #urlbar-container))
```

Si la pieza nativa no esta instalada, o Zen vuelve a cambiar de idea, el selector
deja de casar y el mod **se aparta solo** en lugar de dejarte una ventana que no
se puede cerrar. Ya paso una vez, y por eso se quedo la barra lateral puesta en
lugar de pasar algo peor.

Esa es tambien la comprobacion que vigila `node dev/tools/probar-vivo.mjs`: no le
basta con que los botones de ventana existan en el DOM —hay varias
`.titlebar-buttonbox-container` y casi todas estan vacias—, exige que haya una
**con caja** y que quede fuera de lo que el mod oculta.

## Opciones

En *Ajustes > Zen Mods > Zen Web Apps*.

| Opcion | Que hace |
| --- | --- |
| **Devolver la barra de direcciones a una franja arriba** | Encendida de fabrica. Es el interruptor de la pieza nativa; se nota sin reiniciar. Apagarla no es "quitar la barra lateral de otra forma": es volver a verla, porque la ventana vuelve a montarse con barra unica y la guarda del CSS se aparta. Si no has instalado la pieza nativa, esta opcion no hace nada. |
| **Ocultar el boton de modo compacto** | `#zen-sidebar-top-buttons` es un area personalizable que en estas ventanas acaba dentro de `#nav-bar`, y de fabrica lleva el interruptor de modo compacto — que sin barra lateral no tiene nada que alternar. Oculta el area entera, asi que si le has anadido otros botones tambien desapareceran **en las apps** (en el navegador normal siguen igual). Por eso viene apagada. |

## Dos trampas de estas ventanas

Valen para cualquier mod que quiera tocarlas, y ninguna es evidente hasta que se
mide:

- **La raiz no se llama `main-window`.** `browser-init.js` la renombra a
  `taskbartab-<uuid>`, asi que toda regla escrita contra `#main-window` se queda
  fuera. (Le pasaba a **Acrylic Zen** —su capa de brillo no llegaba a las
  ventanas de app— y a **Zen Motion**, que se quedaba sin Montserrat. Desde el
  24-09-2026 los dos escriben la raiz como `:root:is(#main-window, [taskbartab])`.)
- **No hay `<div id="theme-...">`.** Zen no inyecta ahi el elemento de
  preferencias del mod, asi que el truco de `:root:has(#theme-X[atributo])` que
  usan los otros mods del repo para sus desplegables no funciona. Lo que si
  funciona es `@media -moz-pref()`, que lee la pref directamente — por eso las
  opciones de este mod son las dos de tipo checkbox.

Y una tercera, que es la que ensena este mod entero:

- **Que el selector exista no quiere decir que la regla aplique.** Zen puede
  cambiar de conducta sin renombrar nada, y entonces un `:not(:has(...))`
  perfectamente vivo deja de casar. Ningun verificador de nombres puede ver eso;
  lo ve `node dev/tools/probar-vivo.mjs`, y solo si hay una ventana de app abierta
  mientras se ejecuta.

## Si no tienes ninguna app instalada

El mod no hace nada: todas sus reglas cuelgan de `:root[taskbartab]`, que solo
existe en esas ventanas. Para crear una:

1. `about:config` → `browser.taskbarTabs.enabled` = `true`
2. Reinicia Zen, abre la web y pulsa *"Anadir a la barra de tareas"* en la barra
   de direcciones.

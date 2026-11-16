# Zen Traffic Lights

Los botones de minimizar, maximizar y cerrar como los de macOS: tres circulos de
color, con el simbolo dentro solo al pasar el raton por el grupo.

> **Solo Windows y Linux.** En macOS los semaforos son los de verdad, dibujados
> por AppKit, y este mod es una imitacion suya. El instalador lo omite alli, y el
> CSS ademas se autogatea con `@media not (-moz-platform: macos)` por si la
> carpeta llega copiada a mano.
>
> No es una precaucion teorica: el DOM enganosamente coincide. Los
> `<toolbarbutton class="titlebar-button titlebar-close">` de `browser.xhtml`
> existen tambien en la build de macOS —medido: cuatro elementos— asi que los
> selectores casan y las reglas aplicarian. Lo que pasa es que ademas llevan
> `-moz-default-appearance: -moz-window-button-close`, con lo que el sistema
> pinta el circulo real debajo. El resultado no seria "no pasa nada", serian dos
> juegos de semaforos superpuestos y ligeramente descuadrados.
>
> Si lo que quieres en macOS es que los botones sean mas discretos, eso ya lo
> trae Zen: `zen.widget.mac.mono-window-controls` los convierte en tres puntos
> del color del titulo hasta que pasas el raton.

## Por que salen cuadrados de fabrica

En Windows, Firefox no usa iconos para estos botones. Pinta el glifo con la
tipografia `Segoe Fluent Icons` desde la propiedad `content` del boton y lo saca
en un `::before` con `content: inherit`. El boton lleva `padding: 8px 18px` y
estira a todo el alto de la barra, asi que al apuntarlo se ilumina un rectangulo
entero — el cuadrado que se ve.

Este mod reaprovecha esa misma estructura sin tocar el DOM:

| Pieza | Antes | Ahora |
| --- | --- | --- |
| `::before` | el glifo de Segoe | **el circulo de color** |
| `::after` | no existia | **el simbolo**, dibujado con gradientes |
| el boton | rectangulo iluminado al pasar | zona de click, sin fondo |

Los simbolos no son tipografia a proposito: `Segoe Fluent Icons` no existe en
Windows 10 y ninguna de las dos fuentes de iconos de Windows trae el aspa fina
ni los triangulos de macOS. Dibujados con gradientes escalan con el circulo y se
ven igual en cualquier maquina.

## Tres circulos, no cuatro

Maximizar y restaurar son **dos botones distintos** en el DOM, y Firefox enseña
uno u otro ocultando el que no toca:

```css
:root:not([sizemode="maximized"], [sizemode="fullscreen"]) .titlebar-restore,
:root:is([sizemode="maximized"], [sizemode="fullscreen"]) .titlebar-max {
  display: none;
}
```

Es lo que hace que el verde funcione como un solo boton que alterna: maximiza
cuando la ventana esta normal y restaura cuando esta maximizada. Por eso este
mod **no declara `display` en `.titlebar-button`**: un `display: flex !important`
ahi pisa ese `display: none` y salen los cuatro circulos a la vez. Tampoco hace
falta, porque en el UA sheet de XUL todo elemento ya es `display: flex` y
`toolbarbutton` ya viene centrado.

El simbolo del verde es el mismo en los dos estados, igual que en macOS: cambia
la funcion, no el dibujo. La variante con las puntas hacia dentro al estar
maximizada se probo y se descarto — girando los angulos rectos hacia el centro
los triangulos se tocan y se leen como una sola figura, y separarlos obliga a
hacerlos tan pequenos que a 12px ya no se ve hacia donde apuntan.

## Opciones

| Opcion | Que hace |
| --- | --- |
| **Tamano de los circulos** | `compacto` 10px, `mac` 12px (la medida real del sistema), `grande` 14px. Todo lo demas —simbolo, grosor del trazo, anillo— escala con el diametro. |
| **Orden de macOS** | Cerrar, minimizar, maximizar. Apagalo para conservar el orden de Windows y no cambiar de sitio el boton de cerrar. |
| **Simbolos siempre** | Sin esperar al raton. En macOS solo aparecen al entrar en el grupo. |
| **Apagar sin foco** | Los tres en gris cuando la ventana no esta activa, como en macOS. |
| **Colores / diametro / separacion** | Ajuste fino. Dejalos vacios para que mande el tamano. El simbolo se oscurece a partir del color del circulo, asi que un color a medida arrastra el suyo. |

## Ponerlos a la izquierda

Este mod no los mueve, y no es por pereza: Zen decide media disposicion de la
barra segun `isWindowsStyledButtons` (`ZenUIManager.mjs`), asi que forzar el lado
desde CSS deja la barra descuadrada. Zen ya lo trae resuelto — en `about:config`:

```
zen.view.experimental-force-window-controls-left = true
```

Con esa pref el grupo se va a la izquierda avisando a la logica de Zen, y con
este mod encima el resultado es el conjunto mac completo.

## Que no se toca, y por que

`-moz-default-appearance: -moz-window-button-maximize` se queda como esta. Es la
marca por la que Gecko le dice a Windows donde cae el boton de maximizar, y es
lo que hace que al posarse encima salga el menu de **Snap Layouts**. Cambiar la
forma del boton no rompe esa integracion; quitar esa propiedad si. Por lo mismo
el orden se cambia con `order` y no moviendo nodos: la deteccion se calcula
sobre la caja real del boton, este donde este.

Con **contraste alto** de Windows el mod se aparta entero y deja el aspecto
nativo. Firefox pinta ahi estos botones con los colores del sistema justo porque
el color por si solo no basta para distinguirlos, y tres circulos que solo se
diferencian por el tono son lo contrario de eso.

## Variables para otros mods

```css
--zl-close-e / --zl-min-e / --zl-max-e   /* color de cada circulo */
--zl-size-e                              /* diametro; el resto escala solo */
--zl-ring                                /* anillo del borde */
--zl-off                                 /* color con la ventana sin foco */
```

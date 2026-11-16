# Zen Claude Link

Saber, de un vistazo y en todo momento, si hay un agente conectado a esta sesion
del navegador. Una pastilla flotante con un punto que late, colocable en
cualquier esquina.

Sin nadie conectado el mod no pinta absolutamente nada.

## De donde sale el estado

Esta es la parte que importa: **el mod no inventa el estado, lo lee**.

Firefox ya publica si la sesion esta bajo control externo. En `browser.js` vive
`gRemoteControl`, suscrito a tres notificaciones del sistema, y cada vez que
salta una recalcula quien manda:

```js
getRemoteControlComponent() {
  if (DevToolsSocketStatus.hasSocketOpened({ excludeBrowserToolboxSockets: true }))
    return "DevTools";
  if (Marionette.running) return "Marionette";
  if (RemoteAgent.running) return "RemoteAgent";
  return null;
}
```

Si devuelve algo, pone `remotecontrol="true"` en la raiz del documento; si no,
lo quita. Comprobado en Zen 1.21.9b (Gecko 153), `browser.js:3830`.

O sea que `:root[remotecontrol]` es el navegador diciendo la verdad sobre su
propio estado, en vivo:

| Situacion | Que ves |
| --- | --- |
| Nadie conectado | Nada. Ni una regla casa. |
| Un agente abre el canal | Aparece la pastilla, sola |
| El agente cierra el canal | Desaparece, sola |
| Depurar Zen desde Zen (Browser Toolbox) | Nada — Firefox lo excluye a proposito |

Lo que el atributo **no** distingue es *quien* esta conectado: DevTools,
Marionette y el RemoteAgent ponen exactamente el mismo atributo. El componente
concreto solo llega al `aria-label` del icono del urlbar, no a un atributo que
el CSS pueda leer. Por eso la etiqueta de la pastilla se elige a mano en las
opciones en lugar de detectarse.

## Como se abre el canal

El indicador necesita que haya algo escuchando. Con Zen cerrado:

```bash
node installer/enlace-claude.mjs
```

Arranca tu Zen de siempre, con tu perfil, y ademas levanta el **WebDriver BiDi**
del RemoteAgent. Es lo que enciende el atributo y, a la vez, el canal por el que
un agente se engancha a la sesion.

Nota para quien venga de Chrome: en Gecko 153 **ya no hay CDP**. El
`--remote-debugging-port` sigue llamandose igual, pero lo que levanta es
WebDriver BiDi. Un cliente que solo hable CDP no encontrara ni `/json/version`.

## Donde se pinta, y por que ahi

Un mod es CSS: no puede crear elementos. La pastilla sale de los dos
pseudo-elementos de la raiz.

```
:root[remotecontrol]::before   EL PUNTO      caja propia, para que el latido sea
                                             un scale limpio y no deforme el texto
:root[remotecontrol]::after    LA PASTILLA   el rectangulo con la etiqueta
```

Tenia que ser la raiz. `position: fixed` se posiciona respecto a su bloque
contenedor, y **cualquier ancestro con `transform`, `filter`, `contain` o
`backdrop-filter` se convierte en ese bloque contenedor y se queda el anclaje**.
Zen pone `contain: content` en sus capas de fondo — es exactamente el problema
que obligo a Acrylic Zen a mover su brillo a `#main-window`— y el urlbar va
lleno de transiciones y de `popover`. Colgado de cualquiera de ellos, el
indicador habria quedado anclado a esa caja en vez de a la ventana.

La raiz no tiene ancestros, asi que nadie puede robarle el anclaje.

Se usa `:root` y no `#main-window` a proposito: en las **ventanas de aplicacion
web** la raiz se llama `taskbartab-<uuid>`, y toda regla escrita contra
`#main-window` se queda fuera. Con `:root` el indicador tambien sale ahi.

Las dos capas llevan `pointer-events: none`. No es cosmetica: un rectangulo fijo
encima del navegador que se comiese los clics seria un fallo grave.

## El punto va del lado de fuera

Mirando la pastilla se nota que el punto siempre queda hacia la esquina y el
texto hacia el centro de la ventana. No es una decision estetica, es la unica
que sale bien:

la pastilla crece con la etiqueta, asi que su anchura es desconocida. Si el
punto se anclase al borde **opuesto** al de la pastilla habria que saber de
antemano cuanto ocupa el texto para colocarlo. Anclando los dos al **mismo**
borde solo hay que sumar el padding, que es un valor conocido, y la etiqueta
puede medir lo que quiera.

## Opciones

| Opcion | Que hace |
| --- | --- |
| **Donde sale la pastilla** | Las cuatro esquinas, o `off` para dejar solo la marca del urlbar. Por defecto **abajo a la derecha**, que es la unica esquina que no se pelea con nada: arriba a la derecha estan los botones de ventana, arriba a la izquierda los botones de la barra lateral de Zen (el menu `...`, el desplegable de barra lateral y las flechas de navegacion), y abajo a la izquierda es donde Zen saca sus notificaciones. En los dos arriba la pastilla es translucida y esos botones se transparentan a traves: se puede usar, pero se ve sucio. |
| **Que pone** | `Claude`, `Claude Code`, `Sesion controlada`, o nada (solo el punto). |
| **Tamano** | Compacto, normal, grande. Todo lo demas —radio, hueco, separacion del borde— se deriva del preset, asi que no hay que ajustar nada mas. |
| **El punto late** | La onda que sale del punto. Se apaga sola con "reducir movimiento" del sistema. |
| **Sustituir el aviso rojo** | Ver abajo. Encendida de fabrica. |
| **Ocultar el robot** | Con la pastilla a la vista, el punto del urlbar es el mismo aviso dos veces. Lleva guarda: si la posicion es `off` **no** lo oculta, para no dejar la sesion sin ningun indicador. |
| **Anillo de la ventana** | Un borde de color en todo el perimetro. Es la senal mas dificil de ignorar y por eso mismo la mas invasiva; viene apagada. |
| **Color** | Vacio = el naranja de Claude (`#d97757`). Cambia el punto, la pastilla, el urlbar y el anillo de golpe. |
| **Separacion horizontal / vertical** | Ajuste fino con unidad (`24px`, `2em`…). Vacio = la del tamano elegido. |

## El poste de barbero rojo

De fabrica, el aviso de control remoto de Firefox es rayar el fondo del urlbar
entero:

```css
:root[remotecontrol] .urlbar-background {
  background-image: repeating-linear-gradient(-45deg,
    rgba(255,60,60,.25) 0 25px, rgba(175,0,0,.25) 25px 50px);
  background-attachment: fixed;
}
```

Sobre el chrome opaco de Firefox pasa. Sobre el cristal de Acrylic Zen es un
manchon rojo a rayas encima de justo lo que se queria transparente. La opcion
**Sustituir el aviso rojo** lo cambia por una linea del color del mod.

Lo que **no** se toca es el `animation: none !important` que Firefox pone en esa
misma regla: esta ahi para que el degradado no se desplace al abrir el panel de
resultados, y sin el vuelve el temblor.

Si prefieres el aviso ruidoso de fabrica —hay argumentos: es deliberadamente
feo para que no se te olvide que no estas solo en la sesion— apaga esa opcion y
deja el resto del mod.

## Las dos trampas conocidas

- **En las ventanas de aplicacion web no hay desplegables.** Zen no inyecta ahi
  el `<div id="theme-...">` de las preferencias, asi que posicion, etiqueta y
  tamano se quedan en sus valores por defecto. Los interruptores (latido,
  anillo, robot, aviso rojo) si funcionan: esos van por `@media -moz-pref()`,
  que lee la pref directamente. El indicador sale igual, solo que abajo a la
  derecha y poniendo "Claude".
- **Los popups tapan la pastilla.** Los paneles de Zen se pintan en el *top
  layer*, que siempre queda por encima de cualquier `z-index`. Es preferible a
  lo contrario: un indicador que tapase el menu abierto seria peor.

## Degradacion segura

Las reglas base son punto y pastilla abajo a la derecha con la etiqueta por
defecto, y no dependen de ninguna caracteristica privilegiada. Todo lo demas
cuelga de `:has(#theme-...)` o de `@media -moz-pref()`. Si esas piezas faltan
—y en las ventanas de app web la primera falta de verdad— las variantes se
descartan y queda el indicador por defecto. Nunca media pastilla, nunca una caja
sin pintar.

## Puntos de enganche

Para que otro mod herede la paleta en vez de pelearse con ella:

| Token | Que es |
| --- | --- |
| `--zc-color-e` | El color de todo el indicador |
| `--zc-dot` | Diametro del punto |
| `--zc-h` | Alto de la pastilla (el radio se deriva) |
| `--zc-x` / `--zc-y` | Separacion de los bordes de la ventana |

Y si escribes un mod que quiera pintar tambien en la raiz: los dos pseudos de
`:root` estan ocupados aqui, **pero solo bajo `[remotecontrol]`**. Fuera de una
sesion con agente conectado siguen libres.

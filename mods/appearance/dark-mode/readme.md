# Zen Modo Oscuro

Un modo oscuro de verdad para cualquier pagina. Clic derecho en la web >
**Activar modo oscuro (ejemplo.com)**, y esa web se ve oscura: sin recargar, y
recordando el sitio para la proxima vez.

Existe por las paginas que no saben ser oscuras. Shopify, el Administrador de
anuncios de Meta, el panel de Stripe o PayPal son interfaces de trabajo
pensadas solo en claro, y sobre el cristal de Acrylic Zen la unica opcion que
la capa web tenia era darles una lamina blanca translucida: legible, pero una
mancha clara en un navegador oscuro. Esto les da el tema oscuro que no traen.

## Que hace

```
clic derecho > Activar modo oscuro    ventana.js escribe zen.modooscuro.sitios
        |
        v
pref replicada a los procesos          Gecko, solo
        |
        v
proceso.js arranca el motor            Dark Reader, dentro de la pagina
        |                              y pone <html zen-modo-oscuro>
        v
la capa web se aparta                  las laminas claras y los rescates con
                                       fondo blanco dejan de aplicar
```

Tres piezas y una direccion, igual que Zen Sin Cristal, y con el mismo cargador.

## El motor: Dark Reader

[Dark Reader](https://darkreader.org/) 4.9.133, MIT, copiado tal cual en
`motor/darkreader.js`. Se eligio sobre un filtro `invert(1) hue-rotate(180deg)`,
que es lo que haria un mod de veinte lineas, por tres motivos que se notan:

- **Genera un tema, no invierte una imagen.** Recorre las hojas de estilo y
  recalcula cada color —y las variables CSS, que es como esta hecho Shopify
  (Polaris) y Meta—, asi que las fotos, los videos y los logos se quedan como
  estan. Con `invert()` hay que reinvertirlos uno a uno y siempre se escapa alguno.
- **No rompe el cristal.** Un `filter` en `<html>` apaga `backdrop-filter` en todo
  el arbol. Aqui la pagina conserva su fondo vacio sobre el acrilico y solo se
  oscurecen sus superficies.
- **Las paginas que ya son oscuras no se tocan.** Lo detecta el motor.

Lo que **no** hace bien, y conviene saberlo: una imagen de fondo clara que la
pagina pone con un `style` en linea (el heroe de algunas portadas de Meta) se
queda clara, y su titular sale gris sobre ella. Es una limitacion del propio
Dark Reader, medida igual con el motor suelto en la pagina. Las aplicaciones —el
panel de Shopify, el Administrador de anuncios— estan hechas con componentes y
variables, que es lo que el motor procesa bien.

## Instalar

```
node installer/instalar-modo-oscuro.mjs     el inyector, el menu y el motor
node installer/instalar.mjs                 la entrada en Zen Mods y las guardas web
```

La primera necesita escribir en el directorio de instalacion de Zen (en Windows,
`C:\Program Files\Zen Browser`, que pide elevar), porque ahi va el cargador de
autoconfig, compartido con Letra Viva, Sintonia, Sin Cristal y Web Apps. Reinicia
Zen del todo despues. Para quitarlo: `node installer/instalar-modo-oscuro.mjs --desinstalar`.

## Lo que se guarda (about:config)

| Pref | Que es |
| --- | --- |
| `zen.modooscuro.sitios` | la lista, separada por comas. Se escribe sola; es texto normal y se puede editar a mano. Un dominio cubre sus subdominios y no cruza sufijos |
| `zen.modooscuro.encendido` | el interruptor general. En `false` se esconde la entrada y nada se oscurece, sin vaciar la lista. Tambien en Zen Mods |
| `zen.modooscuro.todo` | oscurecer todas las paginas http(s). Tambien en Zen Mods |
| `zen.modooscuro.brillo`, `.contraste`, `.sepia` | ajustes del motor, enteros (100, 100 y 0 de fabrica) |
| `zen.modooscuro.depurar` | vuelca a la consola del navegador lo que el motor no pudo leer |

## El puente de red

Dark Reader necesita leer hojas de estilo e imagenes de otros dominios, y la pagina
no puede por CORS. Lo hace `nativo/proceso.js` con principal de sistema, y eso es
justo lo que no se deja abierto: una pagina que pudiera pedir cualquier URL por ahi
leeria cosas de la red interna del usuario. El puente aplica la misma politica que
Dark Reader aplica a sus propias peticiones, y alguna mas:

- solo `https`, solo el puerto por defecto, y nunca una IP, `localhost`, un host sin
  punto ni de red local (`.local`, `.internal`, `.lan`...);
- solo contesta `text/css` e `image/*`, y lo demas se rechaza **entero**;
- sin cookies, con tope de tamano.

## Limites conocidos

- **Iframes de otro proceso.** Una aplicacion embebida (Shopify mete las apps en
  iframes de otro dominio) se oscurece con la pagina que la rodea si el documento de
  arriba se puede leer desde el proceso del iframe; si vive en otro proceso, se usa el
  dominio del propio iframe y puede quedarse clara.
- **Imagenes de fondo claras en estilos en linea**, arriba.
- **Cuesta CPU** en paginas enormes: el motor analiza sus hojas de estilo. Con
  `zen.modooscuro.todo` se paga en todas.
- **Una actualizacion de Zen** se lleva el cargador del directorio de instalacion:
  `node installer/instalar-modo-oscuro.mjs --solo-instalacion`.

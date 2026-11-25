# La capa web

Los seis archivos de esta carpeta se concatenan en un solo
`<perfil>\chrome\userContent.css`, que Gecko carga como hoja de **origen
usuario**. Ese origen es toda la gracia: en la cascada CSS el `!important` de
usuario le gana al `!important` del autor, asi que la regla entra aunque el sitio
insista, y ademas es el unico sitio donde `@-moz-document` esta permitido.

El archivo lo genera `installer/instalar.mjs`. **Editar el del perfil no sirve de
nada**: se reescribe entero en cada instalacion. Se editan los parciales de aqui
y se vuelve a ejecutar el instalador.

| Archivo | Cuando entra | Que hace |
| --- | --- | --- |
| `00-base.css` | siempre | vacia `background-color` de `html` y `body`, fuerza `color-scheme: dark` |
| `10-wrappers.css` | nivel `full` (por defecto) | vacia los nodos de montaje de framework (`#root`, `#__next`, `#app`…) |
| `20-aggressive.css` | nivel `aggressive` | vacia los primeros descendientes del `body`. Es un cheque en blanco |
| `45-emergentes.css` | siempre | velo para menus, dialogos y tooltips que el sitio dejo transparentes |
| `50-sites.css` | siempre | los 37 bloques medidos a mano, uno por sitio |
| `90-exclusions.css` | siempre, **la ultima** | devuelve el fondo solido donde el cristal no funciona |

El orden es la arquitectura: entre reglas de la misma hoja y la misma
especificidad gana la ultima, y por eso `90-exclusions.css` puede rescatar un
sitio pase lo que pase antes.

## Buscador de YouTube

El buscador flotante de Acrylic Zen usa el mismo acabado translucido en el
campo, la lupa, el microfono y el panel de sugerencias: tinte oscuro al 24%,
brillo tenue y bordes claros. Los textos y las miniaturas conservan su opacidad.
El contenido de la pagina se difumina al enfocar el buscador; no se aplica
`backdrop-filter` al panel porque sobre el lienzo transparente de Gecko puede
pintar negro.

El ajuste vive en el bloque de YouTube de `50-sites.css` y entra con el
instalador habitual. Respeta **Zen Sin Cristal** y mantiene el interruptor
**Buscador flotante de YouTube** de Acrylic Zen. Tras instalar, reinicia Zen
para cargar la nueva hoja de usuario.

## La guarda, que es lo primero que hay que saber

Las **cuatro primeras** capas llevan en cada selector la guarda de
[Zen Sin Cristal](../sin-cristal/readme.md), que es lo que hace que el clic
derecho > *Zen Cristal > Ver este sitio sin cristal* apague de verdad el cristal
en un sitio.
`90-exclusions.css` no la lleva, y no es un olvido: sus reglas devuelven el fondo
solido, que es justo lo que el interruptor quiere.

Hay tres formas y **no son intercambiables**:

```css
html:not(:where([zen-sin-cristal]))               /* el selector ES html */
:where(html:not([zen-sin-cristal])) .lo-que-sea   /* lo normal: un descendiente */
html.clase-de-tema:not(:where([zen-sin-cristal])) /* la clase VIVE en html */
```

Las tres cuestan **cero de especificidad**, y eso es deliberado: si subieran, los
bloques por sitio empezarian a ganarle a `90-exclusions.css` y se caerian los
rescates condicionales de Google y de los wikis.

El tercer caso es el que muerde. Si el primer compuesto es una clase que el sitio
pone en el propio `<html>` —una clase de tema, tipico— la forma del prefijo pide
esa clase DENTRO de html, y html no es descendiente de si mismo: la regla deja de
casar **entera y en silencio**. Paso con Spotify el 12-09-2026.

Lo vigila `node dev/tools/probar-css.mjs`, que falla si una regla se queda sin guarda.
Selector por selector, no regla por regla: una lista de seis donde solo cinco la
llevan tambien falla.

## La segunda guarda: `zen-modo-oscuro`

Las reglas que **fuerzan el claro a proposito** —la lamina blanca de Shopify y Meta en
`50-sites.css`, los rescates de fondo `Canvas` de `90-exclusions.css`— llevan ademas
`:not(:where([zen-modo-oscuro]))`. Es el atributo que pone
[Zen Modo Oscuro](../mod/zen-modo-oscuro/readme.md) cuando oscurece una pagina: con el
motor puesto, esas reglas tienen que apartarse, porque pintan con `!important` de
usuario y le ganan al `!important` de Dark Reader. Sin apartarse queda texto claro sobre
una lamina blanca. El sitio cae entonces a la capa base, o sea fondo vacio sobre el
cristal, y lo demas lo hace el motor.

`node dev/tools/probar-css.mjs` la exige: toda regla con `color-scheme: normal` o un fondo
`Canvas` que no viva dentro de un `@-moz-document` de `about:`, `resource:` o
`view-source:` (donde el motor no corre) tiene que nombrarla en cada selector.

## Como se anade un sitio

1. Abrelo en Zen y pega `dev/tools/auditar-opacos.js` en la consola (F12). Te dice
   que sigue tapando, de que tamano y de que regla sale el color.
2. Ataca en este orden de preferencia:
   1. **El token del sistema de diseno** (`--bgColor-default`,
      `--edge-color-surface-bg-lowest`). Es lo mas estable: los nombres de clase
      cambian cada semana, los tokens casi nunca, y ademas el sitio sigue
      calculando sus contrastes solo.
   2. **El elemento**, cuando el token esta hasheado y no se puede nombrar.
   3. **La clase utilitaria**, en sitios tipo Tailwind que no exponen tokens.
3. **Nunca** se targetean clases con hash de build (`.cRMumF`, `.RNNXgb`): duran
   una semana.
4. Ponle la guarda a cada selector.
5. `node dev/tools/probar-css.mjs`, `node installer/instalar.mjs`, **reinicia Zen** y
   vuelve a medir. La hoja de usuario se lee al arrancar: sin reiniciar estas
   mirando la anterior.

Dos trampas que ya costaron una tarde cada una, las dos anotadas en su bloque:

- **Un token puesto en `html, body` no llega si un envoltorio intermedio lo
  vuelve a declarar.** La herencia no atraviesa una declaracion propia, venga del
  origen que venga. Paso en Drive (`#drive-main-page`) y en Discord
  (`.theme-dark`). Se ve recorriendo la cadena de ancestros y leyendo el token en
  cada nivel.
- **`backdrop-filter` sale NEGRO** sobre una pagina que hemos vuelto
  transparente: no hay nada pintado detras que muestrear, y Gecko compone ese
  vacio en negro. Si un sitio te sale con rectangulos negros, apagalo en su
  bloque. La receta esta en `00-base.css`.

Y una regla de medicion: **cualquier comprobacion de `backdrop-filter`, `filter`,
`mix-blend-mode` o del acrilico se valida con captura de ESCRITORIO**, nunca con
la del protocolo. `browsingContext.captureScreenshot` de WebDriver BiDi no pinta
`backdrop-filter`, y esa medida mal hecha ya hizo descartar el blur de Kick una vez.

## El catalogo

Auditado entero el **12-09-2026** contra Zen 1.22b (Gecko 155.0.1), con las
sesiones del perfil abiertas. Repasado el **17-09-2026** contra Zen 1.22.2b
(Gecko 156.0) al anadir Google Docs y Supabase y al medir la franja de Google. Y el **24-09-2026**
contra Zen 1.22.3b (Gecko 156.0.1), con un barrido de las 126 paginas mas visitadas
del historial medidas dos veces, con la hoja de Zen Internet y sin ella: de ahi
salen los seis sitios nuevos, los rescates y los arreglos de ChatGPT, Speedtest, X
y YouTube Music. «Area opaca» son miles de px² sumados de todo lo
que mide mas de 150x40 y tapa de verdad.

| Sitio | Linea | Metodo | Area opaca | Estado |
| --- | --- | --- | --- | --- |
| `youtube.com` | 47 | tokens `--yt-sys-color-*` + elementos | 8706k | ok — lo que queda son miniaturas, ripples y el scrim del cajon |
| `music.youtube.com` | 784 | tokens `--ytmusic-*` | 5256k | ok — ripples y overlays ya transparentes; desde el 24-09 la cola del reproductor va sin el blur que le pone Zen Internet, que salia negro |
| `twitch.tv` | 1280 | 4 tokens | 1826k | ok — lo que queda son tarjetas de contenido |
| `github.com` | 1294 | tokens `--bgColor-*` | **0** | ok, limpio |
| `kick.com` | 1361 | token `--edge-color-surface-bg-lowest` | — | **reescrito el 12-09**: habian renombrado la escala entera. Falta la confirmacion visual, que Cloudflare no dejo tomar |
| `google.com` | 1493 | ids estables | 204k | **arreglado el 17-09**: la franja pegajosa de arriba, que la auditoria anterior no vio porque se hizo sin desplazar la pagina |
| `mail.google.com` | 1568 | clases ofuscadas, a medias | 4040k | a medias **a proposito**: Gmail esta en tema claro y vaciar `.nH` lo deja sin texto |
| `drive.google.com` | 1625 | tokens `--dt-*` + `--gm3-*` | 4075k | **arreglado el 12-09**: metieron `#drive-main-page`, que re-declara la paleta |
| `docs.google.com/document/` | 1720 | ids del armazon del editor | 3060k | parcial **a proposito**: solo el margen del folio. Docs no tiene modo oscuro en la web y su interfaz va en texto casi negro |
| `x.com` / `twitter.com` | 1754 | `data-testid` + `:has()` | 44k | ok — desde el 24-09 sin la barra negra de arriba (blur sobre vacio) |
| `primevideo.com` | 1902 | CSS Modules (`_Magnet__wrapper`) | 555k | parcial: el `nav` y la caja de busqueda siguen opacos. Sin sesion Prime no se ve la app de verdad |
| `shopify.dev` | 1945 | CSS Modules | **0** | ok, limpio |
| `shopify.com` | 3573 | tokens Polaris `--p-color-bg-*` | 6277k | **nuevo el 17-09**: sale de las exclusiones y pasa a lamina clara al 72 por ciento. El panel es una herramienta entera en claro y no tiene modo oscuro que encender |
| `facebook.com` (+ Business Suite y anuncios) | 3623 | tokens `--card-background` y compania | 2377k | **nuevo el 17-09**: lamina clara. Sus clases son CSS atomico con hash y no se pueden nombrar; sus tokens si |
| `leetify.com` | 2008 | elementos de componente Angular | 400k | parcial **a proposito**: solo la portada |
| `accounts.google.com` | 2085 | tokens `--gm3-sys-color-*` | — | no comprobado: con la sesion abierta redirige a `myaccount`, que es otro sitio |
| `speedtest.net` | 2168 | 4 tokens MUI + la barra | **0** | **arreglado el 24-09**: se rediseno y un contenedor nuevo pintado con `--mui-palette-custom-primary` tapaba el 100% |
| `modrinth.com` | 2230 | tokens bajo `html.dark-mode` | 15362k | ok — el grueso es el `pride-backdrop`, que es un degradado de contenido |
| `claude.ai` | 2294 | tokens `--cds-*` | 3537k | ok — es una capa `pointer-events-none` ya transparente |
| `steamcommunity.com` / `steampowered.com` | 2373 | token `--page-background` + velos | **0** | ok, limpio |
| `supabase.com` | 3499 | clases de su escala de superficies | 7816k | ok — lo que queda son tres degradados de contenido |
| `spotify.com` | 2463 | tokens bajo `html.encore-dark-theme` | 2492k | **arreglado el 12-09** (la guarda lo habia matado). Queda la barra del reproductor, ver abajo |
| Codebase Memory (`127.0.0.1:9749`) | 2585 | utilidades Tailwind v4 | ~0 | ok — lo que contaba el auditor eran velos del 2%, y ese fallo de medida se arreglo el 12-09 |
| `reddit.com` | 2796 | 14 tokens `--color-neutral-background-*` | 6933k | ok — el grueso son imagenes de lightbox |
| `chatgpt.com` | 2848 | ~19 tokens + los del frontend nuevo (`--color-surface-*`) | **0** | **arreglado el 24-09**: ChatGPT sirve por sesion un frontend reescrito que salia con la barra, el compositor y el pie en negro, y sus menus salian transparentes. La hoja de Zen Internet va apagada en este dominio: el bloque es la unica fuente |
| `studio.youtube.com` | 1262 | `--ytcp-brand-background-solid` dentro de `#main` + elementos | **0** | **nuevo el 24-09**: de 85% a 0. Solo con `html[dark]` |
| `dashboard.kick.com` | 1465 | elementos: la rejilla `bg-black` y los `div` con `-default` | ~0 | **nuevo el 24-09**: lo que queda es la capa de cookies de OneTrust |
| `console.cloud.google.com` | 2123 | `--cm-sys-color-backdrop` + 5 elementos `cfc-`/`pcc-` | — | **nuevo el 24-09**: medido con sesion (91% opaco); solo bajo `body[data-cm-color-scheme=dark]`. La comprobacion despues del cambio no se pudo hacer: la copia perdio la sesion de Google |
| `console.x.com` | 1870 | 3 tokens: `--console-canvas`, `--x-bg-primary`, `--console-surface` | **0** | **nuevo el 24-09**: del 100% a un brillo del 3,5% que es suyo |
| `platform.claude.com` | 2325 | `--cds-surface-*` sin los de emergentes | ~0 | **nuevo el 24-09**: queda la trama de puntos, que es decorativa |
| `opencode.ai` | 3090 | 2 tokens `--v2-background-*` + `.bg-background` | **0** | **nuevo el 24-09**: del 100% a tarjetas al 5% |
| `stackoverflow.com` / `stackexchange.com` | 3102 | 2 tokens + `#content` | — | **rescate condicional desde el 24-09**: sin sesion sirve el tema claro y el 63% del texto caia sobre el cristal. Con `theme-dark` o `theme-system` en el body vuelve el cristal |
| `discord.com` | 3154 | token `--background-base-*` | **0** | **arreglado el 12-09**: se cambiaron de escala. De 18174k a 0 |
| `tiktok.com` | 3191 | 6 tokens `--ui-page-*` | **0** | ok, limpio |
| `refrag.gg` | 3241 | utilidades Tailwind | 133k | ok — botones de color de marca |
| `instagram.com` | 3383 | tokens de triplete | 1419k | parcial: quedan tres paneles negros de 250-300k |
| wikis (`wikipedia.org` y 4 mas) | 3439 | tokens bajo `html.skin-theme-clientpref-night` | 13379k | **correcto**: el wiki no esta en modo noche, asi que entro el rescate de `90-exclusions.css` y la pagina sale blanca a proposito |

## Lo que no tiene bloque, y por que

- **`radio.garden`** — el globo ocupa el viewport entero. No hay nada que enseñar
  debajo, asi que un bloque solo quitaria contraste. Esta escrito en su hueco de
  `50-sites.css`.
- **`amazon.com`** — el bloque de Prime Video dice `primevideo.com` a secas
  justo para no llevarselo por delante: Amazon se pinta en claro. Desde el
  24-09-2026 esta en la lista de rescate.
- **La barra del reproductor de Spotify** (2584x82, negra) — no tiene id, ni
  token, ni clase sin hash de la que colgar. Se queda negra.
- **La franja de navegacion de la tienda de Steam** (2486x46) — lleva
  `blur(10px)` sin fondo, y sin nada pintado detras sale negra (medido el
  24-09-2026, 9 de 9 puntos vacios). Solo tiene clases con hash; quitarle el
  filtro a lo bruto la dejaria transparente y, al ser fija, con la pagina
  leyendose por debajo al desplazar. Negra es al menos legible.
- **Lo que es contenido y no fondo** — el fondo de perfil de Steam, la portada
  de un titulo en Prime Video o HBO Max, la foto de cabecera de una tienda de
  marca oscura. El barrido del historial los marca como tapa y no lo son: es
  lo que la pagina quiere ensenar.
- **Los sitios de `90-exclusions.css`** — dinero, tramites y webs sin modo
  oscuro. Ahi el cristal se apaga a proposito.

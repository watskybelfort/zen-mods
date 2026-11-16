# Mantenimiento

Que pasa el dia que Zen saque una version nueva, como saberlo en un minuto y
como arreglarlo sin reescribir nada.

## Lo primero: una actualizacion de Zen no desinstala los mods

Zen actualiza el binario, no el perfil. `zen-themes.json`, `chrome/zen-themes\`,
`chrome/zen-themes.css`, `chrome/userContent.css` y las prefs siguen ahi despues
de actualizar. El mod no se cae.

**El riesgo real es el contrario: que se quede obsoleto sin decir nada.** Un CSS
cuyo selector ya no existe no da error, no avisa y no se ve en ningun log: la
regla simplemente no aplica. La ventana sigue abriendo, el mod sigue "activado"
en Ajustes, y lo unico que pasa es que una capa vuelve a ser opaca o una
animacion deja de ocurrir. Es exactamente el fallo mas dificil de notar.

Y no es hipotetico. Medido el 25-07-2026 sobre Zen 1.21.9b (Gecko 153, BuildID
20260725024203), **habia un selector muerto en el repo**:

| Selector en el repo | Existe en Zen 1.21.9b | Nombre real ahora |
| --- | --- | --- |
| `#zen-sidebar-bottom-buttons` | **no**, cero apariciones en los dos `omni.ja` | `#zen-sidebar-foot-buttons` (`browser.xhtml:6488`) |

Esta arreglado desde entonces: los dos mods nombran hoy los dos selectores, el
nuevo y el viejo, que es la regla 3 de mas abajo. La linea base va por Zen
1.23b (Gecko 157.0, BuildID 20261002114451), no por la de esta tabla.

Lo usan dos mods: `mods/appearance/acrylic-glass/chrome.css:140` (donde solo cuesta una capa
transparente que ya lo era) y `mods/appearance/motion/chrome.css:199` y `:211`, donde se
lleva por delante las micro-interacciones de esa fila de botones. Nadie se dio
cuenta porque no hay nada que se de cuenta. De eso va este documento.

## De que depende esto exactamente

El repo cruza once fronteras. Cada una se rompe de una forma distinta y se
arregla en un sitio distinto, asi que conviene no mezclarlas.

| Frontera | Quien la manda | Como se rompe | Sintoma |
| --- | --- | --- | --- |
| **1. DOM y CSS de Zen** — `#zen-main-app-wrapper`, `.zen-browser-generic-background`, `--zen-background-opacity` | Zen, equipo pequeno, sin compromiso de estabilidad | renombran un id o una variable — **o no renombran nada y cambian de conducta**, que es peor porque el verificador estatico lo firma como correcto (ver *el quinto fallo silencioso*) | una capa vuelve opaca, o una regla deja de casar, en silencio |
| **2. DOM y CSS de Firefox** — `.titlebar-button`, `#tabbrowser-tabpanels`, `::part(content)` | Mozilla | rediseno de `browser.xhtml` o de un shadow part | igual, pero mucho menos frecuente |
| **3. Runtime de Zen Mods** — el `<div id="theme-...">`, las variables `--...` y las prefs de `preferences.json` | Zen, `ZenMods.mjs` | cambian la derivacion del id o el tipo de pref | **todas** las opciones del mod dejan de responder |
| **4. Lo que el instalador replica** — formato de `zen-themes.css`, esquema de `zen-themes.json`, `#setDefaults` | Zen, `ZenMods.mjs` | cambian el formato o el esquema | el mod se instala y no aplica, o Zen ignora el registro |
| **5. Prefs** — `widget.windows.mica.toplevel-backdrop`, `zen.widget.macos.window-material`, `browser.tabs.allow_transparent_browser` | Mozilla y Zen | renombran o retiran la pref | se pierde el cristal entero |
| **8. El compositor del sistema** — DWM en Windows, `NSVisualEffectView` en macOS | Microsoft y Apple | cambian el comportamiento de un material, o Zen cambia de mecanismo | el cristal se ve distinto o desaparece, y no hay nada roto en el repo |
| **6. DOM y API de una web ajena** — `#main-panel`, `#side-panel`, la clase `ad-showing`, `getPlayerResponse()`, `syncedLyrics` de LRCLIB, `navigator.mediaSession` | YouTube Music, LRCLIB, Musixmatch | despliegan un rediseno cualquier martes, sin avisar y sin versionar | una vista de Zen Letra Viva no sale, la letra se desincroniza, o Zen Sintonia manda el titulo de un anuncio |
| **9. Un acuerdo dentro de casa** — el atributo `zen-sin-cristal` (y, igual, `zen-modo-oscuro`, que escribe `mods/appearance/dark-mode/nativo/proceso.js` y leen las laminas claras de `mods/appearance/acrylic-glass/web/50-sites.css` y los rescates de `mods/appearance/acrylic-glass/web/90-exclusions.css`; lo vigila el mismo `dev/tools/probar-css.mjs`), que escribe `mods/appearance/glass-toggle/nativo/proceso.js` y leen las guardas de `mods/appearance/acrylic-glass/web/00-base.css`, `10-wrappers.css`, `20-aggressive.css` y `50-sites.css` | nosotros, en el mismo repo | se renombra en un lado y no en el otro; o se anade una regla nueva a esas cuatro capas sin ponerle la guarda | el interruptor del clic derecho aparece, se marca, y no apaga nada. Ninguna build de Zen puede avisar de esto: no es una frontera con nadie de fuera. Desde el 12-09-2026 **lo comprueba `node dev/tools/probar-css.mjs`**, selector por selector y no regla por regla: una lista de seis donde solo cinco llevan guarda tambien falla |
| **7. Un acuerdo entre dos repos** — el puerto, la ruta `/sintonia` y la forma del JSON que Zen Sintonia le empuja al widget de musica | nosotros, en **dos repos distintos** | se cambia `--puerto` en un lado y no `zen.sintonia.puerto` en el otro; o se anade un campo aqui y no se lee alli | el widget se queda vacio y el navegador dice "el widget no contesta". Ninguna herramienta lo detecta: no hay nada que comparar |
| **10. Una extension de terceros** — el id `zeninternet-styles`, la hoja que inyecta Zen Internet y que `mods/appearance/glass-toggle/nativo/proceso.js` apaga con `media="not all"` | sameerasw, en la tienda de complementos | renombran el id, cambian de `<style>` a `insertCSS`, **o cambian cuando reescriben la hoja** — eso ultimo ya paso: con `disabled` el interruptor fallaba a ratos, porque cada reescritura de `textContent` monta una hoja nueva y `disabled` se queda con la vieja | el interruptor del clic derecho apaga NUESTRO cristal y deja el suyo, asi que parece que no hace nada. La extension no esta en ningun `omni.ja`, vive en un `.xpi` del perfil, pero sus ESTILOS son publicos y cambian solos cada dos horas: desde el 24-09-2026 `node dev/tools/probar-zeninternet.mjs` (y el doctor) compara los que caen en sitios del catalogo con `dev/contract/zeninternet.json` y avisa del que cambie. El mecanismo del interruptor se sigue mirando a mano: `#zeninternet-styles` tiene que llevar `media="not all"` y seguir llevandolo despues de cambiar de pestana y volver |
| **11. Un motor vendorizado** — Dark Reader, en `mods/appearance/dark-mode/motor/`, con su base de arreglos por sitio | Dark Reader Ltd (MIT), copiado a mano del paquete npm y de su repositorio | no se rompe solo: no se actualiza si nadie lo actualiza. Lo que si puede romperse es lo que `nativo/proceso.js` le hace **en memoria** al inyectarlo, que busca TRES textos concretos del motor —la shim de `window.chrome`, el bloque que monta su proxy de hojas, y la envoltura contra un `define` global— y avisa en la consola con `[modo-oscuro]` si alguno ya no esta | el modo oscuro deja de oscurecer en paginas con `define` global (Facebook), o deja un `window.chrome` visible a los sitios, o vuelve el ruido de CSP de su `<script>` en linea. Al actualizar el motor: abrir una pagina clara y una de Meta, y mirar la consola. Los arreglos por sitio se actualizan bajando su `dynamic-theme-fixes.config` y reinstalando; los ajustes propios que le corregimos viven en `ARREGLOS_PROPIOS` (`installer/lib/arreglos-oscuro.mjs`), cada uno con su medida |

### La frontera 8 se cruza dos veces, y la mitad no se puede medir

Es la unica que existe por duplicado: hay dos compositores y dos juegos de prefs
para lo que en el CSS es una sola idea. Por eso el contrato lleva `plataformas`
en los enganches que solo existen en un motor, y hay **dos lineas base**
(`dev/contract/baseline.json` para Windows, `dev/contract/baseline.macos.json` para
macOS). Compartir una sola no valdria: el estado esperado de la mitad de los
enganches del cristal es distinto en cada sistema, asi que ejecutar el
verificador en el otro daria una pagina de "cambios" que no son cambios.

La asimetria que hay que tener presente al depurar: **en Windows el sistema
contesta y en macOS no.** `DwmGetWindowAttribute` dice que backdrop se aplico;
macOS no tiene ninguna API publica para preguntar desde fuera si una ventana
ajena tiene vibrancy. `node dev/tools/cristal.mjs` lo dice en voz alta en vez de
inventarse una medida: alli informa de lo que se PIDE (material, modo de
muestreo, "Reducir transparencia", version del sistema) y manda a
`node dev/tools/probar-vivo.mjs`, que si mide, porque corre dentro del navegador.

Y una trampa concreta de macOS que ya costo una vez: `#zen-browser-background`
lleva `appearance` nativa, y **un frame themed no pinta el `background-color` del
autor**. Esta medido con capturas (ver la seccion 3.5 de
`mods/appearance/acrylic-glass/chrome.css`), no deducido. Si algun dia el velo del marco deja
de responder a la intensidad en macOS, mirar ahi antes que en la cascada: el
color se declara, sale en el inspector y no llega a la pantalla.

### La frontera 7 no la rompe nadie de fuera, la rompemos nosotros

Es la unica que no depende de terceros y aun asi es facil de romper, porque las
dos mitades viven en repos distintos (`acrylic-zen` y el de Hades) y **nada las
sincroniza**. Un `--puerto` cambiado en `start-widget.bat` sin tocar
`zen.sintonia.puerto` deja el mod hablandole a un puerto muerto.

Las dos mitades y donde se tocan:

| Pieza | Repo | Que declara |
| --- | --- | --- |
| `mods\youtube-music\obs-now-playing\nativo\config-prefs.js` | acrylic-zen | `zen.sintonia.puerto` (9463) |
| `widgets\music\server.ps1` | Hades | `--puerto` (9463) y la ruta `/sintonia` |

El instalador acepta `--puerto` para sembrar el mismo valor en las prefs, asi que
lo mas seguro es cambiarlo por ahi:

```bash
node installer/instalar-sintonia.mjs --puerto 9500      # y arrancar el widget con --puerto 9500
```

Y la forma del JSON se prueba de los dos lados sin navegador ni OBS:
`node dev/tools/probar-sintonia.mjs` (que se manda) y `probar-servidor.ps1` del repo
de Hades (que se entiende).

### La frontera 6 es distinta a las cinco anteriores

Las cinco primeras las manda Zen o Mozilla: software que se descarga, se puede
inspeccionar y cuya version se conoce. `dev/tools/probar-contrato.mjs` puede abrir los
`omni.ja` y comprobar si un selector sigue existiendo **antes** de que rompa nada.

La sexta no. El DOM de `music.youtube.com` no esta en ningun archivo local: llega
por la red, cambia cuando ellos quieran y no hay version que comparar. Por eso los
enganches de `dev\contract\letra-viva.json` van marcados como `comprobable: "vivo"` y el
verificador los cuenta aparte, en lugar de darlos por buenos o por roscas:

```
  ok     letra-viva           19 enganches
          sin medir   ad-showing
          sin medir   main-panel
          sin medir   getPlayerResponse
          ...
```

La comprobacion equivalente vive **dentro de la pagina**. Con YouTube Music abierto,
en la consola:

```js
window.__zenLetra.doctor()
```

Saca una tabla con cada punto, si sigue existiendo, cual de sus selectores acerto y
para que servia. Los criticos que hayan desaparecido salen como `ROTO` y con la
instruccion de que hacer. Es la unica forma de auditar esta frontera, y por eso el
resolutor de `mods\youtube-music\live-lyrics\src\10-puntos.js` guarda **cual** selector acerto y no el
elemento: en una SPA, devolver un nodo huerfano es peor que devolver `null`, porque
escribir en el no da error y no se ve nada.

Los cuatro fallos que ya ha dado esta frontera. Los tres primeros son del mismo
tipo — nada explotaba, simplemente algo no ocurria:

| Sintoma | Causa real |
| --- | --- |
| El mod cargaba y estaba completamente muerto | `document.documentElement` es **null** a `document-start`, y `observe()` sobre null lanzaba y se llevaba el arranque entero |
| No salia el boton, ni los atajos, ni el menu | YouTube Music exige **Trusted Types** por CSP: asignar `innerHTML` lanza. Todo el DOM se construye con `createElement` |
| La letra saltaba al principio en cada corte publicitario | Con un anuncio en marcha, `video.currentTime` es **el del anuncio**. Se detecta por la clase `ad-showing` de `#movie_player` y el reloj se congela |
| El clic derecho sobre el boton abria dos menus a la vez, el suyo y el nuestro | Una actualizacion suya le puso a `ytmusic-player-bar` un `contextmenu` propio que abre el menu de cancion. `preventDefault` solo cancela el menu del **navegador**; el suyo se abre por codigo y no mira `defaultPrevented`. Se corta con `stopPropagation` desde el boton, que en burbuja va antes que la barra |

Los tres primeros los encontro el `catch` del arranque, que existe exactamente para
esto: en esta frontera no hay log del navegador que avise, y la consola de la pagina
esta llena de ruido de YouTube.

El cuarto no lo encontro nadie de dentro, y es el que ensena el modo de fallo que le
queda a esta frontera cuando el resto esta cubierto: **no hubo excepcion que atrapar
ni enganche que se cayera**. El doctor daba los catorce puntos en pie, porque lo que
cambio no fue el DOM sino la conducta — YouTube Music no quito nada, anadio un
escuchador. Eso no lo ve un selector: solo lo ve alguien usando el mod. Por eso el
enganche esta ahora en `dev\contract\letra-viva.json` con su `si_falta`, que es lo unico
que convierte un susto en una nota.

Del mismo tirón salio un fallo nuestro que llevaba ahi desde el principio y que solo
se veia en ventanas bajas: el menu mide 573px y, cuando no cabia encima del boton,
se volteaba **debajo** sin comprobar si abajo cabia. Con la ventana a 640 de alto
eso dejaba 567 de sus 573 pixeles fuera de la pantalla. Abierto, invisible e
impulsable. Ahora voltea solo si al otro lado cabe, y si no cabe en ninguno se
recorta al hueco mayor y se vuelve desplazable.

Medido contra los `omni.ja` de la build instalada, de los ~80 puntos de enganche
que usa el repo estos son los que se declaran en **un solo archivo** de Zen, o
sea los que un commit suyo puede cambiar de una vez:

| Punto de enganche | Declarado en | Si cambia |
| --- | --- | --- |
| esquema de `zen-themes.json`, `#writeStylesheet`, `#setDefaults` | `zen-components/ZenMods.mjs` (1 archivo) | el instalador escribe algo que Zen ya no entiende |
| `--zen-themed-toolbar-bg-transparent` | `zen-browser-ui.css` (2) | el wrapper vuelve opaco |
| `zen.view.grey-out-inactive-windows` | `zen-browser-ui.css` (2) | se pierde el cristal sin foco |
| `.zen-browser-generic-background` | `browser.xhtml` + 2 (3) | **se cae el acrilico entero** |
| `remotecontrol` / `gRemoteControl` | `browser.js` (2-3) | Zen Claude Link no pinta nunca |
| `widget.windows.mica.toplevel-backdrop` | `zen-theme.css` + 2 (3) | no hay backdrop de DWM |
| `isWindowsStyledButtons` | `ZenUIManager.mjs` (2) | la barra se descuadra al forzar el lado |

### La frontera 3, en detalle, porque es la que se rompe callada

`ZenMods.mjs` convierte `preferences.json` en tres mecanismos distintos, y cada
uno se consume distinto desde el CSS. Comprobado leyendo el archivo de la build
instalada (`#writeToDom`, lineas 177-248, y `sanitizeModName`, linea 403):

| `type` | Que hace Zen | Como se lee desde CSS |
| --- | --- | --- |
| `dropdown` | `setAttribute(property con puntos->guiones, valor)` sobre un `<div id="theme-<nombre>">` que cuelga de `body` | `:root:has(#theme-Acrylic-Zen[acrylic-zen-intensity='glass'])` |
| `string` | `root.style.setProperty('--' + property con puntos->guiones, valor)` | `var(--acrylic-zen-tint, <fallback>)` |
| `checkbox` | solo escribe una pref booleana | `@media -moz-pref('acrylic-zen.blur-popups')` |

**El `checkbox` es el unico de los tres que cruza a la pagina.** Los otros dos
escriben en el DOM del marco: un `<div>` que cuelga de su `body` y una variable
en su raiz, y ni uno ni otra existen dentro del documento de una pestana. La
pref no vive en el DOM de nadie, asi que `userContent.css` tambien la lee — es
hoja de **usuario**, y a `-moz-pref` le basta con que la hoja no sea de autor.
De ahi salen los interruptores de los buscadores flotantes de YouTube y de
YouTube Music, que son opciones del mod leidas desde `mods\appearance\acrylic-glass\web\50-sites.css`. Si
algun dia hace falta un desplegable o una
cadena dentro de una pagina, no hay forma: habria que partirlo en checkbox.

De ahi salen dos reglas que no son opcionales:

- **El id del div se deriva del `name` de `theme.json`**, no del `id`:
  `theme-${name}` con los espacios a guiones. Renombrar `"Acrylic Zen"` a
  `"Acrylic Zen 2"` en `theme.json` mata **todos** los presets del desplegable de
  ese mod, sin tocar una linea de CSS y sin ningun aviso.
- **Cambiar el `type` de una opcion cambia el mecanismo.** Pasar una opcion de
  `string` a `dropdown` deja de escribir la variable y empieza a escribir un
  atributo: el `var()` cae al fallback para siempre y la opcion parece "no hacer
  nada".

Hoy este cruce esta **limpio**: las 6 variables de Acrylic Zen, las 3 de Claude
Link, las 2 de Motion y las 5 de Traffic Lights estan declaradas y consumidas;
los 6 desplegables coinciden con su `#theme-<Nombre>`; y los checkbox tienen
quien los lea — casi todos en el `chrome.css` de su mod, los dos de los
buscadores flotantes —YouTube y YouTube Music— en la capa web, y desde
Zen 1.22.2b **uno en el `nativo/` de su propio mod**: el de Zen Web Apps, que no
lo lee ningun `@media` sino un `getBoolPref` desde codigo con principal de
sistema. Es la misma pref; lo que cambia es quien la mira. `dev/tools/doctor.mjs`
acepta las tres vias y sigue gritando si no la mira nadie. El trabajo no es
arreglarlo, es que siga asi.

## Lo que ya aguanta bien, y conviene no tocar

Antes de anadir nada, lo que la estructura actual ya hace bien — son decisiones
que hay que preservar en cualquier refactor:

- **Degradacion segura por diseno.** En los cuatro mods las reglas base son el
  efecto completo y los `@media` solo restan. Si una media feature privilegiada
  no estuviese disponible, el bloque se descarta y queda el efecto, nunca una
  ventana a medio pintar. Es lo contrario del patron habitual y es lo correcto.
- **Indireccion por tokens.** `--az-tint-e: var(--acrylic-zen-tint, var(--az-tint))`.
  La preferencia del usuario, el preset y el valor de fabrica son tres capas
  separadas: si Zen deja de escribir la variable, el mod sigue funcionando con su
  preset.
- **Mods independientes de verdad.** Cinco carpetas, cinco `theme.json`, cinco
  interruptores. Un mod roto no arrastra a los demas, y se puede apagar el que
  falle desde Ajustes sin desinstalar nada.
- **La capa web se genera, no se copia.** `Build-UserContentCss` concatena
  parciales por nivel. Ese mismo patron es el que falta en `mod/` (fase 6).
- **El instalador ya hace backup** de `zen-themes.json`, `zen-themes.css`,
  `userContent.css`, `prefs.js` y `user.js` con fecha.
- **Los mods se descubren solos.** Cualquier subcarpeta con `theme.json` se
  instala; anadir un mod no toca el instalador.

## Los cinco fallos silenciosos

Todo lo que puede pasar cae en uno de estos cinco, y ninguno da error:

1. **Selector obsoleto.** Zen renombra, la regla no aplica. Ya nos ha pasado.
2. **Variable obsoleta.** El `var()` cae al fallback: el mod "funciona" pero
   ignora la preferencia del usuario.
3. **Contrato de Zen Mods roto.** Las opciones dejan de responder aunque el CSS
   base siga pintando.
4. **Instalador desalineado.** Escribe un `zen-themes.css` con un formato que Zen
   ya no genera, o un `zen-themes.json` con un campo que ya no lee.
5. **Cambio de conducta.** Todos los nombres siguen vivos y aun asi la regla deja
   de aplicar, porque lo que cambio fue una **decision** de Zen. El quinto llego
   el 17-09-2026 y tiene su seccion abajo.

De ahi la forma del plan: **no hace falta blindar el CSS, hace falta que estos
cinco se detecten en segundos en vez de en semanas.**

### El quinto, en detalle, porque es el unico que un verificador de nombres firma como correcto

Pasa en Zen 1.22.2b con **Zen Web Apps**, y conviene leerlo entero antes de
depurar cualquier mod que "ha dejado de hacer efecto".

El sintoma: en las ventanas de aplicacion web volvio a verse la barra lateral. El
diagnostico que daban las herramientas:

```
node dev/tools/probar-contrato.mjs   ->  124 enganches, todos en su sitio
node dev/tools/doctor.mjs            ->  5 mods instalados, en la hoja y con sus opciones
```

Las dos decian la verdad. Lo que cambio no fue un nombre sino esto:

```
ZenUIManager.mjs:992    hidesTabsToolbar = raiz.hasAttribute('popup-window')
browser-init.js:116     'popup-window' solo se pone si !window.toolbar.visible
```

Una ventana de app no es un popup, asi que dejo de contar como ventana "sin barra
de pestanas", `isSingleToolbar` paso a salir verdadero tambien ahi, y Zen movio
`#nav-bar` —con la URL y los botones de ventana— DENTRO de `#navigator-toolbox`.
La guarda del mod, `:not(:has(.titlebar-buttonbox-container, #urlbar-container))`,
hizo entonces exactamente lo que se escribio para que hiciera: apartarse, para no
dejar una ventana que no se puede cerrar.

Tres cosas que sacar de aqui:

- **La guarda funciono, y por eso el fallo fue leve.** Sin ella el mismo cambio
  de Zen habria dejado ventanas de app sin boton de cerrar. Un mod que se aparta
  solo convierte un desastre en una molestia; es la regla mas rentable del repo.
- **Un `:not(:has(...))` es una guarda Y un punto de fallo silencioso.** Lo que
  la hace segura es lo mismo que la hace invisible: cuando deja de casar, no
  pasa nada y nadie se entera.
- **Esto solo lo ve alguien usando el mod, o un verificador que entre donde el
  mod actua.** De ahi `vivo_app` en el contrato y el recorrido de ventanas de
  `dev/tools/probar-vivo.mjs`: las ventanas de app no son las que mide Marionette, y
  mientras nadie las midiera este fallo no tenia forma de salir en ningun
  informe. Es la misma leccion de la frontera 6 —el DOM no cambio, cambio la
  conducta— pero en la frontera 1, que era la que se daba por vigilada.

### El reves del quinto: un aviso falso, medido en 1.23b

La actualizacion a Zen 1.23b (6-10-2026) dejo el doctor con un aviso real —"la barra de
direcciones sigue siendo un popover"— y todos los mods funcionando. El aviso era falso,
y es el espejo del quinto fallo: **no cambio un nombre, cambio cuando existe**. Hasta
1.22 `#urlbar` llevaba `popover="manual"` escrito en `browser.xhtml`; en 1.23b lo pone
`UrlbarInputBase.startLayoutExtend()` al desplegarla y lo quita al cerrar. En reposo no
hay popover, y la comprobacion viva —que miraba en reposo— daba "sin-popover". Y la mitad
estatica firmaba otra cosa: `popover="manual"` ahora casa con `#fullscreen-warning`.

Lo que se hizo, y es la regla para el proximo: abrir el buscador de verdad por el enlace
(`gZenUIManager.handleNewTab(false, false, 'tab', true)`) y medir ahi —popover abierto,
`::backdrop` con `blur(40px)`—, y despues arreglar las dos mitades del contrato: la
estatica busca la llamada de Zen y la viva solo exige popover cuando la barra esta
desplegada (`breakout-extend`). Un aviso de `degrada` que nadie ha medido en pantalla no
es un aviso: es una pregunta.

## El plan

Ocho fases, cada una util por si sola y cada una un commit. El orden importa: las
tres primeras dan la deteccion, que es el 80% del valor.

**Estado: hechas las fases 0 a 6.** Quedan la 7 (parciales y compat por version),
que solo merece la pena cuando haya que sostener dos versiones de Zen a la vez, y
la 8 (que no dependa de acordarse), que necesita `dev/tools/doctor.mjs --silencioso` colgado de
una tarea programada — el modo ya existe y funciona; lo que falta es programarlo.

### Fase 0 — arreglar la deriva que ya existe

`#zen-sidebar-bottom-buttons` -> `#zen-sidebar-foot-buttons` en los dos mods, y
**dejando los dos nombres en la lista**. Un id desconocido en una lista de
selectores no cuesta nada y hace que el mismo CSS valga para la version vieja y
la nueva: cero dias de transicion. (Ojo: eso vale para nombres desconocidos, no
para *sintaxis* desconocida — ver las reglas del final.)

### Fase 1 — el contrato, escrito

`dev\contract\<mod>.json`: cada punto de enganche que el mod usa de fuera, con

```json
{ "token": ".zen-browser-generic-background",
  "kind": "class", "owner": "zen",
  "severity": "critico",
  "usa": ["acrylic-zen"],
  "declarado_en": "chrome/browser/content/browser/browser.xhtml",
  "para": "la capa de fondo que tapa el acrilico",
  "si_falta": "el acrilico no se ve; buscar el nuevo contenedor de fondo" }
```

No es documentacion decorativa: es la entrada de las fases 2, 3 y 4. `severity`
separa lo que rompe el mod de lo que solo le quita un detalle, para que el
informe no grite por todo igual.

### Fase 2 — verificador estatico: `dev/tools/probar-contrato.mjs`

Abre `omni.ja` y `browser\omni.ja` como zip (se puede: 12.997 entradas legibles
con `System.IO.Compression`), busca cada token del contrato y dice cual falta,
agrupado por mod y severidad. Sin abrir Zen, sin canal remoto, en segundos.

Lo que lo hace valioso de verdad: **funciona contra una build que todavia no has
instalado.** Descargas el nuevo Zen, apuntas el script a su carpeta y sabes si te
va a romper algo *antes* de actualizar.

Codigos de salida: `0` todo presente · `1` falta algo cosmetico · `2` falta algo
critico · `3` no se pudo leer el `omni.ja`.

### Fase 3 — verificador vivo: `dev/tools/probar-vivo.mjs`

Lo estatico prueba que el nombre existe; no prueba que el efecto ocurra. Esto
segundo se mide sobre el navegador abierto, por Marionette —que
`installer/enlace-claude.mjs --marionette` ya sabe levantar y que da acceso al chrome,
no solo al contenido—: para cada token, existe el elemento, y ademas su
`getComputedStyle` es el que el mod pretendia (fondo transparente, opacidad
esperada, el circulo de 12px donde tocaba).

Es la version automatizada de la leccion que ya esta en el historial del repo:
*el blur si funcionaba, lo que no funcionaba era como lo medi*. Un verificador
que solo comprueba nombres habria firmado ese fallo como correcto.

### Fase 4 — linea base y diff: `dev/contract/baseline*.json`

Version de Zen, Gecko, BuildID y el resultado completo de la fase 2 el dia que se
valido. Con eso el informe deja de decir "presente/ausente" y pasa a decir **"que
ha cambiado desde la version en la que esto funcionaba"**, que es la pregunta de
verdad. Incluye el `sha256` de `ZenMods.mjs` —el valor vigente esta en
`dev/contract/baseline*.json`, no copiado aqui, para que no puedan contradecirse—: si
ese hash cambia, el aviso es *revisa el instalador y la frontera 3*, que es la
unica forma de detectar la fase 4 de los fallos silenciosos sin leer el diff de
Zen entero.

Se reescribe con `--actualizar-linea-base`, y solo cuando se ha comprobado a mano que con
esa version todo va bien: una linea base actualizada a ciegas convierte un fallo
nuevo en el estado normal.

### Fase 5 — un solo comando: `dev/tools/doctor.mjs`

Lo que se ejecuta el dia de la actualizacion. Un informe, todo de una vez:

- perfil detectado, y que los 5 mods estan copiados y registrados
- `zen-themes.css` fresco: se recompila en memoria y se compara el hash con el
  del archivo, para pillar el caso de "Zen lo regenero y perdimos algo"
- las prefs del acrilico siguen puestas, y el backdrop real segun DWM
  (`dev/tools/cristal.mjs`, ya existe)
- contrato estatico (fase 2) y diff contra la linea base (fase 4)
- coherencia interna: cada `string` de `preferences.json` tiene su `var()`, cada
  `dropdown` su `#theme-<Nombre>` derivado del `name` de `theme.json`, cada
  `checkbox` su `-moz-pref` en su `chrome.css` **o en la capa web** — las dos
  reglas de la frontera 3, comprobadas
- CVEs pendientes (`dev/tools/exposicion.mjs`, ya existe)

### Fase 6 — red de seguridad

- `manifest.json` en cada backup: version de Zen, Gecko, BuildID, version de cada
  mod, `--nivel-web` y prefs aplicadas. Un backup sin eso no dice a que estado
  vuelve.
- `installer/restaurar.mjs`: volver a un backup por fecha. Hoy hay copias
  y no hay forma de restaurarlas mas que a mano.
- `installer/apagar-mods.mjs`: el interruptor de panico. Pone `enabled: false` en
  `zen-themes.json`, recompila la hoja y deja Zen de fabrica **sin borrar nada**.
  Existe porque el caso malo es justo el que impide usar la interfaz de Ajustes
  para apagar el mod que la esta rompiendo.

### Fase 7 — parciales y compat por version

Aplicar a `mod/` lo que ya funciona en `web/`: `chrome.css` pasa a ser
`00-tokens.css`, `10-window.css`, `20-content.css`... concatenados por el
instalador, mas un `compat\` opcional que solo se incluye si la version de Zen lo
pide. Asi un cambio de Zen se absorbe anadiendo un parcial en vez de editando 400
lineas.

Es la fase mas invasiva y la de menor urgencia: solo merece la pena cuando haya
que sostener dos versiones de Zen a la vez. Antes de eso, complica sin pagar.

### Fase 8 — que no dependa de acordarse

`dev/tools/doctor.mjs --silencioso` guarda el `BuildID` visto por ultima vez y solo habla cuando
cambia. Colgado de una tarea programada o de un arranque, la actualizacion de Zen
avisa ella sola en vez de descubrirse tres semanas despues mirando una barra
lateral opaca.

## Reglas al escribir CSS de chrome

Lo que hay que respetar para que los mods nazcan robustos, en vez de arreglarlos
despues:

1. **Antes el token que el selector.** Si el valor sale de una `var()` de Zen,
   pisar la variable sobrevive a un rediseno del DOM; pisar el `#id` no. Es la
   misma regla que `senalar.js` aplica a las webs, y vale igual para el chrome.
2. **Base = efecto completo; los `@media` solo restan.** Ya se cumple. Una media
   feature privilegiada que desaparezca descarta su bloque, y lo que queda tiene
   que ser un mod que funciona.
3. **Al renombrar, sumar, no sustituir.** Nombre nuevo y nombre viejo en la misma
   lista: un selector que no encaja con nada no cuesta nada.
4. **Nunca meter sintaxis especulativa en una lista de selectores.** Un id
   desconocido es un selector valido y solo no encaja; un selector *mal formado*
   invalida la regla **entera**, incluidos los selectores buenos que iban con el.
   Si hay que probar sintaxis nueva, va en su propia regla o dentro de `:is()`,
   que perdona.
5. **Un solo bloque de enganches externos por mod**, y que el contrato lo
   refleje. Un renombrado de Zen tiene que ser una edicion en un sitio, no una
   caceria por 400 lineas.
6. **Lo que se mide, se mide donde se ve.** Ni la captura de BiDi pinta
   `backdrop-filter` ni `prefs.js` conserva las prefs que coinciden con el valor
   de fabrica. Para el cristal, captura de escritorio; para el backdrop, se le
   pregunta a DWM.
7. **Y lo que se mide, se mide sin el canal abierto si el sitio mira.** Con
   `enlace-claude.mjs` levantado el navegador anuncia que esta automatizado, y
   hay sitios que entonces sirven otra cosa. Comprobado el 17-09-2026: Google
   contesto con `/sorry/index`, su pagina de trafico inusual, en vez de con la
   pagina que se iba a medir. Para los sitios con detector —Google sin sesion,
   Cloudflare, cualquier cosa de Meta— se abre Zen normal y se pega
   `dev/tools/auditar-opacos.js` en F12 a mano.

## Los mensajes de commit se escriben sin BOM

`Out-File -Encoding utf8` **siempre** pone BOM en PowerShell 5.1. No hay forma de
pedirle que no: el `utf8NoBOM` es de PowerShell 7. Si ese archivo se le pasa a
git con `-F`, los tres bytes `EF BB BF` se quedan como el primer caracter del
asunto, y el sintoma es tan discreto —un hueco raro delante del titulo en
GitHub— que puede pasar semanas sin verse. Le paso a este repo en `8430e97`.

Se escribe con `[System.IO.File]::WriteAllText(...)`, que no lo pone, o con un
here-doc de bash.

Y **la comprobacion no se puede hacer desde PowerShell**, que es lo que
convierte esto en un fallo silencioso de verdad: PowerShell descarta el BOM al
decodificar la salida de un programa, asi que `git log --format=%s` sale limpio
aunque no lo este. Se comprobo asi una vez y la comprobacion mintio. Lo que lo
ve es:

```bash
node dev/tools/probar-mensajes.mjs          # desde el ultimo tag
node dev/tools/probar-mensajes.mjs --todo   # el historial entero
```

que lee bytes crudos, sin que ninguna consola toque el texto por el camino.

## El dia que Zen se actualice

```bash
node dev/tools/probar-contrato.mjs --ruta-zen "<carpeta de la build nueva>"   # antes de actualizar
node dev/tools/doctor.mjs                                                   # despues
```

Y si hace falta mirar la pantalla y no solo los nombres:

```bash
node installer/enlace-claude.mjs --marionette
node dev/tools/probar-vivo.mjs
```

**Con una ventana de aplicacion web abierta.** No es un detalle: `probar-vivo`
mide la ventana que Marionette tiene delante, y esa nunca es una de app. Las
afirmaciones `vivo_app` del contrato buscan por `Services.wm` la primera ventana
con `[taskbartab]`, y si no hay ninguna lo dicen en vez de dar el mod por bueno.
Abre una desde su acceso directo de la barra de tareas ANTES de ejecutarlo, o
Zen Web Apps saldra con cinco comprobaciones "no medibles". Asi se colo el quinto
fallo silencioso.

Y si se ha actualizado Zen, la pieza nativa de Zen Web Apps vive en el directorio
de instalacion, o sea que se la lleva la actualizacion:

```bash
node installer/instalar-web-apps.mjs --solo-instalacion
```

- **Todo verde** — nada que hacer. No hace falta reinstalar.
- **Falta un token** — el informe dice que mod, para que servia y por donde
  buscar el nombre nuevo. Se corrige el CSS sumando el nombre nuevo (regla 3), se
  reinstala y se actualiza la linea base con `--actualizar-linea-base`.
- **"el CSS del perfil NO es el del repo"** — reinstalar. Es el fallo mas tonto y
  el mas facil de tener: arreglas el mod, olvidas reinstalar, y depuras media hora
  un bug que ya estaba corregido.
- **Cambio el hash de `ZenMods.mjs`** — leer el diff de ese archivo antes de
  confiar en el instalador.
- **Un enganche ha cambiado de estado** — el diff de la linea base lo dice con
  nombre y apellidos. Si el cambio es correcto, se valida a mano y se actualiza la
  linea base; nunca al reves.
- **Zen arranca roto** — `node installer/apagar-mods.mjs`, comprobar que Zen de
  fabrica esta bien, y volver a encender de uno en uno con
  `--encender --solo <id>` hasta dar con el culpable. No borra nada.
- **Sigue roto con todos apagados** — no eran los mods: la capa web vive aparte,
  en `chrome/userContent.css`, y se quita reinstalando con `--nivel-web off`.
- **Quieres deshacerlo entero** — `node installer/restaurar.mjs --lista` y
  restaurar por fecha. Cada backup lleva manifiesto con la version de Zen, el
  commit del repo y el nivel de capa web con el que se hizo.

### Lo que ninguna de estas herramientas puede contestar

El acrilico de la ventana. `dev/tools/cristal.mjs` le pregunta a DWM por
`DWMWA_SYSTEMBACKDROP_TYPE`, que devuelve lo que la aplicacion **pidio**, y el
valor 0 es `DWMSBT_AUTO`: "lo decide DWM", que no es lo mismo que "no hay
acrilico". Medido en Windows build 26200 con las dos prefs correctas y
comprobadas en vivo, esa consulta devuelve AUTO.

Asi que un AUTO es un aviso, no un fallo, y la conclusion la dan los ojos. Es la
misma leccion que ya esta en el historial de este repo con `backdrop-filter`: se
dio por demostrado que no funcionaba, se quitaron reglas, y lo que no funcionaba
era la forma de medirlo. Para el cristal, la unica medida fiable es una captura
del ESCRITORIO — la de BiDi no pinta ni `backdrop-filter` ni el backdrop de la
ventana.

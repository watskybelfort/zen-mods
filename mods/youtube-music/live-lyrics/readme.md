# Zen Letra Viva

La letra corre con la cancion en YouTube Music: karaoke palabra a palabra,
escenario en lugar del video, pantalla completa y mini tira sobre la barra.

Es el sexto mod del repo y el unico que **no es CSS**. Los otros cinco son
`chrome.css` y prefs; una letra que corre necesita leer el reloj del reproductor y
pintar sesenta veces por segundo, o sea JavaScript dentro de la pagina. Ninguna de
las cinco capas anteriores puede hacer eso.

## Como se sincroniza, que es la pregunta que todo el mundo hace

Ni Apple Music ni Spotify lo calculan. **No hay analisis de audio.** Lo que hacen
es traerse un archivo de letra ya cronometrada y compararlo con el reloj del
reproductor:

| Aplicacion | Que trae | Precision |
| --- | --- | --- |
| Apple Music | TTML con tiempos por silaba | silaba |
| Spotify | Musixmatch: subtitulo por linea, y `richsync` donde existe | palabra |
| YouTube Music | letra **plana**, sin tiempos | ninguna |

El motor es trivial una vez tienes los tiempos: `video.currentTime` contra una
lista de marcas, buscar la linea activa, pintar. Lo dificil no es eso — es que
YouTube Music no da los tiempos, asi que hay que traerlos de fuera y hacerlos
cuadrar con SU pista, que no siempre es la misma edicion del tema.

De ahi las tres piezas que tienen mas codigo del que uno esperaria: la eleccion de
version (`50-lrclib.js`), el ajuste de desfase por cancion (`Alt+←` y `Alt+→`) y la
interpolacion de palabras (`35-palabras.js`).

## Instalacion

Dos vias. La misma pieza, `mods/youtube-music/live-lyrics/dist/zen-letra-viva.user.js`, en las dos.

### Con gestor de userscripts

Instala Violentmonkey o Tampermonkey en Zen y arrastra
`mods/youtube-music/live-lyrics/dist/zen-letra-viva.user.js` a la ventana. Ventajas: se actualiza y se
depura en segundos, y permite usar Musixmatch.

### Sin extensiones, con el cargador nativo

Mas fiel a la doctrina del repo: nada fuera del perfil, ningun proceso residente.

```bash
node installer/compilar-letra.mjs
node installer/instalar-letra.mjs
```

Dos de las cuatro piezas van en el **directorio de instalacion** de Zen, no en el
perfil: el autoconfig se lee antes de que exista un perfil, asi que no valen las
prefs del perfil. De ahi salen las tres consecuencias de siempre y una que solo
existe en macOS.

| | Windows | macOS |
| --- | --- | --- |
| Donde caen | `C:\Program Files\Zen Browser\` | `/Applications/Zen.app/Contents/Resources/` |
| Permisos | suele pedir administrador | si arrastraste Zen.app a /Applications, la carpeta es tuya y **no hace falta sudo** |

En macOS el sitio es `Contents/Resources` y no `Contents/MacOS`, donde esta el
binario: es lo que Gecko resuelve como `XCurProcD`. Se reconoce porque ahi estan
`application.ini` y los `omni.ja`. Puesto junto al ejecutable, Zen arranca igual
y no carga nada, sin ningun error.

El instalador comprueba el permiso real de escritura en vez de preguntar si eres
administrador, que no es lo mismo: un Zen en `%LOCALAPPDATA%` tampoco necesita
elevar nada en Windows.

**Una actualizacion de Zen se lleva esas dos piezas** en los dos sistemas; se
arreglan volviendo a ejecutar el instalador con `--solo-instalacion`. Despues de
recompilar el motor basta `--solo-perfil`, que no toca el directorio de
instalacion.

**Y una advertencia que solo aplica en macOS:** `Zen.app` va firmada con
*hardened runtime* y *sealed resources*, asi que anadir archivos dentro rompe el
sello y `codesign --verify` pasa a fallar. La app sigue abriendo, porque
Gatekeeper comprueba la firma la primera vez y esa ya esta aprobada, pero si
macOS vuelve a preguntarte por permisos de microfono, camara o pantalla, es por
esto. Para deshacerlo del todo: `--desinstalar` y reinstalar Zen. Si prefieres no
tocar el bundle, el mismo `.user.js` funciona en un gestor de userscripts.

Para comprobar que va, en la consola de la pagina:

```js
window.__zenLetra.estado()
```

`via.red` dice por donde salen las peticiones: `gm` (gestor), `puente` (cargador
nativo) o `fetch` (sin ninguno de los dos, que tambien funciona con LRCLIB).

## Las cuatro vistas

| Vista | Donde | Atajo |
| --- | --- | --- |
| **Escenario** | ocupa la caratula y el video, letras grandes | `Alt+E` |
| **Panel** | en la columna de las pestanas, al lado | `Alt+P` |
| **Pantalla completa** | solo la letra, sobre toda la ventana | `Alt+F` |
| **Mini tira** | linea actual y siguiente sobre la barra | `Alt+M` |

`Alt+L` abre y cierra la que tengas puesta por defecto. Las tres primeras son
exclusivas entre si; la mini tira convive con cualquiera y con ninguna.

El escenario **no oculta el video**: se pone encima. El video sigue debajo
reproduciendo y el `backdrop-filter` del velo, al muestrear lo que hay detras,
convierte el propio video en el fondo difuminado de la letra — que es exactamente
el fondo que usan Apple Music y Spotify, y aqui sale gratis. Ocultarlo seria la via
rapida a que YouTube Music deje de decodificar.

La pantalla completa **no usa la API de pantalla completa del navegador** a
proposito: en Zen eso pone un fondo negro del compositor y se pierde el acrilico de
la ventana, que es justo lo que hace que esto se vea como se ve.

## Todos los atajos

Van con `Alt` porque YouTube Music ya usa las teclas sueltas — espacio, flechas,
`j`/`k`/`l` y las cifras para ir al porcentaje de la pista. Coger una tecla suelta
es quitarle al usuario una funcion que ya tiene en los dedos.

| Atajo | Que hace |
| --- | --- |
| `Alt+L` | abrir o cerrar la letra |
| `Alt+E` / `Alt+P` / `Alt+F` / `Alt+M` | escenario / panel / completa / mini tira |
| `Alt+←` / `Alt+→` | mover la letra 0.1s antes o despues |
| `Alt+0` | quitar el ajuste de esta cancion |
| `Alt+R` | buscar otra version de la letra |
| `Esc` | salir de pantalla completa |

Con el foco en el buscador no se dispara ninguno: con un campo de texto activo, una
tecla no puede significar dos cosas.

El resto de opciones estan en el menu: **boton derecho sobre el boton de la letra**,
o `Alt+clic`. Un userscript no aparece en *Ajustes > Zen Mods* como los otros cinco
mods, asi que o sus ajustes viven en la pagina o solo existen para quien abra la
consola.

## El videoclip, cuando la cancion lo tiene

YouTube Music sirve por defecto el **art track**: el audio del canal automatico
`- Topic`, con la caratula fija. Si el tema tiene ademas videoclip, la aplicacion
no lo pone sola — ofrece un conmutador *Song / Video* y hay que pulsarlo **cancion
por cancion**. El mod lo pulsa por ti.

Va encendido. Se apaga en el menu, en *Que suena*, y ahi mismo se vuelve a
encender: al encenderlo actua sobre la cancion que ya esta sonando, no sobre la
siguiente.

Lo que hace, exactamente: al cambiar la pista mira el conmutador y, si hay video
y se puede poner, lo pone. Si no hay video, no hace nada. **Nunca insiste**: una
pista se atiende una sola vez, asi que si vuelves a *Song* a mano se queda como
tu lo dejaste. Y durante un anuncio no toca nada.

Si no conmuta, la respuesta esta en una linea:

```js
window.__zenLetra.estado().video
```

| Lo que dice | Que significa |
| --- | --- |
| `esta cancion no tiene video` | no hay contrapartida; no hay nada que hacer |
| `YouTube Music no deja conmutar...` | **falta iniciar sesion**. Es la causa mas comun |
| `ya esta sonando el video` | la pista que suena ya es el videoclip |
| `apagado en el menu` | el interruptor esta en *Que suena* |

Medido el 2026-08-02: **sin la sesion iniciada, YouTube Music bloquea el
conmutador en todas las pistas**, incluso en las que tienen la contrapartida
disponible. No es un fallo del mod y no tiene arreglo desde fuera.

De regalo, esto mejora la letra: los art tracks **no llevan subtitulos nunca** y
los videoclips los llevan 8 de cada 10 (los numeros estan mas abajo). Poner el
video es, de paso, abrirle la puerta a la fuente que viene cronometrada contra la
pista que suena.

## Si la letra va desincronizada

Es lo mas frecuente, y casi nunca es un fallo del mod.

1. **`Alt+←` / `Alt+→`** hasta que cuadre. Se guarda por cancion, asi que solo hay
   que hacerlo una vez por tema. El aviso lo dice con palabras: *"Letra 0.3s mas
   tarde"*, no *"+0.3s"*, porque el signo pelado no dice si va antes o despues.
2. Si esta desincronizada **de forma creciente**, o el pie dice *"La letra parece de
   otra version del tema"*, es que la pista de YouTube Music no es la edicion que
   cronometro la base de datos. `Alt+R` busca otra version.
3. Durante un anuncio la letra **se congela a proposito**: el `currentTime` del
   video es el del anuncio. Al volver sigue donde estaba.

Si el pie dice *"Subtitulos de YouTube"*, nada de esto aplica: esa fuente viene
cronometrada contra la pista que suena, asi que no puede ir desincronizada. Si
aun asi lo va, es un fallo y merece un issue.

## Las fuentes

| Fuente | Precision | Por defecto |
| --- | --- | --- |
| **Musixmatch richsync** | palabra real | apagada |
| **LRCLIB** | por linea, palabras interpoladas | encendida |
| **Subtitulos de YouTube** | palabra real en los automaticos | encendida |

LRCLIB es abierta, sin clave, y esta hecha para esto. Musixmatch da los tiempos por
palabra de verdad, pero necesita un usertoken que no es publico y su API no es
oficial: usarla asi va contra sus condiciones de uso. Por eso esta apagada, con el
interruptor a mano y con la explicacion delante — la decision es del usuario. Y
necesita gestor de userscripts o cargador nativo, porque la peticion lleva una
cabecera `Cookie` que el navegador no deja poner desde una pagina.

Musixmatch va **primero** en la cadena precisamente porque es la fragil: cuando
falle, LRCLIB contesta detras y no se nota. Si fuera detras, una cancion con letra
en LRCLIB nunca llegaria a pedir la version buena.

### Los subtitulos de YouTube, que ya estaban ahi

YouTube tiene muchos videos subtitulados y cronometrados, y esa fuente tiene una
ventaja que ninguna base de letras puede tener: **esta cronometrada contra la
pista que suena**, no contra el master que alguien eligio en otra base de datos.
No hay version equivocada posible y no hace falta tocar el desfase. En los
subtitulos automaticos, ademas, los tiempos son **por palabra de verdad** — como
el richsync de Musixmatch, pero sin token y sin saltarse las condiciones de nadie.

La lista sale del propio reproductor, con `getPlayerResponse()`, que ya la tiene
cargada: no hay clave de API ni scraping. Lo unico que se pide es el texto.

Aun asi va **la ultima** de la cadena, y es a proposito: el texto de un subtitulo
automatico sale de reconocer voz cantada, y eso se equivoca. Una letra humana algo
desfasada, que se cuadra con `Alt+←` una vez y se guarda, vale mas que una
transcripcion clavada que dice otra cosa.

**Para que sirve y para que no.** Medido el 2026-07-31 sobre music.youtube.com:

| Que suena | Subtitulos |
| --- | --- |
| Un tema de un canal `- Topic`, que es el audio que YTM sirve por defecto | ninguno, nunca |
| Videoclips oficiales, directos, covers y subidas de usuario | 8 de cada 10 |

Los art tracks de los canales automaticos no llevan subtitulos y no los van a
llevar: no hay quien los suba, y YouTube no le pasa el reconocedor a un audio con
una foto fija. O sea que esto **no** cubre la cola de canciones normal — cubre los
videoclips y las subidas de usuario, que resulta ser justo donde LRCLIB flojea mas
y donde su letra viene cronometrada contra otra edicion.

**Cuando la transcripcion es basura, se tira.** Un reconocedor que no entendio el
audio no da error: da palabras sueltas repartidas por la cancion. Pasa de verdad —
el videoclip de *MONACO* de Bad Bunny es español y tiene el subtitulo automatico
declarado en **ingles**, y lo que sale es "demonon", "fore", "foree". Se distingue
contando palabras por segundo, medido sobre cinco pistas reales:

| Pista | Palabras/s | |
| --- | --- | --- |
| Givenchy, a mano, es | 3.01 | buena |
| Anti-Hero, a mano, en | 2.09 | buena |
| Columbia, automatica, es | 2.02 | buena |
| Never Gonna Give You Up, automatica, en | 1.40 | buena |
| MONACO, automatica en sobre audio español | **0.46** | basura |

El corte esta en 0.8, en mitad de ese hueco. Por debajo se descarta y se dice que
no hay letra, que es la respuesta correcta y ademas la unica que el usuario puede
corregir a mano: ensenar la letra equivocada no se corrige, se sufre.

Lo que **no** se puede detectar es una transcripcion mala pero densa. Por eso el
pie dice siempre *"Subtitulos automaticos de YouTube"* cuando lo son: asi una
palabra rara se lee como lo que es y no como un fallo del mod. Si molesta, el
interruptor esta en el menu.

En cache se guarda el **texto en crudo**, no la linea de tiempo compuesta: ocupa una
fraccion y, sobre todo, el dia que se afine la interpolacion lo ya guardado se
recompone con las reglas nuevas en lugar de servir para siempre el reparto viejo.

## Cuando YouTube Music cambie su DOM

Va a pasar, y el fallo tipico no es una excepcion: es un `querySelector` que
devuelve `null` y una vista que no sale. Desde la consola de la pagina:

```js
window.__zenLetra.doctor()
```

Saca una tabla con cada punto de enganche, si sigue existiendo y para que servia.
Los criticos salen marcados como `ROTO`. Es la version desde dentro de la pagina de
lo que `dev/tools/tools/doctor.mjs` hace con el CSS, y existe porque el DOM de una web ajena
no se puede comprobar desde fuera. Los mismos puntos estan declarados en
`dev/contract/letra-viva.json`, marcados como comprobables solo en vivo.

## Estructura

El motor son parciales numerados en `mods/youtube-music/live-lyrics/src/`, que `installer/compilar-letra.mjs`
concatena en un `.user.js` — el mismo patron que `userContent.css`, que se arma con
los parciales de `web/`.

| Parcial | Que hay dentro |
| --- | --- |
| `05-prologo.js` | utilidades y la marca de la que salen todas las clases |
| `10-puntos.js` | los puntos de enganche medidos, y el doctor |
| `20-reloj.js` | el reloj, con las tres trampas del `currentTime` |
| `25-tema.js` | que suena: `mediaSession`, la barra y la URL |
| `28-video.js` | el conmutador Song/Video: si hay videoclip, ponerlo |
| `30-lrc.js` | LRC a linea de tiempo |
| `35-palabras.js` | la interpolacion que fabrica el efecto |
| `40-red.js` | gestor, `fetch` o puente |
| `45-almacen.js` | ajustes, cache y desfases |
| `50-lrclib.js` | LRCLIB y la eleccion de version |
| `55-musixmatch.js` | richsync a LRC mejorado |
| `57-subtitulos.js` | los subtitulos de YouTube: que pista, y cuando tirarla |
| `60-proveedores.js` | la cadena de fuentes y los seis estados |
| `70-estilos.js` | la hoja de las cuatro vistas |
| `75-render.js` | el bucle de pintado |
| `80-vistas.js` | el registro de vistas, y el panel |
| `82-escenario.js` | escenario y pantalla completa |
| `86-tira.js` | la mini tira |
| `90-controles.js` | boton, atajos, avisos y menu |
| `99-epilogo.js` | el arranque |

Las dos piezas del cargador nativo estan en `mods/youtube-music/live-lyrics/nativo/`. El parser y la
interpolacion, que son funciones puras, se prueban sin navegador:

```bash
node dev/tools/probar-lrc.mjs
node dev/tools/probar-almacen.mjs
```

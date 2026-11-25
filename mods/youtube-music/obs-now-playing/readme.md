# Zen Sintonia

La pestana de YouTube Music le cuenta al widget de musica de OBS que suena, y
nada mas del navegador puede colarse ahi.

Es el septimo mod del repo y el segundo que no es CSS. No pinta nada: es una
fuente de datos.

## El problema, que no era el que parecia

El widget (`widgets\music\` del repo de Hades) llevaba tiempo funcionando en
Arc. Al cambiar a Zen empezo a mostrar cualquier cosa: se abria una playlist en
otra pestana y ya estaba en pantalla, en mitad del stream.

La causa no esta en el widget ni en Zen, sino en lo que hay entre los dos.

El widget lee **SMTC**, la API de media de Windows — la misma que alimenta el
panel de volumen — y elige la sesion filtrando por `SourceAppUserModelId`, o
sea, por que aplicacion la publico:

| Navegador | Que publica en SMTC | Consecuencia |
| --- | --- | --- |
| **Chromium** (Arc, Chrome, Edge) | una sesion **por pestana o PWA**, cada una con su identidad | el filtro `youtube\|ytm\|music` acierta |
| **Gecko** (Zen, Firefox) | **una sola sesion** para todo el navegador, la del ultimo que se puso a sonar, con la identidad del ejecutable | el filtro no casa **nunca** |

Y cuando el filtro no casaba, el widget se caia a su respaldo — *"cualquier
sesion que este reproduciendo"* — que en Gecko es, literalmente, cualquier
pestana.

O sea que **el dato no existe fuera del navegador**. No hay campo que afinar ni
regex que ajustar: desde SMTC, en Gecko, la pestana de YouTube Music y un video
suelto son indistinguibles. Se ve en vivo:

```bash
.\dev\powershell\Sondear-Media.ps1 -Vigilar
```

Pon musica en YouTube Music, abre otra pestana con cualquier video, y mira como
cambia lo que el widget mostraria.

## La solucion

Si el dato no existe fuera, se trae de dentro. Este mod corre en la pestana de
YouTube Music y **empuja** el estado al widget por `POST /sintonia`. Es la unica
fuente que puede afirmar de donde viene la cancion, porque es la unica que esta
dentro.

```
  music.youtube.com                    proceso privilegiado           widget
  ┌───────────────────┐                ┌─────────────────┐            ┌──────────┐
  │ recolector        │  cadena JSON   │ saneador        │   POST     │ server   │
  │ mediaSession      │ ─────────────> │ + cortafuegos   │ ─────────> │ .ps1     │
  │ + barra + video   │   (sandbox)    │ + XHR           │  loopback  │          │
  └───────────────────┘                └─────────────────┘            └──────────┘
```

### Las tres decisiones que tiene esto

**La red la hace el lado privilegiado, no la pagina.** El recolector podria
hacer el POST el mismo, pero desde una pagina https a `http://127.0.0.1` hay
tres cosas que pueden decir que no: el bloqueo de contenido mixto, CORS, y sobre
todo la **CSP de YouTube Music**, que es suya y puede cambiar cualquier martes.
En el proceso privilegiado no hay documento, ni origen, ni CSP: la peticion sale
siempre.

**Lo que cruza la frontera es una cadena, no un objeto.** Un objeto creado en el
compartimento de la pagina cruza envuelto en wrappers de seguridad, y leerlo
desde el lado privilegiado es un campo de minas de Xrays y getters ajenos. Una
cadena es un primitivo: cruza sin dueno. Al otro lado se parsea, se valida campo
por campo y se vuelve a serializar, asi que **lo que sale hacia el widget lo
compuso el lado privilegiado**, no la pagina.

**El puente contesta si el envio salio.** La primera version cortaba en silencio
cuando el cortafuegos de ritmo se disparaba, y las pruebas destaparon el
agujero: el recolector apunta lo ultimo que mando para no repetirse, asi que un
corte invisible le hacia creer que el widget ya conocia la cancion nueva —
hasta tres segundos con el tema anterior en pantalla. Ahora `enviar` devuelve un
booleano, el recolector solo apunta lo que de verdad salio, y lo cortado se
reintenta en el paso siguiente.

### De donde sale cada dato

`navigator.mediaSession.metadata` primero. Es API estandar y es exactamente lo
que YouTube Music le da al navegador para que Windows lo muestre en el panel de
volumen: si eso dejara de existir, se enterarian ellos antes que nosotros.

La barra del reproductor va de respaldo, con los mismos selectores que
[`mods\youtube-music\live-lyrics\src\10-puntos.js`](../letra/src/10-puntos.js) tiene medidos. Va detras a
proposito: esa barra es suya y le pueden cambiar las clases.

## Instalacion

```bash
node installer/instalar-sintonia.mjs        # una vez
```

Y **reiniciar Zen del todo**: en Windows, cerrar la ventana no basta si queda en
la bandeja; en macOS, cerrar la ventana no cierra la app — hace falta Cmd+Q, o el
proceso sigue vivo y el autoconfig no se vuelve a leer.

Necesita permiso de escritura en el directorio de instalacion de Zen, porque dos
de las tres piezas van alli — el autoconfig se lee antes de que exista un perfil,
asi que no valen las prefs del perfil:

| Pieza | Donde | Sobrevive a una actualizacion de Zen |
| --- | --- | --- |
| `config.js` | directorio de instalacion | **no** |
| `defaults/pref/zen-sintonia.js` | directorio de instalacion | **no** |
| `chrome/zen-sintonia/proceso.js` | perfil | si |

Y el directorio de instalacion no esta en el mismo sitio:

| | Ruta | Permisos |
| --- | --- | --- |
| Windows | `C:\Program Files\Zen Browser\` | suele pedir administrador |
| macOS | `/Applications/Zen.app/Contents/Resources/` | si arrastraste Zen.app tu mismo, es tuya: sin sudo |

En macOS es `Contents/Resources`, no `Contents/MacOS`: es lo que Gecko resuelve
como `XCurProcD`, y se reconoce porque ahi estan `application.ini` y los
`omni.ja`. Ademas, escribir dentro del bundle rompe el sello de firma —la app
sigue abriendo, pero `codesign --verify` falla—; lo explica el readme de Zen
Letra Viva, que instala igual.

Cuando Zen se actualice: `node installer/instalar-sintonia.mjs --solo-instalacion`.
Si solo cambia el mod: `--solo-perfil`, que no toca el directorio de instalacion.

### El cargador es compartido

`general.config.filename` admite **un** nombre de archivo, no una lista, asi que
el directorio de instalacion solo puede tener un `config.js` para todos los mods
nativos. El que se instala vive en [`core\config.js`](../nativo/config.js) y
lleva una tabla con todos: carga solo los que encuentre en el perfil.

Los instaladores de Zen Sintonia y de Zen Letra Viva escriben **el mismo
archivo**, asi que el orden da igual y reinstalar uno no desarma al otro.

## Opciones

En `about:config`, en caliente (basta recargar la pestana):

| Pref | Por defecto | Que hace |
| --- | --- | --- |
| `zen.sintonia.encendido` | `true` | apagarlo deja de inyectar en pestanas nuevas |
| `zen.sintonia.puerto` | `9463` | tiene que ser **el mismo** que el `--puerto` del widget |

## Comprobarlo

```bash
node dev/tools/probar-sintonia.mjs      # los dos lados del puente, sin navegador
```

40 pruebas con dobles de `Services`, `Cu`, XHR y un DOM de mentira: donde se
inyecta y donde no, que se manda, el respaldo por DOM, los anuncios, el ritmo,
el cortafuegos, y que el saneador no se fia de la pagina.

En vivo, con el widget levantado y musica sonando:

```
http://localhost:9463/nowplaying     ->   "fuente": "ytm"
```

Si algo no va, en la consola del navegador se busca `[sintonia]`. El mod avisa
**una sola vez por proceso** si el widget no contesta — que el widget no este
levantado es lo normal, solo corre mientras se streamea, y una queja cada
segundo y medio durante horas taparia lo que si importa.

## Lo que este mod NO hace

No toca la pagina: no inyecta CSS, no mueve nada, no escucha teclas. Solo lee y
manda. Si YouTube Music cambia su DOM, lo peor que pasa es que caiga al respaldo
o se quede sin album — nunca que se rompa la pagina.

Tampoco manda nada fuera de la maquina: el unico destino es `127.0.0.1` en el
puerto de la pref, y la portada que viaja es una URL — la descarga la hace el
widget, no la pagina — acotada a **https** y a los CDN de Google en los dos
lados.

## Cuando se rompa

La frontera de este mod es la misma que la de Zen Letra Viva: la manda YouTube
Music, no Zen ni Mozilla, y se despliega cuando ellos quieran. Los enganches
estan en [`dev\contract\zen-sintonia.json`](../contract/zen-sintonia.json), marcados
como `comprobable: "vivo"` porque no viven en ningun archivo local que se pueda
inspeccionar.

Sintomas y por donde empezar:

| Sintoma | Que mirar |
| --- | --- |
| el widget no muestra nada | `nowplaying` dice `active: false` -> la pestana no habla. Consola: `[sintonia]` |
| sale la cancion pero sin portada | cambio el formato de `mediaSession.artwork`, o el host del CDN no esta en la lista |
| sale el titulo del anuncio | renombraron `ad-showing` en `#movie_player` (lo comparte con Zen Letra Viva) |
| sale el artista pegado al album | cambio el separador de la byline, y ademas estamos en el respaldo: `mediaSession` fallo antes |

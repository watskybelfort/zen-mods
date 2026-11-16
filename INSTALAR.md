# Instalar Zen Mods

**[English instructions → INSTALL.md](INSTALL.md)**

Hay dos formas: el instalador lo hace todo por ti, o copias tú los archivos.

## Automática (la recomendada)

Necesitas [Zen Browser](https://zen-browser.app) y [Node.js 18 o superior](https://nodejs.org).

1. Descarga este repositorio (**Code → Download ZIP**) y descomprímelo donde quieras.
2. Haz doble clic en **`Install.cmd`** (Windows) o **`Install.command`** (macOS).
   - Windows pide permisos de administrador una vez: los mods nativos escriben un pequeño
     cargador en la carpeta de instalación de Zen, que está dentro de *Archivos de programa*.
   - macOS puede decir que el archivo es de un desarrollador no identificado: clic derecho →
     **Abrir**.
3. Elige el idioma y escribe los números de los mods que quieras (por ejemplo `1 6 9`), o `a`
   para todos.
4. Abre Zen.

Lo que hace el instalador por ti:

- cierra Zen cuando hace falta (tus pestañas vuelven);
- guarda una copia de seguridad de todo lo que toca en `<perfil>/acrylic-zen-backup/`;
- respeta las opciones que ya hayas elegido en *Ajustes → Zen Mods*.

Desde una terminal, sin preguntas:

```bash
node installer/menu.mjs --es --mods acrylic-glass,immersive-web,phone-remote
```

**Después de actualizar Zen**, los mods nativos dejan de funcionar: la actualización reemplaza
la carpeta de instalación de Zen y se lleva el cargador con ella. Vuelve a abrir el instalador y
elige cualquier mod nativo.

## Windows: el acrílico sale de Windhawk

En Windows, el cristal que se ve detrás de Zen lo dibuja el mod
[**Translucent Windows**](https://windhawk.net/mods/translucent-windows) de
**Undisputed00x**, que funciona dentro de [Windhawk](https://windhawk.net). Todo el mérito del
efecto es de ese mod: Acrylic Glass solo quita las capas opacas que Zen pinta encima para que
se vea. Sin él, la ventana de Zen se queda sólida.

1. Instala [Windhawk](https://windhawk.net).
2. En Windhawk, busca **Translucent Windows** e instálalo.
3. En sus ajustes, estos son los valores que se usan aquí:

   | Ajuste | Valor |
   | --- | --- |
   | Tipo de efecto (`type`) | **Acrylic blur** |
   | Tinte del desenfoque (`AccentBlurBehind`) | `8C000000` |
   | Extender el marco al contenido (`ExtendFrame`) | activado |
   | Barra de título oscura (`ImmersiveDarkTitle`) | activado |
   | Efectos de fondo (`BackgroundEffects`) | Acrylic blur, `3A232323` |
   | Efectos en menús (`FlyoutsEffects`) | activado |

En macOS no hace falta nada más: basta con la vibrancy del propio Zen.

## Idiomas

Todos los mods hablan inglés y español. Los de YouTube Music siguen el idioma de tu cuenta de
YouTube Music, los menús del clic derecho el de Zen, la app del móvil el del móvil, y el
instalador pregunta. Para forzar uno en todo, pon `zen.mods.idioma` en `es` o `en` en
`about:config` (`auto` por defecto).

## Los mods

| # | Mod | Qué hace | Tipo |
| --- | --- | --- | --- |
| 1 | **Acrylic Glass** | Acrílico real de Windows 11 o vibrancy de macOS detrás de Zen, y webs transparentes que lo dejan ver. Intensidad y tinte en *Ajustes → Zen Mods*. | CSS |
| 2 | **Glass Toggle** | Clic derecho → *Zen Cristal* → ver esa web sin cristal. Se recuerda por web. | Nativo |
| 3 | **Motion** | Buscador animado con resultados en cascada, microanimaciones y la fuente Montserrat (instálala en el sistema para verla). | CSS |
| 4 | **Traffic Lights** | Minimizar, maximizar y cerrar como en macOS. | CSS |
| 5 | **Dark Mode** | Modo oscuro de verdad para cualquier web desde el clic derecho, con el motor de Dark Reader. | CSS + nativo |
| 6 | **Immersive Web** | Webs transparentes, limpias y con efectos (667 sitios). Sustituye a la extensión Zen Internet con el mismo resultado. Clic derecho → *Zen Inmersivo*. | Nativo |
| 7 | **Live Lyrics** | Letra sincronizada palabra a palabra en YouTube Music. | Nativo |
| 8 | **Crossfade** | Funde el final de cada canción con la siguiente. | Nativo |
| 9 | **Phone Remote** | Controla el YouTube Music del PC desde el móvil: escaneas un QR y listo. | Nativo |
| 10 | **OBS Now Playing** | Le pasa la canción que suena a un widget de OBS. | Nativo |
| 11 | **Web Apps** | Quita la barra lateral vacía de las ventanas de aplicación web. | CSS + nativo |
| 12 | **Agent Indicator** | Una pastilla que avisa cuando un agente de IA maneja el navegador. | CSS |
| 13 | **Privacy Hardening** | Prefs que reducen la superficie de ataque. | Prefs |

## Manual

Cierra Zen antes de empezar. Vas a necesitar dos carpetas:

| | Windows | macOS |
| --- | --- | --- |
| **Carpeta del perfil** | `about:profiles` → tu perfil → *Directorio raíz* → **Abrir carpeta** | igual |
| **Carpeta de instalación** | `C:\Program Files\Zen Browser\` | `/Applications/Zen.app/Contents/Resources/` |

En Windows, escribir en la carpeta de instalación pide permisos de administrador (el Explorador
te lo preguntará).

Las rutas de abajo son relativas a la carpeta de cada mod dentro de `mods/` (Acrylic Glass es
`mods/appearance/acrylic-glass/`, y así con todos).

### Mods de CSS

Acrylic Glass, Motion, Traffic Lights, Agent Indicator y la parte visual de Dark Mode y Web Apps.

1. En `about:config`, pon `toolkit.legacyUserProfileCustomizations.stylesheets` en `true`.
2. En la carpeta del perfil, crea `chrome/userChrome.css` si no existe y pega dentro el
   `chrome.css` de cada mod que quieras, uno detrás de otro.
3. Cada mod trae un `preferences.json` con sus opciones. Por cada entrada, crea la pref en
   `about:config` con su `defaultValue`. Sin ellas, las partes que se pueden apagar se quedan
   apagadas.

**Acrylic Glass** necesita dos cosas más:

4. Copia las líneas de `prefs/acrylic-zen.user.js` y de `prefs/windows.user.js` (o
   `prefs/macos.user.js`) en `user.js`, en la carpeta del perfil (créalo si no existe).
5. Junta estos archivos, en este orden, en `chrome/userContent.css` del perfil:
   `web/00-base.css`, `web/10-wrappers.css`, `web/45-emergentes.css`, `web/50-sites.css` y
   `web/90-exclusions.css`. Esto es lo que vuelve transparentes las webs.

### Mods nativos

1. Copia `core/config.js` en la carpeta de instalación (una sola vez: lo comparten todos los
   mods nativos).
2. Por cada mod, copia su `nativo/config-prefs.js` en `<carpeta de instalación>/defaults/pref/`
   con el nombre de la tabla, y sus archivos en `<perfil>/chrome/<carpeta>/`:

| Mod | Nombre del archivo de prefs | Carpeta en el perfil | Archivos |
| --- | --- | --- | --- |
| Glass Toggle | `zen-sin-cristal.js` | `zen-sin-cristal` | `nativo/proceso.js`, `nativo/ventana.js` |
| Dark Mode | `zen-modo-oscuro.js` | `zen-modo-oscuro` | `nativo/proceso.js`, `nativo/ventana.js`, `motor/darkreader.js` |
| Immersive Web | `zen-inmersivo.js` | `zen-inmersivo` | `nativo/proceso.js`, `nativo/puro.js`, `nativo/servicio.js`, `nativo/ventana.js`, y `catalogo/styles.json` con el nombre `catalogo.json` |
| Live Lyrics | `zen-letra.js` | `zen-letra` | `nativo/proceso.js`, `dist/zen-letra-viva.user.js` |
| Crossfade | `zen-mezcla.js` | `zen-mezcla` | `nativo/proceso.js`, `nativo/puro.js`, `nativo/motor.js` |
| Phone Remote | `zen-remoto.js` | `zen-remoto` | `nativo/proceso.js`, `nativo/puro.js`, `nativo/qr.js`, `nativo/motor.js`, `nativo/servidor.js`, y la carpeta `movil` entera |
| OBS Now Playing | `zen-sintonia.js` | `zen-sintonia` | `nativo/proceso.js` |
| Web Apps | `zen-web-apps.js` | `zen-web-apps` | `nativo/ventana.js` |

3. Abre Zen y la Consola del navegador (**Ctrl+Mayús+J** / **Cmd+Mayús+J**): una línea
   `[nativo] cargador en pie: …` dice qué mods nativos arrancaron.

Dark Mode instalado a mano funciona sin su lista de arreglos por web (`arreglos.json`). El
instalador la genera desde la base de datos de Dark Reader, así que con el instalador algunas
webs se ven mejor.

### Privacy Hardening

Copia las líneas de `mods/utilities/privacy-hardening/00-balanced.user.js` (o `10-strict`, o
`20-paranoid`) en `user.js`, en la carpeta del perfil.

## Desinstalar

```bash
node installer/desinstalar.mjs                     # los mods de CSS
node installer/instalar-<mod>.mjs --desinstalar    # un mod nativo
node installer/restaurar.mjs                       # vuelve a poner la última copia de seguridad
```

A mano: borra lo que copiaste. El cargador (`config.js`) se puede quedar: sin mods nativos en el
perfil, no hace nada.

## Si algo sale mal

- **No cambió nada al instalar.** Cierra Zen del todo (todas las ventanas) y vuelve a abrirlo.
- **Los mods nativos dejaron de ir tras actualizar Zen.** Vuelve a abrir el instalador (ver arriba).
- **Un mod nativo se porta mal.** Cada uno tiene un interruptor de emergencia en `about:config`,
  indicado en su readme. Ponlo en `false` y recarga la página.
- `node dev/tools/doctor.mjs` revisa qué está instalado y qué no.

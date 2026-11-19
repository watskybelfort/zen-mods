# Zen Descargas (Downloader)

Un botón **Descargar** en YouTube y YouTube Music. Un clic y eliges:

- **Canción**: MP3 a la máxima calidad (V0), con portada cuadrada y artista y título en las
  etiquetas. O M4A, el audio original sin recodificar.
- **Vídeo**: MP4 con imagen y sonido, hasta la calidad que elijas (Máx., 1080p, 720p, 480p).
  Se prefiere H.264 + AAC, que abre cualquier reproductor; por encima de 1080p YouTube solo
  tiene VP9/AV1 y se usa eso.

Sin copiar enlaces ni abrir otro programa. Los archivos van a la carpeta de descargas de Zen.

Dónde sale el botón:

| Página | Dónde |
| --- | --- |
| YouTube, vídeo | Una pastilla «Descargar» junto a Me gusta y Compartir |
| YouTube, Shorts | Un botón redondo en la columna de Me gusta / Comentar / Compartir |
| YouTube Music | Una flecha en la barra del reproductor, junto a los otros mods |

El panel enseña el progreso (porcentaje, velocidad y tiempo restante), deja cancelar, reintentar
y abrir el archivo en su carpeta. Al terminar sale un aviso del sistema.

## Cómo funciona

```
pagina (motor.js)  --id de 11 caracteres-->  proceso.js  --cpmm-->  descargador.js (padre)
                                                                        |
                                                              yt-dlp (+ ffmpeg, deno/node)
```

La descarga la hace [yt-dlp](https://github.com/yt-dlp/yt-dlp), lanzado desde el proceso padre de
Zen. Bajar los flujos desde la propia página no sirve: YouTube firma y estrangula las direcciones
y pide tokens que cambian cada pocas semanas; yt-dlp es el proyecto que persigue esos cambios a
diario. El mod tiene su propia copia en `<perfil>/chrome/zen-descargas/bin/` y la actualiza sola
(`yt-dlp -U`, que comprueba el SHA-256) una vez al día, y otra vez si una descarga falla porque
YouTube cambió algo.

## Seguridad

- De la página solo llega el **id** del vídeo (11 caracteres, validado). La URL la arma el mod.
  Ningún script de YouTube puede colar una URL, una opción de yt-dlp ni un comando.
- yt-dlp se lanza con una lista de argumentos, sin shell, y con `--ignore-config`: un
  `yt-dlp.conf` con `--exec` no corre aquí.
- El puente vive en la caja del mod, no en `window`, y el padre vuelve a validar cada mensaje.
- Cola limitada: 2 descargas a la vez, 25 en espera, 30 pedidos por minuto, 45 min por descarga.
- «Mostrar en la carpeta» solo abre archivos que escribió el mod, dentro de la carpeta de
  descargas.
- Los trozos a medio bajar van a una carpeta temporal por descarga, que se borra al terminar,
  cancelar o fallar. Al cerrar Zen se paran yt-dlp y ffmpeg.
- **Usar mi sesión de YouTube** está apagado de fábrica. Si lo enciendes, yt-dlp lee las cookies
  de tu perfil de Zen para lo que pide cuenta (restricción de edad, «confirma que no eres un
  bot»). Las cookies no salen de tu equipo: yt-dlp las usa solo para hablar con YouTube.

Descarga solo lo que tengas derecho a guardar: tus vídeos, contenido con licencia libre o lo que
permita la ley de tu país para uso personal.

## Instalación

```bash
node installer/instalar-descargas.mjs                  # pide administrador; reinicia Zen
node installer/instalar-descargas.mjs --solo-perfil    # tras cambiar el motor
node installer/instalar-descargas.mjs --sin-bajar      # usa yt-dlp y ffmpeg del sistema
node installer/instalar-descargas.mjs --desinstalar    # lo descargado se queda
```

El instalador:

1. Baja yt-dlp de su release oficial de GitHub y lo compara con `SHA2-256SUMS`.
2. Busca ffmpeg en el sistema (PATH, winget, Homebrew). Si no está, en Windows baja la build que
   recomienda yt-dlp ([yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds)), también
   comprobada por SHA-256. En macOS: `brew install ffmpeg`.
3. Busca Deno para los retos de JavaScript de YouTube; si no está, usa Node.
4. Apunta lo encontrado en `herramientas.json`.

Sin ffmpeg el mod sigue funcionando, pero solo baja el audio tal cual (M4A) y el mejor vídeo que
ya venga con sonido.

## Prefs

| Pref | Por defecto | Qué hace |
| --- | --- | --- |
| `zen.descargas.encendido` | `true` | Apagado de emergencia |
| `zen.descargas.calidad` | `1080` | `max`, `2160`, `1440`, `1080`, `720`, `480` |
| `zen.descargas.audio` | `mp3` | `mp3` o `m4a` |
| `zen.descargas.cookies` | `false` | Usar la sesión de YouTube de Zen |
| `zen.descargas.avisos` | `true` | Aviso del sistema al terminar |

## Pruebas

```bash
node dev/tools/probar-descargas.mjs           # la parte pura, sin navegador
node dev/tools/probar-descargas.mjs --vivo    # además baja un vídeo de 19 s en MP3 y MP4 y lo mira con ffprobe
bash mods/youtube-music/downloader/sonda/copia.sh crear      # copia de Zen aparte, minimizada
bash mods/youtube-music/downloader/sonda/copia.sh arrancar
node mods/youtube-music/downloader/sonda/vivo.mjs ir https://www.youtube.com/watch?v=jNQXAC9IVRw
node mods/youtube-music/downloader/sonda/vivo.mjs ver
node mods/youtube-music/downloader/sonda/vivo.mjs clic <x> <y>
```

Comprobado el 19-11-2026 en la copia (Zen con perfil limpio, sin sesión): el botón en un vídeo,
en los Shorts y en YouTube Music; vídeo y canción desde el panel; MP3 de 264 kbps con portada de
720×720 y etiquetas; MP4 con imagen y sonido; «Terminando…» mientras convierte; cancelar sin dejar
procesos ni `.part`.

Medido: YouTube contesta 403 a una de cada tres descargas de vídeo, al azar. El mod reintenta solo
hasta dos veces con direcciones nuevas.

Sin comprobar: «Mostrar en la carpeta» y el aviso del sistema (abren ventanas en el escritorio) y
la sesión de YouTube con una cuenta real.

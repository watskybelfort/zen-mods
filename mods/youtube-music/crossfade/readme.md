# Zen Mezcla

Funde el final de una canción con el principio de la siguiente en YouTube Music, sin segundo
reproductor. Guarda el final de la canción actual desde lo que el reproductor ya descargó y lo
deja sonando en Web Audio mientras el reproductor pasa a la siguiente.

**Estado: instalado el 04-11-2026. Falta probarlo con una sesión real.** Ver *Qué falta*.

El boton de la barra del reproductor abre el panel: encender y apagar, duracion del fundido (3 a
12 s), mezclar tambien en discos, y que calidad esta sonando de verdad.

## Instalacion

```bash
node installer/instalar-mezcla.mjs                  # pide administrador, reinicia Zen
node installer/instalar-mezcla.mjs --solo-perfil    # tras cambiar el motor
node installer/instalar-mezcla.mjs --desinstalar
```

Apagado de emergencia: `zen.mezcla.encendido` en `false` y recargar la pestana.

Diagnostico, en la consola de la pagina: `window.__zenMezcla.estado()` y `.registro()`.

## Pruebas

```bash
node dev/tools/probar-mezcla.mjs          # la parte pura, sin navegador
bash mods/youtube-music/crossfade/sonda/copia.sh crear      # copia de Zen, perfil en blanco, sin sonido
bash mods/youtube-music/crossfade/sonda/copia.sh arrancar
node mods/youtube-music/crossfade/sonda/casos.mjs           # las reglas, contra el reproductor real
node mods/youtube-music/crossfade/sonda/vivo.mjs 1          # una mezcla completa
```

La copia usa el puerto 9344: el 9333 puede estar ocupado por otra app de Chromium.

**Limite de la sesion anonima.** Sin cuenta, solo `dQw4w9WgXcQ` aguanta saltos y aceleraciones.
Las demas se atascan, con el mod apagado o encendido (`mods/youtube-music/crossfade/sonda/salto.mjs`).

## Que falta

Comprobado contra el reproductor real, en una copia sin sesion: mezcla completa con Opus y con AAC,
apagada, repetir una, salto de posicion, pausa, siguiente durante el fundido, volumen y silencio
antes y durante el fundido, y corte si entra un anuncio.

Sin comprobar, porque hace falta una sesion real:

- Varias mezclas seguidas por la cola de verdad. Sin sesion, las canciones se quedan sin audio hacia
  el segundo 50, con el mod apagado o encendido. Solo `dQw4w9WgXcQ` llega al final.
- El formato que recibe una cuenta Premium.
- La conexion tras un primer gesto con autoplay bloqueado: la prueba se cruzo con un anuncio. Sin
  conectar no hay mezcla, pero tampoco silencio: el video sigue sonando por su camino normal.
- Como suena: las curvas estan medidas, no escuchadas.

Si algo falla: `window.__zenMezcla.registro()` en la consola de la pagina.

# Zen Mezcla — plan

Transiciones entre canciones en YouTube Music, al estilo de AutoMix de Apple Music, y qué se
puede hacer de verdad con la calidad de audio. Escrito el 04-11-2026, con Zen 1.24b.

Estado: **N1 implementado e instalado; ver `mods/youtube-music/crossfade/readme.md`, *Que falta***. N2 y N3 sin empezar. Lo marcado MEDIDO salió de las sondas de `mods/youtube-music/crossfade/sonda/`,
en una copia de Zen sin sesión (cuenta anónima, itag 251).

## 1. La calidad: qué se puede y qué no

No se puede convertir YouTube Music en lossless. Lo que se pierde al codificar a Opus o AAC no
vuelve, y ningún procesado lo recupera. El techo es lo que YouTube entrega: 256 kbps en el ajuste
más alto (Normal son 128 kbps), contra ALAC de hasta 24 bit/48 kHz, o 24/192 en Hi-Res, en Apple.

Lo que sí se puede atacar, ordenado por lo que seguramente pesa más:

| Causa posible de la diferencia | Qué se hace | Estado |
| --- | --- | --- |
| No se recibe el máximo. Sin sesión llega itag 251, ~129 kbps de media | Indicador de calidad real en el mod | MEDIDO sin sesión. **Falta medir la tuya** |
| Se oye la versión de videoclip, no la pista de estudio | Avisar cuando suena una versión de video | Por diseñar |
| Volumen distinto entre canciones | Igualar con `trackAbsoluteLoudnessLkfs`, que ya viene dado | MEDIDO: el dato existe |
| Tono de la cadena de reproducción | EQ/mejorador opcional, con comparación A/B | Es color, no resolución. Se dice así en la interfaz |

Queda descartado:

- **Suplantar clientes para forzar el itag 774** (tipo YTSpoofingStream): pone en riesgo la cuenta
  y se rompe con cada cambio de YouTube.
- **"Upscaling" de audio con IA**: inventa contenido, no recupera el original.

MEDIDO y buena noticia: pasar el audio por Web Audio no lo degrada. Salida frente a reproductor
crudo: −167 dB. El contexto corre a 48 kHz, igual que el Opus, sin remuestreo.

Loudness MEDIDO (objetivo de YouTube −7 LKFS): −13,0, −9,8 y −15,3 LKFS, todas con volumen
100%/100%. En esos casos no se subió nada. Falta medir un máster más fuerte que −7.

## 2. La mezcla: la idea central

Lo habitual necesita un segundo reproductor (varias pestañas, como SyncMix) o pedir la URL de la
siguiente canción (como el plugin `crossfade` de th-ch/youtube-music). Lo segundo depende de los
cambios de YouTube en SABR y PO tokens; lo primero duplica sesión, anuncios y memoria.

**Aquí se hace al revés: no se adelanta la canción siguiente, se guarda el final de la actual.**

El reproductor mete el audio por `SourceBuffer.appendBuffer` mucho antes de sonar. Se copian esos
bytes, se decodifica el final a PCM con `decodeAudioData`, y ese PCM (la "cola") sigue sonando en
Web Audio mientras el reproductor único ya ha pasado a la siguiente canción.

```
 <video> (acaba la vieja, entra la nueva) ── gM ──┐
                                                  ├── salida
 cola en AudioBuffer (final de la vieja) ─── gT ──┘
```

Secuencia:

1. A `fin - (fundido + margen)`, decodificar la cola, ya capturada.
2. Arrancar la cola inaudible, medir su desfase con el reproductor y corregirlo.
3. Relevo de 20 ms: suena la cola, el reproductor queda en silencio.
4. `nextVideo()`. La cola sigue sonando, así que da igual lo que tarde en cargar.
5. Al entrar la nueva, curva de igual potencia: sube una, baja la otra.

Sin URLs, sin tokens, sin segunda sesión, y funciona con lo que el reproductor ya bajó.

### Lo MEDIDO

| Pregunta | Resultado |
| --- | --- |
| ¿Se capturan los bytes? | Sí, `audio/webm; codecs="opus"`, sin DRM (`mediaKeys: null`) |
| ¿Gecko los decodifica? | Sí: 100 s en 472 ms; 43 s desde un cluster en 117–170 ms |
| ¿Sirve solo la parte final? | Sí: init + bytes desde un Cluster, con su Timecode como base |
| ¿Está bajado el final a tiempo? | Sí: tras saltar, a 35 s del final. En marcha normal, ~56 s por delante |
| ¿Cuánto tarda la siguiente? | 846–1557 ms, sin sesión. La cola lo cubre |
| Cola frente al reproductor | **0 muestras, nulo −177 dB**: la misma señal |
| Empalme | Salida frente a cola −171 dB, frente al reproductor −167 dB |
| ¿`nextVideo()` afecta a la cola? | No: correlación mínima 1,00000 en 1,71 s |
| ¿Mismo `<video>` entre canciones? | Sí. `MediaSource` nuevo por canción (y por anuncio) |
| Ganancia reproductor/cola | 1,0000 a volumen 100% |

Son pocas pasadas y casi todas sobre una canción: valen como prueba de que el camino funciona, no
como estadística. El arranque "a ojo" se desvió −12, −23 y −84 ms entre pasadas: el desfase NO es
fijo, por eso el paso 2 mide siempre.

### Trampas encontradas

- **`audioWorklet.addModule` da AbortError** con blob: y con data: en la página (la CSP). Sin
  worklet en el camino de audio; condiciona el time-stretch (ver N3).
- **Asignar `buffer` a una fuente vacía los arrays de `getChannelData`**: copiar antes.
- **`playbackTime` de ScriptProcessor no sirve para alinear**: difiere entre nodos. Se compara por
  canales de UN solo nodo (ChannelMerger): reproductor por uno, cola por otro.
- **Una canción (CevxZvSJLk8) acabó en "Something went wrong"** tras el salto de posición, sin
  sesión. La misma prueba con otra canción no falla. Causa sin confirmar: se aclara en F1.

## 3. Niveles

- **N1, fundido inteligente.** Cola + igual potencia + igualar loudness + recortar el silencio
  final, que se calcula del PCM. Es la base, siempre disponible.
- **N2, encaje a ritmo.** BPM y pulsos de la cola y del inicio de la siguiente, retrasando la
  entrada para que caigan los golpes juntos, y ajuste fino con `playbackRate` hasta ±3% (cambia un
  poco el tono, como el pitch de un DJ). Solo con confianza alta; si no, N1.
- **N3, estirado sin cambiar el tono.** Lo más parecido a AutoMix. No hace falta worklet: se puede
  renderizar la cola a un AudioBuffer por adelantado. Por investigar: si WASM pasa la CSP; si no,
  WSOLA en JS.

Límite honesto: se ha especulado que Apple tiene el análisis ya calculado para su catálogo, sin
confirmar. Aquí la siguiente canción solo se conoce cuando el reproductor empieza a bajarla, y que
sus primeros segundos lleguen con tiempo para N2 está sin medir. Habrá pares que se queden en N1.

## 4. Reglas

Se mezcla solo en un final natural, con siguiente canción en cola.

No se mezcla, y se comporta como hoy, si: hay anuncio, repetir una, no hay siguiente, la cola no
está completa, la canción es muy corta o el usuario saltó dentro del tramo final. Discos sin pausas
(mismo álbum consecutivo): opción, por defecto sin mezcla.

Durante la mezcla: pausa suspende también la cola; `siguiente` corta la cola en ~300 ms; saltar de
posición la cancela; el volumen y el silencio del reproductor mandan también en la cola (falta
medir si `video.volume` llega a la rama de Web Audio).

**Fallo seguro.** `createMediaElementSource` no se puede deshacer y, con el contexto suspendido,
puede dejar el video mudo. Solo se conecta con el contexto en `running`; si algo falla se deja de
mezclar, no de sonar. Interruptor `zen.mezcla.encendido`, como `zen.sintonia.encendido`.

Memoria: bytes solo de la canción actual (~1,6 MB por 100 s a 129 kbps) y PCM solo de la cola.

## 5. Dónde vive

Mod propio y separado, con la forma de Sintonía:

```
mods/youtube-music/crossfade/src/               captura, cola, grafo, director, reglas, indicador
mods/youtube-music/crossfade/nativo/            proceso.js (document-element-inserted) y config-prefs.js
installer/instalar-mezcla.mjs
dev/tools/probar-mezcla.mjs   pruebas sin navegador (EBML, curvas, reglas)
dev/contract/zen-mezcla.json  frontera con el reproductor
```

Letra Viva y Sintonía saltarán a la canción nueva cuando entre; se comprueba que no se confundan
con el relevo.

Dependencias frágiles, para el contrato: `MediaSource`/`SourceBuffer`, `#movie_player`
(`nextVideo`, `getPlayerResponse`, `getStatsForNerds`), `audioConfig.trackAbsoluteLoudnessLkfs`.

Seguridad: sin red, sin secretos y sin puente de datos privilegiado; solo en `music.youtube.com`.

## 6. Fases

| Fase | Entrega | Se da por buena cuando |
| --- | --- | --- |
| **F0** | Medir tu sesión real: itag, loudness, versión | Se conoce tu formato y un máster fuerte |
| **F1** | Captura en el inyector real, recorte por Clusters con saltos de posición | 20 canciones seguidas, y el error de la sección 2 aclarado |
| **F2** | Grafo y conexión segura | Con el mod encendido y sin mezclar, nulo < −120 dB y sin mudo al restaurar sesión |
| **F3** | Relevo + N1 + reglas | Prueba viva con nulo, y cada regla de la sección 4 probada |
| **F4** | Indicador de calidad y ajustes | Se ve formato real, duración del fundido, encendido |
| **F5** | Tu oído: una hora de música | Curvas ajustadas, con todo lo demás ya verificado |
| **F6** | N2 | Golpes alineados en pares medidos, caída limpia a N1 |
| **F7** | N3 y EQ opcional, si tras F5 hacen falta | Se decide entonces |

Un commit por pieza terminada; el release, al final.

## 7. Cómo repetir las sondas

Copia de Zen con perfil en blanco, `media.volume_scale=0.0`, autoplay permitido y teclas multimedia
apagadas, minimizada y con `--remote-debugging-port 9333 --remote-allow-system-access`.

```bash
node mods/youtube-music/crossfade/sonda/medir.mjs <videoId>
```

## Fuentes

- Calidades: https://support.google.com/youtubemusic/answer/9076559
- Apple lossless: https://support.apple.com/en-ng/118295
- AutoMix: https://musictech.com/news/gear/apple-music-automix-ai/
- Plugin crossfade: https://github.com/th-ch/youtube-music
- SyncMix: https://www.chromeboard.com/extension/syncmix-ytm-beatmatched-c-gkadacfgimieldlpdallcdfnodkfjhlp
- SABR y PO tokens: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- Estirado: https://github.com/bungee-audio-stretch/bungee y https://npmjs.com/package/signalsmith-stretch

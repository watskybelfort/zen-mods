# Zen Remoto

Controla desde el móvil el YouTube Music que suena en el PC: qué suena, pausa, siguiente,
posición, volumen del PC, me gusta, aleatorio, repetir, buscar (con sugerencias y filtros),
álbumes, artistas, tu biblioteca, la cola y la letra en tiempo real (de Zen Letra Viva, si está
instalado: botón de la cabecera de "Sonando"; tocar una línea salta a ese momento).

No es una app: es una página que sirve el propio Zen en la red de casa. Se abre en Safari
(o cualquier navegador) y se puede añadir a la pantalla de inicio.

## Uso

1. En music.youtube.com, en el PC, pulsa el botón del móvil de la barra del reproductor.
2. Escanea el QR con la cámara. O abre la dirección que sale y escribe el código de 6 cifras.
3. Listo. El móvil queda emparejado un año, o hasta "Olvidar móviles" en ese mismo panel.

El móvil tiene que estar en la misma wifi que el PC.

**El emparejamiento dura.** El móvil queda guardado en el perfil de Zen (sobrevive a reiniciar
el PC) y la cookie dura un año. Dos avisos:

- La dirección es la IP del PC, que da el router por DHCP. Si algún día cambia, el enlace guardado
  deja de abrir. Para que no cambie nunca: reservar esa IP para el PC en el router. El nombre
  `<nombre-del-pc>.local` no se usa: Windows lo publica con las cinco IPs del equipo (Radmin, ZeroTier,
  WSL...) y el iPhone podría elegir una que no sirve.
- En iOS, la app de la pantalla de inicio tiene sus propias cookies, aparte de Safari: dentro de
  ella hay que emparejar una vez escribiendo el código.

## Instalación

```bash
node installer/instalar-remoto.mjs                  # pide administrador; reinicia Zen
node installer/instalar-remoto.mjs --solo-perfil    # tras cambiar el motor o la página
node installer/instalar-remoto.mjs --solo-instalacion   # tras actualizar Zen
node installer/instalar-remoto.mjs --desinstalar
```

Prefs: `zen.remoto.encendido` (cierra el puerto al momento) y `zen.remoto.puerto` (8642).

Diagnóstico: consola del navegador (Ctrl+Shift+J), líneas `[remoto]`. En la página de
YouTube Music, `window.__zenRemoto.estado()` y `.registro()`.

## Cómo está hecho

| Pieza | Dónde corre | Qué hace |
| --- | --- | --- |
| `nativo/servidor.js` | proceso padre, una vez | HTTP con nsIServerSocket, emparejado, sesiones, relevo |
| `nativo/proceso.js` | procesos de contenido | inyecta el motor y hace de puente por el message manager |
| `nativo/motor.js` | pestaña de YouTube Music | estado, órdenes y el panel con el QR |
| `nativo/puro.js` | pestaña y padre | extractor de la API de YouTube Music y validación |
| `nativo/qr.js` | pestaña | QR modo byte, nivel M, v1-10 |
| `movil/` | el móvil | la página (Geist y Phosphor, licencias al lado) |

El motor usa las piezas de la propia página, medidas el 15-11-2026:
`networkManager.fetch` (la API con la sesión del usuario), `inst.handleNavigationEndpoint`
(solo con endpoints completos), `ADD_ITEMS` de la cola y `getState()`.

## Seguridad

- Solo contesta a IPs privadas; Radmin VPN (26.x) no entra. ZeroTier sí llega, pero necesita
  el código, que solo se ve en la pantalla del PC.
- Código de un solo uso que solo existe con el panel abierto y caduca a los 5 minutos;
  5 fallos por IP o 20 en total lo bloquean 10 minutos.
- Cookie HttpOnly SameSite=Strict de 32 bytes al azar; se guarda solo su SHA-256. Salir y
  "Olvidar móviles" la invalidan en el servidor.
- Host tiene que ser IP literal (DNS rebinding), POST solo con Origin igual al Host (CSRF),
  límite de peticiones por IP, de cuerpo, de conexiones y de tiempo, CSP estricta.
- El movil nunca manda un endpoint: recibe referencias cortas a los que dio la página.
- **Sin TLS**: es HTTP dentro de la wifi. Alguien en la misma wifi podría ver la cookie.
  En casa vale; en una red ajena, mejor "Olvidar móviles" al terminar.

## Pruebas

```bash
node dev/tools/probar-remoto.mjs          # parte pura, sin navegador (16 casos, QR contra python)
bash mods/youtube-music/phone-remote/sonda/copia.sh crear      # copia de Zen, perfil en blanco, puerto 8643
bash mods/youtube-music/phone-remote/sonda/copia.sh instalar
bash mods/youtube-music/phone-remote/sonda/copia.sh arrancar
node mods/youtube-music/phone-remote/sonda/vivo.mjs            # hace de móvil contra el servidor real (33 casos)
node mods/youtube-music/phone-remote/sonda/capturas.mjs        # capturas a 390x844
```

Comprobado el 15-11-2026 en la copia, sesión anónima: 33/33. Sin comprobar con una sesión
real: biblioteca, me gusta y las playlists propias. En las capturas de una pestaña de fondo
las animaciones no avanzan: la hoja de acciones sale invisible aunque esté puesta (medido).

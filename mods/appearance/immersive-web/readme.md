# Zen Inmersivo

Sustituto nativo de la extensión **Zen Internet** (sameerasw): la web transparente,
limpia y con efectos. Lo que oculta, la transparencia, los efectos al pasar el ratón,
el buscador inmersivo de YouTube, la barra lateral de YouTube Music que aparece al
acercar el ratón... todo sale del mismo catálogo que usa la extensión
(`styles.json` de [my-internet](https://github.com/sameerasw/my-internet), MIT):
667 webs y más de 2000 funciones.

## Qué hace, igual que la extensión

- Para cada web aplica su tema, con las mismas reglas de la extensión
  (`+dominio`, `-nombre`, alias, tema genérico forzado). Comprobado byte a byte
  contra el motor original en 1351 webs (`node dev/tools/probar-inmersivo.mjs`).
- Cada función de cada web se puede apagar.
- Interruptores globales: estilos, transparencia, efectos al pasar el ratón, pies de
  página, ajustes para Dark Reader, forzar en webs sin tema, listas blanca o negra.
- Fondo de respaldo por web (sólido en vez de transparente).
- Baja el catálogo nuevo cada 2 horas.
- El chat en directo de YouTube se mueve, cambia de tamaño y de opacidad en modo cine.
- El aviso animado al usar los atajos.

## Controles

- **Clic derecho > Zen Inmersivo**: las funciones de la web en la que estás, el fondo
  de respaldo y los ajustes generales.
- **Alt+Mayús+U** estilos en esta web · **Alt+Mayús+G** en todas · **Alt+Mayús+O**
  transparencia · **Alt+Mayús+B** fondo de respaldo.

## Instalación

```bash
node installer/instalar-inmersivo.mjs                 # pide administrador; reinicia Zen
node installer/instalar-inmersivo.mjs --solo-perfil   # tras cambiar el motor
node installer/instalar-inmersivo.mjs --desinstalar
```

Al instalarse desactiva la extensión Zen Internet una vez (se vuelve a encender en
`about:addons`). Mientras la extensión esté activa, el mod no pinta nada.

Apagado de emergencia: `zen.inmersivo.encendido` en `false`.

## Cómo está hecho

| Pieza | Dónde corre | Qué hace |
| --- | --- | --- |
| `nativo/puro.js` | padre, ventanas y páginas | qué CSS va en cada web (traducción fiel de background.js 3.2.0) |
| `nativo/servicio.js` | proceso padre | catálogo (incluido y bajado), ajustes, publicación por sharedData |
| `nativo/proceso.js` | páginas | `<style id="zeninternet-styles">`, aviso y chat movible |
| `nativo/ventana.js` | cada ventana | clic derecho y atajos |
| `catalogo/` | | el catálogo incluido, con su licencia y versión |
| `referencia/` | | la extensión original (MIT), para la prueba de paridad |

El `<style>` lleva el mismo id que el de la extensión: Zen Sin Cristal y la capa web
de Acrylic Zen ya sabían convivir con él.

## Créditos

Catálogo y extensión: [sameerasw](https://github.com/sameerasw), licencia MIT
(`catalogo/LICENSE`, `referencia/zeninternet-3.2.0/LICENSE`).

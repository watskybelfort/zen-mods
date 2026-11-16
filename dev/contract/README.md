# El contrato

De que depende cada mod fuera de si mismo, escrito en un formato que las
herramientas puedan leer. No es documentacion decorativa: es la entrada de
`dev/tools/probar-contrato.mjs`, `dev/tools/probar-vivo.mjs` y `dev/tools/doctor.mjs`.

Un archivo por mod, mas `instalador.json` para lo que replica el instalador de
`ZenMods.mjs`, que no es CSS pero rompe igual.

## Esquema

```json
{
  "mod": "acrylic-zen",
  "name": "Acrylic Zen",
  "verificado_en": "Zen 1.21.9b / Gecko 153 / BuildID 20260725024203",
  "hooks": [ ... ]
}
```

Cada entrada de `hooks`:

| Campo | Que es |
| --- | --- |
| `token` | como se escribe en el CSS, para que lo lea una persona: `.zen-browser-generic-background` |
| `buscar` | la cadena literal que se busca dentro del `omni.ja`, sin `#`, `.` ni corchetes |
| `kind` | `id` · `class` · `attr` · `var` · `pref` · `media` · `api` |
| `owner` | `zen` (equipo pequeno, sin compromiso de estabilidad) o `firefox` (cambia mucho menos) |
| `severity` | `critico` el mod deja de hacer su trabajo · `degrada` pierde una parte · `cosmetico` un detalle |
| `declarado_en` | donde lo declara Zen, medido, no supuesto |
| `para` | que hace el mod con eso |
| `si_falta` | que se rompe y por donde empezar a buscar el nombre nuevo |

Opcionales:

| Campo | Cuando |
| --- | --- |
| `opcional: true` | el token **debe** poder faltar: es un nombre historico que se conserva para que el mismo CSS valga en versiones viejas de Zen. El verificador no se queja |
| `motivo` | por que es opcional |
| `comprobable` | `false` no hay forma de comprobarlo · `"vivo"` solo preguntandole al navegador. Por defecto se comprueba contra el `omni.ja` |
| `motivo_no_comprobable` | por que, medido |
| `plataformas` | lista (`windows` · `macos` · `linux`) donde ese enganche existe. Sin ella, se comprueba en todas. Hace falta porque el cristal tiene dos motores: `widget.windows.mica.toplevel-backdrop` no existe en la build de macOS y `zen.widget.macos.window-material` no existe en la de Windows, asi que sin marcarlos cada sistema informaria de que le falta la mitad del contrato del otro |

## Las afirmaciones de efecto

`testigo` y `vivo` los usa `dev/tools/probar-vivo.mjs`, que mide sobre el navegador
abierto. Que un nombre exista no prueba que el efecto ocurra.

| Campo | Que es |
| --- | --- |
| `testigo` | una variable CSS que **solo declara ese mod**, leida del documento. Es el unico check de extremo a extremo: si esta vacia, el CSS del mod no esta aplicandose y lo demas sobra |
| `vivo[]` | afirmaciones de efecto: `que` (que se afirma), `js` (se ejecuta en el chrome, con `return`), `espera` (valor exacto, `no-vacio`, o `regex:<patron>`), `severity` |

Y dos campos de `hooks` que solo importan en vivo:

| Campo | Cuando |
| --- | --- |
| `transitorio: true` | el elemento solo existe en cierto estado de la interfaz (las filas de resultados con el buscador abierto, el overlay de Glance). Ausente no es roto, y contarlo como fallo hace que el informe grite cada vez |
| `sin_default: true` | la pref existe pero no tiene valor por defecto registrado, asi que `getPrefType` devuelve 0 sin que pase nada malo. Medido en `javascript.options.jit_trustedprincipals`, cuya cadena esta dentro de la libreria del motor |

## Las lineas base

Las escribe `dev/tools/probar-contrato.mjs --actualizar-linea-base`. No son contratos
—el cargador las filtra por forma— sino la foto del estado de todos los enganches
el dia que se valido, mas la version de Zen y el `sha256` de `ZenMods.mjs`. Sirven
para que el informe diga que ha CAMBIADO en vez de solo que hay.

Hay **una por plataforma**, y no se pueden compartir:

| Archivo | Plataforma |
| --- | --- |
| `baseline.json` | Windows. Se queda sin sufijo por compatibilidad: es el que ya existia, con su historial |
| `baseline.macos.json` | macOS |

El estado esperado de la mitad de los enganches del cristal es distinto en cada
sistema —lo que en uno es `ok` en el otro es `otra-plataforma`—, asi que una sola
linea base daria una pagina entera de "cambios" en cuanto se ejecutara en el otro,
y esa pagina es exactamente lo que hace que se deje de mirar el informe.

Se reescribe cuando se ha comprobado a mano que con esa version todo va bien.

## La otra linea base: `zeninternet.json`

No es de Zen sino de la extension Zen Internet, y no la escribe
`probar-contrato` sino `dev/tools/probar-zeninternet.mjs --actualizar-linea-base`.
Guarda el `sha256` de cada hoja suya que cae en un dominio con bloque en
`mods/appearance/acrylic-glass/web/50-sites.css` (o en `SIN_EXTENSION` de Zen Sin Cristal), con cuantos
`backdrop-filter` trae. Existe porque esas hojas cambian solas cada dos horas
desde su repositorio, y donde se cruzan con un bloque nuestro un cambio suyo es
un sitio que hay que volver a mirar. El cargador de contratos la ignora por
forma, igual que las de arriba.

Se reescribe igual: despues de abrir los sitios que el informe senale.
Actualizarla a ciegas convierte un fallo nuevo en el estado normal.

## Reglas al editarlo

- **`declarado_en` se mide.** Se abre el `omni.ja` y se busca. Un `declarado_en`
  inventado es peor que vacio, porque manda a buscar donde no esta.
- **`severity` no es una opinion.** Es lo que decide si el informe grita o
  informa. Si todo es critico, el informe no sirve para nada.
- **Al renombrar, se anaden dos entradas**, no se edita una: la nueva y la vieja
  con `opcional: true`. Asi el CSS y el contrato cuentan la misma historia y el
  mod vale para las dos versiones de Zen.
- **Lo que no es comprobable se marca**, con el motivo medido. Un verificador que
  da falsas alarmas se deja de mirar, y entonces no verifica nada.

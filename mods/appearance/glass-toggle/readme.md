# Zen Sin Cristal

Apaga el acrilico en un sitio concreto, desde el propio navegador, sin tocar CSS
y sin reinstalar nada. Clic derecho en la pagina > **Zen Cristal > Ver
ejemplo.com sin cristal**, y esa web vuelve a verse como se ve en un navegador
normal.

Existe por el limite que el README general ya cuenta y que no tiene arreglo
automatico: el cristal va tenido de oscuro, y una web que se pinta en claro y no
sabe pintarse oscura acaba con su texto negro sobre el acrilico. `web/` trae una
lista de rescate para los sitios conocidos, pero esa lista no puede adivinar la
web a la que entraste hoy por primera vez. Esto es el interruptor para esa web.

## Que pasa al pulsarlo

```
submenu del clic derecho       ventana.js escribe zen.sincristal.sitios
        |
        v
pref replicada a los procesos  Gecko, solo
        |
        v
proceso.js marca el documento  <html zen-sin-cristal>
        |                      y apaga la hoja de la extension
        v
el CSS deja de aplicar         las guardas de mods/appearance/acrylic-glass/web/00-base y compania
```

Tres piezas y una sola direccion. Ninguna pinta nada: lo unico que ocurre es que
las reglas que vacian el fondo dejan de casar, asi que la pagina recupera **su**
fondo —su color, su imagen, su degradado— y no un sustituto nuestro.

Se nota en el acto, sin recargar: la pref llega replicada a los procesos de
contenido y el inyector repasa los documentos que ya estaban abiertos.

## Instalar

```
node installer/instalar-sin-cristal.mjs
```

Necesita escribir en el directorio de instalacion de Zen (en Windows,
normalmente `C:\Program Files\Zen Browser`), porque ahi va el cargador de
autoconfig. Es la misma pieza compartida que usan Zen Letra Viva y Zen Sintonia:
instalar este no desarma aquellos. Reinicia Zen del todo despues.

Para quitarlo: `node installer/instalar-sin-cristal.mjs --desinstalar`.

## Lo que se guarda

Dos prefs, las dos en `about:config`:

| Pref | Que es |
| --- | --- |
| `zen.sincristal.sitios` | la lista, separada por comas. Se escribe sola, pero es texto normal y se puede editar a mano |
| `zen.sincristal.encendido` | el interruptor general. En `false` vuelve el cristal en todos los sitios sin vaciar la lista |

No se asoman al panel de mods a proposito: las opciones que salen ahi las siembra
el instalador de la capa web en cada pasada, asi que la lista se vaciaria sola
cada vez que se reinstala. Es el unico dato del mod que escribes tu, y no puede
vivir donde algo lo pisa.

Un dominio cubre sus subdominios y no cruza sufijos, exactamente igual que el
`domain()` de las reglas del CSS: `ejemplo.com` apaga `www.ejemplo.com` pero
**no** `ejemplo.com.co`. Lo que se apunta es el dominio base, no el host: da
igual en que subdominio estuvieras al pulsar.

## La extension que hacia lo mismo

Nuestra capa web no es la unica que deja las paginas transparentes. Si tienes
instalada **Zen Internet** (`{91aa3897-2634-4a8a-9092-279db23a7689}`), esa
extension hace lo mismo por su cuenta, y durante un tiempo el interruptor apagaba
nuestro cristal y dejaba el suyo: desde fuera parecia que el menu no hacia nada.

Ahora tambien se apaga. La extension cuelga un `<style id="zeninternet-styles">`
como ultimo hijo de `<head>` y lo re-ancla con un observador propio; el inyector
le pone `media="not all"` mientras el sitio este en la lista, y se lo quita en
cuanto sale. Se elige eso y no borrar el nodo a proposito: borrarlo despierta al
observador de la extension, que lo vuelve a montar, y acabariamos los dos
pegandonos por el mismo nodo. Ella escribe `textContent` y llama a `appendChild`,
pero no toca `media` en ninguna parte, asi que no hay propiedad en disputa.

**Por que `media` y no `disabled`, que fue lo primero y fallaba a ratos.**
`disabled` no es del `<style>` sino de la hoja que tiene en ese momento, y la
extension reescribe `textContent` cada vez que activas la pestana, en cada
navegacion y cada vez que baja estilos nuevos. Cada reescritura monta una hoja
nueva que nace encendida, y como el nodo no se mueve de sitio no hay mutacion en
`<head>` que avise. El sintoma era un interruptor que funcionaba al pulsarlo y
dejaba de funcionar al volver a la pestana. `media` es un atributo del elemento:
lo heredan todas las hojas que se monten a partir de el. Medido el 24-09-2026
reescribiendo el contenido tres veces sobre un sitio apagado: `disabled` volvia
a `false` en la primera, `media` seguia en `not all` en las tres.

Sus ajustes no se tocan: en el panel de la extension el sitio sigue figurando
encendido. Es deliberado —el interruptor es nuestro y no le reescribe la
configuracion a nadie—, y significa que su atajo `Alt+Shift+U` y este menu son
dos apagados independientes que no se estorban.

Si no la tienes instalada, no pasa nada: no hay hoja que apagar y el mod ni la
busca.

### Y los sitios donde su hoja va apagada siempre

Hay sitios donde la hoja de la extension se apaga **con el cristal puesto**: los
de la lista `SIN_EXTENSION` de `nativo/proceso.js`. Son sitios con bloque propio
en `mods/appearance/acrylic-glass/web/50-sites.css` que Zen Internet tambien estiliza, y donde las dos capas se
pisan. La suya esta pensada para su cristal, no para el nuestro: trae
`backdrop-filter`, que sobre una pagina vaciada se compone en negro, y velos
oscuros que encima del nuestro son manchas. Y se actualiza sola desde su
repositorio cada dos horas, asi que un sitio que hoy se ve bien puede dejar de
verse bien sin que nadie toque nada aqui. Con su hoja fuera, el bloque medido es
la unica fuente.

Hoy la lista es solo `chatgpt.com`, comparado con y sin su hoja el 24-09-2026:
sin ella, cristal limpio; con ella, una burbuja al 30% de negro detras de cada
respuesta y un degradado negro del 34% en el pie. Un sitio entra en la lista
solo despues de esa comparacion, y cuando entra su bloque tiene que valerse
solo: en ChatGPT hubo que darle fondo a los menus, que hasta entonces ponia ella.

Es codigo y no una pref a proposito: forma parte del catalogo igual que los
bloques de `50-sites.css`, y una pref de texto nueva no llegaria a los procesos
de las paginas sin declararla antes en el directorio de instalacion.

## Lo que NO apaga, dicho antes de que sorprenda

- **Los iframes de otro dominio.** La marca se decide por el host de cada
  documento, y un iframe de terceros es otro documento con otro host. El de la
  pagina que estas viendo, y los suyos propios, si entran.
- **Las paginas sin dominio** (`about:`, `file:`, el visor de PDF). No se pueden
  apuntar en una lista de dominios, asi que la entrada del menu ni aparece.
  Esas tienen su propio trato fijo en `mods/appearance/acrylic-glass/web/90-exclusions.css`.
- **`localhost` en varios puertos.** Se apunta el host, sin puerto: apagar uno
  los apaga todos.

## Por que un atributo en `<html>` y no una hoja de estilos

Porque devolver un fondo desde fuera no se puede, y conviene saberlo antes de
intentarlo. Las reglas del cristal viven en una hoja de **usuario** con
`!important`, y en ese origen solo las gana el navegador. Para deshacerlas habria
que escribir un valor, y el valor que se quiere —el que puso el autor de la
pagina— no se puede nombrar: `revert` desde origen usuario retrocede al del
navegador y se salta justo eso. Un `background-color: Canvas` de sustituto tapa
el fondo propio del sitio, y en una web que ya era oscura la dejaria blanca con
su texto claro encima. La unica salida es decidirlo **antes**, en el selector.

Efecto lateral que hay que aceptar: el atributo esta en el DOM, asi que la propia
pagina puede verlo. No lleva ningun dato, solo dice que aqui el cristal esta
apagado.

## Si no aparece la entrada del menu

1. `about:config` > `general.config.filename` tiene que decir `config.js`. Si no
   esta, el cargador no se instalo: repite el instalador.
2. La consola del navegador (Ctrl+Shift+J) tiene que traer una linea
   `[nativo] cargador en pie:` con `Zen Sin Cristal` dentro. Si dice que falta
   `ventana.js`, el perfil se quedo a medias: repite el instalador.
   - Si la linea sale **sin** `Zen Sin Cristal`, el `config.js` del directorio de
     instalacion es de antes de que existiera este mod: lo normal es que se lo
     llevara una actualizacion de Zen. `--solo-instalacion`, y pide administrador.
   - Si sale `no engancho en una ventana: Trying to load untrusted URI`, el
     cargador esta viejo por otro motivo: `loadSubScript` dejo de aceptar
     `file://` y hay que cargar por `resource://`. Lo arregla la version actual de
     `core/config.js`; repite `--solo-instalacion`.
3. Una actualizacion de Zen reemplaza el directorio de instalacion y se lleva el
   cargador por delante. El inyector sobrevive porque vive en el perfil. Cuando
   pase: `node installer/instalar-sin-cristal.mjs --solo-instalacion`.

## Si aparece, se marca, y la pagina sigue de cristal

Son dos apagados y pueden fallar por separado. Con la pagina apagada, abre el
inspector (F12) y mira el `<html>`:

1. **No tiene `zen-sin-cristal`.** El inyector no esta corriendo o el dominio
   apuntado no es el de la pagina (se apunta el dominio base, no el host).
2. **Lo tiene y aun asi hay cristal.** Busca `#zeninternet-styles` en el `<head>`:
   si existe y **no** lleva `media="not all"`, lo que se rompio es la frontera
   con la extension —la habran renombrado—, y el id nuevo hay que llevarlo a
   `HOJA_EXTENSION` en `mods/appearance/glass-toggle/nativo/proceso.js`. Si no existe pero hay
   otro `<style>` suyo, han cambiado de mecanismo y hay que leer su
   `content-script.js` otra vez.
3. **Lo tiene, la hoja esta apagada, y sigue habiendo cristal.** Entonces el
   fondo lo esta vaciando un bloque por sitio de `mods/appearance/acrylic-glass/web/50-sites.css` al que le
   falta la guarda. `node dev/tools/probar-css.mjs` lo dice.

## La lista de paginas para revisar

El otro medio del submenu. Mientras navegas, **Zen Cristal > Guardar esta pagina
para revisar** va apuntando las paginas que se ven mal, y luego se exporta un
archivo que se le pasa a quien vaya a arreglarlas. Al reves tambien: alguien te
manda el suyo y **Importar una lista** lo suma al tuyo.

La lista vive en un archivo del perfil, no en una pref:

    <perfil>/zen-cristal-pendientes.json

```json
{
  "formato": 1,
  "generado": "2026-09-17T21:17:58.609Z",
  "pendientes": [
    {
      "url": "https://supabase.com/",
      "sitio": "supabase.com",
      "titulo": "Supabase | The Postgres Development Platform",
      "guardado": "2026-09-17T21:17:58.609Z"
    }
  ]
}
```

**Por que un archivo y no una pref**, que es lo que usa la lista de sitios
apagados. Tres razones, ninguna de estilo:

- La lista de sitios son seis dominios y la **lee cada proceso de contenido**,
  que es justo para lo que las prefs sirven. Esta crece sin techo y no la lee
  ninguno: meterla en una pref copiaria tu lista de lectura a los veintitantos
  procesos que Zen abre, a cambio de nada.
- Una pref llega al disco cuando Gecko vuelca `prefs.js`, que es perezoso. El
  motivo entero de que esto exista es poder **pasarle el archivo a alguien sin
  cerrar el navegador**, y una pref entregaria el de hace diez minutos.
- Dos sitios donde vive el mismo dato es un sitio que pierde en silencio.

Lo que si es una pref es el **timbre**, `zen.sincristal.pendientes.sello`. No
lleva la lista: lleva `<cuantas>@<milisegundos>`. Su unico trabajo es que las
demas ventanas se enteren de que el archivo cambio. Leido en `about:config`
contesta ademas cuantas hay y cuando se toco.

Detalles que son decisiones y no casualidades:

- **Importar SUMA, no sustituye.** Quien recibe el archivo de otro suele tener su
  propia lista a medio hacer, y perderla no se deshace con nada. Las URL
  repetidas se descartan.
- **Un archivo ilegible no se pisa.** Si el JSON esta a medias, se avisa por la
  consola del navegador y no se escribe nada encima: es el unico dato del mod que
  no se puede regenerar.
- **En ventana privada no aparece "Guardar"**, y el interruptor si. El
  interruptor apunta un dominio, que es un ajuste; guardar apunta la URL entera,
  el titulo y la hora, o sea un registro de por donde estuviste. Eso es
  historial, y escribirlo al disco desde una ventana privada es exactamente lo
  que una ventana privada promete no hacer.
- **El submenu se queda en las paginas sin dominio** (`about:`, `file:`, el visor
  de PDF) con solo exportar e importar dentro. Importar una lista se hace
  normalmente desde una pestana vacia, que es justo donde no hay dominio.
- **El archivo va a la raiz del perfil** y no a `chrome/zen-sin-cristal/`, porque
  el desinstalador borra esa carpeta entera. Es el mismo sitio donde Zen deja
  `zen-themes.json` y `zen-keyboard-shortcuts.json`.

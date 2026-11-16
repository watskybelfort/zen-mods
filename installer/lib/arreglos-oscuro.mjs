// ===========================================================================
// La base de arreglos por sitio de Dark Reader, compilada a JSON.
// ---------------------------------------------------------------------------
// `mods/appearance/dark-mode/motor/dynamic-theme-fixes.config` es el archivo de su
// repositorio (src/config, v4.9.133, MIT) donde se apuntan, sitio a sitio, las
// cosas que el motor no acierta solo: que selectores hay que invertir (logos
// negros sobre fondo claro), que reglas CSS anadir, que estilos en linea o que
// imagenes dejar en paz. Es lo que hace que Dark Reader se vea bien en Wikipedia
// o en Facebook y no solo en una pagina de ejemplo, y NO viene en el paquete npm:
// el motor lo acepta como segundo argumento de `enable(tema, arreglos)`.
//
// Formato del .config: secciones separadas por una linea de `====`; en cada una,
// primero las URLs (una por linea) y despues las ordenes INVERT, CSS,
// IGNORE INLINE STYLE, IGNORE IMAGE ANALYSIS e IGNORE CSS URL, cada una con su
// bloque debajo. La primera seccion, `*`, es lo comun a todos los sitios.
//
// Aqui se compila a algo que el inyector pueda indexar sin parsear 800 KB de
// texto en cada proceso:
//
//   [ { u: [urls], i: [selectores a invertir], c: 'css',
//       s: [estilos en linea a ignorar], g: [imagenes a ignorar],
//       x: [urls de css a ignorar] }, ... ]
//
// con las claves vacias omitidas. El indice por dominio lo monta el inyector.
// ===========================================================================

const ORDENES = {
  INVERT: 'i',
  CSS: 'c',
  'IGNORE INLINE STYLE': 's',
  'IGNORE IMAGE ANALYSIS': 'g',
  'IGNORE CSS URL': 'x',
}

export function compilarArreglos(texto) {
  const secciones = String(texto).replace(/\r/g, '').split(/^\s*={2,}\s*$/m)
  const salida = []
  for (const seccion of secciones) {
    const urls = []
    const bloques = { i: [], c: [], s: [], g: [], x: [] }
    let actual = null
    for (const linea of seccion.split('\n')) {
      const t = linea.trim()
      if (Object.prototype.hasOwnProperty.call(ORDENES, t)) { actual = ORDENES[t]; continue }
      if (actual === null) { if (t) urls.push(t) } else bloques[actual].push(linea)
    }
    if (!urls.length) continue
    const entrada = { u: urls }
    for (const k of ['i', 's', 'g', 'x']) {
      const lista = bloques[k].map((l) => l.trim()).filter(Boolean)
      if (lista.length) entrada[k] = lista
    }
    const css = bloques.c.join('\n').trim()
    if (css) entrada.c = css
    salida.push(entrada)
  }
  return salida
}

// ---------------------------------------------------------------------------
// LOS AJUSTES PROPIOS: lo que le corregimos a la base de Dark Reader.
// ---------------------------------------------------------------------------
// Entran en el mismo JSON, como secciones mas, con una clave extra: `q`, los
// selectores que hay que QUITAR de los INVERT que hayan reunido las demas
// secciones de esa pagina. Cada entrada dice por que existe, medido.
export const ARREGLOS_PROPIOS = [
  // La base de Dark Reader trae `INVERT .shopify-logo` para `shopify.com`, que
  // cubre todos sus subdominios, y esta pensado para la web de marketing: ahi el
  // logo es negro sobre un fondo claro y se invierte a blanco. En el login y el
  // panel (admin. y accounts.) el logo YA es blanco, porque la pagina es oscura de
  // fabrica, y la inversion lo deja negro sobre cristal oscuro: invisible. Medido
  // el 06-10-2026 en admin.shopify.com/login, con el filtro `invert(1)
  // hue-rotate(180deg)` puesto sobre `img.shopify-logo--merchant-auth`.
  { u: ['admin.shopify.com', 'accounts.shopify.com'], q: ['.shopify-logo'] },
]

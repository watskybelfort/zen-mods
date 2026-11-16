#!/usr/bin/env node
// ===========================================================================
// Pasada UNICA: le pone la guarda de Zen Sin Cristal a los bloques por sitio.
// ---------------------------------------------------------------------------
// Esto no es una herramienta de mantenimiento: es el script con el que se hizo
// la conversion de mods/appearance/acrylic-glass/web/50-sites.css el 12-09-2026, guardado para que la pasada
// sea reproducible y revisable. Una vez hecha, lo que vigila que no se olvide
// una guarda nueva es `dev/tools/probar-css.mjs`.
//
// QUE HACE. Recorre cada bloque `@-moz-document` y le antepone a cada selector
// la guarda, en las dos formas que documenta mods/appearance/acrylic-glass/web/00-base.css:21-59 y que NO son
// intercambiables:
//
//   html...            ->  html...:not(:where([zen-sin-cristal]))
//   lo demas           ->  :where(html:not([zen-sin-cristal])) lo demas
//
// Las dos cuestan CERO de especificidad, que es el punto entero: si subiera, los
// bloques por sitio empezarian a ganarle a mods/appearance/acrylic-glass/web/90-exclusions.css, que hoy gana
// por ir el ultimo a igual especificidad, y se caerian los rescates de Google y
// de los wikis.
//
// Se salta comentarios y cadenas, entra en los `@media` anidados y no toca los
// preludios de at-rules.
//
//   node dev/tools/poner-guarda.mjs --escribir
// ===========================================================================

import fs from 'node:fs'

const ARCHIVO = 'mods/appearance/acrylic-glass/web/50-sites.css'
const GUARDA_HTML = ':not(:where([zen-sin-cristal]))'
const GUARDA_PREFIJO = ':where(html:not([zen-sin-cristal])) '

const src = fs.readFileSync(ARCHIVO, 'utf8')

// --- 1. Mapa de lo que hay que ignorar -------------------------------------
// Un comentario o una cadena pueden contener llaves, comas y `{`: sin esto el
// recorrido se descuadra en el primer `/* { */` que aparezca.
const ignorar = new Uint8Array(src.length)
const esComentario = new Uint8Array(src.length)
for (let i = 0; i < src.length; i++) {
  if (src[i] === '/' && src[i + 1] === '*') {
    const fin = src.indexOf('*/', i + 2)
    const hasta = fin === -1 ? src.length : fin + 2
    for (let k = i; k < hasta; k++) { ignorar[k] = 1; esComentario[k] = 1 }
    i = hasta - 1
  } else if (src[i] === "'" || src[i] === '"') {
    const comilla = src[i]
    let k = i + 1
    while (k < src.length && src[k] !== comilla) k += src[k] === '\\' ? 2 : 1
    for (let j = i; j <= Math.min(k, src.length - 1); j++) ignorar[j] = 1
    i = k
  }
}

// Un preludio arrastra por delante el comentario de cabecera del bloque. Para
// decidir si es una regla de estilo o un at-rule hay que mirarlo SIN comentarios.
const limpiarPreludio = (ini, fin) => {
  let out = ''
  for (let i = ini; i < fin; i++) out += esComentario[i] ? ' ' : src[i]
  return out.trim()
}

// --- 2. Recorrido de reglas -------------------------------------------------
// Devuelve los rangos [ini, fin) de los preludios de regla de estilo que hay
// dentro de `desde`..`hasta`, entrando en los @media y saltandose los preludios
// de at-rules.
const preludios = []

const recorrer = (desde, hasta) => {
  let i = desde
  let inicioPreludio = i
  while (i < hasta) {
    if (ignorar[i]) { i++; continue }
    const c = src[i]
    if (c === '{') {
      const limpio = limpiarPreludio(inicioPreludio, i)
      // Buscar el cierre de este bloque
      let prof = 1
      let j = i + 1
      while (j < hasta && prof > 0) {
        if (!ignorar[j]) {
          if (src[j] === '{') prof++
          else if (src[j] === '}') prof--
        }
        j++
      }
      const finBloque = j - 1
      if (limpio.startsWith('@')) recorrer(i + 1, finBloque)
      else preludios.push([inicioPreludio, i])
      i = j
      inicioPreludio = i
    } else if (c === '}') {
      i++
      inicioPreludio = i
    } else if (c === ';') {
      i++
      inicioPreludio = i
    } else {
      i++
    }
  }
}

// Nivel superior: solo se entra en los `@-moz-document`.
{
  let i = 0
  let inicioPreludio = 0
  while (i < src.length) {
    if (ignorar[i]) { i++; continue }
    if (src[i] === '{') {
      const limpio = limpiarPreludio(inicioPreludio, i)
      let prof = 1
      let j = i + 1
      while (j < src.length && prof > 0) {
        if (!ignorar[j]) {
          if (src[j] === '{') prof++
          else if (src[j] === '}') prof--
        }
        j++
      }
      if (limpio.startsWith('@-moz-document')) recorrer(i + 1, j - 1)
      else if (limpio.startsWith('@')) { /* otros at-rules de nivel superior: no hay */ }
      i = j
      inicioPreludio = i
    } else if (src[i] === '}' || src[i] === ';') {
      i++
      inicioPreludio = i
    } else {
      i++
    }
  }
}

// --- 3. Reescritura de un preludio -----------------------------------------
// Corta por las comas de primer nivel (una coma dentro de `:is(a, b)` o de
// `[attr=",")` no separa selectores) y conserva el sangrado de cada linea.
const partirPorComas = (ini, fin) => {
  const partes = []
  let prof = 0
  let desde = ini
  for (let i = ini; i < fin; i++) {
    if (ignorar[i]) continue
    const c = src[i]
    if (c === '(' || c === '[') prof++
    else if (c === ')' || c === ']') prof--
    else if (c === ',' && prof === 0) { partes.push([desde, i]); desde = i + 1 }
  }
  partes.push([desde, fin])
  return partes
}

// Donde empieza de verdad el selector dentro de una parte: saltando los espacios
// Y LOS COMENTARIOS. Sin esto el prefijo aterriza delante del comentario de
// cabecera del bloque, que ademas de ilegible rompe `html.dark *`: quedaria
// `:where(html...) html.dark *`, o sea un html dentro de otro, que no casa nada.
const inicioDelSelector = (ini, fin) => {
  let i = ini
  while (i < fin && (esComentario[i] || /\s/.test(src[i]))) i++
  return i
}

// Final del primer compuesto: donde acaba `html.foo[bar]:not(baz)` y empieza el
// combinador o el descendiente.
const finDelCompuesto = (s, desde) => {
  let i = desde
  let prof = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '(' || c === '[') prof++
    else if (c === ')' || c === ']') prof--
    else if (prof === 0 && /[\s>+~,]/.test(c)) break
    i++
  }
  return i
}

const guardar = (core) => {
  if (/^html(?![\w-])/.test(core)) {
    const fin = finDelCompuesto(core, 'html'.length)
    return core.slice(0, fin) + GUARDA_HTML + core.slice(fin)
  }
  if (/^:root(?![\w-])/.test(core)) {
    const fin = finDelCompuesto(core, ':root'.length)
    return core.slice(0, fin) + GUARDA_HTML + core.slice(fin)
  }
  return GUARDA_PREFIJO + core
}

let salida = ''
let cursor = 0
let tocados = 0
let yaTenian = 0

for (const [ini, fin] of preludios) {
  salida += src.slice(cursor, ini)
  const crudo = src.slice(ini, fin)
  if (crudo.includes('zen-sin-cristal')) { yaTenian++; salida += crudo; cursor = fin; continue }
  const nuevas = partirPorComas(ini, fin).map(([a, b]) => {
    const arranque = inicioDelSelector(a, b)
    const cabeza = src.slice(a, arranque)
    const cola = src.slice(arranque, b).replace(/\s+$/, '')
    const rabo = src.slice(arranque + cola.length, b)
    if (!cola) return src.slice(a, b)
    tocados++
    return cabeza + guardar(cola) + rabo
  })
  salida += nuevas.join(',')
  cursor = fin
}
salida += src.slice(cursor)

console.log(`preludios de regla dentro de @-moz-document: ${preludios.length}`)
console.log(`selectores con guarda nueva: ${tocados}`)
console.log(`preludios que ya la tenian: ${yaTenian}`)

if (process.argv.includes('--escribir')) {
  fs.writeFileSync(ARCHIVO, salida)
  console.log(`escrito ${ARCHIVO}`)
} else {
  console.log('(ensayo: pasa --escribir para guardar)')
}

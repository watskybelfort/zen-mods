#!/usr/bin/env node
// ===========================================================================
// Comentarios rotos y llaves descuadradas en el CSS del repo.
// ---------------------------------------------------------------------------
// Un `/*` sin cerrar se traga todas las reglas que vengan detras, y un `}` de
// mas cierra un bloque antes de tiempo. Ninguna de las dos cosas da error en
// ningun sitio: el navegador descarta lo que no entiende y sigue, asi que el
// sintoma es "esa regla no hace nada" y se busca en el selector, que esta bien.
//
// No es un validador de CSS: es el detector de las dos formas de romper un
// archivo entero con un caracter. Eso es todo lo que pretende y por eso cabe en
// una pasada de caracteres, sin parser ni dependencias.
//
// Y DESDE EL 12-09-2026, UNA TERCERA COSA: LA GUARDA
// La frontera 9 de dev/MAINTENANCE.md es un acuerdo dentro de casa —el atributo
// `zen-sin-cristal`— y hasta ahora solo lo vigilaba la disciplina de quien
// escribia la regla. El sintoma de olvidarlo es el peor que hay: el interruptor
// del clic derecho aparece, se marca, y la pagina sigue igual de transparente.
// Ninguna build de Zen puede avisar de eso porque no es una frontera con nadie
// de fuera. Asi que se comprueba aqui: toda regla de estilo de las cuatro capas
// guardadas tiene que llevar la guarda en el selector.
//
// `90-exclusions.css` se queda fuera a proposito y no es un olvido: sus reglas
// DEVUELVEN el fondo solido, que es justo lo que el interruptor quiere. Ponerle
// la guarda seria apagar el rescate cuando se pide apagar el cristal.
//
// USO
//   node dev/tools/probar-css.mjs
//   node dev/tools/probar-css.mjs mods/appearance/acrylic-glass/web/50-sites.css
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from '../../installer/lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {})

  let archivos = args._
  if (!archivos.length) {
    const web = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'acrylic-glass', 'web')
    const mods = path.join(z.RAIZ_REPO, 'mods')
    archivos = []
    if (fs.existsSync(web)) {
      archivos.push(...fs.readdirSync(web).filter((f) => f.endsWith('.css')).map((f) => path.join(web, f)))
    }
    if (fs.existsSync(mods)) {
      for (const d of fs.readdirSync(mods)) {
        const css = path.join(mods, d, 'chrome.css')
        if (fs.existsSync(css)) archivos.push(css)
      }
    }
  }
  if (!archivos.length) throw new Error('No hay ningun CSS que revisar.')

  let fallos = 0
  let sinGuarda = 0
  for (const archivo of archivos) {
    const txt = fs.readFileSync(archivo, 'utf8')
    const nombre = path.basename(archivo)
    const problemas = revisar(txt)
    // La guarda solo se exige donde existe el acuerdo. Si el comentario roto ya
    // descuadro el archivo, no se mira: las lineas que saldrian serian ruido.
    const huecos = problemas.length ? [] : [
      ...(CAPAS_GUARDADAS.has(nombre) ? revisarGuardas(txt, 'cristal') : []),
      ...(CAPAS_CON_CLARO.has(nombre) ? revisarGuardas(txt, 'oscuro') : []),
    ]
    if (problemas.length || huecos.length) {
      fallos++
      sinGuarda += huecos.length
      console.log(z.tinta.rojo(`FALLA  ${nombre}`))
      for (const p of problemas) console.log(`         ${p}`)
      for (const h of huecos) console.log(`         ${h}`)
      console.log(z.tinta.gris(`         ${archivo}`))
    } else {
      console.log(z.tinta.gris(`ok     ${nombre}`))
    }
  }

  console.log('')
  if (fallos) {
    console.log(z.tinta.rojo(`${fallos} archivo(s) con problemas.`))
    if (sinGuarda) {
      console.log(z.tinta.rojo(`${sinGuarda} regla(s) sin guarda: si falta la de Zen Sin Cristal, el interruptor del clic derecho no apaga nada ahi; si falta la de Zen Modo Oscuro, la lamina clara se queda encima del tema oscuro.`))
    }
    process.exitCode = 1
  } else {
    console.log(z.tinta.verde('Sin comentarios rotos y con la guarda puesta.'))
  }
})

// Las capas que llevan el acuerdo. 90-exclusions.css NO esta, y el porque esta
// en la cabecera.
const CAPAS_GUARDADAS = new Set([
  '00-base.css',
  '10-wrappers.css',
  '20-aggressive.css',
  '45-emergentes.css',
  '50-sites.css',
])

// Donde viven las reglas que PINTAN CLARO a proposito: la lamina blanca de
// Shopify y Meta (50-sites.css) y los rescates de fondo solido (90-exclusions.css).
// Con el modo oscuro puesto tienen que apartarse, o se quedan con `!important` de
// usuario por encima del de Dark Reader. Es el segundo acuerdo de dentro de casa,
// el atributo `zen-modo-oscuro`, y se vigila igual que el de zen-sin-cristal.
const CAPAS_CON_CLARO = new Set(['50-sites.css', '90-exclusions.css'])

function revisar(txt) {
  const problemas = []
  let i = 0
  let profundidad = 0
  let linea = 1

  while (i < txt.length) {
    const c = txt[i]

    if (c === '\n') {
      linea++
      i++
      continue
    }

    // Dentro de un comentario no hay CSS: se salta entero.
    if (c === '/' && txt[i + 1] === '*') {
      const fin = txt.indexOf('*/', i + 2)
      if (fin < 0) {
        problemas.push(`linea ${linea}: /* sin cerrar (se traga el resto del archivo)`)
        break
      }
      for (let k = i; k < fin; k++) if (txt[k] === '\n') linea++
      i = fin + 2
      continue
    }

    if (c === '*' && txt[i + 1] === '/') {
      problemas.push(`linea ${linea}: */ suelto (descarta la regla siguiente)`)
      i += 2
      continue
    }

    if (c === '{') profundidad++
    else if (c === '}') {
      profundidad--
      if (profundidad < 0) {
        problemas.push(`linea ${linea}: } de mas`)
        profundidad = 0
      }
    }
    i++
  }

  if (profundidad !== 0) problemas.push(`quedan ${profundidad} llave(s) sin cerrar`)
  return problemas
}

// Toda regla de estilo tiene que nombrar `zen-sin-cristal` en su selector. Se
// mira el preludio entero y no una forma concreta: hay dos formas validas
// —`html:not(:where([zen-sin-cristal]))` y `:where(html:not([zen-sin-cristal]))`
// delante— y exigir una sola convertiria el aviso en ruido.
//
// Un preludio que empieza por `@` es un at-rule: no se comprueba, se entra.
//
// Con `modo === 'oscuro'` se mira OTRA cosa: toda regla que fuerza el claro
// (`color-scheme: normal` o un fondo `Canvas`) tiene que nombrar `zen-modo-oscuro`
// en cada selector. Se saltan las que van dentro de un @-moz-document de
// about:, resource: o view-source:, donde el motor no corre nunca.
function revisarGuardas(txt, modo = 'cristal') {
  const problemas = []
  const atributo = modo === 'oscuro' ? 'zen-modo-oscuro' : 'zen-sin-cristal'

  // Mascara de lo que no es CSS: sin esto, una llave dentro de un comentario
  // descuadra el recorrido igual que descuadraria al navegador un comentario
  // sin cerrar.
  const comentario = new Uint8Array(txt.length)
  for (let i = 0; i < txt.length; i++) {
    if (txt[i] === '/' && txt[i + 1] === '*') {
      const fin = txt.indexOf('*/', i + 2)
      const hasta = fin === -1 ? txt.length : fin + 2
      for (let k = i; k < hasta; k++) comentario[k] = 1
      i = hasta - 1
    }
  }

  const lineaDe = (off) => {
    let n = 1
    for (let i = 0; i < off; i++) if (txt[i] === '\n') n++
    return n
  }

  const recorrer = (desde, hasta, ctx = []) => {
    let i = desde
    let inicio = i
    while (i < hasta) {
      if (comentario[i]) { i++; continue }
      const c = txt[i]
      if (c === '{') {
        let preludio = ''
        for (let k = inicio; k < i; k++) preludio += comentario[k] ? ' ' : txt[k]
        preludio = preludio.trim()

        let prof = 1
        let j = i + 1
        while (j < hasta && prof > 0) {
          if (!comentario[j]) {
            if (txt[j] === '{') prof++
            else if (txt[j] === '}') prof--
          }
          j++
        }

        if (preludio.startsWith('@')) {
          // Los fotogramas de un @keyframes no son selectores: no se entra.
          if (!preludio.startsWith('@keyframes')) recorrer(i + 1, j - 1, ctx.concat(preludio))
        } else if (preludio) {
          let revisa = true
          if (modo === 'oscuro') {
            let cuerpo = ''
            for (let k = i + 1; k < j - 1; k++) cuerpo += comentario[k] ? ' ' : txt[k]
            const fuerzaClaro = /color-scheme:\s*normal|background-color:\s*Canvas/.test(cuerpo)
            const sinMotor = ctx.some((c) => /url-prefix\(\s*(about:|resource:|view-source:)/.test(c))
            revisa = fuerzaClaro && !sinMotor
          }
          if (!revisa) { i = j; inicio = i; continue }
          // Parte por parte y no el preludio entero: una lista de seis
          // selectores donde solo cinco llevan guarda pasaria el filtro si se
          // mirara de una pieza, y el que falta es justo el que no se apaga.
          for (const parte of partirSelectores(preludio)) {
            if (!parte.trim() || parte.includes(atributo)) continue
            const corto = parte.replace(/\s+/g, ' ').trim().slice(0, 60)
            problemas.push(`linea ${lineaDe(i)}: sin guarda${modo === 'oscuro' ? ' del modo oscuro' : ''} -> ${corto}`)
          }
        }

        i = j
        inicio = i
      } else if (c === '}' || c === ';') {
        i++
        inicio = i
      } else {
        i++
      }
    }
  }

  recorrer(0, txt.length)
  return problemas
}

// Corta una lista de selectores por sus comas de PRIMER NIVEL. Las de dentro de
// `:is(a, b)` o de `:has([role='menu'], [role='dialog'])` no separan nada, y
// tratarlas como si lo hicieran daria un aviso por cada una.
function partirSelectores(preludio) {
  const partes = []
  let prof = 0
  let comilla = ''
  let ini = 0
  for (let i = 0; i < preludio.length; i++) {
    const c = preludio[i]
    if (comilla) {
      if (c === '\\') i++
      else if (c === comilla) comilla = ''
      continue
    }
    if (c === "'" || c === '"') comilla = c
    else if (c === '(' || c === '[') prof++
    else if (c === ')' || c === ']') prof--
    else if (c === ',' && prof === 0) { partes.push(preludio.slice(ini, i)); ini = i + 1 }
  }
  partes.push(preludio.slice(ini))
  return partes
}

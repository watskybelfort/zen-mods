#!/usr/bin/env node
// ===========================================================================
// Si Zen Internet ha cambiado su hoja en algun sitio que tambien estiliza este
// repo.
// ---------------------------------------------------------------------------
// La frontera 10 de dev/MAINTENANCE.md, la que "no puede ver ningun verificador".
// La extension no vive en ningun omni.ja, pero sus estilos si viven en un sitio
// publico: su repositorio los sirve como un JSON, y la extension lo vuelve a
// bajar ella sola cada dos horas (background.js v3.2.0, alarma
// `autoUpdateStyles`). O sea que la hoja que se inyecta en ChatGPT hoy no es la
// de ayer, sin que se actualice nada que se vea.
//
// Y eso es exactamente el fallo del 24-09-2026: "se actualizo la extension y
// ahora todo esta bugueado". Donde su hoja y un bloque nuestro caen en el mismo
// sitio se pisan, y lo que mas duele es su `backdrop-filter`: sobre una pagina
// que hemos vaciado no hay nada que muestrear, y Gecko compone ese vacio en
// NEGRO. Un cambio suyo en un sitio del catalogo es un sitio que hay que volver
// a mirar.
//
// Lo que hace: baja ese JSON, se queda con las hojas que caen en dominios con
// bloque en mods/appearance/acrylic-glass/web/50-sites.css o en la lista SIN_EXTENSION de Zen Sin Cristal, y
// compara el hash de cada una con dev/contract/zeninternet.json. Lo que cambio sale
// con cuantos `backdrop-filter` trae, que es la pista de por donde mirar.
//
// La coincidencia replica la de la extension (applyCSSToTab): nombre exacto,
// `+dominio` para el dominio y sus subdominios, `-nombre.tld` para cualquier
// sufijo, y una hoja normal tambien vale para los subdominios. Mas la de
// `domain()` del CSS por nuestro lado: un bloque cubre sus subdominios.
//
// USO
//   node dev/tools/probar-zeninternet.mjs
//   node dev/tools/probar-zeninternet.mjs --actualizar-linea-base   (tras comprobarlo a mano)
//   node dev/tools/probar-zeninternet.mjs --archivo <styles.json>   (sin red)
//   node dev/tools/probar-zeninternet.mjs --json
//
// Codigos de salida: 0 nada cambio · 1 cambio la hoja de algun sitio nuestro ·
// 3 no se pudo leer la fuente o la linea base.
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import * as z from '../../installer/lib/zen.mjs'

const FUENTE = 'https://sameerasw.github.io/my-internet/styles.json'
const LINEA_BASE = path.join(z.RAIZ_REPO, 'dev', 'contract', 'zeninternet.json')

z.principal(async () => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['json', 'actualizar-linea-base'],
    claves: ['archivo'],
  })

  // --- 1. La fuente ---------------------------------------------------------
  let estilos
  try {
    if (args.archivo) {
      estilos = JSON.parse(fs.readFileSync(args.archivo, 'utf8'))
    } else {
      const r = await fetch(FUENTE, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      estilos = await r.json()
    }
  } catch (e) {
    console.error(`No se pudo leer la fuente de Zen Internet: ${e.message}`)
    process.exitCode = 3
    return
  }
  // La extension guarda el JSON tal cual en `styles`; el volcado de su
  // almacenamiento lo trae envuelto. Se aceptan las dos formas.
  const web = (estilos.styles || estilos).website
  if (!web || typeof web !== 'object') {
    console.error('La fuente no trae `website`: han cambiado el formato del JSON.')
    process.exitCode = 3
    return
  }

  // --- 2. Nuestros dominios --------------------------------------------------
  const { dominios: nuestros, sinExtension } = dominiosNuestros()

  // --- 3. Que hojas suyas caen en ellos --------------------------------------
  const afectan = {}
  for (const [clave, rasgos] of Object.entries(web)) {
    const dominios = nuestros.filter((d) => cae(clave, d))
    if (!dominios.length) continue
    const css = Object.values(rasgos || {}).join('\n')
    afectan[clave] = {
      dominios,
      // En los sitios de SIN_EXTENSION su hoja se apaga siempre: un cambio ahi
      // se cuenta, pero no pide que se mire nada.
      apagada: dominios.every((d) => sinExtension.includes(d)),
      sha256: crypto.createHash('sha256').update(css).digest('hex'),
      bytes: css.length,
      blur: (css.match(/backdrop-filter\s*:\s*(?!\s*none)[^;]+/g) || []).length,
    }
  }

  // --- 4. Contra la linea base ----------------------------------------------
  if (args['actualizar-linea-base']) {
    const base = { fuente: FUENTE, fecha: new Date().toISOString().slice(0, 10), sitios: ordenar(afectan) }
    z.escribirUtf8SinBom(LINEA_BASE, JSON.stringify(base, null, 2) + '\n')
    console.log(`Linea base escrita: ${Object.keys(afectan).length} hojas de Zen Internet sobre sitios del catalogo.`)
    return
  }

  const base = z.leerJson(LINEA_BASE, null)
  if (!base) {
    console.error('No hay linea base (dev/contract/zeninternet.json). Crea una con --actualizar-linea-base despues de mirar los sitios.')
    process.exitCode = 3
    return
  }

  const cambiadas = [], nuevas = [], retiradas = []
  const apagadas = []
  for (const [clave, h] of Object.entries(afectan)) {
    const antes = base.sitios[clave]
    const cambio = !antes || antes.sha256 !== h.sha256
    if (cambio && h.apagada) apagadas.push({ clave, ...h })
    else if (!antes) nuevas.push({ clave, ...h })
    else if (cambio) cambiadas.push({ clave, ...h, bytesAntes: antes.bytes, blurAntes: antes.blur })
  }
  for (const clave of Object.keys(base.sitios)) if (!afectan[clave]) retiradas.push({ clave, ...base.sitios[clave] })

  if (args.json) {
    console.log(JSON.stringify({ fecha: base.fecha, hojas: Object.keys(afectan).length, cambiadas, nuevas, retiradas, apagadas }, null, 2))
  } else {
    console.log(`Zen Internet contra la linea base del ${base.fecha}: ${Object.keys(afectan).length} hojas suyas caen en sitios del catalogo`)
    console.log('')
    for (const c of cambiadas) {
      const blur = c.blur !== c.blurAntes ? `  backdrop-filter ${c.blurAntes} -> ${c.blur}` : c.blur ? `  ${c.blur} backdrop-filter` : ''
      console.log(z.tinta.amarillo(`  cambio   ${c.clave.padEnd(34)} ${c.bytesAntes} -> ${c.bytes} bytes${blur}`))
      console.log(z.tinta.gris(`           mirar: ${c.dominios.join(', ')}`))
    }
    for (const c of nuevas) console.log(z.tinta.amarillo(`  nueva    ${c.clave.padEnd(34)} ${c.bytes} bytes, ${c.blur} backdrop-filter  (mirar: ${c.dominios.join(', ')})`))
    for (const c of retiradas) console.log(z.tinta.gris(`  retirada ${c.clave}`))
    for (const c of apagadas) console.log(z.tinta.gris(`  cambio   ${c.clave.padEnd(34)} apagada en ${c.dominios.join(', ')} (SIN_EXTENSION): no hay nada que mirar`))
    if (!cambiadas.length && !nuevas.length && !retiradas.length && !apagadas.length) console.log(z.tinta.verde('  Ninguna ha cambiado.'))
    if (cambiadas.length || nuevas.length) {
      console.log('')
      console.log('Abre esos sitios. Si algo sale negro o se lee a traves, el remedio esta en')
      console.log('mods/appearance/glass-toggle/readme.md ("Y los sitios donde su hoja va apagada siempre").')
      console.log('Cuando esten bien: node dev/tools/probar-zeninternet.mjs --actualizar-linea-base')
    }
  }
  if (cambiadas.length || nuevas.length) process.exitCode = 1
})

/**
 * Los dominios que tienen bloque propio en 50-sites.css, mas los de
 * SIN_EXTENSION. Se leen del propio CSS para no mantener otra lista que se
 * desincronice.
 */
function dominiosNuestros() {
  const css = fs.readFileSync(path.join(z.RAIZ_REPO, 'mods', 'appearance', 'acrylic-glass', 'web', '50-sites.css'), 'utf8')
  const set = new Set()
  for (const linea of css.split(/\r?\n/)) {
    if (!/^@-moz-document/.test(linea) && !/^\s+(domain|url-prefix)\(/.test(linea)) continue
    for (const m of linea.matchAll(/domain\(([^)]+)\)/g)) set.add(m[1].trim())
    for (const m of linea.matchAll(/url-prefix\(https?:\/\/([^/:)]+)/g)) set.add(m[1].trim())
  }
  const proceso = fs.readFileSync(path.join(z.RAIZ_REPO, 'mods', 'appearance', 'glass-toggle', 'nativo', 'proceso.js'), 'utf8')
  const lista = proceso.match(/const SIN_EXTENSION = \[([^\]]*)\]/)
  if (lista) for (const m of lista[1].matchAll(/'([^']+)'/g)) set.add(m[1])
  const sinExtension = lista ? [...lista[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []
  return { dominios: [...set].filter((d) => /[a-z]/i.test(d)).sort(), sinExtension }
}

/** Si la hoja `clave` de Zen Internet se aplica en algun host de `dominio`. */
function cae(clave, dominio) {
  const sitio = clave.replace(/\.css$/, '')
  const sinWww = (h) => (h.startsWith('www.') ? h.slice(4) : h)
  if (sitio.startsWith('-')) {
    // `-google.com` vale para google.com, google.es, google.com.co...
    const nombre = sitio.slice(1).split('.').slice(0, -1).join('.')
    const partes = dominio.split('.')
    return partes.slice(0, -1).join('.') === nombre || partes.slice(0, -2).join('.') === nombre
  }
  const h = sinWww(sitio.startsWith('+') ? sitio.slice(1) : sitio)
  // Su hoja vale para h y sus subdominios; nuestro bloque, para `dominio` y los
  // suyos. Se tocan si uno contiene al otro.
  return h === dominio || h.endsWith('.' + dominio) || dominio.endsWith('.' + h)
}

function ordenar(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
}

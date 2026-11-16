#!/usr/bin/env node
// ===========================================================================
// CVEs conocidos que tu build de Zen todavia no lleva.
// ---------------------------------------------------------------------------
// El riesgo real de usar un fork de Firefox no es "es inseguro": es no saber si
// estas expuesto AHORA. Mozilla publica el parche y el aviso a la vez, asi que
// entre el aviso y la build de Zen hay un intervalo en el que el fallo es
// publico y tu binario todavia no lo lleva. Ese intervalo no se ve desde
// about:support: te dice tu version, pero no contra que compararla.
//
// Cruza tres fuentes, ninguna de terceros:
//   1. La version de Gecko de tu application.ini
//   2. El product-details de Mozilla
//   3. Los avisos MFSA machine-readable del repositorio oficial de advisories
//
// Un aviso te afecta si arregla una version de Firefox POSTERIOR a la tuya.
//
// ES IGUAL EN LOS TRES SISTEMAS. Los CVE son del motor, no de la plataforma, y
// `application.ini` esta en todas las builds. Lo unico que cambia es donde se
// busca, y de eso ya se encarga installer/lib/zen.mjs.
//
// USO
//   node dev/tools/exposicion.mjs
//   node dev/tools/exposicion.mjs --json
//   node dev/tools/exposicion.mjs --profundidad 40
//   node dev/tools/exposicion.mjs --suponer-gecko 150.0    (para probar la alarma)
//
// CODIGOS DE SALIDA
//   0 al dia · 1 detras pero sin avisos pendientes · 2 con CVE abiertos
//   3 no se pudo determinar
// ===========================================================================

import * as z from '../../installer/lib/zen.mjs'

const MOZ_VERSIONS = 'https://product-details.mozilla.org/1.0/firefox_versions.json'
const MFSA_LISTA = 'https://api.github.com/repos/mozilla/foundation-security-advisories/contents/announce/%Y'
const MFSA_CRUDO = 'https://raw.githubusercontent.com/mozilla/foundation-security-advisories/master/announce/%Y/%F'
const ZEN_ULTIMA = 'https://api.github.com/repos/zen-browser/desktop/releases/latest'

const AGENTE = { 'User-Agent': 'acrylic-zen-exposicion' }

z.principal(async () => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['json'],
    claves: ['profundidad', 'suponer-gecko', 'ruta-zen'],
  })
  const profundidad = Number(args.profundidad ?? 20)

  // --- 1. Que tienes instalado --------------------------------------------
  const dirZen = args['ruta-zen'] || z.resolverInstalacionZen()
  if (!dirZen) {
    console.error('No se encontro Zen Browser (se busco application.ini en las rutas habituales).')
    process.exitCode = 3
    return
  }
  const zen = z.versionZen(dirZen)
  const geckoReal = zen.gecko
  const gecko = args['suponer-gecko'] || geckoReal

  const instalada = comparable(gecko)
  if (!instalada) {
    console.error(`No se pudo interpretar la version de Gecko: '${gecko}'`)
    process.exitCode = 3
    return
  }

  // --- 2. Que hay publicado ------------------------------------------------
  let ultimaFx = null
  try {
    const moz = await traerJson(MOZ_VERSIONS)
    ultimaFx = comparable(moz.LATEST_FIREFOX_VERSION)
  } catch (e) {
    console.error(`No se pudo consultar product-details de Mozilla: ${e.message}`)
    process.exitCode = 3
    return
  }

  let ultimaZen = null
  try {
    const rel = await traerJson(ZEN_ULTIMA, AGENTE)
    const m = (rel.body || '').match(/Updated (?:to )?Firefox (?:to )?([\d.]+)/)
    ultimaZen = { tag: rel.tag_name, publicada: rel.published_at, firefox: m ? m[1] : '' }
  } catch (e) {
    z.aviso(`No se pudo consultar las releases de Zen: ${e.message}`)
  }

  // --- 3. Que avisos te dejan fuera ---------------------------------------
  // Un aviso te afecta si arregla una version de Firefox POSTERIOR a la tuya:
  // significa que el fallo es publico y tu build todavia no lo lleva.
  const anio = new Date().getFullYear()
  const abiertos = []
  let revisados = 0

  for (const y of [anio, anio - 1]) {
    if (revisados >= profundidad) break
    let archivos
    try {
      archivos = await traerJson(MFSA_LISTA.replace('%Y', y), AGENTE)
    } catch {
      continue
    }

    const ordenados = archivos
      .filter((f) => /^mfsa\d{4}-(\d+)\.yml$/.test(f.name))
      .sort((a, b) => numeroDeAviso(b.name) - numeroDeAviso(a.name))

    for (const f of ordenados) {
      if (revisados >= profundidad) break
      revisados++
      let texto
      try {
        texto = await traerTexto(MFSA_CRUDO.replace('%Y', y).replace('%F', f.name))
      } catch {
        continue
      }
      const aviso = leerAviso(texto, f.name.replace(/\.yml$/, ''))
      if (!aviso.arreglaFirefox.length) continue
      if (aviso.arreglaFirefox.some((v) => mayorQue(v, instalada))) abiertos.push(aviso)
    }
  }

  // --- 4. Informe ----------------------------------------------------------
  const detras = ultimaFx && mayorQue(ultimaFx, instalada)
  const cves = abiertos.flatMap((a) => a.cves)
  const criticos = abiertos.reduce((n, a) => n + a.criticos, 0)

  const salida = {
    zen: { version: zen.version, gecko: geckoReal, buildId: zen.buildId, ruta: dirZen, plataforma: z.plataforma() },
    supuesto: args['suponer-gecko'] || null,
    firefox_ultimo: ultimaFx ? ultimaFx.join('.') : null,
    zen_ultima_release: ultimaZen,
    detras: Boolean(detras),
    avisos_revisados: revisados,
    avisos_abiertos: abiertos.map((a) => ({
      id: a.id,
      anunciado: a.anunciado,
      impacto: a.impacto,
      arregla_en: a.arreglaEn,
      cves: a.cves,
      criticos: a.criticos,
      url: a.url,
    })),
    cves_pendientes: cves.length,
    criticos_pendientes: criticos,
  }

  if (args.json) {
    console.log(JSON.stringify(salida, null, 2))
  } else {
    console.log('')
    console.log(z.tinta.cian('Exposicion de Zen a los CVE de Firefox'))
    console.log('')
    z.linea('Tu Zen', `${zen.version} (Gecko ${geckoReal}, build ${zen.buildId})`)
    if (args['suponer-gecko']) z.linea('Suponiendo', `Gecko ${gecko} (--suponer-gecko)`)
    z.linea('Firefox ultimo', ultimaFx ? ultimaFx.join('.') : '?')
    if (ultimaZen) z.linea('Zen ultima', `${ultimaZen.tag}${ultimaZen.firefox ? ` (Firefox ${ultimaZen.firefox})` : ''}`)
    z.linea('Avisos leidos', String(revisados))
    console.log('')

    if (abiertos.length) {
      console.log(z.tinta.rojo(`${abiertos.length} aviso(s) que tu build NO lleva, ${cves.length} CVE:`))
      for (const a of abiertos) {
        const marca = a.criticos ? z.tinta.rojo : z.tinta.amarillo
        console.log(marca(`  ${a.id}  [${a.impacto}]  arregla en: ${a.arreglaEn.join(', ')}`))
        console.log(z.tinta.gris(`      ${a.cves.length} CVE${a.criticos ? `, ${a.criticos} critico(s)` : ''}  ${a.url}`))
      }
      console.log('')
      console.log(z.tinta.amarillo('Lo unico que esto arregla es actualizar Zen. Mientras tanto,'))
      console.log(z.tinta.amarillo('node installer/blindar.mjs --nivel strict reduce lo alcanzable.'))
    } else if (detras) {
      console.log(z.tinta.verde('Vas por detras de Firefox, pero ningun aviso de los leidos te afecta.'))
    } else {
      console.log(z.tinta.verde('Al dia con Mozilla.'))
    }
    console.log('')
  }

  if (abiertos.length) process.exitCode = 2
  else if (detras) process.exitCode = 1
})

/**
 * "153" / "153.0" / "152.0.6" -> [153,0,0] comparable.
 *
 * Los avisos de Mozilla escriben las releases mayores sin minor, asi que hay que
 * normalizar antes de comparar o "153" quedaria por debajo de "152.0.6".
 */
function comparable(bruto) {
  if (!bruto) return null
  const v = String(bruto).replace(/[^\d.]/g, '').replace(/^\.+|\.+$/g, '')
  if (!v) return null
  const partes = v.split('.').map(Number)
  if (partes.some(Number.isNaN)) return null
  while (partes.length < 3) partes.push(0)
  return partes.slice(0, 3)
}

function mayorQue(a, b) {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

function numeroDeAviso(nombre) {
  return Number(nombre.match(/-(\d+)\.yml$/)[1])
}

/**
 * Extrae de un .yml de MFSA lo justo: a que versiones aplica y que CVE trae.
 *
 * No se arrastra un parser de YAML por esto: el formato de estos archivos es
 * plano y estable, y son cuatro campos. Lo mismo hacia la version en PowerShell,
 * y por el mismo motivo.
 */
function leerAviso(texto, id) {
  const lineas = texto.split(/\r?\n/)
  const arregla = []
  let enArregla = false
  let impacto = ''
  let anunciado = ''

  for (const linea of lineas) {
    if (/^fixed_in:/.test(linea)) {
      enArregla = true
      continue
    }
    if (enArregla) {
      const m = linea.match(/^\s*-\s+(.+?)\s*$/)
      if (m) {
        arregla.push(m[1])
        continue
      }
      enArregla = false
    }
    if (!impacto) {
      const m = linea.match(/^impact:\s*(.+?)\s*$/)
      if (m) impacto = m[1]
    }
    if (!anunciado) {
      const m = linea.match(/^announced:\s*(.+?)\s*$/)
      if (m) anunciado = m[1]
    }
  }

  const cves = [...texto.matchAll(/^ {2}(CVE-\d{4}-\d+):/gm)].map((m) => m[1])
  const criticos = (texto.match(/^\s+impact:\s*critical\s*$/gm) || []).length

  // Solo Firefox de escritorio: "Firefox ESR 140.13" y "Thunderbird 153" no son
  // esta build. El anclaje del $ es lo que descarta las variantes ESR.
  const arreglaFirefox = arregla
    .map((f) => f.match(/^Firefox\s+([\d.]+)$/))
    .filter(Boolean)
    .map((m) => comparable(m[1]))
    .filter(Boolean)

  return {
    id,
    anunciado,
    impacto,
    arreglaEn: arregla,
    arreglaFirefox,
    cves,
    criticos,
    url: `https://www.mozilla.org/en-US/security/advisories/${id}/`,
  }
}

async function traerTexto(url, cabeceras = {}) {
  const r = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} al pedir ${url}`)
  return r.text()
}

async function traerJson(url, cabeceras = {}) {
  return JSON.parse(await traerTexto(url, cabeceras))
}

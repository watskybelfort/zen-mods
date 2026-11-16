#!/usr/bin/env node
// ===========================================================================
// Comprueba que los enganches de los que dependen los mods siguen existiendo
// en una build de Zen.
// ---------------------------------------------------------------------------
// Un CSS cuyo selector ya no existe no da error, no sale en ningun log y no
// cambia el estado "activado" del mod: la regla simplemente no aplica. Esto es
// lo que convierte ese fallo en algo que se ve.
//
// Lee dev/contract/*.json y busca cada `buscar` dentro de los dos omni.ja de Zen,
// que son zip normales. No abre Zen, no necesita el canal de agente, no toca el
// perfil.
//
// LO QUE MAS SIRVE: --ruta-zen acepta cualquier carpeta de instalacion, tambien
// una build recien descargada y todavia sin instalar. O sea que se puede saber
// si la version nueva rompe algo ANTES de actualizar.
//
// NO BASTA CON "APARECE LA CADENA". Un id de Firefox como `main-window` sale
// tambien en un archivo de traduccion, asi que informar del primer archivo que
// lo contenga es ruido, no informacion. Aqui cada coincidencia se PUNTUA segun
// el tipo de enganche —`id="x"` vale mas que mencionar x— y solo se toma como
// declaracion la de mejor puntuacion.
//
// ENGANCHES POR PLATAFORMA. Un enganche puede llevar `plataformas`, y entonces
// solo se comprueba donde aplica. Hace falta desde que el mod del cristal tiene
// dos motores: `widget.windows.mica.toplevel-backdrop` no existe en la build de
// macOS y `zen.widget.macos.window-material` no existe en la de Windows, asi
// que sin esto cada sistema informaria de que le falta la mitad del contrato
// del otro. Se comprueba contra la plataforma de la BUILD que se esta leyendo,
// no contra la del ordenador: asi se puede auditar un Zen de Windows desde un
// Mac descomprimiendolo en una carpeta.
//
// LO QUE ESTO NO PRUEBA. Que el nombre exista no prueba que el efecto ocurra:
// el elemento puede seguir llamandose igual y haber dejado de pintar el fondo,
// o pintarlo otro encima. Eso se mide sobre el navegador abierto con
// dev/tools/probar-vivo.mjs. Los dos hacen falta.
//
// USO
//   node dev/tools/probar-contrato.mjs
//   node dev/tools/probar-contrato.mjs --ruta-zen "/ruta/a/la/build/nueva"
//   node dev/tools/probar-contrato.mjs --json
//   node dev/tools/probar-contrato.mjs --actualizar-linea-base
// ===========================================================================

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import * as z from '../../installer/lib/zen.mjs'
import { abrirZip } from '../../installer/lib/zip.mjs'

// Ni .json ni .ftl: solo traen ruido de traducciones.
const EXT_TEXTO = /\.(css|js|mjs|jsm|xhtml|xml|inc|yaml)$/

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['json', 'breve', 'actualizar-linea-base', 'sin-linea-base'],
    claves: ['ruta-zen', 'contrato', 'mod', 'linea-base'],
  })

  const dirContrato = args.contrato || path.join(z.RAIZ_REPO, 'dev', 'contract')
  if (!fs.existsSync(dirContrato)) throw new Error(`No se encontro la carpeta de contrato en ${dirContrato}`)

  // --- 1. Localizar la build ----------------------------------------------
  const dirZen = args['ruta-zen'] || z.resolverInstalacionZen()
  if (!dirZen || !fs.existsSync(dirZen)) {
    console.error('No se encontro ninguna instalacion de Zen. Pasa la carpeta con --ruta-zen.')
    process.exitCode = 3
    return
  }

  const jars = [path.join(dirZen, 'omni.ja'), path.join(dirZen, 'browser', 'omni.ja')].filter((f) => fs.existsSync(f))
  if (!jars.length) {
    console.error(`No hay ningun omni.ja en ${dirZen}. No parece una instalacion de Zen.`)
    process.exitCode = 3
    return
  }

  const zen = z.versionZen(dirZen)
  const platBuild = plataformaDeLaBuild(dirZen)

  // --- 2. Cargar el contrato ----------------------------------------------
  const soloMods = args.mod ? args.mod.split(',').map((s) => s.trim()) : null
  const contratos = []
  for (const f of fs.readdirSync(dirContrato).filter((f) => f.endsWith('.json')).sort()) {
    const c = z.leerJson(path.join(dirContrato, f), null)
    // baseline.json vive en la misma carpeta y NO es un contrato. Se filtra por
    // forma y no solo por nombre, para que cualquier otro archivo que acabe aqui
    // tampoco se cuele como un mod fantasma.
    if (!c || !c.mod || !Array.isArray(c.hooks)) continue
    if (soloMods && !soloMods.includes(c.mod)) continue
    contratos.push(c)
  }
  if (!contratos.length) throw new Error(`No hay contratos que comprobar en ${dirContrato}`)

  const aplicaAqui = (h) => !h.plataformas || h.plataformas.includes(platBuild)
  const medible = (h) =>
    aplicaAqui(h) && h.comprobable !== false && h.comprobable !== 'vivo' && h.buscar && h.buscar !== '-'

  // Un solo recorrido del zip para todos los tokens: descomprimir 13.000
  // entradas una vez por token seria minutos en lugar de segundos.
  const objetivos = new Map()
  for (const c of contratos) {
    for (const h of c.hooks) {
      if (!medible(h)) continue
      if (!objetivos.has(h.buscar)) {
        objetivos.set(h.buscar, {
          kind: h.kind,
          n: 0,
          mejor: null,
          puntuacion: 0,
          // Todos los archivos que lo contienen. Hace falta la lista entera, no
          // solo el mejor: un token se declara legitimamente en VARIOS sitios
          // (el elemento en browser.xhtml, su estilo en dos hojas), asi que "el
          // mejor cambio" no significa nada. Lo que si significa algo es que el
          // archivo al que apunta el contrato haya dejado de contenerlo.
          archivos: new Set(),
        })
      }
    }
  }

  // --- 3. Recorrer los omni.ja --------------------------------------------
  const claves = [...objetivos.keys()]
  let entradas = 0
  let hashZenMods = null

  for (const jar of jars) {
    for (const e of abrirZip(jar)) {
      if (e.esDirectorio || !EXT_TEXTO.test(e.nombre)) continue
      entradas++
      const texto = e.leerTexto()

      // El canario de la frontera del instalador. Todo lo que installer/lib/zen.mjs
      // replica —el formato de zen-themes.css, el esquema de zen-themes.json, la
      // siembra de valores por defecto y la derivacion del id del div de
      // preferencias— sale de este archivo. Un hash distinto no significa que
      // algo se haya roto, significa "lee el diff antes de confiar en el
      // instalador", y es la unica forma de enterarse sin repasar el codigo de
      // Zen entero.
      if (e.nombre.endsWith('zen-components/ZenMods.mjs')) {
        hashZenMods = crypto.createHash('sha256').update(texto, 'utf8').digest('hex').toUpperCase()
      }

      for (const k of claves) {
        if (!texto.includes(k)) continue
        const t = objetivos.get(k)
        t.n++
        t.archivos.add(e.nombre)
        const p = puntuar(texto, k, t.kind)
        if (p > t.puntuacion) {
          t.puntuacion = p
          t.mejor = e.nombre
        }
      }
    }
  }

  // --- 4. Informe ----------------------------------------------------------
  const filas = []
  for (const c of contratos) {
    for (const h of c.hooks) {
      let estado = 'ok'
      let encontrado = 0
      let donde = null
      let punt = 0
      let ancla = null

      if (!aplicaAqui(h)) {
        estado = 'otra-plataforma'
      } else if (!medible(h)) {
        estado = 'sin-comprobar'
      } else {
        const t = objetivos.get(h.buscar)
        encontrado = t.n
        donde = t.mejor
        punt = t.puntuacion
        if (encontrado === 0) {
          // Un token `opcional` es un nombre historico que se conserva a
          // proposito: su ausencia es lo esperado, no un fallo.
          estado = h.opcional ? 'historico' : 'FALTA'
        } else if (h.declarado_en && h.declarado_en !== '-' && !/^(xul\.dll|XUL|greprefs)/.test(h.declarado_en)) {
          ancla = t.archivos.has(h.declarado_en)
        }
      }

      filas.push({
        mod: c.mod,
        token: h.token,
        buscar: h.buscar,
        kind: h.kind,
        owner: h.owner,
        severity: h.severity,
        estado,
        archivos: encontrado,
        declara: donde,
        puntuacion: punt,
        ancla_ok: ancla,
        declarado_en: h.declarado_en,
        si_falta: h.si_falta,
      })
    }
  }

  const cuenta = (e) => filas.filter((f) => f.estado === e).length
  const faltan = filas.filter((f) => f.estado === 'FALTA')
  const criticos = faltan.filter((f) => f.severity === 'critico')
  // El token sigue existiendo, pero el archivo al que apunta el contrato ya no
  // lo contiene: Zen lo movio de sitio. No rompe nada hoy, y por eso mismo
  // interesa —suele ser el aviso previo a que desaparezca—, ademas de que deja
  // el `declarado_en` mandando a buscar donde no esta.
  const mudados = filas.filter((f) => f.ancla_ok === false)

  const resumen = {
    zen: zen.version,
    gecko: zen.gecko,
    buildId: zen.buildId,
    plataforma: platBuild,
    ruta: dirZen,
    zenmods: hashZenMods,
    entradas,
    hooks: filas.length,
    ok: cuenta('ok'),
    historicos: cuenta('historico'),
    sin_comprobar: cuenta('sin-comprobar'),
    otra_plataforma: cuenta('otra-plataforma'),
    faltan: faltan.length,
    criticos: criticos.length,
    mudados: mudados.length,
  }

  // --- 5. Linea base -------------------------------------------------------
  // Sin ella el informe solo sabe decir "presente/ausente". Con ella dice que ha
  // cambiado desde la version en la que esto estaba funcionando, que es la unica
  // pregunta que importa el dia de una actualizacion.
  //
  // Hay UNA POR PLATAFORMA (baseline.macos.json, baseline.windows.json) y una
  // sin sufijo, que es la de Windows de toda la vida. Compartirla no valdria:
  // el estado esperado de la mitad de los enganches del cristal es distinto en
  // cada sistema, asi que una sola linea base daria una pagina de "cambios" en
  // cuanto se ejecutara en el otro.
  const lineaBase = args['linea-base'] || rutaLineaBase(dirContrato, platBuild)
  const base = !args['sin-linea-base'] && fs.existsSync(lineaBase) ? z.leerJson(lineaBase, null) : null

  const cambios = []
  if (base) {
    const antes = new Map(Object.entries(base.hooks || {}))
    for (const f of filas) {
      const clave = `${f.mod}|${f.token}`
      if (!antes.has(clave)) {
        cambios.push({ clave, de: '(nuevo en el contrato)', a: f.estado, severity: f.severity })
      } else if (antes.get(clave) !== f.estado) {
        cambios.push({ clave, de: antes.get(clave), a: f.estado, severity: f.severity })
      }
      antes.delete(clave)
    }
    for (const [clave, de] of antes) {
      cambios.push({ clave, de, a: '(fuera del contrato)', severity: 'cosmetico' })
    }
  }

  if (args['actualizar-linea-base']) {
    const mapa = {}
    for (const f of [...filas].sort((a, b) => `${a.mod}|${a.token}`.localeCompare(`${b.mod}|${b.token}`))) {
      mapa[`${f.mod}|${f.token}`] = f.estado
    }
    z.escribirJson(lineaBase, {
      generado: new Date().toISOString(),
      plataforma: platBuild,
      zen: zen.version,
      gecko: zen.gecko,
      buildId: zen.buildId,
      zenmods_sha256: hashZenMods,
      hooks: mapa,
    })
    if (!args.json) console.log(z.tinta.verde(`Linea base escrita: ${lineaBase}`))
  }

  if (args.json) {
    console.log(JSON.stringify({ resumen, hooks: filas, cambios }, null, 2))
  } else {
    imprimir({ resumen, filas, mudados, base, cambios, breve: args.breve, dirZen, lineaBase })
  }

  // 0 al dia · 1 falta algo no critico · 2 falta algo critico · 3 no se pudo leer
  if (resumen.criticos) process.exitCode = 2
  else if (resumen.faltan) process.exitCode = 1
})

/** Nombre del archivo de linea base de una plataforma. */
export function rutaLineaBase(dirContrato, plat) {
  // Windows se queda con `baseline.json` a secas por compatibilidad: es el
  // archivo que ya existe en el repo, con su historial, y renombrarlo perderia
  // la comparacion con todo lo anterior.
  return path.join(dirContrato, plat === 'windows' ? 'baseline.json' : `baseline.${plat}.json`)
}

/**
 * De que sistema es la build que se esta leyendo.
 *
 * Se mira la forma del directorio, no `process.platform`: el uso mas util de
 * esta herramienta es apuntarla a una build descargada y sin instalar, y esa
 * puede ser de otro sistema. En macOS el directorio de instalacion es
 * `Contents/Resources` dentro de un .app; en Windows y Linux, la carpeta lleva
 * el ejecutable al lado.
 */
function plataformaDeLaBuild(dirZen) {
  const abs = path.resolve(dirZen)
  if (abs.includes('.app/Contents/')) return 'macos'
  if (fs.existsSync(path.join(dirZen, 'zen.exe'))) return 'windows'
  if (fs.existsSync(path.join(dirZen, 'zen'))) return 'linux'
  return z.plataforma()
}

/**
 * Declaracion contra simple mencion.
 *
 * El objetivo no es "aparece la cadena" —eso lo cumple cualquier traduccion—
 * sino "aqui esta declarado". Cada tipo de enganche tiene su firma:
 *   id     <box id="x">            o  #x { }
 *   class  class="... x ..."       o  .x { }
 *   attr   setAttribute("x", ...)  o  x="..."  o  [x]
 *   var    --x: valor              (una declaracion, no un var(--x))
 *   pref   pref("x", ...)
 *   media  (x) dentro de un @media
 * Todo lo que no encaje puntua 1: cuenta como visto, no como declarado.
 */
function puntuar(texto, token, kind) {
  const e = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // El flag va aparte y no incrustado como `(?m)`: eso es sintaxis de .NET, que
  // es de donde viene esta funcion, y en JavaScript lanza "Invalid group". Falla
  // en el primer token que lo use, asi que se ve enseguida — pero conviene
  // dejarlo escrito, porque el resto de los patrones si son identicos.
  const m = (patron, flags = '') => new RegExp(patron, flags).test(texto)

  switch (kind) {
    case 'id':
      if (m(`id\\s*=\\s*"${e}"`)) return 100
      if (m(`#${e}\\s*[,{:)]`)) return 85
      if (m(`getElementById\\(\\s*"${e}"`)) return 70
      break
    case 'class':
      if (m(`class\\s*=\\s*"[^"]*(^|\\s)${e}(\\s|")`)) return 100
      if (m(`\\.${e}\\s*[,{:)]`)) return 85
      break
    case 'attr':
      if (m(`setAttribute\\(\\s*"${e}"`)) return 100
      if (m(`(^|\\s)${e}\\s*=\\s*"`)) return 85
      if (m(`\\[${e}[\\]=~^*|$]`)) return 75
      break
    case 'var':
      if (m(`^\\s*${e}\\s*:`, 'm')) return 100
      if (m(`${e}\\s*:\\s*[^;]`)) return 75
      break
    case 'pref':
      if (m(`pref\\(\\s*"${e}"`)) return 100
      if (m(`"${e}"`)) return 70
      break
    case 'media':
      if (m(`\\(\\s*${e}\\s*[):]`)) return 90
      break
  }
  return 1
}

function imprimir({ resumen, filas, mudados, base, cambios, breve, dirZen, lineaBase }) {
  console.log('')
  console.log(`Zen ${resumen.zen}  |  Gecko ${resumen.gecko}  |  BuildID ${resumen.buildId}  |  ${resumen.plataforma}`)
  console.log(dirZen)
  console.log(`${resumen.hooks} enganches contra ${resumen.entradas} archivos de los omni.ja`)
  console.log('')

  const porMod = new Map()
  for (const f of filas) {
    if (!porMod.has(f.mod)) porMod.set(f.mod, [])
    porMod.get(f.mod).push(f)
  }

  for (const [mod, grupo] of porMod) {
    const malos = grupo.filter((f) => f.estado === 'FALTA')
    const pintar = malos.length ? z.tinta.rojo : z.tinta.verde
    const marca = malos.length ? 'FALLA' : 'ok   '
    console.log(pintar(`  ${marca}  ${mod.padEnd(20)} ${String(grupo.length).padStart(2)} enganches`))

    if (!breve) {
      for (const f of grupo.filter((f) => f.estado === 'historico')) {
        console.log(z.tinta.gris(`          historico   ${f.token}`))
      }
      for (const f of grupo.filter((f) => f.estado === 'otra-plataforma')) {
        console.log(z.tinta.gris(`          otra plat.  ${f.token}`))
      }
      for (const f of grupo.filter((f) => f.estado === 'sin-comprobar')) {
        console.log(z.tinta.gris(`          sin medir   ${f.token}`))
      }
    }
    for (const f of malos) {
      console.log(z.tinta.rojo(`          FALTA [${f.severity}]  ${f.token}`))
      console.log(z.tinta.amarillo(`                      ${f.si_falta}`))
    }
  }

  if (mudados.length && !breve) {
    console.log('')
    console.log(z.tinta.amarillo('  sigue existiendo, pero ya no en el archivo que dice el contrato:'))
    for (const m of mudados) {
      console.log(z.tinta.amarillo(`      ${m.mod.padEnd(18)} ${m.token}`))
      console.log(z.tinta.gris(`          contrato: ${m.declarado_en}`))
      console.log(z.tinta.gris(`          ahora   : ${m.declara}`))
    }
    console.log(z.tinta.gris('      No rompe nada hoy. Interesa porque suele ser el paso previo'))
    console.log(z.tinta.gris('      a que desaparezca, y porque deja el contrato apuntando mal.'))
  }

  console.log('')
  if (base) {
    if (base.buildId !== resumen.buildId) {
      console.log(z.tinta.cian(`  Build distinta de la validada: ${base.zen} (${base.buildId}) -> ${resumen.zen} (${resumen.buildId})`))
    } else {
      console.log(z.tinta.gris(`  Misma build que la linea base (${base.zen}).`))
    }
    if (base.zenmods_sha256 && resumen.zenmods && base.zenmods_sha256 !== resumen.zenmods) {
      console.log(z.tinta.amarillo('  ZenMods.mjs HA CAMBIADO. Lee su diff antes de confiar en el instalador:'))
      console.log(z.tinta.gris('  de ahi salen el formato de zen-themes.css, el esquema de zen-themes.json,'))
      console.log(z.tinta.gris('  la siembra de valores por defecto y el id del div de preferencias.'))
    }
    if (cambios.length) {
      console.log(z.tinta.amarillo(`  ${cambios.length} enganche(s) han cambiado de estado:`))
      for (const ch of cambios) console.log(z.tinta.amarillo(`      ${ch.clave.padEnd(58)} ${ch.de} -> ${ch.a}`))
    } else if (base.buildId !== resumen.buildId) {
      console.log(z.tinta.verde('  Ningun enganche ha cambiado de estado pese al cambio de build.'))
    }
  } else {
    console.log(z.tinta.gris(`  Sin linea base para ${resumen.plataforma} (${path.basename(lineaBase)}).`))
    console.log(z.tinta.gris('  Cuando compruebes que con esta version todo va bien:'))
    console.log(z.tinta.gris('      node dev/tools/probar-contrato.mjs --actualizar-linea-base'))
  }

  console.log('')
  if (resumen.criticos) console.log(z.tinta.rojo(`${resumen.criticos} enganche(s) CRITICO(s) desaparecido(s).`))
  else if (resumen.faltan) console.log(z.tinta.amarillo(`${resumen.faltan} enganche(s) desaparecido(s), ninguno critico.`))
  else console.log(z.tinta.verde('Todos los enganches comprobables siguen en su sitio.'))

  if (resumen.otra_plataforma) {
    console.log(z.tinta.gris(`${resumen.otra_plataforma} son de otra plataforma y aqui no aplican.`))
  }
  if (resumen.sin_comprobar) {
    console.log(z.tinta.gris(`${resumen.sin_comprobar} no se pueden medir aqui: usa node dev/tools/probar-vivo.mjs`))
  }
}

// ===========================================================================
// Nucleo compartido — el equivalente multiplataforma de ZenProfile.psm1
// ---------------------------------------------------------------------------
// Todo lo que los scripts necesitan saber del sistema vive aqui, y en un solo
// sitio: donde esta el perfil, donde esta instalado Zen, como se escribe una
// pref, como se recompila la hoja de mods.
//
// POR QUE NODE Y NO POWERSHELL. El repo nacio en Windows y sus herramientas de
// prueba (`probar-lrc.mjs`, `probar-reloj.mjs`, `probar-sintonia.mjs`) ya eran
// Node. Manteniendo una sola implementacion se evita lo peor de portar: que las
// dos versiones se separen y una arregle un fallo que la otra conserva.
//
// LA DIFERENCIA QUE MANDA. En Windows el cristal lo dibuja DWM detras de la
// ventana; en macOS lo dibuja una `NSVisualEffectView` que Gecko monta cuando ve
// `-moz-default-appearance: -moz-sidebar`. Son dos motores distintos con la
// misma consecuencia para el mod: la ventana ya es de cristal y lo unico que
// falta es retirar lo que Zen pinta opaco encima. Por eso el CSS es casi todo
// comun y lo que se bifurca son las prefs.
// ===========================================================================

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Plataforma
// ---------------------------------------------------------------------------

/** 'windows' | 'macos' | 'linux' */
export function plataforma() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  return 'linux'
}

export const ES_WINDOWS = plataforma() === 'windows'
export const ES_MACOS = plataforma() === 'macos'

/** Raiz del repo, calculada desde este archivo (installer/lib/zen.mjs). */
export const RAIZ_REPO = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

/**
 * Fin de linea del perfil.
 *
 * No es cosmetico: Firefox escribe prefs.js con CRLF en Windows y LF en macOS y
 * Linux. Escribir el que no toca no rompe nada —el parser acepta ambos— pero
 * deja el archivo con las lineas mezcladas, y a partir de ahi cualquier diff
 * del perfil es ilegible.
 */
export const EOL = ES_WINDOWS ? '\r\n' : '\n'

// ---------------------------------------------------------------------------
// Rutas del sistema
// ---------------------------------------------------------------------------

/**
 * Carpeta de datos de Zen, donde vive profiles.ini.
 *
 * Los tres sitios son los que usa el propio Gecko para el directorio de
 * usuario de la aplicacion (`nsXREDirProvider`), no una convencion nuestra.
 */
export function raizDatosZen() {
  switch (plataforma()) {
    case 'windows':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'zen')
    case 'macos':
      return path.join(os.homedir(), 'Library', 'Application Support', 'zen')
    default:
      return path.join(os.homedir(), '.zen')
  }
}

/**
 * Candidatos al directorio de instalacion de Zen (donde esta application.ini).
 *
 * En macOS el .app es un directorio y lo que hace de "directorio de
 * instalacion" a efectos de Gecko es `Contents/Resources`: ahi es donde busca
 * `config.js` y `defaults/pref/`, no en `Contents/MacOS`. Confundirlos deja el
 * autoconfig instalado y muerto, sin ningun error.
 */
export function candidatosInstalacionZen() {
  switch (plataforma()) {
    case 'windows':
      return [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Zen Browser'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Zen Browser'),
        path.join(process.env.LOCALAPPDATA || '', 'Zen Browser'),
      ].filter(Boolean)
    case 'macos':
      return [
        '/Applications/Zen.app/Contents/Resources',
        path.join(os.homedir(), 'Applications', 'Zen.app', 'Contents', 'Resources'),
        '/Applications/Zen Browser.app/Contents/Resources',
      ]
    default:
      return ['/opt/zen', '/usr/lib/zen', '/usr/lib64/zen', path.join(os.homedir(), '.local', 'share', 'zen')]
  }
}

/** Directorio de instalacion de Zen, o null si no se encuentra. */
export function resolverInstalacionZen(rutaExplicita) {
  const candidatos = rutaExplicita ? [rutaExplicita] : candidatosInstalacionZen()
  for (const dir of candidatos) {
    if (fs.existsSync(path.join(dir, 'application.ini'))) return dir
  }
  return null
}

/** Ejecutable de Zen, para lanzarlo desde un script. */
export function binarioZen(dirInstalacion) {
  const dir = dirInstalacion || resolverInstalacionZen()
  if (!dir) return null
  switch (plataforma()) {
    case 'windows':
      return path.join(dir, 'zen.exe')
    case 'macos':
      // Contents/Resources -> Contents/MacOS/zen
      return path.join(path.dirname(dir), 'MacOS', 'zen')
    default:
      return path.join(dir, 'zen')
  }
}

/** Lee Version / BuildID / MinVersion de application.ini. */
export function versionZen(dirInstalacion) {
  const dir = dirInstalacion || resolverInstalacionZen()
  const vacio = { version: '?', gecko: '?', buildId: '?' }
  if (!dir) return vacio
  const ini = path.join(dir, 'application.ini')
  if (!fs.existsSync(ini)) return vacio
  const out = { ...vacio }
  for (const linea of fs.readFileSync(ini, 'utf8').split(/\r?\n/)) {
    let m
    if ((m = linea.match(/^Version=(.+)$/))) out.version = m[1].trim()
    else if ((m = linea.match(/^BuildID=(.+)$/))) out.buildId = m[1].trim()
    else if ((m = linea.match(/^MinVersion=(.+)$/)) && out.gecko === '?') out.gecko = m[1].trim()
  }
  return out
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

/**
 * Ruta del perfil por defecto de Zen.
 *
 * Da prioridad a la seccion [Install<hash>] de profiles.ini: cuando hay varios
 * perfiles, esa es la que dice cual abre realmente este ejecutable, por encima
 * del Default=1 de las secciones [ProfileN].
 */
export function resolverPerfil(raiz = raizDatosZen()) {
  const ini = path.join(raiz, 'profiles.ini')
  if (!fs.existsSync(ini)) {
    throw new Error(`No se encontro profiles.ini en ${raiz}. Zen Browser no parece instalado para este usuario.`)
  }

  let seccion = ''
  let instalacion = null
  let marcado = null
  let rutaActual = null
  let esPorDefecto = false

  for (const bruta of fs.readFileSync(ini, 'utf8').split(/\r?\n/)) {
    const linea = bruta.trim()
    let m
    if ((m = linea.match(/^\[(.+)\]$/))) {
      if (esPorDefecto && rutaActual) marcado = rutaActual
      seccion = m[1]
      rutaActual = null
      esPorDefecto = false
      continue
    }
    if ((m = linea.match(/^Path=(.+)$/))) rutaActual = m[1]
    if ((m = linea.match(/^Default=(.+)$/))) {
      if (seccion.startsWith('Install')) instalacion = m[1]
      else if (m[1] === '1') esPorDefecto = true
    }
  }
  if (esPorDefecto && rutaActual) marcado = rutaActual

  const rel = instalacion || marcado
  if (!rel) throw new Error(`No se pudo determinar el perfil por defecto en ${ini}.`)

  // profiles.ini siempre usa '/' como separador, tambien en Windows.
  const perfil = path.join(raiz, ...rel.split('/'))
  if (!fs.existsSync(perfil)) {
    throw new Error(`El perfil declarado en profiles.ini no existe: ${perfil}`)
  }
  return perfil
}

/**
 * Falla si el perfil que vamos a tocar esta en uso.
 *
 * Zen reescribe prefs.js y zen-themes.json enteros al salir, asi que cualquier
 * cosa que escribamos con ese perfil abierto se perderia al cerrarlo — y sin
 * ningun error, que es lo peor: el script diria "listo" y no habria pasado nada.
 *
 * SE PREGUNTA POR EL PERFIL, NO POR EL PROCESO. La version anterior se negaba en
 * cuanto hubiera un `zen` corriendo, fuera cual fuera su perfil. Eso hacia
 * imposible preparar un perfil secundario sin cerrar el navegador, y sobre todo
 * hacia imposible probar el instalador. La condicion de verdad es que ESTE perfil
 * este abierto, y eso se sabe: Gecko deja `.parentlock` dentro mientras lo usa.
 *
 * Las dos senales juntas, porque cada una sola miente en un sentido:
 *   - `.parentlock` sobrevive a un cierre a lo bruto, asi que solo no prueba nada
 *   - un proceso de Zen puede estar usando otro perfil
 * Solo cuando coinciden se niega. Sin ningun Zen en marcha no hay nada que pueda
 * pisar lo que escribamos, aunque quede un lock viejo tirado.
 *
 * EL CANDADO NO SE LLAMA IGUAL EN WINDOWS. `.parentlock` es el de macOS y Linux;
 * en Windows Gecko deja `parent.lock`. Hasta el 24-09-2026 solo se miraba el
 * primero, y en Windows esta comprobacion no saltaba NUNCA que se le pasara un
 * perfil: medido con Zen abierto sobre el perfil de siempre, 49 procesos y la
 * funcion volviendo sin error. El instalador habria escrito prefs.js y
 * zen-themes.json con el navegador abierto, y Zen los habria pisado al cerrar.
 * Se miran los dos nombres.
 *
 * Y EN WINDOWS EL CANDADO NO DICE MAS QUE ESO. Medido el mismo dia: `parent.lock`
 * SIGUE AHI despues de cerrar Zen, y ni siquiera con el perfil abierto esta
 * bloqueado —se abre en exclusiva, se le bloquea el primer byte y se renombra
 * sin error—. O sea que en Windows la condicion se queda en "hay algun Zen en
 * marcha y este perfil se ha usado alguna vez", que es precavida de mas: con un
 * segundo Zen abierto sobre OTRO perfil tambien se niega. Se acepta, porque el
 * error al reves —escribir con el perfil abierto— se pierde en silencio, y este
 * solo pide cerrar el otro.
 */
const CANDADOS = ['.parentlock', 'parent.lock']

export function exigirZenCerrado(perfil) {
  const pids = pidsDeZen()
  if (!pids.length) return

  if (perfil && !CANDADOS.some((n) => fs.existsSync(path.join(perfil, n)))) {
    // Hay un Zen abierto, pero no es este perfil.
    return
  }

  const cual = perfil ? `el perfil ${perfil}` : 'Zen Browser'
  throw new Error(`${cual} esta abierto (PID ${pids.join(', ')}). Cierralo del todo y vuelve a ejecutar.`)
}

/** PIDs de Zen en marcha. Array vacio si no hay ninguno. */
export function pidsDeZen() {
  try {
    if (ES_WINDOWS) {
      const salida = execFileSync('tasklist', ['/FI', 'IMAGENAME eq zen.exe', '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return [...salida.matchAll(/^"zen\.exe","(\d+)"/gim)].map((m) => m[1])
    }
    // En macOS el ejecutable dentro del bundle se llama 'zen' igual que en
    // Linux. -x exige coincidencia exacta: sin ella, 'zen-agente.mjs' o
    // cualquier ruta que contenga "zen" contaria como navegador abierto.
    const salida = execFileSync('pgrep', ['-x', 'zen'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return salida.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    // pgrep sale con codigo 1 cuando no encuentra nada: eso no es un error.
    return []
  }
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------

/**
 * Escribe texto en UTF-8 sin BOM.
 *
 * Node no mete BOM, asi que aqui es casi un alias — pero se conserva el nombre
 * porque el motivo sigue vivo: `IOUtils.readJSON` de Gecko hace `JSON.parse`
 * directo sobre el texto y un BOM lo revienta. Si alguien cambia esta funcion,
 * que sepa contra que esta.
 */
export function escribirUtf8SinBom(destino, contenido) {
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, contenido, { encoding: 'utf8' })
}

export function leerJson(ruta, siFalta = null) {
  if (!fs.existsSync(ruta)) return siFalta
  const bruto = fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').trim()
  if (!bruto) return siFalta
  try {
    return JSON.parse(bruto)
  } catch (e) {
    // JSON.parse sin contexto dice «Unexpected token } in JSON at position 42»
    // y nada mas: ni el archivo ni que hacer. Con decenas de JSON en el perfil,
    // eso obliga a buscar a mano cual de todos esta roto.
    throw new Error(`${ruta}: el JSON no es valido (${e.message}). Revisa el archivo: una coma o una comilla de mas lo rompen entero.`)
  }
}

export function escribirJson(ruta, valor) {
  escribirUtf8SinBom(ruta, JSON.stringify(valor, null, 2) + '\n')
}

/** Copia un archivo si existe. Devuelve true si copio. */
export function copiarSiExiste(origen, destino) {
  if (!fs.existsSync(origen)) return false
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.copyFileSync(origen, destino)
  return true
}

// ---------------------------------------------------------------------------
// Mods
// ---------------------------------------------------------------------------

/**
 * Todos los mods del repo: cada subcarpeta de mod\ con theme.json.
 *
 * Cada entrada trae `aplica`, que dice si el mod tiene algo que hacer en esta
 * plataforma. Lo declara el propio theme.json con la clave `plataformas`; sin
 * ella se asume que vale en todas, que es el caso normal.
 */
export function mods(raizMods = path.join(RAIZ_REPO, 'mods'), plat = plataforma()) {
  if (!fs.existsSync(raizMods)) throw new Error(`No se encontro la carpeta de mods en ${raizMods}`)
  // Los mods van por categorias (mods/<categoria>/<mod>/). Un mod de Zen Mods es
  // la carpeta que lleva theme.json; se acepta tambien una carpeta plana de mods.
  const carpetas = []
  for (const d of fs.readdirSync(raizMods, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const dir = path.join(raizMods, d.name)
    if (fs.existsSync(path.join(dir, 'theme.json'))) { carpetas.push({ dir, name: d.name }); continue }
    for (const h of fs.readdirSync(dir, { withFileTypes: true })) {
      if (h.isDirectory() && fs.existsSync(path.join(dir, h.name, 'theme.json'))) carpetas.push({ dir: path.join(dir, h.name), name: h.name })
    }
  }
  return carpetas
    .map((d) => {
      const dir = d.dir
      const manifiesto = leerJson(path.join(dir, 'theme.json'))
      // Un theme.json vacio devuelve null y el acceso a .plataformas reventaba
      // con «Cannot read properties of null», que no dice ni que mod es.
      if (!manifiesto || typeof manifiesto !== 'object' || Array.isArray(manifiesto)) {
        throw new Error(`El ${path.join(dir, 'theme.json')} esta vacio o no contiene un objeto JSON. Cada mod necesita al menos {}.`)
      }
      const plataformas = manifiesto.plataformas ?? null
      // `plataformas` se compara con Array.includes; si alguien la escribe como
      // texto suelto, includes haria una busqueda de subcadena y el mod se
      // instalaria (o no) por casualidad. Mejor decirlo.
      if (plataformas !== null && !Array.isArray(plataformas)) {
        throw new Error(`El ${path.join(dir, 'theme.json')} tiene "plataformas" como ${typeof plataformas}; debe ser una lista, por ejemplo ["windows", "macos"].`)
      }
      return {
        dir,
        carpeta: d.name,
        manifiesto,
        aplica: !plataformas || plataformas.includes(plat),
        plataformas,
      }
    })
    .sort((a, b) => a.carpeta.localeCompare(b.carpeta))
}

/**
 * Recompila <perfil>/chrome/zen-themes.css a partir de zen-themes.json.
 *
 * Zen concatena los mods en ese archivo, pero solo lo regenera cuando algo toca
 * la pref `zen.mods.updated-value-observer` (es decir, desde su propia
 * interfaz) o tras la comprobacion periodica de actualizaciones. Al instalar un
 * mod a mano el archivo se queda como estaba y el CSS nunca llega a aplicarse.
 *
 * Esto reproduce el formato de `nsZenMods.#writeStylesheet` para que el mod
 * funcione desde el primer arranque. Cuando Zen lo regenere por su cuenta el
 * resultado sera equivalente, porque lee la misma fuente.
 */
export function recompilarHojaMods(perfil, ahora = new Date()) {
  const archivoTemas = path.join(perfil, 'zen-themes.json')
  const raizMods = path.join(perfil, 'chrome', 'zen-themes')
  const salida = path.join(perfil, 'chrome', 'zen-themes.css')

  const registrados = leerJson(archivoTemas, {}) || {}

  // El formato de fecha es el que produce `toLocaleString` de JS en en-US, con
  // el nombre largo de la zona horaria al final:
  //
  //   Thursday, August 6, 2026 at 8:50:31 AM Colombia Standard Time
  //
  // Verificado contra la hoja que genera el propio Zen. No es decorativo: si
  // esta linea no se parece a la suya, un vistazo al archivo no dice si lo
  // ultimo que lo escribio fue Zen o el instalador.
  const sello = ahora.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'long',
  })

  const partes = [
    '/* Zen Mods - Generated by ZenMods.',
    `* FILE GENERATED AT: ${sello}`,
    '* DO NOT EDIT THIS FILE DIRECTLY!',
    '* Your changes will be overwritten.',
    '* Instead, go to the preferences and edit the mods there.',
    '*/',
    '',
  ]

  let n = 0
  const avisos = []
  for (const [id, mod] of Object.entries(registrados)) {
    if (!mod) continue
    if (mod.enabled === false) continue

    const css = path.join(raizMods, id, 'chrome.css')
    if (!fs.existsSync(css)) {
      avisos.push(`El mod '${id}' esta registrado pero le falta chrome.css; se omite.`)
      continue
    }

    partes.push(`/* Name: ${mod.name} */`)
    partes.push(`/* Description: ${mod.description} */`)
    partes.push(`/* Author: @${mod.author} */`)
    partes.push(fs.readFileSync(css, 'utf8'))
    n++
  }

  partes.push('/* End of Zen Mods */', '')
  escribirUtf8SinBom(salida, partes.join('\n'))
  return { activos: n, avisos }
}

/**
 * Convierte preferences.json de un mod en prefs con su valor por defecto.
 *
 * `nsZenMods.#setDefaults` solo corre cuando Zen regenera la hoja de mods, no
 * en el arranque. Sin sembrar estos valores, en el primer arranque los checkbox
 * estarian sin definir (= false para `@media -moz-pref`) y el mod arrancaria con
 * la mitad de sus opciones apagadas.
 */
export function prefsPorDefectoDeMod(rutaPreferencesJson) {
  const salida = new Map()
  const entradas = leerJson(rutaPreferencesJson, null)
  if (!Array.isArray(entradas)) return salida
  for (const entrada of entradas) {
    if (entrada.defaultValue === undefined || entrada.defaultValue === null) continue
    if (entrada.type === 'checkbox') salida.set(entrada.property, entrada.defaultValue ? 'true' : 'false')
    else salida.set(entrada.property, JSON.stringify(String(entrada.defaultValue)))
  }
  return salida
}

/** Todos los nombres de pref que declara un mod, tengan valor por defecto o no. */
export function nombresDePrefsDeMod(rutaPreferencesJson) {
  const entradas = leerJson(rutaPreferencesJson, null)
  if (!Array.isArray(entradas)) return []
  return entradas.map((e) => e.property).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Prefs
// ---------------------------------------------------------------------------

const RE_USER_PREF = /^\s*user_pref\(\s*"([^"]+)"\s*,\s*(.+?)\s*\)\s*;\s*$/

/** Parsea un archivo estilo user.js a Map<nombre, 'literal js'>. */
export function leerArchivoPrefs(ruta) {
  const prefs = new Map()
  if (!fs.existsSync(ruta)) return prefs
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(RE_USER_PREF)
    if (m) prefs.set(m[1], m[2])
  }
  return prefs
}

/**
 * Las prefs que aplican a esta plataforma.
 *
 * `mods/appearance/acrylic-glass/prefs/acrylic-zen.user.js` son las comunes; `mods/appearance/acrylic-glass/prefs/windows.user.js` y
 * `mods/appearance/acrylic-glass/prefs/macos.user.js` traen las que solo tienen sentido en cada motor de
 * cristal. Se leen en ese orden y la especifica gana, porque es la que sabe.
 */
export function prefsDelCristal(dirPrefs = path.join(RAIZ_REPO, 'mods', 'appearance', 'acrylic-glass', 'prefs'), plat = plataforma()) {
  const comunes = path.join(dirPrefs, 'acrylic-zen.user.js')
  if (!fs.existsSync(comunes)) throw new Error(`No se encontro el archivo de prefs en ${comunes}`)

  const prefs = leerArchivoPrefs(comunes)
  const especifico = path.join(dirPrefs, `${plat}.user.js`)
  if (fs.existsSync(especifico)) {
    for (const [k, v] of leerArchivoPrefs(especifico)) prefs.set(k, v)
  }
  return prefs
}

export const MARCADOR = '// --- Acrylic Zen ---'

/** Escribe/actualiza lineas user_pref en prefs.js o user.js. */
export function escribirPrefs(ruta, prefs, marcador = MARCADOR) {
  const nombres = [...prefs.keys()]
  const existentes = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8').split(/\r?\n/) : []

  const conservadas = existentes.filter((linea) => {
    if (linea === marcador) return false
    return !nombres.some((n) => new RegExp(`^\\s*user_pref\\(\\s*"${escaparRegex(n)}"`).test(linea))
  })

  const bloque = ['', marcador, ...nombres.map((n) => `user_pref("${n}", ${prefs.get(n)});`)]
  escribirUtf8SinBom(ruta, recortarLineas([...conservadas, ...bloque]).join(EOL) + EOL)
  return nombres.length
}

/** Borra lineas user_pref por nombre (vuelven a su valor por defecto de Zen). */
export function borrarPrefs(ruta, nombres, marcador = MARCADOR) {
  if (!fs.existsSync(ruta)) return 0
  let borradas = 0
  const conservadas = []
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    if (linea === marcador) continue
    if (nombres.some((n) => new RegExp(`^\\s*user_pref\\(\\s*"${escaparRegex(n)}"`).test(linea))) borradas++
    else conservadas.push(linea)
  }
  escribirUtf8SinBom(ruta, recortarLineas(conservadas).join(EOL) + EOL)
  return borradas
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Quita las lineas en blanco del principio y del final.
 *
 * Sin esto, quitar prefs de un archivo deja el hueco donde estaban y volver a
 * ponerlas anade una linea en blanco mas cada vez: tras unas cuantas
 * reinstalaciones prefs.js empieza con media pantalla vacia. Zen no se queja
 * —lo reordena todo al cerrar— pero el archivo deja de poder leerse de un
 * vistazo, que es justo cuando hace falta.
 */
function recortarLineas(lineas) {
  let ini = 0
  let fin = lineas.length
  while (ini < fin && lineas[ini].trim() === '') ini++
  while (fin > ini && lineas[fin - 1].trim() === '') fin--
  return lineas.slice(ini, fin)
}

// ---------------------------------------------------------------------------
// Capa web
// ---------------------------------------------------------------------------

export const NIVELES_WEB = ['safe', 'full', 'aggressive', 'off']

/**
 * Genera <perfil>/chrome/userContent.css a partir de los parciales de web/.
 *
 * El nivel se elige al generar el archivo y no con un interruptor del mod, pero
 * no porque userContent.css no pueda leer opciones: SI puede leer las de tipo
 * checkbox, que son prefs, porque es hoja de usuario y eso le basta a
 * `-moz-pref` (asi funciona el interruptor del buscador de YouTube). Lo que no
 * llega a la pagina son los otros dos tipos: un desplegable escribe un atributo
 * en un <div> del marco y una cadena una variable en su raiz, y ni el div ni la
 * raiz del marco existen dentro del documento. El nivel es de esos.
 *
 * Orden de concatenacion: base, contenedores (si procede), agresivo (si
 * procede), ajustes por sitio y exclusiones al final. Las exclusiones van las
 * ultimas a proposito: a igual especificidad gana la ultima regla, asi que
 * siempre pueden devolver el fondo solido.
 */
export function generarUserContent(perfil, origenWeb, nivel = 'full', ahora = new Date()) {
  const partes = ['00-base.css']
  if (nivel === 'full' || nivel === 'aggressive') partes.push('10-wrappers.css')
  if (nivel === 'aggressive') partes.push('20-aggressive.css')
  partes.push('45-emergentes.css', '50-sites.css', '90-exclusions.css')

  const sello = ahora.toISOString().slice(0, 19).replace('T', ' ')
  const trozos = [
    '/* Acrylic Web - generado por installer/instalar.mjs',
    ` * NIVEL: ${nivel}`,
    ` * FECHA: ${sello} UTC`,
    ` * PLATAFORMA: ${plataforma()}`,
    ' *',
    ' * No edites este archivo: se regenera en cada instalacion.',
    ' * Edita los parciales de web/ y vuelve a ejecutar el instalador.',
    ' */',
    '',
  ]

  for (const p of partes) {
    const archivo = path.join(origenWeb, p)
    if (!fs.existsSync(archivo)) throw new Error(`Falta el parcial ${archivo}`)
    trozos.push(`/* ===== ${p} ===== */`)
    trozos.push(fs.readFileSync(archivo, 'utf8'))
  }

  // Reglas solo de este equipo (sitios de la red local...). No van al repo
  // (.gitignore): si el archivo existe, va al final; si no, no pasa nada.
  const local = path.join(origenWeb, '99-local.css')
  if (fs.existsSync(local)) {
    trozos.push('/* ===== 99-local.css ===== */')
    trozos.push(fs.readFileSync(local, 'utf8'))
  }

  escribirUtf8SinBom(path.join(perfil, 'chrome', 'userContent.css'), trozos.join('\n'))
  return partes.length
}

// ---------------------------------------------------------------------------
// Estado del compositor
// ---------------------------------------------------------------------------

/**
 * Avisos del sistema que impiden ver el cristal.
 *
 * Son distintos en cada plataforma porque el compositor es distinto, pero el
 * sintoma que evitan es el mismo: la ventana se queda plana y parece que el mod
 * no funciona.
 */
export function avisosDelSistema() {
  const avisos = []
  try {
    if (ES_WINDOWS) {
      const leerReg = (clave, valor) => {
        try {
          const salida = execFileSync('reg', ['query', clave, '/v', valor], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          })
          const m = salida.match(/REG_DWORD\s+0x([0-9a-f]+)/i)
          return m ? parseInt(m[1], 16) : null
        } catch {
          return null
        }
      }

      const transparencia = leerReg(
        'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
        'EnableTransparency'
      )
      if (transparencia !== 1) {
        avisos.push(
          'Windows tiene los efectos de transparencia APAGADOS. DWM no dibujara acrilico. ' +
            'Activalos en Configuracion > Personalizacion > Colores.'
        )
      }

      const acento = leerReg('HKCU\\SOFTWARE\\Microsoft\\Windows\\DWM', 'ColorPrevalence')
      if (acento === 1) {
        avisos.push(
          "Tienes activado 'Mostrar color de acento en barras de titulo'. Zen pinta ese color " +
            'solido sobre la ventana; el mod lo neutraliza, pero se ve mejor con esa opcion apagada.'
        )
      }

      const build = leerReg('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', 'CurrentBuild')
      const buildNum = build ?? Number(os.release().split('.')[2] || 0)
      if (buildNum && buildNum < 22621) {
        avisos.push(
          `Windows build ${buildNum}: DWMSBT_TRANSIENTWINDOW (acrilico) necesita Windows 11 22H2 ` +
            '(build 22621) o superior. El mod se quedara en un tinte plano.'
        )
      }
    } else if (ES_MACOS) {
      // "Reducir transparencia" apaga las NSVisualEffectView del sistema
      // entero: la vista sigue montada pero se pinta opaca, asi que el cristal
      // desaparece sin que nada falle. Es exactamente el mismo sintoma que los
      // efectos de transparencia apagados en Windows.
      if (ajusteBooleanoMac('com.apple.universalaccess', 'reduceTransparency')) {
        avisos.push(
          "macOS tiene 'Reducir transparencia' ACTIVADO. Las NSVisualEffectView se pintan " +
            'opacas y no habra cristal. Ajustes > Accesibilidad > Pantalla > Reducir transparencia. ' +
            '(El mod lo detecta con prefers-reduced-transparency y devuelve el aspecto solido de Zen, ' +
            'asi que la ventana se vera bien, solo que sin cristal.)'
        )
      }

      const mayor = Number(os.release().split('.')[0] || 0)
      // Darwin 20 = macOS 11 Big Sur, que es donde NSVisualEffectView gana los
      // materiales que usa Zen.
      if (mayor && mayor < 20) {
        avisos.push(
          `Darwin ${os.release()}: el cristal necesita macOS 11 Big Sur o superior. ` +
            'En versiones anteriores el material se cae a uno plano.'
        )
      }
    }
  } catch {
    // Un aviso que no se puede calcular no debe tumbar una instalacion.
  }
  return avisos
}

/** Lee un booleano de `defaults` en macOS. Devuelve false si no esta puesto. */
export function ajusteBooleanoMac(dominio, clave) {
  try {
    const salida = execFileSync('defaults', ['read', dominio, clave], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return salida === '1' || salida.toLowerCase() === 'true'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Consola
// ---------------------------------------------------------------------------

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const c = (codigo) => (t) => (COLOR ? `\x1b[${codigo}m${t}\x1b[0m` : String(t))

export const tinta = {
  verde: c('32'),
  rojo: c('31'),
  amarillo: c('33'),
  cian: c('36'),
  gris: c('90'),
  fuerte: c('1'),
}

export function linea(etiqueta, valor) {
  console.log(`${etiqueta.padEnd(16)}: ${valor}`)
}

export function aviso(texto) {
  console.warn(tinta.amarillo(`AVISO: ${texto}`))
}

/**
 * Parseo de argumentos.
 *
 * Acepta `--clave valor`, `--clave=valor` y `--interruptor`. Los nombres se
 * declaran para poder distinguir un interruptor de una clave con valor sin
 * adivinar por la forma del siguiente argumento.
 *
 * UNA CLAVE SIN VALOR ES UN ERROR, NO UN `undefined`. Antes `--perfil` al final
 * de la linea dejaba `args.perfil` en undefined y cada script caia en
 * `args.perfil || resolverPerfil()`: se instalaba en el perfil por defecto en
 * vez de en el que se queria tocar, sin decir nada. Y `--perfil --forzar`
 * tomaba `--forzar` como ruta del perfil. Las dos cosas se avisan ahora.
 */
export function parsearArgs(argv, { interruptores = [], claves = [] } = {}) {
  const salida = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      salida._.push(a)
      continue
    }
    const [nombre, incrustado] = a.slice(2).split(/=(.*)/s)
    if (interruptores.includes(nombre)) {
      salida[nombre] = incrustado === undefined ? true : incrustado !== 'false'
    } else if (claves.includes(nombre)) {
      if (incrustado !== undefined) {
        if (!incrustado.trim()) throw new Error(`Falta el valor de --${nombre}. Uso: --${nombre} <valor>`)
        salida[nombre] = incrustado
        continue
      }
      const siguiente = argv[i + 1]
      if (siguiente === undefined || !siguiente.trim() || siguiente.startsWith('--')) {
        throw new Error(`Falta el valor de --${nombre}. Uso: --${nombre} <valor>`)
      }
      salida[nombre] = argv[++i]
    } else {
      const validas = [...interruptores, ...claves].map((n) => `--${n}`)
      throw new Error(
        `Opcion desconocida: --${nombre}.` + (validas.length ? ` Opciones validas: ${validas.join(', ')}.` : '')
      )
    }
  }
  return salida
}

/** Envoltorio para que un fallo salga como una linea legible y no como traza. */
export function principal(fn) {
  Promise.resolve()
    .then(fn)
    .catch((e) => {
      console.error(tinta.rojo(`\n${e.message}`))
      if (process.env.ACRYLIC_DEBUG) console.error(e.stack)
      process.exitCode = 1
    })
}

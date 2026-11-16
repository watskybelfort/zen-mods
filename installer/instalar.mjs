#!/usr/bin/env node
// ===========================================================================
// Instala los mods de Acrylic Zen en un perfil de Zen Browser.
// ---------------------------------------------------------------------------
// Hace seis cosas, todas reversibles con `desinstalar.mjs`:
//   1. Copia cada mod a  <perfil>/chrome/zen-themes/<id>/
//   2. Lo registra en    <perfil>/zen-themes.json
//   3. Recompila         <perfil>/chrome/zen-themes.css   (si no, Zen no aplica
//      el CSS hasta que alguien toca un ajuste de mods desde su interfaz)
//   4. Genera            <perfil>/chrome/userContent.css  desde los parciales de
//      web/, que es lo que quita el fondo opaco de las paginas web
//   5. Siembra los valores por defecto de las opciones de cada mod
//   6. Aplica las prefs del cristal, que son las que hacen que el compositor
//      del sistema dibuje detras de la ventana
//
// Antes de tocar nada guarda una copia de zen-themes.json, zen-themes.css,
// userContent.css, prefs.js y user.js en <perfil>/acrylic-zen-backup/<fecha>/.
//
// USO
//   node installer/instalar.mjs
//   node installer/instalar.mjs --nivel-web aggressive
//   node installer/instalar.mjs --perfil "/ruta/al/perfil" --bloquear
//
// OPCIONES
//   --perfil <ruta>    Perfil concreto en vez del de por defecto.
//   --mods <lista>     Solo esos mods, por su carpeta: acrylic-glass,motion,...
//   --idioma es|en     Idioma de las opciones en Ajustes > Zen Mods (por defecto, el del sistema).
//                      Los demas no se tocan.
//   --nivel-web <n>    safe | full | aggressive | off   (por defecto: full)
//   --bloquear         Escribe las prefs en user.js en lugar de prefs.js. Con
//                      user.js se reaplican en cada arranque y about:config
//                      deja de poder cambiarlas de forma permanente.
//   --forzar           Instala tambien los mods que no aplican a esta
//                      plataforma. Esta aqui para poder preparar un perfil
//                      desde otro sistema, no para uso normal.
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import * as z from './lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['bloquear', 'forzar'],
    claves: ['perfil', 'nivel-web', 'mods', 'idioma'],
  })

  const nivelWeb = args['nivel-web'] ?? 'full'
  // El idioma de las opciones en Ajustes > Zen Mods: --idioma es|en, o el del
  // sistema. Cada mod trae preferences.json (ingles) y preferences.es.json.
  const idioma = args.idioma ?? (/^es/i.test(Intl.DateTimeFormat().resolvedOptions().locale || '') ? 'es' : 'en')
  if (!['es', 'en'].includes(idioma)) throw new Error('--idioma debe ser es o en')
  if (!z.NIVELES_WEB.includes(nivelWeb)) {
    throw new Error(`--nivel-web debe ser uno de: ${z.NIVELES_WEB.join(', ')}`)
  }

  const raizMods = path.join(z.RAIZ_REPO, 'mods')
  const origenWeb = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'acrylic-glass', 'web')

  // --- 1. Comprobaciones previas -----------------------------------------
  const todos = z.mods(raizMods)
  if (!todos.length) throw new Error(`No hay ningun mod con theme.json en ${raizMods}`)

  // --mods acrylic-glass,motion,... instala solo esos (por el nombre de su
  // carpeta). Los que no se piden no se tocan: ni se instalan ni se retiran.
  let elegidos = todos
  if (args.mods) {
    const pedidos = String(args.mods).split(',').map((x) => x.trim()).filter(Boolean)
    const desconocidos = pedidos.filter((n) => !todos.some((m) => m.carpeta === n))
    if (desconocidos.length) throw new Error(`No conozco estos mods: ${desconocidos.join(', ')}. Hay: ${todos.map((m) => m.carpeta).join(', ')}`)
    elegidos = todos.filter((m) => pedidos.includes(m.carpeta))
  }
  const aInstalar = args.forzar ? elegidos : elegidos.filter((m) => m.aplica)
  const omitidos = args.forzar ? [] : elegidos.filter((m) => !m.aplica)
  if (!aInstalar.length) throw new Error(`Ninguno de los mods elegidos aplica a ${z.plataforma()}.`)
  // La capa web y las prefs del cristal son de Acrylic Glass: sin el, no se tocan.
  const conCristal = aInstalar.some((m) => m.carpeta === 'acrylic-glass')

  const perfil = args.perfil || z.resolverPerfil()
  z.linea('Plataforma', z.plataforma())
  z.linea('Perfil objetivo', perfil)

  z.exigirZenCerrado(perfil)

  // --- 2. Backup ----------------------------------------------------------
  // La marca de tiempo es local y ordenable como texto, que es lo que usa
  // `restaurar.mjs` para elegir la mas reciente sin parsear fechas.
  const sello = selloDeTiempo()
  const dirBackup = path.join(perfil, 'acrylic-zen-backup', sello)
  fs.mkdirSync(dirBackup, { recursive: true })
  for (const rel of ['zen-themes.json', 'prefs.js', 'user.js', 'chrome/zen-themes.css', 'chrome/userContent.css']) {
    z.copiarSiExiste(path.join(perfil, ...rel.split('/')), path.join(dirBackup, path.basename(rel)))
  }
  z.linea('Backup', dirBackup)

  // --- 3 y 4. Copiar y registrar cada mod ---------------------------------
  const archivoTemas = path.join(perfil, 'zen-themes.json')
  let temas = {}
  try {
    temas = z.leerJson(archivoTemas, {}) || {}
  } catch {
    z.aviso('zen-themes.json ilegible, se reconstruye (copia en el backup).')
  }

  for (const mod of aInstalar) {
    const { manifiesto } = mod
    const destino = path.join(perfil, 'chrome', 'zen-themes', manifiesto.id)
    fs.mkdirSync(destino, { recursive: true })
    for (const f of ['chrome.css', 'preferences.json', 'readme.md']) {
      const traducido = f === 'preferences.json' && idioma === 'es' && fs.existsSync(path.join(mod.dir, 'preferences.es.json'))
      z.copiarSiExiste(path.join(mod.dir, traducido ? 'preferences.es.json' : f), path.join(destino, f))
    }
    temas[manifiesto.id] = manifiesto
    z.linea('Mod instalado', `${manifiesto.name} v${manifiesto.version}`)
  }

  // Un mod que no aplica no se deja a medias: si estaba de una instalacion
  // anterior (o de otro sistema con el perfil sincronizado) se retira. Dejarlo
  // registrado seria peor que no haberlo instalado nunca, porque su CSS
  // seguiria en la hoja compilada.
  for (const mod of omitidos) {
    const { manifiesto } = mod
    const destino = path.join(perfil, 'chrome', 'zen-themes', manifiesto.id)
    if (fs.existsSync(destino)) fs.rmSync(destino, { recursive: true, force: true })
    delete temas[manifiesto.id]
    z.linea('Mod omitido', `${manifiesto.name} — solo ${mod.plataformas.join('/')}`)
  }

  z.escribirJson(archivoTemas, temas)
  z.linea('Mods registrados', archivoTemas)

  // --- 5. Recompilar la hoja de mods --------------------------------------
  const hoja = z.recompilarHojaMods(perfil)
  for (const a of hoja.avisos) z.aviso(a)
  z.linea('Hoja recompilada', `${hoja.activos} mod(s) en chrome/zen-themes.css`)

  // --- 6. Capa de contenido web -------------------------------------------
  // Lo que hace que las paginas dejen ver el cristal: sin esto la ventana es de
  // cristal pero cada web sigue pintando su fondo opaco encima.
  if (!conCristal) {
    z.linea('Capa web', 'no se toca (Acrylic Glass no esta entre los elegidos)')
  } else if (nivelWeb === 'off') {
    const uc = path.join(perfil, 'chrome', 'userContent.css')
    if (fs.existsSync(uc)) fs.rmSync(uc, { force: true })
    z.linea('Capa web', 'desactivada (--nivel-web off)')
  } else {
    const n = z.generarUserContent(perfil, origenWeb, nivelWeb)
    z.linea('Capa web', `nivel '${nivelWeb}', ${n} parciales en chrome/userContent.css`)
  }

  // --- 7. Prefs -----------------------------------------------------------
  // Las del sistema (el cristal) y los valores por defecto de las opciones de
  // los mods van al mismo sitio, en un solo bloque.
  // LAS OPCIONES QUE YA TENGAS SE RESPETAN. Las del cristal se imponen (sin
  // ellas no hay cristal), pero de las opciones de cada mod solo se siembra el
  // valor por defecto de las que aun no estan en el perfil: reinstalar o
  // actualizar no te devuelve a fabrica lo que elegiste en Ajustes > Zen Mods.
  const destinoPrefs = path.join(perfil, args.bloquear ? 'user.js' : 'prefs.js')
  const yaPuestas = new Set([
    ...z.leerArchivoPrefs(path.join(perfil, 'prefs.js')).keys(),
    ...z.leerArchivoPrefs(path.join(perfil, 'user.js')).keys(),
  ])
  const deseadas = conCristal ? z.prefsDelCristal() : new Map()
  for (const mod of aInstalar) {
    for (const [k, v] of z.prefsPorDefectoDeMod(path.join(mod.dir, 'preferences.json'))) {
      if (!deseadas.has(k) && !yaPuestas.has(k)) deseadas.set(k, v)
    }
  }

  const aplicadas = z.escribirPrefs(destinoPrefs, deseadas)
  z.linea('Prefs aplicadas', `${destinoPrefs} (${aplicadas} prefs)`)

  // Las prefs de los mods que se omiten se limpian, por lo mismo que la carpeta:
  // una pref suelta de un mod que no esta no hace dano, pero aparece en
  // about:config y en el Doctor como si el mod estuviera puesto.
  if (omitidos.length) {
    const sobrantes = omitidos.flatMap((m) => z.nombresDePrefsDeMod(path.join(m.dir, 'preferences.json')))
    let limpiadas = 0
    for (const f of ['prefs.js', 'user.js']) {
      limpiadas += z.borrarPrefs(path.join(perfil, f), sobrantes)
    }
    if (limpiadas) z.linea('Prefs retiradas', `${limpiadas} de los mods omitidos`)
  }

  // --- 7.b Manifiesto del backup ------------------------------------------
  // Un backup sin manifiesto es una carpeta con fecha: no dice a que estado
  // vuelve, ni con que version de Zen se hizo, ni que nivel de capa web tenia.
  // Con esto `restaurar.mjs` puede contar lo que va a deshacer antes de hacerlo.
  const zen = z.versionZen()
  z.escribirJson(path.join(dirBackup, 'manifest.json'), {
    fecha: new Date().toISOString(),
    plataforma: z.plataforma(),
    perfil,
    repo_commit: commitDelRepo(),
    zen: { version: zen.version, gecko: zen.gecko, buildId: zen.buildId },
    web_level: nivelWeb,
    prefs_en: args.bloquear ? 'user.js' : 'prefs.js',
    prefs: [...deseadas.keys()],
    mods: aInstalar.map((m) => ({ id: m.manifiesto.id, name: m.manifiesto.name, version: m.manifiesto.version })),
    mods_omitidos: omitidos.map((m) => m.manifiesto.id),
    respaldados: fs.readdirSync(dirBackup).filter((f) => f !== 'manifest.json'),
  })
  z.linea('Manifiesto', path.join(dirBackup, 'manifest.json'))

  // --- 8. Avisos del sistema ----------------------------------------------
  for (const a of z.avisosDelSistema()) z.aviso(a)

  console.log('')
  console.log(z.tinta.verde('Listo. Abre Zen Browser.'))
  console.log('Ajustes > Zen Mods > Acrylic Zen para cambiar intensidad y tintes.')
  if (z.ES_MACOS) {
    console.log(
      z.tinta.gris(
        'El material del cristal no esta ahi: es zen.widget.macos.window-material\n' +
          'en about:config (1 = maxima transparencia, 6 = intermedio). Lo explica\n' +
          'mods/appearance/acrylic-glass/prefs/macos.user.js.'
      )
    )
  }
})

function selloDeTiempo(ahora = new Date()) {
  const p = (n, ancho = 2) => String(n).padStart(ancho, '0')
  return (
    `${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}` +
    `-${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`
  )
}

function commitDelRepo() {
  try {
    return execFileSync('git', ['-C', z.RAIZ_REPO, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return '?'
  }
}

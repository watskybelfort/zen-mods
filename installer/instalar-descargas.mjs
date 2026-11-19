#!/usr/bin/env node
// ===========================================================================
// Instala Zen Descargas con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                        el cargador (compartido)
//   <instalacion>/defaults/pref/zen-descargas.js   las prefs
//   <perfil>/chrome/zen-descargas/proceso.js       el inyector y el puente
//   <perfil>/chrome/zen-descargas/puro.js          validacion y argumentos (pagina y padre)
//   <perfil>/chrome/zen-descargas/motor.js         el boton y el panel en la pagina
//   <perfil>/chrome/zen-descargas/descargador.js   la cola y yt-dlp, en el padre
//   <perfil>/chrome/zen-descargas/bin/             yt-dlp (y ffmpeg si no habia)
//   <perfil>/chrome/zen-descargas/herramientas.json  donde esta cada herramienta
//
// LAS HERRAMIENTAS. yt-dlp se baja SIEMPRE de su pagina oficial de GitHub y se
// comprueba contra su SHA2-256SUMS antes de dejarlo en bin/: asi el mod tiene una
// copia suya que se puede actualizar sola (`yt-dlp -U`), sin depender de la que
// haya puesto winget o brew. ffmpeg se busca primero en el sistema (PATH, winget,
// Homebrew); solo si no esta, en Windows se baja la build que recomienda yt-dlp
// (yt-dlp/FFmpeg-Builds), tambien comprobada por SHA-256. Deno o Node hacen falta
// para los retos de JavaScript de YouTube: vale el Node que ejecuta esto.
//
// USO
//   node installer/instalar-descargas.mjs
//   node installer/instalar-descargas.mjs --solo-perfil        tras cambiar el motor
//   node installer/instalar-descargas.mjs --solo-instalacion   tras actualizar Zen
//   node installer/instalar-descargas.mjs --sin-bajar          no baja nada: usa lo del sistema
//   node installer/instalar-descargas.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-descargas.js'
const DIR_PERFIL = 'zen-descargas'
const PIEZAS = ['proceso.js', 'puro.js', 'motor.js', 'descargador.js']
const EXE = z.ES_WINDOWS ? '.exe' : ''

const YTDLP = {
  sumas: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS',
  archivo: z.ES_WINDOWS ? 'yt-dlp.exe' : z.ES_MACOS ? 'yt-dlp_macos' : 'yt-dlp',
  base: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/',
}
const FFMPEG_WIN = {
  sumas: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/checksums.sha256',
  archivo: 'ffmpeg-master-latest-win64-gpl.zip',
  base: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/',
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

async function bajar(url) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'zen-mods-installer' } })
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

// Baja un archivo de una release y lo compara con la suma publicada junto a el.
async function bajarComprobado({ sumas, archivo, base }) {
  const lista = (await bajar(sumas)).toString('utf8')
  const linea = lista.split(/\r?\n/).find((l) => l.trim().split(/\s+/)[1]?.replace(/^\*/, '') === archivo)
  if (!linea) throw new Error(`${archivo} no aparece en ${sumas}`)
  const esperada = linea.trim().split(/\s+/)[0].toLowerCase()
  const datos = await bajar(base + archivo)
  const real = sha256(datos)
  if (real !== esperada) throw new Error(`${archivo}: el SHA-256 no coincide (esperaba ${esperada}, llego ${real}). No se instala.`)
  return datos
}

// Busca un programa en el PATH, como `where` o `which`.
function enPath(nombre) {
  try {
    const salida = execFileSync(z.ES_WINDOWS ? 'where' : 'which', [nombre + EXE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const r = salida.split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s))
    return r || null
  } catch { return null }
}

// winget deja los paquetes portables en %LOCALAPPDATA%\Microsoft\WinGet\Packages
// y no siempre los enlaza en el PATH de este proceso (que ademas puede ir elevado).
function enWinget(prefijos, exe) {
  const raiz = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Packages')
  if (!fs.existsSync(raiz)) return null
  for (const prefijo of prefijos) {
    for (const p of fs.readdirSync(raiz).filter((d) => d.startsWith(prefijo))) {
      const pila = [path.join(raiz, p)]
      for (let i = 0; i < 200 && pila.length; i++) {
        const d = pila.pop()
        let entradas = []
        try { entradas = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
        for (const e of entradas) {
          if (e.isFile() && e.name.toLowerCase() === exe) return path.join(d, e.name)
          if (e.isDirectory()) pila.push(path.join(d, e.name))
        }
      }
    }
  }
  return null
}

function enMac(nombre) {
  for (const d of ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin']) {
    const f = path.join(d, nombre)
    if (fs.existsSync(f)) return f
  }
  return null
}

const buscar = (nombre, prefijosWinget) =>
  enPath(nombre) ||
  (z.ES_WINDOWS && prefijosWinget ? enWinget(prefijosWinget, nombre + '.exe') : null) ||
  (z.ES_MACOS ? enMac(nombre) : null)

async function prepararHerramientas(dirDestino, sinBajar) {
  const bin = path.join(dirDestino, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const h = { ytdlp: null, ffmpeg: null, deno: null, node: process.execPath }

  // yt-dlp: la copia propia, comprobada.
  const propio = path.join(bin, 'yt-dlp' + EXE)
  if (!sinBajar) {
    try {
      process.stdout.write('  Bajando yt-dlp de github.com/yt-dlp/yt-dlp… ')
      const datos = await bajarComprobado(YTDLP)
      fs.writeFileSync(propio, datos)
      if (!z.ES_WINDOWS) fs.chmodSync(propio, 0o755)
      console.log(`bien (${(datos.length / 1048576).toFixed(1)} MB, SHA-256 comprobado)`)
    } catch (e) {
      console.log('no se pudo')
      z.aviso(String(e.message || e))
    }
  }
  h.ytdlp = fs.existsSync(propio) ? propio : buscar('yt-dlp', ['yt-dlp.yt-dlp'])
  if (!h.ytdlp) throw new Error('No hay yt-dlp: no se pudo bajar y no esta en el sistema. Revisa la conexion y repite.')
  z.linea('yt-dlp', h.ytdlp)

  // ffmpeg: el del sistema si lo hay.
  const ffPropio = path.join(bin, 'ffmpeg' + EXE)
  h.ffmpeg = fs.existsSync(ffPropio) ? ffPropio : buscar('ffmpeg', ['yt-dlp.FFmpeg', 'Gyan.FFmpeg', 'BtbN.FFmpeg'])
  if (!h.ffmpeg && z.ES_WINDOWS && !sinBajar) {
    try {
      process.stdout.write('  Bajando ffmpeg de github.com/yt-dlp/FFmpeg-Builds (unos 150 MB)… ')
      const datos = await bajarComprobado(FFMPEG_WIN)
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zen-descargas-'))
      const zip = path.join(tmp, FFMPEG_WIN.archivo)
      fs.writeFileSync(zip, datos)
      // tar viene con Windows 10 y 11 y abre zip.
      execFileSync('tar', ['-xf', zip, '-C', tmp], { stdio: 'ignore' })
      const dirBin = fs.readdirSync(tmp).map((d) => path.join(tmp, d, 'bin')).find((d) => fs.existsSync(path.join(d, 'ffmpeg.exe')))
      if (!dirBin) throw new Error('el zip de ffmpeg no trae bin/ffmpeg.exe')
      for (const n of ['ffmpeg.exe', 'ffprobe.exe']) fs.copyFileSync(path.join(dirBin, n), path.join(bin, n))
      fs.rmSync(tmp, { recursive: true, force: true })
      h.ffmpeg = ffPropio
      console.log('bien (SHA-256 comprobado)')
    } catch (e) {
      console.log('no se pudo')
      z.aviso(String(e.message || e))
    }
  }
  if (h.ffmpeg) z.linea('ffmpeg', h.ffmpeg)
  else z.aviso(z.ES_MACOS
    ? 'No hay ffmpeg: sin el no hay MP3 ni video HD. Instalalo con `brew install ffmpeg` y repite.'
    : 'No hay ffmpeg: sin el no hay MP3 ni video HD. Repite el instalador con conexion.')

  h.deno = buscar('deno', ['DenoLand.Deno'])
  z.linea('JavaScript', h.deno ? `deno ${h.deno}` : `node ${h.node}`)

  z.escribirJson(path.join(dirDestino, 'herramientas.json'), h)
  return h
}

z.principal(async () => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar', 'sin-bajar'],
    claves: ['ruta-zen', 'perfil'],
  })

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'downloader', 'nativo')
  const dirZen = nat.exigirInstalacionZen(args['ruta-zen'])
  const perfil = args.perfil || z.resolverPerfil()
  const rutas = nat.rutasDeInstalacion(dirZen, NOMBRE_PREFS)
  const dirDestino = path.join(perfil, 'chrome', DIR_PERFIL)

  z.linea('Instalacion', dirZen)
  z.linea('Perfil', perfil)

  if (args.desinstalar) {
    let quitados = 0
    if (fs.existsSync(dirDestino)) {
      fs.rmSync(dirDestino, { recursive: true, force: true })
      quitados++
      z.linea('Quitado', dirDestino)
    }
    if (fs.existsSync(rutas.prefs)) {
      nat.exigirEscritura(dirZen)
      fs.rmSync(rutas.prefs, { force: true })
      quitados++
      z.linea('Quitado', rutas.prefs)
    }
    if (fs.existsSync(rutas.config)) {
      const otros = nat.otrosModsNativos(perfil, DIR_PERFIL)
      if (otros.length) {
        z.linea('Cargador', `se queda, lo sigue usando ${otros.join(' y ')}`)
      } else if (nat.MARCA_NUESTRA.test(fs.readFileSync(rutas.config, 'utf8'))) {
        nat.exigirEscritura(dirZen)
        fs.rmSync(rutas.config, { force: true })
        quitados++
        z.linea('Quitado', rutas.config)
      } else {
        z.aviso(`${rutas.config} no es nuestro; se deja como esta`)
      }
    }
    z.linea('Desinstalado', `${quitados} pieza(s). Reinicia Zen. Lo que ya bajaste sigue en tu carpeta de descargas.`)
    return
  }

  if (!args['solo-instalacion']) {
    fs.mkdirSync(dirDestino, { recursive: true })
    for (const nombre of PIEZAS) {
      const origen = path.join(dirNativo, nombre)
      if (!fs.existsSync(origen)) throw new Error(`No existe ${origen}. El repo esta incompleto.`)
      fs.copyFileSync(origen, path.join(dirDestino, nombre))
      z.linea('Copiado', path.join(dirDestino, nombre))
    }
    await prepararHerramientas(dirDestino, !!args['sin-bajar'])
  }

  if (!args['solo-perfil']) {
    const prefs = fs.readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8')
    nat.instalarCargador({ dirZen, nombrePrefs: NOMBRE_PREFS, contenidoPrefs: prefs })
    z.linea('Prefs', rutas.prefs)
    nat.avisosDelDirectorioDeInstalacion()
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo y abre un video en YouTube o una cancion en YouTube Music.')
  console.log('En YouTube sale "Descargar" junto a Compartir; en YouTube Music, una flecha en la barra del reproductor.')
  console.log('Los archivos van a tu carpeta de descargas de Zen.')
})

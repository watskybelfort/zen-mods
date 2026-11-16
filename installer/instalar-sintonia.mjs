#!/usr/bin/env node
// ===========================================================================
// Instala Zen Sintonia con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                       el cargador de autoconfig
//                                                 (COMPARTIDO con Zen Letra Viva)
//   <instalacion>/defaults/pref/zen-sintonia.js   las prefs y el puerto
//   <perfil>/chrome/zen-sintonia/proceso.js       el inyector + el puente
//
// DONDE CAE `<instalacion>` EN CADA SISTEMA:
//   Windows   C:\Program Files\Zen Browser\
//   macOS     /Applications/Zen.app/Contents/Resources/
//
// SOBRE macOS, QUE ES DONDE ESTE MOD SE VUELVE RARO. El motivo por el que
// Sintonia existe es de Windows: el widget de musica de OBS lee SMTC y elige la
// sesion por aplicacion, y Gecko publica UNA sola sesion para todo el navegador
// en vez de una por pestana como hace Chromium, asi que el filtro no casa nunca.
// Ese problema concreto no existe en macOS, porque ahi no hay SMTC: el
// equivalente es MPNowPlayingInfoCenter y los widgets de OBS para Mac no suelen
// leerlo.
//
// Lo que si sigue valiendo aqui es LA SOLUCION, que no depende del sistema: el
// mod lee `navigator.mediaSession` dentro de la pestana y lo empuja por HTTP a
// `127.0.0.1:<puerto>` desde el lado privilegiado, sin pasar por CORS ni por la
// CSP de la pagina. Cualquier cosa que sepa leer ese endpoint —un widget, un
// script, una escena de OBS— funciona igual en los dos sistemas. Por eso se
// instala en macOS en vez de bloquearse: lo que no se puede prometer es el
// widget de Windows, no el puente.
//
// USO
//   node installer/instalar-sintonia.mjs
//   node installer/instalar-sintonia.mjs --puerto 9500
//   node installer/instalar-sintonia.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-sintonia.js'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil', 'puerto'],
  })

  const puerto = Number(args.puerto ?? 9463)
  if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) {
    throw new Error(`Puerto fuera de rango: ${args.puerto}`)
  }

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'obs-now-playing', 'nativo')
  const dirZen = nat.exigirInstalacionZen(args['ruta-zen'])
  const perfil = args.perfil || z.resolverPerfil()
  const rutas = nat.rutasDeInstalacion(dirZen, NOMBRE_PREFS)

  const dirProceso = path.join(perfil, 'chrome', 'zen-sintonia')

  z.linea('Instalacion', dirZen)
  z.linea('Perfil', perfil)

  // --- Desinstalar --------------------------------------------------------
  if (args.desinstalar) {
    let quitados = 0

    if (fs.existsSync(dirProceso)) {
      fs.rmSync(dirProceso, { recursive: true, force: true })
      quitados++
      z.linea('Quitado', dirProceso)
    }

    if (fs.existsSync(rutas.prefs)) {
      nat.exigirEscritura(dirZen)
      fs.rmSync(rutas.prefs, { force: true })
      quitados++
      z.linea('Quitado', rutas.prefs)
    }

    // EL CARGADOR NO SE BORRA A LA LIGERA. Es compartido: si queda otro mod
    // nativo instalado, llevarselo lo dejaria muerto tambien a el, y ese fallo
    // no se relaciona con haber desinstalado esto en semanas.
    if (fs.existsSync(rutas.config)) {
      const otros = nat.otrosModsNativos(perfil, 'zen-sintonia')
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

    z.linea('Desinstalado', `${quitados} pieza(s). Reinicia Zen.`)
    return
  }

  // --- 1. El inyector, en el perfil ---------------------------------------
  if (!args['solo-instalacion']) {
    const origen = path.join(dirNativo, 'proceso.js')
    if (!fs.existsSync(origen)) throw new Error(`No existe ${origen}. El repo esta incompleto.`)
    fs.mkdirSync(dirProceso, { recursive: true })

    // Se copia tal cual, sin generar nada: el recolector que corre dentro de la
    // pagina va escrito como una funcion dentro de este mismo archivo y se
    // inyecta con toString(), asi que no hay nada que compilar ni que escapar.
    fs.copyFileSync(origen, path.join(dirProceso, 'proceso.js'))
    const kb = (fs.statSync(path.join(dirProceso, 'proceso.js')).size / 1024).toFixed(1)
    z.linea('Inyector', `${path.join(dirProceso, 'proceso.js')} (${kb} KB)`)
  }

  // --- 2. El cargador y las prefs, en la instalacion ----------------------
  if (!args['solo-perfil']) {
    // El puerto se siembra en el archivo de prefs en lugar de dejarlo fijo en el
    // codigo, para que cambiarlo no obligue a tocar el mod: es una linea de
    // about:config, o este instalador con --puerto.
    const prefs = fs
      .readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8')
      .replace(/pref\('zen\.sintonia\.puerto', \d+\);/, `pref('zen.sintonia.puerto', ${puerto});`)

    nat.instalarCargador({ dirZen, nombrePrefs: NOMBRE_PREFS, contenidoPrefs: prefs })
    z.linea('Prefs', `${rutas.prefs} (puerto ${puerto})`)
    nat.avisosDelDirectorioDeInstalacion()
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo y pon musica en music.youtube.com.')
  console.log('Para comprobarlo:')
  console.log(`  http://localhost:${puerto}/nowplaying   ->   el campo fuente tiene que decir "ytm"`)
  if (z.ES_MACOS) {
    console.log('')
    console.log(z.tinta.gris('En macOS el puente funciona igual, pero el widget de musica de OBS que'))
    console.log(z.tinta.gris('motivo este mod lee SMTC y es de Windows. Aqui tienes el endpoint; lo que'))
    console.log(z.tinta.gris('lo consuma tiene que hablar HTTP, no la API de media del sistema.'))
  }
})

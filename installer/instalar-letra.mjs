#!/usr/bin/env node
// ===========================================================================
// Instala Zen Letra Viva sin gestor de userscripts, con el cargador nativo.
// ---------------------------------------------------------------------------
// Deja el mod funcionando en Zen sin depender de ninguna extension. Escribe en
// dos sitios, y conviene saber por que en cada uno:
//
//   <instalacion>/config.js                    el cargador de autoconfig
//                                              (COMPARTIDO por todos los mods
//                                              nativos: core/config.js)
//   <instalacion>/defaults/pref/zen-letra.js   las prefs que lo encienden
//   <perfil>/chrome/zen-letra/proceso.js       el inyector
//   <perfil>/chrome/zen-letra/zen-letra-viva.user.js   el motor, copiado tal cual
//
// DONDE CAE `<instalacion>` EN CADA SISTEMA:
//   Windows   C:\Program Files\Zen Browser\
//   macOS     /Applications/Zen.app/Contents/Resources/
//
// El motor se copia SIN transformarlo, y es a proposito: el archivo que corre
// con el cargador nativo es el mismo que se instalaria en un gestor de
// userscripts. Un artefacto, dos cargadores.
//
// Las dos primeras piezas van en el directorio de instalacion porque el
// autoconfig se lee antes de que exista un perfil. Eso significa DOS COSAS:
//
//   1. Hace falta permiso de escritura ahi. En Windows suele pedir
//      administrador; en macOS, si arrastraste Zen.app a /Applications tu
//      mismo, la carpeta es tuya y no hace falta sudo.
//   2. Una actualizacion de Zen reemplaza el directorio de instalacion y se
//      lleva por delante esos dos archivos. El inyector, que vive en el perfil,
//      sobrevive. Cuando eso pase se vuelve a ejecutar con --solo-instalacion.
//
// Si ya hay un config.js de otra cosa (fx-autoconfig, por ejemplo), NO se
// sobrescribe: avisa y se para. Pisarlo dejaria sin cargador a lo que hubiera
// antes, y eso es de las cosas que uno tarda semanas en relacionar.
//
// USO
//   node installer/instalar-letra.mjs
//   node installer/instalar-letra.mjs --solo-perfil       tras recompilar el motor
//   node installer/instalar-letra.mjs --solo-instalacion  tras actualizar Zen
//   node installer/instalar-letra.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-letra.js'
const ALTERNATIVA =
  'O instalar el mod como userscript, que no toca el directorio de instalacion:\n    mods/youtube-music/live-lyrics/dist/zen-letra-viva.user.js'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil'],
  })

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'live-lyrics', 'nativo')
  const construido = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'live-lyrics', 'dist', 'zen-letra-viva.user.js')

  const dirZen = nat.exigirInstalacionZen(args['ruta-zen'])
  const perfil = args.perfil || z.resolverPerfil()
  const rutas = nat.rutasDeInstalacion(dirZen, NOMBRE_PREFS)

  const dirProceso = path.join(perfil, 'chrome', 'zen-letra')

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
      const otros = nat.otrosModsNativos(perfil, 'zen-letra')
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

  // --- Comprobaciones ------------------------------------------------------
  if (!args['solo-instalacion'] && !fs.existsSync(construido)) {
    throw new Error(`No existe ${construido}. Ejecuta primero: node installer/compilar-letra.mjs`)
  }

  // --- 1. El inyector y el motor, en el perfil ----------------------------
  if (!args['solo-instalacion']) {
    fs.mkdirSync(dirProceso, { recursive: true })

    // Los dos se copian tal cual. El inyector no se genera y el motor no se
    // transforma: config.js lo lee del disco y lo publica en sharedData, que es
    // lo que evita todo el asunto del escapado.
    fs.copyFileSync(path.join(dirNativo, 'proceso.js'), path.join(dirProceso, 'proceso.js'))
    fs.copyFileSync(construido, path.join(dirProceso, 'zen-letra-viva.user.js'))

    const kb = (fs.statSync(path.join(dirProceso, 'zen-letra-viva.user.js')).size / 1024).toFixed(1)
    z.linea('Inyector', path.join(dirProceso, 'proceso.js'))
    z.linea('Motor', `${path.join(dirProceso, 'zen-letra-viva.user.js')} (${kb} KB)`)
  }

  // --- 2. El cargador, en la instalacion ----------------------------------
  if (!args['solo-perfil']) {
    nat.instalarCargador({
      dirZen,
      nombrePrefs: NOMBRE_PREFS,
      contenidoPrefs: fs.readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8'),
      salidaAlternativa: ALTERNATIVA,
    })
    z.linea('Prefs', rutas.prefs)
    nat.avisosDelDirectorioDeInstalacion()
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo y abre music.youtube.com.')
  if (z.ES_MACOS) {
    console.log(z.tinta.gris('(En macOS "cerrar la ventana" no cierra la app: Cmd+Q, o el proceso sigue vivo'))
    console.log(z.tinta.gris(' y el autoconfig no se vuelve a leer.)'))
  } else {
    console.log(z.tinta.gris('(Cerrar la ventana no basta si queda en la bandeja.)'))
  }
  console.log('Para comprobarlo, en la consola de la pagina:')
  console.log('  window.__zenLetra.estado()')
  console.log('El campo via.red tiene que decir "puente".')
})

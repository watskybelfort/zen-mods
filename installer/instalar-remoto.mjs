#!/usr/bin/env node
// ===========================================================================
// Instala Zen Remoto con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                     el cargador (compartido)
//   <instalacion>/defaults/pref/zen-remoto.js   las prefs
//   <perfil>/chrome/zen-remoto/proceso.js       el inyector y el puente
//   <perfil>/chrome/zen-remoto/puro.js          extractor y validacion (pagina y padre)
//   <perfil>/chrome/zen-remoto/qr.js            el QR del panel
//   <perfil>/chrome/zen-remoto/motor.js         estado, ordenes y panel en la pagina
//   <perfil>/chrome/zen-remoto/servidor.js      el servidor del movil, en el padre
//   <perfil>/chrome/zen-remoto/movil/           la pagina del movil
//
// USO
//   node installer/instalar-remoto.mjs
//   node installer/instalar-remoto.mjs --solo-perfil        tras cambiar el motor
//   node installer/instalar-remoto.mjs --solo-instalacion   tras actualizar Zen
//   node installer/instalar-remoto.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-remoto.js'
const DIR_PERFIL = 'zen-remoto'
const PIEZAS = ['proceso.js', 'puro.js', 'qr.js', 'motor.js', 'servidor.js']

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil'],
  })

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'phone-remote', 'nativo')
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
    z.linea('Desinstalado', `${quitados} pieza(s). Reinicia Zen.`)
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
    // La pagina del movil: se copia entera y se borra lo que sobre de antes, para
    // que el servidor no sirva nada viejo (sirve una lista cerrada de todas formas).
    const dirMovil = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'phone-remote', 'movil')
    const destMovil = path.join(dirDestino, 'movil')
    fs.rmSync(destMovil, { recursive: true, force: true })
    fs.cpSync(dirMovil, destMovil, { recursive: true })
    z.linea('Copiado', destMovil)
  }

  if (!args['solo-perfil']) {
    const prefs = fs.readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8')
    nat.instalarCargador({ dirZen, nombrePrefs: NOMBRE_PREFS, contenidoPrefs: prefs })
    z.linea('Prefs', rutas.prefs)
    nat.avisosDelDirectorioDeInstalacion()
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo y abre music.youtube.com.')
  console.log('En la barra del reproductor sale el boton del movil: abre el QR y escanealo.')
  console.log('La primera vez Windows puede pedir permiso de red para Zen: acepta en redes privadas.')
})

#!/usr/bin/env node
// ===========================================================================
// Instala Zen Mezcla con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                     el cargador (compartido)
//   <instalacion>/defaults/pref/zen-mezcla.js   las prefs
//   <perfil>/chrome/zen-mezcla/proceso.js       el inyector
//   <perfil>/chrome/zen-mezcla/puro.js          lectura de contenedores y tiempos
//   <perfil>/chrome/zen-mezcla/motor.js         captura, grafo, director y panel
//
// USO
//   node installer/instalar-mezcla.mjs
//   node installer/instalar-mezcla.mjs --solo-perfil        tras cambiar el motor
//   node installer/instalar-mezcla.mjs --solo-instalacion   tras actualizar Zen
//   node installer/instalar-mezcla.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-mezcla.js'
const DIR_PERFIL = 'zen-mezcla'
const PIEZAS = ['proceso.js', 'puro.js', 'motor.js']

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil'],
  })

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'crossfade', 'nativo')
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
  }

  if (!args['solo-perfil']) {
    const prefs = fs.readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8')
    nat.instalarCargador({ dirZen, nombrePrefs: NOMBRE_PREFS, contenidoPrefs: prefs })
    z.linea('Prefs', rutas.prefs)
    nat.avisosDelDirectorioDeInstalacion()
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo y pon musica en music.youtube.com.')
  console.log('Para comprobarlo, en la consola de la pagina:  window.__zenMezcla.estado()')
})

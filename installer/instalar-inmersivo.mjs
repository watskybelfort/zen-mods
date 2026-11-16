#!/usr/bin/env node
// ===========================================================================
// Instala Zen Inmersivo con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                     el cargador (compartido)
//   <instalacion>/defaults/pref/zen-inmersivo.js   las prefs
//   <perfil>/chrome/zen-inmersivo/proceso.js       el inyector de las paginas
//   <perfil>/chrome/zen-inmersivo/puro.js          el motor (que CSS va en cada web)
//   <perfil>/chrome/zen-inmersivo/servicio.js      catalogo y ajustes, en el padre
//   <perfil>/chrome/zen-inmersivo/ventana.js       clic derecho y atajos
//   <perfil>/chrome/zen-inmersivo/catalogo.json    el catalogo incluido (my-internet, MIT)
//
// USO
//   node installer/instalar-inmersivo.mjs
//   node installer/instalar-inmersivo.mjs --solo-perfil        tras cambiar el motor
//   node installer/instalar-inmersivo.mjs --solo-instalacion   tras actualizar Zen
//   node installer/instalar-inmersivo.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-inmersivo.js'
const DIR_PERFIL = 'zen-inmersivo'
const PIEZAS = ['proceso.js', 'puro.js', 'servicio.js', 'ventana.js']

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil'],
  })

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'immersive-web', 'nativo')
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
    // El catalogo incluido. El que se baje despues va aparte (catalogo-actual.json)
    // y no se toca: reinstalar no tira la actualizacion.
    const cat = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'immersive-web', 'catalogo', 'styles.json')
    fs.copyFileSync(cat, path.join(dirDestino, 'catalogo.json'))
    z.linea('Copiado', path.join(dirDestino, 'catalogo.json'))
  }

  if (!args['solo-perfil']) {
    const prefs = fs.readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8')
    nat.instalarCargador({ dirZen, nombrePrefs: NOMBRE_PREFS, contenidoPrefs: prefs })
    z.linea('Prefs', rutas.prefs)
    nat.avisosDelDirectorioDeInstalacion()
  }

  console.log('')
  console.log('Listo. Desactiva la extension Zen Internet (mientras este activa, el mod no pinta)')
  console.log('y reinicia Zen del todo. Controles: clic derecho > Zen Inmersivo, y Alt+Mayus+U/G/O/B.')
})

#!/usr/bin/env node
// ===========================================================================
// Instala Zen Modo Oscuro con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                          el cargador de autoconfig
//                                                    (COMPARTIDO con los demas
//                                                    mods nativos)
//   <instalacion>/defaults/pref/zen-modo-oscuro.js   las prefs y la lista
//   <perfil>/chrome/zen-modo-oscuro/proceso.js       el inyector de contenido
//   <perfil>/chrome/zen-modo-oscuro/ventana.js       la entrada del clic derecho
//   <perfil>/chrome/zen-modo-oscuro/darkreader.js    el motor (Dark Reader)
//   <perfil>/chrome/zen-modo-oscuro/arreglos.json    su base de arreglos por sitio,
//                                                    compilada de motor/dynamic-theme-fixes.config
//
// DONDE CAE `<instalacion>` EN CADA SISTEMA:
//   Windows   C:\Program Files\Zen Browser\
//   macOS     /Applications/Zen.app/Contents/Resources/
//
// QUE HACE FALTA ADEMAS DE ESTO. Dos cosas, y ninguna es obligatoria:
//
//   node installer/instalar.mjs     la entrada "Zen Modo Oscuro" en Ajustes >
//                                 Zen Mods (los interruptores de "oscurecer
//                                 todas las paginas" y "mostrar la entrada"), y
//                                 las guardas de la capa web: las laminas claras
//                                 de Shopify o Meta se apartan donde el modo
//                                 oscuro esta puesto. Sin esto el modo oscuro
//                                 funciona, pero esos sitios se quedan con su
//                                 lamina blanca ENCIMA del tema oscuro.
//
// SE INSTALA APARTE, y no dentro de instalar.mjs, por la misma razon que Zen Sin
// Cristal: esto escribe en el directorio de instalacion de Zen, que en Windows
// suele pedir administrador, e instalar.mjs no sale del perfil.
//
// USO
//   node installer/instalar-modo-oscuro.mjs
//   node installer/instalar-modo-oscuro.mjs --solo-instalacion
//   node installer/instalar-modo-oscuro.mjs --solo-perfil
//   node installer/instalar-modo-oscuro.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'
import { compilarArreglos, ARREGLOS_PROPIOS } from './lib/arreglos-oscuro.mjs'

const NOMBRE_PREFS = 'zen-modo-oscuro.js'
const DIR_PERFIL = 'zen-modo-oscuro'

// [archivo en el repo, ruta relativa al repo] -> se copia al perfil con ese nombre
const PIEZAS = [
  ['proceso.js', ['mods', 'appearance', 'dark-mode', 'nativo', 'proceso.js']],
  ['ventana.js', ['mods', 'appearance', 'dark-mode', 'nativo', 'ventana.js']],
  ['darkreader.js', ['mods', 'appearance', 'dark-mode', 'motor', 'darkreader.js']],
]

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil'],
  })

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'dark-mode', 'nativo')
  const dirZen = nat.exigirInstalacionZen(args['ruta-zen'])
  const perfil = args.perfil || z.resolverPerfil()
  const rutas = nat.rutasDeInstalacion(dirZen, NOMBRE_PREFS)

  const dirDestino = path.join(perfil, 'chrome', DIR_PERFIL)

  z.linea('Instalacion', dirZen)
  z.linea('Perfil', perfil)

  // --- Desinstalar --------------------------------------------------------
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

    // EL CARGADOR NO SE BORRA A LA LIGERA. Es compartido: si queda otro mod
    // nativo instalado, llevarselo lo dejaria muerto tambien a el.
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

    // La lista de sitios NO se borra del perfil: es lo unico que el usuario ha
    // escrito de su mano, y reinstalar despues de una actualizacion de Zen es lo
    // normal. Sin el inyector no hace nada, asi que no molesta.
    z.linea('La lista', 'se queda en zen.modooscuro.sitios (about:config)')
    z.linea('Desinstalado', `${quitados} pieza(s). Reinicia Zen.`)
    return
  }

  // --- 1. Las piezas, en el perfil ----------------------------------------
  if (!args['solo-instalacion']) {
    fs.mkdirSync(dirDestino, { recursive: true })
    for (const [nombre, ruta] of PIEZAS) {
      const origen = path.join(z.RAIZ_REPO, ...ruta)
      if (!fs.existsSync(origen)) throw new Error(`No existe ${origen}. El repo esta incompleto.`)
      fs.copyFileSync(origen, path.join(dirDestino, nombre))
      z.linea('Copiado', path.join(dirDestino, nombre))
    }

    // La base de arreglos por sitio de Dark Reader, compilada. Es opcional para el
    // cargador (sin ella el motor funciona igual, solo que sin los ajustes de
    // Wikipedia, Facebook y otros dos mil sitios), pero se instala siempre.
    const config = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'dark-mode', 'motor', 'dynamic-theme-fixes.config')
    const arreglos = [...compilarArreglos(fs.readFileSync(config, 'utf8')), ...ARREGLOS_PROPIOS]
    fs.writeFileSync(path.join(dirDestino, 'arreglos.json'), JSON.stringify(arreglos))
    z.linea('Compilado', `${arreglos.length} secciones de arreglos -> arreglos.json`)
  }

  // --- 2. El cargador y las prefs, en la instalacion ----------------------
  if (!args['solo-perfil']) {
    const prefs = fs.readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8')
    nat.instalarCargador({ dirZen, nombrePrefs: NOMBRE_PREFS, contenidoPrefs: prefs })
    z.linea('Prefs', rutas.prefs)
    nat.avisosDelDirectorioDeInstalacion()
  }

  // --- 3. Lo que hace falta al otro lado ----------------------------------
  const capaWeb = path.join(perfil, 'chrome', 'userContent.css')
  const conGuarda = fs.existsSync(capaWeb) && fs.readFileSync(capaWeb, 'utf8').includes('zen-modo-oscuro')
  if (!conGuarda) {
    z.aviso(
      'La capa web del perfil no tiene las guardas del modo oscuro.\n' +
        '  Ejecuta tambien:  node installer/instalar.mjs\n' +
        '  Sin eso, sitios como Shopify o Meta se quedan con su lamina blanca encima del tema oscuro.'
    )
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo.')
  console.log('Clic derecho en cualquier web > "Activar modo oscuro".')
  console.log(z.tinta.gris('La lista vive en zen.modooscuro.sitios y se puede editar a mano.'))
})

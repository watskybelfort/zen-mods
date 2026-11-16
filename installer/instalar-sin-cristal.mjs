#!/usr/bin/env node
// ===========================================================================
// Instala Zen Sin Cristal con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                          el cargador de autoconfig
//                                                    (COMPARTIDO con los otros
//                                                    dos mods nativos)
//   <instalacion>/defaults/pref/zen-sin-cristal.js   las prefs y la lista
//   <perfil>/chrome/zen-sin-cristal/proceso.js       marca los documentos
//   <perfil>/chrome/zen-sin-cristal/ventana.js       la entrada del clic derecho
//
// DONDE CAE `<instalacion>` EN CADA SISTEMA:
//   Windows   C:\Program Files\Zen Browser\
//   macOS     /Applications/Zen.app/Contents/Resources/
//
// QUE HACE FALTA ADEMAS DE ESTO. El interruptor no pinta nada por su cuenta:
// solo pone una marca en el documento, y quien apaga el cristal es la capa web,
// cuyas reglas dejan de aplicar donde esta esa marca. O sea que esto sin
// `node installer/instalar.mjs` no tiene nada que apagar. Al reves si vale: la
// capa web sola funciona igual que siempre, con la marca que nadie pone.
//
// SE INSTALA APARTE, y no dentro de instalar.mjs, por una diferencia que importa:
// instalar.mjs no sale del perfil y no pide permisos. Esto escribe en el
// directorio de instalacion de Zen, que en Windows suele pedir administrador.
// Meterlo en el instalador general habria convertido una instalacion sin
// friccion en una que pide elevar, para una pieza que no todo el mundo quiere.
//
// USO
//   node installer/instalar-sin-cristal.mjs
//   node installer/instalar-sin-cristal.mjs --solo-instalacion
//   node installer/instalar-sin-cristal.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-sin-cristal.js'
const DIR_PERFIL = 'zen-sin-cristal'
const PIEZAS = ['proceso.js', 'ventana.js']

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil'],
  })

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'glass-toggle', 'nativo')
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
    // nativo instalado, llevarselo lo dejaria muerto tambien a el, y ese fallo
    // no se relaciona con haber desinstalado esto en semanas.
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

    // La lista de sitios NO se borra del perfil a proposito. Es lo unico que el
    // usuario ha escrito de su mano en todo el mod —una web a la que entro, vio
    // que se rompia, y la apago— y reinstalar despues de una actualizacion de
    // Zen es lo normal. Sin marca en el documento no hace nada, asi que no
    // molesta ahi; y borrarla seria perder el unico dato que no se puede
    // regenerar. Se vacia a mano en about:config si se quiere.
    z.linea('La lista', 'se queda en zen.sincristal.sitios (about:config)')
    z.linea('Desinstalado', `${quitados} pieza(s). Reinicia Zen.`)
    return
  }

  // --- 1. Las dos piezas, en el perfil ------------------------------------
  if (!args['solo-instalacion']) {
    fs.mkdirSync(dirDestino, { recursive: true })
    for (const pieza of PIEZAS) {
      const origen = path.join(dirNativo, pieza)
      if (!fs.existsSync(origen)) throw new Error(`No existe ${origen}. El repo esta incompleto.`)
      fs.copyFileSync(origen, path.join(dirDestino, pieza))
      z.linea('Copiado', path.join(dirDestino, pieza))
    }
  }

  // --- 2. El cargador y las prefs, en la instalacion ----------------------
  if (!args['solo-perfil']) {
    const prefs = fs.readFileSync(path.join(dirNativo, 'config-prefs.js'), 'utf8')
    nat.instalarCargador({ dirZen, nombrePrefs: NOMBRE_PREFS, contenidoPrefs: prefs })
    z.linea('Prefs', rutas.prefs)
    nat.avisosDelDirectorioDeInstalacion()
  }

  // --- 3. Lo que hace falta al otro lado ----------------------------------
  // Sin la capa web esto se instala, arranca y no hace nada visible, que es el
  // peor estado posible: parece roto y no lo esta. Mejor decirlo aqui.
  const capaWeb = path.join(perfil, 'chrome', 'userContent.css')
  const conGuarda = fs.existsSync(capaWeb) && fs.readFileSync(capaWeb, 'utf8').includes('zen-sin-cristal')
  if (!conGuarda) {
    z.aviso(
      'La capa web del perfil no tiene las guardas del interruptor.\n' +
        '  Ejecuta tambien:  node installer/instalar.mjs\n' +
        '  Sin eso, la entrada del menu aparece y no apaga nada.'
    )
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo.')
  console.log('Clic derecho en cualquier web > "Zen Cristal".')
  console.log(z.tinta.gris('La lista vive en zen.sincristal.sitios y se puede editar a mano.'))
})

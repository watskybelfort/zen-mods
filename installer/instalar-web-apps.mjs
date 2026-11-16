#!/usr/bin/env node
// ===========================================================================
// Instala la pieza nativa de Zen Web Apps con el cargador nativo.
// ---------------------------------------------------------------------------
//   <instalacion>/config.js                      el cargador de autoconfig
//                                                (COMPARTIDO con los otros tres
//                                                mods nativos)
//   <instalacion>/defaults/pref/zen-web-apps.js  las prefs del autoconfig
//   <perfil>/chrome/zen-web-apps/ventana.js      la disposicion de la ventana
//
// DONDE CAE `<instalacion>` EN CADA SISTEMA:
//   Windows   C:\Program Files\Zen Browser\
//   macOS     /Applications/Zen.app/Contents/Resources/   (no aplica, ver abajo)
//
// ESTE ES EL PRIMER MOD NATIVO SIN INYECTOR. Los otros tres corren dentro de las
// paginas; este no toca ninguna: lo unico que hace es corregir la disposicion de
// la interfaz en las ventanas de aplicacion web, que es cosa del proceso padre y
// una vez por ventana. Por eso su unica pieza del perfil es `ventana.js`.
//
// QUE HACE FALTA ADEMAS DE ESTO. La pieza nativa devuelve la ventana de app a la
// disposicion sin barra unica; quien retira la barra lateral sigue siendo el CSS
// del mod, que se instala con `node installer/instalar.mjs`. Una sin la otra:
//
//   solo el CSS      la ventana de app queda como la deja Zen 1.22.2b, con la
//                    barra lateral puesta. El CSS se aparta solo, a proposito.
//   solo lo nativo   la franja vuelve arriba, pero la barra lateral —vacia—
//                    sigue ahi, porque no hay ninguna regla que la quite.
//
// SE INSTALA APARTE, y no dentro de instalar.mjs, por la misma razon que los
// otros tres: instalar.mjs no sale del perfil y no pide permisos. Esto escribe
// en el directorio de instalacion de Zen, que en Windows suele pedir
// administrador. Meterlo en el instalador general habria convertido una
// instalacion sin friccion en una que pide elevar.
//
// USO
//   node installer/instalar-web-apps.mjs
//   node installer/instalar-web-apps.mjs --solo-instalacion   (tras actualizar Zen)
//   node installer/instalar-web-apps.mjs --desinstalar
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'
import * as nat from './lib/nativo.mjs'

const NOMBRE_PREFS = 'zen-web-apps.js'
const DIR_PERFIL = 'zen-web-apps'
const PIEZAS = ['ventana.js']

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['solo-instalacion', 'solo-perfil', 'desinstalar'],
    claves: ['ruta-zen', 'perfil'],
  })

  // LAS TASKBAR TABS SON DE WINDOWS. El boton que instala una web como app solo
  // aparece en la barra de tareas, y sin ninguna ventana [taskbartab] este mod
  // no tiene donde actuar: se instalaria, arrancaria y no haria nada, que es
  // peor que no estar. Es la misma decision que toma instalar.mjs con el CSS.
  if (z.ES_MACOS) {
    throw new Error(
      'Zen Web Apps es solo de Windows: las Taskbar Tabs son una funcion de la barra de tareas.\n' +
        'En macOS browser.taskbarTabs.enabled se puede poner a true y no pasa nada, asi que\n' +
        'esta pieza no se instala aqui en lugar de instalarse y quedarse muda.'
    )
  }

  const dirNativo = path.join(z.RAIZ_REPO, 'mods', 'utilities', 'web-apps', 'nativo')
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
        z.linea('Cargador', `se queda, lo siguen usando ${otros.join(' y ')}`)
      } else if (nat.MARCA_NUESTRA.test(fs.readFileSync(rutas.config, 'utf8'))) {
        nat.exigirEscritura(dirZen)
        fs.rmSync(rutas.config, { force: true })
        quitados++
        z.linea('Quitado', rutas.config)
      } else {
        z.aviso(`${rutas.config} no es nuestro; se deja como esta`)
      }
    }

    z.linea('El CSS', 'se queda; se apaga desde Ajustes > Zen Mods > Zen Web Apps')
    z.linea('Desinstalado', `${quitados} pieza(s). Reinicia Zen.`)
    return
  }

  // --- 1. La pieza, en el perfil ------------------------------------------
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
  // Sin el CSS del mod esto devuelve la franja arriba y deja la barra lateral
  // vacia puesta: parece que la pieza no funciona, y lo que falta es la otra
  // mitad. Mejor decirlo aqui que dejar que se depure.
  const cssPerfil = path.join(perfil, 'chrome', 'zen-themes', 'zen-web-apps', 'chrome.css')
  if (!fs.existsSync(cssPerfil)) {
    z.aviso(
      'El CSS de Zen Web Apps no esta instalado en el perfil.\n' +
        '  Ejecuta tambien:  node installer/instalar.mjs\n' +
        '  Sin eso, la franja vuelve arriba pero la barra lateral vacia se queda.'
    )
  }

  // Y sin las Taskbar Tabs encendidas no hay ninguna ventana de app que
  // arreglar. La pref existe en las tres builds, pero de fabrica viene apagada.
  const prefsPerfil = z.leerArchivoPrefs(path.join(perfil, 'prefs.js'))
  if (prefsPerfil.get('browser.taskbarTabs.enabled') !== 'true') {
    z.aviso(
      'browser.taskbarTabs.enabled no esta en true en este perfil.\n' +
        '  Sin eso no hay boton de "Anadir a la barra de tareas" y no hay ventanas de app.\n' +
        '  Se enciende en about:config.'
    )
  }

  console.log('')
  console.log('Listo. Reinicia Zen del todo.')
  console.log('Abre una app de la barra de tareas: la barra lateral no deberia estar,')
  console.log('y la URL con los botones de ventana tienen que salir en una franja arriba.')
  console.log(z.tinta.gris('Se apaga en Ajustes > Zen Mods > Zen Web Apps, sin desinstalar nada.'))
})

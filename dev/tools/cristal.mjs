#!/usr/bin/env node
// ===========================================================================
// Que dice el compositor del sistema sobre el cristal de Zen.
// ---------------------------------------------------------------------------
// La pregunta es la misma en los dos sistemas —"hay cristal de verdad detras de
// esa ventana?"— pero lo que se puede llegar a saber NO es lo mismo, y eso hay
// que decirlo en vez de disimularlo.
//
// WINDOWS. DWM contesta. `DwmGetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE)`
// sobre la ventana de Zen devuelve el backdrop que se le aplico. Eso necesita
// llamar a una API nativa, que en Node pediria un modulo compilado; como la
// herramienta que ya lo hace existe y funciona, aqui se delega en ella:
// dev/powershell/Get-ZenBackdrop.ps1. Un puente de cuatro lineas es mejor que una
// dependencia binaria.
//
// macOS. NO HAY EQUIVALENTE, y conviene ser claro: no existe ninguna API
// publica para preguntar desde fuera si una ventana ajena tiene una
// `NSVisualEffectView` ni con que material. La informacion existe dentro del
// proceso, no fuera. Asi que aqui se informa de lo que SI es comprobable:
//
//   - Que material pide Zen (`zen.widget.macos.window-material` del perfil)
//   - Si muestrea detras de la ventana o solo su propio contenido
//   - Si "Reducir transparencia" esta apagando el efecto a nivel de sistema
//   - Si la version de macOS soporta los materiales que se usan
//
// Eso cubre todas las causas por las que el cristal no se ve, salvo una: que el
// CSS del mod no este aplicando. Y esa si se mide, pero desde dentro:
//     node installer/enlace-claude.mjs --marionette
//     node dev/tools/probar-vivo.mjs
//
// CODIGOS DE SALIDA
//   0 el sistema deberia estar dibujando cristal
//   1 se pide, pero hay algo que lo esta apagando
//   3 no se pudo determinar
// ===========================================================================

import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

import * as z from '../../installer/lib/zen.mjs'

const MATERIALES = {
  1: 'HUDWindow — el mas transparente, y el de fabrica de Zen',
  2: 'FullScreenUI',
  3: 'Popover',
  4: 'Menu',
  5: 'ToolTip',
  6: 'HeaderView — el punto intermedio comodo',
  7: 'UnderWindowBackground — el mas discreto',
}

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), { interruptores: ['json'], claves: ['perfil'] })

  if (z.ES_WINDOWS) return enWindows(args)
  if (z.ES_MACOS) return enMacos(args)

  console.log('En Linux el cristal depende del compositor de tu escritorio y no hay una')
  console.log('consulta comun. Mide el efecto desde dentro con dev/tools/probar-vivo.mjs.')
  process.exitCode = 3
})

function enWindows(args) {
  // El puente a la herramienta que ya sabe hablar con DWM. Se conserva en
  // PowerShell porque necesita P/Invoke, y traducir eso a Node significaria un
  // modulo nativo compilado para leer un entero.
  const ps1 = path.join(z.RAIZ_REPO, 'dev', 'powershell', 'Get-ZenBackdrop.ps1')
  const argumentos = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1]
  if (args.json) argumentos.push('-Json')
  try {
    const salida = execFileSync('powershell', argumentos, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
    process.stdout.write(salida)
  } catch (e) {
    if (e.stdout) process.stdout.write(e.stdout)
    process.exitCode = typeof e.status === 'number' ? e.status : 3
  }
}

function enMacos(args) {
  const perfil = args.perfil || z.resolverPerfil()

  // Lo que hay escrito en el perfil, que es lo que Zen leera. Se miran los dos
  // archivos y gana user.js, igual que hace Gecko: user.js se reaplica en cada
  // arranque por encima de prefs.js.
  const puestas = new Map()
  for (const f of ['prefs.js', 'user.js']) {
    for (const [k, v] of z.leerArchivoPrefs(path.join(perfil, f))) puestas.set(k, v)
  }

  // El valor de fabrica de Zen cuando la pref no esta escrita, tomado de
  // browser/omni.ja -> defaults/preferences/firefox.js.
  const material = Number(puestas.get('zen.widget.macos.window-material') ?? 1)
  const detrasBarra = (puestas.get('widget.macos.sidebar-blend-mode.behind-window') ?? 'true') === 'true'
  const detrasTitulo = (puestas.get('widget.macos.titlebar-blend-mode.behind-window') ?? 'false') === 'true'
  const reducida = z.ajusteBooleanoMac('com.apple.universalaccess', 'reduceTransparency')
  const darwin = Number(os.release().split('.')[0] || 0)
  const soportado = darwin >= 20 // Darwin 20 = macOS 11 Big Sur

  const problemas = []
  if (reducida) {
    problemas.push(
      "'Reducir transparencia' esta ACTIVADO: la NSVisualEffectView sigue montada pero se " +
        'pinta opaca. Ajustes > Accesibilidad > Pantalla.'
    )
  }
  if (!detrasBarra) {
    problemas.push(
      'widget.macos.sidebar-blend-mode.behind-window esta en false: la vibrancy muestrea el ' +
        'contenido de la propia ventana y no lo que hay detras. Hay efecto, pero no es cristal.'
    )
  }
  if (!soportado) {
    problemas.push(`Darwin ${os.release()}: los materiales que usa Zen necesitan macOS 11 Big Sur o superior.`)
  }

  const salida = {
    plataforma: 'macos',
    perfil,
    material,
    material_nombre: MATERIALES[material] || MATERIALES[7],
    sidebar_behind_window: detrasBarra,
    titlebar_behind_window: detrasTitulo,
    reducir_transparencia: reducida,
    darwin: os.release(),
    soportado,
    problemas,
    medible_desde_fuera: false,
  }

  if (args.json) {
    console.log(JSON.stringify(salida, null, 2))
  } else {
    console.log('')
    console.log(z.tinta.cian('Cristal de Zen en macOS'))
    console.log('')
    z.linea('Material', `${material} — ${salida.material_nombre}`)
    z.linea('Muestrea detras', `barra lateral ${detrasBarra ? 'si' : 'NO'}, titulo ${detrasTitulo ? 'si' : 'no'}`)
    z.linea('Reducir transp.', reducida ? z.tinta.amarillo('ACTIVADO') : 'desactivado')
    z.linea('macOS', `Darwin ${os.release()}${soportado ? '' : ' (demasiado antiguo)'}`)
    console.log('')

    if (problemas.length) {
      for (const p of problemas) console.log(z.tinta.amarillo(`  ${p}`))
    } else {
      console.log(z.tinta.verde('  El sistema deberia estar dibujando cristal detras de la ventana.'))
    }

    console.log('')
    console.log(z.tinta.gris('Esto es lo que se PIDE, no lo que se ve. macOS no expone ninguna API para'))
    console.log(z.tinta.gris('preguntar desde fuera si una ventana ajena tiene vibrancy, asi que aqui no'))
    console.log(z.tinta.gris('hay medida equivalente a la de DWM en Windows. Lo que si se mide, desde'))
    console.log(z.tinta.gris('dentro del navegador:'))
    console.log(z.tinta.gris('  node installer/enlace-claude.mjs --marionette'))
    console.log(z.tinta.gris('  node dev/tools/probar-vivo.mjs'))
  }

  if (problemas.length) process.exitCode = 1
}

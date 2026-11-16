#!/usr/bin/env node
// ===========================================================================
// Arranca Zen Browser con el canal de agente abierto.
// ---------------------------------------------------------------------------
// Zen normal, tu perfil de siempre, mas el RemoteAgent escuchando. Eso hace dos
// cosas a la vez:
//
//   1. Enciende el indicador. `gRemoteControl` escucha "remote-listening" y pone
//      `remotecontrol="true"` en la raiz, que es de donde cuelga TODO el mod Zen
//      Claude Link. Sin esto el mod no pinta nada, y hace bien.
//   2. Abre el canal por el que un agente se engancha a la sesion.
//
// QUE PROTOCOLO. En Gecko 153 el RemoteAgent ya solo habla WebDriver BiDi: la
// carpeta chrome/remote/content/cdp no existe en el omni.ja de esta build. El
// flag se sigue llamando --remote-debugging-port por compatibilidad, pero lo
// que levanta es BiDi. Un cliente que solo hable CDP no encontrara ni
// /json/version.
//
// ESTO ABRE UNA PUERTA. Quien pueda hablar con ese puerto manda en el
// navegador: tus sesiones abiertas, tus cookies, tu historial. Queda en
// 127.0.0.1 y no se toca --remote-allow-hosts, asi que no entra nadie desde la
// red; pero cualquier proceso que corra como tu en esta maquina si puede. Es
// exactamente el mismo trato que aceptas al automatizar Chrome, solo que aqui
// esta escrito. Se cierra al cerrar Zen.
//
// USO
//   node installer/enlace-claude.mjs
//   node installer/enlace-claude.mjs --puerto 9333
//   node installer/enlace-claude.mjs --marionette
// ===========================================================================

import fs from 'node:fs'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { setTimeout as esperar } from 'node:timers/promises'

import * as z from './lib/zen.mjs'

z.principal(async () => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['marionette'],
    claves: ['puerto', 'perfil', 'binario'],
  })

  const puerto = Number(args.puerto ?? 9222)
  if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) {
    throw new Error('--puerto debe ser un entero entre 1024 y 65535.')
  }

  // --- 1. Localizar el ejecutable -----------------------------------------
  // En macOS NO se lanza `open -a Zen`: `open` delega en LaunchServices, que
  // reutiliza la instancia existente y descarta los argumentos. Hay que
  // ejecutar el binario de dentro del bundle directamente para que los flags
  // lleguen al proceso.
  const binario = args.binario || z.binarioZen()
  if (!binario || !fs.existsSync(binario)) {
    throw new Error(`No se encontro el ejecutable de Zen${binario ? ` en ${binario}` : ''}. Pasa la ruta con --binario.`)
  }

  // --- 2. Zen tiene que estar cerrado -------------------------------------
  // Y no es una mania: con Zen abierto, la capa de remoting de Gecko le pasa la
  // linea de comandos a la instancia que ya corre —que se limita a abrir una
  // pestana— y el proceso nuevo se muere sin llegar a arrancar el RemoteAgent.
  // Tendrias un Zen abierto, ningun canal, y ningun indicador.
  z.exigirZenCerrado()

  // --- 3. Arrancar ---------------------------------------------------------
  const argumentos = ['--remote-debugging-port', String(puerto)]
  // Los dos juntos, siempre: --marionette sin --remote-allow-system-access
  // levanta el puerto pero deja el contexto `chrome` cerrado, y entonces la
  // primera orden muere con "System access is required" (comprobado en Gecko 153).
  if (args.marionette) argumentos.push('--marionette', '--remote-allow-system-access')
  if (args.perfil) {
    if (!fs.existsSync(args.perfil)) throw new Error(`El perfil no existe: ${args.perfil}`)
    argumentos.push('-profile', args.perfil)
  }

  z.linea('Zen', binario)
  z.linea('Perfil', args.perfil || 'el de por defecto')

  // `detached` + `unref` para que el navegador sobreviva a este script: si
  // quedara como hijo, cerrar la terminal se llevaria Zen por delante.
  spawn(binario, argumentos, { detached: true, stdio: 'ignore' }).unref()

  // --- 4. Esperar a que escuche -------------------------------------------
  // Se comprueba el socket, no una URL: BiDi no sirve ningun endpoint HTTP de
  // descubrimiento, asi que "el puerto acepta conexiones" es la unica senal
  // fiable de que el agente esta arriba.
  const escuchando = await esperarPuerto(puerto, 40, 750)

  console.log('')
  if (!escuchando) {
    z.aviso(`El puerto ${puerto} no llego a escuchar. Lo mas comun es que ya estuviese ocupado: prueba con --puerto 9333.`)
    process.exitCode = 1
    return
  }

  console.log(z.tinta.verde(`RemoteAgent     : ws://127.0.0.1:${puerto}/session   (WebDriver BiDi)`))
  if (args.marionette) {
    if (await esperarPuerto(2828, 8, 500)) {
      console.log(z.tinta.amarillo('Marionette      : 127.0.0.1:2828   (chrome + acceso de sistema)'))
      console.log(z.tinta.gris('                  Con esto un cliente local puede leer y escribir prefs'))
      console.log(z.tinta.gris('                  y tocar la interfaz entera, no solo las paginas.'))
    } else {
      z.aviso('Marionette no llego a escuchar en 2828.')
    }
  }

  console.log('')
  console.log('La sesion esta bajo control remoto. Si tienes Zen Claude Link instalado y')
  console.log('activado, ya deberias ver la pastilla en la esquina. Si NO la ves, el mod')
  console.log('esta desactivado o sin instalar: Ajustes > Zen Mods.')
  console.log('')
  console.log('El canal se cierra al cerrar Zen.')
})

/**
 * Espera a que alguien escuche en 127.0.0.1:<puerto>.
 *
 * Se abre una conexion de verdad en lugar de mirar la tabla de sockets del
 * sistema: `Get-NetTCPConnection` no existe fuera de Windows, y `lsof`/`netstat`
 * cambian de formato entre versiones de macOS. Conectar funciona igual en todas
 * partes y ademas comprueba lo que de verdad importa, que es que el puerto
 * acepte, no que este listado.
 */
async function esperarPuerto(puerto, intentos, msEntreIntentos) {
  for (let i = 0; i < intentos; i++) {
    await esperar(msEntreIntentos)
    if (await puedeConectar(puerto)) return true
  }
  return false
}

function puedeConectar(puerto) {
  return new Promise((resolver) => {
    const socket = net.connect({ port: puerto, host: '127.0.0.1' })
    const cerrar = (resultado) => {
      socket.destroy()
      resolver(resultado)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => cerrar(true))
    socket.once('timeout', () => cerrar(false))
    socket.once('error', () => cerrar(false))
  })
}

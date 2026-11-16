#!/usr/bin/env node
// ===========================================================================
// Aplica prefs de reduccion de superficie de ataque a un perfil de Zen.
// ---------------------------------------------------------------------------
// Va aparte del instalador a proposito: son cosas distintas y quien instale el
// mod por estetica no deberia quedarse sin JIT sin haberlo pedido. Escribe su
// propio bloque marcado, asi que los dos instaladores conviven sin pisarse.
//
// ANTES DE NADA, lo que esto NO es: no parchea vulnerabilidades. Un fallo de
// corrupcion de memoria en Gecko vive en la libreria del motor —`xul.dll` en
// Windows, `XUL` dentro de `Zen.app/Contents/MacOS/` en macOS— y solo lo
// arregla la build nueva de Zen. No existe ningun mod, CSS ni pref que blinde
// un navegador contra fallos de su motor.
//
// Lo que si hace: quitar codigo del alcance de una pagina web. Cuando exista
// una ventana de exposicion —entre que Mozilla publica el aviso y Zen publica
// la build— hay menos motor expuesto. El nivel 'strict' apaga el JIT de
// JavaScript solo para el contenido web, que es donde se concentra alrededor
// del 45% de las vulnerabilidades del motor.
//
// Para saber si ahora mismo estas en una de esas ventanas:
//     node dev/tools/exposicion.mjs
//
// ES IGUAL EN LOS DOS SISTEMAS, y merece decirse: estas prefs son de Gecko, no
// de la plataforma. La unica diferencia real es una que NO esta aqui:
// `security.sandbox.content.level`, que no se toca porque cada sistema ya viene
// en el maximo que soporta y escribir un numero a ojo es tan facil que lo baje
// como que lo suba.
//
// USO
//   node installer/blindar.mjs
//   node installer/blindar.mjs --nivel strict
//   node installer/blindar.mjs --revertir
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'

const MARCADOR = '// --- Zen Hardening ---'
const NIVELES = ['balanced', 'strict', 'paranoid']

// Los parciales se acumulan: cada nivel anade al anterior, igual que los
// parciales de web/ en la capa de contenido.
const PARCIALES = {
  balanced: ['00-balanced.user.js'],
  strict: ['00-balanced.user.js', '10-strict.user.js'],
  paranoid: ['00-balanced.user.js', '10-strict.user.js', '20-paranoid.user.js'],
}

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['bloquear', 'revertir'],
    claves: ['perfil', 'nivel'],
  })

  const nivel = args.nivel ?? 'balanced'
  if (!NIVELES.includes(nivel)) throw new Error(`--nivel debe ser uno de: ${NIVELES.join(', ')}`)

  const origen = path.join(z.RAIZ_REPO, 'mods', 'utilities', 'privacy-hardening')
  if (!fs.existsSync(origen)) throw new Error(`No se encontro la carpeta de prefs en ${origen}`)

  const perfil = args.perfil || z.resolverPerfil()
  z.linea('Perfil objetivo', perfil)

  // Zen reescribe prefs.js entero al salir: con el navegador abierto, todo lo
  // que escribamos aqui se perderia al cerrarlo.
  z.exigirZenCerrado(perfil)

  const destino = path.join(perfil, args.bloquear ? 'user.js' : 'prefs.js')

  // --- Backup -------------------------------------------------------------
  const sello = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
  const dirBackup = path.join(perfil, 'zen-hardening-backup', sello)
  fs.mkdirSync(dirBackup, { recursive: true })
  for (const f of ['prefs.js', 'user.js']) z.copiarSiExiste(path.join(perfil, f), path.join(dirBackup, f))
  z.linea('Backup', dirBackup)

  // Los nombres de TODOS los niveles, no solo los del pedido: si alguien aplico
  // paranoid y luego revierte o baja de nivel, no puede quedarse a medias.
  const todosLosNombres = [
    ...new Set(
      Object.values(PARCIALES)
        .flat()
        .flatMap((p) => [...z.leerArchivoPrefs(path.join(origen, p)).keys()])
    ),
  ]

  // --- Revertir -----------------------------------------------------------
  if (args.revertir) {
    let borradas = 0
    for (const f of ['prefs.js', 'user.js']) {
      const p = path.join(perfil, f)
      if (fs.existsSync(p)) borradas += z.borrarPrefs(p, todosLosNombres, MARCADOR)
    }
    console.log('')
    console.log(z.tinta.verde(`Revertido: ${borradas} prefs eliminadas. Vuelven al valor de fabrica de Zen.`))
    return
  }

  // --- Aplicar ------------------------------------------------------------
  const deseadas = new Map()
  for (const p of PARCIALES[nivel]) {
    const archivo = path.join(origen, p)
    if (!fs.existsSync(archivo)) throw new Error(`Falta el parcial ${archivo}`)
    for (const [k, v] of z.leerArchivoPrefs(archivo)) deseadas.set(k, v)
    z.linea('Parcial', p)
  }

  // Un nivel bajo tiene que poder desandar lo que dejo uno alto. Sin esto, pasar
  // de paranoid a balanced dejaria WebGL y el JIT apagados para siempre.
  const sobrantes = todosLosNombres.filter((n) => !deseadas.has(n))
  if (sobrantes.length) {
    for (const f of ['prefs.js', 'user.js']) {
      const p = path.join(perfil, f)
      if (fs.existsSync(p)) z.borrarPrefs(p, sobrantes, MARCADOR)
    }
  }

  const aplicadas = z.escribirPrefs(destino, deseadas, MARCADOR)
  z.linea('Prefs aplicadas', `${destino} (${aplicadas} prefs, nivel '${nivel}')`)

  console.log('')
  console.log(z.tinta.verde(`Nivel '${nivel}' aplicado. Abre Zen Browser.`))

  if (nivel !== 'balanced') {
    console.log('')
    console.log(z.tinta.amarillo('Recuerda lo que acabas de cambiar:'))
    console.log('  - Las webs con mucho JavaScript iran mas lentas.')
    console.log('  - Videollamadas en el navegador desactivadas (WebRTC).')
    console.log('  - Figma, Google Earth y similares no funcionaran (WebAssembly).')
    if (nivel === 'paranoid') {
      console.log('  - Mapas 3D y juegos web no funcionaran (WebGL).')
      console.log('  - Sin modo offline ni notificaciones push (service workers).')
    }
    console.log('')
    console.log('  Para volver atras:  node installer/blindar.mjs --revertir')
  }

  console.log('')
  console.log('Esto reduce superficie de ataque; NO parchea vulnerabilidades.')
  console.log('Lo unico que las parchea es actualizar Zen. Comprueba si estas expuesto:')
  console.log('  node dev/tools/exposicion.mjs')
})

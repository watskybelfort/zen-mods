#!/usr/bin/env node
// ===========================================================================
// Apaga los mods sin desinstalar nada. El interruptor de panico.
// ---------------------------------------------------------------------------
// Pone `enabled: false` en zen-themes.json y recompila la hoja, con lo que Zen
// arranca de fabrica. No borra el CSS, ni el registro, ni las prefs, ni la capa
// web: volver a encenderlos es una linea.
//
// POR QUE HACE FALTA SI ZEN YA TIENE INTERRUPTORES. Porque el caso malo es
// justo el que no te deja usarlos: si un mod rompe la interfaz —una capa opaca
// encima de todo, un panel que no abre, la barra lateral desaparecida— no
// puedes llegar a Ajustes > Zen Mods para apagarlo. Esto se hace desde fuera,
// con Zen cerrado.
//
// COMO SE USA CUANDO ALGO SE ROMPE
//   1. node installer/apagar-mods.mjs                    apaga todos
//   2. abre Zen: si sigue roto, no eran los mods
//   3. node installer/apagar-mods.mjs --encender --solo <id>   y vas encendiendo
//      de uno en uno hasta que aparezca el culpable
//
// NO toca la capa web (userContent.css), que es lo que vacia el fondo de las
// paginas: eso vive en otro archivo y se quita con el instalador
// (--nivel-web off). Aqui se dice para que no se busque donde no esta.
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['encender'],
    claves: ['perfil', 'solo'],
  })

  const soloIds = args.solo ? args.solo.split(',').map((s) => s.trim()).filter(Boolean) : null
  const perfil = args.perfil || z.resolverPerfil()

  // Con Zen abierto no vale: reescribe zen-themes.json a su manera al salir y se
  // perderia lo que dejemos escrito aqui.
  z.exigirZenCerrado(perfil)

  const archivoTemas = path.join(perfil, 'zen-themes.json')
  if (!fs.existsSync(archivoTemas)) {
    throw new Error(`No hay zen-themes.json en ${perfil}. No hay nada instalado que apagar.`)
  }
  const mods = z.leerJson(archivoTemas, null)
  if (!mods || !Object.keys(mods).length) throw new Error('zen-themes.json esta vacio.')

  const valor = Boolean(args.encender)
  const tocados = []
  for (const [id, mod] of Object.entries(mods)) {
    if (soloIds && !soloIds.includes(id)) continue
    if (!mod) continue
    // Un mod sin la clave `enabled` cuenta como encendido: los theme.json del
    // repo la traen, pero uno registrado desde la interfaz de Zen puede no.
    const antes = mod.enabled === undefined ? true : Boolean(mod.enabled)
    if (antes === valor) continue
    mod.enabled = valor
    tocados.push(`${mod.name} [${id}]`)
  }

  if (soloIds) {
    for (const d of soloIds.filter((id) => !(id in mods))) {
      z.aviso(`No hay ningun mod registrado con id '${d}'.`)
    }
  }

  z.escribirJson(archivoTemas, mods)
  const hoja = z.recompilarHojaMods(perfil)
  for (const a of hoja.avisos) z.aviso(a)

  console.log('')
  const accion = args.encender ? 'Encendidos' : 'Apagados'
  if (tocados.length) {
    console.log(z.tinta.verde(`${accion.padEnd(16)}: ${tocados.length} mod(s)`))
    for (const t of tocados) console.log(z.tinta.gris(`                  ${t}`))
  } else {
    console.log(z.tinta.gris('Sin cambios     : ya estaban asi'))
  }
  z.linea('Hoja recompilada', `${hoja.activos} mod(s) activos en chrome/zen-themes.css`)
  console.log('')

  if (!args.encender) {
    console.log(z.tinta.amarillo('Zen arrancara de fabrica. No se ha borrado nada:'))
    console.log('  node installer/apagar-mods.mjs --encender        para volver a encenderlos')
    console.log('')
    console.log(z.tinta.gris('Si Zen sigue viendose raro, NO eran los mods: la capa web vive aparte,'))
    console.log(z.tinta.gris('en chrome/userContent.css, y se quita con el instalador (--nivel-web off).'))
  } else {
    console.log('Comprueba con: node dev/tools/doctor.mjs')
  }
})

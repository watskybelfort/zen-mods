#!/usr/bin/env node
// ===========================================================================
// Arma el userscript de Zen Letra Viva desde los parciales de mods/youtube-music/live-lyrics/src/.
// ---------------------------------------------------------------------------
// Concatena mods/youtube-music/live-lyrics/src/*.js en orden numerico dentro de una sola funcion
// anonima, le pone delante la cabecera de userscript de mods/youtube-music/live-lyrics/cabecera.txt y
// escribe el resultado en mods/youtube-music/live-lyrics/dist/zen-letra-viva.user.js.
//
// Es el mismo patron que la capa web: userContent.css se arma con los parciales
// de web/, y esto se arma con los de mods/youtube-music/live-lyrics/src/. Los parciales se leen solos y
// el entregable es uno.
//
// Comprueba tres cosas antes de escribir, porque las tres se rompen calladas:
//   1. Que la version de la cabecera y la del prologo coinciden. Si no, el
//      gestor de userscripts cree que no hay actualizacion y sirve el viejo.
//   2. Que ningun parcial abre un comentario de bloque y no lo cierra. Un
//      /* sin */ se come todo el parcial siguiente sin dar error de sintaxis.
//   3. Que el resultado es JavaScript valido.
//
// La tercera comprobacion sale gratis ahora que el build es Node: antes era una
// llamada a `node --check` sobre un archivo temporal en %TEMP% y se saltaba si
// node no estaba en el PATH. Aqui node ES el interprete, asi que siempre corre y
// no hace falta ningun temporal — se usa `new vm.Script`, que compila sin
// ejecutar nada.
//
// USO
//   node installer/compilar-letra.mjs
//   node installer/compilar-letra.mjs --salida /otra/ruta.user.js
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import * as z from './lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), { claves: ['salida'] })

  const dirFuente = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'live-lyrics', 'src')
  const archivoCabecera = path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'live-lyrics', 'cabecera.txt')
  const salida = args.salida || path.join(z.RAIZ_REPO, 'mods', 'youtube-music', 'live-lyrics', 'dist', 'zen-letra-viva.user.js')

  if (!fs.existsSync(dirFuente)) throw new Error(`No se encontro la carpeta de parciales en ${dirFuente}`)
  if (!fs.existsSync(archivoCabecera)) throw new Error(`No se encontro la cabecera en ${archivoCabecera}`)

  // --- 1. La cabecera y su version ----------------------------------------
  const cabecera = fs.readFileSync(archivoCabecera, 'utf8').trimEnd()
  if (!/^\/\/\s*@match\s+https:\/\/music\.youtube\.com\//m.test(cabecera)) {
    throw new Error('La cabecera no declara @match para music.youtube.com: el userscript no correria en ningun sitio')
  }
  const mVersion = cabecera.match(/^\/\/\s*@version\s+(\S+)/m)
  if (!mVersion) throw new Error('La cabecera no declara @version')
  const version = mVersion[1]

  // --- 2. Los parciales ----------------------------------------------------
  const parciales = fs
    .readdirSync(dirFuente)
    .filter((f) => f.endsWith('.js'))
    .sort()
  if (!parciales.length) throw new Error(`No hay parciales .js en ${dirFuente}`)

  const trozos = []
  for (const nombre of parciales) {
    const texto = fs.readFileSync(path.join(dirFuente, nombre), 'utf8')

    // Comentario de bloque abierto y sin cerrar. Se cuenta sobre el texto crudo:
    // es una heuristica, pero el caso que importa (un /* huerfano al final del
    // archivo) lo caza siempre, y es justo el que apaga el parcial siguiente.
    const abre = (texto.match(/\/\*/g) || []).length
    const cierra = (texto.match(/\*\//g) || []).length
    if (abre !== cierra) {
      throw new Error(
        `${nombre}: ${abre} '/*' contra ${cierra} '*/'. Un comentario sin cerrar se come el parcial siguiente sin dar error`
      )
    }

    trozos.push(`/* ===== ${nombre} `.padEnd(76, '=') + ' */')
    trozos.push(texto.trimEnd())
    trozos.push('')
  }

  let cuerpo = trozos.join('\n') + '\n'

  // La version viaja de la cabecera al codigo, no al contrario: un solo sitio
  // que editar al subir de version.
  if (!cuerpo.includes('__VERSION__')) {
    throw new Error('Ningun parcial contiene el marcador __VERSION__; el motor no sabria su propia version')
  }
  cuerpo = cuerpo.replaceAll('__VERSION__', version)

  // --- 3. Comprobacion de sintaxis ----------------------------------------
  // Se comprueba SOLO el cuerpo envuelto, sin la cabecera de userscript: las
  // lineas @grant no son JavaScript pero si comentarios, asi que tambien
  // valdrian; se quitan igual para que el numero de linea del error apunte a
  // algo util.
  const envuelto = `(() => {\n${cuerpo}\n})();`
  try {
    new vm.Script(envuelto, { filename: 'zen-letra-viva.user.js' })
    z.linea('Sintaxis', 'valida (vm.Script, compila sin ejecutar)')
  } catch (e) {
    throw new Error(`El userscript no es JavaScript valido:\n${e.message}`)
  }

  // --- 4. Escribir ---------------------------------------------------------
  // 'use strict' lo pone el prologo dentro de la funcion, no aqui: en un
  // userscript el ambito exterior no es nuestro.
  const contenido =
    `${cabecera}\n\n` +
    `/* Generado por installer/compilar-letra.mjs desde mods/youtube-music/live-lyrics/src/ — NO EDITAR A MANO.\n` +
    `   ${parciales.length} parciales, version ${version}.\n` +
    `   Para cambiar algo se edita el parcial y se vuelve a ejecutar el build. */\n\n` +
    `${envuelto}\n`

  z.escribirUtf8SinBom(salida, contenido)

  const kb = (fs.statSync(salida).size / 1024).toFixed(1)
  z.linea('Parciales', `${parciales.length} (${parciales.join(', ')})`)
  z.linea('Version', version)
  z.linea('Escrito', `${salida} (${kb} KB)`)
})

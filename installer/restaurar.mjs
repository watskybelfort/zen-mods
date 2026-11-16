#!/usr/bin/env node
// ===========================================================================
// Vuelve a un backup del instalador.
// ---------------------------------------------------------------------------
// El instalador guarda copia de zen-themes.json, zen-themes.css,
// userContent.css, prefs.js y user.js en <perfil>/acrylic-zen-backup/<fecha>/
// antes de tocar nada.
//
// QUE RESTAURA Y QUE NO. Solo devuelve los archivos que hay en el backup. Las
// carpetas de los mods (chrome/zen-themes/<id>/) NO se respaldan, y no hace
// falta: lo que Zen aplica es la hoja compilada zen-themes.css, asi que
// devolviendo esa hoja y el registro se vuelve al comportamiento anterior
// aunque las carpetas de los mods sigan ahi.
//
// LO QUE FALTABA EN EL BACKUP se dice, no se adivina. Si un archivo no estaba
// en la copia —porque antes no existia— se avisa y se deja como esta, en vez de
// borrarlo por deduccion. Un restaurador que borra por su cuenta no es una red
// de seguridad.
//
// USO
//   node installer/restaurar.mjs --lista
//   node installer/restaurar.mjs --sello 20260806-113045
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['lista', 'todos'],
    claves: ['perfil', 'sello'],
  })

  const perfil = args.perfil || z.resolverPerfil()
  const raiz = path.join(perfil, 'acrylic-zen-backup')
  if (!fs.existsSync(raiz)) {
    throw new Error(`No hay backups en ${raiz}. El instalador no se ha ejecutado nunca en este perfil.`)
  }

  // Los nombres son sellos ordenables como texto, asi que ordenar alfabetico al
  // reves da el mas reciente primero sin parsear ninguna fecha.
  const backups = fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse()
  if (!backups.length) throw new Error(`La carpeta ${raiz} esta vacia.`)

  const manifiesto = (nombre) => {
    try {
      return z.leerJson(path.join(raiz, nombre, 'manifest.json'), null)
    } catch {
      return null
    }
  }

  if (args.lista) {
    // El instalador crea un backup por ejecucion y no borra ninguno: con
    // veintitantos, un listado completo no se lee.
    const mostrar = args.todos ? backups : backups.slice(0, 10)
    console.log('')
    console.log(z.tinta.cian(`Backups en ${raiz}`))
    const cola = !args.todos && backups.length > 10 ? ', se muestran los 10 mas recientes (--todos para todos)' : ''
    console.log(`${backups.length} en total${cola}`)
    console.log('')
    for (const nombre of mostrar) {
      const m = manifiesto(nombre)
      const archivos = fs
        .readdirSync(path.join(raiz, nombre), { withFileTypes: true })
        .filter((d) => d.isFile() && d.name !== 'manifest.json')
        .map((d) => d.name)
      console.log(`  ${z.tinta.fuerte(nombre)}`)
      if (m) {
        const zen = m.zen || {}
        console.log(
          z.tinta.gris(
            `      Zen ${zen.version} (build ${zen.buildId})  |  ${m.plataforma || '?'}  |  ` +
              `capa web '${m.web_level}'  |  prefs en ${m.prefs_en}`
          )
        )
        const mods = (m.mods || []).map((x) => `${x.name} v${x.version}`).join(', ')
        console.log(z.tinta.gris(`      repo ${m.repo_commit}  |  mods: ${mods}`))
      } else {
        console.log(z.tinta.amarillo('      (sin manifiesto: backup anterior a que se guardase)'))
      }
      console.log(z.tinta.gris(`      archivos: ${archivos.join(', ')}`))
    }
    console.log('')
    return
  }

  const elegido = args.sello ? backups.find((b) => b === args.sello) : backups[0]
  if (!elegido) throw new Error(`No existe el backup '${args.sello}'. Usa --lista para ver los disponibles.`)

  z.exigirZenCerrado(perfil)

  const m = manifiesto(elegido)
  console.log('')
  console.log(z.tinta.cian(`Restaurando     : ${elegido}`))
  if (m) {
    const zen = m.zen || {}
    console.log(`Se hizo con     : Zen ${zen.version} (build ${zen.buildId}) en ${m.plataforma || '?'}, repo ${m.repo_commit}`)
    console.log(`Deshace         : capa web '${m.web_level}', ${(m.prefs || []).length} prefs en ${m.prefs_en}`)
    if (m.plataforma && m.plataforma !== z.plataforma()) {
      z.aviso(
        `Ese backup se hizo en ${m.plataforma} y estas en ${z.plataforma()}. Las prefs que ` +
          'restaura son las del otro sistema; no rompen nada (Zen ignora las que no conoce), ' +
          'pero el cristal de este no quedara configurado. Ejecuta el instalador despues.'
      )
    }
  }
  console.log('')

  // Donde va cada archivo del backup dentro del perfil.
  const destinos = {
    'zen-themes.json': 'zen-themes.json',
    'prefs.js': 'prefs.js',
    'user.js': 'user.js',
    'zen-themes.css': 'chrome/zen-themes.css',
    'userContent.css': 'chrome/userContent.css',
  }

  let restaurados = 0
  for (const [origen, rel] of Object.entries(destinos)) {
    const src = path.join(raiz, elegido, origen)
    const dst = path.join(perfil, ...rel.split('/'))
    if (fs.existsSync(src)) {
      z.copiarSiExiste(src, dst)
      console.log(z.tinta.verde(`  restaurado    : ${rel}`))
      restaurados++
    } else if (fs.existsSync(dst)) {
      console.log(z.tinta.amarillo(`  se deja       : ${rel}`))
      console.log(z.tinta.gris('                  no estaba en el backup, asi que antes no existia.'))
      console.log(z.tinta.gris('                  Se deja como esta a proposito: borrarlo por deduccion'))
      console.log(z.tinta.gris('                  seria adivinar, y esto es una red de seguridad.'))
    }
  }

  console.log('')
  console.log(z.tinta.verde(`${restaurados} archivo(s) restaurado(s).`))
  console.log('Comprueba con: node dev/tools/doctor.mjs')
  console.log('')
  console.log(z.tinta.gris('Nota: esto devuelve el estado del perfil, no el del repo. Si querias'))
  console.log(z.tinta.gris('volver a instalar la version actual, ejecuta el instalador otra vez.'))
})

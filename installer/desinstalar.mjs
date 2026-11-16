#!/usr/bin/env node
// ===========================================================================
// Desinstala los mods y devuelve el perfil a su estado anterior.
// ---------------------------------------------------------------------------
// Borra la carpeta de cada mod, los saca de zen-themes.json, recompila la hoja
// sin ellos, y elimina las lineas user_pref que instalo el script (con lo que
// cada pref vuelve a su valor por defecto de Zen: contenido opaco, webs con su
// propio tema, etc.).
//
// LO QUE NO SE DESHACE, PORQUE NO ES NUESTRO. El cristal del sistema se queda
// encendido en los dos sistemas, y en los dos por el mismo motivo: ese ES el
// valor de fabrica de Zen (`widget.windows.mica.toplevel-backdrop = 2` en
// Windows, `zen.widget.macos.window-material = 1` en macOS). Lo que devuelve la
// ventana a su aspecto solido no es apagar el compositor, es retirar el CSS,
// que trae de vuelta las capas opacas de Zen.
//
// Los backups creados por el instalador NO se tocan; siguen en
// <perfil>/acrylic-zen-backup/.
//
// USO
//   node installer/desinstalar.mjs
//   node installer/desinstalar.mjs --conservar-prefs
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['conservar-prefs'],
    claves: ['perfil'],
  })

  const raizMods = path.join(z.RAIZ_REPO, 'mods')
  // Aqui se cogen TODOS los mods del repo, apliquen o no a esta plataforma: si
  // el perfil viene de otro sistema puede tener registrado alguno que aqui no
  // se instalaria, y desinstalar tiene que dejarlo limpio igualmente.
  const todos = z.mods(raizMods)

  const perfil = args.perfil || z.resolverPerfil()
  z.linea('Perfil objetivo', perfil)

  z.exigirZenCerrado(perfil)

  // --- Carpetas y registro de cada mod ------------------------------------
  const archivoTemas = path.join(perfil, 'zen-themes.json')
  const temas = z.leerJson(archivoTemas, {}) || {}

  for (const mod of todos) {
    const { manifiesto } = mod
    const destino = path.join(perfil, 'chrome', 'zen-themes', manifiesto.id)
    if (fs.existsSync(destino)) fs.rmSync(destino, { recursive: true, force: true })
    delete temas[manifiesto.id]
    z.linea('Mod borrado', manifiesto.name)
  }

  z.escribirJson(archivoTemas, temas)
  z.linea('Desregistrados', archivoTemas)

  // --- Hoja de mods -------------------------------------------------------
  const hoja = z.recompilarHojaMods(perfil)
  for (const a of hoja.avisos) z.aviso(a)
  z.linea('Hoja recompilada', `${hoja.activos} mod(s) en chrome/zen-themes.css`)

  // --- Capa de contenido web ----------------------------------------------
  // Solo se borra si la generamos nosotros: si el usuario ya tenia su propio
  // userContent.css, borrarlo seria destruir trabajo ajeno.
  const uc = path.join(perfil, 'chrome', 'userContent.css')
  if (fs.existsSync(uc)) {
    const cabecera = fs.readFileSync(uc, 'utf8').split('\n', 1)[0]
    if (cabecera.includes('Acrylic Web')) {
      fs.rmSync(uc, { force: true })
      z.linea('Capa web', 'borrada')
    } else {
      z.aviso('chrome/userContent.css no lo genero este instalador; se deja intacto.')
    }
  }

  // --- Prefs --------------------------------------------------------------
  if (args['conservar-prefs']) {
    z.linea('Prefs', 'intactas (--conservar-prefs)')
  } else {
    // Se quitan las de las TRES plataformas, no solo las de esta. Un perfil
    // sincronizado entre un Windows y un Mac lleva las dos familias escritas, y
    // limpiar solo la del sistema donde corre el desinstalador dejaria la otra
    // mitad puesta para siempre.
    const nombres = new Set()
    for (const plat of ['windows', 'macos', 'linux']) {
      for (const k of z.prefsDelCristal(undefined, plat).keys()) nombres.add(k)
    }

    // Todas las opciones de los mods, tengan o no valor por defecto: las de tipo
    // string se declaran sin defaultValue a proposito (vacio = usar el preset),
    // pero si el usuario escribio una hay que limpiarla igual.
    for (const mod of todos) {
      for (const p of z.nombresDePrefsDeMod(path.join(mod.dir, 'preferences.json'))) nombres.add(p)
    }

    for (const f of ['prefs.js', 'user.js']) {
      const destino = path.join(perfil, f)
      if (!fs.existsSync(destino)) continue
      const borradas = z.borrarPrefs(destino, [...nombres])
      z.linea('Prefs limpiadas', `${destino} (${borradas} lineas)`)
    }
  }

  console.log('')
  console.log(z.tinta.verde('Hecho. Zen vuelve a su aspecto original al abrirlo.'))
})

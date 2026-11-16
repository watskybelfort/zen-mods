#!/usr/bin/env node
// ===========================================================================
// Que sitios visitas de verdad y todavia no tienen bloque.
// ---------------------------------------------------------------------------
// Hasta ahora esto se hacia a mano, y se nota: hay cuatro comentarios sueltos
// por el CSS que dicen cosas como "es el sitio sin regla mas visitado del
// historial" o "cubre admin.shopify.com, 30 visitas". Alguien abrio el
// historial, lo miro y lo anoto. Esto hace esa misma pasada, pero entera y sin
// que se le escape ninguno.
//
// Cruza tres cosas:
//
//   1. el historial del perfil de Zen (places.sqlite)
//   2. los dominios que YA tienen bloque en mods/appearance/acrylic-glass/web/50-sites.css, mas los que estan
//      excluidos a proposito en mods/appearance/acrylic-glass/web/90-exclusions.css
//   3. la lista de paginas que has ido guardando desde el submenu Zen Cristal
//
// y saca lo que falta, ordenado por visitas.
//
// EL HISTORIAL SE ABRE EN SOLO LECTURA Y CON immutable=1 ------------ MEDIDO -
// Y las dos cosas hacen falta. Con Zen abierto, places.sqlite esta en modo WAL y
// tiene su -shm y su -wal al lado; abrirlo en solo lectura a secas hace que
// SQLite quiera tocar el -shm, que es escribir en el perfil de alguien que lo
// esta usando. Con immutable=1 se le promete a SQLite que el archivo no cambia,
// asi que no abre el WAL, no coge cerrojos y no escribe nada en ningun sitio.
//
// El precio es que lo que se lee es el ultimo punto de control y no el segundo
// exacto. Para una lista de dominios por visitas eso da igual, y a cambio esto
// se puede ejecutar sin cerrar el navegador.
//
// Se usa el node:sqlite que Node trae de serie: este repo no tiene package.json
// ni lo quiere.
//
// USO
//   node dev/tools/paginas-nuevas.mjs
//   node dev/tools/paginas-nuevas.mjs --json
//   node dev/tools/paginas-nuevas.mjs --desde 30       (solo lo visitado en 30 dias)
//   node dev/tools/paginas-nuevas.mjs --minimo 10      (a partir de 10 visitas)
//   node dev/tools/paginas-nuevas.mjs --todos          (tambien los que ya tienen bloque)
//   node dev/tools/paginas-nuevas.mjs --perfil "<ruta>"
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import * as z from '../../installer/lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['json', 'todos'],
    claves: ['desde', 'minimo', 'perfil'],
  })

  const dias = args.desde === undefined ? 0 : Number(args.desde)
  const minimo = args.minimo === undefined ? 3 : Number(args.minimo)
  if (!Number.isFinite(dias) || dias < 0) throw new Error('--desde quiere un numero de dias.')
  if (!Number.isFinite(minimo) || minimo < 1) throw new Error('--minimo quiere un numero de visitas.')

  const perfil = args.perfil || z.resolverPerfil()
  const bd = path.join(perfil, 'places.sqlite')
  if (!fs.existsSync(bd)) throw new Error('No hay historial en ' + bd + '.')

  const cubiertos = leerCatalogo()
  const guardadas = leerGuardadas(perfil)
  const visitados = leerHistorial(bd, dias)

  const filas = []
  for (const v of visitados) {
    if (v.visitas < minimo) continue
    const como = cubre(cubiertos, v.host)
    if (como && !args.todos) continue
    filas.push({ ...v, estado: como || 'sin bloque', guardada: guardadas.has(v.base) })
  }

  if (args.json) {
    console.log(JSON.stringify({ perfil, desde_dias: dias || null, minimo, filas }, null, 2))
    return
  }

  console.log('')
  z.linea('Perfil', perfil)
  z.linea('Ventana', dias ? 'los ultimos ' + dias + ' dias' : 'todo el historial')
  z.linea('Umbral', minimo + ' visitas')
  z.linea('Con bloque', cubiertos.dominios.size + ' dominios en 50-sites.css')
  z.linea('Excluidos', cubiertos.excluidos.size + ' dominios en 90-exclusions.css')
  if (guardadas.size) z.linea('Guardadas', guardadas.size + ' desde el submenu Zen Cristal')
  console.log('')

  if (!filas.length) {
    console.log(z.tinta.verde('No hay ningun sitio visitado que se quede sin trato. Nada que hacer.'))
    return
  }

  console.log(z.tinta.fuerte('  VISITAS  ULTIMA       SITIO'))
  for (const f of filas) {
    const marca = f.guardada ? z.tinta.cian(' *') : '  '
    const estado = f.estado === 'sin bloque' ? '' : z.tinta.gris('   ' + f.estado)
    console.log(marca + String(f.visitas).padStart(7) + '  ' + f.ultima + '   ' + f.host + estado)
  }
  console.log('')
  if (filas.some((f) => f.guardada)) {
    console.log(z.tinta.gris('  * = la tienes guardada en la lista de Zen Cristal'))
  }
  console.log(z.tinta.gris('  ' + filas.length + ' sitio(s). El siguiente paso es mods/appearance/acrylic-glass/web/readme.md, "Como se anade un sitio".'))
})

// ---------------------------------------------------------------------------
// El catalogo, leido del CSS y no de una lista aparte
// ---------------------------------------------------------------------------
// A proposito: una lista aparte se queda vieja el dia que alguien anade un
// bloque y se olvida de tocarla, y entonces esta herramienta manda a trabajar en
// algo que ya esta hecho. El CSS es la unica fuente que no puede mentir, porque
// es la que el navegador ejecuta.
function leerCatalogo() {
  const dominios = new Set()
  const excluidos = new Set()

  const sacar = (archivo, destino) => {
    const txt = fs.readFileSync(path.join(z.RAIZ_REPO, 'mods', 'appearance', 'acrylic-glass', 'web', archivo), 'utf8')
    for (const m of txt.matchAll(/@-moz-document([^{]+)\{/g)) {
      for (const d of m[1].matchAll(/domain\(\s*([^)\s]+)\s*\)/g)) destino.add(d[1].toLowerCase())
      // De un url-prefix solo se saca el host, que es lo que se puede comparar
      // con el historial. La ruta se pierde, y por eso Google Docs sale como
      // "docs.google.com" entero aunque el bloque solo cubra /document/.
      for (const u of m[1].matchAll(/url-prefix\(\s*([^)\s]+)\s*\)/g)) {
        try {
          const host = new URL(u[1]).hostname.toLowerCase()
          if (host) destino.add(host)
        } catch (e) { /* url-prefix sin host, como about: o resource: */ }
      }
    }
  }

  sacar('50-sites.css', dominios)
  sacar('90-exclusions.css', excluidos)
  return { dominios, excluidos }
}

// domain() de Gecko casa el dominio y todos sus subdominios, asi que aqui se
// compara igual: a mail.google.com lo cubre google.com. Lo que NO hace es cruzar
// sufijos, y por eso mercadolibre.com no cubre mercadolibre.com.co.
function cubre({ dominios, excluidos }, host) {
  for (const [conjunto, etiqueta] of [[dominios, 'con bloque'], [excluidos, 'excluido']]) {
    for (const d of conjunto) {
      if (host === d || host.endsWith('.' + d)) return etiqueta
    }
  }
  return null
}

function leerGuardadas(perfil) {
  const datos = z.leerJson(path.join(perfil, 'zen-cristal-pendientes.json'), null)
  const lista = Array.isArray(datos) ? datos : (datos && datos.pendientes) || []
  return new Set(lista.map((e) => String((e && e.sitio) || '')).filter(Boolean))
}

function leerHistorial(bd, dias) {
  // URI de archivo para poder pasar immutable=1. Las barras y los espacios de
  // una ruta de Windows hay que traducirlos o SQLite no la reconoce.
  const uri = 'file:///' + bd.replace(/\\/g, '/').replace(/ /g, '%20') + '?immutable=1'
  const db = new DatabaseSync(uri, { readOnly: true })
  try {
    const corte = dias ? (Date.now() - dias * 86400000) * 1000 : 0
    const sql = 'SELECT p.rev_host AS rh, COUNT(v.id) AS visitas, MAX(v.visit_date) AS ultima'
      + ' FROM moz_places p JOIN moz_historyvisits v ON v.place_id = p.id'
      + ' WHERE v.visit_date > ?'
      + ' GROUP BY p.rev_host ORDER BY visitas DESC'
    const filas = db.prepare(sql).all(corte)

    const salida = []
    for (const f of filas) {
      // moz_places guarda el host al reves y con un punto al final: asi el
      // indice deja buscar por sufijo, que es como se busca un dominio.
      const host = String(f.rh || '').split('').reverse().join('').replace(/^\./, '')
      if (!host || host === 'localhost' || /^[\d.]+$/.test(host)) continue
      salida.push({
        host,
        base: base(host),
        visitas: Number(f.visitas),
        ultima: new Date(Number(f.ultima) / 1000).toISOString().slice(0, 10),
      })
    }
    return salida
  } finally {
    db.close()
  }
}

// Aproximacion suficiente para agrupar: aqui no hay lista de sufijos publicos
// —eso vive en Gecko— asi que se cogen las dos ultimas etiquetas, y tres cuando
// la penultima es de las que forman sufijo compuesto.
function base(host) {
  const p = host.split('.')
  if (p.length <= 2) return host
  const compuestos = new Set(['com', 'co', 'net', 'org', 'gob', 'gov', 'edu', 'ac'])
  return compuestos.has(p[p.length - 2]) ? p.slice(-3).join('.') : p.slice(-2).join('.')
}

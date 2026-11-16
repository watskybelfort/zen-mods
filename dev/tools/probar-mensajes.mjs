#!/usr/bin/env node
// ===========================================================================
// Mensajes de commit con un BOM pegado delante.
// ---------------------------------------------------------------------------
// Tres bytes invisibles, EF BB BF, el caracter U+FEFF. Git no los interpreta:
// se los queda como el primer caracter del asunto. El commit 8430e97 de este
// repo los lleva, y el sintoma es tan discreto que estuvo semanas sin verse:
// en GitHub el titulo sale con un hueco raro delante y ya esta.
//
// DE DONDE SALEN. De escribir el mensaje en un archivo con
// `Out-File -Encoding utf8`, que en PowerShell 5.1 SIEMPRE pone BOM —no hay
// forma de pedirle que no, el `utf8NoBOM` es de PowerShell 7— y pasarselo a git
// con `-F`. La forma correcta en 5.1 es `[System.IO.File]::WriteAllText(...)`,
// que no lo pone, o un here-doc de bash.
//
// POR QUE ESTA COMPROBACION NO SE PUEDE HACER DESDE POWERSHELL ------ MEDIDO -
// Y esto es lo que convierte el fallo en uno silencioso de verdad. PowerShell
// DESCARTA el BOM al decodificar la salida de un programa, asi que
// `git log --format=%s | Select-String` no lo encuentra nunca: el caracter
// desaparece entre git y la consola. Se comprobo asi una vez y la comprobacion
// dijo que no habia nada. Aqui se leen BYTES, con execFileSync y encoding
// 'buffer', sin que ninguna consola toque el texto por el camino.
//
// USO
//   node dev/tools/probar-mensajes.mjs            (desde el ultimo tag)
//   node dev/tools/probar-mensajes.mjs --todo     (el historial entero)
//   node dev/tools/probar-mensajes.mjs --desde v1.8.0
// ===========================================================================

import { execFileSync } from 'node:child_process'

import * as z from '../../installer/lib/zen.mjs'

const BOM = '\xEF\xBB\xBF'

// El unico commit del repo que lo lleva. Esta publicado y cae DENTRO del rango
// que ya tiene tag y release, asi que limpiarlo obligaria a reescribir siete
// commits, mover el tag y forzar la rama: se decidio no hacerlo. La excepcion
// queda escrita aqui, en el codigo, en vez de en la memoria de nadie.
const PERDONADOS = new Map([
  ['8430e97513b488c17cdf8064386318e90d4a31d4', 'el BOM historico, ya publicado y dentro de v1.8.0: no se reescribe'],
])

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['todo'],
    claves: ['desde'],
  })

  const rango = args.todo ? null : (args.desde || ultimoTag())
  const commits = leerCommits(rango)

  console.log('')
  z.linea('Rango', rango ? rango + '..HEAD' : 'el historial entero')
  z.linea('Commits', String(commits.length))
  console.log('')

  if (!commits.length) {
    console.log(z.tinta.gris('No hay commits nuevos que revisar.'))
    return
  }

  let sucios = 0
  let perdonados = 0
  for (const c of commits) {
    if (!c.asunto.startsWith(BOM)) continue
    if (PERDONADOS.has(c.sha)) {
      perdonados++
      console.log(z.tinta.amarillo('perdonado  ' + c.sha.slice(0, 7) + '  ' + c.asunto.slice(3, 60)))
      console.log(z.tinta.gris('            ' + PERDONADOS.get(c.sha)))
      continue
    }
    sucios++
    console.log(z.tinta.rojo('BOM        ' + c.sha.slice(0, 7) + '  ' + c.asunto.slice(3, 60)))
  }

  console.log('')
  if (sucios) {
    console.log(z.tinta.rojo(sucios + ' mensaje(s) con un BOM delante del asunto.'))
    console.log(z.tinta.gris('  Se arregla con: git rebase -i --root, o git commit --amend si es el ultimo.'))
    console.log(z.tinta.gris('  Y no vuelve a pasar escribiendo el mensaje con [System.IO.File]::WriteAllText'))
    console.log(z.tinta.gris('  o con un here-doc, nunca con Out-File -Encoding utf8.'))
    process.exitCode = 1
    return
  }
  const cola = perdonados ? ' (' + perdonados + ' perdonado(s))' : ''
  console.log(z.tinta.verde('Ningun mensaje lleva BOM' + cola + '.'))
})

function git(args) {
  // 'buffer' a proposito: en cuanto esto pase por una cadena decodificada, el
  // BOM puede desaparecer, que es justo el fallo que se busca.
  return execFileSync('git', args, { cwd: z.RAIZ_REPO, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
}

function ultimoTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0']).toString('utf8').trim() || null
  } catch (e) {
    // Un repo sin tags todavia: se mira todo, que es lo conservador.
    return null
  }
}

function leerCommits(rango) {
  const args = ['log', '-z', '--format=%H %s']
  if (rango) args.push(rango + '..HEAD')
  const crudo = git(args).toString('latin1')
  const salida = []
  for (const reg of crudo.split('\0')) {
    if (!reg) continue
    const i = reg.indexOf(' ')
    if (i < 0) continue
    salida.push({ sha: reg.slice(0, i), asunto: reg.slice(i + 1) })
  }
  return salida
}

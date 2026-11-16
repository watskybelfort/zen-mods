#!/usr/bin/env node
// ===========================================================================
// Un solo comando que revisa todo: lo que se ejecuta el dia que Zen se
// actualiza.
// ---------------------------------------------------------------------------
// Los verificadores sueltos contestan preguntas sueltas. Esto contesta la unica
// que se hace de verdad: "esta todo como deberia?". Reune en un informe:
//
//   1. El perfil, y que los mods del repo esten copiados, registrados y
//      activados en el.
//   2. Que el CSS instalado en el perfil sea EL DEL REPO. Es el fallo mas tonto
//      y el mas facil de tener: se arregla el mod, se olvida reinstalar, y se
//      pasa media hora depurando el bug que ya estaba corregido.
//   3. Que la hoja de mods contenga de verdad el CSS de cada mod. Zen no
//      regenera ese archivo al arrancar, asi que un mod puede estar registrado
//      y no aplicar.
//   4. Que las prefs de las opciones esten sembradas. Un checkbox sin definir
//      vale `false` para @media -moz-pref, o sea que la mitad de los
//      interruptores arrancarian apagados.
//   5. La coherencia INTERNA del contrato de Zen Mods, que es la que se rompe
//      mas callada y encima por nuestra propia mano: renombrar un mod en
//      theme.json mata todos sus desplegables sin tocar una linea de CSS.
//   6. El contrato contra la build instalada, con el diff de la linea base.
//   7. El cristal que dice el compositor, y los CVE pendientes.
//
// Los pasos 6 y 7 delegan en las herramientas que ya existen. Aqui no se
// duplica su logica, se llaman y se resume su codigo de salida.
//
// LOS MODS QUE NO APLICAN A ESTA PLATAFORMA no se echan de menos. Un
// zen-traffic-lights ausente en un Mac no es un fallo: es lo correcto, porque
// macOS ya trae semaforos nativos. Se dicen aparte para que se vea que se han
// mirado, y no como algo que reinstalar arreglaria.
//
// USO
//   node dev/tools/doctor.mjs
//   node dev/tools/doctor.mjs --silencioso     para colgarlo de una tarea programada
//   node dev/tools/doctor.mjs --sin-cves       sin la parte que necesita red
// ===========================================================================

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as z from '../../installer/lib/zen.mjs'

z.principal(() => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['silencioso', 'sin-cves'],
    claves: ['perfil'],
  })

  const hallazgos = []
  const anotar = (area, estado, texto, arreglo = '') => hallazgos.push({ area, estado, texto, arreglo })

  const raizMods = path.join(z.RAIZ_REPO, 'mods')
  const raizWeb = path.join(z.RAIZ_REPO, 'mods', 'appearance', 'acrylic-glass', 'web')

  // Los parciales de web/, en un solo texto y sin comentarios. Un interruptor de
  // un mod no siempre se lee desde su chrome.css: userContent.css es hoja de
  // USUARIO, y eso le basta a `-moz-pref` para funcionar tambien dentro de una
  // pagina. Sin mirar aqui, el paso 5 avisaria de que sobra una opcion que si se
  // usa — y el aviso llevaria a borrarla.
  let cssWeb = ''
  if (fs.existsSync(raizWeb)) {
    cssWeb = sinComentarios(
      fs
        .readdirSync(raizWeb)
        .filter((f) => f.endsWith('.css'))
        .map((f) => fs.readFileSync(path.join(raizWeb, f), 'utf8'))
        .join('\n')
    )
  }

  // --- 1. Perfil y registro ------------------------------------------------
  let perfil = args.perfil
  if (!perfil) {
    try {
      perfil = z.resolverPerfil()
    } catch (e) {
      anotar('perfil', 'FALLA', e.message, 'Comprueba que Zen esta instalado para este usuario.')
    }
  }

  anotar('plataforma', 'ok', z.plataforma())

  if (perfil && fs.existsSync(perfil)) {
    anotar('perfil', 'ok', perfil)

    const archivoTemas = path.join(perfil, 'zen-themes.json')
    let registrados = {}
    if (fs.existsSync(archivoTemas)) {
      registrados = z.leerJson(archivoTemas, {}) || {}
      anotar('registro', 'ok', `${Object.keys(registrados).length} mod(s) en zen-themes.json`)
    } else {
      anotar('registro', 'FALLA', 'no existe zen-themes.json', 'Ejecuta node installer/instalar.mjs')
    }

    // La hoja compilada, una sola lectura para todas las comprobaciones.
    const archivoHoja = path.join(perfil, 'chrome', 'zen-themes.css')
    const hoja = fs.existsSync(archivoHoja) ? normalizar(fs.readFileSync(archivoHoja, 'utf8')) : null
    if (!hoja) {
      anotar('hoja', 'FALLA', 'no existe chrome/zen-themes.css', 'Ejecuta node installer/instalar.mjs')
    }

    const todos = z.mods(raizMods)
    for (const mod of todos) {
      const man = mod.manifiesto
      const id = man.id

      // Un mod que no aplica aqui no se echa de menos: se comprueba lo
      // contrario, que no haya quedado instalado de otra plataforma.
      if (!mod.aplica) {
        const enPerfil = fs.existsSync(path.join(perfil, 'chrome', 'zen-themes', id))
        if (enPerfil || id in registrados) {
          anotar(
            man.name,
            'aviso',
            `es de ${mod.plataformas.join('/')} y esta instalado en este ${z.plataforma()}`,
            'Reinstala: el instalador lo retira solo'
          )
        } else {
          anotar(man.name, 'n/d', `solo ${mod.plataformas.join('/')}, aqui no aplica`)
        }
        continue
      }

      // Se apunta cuantos hallazgos habia antes de revisar este mod, para poder
      // decir "ok" al final. Un informe donde los mods sanos no aparecen deja la
      // duda de si se han revisado.
      const antes = hallazgos.length

      if (!(id in registrados)) {
        anotar(man.name, 'FALLA', 'no esta registrado en zen-themes.json', 'Ejecuta node installer/instalar.mjs')
        continue
      }
      const reg = registrados[id]
      const activo = reg.enabled === undefined || Boolean(reg.enabled)
      if (!activo) {
        anotar(man.name, 'aviso', 'registrado pero DESACTIVADO', 'Ajustes > Zen Mods, o node installer/apagar-mods.mjs --encender')
      }
      if (reg.version && reg.version !== man.version) {
        anotar(man.name, 'aviso', `registrado como v${reg.version}, el repo va por v${man.version}`, 'Reinstala para actualizar')
      }

      // 2. El CSS del perfil es el del repo?
      const cssRepo = path.join(mod.dir, 'chrome.css')
      const cssPerfil = path.join(perfil, 'chrome', 'zen-themes', id, 'chrome.css')
      if (!fs.existsSync(cssPerfil)) {
        anotar(man.name, 'FALLA', 'no hay chrome.css copiado en el perfil', 'Ejecuta node installer/instalar.mjs')
        continue
      }
      // Normalizar saltos de linea antes de comparar: git puede convertir a CRLF
      // al sacar del repo y el instalador copia tal cual, asi que una comparacion
      // cruda daria diferencias que no existen.
      const textoRepo = normalizar(fs.readFileSync(cssRepo, 'utf8'))
      const textoPerfil = normalizar(fs.readFileSync(cssPerfil, 'utf8'))
      if (textoRepo !== textoPerfil) {
        anotar(man.name, 'FALLA', 'el CSS del perfil NO es el del repo', 'Reinstala: los cambios del repo no estan puestos')
      }

      // 3. Y esta dentro de la hoja compilada?
      //    Solo si el mod esta ACTIVO: en uno apagado a proposito la ausencia de
      //    su CSS en la hoja es lo correcto, y avisar ahi mandaria a reinstalar
      //    justo a quien acaba de apagarlo con el interruptor de panico.
      if (activo && hoja && !hoja.includes(textoPerfil)) {
        anotar(
          man.name,
          'FALLA',
          'su CSS no esta en chrome/zen-themes.css, o sea que NO aplica',
          'Reinstala: Zen no regenera esa hoja al arrancar'
        )
      }

      // 4. Las prefs de sus opciones estan sembradas?
      const jsonPrefs = path.join(mod.dir, 'preferences.json')
      if (fs.existsSync(jsonPrefs)) {
        const esperadas = z.prefsPorDefectoDeMod(jsonPrefs)
        const puestas = new Set()
        for (const f of ['prefs.js', 'user.js']) {
          for (const k of z.leerArchivoPrefs(path.join(perfil, f)).keys()) puestas.add(k)
        }
        // Y las que trae la INSTALACION como valor de fabrica. Sin esto la
        // unica opcion de un mod nativo sale como "sin sembrar" para siempre, y
        // por un motivo que no se adivina: al declararla en defaults/pref el
        // valor por defecto pasa a ser el nuestro, y entonces Zen BORRA la
        // linea de prefs.js al salir, porque descarta las que coinciden con el
        // de fabrica. La pref existe y vale lo que tiene que valer; lo que no
        // existe es la linea que este comprobador buscaba.
        for (const k of prefsDeLaInstalacion()) puestas.add(k)
        const faltan = [...esperadas.keys()].filter((k) => !puestas.has(k))
        if (faltan.length) {
          anotar(
            man.name,
            'aviso',
            `${faltan.length} opcion(es) sin sembrar: ${faltan.join(', ')}`,
            'Un checkbox sin definir vale false: reinstala'
          )
        }

        // 5. Coherencia interna del contrato de Zen Mods.
        //    Las tres derivaciones salen de ZenMods.mjs (#writeToDom y
        //    sanitizeModName) y ninguna avisa cuando se rompe.
        const css = sinComentarios(fs.readFileSync(cssRepo, 'utf8'))
        const divEsperado = 'theme-' + man.name.replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, '')

        for (const op of z.leerJson(jsonPrefs, []) || []) {
          if (!op.property) continue
          const sanit = op.property.replace(/\./g, '-')
          if (op.type === 'string') {
            if (!css.includes(`var(--${sanit}`)) {
              anotar(
                man.name,
                'aviso',
                `la opcion '${op.property}' escribe --${sanit} y el CSS no la lee`,
                'Sobra la opcion, o falta el var() en el CSS'
              )
            }
          } else if (op.type === 'dropdown') {
            if (!css.includes(`#${divEsperado}[${sanit}=`)) {
              anotar(
                man.name,
                'FALLA',
                `el desplegable '${op.property}' no se lee: el CSS deberia mirar #${divEsperado}[${sanit}='...']`,
                `Zen deriva ese id del NAME de theme.json ('${man.name}'); si renombraste el mod, actualiza el CSS`
              )
            }
          } else if (op.type === 'checkbox') {
            // Tres sitios valen, y cada uno por un motivo distinto:
            //   - su chrome.css y la capa web, porque las dos son hojas
            //     privilegiadas y a `-moz-pref` le basta con eso;
            //   - y desde Zen Web Apps, el `nativo/` del propio mod: un script
            //     con principal de sistema lee la pref con `getBoolPref`, que no
            //     es un @media pero es la MISMA pref. Sin esta tercera via, la
            //     unica opcion de un mod nativo saldria aqui como "no la lee
            //     nadie", que es justo lo contrario de lo que pasa.
            const lee = `-moz-pref('${op.property}'`
            if (!css.includes(lee) && !cssWeb.includes(lee) && !leidaDesdeNativo(mod.dir, op.property)) {
              anotar(
                man.name,
                'aviso',
                `el interruptor '${op.property}' no lo lee nadie`,
                'Sobra la opcion, o falta el @media (mirado en su chrome.css, en web/ y en su nativo/)'
              )
            }
          }
        }
      }

      if (hallazgos.length === antes) {
        anotar(man.name, 'ok', `v${man.version}, instalado, en la hoja y con sus opciones`)
      }
    }

    // La capa web
    const uc = path.join(perfil, 'chrome', 'userContent.css')
    if (fs.existsSync(uc)) {
      const txt = fs.readFileSync(uc, 'utf8')
      const m = txt.match(/^\s*\*\s*NIVEL:\s*(\S+)/m)
      anotar('capa web', 'ok', `userContent.css, nivel ${m ? m[1] : '?'}`)
    } else {
      anotar('capa web', 'aviso', 'no hay userContent.css: las paginas taparan el cristal', 'Reinstala sin --nivel-web off')
    }
  }

  // --- 6. Contrato contra la build, con diff de la linea base --------------
  let contrato = null
  const r6 = correr('dev/tools/probar-contrato.mjs', ['--json'])
  if (r6.salida) {
    try {
      contrato = JSON.parse(r6.salida)
    } catch {
      anotar('contrato', 'aviso', 'probar-contrato.mjs devolvio algo que no es JSON')
    }
  } else {
    anotar('contrato', 'aviso', `no se pudo ejecutar probar-contrato.mjs: ${r6.error || 'sin salida'}`)
  }

  if (contrato) {
    const rs = contrato.resumen
    if (rs.criticos) {
      anotar('contrato', 'FALLA', `${rs.criticos} enganche(s) CRITICO(s) desaparecido(s) en Zen ${rs.zen}`, 'Detalle: node dev/tools/probar-contrato.mjs')
    } else if (rs.faltan) {
      anotar('contrato', 'aviso', `${rs.faltan} enganche(s) desaparecido(s), ninguno critico`, 'Detalle: node dev/tools/probar-contrato.mjs')
    } else {
      anotar('contrato', 'ok', `${rs.ok} enganches en su sitio (Zen ${rs.zen}, Gecko ${rs.gecko})`)
    }
    if (contrato.cambios?.length) {
      anotar('contrato', 'aviso', `${contrato.cambios.length} enganche(s) han cambiado de estado desde la linea base`, 'Detalle: node dev/tools/probar-contrato.mjs')
    }
  }

  // --- 7. El cristal y los CVE ---------------------------------------------
  // En Windows la medida necesita la ventana abierta, porque se le pregunta a
  // DWM por ESA ventana. En macOS no: lo que se comprueba son las prefs del
  // perfil y el ajuste de accesibilidad, que existen con Zen cerrado. Por eso
  // aqui la condicion es distinta segun el sistema, en vez de exigir Zen abierto
  // en los dos y no medir nunca nada en el que si se puede.
  if (z.ES_WINDOWS && !z.pidsDeZen().length) {
    // Contarlo como aviso haria que el modo silencioso hablase cada vez que se
    // ejecuta con el navegador cerrado, que es siempre.
    anotar('cristal', 'n/d', 'no se mide con Zen cerrado')
  } else {
    const r7 = correr('dev/tools/cristal.mjs', ['--json'])
    if (r7.codigo === 0) {
      anotar('cristal', 'ok', z.ES_MACOS ? 'el sistema deberia estar dibujando vibrancy' : 'DWM confirma acrilico')
    } else if (r7.codigo === 1) {
      // AVISO Y NO FALLO, a proposito. En Windows,
      // DWMWA_SYSTEMBACKDROP_TYPE devuelve lo que la aplicacion PIDIO, y el
      // valor 0 es DWMSBT_AUTO: "lo decide DWM", que no es lo mismo que "no hay
      // acrilico". Este repo ya se equivoco una vez dando por roto lo que
      // fallaba era la medida; aqui se dice lo que se ve y se deja la conclusion
      // a los ojos, que para el cristal son el unico instrumento fiable.
      anotar('cristal', 'aviso', 'hay algo apagando el cristal, o la medida no es concluyente', 'Detalle: node dev/tools/cristal.mjs')
    } else {
      anotar('cristal', 'n/d', `cristal.mjs devolvio ${r7.codigo}`)
    }
  }

  if (!args['sin-cves']) {
    const r = correr('dev/tools/exposicion.mjs', ['--json'])
    if (r.codigo === 0) anotar('cve', 'ok', 'al dia con Mozilla')
    else if (r.codigo === 1) anotar('cve', 'ok', 'por detras de Firefox, sin avisos pendientes')
    else if (r.codigo === 2) anotar('cve', 'FALLA', 'hay CVE publicados que tu build no lleva', 'Detalle: node dev/tools/exposicion.mjs')
    else anotar('cve', 'aviso', 'no se pudo determinar la exposicion', 'Comprueba la conexion')
  }

  // La frontera 10: la hoja de Zen Internet cambia sola cada dos horas desde su
  // repositorio, y donde cae sobre un bloque nuestro se pisan. Solo si la
  // extension esta en el perfil, y solo con red, igual que los CVE.
  if (!args['sin-cves'] && perfil && extensionZenInternet(perfil)) {
    const r = correr('dev/tools/probar-zeninternet.mjs', ['--json'])
    let n = 0
    try { const j = JSON.parse(r.salida); n = j.cambiadas.length + j.nuevas.length } catch { /* salida vacia */ }
    if (r.codigo === 0) anotar('zen internet', 'ok', 'sus hojas sobre sitios del catalogo no han cambiado')
    else if (r.codigo === 1) anotar('zen internet', 'aviso', `ha cambiado su hoja en ${n} sitio(s) del catalogo`, 'Detalle: node dev/tools/probar-zeninternet.mjs')
    else anotar('zen internet', 'n/d', 'no se pudo leer su fuente o la linea base')
  }

  // --- 8. Memoria del BuildID, para el modo silencioso ---------------------
  const buildActual = contrato?.resumen?.buildId || null
  let buildCambio = false
  if (buildActual) {
    const memoria = rutaMemoria()
    const primeraVez = !fs.existsSync(memoria)
    const visto = primeraVez ? '' : fs.readFileSync(memoria, 'utf8').trim()
    // En la primera ejecucion no hay nada con que comparar, asi que no se dice
    // que Zen se ha actualizado: seria mentira y ademas la mas creible de todas.
    buildCambio = !primeraVez && visto !== buildActual
    z.escribirUtf8SinBom(memoria, buildActual + '\n')
  }

  // --- 9. Informe ----------------------------------------------------------
  const fallan = hallazgos.filter((h) => h.estado === 'FALLA')
  const avisos = hallazgos.filter((h) => h.estado === 'aviso')

  if (args.silencioso && !fallan.length && !avisos.length && !buildCambio) return

  console.log('')
  console.log(z.tinta.cian('Doctor de Acrylic Zen'))
  if (buildCambio) console.log(z.tinta.cian(`Zen se ha actualizado desde la ultima revision (BuildID ${buildActual})`))
  console.log('')

  for (const h of hallazgos) {
    const pintar =
      h.estado === 'ok' ? z.tinta.verde : h.estado === 'aviso' ? z.tinta.amarillo : h.estado === 'n/d' ? z.tinta.gris : z.tinta.rojo
    const marca = h.estado === 'ok' ? 'ok   ' : h.estado === 'aviso' ? 'aviso' : h.estado === 'n/d' ? ' -   ' : 'FALLA'
    console.log(pintar(`  ${marca}  ${h.area.padEnd(20)} ${h.texto}`))
    if (h.arreglo && h.estado !== 'ok') console.log(z.tinta.gris(`                              -> ${h.arreglo}`))
  }

  console.log('')
  if (fallan.length) console.log(z.tinta.rojo(`${fallan.length} cosa(s) mal, ${avisos.length} aviso(s).`))
  else if (avisos.length) console.log(z.tinta.amarillo(`Nada roto, ${avisos.length} aviso(s).`))
  else console.log(z.tinta.verde('Todo en orden.'))

  console.log('')
  console.log(z.tinta.gris('Lo que esto NO puede medir: que los mods hagan efecto en pantalla.'))
  console.log(z.tinta.gris('Para eso hace falta el navegador abierto:'))
  console.log(z.tinta.gris('  node installer/enlace-claude.mjs --marionette'))
  console.log(z.tinta.gris('  node dev/tools/probar-vivo.mjs'))

  if (fallan.length) process.exitCode = 2
  else if (avisos.length) process.exitCode = 1
})

/** Si la extension Zen Internet esta instalada y activa en el perfil. */
function extensionZenInternet(perfil) {
  const j = z.leerJson(path.join(perfil, 'extensions.json'), null)
  return !!(j && j.addons || []).find((a) => a.id === '{91aa3897-2634-4a8a-9092-279db23a7689}' && a.active)
}

/** Ejecuta otra herramienta del repo y devuelve su salida y su codigo. */
function correr(rel, argumentos) {
  try {
    const salida = execFileSync(process.execPath, [path.join(z.RAIZ_REPO, rel), ...argumentos], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    })
    return { salida, codigo: 0 }
  } catch (e) {
    // execFileSync lanza cuando el codigo de salida no es 0, pero la salida sigue
    // siendo valida: estas herramientas usan el codigo para decir "hay
    // hallazgos", no "he fallado".
    return { salida: e.stdout || '', codigo: typeof e.status === 'number' ? e.status : -1, error: e.message }
  }
}

/**
 * Donde se recuerda el ultimo BuildID visto.
 *
 * Cada sistema tiene su sitio para esto, y ninguno es el repo: es estado de la
 * maquina, no del proyecto.
 */
function rutaMemoria() {
  const nombre = 'ultima-build.txt'
  if (z.ES_WINDOWS) return path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'acrylic-zen', nombre)
  if (z.ES_MACOS) return path.join(os.homedir(), 'Library', 'Application Support', 'acrylic-zen', nombre)
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'acrylic-zen', nombre)
}

const normalizar = (t) => t.replace(/\r\n/g, '\n').trimEnd()
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ')

/**
 * Los nombres de pref que la INSTALACION de Zen declara como valor de fabrica.
 *
 * Son los `pref('x', y)` de `<instalacion>/defaults/pref/*.js`: los de Zen y los
 * que ponen ahi nuestros mods nativos. Se leen con `pref(` y no con `user_pref(`
 * porque son cosas distintas —uno es el valor de fabrica y el otro el del
 * usuario— y justamente esa diferencia es la que confundia al comprobador de
 * siembra.
 *
 * Si no se puede localizar la instalacion se devuelve un conjunto vacio, que es
 * el lado seguro: como mucho se avisa de una siembra que no hacia falta.
 */
function prefsDeLaInstalacion() {
  const nombres = new Set()
  let dir
  try {
    dir = z.resolverInstalacionZen()
  } catch {
    return nombres
  }
  if (!dir) return nombres
  const dirPrefs = path.join(dir, 'defaults', 'pref')
  if (!fs.existsSync(dirPrefs)) return nombres
  for (const f of fs.readdirSync(dirPrefs)) {
    if (!f.endsWith('.js')) continue
    let texto
    try {
      texto = fs.readFileSync(path.join(dirPrefs, f), 'utf8')
    } catch {
      continue
    }
    for (const m of texto.matchAll(/^\s*pref\(\s*['"]([^'"]+)['"]/gm)) nombres.add(m[1])
  }
  return nombres
}

/**
 * Si el `nativo/` de un mod menciona el nombre de la pref.
 *
 * Se busca el nombre entrecomillado y no a secas para no dar por leida una pref
 * que solo sale nombrada en un comentario de otra cosa. Se miran los comentarios
 * igual que el codigo a proposito: la cabecera de un script de este repo explica
 * que pref lee y por que, y recortarla antes de buscar solo serviria para que
 * mover una linea de sitio apagara la comprobacion.
 */
function leidaDesdeNativo(dirMod, pref) {
  const dir = path.join(dirMod, 'nativo')
  if (!fs.existsSync(dir)) return false
  const aguja = `'${pref}'`
  const agujaDoble = `"${pref}"`
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js') && !f.endsWith('.mjs')) continue
    const t = fs.readFileSync(path.join(dir, f), 'utf8')
    if (t.includes(aguja) || t.includes(agujaDoble)) return true
  }
  return false
}

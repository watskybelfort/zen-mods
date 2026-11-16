#!/usr/bin/env node
// ===========================================================================
// Sobre el Zen abierto: que los mods hacen efecto DE VERDAD.
// ---------------------------------------------------------------------------
// El verificador estatico (probar-contrato.mjs) contesta "el selector existe en
// la build". Esto contesta la otra mitad: "y ademas encaja con algo, y ademas el
// estilo resultante es el que queriamos". Un elemento puede seguir llamandose
// igual y haber dejado de pintar el fondo, o tener otro encima. Los dos hacen
// falta.
//
// Habla Marionette, que no se levanta solo:
//     node installer/enlace-claude.mjs --marionette
//
// El encuadre del protocolo es `<bytes>:<json>`, y el JSON es un array
// posicional:
//     peticion   [0, id, comando, parametros]
//     respuesta  [1, id, error, resultado]
// Al conectar, el servidor manda primero su saludo sin que nadie lo pida, asi
// que hay que leerlo antes de hablar o el primer id se descuadra.
//
// AFIRMACIONES POR PLATAFORMA. Igual que en el contrato, una afirmacion `vivo`
// puede llevar `plataformas`. Hace falta desde que el cristal tiene dos motores:
// en macOS `#zen-browser-background` es la vista de vibrancy y su
// `background-color` computado es transparente a proposito —el velo lo pinta un
// `box-shadow`—, mientras que en Windows ese mismo color ES el velo. La misma
// afirmacion daria resultados opuestos y correctos en cada sistema.
//
// CADA MEDIDA VA ATADA A UNA CLASE DE VENTANA, no a la que Marionette tenga
// delante. Hay dos:
//
//   normal   sin [taskbartab] y sin [popup-window]. Ahi va todo lo de siempre:
//            el testigo del CSS, los selectores y las afirmaciones `vivo`.
//   app      con [taskbartab]. Ahi van las afirmaciones `vivo_app`.
//
// Las dos se buscan por `Services.wm`, y si no hay ninguna de esa clase el
// informe lo dice en vez de dar el mod por bueno.
//
// Hace falta por las dos puntas. Las ventanas de app **nunca** son la que mide
// Marionette —se abren desde un acceso directo de la barra de tareas—, asi que
// sin `vivo_app` el unico sitio donde Zen Web Apps hace algo no lo miraba nadie:
// por ahi se colo el fallo de Zen 1.22.2b con los 124 enganches del contrato
// estatico en verde. Y al reves, medido el 17-09-2026: con una ventana de app
// abierta y enfocada, Marionette pasa a medir ESA, y las afirmaciones escritas
// para la ventana normal dieron dos fallos criticos que no existian. Un
// verificador cuyo resultado depende de donde estaba el foco no sirve para lo
// unico que sirve, que es creerselo cuando dice que algo se rompio.
//
// USO
//   node dev/tools/probar-vivo.mjs
//   node dev/tools/probar-vivo.mjs --json
// ===========================================================================

import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import * as z from '../../installer/lib/zen.mjs'

z.principal(async () => {
  const args = z.parsearArgs(process.argv.slice(2), {
    interruptores: ['json'],
    claves: ['puerto', 'contrato', 'mod'],
  })
  const puerto = Number(args.puerto ?? 2828)

  const dirContrato = args.contrato || path.join(z.RAIZ_REPO, 'dev', 'contract')
  if (!fs.existsSync(dirContrato)) throw new Error(`No se encontro la carpeta de contrato en ${dirContrato}`)

  // --- 1. Contratos --------------------------------------------------------
  const soloMods = args.mod ? args.mod.split(',').map((s) => s.trim()) : null
  const contratos = []
  for (const f of fs.readdirSync(dirContrato).filter((f) => f.endsWith('.json')).sort()) {
    const c = z.leerJson(path.join(dirContrato, f), null)
    // baseline*.json comparte carpeta y no es un contrato: se filtra por forma.
    if (!c || !c.mod || !Array.isArray(c.hooks)) continue
    if (soloMods && !soloMods.includes(c.mod)) continue
    contratos.push(c)
  }
  if (!contratos.length) throw new Error(`No hay contratos que comprobar en ${dirContrato}`)

  const plat = z.plataforma()
  const aplicaAqui = (x) => !x.plataformas || x.plataformas.includes(plat)

  // --- 2. Conectar ---------------------------------------------------------
  const m = new Marionette(puerto)
  const resultados = []
  let ventana = {}

  try {
    await m.conectar()
    await m.llamar('WebDriver:NewSession', { capabilities: {} })
    // Sin esto se ejecutaria en el contenido de la pagina, donde no existe nada
    // de lo que mide este repo.
    await m.llamar('Marionette:SetContext', { value: 'chrome' })

    const info = await m.js(enVentana('normal', 'return { titulo: document.documentElement.id, agente: navigator.userAgent };'))
    ventana = info.ok && info.v !== SIN_VENTANA.normal ? info.v : {}
    const infoApp = await m.js(enVentana('app', 'return document.documentElement.id;'))
    ventana.app = infoApp.ok && infoApp.v !== SIN_VENTANA.app ? infoApp.v : null

    // Toda medida va atada a una CLASE de ventana, nunca a "la que Marionette
    // tenga delante": si no, el resultado depende de donde estaba el foco. Con
    // `fuera` en vez de un fallo, "no hay ninguna ventana de esa clase abierta"
    // se cuenta como no medible, que es lo que es.
    const medir = async (clase, codigo) => {
      const r = await m.js(enVentana(clase, codigo))
      if (r.ok && r.v === SIN_VENTANA[clase]) return { ok: false, fuera: clase }
      return r
    }
    const noMedible = {
      app: 'no hay ninguna ventana de aplicacion web abierta: abre una desde la barra de tareas y repite',
      normal: 'no hay ninguna ventana normal de Zen abierta, solo ventanas de app o popups',
    }

    for (const c of contratos) {
      // Un mod entero puede no ser de esta plataforma. Se dice y se pasa, en vez
      // de medirlo: sus 4 comprobaciones fallarian todas, y con razon —el mod no
      // esta instalado— pero el informe diria "3 criticas fallando" el dia que
      // alguien lo lea buscando si el cristal va bien.
      if (!aplicaAqui(c)) {
        resultados.push({
          mod: c.mod,
          tipo: 'plataforma',
          que: `solo ${c.plataformas.join('/')}`,
          estado: 'transitorio',
          detalle: `en ${plat} este mod no se instala, asi que no hay nada que medir`,
          severity: 'cosmetico',
        })
        continue
      }

      // 2.a Lo primero: el CSS del mod, esta aplicado o no. Si no lo esta, todo
      //     lo demas sobra.
      if (c.testigo) {
        const r = await medir(
          'normal',
          `return getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(c.testigo)}).trim();`
        )
        const vale = r.ok && r.v
        resultados.push({
          mod: c.mod,
          tipo: 'css-aplicado',
          que: `la variable ${c.testigo} llega al documento`,
          estado: vale ? 'ok' : r.fuera ? 'transitorio' : 'FALLA',
          detalle: vale
            ? r.v
            : r.fuera
              ? noMedible.normal
              : 'vacia: el CSS de este mod no esta aplicandose (mod desactivado, o la hoja de mods sin recompilar)',
          severity: 'critico',
        })
      }

      for (const h of c.hooks) {
        if (!aplicaAqui(h)) continue

        // 2.b Selectores: encajan con algo de verdad?
        let sel = h.selector
        if (!sel && ['id', 'class'].includes(h.kind) && /^[#.][A-Za-z][\w-]*$/.test(h.token)) sel = h.token
        if (sel && !h.opcional) {
          const r = await medir('normal', `return document.querySelectorAll(${JSON.stringify(sel)}).length;`)
          const n = r.ok ? Number(r.v) : -1

          // Hay elementos que solo existen en cierto estado de la interfaz: las
          // filas de resultados con el buscador abierto, el overlay de Glance
          // con una vista rapida. Que no esten no dice nada, y tratarlo como
          // fallo hace que el informe grite cada vez que se ejecuta. Su
          // existencia la cubre el verificador estatico.
          let estado
          if (r.fuera) estado = 'transitorio'
          else if (n > 0) estado = 'ok'
          else if (n === 0 && h.transitorio) estado = 'transitorio'
          else if (n === 0) estado = 'FALLA'
          else estado = 'error'

          const detalle =
            estado === 'ok'
              ? `${n} elemento(s)`
              : estado === 'transitorio'
                ? r.fuera
                  ? noMedible.normal
                  : `ninguno en pantalla: ${h.motivo_transitorio}`
                : estado === 'FALLA'
                  ? h.si_falta
                  : r.e
          resultados.push({ mod: c.mod, tipo: 'dom', que: sel, estado, detalle, severity: h.severity })
        }

        // 2.c Prefs: existen en ESTE binario? Aqui se resuelven las que el
        //     omni.ja no puede contestar porque viven en la libreria del motor.
        // OJO: getPrefType devuelve 0 tanto si la pref no existe como si existe
        // pero SIN valor por defecto registrado, y eso segundo es normal en las
        // prefs que solo se leen cuando alguien las escribe. Medido:
        // javascript.options.jit_trustedprincipals da 0 en un Zen recien abierto
        // y su cadena esta dentro de la libreria, o sea que hay codigo leyendola
        // y funciona perfectamente. Tratar el 0 como "no existe" habria hecho
        // sonar la alarma sobre una pref sana.
        if (h.kind === 'pref' && h.buscar && h.buscar !== '-') {
          const r = await m.js(`return Services.prefs.getPrefType(${JSON.stringify(h.buscar)});`)
          const tipo = r.ok ? Number(r.v) : -1
          let estado
          if (tipo > 0) estado = 'ok'
          else if (tipo === 0 && h.sin_default) estado = 'ok'
          else if (tipo === 0) estado = 'aviso'
          else estado = 'error'

          const detalle =
            estado === 'ok'
              ? tipo > 0
                ? `tipo ${tipo}`
                : 'sin valor por defecto, como se esperaba'
              : estado === 'aviso'
                ? 'sin valor por defecto. Puede ser normal si la pref solo se lee al escribirla: comprobar si su cadena esta en la libreria del motor antes de darla por retirada'
                : r.e
          resultados.push({ mod: c.mod, tipo: 'pref', que: h.buscar, estado, detalle, severity: h.severity })
        }
      }

      // 2.d Afirmaciones de efecto, en una ventana normal
      for (const v of c.vivo || []) {
        if (!aplicaAqui(v)) continue
        const r = await medir('normal', v.js)
        if (r.fuera) {
          resultados.push({
            mod: c.mod,
            tipo: 'efecto',
            que: v.que,
            estado: 'transitorio',
            detalle: noMedible.normal,
            severity: v.severity || 'degrada',
          })
          continue
        }
        resultados.push(juzgar(c.mod, 'efecto', v, r))
      }

      // 2.e Afirmaciones DENTRO de una ventana de aplicacion web
      //
      // Marionette mide la ventana que tiene delante, y esa nunca es una de
      // app: esas se abren desde un acceso directo de la barra de tareas, no
      // desde el navegador. Cambiar de ventana con los handles de WebDriver
      // obligaria ademas a devolver el foco a donde estaba, que es justo la
      // clase de efecto secundario que un verificador no debe tener.
      //
      // Asi que no se cambia de ventana: se busca por Services.wm y se evalua
      // con SU document. Y si no hay ninguna abierta se dice, en vez de dar el
      // mod por bueno — que es exactamente como se colo el fallo de 1.22.2b.
      for (const v of c.vivo_app || []) {
        if (!aplicaAqui(v)) continue
        const r = await medir('app', v.js)
        if (r.fuera) {
          resultados.push({
            mod: c.mod,
            tipo: 'efecto-app',
            que: v.que,
            estado: 'transitorio',
            detalle: noMedible.app,
            severity: v.severity || 'degrada',
          })
          continue
        }
        resultados.push(juzgar(c.mod, 'efecto-app', v, r))
      }
    }
  } finally {
    // La sesion se cierra SIEMPRE. Marionette no admite dos a la vez, asi que una
    // sesion colgada por un error envenena todas las llamadas siguientes.
    await m.cerrar()
  }

  // --- 3. Informe ----------------------------------------------------------
  // 'transitorio' no es un fallo: es "no habia ninguno en pantalla". Se cuenta
  // aparte para que el informe lo diga sin contarlo como rojo.
  const transitorios = resultados.filter((r) => r.estado === 'transitorio')
  const malos = resultados.filter((r) => !['ok', 'transitorio'].includes(r.estado))
  const criticos = malos.filter((r) => r.severity === 'critico' && r.estado !== 'aviso')

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ventana,
          plataforma: plat,
          resumen: {
            total: resultados.length,
            ok: resultados.length - malos.length,
            fallan: malos.length,
            criticos: criticos.length,
          },
          checks: resultados,
        },
        null,
        2
      )
    )
  } else {
    console.log('')
    z.linea('Ventana medida', `${ventana.titulo || 'ninguna normal abierta'}  (${plat})`)
    z.linea('Ventana de app', ventana.app || 'ninguna abierta: Zen Web Apps no se puede medir')
    z.linea('Comprobaciones', String(resultados.length))
    console.log('')

    const porMod = new Map()
    for (const r of resultados) {
      if (!porMod.has(r.mod)) porMod.set(r.mod, [])
      porMod.get(r.mod).push(r)
    }
    for (const [mod, grupo] of porMod) {
      const m2 = grupo.filter((r) => !['ok', 'transitorio'].includes(r.estado))
      const pintar = m2.length ? z.tinta.rojo : z.tinta.verde
      console.log(pintar(`  ${m2.length ? 'FALLA' : 'ok   '}  ${mod.padEnd(20)} ${String(grupo.length).padStart(3)} comprobaciones`))
      for (const f of grupo.filter((r) => r.estado === 'transitorio')) {
        console.log(z.tinta.gris(`          no medible  ${f.que}`))
        console.log(z.tinta.gris(`                      ${f.detalle}`))
      }
      for (const f of m2) {
        const pintar2 = f.estado === 'aviso' ? z.tinta.amarillo : z.tinta.rojo
        console.log(pintar2(`          ${f.estado} [${f.severity}] ${f.que}`))
        console.log(z.tinta.amarillo(`                 ${f.detalle}`))
      }
    }

    console.log('')
    if (criticos.length) console.log(z.tinta.rojo(`${criticos.length} comprobacion(es) CRITICA(s) fallando.`))
    else if (malos.length) console.log(z.tinta.amarillo(`${malos.length} con aviso, ninguna critica.`))
    else console.log(z.tinta.verde('Todo aplica y hace efecto.'))
    if (transitorios.length) {
      console.log(z.tinta.gris(`${transitorios.length} no se pueden medir sin abrir la parte de la interfaz donde viven.`))
    }
  }

  if (criticos.length) process.exitCode = 2
  else if (malos.length) process.exitCode = 1
})

/**
 * Compara lo que devolvio una afirmacion con lo que esperaba y lo deja listo
 * para el informe. Sale aparte desde que hay dos clases de afirmacion —la de
 * esta ventana y la de una ventana de app— y las dos se juzgan igual.
 */
function juzgar(mod, tipo, v, r) {
  const obtenido = r.ok ? String(r.v) : null
  let bien = false
  if (r.ok) {
    if (v.espera === 'no-vacio') bien = Boolean(obtenido && obtenido.trim())
    else if (String(v.espera).startsWith('regex:')) bien = new RegExp(String(v.espera).slice(6)).test(obtenido)
    else bien = obtenido === String(v.espera)
  }
  return {
    mod,
    tipo,
    que: v.que,
    estado: bien ? 'ok' : r.ok ? 'FALLA' : 'error',
    detalle: bien ? obtenido : r.ok ? `esperaba '${v.espera}', obtuvo '${obtenido}'` : r.e,
    severity: v.severity || 'degrada',
  }
}

/** Lo que devuelve una afirmacion cuando no hay ninguna ventana de su clase. */
const SIN_VENTANA = { app: '__sin-ventana-de-app__', normal: '__sin-ventana-normal__' }

/**
 * Como se reconoce cada clase de ventana, dentro del chrome.
 *
 * Una ventana normal se define por descarte y con las dos exclusiones: sin
 * `taskbartab` no basta, porque un popup —una ventana de extension, un dialogo
 * de autenticacion— tambien es `navigator:browser` y tampoco monta la interfaz
 * completa.
 */
const ES_VENTANA = {
  app: "r.hasAttribute('taskbartab')",
  normal: "!r.hasAttribute('taskbartab') && !r.hasAttribute('popup-window')",
}

/**
 * Envuelve una afirmacion para que corra con el `document` de una ventana de la
 * clase que se pida, y no con el de "la que Marionette tenga delante".
 *
 * ESTO NO ES UN LUJO -------------------------------------------- MEDIDO -
 * Marionette mide la ventana activa, y eso convierte el resultado en algo que
 * depende de donde estaba el foco. Medido el 17-09-2026: con una ventana de
 * aplicacion web abierta y enfocada, las afirmaciones escritas para la ventana
 * normal se midieron DENTRO de la app y dieron dos fallos criticos que no
 * existian. Un verificador que grita por donde estaba el raton deja de servir
 * para lo unico que sirve, que es creerselo cuando dice que algo se rompio.
 *
 * `document`, `window` y `getComputedStyle` se redeclaran dentro de la funcion
 * —que es lo que `js()` construye alrededor de este codigo—, asi que las
 * afirmaciones se escriben igual que siempre y no tienen que saber nada de
 * esto. `getComputedStyle` hace falta atado a SU ventana: el de otra ventana,
 * sobre este elemento, no contesta lo mismo.
 */
function enVentana(clase, codigo) {
  return `
    let elegida = null;
    for (const w of Services.wm.getEnumerator('navigator:browser')) {
      const r = w.document && w.document.documentElement;
      if (!r) continue;
      if (${ES_VENTANA[clase]}) { elegida = w; break; }
    }
    if (!elegida) return ${JSON.stringify(SIN_VENTANA[clase])};
    const window = elegida;
    const document = elegida.document;
    const getComputedStyle = elegida.getComputedStyle.bind(elegida);
    ${codigo}
  `
}

/** Cliente Marionette minimo: encuadre `<bytes>:<json>` sobre TCP. */
class Marionette {
  constructor(puerto) {
    this.puerto = puerto
    this.socket = null
    this.id = 0
    this.buffer = Buffer.alloc(0)
    this.esperando = []
  }

  conectar() {
    return new Promise((resolver, rechazar) => {
      const s = net.connect({ port: this.puerto, host: '127.0.0.1' })
      s.setTimeout(60000)
      s.once('error', () =>
        rechazar(
          new Error(
            `No hay nadie escuchando en 127.0.0.1:${this.puerto}.\n` +
              'Marionette no se levanta solo: arranca Zen con\n' +
              '  node installer/enlace-claude.mjs --marionette'
          )
        )
      )
      s.once('connect', () => {
        this.socket = s
        s.on('data', (d) => this.#recibir(d))
        // El saludo llega sin que nadie lo pida; hay que consumirlo antes de
        // hablar o el primer id se descuadra.
        this.esperando.push({ resolver: () => resolver(), rechazar })
      })
    })
  }

  #recibir(datos) {
    this.buffer = Buffer.concat([this.buffer, datos])
    // Puede llegar mas de un mensaje en el mismo paquete, o uno partido en
    // varios: se drena mientras haya un mensaje completo.
    for (;;) {
      const sep = this.buffer.indexOf(0x3a) // ':'
      if (sep < 0) return
      const largo = Number(this.buffer.toString('ascii', 0, sep))
      if (!Number.isInteger(largo)) return
      if (this.buffer.length < sep + 1 + largo) return
      const cuerpo = this.buffer.toString('utf8', sep + 1, sep + 1 + largo)
      this.buffer = this.buffer.subarray(sep + 1 + largo)
      const pendiente = this.esperando.shift()
      if (pendiente) pendiente.resolver(cuerpo)
    }
  }

  llamar(comando, parametros = {}) {
    return new Promise((resolver, rechazar) => {
      this.id++
      const cuerpo = JSON.stringify([0, this.id, comando, parametros])
      const bytes = Buffer.from(cuerpo, 'utf8')
      this.socket.write(`${bytes.length}:`)
      this.socket.write(bytes)
      this.esperando.push({
        resolver: (crudo) => {
          const resp = JSON.parse(crudo) // [1, id, error, resultado]
          if (resp[2]) return rechazar(new Error(`Marionette: ${resp[2].error} ${resp[2].message}`))
          resolver(resp[3])
        },
        rechazar,
      })
    })
  }

  /**
   * Ejecuta JS en el chrome de Zen y devuelve el valor.
   *
   * Se envuelve en try/catch dentro de la propia pagina: un fallo de UNA
   * comprobacion no puede tumbar la sesion entera, porque entonces el primer
   * selector obsoleto impediria ver los otros veinte.
   */
  async js(codigo) {
    const envuelto =
      `try { return JSON.stringify({ ok: true, v: (function(){ ${codigo} })() }); }\n` +
      `catch (e) { return JSON.stringify({ ok: false, e: String(e && e.message || e) }); }`
    try {
      let crudo = await this.llamar('WebDriver:ExecuteScript', { script: envuelto, args: [] })
      if (crudo && typeof crudo === 'object' && 'value' in crudo) crudo = crudo.value
      if (!crudo) return { ok: false, e: 'sin respuesta' }
      return JSON.parse(crudo)
    } catch (e) {
      return { ok: false, e: e.message }
    }
  }

  async cerrar() {
    if (!this.socket || this.socket.destroyed) return
    try {
      await this.llamar('WebDriver:DeleteSession', {})
    } catch {
      // Si la sesion ya murio, cerrar el socket basta.
    }
    this.socket.destroy()
  }
}

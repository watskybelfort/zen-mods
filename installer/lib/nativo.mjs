// ===========================================================================
// El cargador nativo, la parte que comparten los cuatro mods nativos
// ---------------------------------------------------------------------------
// Todos escriben las mismas dos piezas en el directorio de instalacion de Zen,
// y por el mismo motivo: `general.config.filename` admite UN nombre de archivo,
// no una lista, asi que el directorio de instalacion solo puede tener un
// cargador. Los cuatro instaladores escriben ESTE MISMO config.js, con lo que el
// orden no importa y reinstalar uno no desarma a los otros.
//
// Aqui vive todo lo que depende del sistema, que es justo lo que cambia entre
// Windows y macOS:
//
//   Windows   <Program Files>\Zen Browser\config.js
//             <Program Files>\Zen Browser\defaults\pref\<mod>.js
//   macOS     /Applications/Zen.app/Contents/Resources/config.js
//             /Applications/Zen.app/Contents/Resources/defaults/pref/<mod>.js
//
// EN macOS EL DIRECTORIO DE INSTALACION ES `Contents/Resources`, no
// `Contents/MacOS`. Es donde Gecko resuelve `XCurProcD`, que es contra lo que se
// resuelven tanto `general.config.filename` como `defaults/pref`. Se nota
// mirando que ahi es donde estan `application.ini` y los `omni.ja`. Ponerlo
// junto al binario deja el mod instalado y mudo, sin ningun error.
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'

import * as z from './zen.mjs'

/**
 * Marca que dice que el config.js instalado salio de este repo.
 *
 * Vale cualquiera de los dos nombres: el cargador compartido los lleva a ambos,
 * y el config.js viejo de Letra Viva —de cuando era solo suyo— lleva el primero.
 * Asi cada instalador reconoce como propio el que dejo el otro y lo puede
 * actualizar al compartido sin quejarse.
 */
export const MARCA_NUESTRA = /Zen Letra Viva|Zen Sintonia|Zen Sin Cristal|Zen Web Apps|Zen Modo Oscuro|Zen Mezcla|Zen Remoto|Zen Inmersivo/

/**
 * Los mods nativos que carga el config.js compartido, por su carpeta del perfil.
 *
 * Es la MISMA tabla que la de core/config.js, y esta repetida aqui porque los
 * dos lados la necesitan para cosas distintas: alli para cargar, aqui para saber
 * quien mas depende del cargador antes de borrarlo. Si se anade un mod nativo
 * hay que tocar las dos.
 *
 * `pieza` es el archivo por el que se reconoce que ese mod esta instalado, y no
 * es el mismo para todos desde que hay uno sin inyector: Zen Web Apps no toca
 * ninguna pagina, asi que no tiene `proceso.js` y su unica pieza del perfil es
 * el script de ventana. Es la misma regla que aplica el cargador —"existe su
 * primera pieza"— escrita de la otra forma.
 */
export const MODS_NATIVOS = [
  { dir: 'zen-letra', nombre: 'Zen Letra Viva', pieza: 'proceso.js' },
  { dir: 'zen-sintonia', nombre: 'Zen Sintonia', pieza: 'proceso.js' },
  { dir: 'zen-sin-cristal', nombre: 'Zen Sin Cristal', pieza: 'proceso.js' },
  { dir: 'zen-web-apps', nombre: 'Zen Web Apps', pieza: 'ventana.js' },
  { dir: 'zen-modo-oscuro', nombre: 'Zen Modo Oscuro', pieza: 'proceso.js' },
  { dir: 'zen-mezcla', nombre: 'Zen Mezcla', pieza: 'proceso.js' },
  { dir: 'zen-remoto', nombre: 'Zen Remoto', pieza: 'proceso.js' },
  { dir: 'zen-inmersivo', nombre: 'Zen Inmersivo', pieza: 'proceso.js' },
]

/**
 * Que otros mods nativos siguen instalados en el perfil.
 *
 * Lo pregunta cada desinstalador antes de tocar el config.js, que es compartido:
 * borrarlo con otro mod todavia puesto lo deja mudo, y ese fallo —un mod que
 * dejo de funcionar el dia que desinstalaste OTRA cosa— no se relaciona con su
 * causa en semanas.
 */
export function otrosModsNativos(perfil, dirPropio) {
  return MODS_NATIVOS.filter(
    (m) => m.dir !== dirPropio && fs.existsSync(path.join(perfil, 'chrome', m.dir, m.pieza))
  ).map((m) => m.nombre)
}

/** Rutas de las piezas que van en el directorio de instalacion. */
export function rutasDeInstalacion(dirZen, nombrePrefs) {
  return {
    dirZen,
    config: path.join(dirZen, 'config.js'),
    prefs: path.join(dirZen, 'defaults', 'pref', nombrePrefs),
  }
}

/** Localiza la instalacion de Zen, o falla con un mensaje que dice que hacer. */
export function exigirInstalacionZen(sugerida) {
  if (sugerida) {
    if (!fs.existsSync(path.join(sugerida, 'application.ini'))) {
      throw new Error(`En ${sugerida} no hay un application.ini: no parece la instalacion de Zen`)
    }
    return sugerida
  }
  const dir = z.resolverInstalacionZen()
  if (!dir) {
    const ejemplo = z.ES_MACOS ? '/Applications/Zen.app/Contents/Resources' : 'C:\\Program Files\\Zen Browser'
    throw new Error(`No encontre la instalacion de Zen. Pasala con --ruta-zen "${ejemplo}"`)
  }
  return dir
}

/**
 * Comprueba que se puede escribir en el directorio de instalacion.
 *
 * Se pregunta por el permiso real en vez de por el rol del usuario, y en los dos
 * sistemas. "Soy administrador" y "puedo escribir aqui" no son lo mismo:
 *
 *   - En Windows, un Zen instalado en `%LOCALAPPDATA%` se escribe sin elevar
 *     nada, y el script antiguo pedia administrador igualmente.
 *   - En macOS, un Zen arrastrado a /Applications pertenece a quien lo arrastro
 *     (`gabo:admin`, `drwxrwxr-x`) y tampoco hace falta sudo. Solo lo hace falta
 *     si lo instalo otro usuario o un instalador con privilegios.
 */
export function exigirEscritura(dirZen, salidaAlternativa) {
  try {
    fs.accessSync(dirZen, fs.constants.W_OK)
    return
  } catch {
    // Cae abajo.
  }

  const comoElevar = z.ES_WINDOWS
    ? 'Abre PowerShell como administrador y repite.'
    : `Repite con sudo:\n  sudo node ${path.relative(process.cwd(), process.argv[1])} ${process.argv.slice(2).join(' ')}`

  throw new Error(
    `No se puede escribir en ${dirZen}.\n\n${comoElevar}${salidaAlternativa ? `\n\n${salidaAlternativa}` : ''}`
  )
}

/**
 * Escribe config.js y el archivo de prefs en el directorio de instalacion.
 *
 * Si ya hay un config.js que no es nuestro, NO lo pisa: avisa y se para. Pisarlo
 * dejaria sin cargador a lo que hubiera antes —fx-autoconfig, tipicamente— y eso
 * es de las cosas que uno tarda semanas en relacionar.
 */
export function instalarCargador({ dirZen, nombrePrefs, contenidoPrefs, salidaAlternativa }) {
  const rutas = rutasDeInstalacion(dirZen, nombrePrefs)
  const cargador = path.join(z.RAIZ_REPO, 'core', 'config.js')
  if (!fs.existsSync(cargador)) throw new Error(`No existe ${cargador}. El repo esta incompleto.`)

  if (fs.existsSync(rutas.config)) {
    const actual = fs.readFileSync(rutas.config, 'utf8')
    if (!MARCA_NUESTRA.test(actual)) {
      throw new Error(
        `Ya hay un ${rutas.config} que no es nuestro.\n\n` +
          'Probablemente sea fx-autoconfig u otro cargador. Pisarlo dejaria sin arrancar a lo\n' +
          'que hubiera antes, y ese fallo no se relaciona con esto en semanas. Salidas:\n\n' +
          '  - Anadir a mano al config.js existente el contenido de core/config.js\n' +
          '    (es un bucle sobre una tabla: carga el inyector de cada mod del perfil).' +
          (salidaAlternativa ? `\n  - ${salidaAlternativa}` : '')
      )
    }
  }

  exigirEscritura(dirZen, salidaAlternativa)

  z.escribirUtf8SinBom(rutas.config, fs.readFileSync(cargador, 'utf8'))
  z.escribirUtf8SinBom(rutas.prefs, contenidoPrefs)

  z.linea('Cargador', rutas.config)
  return rutas
}

/**
 * Avisos que solo tienen sentido despues de haber tocado el directorio de
 * instalacion. Van al final, cuando ya esta hecho, porque no impiden nada:
 * describen lo que acaba de pasar.
 */
export function avisosDelDirectorioDeInstalacion() {
  console.log('')
  console.log(z.tinta.amarillo('Dos cosas que conviene saber del directorio de instalacion:'))
  console.log('  - Una actualizacion de Zen lo reemplaza y se lleva estas dos piezas por')
  console.log('    delante. El inyector, que vive en el perfil, sobrevive. Cuando pase, se')
  console.log('    vuelve a ejecutar este script con --solo-instalacion y listo.')

  if (z.ES_MACOS) {
    // Esto no tiene equivalente en Windows y no se adivina: es la diferencia
    // entre "he copiado dos archivos" y "he modificado una app firmada".
    console.log('  - En macOS Zen.app va firmada y sellada (hardened runtime, sealed')
    console.log('    resources). Anadir archivos dentro rompe ese sello: `codesign --verify`')
    console.log('    pasara a fallar. La app sigue abriendo, porque Gatekeeper solo')
    console.log('    comprueba la firma la primera vez y esta ya esta aprobada, pero si')
    console.log('    macOS te vuelve a preguntar por permisos (microfono, camara,')
    console.log('    pantalla) es por esto y no por otra cosa.')
    console.log('')
    console.log(z.tinta.gris('    Para deshacerlo del todo, --desinstalar y luego reinstalar Zen.'))
  }
}

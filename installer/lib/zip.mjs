// ===========================================================================
// Lector de ZIP minimo, para los omni.ja de Zen
// ---------------------------------------------------------------------------
// POR QUE NO SE LLAMA A `unzip`. La version en PowerShell usaba
// `System.IO.Compression`, que es parte de .NET y esta en cualquier Windows.
// El equivalente comodo en Node seria invocar `unzip`, y ahi se rompe la
// portabilidad justo al reves: `unzip` esta en macOS y en Linux pero no en
// Windows. Tambien seria una dependencia de npm, y este repo no tiene ninguna
// ni la quiere para leer un formato de 1989.
//
// Un omni.ja es un zip normal: unas 13.000 entradas, metodo 0 (guardado) u 8
// (deflate). `zlib.inflateRawSync` viene en Node, asi que lo unico que falta es
// recorrer el directorio central, y eso son cuarenta lineas.
//
// LO QUE NO IMPLEMENTA, A PROPOSITO: ZIP64, cifrado y descriptores de datos.
// Ninguno aparece en un omni.ja. Si algun dia apareciera, `abrirZip` lo dice en
// voz alta en vez de devolver datos incompletos, que es la unica forma de fallo
// aceptable en una herramienta cuyo trabajo es detectar ausencias.
// ===========================================================================

import fs from 'node:fs'
import zlib from 'node:zlib'

const FIRMA_EOCD = 0x06054b50
const FIRMA_EOCD64 = 0x06064b50
const FIRMA_CENTRAL = 0x02014b50
const FIRMA_LOCAL = 0x04034b50

/**
 * Abre un zip y devuelve sus entradas.
 *
 * Cada entrada trae `nombre` y `leerTexto()`, que descomprime bajo demanda: el
 * contrato solo mira los archivos de texto, que son la mitad, y descomprimir
 * los otros seria tirar el tiempo.
 */
export function abrirZip(ruta) {
  const buf = fs.readFileSync(ruta)

  // El EOCD esta al final, detras de un comentario de hasta 64 KB. Se busca
  // hacia atras porque su firma puede aparecer por casualidad en los datos.
  const maxCola = Math.min(buf.length, 0xffff + 22)
  let eocd = -1
  for (let i = buf.length - 22; i >= buf.length - maxCola; i--) {
    if (buf.readUInt32LE(i) === FIRMA_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error(`${ruta}: no es un zip (no se encontro el EOCD)`)

  const nEntradas = buf.readUInt16LE(eocd + 10)
  let inicioCentral = buf.readUInt32LE(eocd + 16)

  // Los centinelas de ZIP64. Un omni.ja nunca los lleva, pero si algun dia los
  // llevara hay que decirlo: seguir leyendo daria un directorio truncado y la
  // herramienta informaria de enganches "desaparecidos" que si estan.
  if (nEntradas === 0xffff || inicioCentral === 0xffffffff) {
    const l = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]))
    if (l >= 0 && buf.readUInt32LE(l) === FIRMA_EOCD64) {
      throw new Error(`${ruta}: es un ZIP64 y este lector no lo soporta.`)
    }
    throw new Error(`${ruta}: el directorio central declara valores de ZIP64 sin cabecera ZIP64.`)
  }

  const entradas = []
  let p = inicioCentral
  for (let i = 0; i < nEntradas; i++) {
    if (buf.readUInt32LE(p) !== FIRMA_CENTRAL) {
      throw new Error(`${ruta}: entrada ${i} del directorio central corrupta`)
    }
    const banderas = buf.readUInt16LE(p + 8)
    const metodo = buf.readUInt16LE(p + 10)
    const tamComprimido = buf.readUInt32LE(p + 20)
    const tamCrudo = buf.readUInt32LE(p + 24)
    const largoNombre = buf.readUInt16LE(p + 28)
    const largoExtra = buf.readUInt16LE(p + 30)
    const largoComentario = buf.readUInt16LE(p + 32)
    const offsetLocal = buf.readUInt32LE(p + 42)
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre)

    // Bit 0 = cifrado. No hay omni.ja cifrado, pero saltarselo en silencio
    // devolveria basura como si fuera contenido.
    if (banderas & 0x1) throw new Error(`${ruta}: la entrada '${nombre}' esta cifrada`)

    entradas.push({
      nombre,
      metodo,
      tamCrudo,
      esDirectorio: nombre.endsWith('/'),
      leerTexto: () => descomprimir(buf, ruta, nombre, offsetLocal, metodo, tamComprimido, tamCrudo),
    })

    p += 46 + largoNombre + largoExtra + largoComentario
  }

  return entradas
}

function descomprimir(buf, ruta, nombre, offsetLocal, metodo, tamComprimido, tamCrudo) {
  if (buf.readUInt32LE(offsetLocal) !== FIRMA_LOCAL) {
    throw new Error(`${ruta}: cabecera local corrupta en '${nombre}'`)
  }
  // Los largos de nombre y extra de la cabecera LOCAL pueden no coincidir con
  // los del directorio central —el campo extra suele traer relleno de
  // alineacion—, asi que se leen de aqui y no de alli.
  const largoNombre = buf.readUInt16LE(offsetLocal + 26)
  const largoExtra = buf.readUInt16LE(offsetLocal + 28)
  const inicio = offsetLocal + 30 + largoNombre + largoExtra
  const datos = buf.subarray(inicio, inicio + tamComprimido)

  if (metodo === 0) return datos.toString('utf8')
  if (metodo === 8) return zlib.inflateRawSync(datos, { maxOutputLength: Math.max(tamCrudo, 1) * 2 + 1024 }).toString('utf8')
  throw new Error(`${ruta}: '${nombre}' usa el metodo de compresion ${metodo}, que no se soporta`)
}

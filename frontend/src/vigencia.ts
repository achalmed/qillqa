/**
 * Vigencia de la firma y del expediente, del lado de la web (2026-10-06).
 *
 * La regla vive en el servidor (backend/app/servicios/vigencia.py): si un
 * cambio altera LO IMPRESO de un documento ya firmado —el texto, el formato,
 * el nombre de un adjunto en la línea «Adj.», una imagen incrustada—, la firma
 * se anula; si solo cambia lo que se fusiona en el expediente, la firma sigue y
 * el expediente queda desactualizado.
 *
 * La web PREGUNTA antes: manda `confirmar_anulacion: false` y, si el servidor
 * responde 409 `anula_firma`, muestra qué se perdería y repite con `true` solo
 * si la persona acepta. Sin la marca (scripts, pestañas viejas) el servidor
 * anula y lo informa, como siempre.
 */
import { ErrorApi } from './api'
import { confirmar } from './componentes/Dialogos'

export interface DetalleAnulaFirma {
  codigo: 'anula_firma'
  mensaje: string
  consecuencias?: string[]
}

/** Lo que devuelve el servidor cuando sí anuló (firma.anular_firma). */
export interface Anulacion {
  motivo?: string
  firmados?: number
  cargos?: string[]
  std?: string
  expediente?: string
  estado_anterior?: string
}

export const esAnulaFirma = (e: unknown): e is ErrorApi =>
  e instanceof ErrorApi &&
  e.estado === 409 &&
  (e.detalle as DetalleAnulaFirma | undefined)?.codigo === 'anula_firma'

/** Diálogo de confirmación con las consecuencias que da el servidor. */
export function confirmarAnulacion(d: DetalleAnulaFirma): Promise<boolean> {
  const lista = (d.consecuencias ?? []).map((c) => `• ${c}`).join('\n')
  return confirmar(
    `${d.mensaje}\n\n${lista ? `${lista}\n\n` : ''}¿Guardar el cambio y anular la firma?`,
    { titulo: 'El cambio anula la firma', aceptar: 'Guardar y anular', peligro: true },
  )
}

/**
 * Ejecuta `hacer(false)`; si el servidor avisa que el cambio anula la firma,
 * pregunta y repite con `hacer(true)`. Devuelve null si la persona no aceptó
 * (no se guardó nada).
 */
export async function conConfirmacion<T>(hacer: (confirmar: boolean) => Promise<T>): Promise<T | null> {
  try {
    return await hacer(false)
  } catch (e) {
    if (!esAnulaFirma(e)) throw e
    if (!(await confirmarAnulacion(e.detalle as DetalleAnulaFirma))) return null
    return hacer(true)
  }
}

/** Texto del aviso tras una anulación: qué dejó de valer. */
export function textoAnulacion(a?: Anulacion | null): string {
  const partes = ['La firma anterior quedó anulada: hay que volver a firmar el documento.']
  if (a?.cargos?.length) {
    partes.push(`Los cargos de la versión anulada ya no cuentan (${a.cargos.join(', ')}): se conservan como historia.`)
  }
  if (a?.std) partes.push(`El registro en el STD (${a.std}) era de la versión anulada y se retiró.`)
  if (a?.expediente) partes.push('El expediente firmado se retiró: vuelva a armarlo después de firmar.')
  return partes.join(' ')
}

export const MENSAJE_NO_GUARDADO =
  'No se guardó: el cambio habría anulado la firma. Deshágalo o vuelva a guardar si quiere anularla.'

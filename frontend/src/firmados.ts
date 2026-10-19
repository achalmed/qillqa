// Subida del PDF FIRMADO (2026-10-08): el servidor solo acepta el PDF firmado de ESE documento
// (servicios/validar_firmado.py: PDF, nombre «…[R].pdf», firma digital y mismo texto que el
// generado). Si lo rechaza, se muestran los motivos; al administrador se le ofrece forzarlo
// (queda en la bitácora). Lo usan la gestión de entrega, la bandeja y los proyectos de ley.
import { ErrorApi, esSinServidor, subirArchivo } from './api'
import { confirmar } from './componentes/Dialogos'
import { ofrecerAlVolver } from './componentes/AvisoAlVolver'
import { rutaWebDe } from './alvolver'

interface DetalleFirmado {
  codigo?: string
  mensaje?: string
  motivos?: string[]
  puede_forzar?: boolean
}

/** Sube `datos` a `ruta`; si el servidor responde 422 `firmado_invalido`, pregunta al
 *  administrador si lo fuerza. Devuelve null si se canceló. */
export async function subirFirmado<T>(ruta: string, datos: FormData, metodo: 'POST' | 'PUT' = 'POST'): Promise<T | null> {
  try {
    return await subirArchivo<T>(ruta, datos, metodo)
  } catch (e) {
    // Sin servidor (2026-10-18): el firmado no se encola (lo valida el servidor y un archivo no
    // cabe en la cola); se explica y se ofrece recordarlo al volver.
    if (e instanceof ErrorApi && e.estado === 503 && esSinServidor(e)) {
      const archivo = datos.get('archivo')
      const nombre = archivo instanceof File ? ` (${archivo.name})` : ''
      await ofrecerAlVolver('firmado', `Subir el firmado${nombre}`, rutaWebDe(ruta))
      return null
    }
    const d = e instanceof ErrorApi && e.estado === 422 ? (e.detalle as DetalleFirmado) : null
    if (!d || d.codigo !== 'firmado_invalido') throw e
    const lista = (d.motivos ?? []).map((m) => `• ${m}`).join('\n')
    if (!d.puede_forzar) throw new Error(`No se aceptó como firmado:\n${lista}`)
    const si = await confirmar(`${lista}\n\n¿Lo sube de todos modos? Quedará anotado en la bitácora.`, {
      titulo: 'Este PDF no pasó la validación',
      aceptar: 'Subir de todos modos',
      peligro: true,
    })
    if (!si) return null
    datos.set('forzar', '1')
    return subirArchivo<T>(ruta, datos, metodo)
  }
}

/** Solo PDF en el selector del firmado. */
export const ACEPTA_FIRMADO = '.pdf,application/pdf'

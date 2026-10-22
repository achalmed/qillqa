// Puente con la extensión de Qillqa (extension/, 2026-10-08, Edison: «que la ventana de apoyo
// aparezca sola en la página de la mesa de partes»). Una página no puede dibujar dentro de la
// página de otra entidad; la extensión sí. Al pulsar «Abrir mesa de partes», Qillqa abre la
// mesa y le pasa a la extensión los datos del documento (window.postMessage → su script en
// esta página); la extensión muestra el panel dentro de la mesa. Sin extensión, solo se abre
// la mesa y se avisa cómo instalarla.
import { api } from './api'

/** La extensión marca la página de Qillqa con data-qillqa-extension al cargar; la instalada antes del 2026-10-22, con
 * data-sgdp-extension (se deja de leer en la fase 7). */
export const extensionInstalada = (): boolean =>
  Boolean(document.documentElement.dataset.qillqaExtension || document.documentElement.dataset.sgdpExtension)

/** Abre la mesa de partes (desde un clic) y, si hay extensión, le pasa el documento. */
export async function abrirMesaDePartes(documentoId: number, url: string): Promise<'extension' | 'sin-extension'> {
  // Primero la pestaña, dentro del clic (si no, el navegador la bloquea).
  const pestana = window.open(url, '_blank')
  if (pestana) pestana.opener = null
  if (!extensionInstalada()) return 'sin-extension'
  const paquete = await api(`/api/mesa/documentos/${documentoId}`)
  window.postMessage(
    { qillqa: 'mesa', url, paquete, token: localStorage.getItem('qillqa_token') ?? '', api: location.origin },
    location.origin,
  )
  return 'extension'
}

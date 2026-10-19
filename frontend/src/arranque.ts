/**
 * ARRANQUE A PRUEBA DE PUBLICACIONES (2026-10-13).
 *
 * «No carga el sistema, no puedo acceder» (Edison, desde el celular, tras una publicación). La
 * aplicación nunca debe quedarse en blanco: index.html trae una pantalla de carga propia y un
 * vigía (si el JS no llega, ofrece reintentar), y aquí se cubre lo que pasa ya arrancada.
 *
 *   · `marcarMontada`: avisa al vigía de index.html de que el JS llegó y React arrancó.
 *   · `cargarPagina`: React.lazy con un reintento. Una pestaña abierta ANTES de publicar pide
 *     trozos con el hash viejo; si ya no están (ni en el servidor ni en el service worker), se
 *     recarga UNA vez para tomar la versión nueva, en vez de dejar la página en blanco.
 *   · `vite:preloadError`: el mismo remedio para los trozos que Vite precarga.
 */
import { lazy, type ComponentType } from 'react'

const CLAVE_RECARGA = 'sgdp_recarga_trozo'
/** Una recarga por esta ventana de tiempo: si el trozo sigue sin llegar, no se entra en bucle. */
const VENTANA_MS = 30_000

declare global {
  interface Window {
    __sgdpMontada?: boolean
  }
}

/** ¿Toca recargar? Pura, para probarla: recarga si no se recargó en la última ventana. */
export function debeRecargar(ultima: number | null, ahora: number, ventana = VENTANA_MS): boolean {
  return ultima === null || !Number.isFinite(ultima) || ahora - ultima > ventana
}

function recargarUnaVez(): boolean {
  let ultima: number | null = null
  try {
    const v = sessionStorage.getItem(CLAVE_RECARGA)
    ultima = v ? Number(v) : null
  } catch {
    /* sin sessionStorage: se recarga igual, una vez por carga de página */
  }
  if (!debeRecargar(ultima, Date.now())) return false
  try {
    sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()))
  } catch {
    /* idem */
  }
  window.location.reload()
  return true
}

/** React.lazy que, si el trozo de la página ya no existe (otra publicación), recarga una vez. */
export function cargarPagina<T extends ComponentType<any>>(importar: () => Promise<{ default: T }>) {
  return lazy(() =>
    importar().catch((error: unknown) => {
      if (recargarUnaVez()) return new Promise<{ default: T }>(() => undefined) // la recarga manda
      throw error
    }),
  )
}

export function vigilarTrozos(): void {
  window.addEventListener('vite:preloadError', (evento) => {
    if (recargarUnaVez()) evento.preventDefault()
  })
}

/** El vigía deja de contar. La pantalla de carga de index.html la reemplaza React al pintar. */
export function marcarMontada(): void {
  window.__sgdpMontada = true
}

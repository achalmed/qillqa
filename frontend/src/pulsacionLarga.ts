/**
 * PULSACIÓN LARGA (2026-10-19): mantener el dedo (o el botón del ratón) sobre una ficha de la bandeja
 * abre el documento completo, mientras que el toque corto abre el visor rápido. `pulsacionLarga`
 * devuelve los manejadores para esparcir en el elemento. No es un gancho: las tarjetas se pintan
 * dentro de un `map`, así que el estado de la pulsación en curso vive aquí (solo hay un dedo a la vez).
 * Tras una pulsación larga, el clic que suelta el dedo se traga (si no, abriría también el visor).
 * Mover el dedo más de unos píxeles la cancela: es un desplazamiento de la lista, no una pulsación.
 */
import type { PointerEvent as PointerEventReact, SyntheticEvent } from 'react'

const DURACION_MS = 500
const TOLERANCIA_PX = 10

let temporizador: number | null = null
let origen: { x: number; y: number } | null = null
let disparada = false

const cancelar = () => {
  if (temporizador !== null) window.clearTimeout(temporizador)
  temporizador = null
  origen = null
}

export function pulsacionLarga(alLargo: (() => void) | undefined) {
  if (!alLargo) return {}
  return {
    onPointerDown: (e: PointerEventReact<HTMLElement>) => {
      if (e.button !== 0) return
      cancelar()
      disparada = false
      origen = { x: e.clientX, y: e.clientY }
      temporizador = window.setTimeout(() => {
        temporizador = null
        disparada = true
        alLargo()
      }, DURACION_MS)
    },
    onPointerMove: (e: PointerEventReact<HTMLElement>) => {
      if (origen && Math.hypot(e.clientX - origen.x, e.clientY - origen.y) > TOLERANCIA_PX) cancelar()
    },
    onPointerUp: cancelar,
    onPointerCancel: cancelar,
    onPointerLeave: cancelar,
    // El menú contextual del navegador al mantener el dedo (Android) estorbaría al gesto.
    onContextMenu: (e: SyntheticEvent) => e.preventDefault(),
    onClickCapture: (e: SyntheticEvent) => {
      if (disparada) {
        disparada = false
        e.stopPropagation()
        e.preventDefault()
      }
    },
  }
}

/** Para que el texto de la ficha no se seleccione ni salga el globo de «copiar» al mantener el dedo. */
export const SX_SIN_SELECCION = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as const

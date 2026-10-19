// Zona del editor en SOLO LECTURA (documento firmado, 2026-10-06).
//
// Se puede LEER, SELECCIONAR y COPIAR (Edison 2026-10-06: «algunos usuarios
// copian de un documento hecho para hacer uno nuevo»), pero nada la cambia.
// La primera versión usaba `inert`, que también impedía seleccionar.
//
// Cómo: escuchas en fase de CAPTURA sobre la zona, antes que el destino.
//   · beforeinput, paste, cut, drop: se cancelan (escribir, pegar, cortar o
//     soltar no llegan ni al DOM ni a React).
//   · clics, teclas, foco, input y change: no se propagan. React escucha en la
//     raíz, así que ningún manejador de la zona (onClick, onChange, onKeyDown,
//     los de ProseMirror) se entera; lo nativo sigue: seleccionar, Ctrl+C, el
//     menú contextual del navegador.
//   · sobre un CONTROL (botón, menú, casilla, fecha…) además se cancela la
//     acción nativa, para que no se active ni se abra.
//   · los campos de texto que se tocan quedan `readOnly` mientras dure el
//     bloqueo (se pueden seleccionar, no escribir; en el celular, sin teclado).
// Si algo escapara (p. ej. la composición del teclado del celular en un
// cuadro de anexos), Guardar y Vista previa siguen bloqueados en el editor.
import { useEffect, useRef, type ReactNode } from 'react'
import Box from '@mui/material/Box'

const CONTROLES = [
  'button', 'a[href]', 'label', 'summary', 'select',
  '[role="button"]', '[role="combobox"]:not(input)', '[role="checkbox"]', '[role="switch"]',
  '[role="radio"]', '[role="slider"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="file"]', 'input[type="date"]',
  'input[type="range"]', 'input[type="color"]',
].join(', ')

const CANCELAR = ['beforeinput', 'paste', 'cut', 'drop']
const AISLAR = [
  'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick',
  'contextmenu', 'touchstart', 'touchend', 'keydown', 'keyup', 'keypress', 'focusin', 'input', 'change',
]
const PUNTERO = new Set(['pointerdown', 'mousedown', 'click', 'dblclick', 'auxclick', 'touchend'])
const TECLAS_QUE_ACTIVAN = new Set([' ', 'Enter', 'ArrowUp', 'ArrowDown'])

const esTexto = (t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !t.matches(CONTROLES))

export default function ZonaBloqueada({ activo, children }: { activo: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const zona = ref.current
    if (!zona || !activo) return
    const puestos = new Set<HTMLInputElement | HTMLTextAreaElement>()
    const soloLectura = (t: EventTarget | null) => {
      if (esTexto(t) && !t.readOnly) {
        t.readOnly = true
        puestos.add(t)
      }
    }
    const cancelar = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const aislar = (e: Event) => {
      e.stopPropagation()
      const t = e.target
      if (e.type === 'focusin' || e.type === 'pointerdown' || e.type === 'touchstart') soloLectura(t)
      const control = t instanceof Element && t.closest(CONTROLES)
      if (!control) return
      if (PUNTERO.has(e.type)) e.preventDefault()
      else if (e.type === 'keydown' && TECLAS_QUE_ACTIVAN.has((e as KeyboardEvent).key)) e.preventDefault()
    }
    CANCELAR.forEach((tipo) => zona.addEventListener(tipo, cancelar, true))
    AISLAR.forEach((tipo) => zona.addEventListener(tipo, aislar, true))
    return () => {
      CANCELAR.forEach((tipo) => zona.removeEventListener(tipo, cancelar, true))
      AISLAR.forEach((tipo) => zona.removeEventListener(tipo, aislar, true))
      puestos.forEach((campo) => {
        campo.readOnly = false
      })
    }
  }, [activo])
  return (
    <Box
      ref={ref}
      aria-readonly={activo || undefined}
      // Los botones de la zona se ven apagados: parecían activos y no respondían
      // (Edison 2026-10-06, Anexos de un firmado). El texto sigue legible.
      sx={activo ? { '& button, & [role="button"], & .MuiChip-clickable': { opacity: 0.4, cursor: 'not-allowed' } } : undefined}
    >
      {children}
    </Box>
  )
}

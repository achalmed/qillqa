// AutocompletarReferencias — vigila lo que se escribe y avisa cuándo ofrecer citas
// (2026-10-06: «al escribir el nombre o número de una ley, documento, proyecto… se
// muestran coincidencias; se elige con clic, Tab o Enter y la relación se crea sola»).
//
// Es un plugin de ProseMirror sin dependencias nuevas (@tiptap/suggestion no está
// instalado): en cada cambio mira el texto del párrafo hasta el cursor
// (`detectarConsulta`, puro) y llama a `control.alCambiar` con la consulta y la
// posición en pantalla; la lista la pinta React (componentes/PopupReferencias.tsx), que
// a su vez contesta las teclas por `control.teclado`. Solo vive en el navegador: NO va
// en esquema.ts (no agrega nodos; el nodo es `Referencia`).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { detectarConsulta } from './consultaReferencias'

export interface EstadoConsulta {
  /** Rango del documento que se reemplaza al elegir (desde la palabra o la «@»). */
  desde: number
  hasta: number
  consulta: string
  /** Posición en pantalla del inicio (para colocar la lista). */
  izquierda: number
  arriba: number
  abajo: number
}

export interface ControlReferencias {
  alCambiar: (estado: EstadoConsulta | null) => void
  /** La lista contesta las teclas (flechas, Enter, Tab); true = la usó. */
  teclado: (evento: KeyboardEvent) => boolean
  /** ¿Hay lista con resultados a la vista? (Escape solo se toma entonces). */
  abierto: () => boolean
}

export const crearControl = (): ControlReferencias => ({
  alCambiar: () => {},
  teclado: () => false,
  abierto: () => false,
})

const CLAVE = new PluginKey('autocompletarReferencias')

export const AutocompletarReferencias = Extension.create<{ control: ControlReferencias | null }>({
  name: 'autocompletarReferencias',

  addOptions() {
    return { control: null }
  },

  addProseMirrorPlugins() {
    const control = this.options.control
    // Con Escape se descarta la consulta que empieza en esta posición, hasta que se
    // escriba otra (o se mueva el cursor fuera).
    let descartada: number | null = null
    let actual: EstadoConsulta | null = null
    // La posición en pantalla se mide en el cuadro siguiente: coordsAtPos fuerza
    // un cálculo de diseño síncrono y, a cada tecla, trababa la escritura en el
    // celular (2026-10-06). `actual` queda al día YA (lo leen las teclas).
    let cuadro: number | null = null
    const cancelarCuadro = () => {
      if (cuadro !== null) cancelAnimationFrame(cuadro)
      cuadro = null
    }
    const avisar = (e: EstadoConsulta | null) => {
      cancelarCuadro()
      actual = e
      control?.alCambiar(e)
    }
    const avisarConPosicion = (view: EditorView, e: Omit<EstadoConsulta, 'izquierda' | 'arriba' | 'abajo'>) => {
      actual = { izquierda: 0, arriba: 0, abajo: 0, ...actual, ...e }
      cancelarCuadro()
      cuadro = requestAnimationFrame(() => {
        cuadro = null
        if (!actual || view.isDestroyed) return
        let p: { left: number; top: number; bottom: number }
        try {
          p = view.coordsAtPos(actual.desde)
        } catch {
          return // la posición ya no existe en el documento
        }
        actual = { ...actual, izquierda: p.left, arriba: p.top, abajo: p.bottom }
        control?.alCambiar(actual)
      })
    }
    return [
      new Plugin({
        key: CLAVE,
        view: () => ({
          update: (view) => {
            if (!control || !view.editable) return
            const { selection } = view.state
            if (!selection.empty || !view.hasFocus()) {
              if (actual) avisar(null)
              return
            }
            const $pos = selection.$from
            if (!$pos.parent.isTextblock) {
              if (actual) avisar(null)
              return
            }
            const antes = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼')
            const c = detectarConsulta(antes)
            if (!c) {
              descartada = null
              if (actual) avisar(null)
              return
            }
            const desde = $pos.start() + c.inicio
            if (descartada === desde) {
              if (actual) avisar(null)
              return
            }
            descartada = null
            // Misma consulta en el mismo sitio: ni medir ni repintar la lista.
            if (actual && actual.desde === desde && actual.consulta === c.consulta && actual.hasta === selection.from) return
            avisarConPosicion(view, { desde, hasta: selection.from, consulta: c.consulta })
          },
          destroy: () => avisar(null),
        }),
        props: {
          handleKeyDown: (_view, evento) => {
            if (!control || !actual) return false
            if (evento.key === 'Escape' && control.abierto()) {
              descartada = actual.desde
              avisar(null)
              return true
            }
            return control.teclado(evento)
          },
          handleDOMEvents: {
            blur: () => {
              if (actual) avisar(null)
              return false
            },
          },
        },
      }),
    ]
  },
})

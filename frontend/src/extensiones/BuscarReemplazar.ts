// BuscarReemplazar — buscar y reemplazar en el editor, como en Word (2026-10-05:
// «el asesor dice que en Word tenía más herramientas»; corregir el número de
// una ley o un nombre que se repite en todo el texto).
//
// Resalta todas las coincidencias (decoraciones: no tocan el documento ni
// viajan a Yjs), marca la actual y reemplaza una o todas como UNA transacción
// (un solo «deshacer»). Ctrl+F / Ctrl+H dentro del editor avisan a la barra
// (evento `sgdp-buscar` en el elemento del editor) para que abra su panel.
//
// Los imports llevan `.ts`: este archivo lo carga también el servidor de
// edición simultánea vía esquema.ts (Node sin compilar).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as NodoPM } from '@tiptap/pm/model'

export interface EstadoBusqueda {
  termino: string
  mayusculas: boolean
  resultados: { desde: number; hasta: number }[]
  actual: number
}

export const claveBusqueda = new PluginKey<EstadoBusqueda>('sgdp-buscar')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    buscarReemplazar: {
      buscar: (termino: string, mayusculas?: boolean) => ReturnType
      siguienteCoincidencia: () => ReturnType
      anteriorCoincidencia: () => ReturnType
      reemplazarActual: (por: string) => ReturnType
      reemplazarTodo: (por: string) => ReturnType
      limpiarBusqueda: () => ReturnType
    }
  }
}

/** Todas las coincidencias de `termino` en el texto (dentro de cada bloque de
 *  texto; no cruza de un párrafo a otro). */
function encontrar(doc: NodoPM, termino: string, mayusculas: boolean): { desde: number; hasta: number }[] {
  if (!termino) return []
  const buscado = mayusculas ? termino : termino.toLocaleLowerCase('es')
  const salida: { desde: number; hasta: number }[] = []
  doc.descendants((nodo, pos) => {
    if (!nodo.isTextblock) return true
    // Texto del bloque y, por cada carácter, su posición en el documento.
    let texto = ''
    const posiciones: number[] = []
    nodo.forEach((hijo, desplazamiento) => {
      if (hijo.isText && hijo.text) {
        for (let i = 0; i < hijo.text.length; i++) posiciones.push(pos + 1 + desplazamiento + i)
        texto += hijo.text
      } else {
        // Un nodo en línea (nota al pie, salto) corta la palabra.
        posiciones.push(-1)
        texto += '\u0000'
      }
    })
    const donde = mayusculas ? texto : texto.toLocaleLowerCase('es')
    let i = donde.indexOf(buscado)
    while (i >= 0) {
      const desde = posiciones[i]
      const hasta = posiciones[i + buscado.length - 1]
      if (desde >= 0 && hasta >= 0) salida.push({ desde, hasta: hasta + 1 })
      i = donde.indexOf(buscado, i + Math.max(buscado.length, 1))
    }
    return false
  })
  return salida
}

const VACIO: EstadoBusqueda = { termino: '', mayusculas: false, resultados: [], actual: 0 }

export const BuscarReemplazar = Extension.create({
  name: 'buscarReemplazar',

  addCommands() {
    const meta = (tr: import('@tiptap/pm/state').Transaction, estado: Partial<EstadoBusqueda>) => tr.setMeta(claveBusqueda, estado)
    return {
      buscar:
        (termino, mayusculas = false) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(meta(tr, { termino, mayusculas, actual: 0 }))
          return true
        },
      siguienteCoincidencia:
        () =>
        ({ state, tr, dispatch }) => {
          const e = claveBusqueda.getState(state)
          if (!e?.resultados.length) return false
          if (dispatch) dispatch(meta(tr, { actual: (e.actual + 1) % e.resultados.length }).scrollIntoView())
          return true
        },
      anteriorCoincidencia:
        () =>
        ({ state, tr, dispatch }) => {
          const e = claveBusqueda.getState(state)
          if (!e?.resultados.length) return false
          if (dispatch) dispatch(meta(tr, { actual: (e.actual - 1 + e.resultados.length) % e.resultados.length }))
          return true
        },
      reemplazarActual:
        (por) =>
        ({ state, tr, dispatch }) => {
          const e = claveBusqueda.getState(state)
          const r = e?.resultados[e.actual]
          if (!r) return false
          if (dispatch) dispatch(por ? tr.insertText(por, r.desde, r.hasta) : tr.delete(r.desde, r.hasta))
          return true
        },
      reemplazarTodo:
        (por) =>
        ({ state, tr, dispatch }) => {
          const e = claveBusqueda.getState(state)
          if (!e?.resultados.length) return false
          if (dispatch) {
            // De atrás hacia adelante: las posiciones anteriores no se mueven.
            ;[...e.resultados].reverse().forEach((r) => (por ? tr.insertText(por, r.desde, r.hasta) : tr.delete(r.desde, r.hasta)))
            dispatch(tr)
          }
          return true
        },
      limpiarBusqueda:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(meta(tr, { ...VACIO }))
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    const abrir = (reemplazar: boolean) => () => {
      this.editor.view.dom.dispatchEvent(new CustomEvent('sgdp-buscar', { detail: { reemplazar }, bubbles: true }))
      return true
    }
    return { 'Mod-f': abrir(false), 'Mod-h': abrir(true) }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<EstadoBusqueda>({
        key: claveBusqueda,
        state: {
          init: () => ({ ...VACIO }),
          apply(tr, previo) {
            const cambio = tr.getMeta(claveBusqueda) as Partial<EstadoBusqueda> | undefined
            if (!cambio && !tr.docChanged) return previo
            const e = { ...previo, ...(cambio ?? {}) }
            const resultados = encontrar(tr.doc, e.termino, e.mayusculas)
            return { ...e, resultados, actual: Math.min(e.actual, Math.max(resultados.length - 1, 0)) }
          },
        },
        props: {
          decorations(state) {
            const e = claveBusqueda.getState(state)
            if (!e?.resultados.length) return DecorationSet.empty
            return DecorationSet.create(
              state.doc,
              e.resultados.map((r, i) =>
                Decoration.inline(r.desde, r.hasta, { class: i === e.actual ? 'busqueda-actual' : 'busqueda-coincidencia' }),
              ),
            )
          },
        },
      }),
    ]
  },
})

// SangriaParrafo — sangría por párrafo con la tecla Tab.
//
// Añade a cada párrafo dos atributos que el serializador del backend
// (app/latex/serializador.py, _con_sangria) traduce a LaTeX:
//   sangria     nivel 0..6 (pasos de 0.75 cm)
//   sangriaTipo 'completa' (todo el bloque) | 'primera' (solo la 1.ª
//               línea) | 'francesa' (colgante: 1.ª línea al margen)
//
// Tab = adentrar un paso · Shift+Tab = sacar un paso. Dentro de tablas y
// listas, Tab conserva su comportamiento normal (moverse de celda /
// anidar), así que la sangría solo actúa en párrafos sueltos.
import { Extension } from '@tiptap/core'

export type SangriaTipo = 'completa' | 'primera' | 'francesa'

const PASO_CM = 0.75
const MAX_NIVEL = 6

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sangriaParrafo: {
      /** Cambia el nivel de sangría del párrafo actual en ±1. */
      ajustarSangria: (delta: 1 | -1) => ReturnType
      /** Fija el TIPO de sangría del párrafo actual. */
      fijarTipoSangria: (tipo: SangriaTipo) => ReturnType
    }
  }
}

export const SangriaParrafo = Extension.create({
  name: 'sangriaParrafo',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          sangria: {
            default: 0,
            parseHTML: (el) => Number(el.getAttribute('data-sangria') ?? 0) || 0,
            renderHTML: (attrs) => {
              const nivel = Number(attrs.sangria) || 0
              if (nivel <= 0) return {}
              const cm = nivel * PASO_CM
              const tipo = (attrs.sangriaTipo as SangriaTipo) || 'completa'
              // Vista en el editor equivalente a lo que hará LaTeX.
              const estilo =
                tipo === 'primera'
                  ? `text-indent:${cm}cm`
                  : tipo === 'francesa'
                    ? `padding-left:${cm}cm;text-indent:-${cm}cm`
                    : `padding-left:${cm}cm`
              return { 'data-sangria': String(nivel), style: estilo }
            },
          },
          sangriaTipo: {
            default: 'completa',
            parseHTML: (el) => el.getAttribute('data-sangria-tipo') ?? 'completa',
            renderHTML: (attrs) =>
              attrs.sangriaTipo && attrs.sangriaTipo !== 'completa'
                ? { 'data-sangria-tipo': attrs.sangriaTipo }
                : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      ajustarSangria:
        (delta) =>
        ({ editor, commands }) => {
          // En tablas y listas, Tab tiene su propio significado.
          if (editor.isActive('table') || editor.isActive('listItem')) return false
          if (!editor.isActive('paragraph')) return false
          const actual = Number(editor.getAttributes('paragraph').sangria) || 0
          const nivel = Math.max(0, Math.min(MAX_NIVEL, actual + delta))
          if (nivel === actual) return delta < 0 && actual === 0 ? false : true
          return commands.updateAttributes('paragraph', { sangria: nivel })
        },
      fijarTipoSangria:
        (tipo) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { sangriaTipo: tipo }),
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.ajustarSangria(1),
      'Shift-Tab': () => this.editor.commands.ajustarSangria(-1),
    }
  },
})

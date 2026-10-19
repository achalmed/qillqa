// SaltoPagina — nodo TipTap para forzar un salto de página en el PDF.
//
// Bloque ATÓMICO sin contenido: en el editor se ve como una línea punteada
// con el rótulo «salto de página»; el serializador del backend
// (app/latex/serializador.py, tipo "saltoPagina") lo traduce a \clearpage.
import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    saltoPagina: {
      /** Inserta un salto de página en el cursor. */
      insertarSaltoPagina: () => ReturnType
    }
  }
}

export const SaltoPagina = Node.create({
  name: 'saltoPagina',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'hr[data-salto-pagina]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes, { 'data-salto-pagina': '', class: 'salto-pagina' })]
  },

  addCommands() {
    return {
      insertarSaltoPagina:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    }
  },
})

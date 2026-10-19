/**
 * COMENTARIO ANCLADO (2026-10-19, fase 5 del editor integrado): una marca con el `id` del comentario
 * sobre el tramo del texto al que se refiere. El comentario en sí vive donde siempre (los comentarios
 * del documento o la Conversación del proyecto); la marca solo lo ancla: resalta el tramo, lleva al
 * panel y se retira al resolverlo o al borrarlo. El PDF y el Word no la imprimen (marca desconocida
 * para el serializador: se conserva el texto).
 */
import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comentario: {
      /** Ancla el comentario `id` al tramo seleccionado. */
      anclarComentario: (id: number) => ReturnType
      /** Retira el ancla del comentario `id` de todo el texto. */
      desanclarComentario: (id: number) => ReturnType
    }
  }
}

export const Comentario = Mark.create({
  name: 'comentario',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return { id: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-comentario') ?? 0) || 0, renderHTML: (a) => ({ 'data-comentario': String(a.id) }) } }
  },
  parseHTML() { return [{ tag: 'span[data-comentario]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { title: 'Tramo comentado' }), 0] },
  addCommands() {
    return {
      anclarComentario: (id) => ({ commands }) => commands.setMark(this.name, { id }),
      desanclarComentario: (id) => ({ tr, state, dispatch }) => {
        const tipo = state.schema.marks.comentario
        const tramos: [number, number][] = []
        state.doc.descendants((n, pos) => {
          if (n.isText && n.marks.some((m) => m.type === tipo && m.attrs.id === id)) tramos.push([pos, pos + n.nodeSize])
          return true
        })
        if (tramos.length === 0) return false
        if (dispatch) for (const [de, a] of tramos) tr.removeMark(de, a, tipo.create({ id }))
        return true
      },
    }
  },
})

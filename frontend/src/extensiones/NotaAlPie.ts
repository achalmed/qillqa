// NotaAlPie — nodo TipTap para notas al pie de la entidad.
//
// Es un nodo INLINE y ATÓMICO: no tiene contenido editable dentro (el
// texto vive en el atributo `texto`) y el serializador lo traduce a \footnote{...}.
// En el editor se ve con su NÚMERO de orden, el mismo del PDF (contador CSS en los
// estilos del editor: BarraFormato y EditorDocumento); el «†» queda en el HTML
// solo para que copiar y pegar no pierda la nota. Coincide con el nodo que
// espera backend/app/latex/serializador.py (type "footnote", attr "texto").
import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, NodeSelection } from '@tiptap/pm/state'

/** Evento DOM que la nota dispara al tocar su número; la barra (BarraFormato) lo escucha y abre el editor
 *  de la nota (2026-10-18, Edison: «clic en el número abre su editor directamente»). */
export const EVENTO_ABRIR_NOTA = 'sgdp-nota'

export const NotaAlPie = Node.create({
  name: 'footnote',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      texto: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-texto') ?? '',
        renderHTML: (attrs) => ({ 'data-texto': attrs.texto }),
      },
    }
  },

  parseHTML() {
    // priority 60 (> 50 de Superscript): las dos reglas leen <sup> y, empatadas,
    // ganaba la marca de superíndice: al pegar un texto copiado de Qillqa la nota
    // quedaba como un «†» suelto (2026-10-06, copiar de un firmado a uno nuevo).
    return [{ tag: 'sup[data-footnote]', priority: 60 }]
  },

  addProseMirrorPlugins() {
    const tipo = this.name
    return [
      new Plugin({
        props: {
          // Un clic (o toque) sobre la nota la selecciona y pide abrir su editor. Antes solo la
          // seleccionaba y el cursor en forma de mano daba a entender que se abría algo.
          handleClickOn(view, _pos, node, nodePos, event) {
            if (node.type.name !== tipo || !view.editable) return false
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)))
            view.dom.dispatchEvent(new CustomEvent(EVENTO_ABRIR_NOTA, { detail: { texto: node.attrs.texto } }))
            event.preventDefault()
            return true
          },
        },
      }),
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        'data-footnote': '',
        class: 'nota-al-pie',
        // El texto se ve al pasar el mouse; el número lo pone el contador CSS.
        title: (HTMLAttributes as Record<string, string>)['data-texto'] || 'Nota al pie',
      }),
      '†',
    ]
  },
})

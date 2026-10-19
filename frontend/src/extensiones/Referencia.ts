// Referencia — nodo TipTap de una cita elegida en el autocompletado (2026-10-06).
//
// Inline y ATÓMICO, como la nota al pie: se ve y se imprime como su texto normal
// («Ley N° 27795, Ley de Demarcación y Organización Territorial»), con un subrayado
// tenue en el editor. Guarda a QUÉ apunta ({tipo, id}): al guardar, el servidor lo
// vuelve relación (backend/app/servicios/relaciones.py) y el serializador escribe solo
// el texto (más la referencia en nota al pie si es una obra: atributo `nota`). Desde el
// 2026-10-06 las obras vienen de ZOTERO (tipo `zotero`): su cita en el texto «(Cotler, 1978)»
// y su referencia las formatea Zotero; los nodos `libro` (calibre:N) de antes siguen valiendo.
//
// Está en esquema.ts: el servidor de edición simultánea debe conocer el nodo o lo
// descartaría al pasar de Yjs a JSON.
import { Node, mergeAttributes } from '@tiptap/core'

const NOMBRE_TIPO: Record<string, string> = {
  norma: 'Norma',
  documento: 'Documento',
  proyecto: 'Proyecto de ley',
  semana: 'Semana de representación',
  pedido: 'Pedido',
  persona: 'Persona',
  institucion: 'Institución',
  libro: 'Libro',
  zotero: 'Obra de Zotero',
  entrada: 'Documento recibido',
}

export const Referencia = Node.create({
  name: 'referencia',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    const attr = (nombre: string) => ({
      default: '',
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${nombre}`) ?? '',
      renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${nombre}`]: String(attrs[nombre] ?? '') }),
    })
    return { tipo: attr('tipo'), id: attr('id'), texto: attr('texto'), nota: attr('nota') }
  },

  parseHTML() {
    return [{ tag: 'span[data-referencia]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const tipo = String(node.attrs.tipo ?? '')
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-referencia': '',
        class: `referencia referencia-${tipo}`,
        title: `Cita enlazada (${(NOMBRE_TIPO[tipo] ?? 'referencia').toLowerCase()}): queda relacionada al guardar`,
      }),
      String(node.attrs.texto ?? ''),
    ]
  },

  // Copiar, contar palabras y comparar versiones ven el texto, no un hueco.
  renderText({ node }) {
    return String(node.attrs.texto ?? '')
  },
})

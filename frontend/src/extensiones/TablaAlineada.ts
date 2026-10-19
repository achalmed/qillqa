// TablaAlineada — celdas y cabeceras de tabla con atributo `align`.
//
// El menú contextual (clic derecho sobre una tabla) escribe align en la
// celda, la fila, la columna o toda la tabla; el serializador del backend
// (app/latex/serializador.py, _celda/_tabla) lo traduce a columnas
// >{\centering...}p{} conservando el ancho de extremo a extremo.
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import type { Editor } from '@tiptap/core'
import { TableMap, cellAround } from '@tiptap/pm/tables'

export type Alineacion = 'left' | 'center' | 'right'
export type AmbitoAlineacion = 'celda' | 'fila' | 'columna' | 'tabla'

const atributoAlign = {
  align: {
    default: 'left',
    parseHTML: (el: HTMLElement) =>
      el.style.textAlign || el.getAttribute('align') || 'left',
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.align && attrs.align !== 'left'
        ? { style: `text-align: ${attrs.align}` }
        : {},
  },
}

export const CeldaAlineada = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...atributoAlign }
  },
})

export const CabeceraAlineada = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...atributoAlign }
  },
})

// Aplica `align` al ámbito pedido de la tabla que contiene el cursor.
// Devuelve false si el cursor no está dentro de una tabla.
export function alinearTabla(
  editor: Editor,
  ambito: AmbitoAlineacion,
  align: Alineacion,
): boolean {
  const { state, view } = editor
  const $celda = cellAround(state.selection.$from)
  if (!$celda) return false

  // Nodo tabla y su posición absoluta (la celda vive en tabla > fila > celda).
  const profundidadTabla = $celda.depth - 1
  const tabla = $celda.node(profundidadTabla)
  const inicioTabla = $celda.start(profundidadTabla)
  const mapa = TableMap.get(tabla)

  const posCelda = $celda.pos - inicioTabla
  const indice = mapa.map.indexOf(posCelda)
  if (indice < 0) return false
  const fila = Math.floor(indice / mapa.width)
  const columna = indice % mapa.width

  const rect =
    ambito === 'tabla'
      ? { left: 0, top: 0, right: mapa.width, bottom: mapa.height }
      : ambito === 'fila'
        ? { left: 0, top: fila, right: mapa.width, bottom: fila + 1 }
        : ambito === 'columna'
          ? { left: columna, top: 0, right: columna + 1, bottom: mapa.height }
          : { left: columna, top: fila, right: columna + 1, bottom: fila + 1 }

  const tr = state.tr
  // Un mismo pos puede repetirse (celdas con colspan): aplicar una sola vez.
  const vistos = new Set<number>()
  for (const pos of mapa.cellsInRect(rect)) {
    if (vistos.has(pos)) continue
    vistos.add(pos)
    const celda = tabla.nodeAt(pos)
    if (celda) {
      tr.setNodeMarkup(inicioTabla + pos, undefined, { ...celda.attrs, align })
    }
  }
  view.dispatch(tr)
  return true
}

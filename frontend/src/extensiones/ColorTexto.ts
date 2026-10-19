/**
 * COLOR DE TEXTO (2026-10-19, paridad con la «A» de Google Docs): una marca con el color del tramo,
 * elegido de la paleta de la identidad (vino, dorado, grises y los de apoyo), nunca libre. Sale al
 * PDF (`\textcolor[HTML]{…}`, xcolor ya va en el núcleo del marco) y al Word (`font.color`). Solo se
 * reconoce lo que el propio editor escribe (`span[data-color]`): el color que trae un pegado de Word
 * se ignora, como todo estilo ajeno, para que el documento siga limpio.
 */
import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    colorTexto: {
      /** Pone el color (hex de 6 dígitos sin «#») o lo quita con `null`. */
      ponerColorTexto: (color: string | null) => ReturnType
    }
  }
}

export const HEX_COLOR = /^[0-9A-Fa-f]{6}$/

/** Los colores que se ofrecen (clave hex sin «#»; todos de la identidad o de apoyo). */
export const COLORES_TEXTO: { hex: string; nombre: string }[] = [
  { hex: '241F1C', nombre: 'Texto' },
  { hex: '524B45', nombre: 'Gris oscuro' },
  { hex: '6E655D', nombre: 'Gris' },
  { hex: '4E0A18', nombre: 'Vino' },
  { hex: 'A6122E', nombre: 'Rojo' },
  { hex: '83600D', nombre: 'Dorado' },
  { hex: '2F5DA8', nombre: 'Azul' },
  { hex: '2E7D4F', nombre: 'Verde' },
]

export const ColorTexto = Mark.create({
  name: 'colorTexto',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = (el.getAttribute('data-color') ?? '').replace(/^#/, '')
          return HEX_COLOR.test(v) ? v.toUpperCase() : null
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const v = String(attrs.color ?? '')
          return HEX_COLOR.test(v) ? { 'data-color': v, style: `color: #${v}` } : {}
        },
      },
    }
  },
  parseHTML() { return [{ tag: 'span[data-color]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0] },
  addCommands() {
    return {
      ponerColorTexto: (color) => ({ commands }) => {
        const v = (color ?? '').replace(/^#/, '').toUpperCase()
        return HEX_COLOR.test(v) ? commands.setMark(this.name, { color: v }) : commands.unsetMark(this.name)
      },
    }
  },
})

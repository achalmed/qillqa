/**
 * RESALTADO (2026-10-19, paridad con el marcador de Google Docs): una marca para llamar la atención
 * sobre un tramo mientras se revisa. Es una AYUDA DE REVISIÓN: el PDF oficial no la imprime (el
 * serializador ignora las marcas que no conoce, y un documento oficial no lleva resaltados), y al
 * exportar a Word tampoco viaja. Color: el velo dorado de la identidad, nunca un amarillo.
 */
import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resaltado: {
      toggleResaltado: () => ReturnType
    }
  }
}

export const Resaltado = Mark.create({
  name: 'resaltado',
  parseHTML() { return [{ tag: 'mark[data-resaltado]' }] },
  renderHTML({ HTMLAttributes }) { return ['mark', mergeAttributes(HTMLAttributes, { 'data-resaltado': '' }), 0] },
  addCommands() {
    return { toggleResaltado: () => ({ commands }) => commands.toggleMark(this.name) }
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleResaltado() }
  },
})

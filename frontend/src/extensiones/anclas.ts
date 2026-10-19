/**
 * COMENTARIOS ANCLADOS — parte pura (2026-10-19): dónde está cada ancla en el JSON del editor
 * (posiciones de ProseMirror, como en `cambios.ts`) y el tramo citado, para que el panel muestre
 * «"…"» y pueda llevar al texto. Pruebas: pruebas/anclas.test.ts.
 */
interface Nodo { type?: string; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Nodo[] }

export interface Ancla { id: number; de: number; a: number; texto: string }

/** Las anclas del documento, por id, en orden de aparición; los tramos vecinos del mismo id se funden. */
export function anclasDe(doc: Nodo | null | undefined): Ancla[] {
  const salida: Ancla[] = []
  const recorrer = (n: Nodo, pos: number): number => {
    if (n.type === 'text') {
      const texto = n.text ?? ''
      const m = n.marks?.find((x) => x.type === 'comentario')
      const id = Number(m?.attrs?.id ?? 0) || 0
      if (id) {
        const previo = salida.find((x) => x.id === id && x.a === pos)
        if (previo) { previo.a = pos + texto.length; previo.texto += texto } else salida.push({ id, de: pos, a: pos + texto.length, texto })
      }
      return pos + texto.length
    }
    if (!n.content) return pos + 1
    let p = pos + (n.type === 'doc' ? 0 : 1)
    for (const h of n.content) p = recorrer(h, p)
    return p + (n.type === 'doc' ? 0 : 1)
  }
  if (doc) recorrer(doc, 0)
  return salida
}

/** El tramo citado de un comentario (recortado para el panel), o '' si no está anclado. */
export function citaDe(anclas: Ancla[], id: number, maximo = 90): string {
  const a = anclas.find((x) => x.id === id)
  if (!a) return ''
  const t = a.texto.replace(/\s+/g, ' ').trim()
  return t.length > maximo ? `${t.slice(0, maximo - 1)}…` : t
}

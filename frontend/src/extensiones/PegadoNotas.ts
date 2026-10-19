// PegadoNotas — las notas al pie de un texto PEGADO desde Word, LibreOffice o
// Google Docs llegan como notas del editor (2026-10-05).
//
// Antes se perdían: el portapapeles trae la llamada como un enlace («[1]») y
// el texto de la nota al final, y el editor no conocía ninguno de los dos. Aquí
// se emparejan llamada y nota por sus anclas mutuas (`#_ftn1` ↔ `#_ftnref1` en
// Word, `#sdfootnote1sym` ↔ `#sdfootnote1anc` en LibreOffice, `#ftnt1` ↔
// `#ftnt_ref1` en Google Docs), la llamada se cambia por el nodo `footnote`
// (NotaAlPie: `sup[data-footnote]` con el texto en `data-texto`) y la lista de
// notas del final se quita. Solo corre en el navegador, al pegar.
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Fragment, Slice } from '@tiptap/pm/model'
import { huboCambios, ordenarTextoWord, type Nodo } from './ordenarWord.ts'

const ancla = (el: Element) => el.getAttribute('name') || el.id || ''

/** HTML del portapapeles → el mismo HTML con las notas convertidas (exportada para probarla). */
export function notasDelPortapapeles(html: string): string {
  if (!/ftn|footnote|ftnt/i.test(html)) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const enlaces = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
  const porAncla = new Map(enlaces.filter((a) => ancla(a)).map((a) => [ancla(a), a]))
  const cuerpos = new Set<Element>()
  let n = 0
  for (const llamada of enlaces) {
    const destino = porAncla.get((llamada.getAttribute('href') || '').slice(1))
    // Par mutuo, y la llamada es la que va ANTES en el documento (las notas van al final).
    if (!destino || destino === llamada || destino.getAttribute('href') !== `#${ancla(llamada)}`) continue
    if (!(llamada.compareDocumentPosition(destino) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
    const parrafo = destino.closest('p') ?? destino.parentElement
    if (!parrafo) continue
    // El cuerpo de la nota: el contenedor propio de Word (div#ftn1) o de LibreOffice
    // (div#sdfootnote1); si no, el párrafo, o su div solo si ese div no tiene otra nota
    // (antes se tomaba cualquier padre de hasta 3 hijos y podía llevarse texto ajeno).
    const padre = parrafo.parentElement
    const contenedor = destino.closest('div[id^="ftn"]:not([style*="footnote-list"]), div[id^="sdfootnote"]')
      ?? (padre && padre !== doc.body && padre.tagName === 'DIV' && padre.querySelectorAll('a[href^="#"]').length === 1 ? padre : parrafo)
    const etiqueta = destino.textContent ?? ''
    const texto = (contenedor.textContent ?? '').replace(etiqueta, '').replace(/\s+/g, ' ').trim()
    if (!texto) continue
    const nota = doc.createElement('sup')
    nota.setAttribute('data-footnote', '')
    nota.setAttribute('data-texto', texto)
    nota.textContent = '†'
    const envoltura = llamada.parentElement?.tagName === 'SUP' && llamada.parentElement.childNodes.length === 1 ? llamada.parentElement : llamada
    envoltura.replaceWith(nota)
    cuerpos.add(contenedor)
    n += 1
  }
  if (!n) return html
  cuerpos.forEach((c) => c.remove())
  // Restos de la lista de notas de Word: el filete, el salto «br clear=all» y el contenedor vacío.
  doc.querySelectorAll('div[style*="footnote-list"], hr, br[clear]').forEach((e) => { if (!(e.textContent ?? '').trim()) e.remove() })
  return doc.body.innerHTML
}

// ¿Viene de un procesador de textos? (Word, LibreOffice, Google Docs).
const DE_OFIMATICA = /urn:schemas-microsoft-com|mso-|class="?Mso|sdfootnote|docs-internal-guid|LibreOffice|OpenOffice/i

export const PegadoNotas = Extension.create({
  name: 'pegadoNotas',
  addProseMirrorPlugins() {
    // Lo pegado de Word se ORDENA además (2026-10-06, ordenarWord.ts): las
    // listas escritas, los vacíos, los subtítulos y las notas que llegaron
    // como «[1]» (Word sin anclas). La marca va de transformPastedHTML a
    // transformPasted, que corren seguidos en el mismo pegado.
    let deOfimatica = false
    return [new Plugin({
      key: new PluginKey('pegadoNotas'),
      props: {
        transformPastedHTML: (html) => {
          deOfimatica = DE_OFIMATICA.test(html)
          return notasDelPortapapeles(html)
        },
        transformPasted: (slice, view) => {
          if (!deOfimatica) return slice
          deOfimatica = false
          // Solo un pegado de varios bloques (un trozo de frase se pega tal cual).
          if (slice.content.childCount < 2) return slice
          try {
            const { doc, informe } = ordenarTextoWord({ type: 'doc', content: slice.content.toJSON() as Nodo[] })
            if (!huboCambios(informe)) return slice
            // Bloques enteros: la porción pegada queda cerrada.
            return new Slice(Fragment.fromJSON(view.state.schema, doc.content), 0, 0)
          } catch {
            return slice
          }
        },
      },
    })]
  },
})

// ordenarWord — pone en orden un texto que llegó de Word (2026-10-06).
//
// Lo aprendido del trabajo del asesor en los proyectos de ley (5 proyectos
// pegados desde Word el 2026-10-05): el texto llega, pero sin su estructura.
//   · Las notas al pie quedan como «[1]» en el texto y su contenido como
//     párrafos «[1] Google. (s.f.)…» al final (cuando el portapapeles no trae
//     las anclas que reconoce PegadoNotas).
//   · Las listas de Word llegan como párrafos con el número o la viñeta
//     escritos y una tira de espacios («1.            Dotar de…», «•       MTC»).
//   · Los párrafos vacíos que en Word separaban (83 en una sola parte).
//   · Los subtítulos numerados («II.1. Estado técnico de la vía») quedan como
//     párrafos comunes, y los títulos con espacios de relleno («I.      Planteamiento»).
//   · La fuente de un cuadro («Fuente: …») queda como párrafo suelto.
//   · Las fotografías no viajan: queda el rótulo «FOTOGRAFÍA — N° 1» sin imagen.
// Esta función recibe el JSON del editor y devuelve el mismo texto con esa
// estructura reconocida, y un informe de lo que hizo. Es pura (sin editor ni
// navegador): la usan el pegado (PegadoNotas) y el botón «Ordenar texto de
// Word» de la barra, y se prueba con `node --test`.

export interface Nodo {
  type: string
  attrs?: Record<string, unknown>
  content?: Nodo[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export interface Informe {
  notas: number
  vacios: number
  listas: number
  subtitulos: number
  espacios: number
  fuentes: number
  /** Rótulos «FOTOGRAFÍA N° n» que quedaron sin su imagen. */
  fotosSinImagen: number
}

const vacio = (): Informe => ({ notas: 0, vacios: 0, listas: 0, subtitulos: 0, espacios: 0, fuentes: 0, fotosSinImagen: 0 })

/** ¿Cambió algo? */
export const huboCambios = (i: Informe) => i.notas + i.vacios + i.listas + i.subtitulos + i.espacios + i.fuentes > 0

/** Texto plano de un nodo (las notas al pie no cuentan). */
export function textoDe(n: Nodo): string {
  if (n.type === 'text') return n.text ?? ''
  if (n.type === 'hardBreak') return '\n'
  return (n.content ?? []).map(textoDe).join('')
}

const ESPACIO = '[ \\t\\u00a0]'
// Nota al final: «[3] Texto» o «[3]Texto».
const RE_NOTA = /^\s*\[(\d{1,3})\]\s*([\s\S]+)$/
// Llamada en el texto: «…Saurama[1] (ruta…».
const RE_LLAMADA = /\[(\d{1,3})\]/g
// Word sin anclas también trae la nota con su número VOLADO: «¹ Texto» (dígitos superíndice de
// Unicode) o un «1» con la marca de superíndice; y la llamada igual («Saurama¹», «Saurama<sup>1</sup>»).
const VOLADOS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const RE_NOTA_VOLADA = /^\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})\s*([\s\S]+)$/
// Tras una palabra de tres letras o más, o un signo de cierre: «m²», «km²» y «cm³» son unidades.
const RE_LLAMADA_VOLADA = /(?<=\p{L}{3}|[)\].,;:»"”’])([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})(?![⁰¹²³⁴⁵⁶⁷⁸⁹])/gu
const numeroVolado = (t: string) => Number([...t].map((c) => VOLADOS.indexOf(c)).join(''))
const esSup = (c: Nodo) => (c.marks ?? []).some((m) => m.type === 'superscript')

/** Cómo marca Word las notas de este pegado: «[1]», «¹» o un «1» en superíndice. */
type Forma = 'corchete' | 'volado' | 'sup'

/** El número y el texto de una nota del final, y su forma; null si el párrafo no es una nota. */
function leerNota(b: Nodo): { num: number; texto: string; forma: Forma } | null {
  const t = textoDe(b).replace(/\s+/g, ' ').trim()
  let m = RE_NOTA.exec(t)
  if (m) return { num: Number(m[1]), texto: m[2].trim(), forma: 'corchete' }
  m = RE_NOTA_VOLADA.exec(t)
  if (m) return { num: numeroVolado(m[1]), texto: m[2].trim(), forma: 'volado' }
  const primero = (b.content ?? []).find((c) => c.type === 'text' && (c.text ?? '').trim())
  const s = primero && esSup(primero) ? /^\s*(\d{1,3})\s*$/.exec(primero.text ?? '') : null
  if (s) {
    const resto = t.replace(/^\s*\d{1,3}\s*/, '').trim()
    if (resto) return { num: Number(s[1]), texto: resto, forma: 'sup' }
  }
  return null
}
// Viñeta o número de una lista de Word: la marca y DOS o más espacios (o un
// tabulador). Un «1. Texto» con un solo espacio se deja como está: puede ser
// prosa («1. Proyecto…» escrito a mano) y no hay cómo saberlo.
const RE_VINETA = new RegExp(`^${ESPACIO}*[•·▪◦‣○■□➢✓-]${ESPACIO}*(?:\\t|${ESPACIO}{2,})`)
const RE_NUMERO = new RegExp(`^${ESPACIO}*(\\d{1,3}|[a-z])([.)])(?:\\t|${ESPACIO}{2,})`)
// Subtítulo numerado: «II.1. Estado…», «2.3 Costos», «V.1. Origen…».
const RE_SUBTITULO = /^\s*(?:[IVXLC]+\.\d+(?:\.\d+)*|\d+\.\d+(?:\.\d+)*)\.?\s+\S/
const RE_FOTO = /^\s*FOTOGRAF[ÍI]A\b/i
const RE_FUENTE = /^\s*Fuentes?\s*:\s*/i

const esVacio = (n: Nodo) =>
  n.type === 'paragraph' && !(n.content ?? []).some((c) => c.type !== 'text' && c.type !== 'hardBreak') && !textoDe(n).replace(/[\s ]/g, '')

// --- notas al pie ------------------------------------------------------------

/** Separa las notas «[n] texto» (o «¹ texto», o con el número en superíndice) del final. */
function notasDelFinal(bloques: Nodo[]): { notas: Map<number, string>; desde: number; forma: Forma } {
  const notas = new Map<number, string>()
  let forma: Forma = 'corchete'
  // Hacia atrás: solo párrafos (notas, su continuación o vacíos) y un filete.
  let i = bloques.length
  while (i > 0 && (bloques[i - 1].type === 'paragraph' || bloques[i - 1].type === 'horizontalRule')) i -= 1
  // El bloque de notas empieza en la primera nota de ese tramo.
  let desde = -1
  for (let k = i; k < bloques.length; k += 1) {
    const nota = bloques[k].type === 'paragraph' ? leerNota(bloques[k]) : null
    // La primera nota del bloque es la 1 (o la que sigue a otra): un «1. Texto» suelto no basta.
    if (nota && (nota.num === 1 || nota.forma === 'corchete')) { desde = k; forma = nota.forma; break }
  }
  if (desde < 0) return { notas, desde: bloques.length, forma }
  let actual = 0
  for (let k = desde; k < bloques.length; k += 1) {
    const b = bloques[k]
    if (b.type !== 'paragraph' || esVacio(b)) continue
    const t = textoDe(b).replace(/\s+/g, ' ').trim()
    const m = leerNota(b)
    if (m && m.forma === forma) {
      actual = m.num
      notas.set(actual, m.texto)
    } else if (actual) {
      // Nota de varios párrafos: el resto va con la anterior.
      notas.set(actual, `${notas.get(actual)} ${t}`)
    }
  }
  // El filete que Word pone antes de las notas también sobra.
  while (desde > 0 && (bloques[desde - 1].type === 'horizontalRule' || esVacio(bloques[desde - 1]))) desde -= 1
  return { notas, desde, forma }
}

/** Cambia cada llamada del texto («[n]», «ⁿ» o un «n» en superíndice, según la forma) por la nota n. */
function ponerNotas(n: Nodo, notas: Map<number, string>, usadas: Set<number>, forma: Forma = 'corchete'): Nodo {
  if (n.type === 'text') return n
  if (!n.content) return n
  const content: Nodo[] = []
  const re = forma === 'volado' ? RE_LLAMADA_VOLADA : RE_LLAMADA
  for (const c of n.content) {
    // Superíndice: el nodo de texto entero es la llamada.
    if (forma === 'sup' && c.type === 'text' && esSup(c) && /^\s*\d{1,3}\s*$/.test(c.text ?? '')) {
      const num = Number((c.text ?? '').trim())
      const texto = notas.get(num)
      if (texto) {
        content.push({ type: 'footnote', attrs: { texto } })
        usadas.add(num)
        continue
      }
    }
    re.lastIndex = 0
    if (forma === 'sup' || c.type !== 'text' || !c.text || !re.test(c.text)) {
      content.push(ponerNotas(c, notas, usadas, forma))
      continue
    }
    re.lastIndex = 0
    let ultimo = 0
    for (const m of c.text.matchAll(re)) {
      const num = forma === 'volado' ? numeroVolado(m[1]) : Number(m[1])
      const texto = notas.get(num)
      if (!texto) continue
      const antes = c.text.slice(ultimo, m.index)
      if (antes) content.push({ ...c, text: antes })
      content.push({ type: 'footnote', attrs: { texto } })
      usadas.add(num)
      ultimo = (m.index ?? 0) + m[0].length
    }
    const resto = c.text.slice(ultimo)
    if (resto) content.push({ ...c, text: resto })
  }
  return { ...n, content }
}

// --- espacios ----------------------------------------------------------------

/** Tabuladores y tiras de espacios → un espacio; sin espacios al inicio del párrafo. */
function limpiarEspacios(n: Nodo, informe: Informe): Nodo {
  if (!n.content) return n
  if (n.type === 'paragraph' || n.type === 'heading') {
    const content = n.content.map((c, i) => {
      if (c.type !== 'text' || !c.text) return c
      let t = c.text.replace(/[\t  ]{2,}|\t/g, ' ')
      if (i === 0) t = t.replace(/^[\s ]+/, '')
      if (t !== c.text) informe.espacios += 1
      return { ...c, text: t }
    }).filter((c) => c.type !== 'text' || c.text)
    return { ...n, content }
  }
  return { ...n, content: n.content.map((c) => limpiarEspacios(c, informe)) }
}

/** Quita la marca de lista escrita («1.   », «•   ») del inicio del párrafo. */
function sinMarca(p: Nodo, re: RegExp): Nodo {
  const content = [...(p.content ?? [])]
  // La marca puede venir partida en varios trozos de texto (con o sin negrita).
  let quitar = (re.exec(textoDe(p))?.[0] ?? '').length
  while (quitar > 0 && content.length) {
    const c = content[0]
    if (c.type !== 'text' || !c.text) break
    if (c.text.length <= quitar) {
      quitar -= c.text.length
      content.shift()
    } else {
      content[0] = { ...c, text: c.text.slice(quitar) }
      quitar = 0
    }
  }
  return { ...p, content }
}

// --- documento ---------------------------------------------------------------

/** Ordena los bloques de un nivel (el documento, una celda, un elemento de lista). */
function ordenarBloques(bloques: Nodo[], informe: Informe, raiz: boolean): Nodo[] {
  const salida: Nodo[] = []
  for (let i = 0; i < bloques.length; i += 1) {
    const b = bloques[i]
    // Párrafo vacío: era el espaciado de Word. Debajo, el rótulo de una foto
    // que no llegó (la imagen deja justamente un párrafo vacío).
    if (esVacio(b)) {
      informe.vacios += 1
      continue
    }
    if (b.type !== 'paragraph') {
      // Tablas y listas: ordenar por dentro (celdas, elementos).
      if (b.content && b.type !== 'heading') {
        salida.push({ ...b, content: b.content.map((c) => (c.content && c.type !== 'paragraph' && c.type !== 'heading' ? { ...c, content: ordenarBloques(c.content, informe, false) } : c)) })
      } else {
        salida.push(b)
      }
      continue
    }
    const t = textoDe(b)
    // Lista de Word: párrafos seguidos con la misma clase de marca.
    const vineta = RE_VINETA.test(t)
    const numero = RE_NUMERO.exec(t)
    if (raiz && (vineta || numero)) {
      const re = vineta ? RE_VINETA : RE_NUMERO
      const letra = numero && /[a-z]/.test(numero[1])
      const items: Nodo[] = []
      let j = i
      while (j < bloques.length) {
        const x = bloques[j]
        if (esVacio(x)) {
          // Un vacío entre elementos no corta la lista.
          const sig = bloques.slice(j + 1).find((y) => !esVacio(y))
          if (sig && sig.type === 'paragraph' && re.test(textoDe(sig))) { informe.vacios += 1; j += 1; continue }
          break
        }
        if (x.type !== 'paragraph' || !re.test(textoDe(x))) break
        if (!vineta) {
          const m = RE_NUMERO.exec(textoDe(x))
          if (!m || /[a-z]/.test(m[1]) !== Boolean(letra)) break
        }
        const limpio = sinMarca(x, re)
        items.push({ type: 'listItem', content: [{ ...limpio, attrs: { ...(limpio.attrs ?? {}), sangriaTipo: undefined } }] })
        j += 1
      }
      if (items.length) {
        informe.listas += 1
        if (vineta) {
          salida.push({ type: 'bulletList', content: items })
        } else {
          const inicio = letra ? numero![1].charCodeAt(0) - 96 : Number(numero![1])
          const attrs: Record<string, unknown> = { start: inicio }
          if (letra) attrs.type = 'a'
          salida.push({ type: 'orderedList', attrs, content: items })
        }
        i = j - 1
        continue
      }
    }
    // Subtítulo numerado corto, sin punto final: título de nivel 3.
    const plano = t.replace(/\s+/g, ' ').trim()
    if (raiz && RE_SUBTITULO.test(plano) && plano.length <= 140 && !/[.;,]$/.test(plano)) {
      informe.subtitulos += 1
      salida.push({ type: 'heading', attrs: { level: 3, textAlign: (b.attrs?.textAlign as string) ?? 'justify' }, content: b.content })
      continue
    }
    // «Fuente: …» justo debajo de un cuadro: pasa a ser la fuente del cuadro.
    const previo = salida[salida.length - 1]
    if (RE_FUENTE.test(plano) && previo?.type === 'table' && !previo.attrs?.fuente) {
      informe.fuentes += 1
      salida[salida.length - 1] = { ...previo, attrs: { ...(previo.attrs ?? {}), fuente: plano.replace(RE_FUENTE, '') } }
      continue
    }
    if (RE_FOTO.test(plano) && plano.length <= 60 && previo?.type !== 'fotografia') informe.fotosSinImagen += 1
    salida.push(b)
  }
  return salida
}

/** El documento de Word, ordenado, y lo que se hizo. */
export function ordenarTextoWord(doc: Nodo): { doc: Nodo; informe: Informe } {
  const informe = vacio()
  let bloques = doc.content ?? []
  // 1. Notas al pie: primero, porque el bloque de notas es el final del texto.
  const { notas, desde, forma } = notasDelFinal(bloques)
  if (notas.size) {
    const usadas = new Set<number>()
    const cuerpo = bloques.slice(0, desde).map((b) => ponerNotas(b, notas, usadas, forma))
    if (usadas.size) {
      informe.notas = usadas.size
      // Las notas que no tenían llamada en el texto se quedan como estaban.
      const sobrantes = bloques.slice(desde).filter((b) => {
        const m = b.type === 'paragraph' ? leerNota(b) : null
        return m && !usadas.has(m.num)
      })
      bloques = [...cuerpo, ...sobrantes]
    }
  }
  // 2. Estructura (listas, subtítulos, vacíos, fuentes) y 3. espacios.
  bloques = ordenarBloques(bloques, informe, true).map((b) => limpiarEspacios(b, informe))
  return { doc: { ...doc, content: bloques.length ? bloques : [{ type: 'paragraph' }] }, informe }
}

/** El informe en una frase, para el aviso del editor. */
export function describirInforme(i: Informe): string {
  const partes: string[] = []
  const n = (k: number, uno: string, varios: string) => { if (k) partes.push(`${k} ${k === 1 ? uno : varios}`) }
  n(i.notas, 'nota al pie', 'notas al pie')
  n(i.listas, 'lista', 'listas')
  n(i.subtitulos, 'subtítulo', 'subtítulos')
  n(i.fuentes, 'fuente de cuadro', 'fuentes de cuadro')
  n(i.vacios, 'párrafo vacío quitado', 'párrafos vacíos quitados')
  if (i.espacios && !partes.length) partes.push('espacios de relleno')
  const hecho = partes.length ? `Ordenado: ${partes.join(', ')}.` : 'El texto ya estaba en orden.'
  const fotos = i.fotosSinImagen
    ? ` ${fotos1(i.fotosSinImagen)} sin imagen: insértela${i.fotosSinImagen === 1 ? '' : 's'} con el botón «Fotografía» (o cargue el Word completo, que trae las fotos).`
    : ''
  return hecho + fotos
}
const fotos1 = (k: number) => (k === 1 ? 'Una fotografía quedó' : `${k} fotografías quedaron`)

/** ¿Parece un texto pegado de Word sin ordenar? (para ofrecer el botón). */
export function pareceWordSinOrdenar(doc: Nodo): boolean {
  const { informe } = ordenarTextoWord(doc)
  return informe.notas > 0 || informe.listas > 1 || informe.vacios > 5
}

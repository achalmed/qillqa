/**
 * ESTRUCTURA DEL PROYECTO DE LEY en el editor (Edison 2026-10-01: «las partes
 * estructurales repetitivas, obvias o predefinidas deben estar ya escritas; el
 * usuario solo completa lo específico»; «definir los niveles jerárquicos»).
 *
 * Fuente: Manual de Técnica Legislativa del Congreso, 3.ª ed., pp. 43-59.
 *   Título de la ley: «LEY [DE…]», «LEY ORGÁNICA DE…», «LEY QUE MODIFICA…»,
 *   «LEY QUE DEROGA…» (y, en la práctica, «Ley que + verbo»).
 *   Niveles de agrupación, de mayor a menor:
 *     1 LIBRO       ordinal en letras   LIBRO PRIMERO
 *     2 SECCIÓN     ordinal en letras   SECCIÓN PRIMERA
 *     3 TÍTULO      romano              TÍTULO I
 *     4 CAPÍTULO    romano              CAPÍTULO I
 *     5 SUBCAPÍTULO arábigo             SUBCAPÍTULO 1
 *     6 Artículo    arábigo + epígrafe  Artículo 1.- Objeto de la ley
 *   Disposiciones complementarias: ordinal en mayúsculas (PRIMERA., ÚNICA.).
 * En el texto: las agrupaciones son títulos de nivel 2 (centrados, como en el
 * PDF: su mención y, en el título siguiente, su denominación) y los artículos
 * y disposiciones, de nivel 3. Lo que hay que completar va [entre corchetes]:
 * el generador avisa si queda alguno (latex/proyecto_ley.py).
 *
 * Los números NO se escriben a mano: «Insertar» pone el siguiente y
 * «Renumerar» los rehace en orden (los artículos corren por toda la ley; los
 * capítulos vuelven a I en cada título, los subcapítulos a 1 en cada capítulo
 * y las secciones a PRIMERA en cada libro).
 */
import type { Editor } from '@tiptap/core'

export type Nivel = 'libro' | 'seccion' | 'titulo' | 'capitulo' | 'subcapitulo' | 'articulo' | 'disposicion'

export const NIVELES_LEY: { nivel: Nivel; texto: string; ejemplo: string; profundidad: number }[] = [
  { nivel: 'libro', texto: 'Libro', ejemplo: 'LIBRO PRIMERO', profundidad: 0 },
  { nivel: 'seccion', texto: 'Sección', ejemplo: 'SECCIÓN PRIMERA', profundidad: 1 },
  { nivel: 'titulo', texto: 'Título', ejemplo: 'TÍTULO I', profundidad: 2 },
  { nivel: 'capitulo', texto: 'Capítulo', ejemplo: 'CAPÍTULO I', profundidad: 3 },
  { nivel: 'subcapitulo', texto: 'Subcapítulo', ejemplo: 'SUBCAPÍTULO 1', profundidad: 4 },
  { nivel: 'articulo', texto: 'Artículo', ejemplo: 'Artículo 1.- Epígrafe', profundidad: 5 },
]

/** Formas del título de la ley (Manual, p. 43) y las de uso frecuente. */
export const FORMAS_TITULO = [
  { prefijo: 'Ley que modifica', ayuda: 'Cambia una norma vigente' },
  { prefijo: 'Ley que deroga', ayuda: 'Deja sin efecto una norma' },
  { prefijo: 'Ley que', ayuda: 'Crea, declara, promueve, regula… (escriba el verbo)' },
  { prefijo: 'Ley de', ayuda: 'Forma general del Manual: «Ley de fomento…»' },
  { prefijo: 'Ley Orgánica de', ayuda: 'Ley orgánica (art. 106 de la Constitución)' },
  { prefijo: 'Ley Marco de', ayuda: 'Establece el marco de una materia' },
  { prefijo: 'Ley General de', ayuda: 'Regula de forma integral una materia' },
  { prefijo: 'Ley de Reforma Constitucional que', ayuda: 'Modifica la Constitución' },
  { prefijo: 'Resolución Legislativa que', ayuda: 'Aprueba tratados, autoriza viajes…' },
]

// El rótulo pegado de Word no es parte del título (2026-10-06): espejo de
// backend/app/servicios/proyectos.py::titulo_ley.
const RUIDO_TITULO = /^(?:(?:la\s+)?(?:proposici[oó]n\s+legisl\S*|proyecto\s+de\s+ley)\s+|ley\s+que\s+(?=(?:proposici[oó]n|proyecto\s+de\s+ley|ley\s+que)(?:\s|$)))/i

/** «Ley que PROPOSICIÓN LEGISLATIVA QUE declara…» → «Ley que declara…». */
export function normalizarTitulo(titulo: string): string {
  let t = titulo.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 4; i += 1) {
    const nuevo = t.replace(RUIDO_TITULO, '')
    if (nuevo === t) break
    t = nuevo
  }
  return /^que\s/i.test(t) ? `Ley que ${t.slice(4)}` : t
}

/** Separa un título en su forma y el resto («Ley que modifica» + «la Ley 27972…»). */
export function partirTitulo(titulo: string): { prefijo: string; resto: string } {
  const t = normalizarTitulo(titulo)
  const formas = [...FORMAS_TITULO].sort((a, b) => b.prefijo.length - a.prefijo.length)
  for (const f of formas) {
    if (t.toLowerCase().startsWith(f.prefijo.toLowerCase() + ' ') || t.toLowerCase() === f.prefijo.toLowerCase()) {
      return { prefijo: f.prefijo, resto: t.slice(f.prefijo.length).trim() }
    }
  }
  return { prefijo: '', resto: t }
}

// --- numeración ---------------------------------------------------------------

const ORD_M = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO']
const ORD_F = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA']
const ORD_F_MAS = ['UNDÉCIMA', 'DUODÉCIMA', 'DECIMOTERCERA', 'DECIMOCUARTA', 'DECIMOQUINTA', 'DECIMOSEXTA', 'DECIMOSÉPTIMA', 'DECIMOCTAVA', 'DECIMONOVENA', 'VIGÉSIMA']
const ordM = (n: number) => ORD_M[n - 1] ?? String(n)
const ordF = (n: number) => (n <= 10 ? ORD_F[n - 1] : ORD_F_MAS[n - 11]) ?? String(n)
function romano(n: number): string {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let s = ''
  for (const [v, r] of t) while (n >= v) { s += r; n -= v }
  return s
}

const ORDS = `${ORD_M.join('|')}|${ORD_F.join('|')}|${ORD_F_MAS.join('|')}|SEPTIMO|SEPTIMA|DECIMO|DECIMA|[ÚU]NIC[OA]`
const RE = {
  libro: new RegExp(`^LIBRO\\s+(${ORDS}|\\d+)\\b`, 'i'),
  seccion: new RegExp(`^SECCI[ÓO]N\\s+(${ORDS}|\\d+)\\b`, 'i'),
  titulo: /^T[ÍI]TULO\s+([IVXLC]+|\d+)\b/i,
  capitulo: /^CAP[ÍI]TULO\s+([IVXLC]+|\d+)\b/i,
  subcapitulo: /^SUBCAP[ÍI]TULO\s+(\d+|[IVXLC]+)\b/i,
  articulo: /^Art[íi]culo\s+(\d+)([A-Za-z]*)/i,
  disposicion: new RegExp(`^(${ORD_F.join('|')}|${ORD_F_MAS.join('|')}|SEPTIMA|DECIMA|[ÚU]NICA)\\b`, 'i'),
}
const MENCION: Record<Exclude<Nivel, 'articulo' | 'disposicion'>, (n: number) => string> = {
  libro: (n) => `LIBRO ${ordM(n)}`,
  seccion: (n) => `SECCIÓN ${ordF(n)}`,
  titulo: (n) => `TÍTULO ${romano(n)}`,
  capitulo: (n) => `CAPÍTULO ${romano(n)}`,
  subcapitulo: (n) => `SUBCAPÍTULO ${n}`,
}
const NIVEL_DE: Nivel[] = ['libro', 'seccion', 'titulo', 'capitulo', 'subcapitulo', 'articulo', 'disposicion']

interface Marca { pos: number; nivel: Nivel; largo: number; sufijo: string }

/** Los títulos del texto que son menciones de la estructura, en orden. */
function marcas(editor: Editor): Marca[] {
  const salida: Marca[] = []
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name !== 'heading') return true
    const t = n.textContent
    for (const nivel of NIVEL_DE) {
      const m = RE[nivel].exec(t)
      if (m) {
        salida.push({ pos: pos + 1, nivel, largo: m[0].length, sufijo: nivel === 'articulo' ? m[2] ?? '' : '' })
        break
      }
    }
    return false
  })
  return salida
}

/** La mención que corresponde a cada marca, con los reinicios del Manual. */
function numerar(lista: Marca[]): string[] {
  const c = { libro: 0, seccion: 0, titulo: 0, capitulo: 0, subcapitulo: 0, articulo: 0, disposicion: 0 }
  const totalDisp = lista.filter((m) => m.nivel === 'disposicion').length
  return lista.map((m) => {
    switch (m.nivel) {
      case 'libro': c.libro++; c.seccion = 0; return MENCION.libro(c.libro)
      case 'seccion': c.seccion++; return MENCION.seccion(c.seccion)
      case 'titulo': c.titulo++; c.capitulo = 0; c.subcapitulo = 0; return MENCION.titulo(c.titulo)
      case 'capitulo': c.capitulo++; c.subcapitulo = 0; return MENCION.capitulo(c.capitulo)
      case 'subcapitulo': c.subcapitulo++; return MENCION.subcapitulo(c.subcapitulo)
      case 'articulo': c.articulo++; return `Artículo ${c.articulo}${m.sufijo}`
      case 'disposicion': c.disposicion++; return totalDisp === 1 ? 'ÚNICA' : ordF(c.disposicion)
    }
  })
}

/** Rehace todos los números en orden. Devuelve cuántos cambió. */
export function renumerar(editor: Editor): number {
  const lista = marcas(editor)
  const nuevos = numerar(lista)
  let cambios = 0
  let tr = editor.state.tr
  // De atrás hacia adelante: las posiciones anteriores no se mueven.
  for (let i = lista.length - 1; i >= 0; i--) {
    const m = lista[i]
    const actual = editor.state.doc.textBetween(m.pos, m.pos + m.largo)
    if (actual !== nuevos[i]) {
      tr = tr.insertText(nuevos[i], m.pos, m.pos + m.largo)
      cambios++
    }
  }
  if (cambios) editor.view.dispatch(tr)
  return cambios
}

const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/**
 * Inserta un nivel después del bloque donde está el cursor, con el número que
 * le toca, y renumera todo. Las agrupaciones llevan su mención y su
 * denominación; el artículo y la disposición, su epígrafe y un párrafo.
 */
export function insertar(editor: Editor, nivel: Nivel, separador = '.-'): void {
  const sep = separador.trim() || '.-'
  const bloques =
    nivel === 'articulo'
      ? [h(3, `Artículo 0${sep} [Epígrafe del artículo]`), p('[Texto del artículo]')]
      : nivel === 'disposicion'
        ? [h(3, `PRIMERA${sep} [Epígrafe de la disposición]`), p('[Texto de la disposición]')]
        : [h(2, MENCION[nivel](1)), h(2, nivel === 'subcapitulo' ? '[Denominación del subcapítulo]' : '[DENOMINACIÓN]')]
  // Se inserta al FINAL de la unidad donde está el cursor (el artículo con su
  // texto, la agrupación con su denominación): nunca entre un epígrafe y su
  // párrafo. Unidad = el bloque actual y los que siguen hasta el próximo título.
  const doc = editor.state.doc
  const { $to } = editor.state.selection
  let i = $to.depth > 0 ? $to.index(0) : doc.childCount - 1
  // Si el cursor está en la mención de una agrupación («CAPÍTULO I»), su
  // denominación (el título siguiente) es parte de la misma unidad.
  const esMencion = (k: number) => k < doc.childCount && ['libro', 'seccion', 'titulo', 'capitulo', 'subcapitulo'].some((nv) => RE[nv as Nivel].test(doc.child(k).textContent))
  if (esMencion(i) && i + 1 < doc.childCount && doc.child(i + 1).type.name === 'heading') i++
  i += 1
  while (i < doc.childCount && doc.child(i).type.name !== 'heading') i++
  let fin = 0
  for (let k = 0; k < i; k++) fin += doc.child(k).nodeSize
  editor.chain().focus().insertContentAt(fin, bloques).run()
  renumerar(editor)
  // Deja seleccionado el primer «[…]» insertado: se escribe encima.
  let desde = -1
  let hasta = -1
  editor.state.doc.nodesBetween(fin, editor.state.doc.content.size, (n, pos) => {
    if (desde >= 0 || !n.isText) return desde < 0
    const i = (n.text ?? '').indexOf('[')
    if (i >= 0) {
      desde = pos + i
      hasta = desde + ((n.text ?? '').indexOf(']', i) - i + 1)
    }
    return false
  })
  if (desde >= 0) editor.chain().focus().setTextSelection({ from: desde, to: hasta }).run()
}

/**
 * Estructura base de cada parte de la fórmula legal, para una parte vacía.
 * Lo que se completa va [entre corchetes].
 */
export function plantillaParte(clave: string, separador = '.-'): object | null {
  const sep = separador.trim() || '.-'
  const art = (n: number, epigrafe: string, texto: string) => [h(3, `Artículo ${n}${sep} ${epigrafe}`), p(texto)]
  const dsp = (ord: string, epigrafe: string, texto: string) => [h(3, `${ord}${sep} ${epigrafe}`), p(texto)]
  const doc = (content: object[]) => ({ type: 'doc', content })
  switch (clave) {
    case 'sustantiva':
      return doc([
        ...art(1, 'Objeto de la ley', 'La presente ley tiene por objeto [describa qué regula la ley].'),
        ...art(2, 'Finalidad', 'La presente ley tiene por finalidad [describa el fin que persigue].'),
        ...art(3, 'Ámbito de aplicación', 'La presente ley es de aplicación a [personas, entidades o actividades comprendidas].'),
      ])
    case 'preliminar':
      return doc([...art(1, '[Principio]', '[Enunciado del principio que inspira la ley].')])
    case 'dcf':
      return doc([
        ...dsp('PRIMERA', 'Reglamentación', 'El Poder Ejecutivo reglamenta la presente ley en un plazo máximo de [sesenta] días calendario contados desde su entrada en vigor.'),
        ...dsp('SEGUNDA', 'Financiamiento', 'La implementación de la presente ley se financia con cargo al presupuesto institucional de los pliegos involucrados, sin demandar recursos adicionales al Tesoro Público.'),
      ])
    case 'dct':
      return doc([...dsp('ÚNICA', '[Epígrafe]', '[Régimen aplicable a las situaciones en curso].')])
    case 'dcm':
      return doc([...dsp('ÚNICA', 'Modificación del artículo [N] de la Ley [número], [nombre de la ley]', 'Se modifica el artículo [N] de la Ley [número], [nombre de la ley], en los siguientes términos:'), p('«Artículo [N]. [Epígrafe]'), p('[Texto modificado]».')])
    case 'dcd':
      return doc([...dsp('ÚNICA', 'Derogación', 'Se deroga [la norma o disposición que se deja sin efecto].')])
    // --- Exposición de motivos (Manual, 3.ª ed., p. 83) ---------------------
    // Fundamentos es siempre la sección I: sus apartados van numerados (I.1…).
    // Las demás partes se numeran solas en el PDF (II, III…): sus subtítulos
    // van sin número para no chocar con esa numeración.
    case 'fundamentos':
      return doc([
        h(3, 'I.1. Identificación del problema'), p('[Qué problema público resuelve la propuesta, a quiénes afecta y con qué magnitud; cifras y fuentes].'),
        h(3, 'I.2. Situación actual'), p('[Estado actual de la situación fáctica o jurídica que se pretende regular o modificar].'),
        h(3, 'I.3. Propuesta y nuevo estado'), p('[Qué cambia la ley y cuál es la situación que genera].'),
        h(3, 'I.4. Necesidad, viabilidad y oportunidad'), p('[Por qué es necesaria una ley, por qué es viable y por qué ahora].'),
        h(3, 'I.5. Marco normativo'), p('[Constitución, leyes y normas vinculadas; tratados; jurisprudencia relevante].'),
        h(3, 'I.6. Opiniones sobre la propuesta'), p('[Opiniones solicitadas o recibidas de entidades y especialistas, cuando corresponda].'),
      ])
    case 'antecedentes':
      return doc([p('[Proyectos de ley presentados sobre la misma materia en este y en anteriores periodos: número, autor, fecha, estado y en qué se diferencian de esta propuesta]. Si no los hay: «No se registran iniciativas legislativas anteriores sobre la materia».')])
    case 'efecto':
      return doc([p('La presente propuesta [crea / modifica / complementa / deroga] [normas que afecta] y [no contraviene / se armoniza con] la Constitución Política del Perú ni el ordenamiento jurídico vigente. [Explique en qué sentido cambia la legislación nacional].')])
    case 'costo-beneficio':
      return doc([
        h(3, 'Beneficios'), p('[Quiénes se benefician y cómo: ciudadanos, Estado, sectores; de ser posible, en cifras].'),
        h(3, 'Costos'), p('[Costos para el Estado y para los particulares. Si no irroga gasto: «La presente propuesta no irroga gasto al Tesoro Público»].'),
        h(3, 'Balance'), p('[Por qué los beneficios superan a los costos].'),
      ])
    case 'agenda':
      return doc([p('La presente iniciativa se vincula con la Política de Estado [N] del Acuerdo Nacional, «[nombre de la política]», y con el tema [N] de la Agenda Legislativa del periodo anual de sesiones [AAAA-AAAA], «[tema]».')])
    case 'ambiental':
      return doc([p('[Incidencia de la propuesta en el ambiente. Si no la tiene: «La presente propuesta no tiene incidencia ambiental»].')])
    case 'conclusion':
      return doc([p('[Síntesis de por qué el Congreso debe aprobar la ley, en un párrafo].')])
    default:
      return null
  }
}

/** Partes de la fórmula legal (llevan artículos o disposiciones). */
export const PARTES_ARTICULADO = ['preliminar', 'sustantiva']
export const PARTES_DISPOSICIONES = ['dcf', 'dct', 'dcm', 'dcd']

/** ¿La parte está vacía (sin texto)? */
export const vacia = (contenido: unknown) => !JSON.stringify(contenido ?? {}).includes('"text"')

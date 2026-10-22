// consultaReferencias — la parte PURA del autocompletado de referencias (2026-10-06):
// reconocer lo que se está escribiendo («Ley 2779», «Oficio 95», «@huamanga»), el
// identificador de mapa de cada referencia y las referencias de un texto TipTap.
// Sin DOM ni TipTap: la prueban pruebas/referencias.test.ts (Node 24, sin compilar),
// por eso los imports de este archivo llevan `.ts` (no tiene ninguno).

export type TipoReferencia =
  | 'norma'
  | 'documento'
  | 'proyecto'
  | 'semana'
  | 'pedido'
  | 'persona'
  | 'institucion'
  | 'libro'
  | 'zotero'
  | 'entrada'

/** Lo que guarda el nodo `referencia` (y lo que el servidor vuelve relación). */
export interface AtributosReferencia {
  tipo: TipoReferencia
  id: string
  texto: string
  /** Referencia de una obra (la formatea Zotero; antes, la APA de un libro de Calibre): el PDF la lleva como nota al pie. */
  nota?: string
}

/** Un resultado de `GET /api/referencias/buscar`. */
export interface ResultadoReferencia extends AtributosReferencia {
  etiqueta: string
  detalle: string
  grupo: string
  puntaje: number
  url?: string
  estado?: string
}

export interface Consulta {
  /** Dónde empieza lo que se reemplaza, dentro del texto anterior al cursor. */
  inicio: number
  /** Lo que se manda al servidor (con la palabra que la disparó: «Ley N° 2779»). */
  consulta: string
  disparador: 'arroba' | 'palabra'
}

// Palabras que abren la búsqueda, con mayúscula inicial (una cita concreta: «la Ley N°
// 27795»; «conforme a ley» no la abre). Después pueden venir hasta cuatro palabras.
const PALABRAS =
  'Ley|Decreto Supremo|Decreto Legislativo|Decreto de Urgencia|Decreto|D\\.\\s?S\\.|D\\.\\s?Leg\\.|D\\.\\s?U\\.' +
  '|Resolución Legislativa|Resolución Ministerial|Resolución|Oficio Múltiple|Oficio|Memorando|Informe|Proyecto de Ley|PL'
const RE_PALABRA = new RegExp(
  `(?:^|[\\s(«"“])((?:${PALABRAS})(?:\\s?N\\.?\\s?[°º]\\.?)?\\s)((?:[^\\s\\ufffc]+\\s?){0,4})$`,
  'u',
)
const RE_ARROBA = /(?:^|[\s(«"“])@([^@\n￼]{0,40})$/u

/**
 * ¿Lo escrito justo antes del cursor pide una referencia? `antes` es el texto del
 * párrafo hasta el cursor (los nodos atómicos, como «￼»). Con «@» se busca
 * cualquier cosa; con una palabra («Ley », «Oficio N° 9»), lo de ese tipo primero.
 */
export function detectarConsulta(antes: string): Consulta | null {
  const a = RE_ARROBA.exec(antes)
  if (a) {
    const q = a[1] ?? ''
    // Dos espacios seguidos o un punto final: ya no se está buscando.
    if (/\s\s$/.test(q) || /[.;:]\s*$/.test(q)) return null
    return { inicio: antes.length - q.length - 1, consulta: `@${q}`, disparador: 'arroba' }
  }
  const p = RE_PALABRA.exec(antes)
  if (p) {
    const q = p[1] + p[2]
    // El punto de «D.S.» o «N.°» es de la palabra; uno después de ella cierra la frase.
    if (q.length > 48 || /[.;:]\s*$/.test(p[2]) || /\s\s$/.test(q)) return null
    return { inicio: antes.length - q.length, consulta: q.trimEnd(), disparador: 'palabra' }
  }
  return null
}

const PREFIJO: Record<TipoReferencia, string> = {
  documento: 'doc',
  proyecto: 'pl',
  semana: 'sr',
  pedido: 'pedido',
  persona: 'persona',
  institucion: 'inst',
  norma: 'norma',
  libro: 'libro',
  zotero: 'zotero',
  entrada: 'entrada',
}

/** El identificador del mapa de relaciones: («documento», 12) → «doc:12». */
export const nodoDe = (tipo: string, id: string | number): string | null =>
  tipo in PREFIJO ? `${PREFIJO[tipo as TipoReferencia]}:${id}` : null

type NodoJson = { type?: string; attrs?: Record<string, unknown>; content?: NodoJson[] }

/** Las referencias de un texto TipTap (JSON), sin repetir el mismo destino. */
export function referenciasDe(json: unknown): AtributosReferencia[] {
  const vistas = new Map<string, AtributosReferencia>()
  const rec = (n: NodoJson | undefined) => {
    if (!n) return
    if (n.type === 'referencia' && n.attrs) {
      const tipo = String(n.attrs.tipo ?? '') as TipoReferencia
      const id = String(n.attrs.id ?? '')
      const clave = nodoDe(tipo, id)
      if (clave && id && !vistas.has(clave)) vistas.set(clave, { tipo, id, texto: String(n.attrs.texto ?? '') })
    }
    n.content?.forEach(rec)
  }
  rec(json as NodoJson)
  return [...vistas.values()]
}

/** Los resultados agrupados en el orden en que llegan (el servidor ya los ordenó). */
export function agrupar(resultados: ResultadoReferencia[]): { grupo: string; items: { r: ResultadoReferencia; i: number }[] }[] {
  const grupos: { grupo: string; items: { r: ResultadoReferencia; i: number }[] }[] = []
  resultados.forEach((r, i) => {
    let g = grupos.find((x) => x.grupo === r.grupo)
    if (!g) {
      g = { grupo: r.grupo, items: [] }
      grupos.push(g)
    }
    g.items.push({ r, i })
  })
  return grupos
}

// Avisos entre el editor y el mapa local (misma pestaña).
/** El texto en pantalla cambió sus referencias (aún sin guardar): {foco, clave, referencias}. */
export const EVENTO_REFERENCIAS = 'qillqa:referencias'
/** Se guardó: las relaciones de `foco` cambiaron en el servidor. */
export const EVENTO_RELACIONES = 'qillqa:relaciones'

export interface DetalleReferencias {
  foco: string
  clave: string
  referencias: AtributosReferencia[]
}

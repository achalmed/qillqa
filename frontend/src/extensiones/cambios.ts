/**
 * CONTROL DE CAMBIOS — la parte pura (2026-10-19): recorre el JSON del editor y lista las sugerencias
 * (inserciones y supresiones de texto, cambios de formato y de párrafo marcados por `ControlCambios.ts`)
 * con sus posiciones, tal como las cuenta ProseMirror: entrar o salir de un nodo con hijos vale 1, un
 * nodo hoja que no es texto vale 1, el texto vale su longitud. Dos tramos vecinos del mismo tipo, autor
 * y detalle se funden en un solo cambio. Aquí viven también las reglas de FUNDIR una sugerencia de
 * formato con la que ya había en el tramo y de DESCRIBIRLA («negrita, sin cursiva, centrado»).
 * Sin ProseMirror: la prueban `pruebas/cambios.test.ts` y la lee el panel «Cambios».
 */

export type TipoCambio = 'insercion' | 'supresion' | 'formato' | 'parrafo'

export interface Cambio {
  tipo: TipoCambio
  autor: string
  /** Fecha ISO del primer tramo. */
  en: string
  de: number
  a: number
  texto: string
  /** `formato`: lo que cambia («negrita, sin cursiva»); `parrafo`: 'insercion' (párrafo dividido aquí) o
   *  'supresion' (unir con el párrafo anterior). */
  detalle?: string
}

/** Un filtro de aceptar o rechazar: solo lo de un autor, solo un tipo. */
export interface FiltroCambio { autor?: string; tipo?: TipoCambio }

/** Los formatos que el modo sugerir sigue: la marca de TipTap (o el atributo `textAlign` del párrafo). */
export type ClaveFormato = 'bold' | 'italic' | 'underline' | 'colorTexto' | 'resaltado' | 'textAlign'
export const MARCAS_SEGUIDAS: ClaveFormato[] = ['bold', 'italic', 'underline', 'colorTexto', 'resaltado']
/** Valor de un formato: puesto o quitado para las marcas sin atributos; el hex para el color (o `null`
 *  sin color); la alineación para `textAlign`. */
export type ValorFormato = boolean | string | null
export type EstadoFormato = Partial<Record<ClaveFormato, ValorFormato>>

interface Nodo { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Nodo[] }

const marcaDe = (n: Nodo, tipo: string) => n.marks?.find((m) => m.type === tipo)

/** Lee el `antes` o el `despues` guardado en la marca (JSON); lo ilegible cuenta como vacío. */
export function leerEstado(json: unknown): EstadoFormato {
  if (!json || typeof json !== 'string') return {}
  try {
    const v = JSON.parse(json) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as EstadoFormato) : {}
  } catch { return {} }
}

/**
 * Funde una sugerencia de formato nueva (`clave` pasa de `original` a `nuevo`) con la que el tramo ya
 * tenía. Pedir de nuevo lo que ya está sugerido, o volver a lo original, retira esa clave (así el
 * botón de la barra funciona como interruptor también en modo sugerir); una clave distinta se suma
 * (negrita y luego cursiva: una sola marca). Sin claves pendientes devuelve `null`: la marca se quita.
 */
export function fundirFormato(actual: { antes: unknown; despues: unknown } | null, clave: ClaveFormato, original: ValorFormato, nuevo: ValorFormato): { antes: string; despues: string } | null {
  const antes = leerEstado(actual?.antes)
  const despues = leerEstado(actual?.despues)
  if (clave in despues) {
    if (nuevo === despues[clave] || nuevo === antes[clave]) { delete antes[clave]; delete despues[clave] }
    else despues[clave] = nuevo
  } else if (nuevo !== original) {
    antes[clave] = original
    despues[clave] = nuevo
  }
  if (Object.keys(despues).length === 0) return null
  return { antes: JSON.stringify(antes), despues: JSON.stringify(despues) }
}

const NOMBRE_ALINEACION: Record<string, string> = { left: 'a la izquierda', center: 'centrado', right: 'a la derecha', justify: 'justificado' }
const NOMBRE_MARCA: Record<string, string> = { bold: 'negrita', italic: 'cursiva', underline: 'subrayado', resaltado: 'resaltado' }

/** «negrita, sin cursiva, color Rojo, centrado»; `nombresColor` traduce el hex (sin «#») a su nombre. */
export function describirFormato(despues: unknown, nombresColor: Record<string, string> = {}): string {
  const d = leerEstado(despues)
  const partes: string[] = []
  for (const [clave, valor] of Object.entries(d)) {
    if (clave === 'textAlign') partes.push(NOMBRE_ALINEACION[String(valor)] ?? String(valor))
    else if (clave === 'colorTexto') partes.push(valor ? `color ${nombresColor[String(valor).toUpperCase()] ?? `#${valor}`}` : 'sin color')
    else if (clave in NOMBRE_MARCA) partes.push(valor ? NOMBRE_MARCA[clave] : `sin ${NOMBRE_MARCA[clave]}`)
    else partes.push(String(clave))
  }
  return partes.join(', ')
}

/** Rótulo breve del cambio para el panel. */
export function etiquetaDe(c: Cambio): string {
  if (c.tipo === 'insercion') return 'Inserción'
  if (c.tipo === 'supresion') return 'Supresión'
  if (c.tipo === 'formato') return `Formato: ${c.detalle || 'sin detalle'}`
  return c.detalle === 'insercion' ? 'Párrafo dividido' : 'Párrafos unidos'
}

/** Los cambios del documento, en orden de aparición. Una supresión sobre una inserción cuenta como
 *  supresión; un tramo con texto y formato sugeridos cuenta dos veces (uno por cada cosa). */
export function cambiosDe(doc: Nodo | null | undefined, nombresColor: Record<string, string> = {}): Cambio[] {
  const salida: Cambio[] = []
  const anotar = (tipo: TipoCambio, autor: string, en: string, de: number, a: number, texto: string, detalle?: string) => {
    const vecino = salida.find((x) => x.tipo === tipo && x.autor === autor && x.detalle === detalle && x.a === de)
    if (vecino) { vecino.a = a; vecino.texto += texto } else salida.push({ tipo, autor, en, de, a, texto, ...(detalle !== undefined ? { detalle } : {}) })
  }
  const recorrer = (n: Nodo, pos: number): number => {
    if (n.type === 'text') {
      const texto = n.text ?? ''
      const sup = marcaDe(n, 'supresion')
      const ins = marcaDe(n, 'insercion')
      const marca = sup ?? ins
      if (marca) anotar(sup ? 'supresion' : 'insercion', String(marca.attrs?.autor ?? ''), String(marca.attrs?.en ?? ''), pos, pos + texto.length, texto)
      const fmt = marcaDe(n, 'cambioFormato')
      if (fmt) anotar('formato', String(fmt.attrs?.autor ?? ''), String(fmt.attrs?.en ?? ''), pos, pos + texto.length, texto, describirFormato(fmt.attrs?.despues, nombresColor))
      return pos + texto.length
    }
    if (!n.content) return pos + 1          // hoja que no es texto (nota al pie, salto, foto)
    const indice = salida.length
    let p = pos + (n.type === 'doc' ? 0 : 1)
    for (const h of n.content) p = recorrer(h, p)
    const fin = p + (n.type === 'doc' ? 0 : 1)
    const cambio = n.type === 'paragraph' ? n.attrs?.cambio : null
    if (cambio === 'insercion' || cambio === 'supresion') {
      salida.splice(indice, 0, { tipo: 'parrafo', autor: String(n.attrs?.cambioAutor ?? ''), en: String(n.attrs?.cambioEn ?? ''), de: pos, a: fin, texto: textoDe(n).slice(0, 80), detalle: cambio })
    }
    return fin
  }
  if (doc) recorrer(doc, 0)
  return salida
}

const textoDe = (n: Nodo): string => (n.type === 'text' ? n.text ?? '' : (n.content ?? []).map(textoDe).join(''))

/** Cuántas sugerencias hay (para el botón de la barra). */
export const contarCambios = (doc: Nodo | null | undefined): number => cambiosDe(doc).length

/** Los autores con cambios pendientes, sin repetir. */
export const autoresDe = (cambios: Cambio[]): string[] => [...new Set(cambios.map((c) => c.autor).filter(Boolean))]

/** Los cambios de un autor (`null`: todos). */
export const filtrarPorAutor = (cambios: Cambio[], autor: string | null): Cambio[] => (autor === null ? cambios : cambios.filter((c) => c.autor === autor))

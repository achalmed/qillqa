/**
 * FORMATO WORD — lógica pura del espacio de trabajo (2026-10-19; fase 2 de docs/plataforma/formato-word.md).
 *
 * El espacio reúne varios documentos reales (borradores con su registro y su número) en una sola
 * página desplazable: cada uno se muestra como una página simulada al ancho del PDF, con los campos
 * del formulario escritos en su sitio (lugar y fecha, destinatario, asunto…) y el cuerpo del editor
 * debajo. No hay una segunda composición: el PDF sigue siendo el de LuaLaTeX; la página solo ordena
 * lo mismo que el formulario como lo verá impreso. Aquí viven las reglas sin React: qué campos van
 * arriba y cuáles al cierre, los márgenes en píxeles, las marcas de la regla y los estilos de párrafo.
 * Pruebas: frontend/pruebas/word.test.ts.
 */
import type { CampoEsquema } from '../FormularioCampos'

/** Píxeles por centímetro en pantalla (CSS: 96 ppp). */
export const PX_POR_CM = 96 / 2.54
/** Ancho y alto de la hoja A4, en cm. */
export const A4 = { ancho: 21, alto: 29.7 }
/** Margen lateral del marco cuando el documento no fija otro (`fmt_margenes` vacío). */
export const MARGEN_DEFECTO_CM = 2.54

/** Los márgenes laterales del documento, en cm, desde su campo `fmt_margenes` («2», «2.54»…). */
export function margenCm(campos: Record<string, string> | undefined | null): number {
  const v = Number(String(campos?.fmt_margenes ?? '').replace(',', '.').replace(/[^0-9.]/g, ''))
  return Number.isFinite(v) && v >= 1 && v <= 4 ? v : MARGEN_DEFECTO_CM
}

/** La página en píxeles: ancho total y relleno lateral, reducidos a `escala` (1 = tamaño real). */
export function paginaPx(campos: Record<string, string> | undefined | null, escala = 1): { ancho: number; margen: number } {
  return { ancho: Math.round(A4.ancho * PX_POR_CM * escala), margen: Math.round(margenCm(campos) * PX_POR_CM * escala) }
}

/** La escala que deja la hoja entera en un contenedor de `anchoDisponible` px (nunca más de 1). */
export const escalaPara = (anchoDisponible: number): number => Math.min(1, Math.max(0.3, anchoDisponible / (A4.ancho * PX_POR_CM)))

/** Las marcas de la regla: una por centímetro, con la posición en px y si cae dentro del margen. */
export function marcasRegla(campos: Record<string, string> | undefined | null, escala = 1): { cm: number; x: number; margen: boolean }[] {
  const m = margenCm(campos)
  const salida: { cm: number; x: number; margen: boolean }[] = []
  for (let cm = 0; cm <= A4.ancho; cm += 1) salida.push({ cm, x: Math.round(cm * PX_POR_CM * escala), margen: cm < m || cm > A4.ancho - m })
  return salida
}

/** Campos del formulario que la página NO escribe en línea: formato, anexos (van en su editor) y ocultos. */
const NO_EN_PAGINA = /^(fmt_|anexos$|anexo_cuerpo$|anexo_titulo$)/

/** Orden del encabezado de los tipos con destinatario (oficio, carta, memorando…). Lo que el esquema no tiene, se omite. */
const ENCABEZADO = ['destinatario_tratamiento', 'destinatario_nombre', 'destinatario_cargo', 'destinatario_institucion', 'destinatario', 'de', 'para', 'asunto', 'sumilla', 'sumilla_solicito', 'referencia', 'organo']
/** Lo que va después del cuerpo. */
const CIERRE = ['anexo', 'con_copia', 'iniciales']
/** Lo que la página escribe en la primera línea («Lima, 18 de octubre de 2026»). */
const LUGAR_FECHA = ['lugar', 'fecha']

export interface DisposicionPagina {
  lugarFecha: CampoEsquema[]
  encabezado: CampoEsquema[]
  cierre: CampoEsquema[]
  /** Lo demás del esquema (tipos sin plantilla conocida): antes del cuerpo, con su etiqueta. */
  otros: CampoEsquema[]
}

/** Reparte los campos del esquema del tipo en las zonas de la página, sin inventar ninguno. Pura. */
export function disposicion(esquema: CampoEsquema[] | undefined | null): DisposicionPagina {
  // Lo que la página escribe en su sitio se muestra aunque el formulario lo marque «oculto» o lo
  // pinte en otra sección (el tratamiento y el cargo los cubre allí el widget de destinatarios; la
  // línea «Adj.» va en Anexos): en la hoja cada uno tiene su línea. Lo demás oculto no se inventa.
  const conSitio = new Set([...LUGAR_FECHA, ...ENCABEZADO, ...CIERRE])
  const visibles = (esquema ?? []).filter((c) => !NO_EN_PAGINA.test(c.clave) && (conSitio.has(c.clave) || (c.tipo !== 'oculto' && !(c as { seccion?: string }).seccion)))
  const por = (lista: string[]) => lista.map((k) => visibles.find((c) => c.clave === k)).filter((c): c is CampoEsquema => Boolean(c))
  const lugarFecha = por(LUGAR_FECHA)
  const encabezado = por(ENCABEZADO)
  const cierre = por(CIERRE)
  const usados = new Set([...lugarFecha, ...encabezado, ...cierre].map((c) => c.clave))
  return { lugarFecha, encabezado, cierre, otros: visibles.filter((c) => !usados.has(c.clave)) }
}

/** «Oficio 2 de 3»: el rótulo del salto entre secciones. */
export const rotuloSeccion = (tipoNombre: string, indice: number, total: number): string => `${tipoNombre || 'Documento'} ${indice + 1} de ${total}`

/** Lo que la lista de estructura muestra de un documento: el asunto o, sin él, el destinatario o «Sin asunto». */
export function tituloSeccion(campos: Record<string, string> | undefined | null): string {
  const c = campos ?? {}
  return (c.asunto || c.sumilla || c.sumilla_solicito || c.destinatario_nombre || c.organo || '').trim() || 'Sin asunto'
}

/** ¿Se edita en el espacio? Solo un borrador del sistema sin número y sin firma en curso; lo demás se ve. */
export function editableEnWord(d: { numero: number | null; origen?: string; firma_en_curso?: boolean; estado?: string }): boolean {
  return d.numero == null && (d.origen ?? 'sgdp') === 'sgdp' && !d.firma_en_curso
}

/** Los estilos de párrafo del selector («Normal», «Título»…) y cómo se reconocen en el editor. */
export const ESTILOS_PARRAFO: { clave: string; etiqueta: string }[] = [
  { clave: 'parrafo', etiqueta: 'Normal' },
  { clave: 'titulo', etiqueta: 'Título' },
  { clave: 'vinetas', etiqueta: 'Lista con viñetas' },
  { clave: 'numerada', etiqueta: 'Lista numerada' },
]

/** Añade `id` al espacio sin repetir y sin pasar el tope; `activo` sigue válido. Pura. */
export function conDocumento(espacio: { documentos: number[]; activo: number | null }, id: number, tope = 60): { documentos: number[]; activo: number | null } {
  if (!Number.isInteger(id) || id <= 0) return espacio
  const documentos = espacio.documentos.includes(id) ? espacio.documentos : [...espacio.documentos, id].slice(-tope)
  return { documentos, activo: id }
}

/** Quita `id` del espacio; el activo pasa al vecino. Pura. */
export function sinDocumento(espacio: { documentos: number[]; activo: number | null }, id: number): { documentos: number[]; activo: number | null } {
  const i = espacio.documentos.indexOf(id)
  if (i < 0) return espacio
  const documentos = espacio.documentos.filter((x) => x !== id)
  const activo = espacio.activo === id ? (documentos[Math.min(i, documentos.length - 1)] ?? null) : espacio.activo
  return { documentos, activo }
}

/** Texto del campo fecha («2026-10-18») como lo escribe la carta: «18 de octubre de 2026». */
export function fechaLarga(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return iso ?? ''
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1] ?? ''} de ${m[1]}`
}

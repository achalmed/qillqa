/**
 * CORRESPONDENCIA: Estadísticas y el Mapa de relaciones leen lo mismo (Edison 2026-10-19:
 * «que estadísticas y el módulo de relaciones trabajen de manera colaborativa y que estén
 * vinculados»). Las cifras las calcula el backend sobre el grafo del mapa
 * (backend/app/servicios/grafo.py, `correspondencia`); aquí solo cómo se dicen y a dónde
 * lleva cada una, para que las dos pantallas hablen igual. Puro: pruebas en
 * pruebas/correspondencia.test.ts.
 */

/** En la ficha de una institución o persona del mapa (oficios que se le enviaron). */
export interface CorrespondenciaNodo {
  enviados: number
  respondidos: number
  sin_respuesta: number
  dias_promedio: number | null
}

/** En la ficha de un oficio enviado. */
export interface RespuestaDoc {
  respondido: boolean
  dias: number | null
  espera: number | null
}

export interface Correspondencia {
  enviados: number
  respondidos: number
  sin_respuesta: number
  dias_promedio: number | null
  por_institucion: ({ foco: string; nombre: string } & CorrespondenciaNodo)[]
  pendientes: { foco: string; numero: string; asunto: string; fecha: string; espera: number | null; destino: string }[]
}

/** El nodo en el mapa (`inst:7`, `persona:3`, `doc:278`), o null si no hay a dónde ir. */
export function rutaMapa(foco: string | null | undefined): string | null {
  return foco ? `/mapa?foco=${encodeURIComponent(foco)}` : null
}

/** La bandeja en la pestaña de ese estado (`?estado=` la abre así). */
export function rutaEstado(estado: string): string {
  return `/documentos?estado=${encodeURIComponent(estado)}`
}

/** De vuelta del mapa: el panel de correspondencia de Estadísticas. */
export const RUTA_ESTADISTICAS = '/estadisticas#correspondencia'

const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`)

/** «Respondido en 10 días» · «Sin respuesta hace 39 días» · «Respondido». */
export function textoRespuesta(r: RespuestaDoc | null | undefined): string {
  if (!r) return ''
  if (r.respondido) return r.dias !== null ? `Respondido en ${dias(r.dias)}` : 'Respondido'
  return r.espera !== null ? `Sin respuesta hace ${dias(r.espera)}` : 'Sin respuesta'
}

/** En la lista «Sin respuesta», el título ya lo dice: solo «hace 39 días». */
export function textoEspera(espera: number | null): string {
  return espera !== null ? `hace ${dias(espera)}` : ''
}

/** «22 oficios enviados · 3 con respuesta · respuesta en 9 días en promedio». */
export function textoCorrespondencia(c: CorrespondenciaNodo | null | undefined): string {
  if (!c || !c.enviados) return ''
  const partes = [c.enviados === 1 ? '1 oficio enviado' : `${c.enviados} oficios enviados`]
  partes.push(c.respondidos ? `${c.respondidos} con respuesta` : 'ninguno con respuesta')
  if (c.dias_promedio !== null) partes.push(`respuesta en ${dias(c.dias_promedio)} en promedio`)
  return partes.join(' · ')
}

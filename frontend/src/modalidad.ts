/**
 * MODALIDAD al abrir (2026-10-19): lógica pura de las preferencias de la cuenta (`preferencias.ts`),
 * sin tocar la red ni el navegador, para poder probarla (`pruebas/preferencias.test.ts`).
 */

export type Modalidad = '' | 'formulario' | 'word'
export interface Preferencias { modalidad_proyectos: Modalidad; modalidad_documentos: Modalidad }

export const MODALIDADES: { valor: Modalidad; nombre: string; detalle: string }[] = [
  { valor: '', nombre: 'Preguntar cada vez', detalle: 'Al abrir, se elige.' },
  { valor: 'formulario', nombre: 'Formulario', detalle: 'Campos, trámite, revisión y PDF.' },
  { valor: 'word', nombre: 'Formato Word', detalle: 'De corrido, como en Word.' },
]

export const PREFERENCIAS_VACIAS: Preferencias = { modalidad_proyectos: '', modalidad_documentos: '' }

/** Las preferencias limpias: solo las claves y los valores conocidos. Pura. */
export function limpiar(valor: unknown): Preferencias {
  const v = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>
  const mod = (x: unknown): Modalidad => (x === 'formulario' || x === 'word' ? x : '')
  return { modalidad_proyectos: mod(v.modalidad_proyectos), modalidad_documentos: mod(v.modalidad_documentos) }
}

/**
 * Qué modalidad abrir dada la preferencia y la URL: `?modalidad=` manda (un enlace explícito: «Volver
 * al proyecto» desde el Word, «Abrir en el formulario»), un `?ir=` apunta al formulario (los avisos
 * llevan a una parte o pestaña), y si no, la preferencia; '' = preguntar. Pura.
 */
export function modalidadAlAbrir(preferencia: Modalidad, consulta: URLSearchParams): Modalidad {
  const explicita = consulta.get('modalidad')
  if (explicita === 'formulario' || explicita === 'word') return explicita
  if (consulta.has('ir')) return 'formulario'
  return preferencia
}

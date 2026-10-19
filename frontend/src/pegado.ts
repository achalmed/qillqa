/**
 * PEGAR EL RESULTADO DE UN PROMPT: la parte PURA (sin dependencias; la prueba
 * `pruebas/pegar.test.ts` la carga con `node --test`). Tipos de la tabla de diferencias y
 * cómo se aplica lo aceptado. Lo que habla con la API está en `pegar.ts`.
 */
export type EstadoDiferencia = 'nuevo' | 'igual' | 'distinto' | 'dudoso'

export interface Diferencia {
  clave: string
  etiqueta: string
  actual: unknown
  propuesto: unknown
  estado: EstadoDiferencia
  /** Marcada por omisión: `nuevo` y `distinto` sí; `dudoso` no. */
  aceptar: boolean
}

/** Lo que queda en el formulario tras aceptar unas filas: `actual` más lo aceptado. Puro. */
export function aplicarDiferencias<T extends Record<string, unknown>>(diferencias: Diferencia[], actual: T, aceptadas: Set<string>): T {
  const salida: Record<string, unknown> = { ...actual }
  for (const d of diferencias) if (aceptadas.has(d.clave)) salida[d.clave] = d.propuesto
  return salida as T
}

/** Las claves marcadas por omisión (`aceptar`), como conjunto para el estado del componente. */
export const aceptadasPorOmision = (diferencias: Diferencia[]) => new Set(diferencias.filter((d) => d.aceptar).map((d) => d.clave))

/** Un valor como se muestra en la tabla: texto, lista con «·», sí/no, vacío con «—». */
export function textoValor(v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.map(textoValor).join(' · ')
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x != null && x !== '')
      .map(([k, x]) => `${k}: ${textoValor(x)}`)
      .join(' · ')
  return String(v)
}

/** {campo: 'pegado'} para las claves aceptadas: alimenta `origen_campos` de la entidad. */
export const origenDePegado = (aceptadas: Set<string>): Record<string, 'pegado'> =>
  Object.fromEntries([...aceptadas].map((k) => [k, 'pegado' as const]))

/**
 * Lo que un bloque dice de sí mismo sin pedírselo al servidor (2026-10-12, fase 9.3): el
 * `tipo:` de la primera línea que lo declara y el valor plano de una clave de primer nivel
 * (`tipo_documental: oficio`, `documento: OF-0123-2026-2027`). Sirve para encaminar un pegado
 * que llega del chat (`?pegar=<id>`) al módulo y al formulario que le toca; la lectura de verdad
 * sigue siendo del endpoint de pegado.
 */
export function tipoDelBloque(texto: string): string {
  const m = /^\s*tipo:\s*["']?([a-z0-9_-]+)["']?\s*$/im.exec(texto ?? '')
  return m ? m[1].toLowerCase() : ''
}

/** El valor de una clave de primer nivel del bloque (sin sangría), sin comillas; '' si no está. */
export function valorDelBloque(texto: string, clave: string): string {
  const re = new RegExp(`^${clave.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}:[ \\t]*(.*)$`, 'im')
  const m = re.exec((texto ?? '').replace(/\r\n/g, '\n'))
  if (!m) return ''
  return m[1].trim().replace(/^["'](.*)["']$/, '$1').trim()
}

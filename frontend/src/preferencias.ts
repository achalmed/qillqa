/**
 * PREFERENCIAS de la cuenta (2026-10-19): lo que cada persona elige para sí y vale en todos sus
 * aparatos (`GET/PUT /api/ajustes/preferencias`; el `localStorage` no viaja entre equipos). Hoy:
 * cómo abrir un proyecto de ley y un documento —formulario o Formato Word— o preguntar cada vez
 * (Edison: «ofrecer desde el inicio Formulario o Formato Word y recordar la elección por cuenta»).
 * Se guarda una copia local para decidir sin esperar a la red; la red manda cuando responde.
 * La lógica pura vive en `modalidad.ts` (pruebas/preferencias.test.ts).
 */
import { api } from './api'
import { limpiar, PREFERENCIAS_VACIAS as VACIAS, type Preferencias } from './modalidad'

export { MODALIDADES, limpiar, modalidadAlAbrir, type Modalidad, type Preferencias } from './modalidad'

const CLAVE_LOCAL = 'qillqa_preferencias'
let cache: Preferencias | null = null
let pendiente: Promise<Preferencias> | null = null

function leerLocal(): Preferencias | null {
  try { const t = localStorage.getItem(CLAVE_LOCAL); return t ? limpiar(JSON.parse(t)) : null } catch { return null }
}
function guardarLocal(p: Preferencias) { try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(p)) } catch { /* sin almacenamiento */ } }

/** Las preferencias de la cuenta: la copia local al instante y la del servidor en cuanto llega. */
export function leerPreferencias(): Promise<Preferencias> {
  if (cache) return Promise.resolve(cache)
  if (!pendiente) {
    pendiente = api<Preferencias>('/api/ajustes/preferencias')
      .then((p) => { cache = limpiar(p); guardarLocal(cache); return cache })
      .catch(() => leerLocal() ?? VACIAS)
      .finally(() => { pendiente = null })
  }
  return pendiente
}

/** Lo que hay sin esperar (la caché o la copia local); null si nunca se leyó en este aparato. */
export const preferenciasInmediatas = (): Preferencias | null => cache ?? leerLocal()

export async function guardarPreferencia<K extends keyof Preferencias>(clave: K, valor: Preferencias[K]): Promise<Preferencias> {
  const base = cache ?? leerLocal() ?? VACIAS
  cache = { ...base, [clave]: valor }
  guardarLocal(cache)
  try { cache = limpiar(await api<Preferencias>('/api/ajustes/preferencias', { method: 'PUT', body: JSON.stringify({ [clave]: valor }) })); guardarLocal(cache) } catch { /* queda la copia local */ }
  return cache
}

/** Al cerrar sesión o cambiar de cuenta: nada de la cuenta anterior. */
export function olvidarPreferencias() { cache = null; try { localStorage.removeItem(CLAVE_LOCAL) } catch { /* sin almacenamiento */ } }

/**
 * «HACERLO AL VOLVER» (Edison 2026-10-18): lo que exige el servidor (numerar, cambiar de estado,
 * compilar el PDF, subir el firmado) no se puede hacer sin él, y no se encola a ciegas: el número
 * oficial es único y lo asigna el servidor tras la revisión de copias; el firmado lo valida él.
 * Sin servidor se explica en una línea y se ofrece «Hacerlo al volver»: queda aquí un recordatorio
 * (este equipo, por cuenta) y, cuando el servidor contesta, el marco lo muestra con «Hacer ahora»,
 * que abre el documento y, al numerar, empieza la numeración (la persona sigue confirmando).
 *
 * Las escrituras que sí se pueden encolar (guardar, comentar, crear una tarea, anotar, el chat)
 * van a la cola de sinconexion.ts, no aquí.
 */

export type TipoAlVolver = 'numerar' | 'estado' | 'compilar' | 'firmado' | 'archivo' | 'crear'

export interface AccionAlVolver {
  id: string
  tipo: TipoAlVolver
  /** «Numerar Oficio S/N — Pedido de información…». */
  rotulo: string
  /** Ruta de la WEB que la retoma (`/documentos/12?al_volver=numerar`). */
  ruta: string
  cuenta: string
  creado_en: number
}

/** La línea que explica por qué espera al servidor. */
export const POR_QUE: Record<TipoAlVolver, string> = {
  numerar: 'Numerar necesita el servidor: el número oficial es único y lo asigna él.',
  estado: 'Cambiar el estado necesita el servidor.',
  compilar: 'Compilar el PDF necesita el servidor.',
  firmado: 'Subir el firmado necesita el servidor: él comprueba la firma.',
  archivo: 'Subir archivos necesita el servidor.',
  crear: 'Crear un documento necesita el servidor: él le da su lugar en la bandeja.',
}

export const VERBO: Record<TipoAlVolver, string> = {
  numerar: 'Numerar',
  estado: 'Cambiar el estado de',
  compilar: 'Compilar',
  firmado: 'Subir el firmado de',
  archivo: 'Subir el archivo de',
  crear: 'Crear',
}

const CLAVE = 'qillqa_al_volver'
const MAX = 20

// --- reglas puras (pruebas/continuidad.test.ts) ----------------------------------------------

/** Añade sin repetir: una sola acción del mismo tipo para la misma ruta y cuenta (la más nueva). */
export function agregarAccion(lista: AccionAlVolver[], nueva: AccionAlVolver): AccionAlVolver[] {
  const resto = lista.filter((a) => !(a.tipo === nueva.tipo && a.ruta === nueva.ruta && a.cuenta === nueva.cuenta))
  return [...resto, nueva].slice(-MAX)
}

export const accionesDe = (lista: AccionAlVolver[], cuenta: string): AccionAlVolver[] =>
  lista.filter((a) => a.cuenta === cuenta)

/** La ruta de la web que corresponde a una ruta de la API (para retomar la acción). */
export function rutaWebDe(rutaApi: string): string {
  const doc = /^\/api\/documentos\/(\d+)/.exec(rutaApi)
  if (doc) return `/documentos/${doc[1]}`
  const pl = /^\/api\/proyectos\/(\d+)/.exec(rutaApi)
  if (pl) return `/proyectos/${pl[1]}`
  const sr = /^\/api\/semanas\/(\d+)/.exec(rutaApi)
  if (sr) return `/informes/${sr[1]}`
  const en = /^\/api\/entradas\/(\d+)/.exec(rutaApi)
  if (en) return `/recibidos?ver=${en[1]}`
  return ''
}

// --- almacén (localStorage) ----------------------------------------------------------------

const cuentaActual = (): string => {
  try {
    return (localStorage.getItem('qillqa_usuario') ?? '').trim().toLowerCase()
  } catch {
    return ''
  }
}

function leer(): AccionAlVolver[] {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE) || '[]')
    return Array.isArray(l) ? (l as AccionAlVolver[]) : []
  } catch {
    return []
  }
}

function escribir(l: AccionAlVolver[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(l))
  } catch {
    /* sin sitio */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_AL_VOLVER))
}

export const EVENTO_AL_VOLVER = 'qillqa:al-volver'

export function accionesAlVolver(): AccionAlVolver[] {
  return accionesDe(leer(), cuentaActual())
}

export function recordarAlVolver(tipo: TipoAlVolver, rotulo: string, ruta: string): void {
  const cuenta = cuentaActual()
  if (!cuenta || !ruta) return
  escribir(agregarAccion(leer(), { id: `${tipo}-${Date.now()}`, tipo, rotulo, ruta, cuenta, creado_en: Date.now() }))
}

export function quitarAccion(id: string): void {
  escribir(leer().filter((a) => a.id !== id))
}

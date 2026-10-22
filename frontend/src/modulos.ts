/**
 * MÓDULOS encendidos y apagados (2026-10-18) — espejo de `backend/app/servicios/modulos.py`, que
 * manda: su API apagada responde 403 `modulo_apagado`. Aquí se guarda lo último que dijo el
 * servidor (`GET /api/modulos`) para decidir sin esperar: el menú (navegacion.ts::modulosVisibles),
 * la ruta de un módulo apagado (componentes/ConModulo.tsx) y los atajos de otros módulos que lo
 * usan (el contador del chat, la agenda de un recibido…). Sin dato, todo está encendido.
 * Pruebas en `pruebas/modulos.test.ts`.
 */

export interface EstadoModulo {
  id: string
  nombre: string
  que: string
  publico: boolean
  requiere: string
  /** Lo que eligió quien administra. */
  activo: boolean
  /** Lo que vale, con las dependencias (la mesa virtual necesita la Mesa de Partes). */
  efectivo: boolean
  mensaje: string
  mensaje_por_omision: string
}

type Mapa = Record<string, { efectivo: boolean; mensaje: string }>

const CLAVE = 'qillqa_modulos'
const EVENTO = 'qillqa-modulos'

export const mapaDe = (lista: EstadoModulo[]): Mapa =>
  Object.fromEntries(lista.map((m) => [m.id, { efectivo: m.efectivo, mensaje: m.mensaje }]))

function leer(): Mapa {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(CLAVE) ?? '{}') as Mapa
  } catch {
    return {}
  }
}

/** ¿El módulo está encendido? Lo que no está en el registro (el núcleo) siempre lo está. */
export const moduloActivo = (id: string, mapa: Mapa = leer()): boolean => mapa[id]?.efectivo ?? true

/** El mensaje que se muestra en lugar de un módulo apagado. */
export const mensajeModulo = (id: string, mapa: Mapa = leer()): string =>
  mapa[id]?.mensaje || 'Este módulo no está disponible por el momento.'

/** El detalle de un 403 de módulo apagado, o null si es otro error. */
export function moduloApagadoDe(detalle: unknown): { modulo: string; mensaje: string } | null {
  const d = detalle as { codigo?: string; modulo?: string; mensaje?: string } | null
  return d && d.codigo === 'modulo_apagado' && d.modulo ? { modulo: d.modulo, mensaje: d.mensaje ?? '' } : null
}

function guardar(mapa: Mapa): void {
  try {
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify(mapa))
  } catch {
    /* sin almacenamiento: se decide con lo que haya */
  }
  globalThis.dispatchEvent?.(new Event(EVENTO))
}

/** Guarda lo que devolvió `GET /api/modulos` (o `PUT /api/modulos/{id}`). */
export const recordarModulos = (lista: EstadoModulo[]) => guardar(mapaDe(lista))

/** Un 403 `modulo_apagado`: el servidor ya lo apagó; el menú se pone al día sin esperar. */
export function marcarApagado(id: string, mensaje: string): void {
  const mapa = leer()
  if (mapa[id]?.efectivo === false && mapa[id]?.mensaje === mensaje) return
  guardar({ ...mapa, [id]: { efectivo: false, mensaje } })
}

/** Suscribirse a los cambios (para volver a pintar el menú). Devuelve la baja. */
export function alCambiarModulos(f: () => void): () => void {
  globalThis.addEventListener?.(EVENTO, f)
  return () => globalThis.removeEventListener?.(EVENTO, f)
}

/**
 * ACTIVIDAD de la cabecera (2026-10-19, Edison: «esos tres iconos podemos juntar en uno solo para tener
 * más espacio en la cabecera» del celular). Los tres componentes de siempre —equipo en línea, chat y
 * campana— siguen montados (el equipo manda el latido de presencia; el chat, su socket) pero en el
 * celular se ocultan y un solo botón muestra la suma y abre un menú con los tres. Este almacén
 * diminuto es el puente: cada componente publica su cuenta y registra cómo se abre; el botón las lee.
 */
import { useSyncExternalStore } from 'react'

export type ClaveActividad = 'equipo' | 'chat' | 'avisos'
export interface Cuentas { equipo: number; chat: number; avisos: number }

let cuentas: Cuentas = { equipo: 0, chat: 0, avisos: 0 }
const aperturas: Partial<Record<ClaveActividad, (ancla: HTMLElement) => void>> = {}
const oyentes = new Set<() => void>()

export function publicarCuenta(clave: ClaveActividad, n: number): void {
  if (cuentas[clave] === n) return
  cuentas = { ...cuentas, [clave]: n }
  oyentes.forEach((f) => f())
}

/** Cómo se abre cada cosa desde el botón único (la campana y el equipo abren su lista anclada a él). */
export function registrarApertura(clave: ClaveActividad, abrir: ((ancla: HTMLElement) => void) | null): void {
  if (abrir) aperturas[clave] = abrir
  else delete aperturas[clave]
}

export function abrirActividad(clave: ClaveActividad, ancla: HTMLElement): boolean {
  const f = aperturas[clave]
  if (!f) return false
  f(ancla)
  return true
}

export function useActividad(): Cuentas {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f) }, () => cuentas, () => cuentas)
}

/**
 * PARTES EDITABLES de un proyecto de ley (2026-10-19): lógica pura de mover y arrastrar, sin React,
 * para `componentes/PartesProyecto.tsx` y sus pruebas (`pruebas/partesProyecto.test.ts`). Espejo de
 * las reglas de la API (`backend/app/servicios/proyectos_partes.py`): los grupos no se cruzan, las
 * partes fijas de la fórmula legal y el título de la ley no se mueven.
 */

/** Lo que hace falta saber de cada parte (subconjunto de lo que la API devuelve). */
export interface ParteBasica {
  clave: string
  titulo: string
  grupo: string
  obligatoria: boolean
  /** Su lugar lo fija la técnica legislativa (plantilla, fórmula legal): no se arrastra. */
  fija?: boolean
  palabras?: number
}

export const esTitulo = (p: ParteBasica) => p.clave === 'titulo'

/** ¿Se puede mover `clave` a la posición de `destino` (mismo grupo, fijas quietas)? Pura. */
export function puedeMover(partes: ParteBasica[], clave: string, destino: string): boolean {
  const a = partes.find((x) => x.clave === clave)
  const b = partes.find((x) => x.clave === destino)
  return Boolean(a && b && a !== b && !a.fija && a.grupo === b.grupo && !esTitulo(a))
}

/** El orden resultante de poner `clave` donde está `destino`. Pura. */
export function moverA(partes: ParteBasica[], clave: string, destino: string): string[] {
  const claves = partes.map((x) => x.clave)
  const i = claves.indexOf(clave)
  const j = claves.indexOf(destino)
  if (i < 0 || j < 0 || i === j) return claves
  const sin = claves.filter((c) => c !== clave)
  sin.splice(j, 0, clave)
  return sin
}

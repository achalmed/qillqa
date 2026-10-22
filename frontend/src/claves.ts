/**
 * Las claves de este equipo se llamaban `sgdp_…` y `sgdp-…` hasta el 2026-10-22 (fase 10.4 de la plataforma): se copian
 * una vez a su nombre nuevo (`qillqa_…`, `qillqa-…`) sin pisar una que ya exista, y la web usa solo las nuevas. La copia
 * corre en `index.html`, antes de leer ninguna (la sesión, la apariencia); esta es la misma regla, con su prueba. Las
 * viejas se borran en la fase 7 (punto de no retorno).
 */
export interface Almacen {
  readonly length: number
  key(i: number): string | null
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

/** El nombre nuevo de una clave vieja, o null si no lo es. */
export const claveNueva = (k: string): string | null => (k.startsWith('sgdp') ? 'qillqa' + k.slice(4) : null)

/** Copia las claves viejas a su nombre nuevo; devuelve cuántas copió. */
export function migrarClaves(almacen: Almacen): number {
  const viejas: string[] = []
  for (let i = 0; i < almacen.length; i++) {
    const k = almacen.key(i)
    if (k) viejas.push(k)
  }
  let copiadas = 0
  for (const k of viejas) {
    const nueva = claveNueva(k)
    const valor = almacen.getItem(k)
    if (nueva && valor !== null && almacen.getItem(nueva) === null) {
      almacen.setItem(nueva, valor)
      copiadas++
    }
  }
  return copiadas
}

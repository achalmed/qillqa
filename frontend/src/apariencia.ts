/**
 * APARIENCIA (2026-10-19, segunda fase del rediseño tipo macOS): clara, oscura o «como el aparato».
 * Edison pidió la oscura porque su referencia lo es, y ese mismo día fijó que **por omisión el sistema
 * es claro** («el tema predeterminado debe ser el claro»): sin elección guardada, claro; en el menú de
 * la cuenta se elige Clara, Oscura o «Como el aparato» (`prefers-color-scheme`); se recuerda por aparato
 * en `localStorage`, como la vista. El modo se resuelve UNA vez al cargar (`modoActual`): la paleta
 * (`paleta.ts`) se elige con él y todo lo que la usa como literal —incluido el tema de MUI— sale ya
 * del modo correcto, sin modo a medias. Cambiarla recarga la página (`ponerApariencia`), igual que
 * cambiar de vista. `index.html` repite esta misma regla en un guion de dos líneas para que la
 * pantalla de carga ya salga oscura. Puro salvo leer, guardar y preguntar al navegador;
 * pruebas en `pruebas/apariencia.test.ts`.
 */

export type Apariencia = 'auto' | 'claro' | 'oscuro'
export type Modo = 'claro' | 'oscuro'

export const APARIENCIAS: { id: Apariencia; nombre: string }[] = [
  { id: 'claro', nombre: 'Clara' },
  { id: 'oscuro', nombre: 'Oscura' },
  { id: 'auto', nombre: 'Como el aparato' },
]

const CLAVE = 'qillqa_apariencia'

/** El modo que corresponde a una apariencia: la automática sigue al aparato. */
export function modoEfectivo(apariencia: Apariencia, prefiereOscuro: boolean): Modo {
  if (apariencia === 'claro' || apariencia === 'oscuro') return apariencia
  return prefiereOscuro ? 'oscuro' : 'claro'
}

export function leerApariencia(): Apariencia {
  try {
    const a = globalThis.localStorage?.getItem(CLAVE) as Apariencia | null
    return a && APARIENCIAS.some((x) => x.id === a) ? a : 'claro'
  } catch {
    return 'claro'
  }
}

/** ¿El aparato pide oscuro? (fuera del navegador —pruebas—, no.) */
export function prefiereOscuro(): boolean {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches)
  } catch {
    return false
  }
}

/** El modo con el que arranca esta carga de la página. */
export const modoActual = (): Modo => modoEfectivo(leerApariencia(), prefiereOscuro())

/** Elegir la apariencia: se guarda y se recarga la ventana de afuera (la paleta se fija al cargar). */
export function ponerApariencia(a: Apariencia): void {
  try {
    if (a === 'claro') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, a)
  } catch {
    /* sin almacenamiento no hay apariencia elegida */
  }
  ;(window.top ?? window).location.reload()
}

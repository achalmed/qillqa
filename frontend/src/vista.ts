/**
 * VISTA elegida (2026-10-18). Edison: «sé que la vista se adapta sola al tamaño de la ventana, pero
 * quiero poder elegir el modo: celular, tableta…». Elegida una que no es la de la ventana, el sistema
 * se muestra DENTRO de un marco de ese ancho (componentes/MarcoVista.tsx: un iframe del mismo sitio), así
 * que todo —los estilos y la lógica que miran el ancho— se comporta como en ese aparato; si la pantalla
 * es más angosta que el marco, se reduce a escala. «Automática» quita el marco. Se recuerda por
 * dispositivo (`localStorage`). Puro salvo leer y guardar; pruebas en `pruebas/vista.test.ts`.
 */

export type Vista = 'auto' | 'celular' | 'tableta' | 'escritorio'

export const VISTAS: { id: Vista; nombre: string; ancho: number; alto: number }[] = [
  { id: 'auto', nombre: 'Automática', ancho: 0, alto: 0 },
  { id: 'celular', nombre: 'Celular', ancho: 390, alto: 844 },
  { id: 'tableta', nombre: 'Tableta', ancho: 820, alto: 1180 },
  { id: 'escritorio', nombre: 'Escritorio', ancho: 1366, alto: 768 },
]

/** La barra de arriba del marco y el aire alrededor. */
export const ALTO_BARRA = 44
const AIRE = 16

/** ¿La ventana ya es de esa clase de aparato? (los cortes del tema: 600 y 900 px). */
export function yaEs(vista: Vista, ancho: number): boolean {
  if (vista === 'celular') return ancho < 600
  if (vista === 'tableta') return ancho >= 600 && ancho < 900
  if (vista === 'escritorio') return ancho >= 1200
  return true
}

/** El marco para una vista en una ventana: su ancho y alto propios y la escala; null si no hace falta. */
export function marcoDe(vista: Vista, ventana: { ancho: number; alto: number }): { ancho: number; alto: number; escala: number } | null {
  const v = VISTAS.find((x) => x.id === vista)
  if (!v || vista === 'auto' || yaEs(vista, ventana.ancho)) return null
  const libreAncho = Math.max(200, ventana.ancho - 2 * AIRE)
  const libreAlto = Math.max(200, ventana.alto - ALTO_BARRA - 2 * AIRE)
  const escala = Math.min(1, libreAncho / v.ancho)
  // El celular y la tableta, con su alto (o el que quepa); el escritorio, todo el alto libre.
  const alto = vista === 'escritorio' ? libreAlto / escala : Math.min(v.alto, libreAlto / escala)
  return { ancho: v.ancho, alto: Math.round(alto), escala: Math.round(escala * 1000) / 1000 }
}

const CLAVE = 'qillqa_vista'

export function leerVista(): Vista {
  try {
    const v = globalThis.localStorage?.getItem(CLAVE) as Vista | null
    return v && VISTAS.some((x) => x.id === v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/** ¿Esta página es la que va dentro del marco? */
export const enMarco = (): boolean => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** Elegir la vista: se guarda y se recarga la ventana de afuera (la que pone o quita el marco). */
export function ponerVista(v: Vista): void {
  try {
    localStorage.setItem(CLAVE, v)
  } catch {
    /* sin almacenamiento no hay vista elegida */
  }
  ;(window.top ?? window).location.reload()
}

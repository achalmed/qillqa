/**
 * Utilidades del VISOR AVANZADO (VisorAvanzado.tsx): carga perezosa de pdf.js,
 * medidas, zoom y búsqueda. Aparte del componente para que se lean solas.
 *
 * pdf.js se importa SOLO al abrir el visor (import dinámico): pesa cerca de
 * 1 MB y la mayoría de las pantallas no lo necesitan. Se usa la compilación
 * «legacy» porque trae los complementos que piden los navegadores de celular
 * algo antiguos (Safari < 17.4 no tiene `Promise.withResolvers`, que la
 * compilación moderna exige); el diputado usa casi siempre el celular.
 */
import type * as PdfJs from 'pdfjs-dist'

export type ModuloPdfJs = typeof PdfJs

/**
 * ¿El navegador muestra PDF dentro de la página? Los de celular (Chrome de
 * Android, y Safari de iPhone solo la primera hoja) NO: allí el <object> sale
 * en blanco. Edison 2026-10-01: «el diputado usa casi siempre el celular». En
 * esos navegadores la vista previa ofrece abrirlo en el visor completo (pdf.js).
 */
export { pdfEnLinea } from '@qillqa/tiqsi/estilo'

let cargando: Promise<ModuloPdfJs> | null = null

/** pdf.js con su worker configurado (una sola vez por sesión). */
export function cargarPdfJs(): Promise<ModuloPdfJs> {
  if (!cargando) {
    cargando = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ])
      .then(([m, w]) => {
        const mod = m as unknown as ModuloPdfJs
        mod.GlobalWorkerOptions.workerSrc = w.default
        return mod
      })
      .catch((e) => {
        cargando = null // un fallo de red no deja el visor roto para siempre
        throw e
      })
  }
  return cargando
}

/** pdf.js mide en puntos (1/72 in); la pantalla en px CSS (1/96 in). Con esto
 *  el 100 % del visor es el tamaño real de la hoja, como en Outlook. */
export const PT_A_PX = 96 / 72

/** Pasos del zoom (−/+, Ctrl+rueda). */
export const PASOS_ZOOM = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
export const ZOOM_MIN = PASOS_ZOOM[0]
export const ZOOM_MAX = PASOS_ZOOM[PASOS_ZOOM.length - 1]

export const acotarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

/** Siguiente paso de zoom hacia arriba (+1) o hacia abajo (−1). */
export function pasoZoom(actual: number, dir: 1 | -1): number {
  if (dir > 0) return PASOS_ZOOM.find((p) => p > actual + 0.001) ?? ZOOM_MAX
  return [...PASOS_ZOOM].reverse().find((p) => p < actual - 0.001) ?? ZOOM_MIN
}

/** Separación vertical entre hojas y margen del área central, en px. */
export const SEPARACION = 12
export const MARGEN = 16

/** Medida de una hoja a zoom 1 (px CSS), ya girada. */
export interface Medida {
  ancho: number
  alto: number
}

/** Medida de una hoja con el giro del usuario (90/270 intercambian lados). */
export const girar = (m: Medida, giro: number): Medida =>
  giro % 180 === 0 ? m : { ancho: m.alto, alto: m.ancho }

/** Posición superior de cada hoja en el área central a un zoom dado. */
export function posiciones(medidas: Medida[], zoom: number): number[] {
  const tops: number[] = []
  let y = MARGEN
  for (const m of medidas) {
    tops.push(y)
    y += m.alto * zoom + SEPARACION
  }
  return tops
}

/** Hoja (base 0) que ocupa la línea `y` del área central. */
export function hojaEn(tops: number[], y: number): number {
  let lo = 0
  let hi = tops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tops[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, lo)
}

/** Texto comparable: minúsculas, sin tildes y con espacios simples. La
 *  búsqueda encuentra «oficio» en «OFICIO» y «informacion» en «información». */
export const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

/** Cuántas veces aparece `aguja` (ya normalizada) en `pajar` (normalizado). */
export function contar(pajar: string, aguja: string): number {
  if (!aguja) return 0
  let n = 0
  let i = pajar.indexOf(aguja)
  while (i !== -1) {
    n += 1
    i = pajar.indexOf(aguja, i + aguja.length)
  }
  return n
}

const EXT_IMAGEN = /\.(png|jpe?g|webp|gif|bmp|svg)$/i
/** ¿El nombre o el tipo dicen que es una imagen? */
export const pareceImagen = (nombre: string, tipo = '') =>
  tipo.startsWith('image/') || (!tipo.includes('pdf') && EXT_IMAGEN.test(nombre))

/** ¿Los primeros bytes son de un PDF («%PDF»)? Un blob sin tipo se decide así. */
export const esPdfPorFirma = (b: ArrayBuffer) => {
  const v = new Uint8Array(b, 0, Math.min(1024, b.byteLength))
  for (let i = 0; i + 3 < v.length; i++) {
    if (v[i] === 0x25 && v[i + 1] === 0x50 && v[i + 2] === 0x44 && v[i + 3] === 0x46) return true
  }
  return false
}

/**
 * Imprime un PDF (o una imagen) sin salir de la página: un iframe oculto con
 * el archivo y su `print()`. Si el navegador no puede (celular sin lector de
 * PDF integrado), se abre en otra pestaña para imprimir desde allí.
 */
export function imprimir(url: string, esImagen: boolean, puedeEnLinea: boolean): void {
  if (!esImagen && !puedeEnLinea) {
    window.open(url, '_blank')
    return
  }
  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' })
  const retirar = () => setTimeout(() => marco.remove(), 60_000)
  marco.onload = () => {
    try {
      marco.contentWindow?.focus()
      marco.contentWindow?.print()
    } catch {
      window.open(url, '_blank')
    }
    retirar()
  }
  if (esImagen) {
    marco.srcdoc = `<!doctype html><html><head><style>@page{margin:10mm}html,body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:auto}</style></head><body><img src="${url.replace(/"/g, '&quot;')}"></body></html>`
  } else {
    marco.src = url
  }
  document.body.appendChild(marco)
}

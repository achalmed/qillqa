/**
 * ABRIR DESDE LA CARPETA SINCRONIZADA (Edison 2026-10-18): «los documentos sincronizados, sin
 * duplicar espacio». La página Sincronizar baja los PDF, firmados, adjuntos y recibidos a una
 * carpeta del dispositivo (File System Access API). Sin servidor, los módulos (bandeja, editor,
 * recibidos, proyectos…) abren el PDF DIRECTAMENTE de esa carpeta, y lo que está en ella no se
 * guarda otra vez en el navegador (cachelecturas.ts).
 *
 * Cómo se encuentra un archivo: al terminar, sincronizar() deja en IndexedDB el mapa «ruta de la
 * API → ruta en la carpeta y versión» (sync/almacen.ts), armado con el mismo manifiesto con que
 * nombró y ordenó los archivos («Oficios/OF-0012-…/OF-0012-….pdf»). Es de la cuenta que sincronizó;
 * otra cuenta en el mismo equipo no lo usa.
 *
 * El permiso: Chrome recuerda la carpeta («Permitir siempre» en la aplicación instalada) y entonces
 * se lee sin preguntar; si pide confirmarlo, el marco muestra una ventanita con «Abrir carpeta»
 * (`PermisoCarpeta.tsx`), porque el navegador solo lo concede tras un clic.
 */
import { normalizarCuenta, rutaEstable } from '../cachelecturas.ts'
import { leerHandle, leerMapa, type MapaSincronizado } from './almacen.ts'

// --- reglas puras (pruebas/continuidad.test.ts) ----------------------------------------------

/** La versión que da el manifiesto (`tamaño-mtime en segundos`), calculada de una respuesta del
 *  servidor: su tamaño y su `Last-Modified` (archivos.py usa la misma fecha). */
export function versionDeRespuesta(tamano: number, ultimaModificacion: string | null): string | null {
  if (!ultimaModificacion) return null
  const ms = Date.parse(ultimaModificacion)
  return Number.isFinite(ms) ? `${tamano}-${Math.floor(ms / 1000)}` : null
}

/** Pura: el mapa de lo que quedó EN la carpeta (`presentes`: rutas de la carpeta). */
export function construirMapa(
  items: { ruta: string; version: string; url: string }[],
  presentes: Set<string>,
): MapaSincronizado['archivos'] {
  const archivos: MapaSincronizado['archivos'] = {}
  for (const it of items) if (presentes.has(it.ruta)) archivos[rutaEstable(it.url)] = { ruta: it.ruta, version: it.version }
  return archivos
}

/** Pura: lo que el mapa dice de un archivo de la API, si es de esta cuenta. */
export function entradaDe(mapa: MapaSincronizado | null, url: string, cuenta: string): { ruta: string; version: string } | null {
  if (!mapa || !cuenta || normalizarCuenta(mapa.cuenta) !== cuenta) return null
  return mapa.archivos[rutaEstable(url)] ?? null
}

// --- uso ----------------------------------------------------------------------------------

let mapaEnMemoria: { promesa: Promise<MapaSincronizado | null>; leido_en: number } | null = null
const VIGENCIA_MAPA_MS = 30_000

/** El mapa, leído de IndexedDB como mucho cada 30 s (otra pestaña pudo sincronizar entretanto). */
function mapa(): Promise<MapaSincronizado | null> {
  if (!mapaEnMemoria || Date.now() - mapaEnMemoria.leido_en > VIGENCIA_MAPA_MS) {
    const promesa = (typeof indexedDB === 'undefined' ? Promise.resolve(null) : leerMapa()).catch(() => null)
    mapaEnMemoria = { promesa, leido_en: Date.now() }
  }
  return mapaEnMemoria.promesa
}

export function olvidarMapaEnMemoria(): void {
  mapaEnMemoria = null
}

const cuentaActual = (): string => {
  try {
    return normalizarCuenta(localStorage.getItem('qillqa_usuario'))
  } catch {
    return ''
  }
}

/** ¿La carpeta tiene este archivo en esta versión? (sin versión: ¿lo tiene?). Sin permisos. */
export async function enLaCarpeta(url: string, version?: string | null): Promise<boolean> {
  const e = entradaDe(await mapa(), url, cuentaActual())
  if (!e) return false
  return version ? e.version === version : true
}

// Permiso: una sola petición a la vez para todos los PDF que lo esperan, y si la persona dijo
// «Ahora no», no se vuelve a preguntar en un rato.
export const EVENTO_PERMISO = 'qillqa:permiso-carpeta'
export interface PedidoPermiso {
  carpeta: string
  /** Lo llama la ventanita: con el clic de la persona pide el permiso al navegador. */
  conceder: () => Promise<void>
  rechazar: () => void
}
let pendiente: Promise<boolean> | null = null
let rechazadoHasta = 0
const ESPERA_PERMISO_MS = 90_000

function pedirPermiso(dir: FileSystemDirectoryHandle): Promise<boolean> {
  if (Date.now() < rechazadoHasta) return Promise.resolve(false)
  pendiente ??= new Promise<boolean>((resolver) => {
    let hecho = false
    const fin = (ok: boolean) => {
      if (hecho) return
      hecho = true
      window.clearTimeout(tope)
      if (!ok) rechazadoHasta = Date.now() + 10 * 60_000
      pendiente = null
      resolver(ok)
    }
    // Sin ventanita que conteste (una pantalla sin marco) no se espera para siempre.
    const tope = window.setTimeout(() => fin(false), ESPERA_PERMISO_MS)
    const detalle: PedidoPermiso = {
      carpeta: dir.name,
      conceder: async () => {
        try {
          fin((await dir.requestPermission?.({ mode: 'read' })) === 'granted')
        } catch {
          fin(false)
        }
      },
      rechazar: () => fin(false),
    }
    window.dispatchEvent(new CustomEvent<PedidoPermiso>(EVENTO_PERMISO, { detail: detalle }))
  })
  return pendiente
}

async function archivoEn(dir: FileSystemDirectoryHandle, ruta: string): Promise<File | null> {
  const partes = ruta.split('/').filter(Boolean)
  const nombre = partes.pop()
  if (!nombre) return null
  try {
    let actual = dir
    for (const p of partes) actual = await actual.getDirectoryHandle(p)
    return await (await actual.getFileHandle(nombre)).getFile()
  } catch {
    return null
  }
}

/**
 * El archivo de la API `url`, leído de la carpeta sincronizada, o null si no está (o no hay
 * permiso). Pide el permiso si el navegador lo exige.
 */
export async function abrirDeCarpeta(url: string): Promise<{ blob: Blob; hecho_en: number } | null> {
  try {
    const m = await mapa()
    const e = entradaDe(m, url, cuentaActual())
    if (!m || !e) return null
    const dir = await leerHandle()
    if (!dir) return null
    const estado = await dir.queryPermission?.({ mode: 'read' })
    if (estado === 'denied') return null
    if (estado !== 'granted' && !(await pedirPermiso(dir))) return null
    const archivo = await archivoEn(dir, e.ruta)
    return archivo ? { blob: archivo, hecho_en: m.hecho_en } : null
  } catch {
    return null
  }
}

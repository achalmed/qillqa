/**
 * DÓNDE se guarda lo que se descarga (Edison 2026-09-08: «elegir dónde se
 * descarga, tanto en bandeja como en la interna»).
 *
 * Hasta ahora todo caía en la carpeta de Descargas del navegador y había que
 * buscarlo y moverlo a mano. Ahora el usuario elige UNA VEZ su carpeta —la del
 * despacho, una memoria USB, donde sea— y desde ese momento cada descarga se
 * escribe ahí directamente, con el nombre oficial del archivo.
 *
 * Se apoya en la misma base que la sincronización (File System Access API +
 * el handle guardado en IndexedDB, `sync/almacen.ts`), pero con su PROPIA
 * clave: la carpeta espejo de la sincronización y la carpeta de descargas son
 * cosas distintas y no deben pisarse.
 *
 * Cascada, de más cómodo a más universal:
 *   1. Carpeta recordada y con permiso → se escribe ahí, sin preguntar nada.
 *   2. Sin carpeta → «Guardar como…» del sistema, que deja elegir destino.
 *   3. Navegador sin File System Access (Firefox, Safari) → descarga normal.
 */
import { guardarHandle, leerHandle, olvidarHandle } from './sync/almacen.ts'

const CLAVE = 'descargas'

export type Destino = 'carpeta' | 'elegido' | 'descargas'

interface VentanaConPickers extends Window {
  showSaveFilePicker?: (o: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>
}

/** El tipo que se declara en «Guardar como…» según la extensión del nombre (2026-10-18: antes
 *  siempre decía «Documento PDF», también para el .zip de la extensión o un .md). Sin extensión
 *  conocida no se declara ninguno y el sistema deja guardar como venga. */
export function tipoParaGuardar(nombre: string): { description: string; accept: Record<string, string[]> } | null {
  const ext = (nombre.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
  const tipos: Record<string, [string, string]> = {
    pdf: ['Documento PDF', 'application/pdf'],
    zip: ['Archivo comprimido', 'application/zip'],
    xpi: ['Complemento de Firefox', 'application/x-xpinstall'],
    md: ['Texto Markdown', 'text/markdown'],
    txt: ['Texto', 'text/plain'],
    docx: ['Documento de Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    xlsx: ['Hoja de cálculo', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    png: ['Imagen PNG', 'image/png'],
    jpg: ['Imagen JPEG', 'image/jpeg'],
    jpeg: ['Imagen JPEG', 'image/jpeg'],
  }
  const t = tipos[ext]
  return t ? { description: t[0], accept: { [t[1]]: [`.${ext}`] } } : null
}

/** ¿El error del navegador dice que la carpeta o el archivo ya no existen? Es el `NotFoundError`
 *  de la File System Access API («A requested file or directory could not be found at the time an
 *  operation was processed»): la carpeta recordada se renombró, se borró o era una memoria USB
 *  que ya no está (2026-10-18, al descargar la extensión de Mesa de Partes). */
export function carpetaDesaparecida(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'NotAllowedError' || e.name === 'InvalidStateError')
}

/** ¿El navegador permite elegir carpeta? (Chromium; Firefox/Safari no). */
export function puedeElegirCarpeta(): boolean {
  return typeof (window as VentanaConPickers).showDirectoryPicker === 'function'
}

/** Permiso de escritura sobre la carpeta; la primera vez de cada sesión el
 *  navegador lo pide y hace falta un gesto del usuario. */
async function conPermiso(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  try {
    if ((await dir.queryPermission?.(opts)) === 'granted') return true
    return (await dir.requestPermission?.(opts)) === 'granted'
  } catch {
    return false
  }
}

/** La carpeta de descargas recordada (sin pedir permiso todavía). */
export async function carpetaGuardada(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await leerHandle(CLAVE)
  } catch {
    return null
  }
}

/** Abre el selector de carpetas y la recuerda. Devuelve null si se cancela. */
export async function elegirCarpeta(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as VentanaConPickers).showDirectoryPicker
  if (!picker) return null
  try {
    const dir = await picker({ mode: 'readwrite', startIn: 'documents' })
    if (!(await conPermiso(dir))) return null
    await guardarHandle(dir, CLAVE)
    return dir
  } catch {
    return null // el usuario canceló
  }
}

export async function olvidarCarpeta(): Promise<void> {
  await olvidarHandle(CLAVE)
}

/** Escribe el archivo en una carpeta ya autorizada. */
export async function escribirEn(
  dir: FileSystemDirectoryHandle,
  nombre: string,
  blob: Blob,
): Promise<void> {
  const archivo = await dir.getFileHandle(nombre, { create: true })
  const escritura = await archivo.createWritable()
  await escritura.write(blob)
  await escritura.close()
}

/** Descarga de toda la vida (el navegador decide dónde). */
function aDescargas(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

/**
 * Guarda el archivo donde toque según la cascada de arriba. `preguntar` fuerza
 * el «Guardar como…» aunque haya carpeta recordada (para un archivo suelto que
 * va a otro sitio).
 */
export async function guardarEn(
  blob: Blob,
  nombre: string,
  preguntar = false,
): Promise<Destino> {
  if (!preguntar) {
    const dir = await carpetaGuardada()
    if (dir && (await conPermiso(dir))) {
      try {
        await escribirEn(dir, nombre, blob)
        return 'carpeta'
      } catch (e) {
        // La carpeta recordada ya no está: se sigue con «Guardar como…» en vez de fallar con el
        // mensaje crudo del navegador. No se olvida sola (puede ser una USB desconectada).
        if (!carpetaDesaparecida(e)) throw e
      }
    }
  }
  const picker = (window as VentanaConPickers).showSaveFilePicker
  if (picker) {
    try {
      const tipo = tipoParaGuardar(nombre)
      const handle = await picker({
        suggestedName: nombre,
        ...(tipo ? { types: [tipo] } : {}),
      })
      const escritura = await handle.createWritable()
      await escritura.write(blob)
      await escritura.close()
      return 'elegido'
    } catch (e) {
      // Cancelar el diálogo NO debe acabar en una descarga sorpresa.
      if (e instanceof DOMException && e.name === 'AbortError') throw e
    }
  }
  aDescargas(blob, nombre)
  return 'descargas'
}

/**
 * Aviso a mostrar tras una descarga, o null si no hace falta: cuando el
 * archivo va a la carpeta de descargas del navegador, el propio navegador ya
 * lo anuncia con su barra, y repetirlo es ruido.
 */
export function avisoSiCorresponde(
  destino: Destino | 'cancelado',
  nombre: string,
  carpeta?: string,
): string | null {
  if (destino === 'cancelado' || destino === 'descargas') return null
  return avisoDestino(destino, nombre, carpeta)
}

/** Frase para el usuario: dónde acabó el archivo. */
export function avisoDestino(destino: Destino, nombre: string, carpeta?: string): string {
  if (destino === 'carpeta') return `Guardado en ${carpeta ? `«${carpeta}»` : 'su carpeta'}: ${nombre}`
  if (destino === 'elegido') return `Guardado: ${nombre}`
  return `Descargado: ${nombre} — está en la carpeta de descargas del navegador.`
}

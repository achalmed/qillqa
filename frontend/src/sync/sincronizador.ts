// Motor de sincronización incremental a una carpeta local (File System Access
// API). Pide el manifiesto al backend, compara contra el índice guardado
// DENTRO de la carpeta y baja SOLO lo nuevo o modificado, creando las
// subcarpetas que falten y conservando los nombres originales.

import { api, descargarBlob, subirArchivo } from '../api'
import { normalizarCuenta, olvidarArchivos } from '../cachelecturas'
import { guardarMapa } from './almacen'
import { construirMapa, olvidarMapaEnMemoria } from './carpetaLocal'

export interface ItemManifiesto {
  ruta: string // relativa: documentos/<tipo>/<carpeta>/…
  tamano: number
  version: string // tamaño-mtime (para detectar cambios)
  url: string // endpoint autenticado de descarga
}

export interface ResumenSync {
  bajados: number
  actualizados: number
  alDia: number
  errores: number
  bytes: number
  /** Copias de versiones anteriores apartadas a `.sgdp-retirados/`. */
  retirados: number
}

// Índice ruta->version guardado en la carpeta: sobrevive a los cambios de URL
// del enlace (el almacenamiento del navegador es por origen; el archivo, no).
const ARCHIVO_INDICE = '.sgdp-sync.json'

// Dónde van las copias que el sistema dejó de reconocer (típicamente porque el
// archivo se renombró en el servidor: el nuevo se baja y el viejo sobra).
// Edison 2026-09-08: «no queremos copias sueltas en ningún lado».
//
// NO se borran de una vez, a propósito: solo se apartan aquí, con la misma
// subruta, y se vacían cuando el usuario lo pide. Así, si algún día esta lógica
// se equivocara, lo apartado se puede recuperar.
export const CARPETA_RETIRADOS = '.sgdp-retirados'

/** Handle del archivo en `ruta` (relativa), o null si ya no está. */
async function buscarArchivo(
  dir: FileSystemDirectoryHandle,
  ruta: string,
): Promise<{ carpeta: FileSystemDirectoryHandle; nombre: string } | null> {
  const partes = ruta.split('/').filter(Boolean)
  const nombre = partes.pop()
  if (!nombre) return null
  let actual = dir
  for (const p of partes) {
    try {
      actual = await actual.getDirectoryHandle(p)
    } catch {
      return null
    }
  }
  try {
    await actual.getFileHandle(nombre)
    return { carpeta: actual, nombre }
  } catch {
    return null
  }
}

/**
 * Aparta una copia obsoleta: la mueve a `.sgdp-retirados/<misma subruta>`.
 *
 * Solo se llama con rutas que están en el ÍNDICE, es decir, archivos que
 * escribió este sincronizador. Lo que el usuario haya puesto en la carpeta no
 * figura en el índice y por eso no puede llegar aquí nunca.
 */
async function retirar(dir: FileSystemDirectoryHandle, ruta: string): Promise<boolean> {
  const encontrado = await buscarArchivo(dir, ruta)
  if (!encontrado) return false
  const partes = ruta.split('/').filter(Boolean)
  const nombre = partes.pop() as string
  let destino = await dir.getDirectoryHandle(CARPETA_RETIRADOS, { create: true })
  for (const p of partes) destino = await destino.getDirectoryHandle(p, { create: true })
  // Copiar y borrar: `move()` no existe en todos los navegadores.
  const original = await (await encontrado.carpeta.getFileHandle(nombre)).getFile()
  const fh = await destino.getFileHandle(nombre, { create: true })
  const w = await fh.createWritable()
  await w.write(await original.arrayBuffer())
  await w.close()
  await encontrado.carpeta.removeEntry(nombre)
  return true
}

/** Borra DEFINITIVAMENTE lo apartado. Lo pide el usuario, nunca la sync. */
export async function vaciarRetirados(dir: FileSystemDirectoryHandle): Promise<void> {
  try {
    await dir.removeEntry(CARPETA_RETIRADOS, { recursive: true })
  } catch {
    /* no había nada que vaciar */
  }
}

export async function obtenerManifiesto(): Promise<ItemManifiesto[]> {
  const r = await api<{ archivos: ItemManifiesto[] }>('/api/sync/manifest')
  return r.archivos
}

async function leerIndice(
  dir: FileSystemDirectoryHandle,
): Promise<Record<string, string>> {
  try {
    const fh = await dir.getFileHandle(ARCHIVO_INDICE)
    const obj = JSON.parse(await (await fh.getFile()).text())
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function guardarIndice(
  dir: FileSystemDirectoryHandle,
  idx: Record<string, string>,
): Promise<void> {
  const fh = await dir.getFileHandle(ARCHIVO_INDICE, { create: true })
  const w = await fh.createWritable()
  await w.write(JSON.stringify(idx))
  await w.close()
}

// Resuelve (creando lo que falte) la carpeta de una ruta, reutilizando un
// caché de prefijos ya resueltos. Se llama SECUENCIALMENTE en la 1.ª pasada
// para que la creación de carpetas no compita con las descargas paralelas.
async function resolverDir(
  raiz: FileSystemDirectoryHandle,
  cache: Map<string, FileSystemDirectoryHandle>,
  partes: string[],
): Promise<FileSystemDirectoryHandle> {
  let acc = ''
  let actual = raiz
  for (const p of partes) {
    if (!p) continue
    const clave = acc ? `${acc}/${p}` : p
    let h = cache.get(clave)
    if (!h) {
      h = await actual.getDirectoryHandle(p, { create: true })
      cache.set(clave, h)
    }
    actual = h
    acc = clave
  }
  return actual
}

// Cuántos archivos del manifiesto están pendientes (nuevos o modificados)
// según el índice de la carpeta. NO escribe ni pide permisos de escritura:
// sirve para el aviso «tienes N documentos para sincronizar» de la bandeja.
export async function contarPendientes(
  dir: FileSystemDirectoryHandle,
): Promise<number> {
  const [items, idx] = await Promise.all([obtenerManifiesto(), leerIndice(dir)])
  let n = 0
  for (const it of items) if (idx[it.ruta] !== it.version) n += 1
  return n
}

// Permiso de lectura/escritura sobre la carpeta. La primera vez de cada sesión
// el navegador lo pide (requiere un gesto del usuario); luego lo recuerda.
export async function asegurarPermiso(
  dir: FileSystemDirectoryHandle,
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  try {
    if ((await dir.queryPermission?.(opts)) === 'granted') return true
    return (await dir.requestPermission?.(opts)) === 'granted'
  } catch {
    return false
  }
}

interface Tarea {
  it: ItemManifiesto
  destino: FileSystemDirectoryHandle
  nombre: string
  nuevo: boolean
}

export async function sincronizar(
  dir: FileSystemDirectoryHandle,
  items: ItemManifiesto[],
  alProgresar: (hecho: number, total: number, ruta: string) => void,
  concurrencia = 6,
): Promise<ResumenSync> {
  const idx = await leerIndice(dir)
  const resumen: ResumenSync = {
    bajados: 0,
    actualizados: 0,
    alDia: 0,
    errores: 0,
    bytes: 0,
    retirados: 0,
  }
  const total = items.length
  let hecho = 0

  // 1.ª pasada (SECUENCIAL, solo disco): crea las carpetas y separa lo que ya
  // está al día de lo que hay que bajar. Barato: son operaciones locales.
  const cacheDir = new Map<string, FileSystemDirectoryHandle>()
  const pendientes: Tarea[] = []
  for (const it of items) {
    const partes = it.ruta.split('/')
    const nombre = partes.pop() as string
    try {
      const destino = await resolverDir(dir, cacheDir, partes)
      let alDia = false
      if (idx[it.ruta] === it.version) {
        try {
          await destino.getFileHandle(nombre)
          alDia = true
        } catch {
          alDia = false
        }
      }
      if (alDia) {
        resumen.alDia += 1
        hecho += 1
        alProgresar(hecho, total, it.ruta)
      } else {
        pendientes.push({ it, destino, nombre, nuevo: !idx[it.ruta] })
      }
    } catch {
      resumen.errores += 1
      hecho += 1
      alProgresar(hecho, total, it.ruta)
    }
  }

  // 2.ª pasada (PARALELA, red): descarga con un pool de `concurrencia`. Cada
  // tarea escribe un archivo distinto en una carpeta ya creada → sin choques.
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < pendientes.length) {
      const t = pendientes[siguiente++] // lectura+incremento atómicos (JS 1 hilo)
      try {
        const blob = await descargarBlob(t.it.url)
        const fh = await t.destino.getFileHandle(t.nombre, { create: true })
        const w = await fh.createWritable()
        await w.write(blob)
        await w.close()
        idx[t.it.ruta] = t.it.version
        resumen.bytes += t.it.tamano
        if (t.nuevo) resumen.bajados += 1
        else resumen.actualizados += 1
      } catch {
        resumen.errores += 1
      }
      hecho += 1
      alProgresar(hecho, total, t.it.ruta)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrencia, pendientes.length) }, trabajador),
  )

  // Copias que sobran: estaban en el índice (las bajó este sincronizador) y ya
  // no vienen en el manifiesto, casi siempre porque el archivo se renombró en
  // el servidor. Se APARTAN a `.sgdp-retirados/` —no se borran— y luego se
  // quitan del índice. Un archivo ajeno nunca está en el índice, así que esta
  // limpieza no puede alcanzarlo.
  const vigentes = new Set(items.map((i) => i.ruta))
  for (const k of Object.keys(idx)) {
    if (vigentes.has(k)) continue
    try {
      if (await retirar(dir, k)) resumen.retirados += 1
    } catch {
      resumen.errores += 1
    }
    delete idx[k]
  }
  await guardarIndice(dir, idx)
  await recordarLoSincronizado(dir, items, idx)
  return resumen
}

/**
 * El mapa «ruta de la API → archivo de la carpeta» (2026-10-18): con él los módulos abren sin
 * servidor DESDE la carpeta (carpetaLocal.ts), y lo que ya está en ella deja de guardarse también
 * en el navegador: las copias de «lo último visto» de esos archivos se borran aquí.
 */
async function recordarLoSincronizado(
  dir: FileSystemDirectoryHandle,
  items: ItemManifiesto[],
  idx: Record<string, string>,
): Promise<void> {
  const presentes = new Set(items.filter((it) => idx[it.ruta] === it.version).map((it) => it.ruta))
  const archivos = construirMapa(items, presentes)
  try {
    await guardarMapa({ cuenta: normalizarCuenta(localStorage.getItem('sgdp_usuario')), carpeta: dir.name, hecho_en: Date.now(), archivos })
    olvidarMapaEnMemoria()
    await olvidarArchivos(Object.keys(archivos))
  } catch {
    /* sin el mapa, sin conexión se abre lo guardado en el navegador, como antes */
  }
}

// --- Firmados que vuelven en el USB (2026-10-10) -----------------------------------------
// El USB va a la laptop del firmador, que deja «Oficio_123[R].pdf» junto al original. Tras
// bajar lo nuevo, se recorre la carpeta buscando esos «…[R].pdf» y cada uno se manda al
// servidor (POST /api/sync/firmado), que lo incorpora como firmado de su documento (con la
// misma validación que una subida a mano). Lo incorporado (o ya registrado) se aparta a
// `.sgdp-importados/<misma subruta>` para que no vuelva a mandarse ni quede duplicado junto
// al FIRM-… que baja la sincronización siguiente; lo que no se pudo identificar se queda
// donde estaba y se informa.
export const CARPETA_IMPORTADOS = '.sgdp-importados'

export interface FirmadoImportado {
  ruta: string
  estado: 'incorporado' | 'ya_estaba' | 'pendiente' | 'error'
  nombre?: string
  motivos?: string[]
}

const ES_FIRMADO_R = /\[\s*R\s*\]\.pdf$/i

async function recorrer(dir: FileSystemDirectoryHandle, base: string, salida: { ruta: string; carpeta: FileSystemDirectoryHandle; nombre: string }[]) {
  for await (const [nombre, h] of (dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (nombre.startsWith('.sgdp-')) continue
    if (h.kind === 'directory') await recorrer(h as FileSystemDirectoryHandle, `${base}${nombre}/`, salida)
    else if (ES_FIRMADO_R.test(nombre)) salida.push({ ruta: `${base}${nombre}`, carpeta: dir, nombre })
  }
}

async function apartar(dir: FileSystemDirectoryHandle, ruta: string, carpeta: FileSystemDirectoryHandle, nombre: string, blob: Blob) {
  const cache = new Map<string, FileSystemDirectoryHandle>()
  const partes = ruta.split('/').filter(Boolean)
  partes.pop()
  const destino = await resolverDir(dir, cache, [CARPETA_IMPORTADOS, ...partes])
  const fh = await destino.getFileHandle(nombre, { create: true })
  const w = await fh.createWritable()
  await w.write(blob)
  await w.close()
  await carpeta.removeEntry(nombre)
}

export async function importarFirmados(
  dir: FileSystemDirectoryHandle,
  alProgresar?: (hecho: number, total: number, ruta: string) => void,
): Promise<FirmadoImportado[]> {
  const hallados: { ruta: string; carpeta: FileSystemDirectoryHandle; nombre: string }[] = []
  await recorrer(dir, '', hallados)
  const salida: FirmadoImportado[] = []
  let hecho = 0
  for (const f of hallados) {
    alProgresar?.(hecho, hallados.length, f.ruta)
    try {
      const archivo = await (await f.carpeta.getFileHandle(f.nombre)).getFile()
      const datos = new FormData()
      datos.append('archivo', archivo, f.nombre)
      datos.append('ruta', f.ruta)
      const r = await subirArchivo<FirmadoImportado>('/api/sync/firmado', datos)
      salida.push({ ...r, ruta: f.ruta })
      if (r.estado === 'incorporado' || r.estado === 'ya_estaba') {
        await apartar(dir, f.ruta, f.carpeta, f.nombre, archivo)
      }
    } catch (e) {
      salida.push({ ruta: f.ruta, estado: 'error', motivos: [e instanceof Error ? e.message : 'No se pudo mandar.'] })
    }
    hecho += 1
    alProgresar?.(hecho, hallados.length, f.ruta)
  }
  return salida
}

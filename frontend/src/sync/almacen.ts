// Persistencia de handles de carpeta elegidos por el usuario (IndexedDB, por
// origen). Dos usos, con CLAVES distintas para que no se pisen: la carpeta
// espejo de la sincronización ('carpeta') y la carpeta donde caen las
// descargas ('descargas', ver descargas.ts).
// Sobrevive a recargas en el MISMO origen; si el enlace público (origen)
// cambia, el usuario reelige la carpeta y el índice `.sgdp-sync.json` que vive
// DENTRO de la carpeta evita volver a descargar (ver sincronizador.ts).

const BD = 'sgdp_sync'
const TIENDA = 'handles'
const CLAVE = 'carpeta'

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(BD, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(TIENDA)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

export async function guardarHandle(
  h: FileSystemDirectoryHandle,
  clave: string = CLAVE,
): Promise<void> {
  const db = await abrir()
  try {
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(TIENDA, 'readwrite')
      tx.objectStore(TIENDA).put(h, clave)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function leerHandle(
  clave: string = CLAVE,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await abrir()
  try {
    return await new Promise<FileSystemDirectoryHandle | null>((res, rej) => {
      const tx = db.transaction(TIENDA, 'readonly')
      const req = tx.objectStore(TIENDA).get(clave)
      req.onsuccess = () => res((req.result as FileSystemDirectoryHandle) ?? null)
      req.onerror = () => rej(req.error)
    })
  } finally {
    db.close()
  }
}

export async function olvidarHandle(clave: string = CLAVE): Promise<void> {
  const db = await abrir()
  try {
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(TIENDA, 'readwrite')
      tx.objectStore(TIENDA).delete(clave)
      // Otra carpeta (o ninguna): lo que se sabía de la anterior ya no vale.
      if (clave === CLAVE) tx.objectStore(TIENDA).delete(CLAVE_MAPA)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } finally {
    db.close()
  }
}

// --- Mapa de lo sincronizado (2026-10-18) ----------------------------------------------------
// Qué archivo de la API está en la carpeta, y con qué versión: { '/api/documentos/12/pdf':
// { ruta: 'Oficios/OF-0012-…/OF-0012-….pdf', version: '123456-1760000000' } }. Lo escribe
// sincronizar() al terminar y lo lee carpetaLocal.ts para abrir sin servidor DESDE la carpeta, y
// para no guardar otra vez en el navegador lo que ya está en ella. Es de la cuenta que sincronizó.
export interface MapaSincronizado {
  cuenta: string
  carpeta: string
  hecho_en: number
  archivos: Record<string, { ruta: string; version: string }>
}

const CLAVE_MAPA = 'mapa'

export async function guardarMapa(m: MapaSincronizado): Promise<void> {
  const db = await abrir()
  try {
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(TIENDA, 'readwrite')
      tx.objectStore(TIENDA).put(m, CLAVE_MAPA)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function leerMapa(): Promise<MapaSincronizado | null> {
  const db = await abrir()
  try {
    return await new Promise<MapaSincronizado | null>((res, rej) => {
      const tx = db.transaction(TIENDA, 'readonly')
      const req = tx.objectStore(TIENDA).get(CLAVE_MAPA)
      req.onsuccess = () => res((req.result as MapaSincronizado) ?? null)
      req.onerror = () => rej(req.error)
    })
  } finally {
    db.close()
  }
}

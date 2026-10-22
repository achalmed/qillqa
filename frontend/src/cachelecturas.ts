/**
 * «LO ÚLTIMO VISTO»: copia local de las lecturas del sistema, para seguir viendo todo sin servidor.
 *
 * Edison (2026-10-12): «todos los servicios del sistema deben ser offline; no puede ser que cuando
 * se vaya el servidor o la línea se deje de visualizar la información; todo lo generado debe
 * seguir visualizándose». Cada GET de la API que sale bien deja aquí su copia (bandeja,
 * documentos, recibidos, agenda, tareas, chat, directorio, proyectos, semanas, inicio,
 * notificaciones…) y, si el servidor no contesta, contesta 5xx o tarda, api.ts muestra la última
 * con la franja «Sin conexión · mostrando lo guardado a las HH:MM». Los PDF ya abiertos y las
 * imágenes del chat se guardan igual, con un límite.
 *
 * Por qué aquí y no en el service worker: funciona en cualquier navegador (con o sin worker, en
 * el servidor de desarrollo también), sabe de QUIÉN es cada dato y puede borrarlo al cerrar sesión.
 *
 * Reglas:
 *   · IndexedDB (cabe mucho más que en localStorage, que queda para la cola de cambios y lo
 *     pequeño), con un respaldo en memoria si el navegador no lo da (modo privado, pruebas).
 *   · Separado POR CUENTA: la clave lleva la cuenta; al usar el sistema con otra cuenta se borra lo
 *     de las demás, y al cerrar sesión se borra todo. Un equipo puede ser compartido.
 *   · NUNCA: la mesa de partes pública (/api/publico/), tokens, sesiones, claves ni accesos
 *     (contraseñas, agenda/token, colab/acceso, prensa/sesion), la presencia ni el pulso
 *     (mostrarían «en línea» a quien no lo está), ni los sondeos incrementales del chat.
 *   · Límites: LIMITE_JSON lecturas y LIMITE_ARCHIVOS archivos (o LIMITE_BYTES_ARCHIVOS); al
 *     pasarse, se va lo usado hace más tiempo.
 */

// --- reglas puras (probadas en pruebas/sinconexion.test.ts) -----------------------------------

/** Lecturas JSON que se guardan como mucho, y tamaño máximo de cada una. */
export const LIMITE_JSON = 600
export const LIMITE_ENTRADA = 3 * 1024 * 1024
/** Archivos (PDF, imágenes del chat): cuántos y cuánto en total; uno solo no pasa de LIMITE_ARCHIVO. */
export const LIMITE_ARCHIVOS = 40
export const LIMITE_BYTES_ARCHIVOS = 120 * 1024 * 1024
export const LIMITE_ARCHIVO = 30 * 1024 * 1024

const NUNCA = [
  /^\/api\/publico\//, // mesa de partes pública: puede ser una cabina o el celular de otro
  /^\/api\/auth\//, // inicio de sesión, tokens
  /^\/api\/contrasenas/, // el módulo Contraseñas
  /^\/api\/presencia/, // quién está en línea: sin servidor sería mentira
  /^\/api\/health/,
  /^\/api\/fototeca/, // originales de varios MB y miniaturas por cada ajuste
  /^\/api\/chat\/ws/,
  /^\/api\/chat\/buscar/,
  /[?&](desde_id|antes_id)=/, // sondeos incrementales del chat: la primera página sí se guarda
  /(^|\/)(token|tokens|sesion|acceso|accesos|clave|claves|secreto|enlace-video)(\/|\?|$)/,
  /solicitudes-clave/,
  /\.ics(\?|$)/,
]

/** ¿Se guarda esta lectura JSON? */
export function cacheable(ruta: string): boolean {
  if (!ruta.startsWith('/api/')) return false
  if (/\/pdf(\/|\?|$)/.test(ruta) || ruta.includes('/adjuntos/') || ruta.includes('/expediente')) return false
  return !NUNCA.some((re) => re.test(ruta))
}

/** ¿Se guarda este archivo? PDF de documentos, proyectos y semanas, e imágenes del chat. */
export function archivoGuardable(ruta: string): boolean {
  if (!ruta.startsWith('/api/') || ruta.startsWith('/api/publico/')) return false
  return !NUNCA.slice(1).some((re) => re.test(ruta))
}

/** La cuenta normalizada (la de `qillqa_usuario`); vacía = no se guarda nada. */
export function normalizarCuenta(cuenta: string | null | undefined): string {
  return (cuenta ?? '').trim().toLowerCase()
}

/** Quita de la ruta los parámetros que solo rompen la caché del navegador (?v=, ?t=, ?_=). */
export function rutaEstable(ruta: string): string {
  const [base, consulta] = ruta.split('?')
  if (!consulta) return base
  const resto = consulta.split('&').filter((p) => p && !/^(v|t|_)=/.test(p))
  return resto.length ? `${base}?${resto.join('&')}` : base
}

export const claveDe = (cuenta: string, ruta: string): string => `${cuenta}|${rutaEstable(ruta)}`

export interface Indice {
  clave: string
  cuenta: string
  tipo: 'json' | 'archivo'
  tam: number
  usado_en: number
}

/** Claves a borrar para quedar dentro de los límites: primero lo usado hace más tiempo. */
export function aPodar(
  indice: Indice[],
  limites = { json: LIMITE_JSON, archivos: LIMITE_ARCHIVOS, bytesArchivos: LIMITE_BYTES_ARCHIVOS },
): string[] {
  const fuera: string[] = []
  const json = indice.filter((e) => e.tipo === 'json').sort((a, b) => b.usado_en - a.usado_en)
  fuera.push(...json.slice(limites.json).map((e) => e.clave))
  const archivos = indice.filter((e) => e.tipo === 'archivo').sort((a, b) => b.usado_en - a.usado_en)
  let bytes = 0
  archivos.forEach((e, i) => {
    bytes += e.tam
    if (i >= limites.archivos || bytes > limites.bytesArchivos) fuera.push(e.clave)
  })
  return fuera
}

/** «Sin conexión · mostrando lo guardado a las 09:41» (o «del 12/10, 09:41» si no es de hoy). */
export function textoFranja(guardadoEn: number | null, ahora: number = Date.now()): string {
  if (!guardadoEn) return 'Sin conexión · mostrando lo guardado en este equipo'
  const d = new Date(guardadoEn)
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const hoy = new Date(ahora)
  const mismoDia = d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate()
  if (mismoDia) return `Sin conexión · mostrando lo guardado a las ${hora}`
  return `Sin conexión · mostrando lo guardado el ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${hora}`
}

// --- almacén ------------------------------------------------------------------------------------

interface Registro extends Indice {
  datos?: unknown
  blob?: Blob
  tipoMime?: string
  guardado_en: number
}

/** Lo mínimo que se pide al almacén; IndexedDB en el navegador, memoria en las pruebas. */
export interface Almacen {
  leer(clave: string): Promise<Registro | undefined>
  escribir(r: Registro): Promise<void>
  tocar(clave: string, usado_en: number): Promise<void>
  indice(): Promise<Indice[]>
  borrar(claves: string[]): Promise<void>
  vaciar(): Promise<void>
}

export function almacenEnMemoria(): Almacen {
  const m = new Map<string, Registro>()
  return {
    leer: async (c) => m.get(c),
    escribir: async (r) => void m.set(r.clave, r),
    tocar: async (c, u) => {
      const r = m.get(c)
      if (r) r.usado_en = u
    },
    indice: async () => [...m.values()].map(({ clave, cuenta, tipo, tam, usado_en }) => ({ clave, cuenta, tipo, tam, usado_en })),
    borrar: async (cs) => cs.forEach((c) => m.delete(c)),
    vaciar: async () => m.clear(),
  }
}

const BD = 'qillqa-sin-conexion'
const DATOS = 'lecturas'
const INDICE = 'indice'

function almacenIndexedDB(): Almacen | null {
  if (typeof indexedDB === 'undefined') return null
  let bd: Promise<IDBDatabase> | null = null
  const abrir = () =>
    (bd ??= new Promise<IDBDatabase>((resolver, rechazar) => {
      const pedido = indexedDB.open(BD, 1)
      pedido.onupgradeneeded = () => {
        pedido.result.createObjectStore(DATOS, { keyPath: 'clave' })
        pedido.result.createObjectStore(INDICE, { keyPath: 'clave' })
      }
      pedido.onsuccess = () => resolver(pedido.result)
      pedido.onerror = () => rechazar(pedido.error)
      pedido.onblocked = () => rechazar(new Error('IndexedDB bloqueado'))
    }).catch((e) => {
      bd = null
      throw e
    }))
  const tx = async <T>(tiendas: string[], modo: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> => {
    const db = await abrir()
    return new Promise((resolver, rechazar) => {
      const t = db.transaction(tiendas, modo)
      const pedido = fn(t)
      t.oncomplete = () => resolver(pedido ? pedido.result : undefined)
      t.onerror = () => rechazar(t.error)
      t.onabort = () => rechazar(t.error)
    })
  }
  return {
    leer: (clave) => tx<Registro>([DATOS], 'readonly', (t) => t.objectStore(DATOS).get(clave) as IDBRequest<Registro>),
    escribir: async (r) => {
      const { clave, cuenta, tipo, tam, usado_en } = r
      await tx([DATOS, INDICE], 'readwrite', (t) => {
        t.objectStore(DATOS).put(r)
        t.objectStore(INDICE).put({ clave, cuenta, tipo, tam, usado_en })
      })
    },
    tocar: async (clave, usado_en) => {
      await tx([INDICE], 'readwrite', (t) => {
        const s = t.objectStore(INDICE)
        const p = s.get(clave)
        p.onsuccess = () => p.result && s.put({ ...p.result, usado_en })
      })
    },
    indice: async () => (await tx<Indice[]>([INDICE], 'readonly', (t) => t.objectStore(INDICE).getAll() as IDBRequest<Indice[]>)) ?? [],
    borrar: async (claves) => {
      if (!claves.length) return
      await tx([DATOS, INDICE], 'readwrite', (t) => {
        for (const c of claves) {
          t.objectStore(DATOS).delete(c)
          t.objectStore(INDICE).delete(c)
        }
      })
    },
    vaciar: async () => {
      await tx([DATOS, INDICE], 'readwrite', (t) => {
        t.objectStore(DATOS).clear()
        t.objectStore(INDICE).clear()
      })
    },
  }
}

// --- uso ----------------------------------------------------------------------------------------

let almacen: Almacen = almacenIndexedDB() ?? almacenEnMemoria()
let respaldoMemoria: Almacen | null = null
/** Si IndexedDB falla (cuota, modo privado), se sigue en memoria: nunca a costa de la operación. */
async function usar<T>(fn: (a: Almacen) => Promise<T>): Promise<T> {
  try {
    return await fn(almacen)
  } catch {
    respaldoMemoria ??= almacenEnMemoria()
    almacen = respaldoMemoria
    return fn(almacen)
  }
}

/** Para las pruebas: otro almacén y otra fuente de la cuenta. */
let leerCuenta = (): string => {
  try {
    return normalizarCuenta(localStorage.getItem('qillqa_usuario'))
  } catch {
    return ''
  }
}
export function configurar(a: Almacen, cuenta: () => string): void {
  almacen = a
  leerCuenta = cuenta
  depurada = ''
  escrituras = 0
}

let depurada = ''
let escrituras = 0

/** Una vez por cuenta y carga: lo de otras cuentas, fuera. */
async function depurarAjenas(cuenta: string): Promise<void> {
  if (depurada === cuenta) return
  depurada = cuenta
  await usar(async (a) => a.borrar((await a.indice()).filter((e) => e.cuenta !== cuenta).map((e) => e.clave)))
}

async function podar(): Promise<void> {
  await usar(async (a) => a.borrar(aPodar(await a.indice())))
}

async function escribir(r: Omit<Registro, 'clave' | 'cuenta' | 'usado_en' | 'guardado_en'>, ruta: string): Promise<void> {
  const cuenta = leerCuenta()
  if (!cuenta) return
  await depurarAjenas(cuenta)
  const ahora = Date.now()
  await usar((a) => a.escribir({ ...r, clave: claveDe(cuenta, ruta), cuenta, usado_en: ahora, guardado_en: ahora }))
  escrituras += 1
  if (r.tipo === 'archivo' || escrituras % 25 === 0) await podar()
}

async function leer(ruta: string): Promise<Registro | undefined> {
  const cuenta = leerCuenta()
  if (!cuenta) return undefined
  await depurarAjenas(cuenta)
  const clave = claveDe(cuenta, ruta)
  const r = await usar((a) => a.leer(clave))
  if (r && r.cuenta === cuenta) {
    void usar((a) => a.tocar(clave, Date.now())).catch(() => undefined)
    return r
  }
  return undefined
}

/** Guarda la respuesta de un GET que salió bien (`tam`: largo del texto, para el límite). */
export async function guardar(ruta: string, datos: unknown, tam = 0): Promise<void> {
  if (!cacheable(ruta) || tam > LIMITE_ENTRADA) return
  try {
    await escribir({ tipo: 'json', datos, tam }, ruta)
  } catch {
    /* sin sitio: el sistema funciona igual, solo que sin copia local */
  }
}

/** La última copia conocida de una lectura, o null. */
export async function recuperar<T>(ruta: string): Promise<{ datos: T; guardado_en: number } | null> {
  if (!cacheable(ruta)) return null
  try {
    const r = await leer(ruta)
    return r && r.tipo === 'json' ? { datos: r.datos as T, guardado_en: r.guardado_en } : null
  } catch {
    return null
  }
}

/** Guarda un archivo ya abierto (PDF, imagen del chat) para verlo sin red. */
export async function guardarArchivo(ruta: string, blob: Blob): Promise<void> {
  if (!archivoGuardable(ruta) || blob.size > LIMITE_ARCHIVO) return
  try {
    await escribir({ tipo: 'archivo', blob, tipoMime: blob.type, tam: blob.size }, ruta)
  } catch {
    /* idem */
  }
}

export async function recuperarArchivo(ruta: string): Promise<{ blob: Blob; guardado_en: number } | null> {
  if (!archivoGuardable(ruta)) return null
  try {
    const r = await leer(ruta)
    return r && r.tipo === 'archivo' && r.blob ? { blob: r.blob, guardado_en: r.guardado_en } : null
  } catch {
    return null
  }
}

/** Borra las copias de estos archivos (los que ya están en la carpeta sincronizada, 2026-10-18:
 *  no se guardan dos veces). */
export async function olvidarArchivos(rutas: string[]): Promise<void> {
  const cuenta = leerCuenta()
  if (!cuenta || !rutas.length) return
  try {
    await usar((a) => a.borrar(rutas.map((r) => claveDe(cuenta, r))))
  } catch {
    /* nada que borrar */
  }
}

/** Borra todas las copias (al cerrar sesión, y al abrir sin sesión). */
export async function limpiar(): Promise<void> {
  depurada = ''
  try {
    await usar((a) => a.vaciar())
  } catch {
    /* nada que borrar */
  }
}

/** Las copias de antes de 2026-10-13 vivían en localStorage (qillqa_lectura:*): se retiran. */
export function retirarCopiasViejas(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('qillqa_lectura:'))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* sin localStorage */
  }
}

// Cliente de la API: agrega el token de sesión y traduce errores.

import * as cache from './cachelecturas'
import { abrirDeCarpeta, enLaCarpeta, versionDeRespuesta } from './sync/carpetaLocal'
import { guardarEn, type Destino } from './descargas'
import { marcarApagado, moduloApagadoDe } from './modulos'
import { ErrorApi } from '@qillqa/tiqsi'

/**
 * Error de la API que CONSERVA el detalle estructurado del servidor.
 *
 * Algunos rechazos no son solo un mensaje: el 409 de «verifique las copias»
 * viene con la lista de copias a confirmar, y la interfaz necesita esos datos
 * para abrir el diálogo en vez de limitarse a mostrar un texto rojo.
 */
// Es la clase del contrato de Tiqsi (fase 10.2b): la MISMA en Qillqa y en los módulos aislados, para que
// `e instanceof ErrorApi` valga en ambos lados.
export { ErrorApi }

const token = () => localStorage.getItem('qillqa_token')

// «Lo último visto» (cachelecturas.ts): las copias de antes vivían en localStorage y se retiran; y
// si se abre sin sesión, no debe quedar nada de nadie (el cierre de sesión pudo cortarse a medias).
cache.retirarCopiasViejas()
if (!token()) void cache.limpiar()

// Clave TEMPORAL con la que se acaba de entrar, guardada SOLO en memoria (nunca
// en localStorage): la pantalla de cambio la trae ya escrita y la persona solo
// elige la nueva (Edison 2026-10-01: «no debería ser necesario realizar pasos
// adicionales»). Se pierde con un refresco, y entonces se vuelve a pedir.
let claveTemporal = ''
export const recordarClaveTemporal = (clave: string) => {
  claveTemporal = clave
}
export const claveTemporalRecordada = () => claveTemporal

export function cerrarSesion(): void {
  // Fuera de línea en el acto para el resto del equipo (api/presencia.py);
  // si el servidor no contesta, la presencia caduca sola en 10 minutos.
  const t = token()
  if (t) {
    void fetch('/api/presencia', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` },
      keepalive: true,
    }).catch(() => {})
  }
  // Las sesiones de los editores de Prensa son cookies aparte (Tullpu, Kuyuy y Awana, solo en su carpeta): se borran también.
  void fetch('/api/fotos/sesion', { method: 'DELETE', keepalive: true }).catch(() => {})
  void fetch('/api/videos/sesion', { method: 'DELETE', keepalive: true }).catch(() => {})
  void fetch('/api/piezas/editor/sesion', { method: 'DELETE', keepalive: true }).catch(() => {})
  claveTemporal = ''
  localStorage.removeItem('qillqa_token')
  localStorage.removeItem('qillqa_usuario')
  localStorage.removeItem('qillqa_nombre')
  localStorage.removeItem('qillqa_rol')
  localStorage.removeItem('qillqa_clave_temporal')
  localStorage.removeItem('qillqa_datos_pendientes')
  localStorage.removeItem('qillqa_preferencias')
  localStorage.removeItem('qillqa_pasos_ingreso')
  // El modo sin conexión guarda las respuestas de /api para poder mostrarlas
  // sin servidor. Son datos de ESTE usuario y el equipo puede ser compartido:
  // al cerrar sesión se borran (ver public/sw.js).
  navigator.serviceWorker?.controller?.postMessage('qillqa:limpiar-api')
  navigator.serviceWorker?.controller?.postMessage('sgdp:limpiar-api')   // un worker de antes del 2026-10-22 aún activo
  void cache.limpiar()
  // La bandeja guarda sus filas en sessionStorage para volver rápido: son de
  // ESTE usuario y no deben asomarse a quien entre después en la pestaña.
  try {
    sessionStorage.clear()
  } catch {
    /* sin sessionStorage */
  }
  window.location.href = '/login'
}

/**
 * Última lectura servida desde el caché local en vez del servidor.
 *
 * `navigator.onLine` no sirve para esto: dice si hay interfaz de red, no si el
 * servidor contesta —y el caso típico de la entidad es tener wifi pero la
 * laptop-servidor apagada—. Esta marca la pone el service worker en la
 * respuesta (`X-Qillqa-Cache`), así que es la señal fiable.
 */
export const EVENTO_CACHE = 'qillqa:cache'
let sirviendoDeCache = false
/** Cuándo se guardó la copia que se está mostrando (para «mostrando lo guardado a las HH:MM»). */
let guardadoDeLaCopia: number | null = null

export function leyendoDeCache(): boolean {
  return sirviendoDeCache
}

/** Hora en que se guardó la última copia mostrada sin servidor (null si no se sabe). */
export function momentoDeLaCopia(): number | null {
  return guardadoDeLaCopia
}

/** ¿Se puede contar con el servidor ahora mismo? Lo usan las acciones que NO
 *  admiten trabajar a ciegas: numerar y cambiar de estado. */
export function hayServidor(): boolean {
  return navigator.onLine && !sirviendoDeCache
}

function marcarCache(deCache: boolean, guardadoEn?: number): void {
  const momento = deCache ? (guardadoEn ?? guardadoDeLaCopia) : null
  if (deCache === sirviendoDeCache && momento === guardadoDeLaCopia) return
  sirviendoDeCache = deCache
  guardadoDeLaCopia = momento
  window.dispatchEvent(new CustomEvent(EVENTO_CACHE))
}

/** El servidor volvió a contestar (lo comprueba la franja de «sin conexión» con /api/health). */
export function confirmarServidor(): void {
  marcarCache(false)
}

function marcarOrigen(respuesta: Response): void {
  // El service worker marca lo que sirvió de su propio caché; una respuesta
  // sin esa marca vino del servidor de verdad.
  // `X-SGDP-Cache`: la pone un worker de antes del 2026-10-22 hasta que el navegador lo cambie por el nuevo.
  marcarCache(respuesta.headers.get('X-Qillqa-Cache') !== null || respuesta.headers.get('X-SGDP-Cache') !== null)
}

// El servidor responde 428 `clave_temporal` mientras la cuenta siga usando la
// clave que entregó el administrador: no hay nada que hacer en el sistema
// hasta elegir una propia, así que se manda a esa pantalla. La marca en
// localStorage es solo para que la pantalla sepa que NO puede cancelarse; la
// que manda de verdad es la respuesta del servidor.
function exigirClavePropia(): void {
  localStorage.setItem('qillqa_clave_temporal', 'si')
  if (!window.location.pathname.startsWith('/clave')) {
    window.location.href = '/clave'
  }
}

// 428 `datos_pendientes` (2026-10-18): la contraseña ya es propia, pero falta el paso de bienvenida.
function exigirDatos(): void {
  localStorage.setItem('qillqa_datos_pendientes', 'si')
  if (!/^\/(bienvenida|clave)/.test(window.location.pathname)) {
    window.location.href = '/bienvenida'
  }
}

/**
 * ¿Esta respuesta significa «el servidor no está», y no «el servidor dice que
 * no»?
 *
 * No basta con capturar el fallo de red: la web se sirve con un proxy delante,
 * y cuando la API está caída el proxy contesta 500 en vez de dejar morir la
 * conexión. Para el usuario es el mismo caso —no hay servidor— y debe ver sus
 * datos guardados igual. Un 4xx, en cambio, SÍ es el servidor hablando (sesión
 * vencida, permiso, documento inexistente) y no se disimula con una copia.
 */
function servidorCaido(estado: number, respuesta?: Response): boolean {
  if (estado === 502 || estado === 503 || estado === 504) return true
  // Un 500 solo cuenta como «sin servidor» si NO lo emitió la API: uvicorn firma sus
  // respuestas con `server: uvicorn`; el proxy, cuando no alcanza la API, contesta un 500
  // vacío sin esa cabecera. Un 500 de la API es un error del servidor, no una
  // desconexión: tratarlo como «sin conexión» ponía la barra «Sin servidor» y encolaba
  // el guardado con internet perfecto (Edison 2026-10-10, segunda vuelta).
  if (estado !== 500) return false
  const servidor = respuesta?.headers.get('server') ?? ''
  return !/uvicorn/i.test(servidor)
}

/** El mismo criterio para quien ya tiene un `ErrorApi`: ¿fue «sin servidor» o el servidor hablando? Vive en Tiqsi
 *  web (los módulos aislados lo usan igual, fase 10.2b). */
export { esSinServidor } from '@qillqa/tiqsi'

/**
 * Lo que se espera al servidor en una LECTURA antes de mostrar la copia guardada (si la hay). Con
 * el enlace público colgado (pasa: el túnel corta el TLS y la conexión queda abierta sin datos)
 * una pantalla se quedaba cargando para siempre; ahora, pasado el plazo, se ve lo último guardado
 * con la franja de «sin conexión», y la respuesta, si llega, deja la copia al día.
 */
const ESPERA_LECTURA_MS = 6000
/** Sin copia, una lectura no espera más que esto: «sin conexión» en vez de cargar sin fin. */
const ESPERA_MAXIMA_MS = 45_000

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const esLectura = (opciones.method ?? 'GET').toUpperCase() === 'GET'
  if (!esLectura || !cache.cacheable(ruta) || opciones.signal) return pedir<T>(ruta, opciones, esLectura)
  const corte = new AbortController()
  const tope = window.setTimeout(() => corte.abort(), ESPERA_MAXIMA_MS)
  const peticion = pedir<T>(ruta, { ...opciones, signal: corte.signal }, true).finally(() => window.clearTimeout(tope))
  let plazo = 0
  const respaldo = new Promise<T>((resolver) => {
    plazo = window.setTimeout(() => {
      void cache.recuperar<T>(ruta).then((guardado) => {
        if (!guardado) return
        marcarCache(true, guardado.guardado_en)
        resolver(guardado.datos)
      })
    }, ESPERA_LECTURA_MS)
  })
  peticion.catch(() => undefined) // si ya ganó la copia, el fallo de la red no queda suelto
  try {
    return await Promise.race([peticion, respaldo])
  } finally {
    window.clearTimeout(plazo)
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit, esLectura: boolean): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(ruta, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      },
    })
  } catch (fallo) {
    // El servidor no contestó. En una LECTURA se devuelve la última copia
    // conocida —es lo que permite seguir viendo los documentos sin servidor—;
    // en una escritura se propaga, para que quien llama decida si encola.
    if (esLectura) {
      const guardado = await cache.recuperar<T>(ruta)
      if (guardado) {
        marcarCache(true, guardado.guardado_en)
        return guardado.datos
      }
    }
    marcarCache(true)
    // «Failed to fetch» es el texto crudo del navegador y ha costado horas al
    // despacho dos veces: al verlo bajo el campo de contraseña se lee como
    // «clave incorrecta» y se pide restablecerla, cuando lo que pasa es que no
    // se llegó al servidor (si la clave estuviera mal, la API contestaría 401
    // con su propio mensaje). Se traduce a algo que diga qué hacer. El estado
    // 503 NO es decorativo: `EditorDocumento` encola el guardado sin conexión
    // cuando el error no es un ErrorApi «o» su estado es >= 500, así que un 0
    // aquí dejaría de encolar y se perderia el trabajo escrito sin servidor.
    throw new ErrorApi(
      'No se pudo conectar con el servidor. Revise su conexión; si sigue igual, ' +
        'la computadora que hace de servidor puede estar apagada o sin internet. ' +
        'No es un problema de su contraseña.',
      { codigo: 'sin_conexion', causa: String((fallo as Error)?.message ?? fallo) },
      503,
    )
  }
  // El proxy contesta 5xx cuando la API no responde: mismo caso, misma salida.
  if (esLectura && servidorCaido(respuesta.status, respuesta)) {
    const guardado = await cache.recuperar<T>(ruta)
    marcarCache(true, guardado?.guardado_en)
    if (guardado) return guardado.datos
    throw new ErrorApi(
      'El servidor no responde y no hay copia guardada de estos datos.',
      { codigo: 'sin_servidor' },
      respuesta.status,
    )
  }
  // Una ESCRITURA que topa con el proxy sin API es «sin servidor», no un error del servidor: así
  // quien la hizo puede encolarla (el chat, el editor) en vez de mostrar «error inesperado (500)».
  if (!esLectura && servidorCaido(respuesta.status, respuesta)) {
    marcarCache(true)
    throw new ErrorApi(
      'No se pudo conectar con el servidor: la computadora que hace de servidor puede estar ' +
        'apagada o sin internet. Inténtelo de nuevo cuando vuelva.',
      { codigo: 'sin_servidor' },
      503,
    )
  }
  marcarOrigen(respuesta)
  if (respuesta.status === 401 && !ruta.includes('/auth/')) {
    cerrarSesion()
    throw new Error('Sesión vencida')
  }
  if (respuesta.status === 428) {
    const cuerpo = await respuesta.json().catch(() => null)
    if ((cuerpo as { detail?: { codigo?: string } } | null)?.detail?.codigo === 'datos_pendientes') {
      exigirDatos()
      throw new Error('Complete sus datos para empezar.')
    }
    exigirClavePropia()
    throw new Error('Debe elegir una contraseña propia antes de continuar.')
  }
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null)
    const detalle = (cuerpo as { detail?: unknown } | null)?.detail
    // Un módulo apagado en Administración (2026-10-18): el menú se pone al día y el error dice su mensaje.
    const apagado = respuesta.status === 403 ? moduloApagadoDe(detalle) : null
    if (apagado) marcarApagado(apagado.modulo, apagado.mensaje)
    throw new ErrorApi(
      typeof detalle === 'string'
        ? detalle
        : ((detalle as { mensaje?: string } | undefined)?.mensaje ??
            // Un 500 sin explicación es un fallo del servidor, no algo que la persona hizo mal.
            (respuesta.status >= 500
              ? `El servidor tuvo un error inesperado (${respuesta.status}). Lo escrito no se perdió en esta pantalla; si se repite, avise al administrador.`
              : `Error ${respuesta.status}`)),
      detalle,
      respuesta.status,
    )
  }
  const texto = await respuesta.text()
  const datos = JSON.parse(texto) as T
  if (esLectura) void cache.guardar(ruta, datos, texto.length)
  return datos
}

// Sube un archivo (multipart). NO fija Content-Type: fetch pone el boundary
// solo cuando el body es FormData.
export async function subirArchivo<T>(
  ruta: string,
  datos: FormData,
  metodo: 'POST' | 'PUT' = 'POST',
): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      body: datos,
    })
  } catch {
    respuesta = new Response(null, { status: 503 })
  }
  // Sin servidor, una subida no se puede encolar (un archivo no cabe en la cola): se dice en una
  // línea, con el código que permite ofrecer «hacerlo al volver» (alvolver.ts), en vez del
  // «Failed to fetch» del navegador o un «Error 500» del proxy.
  if (servidorCaido(respuesta.status, respuesta)) {
    marcarCache(true)
    throw new ErrorApi('Subir archivos necesita el servidor; inténtelo cuando vuelva la conexión.', { codigo: 'sin_servidor' }, 503)
  }
  if (respuesta.status === 401) {
    cerrarSesion()
    throw new Error('Sesión vencida')
  }
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null)
    const detalle = (cuerpo as { detail?: unknown } | null)?.detail
    // ErrorApi (es un Error): conserva el detalle estructurado, p. ej. el 409
    // `anula_firma` con sus consecuencias (vigencia.ts).
    throw new ErrorApi(
      typeof detalle === 'string'
        ? detalle
        : ((detalle as { mensaje?: string } | undefined)?.mensaje ?? `Error ${respuesta.status}`),
      detalle,
      respuesta.status,
    )
  }
  return respuesta.json() as Promise<T>
}

// Los archivos de la entidad se piden SIEMPRE revalidando (Edison 2026-09-08:
// el visor mostraba la hora vieja de un oficio ya corregido). El servidor ya
// manda `Cache-Control: private, no-cache` (backend/app/api/archivos.py), y
// esto lo refuerza desde el cliente: `cache: 'no-cache'` obliga al navegador a
// preguntar con el ETag en vez de servir su copia. No es `no-store`: cuando el
// archivo no cambió, la respuesta es un 304 de unos bytes.
const SIN_CACHE: RequestInit = { cache: 'no-cache' }

/** Lo que se espera a un PDF antes de abrir la copia guardada (si la hay). */
const ESPERA_ARCHIVO_MS = 12_000

/**
 * Un archivo autenticado, con «lo último visto»: si sale bien se guarda (cachelecturas.ts, con
 * límite); si no hay servidor, contesta 5xx o tarda, se devuelve la copia de la última vez.
 *
 * Carpeta sincronizada (2026-10-18): si el archivo está en la carpeta que la persona sincronizó,
 * sin servidor se abre de ahí (sync/carpetaLocal.ts) y no se guarda otra vez en el navegador; solo
 * si el servidor tiene una versión más nueva que la de la carpeta, esa se guarda.
 */
async function archivoConRespaldo(ruta: string, guardar: boolean): Promise<{ blob: Blob; respuesta: Response | null }> {
  const desdeCopia = async (): Promise<{ blob: Blob; respuesta: null } | null> => {
    // Lo guardado en el navegador (solo lo que se guarda: una descarga no) y, si no, la carpeta.
    const g = guardar ? await cache.recuperarArchivo(ruta) : null
    const copia = g ? { blob: g.blob, momento: g.guardado_en } : await abrirDeCarpeta(ruta).then((c) => c && { blob: c.blob, momento: c.hecho_en })
    if (!copia) return null
    marcarCache(true, copia.momento)
    return { blob: copia.blob, respuesta: null }
  }
  const red = (async () => {
    let respuesta: Response
    try {
      respuesta = await fetch(ruta, { ...SIN_CACHE, headers: token() ? { Authorization: `Bearer ${token()}` } : {} })
    } catch {
      const copia = await desdeCopia()
      if (copia) return copia
      throw new ErrorApi('Sin conexión, y este archivo no se abrió antes en este equipo.', { codigo: 'sin_conexion' }, 503)
    }
    if (servidorCaido(respuesta.status, respuesta)) {
      const copia = await desdeCopia()
      if (copia) return copia
    }
    if (respuesta.status === 401) {
      cerrarSesion()
      throw new Error('Sesión vencida')
    }
    if (!respuesta.ok) throw new ErrorApi(`No se pudo obtener el archivo (${respuesta.status}).`, null, respuesta.status)
    const blob = await respuesta.blob()
    if (guardar) {
      const version = versionDeRespuesta(blob.size, respuesta.headers.get('last-modified'))
      void enLaCarpeta(ruta, version).then((ya) => (ya ? undefined : cache.guardarArchivo(ruta, blob)))
    }
    return { blob, respuesta }
  })()
  if (!guardar) return red
  red.catch(() => undefined)
  let plazo = 0
  const respaldo = new Promise<{ blob: Blob; respuesta: null }>((resolver) => {
    plazo = window.setTimeout(() => void desdeCopia().then((c) => c && resolver(c)), ESPERA_ARCHIVO_MS)
  })
  try {
    return await Promise.race([red, respaldo])
  } finally {
    window.clearTimeout(plazo)
  }
}

// Descarga el PDF autenticado y devuelve una URL local para el visor. Lo ya abierto se puede ver
// sin red (2026-10-13).
export async function apiPdf(ruta: string): Promise<string> {
  try {
    const { blob } = await archivoConRespaldo(ruta, true)
    return URL.createObjectURL(blob)
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 503) throw e
    throw new Error('No se pudo obtener el PDF.')
  }
}

/** Nombre de archivo de una cabecera Content-Disposition (RFC 5987 o simple). */
function nombreDeCabecera(cd: string | null): string {
  if (!cd) return ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (m) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      /* sigue con el simple */
    }
  }
  const s = /filename="?([^";]+)"?/i.exec(cd)
  return s ? s[1] : ''
}

/**
 * El archivo REAL del servidor: su contenido y su nombre oficial (el que
 * manda en Content-Disposition). Base de la descarga y de la copia.
 */
export async function traerArchivo(
  ruta: string,
  nombre = '',
): Promise<{ blob: Blob; nombre: string }> {
  // Las imágenes y archivos del chat se guardan para verlos sin red (2026-10-13); las descargas
  // de documentos, no: van a la carpeta de la persona y deben ser las del servidor.
  const guardar = ruta.startsWith('/api/chat/archivos/')
  const { blob, respuesta } = await archivoConRespaldo(ruta, guardar)
  return {
    blob,
    nombre:
      nombre || nombreDeCabecera(respuesta?.headers.get('content-disposition') ?? null) || 'documento.pdf',
  }
}

/**
 * Descarga un archivo autenticado y lo guarda DONDE el usuario haya elegido
 * (descargas.ts): su carpeta recordada, un «Guardar como…», o la carpeta de
 * descargas del navegador. Todos los botones de descarga del sistema pasan por
 * aquí, así que la preferencia vale en la bandeja y dentro del documento sin
 * tener que repetir la lógica en cada pantalla.
 *
 * Cancelar el diálogo del sistema devuelve 'cancelado': no es un error y no
 * debe pintarse como tal.
 */
export async function descargarArchivo(
  ruta: string,
  nombre = '',
): Promise<Destino | 'cancelado'> {
  const archivo = await traerArchivo(ruta, nombre)
  try {
    return await guardarEn(archivo.blob, archivo.nombre)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
    throw e
  }
}

// Descarga el PDF del documento (añade .pdf si el nombre no lo trae).
export async function descargarPdf(
  ruta: string,
  nombre: string,
): Promise<Destino | 'cancelado'> {
  return descargarArchivo(ruta, nombre.endsWith('.pdf') ? nombre : `${nombre}.pdf`)
}

// Descarga un archivo autenticado como Blob, para escribirlo en el disco del
// dispositivo con la File System Access API (sincronización a carpeta local).
export async function descargarBlob(ruta: string): Promise<Blob> {
  // Sin esto, la sincronización a la carpeta local (y al USB) podía escribir
  // los bytes viejos del caché del navegador aunque el manifiesto ya dijera
  // que el archivo cambió.
  const respuesta = await fetch(ruta, {
    ...SIN_CACHE,
    headers: token() ? { Authorization: `Bearer ${token()}` } : {},
  })
  if (respuesta.status === 401) {
    cerrarSesion()
    throw new Error('Sesión vencida')
  }
  if (!respuesta.ok) throw new Error(`No se pudo descargar (${respuesta.status}).`)
  return respuesta.blob()
}

/** Descarga un archivo que NO es de la entidad (un .md generado, el .zip de la extensión) directo
 *  a la carpeta de descargas del navegador: no pasa por la carpeta recordada ni por «Guardar
 *  como» (2026-10-05; 2026-10-18 también la extensión, que Chrome descomprime desde Descargas).
 *  Devuelve el nombre con que se guardó. */
export async function descargarDirecto(ruta: string, nombreSugerido = ''): Promise<string> {
  const { blob, nombre } = await traerArchivo(ruta, nombreSugerido)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  return nombre
}

/** Nombre histórico de `descargarDirecto` (los .md de la Semana). */
export const descargarTexto = descargarDirecto

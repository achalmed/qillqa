/**
 * MODO SIN CONEXIÓN (Edison 2026-09-05).
 *
 * «Que los usuarios puedan continuar trabajando aunque el servidor deje de
 * estar disponible.» La laptop de la entidad hace de servidor: cuando se apaga
 * o pierde internet, hoy no se puede ni entrar.
 *
 * Qué se puede y qué no, y por qué:
 *
 *   SÍ, sin servidor:  abrir el sistema, ver los documentos que ya se
 *                      cargaron, escribir y guardar. Lo guardado se queda en
 *                      el equipo y sube solo al volver la conexión.
 *   NO, nunca:         numerar, cambiar de estado, subir archivos. El
 *                      correlativo oficial es un CONTADOR ÚNICO; dos equipos
 *                      numerando a ciegas producen dos oficios 0060 o un
 *                      hueco, y eso no se deshace. Prohibirlo no es una
 *                      limitación técnica: es la regla de la entidad.
 *
 * La cola vive en localStorage (síncrono: sobrevive a un cierre brusco de la
 * pestaña, que es justo cuando hace falta) y admite: guardados de documentos
 * (PUT, el último reemplaza al anterior); desde 2026-10-13, los mensajes del
 * chat, y desde 2026-10-18 las escrituras más usadas (comentar una tarea u
 * observar un documento, crear una tarea, anotar una actuación): POST, cada uno
 * el suyo, en orden. Nada de numerar, y nada de archivos: un adjunto no cabe.
 * Lo que exige el servidor se ofrece «hacerlo al volver» (alvolver.ts).
 *
 * Nada se pierde: lo que el servidor rechaza al subir no se tira, queda en
 * «No enviados» (este equipo, por cuenta) con su texto para copiarlo, y el
 * guardado de un documento rechazado se aparta para «Cargar mis cambios».
 */

const CLAVE_COLA = 'qillqa_cola_sin_conexion'

import { guardarApartado, type ContenidoApartado } from './apartados.ts'
export { claveApartadosAnteriores, claveConflicto, escribirApartadosAnteriores, guardarApartado, leerApartadosAnteriores, type ContenidoApartado } from './apartados.ts'

function apartarConflicto(ruta: string, cuerpo: string): boolean {
  const m = /\/api\/documentos\/(\d+)/.exec(ruta)
  if (!m) return false
  try {
    const datos = JSON.parse(cuerpo) as Omit<ContenidoApartado, 'apartado_en'>
    guardarApartado(m[1], { ...datos, apartado_en: Date.now() })
    return true
  } catch {
    return false
  }
}

/** Qué es cada escritura de la cola (para los «En espera» de cada pantalla). Sin dato = documento
 * (PUT) o mensaje del chat (POST), como en las colas de antes de 2026-10-18. */
export type TipoCambio = 'documento' | 'mensaje' | 'comentario' | 'observacion' | 'tarea' | 'actuacion'

export interface CambioPendiente {
  id: string
  tipo?: TipoCambio
  /** Ruta de la API a reintentar (PUT de documentos o POST de mensajes del chat). */
  ruta: string
  /** Sin dato = PUT (las colas de antes de 2026-10-13 solo tenían documentos). */
  metodo?: 'PUT' | 'POST'
  /** De quién es (2026-10-13): solo se envía con la sesión de esa misma cuenta. Un mensaje del
   * chat escrito por una persona jamás sale firmado por quien entre después en el equipo. */
  cuenta?: string
  cuerpo: string
  /** Para mostrarlo en el aviso: «Oficio S/N — Pedido de información…». */
  rotulo: string
  creado_en: number
}

const cuentaActual = (): string => (localStorage.getItem('qillqa_usuario') ?? '').trim().toLowerCase()

/** ¿Este cambio se puede enviar con la sesión de `cuenta`? (los de antes no tenían cuenta). */
export const esDeLaCuenta = (c: Pick<CambioPendiente, 'cuenta'>, cuenta: string): boolean => !c.cuenta || c.cuenta === cuenta

function leerCola(): CambioPendiente[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLA) || '[]') as CambioPendiente[]
  } catch {
    return []
  }
}

function escribirCola(cola: CambioPendiente[]): void {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola))
  } catch {
    /* cuota llena o modo privado: la cola es best-effort */
  }
}

/** Los cambios de esta cuenta que esperan a que vuelva la conexión. */
export function pendientes(): CambioPendiente[] {
  const cuenta = cuentaActual()
  return leerCola().filter((c) => esDeLaCuenta(c, cuenta))
}

/**
 * Encola un guardado. Si ya había uno del MISMO documento lo reemplaza: lo que
 * importa es el último estado del documento, no la historia de tecleos.
 */
export function encolar(ruta: string, cuerpo: string, rotulo: string): void {
  const cuenta = cuentaActual()
  const cola = leerCola().filter((c) => !(c.ruta === ruta && esDeLaCuenta(c, cuenta)))
  cola.push({ id: `${ruta}-${Date.now()}`, ruta, cuerpo, rotulo, creado_en: Date.now(), cuenta })
  escribirCola(cola)
  avisar()
}

/**
 * Encola una escritura hecha sin servidor (2026-10-13 el chat; 2026-10-18 comentarios, tareas y
 * actuaciones). A diferencia de un guardado, cada una es la suya: no reemplaza a las anteriores y se
 * envían en el orden en que se hicieron.
 */
export function encolarEscritura(ruta: string, cuerpo: string, rotulo: string, tipo: TipoCambio): void {
  const cola = leerCola()
  cola.push({ id: `${ruta}-${Date.now()}-${cola.length}`, ruta, metodo: 'POST', tipo, cuerpo, rotulo, creado_en: Date.now(), cuenta: cuentaActual() })
  escribirCola(cola)
  avisar()
}

/** Encola un mensaje del chat escrito sin servidor (2026-10-13). */
export function encolarMensaje(ruta: string, cuerpo: string, rotulo: string): void {
  encolarEscritura(ruta, cuerpo, rotulo, 'mensaje')
}

/** El cuerpo de un cambio como objeto (vacío si no se puede leer). */
export function cuerpoDe(c: Pick<CambioPendiente, 'cuerpo'>): Record<string, unknown> {
  try {
    const o = JSON.parse(c.cuerpo) as unknown
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Pura: las escrituras (POST) de `cuenta` a `ruta` que cumplen `filtro` (sobre su cuerpo). */
export function filtrarEnEspera(
  cola: CambioPendiente[],
  ruta: string,
  cuenta: string,
  filtro?: (cuerpo: Record<string, unknown>) => boolean,
): CambioPendiente[] {
  return cola.filter((c) => c.metodo === 'POST' && c.ruta === ruta && esDeLaCuenta(c, cuenta) && (!filtro || filtro(cuerpoDe(c))))
}

/** Lo que espera para una ruta de envío (los «En espera» de cada pantalla). */
export function enEspera(ruta: string, filtro?: (cuerpo: Record<string, unknown>) => boolean): CambioPendiente[] {
  return filtrarEnEspera(leerCola(), ruta, cuentaActual(), filtro)
}

/** Los mensajes del chat que esperan para una conversación (su ruta de envío). */
export function mensajesEnEspera(ruta: string): CambioPendiente[] {
  return enEspera(ruta)
}

export function quitar(id: string): void {
  escribirCola(leerCola().filter((c) => c.id !== id))
  avisar()
}

// --- No enviados (2026-10-18) -------------------------------------------
// Lo que el servidor rechazó al subir la cola (403, 422…). Antes se descartaba y solo se decía su
// rótulo; Edison: «avisa de conflictos sin perder nada». Ahora queda aquí, por cuenta, con su
// cuerpo, hasta que la persona lo copie o lo descarte (FranjaSinConexion → «Ver»).
const CLAVE_NO_ENVIADOS = 'qillqa_no_enviados'
const MAX_NO_ENVIADOS = 30

export interface NoEnviado extends CambioPendiente {
  estado: number
  motivo: string
  rechazado_en: number
}

function leerNoEnviados(): NoEnviado[] {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE_NO_ENVIADOS) || '[]')
    return Array.isArray(l) ? (l as NoEnviado[]) : []
  } catch {
    return []
  }
}

function escribirNoEnviados(l: NoEnviado[]): void {
  try {
    localStorage.setItem(CLAVE_NO_ENVIADOS, JSON.stringify(l.slice(-MAX_NO_ENVIADOS)))
  } catch {
    /* sin sitio */
  }
}

export function noEnviados(): NoEnviado[] {
  const cuenta = cuentaActual()
  return leerNoEnviados().filter((c) => esDeLaCuenta(c, cuenta))
}

export function descartarNoEnviado(id: string): void {
  escribirNoEnviados(leerNoEnviados().filter((c) => c.id !== id))
  avisar()
}

/** Pura: el texto legible de un cambio (lo que la persona escribió), para copiarlo. */
export function textoLegible(c: Pick<CambioPendiente, 'cuerpo'>): string {
  const o = cuerpoDe(c)
  for (const k of ['texto', 'titulo']) if (typeof o[k] === 'string' && o[k]) return o[k] as string
  const campos = o.campos as Record<string, unknown> | undefined
  if (campos && typeof campos === 'object') {
    return Object.entries(campos).filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => `${k}: ${v}`).join('\n')
  }
  return c.cuerpo
}

/** Pura: qué hacer con la respuesta del servidor a un cambio de la cola. */
export type Destino = 'subido' | 'apartar' | 'no_enviado' | 'esperar' | 'detener'
export function destinoDe(estado: number, metodo: 'PUT' | 'POST'): Destino {
  if (estado >= 200 && estado < 300) return 'subido'
  // Sesión vencida o clave temporal: el cambio es bueno, falta la sesión. Se conserva y se para.
  if (estado === 401 || estado === 428) return 'detener'
  // El guardado de un documento rechazado (versión, firma, validación) se aparta: el editor lo
  // ofrece al abrirlo («Cargar mis cambios»). Si el documento ya no existe, a «No enviados».
  if (metodo === 'PUT' && estado >= 400 && estado < 500 && estado !== 404) return 'apartar'
  if (estado >= 400 && estado < 500) return 'no_enviado'
  return 'esperar' // 5xx: el servidor puede estar arrancando
}

/**
 * Intenta subir todo lo pendiente. Devuelve cuántos se subieron.
 *
 * Un fallo de RED deja todo en la cola para el próximo intento. Lo que el
 * servidor RECHAZA no se reintenta (nunca va a entrar) pero tampoco se pierde:
 * el guardado de un documento se aparta en este equipo y el editor lo ofrece
 * al abrirlo (2026-09-14; desde 2026-10-18 también si lo rechazó por algo que
 * no es la versión); lo demás va a «No enviados», con su texto.
 */
type Resultado = { subidos: number; rechazados: string[]; conflictos: string[] }
let enCurso: Promise<Resultado> | null = null

export function sincronizar(): Promise<Resultado> {
  // Una sola subida a la vez: la franja del marco y la barra de la bandeja pueden pedirla juntas,
  // y dos recorridos de la misma cola enviarían dos veces el mismo mensaje del chat.
  enCurso ??= subirCola().finally(() => {
    enCurso = null
  })
  return enCurso
}

async function motivoDe(r: Response): Promise<string> {
  const cuerpo = (await r.json().catch(() => null)) as { detail?: unknown } | null
  const d = cuerpo?.detail
  if (typeof d === 'string') return d
  const m = (d as { mensaje?: string } | undefined)?.mensaje
  return m ?? `Error ${r.status}`
}

async function subirCola(): Promise<Resultado> {
  const token = localStorage.getItem('qillqa_token')
  if (!token) return { subidos: 0, rechazados: [], conflictos: [] }
  let subidos = 0
  const rechazados: string[] = []
  const conflictos: string[] = []
  for (const cambio of pendientes()) {
    const metodo = cambio.metodo ?? 'PUT'
    let r: Response
    try {
      r = await fetch(cambio.ruta, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: cambio.cuerpo,
      })
    } catch {
      // Sigue sin haber red: se conserva y se reintenta más tarde.
      break
    }
    // El proxy sin API contesta 500 sin la firma de uvicorn: es «sin servidor», no un rechazo.
    if (r.status === 500 && !/uvicorn/i.test(r.headers.get('server') ?? '')) break
    const destino = destinoDe(r.status, metodo)
    if (destino === 'detener') break
    if (destino === 'esperar') continue
    if (destino === 'subido') {
      subidos += 1
      if (metodo === 'PUT') await conciliarRespaldo(cambio, r)
    } else if (destino === 'apartar' && apartarConflicto(cambio.ruta, cambio.cuerpo)) {
      conflictos.push(cambio.rotulo)
    } else {
      const motivo = await motivoDe(r)
      escribirNoEnviados([...leerNoEnviados(), { ...cambio, estado: r.status, motivo, rechazado_en: Date.now() }])
      rechazados.push(cambio.rotulo)
    }
    quitar(cambio.id)
  }
  return { subidos, rechazados, conflictos }
}

/**
 * El guardado de un documento subió (2026-10-18): el respaldo local `qillqa_respaldo_<id>` del editor
 * guardaba la versión BASE de antes, así que al reabrir se descartaba («hay una versión más
 * reciente») aunque su contenido fuera el que acababa de subir. Si el respaldo es lo mismo que subió,
 * se retira; si tiene algo más nuevo (se siguió escribiendo tras encolar), se le pone la versión que el
 * servidor devolvió para que el editor lo ofrezca al abrir. Pura salvo el localStorage: `respaldoTrasSubir`.
 */
export function respaldoTrasSubir(respaldo: string | null, cuerpoSubido: string, versionNueva: number | null): string | null {
  if (!respaldo) return null
  try {
    const r = JSON.parse(respaldo) as { campos?: unknown; cuerpo?: unknown; base?: number }
    const b = JSON.parse(cuerpoSubido) as { campos?: unknown; cuerpo?: unknown }
    const igual = JSON.stringify(r.cuerpo ?? null) === JSON.stringify(b.cuerpo ?? null) && JSON.stringify(r.campos ?? null) === JSON.stringify(b.campos ?? null)
    if (igual) return null
    return versionNueva == null ? respaldo : JSON.stringify({ ...r, base: versionNueva })
  } catch {
    return respaldo
  }
}

async function conciliarRespaldo(cambio: CambioPendiente, r: Response): Promise<void> {
  const m = /^\/api\/documentos\/(\d+)$/.exec(cambio.ruta)
  if (!m) return
  const clave = `qillqa_respaldo_${m[1]}`
  let version: number | null = null
  try {
    const d = (await r.clone().json()) as { version?: number } | null
    version = typeof d?.version === 'number' ? d.version : null
  } catch {
    /* sin cuerpo: se deja el respaldo como está */
  }
  try {
    const nuevo = respaldoTrasSubir(localStorage.getItem(clave), cambio.cuerpo, version)
    if (nuevo === null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, nuevo)
  } catch {
    /* sin localStorage: nada que conciliar */
  }
}

// --- aviso a la interfaz ----------------------------------------------
// Un evento propio: la barra de estado se entera de la cola sin que cada
// pantalla tenga que consultarla en un temporizador.
const EVENTO = 'qillqa:cola'
function avisar(): void {
  window.dispatchEvent(new CustomEvent(EVENTO))
}

export function alCambiarCola(fn: () => void): () => void {
  window.addEventListener(EVENTO, fn)
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener(EVENTO, fn)
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

/**
 * Registra el service worker (solo en el build; ver public/sw.js).
 *
 * Cada publicación trae un sw.js distinto (vite.publicacion.ts) y el navegador lo busca al abrir;
 * como la aplicación instalada en el celular puede quedarse abierta días, además se pregunta al
 * volver a ella (cada 30 min como mucho).
 */
export function registrarServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registro) => {
        let ultima = Date.now()
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - ultima < 30 * 60_000) return
          ultima = Date.now()
          registro.update().catch(() => undefined)
        })
      })
      .catch(() => {
        /* sin service worker el sistema funciona igual, solo que sin abrir sin red */
      })
  })
}

/** Al volver la conexión, subir lo pendiente sin que nadie lo pida. */
export function sincronizarAlVolver(alTerminar?: (subidos: number) => void): void {
  window.addEventListener('online', () => {
    void sincronizar().then(({ subidos }) => subidos > 0 && alTerminar?.(subidos))
  })
}

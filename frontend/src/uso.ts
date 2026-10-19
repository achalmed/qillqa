/**
 * ESTADÍSTICAS DE USO (2026-10-19, Edison: «telemetría propia, sin servicios externos, sin pedir
 * permiso por registro, sin contenido»). Esta pestaña anota hechos y los manda en LOTES a
 * `POST /api/uso`: cada vista de un módulo (ruta sin ids ni query, cuánto duró), cada error de
 * JavaScript (mensaje y pila recortados) y el arranque de la pestaña; siempre con el aparato (ancho,
 * alto, celular/tableta/escritorio) y la versión de la web (`/version.json`, la que escribe
 * vite.publicacion.ts en cada build; «desarrollo» sin ella). Se manda cada medio minuto y al ocultar
 * o cerrar la pestaña con `navigator.sendBeacon` (que no admite cabeceras: la sesión va en el
 * cuerpo). NUNCA viaja contenido: ni textos, ni asuntos, ni nombres de terceros, ni mensajes del chat
 * ni búsquedas (`anonimizarRuta` quita los ids y la query). Qué se recoge y qué no:
 * docs/decisiones.md. Lo puro (anonimizar, aparato, recortar) se prueba en pruebas/uso.test.ts.
 */

export interface HechoUso {
  accion: 'vista' | 'error' | 'arranque'
  momento: number
  modulo: string
  ruta: string
  duracion_ms?: number
  aparato: string
  ancho: number
  alto: number
  version: string
  detalle?: string
}

const MAX_LOTE = 50
const CADA_MS = 30_000
export const MAX_DETALLE = 700

/** «/documentos/132?x=1#y» → «/documentos/:id». Pura. */
export function anonimizarRuta(ruta: string): string {
  const r = (ruta || '').split('?')[0].split('#')[0].trim() || '/'
  return r.replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/[0-9a-f]{16,}(?=\/|$)/g, '/:id').slice(0, 120)
}

/** El módulo al que pertenece una ruta: su primer tramo («documentos», «proyectos»…); «inicio» para «/». Pura. */
export function moduloDeRuta(ruta: string): string {
  const tramo = (ruta || '/').split('?')[0].split('/')[1] ?? ''
  return tramo || 'inicio'
}

/** Celular, tableta o escritorio por el ancho (los cortes del tema: 600 y 900). Pura. */
export const aparatoDe = (ancho: number): string => (ancho < 600 ? 'celular' : ancho < 900 ? 'tableta' : 'escritorio')

/** El detalle de un error: mensaje y las primeras líneas de la pila, recortados. Pura. */
export function detalleDeError(mensaje: unknown, pila?: unknown): string {
  const m = String(mensaje ?? '').replace(/\s+/g, ' ').trim()
  const lineas = String(pila ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lineas[0] && lineas[0].replace(/\s+/g, ' ') === m) lineas.shift()
  return [m, ...lineas.slice(0, 8)].filter(Boolean).join('\n').slice(0, MAX_DETALLE)
}

let cola: HechoUso[] = []
let version = 'desarrollo'
let vistaActual: { ruta: string; modulo: string; desde: number } | null = null
let iniciado = false

const aparato = () => ({ aparato: aparatoDe(window.innerWidth), ancho: window.innerWidth, alto: window.innerHeight })

function anotar(h: Omit<HechoUso, 'momento' | 'aparato' | 'ancho' | 'alto' | 'version'>) {
  cola.push({ ...h, momento: Date.now(), ...aparato(), version })
  if (cola.length >= MAX_LOTE) enviar()
}

/** Manda lo acumulado. Con `cerrando`, por sendBeacon (sobrevive a cerrar la pestaña). */
export function enviar(cerrando = false): void {
  const token = localStorage.getItem('sgdp_token')
  if (!token || cola.length === 0) { cola = []; return }
  const cuerpo = JSON.stringify({ sesion: token, eventos: cola })
  cola = []
  if (cerrando && typeof navigator.sendBeacon === 'function') {
    if (navigator.sendBeacon('/api/uso', new Blob([cuerpo], { type: 'application/json' }))) return
  }
  void fetch('/api/uso', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: cuerpo, keepalive: true }).catch(() => {})
}

/** Cierra la vista en curso (anota su duración) y abre la de `ruta`. */
export function registrarVista(ruta: string): void {
  const ahora = Date.now()
  const r = anonimizarRuta(ruta)
  if (vistaActual) {
    if (vistaActual.ruta === r) return
    anotar({ accion: 'vista', modulo: vistaActual.modulo, ruta: vistaActual.ruta, duracion_ms: ahora - vistaActual.desde })
  }
  vistaActual = { ruta: r, modulo: moduloDeRuta(r), desde: ahora }
}

function cerrarVista(): void {
  if (!vistaActual) return
  anotar({ accion: 'vista', modulo: vistaActual.modulo, ruta: vistaActual.ruta, duracion_ms: Date.now() - vistaActual.desde })
  vistaActual = { ...vistaActual, desde: Date.now() }
}

export function registrarError(mensaje: unknown, pila?: unknown): void {
  anotar({ accion: 'error', modulo: vistaActual?.modulo ?? moduloDeRuta(location.pathname), ruta: anonimizarRuta(location.pathname), detalle: detalleDeError(mensaje, pila) })
}

/** Una vez por pestaña: errores globales, envío periódico y al ocultar o cerrar. */
export function iniciarUso(): void {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  // En desarrollo no hay version.json (lo escribe el build): queda «desarrollo» sin pedirlo.
  if (!import.meta.env.DEV) void fetch('/version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v: { version?: string } | null) => { if (v?.version) version = String(v.version).slice(0, 24) }).catch(() => {})
  window.addEventListener('error', (e) => registrarError(e.message, e.error instanceof Error ? e.error.stack : ''))
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; registrarError(r instanceof Error ? r.message : String(r ?? 'promesa rechazada'), r instanceof Error ? r.stack : '') })
  anotar({ accion: 'arranque', modulo: moduloDeRuta(location.pathname), ruta: anonimizarRuta(location.pathname) })
  window.setInterval(() => enviar(), CADA_MS)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { cerrarVista(); enviar(true) } })
  window.addEventListener('pagehide', () => { cerrarVista(); enviar(true) })
}

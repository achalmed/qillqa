/**
 * AVISOS PUSH en este dispositivo (2026-10-13; servidor en `backend/app/servicios/push.py`, manejo
 * del aviso en la sección «Avisos push» de `public/sw.js`).
 *
 * Activar = pedir permiso de notificaciones, suscribir el service worker al servicio de push del
 * navegador con la clave pública VAPID de Qillqa (`GET /api/push/clave`) y guardar la suscripción
 * para la cuenta (`POST /api/push/suscripciones`). Desactivar la quita en los dos lados. Al cerrar
 * sesión el service worker se da de baja solo (el equipo puede ser compartido).
 *
 * Requisitos: https (el enlace del Funnel lo es; `localhost` también vale para probar) y el service
 * worker registrado (solo en la web compilada: con `npm run dev` no hay worker y los avisos no se
 * pueden activar). En iPhone, solo con Qillqa instalado en la pantalla de inicio (iOS 16.4+).
 */
import { api } from '../../api'

export type EstadoAvisos = 'no-soportado' | 'sin-https' | 'sin-service-worker' | 'bloqueado' | 'inactivo' | 'activo'

const CLAVE = 'sgdp_push_activo'
const CLAVE_INVITACION = 'sgdp_push_invitacion'

function marcar(activo: boolean): void {
  try {
    if (activo) localStorage.setItem(CLAVE, '1')
    else localStorage.removeItem(CLAVE)
  } catch {
    /* sin almacenamiento */
  }
}

/** ¿Este dispositivo recibe avisos push? (lo último que se supo; `estadoAvisos` lo confirma). */
export function pushActivoAqui(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'
  } catch {
    return false
  }
}

export const soportaPush = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window

async function registro(esperarMs = 0): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const r = await navigator.serviceWorker.getRegistration()
  if (r || !esperarMs) return r ?? null
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((ok) => window.setTimeout(() => ok(null), esperarMs))])
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportaPush()) return 'no-soportado'
  if (!window.isSecureContext) return 'sin-https'
  const r = await registro()
  if (!r) return 'sin-service-worker'
  if (Notification.permission === 'denied') return 'bloqueado'
  const s = await r.pushManager.getSubscription().catch(() => null)
  const activo = Boolean(s) && Notification.permission === 'granted'
  marcar(activo)
  return activo ? 'activo' : 'inactivo'
}

/** La clave pública en base64url → los bytes que pide `PushManager.subscribe`. */
export function claveABytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4)
  const crudo = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length))
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i)
  return bytes
}

const mismaClave = (a: ArrayBuffer | null | undefined, b: Uint8Array): boolean => {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

/** «Chrome en Android», para reconocer el dispositivo en la base. */
export function describirDispositivo(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return so ? `${nav} en ${so}` : nav
}

async function guardar(s: PushSubscription): Promise<void> {
  const j = s.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  await api('/api/push/suscripciones', {
    method: 'POST',
    body: JSON.stringify({ endpoint: j.endpoint, keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' }, dispositivo: describirDispositivo() }),
  })
}

/** Pide permiso y suscribe este dispositivo. Devuelve el estado final. */
export async function activarAvisos(): Promise<EstadoAvisos> {
  const antes = await estadoAvisos()
  if (antes === 'no-soportado' || antes === 'sin-https' || antes === 'sin-service-worker' || antes === 'bloqueado') return antes
  const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueado' : 'inactivo'
  const r = await registro(8000)
  if (!r) return 'sin-service-worker'
  const { publica } = await api<{ publica: string }>('/api/push/clave')
  const clave = claveABytes(publica)
  let s = await r.pushManager.getSubscription()
  // Si el servidor cambió sus claves VAPID, la suscripción vieja ya no sirve: se rehace.
  if (s && !mismaClave(s.options?.applicationServerKey, clave)) {
    await s.unsubscribe().catch(() => false)
    s = null
  }
  s = s ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave }))
  await guardar(s)
  marcar(true)
  return 'activo'
}

export async function desactivarAvisos(): Promise<EstadoAvisos> {
  const r = await registro()
  const s = await r?.pushManager.getSubscription().catch(() => null)
  if (s) {
    await api('/api/push/suscripciones', { method: 'DELETE', body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => {})
    await s.unsubscribe().catch(() => false)
  }
  marcar(false)
  return estadoAvisos()
}

/** Al entrar: si este dispositivo ya estaba suscrito, se vuelve a guardar para ESTA cuenta (otra persona
 *  pudo entrar antes en el mismo equipo, o la base se restauró). Silencioso. */
export async function resincronizarAvisos(): Promise<void> {
  try {
    if (!soportaPush() || Notification.permission !== 'granted') return
    const s = await (await registro())?.pushManager.getSubscription()
    if (s) {
      await guardar(s)
      marcar(true)
    }
  } catch {
    /* sin red o sin worker: se intenta la próxima vez */
  }
}

/** ¿Mostrar la invitación breve del chat? Solo si se puede activar y nadie dijo «Ahora no». */
export async function invitarAvisos(): Promise<boolean> {
  try {
    if (localStorage.getItem(CLAVE_INVITACION)) return false
  } catch {
    return false
  }
  return (await estadoAvisos()) === 'inactivo'
}

export function descartarInvitacion(): void {
  try {
    localStorage.setItem(CLAVE_INVITACION, String(Date.now()))
  } catch {
    /* sin almacenamiento */
  }
}

/** Un aviso de prueba a los dispositivos de la cuenta. → cuántos lo aceptaron. */
export async function probarAvisos(): Promise<number> {
  return (await api<{ enviados: number }>('/api/push/probar', { method: 'POST' })).enviados
}

export const TEXTO_ESTADO: Record<EstadoAvisos, string> = {
  activo: 'Activos en este dispositivo',
  inactivo: 'Desactivados en este dispositivo',
  bloqueado: 'Bloqueados en el navegador: permítalos en los ajustes del sitio',
  'sin-https': 'Necesitan el enlace seguro (https) de Qillqa',
  'sin-service-worker': 'No disponibles en esta versión de prueba',
  'no-soportado': 'Este navegador no los admite (en iPhone, instale Qillqa en la pantalla de inicio)',
}

/** Al abrir una conversación, sus avisos del sistema operativo sobran: se retiran (`chat-<canal>`). */
export function cerrarAvisosDe(tag: string): void {
  if (!('serviceWorker' in navigator)) return
  void navigator.serviceWorker
    .getRegistration()
    .then((r) => r?.getNotifications({ tag }))
    .then((lista) => lista?.forEach((n) => n.close()))
    .catch(() => {})
}

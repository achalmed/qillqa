/**
 * AVISO DE LLEGADAS (Edison 2026-10-01: «que el sistema me indique solo a mí,
 * con un tono elegante, quién se conectó a Qillqa, para trabajar tranquilo»).
 *
 * Solo para la cuenta con rol `administrador`: los demás no lo oyen ni lo
 * ven. No hace otra consulta: compara cada lista del latido de presencia
 * (EquipoEnLinea, cada 30 s) con la anterior y anuncia a quien aparece. El
 * estado vive en el MÓDULO, no en el componente, para que cambiar de página no
 * repita el aviso; la primera lista solo fija la base (quien ya estaba al
 * abrir Qillqa no suena). Con dos pestañas abiertas suena una sola vez.
 *
 * El tono se sintetiza (Web Audio): dos notas suaves que se apagan solas, sin
 * archivos de audio. El navegador solo deja sonar tras un primer clic en la
 * página; hasta entonces el aviso se ve, pero no se oye.
 */
import type { Persona } from './componentes/EquipoEnLinea'

const PREFERENCIA = 'qillqa_aviso_llegadas'
const ULTIMO = 'qillqa_aviso_llegadas_ultimo'

export const esAdministrador = () => localStorage.getItem('qillqa_rol') === 'administrador'
export const avisoActivo = () => esAdministrador() && localStorage.getItem(PREFERENCIA) !== 'no'
export function fijarAviso(si: boolean) {
  localStorage.setItem(PREFERENCIA, si ? 'si' : 'no')
}

let presentes: Set<number> | null = null

/** Quienes aparecieron desde la lista anterior (nunca uno mismo). */
export function llegadas(lista: Persona[]): Persona[] {
  const ahora = new Set(lista.filter((p) => !p.yo && p.estado !== 'desconectado').map((p) => p.id))
  const previos = presentes
  presentes = ahora
  if (!previos) return []
  return lista.filter((p) => ahora.has(p.id) && !previos.has(p.id))
}

/** Otra pestaña ya anunció a estas personas hace menos de un minuto. */
export function yaAnunciado(personas: Persona[]): boolean {
  const clave = personas.map((p) => p.id).sort().join(',')
  try {
    const [c, t] = (localStorage.getItem(ULTIMO) ?? '').split('|')
    if (c === clave && Date.now() - Number(t) < 60_000) return true
    localStorage.setItem(ULTIMO, `${clave}|${Date.now()}`)
  } catch {
    /* sin almacenamiento: se anuncia igual */
  }
  return false
}

let ctx: AudioContext | null = null
function contexto(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  return ctx
}
// El navegador habilita el audio con el primer gesto en la página.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => void contexto()?.resume(), { once: true })
}

function nota(c: AudioContext, frecuencia: number, inicio: number, volumen: number) {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, inicio)
  g.gain.exponentialRampToValueAtTime(volumen, inicio + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + 1.4)
  g.connect(c.destination)
  // Fundamental y una octava muy tenue: timbre de campanilla, no de alarma.
  for (const [f, v] of [[frecuencia, 1], [frecuencia * 2, 0.18]] as const) {
    const o = c.createOscillator()
    const gv = c.createGain()
    o.type = 'sine'
    o.frequency.value = f
    gv.gain.value = v
    o.connect(gv).connect(g)
    o.start(inicio)
    o.stop(inicio + 1.5)
  }
}

/** Dos notas ascendentes (mi5 → si5), suaves y breves. */
export function campanilla() {
  const c = contexto()
  if (!c) return
  void c.resume()
  const t = c.currentTime + 0.02
  nota(c, 659.25, t, 0.07)
  nota(c, 987.77, t + 0.14, 0.055)
}

/** Texto del aviso: «Entró Ana Quispe (Oficio 112)». */
export function textoLlegada(personas: Persona[]): string {
  const donde = (p: Persona) => (p.proyecto ? ` (${p.proyecto})` : p.documento ? ` (${p.documento})` : '')
  if (personas.length === 1) return `Entró a Qillqa: ${personas[0].nombre}${donde(personas[0])}`
  return `Entraron a Qillqa: ${personas.map((p) => p.nombre).join(', ')}`
}

/** Notificación del escritorio, solo si la pestaña está oculta y hay permiso. */
export function notificarEscritorio(texto: string) {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification('Qillqa', { body: texto, silent: true, tag: 'qillqa-llegada' })
  } catch {
    /* algunos navegadores solo notifican desde un service worker */
  }
}

export function pedirPermisoEscritorio() {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
}

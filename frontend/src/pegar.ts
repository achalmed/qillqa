/**
 * PEGAR EL RESULTADO DE UN PROMPT (2026-10-11; `docs/plataforma/propuesta-automatizacion.md` §3).
 *
 * La parte pura y los tipos del mecanismo común: lo que devuelve `POST /api/<modulo>/pegar`
 * (la lectura, los campos propuestos y la tabla de diferencias), cómo se aplica lo aceptado
 * al formulario en memoria y qué queda como constancia (`POST /api/pegar/registrar`). El
 * componente que lo pinta es `componentes/PegarResultado.tsx`; el guardado sigue siendo
 * del formulario de cada módulo.
 */
import { useEffect, useState } from 'react'
import { ErrorApi, api } from './api'

import type { Diferencia } from './pegado'

export { aceptadasPorOmision, aplicarDiferencias, origenDePegado, textoValor, tipoDelBloque, valorDelBloque } from './pegado'
export type { Diferencia, EstadoDiferencia } from './pegado'

export interface LecturaPegado {
  tipo: string
  version: number | null
  titulo: string
  modulo: string
  fuente: 'yaml' | 'rotulos' | ''
  errores: string[]
  avisos: string[]
  /** clave → {valor, opciones}: lo que no casó con el vocabulario. */
  dudas: Record<string, { valor: string; opciones: string[] }>
}

export interface RespuestaPegado<P = Record<string, unknown>> {
  lectura: LecturaPegado
  campos: Record<string, unknown>
  informativos: Record<string, unknown>
  diferencias: Diferencia[]
  /** Lo que había fuera del bloque (el mensaje para el grupo). */
  resto: string
  propuestas?: P
}

export interface Formato {
  tipo: string
  version: number
  titulo: string
  modulo: string
  prompt: string
}

/** El 422 de un pegado que no es ningún formato: errores claros y qué se acepta. */
export interface PegadoInvalido {
  codigo: 'pegado_invalido'
  errores: string[]
  avisos: string[]
  formatos: Formato[]
}

export const esPegadoInvalido = (e: unknown): e is ErrorApi & { detalle: PegadoInvalido } =>
  e instanceof ErrorApi && typeof e.detalle === 'object' && e.detalle !== null && (e.detalle as { codigo?: string }).codigo === 'pegado_invalido'

/** El mensaje para la persona cuando el pegado falla: la primera causa, en una frase. */
export function mensajePegado(e: unknown): string {
  if (esPegadoInvalido(e)) return e.detalle.errores[0] ?? 'No se reconoció el formato.'
  return e instanceof Error ? e.message : 'No se pudo leer lo pegado.'
}

/** Llama al endpoint de pegado del módulo con el texto y la ficha como está en pantalla. */
export function pegarEn<P = Record<string, unknown>>(ruta: string, cuerpo: { texto: string; actual?: Record<string, unknown> } & Record<string, unknown>) {
  return api<RespuestaPegado<P>>(ruta, { method: 'POST', body: JSON.stringify(cuerpo) })
}

/** Constancia del pegado aplicado (tabla `pegados`); un fallo aquí no deshace el guardado. */
export async function registrarPegado(datos: {
  tipo: string
  version?: number | null
  fuente?: string
  texto: string
  campos_propuestos: Record<string, unknown>
  campos_aplicados: Record<string, unknown>
  rechazados: string[]
  entidad: string
}): Promise<void> {
  try {
    await api('/api/pegar/registrar', { method: 'POST', body: JSON.stringify(datos) })
  } catch {
    /* la constancia es secundaria: el registro ya se hizo por el módulo */
  }
}

/** Lo que la constancia necesita de un pegado aplicado sobre un formulario. */
export interface PegadoAplicado {
  tipo: string
  version: number | null
  fuente: string
  texto: string
  campos_propuestos: Record<string, unknown>
  aceptadas: Set<string>
  rechazadas: string[]
}

/** El prompt institucional que produce un formato (`GET /api/pegar/prompt/{tipo}`): texto, nombre
 *  y ruta en el vault; `disponible` dice si el texto está en esta máquina. */
export interface PromptDeFormato {
  tipo: string
  titulo: string
  ruta: string
  nombre: string
  texto: string
  disponible: boolean
}

export const promptDe = (tipo: string) => api<PromptDeFormato>(`/api/pegar/prompt/${encodeURIComponent(tipo)}`)

/** El texto de un mensaje del chat (`?pegar=<id>` desde «Registrar en …»). */
export async function textoDeMensaje(mid: number | string): Promise<string> {
  const m = await api<{ texto: string }>(`/api/chat/mensajes/${mid}`)
  return m.texto ?? ''
}

/** Copia un texto plano al portapapeles; sin portapapeles moderno (sin HTTPS), a la antigua. */
export async function copiarTexto(texto: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText === 'function' && window.isSecureContext) {
    await navigator.clipboard.writeText(texto)
    return
  }
  const caja = document.createElement('textarea')
  caja.value = texto
  Object.assign(caja.style, { position: 'fixed', left: '-10000px', top: '0' })
  document.body.appendChild(caja)
  caja.select()
  const ok = document.execCommand('copy')
  caja.remove()
  if (!ok) throw new Error('No se pudo copiar.')
}

/** Baja un texto como archivo `.md` a la carpeta de descargas del navegador. */
export function descargarMd(nombre: string, texto: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre.endsWith('.md') ? nombre : `${nombre}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Pausa breve tras «Leer» (2026-10-12): en los diálogos de pegado, «Registrar» aparece en el mismo
 * sitio que «Leer» y un doble toque en el celular registraba sin revisar. Devuelve `true` durante
 * `ms` milisegundos desde que la vista previa queda lista; el botón se desactiva mientras tanto. */
export function usePausaTrasLeer(listo: boolean, ms = 800): boolean {
  const [pausa, setPausa] = useState(false)
  useEffect(() => {
    if (!listo) return
    setPausa(true)
    const t = window.setTimeout(() => setPausa(false), ms)
    return () => window.clearTimeout(t)
  }, [listo, ms])
  return pausa
}

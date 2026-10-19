/**
 * LAS FOTOS DEL EQUIPO y la TARJETA DE CONTACTO (2026-10-12).
 *
 *  · `GET /api/usuarios/fotos` dice quién tiene foto y en qué versión; se pide una vez y se
 *    renueva cada 5 minutos o cuando alguien cambia la suya (`refrescarFotos`). Cada imagen se
 *    baja autenticada una sola vez por versión y queda como URL local (`blob:`).
 *  · `abrirTarjeta(id)` abre la tarjeta de contacto de esa persona desde cualquier pantalla: la
 *    escucha `TarjetaContacto`, montada una vez en el Marco.
 */
import { useEffect, useState } from 'react'
import { api } from '../../api'
import { rutaFoto } from '../../perfil'

const RENOVAR_MS = 5 * 60 * 1000
const EVENTO_TARJETA = 'sgdp:tarjeta'

let versiones: Record<string, string> = {}
let pedidoEn = 0
let enCurso: Promise<void> | null = null
const urls = new Map<string, Promise<string | null>>()
const oyentes = new Set<() => void>()
// Una foto que no bajó (la API reiniciándose, sin red) se vuelve a pedir más tarde, pocas veces.
const fallos = new Map<string, number>()
let reintento = 0
let reintentoProgramado = false
const REINTENTAR_MS = 15000
const MAX_FALLOS = 4

const avisar = () => oyentes.forEach((f) => f())

/** Pide (o renueva) el mapa de fotos. `forzar`: sin esperar los 5 minutos. */
export function refrescarFotos(forzar = false): Promise<void> {
  if (!localStorage.getItem('sgdp_token')) return Promise.resolve()
  if (enCurso) return enCurso
  if (!forzar && pedidoEn && Date.now() - pedidoEn < RENOVAR_MS) return Promise.resolve()
  pedidoEn = Date.now()
  enCurso = api<{ fotos: Record<string, string> }>('/api/usuarios/fotos')
    .then((r) => {
      versiones = r.fotos ?? {}
      avisar()
    })
    .catch(() => {})
    .finally(() => {
      enCurso = null
    })
  return enCurso
}

/** Tras subir o quitar la propia foto: la versión nueva entra al instante. */
export function ponerVersion(id: number, version: string): void {
  if (version) versiones = { ...versiones, [String(id)]: version }
  else {
    const { [String(id)]: _, ...resto } = versiones
    versiones = resto
  }
  avisar()
}

function urlDe(id: number, version: string): Promise<string | null> {
  const clave = `${id}:${version}`
  let p = urls.get(clave)
  if (!p) {
    const token = localStorage.getItem('sgdp_token')
    p = fetch(rutaFoto(id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null)
      .then((u) => {
        if (u === null) programarReintento(clave)
        return u
      })
    urls.set(clave, p)
  }
  return p
}

function programarReintento(clave: string): void {
  const n = (fallos.get(clave) ?? 0) + 1
  fallos.set(clave, n)
  urls.delete(clave)
  if (n >= MAX_FALLOS || reintentoProgramado) return
  reintentoProgramado = true
  window.setTimeout(() => {
    reintentoProgramado = false
    reintento += 1
    avisar()
  }, REINTENTAR_MS)
}

/** La URL local de la foto de una persona, o null (sin foto, o aún bajando). */
export function useFotoDe(id: number | null | undefined): string | null {
  const [, setTic] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const f = () => setTic((n) => n + 1)
    oyentes.add(f)
    void refrescarFotos()
    return () => {
      oyentes.delete(f)
    }
  }, [])
  const version = id ? versiones[String(id)] ?? '' : ''
  useEffect(() => {
    let vivo = true
    if (!id || !version) {
      setUrl(null)
      return
    }
    void urlDe(id, version).then((u) => vivo && setUrl(u))
    return () => {
      vivo = false
    }
  }, [id, version, reintento])
  return version ? url : null
}

/** Abre la tarjeta de contacto de la persona (la pinta `TarjetaContacto`). */
export function abrirTarjeta(id: number | null | undefined): void {
  if (!id) return
  window.dispatchEvent(new CustomEvent<number>(EVENTO_TARJETA, { detail: id }))
}

/** Para `TarjetaContacto`: escucha los pedidos de abrir una tarjeta. */
export function useTarjetaPedida(alPedir: (id: number) => void): void {
  useEffect(() => {
    const f = (e: Event) => alPedir((e as CustomEvent<number>).detail)
    window.addEventListener(EVENTO_TARJETA, f)
    return () => window.removeEventListener(EVENTO_TARJETA, f)
  }, [alPedir])
}

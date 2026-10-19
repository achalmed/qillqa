/**
 * EL AVATAR DE UN CONTACTO (2026-10-13): redondo, como en los Contactos de Android. Su foto del
 * directorio si la tiene; si no, la foto de perfil de su cuenta de Qillqa (si la tiene); si no, su
 * inicial sobre un color fijo de la paleta (contactos.ts → colorDe).
 *
 * La foto se baja autenticada una vez por versión (`?v=`) y queda como URL local (`blob:`).
 */
import { useEffect, useState } from 'react'
import Avatar from '@mui/material/Avatar'
import { PALETA } from '../../paleta'
import type { SxProps, Theme } from '@mui/material/styles'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { useFotoDe } from '../perfil/fotos'
import { colorDe, inicial } from './contactos'

const urls = new Map<string, Promise<string | null>>()

function urlFoto(id: number, version: string): Promise<string | null> {
  const clave = `${id}:${version}`
  let p = urls.get(clave)
  if (!p) {
    const token = localStorage.getItem('sgdp_token')
    p = fetch(`/api/directorio/personas/${id}/foto?v=${encodeURIComponent(version)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null)
      .then((u) => {
        if (u === null) urls.delete(clave)
        return u
      })
    urls.set(clave, p)
  }
  return p
}

/** La URL local de la foto del directorio de una persona (null sin foto o mientras baja). */
export function useFotoContacto(id: number | null | undefined, version: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    if (!id || !version) {
      setUrl(null)
      return
    }
    void urlFoto(id, version).then((u) => vivo && setUrl(u))
    return () => {
      vivo = false
    }
  }, [id, version])
  return url
}

export default function AvatarContacto({
  id,
  nombre,
  foto,
  usuarioId,
  tamano = 44,
  vistaPrevia,
  sx,
}: {
  id: number
  nombre: string
  /** Versión de la foto del directorio ('' o undefined: sin foto). */
  foto?: string
  /** La cuenta de Qillqa de la persona, para usar su foto de perfil si no hay otra. */
  usuarioId?: number | null
  tamano?: number
  /** Una imagen elegida y aún sin subir (formulario). */
  vistaPrevia?: string | null
  sx?: SxProps<Theme>
}) {
  const propia = useFotoContacto(id || null, foto)
  const deCuenta = useFotoDe(foto ? null : usuarioId ?? null)
  const src = vistaPrevia || propia || deCuenta || undefined
  const sinNombre = !nombre.trim()
  // Un contacto nuevo aún no tiene id: el color sale de su inicial (no cambia con cada letra).
  const color = id ? colorDe(id) : colorDe(nombre.trim().toLocaleUpperCase('es').charCodeAt(0) || 0)
  return (
    <Avatar
      src={src}
      alt={src ? nombre : undefined}
      sx={[
        { width: tamano, height: tamano, fontSize: tamano * 0.42, fontWeight: 600, bgcolor: sinNombre ? PALETA.apagado : color, color: '#fff', flexShrink: 0 },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {sinNombre ? <PersonOutlineIcon sx={{ fontSize: tamano * 0.55 }} /> : inicial(nombre)}
    </Avatar>
  )
}

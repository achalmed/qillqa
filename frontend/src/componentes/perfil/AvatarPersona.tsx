/**
 * EL AVATAR DE UNA PERSONA (2026-10-12): su foto de perfil si la tiene; si no, sus iniciales
 * sobre su color (`colorDePersona`), como hasta ahora en el chat.
 */
import Avatar from '@mui/material/Avatar'
import type { SxProps, Theme } from '@mui/material/styles'
import { iniciales } from '../EquipoEnLinea'
import { colorDePersona } from '../chat/mensajes'
import { useFotoDe } from './fotos'

export default function AvatarPersona({ id, nombre, tamano = 36, sx }: { id: number | null | undefined; nombre: string; tamano?: number; sx?: SxProps<Theme> }) {
  const foto = useFotoDe(id)
  return (
    <Avatar
      src={foto ?? undefined}
      alt={foto ? nombre : undefined}
      sx={[
        { width: tamano, height: tamano, fontSize: tamano * 0.38, bgcolor: colorDePersona(id ?? nombre), color: '#fff', fontWeight: 700 },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {iniciales(nombre)}
    </Avatar>
  )
}

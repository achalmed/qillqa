/**
 * LA FICHA DE UN CONTACTO (2026-10-13), como la de Google Contacts: arriba la foto, el nombre, el
 * cargo y la institución (enlace a su ficha, con su organigrama); debajo las acciones grandes
 * —Llamar, WhatsApp, Correo y Mensaje (si tiene cuenta en el chat)— y una fila por dato con
 * «Copiar». La estrella marca el favorito de quien mira; «Editar» abre el formulario.
 *
 * Quien tiene cuenta en Qillqa: su nombre, cargo, correo y celular se cambian en Mi perfil o en
 * Administración (docs/arquitectura.md §27); la ficha lo dice y el resto se edita aquí.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CallOutlinedIcon from '@mui/icons-material/CallOutlined'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import { api, descargarArchivo } from '../../api'
import { PALETA } from '../../paleta'
import { tratamientoLegible, type Institucion, type Persona } from '../../directorio'
import { idDelToken } from '@qillqa/rimay/publico'
import { FilaDato } from '../perfil/TarjetaContacto'
import { BotonCrearTarea } from '@qillqa/minka/publico'
import AvatarContacto from './AvatarContacto'
import { enlaceLlamada, enlaceWhatsapp, telefonoLegible } from './contactos'
import { moduloActivo } from '../../modulos'

function Accion({ texto, icono, href, alPulsar }: { texto: string; icono: React.ReactNode; href?: string; alPulsar?: () => void }) {
  const externo = href?.startsWith('http')
  const destino = href ? { component: 'a' as const, href, target: externo ? '_blank' : undefined, rel: externo ? 'noopener noreferrer' : undefined } : { onClick: alPulsar }
  return (
    <Button
      variant="outlined"
      {...destino}
      sx={{
        flex: '1 1 0', minWidth: 0, maxWidth: 120, flexDirection: 'column', gap: 0.4, py: 1.1, px: 0.5, borderRadius: 3, borderColor: 'divider',
        fontSize: 12.5, lineHeight: 1.2, textTransform: 'none', bgcolor: 'background.paper', '& svg': { fontSize: 24 },
      }}
    >
      {icono}
      {texto}
    </Button>
  )
}

export default function FichaContacto({
  p,
  inst,
  esAdmin,
  alEditar,
  alFavorito,
  alVerInstitucion,
  alDesactivar,
  alEtiqueta,
  alCerrar,
  alAvisar,
}: {
  p: Persona
  inst?: Institucion
  esAdmin: boolean
  alEditar: () => void
  alFavorito: (favorito: boolean) => void
  alVerInstitucion: (id: number) => void
  alDesactivar: () => void
  /** Tocar una etiqueta filtra la lista por ella. */
  alEtiqueta?: (etiqueta: string) => void
  /** En el celular, la flecha de volver; en escritorio, sin ella (la ficha va al lado). */
  alCerrar?: () => void
  alAvisar: (tipo: 'success' | 'error', texto: string) => void
}) {
  const navegar = useNavigate()
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const yo = idDelToken(localStorage.getItem('qillqa_token'))
  const invitado = localStorage.getItem('qillqa_rol') === 'invitado'
  const celular = p.celular || ''
  const correo = p.email || p.email_alterno
  const whatsapp = enlaceWhatsapp(celular)
  const puedeChatear = Boolean(p.usuario_id && p.usuario_id !== yo && !invitado && p.activo && moduloActivo('chat'))

  const enviarMensaje = async () => {
    try {
      const c = await api<{ id: number }>(`/api/chat/directo/${p.usuario_id}`, { method: 'POST' })
      navegar(`/chat?canal=${c.id}`)
    } catch {
      navegar(`/chat?directo=${p.usuario_id}`)
    }
  }
  const exportar = async () => {
    setMenu(null)
    try {
      await descargarArchivo(`/api/directorio/contactos/exportar?ids=${p.id}`, `${p.nombre.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'contacto'}.vcf`)
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo exportar.')
    }
  }

  const acciones = [
    celular && <Accion key="l" texto="Llamar" icono={<CallOutlinedIcon />} href={enlaceLlamada(celular)} />,
    whatsapp && <Accion key="w" texto="WhatsApp" icono={<WhatsAppIcon />} href={whatsapp} />,
    correo && <Accion key="c" texto="Correo" icono={<MailOutlineIcon />} href={`mailto:${correo}`} />,
    puedeChatear && <Accion key="m" texto="Mensaje" icono={<ChatOutlinedIcon />} alPulsar={() => void enviarMensaje()} />,
  ].filter(Boolean)

  const filas: { etiqueta: string; valor: string; copia?: string }[] = [
    celular && { etiqueta: 'Celular', valor: telefonoLegible(celular), copia: celular },
    p.telefono && { etiqueta: 'Teléfono', valor: telefonoLegible(p.telefono) + (p.anexo ? ` · anexo ${p.anexo}` : ''), copia: p.telefono },
    !p.telefono && p.anexo && { etiqueta: 'Anexo', valor: p.anexo },
    p.email && { etiqueta: 'Correo', valor: p.email },
    p.email_alterno && { etiqueta: 'Correo alterno', valor: p.email_alterno },
    p.area && { etiqueta: 'Área', valor: p.area },
    p.oficina && { etiqueta: 'Oficina o sede', valor: p.oficina },
  ].filter(Boolean) as { etiqueta: string; valor: string; copia?: string }[]

  return (
    <Box sx={{ px: { xs: 2, sm: 2.5 }, pb: 3, pt: 1, maxWidth: 680, mx: 'auto' }}>
      {/* Barra de la ficha: volver (celular), favorito, editar y «⋮». */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mx: -1 }}>
        {alCerrar && (
          <IconButton onClick={alCerrar} aria-label="Volver a la lista"><ArrowBackIcon /></IconButton>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={p.favorito ? 'Quitar de favoritos' : 'Agregar a favoritos'}>
          <IconButton onClick={() => alFavorito(!p.favorito)} aria-label={p.favorito ? 'Quitar de favoritos' : 'Agregar a favoritos'} aria-pressed={Boolean(p.favorito)}>
            {p.favorito ? <StarIcon sx={{ color: PALETA.dorado }} /> : <StarBorderIcon />}
          </IconButton>
        </Tooltip>
        {!invitado && (
          <Button startIcon={<EditOutlinedIcon />} onClick={alEditar} sx={{ textTransform: 'none' }}>Editar</Button>
        )}
        <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label="Más acciones del contacto"><MoreVertIcon /></IconButton>
        <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
          {!invitado && (
            <MenuItem onClick={() => void exportar()}>
              <ListItemIcon><FileDownloadOutlinedIcon fontSize="small" /></ListItemIcon>
              Exportar (.vcf)
            </MenuItem>
          )}
          {esAdmin && p.activo && (
            <MenuItem onClick={() => { setMenu(null); alDesactivar() }} sx={{ color: 'error.main' }}>
              <ListItemIcon sx={{ color: 'inherit' }}><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
              Desactivar
            </MenuItem>
          )}
        </Menu>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.25, mt: 0.5 }}>
        <AvatarContacto id={p.id} nombre={p.nombre} foto={p.foto} usuarioId={p.usuario_id} tamano={104} sx={{ mb: 1.25, fontSize: 44 }} />
        <Typography component="h2" sx={{ fontSize: { xs: 22, sm: 24 }, fontWeight: 500, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {p.nombre}
        </Typography>
        {(p.cargo || p.tratamiento) && (
          <Typography sx={{ fontSize: 14.5, color: 'text.secondary', lineHeight: 1.35 }}>
            {p.cargo || tratamientoLegible(p.tratamiento)}
          </Typography>
        )}
        {inst && (
          <Link component="button" onClick={() => alVerInstitucion(inst.id)} sx={{ fontSize: 14.5, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
            {inst.nombre}{inst.siglas ? ` (${inst.siglas})` : ''}
          </Link>
        )}
        {!p.activo && <Chip size="small" label="Inactivo: no se sugiere al redactar" sx={{ mt: 0.75 }} />}
      </Box>

      {acciones.length > 0 && <Box sx={{ display: 'flex', gap: 1, mt: 2.25, justifyContent: 'center' }}>{acciones}</Box>}

      {filas.length > 0 ? (
        <Box sx={{ mt: 2.25, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
          {filas.map((f) => <FilaDato key={f.etiqueta} etiqueta={f.etiqueta} valor={f.valor} copia={f.copia} />)}
        </Box>
      ) : (
        <Box sx={{ mt: 2.25, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">Sin celular ni correo todavía.</Typography>
          {!invitado && <Button size="small" onClick={alEditar} sx={{ mt: 0.5 }}>Agregar</Button>}
        </Box>
      )}

      {(p.etiquetas?.length ?? 0) > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>Etiquetas</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {p.etiquetas!.map((e) => <Chip key={e} label={e} size="small" variant="outlined" onClick={alEtiqueta ? () => alEtiqueta(e) : undefined} />)}
          </Box>
        </Box>
      )}

      {p.notas && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.25 }}>Notas</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.notas}</Typography>
        </Box>
      )}

      {p.usuario_id && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
          Tiene cuenta en Qillqa: su nombre, cargo, correo y celular se cambian en Mi perfil o en Administración.
        </Typography>
      )}

      {p.activo && !invitado && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <BotonCrearTarea vinculo={`persona:${p.id}`} texto={p.nombre} />
        </Box>
      )}
    </Box>
  )
}

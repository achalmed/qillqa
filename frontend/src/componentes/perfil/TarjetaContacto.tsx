/**
 * LA TARJETA DE CONTACTO (2026-10-12), como la «Info. del contacto» de WhatsApp: hoja inferior
 * en el celular, diálogo en escritorio. Se abre con `abrirTarjeta(id)` (fotos.ts) al tocar el
 * avatar o el nombre de alguien en el chat; se monta una sola vez, en el Marco.
 *
 * Arriba la foto, el nombre, cargo y rol, «En línea / Visto hace…» e «Info»; debajo las
 * acciones (Mensaje, Llamar, WhatsApp, Correo) y una fila por dato con su botón «Copiar». Qué
 * datos llegan lo decide el servidor (`servicios/perfil.py::tarjeta`): el DNI solo a la propia
 * persona o a quien administra; a un invitado, sin correo ni celular.
 */
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import CallOutlinedIcon from '@mui/icons-material/CallOutlined'
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined'
import CloseIcon from '@mui/icons-material/Close'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import { api } from '../../api'
import { PALETA } from '../../paleta'
import { ETIQUETA_ROL, celularLegible, enlaceCorreo, enlaceLlamada, type Tarjeta } from '../../perfil'
import { haceCuanto } from '../EquipoEnLinea'
import AvatarPersona from './AvatarPersona'
import { useTarjetaPedida } from './fotos'
import { moduloActivo } from '../../modulos'

/** Copiar al portapapeles: `navigator.clipboard` solo existe en https; por la red local (http)
 * se usa el método clásico con un campo oculto. */
export async function copiarTexto(texto: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      return await navigator.clipboard.writeText(texto)
    } catch {
      /* sin permiso o sin foco: se intenta el método clásico */
    }
  }
  // El campo oculto va junto al botón pulsado: dentro de una hoja o un diálogo, la trampa de
  // foco de MUI no deja seleccionar nada que esté fuera.
  const previo = document.activeElement as HTMLElement | null
  const t = document.createElement('textarea')
  t.value = texto
  t.setAttribute('readonly', '')
  t.style.position = 'fixed'
  t.style.opacity = '0'
  ;(previo?.parentElement ?? document.body).appendChild(t)
  t.select()
  const ok = document.execCommand('copy')
  t.remove()
  previo?.focus()
  if (!ok) throw new Error('No se pudo copiar.')
}

/** Una fila de dato: etiqueta pequeña arriba, valor abajo y el botón de texto «Copiar». */
export function FilaDato({ etiqueta, valor, copia }: { etiqueta: string; valor: string; copia?: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await copiarTexto(copia ?? valor)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1600)
    } catch {
      /* sin portapapeles: el dato sigue a la vista */
    }
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.9, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.3 }}>{etiqueta}</Typography>
        <Typography sx={{ fontSize: 15, overflowWrap: 'anywhere' }}>{valor}</Typography>
      </Box>
      <Button size="small" onClick={() => void copiar()} sx={{ flexShrink: 0, minWidth: 76, color: copiado ? PALETA.exito : 'primary.main' }}>
        {copiado ? 'Copiado' : 'Copiar'}
      </Button>
    </Box>
  )
}

function Accion({ texto, icono, href, alPulsar }: { texto: string; icono: React.ReactNode; href?: string; alPulsar?: () => void }) {
  const externo = href?.startsWith('http')
  const destino = href ? { component: 'a' as const, href, target: externo ? '_blank' : undefined, rel: externo ? 'noopener noreferrer' : undefined } : { onClick: alPulsar }
  return (
    <Button
      variant="outlined"
      {...destino}
      sx={{ flex: '1 1 0', minWidth: 0, flexDirection: 'column', gap: 0.25, py: 1, px: 0.5, borderRadius: 2.5, borderColor: 'divider', fontSize: 12.5, lineHeight: 1.2, textTransform: 'none', '& svg': { fontSize: 22 } }}
    >
      {icono}
      {texto}
    </Button>
  )
}

function estadoDe(t: Tarjeta): string {
  if (t.estado === 'en_linea') return 'En línea'
  if (t.estado === 'ausente') return `Ausente · ${haceCuanto(t.ultima_actividad)}`
  return t.ultima_actividad ? `Visto ${haceCuanto(t.ultima_actividad)}` : 'Sin conexión reciente'
}

function Contenido({ t, alCerrar }: { t: Tarjeta; alCerrar: () => void }) {
  const navegar = useNavigate()
  const ir = (ruta: string) => {
    alCerrar()
    navegar(ruta)
  }
  // Abre (o crea) el directo con una sola petición desde el clic y entra al canal.
  const enviarMensaje = async () => {
    try {
      const c = await api<{ id: number }>(`/api/chat/directo/${t.id}`, { method: 'POST' })
      ir(`/chat?canal=${c.id}`)
    } catch {
      ir(`/chat?directo=${t.id}`)
    }
  }
  const acciones = [
    t.puede_chatear && moduloActivo('chat') && <Accion key="m" texto="Mensaje" icono={<ChatOutlinedIcon />} alPulsar={() => void enviarMensaje()} />,
    t.celular && <Accion key="l" texto="Llamar" icono={<CallOutlinedIcon />} href={enlaceLlamada(t.celular)} />,
    t.whatsapp && <Accion key="w" texto="WhatsApp" icono={<WhatsAppIcon />} href={t.whatsapp} />,
    t.email && <Accion key="c" texto="Correo" icono={<MailOutlineIcon />} href={enlaceCorreo(t.email)} />,
  ].filter(Boolean)
  const rol = ETIQUETA_ROL[t.rol] ?? t.rol
  return (
    <Box sx={{ px: 2, pb: 2, pt: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mr: -1 }}>
        <IconButton size="small" onClick={alCerrar} aria-label="Cerrar"><CloseIcon /></IconButton>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.25, mt: -1 }}>
        <AvatarPersona id={t.id} nombre={t.nombre} tamano={96} sx={{ mb: 1 }} />
        <Typography component="h2" sx={{ fontSize: 19, fontWeight: 650, lineHeight: 1.25 }}>{t.nombre}</Typography>
        <Typography variant="body2" color="text.secondary">{t.cargo && t.cargo !== rol ? `${t.cargo} · ${rol}` : rol}</Typography>
        <Typography variant="caption" sx={{ color: t.estado === 'en_linea' ? PALETA.exito : PALETA.textoTenue }}>{t.activo ? estadoDe(t) : 'Cuenta desactivada'}</Typography>
        {t.acerca && <Typography variant="body2" sx={{ mt: 0.75, color: 'text.primary', maxWidth: 360 }}>{t.acerca}</Typography>}
      </Box>
      {acciones.length > 0 && <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>{acciones}</Box>}
      <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        {t.celular && <FilaDato etiqueta="Celular" valor={celularLegible(t.celular)} copia={t.celular} />}
        {t.email && <FilaDato etiqueta="Correo" valor={t.email} />}
        {t.dni && <FilaDato etiqueta="DNI" valor={t.dni} />}
        <FilaDato etiqueta="Usuario" valor={`@${t.cuenta}`} copia={t.cuenta} />
      </Box>
      {!t.con_contacto && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, textAlign: 'center' }}>Celular y correo: solo para el equipo.</Typography>}
      {t.propia && (
        <Button fullWidth variant="contained" disableElevation sx={{ mt: 2 }} onClick={() => ir('/perfil')}>Editar mi perfil</Button>
      )}
    </Box>
  )
}

export default function TarjetaContacto() {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [abierta, setAbierta] = useState(false)
  const [tarjeta, setTarjeta] = useState<Tarjeta | null>(null)
  const [error, setError] = useState('')

  const abrir = useCallback((id: number) => {
    setAbierta(true)
    setError('')
    setTarjeta((t) => (t?.id === id ? t : null))
    api<Tarjeta>(`/api/usuarios/${id}/perfil`)
      .then(setTarjeta)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir la tarjeta.'))
  }, [])
  useTarjetaPedida(abrir)
  const cerrar = () => setAbierta(false)

  const cuerpo = tarjeta ? (
    <Contenido t={tarjeta} alCerrar={cerrar} />
  ) : (
    <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
      {error ? <Typography variant="body2" color="error">{error}</Typography> : <CircularProgress size={24} />}
    </Box>
  )

  if (celular) {
    return (
      <Drawer
        anchor="bottom"
        open={abierta}
        onClose={cerrar}
        sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92dvh', pb: 'env(safe-area-inset-bottom)' } }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: PALETA.bordeFuerte, mx: 'auto', mt: 1 }} />
        {cuerpo}
      </Drawer>
    )
  }
  return (
    // Por encima de otro diálogo (la lista de integrantes de un grupo).
    <Dialog open={abierta} onClose={cerrar} fullWidth maxWidth="xs" sx={{ zIndex: (t) => t.zIndex.modal + 1 }}>
      {cuerpo}
    </Dialog>
  )
}

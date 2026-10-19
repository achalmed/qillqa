/**
 * ADMINISTRACIÓN → CUENTAS → COMPARTIR ACCESO (2026-10-18): el mensaje de bienvenida de una cuenta,
 * listo para copiar y pegar en WhatsApp, Telegram u otro chat (src/acceso.ts lo arma). La contraseña
 * temporal no se guarda legible: llega al crear o restablecer la cuenta, o se genera aquí una nueva
 * (`POST /api/admin/usuarios/{id}/clave`), que la persona cambia al entrar.
 */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import KeyIcon from '@mui/icons-material/VpnKey'
import { api } from '../../api'
import { copiarTexto } from '../../copiar'
import { claveTemporal, enlaceTelegramCon, enlaceWhatsappCon, mensajeAcceso } from '../../acceso'
import { PALETA } from '../../paleta'
import { confirmar } from '../Dialogos'
import type { UsuarioAdmin } from './Cuentas'

let enlaceGuardado: Promise<string> | null = null
const enlaceDelSistema = () =>
  (enlaceGuardado ??= api<{ enlace: string }>('/api/admin/enlace').then((r) => r.enlace || window.location.origin).catch(() => window.location.origin))

export default function CompartirAcceso({ u, claveConocida, alCerrar, alAvisar, alCambiarClave }: {
  /** La cuenta a compartir; null cierra la ventana. */
  u: UsuarioAdmin | null
  /** La contraseña que se acaba de entregar (al crear o restablecer), si se conoce. */
  claveConocida: string
  alCerrar: () => void
  alAvisar: (tipo: 'success' | 'error', texto: string) => void
  alCambiarClave: () => void
}) {
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [enlace, setEnlace] = useState('')
  const [clave, setClave] = useState('')
  const [generando, setGenerando] = useState(false)
  useEffect(() => { void enlaceDelSistema().then(setEnlace) }, [])
  useEffect(() => setClave(claveConocida), [u?.id, claveConocida])
  if (!u) return null

  const texto = mensajeAcceso({
    nombre: u.nombres || u.nombre_completo,
    usuario: u.nombre_usuario,
    enlace,
    // Mientras falte generarla, el mensaje lo dice (y «Copiar» espera).
    clave: clave || (u.debe_cambiar_clave ? '(genérela arriba)' : ''),
    datosPendientes: u.datos_pendientes,
    conExtension: !['prensa', 'invitado'].includes(u.rol),
  })
  const generar = async () => {
    if (!u.debe_cambiar_clave && !(await confirmar(
      `«${u.nombre_usuario}» ya tiene su contraseña. ¿Darle una temporal nueva? La suya deja de servir.`,
      { aceptar: 'Generar', peligro: true },
    ))) return
    setGenerando(true)
    try {
      const r = await api<{ clave_entregada: string }>(`/api/admin/usuarios/${u.id}/clave`, { method: 'POST', body: JSON.stringify({ clave: claveTemporal() }) })
      setClave(r.clave_entregada)
      alCambiarClave()
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo generar la contraseña.')
    } finally {
      setGenerando(false)
    }
  }
  const copiar = async (t: string, aviso: string) => {
    try {
      await copiarTexto(t)
      alAvisar('success', aviso)
    } catch {
      alAvisar('error', 'No se pudo copiar: seleccione el texto y cópielo a mano.')
    }
  }

  return (
    // Sin la trampa de foco: la copia oculta de `copiarTexto` necesita seleccionarse fuera de la ventana.
    <Dialog open onClose={alCerrar} fullWidth maxWidth="xs" fullScreen={celular} disableEnforceFocus>
      <DialogTitle>Compartir acceso</DialogTitle>
      <DialogContent dividers>
        {!clave && u.debe_cambiar_clave && (
          <Alert severity="info" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" disabled={generando} onClick={() => void generar()}>Generar</Button>}>
            La contraseña temporal no se guarda. Genere una para incluirla.
          </Alert>
        )}
        <Box
          component="pre"
          sx={{ m: 0, p: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5,
            bgcolor: PALETA.superficieTenue, border: '1px solid', borderColor: PALETA.borde, borderRadius: 1.5, userSelect: 'text' }}
        >
          {texto}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
          <Button size="small" href={enlaceWhatsappCon(texto, u.celular)} target="_blank" rel="noopener">WhatsApp</Button>
          <Button size="small" href={enlaceTelegramCon(texto.replace(`🔗 ${enlace}\n`, ''), enlace)} target="_blank" rel="noopener">Telegram</Button>
          {clave && <Button size="small" onClick={() => void copiar(clave, 'Contraseña copiada.')}>Solo la contraseña</Button>}
          {!u.debe_cambiar_clave && !clave && (
            <Button size="small" startIcon={<KeyIcon />} disabled={generando} onClick={() => void generar()}>Contraseña temporal</Button>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={alCerrar}>Cerrar</Button>
        <Button variant="contained" startIcon={<ContentCopyIcon />} disabled={u.debe_cambiar_clave && !clave}
          onClick={() => void copiar(texto, 'Mensaje copiado: péguelo en el chat.')}>
          Copiar mensaje
        </Button>
      </DialogActions>
    </Dialog>
  )
}

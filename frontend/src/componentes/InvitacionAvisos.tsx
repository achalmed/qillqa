/**
 * INVITACIÓN A LOS AVISOS (2026-10-13): la primera vez que alguien abre el chat en un dispositivo
 * donde se pueden activar los avisos push, una franja breve sobre la lista: «Reciba los mensajes
 * aunque Qillqa esté cerrado» con «Activar» y «Ahora no». Cualquiera de los dos la retira para
 * siempre en ese dispositivo; después se activa o desactiva en Mi perfil.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import { PALETA } from '../paleta'
import { activarAvisos, descartarInvitacion, invitarAvisos, TEXTO_ESTADO } from '../avisosPush'

export default function InvitacionAvisos() {
  const [ver, setVer] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState('')

  useEffect(() => {
    let vivo = true
    invitarAvisos().then((v) => vivo && setVer(v)).catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  if (!ver && !resultado) return null
  const activar = async () => {
    setOcupado(true)
    try {
      const e = await activarAvisos()
      descartarInvitacion()
      setVer(false)
      setResultado(e === 'activo' ? 'Listo: le llegarán los avisos en este dispositivo.' : TEXTO_ESTADO[e])
      window.setTimeout(() => setResultado(''), 5000)
    } catch {
      setResultado('No se pudieron activar. Pruebe desde Mi perfil.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.9, borderBottom: '1px solid', borderColor: 'divider', bgcolor: PALETA.superficieTenue }}>
      <NotificationsActiveOutlinedIcon sx={{ fontSize: 20, color: PALETA.guinda, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0, lineHeight: 1.35 }}>
        {resultado || 'Reciba los mensajes aunque Qillqa esté cerrado.'}
      </Typography>
      {ver && (
        <>
          <Button size="small" onClick={() => { descartarInvitacion(); setVer(false) }} sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 0, px: 1 }}>Ahora no</Button>
          <Button size="small" variant="contained" disableElevation disabled={ocupado} onClick={() => void activar()} sx={{ textTransform: 'none', borderRadius: 999, px: 1.5 }}>Activar</Button>
        </>
      )}
    </Box>
  )
}

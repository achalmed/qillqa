/**
 * AVISOS Y SONIDOS en Mi perfil (2026-10-13). Dos filas, como en los ajustes de Telegram:
 *   · «Avisos en este dispositivo»: activar o desactivar los avisos push (`avisosPush.ts`, de la plataforma), con
 *     el estado en palabras («Activos», «Bloqueados en el navegador…») y «Enviar uno de prueba».
 *   · «Sonidos de Qillqa»: el interruptor de los sonidos propios (`chat/sonidos.ts`); al encenderlo
 *     suena la firma de llegada para reconocerla.
 * Valen para ESTE dispositivo (el celular y la computadora se configuran cada uno).
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined'
import { PALETA } from '../../paleta'
import { activarAvisos, desactivarAvisos, estadoAvisos, probarAvisos, TEXTO_ESTADO, type EstadoAvisos } from '../../avisosPush'
import { ponerSonidos, sonarLlegada, sonidosActivos } from '@qillqa/rimay/publico'

function Renglon({ icono, etiqueta, valor, children }: { icono: React.ReactNode; etiqueta: string; valor: string; children?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.25, minHeight: 60, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
      <Box sx={{ color: PALETA.textoTenue, display: 'flex', flexShrink: 0 }}>{icono}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 15.5, lineHeight: 1.3 }}>{etiqueta}</Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.35 }}>{valor}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>{children}</Box>
    </Box>
  )
}

export default function AvisosYSonidos({ alAviso }: { alAviso: (texto: string) => void }) {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [sonidos, setSonidos] = useState(sonidosActivos())

  useEffect(() => {
    estadoAvisos().then(setEstado).catch(() => setEstado('no-soportado'))
  }, [])

  const cambiar = async () => {
    setOcupado(true)
    try {
      const e = estado === 'activo' ? await desactivarAvisos() : await activarAvisos()
      setEstado(e)
      alAviso(e === 'activo' ? 'Avisos activos en este dispositivo.' : e === 'inactivo' ? 'Avisos desactivados.' : TEXTO_ESTADO[e])
    } catch (err) {
      alAviso(err instanceof Error ? err.message : 'No se pudo cambiar.')
    } finally {
      setOcupado(false)
    }
  }
  const probar = async () => {
    setOcupado(true)
    try {
      const n = await probarAvisos()
      alAviso(n ? 'Aviso de prueba enviado.' : 'Ningún dispositivo aceptó el aviso: vuelva a activarlos.')
    } catch (err) {
      alAviso(err instanceof Error ? err.message : 'No se pudo enviar.')
    } finally {
      setOcupado(false)
    }
  }
  const alternarSonidos = (v: boolean) => {
    setSonidos(v)
    ponerSonidos(v)
    if (v) sonarLlegada()
  }
  const sePuede = estado === 'activo' || estado === 'inactivo'

  return (
    <>
      <Renglon icono={<NotificationsActiveOutlinedIcon />} etiqueta="Avisos en este dispositivo" valor={estado ? TEXTO_ESTADO[estado] : 'Revisando…'}>
        {ocupado && <CircularProgress size={18} />}
        {estado === 'activo' && <Button size="small" disabled={ocupado} onClick={() => void probar()} sx={{ textTransform: 'none', minWidth: 0 }}>Probar</Button>}
        {sePuede && (
          <Button size="small" variant={estado === 'activo' ? 'text' : 'contained'} disableElevation disabled={ocupado} onClick={() => void cambiar()}
            sx={{ textTransform: 'none', borderRadius: 999, px: 1.5, color: estado === 'activo' ? 'text.secondary' : undefined }}>
            {estado === 'activo' ? 'Desactivar' : 'Activar'}
          </Button>
        )}
      </Renglon>
      <Renglon icono={<VolumeUpOutlinedIcon />} etiqueta="Sonidos de Qillqa" valor={sonidos ? 'Al enviar y al llegar un mensaje' : 'Apagados en este dispositivo'}>
        <Switch checked={sonidos} onChange={(e) => alternarSonidos(e.target.checked)} inputProps={{ 'aria-label': 'Sonidos de Qillqa' }} />
      </Renglon>
    </>
  )
}

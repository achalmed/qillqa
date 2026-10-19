/**
 * Enlace del STD del Congreso (intranet), para que «Enviar» en un documento INTERNO lo abra
 * (2026-10-10). Lo fija el administrador; se guarda en ajustes (api/ajustes.py::std-url).
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import { api } from '../api'
import Tarjeta from './admin/Tarjeta'

export default function AdminEnlaceStd() {
  const [url, setUrl] = useState('')
  const [guardada, setGuardada] = useState('')
  const [aviso, setAviso] = useState('')
  useEffect(() => {
    api<{ url: string }>('/api/ajustes/std-url').then((r) => { setUrl(r.url); setGuardada(r.url) }).catch(() => undefined)
  }, [])
  const guardar = async () => {
    try {
      const r = await api<{ url: string }>('/api/ajustes/std-url', { method: 'PUT', body: JSON.stringify({ url }) })
      setGuardada(r.url)
      setAviso('Guardado.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
    setTimeout(() => setAviso(''), 3000)
  }
  return (
    <Tarjeta icono={<AccountBalanceOutlinedIcon />} titulo="Trámite documentario del Congreso (STD)"
      texto="Los documentos internos se envían por el STD de la intranet: con este enlace, el botón «Enviar» del editor lo abre.">
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField size="small" label="Enlace del STD" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" sx={{ flex: '1 1 260px' }} />
        <Button variant="contained" onClick={() => void guardar()} disabled={url.trim() === guardada}>Guardar</Button>
      </Box>
      {aviso && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{aviso}</Typography>}
    </Tarjeta>
  )
}

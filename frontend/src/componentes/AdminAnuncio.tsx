// AdminAnuncio — «Aviso a todos» en Administración (2026-10-05).
//
// Publica un aviso breve que sale en el centro de la pantalla de cada persona
// (componentes/AnuncioCentral.tsx) con un botón: «Recargar ahora» tras una
// actualización, o «Entendido» para un aviso que solo se lee. Publicar uno
// nuevo retira el anterior; vence solo a las 24 h.
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import { api } from '../api'
import Tarjeta from './admin/Tarjeta'

interface Anuncio { id: number; texto: string; accion: 'recargar' | 'entendido'; creado_en: string | null }

const MODELOS = {
  recargar: 'Llegó una actualización del sistema. Recargue la página para usarla.',
  entendido: '',
}

export default function AdminAnuncio() {
  const [vigente, setVigente] = useState<Anuncio | null>(null)
  const [accion, setAccion] = useState<'recargar' | 'entendido'>('recargar')
  const [texto, setTexto] = useState(MODELOS.recargar)
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; t: string } | null>(null)

  const cargar = () => api<{ anuncio: Anuncio | null }>('/api/anuncios/vigente').then((r) => setVigente(r.anuncio)).catch(() => undefined)
  useEffect(() => { void cargar() }, [])

  async function publicar() {
    try {
      await api('/api/anuncios', { method: 'POST', body: JSON.stringify({ texto, accion }) })
      setMensaje({ tipo: 'success', t: 'Aviso publicado: cada persona lo verá en menos de un minuto.' })
      void cargar()
    } catch (e) {
      setMensaje({ tipo: 'error', t: e instanceof Error ? e.message : 'No se pudo publicar.' })
    }
  }

  async function retirar() {
    await api('/api/anuncios/retirar', { method: 'POST' }).catch(() => undefined)
    setMensaje({ tipo: 'success', t: 'Aviso retirado.' })
    void cargar()
  }

  return (
    <Tarjeta icono={<CampaignOutlinedIcon />} titulo="Aviso a todos" texto="Sale en el centro de la pantalla de cada persona con un solo botón. Breve: una o dos líneas.">
      {vigente && (
        <Alert severity="info" sx={{ mb: 1.5 }} action={<Button size="small" onClick={() => void retirar()}>Retirar</Button>}>
          Vigente: «{vigente.texto}» ({vigente.accion === 'recargar' ? 'pide recargar' : 'solo informa'})
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField
          select size="small" label="Botón" value={accion} sx={{ minWidth: 190 }}
          onChange={(e) => {
            const a = e.target.value as 'recargar' | 'entendido'
            setAccion(a)
            if (!texto.trim() || Object.values(MODELOS).includes(texto)) setTexto(MODELOS[a])
          }}
        >
          <MenuItem value="recargar">Recargar ahora</MenuItem>
          <MenuItem value="entendido">Entendido</MenuItem>
        </TextField>
        <TextField
          size="small" label="Mensaje" value={texto} onChange={(e) => setTexto(e.target.value)}
          inputProps={{ maxLength: 300 }} helperText={`${texto.length}/300`} sx={{ flex: 1, minWidth: { xs: '100%', sm: 260 } }}
        />
        <Button variant="contained" onClick={() => void publicar()} disabled={!texto.trim()}>Publicar</Button>
      </Box>
      {mensaje && <Alert severity={mensaje.tipo} sx={{ mt: 1.5 }} onClose={() => setMensaje(null)}>{mensaje.t}</Alert>}
    </Tarjeta>
  )
}

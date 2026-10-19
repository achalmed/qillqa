// AnuncioCentral — aviso a todos en el centro de la pantalla (2026-10-05).
//
// Pregunta cada 30 s (y al volver a la pestaña) por el aviso vigente
// (`GET /api/anuncios/vigente`). Si este navegador aún no lo vio, lo muestra
// breve y con UN botón: «Recargar ahora» (recarga la página con la versión
// nueva) o «Entendido». «Más tarde» lo deja para dentro de 10 minutos.
import { useEffect, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import { api } from '../api'

interface Anuncio { id: number; texto: string; accion: 'recargar' | 'entendido'; creado_en: string | null }

const CLAVE_VISTO = 'sgdp_anuncio_visto'
const POSPONER_MS = 10 * 60 * 1000
// Una página cargada DESPUÉS de un «recargar» ya tiene la versión nueva: no se le pide.
const CARGADA_EN = Date.now()

function leerVisto(): number {
  try { return Number(localStorage.getItem(CLAVE_VISTO) || 0) } catch { return 0 }
}

export default function AnuncioCentral() {
  const [anuncio, setAnuncio] = useState<Anuncio | null>(null)
  const pospuesto = useRef(0)

  useEffect(() => {
    let vivo = true
    const cargar = () => {
      if (Date.now() < pospuesto.current) return
      api<{ anuncio: Anuncio | null }>('/api/anuncios/vigente')
        .then((r) => {
          if (!vivo) return
          const a = r.anuncio
          const yaAlDia = a?.accion === 'recargar' && a.creado_en !== null && Date.parse(a.creado_en) < CARGADA_EN
          setAnuncio(a && a.id > leerVisto() && !yaAlDia ? a : null)
        })
        .catch(() => undefined)
    }
    cargar()
    const t = setInterval(cargar, 30000)
    window.addEventListener('focus', cargar)
    return () => { vivo = false; clearInterval(t); window.removeEventListener('focus', cargar) }
  }, [])

  if (!anuncio) return null

  const marcarVisto = () => {
    try { localStorage.setItem(CLAVE_VISTO, String(anuncio.id)) } catch { /* sin almacenamiento: se verá otra vez */ }
  }
  const actuar = () => {
    marcarVisto()
    if (anuncio.accion === 'recargar') window.location.reload()
    else setAnuncio(null)
  }
  const posponer = () => { pospuesto.current = Date.now() + POSPONER_MS; setAnuncio(null) }

  return (
    <Dialog open maxWidth="xs" fullWidth onClose={anuncio.accion === 'recargar' ? undefined : actuar}>
      <DialogContent sx={{ textAlign: 'center', pt: 3 }}>
        <CampaignOutlinedIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
        <Typography variant="body1" sx={{ fontWeight: 500 }}>{anuncio.texto}</Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2.5, gap: 1 }}>
        {anuncio.accion === 'recargar' && <Button onClick={posponer}>Más tarde</Button>}
        <Button variant="contained" onClick={actuar} autoFocus>
          {anuncio.accion === 'recargar' ? 'Recargar ahora' : 'Entendido'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** La miniatura de una foto de la semana (480 px), pedida recién al entrar en pantalla; usa la
 *  caché de imágenes de la Fototeca (traerImagen), así que cambiar de filtro no la vuelve a pedir. */
import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { PALETA } from '../../paleta'
import { traerImagen } from '../fototeca/modelo'
import { rutaMiniatura } from './fotosSemana'

export default function Miniatura({ semanaId, codigo, ajuste = 'cover' }: { semanaId: number; codigo: string; ajuste?: 'cover' | 'contain' }) {
  const caja = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('')
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '400px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let vivo = true
    traerImagen(rutaMiniatura(semanaId, codigo)).then((u) => vivo && setUrl(u)).catch(() => {})
    return () => {
      vivo = false
    }
  }, [visible, semanaId, codigo])
  return (
    <Box ref={caja} sx={{ width: '100%', height: '100%', bgcolor: PALETA.superficieMedia }}>
      {url && <img src={url} alt={codigo} draggable={false} style={{ width: '100%', height: '100%', objectFit: ajuste, display: 'block' }} />}
    </Box>
  )
}


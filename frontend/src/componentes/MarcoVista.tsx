/**
 * El MARCO de la vista elegida (2026-10-18; src/vista.ts). La ventana de afuera no carga el sistema:
 * muestra una barra con el selector y, al centro, el sistema en un iframe del ancho del aparato
 * (reducido a escala si no cabe). Dentro, la aplicación es la de siempre: sus estilos y su lógica ven
 * el ancho del marco. La dirección de afuera sigue a la de adentro (App.tsx::SeguirRuta), así que
 * recargar o volver a «Automática» deja en la misma página.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ElegirVista from './ElegirVista'
import { ALTO_BARRA, VISTAS, leerVista, marcoDe } from '../vista'
import { PALETA } from '../paleta'

const ventana = () => ({ ancho: window.innerWidth, alto: window.innerHeight })

export default function MarcoVista({ sinMarco }: { sinMarco: React.ReactElement }) {
  const vista = leerVista()
  const [tam, setTam] = useState(ventana)
  useEffect(() => {
    const f = () => setTam(ventana())
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  // La dirección de entrada, una sola vez: después la lleva el iframe.
  const [src] = useState(() => window.location.pathname + window.location.search + window.location.hash)
  const marco = marcoDe(vista, tam)
  if (!marco) return sinMarco
  const nombre = VISTAS.find((v) => v.id === vista)?.nombre ?? ''
  const redondo = vista === 'escritorio' ? 6 : 18
  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: PALETA.oscuroVisor, overflow: 'hidden' }}>
      <Box sx={{ height: ALTO_BARRA, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 1.5, px: 2, color: '#fff' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, flex: 1 }} noWrap>
          Qillqa · vista {nombre.toLowerCase()} ({marco.ancho} px{marco.escala < 1 ? `, al ${Math.round(marco.escala * 100)} %` : ''})
        </Typography>
        <ElegirVista oscuro conRotulo={false} />
      </Box>
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', pt: 2 }}>
        <Box sx={{ width: marco.ancho * marco.escala, height: marco.alto * marco.escala, flex: '0 0 auto' }}>
          <Box
            component="iframe"
            src={src}
            title={`Qillqa en vista ${nombre.toLowerCase()}`}
            sx={{
              width: marco.ancho, height: marco.alto, border: 0, display: 'block', bgcolor: PALETA.fondo,
              borderRadius: `${redondo}px`, boxShadow: PALETA.sombraFlotante,
              transform: `scale(${marco.escala})`, transformOrigin: 'top left',
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}

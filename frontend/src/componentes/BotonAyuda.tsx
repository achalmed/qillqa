/**
 * BOTÓN DE AYUDA — el «?» de una sección (2026-10-12, pedido de Edison: «mensajes breves y
 * directos, que quepan en el celular»). Una sola forma para todas las ayudas: en escritorio, una
 * ventanita junto al botón; en el celular, una hoja inferior a lo ancho (HojaInferior), que
 * nunca se corta por los lados. El texto va en pocas líneas: qué es y qué hacer.
 */
import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import HojaInferior from './HojaInferior'

export default function BotonAyuda({ titulo, children, etiqueta }: { titulo: string; children: ReactNode; etiqueta?: string }) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const cerrar = () => setAncla(null)
  const cuerpo = <Box sx={{ typography: 'body2', '& p': { m: 0, mb: 1 }, '& p:last-child': { mb: 0 } }}>{children}</Box>
  return (
    <>
      <Tooltip title={etiqueta ?? titulo}>
        <IconButton size="small" onClick={(e) => setAncla(e.currentTarget)} aria-label={etiqueta ?? titulo}>
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {celular ? (
        <HojaInferior abierta={ancla !== null} alCerrar={cerrar} titulo={titulo}>
          <Box sx={{ px: 2, pt: 0.5, pb: 2 }}>{cuerpo}</Box>
        </HojaInferior>
      ) : (
        <Popover
          open={ancla !== null}
          anchorEl={ancla}
          onClose={cerrar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          slotProps={{ paper: { sx: { p: 2, maxWidth: 400 } } }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: 14.5, mb: 1 }}>{titulo}</Typography>
          {cuerpo}
        </Popover>
      )}
    </>
  )
}

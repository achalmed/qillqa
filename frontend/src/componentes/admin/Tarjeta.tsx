/**
 * La tarjeta de cada parte de ADMINISTRACIÓN (2026-10-18): borde sutil, título breve con su icono,
 * una línea de qué es y, a la derecha, su acción principal. Todas las secciones la usan, para que
 * la pantalla se lea igual de arriba abajo (memoria «Paneles limpios»).
 */
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { PALETA } from '../../paleta'

export default function Tarjeta({
  icono,
  titulo,
  texto,
  accion,
  children,
  sx,
}: {
  icono?: React.ReactNode
  titulo: React.ReactNode
  texto?: React.ReactNode
  accion?: React.ReactNode
  children?: React.ReactNode
  sx?: object
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderColor: PALETA.borde, borderRadius: 2, ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: texto ? 0.25 : 1 }}>
        {icono && <Box sx={{ display: 'flex', color: PALETA.textoSecundario, '& svg': { fontSize: 20 } }}>{icono}</Box>}
        <Typography component="h3" sx={{ fontWeight: 600, fontSize: 15.5, flex: 1, minWidth: 0 }}>{titulo}</Typography>
        {accion && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>{accion}</Box>}
      </Box>
      {texto && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {texto}
        </Typography>
      )}
      {children}
    </Paper>
  )
}

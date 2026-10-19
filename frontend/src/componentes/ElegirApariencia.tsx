/**
 * El selector de la APARIENCIA (2026-10-19; src/apariencia.ts): como el aparato, clara u oscura. Va en
 * el menú de la cuenta, debajo del de la vista, con la misma forma (selector segmentado con iconos).
 */
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import BrightnessAutoOutlinedIcon from '@mui/icons-material/BrightnessAutoOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import { APARIENCIAS, leerApariencia, ponerApariencia, type Apariencia } from '../apariencia'

const ICONO: Record<Apariencia, React.ReactNode> = {
  auto: <BrightnessAutoOutlinedIcon fontSize="small" />,
  claro: <LightModeOutlinedIcon fontSize="small" />,
  oscuro: <DarkModeOutlinedIcon fontSize="small" />,
}

export default function ElegirApariencia() {
  const actual = leerApariencia()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
        Apariencia: {APARIENCIAS.find((a) => a.id === actual)?.nombre}
      </Typography>
      <ToggleButtonGroup size="small" exclusive value={actual} aria-label="Apariencia" onChange={(_, a: Apariencia | null) => a && a !== actual && ponerApariencia(a)}>
        {APARIENCIAS.map((a) => (
          <Tooltip key={a.id} title={a.nombre}>
            <ToggleButton value={a.id} aria-label={a.nombre} sx={{ px: 1, py: 0.5 }}>{ICONO[a.id]}</ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}

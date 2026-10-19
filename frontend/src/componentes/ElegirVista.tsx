/**
 * El selector de la VISTA (2026-10-18; src/vista.ts): Automática, Celular, Tableta o Escritorio. Va en el
 * menú de la cuenta y en la barra del marco (MarcoVista.tsx).
 */
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined'
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined'
import TabletMacOutlinedIcon from '@mui/icons-material/TabletMacOutlined'
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined'
import { VISTAS, leerVista, ponerVista, type Vista } from '../vista'

const ICONO: Record<Vista, React.ReactNode> = {
  auto: <DevicesOutlinedIcon fontSize="small" />,
  celular: <PhoneIphoneOutlinedIcon fontSize="small" />,
  tableta: <TabletMacOutlinedIcon fontSize="small" />,
  escritorio: <DesktopWindowsOutlinedIcon fontSize="small" />,
}

export default function ElegirVista({ oscuro = false, conRotulo = true }: { oscuro?: boolean; conRotulo?: boolean }) {
  const actual = leerVista()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {conRotulo && (
        <Typography variant="body2" sx={{ flex: 1, color: oscuro ? 'rgba(255,255,255,.85)' : 'text.secondary' }}>
          Vista: {VISTAS.find((v) => v.id === actual)?.nombre}
        </Typography>
      )}
      <ToggleButtonGroup
        size="small" exclusive value={actual} aria-label="Vista"
        onChange={(_, v: Vista | null) => v && v !== actual && ponerVista(v)}
        sx={oscuro ? { '& .MuiToggleButton-root': { color: 'rgba(255,255,255,.75)', borderColor: 'rgba(255,255,255,.25)' },
          '& .Mui-selected': { color: '#fff !important', bgcolor: 'rgba(255,255,255,.18) !important' } } : undefined}
      >
        {VISTAS.map((v) => (
          <Tooltip key={v.id} title={v.nombre}>
            <ToggleButton value={v.id} aria-label={v.nombre} sx={{ px: 1, py: 0.5 }}>{ICONO[v.id]}</ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}

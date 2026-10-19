/**
 * Pantalla de carga mientras llega el trozo de la primera página (2026-10-13): la misma de
 * index.html (fondo neutro, la hoja en tinta y una barra fina; 2026-10-19; en la apariencia oscura, desde PALETA), para que el arranque se vea
 * como UNA sola pantalla y nunca en blanco. Al cambiar de página no aparece: el router mantiene la anterior
 * a la vista hasta que la nueva está lista (App.tsx, v7_startTransition).
 */
import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { PALETA } from '../paleta'

const ir = keyframes`from { transform: translateX(-100%); } to { transform: translateX(250%); }`

export default function PantallaCarga() {
  return (
    <Box role="status" aria-label="Cargando" sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px', bgcolor: PALETA.fondo, zIndex: 2000 }}>
      <svg viewBox="140 108 232 296" width="88" height="88" aria-hidden="true">
        <path d="M160 108h140l72 72v204a20 20 0 0 1-20 20H160a20 20 0 0 1-20-20V128a20 20 0 0 1 20-20z" fill={PALETA.superficie} stroke={PALETA.bordeFuerte} strokeWidth="6" />
        <path d="M300 108v52a20 20 0 0 0 20 20h52z" fill={PALETA.borde} />
        <rect x="188" y="222" width="136" height="24" rx="12" fill={PALETA.texto} />
        <rect x="188" y="274" width="136" height="16" rx="8" fill={PALETA.texto} opacity="0.28" />
        <rect x="188" y="314" width="92" height="16" rx="8" fill={PALETA.texto} opacity="0.28" />
      </svg>
      <Box sx={{ width: 120, height: 3, borderRadius: 3, bgcolor: PALETA.borde, overflow: 'hidden', '&::after': { content: '""', display: 'block', width: '40%', height: '100%', bgcolor: PALETA.texto, animation: `${ir} 1.1s ease-in-out infinite` } }} />
    </Box>
  )
}

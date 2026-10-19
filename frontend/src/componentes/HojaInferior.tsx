/**
 * HOJA INFERIOR — el lenguaje común de lo que se abre desde abajo en el celular (2026-10-12,
 * pedido de Edison: «uniformidad en todo el sistema; que parezca un aplicativo Android»). La
 * usan el «+» del chat (MenuMas), el botón flotante de cada módulo (BotonModulo) y las ayudas
 * breves (BotonAyuda): esquinas redondeadas arriba, el asa gris, el borde seguro del iPhone y el
 * círculo de color de la marca con su ícono.
 */
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import Typography from '@mui/material/Typography'

/** El papel de toda hoja inferior: una sola forma para todas. */
export const PAPEL_HOJA = {
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  pb: 'env(safe-area-inset-bottom)',
  maxHeight: '85dvh',
  // En la tableta, centrada y no más ancha que un teléfono grande.
  maxWidth: 640,
  mx: 'auto',
} as const

/** El asa: la rayita que dice «esto se desliza». */
export function Asa() {
  return <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1, flexShrink: 0 }} />
}

/** El ícono en un círculo de color (como el menú de adjuntar de WhatsApp). */
export function Circulo({ color, tamano = 36, children }: { color: string; tamano?: number; children: ReactNode }) {
  return (
    <Box
      sx={{
        width: tamano, height: tamano, borderRadius: '50%', bgcolor: `${color}26`, color, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', '& svg': { fontSize: Math.round(tamano * 0.52) },
      }}
    >
      {children}
    </Box>
  )
}

/** La hoja inferior con su asa y, si se da, un título breve. */
export default function HojaInferior({
  abierta,
  alCerrar,
  titulo,
  children,
}: {
  abierta: boolean
  alCerrar: () => void
  titulo?: ReactNode
  children: ReactNode
}) {
  return (
    <Drawer anchor="bottom" open={abierta} onClose={alCerrar} PaperProps={{ sx: { ...PAPEL_HOJA, display: 'flex', flexDirection: 'column' } }}>
      <Asa />
      {titulo && (
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: 15.5, px: 2, pt: 1.25, pb: 0.5 }}>
          {titulo}
        </Typography>
      )}
      <Box sx={{ overflowY: 'auto', minHeight: 0 }}>{children}</Box>
    </Drawer>
  )
}

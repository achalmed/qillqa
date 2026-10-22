/**
 * La carcasa de los pasos del PRIMER INGRESO (2026-10-18): elegir la contraseña (CambiarClave.tsx)
 * y confirmar los datos (Bienvenida.tsx). Una tarjeta al centro, sin menú, con «Paso 1 de 2» cuando
 * a la persona le tocan los dos. Cuántos le tocan lo anota el inicio de sesión (`qillqa_pasos_ingreso`).
 */
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { PALETA } from '../paleta'

/** Cuántos pasos le tocan a quien acaba de entrar (1 o 2). */
export const pasosDeIngreso = (): number => (localStorage.getItem('qillqa_pasos_ingreso') === '2' ? 2 : 1)

export default function PasoIngreso({
  icono,
  titulo,
  paso,
  ancho = 420,
  alEnviar,
  children,
}: {
  icono: React.ReactNode
  titulo: string
  /** El número de este paso; sin él (o con un solo paso) no se muestra la cuenta. */
  paso?: number
  ancho?: number
  alEnviar: (evento: React.FormEvent) => void
  children: React.ReactNode
}) {
  const total = pasosDeIngreso()
  return (
    <Box
      sx={{
        // 100dvh: en el celular la barra del navegador y el teclado no
        // empujan el formulario fuera de la vista.
        minHeight: '100dvh',
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'center',
        bgcolor: 'grey.100',
        p: 2,
        pt: { xs: 4, sm: 2 },
      }}
    >
      {/* La tarjeta se ajusta al ancho del celular (360 px) sin desbordar. */}
      <Card sx={{ width: '100%', maxWidth: ancho }}>
        <CardContent component="form" onSubmit={alEnviar}>
          {paso && total > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
              {Array.from({ length: total }, (_, i) => (
                <Box key={i} sx={{ height: 4, flex: 1, borderRadius: 2, bgcolor: i < paso ? PALETA.guinda : PALETA.borde }} />
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>
                Paso {paso} de {total}
              </Typography>
            </Box>
          )}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            {icono}
            <Typography variant="h6" color="primary">
              {titulo}
            </Typography>
          </Stack>
          {children}
        </CardContent>
      </Card>
    </Box>
  )
}

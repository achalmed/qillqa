/**
 * LENGUAJE VISUAL COMÚN de Qillqa — los títulos, los bloques y el estado de una pieza (Edison 2026-09-05: «jerarquía
 * visual clara y consistente para todos los títulos») viven en Tiqsi web (`@qillqa/tiqsi/estilo`, 2026-10-21) para que
 * los módulos aislados los dibujen igual; aquí se reexportan para el resto de Qillqa. Junto con `Paso.tsx` (números de
 * paso) forma el sistema visual. `Titulo` tiene tres niveles, y solo tres: seccion (título de un bloque), sub
 * (subtítulo dentro de un bloque) y grupo (rótulo de un grupo de campos). La tipografía base la fija el tema (theme.ts:
 * h6 y subtitle2), así que cualquier `Typography variant="h6"` que quede suelto también obedece. El estado de un
 * documento es de Gestión documental: `componentes/EstadoDocumento.tsx`.
 *
 * `EstadoVacio` es el de Qillqa (el anfitrión se lo da a los módulos por Tiqsi web).
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { PALETA } from '../paleta'

export { Bloque, EstadoPieza, Titulo } from '@qillqa/tiqsi/estilo'

/** Estado vacío elegante: icono, título, qué hacer y (opcional) la acción. */
export function EstadoVacio({
  icono,
  titulo,
  texto,
  accion,
}: {
  icono?: React.ReactNode
  titulo: string
  texto?: React.ReactNode
  accion?: React.ReactNode
}) {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 1,
        p: 4,
        borderRadius: 1,
        bgcolor: PALETA.superficieTenue,
        color: 'text.secondary',
      }}
    >
      {icono && <Box sx={{ color: PALETA.bordeFuerte, '& svg': { fontSize: 44 } }}>{icono}</Box>}
      <Typography variant="subtitle1" sx={{ color: 'text.primary' }}>
        {titulo}
      </Typography>
      {texto && (
        <Typography variant="body2" sx={{ maxWidth: 380 }}>
          {texto}
        </Typography>
      )}
      {accion && <Box sx={{ mt: 1 }}>{accion}</Box>}
    </Box>
  )
}

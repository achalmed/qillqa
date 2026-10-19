/**
 * EL ESTADO DE LA VISTA PREVIA, sobre el visor (2026-10-12). Cuando la compilación tuvo que reparar
 * algo (servicios/compilacion.py + app/latex/reparacion.py) o no pudo compilar lo último, se dice
 * aquí: una vista previa reparada o desactualizada nunca se presenta como si fuera la actual.
 */
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'

export interface EstadoCompilacion {
  ok?: boolean
  en?: string
  error?: string
  pdf_al_dia?: boolean
  reparaciones?: { paso: string; descripcion: string; detalle?: string; pierde?: boolean }[]
}

const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '')

export default function EstadoVistaPrevia({ estado }: { estado: EstadoCompilacion | null | undefined }) {
  if (!estado || (estado.ok !== false && !(estado.reparaciones?.length))) return null
  if (estado.ok === false)
    return (
      <Alert severity="error" variant="outlined" sx={{ mb: 1, py: 0 }}>
        <b>Vista previa NO actualizada.</b> Lo último no se pudo componer{estado.en ? ` (${hora(estado.en)})` : ''}: {estado.error || 'error del motor'}.
        {estado.reparaciones?.length ? ` Se intentó: ${estado.reparaciones.map((r) => r.descripcion).join('; ')}.` : ''} Lo que ve es la versión anterior.
      </Alert>
    )
  const pierde = estado.reparaciones!.some((r) => r.pierde)
  return (
    <Alert severity={pierde ? 'warning' : 'info'} variant="outlined" sx={{ mb: 1, py: 0 }}>
      <b>Vista previa ajustada sola:</b> {estado.reparaciones!.map((r) => r.descripcion + (r.detalle ? ` (${r.detalle})` : '')).join('; ')}.
      {pierde && <Typography component="span" variant="body2"> Revise el contenido: al generar el número no se aceptan estos ajustes.</Typography>}
    </Alert>
  )
}

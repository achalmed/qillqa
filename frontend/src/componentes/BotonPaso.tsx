/**
 * Botón con el NÚMERO de su paso en el proceso documental.
 *
 * Envuelve un botón normal y le antepone el círculo de su etapa (el ÚNICO
 * dibujo de paso del sistema: componentes/Paso.tsx). Tres estados visuales, que son el pedido de Edison
 * (2026-09-05):
 *
 *   · pendiente → normal.
 *   · ACTUAL    → resaltado: es lo que toca hacer ahora.
 *   · hecho     → atenuado («bajarle el brillo»), pero NUNCA deshabilitado:
 *                 se puede volver a guardar o a previsualizar cuantas veces
 *                 haga falta. El atenuado informa, no prohíbe.
 *
 * Si al botón no le corresponde ninguna etapa (`paso` nulo) se comporta como
 * un botón corriente: los botones que no son parte del flujo —Historial,
 * Directorio, Columnas— no llevan número, que es lo que hace legible la
 * numeración de los que sí.
 */
import Button, { type ButtonProps } from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import { OPACIDAD_HECHO, type Etapa } from '../flujo'
import { NumeroPaso } from './Paso'

export default function BotonPaso({
  paso,
  sobreOscuro = false,
  ayudaDeshabilitado,
  children,
  sx,
  ...props
}: ButtonProps & { paso?: Etapa | null; sobreOscuro?: boolean; ayudaDeshabilitado?: string }) {
  if (!paso) {
    return (
      <Button sx={sx} {...props}>
        {children}
      </Button>
    )
  }
  const ayuda = props.disabled && ayudaDeshabilitado
    ? `Paso ${paso.orden} · ${paso.titulo}. ${ayudaDeshabilitado}`
    : paso.opcional
    ? `Paso ${paso.orden} (opcional, repetible). ${paso.ayuda}`
    : paso.hecho
      ? `Paso ${paso.orden} — ya hecho. ${paso.ayuda}`
      : paso.actual
        ? `Paso ${paso.orden}, el que toca ahora. ${paso.ayuda}`
        : `Paso ${paso.orden}. ${paso.ayuda}`
  return (
    <Tooltip title={ayuda}>
      <span>
        <Button
          {...props}
          variant={paso.actual ? 'contained' : props.variant}
          sx={{
            // Lo hecho se atenúa; al pasar el mouse recupera el brillo, para
            // que se note que sigue siendo un botón vivo.
            opacity: paso.hecho && !paso.actual ? OPACIDAD_HECHO : 1,
            fontWeight: paso.actual ? 700 : undefined,
            transition: 'opacity .15s',
            '&:hover': { opacity: 1 },
            // Sobre la barra oscura, un botón deshabilitado seguía legible:
            // el número y el texto no desaparecen, solo se atenúan.
            ...(sobreOscuro
              ? { '&.Mui-disabled': { color: 'rgba(255,255,255,.5)' } }
              : {}),
            // El paso ACTUAL es la única acción protagonista de la barra:
            // relleno claro sobre la barra oscura, o color de la casa fuera.
            ...(paso.actual && sobreOscuro
              ? {
                  bgcolor: '#fff',
                  color: 'primary.main',
                  '&:hover': { bgcolor: '#f3e9ea', opacity: 1 },
                }
              : {}),
            ...sx,
          }}
        >
          <NumeroPaso paso={paso} sobreOscuro={sobreOscuro} tamano={18} />
          {children}
        </Button>
      </span>
    </Tooltip>
  )
}

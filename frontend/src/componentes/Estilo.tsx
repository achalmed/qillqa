/**
 * LENGUAJE VISUAL COMÚN — estado del documento y títulos (Edison 2026-09-05:
 * «el estado también debe seguir el mismo lenguaje que la numeración»;
 * «jerarquía visual clara y consistente para todos los títulos»).
 *
 * Junto con `Paso.tsx` (números de paso) forma el sistema visual de Qillqa.
 * Dos piezas:
 *
 *   · `EstadoDocumento` — la etiqueta de estado, IGUAL en la bandeja, la barra
 *     del editor, la vista heredada y el panel de seguimiento: un punto del
 *     color del estado + el nombre, sobre un fondo apenas teñido. Nada de
 *     bloques de color sólido con texto blanco: el color señala, no grita.
 *     Sobre la barra oscura invierte (punto de color, texto blanco).
 *
 *   · `Titulo` — tres niveles, y solo tres, en todas las pantallas:
 *       seccion : título de un bloque (Datos del documento, 1.6 Cuerpo…)
 *       sub     : subtítulo dentro de un bloque (Documentos adjuntos, Internos)
 *       grupo   : rótulo de un grupo de campos (1.3 Referencia, 1.4 Copias),
 *                 con la misma letra que la etiqueta flotante de un campo.
 *     La tipografía base la fija el tema (theme.ts: h6 y subtitle2), así que
 *     cualquier `Typography variant="h6"` que quede suelto también obedece.
 */
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { COLOR_ESTADO, DESCRIPCION_ESTADO, ETIQUETA_ESTADO } from '../estados'
import { PALETA } from '../paleta'

/** Etiqueta de estado: punto de color + nombre, fondo teñido. */
export function EstadoDocumento({
  estado,
  sobreOscuro = false,
  onClick,
  prefijo,
  tamano = 'md',
}: {
  estado: string
  sobreOscuro?: boolean
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  /** Texto antes del nombre («Estado:»), en gris. */
  prefijo?: string
  tamano?: 'sm' | 'md'
}) {
  const color = COLOR_ESTADO[estado] ?? PALETA.textoTenue
  const texto = ETIQUETA_ESTADO[estado] ?? estado
  const alto = tamano === 'sm' ? 20 : 24
  return (
    <Tooltip title={DESCRIPCION_ESTADO[estado] ?? ''}>
      <Box
        component={onClick ? 'button' : 'span'}
        onClick={onClick}
        aria-label={`Estado: ${texto}`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          height: alto,
          px: 1.25,
          borderRadius: alto / 2,
          border: 'none',
          font: 'inherit',
          fontSize: tamano === 'sm' ? 11.5 : 12.5,
          fontWeight: 600,
          letterSpacing: '0.01em',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          cursor: onClick ? 'pointer' : 'default',
          color: sobreOscuro ? '#fff' : color,
          bgcolor: sobreOscuro ? 'rgba(255,255,255,.12)' : `${color}14`,
          transition: 'background-color .15s',
          '&:hover': onClick
            ? { bgcolor: sobreOscuro ? 'rgba(255,255,255,.22)' : `${color}26` }
            : undefined,
        }}
      >
        <Box
          component="span"
          sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, flex: '0 0 auto' }}
        />
        {prefijo && (
          <Box component="span" sx={{ fontWeight: 400, opacity: 0.75 }}>
            {prefijo}
          </Box>
        )}
        {texto}
      </Box>
    </Tooltip>
  )
}

/** Título con jerarquía fija. `accion` va pegada al BORDE derecho (botón,
 *  marca…), en la misma vertical que las marcas de los campos (canal
 *  derecho, ver ObservacionesSeccion.tsx; Edison 2026-09-07). */
export function Titulo({
  nivel = 'seccion',
  icono,
  children,
  accion,
  sx,
}: {
  nivel?: 'seccion' | 'sub' | 'grupo'
  icono?: React.ReactNode
  children: React.ReactNode
  accion?: React.ReactNode
  sx?: object
}) {
  const variante = nivel === 'seccion' ? 'h6' : nivel === 'sub' ? 'subtitle2' : 'caption'
  return (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      alignItems="center"
      flexWrap="wrap"
      sx={{ mb: nivel === 'grupo' ? 0.5 : 0.75, minWidth: 0, ...sx }}
    >
      {icono && (
        <Box sx={{ display: 'flex', color: 'text.secondary', '& svg': { fontSize: 18 } }}>{icono}</Box>
      )}
      <Typography
        variant={variante}
        component={nivel === 'seccion' ? 'h2' : nivel === 'sub' ? 'h3' : 'span'}
        sx={
          nivel === 'grupo'
            ? { color: 'text.secondary', fontSize: 12, lineHeight: 1.2 }
            : { minWidth: 0 }
        }
      >
        {children}
      </Typography>
      {accion && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>{accion}</Box>
      )}
    </Stack>
  )
}


/**
 * Estado de una PIEZA del trámite (firmado, cargo, respuesta…): la misma
 * gramática que el estado del documento —punto + palabra— sin colores
 * decorativos: gris = pendiente, ámbar = parcial, verde = completo.
 */
export function EstadoPieza({
  estado,
  texto,
}: {
  estado: 'pendiente' | 'parcial' | 'completo' | 'neutro'
  texto: string
}) {
  const color =
    estado === 'completo' ? PALETA.exito : estado === 'parcial' ? PALETA.aviso : PALETA.apagado
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        fontSize: 11.5,
        fontWeight: 600,
        color: estado === 'pendiente' || estado === 'neutro' ? 'text.secondary' : color,
        whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, flex: '0 0 auto' }} />
      {texto}
    </Box>
  )
}

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

/** Bloque de sección SIN caja: separación por espacio y una línea fina
 *  arriba (salvo el primero). Sustituye a los Paper outlined del editor. */
export function Bloque({
  children,
  primero = false,
  sx,
}: {
  children: React.ReactNode
  primero?: boolean
  sx?: object
}) {
  return (
    <Box
      sx={{
        pt: primero ? 0 : 2.5,
        mt: primero ? 0 : 2.5,
        borderTop: primero ? 'none' : `1px solid ${PALETA.borde}`,
        // Jerarquía discreta (2026-10-10): cada parte del documento con un filete a la
        // izquierda, sin cajas ni fondos.
        pl: 1.5,
        borderLeft: `2px solid ${PALETA.borde}`,
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

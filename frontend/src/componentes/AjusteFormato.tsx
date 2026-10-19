/**
 * AJUSTES DE FORMATO JUNTO A CADA PARTE (Edison 2026-09-07).
 *
 * «Que esté disponible cuando realmente se necesite, pero que sea muy sutil
 * y no invada la interfaz.» Cada parte del formulario que admite formato
 * propio (destinatario, copias, asunto, cuerpo, anexos) lleva un icono
 * pequeño en el canal derecho —el mismo donde va la marca de observación—
 * que abre un globo con SOLO sus controles. Atenuado si todo está en el
 * formato de la casa; en color de la casa si hay algún ajuste, con el
 * conteo en el badge. Los grupos y sus claves viven en `formato.ts`.
 */
import { useState } from 'react'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import {
  ajustesActivos,
  clavesDe,
  etiquetaLegado,
  etiquetaOpcion,
  etiquetaPredeterminada,
  grupoDeParte,
  moverFino,
  valorFino,
  type Control,
  type Fino,
  type GrupoFormato,
} from '../formato'

type Valores = Record<string, string>
type Cambiar = (clave: string, valor: string) => void

/** Ajuste fino con botones ↑/↓ y chip con el valor («estándar» si vacío). */
export function Stepper({ f, valores, alCambiar, efectivos }: { f: Fino; valores: Valores; alCambiar: Cambiar; efectivos?: Valores }) {
  const actual = valores[f.clave] ?? ''
  // Lo que el ajuste automático usó en la última compilación, si difiere de lo elegido.
  const efectivo = efectivos?.[f.clave]
  const distinto = efectivo !== undefined && efectivo !== (actual || `${f.base}cm`)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <Tooltip title={f.ayuda}>
        <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
          {f.etiqueta}
        </Typography>
      </Tooltip>
      <Chip
        size="small"
        variant={actual === '' ? 'outlined' : 'filled'}
        label={`${String(valorFino(f, valores)).replace('.', ',')} cm${actual === '' ? ' · estándar' : ''}`}
        onDelete={actual === '' ? undefined : () => alCambiar(f.clave, '')}
        sx={{ minWidth: 76 }}
      />
      {distinto && (
        <Tooltip title="Valor que usó el ajuste automático para que la firma no quede sola (Formato general → «Si la firma queda sola»).">
          <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600, whiteSpace: 'nowrap' }}>→ {efectivo.replace('cm', ' cm').replace('.', ',')}</Typography>
        </Tooltip>
      )}
      <IconButton size="small" onClick={() => alCambiar(f.clave, moverFino(f, valores, 1))} aria-label={`Subir ${f.etiqueta}`}>
        <KeyboardArrowUpIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => alCambiar(f.clave, moverFino(f, valores, -1))} aria-label={`Bajar ${f.etiqueta}`}>
        <KeyboardArrowDownIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}

/** Select pequeño de opciones fijas. Cada opción dice el valor que rige
 *  («Igual al documento · 11 pt») y al pie va el predeterminado del tipo. */
export function SelectFormato({
  c,
  valores,
  alCambiar,
  predeterminados,
  efectivos,
}: {
  c: Control
  valores: Valores
  alCambiar: Cambiar
  predeterminados?: Valores
  /** Valores con que se compiló la última vez (ajuste automático), por clave fmt_*. */
  efectivos?: Valores
}) {
  const actual = valores[c.clave] ?? ''
  const efectivo = efectivos?.[c.clave]
  // Un valor guardado que no está en la lista (p. ej. «muy-pequeno», de antes
  // de los tamaños en puntos) se muestra como opción para que se LEA qué
  // rige, en vez de un selector vacío.
  const opciones = c.opciones.some((o) => o.v === actual)
    ? c.opciones
    : [...c.opciones, { v: actual, t: etiquetaLegado(actual) }]
  const pred = predeterminados ? (predeterminados[c.clave] ?? '') : undefined
  // Al pie, SOLO lo que difiere del predeterminado (sin ruido cuando todo
  // está como siempre); la ★ de la lista ya marca cuál es.
  const ayudaPred =
    pred === undefined || pred === actual
      ? undefined
      : `Predeterminado: ${etiquetaPredeterminada(c, valores, predeterminados ?? {})}`
  // En rojo, discreto: el valor que el ajuste automático puso en el PDF en vez del elegido
  // (2026-10-10, Edison: «saber qué valores está tomando la autoconfiguración»).
  const opEfectiva = efectivo !== undefined && efectivo !== actual ? c.opciones.find((o) => o.v === efectivo) : undefined
  const ayuda = opEfectiva ? (
    <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>En el PDF: {etiquetaOpcion(c.clave, opEfectiva, valores)} (ajuste automático)</Box>
  ) : ayudaPred
  const campo = (
    <TextField
      select
      size="small"
      fullWidth
      sx={{ '& .MuiInputBase-input': { fontSize: 13.5 } }}
      label={c.etiqueta}
      value={actual}
      onChange={(e) => alCambiar(c.clave, e.target.value)}
      helperText={ayuda}
      FormHelperTextProps={{ sx: { mx: 0.5, mt: 0.25 } }}
      // El valor vacío («Igual al documento») también debe LEERSE: MUI no
      // pinta la opción de valor '' salvo con displayEmpty.
      // La ★ va en la lista, no en el valor elegido: ahí sería ruido.
      SelectProps={{
        displayEmpty: true,
        renderValue: (v) => {
          const o = opciones.find((x) => x.v === v)
          return o ? etiquetaOpcion(c.clave, o, valores) : String(v)
        },
      }}
      InputLabelProps={{ shrink: true }}
    >
      {opciones.map((o) => (
        <MenuItem key={o.v} value={o.v} dense>
          {etiquetaOpcion(c.clave, o, valores)}
          {pred !== undefined && o.v === pred ? ' ★' : ''}
        </MenuItem>
      ))}
    </TextField>
  )
  // Qué cambia en el papel: al pasar el ratón, sin ocupar sitio.
  return c.ayuda ? (
    <Tooltip title={c.ayuda} placement="top-start" enterDelay={500} disableInteractive>
      <Box>{campo}</Box>
    </Tooltip>
  ) : (
    campo
  )
}

/** Los controles de un grupo, en una columna (globo) o en retícula (panel). */
export function ControlesFormato({
  grupo,
  valores,
  alCambiar,
  columnas = 1,
  predeterminados,
  efectivos,
}: {
  grupo: GrupoFormato
  valores: Valores
  alCambiar: Cambiar
  columnas?: 1 | 2
  predeterminados?: Valores
  efectivos?: Valores
}) {
  const grid = {
    display: 'grid',
    gridTemplateColumns: columnas === 2 ? { xs: '1fr', sm: '1fr 1fr' } : '1fr',
    gap: 1.25,
  }
  return (
    <Stack spacing={1.5}>
      {grupo.controles.length > 0 && (
        <Box sx={grid}>
          {grupo.controles.map((c) => (
            <SelectFormato key={c.clave} c={c} valores={valores} alCambiar={alCambiar} predeterminados={predeterminados} efectivos={efectivos} />
          ))}
        </Box>
      )}
      {grupo.finos.length > 0 && (
        <Box sx={{ ...grid, gap: 0.75 }}>
          {grupo.finos.map((f) => (
            <Stepper key={f.clave} f={f} valores={valores} alCambiar={alCambiar} efectivos={efectivos} />
          ))}
        </Box>
      )}
    </Stack>
  )
}

/**
 * Icono de ajustes de UNA parte. No pinta nada si la parte no tiene
 * formato propio para este tipo de documento. `predeterminados` son los
 * fmt_* iniciales del tipo (tabla `ajustes`): «Restablecer» vuelve a ellos
 * y «Predeterminar» guarda los valores actuales de ESTE grupo como
 * predeterminados del tipo, sin tocar los de otras partes.
 */
export function MarcaFormato({
  seccion,
  tipo,
  valores,
  alCambiar,
  predeterminados = {},
  alPredeterminar,
  sx,
}: {
  seccion: string
  tipo: string
  valores: Valores
  alCambiar: Cambiar
  predeterminados?: Valores
  alPredeterminar?: (claves: string[]) => Promise<void> | void
  sx?: object
}) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const [guardando, setGuardando] = useState(false)
  const grupo = grupoDeParte(seccion, tipo)
  if (!grupo) return null
  const n = ajustesActivos(grupo, valores)
  const claves = clavesDe(grupo)
  const igualAlPredeterminado = claves.every((k) => (valores[k] ?? '') === (predeterminados[k] ?? ''))

  const restablecer = () => {
    claves.forEach((k) => alCambiar(k, predeterminados[k] ?? ''))
  }
  const predeterminar = async () => {
    if (!alPredeterminar) return
    setGuardando(true)
    try {
      await alPredeterminar(claves)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Tooltip title={n ? `${n} ajuste(s) propio(s) de «${grupo.titulo}»` : `Formato propio de «${grupo.titulo}» (solo esta parte)`}>
        <IconButton
          size="small"
          onClick={(e) => setAncla(e.currentTarget)}
          aria-label={`Formato de ${grupo.titulo}`}
          sx={{ color: n ? 'primary.main' : 'text.disabled', ...sx }}
        >
          <Badge badgeContent={n} color="primary" overlap="circular">
            <TuneOutlinedIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={ancla !== null}
        anchorEl={ancla}
        onClose={() => setAncla(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 1.5, width: 320, maxWidth: '90vw' } } }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {grupo.titulo}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
          Solo esta parte. Lo que fije aquí manda sobre el formato general.
          {grupo.nota ? ` ${grupo.nota}` : ''}
        </Typography>
        <ControlesFormato grupo={grupo} valores={valores} alCambiar={alCambiar} predeterminados={predeterminados} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
          ★ predeterminado del tipo · la vista previa se actualiza sola.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 0.75 }}>
          <Tooltip title="Volver a los valores predeterminados de este tipo de documento">
            <span>
              <Button size="small" onClick={restablecer} disabled={igualAlPredeterminado}>
                Restablecer
              </Button>
            </span>
          </Tooltip>
          {alPredeterminar && (
            <Tooltip title={`Guardar estos valores de «${grupo.titulo}» como predeterminados para los documentos nuevos de este tipo`}>
              <span>
                <Button size="small" onClick={() => void predeterminar()} disabled={guardando || igualAlPredeterminado}>
                  Predeterminar
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Popover>
    </>
  )
}

/**
 * Cinta de formato general, al estilo de la cinta de Word (Edison 2026-10-10, segunda vuelta:
 * «visualmente el formato general sea como el de Word y mejor todavía»).
 *
 * Los mismos grupos y controles de `formato.ts` (`formatoGeneral`), pero en una franja
 * horizontal: cada grupo es un bloque con sus controles arriba y su nombre abajo, como los
 * grupos de la cinta (Texto · Espacios · Página y pie · Notas y adjuntos · Firma y sello). Cada
 * control es compacto: un icono que dice qué es, el valor que rige (p. ej. «11 pt», «1,15»,
 * «2,54 cm») y un rótulo breve debajo; el detalle y la ayuda salen al pasar el ratón. Los
 * ajustes finos (posición de la firma, del sello) son un − valor + en línea. Lo que el ajuste
 * automático cambió en el PDF se señala en rojo bajo el control («PDF: 10,5 pt»), igual que en
 * el panel anterior. La lógica (valores, predeterminados ★, efectivos) no cambia: viene del
 * mismo `formato.ts`.
 */
import type { ReactElement } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import FormatSizeIcon from '@mui/icons-material/FormatSize'
import FormatLineSpacingIcon from '@mui/icons-material/FormatLineSpacing'
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease'
import HeightIcon from '@mui/icons-material/Height'
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined'
import BorderOuterIcon from '@mui/icons-material/BorderOuter'
import TagIcon from '@mui/icons-material/Tag'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import SuperscriptIcon from '@mui/icons-material/Superscript'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import SpaceBarIcon from '@mui/icons-material/SpaceBar'
import {
  etiquetaLegado,
  etiquetaOpcion,
  moverFino,
  valorFino,
  type Control,
  type Fino,
  type GrupoFormato,
} from '../formato'

type Valores = Record<string, string>
type Cambiar = (clave: string, valor: string) => void

const ICONOS: Record<string, ReactElement> = {
  fmt_tamano: <FormatSizeIcon fontSize="small" />,
  fmt_interlineado: <FormatLineSpacingIcon fontSize="small" />,
  fmt_espacioparrafos: <HeightIcon fontSize="small" />,
  fmt_sangria: <FormatIndentIncreaseIcon fontSize="small" />,
  fmt_tabla_tamano: <TableChartOutlinedIcon fontSize="small" />,
  fmt_margenes: <BorderOuterIcon fontSize="small" />,
  fmt_folio: <TagIcon fontSize="small" />,
  fmt_pie_forma: <FormatListNumberedIcon fontSize="small" />,
  fmt_notas_tamano: <SuperscriptIcon fontSize="small" />,
  fmt_pie_tamano: <AttachFileIcon fontSize="small" />,
  fmt_pie_espacio: <HeightIcon fontSize="small" />,
  fmt_ajuste_auto: <AutoFixHighIcon fontSize="small" />,
  fmt_sello: <VerifiedOutlinedIcon fontSize="small" />,
  fmt_firma_espacio: <DrawOutlinedIcon fontSize="small" />,
  fmt_sello_altura: <SwapVertIcon fontSize="small" />,
}

/** Rótulo corto bajo cada control (la etiqueta completa va en la ayuda). */
const ROTULO: Record<string, string> = {
  fmt_tamano: 'Letra',
  fmt_interlineado: 'Interlineado',
  fmt_espacioparrafos: 'Párrafos',
  fmt_sangria: 'Sangría',
  fmt_tabla_tamano: 'Tablas',
  fmt_espacio_partes: 'Cabecera',
  fmt_espacio_cuerpo: 'Asunto → texto',
  fmt_espacio_saludo: 'Saludo → texto',
  fmt_margenes: 'Márgenes',
  fmt_folio: 'Folio',
  fmt_pie_forma: 'Adj. y c.c.',
  fmt_notas_tamano: 'Notas',
  fmt_pie_tamano: 'Adj. e iniciales',
  fmt_pie_espacio: 'Aire sobre Adj.',
  fmt_ajuste_auto: 'Firma sola',
  fmt_sello: 'Sello',
  fmt_firma_espacio: 'Firma',
  fmt_sello_altura: 'Sello ↕',
}

/** «11 pt · estándar» → «11 pt»; «Ajustar solo (se avisa…)» → «Ajustar solo». */
function corto(texto: string): string {
  return texto.split(' · ')[0].split(' (')[0].trim()
}

function Compacto({ c, valores, alCambiar, predeterminados, efectivos }: { c: Control; valores: Valores; alCambiar: Cambiar; predeterminados?: Valores; efectivos?: Valores }) {
  const actual = valores[c.clave] ?? ''
  const opciones = c.opciones.some((o) => o.v === actual) ? c.opciones : [...c.opciones, { v: actual, t: etiquetaLegado(actual) }]
  const pred = predeterminados?.[c.clave] ?? ''
  const efectivo = efectivos?.[c.clave]
  const opEfectiva = efectivo !== undefined && efectivo !== actual ? c.opciones.find((o) => o.v === efectivo) : undefined
  const cambiado = actual !== pred
  return (
    <Tooltip title={<><b>{c.etiqueta}.</b> {c.ayuda ?? ''}</>} placement="top" enterDelay={400} disableInteractive>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
        <TextField
          select
          size="small"
          value={actual}
          onChange={(e) => alCambiar(c.clave, e.target.value)}
          variant="outlined"
          sx={{
            minWidth: 92,
            '& .MuiInputBase-root': { height: 30, fontSize: 12.5, pl: 0.5, bgcolor: cambiado ? 'action.selected' : 'background.paper' },
            '& .MuiSelect-select': { py: 0, pl: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 },
          }}
          SelectProps={{
            displayEmpty: true,
            renderValue: (v) => {
              const o = opciones.find((x) => x.v === v)
              return (
                <>
                  <Box component="span" sx={{ color: 'text.secondary', display: 'inline-flex' }}>{ICONOS[c.clave] ?? <SpaceBarIcon fontSize="small" />}</Box>
                  <span>{o ? corto(etiquetaOpcion(c.clave, o, valores)) : String(v)}</span>
                </>
              )
            },
          }}
          inputProps={{ 'aria-label': c.etiqueta }}
        >
          {opciones.map((o) => (
            <MenuItem key={o.v} value={o.v} dense>
              {etiquetaOpcion(c.clave, o, valores)}
              {o.v === pred ? ' ★' : ''}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1.2, mt: 0.25, color: opEfectiva ? 'error.main' : 'text.secondary', fontWeight: opEfectiva ? 600 : 400, whiteSpace: 'nowrap' }}>
          {opEfectiva ? `PDF: ${corto(etiquetaOpcion(c.clave, opEfectiva, valores))}` : (ROTULO[c.clave] ?? c.etiqueta)}
        </Typography>
      </Box>
    </Tooltip>
  )
}

function FinoCompacto({ f, valores, alCambiar, efectivos }: { f: Fino; valores: Valores; alCambiar: Cambiar; efectivos?: Valores }) {
  const actual = valores[f.clave] ?? ''
  const efectivo = efectivos?.[f.clave]
  const distinto = efectivo !== undefined && efectivo !== (actual || `${f.base}cm`)
  const valor = `${String(valorFino(f, valores)).replace('.', ',')} cm`
  return (
    <Tooltip title={<><b>{f.etiqueta}.</b> {f.ayuda}{actual ? '' : ' (valor estándar)'}</>} placement="top" enterDelay={400} disableInteractive>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', height: 30, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: actual ? 'action.selected' : 'background.paper', px: 0.25 }}>
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => alCambiar(f.clave, moverFino(f, valores, f.subirResta ? 1 : -1))} aria-label={`Menos ${f.etiqueta}`}><RemoveIcon sx={{ fontSize: 16 }} /></IconButton>
          <Box component="span" sx={{ color: 'text.secondary', display: 'inline-flex', mr: 0.25 }}>{ICONOS[f.clave]}</Box>
          <Typography component="span" sx={{ fontSize: 12.5, minWidth: 44, textAlign: 'center' }}>{valor}</Typography>
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => alCambiar(f.clave, moverFino(f, valores, f.subirResta ? -1 : 1))} aria-label={`Más ${f.etiqueta}`}><AddIcon sx={{ fontSize: 16 }} /></IconButton>
        </Box>
        <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1.2, mt: 0.25, color: distinto ? 'error.main' : 'text.secondary', fontWeight: distinto ? 600 : 400, whiteSpace: 'nowrap' }}>
          {distinto ? `PDF: ${efectivo.replace('cm', ' cm').replace('.', ',')}` : (ROTULO[f.clave] ?? f.etiqueta)}
        </Typography>
      </Box>
    </Tooltip>
  )
}

export default function CintaFormato({ grupos, valores, alCambiar, predeterminados, efectivos }: {
  grupos: GrupoFormato[]
  valores: Valores
  alCambiar: Cambiar
  predeterminados?: Valores
  efectivos?: Valores
}) {
  return (
    <Box
      sx={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 0,
        border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default',
        overflowX: 'auto',
      }}
    >
      {grupos.map((g, i) => (
        <Box
          key={g.titulo}
          sx={{
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 0.5,
            px: 1.25, py: 0.75, borderRight: i < grupos.length - 1 ? '1px solid' : 0, borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
            {g.controles.map((c) => (
              <Compacto key={c.clave} c={c} valores={valores} alCambiar={alCambiar} predeterminados={predeterminados} efectivos={efectivos} />
            ))}
            {g.finos.map((f) => (
              <FinoCompacto key={f.clave} f={f} valores={valores} alCambiar={alCambiar} efectivos={efectivos} />
            ))}
          </Box>
          <Typography variant="caption" sx={{ textAlign: 'center', color: 'text.disabled', fontSize: 10.5, letterSpacing: 0.3, textTransform: 'uppercase' }}>
            {g.titulo}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

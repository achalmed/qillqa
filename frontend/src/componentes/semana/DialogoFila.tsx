/**
 * El formulario de UNA fila de la semana (actividad, pedido o foto), armado desde
 * una lista de campos: las tres listas se editan con el mismo componente, y cada
 * campo es una clave del YAML que el generador lee (componentes/semana/modelo.ts).
 * Las claves que el formulario no muestra viajan intactas (`{...inicial, ...cambios}`).
 */
import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { type Datos, type Opcion, lista, texto } from './modelo'
import { ConPresencia } from '../Presencia'
import AreaMarkdown from './AreaMarkdown'

/** Textos que el informe imprime con su Markdown mínimo (filtro `md` de
 *  marco_documental/generadores/informe-sr/plantillas_tex): solo en ellos se
 *  ofrece la barra de formato; en los demás, los asteriscos saldrían tal cual. */
const CLAVES_MARKDOWN = new Set([
  'presentacion', 'resumen', 'marco_normativo', 'matriz_intro', 'metodologia', 'prioridad_explicacion',
  'criterio_competencia', 'pauta_prosa', 'analisis_intro', 'analisis_sectores', 'analisis_entidades',
  'analisis_prioridad', 'seguimiento_intro', 'compromisos_prosa', 'conclusiones', 'ambito_descripcion',
  'relato', 'relato_antes', 'relato_despues',
])

const limpia = (v: unknown) => lista(v).map((x) => x.trim()).filter(Boolean)

export interface Campo {
  clave: string
  etiqueta: string
  /** texto · area (párrafo) · lineas (una entrada por línea → lista) · chips (lista con sugerencias)
   *  · opcion · fecha · hora · numero · si_no */
  tipo: 'texto' | 'area' | 'lineas' | 'chips' | 'opcion' | 'fecha' | 'hora' | 'numero' | 'si_no'
  opciones?: Opcion[]
  ayuda?: string
  /** Ocupa media fila en pantallas anchas. */
  medio?: boolean
  /** Sugerencias para `chips` (se piden al escribir). */
  sugerir?: (q: string) => Promise<string[]>
}

function CampoChips({ c, valor, alCambiar }: { c: Campo; valor: string[]; alCambiar: (v: string[]) => void }) {
  const [opciones, setOpciones] = useState<string[]>([])
  return (
    <Autocomplete
      multiple
      freeSolo
      options={opciones}
      value={valor}
      onChange={(_, v) => alCambiar(v.map((x) => x.trim()).filter(Boolean))}
      onInputChange={(_, q) => {
        if (c.sugerir && q.trim().length >= 2) c.sugerir(q).then(setOpciones).catch(() => setOpciones([]))
      }}
      renderTags={(v, props) => v.map((x, i) => <Chip size="small" label={x} {...props({ index: i })} key={x} />)}
      renderInput={(p) => <TextField {...p} label={c.etiqueta} helperText={c.ayuda ?? 'Escriba y pulse Enter para añadir.'} />}
    />
  )
}

/** Un campo, según su tipo. */
export function ControlCampo({ c, datos, poner }: { c: Campo; datos: Datos; poner: (clave: string, v: unknown) => void }) {
  const v = datos[c.clave]
  switch (c.tipo) {
    case 'area':
      if (CLAVES_MARKDOWN.has(c.clave))
        return <AreaMarkdown clave={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda} valor={texto(v)} alCambiar={(x) => poner(c.clave, x || null)} />
      return <TextField label={c.etiqueta} helperText={c.ayuda} value={texto(v)} onChange={(e) => poner(c.clave, e.target.value || null)} multiline minRows={3} fullWidth />
    case 'lineas':
      return (
        <TextField
          label={c.etiqueta}
          helperText={c.ayuda ?? 'Una por línea.'}
          value={lista(v).join('\n')}
          onChange={(e) => poner(c.clave, e.target.value.split('\n'))}
          onBlur={() => poner(c.clave, limpia(datos[c.clave]))}
          multiline
          minRows={3}
          fullWidth
        />
      )
    case 'chips':
      return <CampoChips c={c} valor={lista(v)} alCambiar={(x) => poner(c.clave, x)} />
    case 'opcion':
      return (
        <TextField select label={c.etiqueta} helperText={c.ayuda} value={texto(v)} onChange={(e) => poner(c.clave, e.target.value || null)} fullWidth>
          <MenuItem value=""><em>—</em></MenuItem>
          {(c.opciones ?? []).map((o) => <MenuItem key={o.valor} value={o.valor}>{o.etiqueta}</MenuItem>)}
        </TextField>
      )
    case 'si_no':
      return <FormControlLabel control={<Switch checked={Boolean(v)} onChange={(e) => poner(c.clave, e.target.checked)} />} label={c.etiqueta} />
    case 'numero':
      return <TextField type="number" label={c.etiqueta} helperText={c.ayuda} value={texto(v)} onChange={(e) => poner(c.clave, e.target.value === '' ? null : Number(e.target.value))} fullWidth />
    default:
      return (
        <TextField
          type={c.tipo === 'fecha' ? 'date' : c.tipo === 'hora' ? 'time' : 'text'}
          label={c.etiqueta}
          helperText={c.ayuda}
          value={texto(v)}
          onChange={(e) => poner(c.clave, e.target.value || null)}
          InputLabelProps={c.tipo === 'fecha' || c.tipo === 'hora' ? { shrink: true } : undefined}
          fullWidth
        />
      )
  }
}

/** Los campos en una grilla de dos columnas (una en el celular). */
export function CamposFila({ campos, datos, poner, pendientes = [], prefijo = '' }: {
  campos: Campo[]
  datos: Datos
  poner: (clave: string, v: unknown) => void
  /** Claves que siguen con el texto de la plantilla: se marcan. */
  pendientes?: string[]
  /** Distingue el mismo campo en filas distintas (la presencia es por campo). */
  prefijo?: string
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 0.5 }}>
      {campos.map((c) => (
        <Box key={c.clave} sx={{ gridColumn: c.medio ? 'auto' : '1 / -1', minWidth: 0, ...(pendientes.includes(c.clave) ? { borderLeft: '1px solid', borderColor: 'warning.main', pl: 1 } : {}) }}>
          {/* Quién más escribe en este campo (2026-10-05, componentes/Presencia.tsx). */}
          <ConPresencia clave={`${prefijo}${c.clave}`}>
            <ControlCampo c={c} datos={datos} poner={poner} />
          </ConPresencia>
          {/* 2026-10-06: sin texto bajo cada campo pendiente; basta el borde y el aviso general de «Textos». */}
        </Box>
      ))}
    </Box>
  )
}

export default function DialogoFila({
  abierto,
  titulo,
  campos,
  inicial,
  alCerrar,
  alGuardar,
  pie,
  cabecera,
}: {
  abierto: boolean
  titulo: string
  campos: Campo[]
  inicial: Datos
  alCerrar: () => void
  alGuardar: (datos: Datos) => Promise<void>
  /** Acciones propias a la izquierda (p. ej. «Derivar con oficio»). */
  pie?: React.ReactNode
  /** Lo que se edita, a la vista sobre el formulario (p. ej. la foto). */
  cabecera?: React.ReactNode
}) {
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [datos, setDatos] = useState<Datos>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (abierto) {
      setDatos(inicial)
      setError('')
    }
  }, [abierto, inicial])
  const poner = (clave: string, v: unknown) => setDatos((d) => ({ ...d, [clave]: v }))

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      // Las listas escritas línea a línea se guardan sin líneas vacías.
      const limpio = { ...datos }
      for (const c of campos) if (c.tipo === 'lineas') limpio[c.clave] = limpia(limpio[c.clave])
      await alGuardar(limpio)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onClose={guardando ? undefined : alCerrar} fullScreen={celular} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{titulo}</DialogTitle>
      <DialogContent dividers>
        {cabecera}
        <CamposFila campos={campos} datos={datos} poner={poner} prefijo={`${titulo}:`} />
        {error && <Typography color="error" variant="body2" sx={{ mt: 2 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ mr: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap' }}>{pie}</Box>
        <Button onClick={alCerrar} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </DialogActions>
    </Dialog>
  )
}

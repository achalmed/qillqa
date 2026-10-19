/**
 * Descargar los pedidos en Markdown ELIGIENDO qué entra (Edison 2026-10-08: «tal vez quiero
 * solo demandas con sus fechas, o demandas con instituciones…, o de qué fecha o de qué
 * instituciones»). Lo arma el servidor (servicios/pedidos_md.py::Opciones); aquí solo se elige.
 * Lo último elegido se recuerda en este navegador.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import { descargarTexto } from '../../api'

const DETALLES: [string, string][] = [
  ['fecha', 'Fecha'], ['lugar', 'Lugar'], ['entidades', 'Instituciones'], ['prioridad', 'Prioridad'],
  ['responsable', 'Responsable'], ['plazo', 'Plazo'], ['estado', 'Estado'], ['oficio', 'Oficio'],
  ['actuacion', 'Actuación'], ['observaciones', 'Observaciones'],
]
const AGRUPAR: [string, string][] = [
  ['actividad', 'Por actividad'], ['entidad', 'Por institución'], ['fecha', 'Por fecha'], ['estado', 'Por estado'], ['ninguno', 'Lista simple'],
]
const ESTADOS = ['registrado', 'derivado', 'respondido', 'cerrado']
// Atajos para lo que más se pide.
const ATAJOS: { texto: string; detalles: string[]; agrupar: string }[] = [
  { texto: 'Pedidos con sus fechas', detalles: ['fecha'], agrupar: 'fecha' },
  { texto: 'Pedidos con instituciones', detalles: ['entidades'], agrupar: 'entidad' },
  { texto: 'Todo', detalles: DETALLES.map(([k]) => k), agrupar: 'actividad' },
]

interface Eleccion {
  detalles: string[]
  agrupar: string
  resumen: boolean
  desde: string
  hasta: string
  entidad: string
  estados: string[]
}
const DEFECTO: Eleccion = {
  detalles: ['entidades', 'prioridad', 'responsable', 'plazo', 'estado', 'oficio', 'actuacion', 'observaciones'],
  agrupar: 'actividad', resumen: true, desde: '', hasta: '', entidad: '', estados: [],
}
const CLAVE = 'sgdp-exportar-pedidos'

function leer(): Eleccion {
  try {
    return { ...DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') }
  } catch {
    return DEFECTO
  }
}

export default function DialogoExportarMd({ abierto, alCerrar, ruta, titulo, semanas, alAvisar }: {
  abierto: boolean
  alCerrar: () => void
  /** /api/semanas/{id}/pedidos.md o /api/semanas/pedidos.md */
  ruta: string
  titulo: string
  /** Solo en la descarga de todas: para elegir algunas semanas. */
  semanas?: { id: number; texto: string }[]
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
}) {
  const [e, setE] = useState<Eleccion>(leer)
  const [elegidas, setElegidas] = useState<number[]>([])
  const [ocupado, setOcupado] = useState(false)
  const poner = <K extends keyof Eleccion>(k: K, v: Eleccion[K]) => setE((x) => ({ ...x, [k]: v }))
  const alternar = (k: 'detalles' | 'estados', v: string) =>
    setE((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))

  const descargar = async () => {
    const p = new URLSearchParams()
    p.set('detalles', e.detalles.join(','))
    p.set('agrupar', e.agrupar)
    p.set('resumen', String(e.resumen))
    if (e.desde) p.set('desde', e.desde)
    if (e.hasta) p.set('hasta', e.hasta)
    if (e.entidad.trim()) p.set('entidad', e.entidad.trim())
    if (e.estados.length) p.set('estados', e.estados.join(','))
    if (elegidas.length) p.set('semanas', elegidas.join(','))
    try {
      localStorage.setItem(CLAVE, JSON.stringify(e))
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
    setOcupado(true)
    try {
      const n = await descargarTexto(`${ruta}?${p}`)
      alAvisar?.('success', `Descargado: ${n}`)
      alCerrar()
    } catch (err) {
      alAvisar?.('error', err instanceof Error ? err.message : 'No se pudo descargar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {ATAJOS.map((a) => (
            <Chip key={a.texto} label={a.texto} variant="outlined" onClick={() => setE((x) => ({ ...x, detalles: a.detalles, agrupar: a.agrupar }))} />
          ))}
        </Box>
        {semanas && semanas.length > 1 && (
          <Box>
            <Typography variant="overline" color="text.secondary">Semanas</Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {semanas.map((s) => (
                <Chip key={s.id} size="small" label={s.texto} color={elegidas.includes(s.id) ? 'primary' : 'default'}
                  variant={elegidas.includes(s.id) ? 'filled' : 'outlined'}
                  onClick={() => setElegidas((x) => (x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id]))} />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">{elegidas.length ? `${elegidas.length} elegida(s)` : 'Ninguna elegida: van todas.'}</Typography>
          </Box>
        )}
        <Box>
          <Typography variant="overline" color="text.secondary">Qué datos de cada pedido</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' } }}>
            {DETALLES.map(([k, t]) => (
              <FormControlLabel key={k} control={<Checkbox size="small" checked={e.detalles.includes(k)} onChange={() => alternar('detalles', k)} />} label={<Typography variant="body2">{t}</Typography>} />
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <TextField select size="small" label="Ordenar" value={e.agrupar} onChange={(ev) => poner('agrupar', ev.target.value)}>
            {AGRUPAR.map(([k, t]) => <MenuItem key={k} value={k}>{t}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Solo de la institución" placeholder="p. ej. MINSA" value={e.entidad} onChange={(ev) => poner('entidad', ev.target.value)} />
          <TextField size="small" type="date" label="Desde" value={e.desde} onChange={(ev) => poner('desde', ev.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="Hasta" value={e.hasta} onChange={(ev) => poner('hasta', ev.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">Estados</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {ESTADOS.map((s) => (
              <Chip key={s} size="small" label={s[0].toUpperCase() + s.slice(1)} color={e.estados.includes(s) ? 'primary' : 'default'}
                variant={e.estados.includes(s) ? 'filled' : 'outlined'} onClick={() => alternar('estados', s)} />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">{e.estados.length ? '' : 'Ninguno elegido: van todos.'}</Typography>
        </Box>
        <FormControlLabel control={<Switch checked={e.resumen} onChange={(ev) => poner('resumen', ev.target.checked)} />} label={<Typography variant="body2">Incluir el resumen por estado</Typography>} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setE(DEFECTO); setElegidas([]) }} sx={{ mr: 'auto' }}>Restablecer</Button>
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" startIcon={<FileDownloadOutlinedIcon />} onClick={() => void descargar()} disabled={ocupado}>Descargar .md</Button>
      </DialogActions>
    </Dialog>
  )
}

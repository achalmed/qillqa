/**
 * DOCUMENTOS DESDE UN WORD (2026-10-18; fase 0 de docs/plataforma/formato-word.md). Un `.docx` con uno
 * o varios oficios → `POST /api/documentos/importar-word` lee cada documento (encabezado, destinatario,
 * asunto, referencia, cuerpo con notas al pie) → vista previa: una fila por documento con lo reconocido,
 * sus avisos, el tipo detectado (corregible) y una casilla → «Crear» hace un borrador por fila, que
 * sigue el trámite de siempre (registro, numeración, revisión, firma, seguimiento) uno por uno.
 * Nada se numera aquí; lo que no se reconoció se completa en el editor.
 */
import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { subirArchivo } from '../api'
import { PALETA } from '../paleta'

interface Leido {
  indice: number
  tipo: string
  campos: Record<string, string>
  encabezado: string
  avisos: string[]
  palabras: number
}

export default function CargarWordDocumentos({ abierto, tipos, alCerrar, alCreados, alAvisar }: {
  abierto: boolean
  tipos: { codigo: string; nombre: string; externo?: boolean }[]
  alCerrar: () => void
  /** Los borradores creados, en el orden del Word. */
  alCreados: (creados: { id: number; indice: number; tipo: string; asunto: string }[]) => void
  alAvisar?: (tipo: 'error' | 'ok', texto: string) => void
}) {
  const [token, setToken] = useState('')
  const [nombre, setNombre] = useState('')
  const [leidos, setLeidos] = useState<Leido[] | null>(null)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [tiposElegidos, setTiposElegidos] = useState<Record<number, string>>({})
  const [ocupado, setOcupado] = useState<'leyendo' | 'creando' | ''>('')
  const [error, setError] = useState('')
  const selector = useRef<HTMLInputElement | null>(null)

  const cerrar = () => { setToken(''); setNombre(''); setLeidos(null); setElegidos(new Set()); setTiposElegidos({}); setError(''); alCerrar() }

  const leer = async (archivo: File) => {
    setError('')
    setOcupado('leyendo')
    try {
      const fd = new FormData()
      fd.append('archivo', archivo, archivo.name)
      const r = await subirArchivo<{ token: string; documentos: Leido[] }>('/api/documentos/importar-word', fd)
      setToken(r.token)
      setNombre(archivo.name)
      setLeidos(r.documentos)
      setElegidos(new Set(r.documentos.map((d) => d.indice)))
      setTiposElegidos(Object.fromEntries(r.documentos.map((d) => [d.indice, d.tipo])))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el Word.')
    } finally {
      setOcupado('')
    }
  }

  const crear = async () => {
    if (!token || elegidos.size === 0) return
    setError('')
    setOcupado('creando')
    try {
      const fd = new FormData()
      fd.append('token', token)
      fd.append('aplicar', 'true')
      fd.append('indices', [...elegidos].sort((a, b) => a - b).join(','))
      fd.append('tipos', Object.entries(tiposElegidos).map(([i, t]) => `${i}=${t}`).join(','))
      const r = await subirArchivo<{ creados: { id: number; indice: number; tipo: string; asunto: string }[] }>('/api/documentos/importar-word', fd)
      alAvisar?.('ok', r.creados.length === 1 ? 'Borrador creado desde el Word.' : `${r.creados.length} borradores creados desde el Word; cada uno sigue su trámite.`)
      alCreados(r.creados)
      cerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron crear los documentos.')
    } finally {
      setOcupado('')
    }
  }

  const alternar = (i: number) => setElegidos((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const redactables = tipos.filter((t) => !t.externo)

  return (
    <Dialog open={abierto} onClose={cerrar} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>Documentos desde un Word</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {!leidos && (
          <>
            <Typography variant="body2" color="text.secondary">
              Un Word con uno o varios oficios: cada «OFICIO N.° …» será un borrador con su destinatario, asunto, referencia y cuerpo.
            </Typography>
            <Button variant="outlined" startIcon={ocupado ? <CircularProgress size={16} /> : <UploadFileIcon />} disabled={Boolean(ocupado)} onClick={() => selector.current?.click()} sx={{ alignSelf: 'flex-start' }}>
              Elegir el Word (.docx)
            </Button>
            <input ref={selector} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); e.target.value = '' }} />
          </>
        )}
        {leidos && (
          <>
            <Typography variant="body2" color="text.secondary">
              {nombre}: {leidos.length === 1 ? 'un documento' : `${leidos.length} documentos`}. Revise y desmarque lo que no deba crearse.
            </Typography>
            {leidos.map((d) => (
              <Box key={d.indice} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: elegidos.has(d.indice) ? 'background.paper' : PALETA.superficieTenue, opacity: elegidos.has(d.indice) ? 1 : 0.65 }}>
                <Checkbox size="small" checked={elegidos.has(d.indice)} onChange={() => alternar(d.indice)} sx={{ p: 0.25, mt: 0.25 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ flex: '1 1 160px', minWidth: 0 }} noWrap>{d.indice}. {d.campos.asunto || d.encabezado || 'Sin asunto'}</Typography>
                    <TextField select size="small" value={tiposElegidos[d.indice] ?? d.tipo} onChange={(e) => setTiposElegidos((t) => ({ ...t, [d.indice]: e.target.value }))} sx={{ minWidth: 150 }} inputProps={{ 'aria-label': `Tipo del documento ${d.indice}` }}>
                      {redactables.map((t) => <MenuItem key={t.codigo} value={t.codigo}>{t.nombre}</MenuItem>)}
                    </TextField>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {[d.campos.destinatario_nombre && `Para: ${d.campos.destinatario_nombre}${d.campos.destinatario_cargo ? `, ${d.campos.destinatario_cargo}` : ''}`, d.campos.fecha && `Fecha ${d.campos.fecha}`, d.campos.referencia && `Ref.: ${d.campos.referencia.slice(0, 60)}`, `${d.palabras} palabras`].filter(Boolean).join(' · ')}
                  </Typography>
                  {d.avisos.map((a) => <Typography key={a} variant="caption" sx={{ display: 'block', color: PALETA.avisoOscuro }}>{a}</Typography>)}
                </Box>
              </Box>
            ))}
          </>
        )}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={cerrar} color="inherit">Cancelar</Button>
        {leidos && <Button onClick={() => { setLeidos(null); setToken('') }} color="inherit">Otro Word</Button>}
        {leidos && (
          <Button variant="contained" onClick={() => void crear()} disabled={elegidos.size === 0 || Boolean(ocupado)} startIcon={ocupado === 'creando' ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Crear {elegidos.size === 1 ? 'el borrador' : `${elegidos.size} borradores`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

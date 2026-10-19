// CargarWord — «Cargar desde Word» en un proyecto de ley (2026-10-05).
//
// El asesor trabaja el texto en Word y lo sube: el servidor lo lee
// (`POST /api/proyectos/{pid}/importar-word`) y primero muestra qué irá a cada
// parte —palabras, notas al pie, fotos, si reemplaza texto— y solo con
// «Cargar» lo aplica. Cada parte queda como versión nueva; la anterior sigue
// en su historial.
import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { subirArchivo } from '../api'

interface Parte {
  clave: string; titulo: string; titulo_propio: string; palabras: number; notas: number; fotos: number; tablas: number
  existe: boolean; reemplaza: boolean; ocupada: boolean
}

interface Props {
  pid: number
  deshabilitado?: boolean
  alTerminar: () => void
  alAvisar: (tipo: 'success' | 'error' | 'info', t: string) => void
  /** Celular: sin botón propio; el menú ⋮ de la cabecera abre el selector con esta función. */
  abrirRef?: React.MutableRefObject<(() => void) | null>
}

export default function CargarWord({ pid, deshabilitado, alTerminar, alAvisar, abrirRef }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  if (abrirRef) abrirRef.current = () => entrada.current?.click()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [partes, setPartes] = useState<Parte[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const enviar = (f: File, aplicar: boolean) => {
    const datos = new FormData()
    datos.append('archivo', f)
    datos.append('aplicar', aplicar ? 'true' : 'false')
    return subirArchivo<{ partes?: Parte[]; aplicadas?: string[]; omitidas?: string[] }>(`/api/proyectos/${pid}/importar-word`, datos)
  }

  async function alElegir(f: File | undefined) {
    if (!f) return
    setTrabajando(true)
    try {
      const r = await enviar(f, false)
      setArchivo(f)
      setPartes(r.partes ?? [])
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo leer el Word.')
    } finally {
      setTrabajando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function cargar() {
    if (!archivo) return
    setTrabajando(true)
    try {
      const r = await enviar(archivo, true)
      const n = r.aplicadas?.length ?? 0
      alAvisar('success', `Word cargado en ${n} parte${n === 1 ? '' : 's'}.`)
      setPartes(null)
      setArchivo(null)
      alTerminar()
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo cargar el Word.')
    } finally {
      setTrabajando(false)
    }
  }

  const aplicables = (partes ?? []).filter((x) => x.existe && !x.ocupada)

  return (
    <>
      {!abrirRef && <Tooltip title="Cargar un .docx; antes verá qué va a cada parte.">
        <span>
          <Button size="small" startIcon={<DescriptionOutlinedIcon />} disabled={deshabilitado || trabajando} onClick={() => entrada.current?.click()}>
            {trabajando && !partes ? 'Leyendo el Word…' : 'Cargar desde Word'}
          </Button>
        </span>
      </Tooltip>}
      <input ref={entrada} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void alElegir(e.target.files?.[0])} />
      <Dialog open={partes !== null} onClose={() => !trabajando && setPartes(null)} maxWidth="md" fullWidth>
        <DialogTitle>Cargar «{archivo?.name}»</DialogTitle>
        <DialogContent>
          {partes && partes.length === 0 ? (
            <Alert severity="warning">Sin partes: faltan «FÓRMULA LEGAL» o «EXPOSICIÓN DE MOTIVOS».</Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Lo reemplazado queda en «Versiones».
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Parte</TableCell>
                    <TableCell align="right">Palabras</TableCell>
                    <TableCell align="right">Notas al pie</TableCell>
                    <TableCell align="right">Fotos</TableCell>
                    <TableCell>Qué pasará</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(partes ?? []).map((x) => (
                    <TableRow key={x.clave}>
                      <TableCell>
                        {x.titulo}
                        {x.titulo_propio && <Box component="div" sx={{ fontSize: 12, color: 'text.secondary' }}>pasará a llamarse «{x.titulo_propio}»</Box>}
                      </TableCell>
                      <TableCell align="right">{x.palabras}</TableCell>
                      <TableCell align="right">{x.notas || '—'}</TableCell>
                      <TableCell align="right">{x.fotos || '—'}</TableCell>
                      <TableCell sx={{ color: x.ocupada || !x.existe ? 'warning.main' : 'text.primary' }}>
                        {!x.existe ? 'no hay esa parte: se omite' : x.ocupada ? 'otra persona la está escribiendo: se omite' : x.reemplaza ? 'reemplaza el texto actual' : 'llena la parte vacía'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPartes(null)} disabled={trabajando}>Cancelar</Button>
          <Button variant="contained" onClick={() => void cargar()} disabled={trabajando || !aplicables.length}>
            {trabajando ? 'Cargando…' : `Cargar ${aplicables.length} parte${aplicables.length === 1 ? '' : 's'}`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

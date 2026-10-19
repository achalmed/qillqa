/**
 * IMPORTAR CONTACTOS (2026-10-13): el `.vcf` que exporta el celular o Google Contacts, o el `.csv`
 * de Google. Tres pasos en una ventana: elegir el archivo → VISTA PREVIA con los duplicados ya
 * detectados por el servidor (mismo celular, correo o nombre; también los repetidos dentro del
 * archivo), cada uno con su acción —Crear, Fusionar con la ficha que existe u Omitir— → Guardar.
 * Fusionar solo rellena lo vacío: nunca pisa un dato del directorio (servicios/contactos.py).
 */
import { useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined'
import { api, subirArchivo } from '../../api'
import { PALETA } from '../../paleta'
import AvatarContacto from './AvatarContacto'
import { telefonoLegible } from './contactos'

type Accion = 'crear' | 'fusionar' | 'omitir'

interface Fila {
  fila: number
  nombre: string
  celular: string
  telefono: string
  email: string
  email_alterno: string
  institucion: string
  institucion_id: number | null
  cargo: string
  area: string
  notas: string
  etiquetas: string[]
  favorito: boolean
  accion: Accion
  duplicado: { persona_id: number; nombre: string; cargo: string; motivo: string } | null
  repetido_de: number | null
  motivo?: string
}

interface Previa {
  contactos: Fila[]
  total: number
  duplicados: number
  repetidos: number
}

const ETIQUETA_ACCION: Record<Accion, string> = { crear: 'Crear', fusionar: 'Fusionar', omitir: 'Omitir' }

export default function ImportarContactos({ abierto, alCerrar, alTerminar }: {
  abierto: boolean
  alCerrar: () => void
  alTerminar: (resumen: string) => void
}) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const entrada = useRef<HTMLInputElement>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'duplicados'>('todos')

  const reiniciar = () => {
    setPrevia(null)
    setNombreArchivo('')
    setEtiqueta('')
    setError('')
    setFiltro('todos')
  }
  const cerrar = () => {
    if (ocupado) return
    reiniciar()
    alCerrar()
  }

  const leer = async (archivo: File) => {
    setOcupado(true)
    setError('')
    try {
      const f = new FormData()
      f.append('archivo', archivo)
      const r = await subirArchivo<Previa>('/api/directorio/contactos/previa', f)
      setPrevia(r)
      setNombreArchivo(archivo.name)
      setFiltro(r.duplicados + r.repetidos > 0 ? 'duplicados' : 'todos')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setOcupado(false)
    }
  }

  const poner = (fila: number, accion: Accion) =>
    setPrevia((p) => (p ? { ...p, contactos: p.contactos.map((c) => (c.fila === fila ? { ...c, accion } : c)) } : p))

  const cuenta = useMemo(() => {
    const n = { crear: 0, fusionar: 0, omitir: 0 }
    for (const c of previa?.contactos ?? []) n[c.accion] += 1
    return n
  }, [previa])

  const guardar = async () => {
    if (!previa) return
    setOcupado(true)
    setError('')
    try {
      const r = await api<{ creados: number; fusionados: number; omitidos: number }>('/api/directorio/contactos/importar', {
        method: 'POST',
        body: JSON.stringify({
          etiqueta: etiqueta.trim(),
          contactos: previa.contactos.map((c) => ({ ...c, persona_id: c.duplicado?.persona_id ?? null })),
        }),
      })
      reiniciar()
      alTerminar(`Contactos importados: ${r.creados} nuevos, ${r.fusionados} fusionados, ${r.omitidos} omitidos.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar.')
    } finally {
      setOcupado(false)
    }
  }

  const visibles = (previa?.contactos ?? []).filter((c) => filtro === 'todos' || c.duplicado || c.repetido_de !== null)

  return (
    <Dialog open={abierto} onClose={cerrar} fullWidth maxWidth="md" fullScreen={celular}>
      <DialogTitle>Importar contactos</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {!previa && (
          <>
            <Typography variant="body2" color="text.secondary">
              Suba el archivo que exporta su celular o Google Contacts: <b>.vcf</b> (vCard) o <b>.csv</b> de Google. Antes de guardar verá
              los duplicados para fusionarlos u omitirlos.
            </Typography>
            <Box component="button" type="button" onClick={() => entrada.current?.click()} disabled={ocupado}
              sx={{
                border: '2px dashed', borderColor: 'divider', borderRadius: 3, p: { xs: 3, sm: 4 }, bgcolor: 'background.paper', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'text.primary', font: 'inherit',
                '&:hover, &:focus-visible': { borderColor: PALETA.guinda },
              }}>
              <UploadFileOutlinedIcon sx={{ fontSize: 36, color: PALETA.guinda }} />
              <Typography sx={{ fontWeight: 600 }}>Elegir el archivo .vcf o .csv</Typography>
              <Typography variant="caption" color="text.secondary">Hasta 5 MB · Google Contacts: Exportar → vCard o CSV de Google</Typography>
            </Box>
            <input ref={entrada} hidden type="file" accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer(f) }} />
          </>
        )}
        {ocupado && <LinearProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        {previa && (
          <>
            <Typography variant="body2">
              <b>{nombreArchivo}</b>: {previa.total} contacto{previa.total === 1 ? '' : 's'}
              {previa.duplicados ? ` · ${previa.duplicados} ya en el directorio` : ''}
              {previa.repetidos ? ` · ${previa.repetidos} repetido${previa.repetidos === 1 ? '' : 's'} en el archivo` : ''}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip label={`Todos · ${previa.total}`} color={filtro === 'todos' ? 'primary' : 'default'} variant={filtro === 'todos' ? 'filled' : 'outlined'} onClick={() => setFiltro('todos')} />
              <Chip label={`Duplicados · ${previa.duplicados + previa.repetidos}`} color={filtro === 'duplicados' ? 'primary' : 'default'}
                variant={filtro === 'duplicados' ? 'filled' : 'outlined'} onClick={() => setFiltro('duplicados')} disabled={!previa.duplicados && !previa.repetidos} />
            </Box>
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
              {visibles.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Ningún duplicado: todos son nuevos.</Typography>}
              {visibles.map((c) => (
                <Box key={c.fila} sx={{ display: 'flex', gap: 1.25, alignItems: 'center', px: 1.5, py: 1, '& + &': { borderTop: '1px solid', borderColor: 'divider' }, opacity: c.accion === 'omitir' ? 0.6 : 1 }}>
                  <AvatarContacto id={c.fila + 1} nombre={c.nombre} tamano={36} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 500 }} noWrap>{c.nombre}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div" noWrap>
                      {[c.celular && telefonoLegible(c.celular), c.email, c.cargo, c.institucion].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </Typography>
                    {c.duplicado && (
                      <Typography variant="caption" component="div" sx={{ color: PALETA.avisoOscuro }}>
                        Ya está: {c.duplicado.nombre} ({c.duplicado.motivo})
                      </Typography>
                    )}
                    {c.repetido_de !== null && (
                      <Typography variant="caption" component="div" sx={{ color: PALETA.avisoOscuro }}>
                        Repetido en el archivo ({c.motivo}) con «{previa.contactos[c.repetido_de]?.nombre}»
                      </Typography>
                    )}
                  </Box>
                  <TextField select size="small" value={c.accion} onChange={(e) => poner(c.fila, e.target.value as Accion)} sx={{ width: 122, flexShrink: 0 }}
                    inputProps={{ 'aria-label': `Qué hacer con ${c.nombre}` }}>
                    <MenuItem value="crear">Crear</MenuItem>
                    {c.duplicado && <MenuItem value="fusionar">Fusionar</MenuItem>}
                    <MenuItem value="omitir">Omitir</MenuItem>
                  </TextField>
                </Box>
              ))}
            </Box>
            <TextField size="small" label="Etiqueta para lo importado (opcional)" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}
              placeholder="Contactos del celular" inputProps={{ maxLength: 40 }} helperText="Se suma a las etiquetas que traiga cada contacto." />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.25, flexWrap: 'wrap', gap: 1 }}>
        {previa && (
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 180 }}>
            {(['crear', 'fusionar', 'omitir'] as Accion[]).filter((a) => cuenta[a]).map((a) => `${ETIQUETA_ACCION[a]}: ${cuenta[a]}`).join(' · ')}
          </Typography>
        )}
        {previa && <Button onClick={reiniciar} disabled={ocupado}>Otro archivo</Button>}
        <Button onClick={cerrar} disabled={ocupado}>Cancelar</Button>
        {previa && (
          <Button variant="contained" disableElevation onClick={() => void guardar()} disabled={ocupado || cuenta.crear + cuenta.fusionar === 0}>
            Guardar {cuenta.crear + cuenta.fusionar}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

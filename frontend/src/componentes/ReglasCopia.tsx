/**
 * Reglas de COPIA sugerida: qué c.c. propone el sistema y en qué documentos.
 *
 * Vive en Administración porque una regla afecta a todo lo que el despacho
 * escriba de aquí en adelante. Lo que NO hace es enviar nada sola: la copia se
 * propone y hay que confirmarla antes de numerar (ver DialogoCopias.tsx).
 *
 * Cada regla se liga a una persona del DIRECTORIO. Esa es la pieza que hace
 * que «mantener el directorio actualizado» sirva de algo: cuando cambia la
 * autoridad se edita la persona una vez, y el sistema empieza a avisar —en
 * cada documento— que el cargo guardado en la regla ya no es el vigente.
 */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import SyncIcon from '@mui/icons-material/Sync'
import { api } from '../api'
import { EstadoPieza } from './Estilo'
import { confirmar } from './Dialogos'
import Tarjeta from './admin/Tarjeta'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'

interface Regla {
  id: number
  tipos: string
  persona_id: number | null
  tratamiento: string
  nombre: string
  cargo: string
  motivo: string
  orden: number
  activa: boolean
}

interface Sugerida {
  regla_id: number
  nombre: string
  cargo: string
  cambio_en_directorio: boolean
  cargo_anterior: string
}

interface TipoDoc {
  codigo: string
  nombre: string
}

const VACIA: Regla = {
  id: 0,
  tipos: '',
  persona_id: null,
  tratamiento: 'Señor:',
  nombre: '',
  cargo: '',
  motivo: '',
  orden: 0,
  activa: true,
}

export default function ReglasCopia({
  alAvisar,
}: {
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
}) {
  const [reglas, setReglas] = useState<Regla[]>([])
  // En el celular el formulario de la regla ocupa la pantalla entera.
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [tipos, setTipos] = useState<TipoDoc[]>([])
  // Las sugerencias «de todos los tipos» sirven para detectar los cargos que
  // el directorio ya cambió: la lista de reglas por sí sola no lo sabe.
  const [avisos, setAvisos] = useState<Record<number, Sugerida>>({})
  const [editando, setEditando] = useState<Regla | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = () => {
    api<Regla[]>('/api/copias/reglas').then(setReglas).catch(() => setReglas([]))
    api<Sugerida[]>('/api/copias/sugeridas?tipo=oficio')
      .then((s) =>
        setAvisos(Object.fromEntries(s.filter((x) => x.cambio_en_directorio).map((x) => [x.regla_id, x]))),
      )
      .catch(() => setAvisos({}))
  }

  useEffect(() => {
    cargar()
    api<TipoDoc[]>('/api/tipos').then(setTipos).catch(() => setTipos([]))
  }, [])

  const guardar = async () => {
    if (!editando) return
    setGuardando(true)
    try {
      const cuerpo = JSON.stringify({
        tipos: editando.tipos,
        persona_id: editando.persona_id,
        tratamiento: editando.tratamiento,
        nombre: editando.nombre,
        cargo: editando.cargo,
        motivo: editando.motivo,
        orden: editando.orden,
        activa: editando.activa,
      })
      if (editando.id) {
        await api(`/api/copias/reglas/${editando.id}`, { method: 'PUT', body: cuerpo })
      } else {
        await api('/api/copias/reglas', { method: 'POST', body: cuerpo })
      }
      setEditando(null)
      cargar()
      alAvisar?.('success', 'Regla de copia guardada.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (r: Regla) => {
    if (!(await confirmar(`¿Quitar la copia sugerida a «${r.nombre}»?`, { aceptar: 'Quitar', peligro: true }))) return
    try {
      await api(`/api/copias/reglas/${r.id}`, { method: 'DELETE' })
      cargar()
      alAvisar?.('success', 'Regla eliminada.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  const sincronizar = async (r: Regla) => {
    try {
      await api(`/api/copias/reglas/${r.id}/sincronizar`, { method: 'POST' })
      cargar()
      alAvisar?.('success', 'La regla tomó el dato vigente del directorio.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo sincronizar.')
    }
  }

  const nombreTipos = (tiposCsv: string) => {
    const lista = tiposCsv.split(',').map((x) => x.trim()).filter(Boolean)
    if (lista.length === 0) return 'Todos los documentos'
    return lista.map((c) => tipos.find((t) => t.codigo === c)?.nombre ?? c).join(', ')
  }

  return (
    <Tarjeta
      icono={<ContentCopyOutlinedIcon />}
      titulo="Copias sugeridas (c.c.)"
      accion={<Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEditando({ ...VACIA })}>Nueva copia</Button>}
      texto="Las copias que el sistema propone al redactar. Nunca se ponen solas: quien redacta las confirma antes de numerar."
    >
      <Paper variant="outlined">
        {reglas.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No hay copias sugeridas configuradas.
          </Typography>
        )}
        {reglas.map((r) => (
          <Box
            key={r.id}
            sx={{
              display: 'flex',
              gap: { xs: 0.25, sm: 1 },
              alignItems: 'flex-start',
              p: 1.5,
              pr: { xs: 0.5, sm: 1.5 },
              borderBottom: '1px solid',
              borderColor: 'divider',
              opacity: r.activa ? 1 : 0.55,
              '&:last-of-type': { borderBottom: 'none' },
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {r.nombre}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {r.cargo}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                <Chip size="small" variant="outlined" label={nombreTipos(r.tipos)} sx={{ height: 20 }} />
                {!r.persona_id && (
                  <Tooltip title="No está ligada al directorio: si cambia la autoridad, nadie avisará.">
                    <EstadoPieza estado="parcial" texto="sin directorio" />
                  </Tooltip>
                )}
                {!r.activa && <EstadoPieza estado="neutro" texto="inactiva" />}
              </Stack>
              {avisos[r.id] && (
                <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                  El directorio ahora dice <b>{avisos[r.id].cargo}</b>. Revise si esta
                  copia sigue correspondiendo y, si es así, tome el dato nuevo.
                  <Button size="small" startIcon={<SyncIcon />} onClick={() => sincronizar(r)}>
                    Tomar el dato del directorio
                  </Button>
                </Alert>
              )}
            </Box>
            <Tooltip title="Editar">
              <IconButton size="small" onClick={() => setEditando({ ...r })}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Quitar">
              <IconButton size="small" color="error" onClick={() => eliminar(r)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Paper>

      <Dialog open={editando !== null} onClose={() => setEditando(null)} fullWidth maxWidth="sm" fullScreen={celular}>
        <DialogTitle>{editando?.id ? 'Editar copia sugerida' : 'Nueva copia sugerida'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label="Tratamiento"
                value={editando?.tratamiento ?? 'Señor:'}
                onChange={(e) => setEditando((r) => (r ? { ...r, tratamiento: e.target.value } : r))}
                sx={{ width: 130 }}
              >
                {['Señor:', 'Señora:', 'Señores:'].map((x) => (
                  <MenuItem key={x} value={x}>
                    {x}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                fullWidth
                label="Nombre"
                value={editando?.nombre ?? ''}
                onChange={(e) => setEditando((r) => (r ? { ...r, nombre: e.target.value } : r))}
              />
            </Stack>
            <TextField
              size="small"
              fullWidth
              label="Cargo"
              value={editando?.cargo ?? ''}
              onChange={(e) => setEditando((r) => (r ? { ...r, cargo: e.target.value } : r))}
            />
            <TextField
              select
              size="small"
              fullWidth
              label="¿En qué documentos se sugiere?"
              value={editando?.tipos ?? ''}
              onChange={(e) => setEditando((r) => (r ? { ...r, tipos: e.target.value } : r))}
              helperText="Elija «Todos» o un tipo concreto."
            >
              <MenuItem value="">Todos los documentos</MenuItem>
              {tipos.map((t) => (
                <MenuItem key={t.codigo} value={t.codigo}>
                  {t.nombre}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              label="Por qué va esta copia (se muestra al confirmarla)"
              value={editando?.motivo ?? ''}
              onChange={(e) => setEditando((r) => (r ? { ...r, motivo: e.target.value } : r))}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Switch
                checked={editando?.activa ?? true}
                onChange={(e) => setEditando((r) => (r ? { ...r, activa: e.target.checked } : r))}
              />
              <Typography variant="body2">Activa (se sugiere al redactar)</Typography>
            </Stack>
            {editando?.id !== 0 && !editando?.persona_id && (
              <Alert severity="info">
                Esta copia no está ligada al directorio. Para que el sistema avise
                cuando cambie la autoridad, cree la persona en el Directorio y
                vuelva a crear la regla desde ahí.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditando(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={guardar}
            disabled={guardando || !editando?.nombre.trim()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Tarjeta>
  )
}

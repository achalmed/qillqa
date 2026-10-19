/**
 * ADMINISTRACIÓN → REGLAS (2026-10-12, fase 7): qué hace el sistema solo cuando ocurre un evento
 * (se registró un recibido, se numeró un documento, se agendó algo…): avisar a alguien, crear una
 * tarea o publicar en un canal del chat. Lo automático se muestra y se puede apagar: cada regla
 * tiene su interruptor; el administrador crea, cambia y borra. API: `/api/reglas`.
 */
import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { api } from '../api'
import { PALETA } from '../paleta'
import { confirmar } from './Dialogos'
import Tarjeta from './admin/Tarjeta'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'

interface Regla { id: number; evento: string; nombre: string; condicion: Record<string, string>; accion: string; destino: string; texto: string; activa: boolean; de_fabrica: string; que: string }
interface Vocab { eventos: { nombre: string; que: string; campos: string[] }[]; acciones: string[]; destinos: string[] }
type Borrador = Omit<Regla, 'id' | 'de_fabrica' | 'que'> & { condicion_texto: string }

const ETIQUETA_ACCION: Record<string, string> = { notificar: 'Avisar en la campana', tarea: 'Crear una tarea', publicar: 'Publicar en un canal del chat', telegram: 'Mandar al grupo de Telegram (si hay puente)' }
const ETIQUETA_DESTINO: Record<string, string> = { responsable: 'al responsable', autor: 'a quien lo hizo', equipo: 'a todo el equipo', administradores: 'a quien administra' }
const destinoTexto = (d: string) => ETIQUETA_DESTINO[d] ?? (d.startsWith('rol:') ? `al rol ${d.slice(4)}` : d.startsWith('canal:') ? `en el canal ${d.slice(6)}` : d)
const condicionTexto = (c: Record<string, unknown>) => Object.entries(c).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(' | ') : String(v)}`).join(' y ')
const condicionDe = (texto: string): Record<string, string | string[]> => {
  const salida: Record<string, string | string[]> = {}
  for (const parte of texto.split(/\s*(?:,|;|\by\b)\s*/)) {
    const m = parte.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/)
    if (m) salida[m[1]] = m[2].includes('|') ? m[2].split('|').map((x) => x.trim()) : m[2]
  }
  return salida
}

export default function AdminReglas() {
  const [reglas, setReglas] = useState<Regla[]>([])
  const [voc, setVoc] = useState<Vocab | null>(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<{ id: number | null; b: Borrador } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [r, v] = await Promise.all([api<{ reglas: Regla[] }>('/api/reglas'), api<Vocab>('/api/reglas/eventos')])
      setReglas(r.reglas)
      setVoc(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las reglas.')
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  const alternar = async (r: Regla) => {
    try { await api(`/api/reglas/${r.id}`, { method: 'PATCH', body: JSON.stringify({ activa: !r.activa }) }); await cargar() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar.') }
  }
  const borrar = async (r: Regla) => {
    if (!(await confirmar(`¿Borrar la regla «${r.nombre || r.que}»? Si solo quiere pararla, apáguela.`, { aceptar: 'Borrar', peligro: true }))) return
    try { await api(`/api/reglas/${r.id}`, { method: 'DELETE' }); await cargar() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar.') }
  }
  const nueva = () => setEditando({ id: null, b: { evento: voc?.eventos[0]?.nombre ?? '', nombre: '', condicion: {}, condicion_texto: '', accion: 'notificar', destino: 'responsable', texto: '', activa: true } })
  const editar = (r: Regla) => setEditando({ id: r.id, b: { ...r, condicion_texto: condicionTexto(r.condicion) } })
  const guardar = async () => {
    if (!editando) return
    const { condicion_texto, ...resto } = editando.b
    const cuerpo = { ...resto, condicion: condicionDe(condicion_texto) }
    try {
      if (editando.id) await api(`/api/reglas/${editando.id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) })
      else await api('/api/reglas', { method: 'POST', body: JSON.stringify(cuerpo) })
      setEditando(null)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  const campos = voc?.eventos.find((e) => e.nombre === editando?.b.evento)?.campos ?? []
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setEditando((x) => (x ? { ...x, b: { ...x.b, [k]: v } } : x))

  return (
    <Tarjeta
      icono={<BoltOutlinedIcon />}
      titulo="Lo que el sistema hace solo"
      accion={<Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={nueva} disabled={!voc}>Nueva regla</Button>}
      texto="Cuando ocurre algo (un recibido nuevo, un documento numerado, un evento agendado), la regla avisa, crea una tarea o publica en el chat. Cada una se puede apagar."
    >
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>{error}</Alert>}
      {reglas.length === 0 && <Typography variant="caption" color="text.secondary">Sin reglas.</Typography>}
      {reglas.map((r) => (
        <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', opacity: r.activa ? 1 : 0.55 }}>
          <Switch size="small" checked={r.activa} onChange={() => void alternar(r)} inputProps={{ 'aria-label': `Activar ${r.nombre}` }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="div" variant="body2" sx={{ fontWeight: 600 }}>{r.nombre || r.que}{r.de_fabrica && <Chip size="small" label="de fábrica" sx={{ ml: 0.75, height: 18, fontSize: 10.5, bgcolor: PALETA.superficieTenue }} />}</Typography>
            <Typography variant="caption" color="text.secondary">
              Cuando {r.que.toLowerCase()}{Object.keys(r.condicion).length ? ` y ${condicionTexto(r.condicion)}` : ''} → {ETIQUETA_ACCION[r.accion] ?? r.accion} {destinoTexto(r.destino)}{r.texto ? `: «${r.texto}»` : ''}
            </Typography>
          </Box>
          <Tooltip title="Cambiar"><IconButton size="small" onClick={() => editar(r)} aria-label="Cambiar"><EditIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Borrar"><IconButton size="small" onClick={() => void borrar(r)} aria-label="Borrar"><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      ))}
      <Dialog open={editando !== null} onClose={() => setEditando(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editando?.id ? 'Cambiar la regla' : 'Nueva regla'}</DialogTitle>
        {editando && (
          <DialogContent dividers sx={{ display: 'grid', gap: 1.5 }}>
            <TextField select size="small" label="Cuando" value={editando.b.evento} onChange={(e) => poner('evento', e.target.value)} disabled={Boolean(editando.id)}>
              {voc?.eventos.map((e) => <MenuItem key={e.nombre} value={e.nombre}>{e.que} <Typography component="span" variant="caption" color="text.secondary">&nbsp;· {e.nombre}</Typography></MenuItem>)}
            </TextField>
            <TextField size="small" label="Nombre de la regla" value={editando.b.nombre} onChange={(e) => poner('nombre', e.target.value)} />
            <TextField size="small" label="Solo si (opcional)" value={editando.b.condicion_texto} onChange={(e) => poner('condicion_texto', e.target.value)}
              helperText={`campo = valor (varios con «y»; varios valores con «|»). Campos: ${campos.join(', ')}`} placeholder="atencion = responder" />
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField select size="small" label="Hacer" value={editando.b.accion} onChange={(e) => poner('accion', e.target.value)}>
                {voc?.acciones.map((a) => <MenuItem key={a} value={a}>{ETIQUETA_ACCION[a] ?? a}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="A quién / dónde" value={voc?.destinos.includes(editando.b.destino) ? editando.b.destino : 'otro'} onChange={(e) => poner('destino', e.target.value === 'otro' ? '' : e.target.value)}>
                {voc?.destinos.map((d) => <MenuItem key={d} value={d}>{destinoTexto(d)}</MenuItem>)}
                <MenuItem value="otro">otro (usuario:N o canal:N)</MenuItem>
              </TextField>
            </Box>
            {!voc?.destinos.includes(editando.b.destino) && (
              <TextField size="small" label="Destino" value={editando.b.destino} onChange={(e) => poner('destino', e.target.value)} placeholder="usuario:3 · canal:7" />
            )}
            <TextField size="small" multiline minRows={2} label="Texto del aviso o de la tarea" value={editando.b.texto} onChange={(e) => poner('texto', e.target.value)}
              helperText={`Use {campo} para los datos del evento: ${campos.map((c) => `{${c}}`).join(' ')}`} />
          </DialogContent>
        )}
        <DialogActions>
          <Button color="inherit" onClick={() => setEditando(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void guardar()} disabled={!editando?.b.evento || !editando?.b.destino}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Tarjeta>
  )
}

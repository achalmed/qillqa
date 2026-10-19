/**
 * ACTUACIONES del seguimiento (2026-10-12): lo que pasó entre los hitos fijos del trámite de un
 * documento propio (`doc:N`) o en la atención de un recibido (`entrada:M`): llamadas,
 * reiteraciones, compromisos, respuestas, derivaciones. Lista con fecha, clase y origen; alta
 * a mano; una actuación que vino de un pegado se ve en gris hasta que alguien la confirma.
 * API: `/api/actuaciones` (api/actuaciones.py).
 */
import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import { api, esSinServidor } from '../../api'
import { encolarEscritura } from '../../sinconexion'
import { avisoBreve, SE_GUARDARA } from '../../avisoBreve'
import EnEsperaLista, { useEnEspera } from '../EnEsperaLista'
import { PALETA } from '../../paleta'
import { hoyIso } from '../../fechas'
import { confirmar as preguntar } from '../Dialogos'

export interface Actuacion {
  id: number
  entidad: string
  fecha: string
  clase: string
  clase_texto: string
  texto: string
  fuente: string
  origen: 'persona' | 'pegado' | 'sistema'
  confirmada: boolean
  confirmada_por: string
  creado_por: string
  creado_en: string | null
}

const fechaCorta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

export default function Actuaciones({ entidad, soloLectura = false, compacto = false, version = 0, acciones }: {
  entidad: string
  soloLectura?: boolean
  compacto?: boolean
  /** Súbalo para recargar (tras un pegado aplicado). */
  version?: number
  /** Botones extra a la derecha del título (p. ej. «Pegar seguimiento»). */
  acciones?: React.ReactNode
}) {
  const [lista, setLista] = useState<Actuacion[]>([])
  const [clases, setClases] = useState<{ v: string; t: string }[]>([])
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState<{ fecha: string; clase: string; texto: string; fuente: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ actuaciones: Actuacion[]; clases: { v: string; t: string }[] }>(`/api/actuaciones?entidad=${encodeURIComponent(entidad)}`)
      setLista(r.actuaciones)
      setClases(r.clases)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las actuaciones.')
    }
  }, [entidad])
  useEffect(() => { void cargar() }, [cargar, version])
  // Sin servidor, lo anotado espera en la cola (2026-10-18) y se ve aquí hasta que sale.
  const enEspera = useEnEspera('/api/actuaciones', (c) => c.entidad === entidad, () => void cargar())

  const guardar = async () => {
    if (!nueva || !nueva.texto.trim()) return
    setOcupado(true)
    try {
      await api('/api/actuaciones', { method: 'POST', body: JSON.stringify({ entidad, ...nueva }) })
      setNueva(null)
      await cargar()
    } catch (e) {
      if (esSinServidor(e)) {
        encolarEscritura('/api/actuaciones', JSON.stringify({ entidad, ...nueva }), `Actuación: ${nueva.texto.trim().slice(0, 40)}`, 'actuacion')
        setNueva(null)
        avisoBreve(SE_GUARDARA)
        return
      }
      setError(e instanceof Error ? e.message : 'No se pudo registrar.')
    } finally {
      setOcupado(false)
    }
  }
  const confirmarUna = async (a: Actuacion) => {
    try { await api(`/api/actuaciones/${a.id}/confirmar`, { method: 'POST' }); await cargar() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar.') }
  }
  const retirar = async (a: Actuacion) => {
    if (!(await preguntar(`¿Retirar «${a.texto.slice(0, 80)}»? Queda apartada, no se borra.`, { aceptar: 'Retirar', peligro: true }))) return
    try { await api(`/api/actuaciones/${a.id}`, { method: 'DELETE' }); await cargar() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo retirar.') }
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }} flexWrap="wrap">
        {/* `1 1 auto` + nowrap: en el celular bajan los botones, no se parte el título. */}
        <Typography variant="body2" sx={{ fontWeight: 600, flex: '1 1 auto', whiteSpace: 'nowrap' }}>Actuaciones{lista.length ? ` (${lista.length})` : ''}</Typography>
        {acciones}
        {!soloLectura && !nueva && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setNueva({ fecha: hoyIso(), clase: 'nota', texto: '', fuente: '' })}>Anotar</Button>
        )}
      </Stack>
      {error && <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>{error}</Typography>}
      {nueva && (
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '150px 160px 1fr' }, mb: 1, p: 1, borderRadius: 1.5, bgcolor: PALETA.superficieTenue, border: '1px solid', borderColor: 'divider' }}>
          <TextField size="small" type="date" label="Fecha" value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} InputLabelProps={{ shrink: true }} />
          <TextField size="small" select label="Qué fue" value={nueva.clase} onChange={(e) => setNueva({ ...nueva, clase: e.target.value })}>
            {clases.map((c) => <MenuItem key={c.v} value={c.v}>{c.t}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Fuente (cargo, correo, llamada…)" value={nueva.fuente} onChange={(e) => setNueva({ ...nueva, fuente: e.target.value })} />
          <TextField size="small" multiline minRows={1} maxRows={4} label="Qué pasó" value={nueva.texto} onChange={(e) => setNueva({ ...nueva, texto: e.target.value })} autoFocus sx={{ gridColumn: '1 / -1' }} />
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ gridColumn: '1 / -1' }}>
            <Button size="small" color="inherit" onClick={() => setNueva(null)}>Cancelar</Button>
            <Button size="small" variant="contained" disabled={ocupado || !nueva.texto.trim()} onClick={() => void guardar()}>Registrar</Button>
          </Stack>
        </Box>
      )}
      <EnEsperaLista lista={enEspera} />
      {lista.length === 0 && !nueva && enEspera.length === 0 && (
        <Typography variant="caption" color="text.secondary">Sin actuaciones. Anote aquí las llamadas, reiteraciones y compromisos, o pegue el resultado del prompt de seguimiento.</Typography>
      )}
      {lista.map((a) => (
        <Box key={a.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: compacto ? 0.4 : 0.6, borderBottom: '1px solid', borderColor: 'divider', opacity: a.confirmada ? 1 : 0.6 }}>
          <Typography variant="caption" sx={{ minWidth: 72, color: 'text.secondary', pt: 0.25 }}>{fechaCorta(a.fecha)}</Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Chip size="small" label={a.clase_texto} sx={{ height: 20, fontSize: 11 }} />
              {!a.confirmada && <Chip size="small" label="del prompt · por confirmar" sx={{ height: 20, fontSize: 11, bgcolor: PALETA.avisoFondo, color: PALETA.dorado }} />}
              {a.fuente && <Typography variant="caption" color="text.secondary">{a.fuente}</Typography>}
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.texto}</Typography>
            {!compacto && (a.creado_por || a.confirmada_por) && (
              <Typography variant="caption" color="text.secondary">{a.confirmada && a.origen === 'pegado' ? `confirmada por ${a.confirmada_por}` : `registrada por ${a.creado_por}`}</Typography>
            )}
          </Box>
          {!soloLectura && (
            <Stack direction="row" spacing={0}>
              {!a.confirmada && (
                <Tooltip title="Confirmar: cuenta en el seguimiento"><IconButton size="small" onClick={() => void confirmarUna(a)} aria-label="Confirmar"><CheckIcon fontSize="small" /></IconButton></Tooltip>
              )}
              <Tooltip title="Retirar"><IconButton size="small" onClick={() => void retirar(a)} aria-label="Retirar"><CloseIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
          )}
        </Box>
      ))}
    </Box>
  )
}

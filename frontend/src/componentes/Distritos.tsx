/**
 * DISTRITOS Y SUS ANIVERSARIOS (Edison 2026-10-06: «aniversarios de los
 * distritos de Ayacucho»). Datos públicos del INEI con su norma y fecha de
 * creación (`GET /api/territorio/*`, servicios/territorio.py).
 *
 * El aniversario es el de la fecha jurídica de creación: muchos distritos
 * celebran otro día (fiesta patronal, acuerdo municipal), así que se dice «por
 * su ley de creación» y no se presenta como fecha oficial de celebración.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import CakeOutlinedIcon from '@mui/icons-material/CakeOutlined'
import { api } from '../api'

export interface Distrito {
  id: number
  departamento: string
  provincia: string
  distrito: string
  norma: string
  creacion: string
  observacion: string
  anio: number | null
  mes: number | null
  dia: number | null
  faltan: number | null
  /** Solo en /aniversarios. */
  anios?: number | null
  fecha_aniversario?: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
const diaMes = (d: Distrito) => (d.mes && d.dia ? `${d.dia} de ${MESES[d.mes - 1]}` : '')
const cuando = (faltan: number) => (faltan === 0 ? 'hoy' : faltan === 1 ? 'mañana' : `en ${faltan} días`)

/** En el Inicio: los distritos que cumplen años de creación en las próximas dos semanas. */
export function AniversariosProximos({ dias = 15 }: { dias?: number }) {
  const navegar = useNavigate()
  const [lista, setLista] = useState<Distrito[]>([])
  useEffect(() => { api<Distrito[]>(`/api/territorio/aniversarios?dias=${dias}`).then(setLista).catch(() => {}) }, [dias])
  if (!lista.length) return null
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        Aniversarios de distritos en los próximos {dias} días ({lista.length})
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
        {lista.slice(0, 6).map((d, i) => (
          <ButtonBase
            key={d.id}
            onClick={() => navegar(`/directorio?pestana=distritos&q=${encodeURIComponent(d.distrito)}`)}
            sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, px: 2, py: 1.1,
              borderTop: i ? '1px solid' : 'none', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <CakeOutlinedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap>
                {d.distrito} <Box component="span" sx={{ color: 'text.secondary' }}>· {d.provincia}</Box>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {diaMes(d)}{d.anios ? ` · ${d.anios} años de su creación` : ''} · {d.norma}
              </Typography>
            </Box>
            <Chip size="small" variant="outlined" label={cuando(d.faltan ?? 0)} color={d.faltan !== null && d.faltan <= 2 ? 'primary' : 'default'} sx={{ height: 22, fontSize: 12 }} />
          </ButtonBase>
        ))}
        {lista.length > 6 && (
          <ButtonBase onClick={() => navegar('/directorio?pestana=distritos&orden=proximo')} sx={{ width: '100%', py: 1, borderTop: '1px solid', borderColor: 'divider', color: 'primary.main', fontSize: 13.5, fontWeight: 600 }}>
            Ver los {lista.length}
          </ButtonBase>
        )}
      </Box>
    </Box>
  )
}

/** En el Directorio: todos los distritos, con búsqueda, provincia y orden. */
export function TablaDistritos({ qInicial = '', ordenInicial = 'provincia' }: { qInicial?: string; ordenInicial?: string }) {
  const [todos, setTodos] = useState<Distrito[] | null>(null)
  const [q, setQ] = useState(qInicial)
  const [provincia, setProvincia] = useState('')
  const [orden, setOrden] = useState(ordenInicial === 'proximo' ? 'proximo' : 'provincia')
  useEffect(() => { api<Distrito[]>('/api/territorio/distritos').then(setTodos).catch(() => setTodos([])) }, [])
  const provincias = useMemo(() => [...new Set((todos ?? []).map((d) => d.provincia))].sort((a, b) => a.localeCompare(b, 'es')), [todos])
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    const base = (todos ?? []).filter((d) => (!provincia || d.provincia === provincia)
      && (!t || `${d.distrito} ${d.provincia} ${d.norma}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(t)))
    return [...base].sort((a, b) => (orden === 'proximo'
      ? (a.faltan ?? 9999) - (b.faltan ?? 9999)
      : a.provincia.localeCompare(b.provincia, 'es') || a.distrito.localeCompare(b.distrito, 'es')))
  }, [todos, q, provincia, orden])

  if (todos === null) return <LinearProgress />
  const conFecha = todos.filter((d) => d.mes).length
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 900 }}>
        {todos.length} distritos de {provincias.length} provincias, con la norma y la fecha de su creación (INEI, Directorio
        Nacional de Municipalidades; El Peruano para los recientes). El aniversario es el de su ley de creación: {conFecha} la
        tienen; los de la Época de la Independencia no tienen fecha jurídica. Algunos distritos celebran otro día.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <TextField
          size="small" type="search" placeholder="Distrito, provincia o ley" value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 260px', bgcolor: 'background.paper' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField select size="small" label="Provincia" value={provincia} onChange={(e) => setProvincia(e.target.value)} sx={{ minWidth: 180, bgcolor: 'background.paper' }}>
          <MenuItem value="">Todas</MenuItem>
          {provincias.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Orden" value={orden} onChange={(e) => setOrden(e.target.value)} sx={{ minWidth: 190, bgcolor: 'background.paper' }}>
          <MenuItem value="provincia">Por provincia</MenuItem>
          <MenuItem value="proximo">Aniversario más próximo</MenuItem>
        </TextField>
      </Box>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' }}>
        {lista.map((d, i) => (
          <Box key={d.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr) auto' }, gap: { xs: 0.25, md: 2 },
            alignItems: 'center', px: 2, py: 1, borderTop: i ? '1px solid' : 'none', borderColor: 'divider' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{d.distrito}</Typography>
              <Typography variant="caption" color="text.secondary">{d.provincia}</Typography>
            </Box>
            <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>{d.norma}</Typography>
            <Tooltip title={d.observacion} placement="top-start">
              <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>{d.creacion}</Typography>
            </Tooltip>
            <Box sx={{ textAlign: 'right' }}>
              {d.faltan !== null ? (
                <Chip size="small" variant="outlined" icon={<CakeOutlinedIcon />} label={`${diaMes(d)} · ${cuando(d.faltan)}`}
                  color={d.faltan <= 7 ? 'primary' : 'default'} sx={{ height: 24, fontSize: 12 }} />
              ) : (
                <Typography variant="caption" color="text.disabled">sin fecha jurídica</Typography>
              )}
            </Box>
          </Box>
        ))}
        {!lista.length && <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>Ningún distrito coincide.</Typography>}
      </Box>
    </Box>
  )
}

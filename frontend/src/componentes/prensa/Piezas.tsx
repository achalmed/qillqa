/**
 * PIEZAS DE PRENSA (2026-10-12, fase 9.4): el registro del módulo Prensa. Noticias procesadas
 * con el prompt de prensa (bloque `pieza-de-prensa`), notas y comunicados, cada una con clase,
 * fuente, temas, acción sugerida, estado y responsable. Lista con filtros y búsqueda; tarjeta por
 * pieza; detalle con el cuerpo, el enlace y el cambio de estado y responsable (`PATCH`); «Nueva
 * pieza» con entrada doble: formulario a mano o desde el resultado del prompt (`POST /pegar` da
 * la vista previa y `POST /api/prensa/piezas` guarda con la constancia del pegado).
 *
 * Dirección: `/prensa?ver=piezas[&nueva=1][&pegar=<id de mensaje>]`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import ButtonBase from '@mui/material/ButtonBase'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { api } from '../../api'
import { PALETA } from '../../paleta'
import { textoDeMensaje, type PegadoAplicado } from '../../pegar'
import BarraModulo from '../BarraModulo'
import ElegirEntrada from '../ElegirEntrada'
import PegarResultado from '../PegarResultado'
import { EstadoVacio } from '../Estilo'
import type { MiembroEquipo } from '../PanelSeguimiento'

export interface Pieza {
  id: number
  clase: string
  clase_texto: string
  titular: string
  bajada: string
  cuerpo: string
  fuente: string
  enlace: string
  fecha: string
  ambito: string
  temas: string[]
  relevancia: string
  accion_sugerida: string
  cita: string
  estado: string
  responsable_id: number | null
  responsable: string
  origen: string
  creado_en: string | null
}
interface Lista { piezas: Pieza[]; clases: { v: string; t: string }[]; estados: string[] }

const ESTADO: Record<string, { t: string; color: string }> = {
  registrada: { t: 'Registrada', color: PALETA.guinda },
  en_trabajo: { t: 'En trabajo', color: PALETA.info },
  publicada: { t: 'Publicada', color: PALETA.exito },
  archivada: { t: 'Archivada', color: PALETA.textoTenue },
}
const ACCION: Record<string, string> = {
  pronunciamiento: 'Pronunciamiento', pedido_de_informacion: 'Pedido de información', visita: 'Visita',
  agenda: 'Agendar', difundir: 'Difundir', archivar: 'Archivar',
}
const estadoDe = (v: string) => ESTADO[v] ?? { t: v, color: PALETA.textoTenue }
const fechaCorta = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '')

/** El formulario en memoria (todo texto; `temas` separado por comas). */
interface Formulario {
  clase: string; titular: string; bajada: string; cuerpo: string; fuente: string; enlace: string; fecha: string
  ambito: string; temas: string; relevancia: string; accion_sugerida: string; cita: string; estado: string; responsable_id: number | ''
}
const VACIO: Formulario = {
  clase: 'noticia_local', titular: '', bajada: '', cuerpo: '', fuente: '', enlace: '', fecha: '', ambito: '', temas: '',
  relevancia: '', accion_sugerida: '', cita: '', estado: 'registrada', responsable_id: '',
}
const aTexto = (v: unknown) => (Array.isArray(v) ? v.map(String).join(', ') : v == null ? '' : String(v))

function TarjetaPieza({ p, alAbrir }: { p: Pieza; alAbrir: () => void }) {
  const est = estadoDe(p.estado)
  return (
    <ButtonBase onClick={alAbrir} sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', '&:hover': { borderColor: 'primary.light' } }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0, lineHeight: 1.3 }}>{p.titular}</Typography>
        <Chip size="small" label={est.t} sx={{ height: 20, fontSize: 11, bgcolor: `${est.color}1A`, color: est.color, fontWeight: 600, flexShrink: 0 }} />
      </Box>
      <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ mt: 0.25 }}>
        {[p.clase_texto, p.fuente, fechaCorta(p.fecha), p.ambito].filter(Boolean).join(' · ')}
      </Typography>
      {(p.temas.length > 0 || p.accion_sugerida || p.responsable) && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75, alignItems: 'center' }}>
          {p.temas.slice(0, 4).map((t) => <Chip key={t} size="small" variant="outlined" label={t} sx={{ height: 20, fontSize: 11, maxWidth: 160 }} />)}
          {p.accion_sugerida && <Chip size="small" label={ACCION[p.accion_sugerida] ?? p.accion_sugerida} sx={{ height: 20, fontSize: 11, bgcolor: `${PALETA.aviso}1A`, color: PALETA.aviso, fontWeight: 600 }} />}
          {p.responsable && <Typography variant="caption" color="text.secondary" noWrap>· {p.responsable}</Typography>}
        </Box>
      )}
    </ButtonBase>
  )
}

export default function Piezas() {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [consulta, setConsulta] = useSearchParams()
  const [lista, setLista] = useState<Lista | null>(null)
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([])
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [clase, setClase] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const soloLectura = localStorage.getItem('sgdp_rol') === 'invitado'
  // Alta: a mano o desde el prompt (entrada doble); el texto del chat llega por `?pegar=`.
  const [anclaNueva, setAnclaNueva] = useState<HTMLElement | null>(null)
  const [nueva, setNueva] = useState<'manual' | 'prompt' | null>(null)
  const [form, setForm] = useState<Formulario>(VACIO)
  const [pegado, setPegado] = useState<PegadoAplicado | null>(null)
  const [textoPegar, setTextoPegar] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Detalle.
  const [abierta, setAbierta] = useState<Pieza | null>(null)

  const cargar = useCallback(async () => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (estado) p.set('estado', estado)
    if (clase) p.set('clase', clase)
    try {
      setLista(await api<Lista>(`/api/prensa/piezas?${p}`))
      setError('')
    } catch (e) {
      setLista({ piezas: [], clases: [], estados: [] })
      setError(e instanceof Error ? e.message : 'No se pudieron leer las piezas.')
    }
  }, [q, estado, clase])
  useEffect(() => {
    const t = setTimeout(() => void cargar(), q ? 300 : 0)
    return () => clearTimeout(t)
  }, [cargar, q])
  useEffect(() => {
    api<MiembroEquipo[]>('/api/admin/equipo').then(setEquipo).catch(() => setEquipo([]))
  }, [])

  // `?nueva=1` abre el formulario; `?pegar=<mid>` trae el bloque del chat ya leído.
  useEffect(() => {
    const mid = Number(consulta.get('pegar') ?? '')
    const pideNueva = consulta.get('nueva') === '1'
    if (!mid && !pideNueva) return
    const c = new URLSearchParams(consulta)
    ;['pegar', 'nueva'].forEach((k) => c.delete(k))
    setConsulta(c, { replace: true })
    if (soloLectura) return
    if (mid) {
      textoDeMensaje(mid)
        .then((t) => { setForm(VACIO); setPegado(null); setTextoPegar(t); setNueva('prompt') })
        .catch(() => { setError('No se pudo traer el mensaje del chat; pegue el texto a mano.'); setForm(VACIO); setNueva('prompt') })
    } else if (pideNueva) {
      setForm(VACIO)
      setPegado(null)
      setNueva('manual')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta])

  const abrirNueva = (modo: 'manual' | 'prompt') => {
    setForm(VACIO)
    setPegado(null)
    setTextoPegar('')
    setNueva(modo)
  }
  const poner = (k: keyof Formulario, v: string | number | '') => setForm((f) => ({ ...f, [k]: v }))
  const guardar = async () => {
    if (!form.titular.trim()) return
    setGuardando(true)
    setError('')
    try {
      const cuerpo = {
        ...form,
        titular: form.titular.trim().slice(0, 300),
        temas: form.temas.split(',').map((t) => t.trim()).filter(Boolean),
        responsable_id: form.responsable_id === '' ? null : Number(form.responsable_id),
        pegado: pegado ? { tipo: pegado.tipo, version: pegado.version, fuente: pegado.fuente, texto: pegado.texto, campos_propuestos: pegado.campos_propuestos, rechazados: pegado.rechazadas } : null,
      }
      const p = await api<Pieza>('/api/prensa/piezas', { method: 'POST', body: JSON.stringify(cuerpo) })
      setNueva(null)
      setAviso(`Pieza registrada: ${p.titular}`)
      void cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la pieza.')
    } finally {
      setGuardando(false)
    }
  }
  const cambiar = async (p: Pieza, cambios: Partial<Pick<Pieza, 'estado' | 'responsable_id'>>) => {
    try {
      const n = await api<Pieza>(`/api/prensa/piezas/${p.id}`, { method: 'PATCH', body: JSON.stringify(cambios) })
      setAbierta({ ...n, responsable: equipo.find((m) => m.id === n.responsable_id)?.nombre_completo ?? '' })
      void cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar.')
    }
  }

  const clases = lista?.clases ?? []
  const estados = useMemo(() => (lista?.estados.length ? lista.estados : Object.keys(ESTADO)), [lista])
  const campo = (k: keyof Formulario, etiqueta: string, extra: Record<string, unknown> = {}) => (
    <TextField key={k} size="small" fullWidth label={etiqueta} value={form[k]} onChange={(e) => poner(k, e.target.value)} {...extra} />
  )

  return (
    <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: { xs: 1.5, sm: 2.5 }, maxWidth: 1200, width: '100%', mx: 'auto', minWidth: 0 }}>
      <BarraModulo
        alActualizar={cargar}
        principal={!soloLectura && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setAnclaNueva(e.currentTarget)} fullWidth={celular}>Nueva pieza</Button>
        )}
      >
        <TextField
          size="small" placeholder="Buscar en titulares y cuerpo" value={q} onChange={(e) => setQ(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ flex: '1 1 220px', minWidth: 0 }}
        />
        <TextField size="small" select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} sx={{ minWidth: 140, flex: { xs: '1 1 140px', sm: '0 0 auto' } }}>
          <MenuItem value="">Todos</MenuItem>
          {estados.map((s) => <MenuItem key={s} value={s}>{estadoDe(s).t}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Clase" value={clase} onChange={(e) => setClase(e.target.value)} sx={{ minWidth: 160, flex: { xs: '1 1 140px', sm: '0 0 auto' } }}>
          <MenuItem value="">Todas</MenuItem>
          {clases.map((c) => <MenuItem key={c.v} value={c.v}>{c.t}</MenuItem>)}
        </TextField>
      </BarraModulo>
      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}
      {lista === null && <LinearProgress />}
      {lista && lista.piezas.length === 0 && (
        <EstadoVacio icono={<NewspaperOutlinedIcon />} titulo="Sin piezas" texto={q || estado || clase ? 'Ninguna coincide con los filtros.' : 'Registre la primera con «Nueva pieza».'} />
      )}
      {lista && lista.piezas.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          {lista.piezas.map((p) => <TarjetaPieza key={p.id} p={p} alAbrir={() => setAbierta(p)} />)}
        </Box>
      )}

      <ElegirEntrada
        ancla={anclaNueva}
        alCerrar={() => setAnclaNueva(null)}
        tipo="pieza-de-prensa"
        alManual={() => abrirNueva('manual')}
        alPrompt={() => abrirNueva('prompt')}
      />

      {/* Alta: el mismo formulario; «desde el prompt» lo precede la caja de pegado, que lo llena. */}
      <Dialog open={nueva !== null} onClose={guardando ? undefined : () => setNueva(null)} fullWidth maxWidth="md" fullScreen={celular} scroll="paper">
        <DialogTitle>Nueva pieza</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {nueva === 'prompt' && (
            <PegarResultado
              ruta="/api/prensa/piezas/pegar"
              tipos={['pieza-de-prensa']}
              actual={{ ...form, temas: form.temas.split(',').map((t) => t.trim()).filter(Boolean) }}
              abiertoAlInicio
              textoInicial={textoPegar || undefined}
              etiquetaBoton="Pegar el resultado del prompt"
              alAplicar={(campos, aplicado) => {
                setForm((f) => ({
                  ...f,
                  ...Object.fromEntries(Object.entries(campos).filter(([k]) => k in VACIO && k !== 'responsable_id').map(([k, v]) => [k, aTexto(v)])),
                }))
                setPegado(aplicado)
              }}
              propuestas={(r) => {
                const parecidas = (r.propuestas as { parecidas?: { id: number; titular: string; estado: string }[] } | undefined)?.parecidas ?? []
                return parecidas.length ? <Alert severity="warning" sx={{ py: 0 }}>Parecida a: {parecidas.map((x) => `«${x.titular}» (${estadoDe(x.estado).t})`).join('; ')}.</Alert> : null
              }}
            />
          )}
          {pegado && <Alert severity="success" sx={{ py: 0 }}>Formulario llenado con el pegado: revise y registre.</Alert>}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
            <TextField size="small" select fullWidth label="Clase" value={form.clase} onChange={(e) => poner('clase', e.target.value)}>
              {(clases.length ? clases : [{ v: 'noticia_local', t: 'Noticia local' }]).map((c) => <MenuItem key={c.v} value={c.v}>{c.t}</MenuItem>)}
            </TextField>
            {campo('fecha', 'Fecha', { type: 'date', InputLabelProps: { shrink: true } })}
          </Box>
          {campo('titular', 'Titular', { required: true, autoFocus: nueva === 'manual' })}
          {campo('bajada', 'Bajada')}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
            {campo('fuente', 'Fuente')}
            {campo('ambito', 'Ámbito')}
          </Box>
          {campo('enlace', 'Enlace', { type: 'url' })}
          {campo('temas', 'Temas (separados por comas)')}
          {campo('cuerpo', 'Cuerpo', { multiline: true, minRows: 4, maxRows: 14 })}
          {campo('relevancia', 'Relevancia para el despacho', { multiline: true, minRows: 2 })}
          {campo('cita', 'Cita atribuida')}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' } }}>
            <TextField size="small" select fullWidth label="Acción sugerida" value={form.accion_sugerida} onChange={(e) => poner('accion_sugerida', e.target.value)}>
              <MenuItem value="">Sin definir</MenuItem>
              {Object.entries(ACCION).map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
            </TextField>
            <TextField size="small" select fullWidth label="Estado" value={form.estado} onChange={(e) => poner('estado', e.target.value)}>
              {estados.map((s) => <MenuItem key={s} value={s}>{estadoDe(s).t}</MenuItem>)}
            </TextField>
            <TextField size="small" select fullWidth label="Responsable" value={form.responsable_id} onChange={(e) => poner('responsable_id', e.target.value === '' ? '' : Number(e.target.value))}>
              <MenuItem value="">Sin responsable</MenuItem>
              {equipo.map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre_completo}</MenuItem>)}
            </TextField>
          </Box>
          {guardando && <LinearProgress />}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, flexWrap: 'wrap', gap: 1 }}>
          <Button color="inherit" onClick={() => setNueva(null)} disabled={guardando}>Cancelar</Button>
          <Button variant="contained" onClick={() => void guardar()} disabled={guardando || !form.titular.trim()}>Registrar</Button>
        </DialogActions>
      </Dialog>

      {/* Detalle: cuerpo completo, enlace, y estado y responsable que se cambian aquí. */}
      <Dialog open={abierta !== null} onClose={() => setAbierta(null)} fullWidth maxWidth="md" fullScreen={celular} scroll="paper">
        {abierta && (
          <>
            <DialogTitle sx={{ pr: 2 }}>
              <Typography component="span" sx={{ fontWeight: 650, fontSize: 17, lineHeight: 1.3, display: 'block' }}>{abierta.titular}</Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                {[abierta.clase_texto, abierta.fuente, fechaCorta(abierta.fecha), abierta.ambito, abierta.origen === 'pegado' ? 'desde el prompt' : ''].filter(Boolean).join(' · ')}
              </Typography>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
                <TextField size="small" select fullWidth label="Estado" value={abierta.estado} disabled={soloLectura} onChange={(e) => void cambiar(abierta, { estado: e.target.value })}>
                  {estados.map((s) => <MenuItem key={s} value={s}>{estadoDe(s).t}</MenuItem>)}
                </TextField>
                <TextField size="small" select fullWidth label="Responsable" value={abierta.responsable_id ?? ''} disabled={soloLectura}
                  onChange={(e) => void cambiar(abierta, { responsable_id: e.target.value === '' ? null : Number(e.target.value) })}>
                  <MenuItem value="">Sin responsable</MenuItem>
                  {equipo.map((m) => <MenuItem key={m.id} value={m.id}>{m.nombre_completo}</MenuItem>)}
                </TextField>
              </Box>
              {(abierta.temas.length > 0 || abierta.accion_sugerida) && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {abierta.accion_sugerida && <Chip size="small" label={`Acción: ${ACCION[abierta.accion_sugerida] ?? abierta.accion_sugerida}`} sx={{ height: 22, fontSize: 11.5 }} />}
                  {abierta.temas.map((t) => <Chip key={t} size="small" variant="outlined" label={t} sx={{ height: 22, fontSize: 11.5 }} />)}
                </Box>
              )}
              {abierta.bajada && <Typography variant="body2" sx={{ fontWeight: 600 }}>{abierta.bajada}</Typography>}
              {abierta.cuerpo && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{abierta.cuerpo}</Typography>}
              {abierta.cita && <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', borderLeft: '1px solid', borderColor: 'divider', pl: 1.5 }}>{abierta.cita}</Typography>}
              {abierta.relevancia && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Relevancia para el despacho</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{abierta.relevancia}</Typography>
                </Box>
              )}
              {abierta.enlace && (
                <Link href={abierta.enlace} target="_blank" rel="noopener" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
                  <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>{abierta.enlace}</Typography><OpenInNewIcon sx={{ fontSize: 15, flexShrink: 0 }} />
                </Link>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAbierta(null)}>Cerrar</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={Boolean(aviso)} autoHideDuration={5000} onClose={() => setAviso('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setAviso('')}>{aviso}</Alert>
      </Snackbar>
    </Box>
  )
}

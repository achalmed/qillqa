/**
 * SEMANA DE REPRESENTACIÓN — las semanas y la versión vigente de su informe
 * (paso 4.3 de la hoja de ruta). Desde 2026-10-02 cada semana se TRABAJA en el
 * sistema (paginas/SemanaSR.tsx: actividades, pedidos, fotos, textos, generar);
 * esta página es la entrada: la lista, «Nueva semana» y, para el administrador,
 * traer al sistema las semanas hechas antes con los YAML. Solo la edición
 * pública se lee; la interna no sale por la web (backend/app/servicios/informes_sr.py).
 *
 * Rediseño (Edison 2026-10-01: «más intuitiva, ordenada y fácil de utilizar,
 * sin perder funciones»; «el diputado usa casi siempre el celular»):
 *   - arriba, el resumen de todas las semanas (semanas, provincias, pedidos,
 *     informes aprobados);
 *   - buscador y filtro por estado del informe;
 *   - cada semana es una tarjeta con su periodo, recorrido y pedidos, y dos
 *     formas de leer: «Leer» (dos columnas) y «Celular» (una columna);
 *   - en escritorio el informe se lee a la derecha, dentro del sistema
 *     («no en otra ventana»); en el celular se abre a pantalla completa y,
 *     como su navegador no muestra PDF dentro de la página, con «Abrir PDF»;
 *   - `?ver=territorio`: las provincias recorridas y los pedidos de todas las
 *     semanas juntos.
 */
import { useEffect, useMemo, useState } from 'react'
import { PALETA } from '../paleta'
import { useNavigate, useSearchParams } from 'react-router'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import ButtonBase from '@mui/material/ButtonBase'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'
import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined'
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined'
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined'
import AddIcon from '@mui/icons-material/Add'
import DownloadingOutlinedIcon from '@mui/icons-material/DownloadingOutlined'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { api } from '../api'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import Marco from '../componentes/Marco'
import VisorPdf from '../componentes/VisorPdf'
import { archivosSemana } from '../componentes/semana/modelo'
import DialogoExportarMd from '../componentes/semana/DialogoExportarMd'
import { EstadoVacio } from '../componentes/Estilo'
import { esAdmin } from '../navegacion'
import { confirmar } from '../componentes/Dialogos'
import { mensajePegado, textoDeMensaje } from '../pegar'
import ElegirEntrada from '../componentes/ElegirEntrada'
import MenuItem from '@mui/material/MenuItem'

interface Pdf {
  nombre: string
  version: string
  estado: string
  una_columna: boolean
  tamano: number
}
interface Semana {
  carpeta: string
  id: string
  informe: string
  tema: string
  inicio: string
  fin: string
  estado: string
  provincias: string[]
  distritos: string[]
  pedidos: number | null
  /** registrados → derivados → respondidos → cerrados (lo que traiga el expediente). */
  pedidos_estado: Partial<Record<EtapaPedido, number>>
  pdfs: Pdf[]
}
type EtapaPedido = 'registrados' | 'derivados' | 'respondidos' | 'cerrados'
const ETAPAS: EtapaPedido[] = ['registrados', 'derivados', 'respondidos', 'cerrados']
interface Elegido {
  carpeta: string
  nombre: string
  titulo: string
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const dia = (iso: string) => (iso ? new Date(`${iso}T12:00:00`) : null)
/** «12–16 set 2026», «29 set – 3 oct 2026». */
function periodo(s: Semana): string {
  const a = dia(s.inicio)
  const b = dia(s.fin)
  if (!a) return ''
  if (!b) return `${a.getDate()} ${MES[a.getMonth()]} ${a.getFullYear()}`
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MES[b.getMonth()]} ${b.getFullYear()}`
    : `${a.getDate()} ${MES[a.getMonth()]} – ${b.getDate()} ${MES[b.getMonth()]} ${b.getFullYear()}`
}
const dias = (s: Semana) => {
  const a = dia(s.inicio)
  const b = dia(s.fin)
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) + 1 : 0
}
const estadoInforme = (s: Semana) => s.pdfs[0]?.estado ?? 'sin informe'
const COLOR_ESTADO: Record<string, 'success' | 'info' | 'default' | 'warning'> = {
  aprobado: 'success',
  'en revisión': 'info',
  borrador: 'default',
  'sin informe': 'warning',
}
const FILTROS = ['todos', 'aprobado', 'en revisión', 'borrador', 'sin informe'] as const
/** El tema como se escribe: solo la primera letra en mayúscula («Educación superior»). */
const conMayuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)
const tituloDe = (s: Semana, p: Pdf) => `${s.informe} v${p.version}${p.una_columna ? ' · una columna' : ''} — ${conMayuscula(s.tema)}`

function Cifra({ icono, valor, texto }: { icono: React.ReactNode; valor: React.ReactNode; texto: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: { xs: 1.25, sm: 1.5 }, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
      <Box sx={{ color: 'primary.main', display: 'grid', placeItems: 'center', '& svg': { fontSize: 22 } }}>{icono}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: { xs: 17, sm: 19 }, lineHeight: 1.15 }}>{valor}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{texto}</Typography>
      </Box>
    </Box>
  )
}

/** Una semana: periodo, tema, recorrido, pedidos y las dos formas de leer su informe. */
function TarjetaSemana({ s, reciente, elegido, alLeer, registro, alAbrir, alImportar }: {
  s: Semana
  reciente: boolean
  elegido: string | undefined
  alLeer: (p: Pdf) => void
  /** Id de la semana en el sistema; sin él, la semana solo existe en sus YAML. */
  registro?: number
  alAbrir: (id: number) => void
  alImportar?: () => void
}) {
  const dos = s.pdfs.find((p) => !p.una_columna)
  const una = s.pdfs.find((p) => p.una_columna)
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  const leer = (celular ? una ?? dos : dos ?? una)
  const activa = s.pdfs.some((p) => p.nombre === elegido)
  const est = estadoInforme(s)
  // Lugares en una sola fila (2026-10-08): en el celular caben dos, en la computadora cuatro.
  const visibles = s.provincias.slice(0, celular ? 2 : 4)
  return (
    <Box
      sx={{
        borderRadius: 2.5, border: '1px solid', bgcolor: 'background.paper', overflow: 'hidden',
        borderColor: activa ? 'primary.main' : 'divider', boxShadow: activa ? `0 0 0 1px ${PALETA.primario}59` : 'none',
      }}
    >
      {/* 2026-10-08 (Edison): toda la tarjeta se lee con un clic; ya no hay botón «Leer». */}
      <Box
        role={leer ? 'button' : undefined}
        tabIndex={leer ? 0 : undefined}
        onClick={() => leer && alLeer(leer)}
        onKeyDown={(e) => { if (leer && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alLeer(leer) } }}
        sx={{ display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start', textAlign: 'left', width: '100%', gap: 1.5, p: 1.75, cursor: leer ? 'pointer' : 'default', '&:hover': leer ? { bgcolor: PALETA.velo } : undefined }}
      >
        {/* El número de la semana, como una ficha de calendario. */}
        <Box sx={{ minWidth: 64, px: 1, flexShrink: 0, borderRadius: 1.5, bgcolor: PALETA.primarioSuave, color: 'primary.main', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 0.75 }}>
          <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6 }}>SEMANA</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{s.id.replace(/^SR-0?/, '')}</Typography>
          {dias(s) > 0 && <Typography sx={{ fontSize: 10.5, opacity: 0.8 }}>{dias(s)} días</Typography>}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{periodo(s)}</Typography>
            {reciente && <Chip size="small" label="Más reciente" color="primary" sx={{ height: 19, fontSize: 11 }} />}
          </Box>
          <Typography sx={{ fontWeight: 650, fontSize: 15, lineHeight: 1.3, mt: 0.25 }}>{conMayuscula(s.tema)}</Typography>
          {s.provincias.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75, flexWrap: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
              <PlaceOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
              {visibles.map((p) => <Chip key={p} size="small" variant="outlined" label={p} sx={{ height: 21, fontSize: 11.5, minWidth: 0, flexShrink: 1 }} />)}
              {s.provincias.length > visibles.length && (
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>+{s.provincias.length - visibles.length}</Typography>
              )}
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
            <Chip size="small" label={est} color={COLOR_ESTADO[est] ?? 'default'} variant={est === 'aprobado' ? 'filled' : 'outlined'} sx={{ height: 21, fontSize: 11.5, textTransform: 'capitalize' }} />
            {s.pdfs[0] && <Typography variant="caption" color="text.secondary">{s.informe} v{s.pdfs[0].version}</Typography>}
            {(s.distritos?.length ?? 0) > 0 && <Typography variant="caption" color="text.secondary">· {s.distritos.length} distritos</Typography>}
            {s.pedidos ? <Typography variant="caption" color="text.secondary">· {s.pedidos} pedidos</Typography> : null}
          </Box>
        </Box>
      </Box>
      {/* Leer (clic en la tarjeta) abre la versión de una columna en el celular y la de dos en la
          computadora; «Abrir» lleva a editar el informe. Delineado y compacto (2026-10-12): en una
          lista, un botón relleno por tarjeta pesaba demasiado. */}
      <Box sx={{ display: 'flex', gap: 1, px: 1.75, pb: 1.5 }}>
        {registro || !alImportar ? (
          <Button size="small" variant="outlined" startIcon={<EditNoteOutlinedIcon />} disabled={!registro}
            onClick={() => registro && alAbrir(registro)}>
            Abrir
          </Button>
        ) : (
          <Button size="small" variant="outlined" startIcon={<DownloadingOutlinedIcon />} onClick={alImportar}>
            Traer al sistema
          </Button>
        )}
      </Box>
    </Box>
  )
}

/** Todas las semanas juntas: por dónde se pasó y cuántos pedidos dejó cada semana. */
function Territorio({ semanas, alVerSemana, registro }: { semanas: Semana[]; alVerSemana: (s: Semana) => void; registro: Record<string, number> }) {
  const [exportar, setExportar] = useState(false)
  const provincias = useMemo(() => {
    const m = new Map<string, Semana[]>()
    for (const s of semanas) for (const p of s.provincias) m.set(p, [...(m.get(p) ?? []), s])
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'))
  }, [semanas])
  const maxPedidos = Math.max(1, ...semanas.map((s) => s.pedidos ?? 0))
  const conPedidos = semanas.filter((s) => s.pedidos)
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
      <Box sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: 2 }}>
        <Typography sx={{ fontWeight: 650, fontSize: 15 }}>Provincias recorridas</Typography>
        <Typography variant="caption" color="text.secondary">Toque una semana para ver su informe.</Typography>
        {provincias.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Las semanas aún no registran provincias.</Typography>}
        {provincias.map(([p, ss]) => (
          <Box key={p} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderTop: '1px solid', borderColor: 'divider', mt: 1, flexWrap: 'wrap' }}>
            <PlaceOutlinedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography sx={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 120 }}>{p}</Typography>
            <Typography variant="caption" color="text.secondary">{ss.length} {ss.length === 1 ? 'semana' : 'semanas'}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {ss.map((s) => <Chip key={s.carpeta} size="small" label={s.id} onClick={() => alVerSemana(s)} sx={{ height: 22, fontSize: 11.5 }} />)}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontWeight: 650, fontSize: 15, flex: 1 }}>Pedidos de la población</Typography>
          {conPedidos.length > 0 && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={() => setExportar(true)}
              title="Pedidos de todas las semanas (.md): elija qué datos, fechas e instituciones"
              sx={{ textTransform: 'none' }}
            >
              Descargar .md
            </Button>
          )}
          <DialogoExportarMd abierto={exportar} alCerrar={() => setExportar(false)} ruta="/api/semanas/pedidos.md"
            titulo="Descargar pedidos de las semanas" semanas={conPedidos.map((x) => ({ id: registro[x.carpeta] ?? 0, texto: x.id })).filter((x) => x.id)} />
        </Box>
        {/* 2026-10-06: sin la línea «Recogidos en cada semana…»; los contadores por etapa ya lo dicen. */}
        {conPedidos.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75, mt: 1.5 }}>
            {ETAPAS.map((e) => {
              const n = semanas.reduce((t, s) => t + (s.pedidos_estado?.[e] ?? 0), 0)
              return (
                <Box key={e} sx={{ textAlign: 'center', py: 0.75, borderRadius: 1.5, bgcolor: PALETA.superficieTenue }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 17 }}>{n}</Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{e}</Typography>
                </Box>
              )
            })}
          </Box>
        )}
        {conPedidos.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Las semanas aún no registran pedidos.</Typography>}
        {conPedidos.map((s) => (
          <ButtonBase key={s.carpeta} onClick={() => alVerSemana(s)} sx={{ display: 'block', width: '100%', textAlign: 'left', mt: 1.25, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{s.id}</Typography>
              <Typography sx={{ fontSize: 13, flex: 1 }} noWrap>{conMayuscula(s.tema)}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{s.pedidos}</Typography>
            </Box>
            <LinearProgress variant="determinate" value={(100 * (s.pedidos ?? 0)) / maxPedidos} sx={{ height: 8, borderRadius: 4, mt: 0.5, bgcolor: PALETA.superficieMedia }} />
            {Object.keys(s.pedidos_estado ?? {}).length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {ETAPAS.filter((e) => e in s.pedidos_estado).map((e) => `${s.pedidos_estado[e]} ${e}`).join(' · ')}
              </Typography>
            )}
          </ButtonBase>
        ))}
      </Box>
    </Box>
  )
}

/** El slug de la carpeta sale del tema: «Educación superior» → educacion-superior. */
const slugDe = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/** Lo que el registro pegado propone para una semana nueva: sus días y provincias. */
interface DesdeRegistro { texto: string; inicio: string; fin: string; provincias: string }

/** Alta de una semana: el servidor copia la plantilla de la entidad y la deja lista para registrar.
 *  Desde el registro de la jornada (prompt), llega con el periodo y las provincias ya puestos. */
function DialogoNueva({ abierto, alCerrar, alCreada, inicial }: { abierto: boolean; alCerrar: () => void; alCreada: (id: number) => void; inicial?: DesdeRegistro | null }) {
  const [tema, setTema] = useState('')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [provincias, setProvincias] = useState('')
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)
  useEffect(() => {
    if (!abierto || !inicial) return
    setInicio(inicial.inicio)
    setFin(inicial.fin)
    setProvincias(inicial.provincias)
  }, [abierto, inicial])
  const crear = async () => {
    setCreando(true)
    setError('')
    try {
      const r = await api<{ id: number }>('/api/semanas', {
        method: 'POST',
        body: JSON.stringify({ tema, slug: slugDe(tema), inicio, fin, provincias: provincias.split(',').map((p) => p.trim()).filter(Boolean) }),
      })
      alCreada(r.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear.')
    } finally {
      setCreando(false)
    }
  }
  return (
    <Dialog open={abierto} onClose={creando ? undefined : alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle>Nueva semana de representación</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {inicial && <Typography variant="body2" color="text.secondary">El registro no cae en ninguna semana del sistema. Escriba el tema: al crearla, se abre con el registro listo.</Typography>}
        <TextField label="Tema" value={tema} onChange={(e) => setTema(e.target.value)} helperText={tema ? `Carpeta: …_${slugDe(tema)}` : 'Lo que articula la semana: «Salud en Huanta y La Mar».'} autoFocus />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Del" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label="Al" type="date" value={fin} onChange={(e) => setFin(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>
        <TextField label="Provincias (separadas por comas)" value={provincias} onChange={(e) => setProvincias(e.target.value)} />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar} disabled={creando}>Cancelar</Button>
        <Button variant="contained" onClick={crear} disabled={creando || tema.trim().length < 3 || !inicio || !fin}>{creando ? 'Creando…' : 'Crear semana'}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** «Nueva semana» desde el registro de la jornada (prompt `registro-representacion`): se lee el
 *  bloque (sin escribir nada) para saber sus días y provincias; la página decide si va a una
 *  semana que ya existe o a una nueva. */
function DialogoPegarNuevaSemana({ abierto, alCerrar, alLeido }: { abierto: boolean; alCerrar: () => void; alLeido: (r: DesdeRegistro) => void }) {
  const [texto, setTexto] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const cerrar = () => { setTexto(''); setError(''); alCerrar() }
  const leer = async () => {
    setLeyendo(true)
    setError('')
    try {
      const r = await api<{ lectura: { valores: { actividades?: { fecha?: string; provincia?: string }[] } } }>('/api/pegar/interpretar', {
        method: 'POST', body: JSON.stringify({ texto, tipos: ['registro-representacion'] }),
      })
      const acts = r.lectura.valores.actividades ?? []
      const fechas = acts.map((a) => a.fecha ?? '').filter(Boolean).sort()
      const provincias = [...new Set(acts.map((a) => (a.provincia ?? '').trim()).filter(Boolean))]
      alLeido({ texto, inicio: fechas[0] ?? '', fin: fechas[fechas.length - 1] ?? '', provincias: provincias.join(', ') })
      setTexto('')
    } catch (e) {
      setError(mensajePegado(e))
    } finally {
      setLeyendo(false)
    }
  }
  return (
    <Dialog open={abierto} onClose={cerrar} fullWidth maxWidth="sm">
      <DialogTitle>Pegar el registro de la jornada</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Pegue el resultado del prompt de la Semana de representación (empieza por «tipo: registro-representacion»). Si su fecha cae en una semana del sistema, se abre allí; si no, se crea la semana.
        </Typography>
        <TextField multiline minRows={6} maxRows={16} autoFocus size="small" value={texto} onChange={(e) => setTexto(e.target.value)} label="Resultado del prompt" />
        {leyendo && <LinearProgress />}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={cerrar}>Cancelar</Button>
        <Button variant="contained" disabled={!texto.trim() || leyendo} onClick={() => void leer()}>Leer</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function InformesSR() {
  const tema = useTheme()
  const ancha = useMediaQuery(tema.breakpoints.up('md'))
  const [consulta, setConsulta] = useSearchParams()
  const vista = consulta.get('ver') === 'territorio' ? 'territorio' : 'semanas'
  const [semanas, setSemanas] = useState<Semana[] | null>(null)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('todos')
  const [elegido, setElegido] = useState<Elegido | null>(null)
  // En pantallas angostas el informe se abre encima, a pantalla completa.
  const [hoja, setHoja] = useState(false)
  const navegar = useNavigate()
  const [registro, setRegistro] = useState<Record<string, number>>({})
  const [sinImportar, setSinImportar] = useState<string[]>([])
  const [nueva, setNueva] = useState(false)
  // Entrada doble de «Nueva semana» (fase 9.5): el formulario o el registro de la jornada (prompt).
  const [anclaNueva, setAnclaNueva] = useState<HTMLElement | null>(null)
  const [pegarNueva, setPegarNueva] = useState(false)
  const [desdeRegistro, setDesdeRegistro] = useState<DesdeRegistro | null>(null)
  // `?pegar=<id de mensaje>` (chat, fase 9.3): el registro de una jornada va a SU semana. Se
  // deduce por la primera fecha del bloque; si no cae en una sola semana registrada, se elige.
  const [pegar, setPegar] = useState<{ mid: number; fecha: string } | null>(null)
  const [semanaElegida, setSemanaElegida] = useState('')
  const cargar = () => {
    api<Semana[]>('/api/informes-sr').then(setSemanas).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer.'))
    api<{ semanas: { id: number; carpeta: string }[]; sin_importar: string[] }>('/api/semanas')
      .then((r) => {
        setRegistro(Object.fromEntries(r.semanas.map((x) => [x.carpeta, x.id])))
        setSinImportar(r.sin_importar)
      })
      .catch(() => {})
  }
  useEffect(cargar, [])
  // `?nuevo=1` (opción «Nueva semana» del módulo) abre el alta.
  useEffect(() => {
    if (consulta.get('nuevo') === '1') setNueva(true)
    const mid = Number(consulta.get('pegar') ?? '')
    if (mid) {
      const c = new URLSearchParams(consulta)
      c.delete('pegar')
      setConsulta(c, { replace: true })
      textoDeMensaje(mid)
        .then((texto) => setPegar({ mid, fecha: /fecha:\s*["']?(\d{4}-\d{2}-\d{2})/.exec(texto)?.[1] ?? '' }))
        .catch(() => setError('No se pudo traer el mensaje del chat; abra la semana y pegue el texto a mano.'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta])
  const registradas = useMemo(() => (semanas ?? []).filter((s) => registro[s.carpeta]), [semanas, registro])
  useEffect(() => {
    if (!pegar || semanas === null) return
    const candidatas = pegar.fecha ? registradas.filter((s) => s.inicio <= pegar.fecha && pegar.fecha <= s.fin) : []
    if (candidatas.length === 1) {
      setPegar(null)
      navegar(`/informes/${registro[candidatas[0].carpeta]}?ver=actividades&pegar=${pegar.mid}`)
    } else if (!semanaElegida && (candidatas[0] ?? registradas[0])) setSemanaElegida((candidatas[0] ?? registradas[0]).carpeta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pegar, semanas, registradas])
  const importar = async (carpeta: string) => {
    if (!(await confirmar(`¿Traer ${carpeta} al sistema? Sus YAML se reescribirán al generar.`, { aceptar: 'Traer' }))) return
    try {
      const r = await api<{ id: number }>('/api/semanas/importar', { method: 'POST', body: JSON.stringify({ carpeta }) })
      navegar(`/informes/${r.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo traer la semana.')
    }
  }

  const ver = (s: Semana, p: Pdf) => {
    setElegido({ carpeta: s.carpeta, nombre: p.nombre, titulo: tituloDe(s, p) })
    if (!ancha) setHoja(true)
  }
  // En escritorio se abre el más reciente al entrar (a la derecha).
  useEffect(() => {
    const s = semanas?.find((x) => x.pdfs.length)
    if (s && !elegido && ancha) setElegido({ carpeta: s.carpeta, nombre: s.pdfs[0].nombre, titulo: tituloDe(s, s.pdfs[0]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanas, ancha])

  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return (semanas ?? []).filter(
      (s) =>
        (filtro === 'todos' || estadoInforme(s) === filtro) &&
        (!q || [s.id, s.informe, s.tema, ...s.provincias, ...(s.distritos ?? [])].some((x) => x.toLowerCase().includes(q))),
    )
  }, [semanas, texto, filtro])
  const todas = semanas ?? []
  const provincias = new Set(todas.flatMap((s) => s.provincias)).size
  const pedidos = todas.reduce((n, s) => n + (s.pedidos ?? 0), 0)
  const aprobados = todas.filter((s) => estadoInforme(s) === 'aprobado').length
  const reciente = todas[0]?.carpeta
  const cuenta = (f: (typeof FILTROS)[number]) => (f === 'todos' ? todas.length : todas.filter((s) => estadoInforme(s) === f).length)

  const rutaPdf = elegido ? `/api/informes-sr/${encodeURIComponent(elegido.carpeta)}/${encodeURIComponent(elegido.nombre)}` : ''
  const visor = (alto: string) => (
    <VisorPdf
      ruta={rutaPdf}
      nombre={elegido?.nombre}
      archivos={elegido ? archivosSemana(elegido.carpeta, todas.find((x) => x.carpeta === elegido.carpeta)?.pdfs ?? []) : undefined}
      claveInicial={elegido?.nombre}
      alto={alto}
      vacio={<Typography variant="body2" color="text.secondary">Elija una semana para leer su informe aquí.</Typography>}
    />
  )

  return (
    <Marco modulo="representacion" fondo={PALETA.fondo}>
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: { xs: 1.5, sm: 2.5 }, maxWidth: 1600, width: '100%', mx: 'auto' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {semanas === null && !error && <LinearProgress />}

        {/* Resumen de todas las semanas. */}
        {semanas && semanas.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mb: 2 }}>
            <Cifra icono={<DateRangeOutlinedIcon />} valor={todas.length} texto={todas.length === 1 ? 'semana' : 'semanas'} />
            <Cifra icono={<PlaceOutlinedIcon />} valor={provincias} texto="provincias recorridas" />
            <Cifra icono={<AssignmentOutlinedIcon />} valor={pedidos} texto="pedidos registrados" />
            <Cifra icono={<TaskAltOutlinedIcon />} valor={`${aprobados}/${todas.length}`} texto="informes aprobados" />
          </Box>
        )}
        {semanas?.length === 0 && (
          <EstadoVacio titulo="Aún no hay semanas de representación" texto="Cree la primera con «Nueva semana»."
            accion={<Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setAnclaNueva(e.currentTarget)}>Nueva semana</Button>} />
        )}

        {semanas && semanas.length > 0 && vista === 'territorio' && (
          <Territorio
            registro={registro}
            semanas={todas}
            alVerSemana={(s) => {
              setConsulta({}, { replace: false })
              setTexto(s.id)
              if (s.pdfs[0]) ver(s, s.pdfs.find((p) => p.una_columna === !ancha) ?? s.pdfs[0])
            }}
          />
        )}

        {semanas && semanas.length > 0 && vista === 'semanas' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(340px, 440px) minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
            <Box sx={{ minWidth: 0 }}>
              {/* 2026-10-12, uniformidad: la acción principal como en los demás módulos (compacta, a la izquierda). */}
              <Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setAnclaNueva(e.currentTarget)} sx={{ mb: 1.5 }}>
                Nueva semana
              </Button>
              <TextField
                fullWidth
                placeholder="Buscar tema, provincia, distrito…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                sx={{ mb: 1, bgcolor: 'background.paper' }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                  endAdornment: texto ? <IconButton size="small" onClick={() => setTexto('')} aria-label="Limpiar"><CloseIcon fontSize="small" /></IconButton> : undefined,
                }}
              />
              <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, overflowX: 'auto', pb: 0.25, '&::-webkit-scrollbar': { display: 'none' } }}>
                {FILTROS.filter((f) => f === 'todos' || cuenta(f) > 0).map((f) => (
                  <Chip
                    key={f}
                    label={`${f === 'todos' ? 'Todas' : f[0].toUpperCase() + f.slice(1)} · ${cuenta(f)}`}
                    color={filtro === f ? 'primary' : 'default'}
                    variant={filtro === f ? 'filled' : 'outlined'}
                    onClick={() => setFiltro(f)}
                    sx={{ flexShrink: 0, bgcolor: filtro === f ? undefined : 'background.paper' }}
                  />
                ))}
              </Box>
              {lista.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Ninguna semana coincide con la búsqueda.</Typography>}
              <Box sx={{ display: 'grid', gap: 1.25 }}>
                {lista.map((s) => (
                  <TarjetaSemana
                    key={s.carpeta}
                    s={s}
                    reciente={s.carpeta === reciente}
                    elegido={elegido?.nombre}
                    alLeer={(p) => ver(s, p)}
                    registro={registro[s.carpeta]}
                    alAbrir={(id) => navegar(`/informes/${id}`)}
                    alImportar={esAdmin() && sinImportar.includes(s.carpeta) ? () => importar(s.carpeta) : undefined}
                  />
                ))}
              </Box>
            </Box>
            {ancha && (
              <Box sx={{ minWidth: 0, position: 'sticky', top: 12 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }} noWrap>{elegido?.titulo ?? 'Informe'}</Typography>
                {visor('calc(100vh - 190px)')}
              </Box>
            )}
          </Box>
        )}
      </Box>

      <DialogoNueva abierto={nueva} inicial={desdeRegistro} alCerrar={() => { setNueva(false); setDesdeRegistro(null); if (consulta.get('nuevo')) setConsulta({}, { replace: true }) }}
        alCreada={(id) => desdeRegistro
          ? navegar(`/informes/${id}?ver=actividades`, { state: { textoPegar: desdeRegistro.texto } })
          : navegar(`/informes/${id}?ver=datos`)} />
      <ElegirEntrada
        ancla={anclaNueva}
        alCerrar={() => setAnclaNueva(null)}
        tipo="registro-representacion"
        etiquetaPrompt="Desde el registro de la jornada (prompt)"
        alManual={() => { setDesdeRegistro(null); setNueva(true) }}
        alPrompt={() => setPegarNueva(true)}
      />
      <DialogoPegarNuevaSemana
        abierto={pegarNueva}
        alCerrar={() => setPegarNueva(false)}
        alLeido={(r) => {
          setPegarNueva(false)
          // Si su primer día cae en una sola semana del sistema, el registro va allí.
          const candidatas = r.inicio ? registradas.filter((x) => x.inicio <= r.inicio && r.inicio <= x.fin) : []
          if (candidatas.length === 1) return navegar(`/informes/${registro[candidatas[0].carpeta]}?ver=actividades`, { state: { textoPegar: r.texto } })
          setDesdeRegistro(r)
          setNueva(true)
        }}
      />

      {/* El pegado del chat no dice sola su semana: se elige entre las registradas. */}
      <Dialog open={pegar !== null && semanas !== null} onClose={() => setPegar(null)} maxWidth="xs" fullWidth>
        <DialogTitle>¿A qué semana va el registro?</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {registradas.length === 0 ? (
            <Alert severity="info">No hay semanas en el sistema: cree una con «Nueva semana».</Alert>
          ) : (
            <TextField select fullWidth label="Semana" value={semanaElegida} onChange={(e) => setSemanaElegida(e.target.value)}>
              {registradas.map((s) => <MenuItem key={s.carpeta} value={s.carpeta}>{s.id} · {s.tema}</MenuItem>)}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPegar(null)}>Cancelar</Button>
          <Button variant="contained" disabled={!semanaElegida || !registro[semanaElegida]} onClick={() => { const mid = pegar?.mid; setPegar(null); navegar(`/informes/${registro[semanaElegida]}?ver=actividades&pegar=${mid}`) }}>
            Abrir
          </Button>
        </DialogActions>
      </Dialog>

      {/* Celular y tableta: el informe a pantalla completa. */}
      <Dialog fullScreen open={hoja && !ancha} onClose={() => setHoja(false)}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <IconButton color="inherit" onClick={() => setHoja(false)} aria-label="Cerrar el informe"><CloseIcon /></IconButton>
          <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 600, flex: 1 }}>{elegido?.titulo}</Typography>
        </Box>
        <Box sx={{ flex: 1, p: 1, display: 'flex', flexDirection: 'column' }}>{visor('100%')}</Box>
      </Dialog>
    </Marco>
  )
}

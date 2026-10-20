/**
 * PROYECTOS — lista de los proyectos de la entidad (piloto 2026-10-01: el
 * primero es el proyecto de ley). Cada fila dice en qué estado está y cuánto
 * falta: fases hechas, partes aprobadas y tareas abiertas.
 *
 * Opciones del módulo por la dirección (navegacion.ts): `?ver=mias` muestra lo
 * que la persona tiene a su cargo en todos los proyectos y `?nuevo=1` abre el
 * alta. Buscador y filtro por estado cuando la lista crece.
 *
 * Presentación (Edison 2026-10-05: «la lista se ve abrumadora; más amigable,
 * moderna, minimalista, sin perder la seriedad»): un resumen por etapa arriba
 * y dos vistas a elegir —tarjetas con el avance en un anillo, o el tablero
 * «Por etapa» del procedimiento—; la elección se recuerda en este equipo.
 */
import { useEffect, useState, type ReactNode, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import Avatar from '@mui/material/Avatar'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import Chip from '@mui/material/Chip'
import ButtonBase from '@mui/material/ButtonBase'
import InputAdornment from '@mui/material/InputAdornment'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined'
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined'
import { api } from '../api'
import Marco from '../componentes/Marco'
import BarraModulo from '../componentes/BarraModulo'
import { EstadoVacio } from '../componentes/Estilo'
import { ETIQUETA_ESTADO_PROYECTO } from './Proyecto'
import { haceCuanto, iniciales } from '../componentes/EquipoEnLinea'
import { PALETA } from '../paleta'
import ElegirEntrada from '../componentes/ElegirEntrada'
import PegarResultado from '../componentes/PegarResultado'
import { registrarPegado, textoDeMensaje, type PegadoAplicado } from '../pegar'

/** Color de cada etapa del procedimiento: lo propio de la entidad (arena de
 * atención mientras se elabora, tinta al presentarlo; 2026-10-19, rediseño sin
 * marca) y los tonos de apoyo de los estados del documento para lo que ya está
 * en el Congreso. Solo tiñe puntos, anillos y segmentos: nunca un relleno con texto. */
const COLOR_ETAPA: Record<string, string> = {
  idea: PALETA.apagado,
  en_elaboracion: PALETA.aviso,
  en_revision: PALETA.enRevision,
  listo_para_presentar: PALETA.aprobado,
  presentado: PALETA.primario,
  en_comision: PALETA.firmado,
  dictaminado: PALETA.firmado,
  en_pleno: PALETA.firmado,
  aprobado: PALETA.exito,
  ley_publicada: PALETA.exito,
  archivado: PALETA.archivado,
  retirado: PALETA.archivado,
}
const colorEtapa = (e: string) => COLOR_ETAPA[e] ?? PALETA.apagado
/** Orden del procedimiento (el de ETIQUETA_ESTADO_PROYECTO). */
const ORDEN_ETAPAS = Object.keys(ETIQUETA_ESTADO_PROYECTO)
const VISTA_GUARDADA = 'sgdp_proyectos_vista'

interface Fila {
  id: number
  codigo: string
  tipo_nombre: string
  titulo: string
  estado: string
  numero_oficial: string
  responsable: string
  actualizado_en: string
  avance: { fases_hechas: number; fases_total: number; partes_aprobadas: number; partes_total: number; tareas_abiertas: number }
}

interface MiTarea {
  id?: number
  proyecto_id: number
  proyecto: string
  titulo: string
  estado_texto: string
  limite?: string
  clave?: string
}

/** Lo que la persona tiene a su cargo: tareas y partes, cada una con su acceso directo. */
function MisTareas() {
  const navegar = useNavigate()
  const [mias, setMias] = useState<{ tareas: MiTarea[]; partes: MiTarea[] } | null>(null)
  useEffect(() => {
    api<{ tareas: MiTarea[]; partes: MiTarea[] }>('/api/proyectos/mis-tareas').then(setMias).catch(() => setMias({ tareas: [], partes: [] }))
  }, [])
  if (!mias) return <LinearProgress />
  const hoy = new Date().toISOString().slice(0, 10)
  const grupos: [string, MiTarea[], boolean][] = [
    ['Tareas', mias.tareas, false],
    ['Partes del texto a su cargo', mias.partes, true],
  ]
  if (!mias.tareas.length && !mias.partes.length)
    return <EstadoVacio titulo="No tiene nada pendiente" texto="Aquí verá las tareas y partes que le encarguen." />
  return (
    <>
      {grupos.filter(([, l]) => l.length).map(([nombre, l, esParte]) => (
        <Box key={nombre} sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>{nombre} ({l.length})</Typography>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
            {l.map((t, i) => (
              <ButtonBase
                key={`${t.id ?? t.clave}-${t.proyecto_id}`}
                onClick={() => navegar(`/proyectos/${t.proyecto_id}?ir=${encodeURIComponent(esParte ? `parte:${t.clave}` : `tarea:${t.id}`)}`)}
                sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, px: 2, py: 1.25, borderTop: i ? '1px solid' : 'none', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
              >
                {esParte ? <EditNoteOutlinedIcon sx={{ color: 'primary.main' }} /> : <ChecklistOutlinedIcon sx={{ color: 'primary.main' }} />}
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 14 }}>{t.titulo}</Typography>
                  <Typography variant="caption" color="text.secondary">{t.proyecto} · {t.estado_texto}</Typography>
                </Box>
                {t.limite && (
                  <Chip size="small" variant="outlined" color={t.limite < hoy ? 'error' : 'default'} label={`Hasta ${t.limite.slice(8, 10)}/${t.limite.slice(5, 7)}`} sx={{ height: 22, fontSize: 12 }} />
                )}
              </ButtonBase>
            ))}
          </Box>
        </Box>
      ))}
    </>
  )
}

/** Punto de color + nombre de la etapa: sobrio, sin cápsula de color lleno. */
function Etapa({ estado }: { estado: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: colorEtapa(estado), flexShrink: 0 }} />
      {ETIQUETA_ESTADO_PROYECTO[estado] ?? estado}
    </Box>
  )
}

/** Avance del texto (partes aprobadas) en un anillo, con el porcentaje dentro. */
function Anillo({ valor, color, tam = 54 }: { valor: number; color: string; tam?: number }) {
  return (
    <Box sx={{ position: 'relative', width: tam, height: tam, flexShrink: 0 }}>
      <CircularProgress variant="determinate" value={100} size={tam} thickness={3.2} sx={{ color: 'divider', position: 'absolute' }} />
      <CircularProgress variant="determinate" value={valor} size={tam} thickness={3.2} sx={{ color, position: 'absolute', '& circle': { strokeLinecap: 'round' } }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: tam > 50 ? 13 : 11, fontWeight: 700, color: 'text.primary' }}>
        {valor}%
      </Box>
    </Box>
  )
}

/** Fases del procedimiento como una fila de segmentos (hechas en color). */
function Fases({ hechas, total, color }: { hechas: number; total: number; color: string }) {
  if (!total) return null
  return (
    <Tooltip title={`Fases del procedimiento: ${hechas} de ${total} hechas`}>
      <Box sx={{ display: 'flex', gap: '3px', flex: 1, minWidth: 60, maxWidth: 160 }}>
        {Array.from({ length: total }, (_, i) => (
          <Box key={i} sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: i < hechas ? color : 'divider', transition: 'background-color .3s' }} />
        ))}
      </Box>
    </Tooltip>
  )
}

function Responsable({ nombre }: { nombre: string }) {
  if (!nombre) return null
  return (
    <Tooltip title={`Responsable: ${nombre}`}>
      <Avatar sx={{ width: 24, height: 24, fontSize: 10.5, fontWeight: 700, bgcolor: PALETA.superficieMedia, color: PALETA.textoSecundario, border: '1px solid', borderColor: 'divider' }}>
        {iniciales(nombre)}
      </Avatar>
    </Tooltip>
  )
}

/** Tarjeta de un proyecto: código y etapa, el título con aire, el avance en
 * un anillo y, al pie, las fases, las tareas abiertas y quién lo lleva. */
function TarjetaProyecto({ f, alAbrir, compacta = false }: { f: Fila; alAbrir: () => void; compacta?: boolean }) {
  const a = f.avance
  const pct = a.partes_total ? Math.round((100 * a.partes_aprobadas) / a.partes_total) : 0
  const color = colorEtapa(f.estado)
  return (
    <ButtonBase
      onClick={alAbrir}
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', textAlign: 'left',
        p: compacta ? 1.5 : { xs: 1.75, sm: 2.25 }, gap: compacta ? 1 : 1.5,
        border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper',
        position: 'relative', overflow: 'hidden',
        transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
        // 2026-10-19: sin filete de color a la izquierda; la etapa la dicen el punto (Etapa) y la columna del tablero.
        '&:hover, &:focus-visible': { transform: 'translateY(-2px)', boxShadow: PALETA.sombra, borderColor: PALETA.bordeFuerte },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 12.5, letterSpacing: 0.3, color: 'primary.main' }}>{f.codigo}</Typography>
        {!compacta && <Etapa estado={f.estado} />}
        <Box sx={{ flex: 1 }} />
        {f.numero_oficial && <Typography variant="caption" color="text.secondary" noWrap>N.º {f.numero_oficial}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
        <Typography
          sx={{
            flex: 1, fontSize: compacta ? 13.5 : { xs: 14.5, sm: 15 }, fontWeight: 560, lineHeight: 1.45, color: 'text.primary',
            display: '-webkit-box', WebkitLineClamp: compacta ? 3 : 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {f.titulo}
        </Typography>
        {!compacta && <Anillo valor={pct} color={color} />}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 'auto', pt: compacta ? 0 : 0.5 }}>
        <Fases hechas={a.fases_hechas} total={a.fases_total} color={color} />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {compacta ? `${pct}% texto` : `${a.partes_aprobadas}/${a.partes_total} partes`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {a.tareas_abiertas > 0 && (
          <Tooltip title={`${a.tareas_abiertas} tarea(s) abiertas`}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, fontWeight: 600, color: PALETA.aviso }}>
              <ChecklistOutlinedIcon sx={{ fontSize: 15 }} />
              {a.tareas_abiertas}
            </Box>
          </Tooltip>
        )}
        <Responsable nombre={f.responsable} />
      </Box>
      {!compacta && f.actualizado_en && (
        <Typography variant="caption" sx={{ color: PALETA.textoTenue, mt: -0.75 }}>
          Último movimiento {haceCuanto(f.actualizado_en)}
        </Typography>
      )}
    </ButtonBase>
  )
}

/** Resumen por etapa: cuántos hay en cada una; pulsar filtra. */
function Resumen({ filas, estado, alElegir }: { filas: Fila[]; estado: string; alElegir: (e: string) => void }) {
  const cuenta = ORDEN_ETAPAS.map((e) => [e, filas.filter((f) => f.estado === e).length] as const).filter(([, n]) => n)
  const casilla = (clave: string, etiqueta: string, n: number, color: string | null, extra?: ReactNode) => {
    const activa = estado === clave
    return (
      <ButtonBase
        key={clave || 'todos'}
        onClick={() => alElegir(clave)}
        sx={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25,
          px: 2, py: 1.25, minWidth: 128, borderRadius: 2.5, border: '1px solid',
          borderColor: activa ? 'primary.main' : 'divider', bgcolor: activa ? PALETA.guindaSuave : 'background.paper',
          transition: 'border-color .15s, background-color .15s', '&:hover': { borderColor: 'primary.main' },
        }}
      >
        <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: 'text.primary' }}>{n}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12.5, color: 'text.secondary', fontWeight: 550 }}>
          {color && <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color }} />}
          {etiqueta}
          {extra}
        </Box>
      </ButtonBase>
    )
  }
  return (
    <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, mb: 2, '&::-webkit-scrollbar': { display: 'none' } }}>
      {casilla('', 'Proyectos', filas.length, null)}
      {cuenta.map(([e, n]) => casilla(e, ETIQUETA_ESTADO_PROYECTO[e] ?? e, n, colorEtapa(e)))}
    </Box>
  )
}

/** Tablero «Por etapa»: una columna por etapa con proyectos, en el orden del
 * procedimiento; en el celular se desliza de lado. */
function Tablero({ filas, alAbrir }: { filas: Fila[]; alAbrir: (id: number) => void }) {
  const columnas = ORDEN_ETAPAS.map((e) => [e, filas.filter((f) => f.estado === e)] as const).filter(([, l]) => l.length)
  return (
    <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1, alignItems: 'flex-start', scrollSnapType: 'x mandatory' }}>
      {columnas.map(([e, l]) => (
        <Box key={e} sx={{ flex: '0 0 300px', maxWidth: '86vw', scrollSnapAlign: 'start', bgcolor: PALETA.superficieTenue, border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, pb: 1.25 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colorEtapa(e) }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{ETIQUETA_ESTADO_PROYECTO[e] ?? e}</Typography>
            <Typography variant="caption" color="text.secondary">{l.length}</Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {l.map((f) => <TarjetaProyecto key={f.id} f={f} compacta alAbrir={() => alAbrir(f.id)} />)}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export default function Proyectos() {
  const navegar = useNavigate()
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [consulta, setConsulta] = useSearchParams()
  const vista = consulta.get('ver') === 'mias' ? 'mias' : 'todos'
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [titulo, setTitulo] = useState('')
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('')
  const [modo, setModo] = useState<'tarjetas' | 'etapas'>(() => {
    try {
      return localStorage.getItem(VISTA_GUARDADA) === 'etapas' ? 'etapas' : 'tarjetas'
    } catch {
      return 'tarjetas'
    }
  })
  const cambiarModo = (m: 'tarjetas' | 'etapas' | null) => {
    if (!m) return
    setModo(m)
    try {
      localStorage.setItem(VISTA_GUARDADA, m)
    } catch {
      /* sin almacenamiento: solo esta vez */
    }
  }
  const nuevo = consulta.get('nuevo') === '1'
  const abrirNuevo = (v: boolean) => {
    const c = new URLSearchParams(consulta)
    if (v) c.set('nuevo', '1')
    else c.delete('nuevo')
    setConsulta(c, { replace: true })
  }
  // Entrada doble de «Nuevo proyecto» (fase 9.5): a mano (título) o desde la ficha del prompt
  // (bloque `proyecto-de-ley`); `?pegar=<id de mensaje>` (chat) llega ya leída.
  const [anclaNuevo, setAnclaNuevo] = useState<HTMLElement | null>(null)
  const [modoNuevo, setModoNuevo] = useState<'manual' | 'prompt'>('manual')
  const [textoPegar, setTextoPegar] = useState('')
  // Lo que el pegado dejó para guardar en la ficha tras crear (y su constancia).
  const [pendiente, setPendiente] = useState<{ datos: Record<string, string>; aplicado: PegadoAplicado } | null>(null)
  const [creando, setCreando] = useState(false)
  const pidePegar = Number(consulta.get('pegar') ?? '') || 0
  const cargar = useCallback(() => api<Fila[]>('/api/proyectos').then(setFilas).catch(() => setFilas([])), [])
  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    if (!pidePegar) return
    const c = new URLSearchParams(consulta)
    c.delete('pegar')
    c.set('nuevo', '1')
    setConsulta(c, { replace: true })
    textoDeMensaje(pidePegar)
      .then((t) => { setTextoPegar(t); setModoNuevo('prompt') })
      .catch(() => { setError('No se pudo traer el mensaje del chat; pegue el texto a mano.'); setModoNuevo('prompt') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pidePegar])
  const cerrarNuevo = () => {
    abrirNuevo(false)
    setModoNuevo('manual')
    setTextoPegar('')
    setPendiente(null)
  }

  // Un título igual a otro proyecto suele ser un duplicado (en la lista
  // había dos proyectos con la misma sumilla): se avisa, sin impedirlo.
  const normal = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')
  const repetido = titulo.trim().length >= 3 ? (filas ?? []).find((f) => normal(f.titulo) === normal(titulo)) : undefined
  const crear = async (t: string = titulo, conPegado: typeof pendiente = pendiente) => {
    if (t.trim().length < 3 || creando) return
    setCreando(true)
    try {
      const r = await api<{ id: number }>('/api/proyectos', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'proyecto_de_ley', titulo: t.replace(/\s+/g, ' ').trim() }),
      })
      // La ficha del prompt va al proyecto recién creado; la constancia, a su entidad.
      if (conPegado) {
        if (Object.keys(conPegado.datos).length) await api(`/api/proyectos/${r.id}`, { method: 'PATCH', body: JSON.stringify({ datos: conPegado.datos }) }).catch(() => {})
        const { aceptadas, rechazadas, ...resto } = conPegado.aplicado
        void registrarPegado({ ...resto, rechazados: rechazadas, entidad: `pl:${r.id}`, campos_aplicados: { titulo: t, ...conPegado.datos, ...Object.fromEntries([...aceptadas].filter((k) => !(k in conPegado.datos)).map((k) => [k, resto.campos_propuestos[k]])) } })
      }
      navegar(`/proyectos/${r.id}${conPegado ? '?ir=resumen' : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear.')
    } finally {
      setCreando(false)
    }
  }
  // Lo aceptado del bloque: el título crea el proyecto; el resto es la ficha (como en Resumen).
  const aplicarPegado = (campos: Record<string, unknown>, aplicado: PegadoAplicado) => {
    const datos: Record<string, string> = {}
    for (const [k, v] of Object.entries(campos)) {
      if (['titulo', 'estado', 'numero_presentado', 'observaciones'].includes(k) || v == null || v === '') continue
      datos[k] = Array.isArray(v) ? v.map(String).join(k === 'adherentes' ? '\n' : '; ') : String(v)
    }
    const t = String(campos.titulo ?? '').replace(/\s+/g, ' ').trim()
    const p = { datos, aplicado }
    if (t.length >= 3) void crear(t, p)
    else {
      setPendiente(p)
      setTitulo(t)
      setModoNuevo('manual')
      setError('')
    }
  }

  const visibles = (filas ?? []).filter(
    (f) => (!estado || f.estado === estado) && (!texto.trim() || `${f.codigo} ${f.titulo} ${f.numero_oficial} ${f.responsable}`.toLowerCase().includes(texto.trim().toLowerCase())),
  )

  return (
    <Marco modulo="proyectos" fondo={PALETA.fondo}>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 3 } }}>
        {vista === 'mias' ? (
          <MisTareas />
        ) : (
          <>
            {/* 2026-10-06: sin texto introductorio; la acción principal en su sitio común (BarraModulo). */}
            <BarraModulo
              alActualizar={cargar}
              principal={
                <Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setAnclaNuevo(e.currentTarget)}>
                  Nuevo proyecto de ley
                </Button>
              }
            />
            <ElegirEntrada
              ancla={anclaNuevo}
              alCerrar={() => setAnclaNuevo(null)}
              tipo="proyecto-de-ley"
              etiquetaManual="Escribir el título"
              alManual={() => { setModoNuevo('manual'); abrirNuevo(true) }}
              alPrompt={() => { setModoNuevo('prompt'); setTextoPegar(''); abrirNuevo(true) }}
            />
            {filas && filas.length > 0 && <Resumen filas={filas} estado={estado} alElegir={setEstado} />}
            {filas && filas.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                {filas.length > 3 && (
                  <TextField
                    placeholder="Buscar por título, código o número"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    sx={{ flex: 1, minWidth: 220, bgcolor: 'background.paper' }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                  />
                )}
                <Box sx={{ flex: filas.length > 3 ? 'none' : 1 }} />
                <ToggleButtonGroup size="small" exclusive value={modo} onChange={(_, m) => cambiarModo(m)} aria-label="Vista" sx={{ bgcolor: 'background.paper' }}>
                  <ToggleButton value="tarjetas" sx={{ gap: 0.75, textTransform: 'none', px: 1.5 }}>
                    <GridViewOutlinedIcon fontSize="small" /> Tarjetas
                  </ToggleButton>
                  <ToggleButton value="etapas" sx={{ gap: 0.75, textTransform: 'none', px: 1.5 }}>
                    <ViewKanbanOutlinedIcon fontSize="small" /> Por etapa
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}
            {filas === null ? (
              <LinearProgress />
            ) : filas.length === 0 ? (
              <EstadoVacio titulo="Todavía no hay proyectos" texto="Cree el primero con «Nuevo proyecto de ley»." />
            ) : modo === 'etapas' ? (
              <Tablero filas={visibles} alAbrir={(id) => navegar(`/proyectos/${id}`)} />
            ) : (
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(330px, 1fr))' } }}>
                {visibles.map((f) => <TarjetaProyecto key={f.id} f={f} alAbrir={() => navegar(`/proyectos/${f.id}`)} />)}
              </Box>
            )}
            {filas && filas.length > 0 && visibles.length === 0 && (
              <Typography variant="body2" color="text.secondary">Ningún proyecto coincide con la búsqueda.</Typography>
            )}
          </>
        )}
      </Container>
      <Dialog open={nuevo} onClose={cerrarNuevo} fullWidth maxWidth={modoNuevo === 'prompt' ? 'md' : 'sm'} fullScreen={celular} scroll="paper">
        <DialogTitle>Nuevo proyecto de ley</DialogTitle>
        {modoNuevo === 'prompt' ? (
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Pegue el bloque «tipo: proyecto-de-ley»: el título crea el proyecto y lo demás llena su ficha.
            </Typography>
            <PegarResultado
              ruta="/api/pegar/interpretar"
              tipos={['proyecto-de-ley']}
              cuerpoExtra={{ tipos: ['proyecto-de-ley'] }}
              actual={{}}
              abiertoAlInicio
              textoInicial={textoPegar || undefined}
              etiquetaBoton="Pegar la ficha del prompt"
              alAplicar={aplicarPegado}
            />
            {creando && <LinearProgress sx={{ mt: 1 }} />}
            {error && <Typography variant="body2" color="error" sx={{ mt: 1 }}>{error}</Typography>}
          </DialogContent>
        ) : (
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {pendiente ? 'El bloque no trae el título: escríbalo y se crea con la ficha pegada.' : 'Se crea con sus fases y partes; todo se ajusta después.'}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            label="Título (sumilla) — «Ley que…»"
            placeholder="Ley que promueve…"
            value={titulo}
            // Enter crea (el título es una sola línea; antes metía un salto).
            onChange={(e) => setTitulo(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear() } }}
            error={Boolean(error)}
            helperText={error || (repetido ? `Ya existe ${repetido.codigo} con este título.` : 'Puede cambiarlo después.')}
            FormHelperTextProps={{ sx: repetido && !error ? { color: 'warning.main' } : undefined }}
          />
          {repetido && (
            <Button size="small" onClick={() => navegar(`/proyectos/${repetido.id}`)}>Abrir {repetido.codigo}</Button>
          )}
        </DialogContent>
        )}
        <DialogActions>
          <Button onClick={cerrarNuevo}>Cancelar</Button>
          {modoNuevo === 'manual' && (
            <Button variant="contained" onClick={() => void crear()} disabled={titulo.trim().length < 3 || creando}>
              Crear
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Marco>
  )
}

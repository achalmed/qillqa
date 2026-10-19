/**
 * Registro fotográfico de la semana (F-NNN). Las fotos se SUBEN al banco de la
 * semana (el original no entra a la base ni al expediente) y aquí se revisan:
 * estado (pública / reservada / por revisar), selección para el informe, pie,
 * actividad, relaciones con pedidos e instituciones y, en las verticales, qué
 * franja conserva el recorte 3:2 de la galería. Solo las públicas y elegidas
 * llegan al PDF (lib/fotos.py del generador), en el orden del registro.
 *
 * Para cientos de fotos (2026-10-06; una semana trae 180–230): agrupadas por día
 * y actividad en secciones plegables, cuadrícula justificada (la de la Fototeca,
 * `filasJustificadas`), filtros con su cuenta, selección múltiple con acciones en
 * lote (una sola petición: fotos-lote), el modo «Elegir para el informe» (un toque
 * elige o quita, con el número de orden en cada foto), el orden del informe y un
 * visor con ←/→. Lo que se sube aquí queda también en la Fototeca, vinculado a la
 * semana, y «Desde la Fototeca» copia al banco fotos que ya estaban allí.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Autocomplete from '@mui/material/Autocomplete'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import InputAdornment from '@mui/material/InputAdornment'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import UploadIcon from '@mui/icons-material/Upload'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import LinkIcon from '@mui/icons-material/Link'
import ShortTextIcon from '@mui/icons-material/ShortText'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import DirectionsWalkOutlinedIcon from '@mui/icons-material/DirectionsWalkOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import { Link as EnlaceRuta } from 'react-router-dom'
import { api, subirArchivo } from '../../api'
import { PALETA } from '../../paleta'
import Selector from '../fototeca/Selector'
import { filasJustificadas } from '../fototeca/Cuadricula'
import type { Foto } from '../fototeca/modelo'
import VisorFoto from './VisorFoto'
import OrdenInforme from './OrdenInforme'
import Miniatura from './MiniaturaFoto'
import { type Datos, type PropsSeccion, lista, texto } from './modelo'
import {
  FILTROS, type Filtro, type FotoS, type Lote, SIN_ACTIVIDAD, aFotoS, actividadesOrdenadas, agrupar, cambiarLote,
  cumple, enInforme,
} from './fotosSemana'
import { confirmar } from '../Dialogos'

const ESPACIO = 4
const TAMANOS: [number, string][] = [[110, 'S'], [160, 'M'], [230, 'L']]

const leer = <T,>(clave: string, defecto: T): T => {
  try {
    const v = localStorage.getItem(clave)
    return v === null ? defecto : (JSON.parse(v) as T)
  } catch {
    return defecto
  }
}
const escribir = (clave: string, valor: unknown) => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin almacenamiento: solo se pierde la preferencia */
  }
}

interface PropsTesela {
  semanaId: number
  foto: FotoS
  ancho: number
  alto: number
  marcada: boolean
  conMarcas: boolean
  elegir: boolean
  /** Su número entre las elegidas de su actividad (1 = la de la ficha); 0 si no va. */
  numero: number
  alPulsar: (e: React.MouseEvent) => void
  alMarcar: (e: React.MouseEvent) => void
  alEstrella: () => void
}

function Tesela({ semanaId, foto, ancho, alto, marcada, conMarcas, elegir, numero, alPulsar, alMarcar, alEstrella }: PropsTesela) {
  const d = foto.datos
  const reservada = d.estado === 'reservada'
  const sinPie = !texto(d.pie).trim()
  const relaciones = lista(d.pedidos).length + lista(d.instituciones).length
  return (
    <Box role="button" tabIndex={0} aria-label={`${foto.codigo} ${texto(d.pie)}`} onClick={alPulsar}
      onKeyDown={(e) => e.key === 'Enter' && alPulsar(e as unknown as React.MouseEvent)}
      sx={{
        position: 'relative', width: ancho, height: alto, flexShrink: 0, cursor: 'pointer', overflow: 'hidden', borderRadius: 0.5,
        outline: marcada ? `3px solid ${PALETA.guinda}` : numero ? `3px solid ${PALETA.doradoLinea}` : 'none', outlineOffset: -3,
        '&:hover .sr-ctl, &:focus-visible .sr-ctl': { opacity: 1 },
        '&:focus-visible': { outline: `3px solid ${PALETA.info}` },
      }}>
      <Box sx={{ width: '100%', height: '100%', opacity: reservada ? 0.55 : 1, transform: marcada ? 'scale(0.92)' : 'none', transition: 'transform .12s' }}>
        <Miniatura semanaId={semanaId} codigo={foto.codigo} />
      </Box>
      {!elegir && (
        <Box className="sr-ctl" component="span" onClick={(e) => { e.stopPropagation(); alMarcar(e) }}
          sx={{ position: 'absolute', top: 4, left: 4, display: 'flex', borderRadius: '50%', color: marcada ? PALETA.guinda : '#fff',
                bgcolor: marcada ? '#fff' : 'rgba(0,0,0,.25)', opacity: marcada || conMarcas ? 1 : { xs: 0.85, md: 0 }, transition: 'opacity .12s' }}>
          {marcada ? <CheckCircleIcon fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
        </Box>
      )}
      {numero > 0 ? (
        <Box component="span" title={numero === 1 ? '1.ª: va en la ficha' : `${numero}.ª en el informe`}
          onClick={(e) => { e.stopPropagation(); alEstrella() }}
          sx={{ position: 'absolute', top: 4, right: 4, minWidth: 22, height: 22, px: 0.5, borderRadius: 11, display: 'grid', placeItems: 'center',
                bgcolor: PALETA.guinda, color: PALETA.sobrePrimario, fontSize: 12, fontWeight: 700, boxShadow: `0 0 0 2px ${PALETA.superficie}` }}>
          {numero}
        </Box>
      ) : !reservada && (
        <Box className="sr-ctl" component="span" title="Elegir para el informe" onClick={(e) => { e.stopPropagation(); alEstrella() }}
          sx={{ position: 'absolute', top: 4, right: 4, display: 'flex', color: '#fff', filter: 'drop-shadow(0 0 2px rgba(0,0,0,.8))',
                opacity: elegir ? 1 : { xs: 0.85, md: 0 }, transition: 'opacity .12s' }}>
          <StarBorderIcon fontSize="small" />
        </Box>
      )}
      <Box sx={{ position: 'absolute', left: 4, bottom: 5, display: 'flex', gap: 0.25, color: '#fff', filter: 'drop-shadow(0 0 2px rgba(0,0,0,.8))' }}>
        {reservada && <LockOutlinedIcon sx={{ fontSize: 15 }} titleAccess="Reservada" />}
        {sinPie && <ShortTextIcon sx={{ fontSize: 15 }} titleAccess="Sin pie" />}
        {relaciones > 0 && <LinkIcon sx={{ fontSize: 15 }} titleAccess="Relacionada con pedidos o instituciones" />}
      </Box>
      {d.estado === 'revisar' && <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, bgcolor: PALETA.doradoLinea }} title="Por revisar" />}
    </Box>
  )
}

/** Pie para varias fotos: uno común, o el de su actividad en las que no tienen. */
function DialogoPie({ abierto, n, alCerrar, alAplicar }: { abierto: boolean; n: number; alCerrar: () => void; alAplicar: (l: Lote) => Promise<void> }) {
  const [pie, setPie] = useState('')
  useEffect(() => { if (abierto) setPie('') }, [abierto])
  return (
    <Dialog open={abierto} onClose={alCerrar} fullWidth maxWidth="sm">
      <DialogTitle>Pie para {n} foto{n === 1 ? '' : 's'}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth multiline maxRows={3} label="Pie común" value={pie} onChange={(e) => setPie(e.target.value)} sx={{ mt: 1 }}
          helperText="Actividad y lugar, sin nombres. Reemplaza el pie actual." />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => void alAplicar({ pie_de_actividad: true })}>Pie de su actividad (solo las vacías)</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" disabled={!pie.trim()} onClick={() => void alAplicar({ cambios: { pie: pie.trim() } })}>Poner a todas</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Relacionar varias fotos con pedidos e instituciones (se SUMAN a lo que ya tenían). */
function DialogoRelacionar({ abierto, n, pedidos, instituciones, alCerrar, alAplicar }: {
  abierto: boolean; n: number; pedidos: { codigo: string; texto: string }[]; instituciones: string[]
  alCerrar: () => void; alAplicar: (l: Lote) => Promise<void>
}) {
  const [ps, setPs] = useState<string[]>([])
  const [is, setIs] = useState<string[]>([])
  useEffect(() => { if (abierto) { setPs([]); setIs([]) } }, [abierto])
  const textoDe = Object.fromEntries(pedidos.map((p) => [p.codigo, p.texto]))
  return (
    <Dialog open={abierto} onClose={alCerrar} fullWidth maxWidth="sm">
      <DialogTitle>Relacionar {n} foto{n === 1 ? '' : 's'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <Autocomplete multiple options={pedidos.map((p) => p.codigo)} value={ps} onChange={(_, v) => setPs(v)}
          getOptionLabel={(o) => `${o} · ${(textoDe[o] ?? '').slice(0, 80)}`}
          renderTags={(v, props) => v.map((x, i) => <Chip size="small" label={x} {...props({ index: i })} key={x} />)}
          renderInput={(p) => <TextField {...p} label="Pedidos que muestran" />} />
        <Autocomplete multiple freeSolo options={instituciones} value={is} onChange={(_, v) => setIs(v.map((x) => x.trim()).filter(Boolean))}
          renderTags={(v, props) => v.map((x, i) => <Chip size="small" label={x} {...props({ index: i })} key={x} />)}
          renderInput={(p) => <TextField {...p} label="Instituciones" helperText="Se suman a las que cada foto ya tenía." />} />
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" disabled={!ps.length && !is.length} onClick={() => void alAplicar({ sumar: { pedidos: ps, instituciones: is } })}>Relacionar</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function Fotos({ s, voc, recargar, avisar }: PropsSeccion) {
  const clavePlegados = `sgdp_sr_fotos_plegados_${s.id}`
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [q, setQ] = useState('')
  const [alto, setAltoBase] = useState<number>(() => leer('sgdp_sr_fotos_alto', 160))
  const [plegados, setPlegadosBase] = useState<Set<string>>(() => new Set(leer<string[]>(clavePlegados, [])))
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const ultima = useRef<string | null>(null)
  const [elegir, setElegir] = useState(false)
  const [visor, setVisor] = useState<{ codigos: string[]; indice: number } | null>(null)
  const [ordenAbierto, setOrdenAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [fototeca, setFototeca] = useState(false)
  const destino = useRef('')
  const entrada = useRef<HTMLInputElement>(null)
  const [menuDestino, setMenuDestino] = useState<{ el: HTMLElement; para: 'subir' | 'fototeca' } | null>(null)
  const [menuLote, setMenuLote] = useState<{ el: HTMLElement; tipo: 'actividad' | 'estado' | 'tipo' } | null>(null)
  const [dialogo, setDialogo] = useState<'pie' | 'relacionar' | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const setAlto = (v: number) => {
    setAltoBase(v)
    escribir('sgdp_sr_fotos_alto', v)
  }
  const setPlegados = (v: Set<string>) => {
    setPlegadosBase(v)
    escribir(clavePlegados, [...v])
  }
  const plegar = (clave: string) => {
    const n = new Set(plegados)
    if (n.has(clave)) n.delete(clave)
    else n.add(clave)
    setPlegados(n)
  }

  const todas = useMemo(() => s.fotos.map(aFotoS), [s.fotos])
  const conocidas = useMemo(() => new Set(s.actividades.map((a) => a.codigo)), [s.actividades])
  const cuentas = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.clave, todas.filter((x) => cumple(x, f.clave, conocidas)).length])) as Record<Filtro, number>,
    [todas, conocidas],
  )
  const visibles = useMemo(() => {
    const busca = q.trim().toLowerCase()
    return todas.filter((f) => cumple(f, filtro, conocidas) && (!busca ||
      [f.codigo, f.datos.pie, f.datos.origen, f.datos.observaciones, ...lista(f.datos.pedidos), ...lista(f.datos.instituciones)]
        .some((x) => texto(x).toLowerCase().includes(busca))))
  }, [todas, filtro, q, conocidas])
  const grupos = useMemo(() => agrupar(s, visibles), [s, visibles])
  // El orden en pantalla (para Mayús + clic y para el visor).
  const plano = useMemo(() => grupos.flatMap((d) => d.actividades.flatMap((a) => a.fotos.map((f) => f.codigo))), [grupos])
  // Número de cada foto elegida dentro de su actividad, sobre TODAS (no solo las filtradas).
  const numeros = useMemo(() => {
    const m = new Map<string, number>()
    const n = new Map<string, number>()
    for (const f of todas) {
      if (!enInforme(f.datos)) continue
      const k = f.actividad || SIN_ACTIVIDAD
      n.set(k, (n.get(k) ?? 0) + 1)
      m.set(f.codigo, n.get(k)!)
    }
    return m
  }, [todas])
  const enInformePorDia = useMemo(() => {
    const fecha = Object.fromEntries(s.actividades.map((a) => [a.codigo, texto(a.datos.fecha)]))
    const m = new Map<string, number>()
    for (const f of todas) if (enInforme(f.datos)) m.set(fecha[f.actividad] ?? SIN_ACTIVIDAD, (m.get(fecha[f.actividad] ?? SIN_ACTIVIDAD) ?? 0) + 1)
    return m
  }, [todas, s.actividades])
  const actividades = useMemo(() => actividadesOrdenadas(s), [s])
  const pedidosOpc = useMemo(() => s.pedidos.map((p) => ({ codigo: p.codigo, texto: texto(p.datos.pedido) })), [s.pedidos])
  const instituciones = useMemo(() => [...new Set(s.pedidos.flatMap((p) => lista(p.datos.entidades)))].sort(), [s.pedidos])

  // Lo marcado que ya no existe (quitado) sale de la selección.
  useEffect(() => {
    setMarcadas((m) => {
      const existen = new Set(s.fotos.map((f) => f.codigo))
      const n = new Set([...m].filter((c) => existen.has(c)))
      return n.size === m.size ? m : n
    })
  }, [s.fotos])
  // Esc desmarca todo (fuera del visor y de los campos).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || visor || (e.target as HTMLElement).closest('input, textarea')) return
      setMarcadas(new Set())
      setElegir(false)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [visor])

  const cambiar = useCallback(async (codigos: string[], lote: Lote) => {
    if (!codigos.length) return
    setTrabajando(true)
    try {
      const r = await cambiarLote(s.id, codigos, lote)
      await recargar()
      if (lote.fototeca) {
        const f = r.fototeca
        avisar('success', `Fototeca: ${f.nuevas} nuevas, ${f.ya_estaban} ya estaban${f.sin_original ? `, ${f.sin_original} sin original en el banco` : ''}.`)
      } else if (codigos.length > 1) {
        const reservadas = lote.cambios?.seleccion === true ? codigos.filter((c) => s.fotos.find((f) => f.codigo === c)?.datos.estado === 'reservada').length : 0
        avisar('success', `${r.cambiadas} de ${codigos.length} fotos actualizadas${reservadas ? ` (${reservadas} reservadas no van al informe)` : ''}.`)
      }
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setTrabajando(false)
    }
  }, [s.id, s.fotos, recargar, avisar])

  const marcar = (codigo: string, tramo: boolean) => {
    setMarcadas((m) => {
      const n = new Set(m)
      if (tramo && ultima.current && plano.includes(ultima.current)) {
        const [a, b] = [plano.indexOf(ultima.current), plano.indexOf(codigo)].sort((x, y) => x - y)
        plano.slice(a, b + 1).forEach((c) => n.add(c))
      } else if (n.has(codigo)) n.delete(codigo)
      else n.add(codigo)
      return n
    })
    ultima.current = codigo
  }
  const marcarGrupo = (codigos: string[]) =>
    setMarcadas((m) => {
      const todasYa = codigos.every((c) => m.has(c))
      const n = new Set(m)
      codigos.forEach((c) => (todasYa ? n.delete(c) : n.add(c)))
      return n
    })
  const alternarInforme = (f: FotoS) => {
    if (f.datos.estado === 'reservada') {
      avisar('info', `${f.codigo} es reservada: hágala pública primero.`)
      return
    }
    void cambiar([f.codigo], { cambios: { seleccion: !enInforme(f.datos) } })
  }
  const pulsar = (f: FotoS, e: React.MouseEvent) => {
    if (elegir) alternarInforme(f)
    else if (marcadas.size > 0 || e.ctrlKey || e.metaKey || e.shiftKey) marcar(f.codigo, e.shiftKey)
    else setVisor({ codigos: plano, indice: plano.indexOf(f.codigo) })
  }

  const elegirDestino = (para: 'subir' | 'fototeca', el: HTMLElement) => setMenuDestino({ el, para })
  const conDestino = (actividad: string, para: 'subir' | 'fototeca') => {
    destino.current = actividad
    setMenuDestino(null)
    if (para === 'subir') entrada.current?.click()
    else setFototeca(true)
  }
  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    setSubiendo(true)
    try {
      const datos = new FormData()
      for (const a of Array.from(archivos)) datos.append('archivos', a)
      datos.append('actividad', destino.current)
      const r = await subirArchivo<{ fotos: string[] }>(`/api/semanas/${s.id}/fotos-subir`, datos)
      avisar('success', `${r.fotos.length} foto(s) subidas${destino.current ? ` a ${destino.current}` : ''}, por revisar.`)
      await recargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudieron subir.')
    } finally {
      setSubiendo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }
  const desdeFototeca = async (elegidas: Foto[]) => {
    try {
      const r = await api<{ fotos: string[]; repetidas: number[] }>(`/api/semanas/${s.id}/fotos-desde-fototeca`, {
        method: 'POST',
        body: JSON.stringify({ ids: elegidas.map((f) => f.id), actividad: destino.current }),
      })
      setFototeca(false)
      const extra = r.repetidas.length ? ` (${r.repetidas.length} ya estaban en esta semana)` : ''
      avisar('success', `${r.fotos.length} foto(s) agregadas desde la Fototeca${extra}.`)
      await recargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudieron agregar.')
    }
  }
  const quitar = async (codigo: string) => {
    if (!(await confirmar(`¿Quitar ${codigo} del registro? El original queda en el banco.`, { aceptar: 'Quitar', peligro: true }))) return
    try {
      await api(`/api/semanas/${s.id}/fotos/${codigo}`, { method: 'DELETE' })
      setVisor((v) => {
        if (!v) return v
        const codigos = v.codigos.filter((c) => c !== codigo)
        return codigos.length ? { codigos, indice: Math.min(v.indice, codigos.length - 1) } : null
      })
      await recargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo quitar.')
    }
  }
  const lote = async (l: Lote) => {
    await cambiar([...marcadas], l)
    setDialogo(null)
    setMenuLote(null)
  }

  const nMarcadas = marcadas.size
  const marcadasEnInforme = [...marcadas].filter((c) => numeros.has(c)).length
  const todasClaves = grupos.flatMap((d) => [`d:${d.clave}`, ...d.actividades.map((a) => `a:${a.codigo}`)])
  const algoPlegado = todasClaves.some((c) => plegados.has(c))
  const altoFila = ancho > 0 && ancho < 600 ? Math.min(alto, 120) : alto
  const menuActividades = (alElegir: (codigo: string) => void, conSin: boolean) => {
    const items: React.ReactNode[] = []
    if (conSin) items.push(<MenuItem key="__sin" onClick={() => alElegir('')}>Sin actividad (clasificar después)</MenuItem>)
    let dia = ''
    for (const a of actividades) {
      const f = texto(a.datos.fecha)
      if (f !== dia) {
        dia = f
        items.push(<ListSubheader key={`d-${f}`} sx={{ lineHeight: '30px' }}>{grupos.find((g) => g.clave === f)?.titulo ?? f}</ListSubheader>)
      }
      items.push(<MenuItem key={a.codigo} onClick={() => alElegir(a.codigo)} sx={{ fontSize: 14, whiteSpace: 'normal' }}>{a.codigo} · {texto(a.datos.titulo).slice(0, 70)}</MenuItem>)
    }
    return items
  }

  return (
    <Box>
      {/* Barra: buscar, filtros con su cuenta, tamaño, plegar, elegir, orden, subir. */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
        <TextField size="small" placeholder="Buscar pie, código, archivo, pedido…" value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1, minWidth: { xs: '100%', sm: 220 }, bgcolor: 'background.paper' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        {/* 2026-10-06: mientras se elige, «Listo» y «Ordenar» viven solo en la barra fija (estaban
            repetidos aquí); «Orden» ya no lleva la cuenta (la da la barra fija). */}
        {!elegir && (
          <>
            <Button variant="outlined" startIcon={<StarBorderIcon />} onClick={() => { setElegir(true); setMarcadas(new Set()) }}>
              Elegir para el informe
            </Button>
            <Tooltip title="Orden de las fotos en el informe">
              <Button startIcon={<FormatListNumberedIcon />} onClick={() => setOrdenAbierto(true)}>Orden</Button>
            </Tooltip>
          </>
        )}
        <Tooltip title="Copia al banco fotos que ya están en la Fototeca">
          <Button startIcon={<PhotoLibraryOutlinedIcon />} onClick={(e) => elegirDestino('fototeca', e.currentTarget)}>Desde la Fototeca</Button>
        </Tooltip>
        <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={(e) => subir(e.target.files)} />
        <Button variant="contained" startIcon={<UploadIcon />} disabled={subiendo} onClick={(e) => elegirDestino('subir', e.currentTarget)}>Subir fotos</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 1, overflowX: 'auto', pb: 0.5 }}>
        {FILTROS.map((f) => (
          <Tooltip key={f.clave} title={f.ayuda}>
            <Chip size="small" label={`${f.etiqueta} · ${cuentas[f.clave]}`} color={filtro === f.clave ? 'primary' : 'default'}
              variant={filtro === f.clave ? 'filled' : 'outlined'} onClick={() => setFiltro(f.clave)}
              sx={{ flexShrink: 0, bgcolor: filtro === f.clave ? undefined : 'background.paper' }} />
          </Tooltip>
        ))}
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup size="small" exclusive value={alto} onChange={(_, v) => v && setAlto(v)} sx={{ display: { xs: 'none', sm: 'flex' }, bgcolor: 'background.paper' }}>
          {TAMANOS.map(([v, e]) => <ToggleButton key={v} value={v} aria-label={`Tamaño ${e}`} sx={{ py: 0.25, px: 1, fontSize: 12 }}>{e}</ToggleButton>)}
        </ToggleButtonGroup>
        <Tooltip title={algoPlegado ? 'Desplegar todo' : 'Plegar todas las actividades'}>
          <IconButton size="small" onClick={() => setPlegados(algoPlegado ? new Set() : new Set(grupos.flatMap((d) => d.actividades.map((a) => `a:${a.codigo}`))))}>
            {algoPlegado ? <UnfoldMoreIcon fontSize="small" /> : <UnfoldLessIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      {(subiendo || trabajando) && <LinearProgress sx={{ mb: 1 }} />}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
        {/* 2026-10-06: sin «N en el informe»; la cuenta de elegidas está en la barra de elegir. */}
        {/* Revisión 9.7: la ruta del banco no cabe en el celular; ahí se omite. */}
        {visibles.length} de {s.fotos.length} fotos ·{' '}
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, wordBreak: 'break-all' }}>banco: {texto((s.resto.fotos?._meta as Datos | undefined)?.banco)} · </Box>ver en
        la <EnlaceRuta to={`/fototeca?vinculo=semana:${s.id}`}>Fototeca</EnlaceRuta>
      </Typography>

      {/* Modo elegir o acciones en lote: barra fija arriba mientras se trabaja. */}
      {(elegir || nMarcadas > 0) && (
        <Box sx={{ position: 'sticky', top: 0, zIndex: 5, mb: 1, p: 1, borderRadius: 2, display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center',
                   bgcolor: 'background.paper', border: `1px solid ${elegir ? PALETA.doradoLinea : PALETA.guinda}`, boxShadow: '0 2px 8px rgba(36,31,28,.08)' }}>
          {elegir ? (
            <>
              <StarIcon sx={{ color: PALETA.guinda }} fontSize="small" />
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Toque para elegir o quitar · {cuentas.informe} elegidas</Typography>
              {/* 2026-10-06: sin «El número es su orden… (1 = ficha)»; la regla queda en «Orden del informe». */}
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                Las por revisar pasan a públicas.
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button size="small" startIcon={<FormatListNumberedIcon />} onClick={() => setOrdenAbierto(true)}>Ordenar</Button>
              <Button size="small" variant="contained" onClick={() => setElegir(false)}>Listo</Button>
            </>
          ) : (
            <>
              <IconButton size="small" aria-label="Desmarcar" onClick={() => setMarcadas(new Set())}><CloseIcon fontSize="small" /></IconButton>
              <Typography sx={{ fontSize: 14, fontWeight: 600, mr: 0.5 }}>{nMarcadas} marcada{nMarcadas === 1 ? '' : 's'}</Typography>
              <Button size="small" startIcon={<StarIcon />} onClick={() => void lote({ cambios: { seleccion: marcadasEnInforme < nMarcadas } })}>
                {marcadasEnInforme < nMarcadas ? 'Al informe' : 'Quitar del informe'}
              </Button>
              <Button size="small" startIcon={<VisibilityOutlinedIcon />} onClick={(e) => setMenuLote({ el: e.currentTarget, tipo: 'estado' })}>Estado</Button>
              <Button size="small" startIcon={<DirectionsWalkOutlinedIcon />} onClick={(e) => setMenuLote({ el: e.currentTarget, tipo: 'actividad' })}>Actividad</Button>
              <Button size="small" startIcon={<NotesOutlinedIcon />} onClick={() => setDialogo('pie')}>Pie</Button>
              <Button size="small" startIcon={<LinkIcon />} onClick={() => setDialogo('relacionar')}>Relacionar</Button>
              <Button size="small" onClick={(e) => setMenuLote({ el: e.currentTarget, tipo: 'tipo' })}>Tipo</Button>
              <Tooltip title="Copiar a la Fototeca, vinculadas a la semana">
                <Button size="small" startIcon={<PhotoLibraryOutlinedIcon />} onClick={() => void lote({ fototeca: true })}>A la Fototeca</Button>
              </Tooltip>
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={() => setMarcadas(new Set(plano))}>Marcar las {plano.length} visibles</Button>
            </>
          )}
        </Box>
      )}

      <Box ref={caja} sx={{ width: '100%', userSelect: 'none' }}>
        {!s.fotos.length && (
          <Box sx={{ p: 4, textAlign: 'center', border: `1px dashed ${PALETA.bordeFuerte}`, borderRadius: 2, color: 'text.secondary' }}>
            <AddPhotoAlternateOutlinedIcon sx={{ fontSize: 40, color: PALETA.apagado }} />
            <Typography>Aún no hay fotos. Use «Subir fotos» o «Desde la Fototeca».</Typography>
          </Box>
        )}
        {s.fotos.length > 0 && !visibles.length && <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Ninguna foto con este filtro.</Typography>}
        {ancho > 0 && grupos.map((d) => {
          const plegadoDia = plegados.has(`d:${d.clave}`)
          const nDia = d.actividades.reduce((m, a) => m + a.fotos.length, 0)
          const elegidasDia = enInformePorDia.get(d.clave) ?? 0
          return (
            <Box key={d.clave} sx={{ mb: 2 }}>
              <Box onClick={() => plegar(`d:${d.clave}`)} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.75, cursor: 'pointer', borderBottom: `2px solid ${PALETA.borde}` }}>
                {plegadoDia ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: d.clave === SIN_ACTIVIDAD ? PALETA.aviso : PALETA.texto }}>{d.titulo}</Typography>
                <Typography variant="caption" color="text.secondary">{nDia} foto{nDia === 1 ? '' : 's'}</Typography>
                {d.clave !== SIN_ACTIVIDAD && (
                  <Tooltip title="Elegidas de este día (máx. 8)">
                    <Chip size="small" icon={<StarIcon sx={{ fontSize: '14px !important' }} />} label={elegidasDia} variant="outlined"
                      sx={{ height: 20, fontSize: 11.5, ml: 'auto', color: elegidasDia > 8 ? PALETA.aviso : PALETA.textoSecundario, borderColor: elegidasDia ? PALETA.doradoLinea : PALETA.borde }} />
                  </Tooltip>
                )}
              </Box>
              {!plegadoDia && d.actividades.map((a) => {
                const plegada = plegados.has(`a:${a.codigo}`)
                const codigos = a.fotos.map((f) => f.codigo)
                const todasMarcadas = codigos.every((c) => marcadas.has(c))
                const elegidas = a.fotos.filter((f) => numeros.has(f.codigo)).length
                return (
                  <Box key={a.codigo} sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, minWidth: 0 }}>
                      <IconButton size="small" aria-label={plegada ? 'Desplegar' : 'Plegar'} onClick={() => plegar(`a:${a.codigo}`)} sx={{ p: 0.25 }}>
                        {plegada ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                      {!elegir && (
                        <IconButton size="small" aria-label={todasMarcadas ? 'Desmarcar la actividad' : 'Marcar toda la actividad'} onClick={() => marcarGrupo(codigos)}
                          sx={{ p: 0.25, color: todasMarcadas ? 'primary.main' : 'text.disabled' }}>
                          {todasMarcadas ? <CheckCircleIcon fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
                        </IconButton>
                      )}
                      <Box sx={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => plegar(`a:${a.codigo}`)}>
                        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>
                          {a.codigo !== SIN_ACTIVIDAD && <Box component="span" sx={{ color: PALETA.guinda, mr: 0.75 }}>{a.codigo}</Box>}
                          {a.titulo}
                        </Typography>
                        {a.detalle && <Typography noWrap variant="caption" color="text.secondary" component="div">{a.detalle}</Typography>}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {a.fotos.length}{elegidas ? ` · ★ ${elegidas}` : ''}
                      </Typography>
                      {a.codigo !== SIN_ACTIVIDAD && (
                        <Tooltip title={`Subir fotos a ${a.codigo}`}>
                          <IconButton size="small" onClick={() => conDestino(a.codigo, 'subir')}><AddPhotoAlternateOutlinedIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    {!plegada && filasJustificadas(a.fotos.map((foto, indice) => ({ foto, indice })), ancho, altoFila, ESPACIO).map((fila, i) => (
                      <Box key={i} sx={{ display: 'flex', gap: `${ESPACIO}px`, mb: `${ESPACIO}px` }}>
                        {fila.fotos.map(({ foto, ancho: w }) => (
                          <Tesela key={foto.codigo} semanaId={s.id} foto={foto} ancho={w} alto={fila.alto}
                            marcada={marcadas.has(foto.codigo)} conMarcas={nMarcadas > 0} elegir={elegir} numero={numeros.get(foto.codigo) ?? 0}
                            alPulsar={(e) => pulsar(foto, e)} alMarcar={(e) => marcar(foto.codigo, e.shiftKey)} alEstrella={() => alternarInforme(foto)} />
                        ))}
                      </Box>
                    ))}
                  </Box>
                )
              })}
            </Box>
          )
        })}
      </Box>

      <Menu anchorEl={menuDestino?.el} open={Boolean(menuDestino)} onClose={() => setMenuDestino(null)} PaperProps={{ sx: { maxHeight: 420, maxWidth: 420 } }}>
        <ListSubheader sx={{ lineHeight: '32px', fontWeight: 700 }}>{menuDestino?.para === 'subir' ? 'Subir a la actividad…' : 'Agregar a la actividad…'}</ListSubheader>
        {menuDestino && menuActividades((c) => conDestino(c, menuDestino.para), true)}
      </Menu>
      <Menu anchorEl={menuLote?.el} open={Boolean(menuLote)} onClose={() => setMenuLote(null)} PaperProps={{ sx: { maxHeight: 420, maxWidth: 420 } }}>
        {menuLote?.tipo === 'actividad' && [
          ...menuActividades((c) => void lote({ cambios: { actividad: c || null }, pie_de_actividad: Boolean(c) }), true),
        ]}
        {menuLote?.tipo === 'estado' && [
          <MenuItem key="p" onClick={() => void lote({ cambios: { estado: 'publica' } })}>Pública</MenuItem>,
          <MenuItem key="r" onClick={() => void lote({ cambios: { estado: 'reservada' } })}>Reservada (sale del informe)</MenuItem>,
          <MenuItem key="v" onClick={() => void lote({ cambios: { estado: 'revisar' } })}>Por revisar</MenuItem>,
        ]}
        {menuLote?.tipo === 'tipo' && voc.tipos_foto.map((t) => <MenuItem key={t} onClick={() => void lote({ cambios: { tipo: t } })}>{t}</MenuItem>)}
      </Menu>
      <DialogoPie abierto={dialogo === 'pie'} n={nMarcadas} alCerrar={() => setDialogo(null)} alAplicar={lote} />
      <DialogoRelacionar abierto={dialogo === 'relacionar'} n={nMarcadas} pedidos={pedidosOpc} instituciones={instituciones}
        alCerrar={() => setDialogo(null)} alAplicar={lote} />
      <OrdenInforme s={s} abierto={ordenAbierto} alCerrar={() => setOrdenAbierto(false)} cambiar={cambiar} recargar={recargar} avisar={avisar} />
      <VisorFoto s={s} voc={voc} codigos={visor?.codigos ?? []} indice={visor ? visor.indice : null}
        alCambiarIndice={(i) => setVisor((v) => (v && i !== null ? { ...v, indice: i } : null))} cambiar={cambiar} quitar={quitar} />
      <Selector abierto={fototeca} multiple titulo={`Agregar fotos a ${s.codigo ?? 'la semana'}${destino.current ? ` (${destino.current})` : ''} desde la Fototeca`}
        accion="Agregar a la semana" alCerrar={() => setFototeca(false)} alElegir={desdeFototeca} />
    </Box>
  )
}

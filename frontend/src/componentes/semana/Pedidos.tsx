/**
 * Pedidos de la población (P-NNN): con su actividad, entidades competentes (del
 * directorio institucional), prioridad, responsable y plazo. Un pedido se DERIVA
 * con un oficio de la gestión documental —el sistema crea el borrador y lo
 * enlaza— o se vincula a un oficio que ya existía; su estado (registrado →
 * derivado → respondido → cerrado) es el seguimiento del informe.
 *
 * Organización (2026-10-06, docs/decisiones.md): la vista principal agrupa por el
 * SIGUIENTE PASO —por derivar → oficio en preparación → esperando respuesta →
 * respondido → cerrado—, que es lo que el equipo hace con un pedido, y dentro de
 * cada paso por la institución que debe atenderlo (a quien va el oficio: la
 * primera entidad competente). Las demás vistas responden otras preguntas y se
 * recuerdan por navegador: por institución, por actividad (la visita en que se
 * recogió), por lugar (provincia → distrito) y una tabla compacta.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
import ListSubheader from '@mui/material/ListSubheader'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import SendOutlinedIcon from '@mui/icons-material/SendOutlined'
import LinkIcon from '@mui/icons-material/Link'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined'
import FilterListOffIcon from '@mui/icons-material/FilterListOff'
import { api } from '../../api'
import DialogoExportarMd from './DialogoExportarMd'
import DialogoPegarSemana from './DialogoPegarSemana'
import ElegirEntrada from '../ElegirEntrada'
import { PALETA } from '../../paleta'
import { ETIQUETA_ESTADO, sxEstado } from '../../estados'
import DialogoFila, { type Campo } from './DialogoFila'
import { type Datos, type Fila, type PropsSeccion, conMayuscula, fechaLarga, lista, texto } from './modelo'
import { actividadesOrdenadas } from './fotosSemana'
import { confirmar, pedirTexto } from '../Dialogos'

const VACIO: Datos = {}

interface Edicion {
  codigo: string | null
  datos: Datos
  fila?: Fila
}

interface MiembroEquipo {
  id: number
  nombre_completo: string
  rol: string
}

const sugerirEntidades = async (q: string) =>
  (await api<{ nombre: string; siglas: string }[]>(`/api/directorio/instituciones?q=${encodeURIComponent(q)}&limite=12`))
    .map((i) => i.siglas || i.nombre)

// --- El siguiente paso de un pedido -------------------------------------------------------

type Etapa = 'por_derivar' | 'preparacion' | 'esperando' | 'respondido' | 'cerrado'
const ETAPAS: { clave: Etapa; titulo: string; corto: string; accion: string; color: string }[] = [
  { clave: 'por_derivar', titulo: 'Por derivar', corto: 'por derivar', accion: 'Generar el oficio o enlazar uno existente', color: PALETA.guinda },
  { clave: 'preparacion', titulo: 'Oficio en preparación', corto: 'en preparación', accion: 'Terminar, firmar y enviar el oficio', color: PALETA.enRevision },
  { clave: 'esperando', titulo: 'Esperando respuesta', corto: 'esperando', accion: 'Marcar respondido cuando la entidad conteste', color: PALETA.aprobado },
  { clave: 'respondido', titulo: 'Respondido', corto: 'respondido', accion: 'Comunicar la respuesta a la población y cerrar', color: PALETA.exito },
  { clave: 'cerrado', titulo: 'Cerrado', corto: 'cerrado', accion: 'Comunicado a la población', color: PALETA.archivado },
]
const ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.clave, e])) as Record<Etapa, (typeof ETAPAS)[number]>
// Un oficio ya salió de la entidad en estos estados.
const SALIDOS = new Set(['ENVIADO', 'OBSERVADO_ENVIADO', 'ARCHIVADO'])

function etapaDe(p: Fila): Etapa {
  const e = texto(p.datos.estado)
  if (e === 'cerrado') return 'cerrado'
  if (e === 'respondido') return 'respondido'
  if (p.documento && !SALIDOS.has(p.documento.estado)) return 'preparacion'
  if (p.documento || e === 'derivado') return 'esperando'
  return 'por_derivar'
}

const RANGO_PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, ordinaria: 2 }
const COLOR_PRIO: Record<string, string> = { urgente: PALETA.error, alta: PALETA.aviso, ordinaria: PALETA.textoTenue }
const hoy = () => new Date().toISOString().slice(0, 10)
const vencido = (p: Fila) => {
  const plazo = texto(p.datos.plazo)
  return Boolean(plazo) && plazo < hoy() && !['respondido', 'cerrado'].includes(etapaDe(p))
}
/** A quién va el oficio: la primera entidad competente (la que `derivar` pone de destinatario). */
const principal = (p: Fila) => lista(p.datos.entidades)[0] || texto(p.datos.entidades_texto) || 'Sin entidad'
const ordenar = (a: Fila, b: Fila) =>
  (RANGO_PRIORIDAD[texto(a.datos.prioridad_propuesta)] ?? 3) - (RANGO_PRIORIDAD[texto(b.datos.prioridad_propuesta)] ?? 3) ||
  (texto(a.datos.plazo) || '9999').localeCompare(texto(b.datos.plazo) || '9999') ||
  a.codigo.localeCompare(b.codigo)

// --- Vistas -------------------------------------------------------------------------------

type Vista = 'paso' | 'institucion' | 'actividad' | 'lugar' | 'tabla'
const VISTAS: { clave: Vista; etiqueta: string; ayuda: string }[] = [
  { clave: 'paso', etiqueta: 'Por paso', ayuda: 'Qué hay que hacer con cada pedido, y para qué institución' },
  { clave: 'institucion', etiqueta: 'Institución', ayuda: 'Qué se le pide a cada institución (a quien va el oficio)' },
  { clave: 'actividad', etiqueta: 'Actividad', ayuda: 'En qué visita se recogió, día por día' },
  { clave: 'lugar', etiqueta: 'Lugar', ayuda: 'Provincia y distrito de la actividad' },
  { clave: 'tabla', etiqueta: 'Tabla', ayuda: 'Todo en una tabla compacta' },
]
const CLAVE_VISTA = 'sgdp_sr_pedidos_vista'
const leerVista = (): Vista => {
  try {
    const v = localStorage.getItem(CLAVE_VISTA)
    return VISTAS.some((x) => x.clave === v) ? (v as Vista) : 'paso'
  } catch {
    return 'paso'
  }
}

interface Grupo {
  clave: string
  titulo: string
  detalle?: string
  color?: string
  items: Fila[]
  sub?: { clave: string; titulo: string; items: Fila[] }[]
}

function porClave(items: Fila[], clave: (p: Fila) => string): Map<string, Fila[]> {
  const m = new Map<string, Fila[]>()
  for (const p of items) m.set(clave(p), [...(m.get(clave(p)) ?? []), p])
  return m
}
const subPorInstitucion = (items: Fila[]) =>
  [...porClave(items, principal)].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([k, l]) => ({ clave: k, titulo: k, items: l.sort(ordenar) }))

// --- Filtros ------------------------------------------------------------------------------

interface Filtros {
  etapa: Etapa | ''
  prioridad: string
  responsable: string
  institucion: string
  distrito: string
  sinOficio: boolean
  vencidos: boolean
}
const SIN_FILTROS: Filtros = { etapa: '', prioridad: '', responsable: '', institucion: '', distrito: '', sinOficio: false, vencidos: false }
const SIN_RESPONSABLE = '__sin__'

export default function Pedidos({ s, voc, recargar, avisar }: PropsSeccion) {
  const navegar = useNavigate()
  const [editando, setEditando] = useState<Edicion | null>(null)
  const [q, setQ] = useState('')
  const [exportar, setExportar] = useState(false)
  const [f, setF] = useState<Filtros>(SIN_FILTROS)
  const [vista, setVistaBase] = useState<Vista>(leerVista)
  const [plegados, setPlegados] = useState<Set<string>>(new Set())
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([])
  const [menu, setMenu] = useState<{ el: HTMLElement; p: Fila } | null>(null)
  const [consulta, setConsulta] = useSearchParams()
  // Entrada doble de «Pedido» (fase 9.5): a mano o desde el registro de la jornada (prompt).
  const [anclaNuevo, setAnclaNuevo] = useState<HTMLElement | null>(null)
  const [pegar, setPegar] = useState(false)

  useEffect(() => {
    api<MiembroEquipo[]>('/api/admin/equipo').then(setEquipo).catch(() => setEquipo([]))
  }, [])
  const setVista = (v: Vista) => {
    setVistaBase(v)
    try {
      localStorage.setItem(CLAVE_VISTA, v)
    } catch {
      /* sin almacenamiento: solo no se recuerda */
    }
  }
  const poner = (cambio: Partial<Filtros>) => setF((x) => ({ ...x, ...cambio }))

  const actividades = useMemo(() => actividadesOrdenadas(s), [s])
  const act = useMemo(() => Object.fromEntries(s.actividades.map((a) => [a.codigo, a.datos])), [s.actividades])
  const lugarDe = (p: Fila) => {
    const a = act[texto(p.datos.actividad)] ?? {}
    return { provincia: texto(a.provincia) || 'Sin provincia', distrito: texto(a.distrito) || 'Sin distrito' }
  }
  const fotosDe = useMemo(() => {
    const m = new Map<string, number>()
    for (const foto of s.fotos) for (const c of lista(foto.datos.pedidos)) m.set(c, (m.get(c) ?? 0) + 1)
    return m
  }, [s.fotos])

  // Opciones de los filtros, de lo que hay en la semana.
  const instituciones = useMemo(() => [...new Set(s.pedidos.map(principal))].sort(), [s.pedidos]) // eslint-disable-line react-hooks/exhaustive-deps
  const distritos = useMemo(() => [...new Set(s.pedidos.map((p) => texto((act[texto(p.datos.actividad)] ?? {}).distrito)).filter(Boolean))].sort(), [s.pedidos, act])
  const responsables = useMemo(() => [...new Set([...s.pedidos.map((p) => texto(p.datos.responsable)).filter(Boolean), ...equipo.map((e) => e.nombre_completo)])].sort(), [s.pedidos, equipo])

  // Todo filtro salvo la etapa (los contadores de etapa cuentan sobre lo demás).
  const filtradosSinEtapa = useMemo(() => {
    const busca = q.trim().toLowerCase()
    return s.pedidos.filter((p) => {
      const d = p.datos
      const a = act[texto(d.actividad)] ?? {}
      return (
        (!f.prioridad || d.prioridad_propuesta === f.prioridad) &&
        (!f.responsable || (f.responsable === SIN_RESPONSABLE ? !texto(d.responsable) : d.responsable === f.responsable)) &&
        (!f.institucion || lista(d.entidades).includes(f.institucion) || principal(p) === f.institucion) &&
        (!f.distrito || a.distrito === f.distrito) &&
        (!f.sinOficio || !p.documento) &&
        (!f.vencidos || vencido(p)) &&
        (!busca || [p.codigo, d.pedido, d.actuacion, d.entidades_texto, d.responsable, a.titulo, a.distrito, a.localidad, p.documento?.codigo, ...lista(d.entidades)]
          .some((x) => texto(x).toLowerCase().includes(busca)))
      )
    })
  }, [s.pedidos, q, f, act])
  const filtrados = useMemo(() => filtradosSinEtapa.filter((p) => !f.etapa || etapaDe(p) === f.etapa), [filtradosSinEtapa, f.etapa])
  const cuentaEtapa = (e: Etapa) => filtradosSinEtapa.filter((p) => etapaDe(p) === e).length
  const nVencidos = s.pedidos.filter(vencido).length
  const nSinResponsable = s.pedidos.filter((p) => !texto(p.datos.responsable) && !['cerrado'].includes(etapaDe(p))).length
  const hayFiltros = q.trim() !== '' || JSON.stringify(f) !== JSON.stringify(SIN_FILTROS)

  const grupos: Grupo[] = useMemo(() => {
    if (vista === 'paso') {
      const m = porClave(filtrados, etapaDe)
      return ETAPAS.filter((e) => m.has(e.clave)).map((e) => ({
        clave: e.clave, titulo: e.titulo, detalle: e.accion, color: e.color, items: m.get(e.clave)!, sub: subPorInstitucion(m.get(e.clave)!),
      }))
    }
    if (vista === 'institucion') {
      return subPorInstitucion(filtrados).map((g) => ({ ...g, detalle: `${g.items.filter((p) => etapaDe(p) === 'por_derivar').length} por derivar` }))
    }
    if (vista === 'actividad') {
      const m = porClave(filtrados, (p) => texto(p.datos.actividad))
      const salida: Grupo[] = actividades.filter((a) => m.has(a.codigo)).map((a) => ({
        clave: a.codigo,
        titulo: `${a.codigo} · ${texto(a.datos.titulo)}`,
        detalle: [conMayuscula(fechaLarga(texto(a.datos.fecha))), texto(a.datos.hora_inicio), [texto(a.datos.localidad), texto(a.datos.distrito)].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
        items: m.get(a.codigo)!.sort(ordenar),
      }))
      const huerfanos = filtrados.filter((p) => !act[texto(p.datos.actividad)])
      if (huerfanos.length) salida.push({ clave: '__sin', titulo: 'Sin actividad', items: huerfanos.sort(ordenar) })
      return salida
    }
    if (vista === 'lugar') {
      const m = porClave(filtrados, (p) => lugarDe(p).provincia)
      return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([prov, items]) => ({
        clave: prov, titulo: prov === 'Sin provincia' ? prov : `Provincia de ${prov}`, items,
        sub: [...porClave(items, (p) => lugarDe(p).distrito)].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
          .map(([dist, l]) => ({ clave: `${prov}/${dist}`, titulo: dist, items: l.sort(ordenar) })),
      }))
    }
    return []
  }, [vista, filtrados, actividades, act]) // eslint-disable-line react-hooks/exhaustive-deps

  const campos: Campo[] = [
    { clave: 'actividad', etiqueta: 'Actividad en que se recogió', tipo: 'opcion', opciones: actividades.map((a) => ({ valor: a.codigo, etiqueta: `${a.codigo} · ${texto(a.datos.titulo)}` })) },
    { clave: 'pedido', etiqueta: 'Pedido', tipo: 'area', ayuda: 'Lo que pidió la población, sistematizado en una o dos frases.' },
    { clave: 'entidades', etiqueta: 'Entidades competentes', tipo: 'chips', sugerir: sugerirEntidades, ayuda: 'La primera recibe el oficio. Escriba para buscar.' },
    { clave: 'entidades_texto', etiqueta: 'Entidades, como las nombró la fuente', tipo: 'texto' },
    { clave: 'actuacion', etiqueta: 'Actuación parlamentaria propuesta', tipo: 'area' },
    { clave: 'prioridad_propuesta', etiqueta: 'Prioridad', tipo: 'opcion', medio: true, opciones: voc.prioridades.map((p) => ({ valor: p, etiqueta: p })) },
    // El estado cambia solo al derivar; a mano, para marcarlo respondido o cerrado.
    ...(editando?.codigo ? [{ clave: 'estado', etiqueta: 'Estado', tipo: 'opcion' as const, medio: true, opciones: voc.estados_pedido.map((e) => ({ valor: e, etiqueta: e })), ayuda: 'respondido: la entidad contestó · cerrado: se comunicó al ciudadano' }] : []),
    { clave: 'responsable', etiqueta: 'Responsable en el despacho', tipo: 'opcion', medio: true, opciones: responsables.map((r) => ({ valor: r, etiqueta: r })) },
    { clave: 'plazo', etiqueta: 'Plazo', tipo: 'fecha', medio: true },
    { clave: 'observaciones', etiqueta: 'Observaciones internas', tipo: 'area' },
  ]

  const nuevo = (deActividad?: string) =>
    setEditando({
      codigo: null,
      datos: { actividad: deActividad || null, fecha: null, fila_fuente: null, pedido: '', entidades: [], entidades_texto: '',
               actuacion: '', responsable: null, prioridad_propuesta: 'ordinaria', estado: 'registrado',
               documento_salida: null, plazo: null, observaciones: null },
    })
  const guardar = async (datos: Datos) => {
    // La fecha, si falta, es la de su actividad.
    const a = s.actividades.find((x) => x.codigo === datos.actividad)
    const conFecha = { ...datos, fecha: datos.fecha || a?.datos.fecha || null }
    if (editando?.codigo) {
      await api(`/api/semanas/${s.id}/pedidos/${editando.codigo}`, { method: 'PUT', body: JSON.stringify({ datos: conFecha }) })
    } else {
      await api(`/api/semanas/${s.id}/pedidos`, { method: 'POST', body: JSON.stringify({ datos: conFecha }) })
    }
    setEditando(null)
    await recargar()
  }
  const accion = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo completar.')
    }
  }
  /** Un cambio rápido (estado, responsable): el PUT lleva los datos completos del pedido. */
  const cambiar = (p: Fila, cambios: Datos, mensaje: string) =>
    accion(async () => {
      setMenu(null)
      await api(`/api/semanas/${s.id}/pedidos/${p.codigo}`, { method: 'PUT', body: JSON.stringify({ datos: { ...p.datos, ...cambios } }) })
      await recargar()
      avisar('success', mensaje)
    })
  const derivar = (codigo: string) =>
    accion(async () => {
      setMenu(null)
      if (!(await confirmar(`¿Crear oficio en borrador para ${codigo}?`, { aceptar: 'Crear oficio' }))) return
      const r = await api<{ documento_id: number }>(`/api/semanas/${s.id}/pedidos/${codigo}/derivar`, { method: 'POST' })
      navegar(`/documentos/${r.documento_id}`)
    })
  const vincular = (codigo: string) =>
    accion(async () => {
      setMenu(null)
      const cod = await pedirTexto('Código del oficio que ya atiende este pedido (p. ej. OF-0100):', { inicial: '', etiqueta: 'Código', aceptar: 'Enlazar' })
      if (!cod) return
      await api(`/api/semanas/${s.id}/pedidos/${codigo}/vincular`, { method: 'POST', body: JSON.stringify({ codigo: cod }) })
      setEditando(null)
      avisar('success', `Pedido ${codigo} enlazado a ${cod.toUpperCase()}.`)
      await recargar()
    })
  const desvincular = (codigo: string) =>
    accion(async () => {
      if (!(await confirmar('¿Quitar el enlace con el oficio? El oficio no se borra.', { aceptar: 'Quitar', peligro: true }))) return
      await api(`/api/semanas/${s.id}/pedidos/${codigo}/vincular`, { method: 'DELETE' })
      setEditando(null)
      await recargar()
    })
  const quitar = (codigo: string) =>
    accion(async () => {
      if (!(await confirmar(`¿Quitar el pedido ${codigo}?`, { aceptar: 'Quitar', peligro: true }))) return
      await api(`/api/semanas/${s.id}/pedidos/${codigo}`, { method: 'DELETE' })
      setEditando(null)
      await recargar()
    })
  const abrir = (p: Fila) => setEditando({ codigo: p.codigo, datos: p.datos, fila: p })
  const plegar = (clave: string) => setPlegados((x) => {
    const n = new Set(x)
    if (n.has(clave)) n.delete(clave)
    else n.add(clave)
    return n
  })

  // «Pedido de esta actividad» (desde una actividad) abre el alta con la actividad puesta.
  useEffect(() => {
    const desde = consulta.get('nuevo')
    if (desde && s.actividades.some((a) => a.codigo === desde)) {
      nuevo(desde)
      setConsulta({ ver: 'pedidos' }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta])

  /** La acción principal del paso en que está el pedido. */
  const accionPrincipal = (p: Fila) => {
    const e = etapaDe(p)
    if (e === 'por_derivar') return <Button size="small" variant="outlined" startIcon={<SendOutlinedIcon />} onClick={() => derivar(p.codigo)}>Generar oficio</Button>
    // 2026-10-06: en 'preparacion' no hay botón «Abrir oficio»; repetía el chip del oficio de la tarjeta.
    if (e === 'esperando') return <Button size="small" startIcon={<MarkEmailReadOutlinedIcon />} onClick={() => cambiar(p, { estado: 'respondido' }, `${p.codigo}: respondido.`)}>Respondido</Button>
    if (e === 'respondido') return <Button size="small" startIcon={<TaskAltIcon />} onClick={() => cambiar(p, { estado: 'cerrado' }, `${p.codigo}: cerrado.`)}>Cerrar</Button>
    return null
  }

  const tarjeta = (p: Fila, sinEntidad?: boolean) => {
    const d = p.datos
    const e = ETAPA[etapaDe(p)]
    const a = act[texto(d.actividad)] ?? {}
    const prio = texto(d.prioridad_propuesta)
    const otras = lista(d.entidades).slice(1)
    const venc = vencido(p)
    const nFotos = fotosDe.get(p.codigo) ?? 0
    const lugar = vista !== 'actividad'
      ? [texto(d.actividad), texto(a.titulo), [texto(a.localidad), texto(a.distrito)].filter(Boolean).join(', '), texto(a.fecha) && fechaLarga(texto(a.fecha))].filter(Boolean).join(' · ')
      : ''
    const entidad = (
      <Typography variant="caption" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: PALETA.textoSecundario, minWidth: 0 }}>
        <AccountBalanceOutlinedIcon sx={{ fontSize: 14, flexShrink: 0 }} />
        <Box component="b" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{principal(p)}</Box>
        {otras.length > 0 && <Tooltip title={otras.join(' · ')}><span>+{otras.length}</span></Tooltip>}
      </Typography>
    )
    // Sin lugar (vista por actividad, que ya lo dice en su encabezado), la
    // institución baja al pie y acompaña a la acción: ninguna fila queda con
    // un botón solo.
    const entidadAlPie = !lugar && !sinEntidad
    return (
      <Box key={p.codigo} sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: venc ? PALETA.error : 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0, minHeight: 26 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'primary.main' }}>{p.codigo}</Typography>
          <Box component="span" sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: COLOR_PRIO[prio] ?? PALETA.textoTenue }}>{prio || '—'}</Box>
          {vista !== 'paso' && <Chip size="small" label={e.corto} sx={{ height: 20, fontSize: 11, fontWeight: 600, color: e.color, bgcolor: `${e.color}1A` }} />}
          {texto(d.plazo) && (
            <Tooltip title={venc ? 'Plazo vencido' : 'Plazo'}>
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12, color: venc ? PALETA.error : 'text.secondary', fontWeight: venc ? 700 : 400 }}>
                <EventOutlinedIcon sx={{ fontSize: 14 }} />{texto(d.plazo)}
              </Box>
            </Tooltip>
          )}
          {nFotos > 0 && (
            <Tooltip title={`${nFotos} foto(s) relacionadas`}>
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12, color: 'text.secondary' }}><PhotoCameraOutlinedIcon sx={{ fontSize: 14 }} />{nFotos}</Box>
            </Tooltip>
          )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, minHeight: 26 }}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12, color: texto(d.responsable) ? 'text.secondary' : 'text.disabled', maxWidth: { xs: 110, sm: 170 } }}>
              <PersonOutlineIcon sx={{ fontSize: 15 }} /><Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto(d.responsable) || 'sin responsable'}</Box>
            </Box>
            <IconButton size="small" aria-label="Más acciones" onClick={(ev) => setMenu({ el: ev.currentTarget, p })} sx={{ p: 0.25 }}><MoreVertIcon fontSize="small" /></IconButton>
          </Box>
        </Box>
        <ButtonBase onClick={() => abrir(p)} sx={{ display: 'block', textAlign: 'left', borderRadius: 1, '&:hover': { bgcolor: PALETA.guindaSuave } }}>
          <Typography sx={{ fontSize: 14, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{texto(d.pedido)}</Typography>
        </ButtonBase>
        {!sinEntidad && !entidadAlPie && entidad}
        {sinEntidad && otras.length > 0 && <Typography variant="caption" color="text.secondary">También: {otras.join(' · ')}</Typography>}
        {/* Pie en UNA fila (Edison 2026-10-06: «se ve feo… espacio en blanco»):
            el lugar a la izquierda, el oficio y la acción del paso a la derecha.
            Antes la acción ocupaba sola su fila y dejaba vacío todo el lado
            izquierdo. En angosto, el lugar pasa a su propia línea. */}
        {(() => {
          const accion = accionPrincipal(p)
          if (!lugar && !p.documento && !accion) return entidadAlPie ? entidad : null
          return (
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', pt: 0.5, mt: 0.25, borderTop: '1px dashed', borderColor: 'divider' }}>
              {lugar ? (
                <Tooltip title={lugar}>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: '1 1 220px', minWidth: 0 }}>
                    <PlaceOutlinedIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lugar}</Box>
                  </Typography>
                </Tooltip>
              ) : entidadAlPie ? <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>{entidad}</Box> : <Box sx={{ flex: 1 }} />}
              <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', ml: 'auto', flexShrink: 0 }}>
                {p.documento && (
                  <Chip size="small" clickable icon={<DescriptionOutlinedIcon />} onClick={() => navegar(`/documentos/${p.documento!.id}`)}
                    label={`${p.documento.codigo ?? 'Oficio sin número'} · ${(ETIQUETA_ESTADO[p.documento.estado] ?? p.documento.estado).toLowerCase()}`}
                    sx={{ height: 22, fontSize: 11.5, ...sxEstado(p.documento.estado), '& .MuiChip-icon': { color: 'inherit' } }} />
                )}
                {accion}
              </Box>
            </Box>
          )
        })()}
      </Box>
    )
  }

  const rejilla = (items: Fila[], sinEntidad?: boolean) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'repeat(2, minmax(0,1fr))' }, gap: 1, alignItems: 'start' }}>
      {items.map((p) => tarjeta(p, sinEntidad))}
    </Box>
  )

  const fila = editando?.fila
  const selector = (etiqueta: string, valor: string, alCambiar: (v: string) => void, opciones: [string, string][], ancho = 140) => (
    <TextField size="small" select label={etiqueta} value={valor} onChange={(e) => alCambiar(e.target.value)}
      sx={{ minWidth: ancho, maxWidth: 240, flex: { xs: '1 1 140px', sm: '0 1 auto' }, bgcolor: 'background.paper' }}>
      <MenuItem value="">Todos</MenuItem>
      {opciones.map(([v, e]) => <MenuItem key={v} value={v}>{e}</MenuItem>)}
    </TextField>
  )

  return (
    <Box>
      {/* Los pasos, con su cuenta (sobre los demás filtros): un toque filtra. */}
      {/* En el celular, tres por fila: cinco no caben sin partir «Oficio en preparación» en tres líneas. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0,1fr))', sm: 'repeat(5, minmax(0,1fr))' }, gap: { xs: 0.75, sm: 1 }, mb: 1.5 }}>
        {ETAPAS.map((e) => {
          const activo = f.etapa === e.clave
          return (
            // 2026-10-06: sin tooltip con la acción del paso; el encabezado del grupo ya da el detalle.
            <ButtonBase key={e.clave} onClick={() => poner({ etapa: activo ? '' : e.clave })}
              // 2026-10-19: sin barra de color arriba; la etapa se señala con un punto junto al título.
              sx={{ display: 'block', textAlign: 'center', py: 0.75, px: 0.25, borderRadius: 2, border: '1px solid', borderColor: activo ? 'primary.main' : 'divider',
                    bgcolor: activo ? PALETA.guindaSuave : 'background.paper' }}>
              <Typography sx={{ fontWeight: 700, fontSize: { xs: 16, sm: 19 } }}>{cuentaEtapa(e.clave)}</Typography>
              <Typography sx={{ fontSize: { xs: 10.5, sm: 12 }, lineHeight: 1.2, color: 'text.secondary', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: e.color, flexShrink: 0 }} />
                {e.titulo}
              </Typography>
            </ButtonBase>
          )
        })}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1, alignItems: 'center' }}>
        <TextField size="small" placeholder="Buscar pedido, entidad, lugar, oficio…" value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1, minWidth: { xs: '100%', sm: 240 }, bgcolor: 'background.paper' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <ToggleButtonGroup size="small" exclusive value={vista} onChange={(_, v) => v && setVista(v)} sx={{ bgcolor: 'background.paper', flexWrap: 'wrap' }}>
          {/* `title` y no Tooltip: un Tooltip abierto en una sección oculta deja el ancla fuera del documento. */}
          {VISTAS.map((v) => (
            <ToggleButton key={v.clave} value={v.clave} title={v.ayuda} sx={{ textTransform: 'none', py: 0.5, px: { xs: 1, sm: 1.25 }, fontSize: 13 }}>{v.etiqueta}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Tooltip title="Descargar los pedidos de la semana (.md)">
          <span>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} disabled={!s.pedidos.length} onClick={() => setExportar(true)}>
              .md
            </Button>
          </span>
        </Tooltip>
        <Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setAnclaNuevo(e.currentTarget)} disabled={!s.actividades.length}>Pedido</Button>
        <ElegirEntrada
          ancla={anclaNuevo}
          alCerrar={() => setAnclaNuevo(null)}
          tipo="registro-representacion"
          etiquetaPrompt="Desde el registro de la jornada (prompt)"
          alManual={() => nuevo()}
          alPrompt={() => setPegar(true)}
        />
        <DialogoPegarSemana abierto={pegar} s={s} alCerrar={() => setPegar(false)} recargar={recargar} />
        <DialogoExportarMd abierto={exportar} alCerrar={() => setExportar(false)} ruta={`/api/semanas/${s.id}/pedidos.md`} titulo={`Descargar pedidos de la ${s.codigo}`} alAvisar={avisar} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1, alignItems: 'center' }}>
        {selector('Prioridad', f.prioridad, (v) => poner({ prioridad: v }), voc.prioridades.map((p) => [p, p]), 120)}
        {selector('Responsable', f.responsable, (v) => poner({ responsable: v }), [[SIN_RESPONSABLE, 'Sin responsable'], ...responsables.map((r) => [r, r] as [string, string])], 150)}
        {selector('Institución', f.institucion, (v) => poner({ institucion: v }), instituciones.map((i) => [i, i]), 150)}
        {selector('Distrito', f.distrito, (v) => poner({ distrito: v }), distritos.map((d) => [d, d]), 130)}
        <Chip label="Sin oficio" variant={f.sinOficio ? 'filled' : 'outlined'} color={f.sinOficio ? 'primary' : 'default'} onClick={() => poner({ sinOficio: !f.sinOficio })} sx={{ bgcolor: f.sinOficio ? undefined : 'background.paper' }} />
        <Chip label={`Vencidos · ${nVencidos}`} variant={f.vencidos ? 'filled' : 'outlined'} color={f.vencidos ? 'primary' : 'default'} onClick={() => poner({ vencidos: !f.vencidos })} sx={{ bgcolor: f.vencidos ? undefined : 'background.paper' }} />
        {hayFiltros && <Button size="small" startIcon={<FilterListOffIcon />} onClick={() => { setF(SIN_FILTROS); setQ('') }}>Quitar filtros</Button>}
      </Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
        {filtrados.length} de {s.pedidos.length} pedidos{nSinResponsable ? ` · ${nSinResponsable} abiertos sin responsable` : ''}
      </Typography>

      {!s.pedidos.length && (
        <Box sx={{ p: 4, textAlign: 'center', border: `1px dashed ${PALETA.bordeFuerte}`, borderRadius: 2, color: 'text.secondary' }}>
          Aún no hay pedidos. Use «+ Pedido».
        </Box>
      )}
      {s.pedidos.length > 0 && !filtrados.length && <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Ningún pedido con estos filtros.</Typography>}

      {vista === 'tabla' ? (
        filtrados.length > 0 && (
          <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
            <Table size="small" stickyHeader sx={{ minWidth: 980, '& td, & th': { fontSize: 12.5, px: 1 } }}>
              <TableHead>
                <TableRow>
                  {['Código', 'Pedido', 'Institución', 'Actividad', 'Distrito', 'Prioridad', 'Paso', 'Oficio', 'Responsable', 'Plazo'].map((t) => <TableCell key={t}>{t}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {[...filtrados].sort((a, b) => ETAPAS.findIndex((e) => e.clave === etapaDe(a)) - ETAPAS.findIndex((e) => e.clave === etapaDe(b)) || ordenar(a, b)).map((p) => {
                  const d = p.datos
                  const a = act[texto(d.actividad)] ?? {}
                  const e = ETAPA[etapaDe(p)]
                  return (
                    <TableRow key={p.codigo} hover onClick={() => abrir(p)} sx={{ cursor: 'pointer' }}>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{p.codigo}</TableCell>
                      <TableCell sx={{ maxWidth: 340 }}><Box sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{texto(d.pedido)}</Box></TableCell>
                      <TableCell>{principal(p)}{lista(d.entidades).length > 1 ? ` +${lista(d.entidades).length - 1}` : ''}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{texto(d.actividad)}{texto(a.fecha) ? ` · ${texto(a.fecha).slice(5)}` : ''}</TableCell>
                      <TableCell>{texto(a.distrito)}</TableCell>
                      <TableCell sx={{ color: COLOR_PRIO[texto(d.prioridad_propuesta)], fontWeight: 600 }}>{texto(d.prioridad_propuesta)}</TableCell>
                      <TableCell><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: e.color, mr: 0.75 }} />{e.corto}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }} onClick={(ev) => ev.stopPropagation()}>
                        {p.documento ? <Box component="a" href={`/documentos/${p.documento.id}`} onClick={(ev: React.MouseEvent) => { ev.preventDefault(); navegar(`/documentos/${p.documento!.id}`) }} sx={{ color: 'primary.main' }}>{p.documento.codigo ?? 'borrador'}</Box> : '—'}
                      </TableCell>
                      <TableCell>{texto(d.responsable)}</TableCell>
                      <TableCell sx={{ color: vencido(p) ? PALETA.error : undefined, whiteSpace: 'nowrap' }}>{texto(d.plazo)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        )
      ) : (
        grupos.map((g) => {
          const plegado = plegados.has(g.clave)
          return (
            <Box key={g.clave} sx={{ mb: 2 }}>
              <Box onClick={() => plegar(g.clave)} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5, mb: 0.75, cursor: 'pointer', borderBottom: `2px solid ${g.color ?? PALETA.borde}`, minWidth: 0 }}>
                {plegado ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, color: g.color ?? PALETA.texto, minWidth: 0 }}>{g.titulo}</Typography>
                <Chip size="small" label={g.items.length} sx={{ height: 20, fontSize: 11.5 }} />
                {g.detalle && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>{g.detalle}</Typography>}
              </Box>
              {!plegado && (g.sub ? g.sub.map((sub) => (
                <Box key={sub.clave} sx={{ mb: 1.25, pl: { xs: 0, sm: 1 } }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: PALETA.textoSecundario, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {vista === 'paso' ? <AccountBalanceOutlinedIcon sx={{ fontSize: 16 }} /> : <PlaceOutlinedIcon sx={{ fontSize: 16 }} />}
                    {sub.titulo} <Typography component="span" variant="caption" color="text.secondary">· {sub.items.length}</Typography>
                  </Typography>
                  {rejilla(sub.items, vista === 'paso')}
                </Box>
              )) : rejilla(g.items, vista === 'institucion'))}
            </Box>
          )
        })
      )}

      <Menu anchorEl={menu?.el} open={Boolean(menu)} onClose={() => setMenu(null)} PaperProps={{ sx: { maxHeight: 460, minWidth: 230 } }}>
        {/* 2026-10-06: sin «Editar…» (pulsar el texto del pedido edita), sin «Abrir oficio» (lo
            hace el chip), «Generar oficio» solo si la tarjeta no lo muestra ya, y sin el estado
            que la tarjeta ofrece como botón en esa etapa (Respondido / Cerrar). */}
        {menu && [
          ...(!menu.p.documento ? [
            ...(etapaDe(menu.p) !== 'por_derivar' ? [
              <MenuItem key="d" onClick={() => derivar(menu.p.codigo)}><SendOutlinedIcon fontSize="small" sx={{ mr: 1 }} />Generar oficio</MenuItem>,
            ] : []),
            <MenuItem key="v" onClick={() => vincular(menu.p.codigo)}><LinkIcon fontSize="small" sx={{ mr: 1 }} />Enlazar oficio existente</MenuItem>,
            <Divider key="s1" />,
          ] : []),
          <ListSubheader key="h1" sx={{ lineHeight: '28px' }}>Estado</ListSubheader>,
          ...voc.estados_pedido.filter((e) => !(
            (e === 'respondido' && etapaDe(menu.p) === 'esperando') || (e === 'cerrado' && etapaDe(menu.p) === 'respondido')
          )).map((e) => (
            <MenuItem key={`e-${e}`} selected={menu.p.datos.estado === e} onClick={() => cambiar(menu.p, { estado: e }, `${menu.p.codigo}: ${e}.`)}>{e}</MenuItem>
          )),
          <Divider key="s2" />,
          <ListSubheader key="h2" sx={{ lineHeight: '28px' }}>Asignar a</ListSubheader>,
          ...responsables.map((r) => (
            <MenuItem key={`r-${r}`} selected={menu.p.datos.responsable === r} onClick={() => cambiar(menu.p, { responsable: r }, `${menu.p.codigo} asignado a ${r}.`)}>{r}</MenuItem>
          )),
          <MenuItem key="r-sin" onClick={() => cambiar(menu.p, { responsable: null }, `${menu.p.codigo} sin responsable.`)}>Sin responsable</MenuItem>,
        ]}
      </Menu>

      <DialogoFila
        abierto={editando !== null}
        titulo={editando?.codigo ? `Pedido ${editando.codigo}` : 'Nuevo pedido'}
        campos={campos}
        inicial={editando?.datos ?? VACIO}
        alCerrar={() => setEditando(null)}
        alGuardar={guardar}
        pie={editando?.codigo ? (
          <>
            {fila?.documento ? (
              <>
                <Button startIcon={<DescriptionOutlinedIcon />} onClick={() => navegar(`/documentos/${fila.documento!.id}`)}>
                  Abrir {fila.documento.codigo ?? 'oficio'}
                </Button>
                <Button color="inherit" startIcon={<LinkOffIcon />} onClick={() => desvincular(editando.codigo!)}>Quitar enlace</Button>
              </>
            ) : (
              <>
                <Button variant="outlined" startIcon={<SendOutlinedIcon />} onClick={() => derivar(editando.codigo!)}>Generar oficio</Button>
                <Button startIcon={<LinkIcon />} onClick={() => vincular(editando.codigo!)}>Oficio existente</Button>
                <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => quitar(editando.codigo!)}>Quitar</Button>
              </>
            )}
          </>
        ) : null}
      />
    </Box>
  )
}

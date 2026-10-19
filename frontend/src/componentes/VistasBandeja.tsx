/**
 * Otras formas de ver la BANDEJA (Edison 2026-10-05: «está bien en lista,
 * pero también otras formas de visualizar u organizar»). Reciben la lista YA
 * filtrada de la bandeja (búsqueda, etapa, tipo, «A mi cargo»), así que todo
 * filtro vale en cualquier vista; pulsar un documento lo abre.
 *
 *   - Por etapa: un tablero con una columna por estado del documento.
 *   - Seguimiento: qué le falta a cada uno en su trámite (generar, enviar,
 *     cargo de recepción, registro en el STD) y cuáles están completos; cada
 *     tarjeta dice si su EXPEDIENTE está al día, desactualizado o sin armar
 *     (GET /api/expedientes/vigencia, en lote: servicios/vigencia.py).
 *   - Por institución: a quién se escribe y en qué va cada cosa.
 *   - Cronología: por mes y semana de su fecha oficial.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { COLOR_ESTADO, ESTADOS, ETIQUETA_ESTADO } from '../estados'
import { PALETA } from '../paleta'
import type { Tramite } from './PanelSeguimiento'
import { api } from '../api'
import { abreVisorRapido } from '../visorRapido'
import { pulsacionLarga, SX_SIN_SELECCION } from '../pulsacionLarga'

export type VistaBandeja = 'lista' | 'etapas' | 'seguimiento' | 'instituciones' | 'cronologia'

/** Lo que estas vistas usan de cada fila de la bandeja. */
export interface DocVista {
  id: number
  numero_completo: string
  tipo_nombre: string
  estado: string
  asunto: string
  destinatario: string
  destinatarios: string[]
  instituciones: string[]
  fecha: string | null
  actualizado_en: string
  firmado_id?: number | null
  tramite?: Tramite | null
  responsable?: string
  comentarios_pendientes?: number
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Fecha oficial (ISO) o, si no la hay en ISO, la de la última modificación. */
const fechaDe = (d: DocVista): { iso: string; aproximada: boolean } =>
  d.fecha && /^\d{4}-\d{2}-\d{2}/.test(d.fecha)
    ? { iso: d.fecha.slice(0, 10), aproximada: false }
    : { iso: d.actualizado_en.slice(0, 10), aproximada: true }

const colorEstado = (e: string) => COLOR_ESTADO[e] ?? PALETA.apagado

/** El expediente de un documento según el cálculo en lote del servidor. */
export interface EstadoExpediente {
  vigencia: 'vigente' | 'desactualizado' | 'sin_armar'
  motivos: string[]
  con_firma: boolean
}

const EXPEDIENTE: Record<EstadoExpediente['vigencia'], { texto: string; color: string; ayuda: string }> = {
  vigente: { texto: 'Exp. al día', color: PALETA.exito, ayuda: 'El expediente corresponde a lo que hay ahora' },
  desactualizado: { texto: 'Exp. desactualizado', color: PALETA.aviso, ayuda: 'Hay que volver a armar el expediente' },
  sin_armar: { texto: 'Sin expediente', color: PALETA.textoTenue, ayuda: 'Aún no se armó el expediente (documento + adjuntos en un PDF)' },
}

/** Pide el estado del expediente de los documentos en pantalla, en tandas de 400. */
export function useExpedientes(ids: number[], activo: boolean): Record<string, EstadoExpediente> {
  const [estados, setEstados] = useState<Record<string, EstadoExpediente>>({})
  const clave = activo ? ids.join(',') : ''
  useEffect(() => {
    if (!clave) return
    let vigente = true
    const lista = clave.split(',')
    const tandas: string[][] = []
    for (let i = 0; i < lista.length; i += 400) tandas.push(lista.slice(i, i + 400))
    Promise.all(tandas.map((t) => api<Record<string, EstadoExpediente>>(`/api/expedientes/vigencia?ids=${t.join(',')}`)))
      .then((r) => vigente && setEstados(Object.assign({}, ...r)))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [clave])
  return estados
}

/** El indicador del expediente (punto + texto corto), con sus motivos al pasar el cursor. */
export function IndicadorExpediente({ estado }: { estado?: EstadoExpediente }) {
  if (!estado) return null
  const e = EXPEDIENTE[estado.vigencia]
  const titulo = estado.motivos.length ? `${e.ayuda}: ${estado.motivos.join('; ')}` : e.ayuda + (estado.con_firma ? ' (con firma)' : '')
  return (
    <Tooltip title={titulo}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 11, color: e.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
        <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: e.color, flexShrink: 0 }} />
        {e.texto}
      </Box>
    </Tooltip>
  )
}

// ---------------------------------------------------------------- piezas

/** Tarjeta compacta de un documento, común a las vistas. Tocarla abre (el visor rápido si el documento
 * ya está firmado o enviado; si no, el editor); el ícono ↗ y la pulsación larga van siempre al
 * documento completo (`alAbrirCompleto`). */
function Ficha({ d, alAbrir, alAbrirCompleto, sigla, extra }: { d: DocVista; alAbrir: (id: number) => void; alAbrirCompleto?: (id: number) => void; sigla: (s: string) => string; extra?: ReactNode }) {
  const destino = [
    d.destinatarios.length > 1 ? `${d.destinatarios[0]} +${d.destinatarios.length - 1}` : d.destinatario,
    d.instituciones?.length ? sigla(d.instituciones[0]) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const f = fechaDe(d)
  const t = d.tramite
  const completo = alAbrirCompleto && abreVisorRapido(d.estado) ? alAbrirCompleto : undefined
  return (
    <ButtonBase
      onClick={() => alAbrir(d.id)}
      {...pulsacionLarga(completo && (() => completo(d.id)))}
      sx={{
        ...SX_SIN_SELECCION,
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', textAlign: 'left', gap: 0.5,
        p: 1.25, pl: 1.5, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
        position: 'relative', overflow: 'hidden', flexShrink: 0, transition: 'border-color .15s, box-shadow .15s',
        '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: colorEstado(d.estado) },
        '&:hover, &:focus-visible': { borderColor: PALETA.bordeFuerte, boxShadow: PALETA.sombra },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'primary.main', flex: 1, minWidth: 0 }} noWrap>
          {d.numero_completo}
        </Typography>
        <Tooltip title={f.aproximada ? 'Fecha de la última modificación (el documento no tiene fecha en formato de fecha)' : 'Fecha del documento'}>
          <Typography sx={{ fontSize: 11.5, color: 'text.secondary', fontStyle: f.aproximada ? 'italic' : 'normal' }}>
            {f.iso.slice(8, 10)}/{f.iso.slice(5, 7)}
          </Typography>
        </Tooltip>
        {completo && (
          <Tooltip title="Abrir el documento completo (o mantenga pulsada la ficha)">
            <Box
              component="span"
              role="link"
              aria-label={`Abrir el documento ${d.numero_completo}`}
              onClick={(e) => {
                e.stopPropagation()
                completo(d.id)
              }}
              sx={{ display: 'inline-flex', p: 0.25, m: -0.25, borderRadius: 1, color: PALETA.textoTenue, '&:hover': { color: PALETA.guinda, bgcolor: PALETA.guindaSuave } }}
            >
              <OpenInNewIcon sx={{ fontSize: 15 }} />
            </Box>
          </Tooltip>
        )}
      </Box>
      <Typography sx={{ fontSize: 13, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {d.asunto || '(sin asunto)'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 18 }}>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', flex: 1, minWidth: 0 }} noWrap>{destino}</Typography>
        {t && t.total > 0 && (
          <Tooltip title={`Trámite: ${t.hechos} de ${t.total} pasos${t.siguiente ? ` · sigue: ${t.siguiente}` : ''}`}>
            <Box sx={{ display: 'flex', gap: '2px' }}>
              {Array.from({ length: t.total }, (_, i) => (
                <Box key={i} sx={{ width: 8, height: 4, borderRadius: 1, bgcolor: i < t.hechos ? PALETA.exito : 'divider' }} />
              ))}
            </Box>
          </Tooltip>
        )}
        {extra}
      </Box>
    </ButtonBase>
  )
}

/** Columna de tablero con su punto de color, su conteo y «ver más». */
function Columna({ titulo, color, ayuda, docs, render }: { titulo: string; color: string; ayuda?: string; docs: DocVista[]; render: (d: DocVista) => ReactNode }) {
  const [todos, setTodos] = useState(false)
  const mostrados = todos ? docs : docs.slice(0, 25)
  return (
    <Box sx={{ flex: '0 0 290px', maxWidth: '86vw', scrollSnapAlign: 'start', bgcolor: PALETA.superficieTenue, border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.1, display: 'flex', flexDirection: 'column', maxHeight: { md: 'calc(100vh - 260px)' } }}>
      <Tooltip title={ayuda ?? ''} placement="top-start">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, pb: 1 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{titulo}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>{docs.length}</Typography>
        </Box>
      </Tooltip>
      {/* gridAutoRows max-content: cada tarjeta recorta su contenido (overflow
          hidden), así que su alto mínimo «automático» es 0 y, en una columna de
          alto máximo, la grilla las aplastaba unas sobre otras (2026-10-05). */}
      <Box sx={{ display: 'grid', gap: 0.75, gridAutoRows: 'max-content', alignContent: 'start', overflowY: { md: 'auto' }, minHeight: 0, pr: { md: 0.25 } }}>
        {mostrados.map(render)}
        {docs.length > mostrados.length && (
          <Button size="small" onClick={() => setTodos(true)} sx={{ textTransform: 'none' }}>
            Ver {docs.length - mostrados.length} más
          </Button>
        )}
        {docs.length === 0 && <Typography sx={{ fontSize: 12, color: 'text.disabled', px: 0.5, pb: 0.5 }}>Nada aquí.</Typography>}
      </Box>
    </Box>
  )
}

function Tablero({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.25, overflowX: 'auto', pb: 1, alignItems: 'flex-start', scrollSnapType: 'x mandatory' }}>
      {children}
    </Box>
  )
}

// ---------------------------------------------------------------- vistas

const HITOS_ORDEN: { clave: 'generado' | 'enviado' | 'constancia' | 'std'; titulo: string; ayuda: string; color: string }[] = [
  { clave: 'generado', titulo: 'Por generar', ayuda: 'Aún sin número oficial', color: PALETA.borrador },
  { clave: 'enviado', titulo: 'Por enviar', ayuda: 'Generados que todavía no salen de la entidad', color: PALETA.aprobado },
  { clave: 'constancia', titulo: 'Esperan cargo', ayuda: 'Enviados sin la constancia de recepción de la entidad', color: PALETA.aviso },
  { clave: 'std', titulo: 'Por registrar en el STD', ayuda: 'Falta su registro en el Sistema de Trámite Documentario', color: PALETA.info },
]

/** El primer hito que le falta a un documento (o null si está completo). */
function pendiente(d: DocVista): (typeof HITOS_ORDEN)[number]['clave'] | null {
  const t = d.tramite
  if (!t) return 'generado'
  const aplican = t.hitos_aplicables?.length ? t.hitos_aplicables : HITOS_ORDEN.map((h) => h.clave)
  for (const h of HITOS_ORDEN) if (aplican.includes(h.clave) && !t[h.clave]) return h.clave
  return null
}

export default function VistasBandeja({
  vista,
  documentos,
  alAbrir,
  alAbrirCompleto,
  sigla,
}: {
  vista: Exclude<VistaBandeja, 'lista'>
  documentos: DocVista[]
  /** Tocar una ficha (el visor rápido para lo firmado o enviado; el editor para el resto). */
  alAbrir: (id: number) => void
  /** El documento completo, desde el ícono ↗ o una pulsación larga. */
  alAbrirCompleto?: (id: number) => void
  sigla: (s: string) => string
}) {
  const ficha = (d: DocVista, extra?: ReactNode) => <Ficha key={d.id} d={d} alAbrir={alAbrir} alAbrirCompleto={alAbrirCompleto} sigla={sigla} extra={extra} />
  // Ganchos antes de cualquier return: el estado del expediente solo se pide en Seguimiento.
  const ids = useMemo(() => documentos.filter((d) => d.estado !== 'ARCHIVADO').map((d) => d.id), [documentos])
  const expedientes = useExpedientes(ids, vista === 'seguimiento')

  if (documentos.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>Ningún documento coincide con lo elegido.</Typography>
  }

  if (vista === 'etapas') {
    const presentes = ESTADOS.filter((e) => documentos.some((d) => d.estado === e))
    return (
      <Tablero>
        {presentes.map((e) => (
          <Columna key={e} titulo={ETIQUETA_ESTADO[e] ?? e} color={colorEstado(e)} docs={documentos.filter((d) => d.estado === e)} render={(d) => ficha(d)} />
        ))}
      </Tablero>
    )
  }

  if (vista === 'seguimiento') {
    const grupos = new Map<string, DocVista[]>()
    documentos.forEach((d) => {
      const p = d.estado === 'ARCHIVADO' ? 'archivado' : pendiente(d) ?? 'completo'
      grupos.set(p, [...(grupos.get(p) ?? []), d])
    })
    return (
      <Tablero>
        {HITOS_ORDEN.map((h) => (
          <Columna key={h.clave} titulo={h.titulo} ayuda={h.ayuda} color={h.color} docs={grupos.get(h.clave) ?? []} render={(d) => ficha(d, <IndicadorExpediente estado={expedientes[d.id]} />)} />
        ))}
        <Columna titulo="Completos" ayuda="Recorrieron todo su trámite" color={PALETA.exito} docs={grupos.get('completo') ?? []} render={(d) => ficha(d, <IndicadorExpediente estado={expedientes[d.id]} />)} />
        {grupos.has('archivado') && <Columna titulo="Archivados" color={PALETA.archivado} docs={grupos.get('archivado')!} render={(d) => ficha(d)} />}
      </Tablero>
    )
  }

  if (vista === 'instituciones') return <PorInstitucion documentos={documentos} ficha={ficha} sigla={sigla} />
  return <Cronologia documentos={documentos} ficha={ficha} />
}

/** Grupos por institución destinataria (o, sin institución, por destinatario),
 * del que más documentos tiene al que menos, con la mezcla de estados. */
function PorInstitucion({ documentos, ficha, sigla }: { documentos: DocVista[]; ficha: (d: DocVista) => ReactNode; sigla: (s: string) => string }) {
  const grupos = useMemo(() => {
    const m = new Map<string, { nombre: string; docs: DocVista[] }>()
    documentos.forEach((d) => {
      // Un oficio múltiple aparece en cada institución a la que va.
      const claves = d.instituciones?.length ? d.instituciones : [d.destinatario || 'Sin destinatario']
      claves.forEach((c) => {
        const k = sigla(c) || c
        const g = m.get(k) ?? { nombre: c, docs: [] }
        g.docs.push(d)
        m.set(k, g)
      })
    })
    return [...m.entries()].sort((a, b) => b[1].docs.length - a[1].docs.length)
  }, [documentos, sigla])
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(grupos.slice(0, 2).map(([k]) => k)))
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {grupos.map(([k, g]) => {
        const abierto = abiertos.has(k)
        const porEstado = ESTADOS.map((e) => [e, g.docs.filter((d) => d.estado === e).length] as const).filter(([, n]) => n)
        return (
          <Box key={k} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
            <ButtonBase
              onClick={() => setAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}
              sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 2, py: 1.25, textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 650 }} noWrap>{k}</Typography>
                {g.nombre !== k && <Typography sx={{ fontSize: 12, color: 'text.secondary' }} noWrap>{g.nombre}</Typography>}
              </Box>
              {/* Mezcla de estados en una barra fina. */}
              <Tooltip title={porEstado.map(([e, n]) => `${ETIQUETA_ESTADO[e] ?? e}: ${n}`).join(' · ')}>
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, width: 140, height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: 'divider' }}>
                  {porEstado.map(([e, n]) => <Box key={e} sx={{ flex: n, bgcolor: colorEstado(e) }} />)}
                </Box>
              </Tooltip>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', minWidth: 28, textAlign: 'right' }}>{g.docs.length}</Typography>
              <ExpandMoreIcon sx={{ color: 'text.secondary', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </ButtonBase>
            {abierto && (
              <Box sx={{ display: 'grid', gap: 0.75, p: 1.25, pt: 0, gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fill, minmax(300px, 1fr))' } }}>
                {g.docs.map((d) => ficha(d))}
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

/** Línea de tiempo: meses con sus semanas, lo más reciente arriba. */
function Cronologia({ documentos, ficha }: { documentos: DocVista[]; ficha: (d: DocVista) => ReactNode }) {
  const meses = useMemo(() => {
    const m = new Map<string, Map<string, DocVista[]>>()
    documentos.forEach((d) => {
      const iso = fechaDe(d).iso
      const mes = iso.slice(0, 7)
      // Semana que empieza el lunes.
      const f = new Date(`${iso}T12:00:00`)
      const lunes = new Date(f)
      lunes.setDate(f.getDate() - ((f.getDay() + 6) % 7))
      const sem = lunes.toISOString().slice(0, 10)
      const sems = m.get(mes) ?? new Map<string, DocVista[]>()
      sems.set(sem, [...(sems.get(sem) ?? []), d])
      m.set(mes, sems)
    })
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [documentos])
  return (
    <Box>
      {meses.map(([mes, sems]) => {
        const total = [...sems.values()].reduce((n, l) => n + l.length, 0)
        return (
          <Box key={mes} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.25, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.default', py: 0.5 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize' }}>{MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{total} documento(s)</Typography>
            </Box>
            {[...sems.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([sem, docs]) => {
              const fin = new Date(`${sem}T12:00:00`)
              fin.setDate(fin.getDate() + 6)
              return (
                <Box key={sem} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '120px 1fr' }, gap: { xs: 0.75, sm: 2 }, mb: 1.5 }}>
                  {/* Rótulo de la semana con su línea de tiempo. */}
                  <Box sx={{ position: 'relative', pl: { sm: 2 }, borderLeft: { sm: '2px solid' }, borderColor: { sm: 'divider' } }}>
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, position: 'absolute', left: -6, top: 4, width: 10, height: 10, borderRadius: '50%', bgcolor: PALETA.guinda }} />
                    <Typography sx={{ fontSize: 12.5, fontWeight: 650 }}>Semana del {sem.slice(8, 10)}/{sem.slice(5, 7)}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>al {String(fin.getDate()).padStart(2, '0')}/{String(fin.getMonth() + 1).padStart(2, '0')} · {docs.length}</Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fill, minmax(280px, 1fr))' } }}>
                    {docs.sort((a, b) => fechaDe(b).iso.localeCompare(fechaDe(a).iso)).map((d) => ficha(d))}
                  </Box>
                </Box>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}

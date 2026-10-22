/**
 * OpenProject dentro de Qillqa (2026-10-02).
 *
 *  · `AgendaYTareasOP`: en Inicio, la agenda de la entidad (reuniones, actividades,
 *    hitos y compromisos de los próximos 14 días) y lo que OpenProject le asigna a la
 *    persona. Las tareas de Qillqa que se reflejan en OpenProject NO se repiten aquí:
 *    ya salen en «Lo que le toca».
 *  · `BotonOpenProject`: «Ver en OpenProject» de un documento o un proyecto de ley,
 *    solo si ya tiene su reflejo.
 *
 * Con la integración apagada no se muestra nada.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { api } from '../api'
import { configOP } from '../openproject'
import Tarjeta from './admin/Tarjeta'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'

interface Paquete {
  id: number; asunto: string; proyecto: string; tipo: string; estado: string; responsable: string
  inicio: string; fin: string; url: string; mio?: boolean
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const dia = (iso: string) => {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return `${DIAS[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function Fila({ p, icono, i }: { p: Paquete; icono: React.ReactNode; i: number }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const fecha = p.inicio && p.fin && p.inicio !== p.fin ? `${dia(p.inicio)} → ${dia(p.fin)}` : dia(p.inicio || p.fin)
  return (
    <ButtonBase
      onClick={() => p.url && window.open(p.url, '_blank', 'noopener')}
      sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, px: 2, py: 1.1, borderTop: i ? '1px solid' : 'none', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
    >
      {icono}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: p.mio ? 600 : 400 }}>{p.asunto}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {p.tipo} · {p.proyecto}{p.responsable ? ` · ${p.responsable}` : ''} · {p.estado}
        </Typography>
      </Box>
      {fecha && <Chip size="small" variant="outlined" label={fecha} color={(p.fin || p.inicio) < hoy ? 'error' : 'default'} sx={{ height: 22, fontSize: 12 }} />}
    </ButtonBase>
  )
}

function Lista({ titulo, filas, icono, vacio }: { titulo: string; filas: Paquete[]; icono: React.ReactNode; vacio: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{titulo}{filas.length ? ` (${filas.length})` : ''}</Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
        {filas.length === 0
          ? <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>{vacio}</Typography>
          : filas.slice(0, 8).map((p, i) => <Fila key={p.id} p={p} icono={icono} i={i} />)}
      </Box>
    </Box>
  )
}

export function AgendaYTareasOP() {
  const [agenda, setAgenda] = useState<Paquete[] | null>(null)
  const [mias, setMias] = useState<{ vinculado: boolean; tareas: Paquete[] } | null>(null)
  const [url, setUrl] = useState('')
  useEffect(() => {
    configOP().then((c) => {
      if (!c.activa) return
      setUrl(c.url)
      api<{ eventos: Paquete[] }>('/api/openproject/agenda?dias=14').then((r) => setAgenda(r.eventos)).catch(() => setAgenda([]))
      api<{ vinculado: boolean; tareas: Paquete[] }>('/api/openproject/mis-tareas').then(setMias).catch(() => setMias({ vinculado: true, tareas: [] }))
    })
  }, [])
  if (agenda === null && mias === null) return null
  // La agenda y las tareas viven en Qillqa (Tareas y Agenda, 2026-10-06); OpenProject es un
  // espejo opcional: su panel solo aparece cuando trae algo, para no repetir la agenda de arriba.
  if (!agenda?.length && !mias?.tareas.length) return null
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Lista titulo="En OpenProject: próximos 14 días" filas={agenda ?? []} icono={<EventOutlinedIcon sx={{ color: 'primary.main', fontSize: 20 }} />}
          vacio="Sin reuniones, actividades ni hitos programados en OpenProject." />
        <Lista titulo="Asignado en OpenProject" filas={mias?.tareas ?? []} icono={<TaskAltOutlinedIcon sx={{ color: 'primary.main', fontSize: 20 }} />}
          vacio={mias && !mias.vinculado
            ? 'Sin cuenta en OpenProject: pídala al administrador.'
            : 'Nada pendiente asignado en OpenProject.'} />
      </Box>
      {url && (
        <Button size="small" endIcon={<OpenInNewIcon />} sx={{ mt: 0.75 }} onClick={() => window.open(`${url}/my/page`, '_blank', 'noopener')}>
          Abrir OpenProject (calendario, Gantt y tableros)
        </Button>
      )}
    </Box>
  )
}

/** Enlace a OpenProject de `qillqa:pl:3`…; vacío si está apagada o aún no se refleja.
 *  Lo usan el botón y el menú ⋮ de la cabecera del proyecto en el celular. */
export function useEnlaceOpenProject(clave: string) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let vivo = true
    configOP().then((c) => {
      if (!c.activa) return
      api<{ url: string }>(`/api/openproject/enlace?clave=${encodeURIComponent(clave)}`).then((r) => vivo && setUrl(r.url)).catch(() => {})
    })
    return () => { vivo = false }
  }, [clave])
  return url
}

/** «Ver en OpenProject» de `qillqa:doc:12`, `qillqa:pl:3`… si ya está reflejado. */
export function BotonOpenProject({ clave, compacto = false }: { clave: string; compacto?: boolean }) {
  const url = useEnlaceOpenProject(clave)
  if (!url) return null
  return (
    <Tooltip title="Su reflejo en OpenProject: ahí se planifica (calendario, Gantt, tableros) y se comenta; el estado, el responsable y las fechas se actualizan solos desde Qillqa">
      <Button size="small" startIcon={<OpenInNewIcon />} onClick={() => window.open(url, '_blank', 'noopener')} sx={compacto ? { minWidth: 0 } : undefined}>
        {compacto ? 'OpenProject' : 'Ver en OpenProject'}
      </Button>
    </Tooltip>
  )
}

interface EstadoOP {
  activa: boolean; url: string; version: string; conexion: string
  ultima: { en: string | null; resumen: Record<string, number | boolean | string>; error: string } | null
  enlaces: Record<string, { total: number; reflejados: number; con_error: number }>
  errores: { clave: string; error: string; url: string }[]
  usuarios: { id: number; nombre: string; usuario: string; email: string; op: string }[]
  faltan_en_op?: string[]
}

const QUE: Record<string, string> = {
  'qillqa:doc': 'Documentos', 'qillqa:pl': 'Proyectos de ley', 'qillqa:pl-fase': 'Fases de PL', 'qillqa:pl-tarea': 'Tareas de PL',
}

/** Panel del administrador: si está encendida y responde, qué se refleja, qué falló y quién
 *  del equipo tiene cuenta en OpenProject (se vinculan por correo o nombre de usuario). */
export function AdminOpenProject({ alAvisar }: { alAvisar: (tipo: 'success' | 'error', texto: string) => void }) {
  const [e, setE] = useState<EstadoOP | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const cargar = () => api<EstadoOP>('/api/openproject/estado').then(setE).catch(() => setE(null))
  useEffect(() => { void cargar() }, [])
  const sincronizar = async () => {
    setOcupado(true)
    try {
      const r = await api<{ escritos: number; pendientes: number; errores: number; devueltos: number; avisos: number; error?: string }>('/api/openproject/sincronizar', { method: 'POST' })
      if (r.error) alAvisar('error', `OpenProject: ${r.error}`)
      else alAvisar('success', `Sincronizado: ${r.escritos} escrito(s), ${r.devueltos} cambio(s) traído(s) de OpenProject, ${r.avisos} aviso(s)${r.pendientes ? `; quedan ${r.pendientes} para la próxima vuelta` : ''}${r.errores ? `; ${r.errores} con error` : ''}.`)
      await cargar()
    } catch (x) {
      alAvisar('error', x instanceof Error ? x.message : 'No se pudo sincronizar.')
    } finally {
      setOcupado(false)
    }
  }
  if (!e) return null
  const sinCuenta = e.usuarios.filter((u) => !u.op)
  return (
    <Tarjeta
      icono={<ViewKanbanOutlinedIcon />}
      titulo="OpenProject"
      texto="Espejo opcional de tareas y proyectos; Qillqa es la fuente."
      accion={<>
        {e.url && <Button size="small" endIcon={<OpenInNewIcon />} onClick={() => window.open(e.url, '_blank', 'noopener')}>Abrir</Button>}
        <Button size="small" variant="contained" disabled={!e.activa || ocupado} onClick={() => void sincronizar()}>{ocupado ? 'Sincronizando…' : 'Sincronizar ahora'}</Button>
      </>}
    >
      <Box>
        {!e.activa ? (
          <Typography variant="body2">
            <b>Apagada.</b> Para encenderla, en el <code>.env</code> de Qillqa: <code>OPENPROJECT_URL</code> (p. ej. http://localhost:8080) y
            <code> OPENPROJECT_TOKEN</code> (OpenProject → Mi cuenta → Tokens de acceso → API, de una cuenta administradora); y reiniciar la API.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <b>{e.conexion === 'ok' ? 'Conectada' : 'Sin conexión'}</b>
              {e.version ? ` · OpenProject ${e.version}` : ''}
              {e.conexion && e.conexion !== 'ok' ? ` · ${e.conexion}` : ''}
              {e.ultima?.en ? ` · última vuelta ${new Date(e.ultima.en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}` : ''}
              {e.ultima?.error ? ` · ${e.ultima.error}` : ''}
            </Typography>
            {(e.faltan_en_op ?? []).length > 0 && (
              <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                Faltan en OpenProject los proyectos {(e.faltan_en_op ?? []).map((x) => `«${x}»`).join(', ')}: siémbrelos desde <code>qillqa/openproject</code> (<code>./sembrar.sh --aplicar seeds/20_proyectos.rb</code>).
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              {Object.entries(e.enlaces).map(([k, v]) => (
                <Chip key={k} size="small" variant="outlined" color={v.con_error ? 'warning' : 'default'}
                  label={`${QUE[k] ?? k}: ${v.reflejados}/${v.total}${v.con_error ? ` · ${v.con_error} con error` : ''}`} />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Personas de Qillqa y su cuenta de OpenProject (se vinculan por correo o por nombre de usuario igual):
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: sinCuenta.length ? 0.5 : 1.5 }}>
              {e.usuarios.map((u) => (
                <Tooltip key={u.id} title={u.op ? `En OpenProject: ${u.op}` : `Sin cuenta en OpenProject con el correo ${u.email || '(sin correo)'} ni el usuario «${u.usuario}»`}>
                  <Chip size="small" label={u.nombre} color={u.op ? 'success' : 'default'} variant={u.op ? 'filled' : 'outlined'} />
                </Tooltip>
              ))}
            </Box>
            {sinCuenta.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                {sinCuenta.length} sin cuenta: no reciben en OpenProject lo que se les encarga en Qillqa. Se crean en <code>qillqa/openproject</code> con el mismo correo (perfil <code>usuarios</code> y <code>seeds/70_usuarios.rb</code>).
              </Typography>
            )}
            {e.errores.length > 0 && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>Lo que no se pudo reflejar</Typography>
                {e.errores.map((x) => (
                  <Typography key={x.clave} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {x.clave}: {x.error}
                  </Typography>
                ))}
              </>
            )}
          </>
        )}
      </Box>
    </Tarjeta>
  )
}

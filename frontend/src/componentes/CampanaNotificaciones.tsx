/**
 * CAMPANA DE AVISOS (Edison 2026-09-05): «al subsanar, avisar a quien observó;
 * quien observó revisa y da conformidad». Los avisos los crea el servidor
 * (servicios/notificaciones.py) en el circuito observación → subsanación →
 * conformidad; aquí solo se muestran y se marcan leídos.
 *
 * Sondea cada 30 s y al volver el foco a la pestaña: sin websockets, es lo
 * que hace que «no haga falta refrescar la página».
 *
 * Asignación → aviso → abrir → al trabajo (2026-10-01): un aviso NUEVO suena
 * (la campanilla del sistema), se anuncia en pantalla con «Abrir» y, con la
 * pestaña oculta, en el escritorio. Abrirlo lleva al lugar exacto: la parte,
 * la tarea o la fase (`destino`, que pone el servidor), no solo al proyecto.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import { useNavigate } from 'react-router'
import { abrirPaquete } from '../openproject'
import { api } from '../api'
import { publicarCuenta, registrarApertura } from '../actividad'
import { campanilla, notificarEscritorio, pedirPermisoEscritorio } from '../avisoLlegadas'
import { rutaDestinoChat } from '@qillqa/rimay/publico'
import { PALETA } from '../paleta'
import { agruparAvisos, horaBreve, type GrupoAvisos } from '../avisos'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined'

interface Aviso {
  id: number
  tipo: string
  texto: string
  leida: boolean
  documento_id: number | null
  proyecto_id?: number | null
  /** Lugar del trabajo en el proyecto: parte:<clave>, tarea:<id>, fase:<id>… */
  destino?: string
  documento: string
  creado_en: string | null
}

export const EVENTO_AVISOS = 'qillqa:avisos'
// El último aviso ya anunciado (por navegador): cambiar de página no repica.
const CLAVE_ULTIMO = 'qillqa_ultimo_aviso'
const leerUltimo = () => {
  try {
    return Number(localStorage.getItem(CLAVE_ULTIMO) ?? '') || 0
  } catch {
    return 0
  }
}

/** Ruta del trabajo que señala un aviso. */
export function rutaAviso(a: { documento_id: number | null; proyecto_id?: number | null; destino?: string }): string | null {
  if (a.destino?.startsWith('op:')) return 'openproject'
  // Bandeja de entrada (2026-10-06): el aviso abre la ficha del documento recibido.
  if (a.destino?.startsWith('entrada:')) return `/recibidos?ver=${a.destino.slice(8)}`
  if (a.documento_id) return `/documentos/${a.documento_id}`
  if (a.proyecto_id) return `/proyectos/${a.proyecto_id}${a.destino ? `?ir=${encodeURIComponent(a.destino)}` : ''}`
  // Tareas y Agenda (2026-10-06): avisos de tareas y eventos sin documento ni proyecto.
  if (a.destino?.startsWith('tarea:')) return `/tareas?abrir=${a.destino.slice(6)}`
  if (a.destino?.startsWith('evento:')) return `/agenda?abrir=${a.destino.slice(7)}`
  // Chat (2026-10-12): una mención o un directo abren el canal en ese mensaje.
  if (a.destino?.startsWith('chat:')) return rutaDestinoChat(a.destino)
  return null
}

/** El icono según de qué es el aviso. */
function iconoDe(a: Aviso) {
  if (a.tipo === 'chat' || a.tipo === 'mencion') return ChatBubbleOutlineIcon
  if (a.destino?.startsWith('evento:') || a.tipo === 'recordatorio' || a.texto.startsWith('Recordatorio:')) return EventOutlinedIcon
  if (a.destino?.startsWith('tarea:')) return AssignmentTurnedInOutlinedIcon
  return DescriptionOutlinedIcon
}

export default function CampanaNotificaciones() {
  const navegar = useNavigate()
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [pendientes, setPendientes] = useState(0)
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const [nuevo, setNuevo] = useState<Aviso | null>(null)
  // El botón único del celular (src/actividad.ts): la cuenta y cómo abrir la lista.
  useEffect(() => { publicarCuenta('avisos', pendientes) }, [pendientes])
  useEffect(() => { registrarApertura('avisos', (a) => setAncla(a)); return () => registrarApertura('avisos', null) }, [])
  const ultimo = useRef<number | null>(null)

  const cargar = useCallback(() => {
    api<{ pendientes: number; avisos: Aviso[] }>('/api/notificaciones')
      .then((r) => {
        setAvisos(r.avisos)
        setPendientes(r.pendientes)
        const sinLeer = r.avisos.filter((a) => !a.leida)
        const mayor = Math.max(0, ...r.avisos.map((a) => a.id))
        const visto = ultimo.current ?? leerUltimo()
        // La primera vez en este navegador no se repica lo viejo.
        if (visto === 0 && ultimo.current === null) {
          ultimo.current = mayor
        } else {
          const recientes = sinLeer.filter((a) => a.id > visto)
          if (recientes.length) {
            const a = recientes[0]
            campanilla()
            setNuevo(a)
            notificarEscritorio(a.texto)
          }
          ultimo.current = Math.max(visto, mayor)
        }
        try {
          localStorage.setItem(CLAVE_ULTIMO, String(ultimo.current))
        } catch {
          /* sin almacenamiento: solo se pierde el «ya anunciado» */
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    cargar()
    pedirPermisoEscritorio()
    const t = setInterval(cargar, 30000)
    window.addEventListener('focus', cargar)
    window.addEventListener(EVENTO_AVISOS, cargar)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', cargar)
      window.removeEventListener(EVENTO_AVISOS, cargar)
    }
  }, [cargar])

  const abrir = async (a: Aviso, grupo?: Aviso[]) => {
    setAncla(null)
    // Un grupo de mensajes (2026-10-19): abrir el último marca leídos todos los del grupo.
    const porLeer = (grupo ?? [a]).filter((x) => !x.leida)
    if (porLeer.length) {
      Promise.all(porLeer.map((x) => api(`/api/notificaciones/${x.id}/leer`, { method: 'POST' }))).then(cargar).catch(() => {})
    }
    setNuevo(null)
    // Asignación hecha en OpenProject: se abre allá (servicios/openproject_sync.py).
    if (a.destino?.startsWith('op:')) return void abrirPaquete(a.destino.slice(3))
    const ruta = rutaAviso(a)
    if (ruta) navegar(ruta)
  }

  const leerTodas = () => {
    api('/api/notificaciones/leer-todas', { method: 'POST' }).then(cargar).catch(() => {})
  }

  return (
    <>
      <Tooltip title={pendientes ? `${pendientes} aviso(s) sin leer` : 'Avisos'}>
        <IconButton color="inherit" onClick={(e) => setAncla(e.currentTarget)} aria-label="Avisos">
          <Badge badgeContent={pendientes} color="warning" max={99}>
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={ancla}
        open={ancla !== null}
        onClose={() => setAncla(null)}
        slotProps={{ paper: { sx: { width: 360, maxWidth: '95vw' } } }}
      >
        <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Avisos
          </Typography>
          {pendientes > 0 && (
            <Button size="small" onClick={leerTodas}>
              Marcar todo leído
            </Button>
          )}
        </Box>
        {avisos.length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              Sin avisos.
            </Typography>
          </MenuItem>
        )}
        {/* Agrupada y compacta (2026-10-19, Edison: «muy abrumadora»): los mensajes seguidos de una
            misma persona son una entrada, un recordatorio dice título y cuándo, la hora va corta a la
            derecha y el icono dice de qué es; el punto arena, lo no leído. Lógica en src/avisos.ts. */}
        {agruparAvisos(avisos).map((g: GrupoAvisos<Aviso>) => (
          <MenuItem
            key={g.cabeza.id}
            onClick={() => void abrir(g.cabeza, g.avisos)}
            sx={{ whiteSpace: 'normal', alignItems: 'flex-start', gap: 1.25, py: 0.9, opacity: g.sinLeer ? 1 : 0.6 }}
          >
            <Box sx={{ mt: '2px', color: 'text.secondary', display: 'flex', flexShrink: 0 }}>
              {(() => { const I = iconoDe(g.cabeza); return <I sx={{ fontSize: 18 }} /> })()}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                {/* Entero, nunca recortado con «…» (Edison 2026-10-19). */}
                <Typography variant="body2" sx={{ flex: 1, fontWeight: g.sinLeer ? 600 : 500, overflowWrap: 'anywhere', lineHeight: 1.3 }}>{g.titulo}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{horaBreve(g.cabeza.creado_en)}</Typography>
                {g.sinLeer > 0 && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: PALETA.dorado, flexShrink: 0, alignSelf: 'center' }} />}
              </Box>
              {g.detalle && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                  {g.detalle}
                </Typography>
              )}
            </Box>
          </MenuItem>
        ))}
      </Menu>
      <Snackbar open={nuevo !== null} autoHideDuration={12000} onClose={() => setNuevo(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity="info" variant="filled" onClose={() => setNuevo(null)} sx={{ maxWidth: 420, alignItems: 'center' }}
          action={nuevo && rutaAviso(nuevo) ? <Button color="inherit" size="small" onClick={() => nuevo && void abrir(nuevo)}>Abrir</Button> : undefined}>
          {nuevo?.texto}
        </Alert>
      </Snackbar>
    </>
  )
}

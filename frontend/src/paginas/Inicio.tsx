/**
 * INICIO — el MENÚ PRINCIPAL: la entrada al sistema (Edison 2026-10-01: «lo
 * primero que deben visualizar debe ser el menú principal, no directamente
 * Gestión Documental»). Antes era una página aparte (/inicio) y la entrada
 * era la bandeja.
 *
 * Arriba, lo que le toca a la persona (sus tareas); después, cada módulo con
 * sus accesos directos (las opciones marcadas como acción en
 * `navegacion.ts`), y al final los otros sistemas de la entidad, que se abren
 * en pestaña nueva con la dirección del `.env` (nada de la entidad en el
 * código). En el celular los módulos van uno bajo otro, con los accesos a la
 * mano del pulgar.
 */
import FechasProximas from '../componentes/FechasProximas'
import ResumenRecibidos from '../componentes/entradas/ResumenRecibidos'
import type { ResumenEntradas } from '../componentes/entradas/modelo'
import PanelHoy from '../componentes/tareas/PanelHoy'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { api } from '../api'
import Marco from '../componentes/Marco'
import { AgendaYTareasOP } from '../componentes/OpenProject'
import { configOP } from '../openproject'
import { DESDE_MENU, SISTEMAS_EXTERNOS, modulosVisibles, type IdModulo, type Modulo } from '../navegacion'
import { moduloActivo } from '../modulos'
import { useModulos } from '../componentes/usarModulos'
import { PALETA } from '../paleta'

/** Accesos directos de cada módulo en el menú principal (las rutas existen en navegacion.ts). */
const ACCESOS: Partial<Record<IdModulo, string[]>> = {
  documentos: ['/documentos?nuevo=1', '/documentos?incorporar=1', '/documentos?avanzada=1'],
  recibidos: ['/recibidos?subir=1', '/recibidos?vencidas=1'],
  prensa: ['/prensa?ver=piezas&nueva=1'],
  proyectos: ['/proyectos?ver=mias', '/proyectos?nuevo=1'],
  // 2026-10-06: sin «hoy» ni «agenda»: ya los enlaza el panel de hoy (PanelHoy).
  tareas: ['/tareas?nueva=1'],
  chat: ['/chat?nuevo=1'],
  representacion: ['/informes?ver=territorio'],
  rendicion: ['/rendiciones?nueva=1'],
  directorio: ['/directorio?nuevo=1'],
  observatorio: ['/observatorio?vista=catalogo', '/observatorio?vista=comparar'],
}

function TarjetaModulo({ m, dato }: { m: Modulo; dato?: string }) {
  const navegar = useNavigate()
  const Icono = m.icono
  const accesos = (ACCESOS[m.id] ?? []).map((r) => m.opciones.find((o) => o.ruta === r)).filter(Boolean) as Modulo['opciones']
  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden',
        transition: 'border-color .15s, box-shadow .15s', '&:hover': { borderColor: PALETA.bordeFuerte, boxShadow: PALETA.sombra },
      }}
    >
      <ButtonBase onClick={() => navegar(m.ruta, DESDE_MENU)} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, p: 2, flex: 1 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: 2.5, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: PALETA.superficieMedia, color: 'text.primary' }}>
          <Icono sx={{ fontSize: 26 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 650, fontSize: 15.5, flex: 1 }}>{m.nombre}</Typography>
            <ChevronRightIcon sx={{ color: 'text.disabled' }} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.45 }}>{m.descripcion}</Typography>
          {dato && <Chip size="small" label={dato} sx={{ mt: 1, height: 22, fontSize: 12 }} />}
        </Box>
      </ButtonBase>
      {accesos.length > 0 && (
        // Los accesos empiezan donde empieza el título, no bajo el ícono (Edison 2026-10-06): 16 px de
        // margen + 44 del ícono + 12 de separación.
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, pl: '72px', pr: 2, pb: 1.5, pt: 0 }}>
          {accesos.map((o) => {
            const I = o.icono
            return (
              <Chip
                key={o.ruta}
                size="small"
                icon={<I sx={{ fontSize: '17px !important' }} />}
                label={o.etiqueta}
                variant={o.accion ? 'filled' : 'outlined'}
                color={o.accion ? 'primary' : 'default'}
                onClick={() => navegar(o.ruta, DESDE_MENU)}
                sx={{ height: 30, fontSize: 12.5, px: 0.25 }}
              />
            )
          })}
        </Box>
      )}
    </Box>
  )
}

const ICONO_EXTERNO = { tareas: EventNoteOutlinedIcon, identidad: PaletteOutlinedIcon }

interface MiTarea {
  id?: number
  proyecto_id: number
  proyecto: string
  titulo: string
  estado_texto: string
  limite?: string
  clave?: string
}

/** Lo que le toca a la persona en los proyectos (tareas y partes a su cargo). */
function MisTareas({ tareas, partes }: { tareas: MiTarea[]; partes: MiTarea[] }) {
  const navegar = useNavigate()
  const hoy = new Date().toISOString().slice(0, 10)
  const filas = [
    ...tareas.map((t) => ({ ...t, tipo: 'Tarea' })),
    ...partes.map((p) => ({ ...p, tipo: 'Parte a su cargo' })),
  ]
  if (filas.length === 0) return null
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        Lo que le toca ({filas.length})
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
        {filas.slice(0, 8).map((t, i) => (
          <ButtonBase
            key={`${t.tipo}-${t.id ?? t.clave}-${t.proyecto_id}`}
            // Directo al trabajo: la tarea (en Fases) o la parte (en Texto).
            onClick={() => navegar(`/proyectos/${t.proyecto_id}?ir=${encodeURIComponent('clave' in t && t.clave ? `parte:${t.clave}` : `tarea:${t.id}`)}`)}
            sx={{
              display: 'flex', width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, px: 2, py: 1.25,
              borderTop: i ? '1px solid' : 'none', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <ChecklistOutlinedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap>{t.titulo}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t.tipo} · {t.proyecto} · {t.estado_texto}
              </Typography>
            </Box>
            {t.limite && (
              <Chip
                size="small"
                label={`Hasta ${t.limite.slice(8, 10)}/${t.limite.slice(5, 7)}`}
                color={t.limite < hoy ? 'error' : 'default'}
                variant="outlined"
                sx={{ height: 22, fontSize: 12 }}
              />
            )}
          </ButtonBase>
        ))}
        {filas.length > 8 && (
          <ButtonBase onClick={() => navegar('/proyectos?ver=mias')} sx={{ width: '100%', py: 1, borderTop: '1px solid', borderColor: 'divider', color: 'primary.main', fontSize: 13.5, fontWeight: 600 }}>
            Ver las {filas.length}
          </ButtonBase>
        )}
      </Box>
    </Box>
  )
}

export default function Inicio() {
  // Los módulos apagados en Administración no salen en el menú (2026-10-18).
  useModulos()
  const [docsPend, setDocsPend] = useState<number | null>(null)
  const [proyectos, setProyectos] = useState<number | null>(null)
  const [informes, setInformes] = useState<number | null>(null)
  const [chatSinLeer, setChatSinLeer] = useState(0)
  const [recibidos, setRecibidos] = useState<ResumenEntradas | null>(null)
  const [mias, setMias] = useState<{ tareas: MiTarea[]; partes: MiTarea[] }>({ tareas: [], partes: [] })
  // «Tareas y agenda» abre OpenProject con la dirección que da la API si el .env
  // de la web no trae VITE_URL_TAREAS (una sola configuración: la del servidor).
  const [urlOP, setUrlOP] = useState('')
  useEffect(() => { configOP().then((c) => setUrlOP(c.url)) }, [])
  useEffect(() => {
    api<{ pendientes: number }>('/api/notificaciones').then((r) => setDocsPend(r.pendientes)).catch(() => {})
    // Solo de los módulos encendidos (2026-10-18): de uno apagado no hay nada que contar.
    if (moduloActivo('proyectos')) {
      api<unknown[]>('/api/proyectos').then((l) => setProyectos(l.length)).catch(() => {})
      api<{ tareas: MiTarea[]; partes: MiTarea[] }>('/api/proyectos/mis-tareas').then(setMias).catch(() => {})
    }
    if (moduloActivo('representacion')) api<unknown[]>('/api/informes-sr').then((l) => setInformes(l.length)).catch(() => {})
    if (moduloActivo('chat')) api<{ total: number }>('/api/chat/no-leidos').then((r) => setChatSinLeer(r.total)).catch(() => {})
    if (moduloActivo('recibidos')) api<ResumenEntradas>('/api/entradas/resumen').then(setRecibidos).catch(() => {})
  }, [])
  const nombre = (localStorage.getItem('sgdp_nombre') ?? '').split(' ')[0]
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const datos: Partial<Record<IdModulo, string | undefined>> = {
    documentos: docsPend ? `${docsPend} aviso(s) sin leer` : undefined,
    recibidos: recibidos && recibidos.nuevas + recibidos.en_atencion
      ? `${recibidos.nuevas + recibidos.en_atencion} por atender${recibidos.vencidas ? ` · ${recibidos.vencidas} vencido(s)` : ''}`
      : undefined,
    proyectos: proyectos ? `${proyectos} proyecto(s)` : undefined,
    representacion: informes ? `${informes} semana(s)` : undefined,
    chat: chatSinLeer ? `${chatSinLeer} mensaje${chatSinLeer === 1 ? '' : 's'} sin leer` : undefined,
  }
  const modulos = modulosVisibles().filter((m) => m.id !== 'inicio')

  return (
    <Marco modulo="inicio" fondo={PALETA.fondo}>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, px: { xs: 2, sm: 3 } }}>
        {/* 2026-10-06: sin subtítulo «Elija un módulo…»: la página lo muestra sola. */}
        <Typography component="h2" sx={{ fontSize: { xs: 20, sm: 22 }, fontWeight: 650, mb: 2 }}>
          {nombre ? `${saludo}, ${nombre}` : saludo}
        </Typography>
        {/* Tareas y Agenda (2026-10-06): mis tareas de hoy y vencidas, y la agenda de hoy. */}
        <PanelHoy compacto />
        <MisTareas tareas={mias.tareas} partes={mias.partes} />
        <ResumenRecibidos />
        {/* Feriados, fechas cívicas y aniversarios: una franja discreta (2026-10-08). */}
        <FechasProximas />
        <AgendaYTareasOP />
        <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>Módulos</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
          {modulos.map((m) => <TarjetaModulo key={m.id} m={m} dato={datos[m.id]} />)}
        </Box>
        <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>Otros sistemas de la entidad</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          {SISTEMAS_EXTERNOS.map((x) => {
            const t = x.clave === 'tareas' && !x.url ? { ...x, url: urlOP || undefined } : x
            const I = ICONO_EXTERNO[t.clave]
            return (
              <ButtonBase
                key={t.clave}
                onClick={() => t.url && window.open(t.url, '_blank', 'noopener')}
                disabled={!t.url}
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', opacity: t.url ? 1 : 0.55, '&:hover': { borderColor: PALETA.bordeFuerte, boxShadow: PALETA.sombra } }}
              >
                <I sx={{ color: 'text.secondary' }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{t.titulo}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>{t.url ? t.texto : 'Por configurar'}</Typography>
                </Box>
                {t.url && <OpenInNewIcon sx={{ fontSize: 15, color: 'text.disabled' }} />}
              </ButtonBase>
            )
          })}
        </Box>
      </Container>
    </Marco>
  )
}

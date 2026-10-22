/**
 * MARCO — la carcasa común de todas las pantallas con sesión (Edison
 * 2026-10-01: «la entrada debe ser el menú principal», «la barra superior debe
 * ser contextual» y «el diputado usa casi siempre el celular»).
 *
 *   ┌ ☰  [módulo] › título de la página ········ acciones · equipo · 🔔 · cuenta ┐
 *   ├ opciones del módulo (o de la página): pestañas desplazables ─────────────┤
 *   │ contenido                                                                │
 *   └ (celular) barra inferior: Inicio · Documentos · Recibidos · Chat · Agenda · Más ┘
 *
 * - ☰ abre el cajón con TODOS los módulos (el del momento, desplegado con sus
 *   opciones), los otros sistemas y la cuenta. En el celular, «Menú» de la
 *   barra inferior abre el mismo cajón.
 * - Las opciones salen de `navegacion.ts`; una página puede poner las suyas
 *   (el proyecto pone sus pestañas: Texto, Ficha, Fases…).
 * - Las `acciones` de la página van en la barra en pantallas anchas; en las
 *   angostas bajan a una franja propia desplazable, para no apretarse.
 * - La barra inferior solo sale en las pantallas de módulo; en las de trabajo
 *   (un documento, un proyecto) se omite para dejar sitio al texto, y en el
 *   celular también la franja de opciones del módulo (siguen en ☰).
 * - En el celular y la tableta (< 900 px) las opciones DEL MÓDULO no van en
 *   pestañas: un botón flotante abajo a la derecha (BotonModulo, el mismo del
 *   chat) abre la hoja con sus secciones y acciones, y la barra de arriba dice
 *   dónde se está: «Documentos · Bandeja» (Edison 2026-10-12). Las pestañas que
 *   pone una página (las de un proyecto, una semana) siguen como pestañas.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Tooltip from '@mui/material/Tooltip'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Badge from '@mui/material/Badge'
import Paper from '@mui/material/Paper'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import MenuIcon from '@mui/icons-material/Menu'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import Button from '@mui/material/Button'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import LockResetIcon from '@mui/icons-material/LockReset'
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import { cerrarSesion } from '../api'
import { desactivarAvisos } from '../avisosPush'

/** «Salir» a propósito (2026-10-13): primero da de baja los avisos de este equipo (si no, el
 * celular seguiría recibiendo los de esta cuenta), con un tope de 2 s para no trabar la salida;
 * el cierre por sesión caducada NO pasa por aquí y conserva los avisos. */
async function salir() {
  await Promise.race([desactivarAvisos().catch(() => undefined), new Promise((r) => setTimeout(r, 2000))])
  cerrarSesion()
}
import CampanaNotificaciones from './CampanaNotificaciones'
import { ContadorChat } from '@qillqa/rimay/publico'
import AnuncioCentral from './AnuncioCentral'
import EquipoEnLinea from './EquipoEnLinea'
import { abrirActividad, useActividad } from '../actividad'
import AvatarPersona from './perfil/AvatarPersona'
import TarjetaContacto from './perfil/TarjetaContacto'
import { idDelToken } from '@qillqa/rimay/publico'
import BotonModulo, { MARGEN_FLOTANTE, RESERVA_FLOTANTE } from './BotonModulo'
import FranjaSinConexion, { IndicadorConexion } from './FranjaSinConexion'
import AvisoAlVolver from './AvisoAlVolver'
import AvisoBreve from './AvisoBreve'
import PermisoCarpeta from './PermisoCarpeta'
import {
  DESDE_MENU,
  MODULOS,
  SISTEMAS_EXTERNOS,
  esAdmin,
  modulo as moduloDe,
  modulosVisibles,
  nombreDespacho,
  opcionActiva,
  type IdModulo,
} from '../navegacion'
import { moduloActivo } from '../modulos'
import { useModulos } from './usarModulos'
import ElegirVista from './ElegirVista'
import ElegirApariencia from './ElegirApariencia'
import { PALETA } from '../paleta'
import { abrirAcercaDe, QILLQA } from '../acercaDe'
import AcercaDe from './AcercaDe'

/** Una opción de la franja contextual puesta por la propia página. */
export interface OpcionPagina {
  clave: string
  etiqueta: string
  icono?: React.ReactNode
  activa: boolean
  alPulsar: () => void
  /** Número a la derecha (tareas abiertas, comentarios…); 0 no se muestra. */
  contador?: number
}

const ETIQUETA_ROL: Record<string, string> = {
  administrador: 'Administrador',
  secretaria: 'Secretaría',
  asesor: 'Asesor',
  diputado: 'Diputado',
  prensa: 'Prensa',
  invitado: 'Invitado (solo lectura)',
}

/** La cuenta: quién es, su perfil, su contraseña, la administración y salir. */
function MenuCuenta() {
  const navegar = useNavigate()
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const nombre = localStorage.getItem('qillqa_nombre') ?? ''
  const rol = localStorage.getItem('qillqa_rol') ?? ''
  const miId = useMemo(() => idDelToken(localStorage.getItem('qillqa_token')), [])
  const ir = (r: string) => {
    setAncla(null)
    navegar(r, DESDE_MENU)
  }
  return (
    <>
      <Tooltip title={`${nombre || 'Mi cuenta'}: perfil, contraseña y salir`}>
        <IconButton color="inherit" onClick={(e) => setAncla(e.currentTarget)} aria-label="Mi cuenta" sx={{ p: 0.5 }}>
          <AvatarPersona id={miId} nombre={nombre || '·'} tamano={30} sx={{ fontSize: 13, fontWeight: 400 }} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={ancla} open={Boolean(ancla)} onClose={() => setAncla(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => ir('/perfil')} sx={{ gap: 1.5, py: 1, minWidth: 240 }}>
          <AvatarPersona id={miId} nombre={nombre || '·'} tamano={40} />
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: 14 }}>{nombre}</Typography>
            <Typography variant="caption" color="text.secondary" component="div">{ETIQUETA_ROL[rol] ?? rol} · Ver mi perfil</Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => ir('/clave')}>
          <ListItemIcon><LockResetIcon fontSize="small" /></ListItemIcon>
          Cambiar mi contraseña
        </MenuItem>
        {esAdmin() && (
          <MenuItem onClick={() => ir('/admin')}>
            <ListItemIcon>{(() => { const I = moduloDe('admin').icono; return <I fontSize="small" /> })()}</ListItemIcon>
            Administración
          </MenuItem>
        )}
        <Divider />
        {/* Vista (2026-10-18): elegir celular, tableta o escritorio, o la automática.
            Apariencia (2026-10-19): como el aparato, clara u oscura. */}
        <Box sx={{ px: 2, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <ElegirVista />
          <ElegirApariencia />
        </Box>
        <Divider />
        <MenuItem onClick={() => { setAncla(null); abrirAcercaDe() }}>
          <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
          Acerca de {QILLQA.nombre}
        </MenuItem>
        <MenuItem onClick={() => void salir()}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          Salir
        </MenuItem>
      </Menu>
    </>
  )
}

/** El cajón: el mapa entero del sistema, con el módulo actual desplegado. */
function Cajon({ abierto, alCerrar, actual }: { abierto: boolean; alCerrar: () => void; actual: IdModulo }) {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const [consulta] = useSearchParams()
  const ir = (r: string) => {
    alCerrar()
    navegar(r, DESDE_MENU)
  }
  const externos = SISTEMAS_EXTERNOS.filter((s) => s.url)
  return (
    <Drawer open={abierto} onClose={alCerrar} PaperProps={{ sx: { width: { xs: '86vw', sm: 320 }, maxWidth: 360 } }}>
      {/* La cabecera del cajón, sin relleno de color (2026-10-19): el nombre en tinta y una línea fina. */}
      <Box sx={{ px: 2, pt: 2.25, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, letterSpacing: -0.2 }}>{nombreDespacho()}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{localStorage.getItem('qillqa_nombre')}</Typography>
      </Box>
      <List dense sx={{ py: 0.5 }}>
        {modulosVisibles().map((m) => {
          const Icono = m.icono
          const esActual = m.id === actual
          return (
            <Box key={m.id}>
              <ListItemButton selected={esActual && m.opciones.length === 0} onClick={() => ir(m.ruta)} sx={{ py: 1 }}>
                <ListItemIcon sx={{ minWidth: 40, color: esActual ? 'primary.main' : undefined }}><Icono /></ListItemIcon>
                <ListItemText primary={m.nombre} primaryTypographyProps={{ fontWeight: esActual ? 700 : 500, fontSize: 14.5 }} />
              </ListItemButton>
              {esActual && m.opciones.filter((o) => !o.soloAdmin || esAdmin()).map((o) => {
                const IconoO = o.icono
                return (
                  <ListItemButton key={o.ruta} selected={opcionActiva(o, m.opciones, pathname, consulta)} onClick={() => ir(o.ruta)} sx={{ pl: 4.5, py: 0.6 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}><IconoO fontSize="small" /></ListItemIcon>
                    <ListItemText primary={o.etiqueta} secondary={o.ayuda} primaryTypographyProps={{ fontSize: 13.5, color: o.accion ? 'primary.main' : undefined, fontWeight: o.accion ? 600 : 400 }} secondaryTypographyProps={{ fontSize: 11.5 }} />
                  </ListItemButton>
                )
              })}
            </Box>
          )
        })}
      </List>
      {externos.length > 0 && (
        <>
          <Divider />
          <List dense subheader={<ListSubheader sx={{ lineHeight: '32px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.6 }}>Otros sistemas</ListSubheader>}>
            {externos.map((s) => (
              <ListItemButton key={s.clave} component="a" href={s.url} target="_blank" rel="noopener" onClick={alCerrar}>
                <ListItemText primary={s.titulo} primaryTypographyProps={{ fontSize: 14 }} />
                <OpenInNewIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </ListItemButton>
            ))}
          </List>
        </>
      )}
      <Box sx={{ flex: 1 }} />
      <Divider />
      <List dense>
        <ListItemButton onClick={() => ir('/perfil')}>
          <ListItemIcon sx={{ minWidth: 40 }}><AccountCircleOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Mi perfil" />
        </ListItemButton>
        <ListItemButton onClick={() => ir('/clave')}>
          <ListItemIcon sx={{ minWidth: 40 }}><LockResetIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Cambiar mi contraseña" />
        </ListItemButton>
        <ListItemButton onClick={() => { alCerrar(); abrirAcercaDe() }}>
          <ListItemIcon sx={{ minWidth: 40 }}><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={`Acerca de ${QILLQA.nombre}`} />
        </ListItemButton>
        <ListItemButton onClick={() => void salir()}>
          <ListItemIcon sx={{ minWidth: 40 }}><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Salir" />
        </ListItemButton>
      </List>
    </Drawer>
  )
}

/** Una entrada de la barra inferior: el módulo y, si difiere, el nombre y la ruta que se pulsa. */
interface EntradaInferior { id: IdModulo; corto?: string; ruta?: string }
/** El botón único de la cabecera del celular (2026-10-19): equipo en línea, chat y avisos en un menú. */
function ActividadCelular({ conChat }: { conChat: boolean }) {
  const c = useActividad()
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const boton = useRef<HTMLButtonElement | null>(null)
  const total = c.chat + c.avisos
  const abrir = (clave: 'equipo' | 'chat' | 'avisos') => { setAncla(null); if (boton.current) abrirActividad(clave, boton.current) }
  return (
    <>
      <IconButton ref={boton} color="inherit" onClick={(e) => setAncla(e.currentTarget)} aria-label={total ? `Actividad: ${total} sin leer` : 'Actividad'}>
        <Badge badgeContent={total} color="warning" max={99} overlap="circular">
          <Badge variant="dot" color="success" invisible={c.equipo === 0} overlap="circular" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
            <NotificationsNoneOutlinedIcon />
          </Badge>
        </Badge>
      </IconButton>
      <Menu anchorEl={ancla} open={Boolean(ancla)} onClose={() => setAncla(null)}>
        <MenuItem onClick={() => abrir('equipo')}><ListItemIcon><GroupsOutlinedIcon fontSize="small" /></ListItemIcon>Equipo en línea{c.equipo ? ` · ${c.equipo}` : ''}</MenuItem>
        {conChat && <MenuItem onClick={() => abrir('chat')}><ListItemIcon><ForumOutlinedIcon fontSize="small" /></ListItemIcon>Chat{c.chat ? ` · ${c.chat} sin leer` : ''}</MenuItem>}
        <MenuItem onClick={() => abrir('avisos')}><ListItemIcon><NotificationsNoneOutlinedIcon fontSize="small" /></ListItemIcon>Avisos{c.avisos ? ` · ${c.avisos} sin leer` : ''}</MenuItem>
      </Menu>
    </>
  )
}

/** Los módulos de la barra inferior del celular (el resto, en «Más»). Mesa de Partes (antes Recibidos) entra como módulo
 *  propio y la Agenda ocupa el sitio de Tareas (2026-10-12, fase 9.6); Proyectos y Semanas siguen
 *  en el cajón. */
const INFERIOR: EntradaInferior[] = [
  { id: 'inicio' }, { id: 'documentos' }, { id: 'recibidos' }, { id: 'chat' }, { id: 'tareas', corto: 'Agenda', ruta: '/agenda' },
]
/** La cuenta de prensa no tramita documentos: su barra lleva lo suyo. */
const inferior = (): EntradaInferior[] =>
  (localStorage.getItem('qillqa_rol') === 'prensa' ? [{ id: 'inicio' }, { id: 'fototeca' }, { id: 'prensa' }, { id: 'recibidos' }, { id: 'chat' }] as EntradaInferior[] : INFERIOR)
    // Lo apagado en Administración (2026-10-18) no ocupa sitio en la barra.
    .filter((e) => moduloActivo(e.id))

export default function Marco({
  modulo,
  titulo,
  volver,
  acciones,
  accionesFijas,
  opciones,
  equipo,
  sinBarraInferior = false,
  sinBotonModulo = false,
  sinReservaFlotante = false,
  fondo,
  children,
}: {
  modulo: IdModulo
  /** Lo que se trabaja en la página (un documento, un proyecto). */
  titulo?: React.ReactNode
  /** Ruta de «atrás» (p. ej. del proyecto a la lista). */
  volver?: string
  /** Botones propios de la página. */
  acciones?: React.ReactNode
  /** Los «⋮» de la página: en pantallas anchas, junto a `acciones`; en las angostas, al final de la
   * franja de `acciones`, a la derecha y en su misma línea (nunca en una línea propia: Edison
   * 2026-10-06, «nunca he visto unos tres puntitos en esa ubicación»), para dejar la barra de
   * arriba al título. Sin `acciones`, se quedan arriba. */
  accionesFijas?: React.ReactNode
  /** Opciones propias de la página; sin ellas, las del módulo. */
  opciones?: OpcionPagina[]
  /** Sustituye el «equipo en línea» por defecto (p. ej. con el documento). */
  equipo?: React.ReactNode
  sinBarraInferior?: boolean
  /** Oculta el botón flotante del módulo (p. ej. mientras la página muestra su propia barra abajo). */
  sinBotonModulo?: boolean
  /** El botón flota sobre el contenido sin reservarle sitio al final (p. ej. un lienzo a todo el alto). */
  sinReservaFlotante?: boolean
  fondo?: string
  children: React.ReactNode
}) {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const [consulta] = useSearchParams()
  const tema = useTheme()
  const angosta = useMediaQuery(tema.breakpoints.down('md'))
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [cajon, setCajon] = useState(false)
  // El menú, la barra inferior y el chat siguen a los módulos encendidos (2026-10-18).
  useModulos()
  const m = moduloDe(modulo)
  const IconoModulo = m.icono

  // El título de la pestaña del navegador dice dónde se está.
  useEffect(() => {
    const t = typeof titulo === 'string' ? `${titulo} · ` : ''
    document.title = `${t}${m.nombre} · ${QILLQA.nombre}`
  }, [titulo, m.nombre])

  // Las opciones: las de la página, o las del módulo como rutas.
  // En una pantalla de trabajo angosta (un documento abierto en el celular)
  // las opciones del módulo ceden su sitio al texto: siguen en el menú ☰.
  const sinFranjaDeModulo = sinBarraInferior && angosta
  const opcionesModulo = useMemo(() => m.opciones.filter((o) => !o.soloAdmin || esAdmin()), [m])
  const esActual = (o: (typeof opcionesModulo)[number]) => opcionActiva(o, opcionesModulo, pathname, consulta)
  // En < 900 px las opciones del módulo van en el botón flotante, no en pestañas.
  const conBotonModulo = angosta && !opciones && !sinFranjaDeModulo && opcionesModulo.length > 0
  const franja: OpcionPagina[] = useMemo(() => {
    if (opciones) return opciones
    if (sinFranjaDeModulo || angosta) return []
    return opcionesModulo.map((o) => {
      const Icono = o.icono
      return {
        clave: o.ruta,
        etiqueta: o.etiqueta,
        icono: <Icono sx={{ fontSize: 18 }} />,
        activa: opcionActiva(o, opcionesModulo, pathname, consulta),
        alPulsar: () => navegar(o.ruta, DESDE_MENU),
      }
    })
  }, [opciones, sinFranjaDeModulo, angosta, opcionesModulo, pathname, consulta, navegar])
  const activa = franja.findIndex((o) => o.activa)
  // Dónde se está, para la barra de arriba en el celular: «Documentos · Bandeja».
  const tituloEnLinea = conBotonModulo && (titulo === undefined || typeof titulo === 'string')
  const seccion = tituloEnLinea
    ? (typeof titulo === 'string' && titulo !== m.nombre ? titulo : opcionesModulo.find(esActual)?.etiqueta)
    : undefined
  const conInferior = celular && !sinBarraInferior
  const mostrarBoton = conBotonModulo && !sinBotonModulo

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: fondo }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ gap: { xs: 0.25, sm: 0.75 }, px: { xs: 0.5, sm: 1.5 } }}>
          {/* En el celular con barra inferior, «Más» ya abre el menú: las tres líneas sobraban (Edison, 2026-10-19). */}
          {!conInferior && (
            <Tooltip title="Menú: todos los módulos">
              <IconButton color="inherit" onClick={() => setCajon(true)} aria-label="Abrir el menú">
                <MenuIcon />
              </IconButton>
            </Tooltip>
          )}
          {/* Inicio, siempre a la vista (Edison 2026-10-01: «el botón inicio debe
              ser fácil de ubicar en la barra principal»). En el menú principal
              no hace falta: ya se está en él. */}
          {modulo !== 'inicio' && (
            <Tooltip title="Volver al menú principal">
              <Button
                color="inherit"
                onClick={() => navegar('/', DESDE_MENU)}
                aria-label="Inicio"
                startIcon={<HomeOutlinedIcon />}
                sx={{
                  flexShrink: 0, minWidth: 0, px: { xs: 1, md: 1.25 }, borderRadius: 5, bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' },
                  '& .MuiButton-startIcon': { mr: { xs: 0, md: 0.75 }, ml: 0 },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Inicio</Box>
              </Button>
            </Tooltip>
          )}
          {volver && (
            <Tooltip title="Atrás">
              <IconButton color="inherit" onClick={() => navegar(volver)} aria-label="Atrás">
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>
          )}
          {/* El módulo (clic: su página principal) y, si hay, lo que se trabaja. Con el botón
              flotante del módulo, una sola línea: «Documentos · Bandeja». */}
          {tituloEnLinea ? (
            <ButtonBase
              onClick={() => navegar(m.ruta, DESDE_MENU)}
              sx={{ borderRadius: 1.5, px: 0.75, py: 0.5, gap: 0.75, flexShrink: 1, minWidth: 0, overflow: 'hidden', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <IconoModulo sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
              {/* En el teléfono, en dos renglones (el módulo arriba, chico) para que la sección
                  quepa junto a los íconos; desde 600 px, en uno: «Documentos · Bandeja». */}
              <Typography component="h1" noWrap sx={{ fontWeight: 600, fontSize: 15, lineHeight: { xs: 1.15, sm: 1.5 }, textAlign: 'left', minWidth: 0 }}>
                <Box component="span" sx={seccion ? { display: { xs: 'block', sm: 'inline' }, fontSize: { xs: 11.5, sm: 15 }, fontWeight: { xs: 500, sm: 600 }, opacity: { xs: 0.85, sm: 1 } } : undefined}>
                  {m.corto}
                </Box>
                {seccion && (
                  <Box component="span" sx={{ display: { xs: 'block', sm: 'inline' }, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: { xs: 600, sm: 400 }, fontSize: { xs: 14.5, sm: 15 } }}>
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}> · </Box>
                    {seccion}
                  </Box>
                )}
              </Typography>
            </ButtonBase>
          ) : (<>
          <ButtonBase
            onClick={() => navegar(m.ruta, DESDE_MENU)}
            sx={{ borderRadius: 1.5, px: 0.75, py: 0.5, gap: 0.75, flexShrink: titulo ? 0 : 1, minWidth: 0, overflow: 'hidden', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <IconoModulo sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0, display: titulo && celular ? 'none' : 'block' }} />
            <Typography
              component={titulo ? 'span' : 'h1'}
              noWrap
              sx={{ fontWeight: 600, fontSize: 15, display: titulo && celular ? 'none' : 'block' }}
            >
              {modulo === 'inicio' ? nombreDespacho() : m.nombre}
            </Typography>
          </ButtonBase>
          {titulo && (
            <>
              {!celular && <ChevronRightIcon sx={{ fontSize: 18, color: 'text.disabled', mx: -0.25 }} />}
              <Typography component="h1" noWrap sx={{ fontSize: 14.5, fontWeight: 500, color: 'text.secondary', minWidth: 0, flexShrink: 1 }}>
                {titulo}
              </Typography>
            </>
          )}
          </>)}
          <Box sx={{ flex: 1 }} />
          {!angosta && acciones}
          {(!angosta || !acciones) && accionesFijas}
          <IndicadorConexion />
          {/* Celular (2026-10-19, Edison): un solo botón con la suma; los tres siguen montados (latido de
              presencia, socket del chat) pero ocultos, y se abren desde el menú del botón. */}
          <Box sx={{ display: celular ? 'none' : 'contents' }}>
            {equipo ?? <EquipoEnLinea />}
            {moduloActivo('chat') && <ContadorChat />}
            <CampanaNotificaciones />
          </Box>
          {celular && <ActividadCelular conChat={moduloActivo('chat')} />}
          <AnuncioCentral />
          <MenuCuenta />
        </Toolbar>
        {/* En pantallas angostas, las acciones bajan a su propia franja. */}
        {/* Las fijas («⋮» y compañía) cierran esa franja por la derecha, en la misma línea: la barra de
            arriba queda para el título (Edison 2026-10-06: «no se ve el número del oficio»). */}
        {angosta && acciones && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pb: 0.75, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' }, '& > *': { flexShrink: 0 } }}>
            {acciones}
            {accionesFijas && <Box sx={{ flex: 1, minWidth: 4 }} />}
            {accionesFijas}
          </Box>
        )}
      </AppBar>

      {franja.length > 0 && (
        <Box component="nav" aria-label={`Opciones de ${m.nombre}`} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', px: { xs: 0, sm: 1 } }}>
          <Tabs
            value={activa === -1 ? false : activa}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ minHeight: 42, '& .MuiTab-root': { minHeight: 42, fontSize: 13.5, px: { xs: 1.25, sm: 1.75 }, gap: 0.25 }, '& .MuiTabs-scrollButtons.Mui-disabled': { opacity: 0.25 } }}
          >
            {franja.map((o) => (
              <Tab
                key={o.clave}
                onClick={o.alPulsar}
                icon={o.icono as React.ReactElement | undefined}
                iconPosition="start"
                label={
                  o.contador ? (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      {o.etiqueta}
                      <Box component="span" sx={{ fontSize: 11, fontWeight: 700, px: 0.75, borderRadius: 5, bgcolor: 'action.selected', color: 'text.primary' }}>{o.contador}</Box>
                    </Box>
                  ) : (
                    o.etiqueta
                  )
                }
              />
            ))}
          </Tabs>
        </Box>
      )}

      {/* Sin servidor: lo guardado en este equipo, dicho en una línea solo al administrador
          (2026-10-13; 2026-10-18); al volver, lo enviado y lo que se pidió «hacer al volver». */}
      <FranjaSinConexion />
      <AvisoAlVolver />
      <AvisoBreve />
      <PermisoCarpeta />

      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, pb: `${(conInferior ? 64 : 0) + (mostrarBoton && !sinReservaFlotante ? RESERVA_FLOTANTE : 0)}px` }}>
        {children}
      </Box>

      {mostrarBoton && (
        <BotonModulo
          modulo={m}
          opciones={opcionesModulo}
          esActual={esActual}
          alIr={(o) => navegar(o.ruta, DESDE_MENU)}
          abajo={conInferior ? `calc(58px + ${MARGEN_FLOTANTE}px + env(safe-area-inset-bottom))` : `calc(${MARGEN_FLOTANTE}px + env(safe-area-inset-bottom))`}
        />
      )}

      {conInferior && (
        <Paper square sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: (t) => t.zIndex.appBar, pb: 'env(safe-area-inset-bottom)', borderTop: '1px solid', borderColor: 'divider', bgcolor: PALETA.barra, backdropFilter: 'saturate(180%) blur(12px)' }}>
          <BottomNavigation
            showLabels
            value={inferior().some((x) => x.id === modulo) ? modulo : 'menu'}
            sx={{ height: 58, bgcolor: 'transparent', '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.5, justifyContent: 'flex-start', pt: '8px' }, '& .MuiBottomNavigationAction-label': { fontSize: 11.5, lineHeight: 1.15, textAlign: 'center', '&.Mui-selected': { fontSize: 11.5, fontWeight: 700 } } }}
          >
            {inferior().map(({ id, corto, ruta }) => {
              const mi = MODULOS.find((x) => x.id === id)!
              const I = mi.icono
              return <BottomNavigationAction key={id} value={id} label={corto ?? mi.corto} icon={<I />} onClick={() => navegar(ruta ?? mi.ruta, DESDE_MENU)} />
            })}
            <BottomNavigationAction value="menu" label="Más" icon={<Badge variant="dot" color="primary" invisible={inferior().some((x) => x.id === modulo)}><MoreHorizIcon /></Badge>} onClick={() => setCajon(true)} />
          </BottomNavigation>
        </Paper>
      )}

      <Cajon abierto={cajon} alCerrar={() => setCajon(false)} actual={modulo} />
      {/* La tarjeta de contacto de quien se toque (chat, equipo): una sola, para todas las páginas. */}
      <TarjetaContacto />
      <AcercaDe />
    </Box>
  )
}

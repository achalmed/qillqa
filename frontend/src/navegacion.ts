/**
 * NAVEGACIÓN — el mapa de módulos del sistema y las opciones de cada uno
 * (Edison 2026-10-01: «la barra superior debe ser contextual: al entrar a un
 * módulo, ver rápido qué se puede hacer en él»). Una sola fuente para el menú
 * principal (Inicio), el cajón lateral, la barra contextual y la barra
 * inferior del celular: un módulo o una opción nueva se añade aquí y aparece
 * en todos esos sitios a la vez.
 *
 * Una opción es una ruta (con o sin `?consulta`). La página que la recibe lee
 * su consulta (`?nuevo=1`, `?ver=mias`, `?pestana=personas`…) y la ejecuta;
 * así cada opción tiene dirección propia: se puede volver a ella, abrirla en
 * otra pestaña y llegar a ella desde un aviso.
 */
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import CropOutlinedIcon from '@mui/icons-material/CropOutlined'
import CakeOutlinedIcon from '@mui/icons-material/CakeOutlined'
import type { SvgIconComponent } from '@mui/icons-material'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined'
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined'
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined'
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined'
import MapOutlinedIcon from '@mui/icons-material/MapOutlined'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import LanOutlinedIcon from '@mui/icons-material/LanOutlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined'
import StackedLineChartOutlinedIcon from '@mui/icons-material/StackedLineChartOutlined'
import SourceOutlinedIcon from '@mui/icons-material/SourceOutlined'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined'
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined'
import MovieFilterOutlinedIcon from '@mui/icons-material/MovieFilterOutlined'
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined'
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined'
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined'
import { moduloActivo } from './modulos'

export type IdModulo = 'inicio' | 'documentos' | 'recibidos' | 'proyectos' | 'representacion' | 'rendicion' | 'fototeca' | 'prensa' | 'mapa' | 'observatorio' | 'directorio' | 'contrasenas' | 'admin' | 'tareas' | 'chat' | 'cuenta'

export interface Opcion {
  etiqueta: string
  /** Ruta interna, con su consulta si la lleva. */
  ruta: string
  icono: SvgIconComponent
  /** Texto de ayuda (tooltip en escritorio, segunda línea en el cajón). */
  ayuda?: string
  /** Una acción (crear, incorporar) se pinta distinto de un lugar. */
  accion?: boolean
  soloAdmin?: boolean
}

export interface Modulo {
  id: IdModulo
  nombre: string
  /** Nombre corto para la barra inferior del celular. */
  corto: string
  ruta: string
  icono: SvgIconComponent
  descripcion: string
  opciones: Opcion[]
  soloAdmin?: boolean
  /** Solo estos roles lo ven (sin la lista, todos). */
  roles?: string[]
  /** No es un módulo sino un sitio de la cuenta (Mi perfil): no sale en el menú ni en Inicio. */
  oculto?: boolean
}

export const MODULOS: Modulo[] = [
  {
    id: 'inicio',
    nombre: 'Inicio',
    corto: 'Inicio',
    ruta: '/',
    icono: HomeOutlinedIcon,
    descripcion: 'El menú principal: todos los módulos y lo que le toca hoy.',
    opciones: [],
  },
  {
    id: 'documentos',
    nombre: 'Gestión documental',
    corto: 'Documentos',
    ruta: '/documentos',
    icono: DescriptionOutlinedIcon,
    descripcion: 'Oficios, memorandos, informes: redactar, numerar, firmar, enviar y archivar.',
    opciones: [
      { etiqueta: 'Bandeja', ruta: '/documentos', icono: InboxOutlinedIcon, ayuda: 'Todos los documentos de la entidad' },
      { etiqueta: 'Nuevo documento', ruta: '/documentos?nuevo=1', icono: NoteAddOutlinedIcon, accion: true, ayuda: 'Redactar un documento nuevo con número oficial' },
      { etiqueta: 'Incorporar', ruta: '/documentos?incorporar=1', icono: UploadFileOutlinedIcon, accion: true, ayuda: 'Registrar un documento hecho fuera del sistema (con su PDF)' },
      { etiqueta: 'Búsqueda avanzada', ruta: '/documentos?avanzada=1', icono: ManageSearchOutlinedIcon, ayuda: 'Buscar también en el contenido, por año, destinatario o firma' },
      { etiqueta: 'Estadísticas', ruta: '/estadisticas', icono: QueryStatsOutlinedIcon, ayuda: 'Producción documental, tiempos y estados' },
      { etiqueta: 'Sincronizar', ruta: '/sincronizar', icono: CloudSyncOutlinedIcon, ayuda: 'Copiar los documentos a este dispositivo' },
    ],
  },
  {
    // Mesa de Partes (antes «Recibidos»: opción de Gestión documental el 2026-10-06, módulo propio
    // desde el 2026-10-12, fase 9.6; renombrado el 2026-10-13 a pedido de Edison): lo que llega al
    // despacho —cartas, oficios, invitaciones, citaciones, y lo que entra por la mesa de partes
    // virtual— con su ficha, responsable, plazo y respuesta. El id, la ruta (`/recibidos`) y la API
    // (`entradas`) no cambian: solo lo visible.
    id: 'recibidos',
    nombre: 'Mesa de Partes',
    corto: 'Mesa de Partes',
    ruta: '/recibidos',
    icono: MoveToInboxOutlinedIcon,
    descripcion: 'Lo que llega a la entidad, también por la mesa de partes virtual: ficha, responsable, plazo y respuesta.',
    opciones: [
      { etiqueta: 'Pendientes', ruta: '/recibidos?estado=nueva', icono: MoveToInboxOutlinedIcon, ayuda: 'Documentos sin atender todavía' },
      { etiqueta: 'En atención', ruta: '/recibidos?estado=en_atencion', icono: PendingActionsOutlinedIcon, ayuda: 'Con responsable y en trámite' },
      { etiqueta: 'Vencidos', ruta: '/recibidos?vencidas=1', icono: EventBusyOutlinedIcon, ayuda: 'Con el plazo de atención pasado' },
      { etiqueta: 'Todos', ruta: '/recibidos?estado=todas', icono: FormatListBulletedIcon, ayuda: 'También los atendidos y archivados' },
      { etiqueta: 'Registrar documentos', ruta: '/recibidos?subir=1', icono: UploadFileOutlinedIcon, accion: true, ayuda: 'Subir los PDF que llegaron; el sistema lee su ficha' },
    ],
  },
  {
    // Tareas y Agenda (2026-10-06): módulo propio (OpenProject queda como espejo
    // opcional). Lista, tablero, agenda y «Hoy»; alta rápida en lenguaje natural.
    id: 'tareas',
    nombre: 'Tareas y Agenda',
    corto: 'Tareas',
    ruta: '/tareas',
    icono: TaskAltOutlinedIcon,
    descripcion: 'Encargos con responsable, plazo y estado; agenda de la entidad con choques de horario.',
    opciones: [
      { etiqueta: 'Mis tareas', ruta: '/tareas', icono: ChecklistOutlinedIcon, ayuda: 'Lo que tiene a su cargo, por plazo' },
      { etiqueta: 'Hoy', ruta: '/tareas?ver=hoy', icono: TodayOutlinedIcon, ayuda: 'La agenda de hoy y sus tareas de hoy y vencidas' },
      { etiqueta: 'Tablero', ruta: '/tareas?ver=tablero', icono: ViewKanbanOutlinedIcon, ayuda: 'Todas las tareas por estado; arrastrar para moverlas' },
      { etiqueta: 'Matriz', ruta: '/tareas?ver=matriz', icono: GridViewOutlinedIcon, ayuda: 'Urgente e importante: cada tarea se ordena sola por su plazo e importancia' },
      { etiqueta: 'Agenda', ruta: '/agenda', icono: CalendarMonthOutlinedIcon, ayuda: 'Calendario de la entidad: mes, semana y día' },
      { etiqueta: 'Todas', ruta: '/tareas?ver=todas', icono: FormatListBulletedIcon, ayuda: 'Las del equipo, con filtros' },
      { etiqueta: 'Nueva tarea', ruta: '/tareas?nueva=1', icono: AddTaskOutlinedIcon, accion: true, ayuda: 'A mano o desde el resultado del prompt de plan de tareas' },
    ],
  },
  {
    // Chat (2026-10-12, fase 8): la conversación del equipo dentro del sistema, con los
    // mensajes automáticos de las reglas de eventos. Directos, grupos y temas; hilos; la
    // ficha de la entidad del canal al lado. Lista, conversación y búsqueda van en la página.
    id: 'chat',
    nombre: 'Chat',
    corto: 'Chat',
    ruta: '/chat',
    icono: ForumOutlinedIcon,
    descripcion: 'Conversar con el equipo: directos, grupos y temas, con lo que el sistema avisa solo.',
    opciones: [
      { etiqueta: 'Conversaciones', ruta: '/chat', icono: ForumOutlinedIcon },
      { etiqueta: 'Nueva conversación', ruta: '/chat?nuevo=1', icono: AddCommentOutlinedIcon, accion: true, ayuda: 'Un directo con alguien del equipo o un grupo' },
    ],
  },
  {
    id: 'proyectos',
    nombre: 'Proyectos de ley',
    corto: 'Proyectos',
    ruta: '/proyectos',
    icono: AccountTreeOutlinedIcon,
    descripcion: 'Proyectos de ley por fases: equipo, tareas, redacción en colaboración, fuentes y firma.',
    opciones: [
      { etiqueta: 'Todos los proyectos', ruta: '/proyectos', icono: FormatListBulletedIcon },
      { etiqueta: 'Mis tareas', ruta: '/proyectos?ver=mias', icono: ChecklistOutlinedIcon, ayuda: 'Las tareas y partes que tiene a su cargo' },
      { etiqueta: 'Nuevo proyecto', ruta: '/proyectos?nuevo=1', icono: AddCircleOutlineIcon, accion: true, ayuda: 'Crear un proyecto de ley con sus fases y partes' },
    ],
  },
  {
    id: 'representacion',
    nombre: 'Semana de representación',
    corto: 'Semanas',
    ruta: '/informes',
    icono: CampaignOutlinedIcon,
    descripcion: 'Registrar cada semana (actividades, pedidos, fotos) y generar su informe desde esos datos.',
    opciones: [
      { etiqueta: 'Semanas', ruta: '/informes', icono: DateRangeOutlinedIcon, ayuda: 'Cada semana y su informe' },
      { etiqueta: 'Nueva semana', ruta: '/informes?nuevo=1', icono: AddCircleOutlineIcon, accion: true, ayuda: 'Registrar una semana: actividades, pedidos, fotos y su informe' },
      { etiqueta: 'Territorio y pedidos', ruta: '/informes?ver=territorio', icono: MapOutlinedIcon, ayuda: 'Provincias recorridas y pedidos registrados, de todas las semanas' },
    ],
  },
  {
    // Rendición de cuentas (2026-10-18): los viáticos de cada comisión de servicio —la Semana de
    // representación, sobre todo—: comprobantes con foto, movilidad propuesta desde las actividades,
    // controles y los Anexos 3 y 4 en LaTeX. Todo el equipo salvo el invitado; cada quien ve las suyas.
    id: 'rendicion',
    nombre: 'Rendición de cuentas',
    corto: 'Rendiciones',
    ruta: '/rendiciones',
    icono: ReceiptLongOutlinedIcon,
    descripcion: 'Viáticos de cada comisión: comprobantes, movilidad, controles y los anexos listos para firmar.',
    roles: ['administrador', 'secretaria', 'asesor', 'diputado', 'prensa'],
    opciones: [
      { etiqueta: 'Mis rendiciones', ruta: '/rendiciones', icono: ReceiptLongOutlinedIcon, ayuda: 'Las suyas, con su saldo y su plazo' },
      { etiqueta: 'Nueva rendición', ruta: '/rendiciones?nueva=1', icono: AddCircleOutlineIcon, accion: true, ayuda: 'De una semana de representación u otra comisión' },
      { etiqueta: 'Resumen de la entidad', ruta: '/rendiciones?ver=resumen', icono: SummarizeOutlinedIcon, soloAdmin: true, ayuda: 'Cada comisionado de la semana: recibido, rendido y saldo' },
      { etiqueta: 'Parámetros', ruta: '/rendiciones?parametros=1', icono: TuneOutlinedIcon, soloAdmin: true, ayuda: 'Tope diario, % de declaración jurada y plazo' },
    ],
  },
  {
    // Fototeca (2026-10-06): las fotos originales de la entidad, organizadas y
    // editadas sin tocar el original; la usan la semana, los proyectos y prensa.
    // Álbumes, etiquetas y línea de tiempo van en el panel de la propia página.
    id: 'fototeca',
    // «Mediateca» (2026-10-10): fotos Y videos; el id y las rutas siguen siendo `fototeca`.
    nombre: 'Mediateca',
    corto: 'Fotos',
    ruta: '/fototeca',
    icono: PhotoLibraryOutlinedIcon,
    descripcion: 'Las fotos originales de la entidad: subir, organizar en álbumes, etiquetar, editar y exportar para informes y publicaciones.',
    opciones: [
      { etiqueta: 'Todas', ruta: '/fototeca', icono: PhotoLibraryOutlinedIcon },
      { etiqueta: 'Por revisar', ruta: '/fototeca?ver=revisar', icono: RateReviewOutlinedIcon, ayuda: 'Las recién subidas: decidir si son públicas o reservadas' },
      { etiqueta: 'Favoritas', ruta: '/fototeca?ver=favoritas', icono: StarBorderIcon },
      { etiqueta: 'Papelera', ruta: '/fototeca?ver=papelera', icono: DeleteOutlineIcon, ayuda: 'Lo descartado; se restaura cuando haga falta' },
    ],
  },
  {
    // Prensa (2026-10-06): el estudio de Identidad Visual (piezas, fotos y videos)
    // dentro del sistema, servido por la API bajo /estudio/. Las fotos salen de la
    // Fototeca (la única biblioteca) y las piezas exportadas vuelven a ella.
    id: 'prensa',
    nombre: 'Prensa',
    corto: 'Prensa',
    ruta: '/prensa',
    icono: NewspaperOutlinedIcon,
    descripcion: 'Noticias y notas de prensa registradas, y el estudio de piezas, fotos y videos con la identidad de la entidad.',
    opciones: [
      // Piezas de prensa (2026-10-12, fase 9.4): noticias procesadas con el prompt, notas y comunicados, con estado y responsable.
      { etiqueta: 'Piezas', ruta: '/prensa?ver=piezas', icono: NewspaperOutlinedIcon, ayuda: 'Noticias y notas registradas: estado, responsable y acción sugerida' },
      { etiqueta: 'Nueva pieza', ruta: '/prensa?ver=piezas&nueva=1', icono: AddOutlinedIcon, accion: true, ayuda: 'A mano o desde el resultado del prompt de prensa' },
      { etiqueta: 'Estudio', ruta: '/prensa', icono: DashboardCustomizeOutlinedIcon, ayuda: 'Publicaciones con las plantillas de la marca' },
      { etiqueta: 'Fotos', ruta: '/prensa?vista=foto', icono: AutoFixHighOutlinedIcon, ayuda: 'Editor de fotos: capas, selecciones, curvas, retoque' },
      { etiqueta: 'Video', ruta: '/prensa?vista=video', icono: MovieFilterOutlinedIcon, ayuda: 'Editor de video: línea de tiempo, títulos, subtítulos automáticos' },
      { etiqueta: 'Formatos y marcos', ruta: '/prensa?vista=media', icono: CropOutlinedIcon, ayuda: 'Encuadre rápido, marcos y rótulos para redes' },
    ],
  },
  {
    // Mapa de relaciones (2026-10-05): todo lo conectado, como el gráfico de
    // Obsidian. Sus capas, búsqueda y enfoque van dentro del propio mapa.
    id: 'mapa',
    nombre: 'Mapa de relaciones',
    corto: 'Mapa',
    ruta: '/mapa',
    icono: HubOutlinedIcon,
    descripcion: 'Cómo se conectan documentos, proyectos, semanas, personas e instituciones: buscar, enfocar y navegar.',
    opciones: [],
  },
  {
    // El mismo observatorio de la web con la identidad de la entidad. Sus vistas
    // son las opciones del módulo (una sola navegación, Edison 2026-10-06): la
    // barra propia del observatorio se oculta dentro del sistema y la página
    // traduce `?vista=` al enlace interno (#catalogo, #comparar…).
    id: 'observatorio',
    nombre: 'Observatorio de datos',
    corto: 'Observatorio',
    ruta: '/observatorio',
    icono: InsightsOutlinedIcon,
    descripcion: 'Indicadores de fuentes oficiales con su serie, su método y su fuente, para sustentar los proyectos.',
    opciones: [
      { etiqueta: 'Panorama', ruta: '/observatorio', icono: SpaceDashboardOutlinedIcon, ayuda: 'Qué hay en el acervo, por tema, y quién produce cada cifra' },
      { etiqueta: 'Catálogo', ruta: '/observatorio?vista=catalogo', icono: ViewListOutlinedIcon, ayuda: 'Todos los indicadores, filtrables por tema, institución y territorio' },
      { etiqueta: 'Comparar', ruta: '/observatorio?vista=comparar', icono: StackedLineChartOutlinedIcon, ayuda: 'Hasta seis series en un mismo eje' },
      { etiqueta: 'Fuentes', ruta: '/observatorio?vista=fuentes', icono: SourceOutlinedIcon, ayuda: 'Las instituciones que publican los datos y los estudios que las citan' },
      { etiqueta: 'Método', ruta: '/observatorio?vista=metodo', icono: ScienceOutlinedIcon, ayuda: 'Cómo llega una cifra al observatorio y qué no se le puede pedir' },
    ],
  },
  {
    id: 'directorio',
    nombre: 'Directorio institucional',
    corto: 'Directorio',
    ruta: '/directorio',
    icono: AccountBalanceOutlinedIcon,
    descripcion: 'Contactos, instituciones, autoridades y organigramas.',
    // Contactos primero (2026-10-13, Edison: «como Google Contacts y mucho mejor todavía»).
    opciones: [
      { etiqueta: 'Contactos', ruta: '/directorio', icono: BadgeOutlinedIcon, ayuda: 'Personas y autoridades: llamar, escribir, etiquetas' },
      { etiqueta: 'Nuevo contacto', ruta: '/directorio?nuevo=1', icono: PersonAddAltOutlinedIcon, accion: true, ayuda: 'Nombre, celular, correo, institución y cargo' },
      { etiqueta: 'Instituciones', ruta: '/directorio?pestana=instituciones', icono: ApartmentOutlinedIcon },
      { etiqueta: 'Jerarquía', ruta: '/directorio?pestana=jerarquia', icono: LanOutlinedIcon, ayuda: 'Organigrama: quién depende de quién' },
      { etiqueta: 'Distritos', ruta: '/directorio?pestana=distritos', icono: CakeOutlinedIcon, ayuda: 'Distritos con su ley de creación y aniversario' },
      { etiqueta: 'Mesas de partes', ruta: '/mesas-de-partes', icono: InboxOutlinedIcon, ayuda: 'Datos del titular y accesos para enviar documentos' },
    ],
  },
  {
    // Gestor de las cuentas de las mesas de partes (y otros sitios), como Google Contraseñas o
    // KeePassXC (Edison 2026-10-08). Claves cifradas; la extensión autocompleta el ingreso.
    id: 'contrasenas',
    nombre: 'Contraseñas',
    corto: 'Claves',
    ruta: '/contrasenas',
    icono: KeyOutlinedIcon,
    descripcion: 'Usuarios y claves de las mesas de partes, cifrados.',
    roles: ['administrador', 'secretaria', 'asesor', 'diputado', 'prensa'],
    opciones: [
      { etiqueta: 'Todas las cuentas', ruta: '/contrasenas', icono: KeyOutlinedIcon },
      { etiqueta: 'Agregar cuenta', ruta: '/contrasenas?nueva=1', icono: AddOutlinedIcon, accion: true, soloAdmin: true },
      { etiqueta: 'Importar (Google, KeePassXC)', ruta: '/contrasenas?importar=1', icono: UploadFileOutlinedIcon, soloAdmin: true },
    ],
  },
  {
    id: 'admin',
    nombre: 'Administración',
    corto: 'Admin',
    ruta: '/admin',
    icono: ManageAccountsOutlinedIcon,
    descripcion: 'Cuentas, módulos, avisos, reglas e integraciones del sistema.',
    soloAdmin: true,
    // Secciones (2026-10-18, Edison: «más ordenada y completa»): `?seccion=` en PanelAdmin.tsx.
    opciones: [
      { etiqueta: 'Resumen', ruta: '/admin', icono: SpaceDashboardOutlinedIcon, ayuda: 'Lo pendiente y el estado del sistema' },
      { etiqueta: 'Cuentas', ruta: '/admin?seccion=cuentas', icono: ManageAccountsOutlinedIcon, ayuda: 'Usuarios, contraseñas y datos al primer ingreso' },
      { etiqueta: 'Módulos', ruta: '/admin?seccion=modulos', icono: ToggleOnOutlinedIcon, ayuda: 'Encender y apagar módulos; la mesa de partes virtual' },
      { etiqueta: 'Avisos', ruta: '/admin?seccion=avisos', icono: CampaignOutlinedIcon, ayuda: 'Un aviso en la pantalla de todos' },
      { etiqueta: 'Reglas', ruta: '/admin?seccion=reglas', icono: BoltOutlinedIcon, ayuda: 'Lo que el sistema hace solo y las copias sugeridas' },
      { etiqueta: 'Integraciones', ruta: '/admin?seccion=integraciones', icono: ExtensionOutlinedIcon, ayuda: 'Trámite documentario del Congreso y OpenProject' },
      { etiqueta: 'Uso', ruta: '/admin?seccion=uso', icono: InsightsOutlinedIcon, ayuda: 'Módulos más usados, aparatos, errores y el estado real de cada cuenta' },
      { etiqueta: 'Nueva cuenta', ruta: '/admin?seccion=cuentas&nueva=1', icono: PersonAddAltOutlinedIcon, accion: true, ayuda: 'Crear la cuenta de una persona del equipo' },
    ],
  },
  // Mi perfil (2026-10-12): de la cuenta, no un módulo; se llega desde el menú de la cuenta y el chat.
  {
    id: 'cuenta',
    nombre: 'Mi cuenta',
    corto: 'Cuenta',
    ruta: '/perfil',
    icono: AccountCircleOutlinedIcon,
    descripcion: 'Su perfil: foto, nombre, celular, correo e Info.',
    oculto: true,
    opciones: [],
  },
]

export const modulo = (id: IdModulo): Modulo => MODULOS.find((m) => m.id === id)!

export const esAdmin = () => localStorage.getItem('sgdp_rol') === 'administrador'

/** Los módulos que la cuenta puede ver. */
export const modulosVisibles = () => {
  const rol = localStorage.getItem('sgdp_rol') ?? ''
  return MODULOS.filter(
    (m) =>
      !m.oculto &&
      (!m.soloAdmin || esAdmin()) &&
      // Los módulos no se asignan por rol (Edison 2026-10-06: «cualquiera puede entrar a
      // cualquier módulo»); solo Administración (cuentas y claves) queda para quien administra.
      (!m.roles || m.roles.includes(rol)) &&
      // Apagado en Administración (2026-10-18): fuera del menú para todos.
      moduloActivo(m.id),
  )
}

/**
 * ¿La opción es la página actual? Coincide la ruta y, si la opción lleva
 * consulta, cada clave de su consulta. Una opción SIN consulta solo está
 * activa si la página tampoco lleva ninguna de las claves que usan sus
 * hermanas (así «Bandeja» no se enciende junto con «En revisión»).
 */
export function opcionActiva(o: Opcion, hermanas: Opcion[], ruta: string, consulta: URLSearchParams): boolean {
  const [base, q = ''] = o.ruta.split('?')
  if (base !== ruta) return false
  const propia = new URLSearchParams(q)
  if ([...propia.keys()].length) return [...propia.entries()].every(([k, v]) => consulta.get(k) === v)
  const clavesHermanas = hermanas.flatMap((h) => [...new URLSearchParams(h.ruta.split('?')[1] ?? '').keys()])
  return !clavesHermanas.some((k) => consulta.has(k))
}

const ENV = import.meta.env as Record<string, string | undefined>

/** Lo que es otro sistema se abre en pestaña nueva, con la dirección del `.env`
 *  (nada de la entidad en el código); sin dirección, se muestra atenuado. */
export const SISTEMAS_EXTERNOS: { titulo: string; texto: string; url?: string; clave: 'tareas' | 'identidad' }[] = [
  { clave: 'tareas', titulo: 'Tareas y agenda', texto: 'Espejo opcional en OpenProject (Qillqa es la fuente).', url: ENV.VITE_URL_TAREAS },
  { clave: 'identidad', titulo: 'Identidad visual', texto: 'Colores, tipografías, plantillas y piezas gráficas.', url: ENV.VITE_URL_IDENTIDAD },
]

export const nombreDespacho = () => ENV.VITE_NOMBRE_DESPACHO || 'Entidad de demostración'

/**
 * Estado que acompaña a una navegación hecha DESDE EL MENÚ (cajón, franja,
 * barra inferior, Inicio). La bandeja lo usa para distinguir «abrí
 * Gestión documental» (todos los documentos) de «volví de un documento»
 * (recupera el filtro que tenía).
 */
export const DESDE_MENU = { state: { desdeMenu: true } } as const

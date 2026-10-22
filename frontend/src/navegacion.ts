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
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import LanOutlinedIcon from '@mui/icons-material/LanOutlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined'
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined'
import MovieFilterOutlinedIcon from '@mui/icons-material/MovieFilterOutlined'
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined'
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined'
import type { ModuloWeb } from '@qillqa/tiqsi'
import { MEDIATECA } from '@qillqa/rikchay/modulo'
import { RENDICION } from '@qillqa/yupay/modulo'
import { MINKA } from '@qillqa/minka/modulo'
import { RIMAY } from '@qillqa/rimay/modulo'
import { PUNKU } from '@qillqa/punku/modulo'
import { DOCUMENTOS, PROYECTOS, REPRESENTACION } from '@qillqa/qillqasqa/modulo'
import { QHAWANA } from '@qillqa/qhawana/modulo'
import { WAYRA } from '@qillqa/wayra/modulo'
import { moduloActivo } from './modulos'

export type IdModulo = 'inicio' | 'documentos' | 'recibidos' | 'proyectos' | 'representacion' | 'rendicion' | 'fototeca' | 'prensa' | 'mapa' | 'observatorio' | 'obs' | 'directorio' | 'contrasenas' | 'admin' | 'tareas' | 'chat' | 'cuenta'

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

/** Un módulo aislado entra al menú por su manifiesto web (Tiqsi): lo que declara él, con los tipos de Qillqa. */
const desdeManifiesto = (m: ModuloWeb): Modulo => ({
  id: m.id as IdModulo,
  nombre: m.nombre,
  corto: m.corto ?? m.nombre,
  ruta: m.ruta,
  icono: m.icono as SvgIconComponent,
  descripcion: m.descripcion ?? '',
  opciones: (m.opciones ?? []) as Opcion[],
  ...(m.roles ? { roles: m.roles } : {}),
  ...(m.soloAdmin ? { soloAdmin: true } : {}),
})

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
  // Gestión documental, Proyectos de ley y la Semana entran por su manifiesto (Qillqasqa, fase 10.2b Q6b-3):
  // @qillqa/qillqasqa/modulo (en su repositorio desde el 2026-10-22).
  desdeManifiesto(DOCUMENTOS),
  // La Mesa de Partes entra por su manifiesto (Punku, fase 10.2b P4): componentes/entradas/modulo.ts.
  desdeManifiesto(PUNKU),
  // Tareas y Agenda entra por su manifiesto (Minka, su repositorio desde el 2026-10-22: @qillqa/minka/modulo).
  desdeManifiesto(MINKA),
  // El chat entra por su manifiesto (Rimay, fase 10.2b R4): componentes/chat/modulo.ts.
  desdeManifiesto(RIMAY),
  desdeManifiesto(PROYECTOS),
  desdeManifiesto(REPRESENTACION),
  // Rendición de cuentas entra por su manifiesto (Yupay, su repositorio desde el 2026-10-22: @qillqa/yupay/modulo).
  desdeManifiesto(RENDICION),
  // La Mediateca entra por su manifiesto (fase 10.2b, Tiqsi web): nombre, ruta, icono y opciones los declara ella
  // (su repositorio, Rikchay: @qillqa/rikchay/modulo); el lugar en el menú lo decide Qillqa, aquí.
  desdeManifiesto(MEDIATECA),
  {
    // Prensa (2026-10-06): las piezas de prensa y los editores de piezas, fotos y videos (módulos Awana, Tullpu y
    // Kuyuy desde E2–E5, 2026-10-21). Las fotos salen de la Mediateca (la única biblioteca) y lo exportado se guarda
    // solo en ella (ámbito «prensa»).
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
      // Lo exportado vive solo en la Mediateca (2026-10-20): se ve en su panel «Prensa», no en una pantalla aparte.
      { etiqueta: 'En la Mediateca', ruta: '/fototeca?prensa=todo', icono: PhotoLibraryOutlinedIcon, ayuda: 'Posts, historias, portadas y videos exportados del estudio' },
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
  // El Observatorio entra por su manifiesto (Qhawana, su repositorio desde el 2026-10-22: @qillqa/qhawana/modulo).
  desdeManifiesto(QHAWANA),
  // El kit de transmisiones entra por su manifiesto (Wayra, su repositorio: @qillqa/wayra/modulo). En E5, bajo Prensa.
  desdeManifiesto(WAYRA),
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

export const esAdmin = () => localStorage.getItem('qillqa_rol') === 'administrador'

/** Los módulos que la cuenta puede ver. */
export const modulosVisibles = () => {
  const rol = localStorage.getItem('qillqa_rol') ?? ''
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

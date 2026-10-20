import { ACEPTA_FIRMADO, subirFirmado } from '../firmados'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import CompareOutlinedIcon from '@mui/icons-material/CompareOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import VisorComparar from '../componentes/VisorComparar'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import AltRouteOutlinedIcon from '@mui/icons-material/AltRouteOutlined'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import { DialogoMesaDePartes } from '../componentes/MesaDePartes'
import VistasBandeja, { type VistaBandeja } from '../componentes/VistasBandeja'
import VisorRapido from '../componentes/VisorRapido'
import { abreVisorRapido } from '../visorRapido'
import { pulsacionLarga, SX_SIN_SELECCION } from '../pulsacionLarga'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { PALETA } from '../paleta'
import Container from '@mui/material/Container'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import TablePagination from '@mui/material/TablePagination'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Dialog from '@mui/material/Dialog'
import Divider from '@mui/material/Divider'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import SearchIcon from '@mui/icons-material/Search'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import SaveIcon from '@mui/icons-material/Save'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import TuneIcon from '@mui/icons-material/Tune'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import EditNoteIcon from '@mui/icons-material/EditNote'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import Collapse from '@mui/material/Collapse'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import Marco from '../componentes/Marco'
import { api, esSinServidor, subirArchivo, descargarArchivo, traerArchivo } from '../api'
import { ofrecerAlVolver } from '../componentes/AvisoAlVolver'
import ElegirEntrada from '../componentes/ElegirEntrada'
import { copiarTexto, textoDeMensaje, valorDelBloque } from '../pegar'
import {
  carpetaGuardada,
  elegirCarpeta,
  escribirEn,
  guardarEn,
  puedeElegirCarpeta,
} from '../descargas'
import Checkbox from '@mui/material/Checkbox'
import Badge from '@mui/material/Badge'
import DownloadIcon from '@mui/icons-material/Download'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { COLOR_ESTADO, ETIQUETA_ESTADO } from '../estados'
import { EstadoDocumento } from '../componentes/Estilo'
import DialogoIncorporar from '../componentes/DialogoIncorporar'
import CargarWordDocumentos from '../componentes/CargarWordDocumentos'
import { type CampoEsquema } from '../componentes/FormularioCampos'
import AvisoSync from '../componentes/AvisoSync'
import GuiaFlujo from '../componentes/GuiaFlujo'
import BarraSinConexion from '../componentes/BarraSinConexion'
import BotonActualizar from '../componentes/BotonActualizar'
import BotonPaso from '../componentes/BotonPaso'
import type { Etapa } from '../flujo'
import PanelSeguimiento, {
  ChipTramite,
  faltaTramite,
  type Tramite,
  type MiembroEquipo,
} from '../componentes/PanelSeguimiento'
import { avisar, confirmar } from '../componentes/Dialogos'

interface Recepcion {
  id: number
  etiqueta: string
}

type Pieza = 'pdf' | 'firmado' | 'cargos' | 'expediente'
const textoPiezas = (p: Set<Pieza>) =>
  [...p].map((k) => ({ pdf: 'PDF', firmado: 'firmados', cargos: 'cargos', expediente: 'expedientes' }[k])).join(' + ')

interface ResumenDocumento {
  id: number
  tipo: string
  tipo_nombre: string
  numero: number | null
  numero_completo: string
  estado: string
  origen: string
  asunto: string
  destinatario: string
  folios: number | null
  firmado_id: number | null
  recepciones: Recepcion[]
  destinatarios: string[]
  instituciones: string[]
  anexos: number
  transiciones: string[]
  procesado_por: string
  // Ruta del oficio (generado → enviado → constancia → STD) y su check verde.
  tramite: Tramite
  // Quién tiene el documento en mano y cuántas observaciones/indicaciones
  // siguen abiertas (Edison 2026-09-04).
  responsable: string
  /** Quién tiene el encargo (lo envía la API; «A mi cargo» lo compara con la sesión). */
  responsable_id?: number | null
  comentarios_pendientes: number
  oculto: boolean
  actualizado_en: string
  // Fecha OFICIAL del documento (campos.fecha, ISO); la columna «Fecha» la
  // muestra. actualizado_en (última modificación) pasa al tooltip.
  fecha: string | null
}

interface TipoDoc {
  codigo: string
  nombre: string
  serie?: string
  campos?: CampoEsquema[]
  /** Su PDF se hace fuera del editor (ISR, recibido): no se ofrece en «Nuevo documento». */
  externo?: boolean
}

// El ISR se numera y registra desde Semana de representación, que tiene sus datos y su
// PDF aprobado (Edison 2026-10-02); aquí solo se ve, se firma y se entrega.
const SOLO_DESDE_SU_MODULO = ['informe_sr']

type Estado = 'cargando' | 'error' | 'ok'

// De dónde salió el documento (va en el tooltip del número, no en un chip).
const ETIQUETA_ORIGEN: Record<string, string> = {
  sgdp: 'Plataforma',
  framework: 'Archivo (LaTeX)',
  manual: 'Elaborado fuera del sistema (PDF incorporado)',
}

// «Nuevo documento» es el paso 1 del proceso: fuera de un documento no hay
// avance que medir, así que la etapa se arma a mano y siempre está pendiente.
// Los pasos 2 a 7 se numeran ya dentro del documento (ver flujo.ts).
const PASO_NUEVO: Etapa = {
  clave: 'redactar',
  titulo: 'Redactar',
  accion: 'redactar',
  // 2026-10-06: ayuda acortada (los pasos numerados los explica GuiaFlujo).
  ayuda: 'Empiece aquí: cree y redacte el documento.',
  orden: 1,
  hecho: false,
  actual: true,
}

// La vista de la bandeja se conserva durante la SESIÓN del navegador
// (sessionStorage): al volver de un documento o de otra sección se restauran
// filtros, orden, página y posición sin reiniciar nada (regla Edison
// 2026-08-24). Una sesión NUEVA parte del predeterminado; orden/dirección/
// filas se siembran de localStorage (predeterminado de largo plazo).
const CLAVE_SS = 'sgdp_bandeja'
const leerSS = (k: string): string | null => {
  try {
    return sessionStorage.getItem(`${CLAVE_SS}_${k}`)
  } catch {
    return null
  }
}
const guardarSS = (k: string, v: string): void => {
  try {
    sessionStorage.setItem(`${CLAVE_SS}_${k}`, v)
  } catch {
    /* modo privado / cuota llena: la continuidad es best-effort */
  }
}

// Columnas de la bandeja. El orden DEBE coincidir con el de las celdas del
// cuerpo. `texto` = admite recorte a 1/2/3 líneas; las demás llevan widgets.
// El admin ajusta ancho/líneas y los guarda como predeterminado de la entidad.
interface ColDef {
  key: string
  label: string
  texto: boolean
  align?: 'center' | 'right'
  /** El rol invitado (cuenta de consulta) no la ve: dato interno del equipo. */
  soloEquipo?: boolean
  /** Columna de la mecánica de la tabla (la casilla de selección): no se
   *  configura, no se redimensiona y no viaja al ajuste `bandeja_columnas`. */
  fija?: boolean
  anchoDef: number
  lineasDef: number
}
const COLUMNAS: ColDef[] = [
  // Casilla para marcar documentos y descargar sus PDF de una vez
  // (Edison 2026-09-08). Va primera, como en cualquier lista con selección.
  { key: 'sel', label: '', texto: false, align: 'center', fija: true, anchoDef: 46, lineasDef: 1 },
  // SEGUIMIENTO entre las primeras (Edison 2026-10-01: «es una función
  // importante dentro del flujo de trabajo»): antes iba al final, tras la
  // fecha, mezclado con ocultar y eliminar. Fija como la casilla: siempre a la
  // vista, sin ancho configurable.
  { key: 'seguimiento', label: 'Seguimiento', texto: false, align: 'center', fija: true, anchoDef: 44, lineasDef: 1 },
  // Tipo en 2 líneas: «Oficio múltiple», «Memorando circular»… se acomodan
  // al ancho sin cortar ni ensanchar la columna (pedido 2026-08-24).
  { key: 'tipo', label: 'Tipo', texto: true, anchoDef: 110, lineasDef: 2 },
  { key: 'numero', label: 'N.º de documento', texto: true, anchoDef: 96, lineasDef: 1 },
  { key: 'asunto', label: 'Asunto', texto: true, anchoDef: 280, lineasDef: 2 },
  { key: 'destinatario', label: 'Destinatario', texto: true, anchoDef: 180, lineasDef: 2 },
  { key: 'institucion', label: 'Institución destino', texto: true, anchoDef: 150, lineasDef: 2 },
  { key: 'estado', label: 'Estado', texto: false, anchoDef: 120, lineasDef: 1 },
  { key: 'folios', label: 'Folios', texto: false, align: 'center', anchoDef: 68, lineasDef: 1 },
  { key: 'firmado', label: 'Firmado', texto: false, align: 'center', anchoDef: 76, lineasDef: 1 },
  { key: 'recepcion', label: 'Recepción', texto: false, align: 'center', anchoDef: 92, lineasDef: 1 },
  // Check verde del proceso documental completo: generado + enviado +
  // constancia de recepción + registrado en el STD del Congreso.
  { key: 'tramite', label: 'Trámite', texto: false, align: 'center', anchoDef: 80, lineasDef: 1 },
  // Check de registro en el STD del Congreso (Edison 2026-09-05): se ve de un
  // vistazo qué documento ya se cargó al sistema de trámite.
  { key: 'std', label: 'STD', texto: false, align: 'center', anchoDef: 64, lineasDef: 1 },
  { key: 'responsable', label: 'Responsable', texto: true, anchoDef: 130, lineasDef: 2 },
  { key: 'anexos', label: 'Anexos', texto: false, align: 'center', anchoDef: 72, lineasDef: 1 },
  // Visible para todo el equipo (Edison 2026-10-01; antes solo el
  // administrador): quién hizo cada documento es parte del recorrido.
  { key: 'procesado', label: 'Procesado por', texto: true, soloEquipo: true, anchoDef: 130, lineasDef: 1 },
  { key: 'fecha', label: 'Fecha', texto: true, anchoDef: 100, lineasDef: 1 },
  { key: 'acciones', label: '', texto: false, align: 'right', anchoDef: 88, lineasDef: 1 },
]
const COLMAP: Record<string, ColDef> = Object.fromEntries(COLUMNAS.map((c) => [c.key, c]))
// Claves que SÍ se guardan como ajuste (las fijas no existen para el servidor).
const CLAVES_AJUSTABLES = COLUMNAS.filter((c) => !c.fija).map((c) => c.key)
function cuerpoColumnas(
  anchos: Record<string, number>,
  lineas: Record<string, number>,
): { anchos: Record<string, number>; lineas: Record<string, number> } {
  const soloAjustables = <T,>(o: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(o).filter(([k]) => CLAVES_AJUSTABLES.includes(k)))
  return { anchos: soloAjustables(anchos), lineas: soloAjustables(lineas) }
}
const ANCHOS_DEF: Record<string, number> = Object.fromEntries(COLUMNAS.map((c) => [c.key, c.anchoDef]))
const LINEAS_DEF: Record<string, number> = Object.fromEntries(COLUMNAS.map((c) => [c.key, c.lineasDef]))

/** El estado de la consulta `?estado=` solo vale si es un estado conocido. */
const estadoValido = (v: string | null): string | null =>
  v && v in ETIQUETA_ESTADO ? v : null

/** Fecha oficial (dd/mm/aaaa) o, sin ella, la de la última modificación. */
const fechaVisible = (doc: { fecha: string | null; actualizado_en: string }) =>
  doc.fecha && /^\d{4}-\d{2}-\d{2}/.test(doc.fecha)
    ? doc.fecha.slice(0, 10).split('-').reverse().join('/')
    : new Date(doc.actualizado_en).toLocaleDateString('es-PE')

/** El id de la cuenta en sesión (va en el token: `sub`). */
const miId = (): number | null => {
  try {
    const t = localStorage.getItem('sgdp_token') ?? ''
    return Number(JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub) || null
  } catch {
    return null
  }
}
const esMio = (d: ResumenDocumento) =>
  (d.responsable_id != null && d.responsable_id === miId()) ||
  (Boolean(d.responsable) && d.responsable === localStorage.getItem('sgdp_nombre'))

/** Las etapas del trabajo, en el orden del flujo, con el nombre de lo que toca. */
const ETAPAS_BANDEJA: { estado: string; texto: string; ayuda: string }[] = [
  { estado: 'BORRADOR', texto: 'Borradores', ayuda: 'En redacción' },
  { estado: 'EN_REVISION', texto: 'En revisión', ayuda: 'Esperan revisión' },
  { estado: 'OBSERVADO', texto: 'Observados', ayuda: 'Hay que corregir' },
  { estado: 'APROBADO', texto: 'Por firmar', ayuda: 'Aprobados, esperan la firma' },
  { estado: 'FIRMADO', texto: 'Por enviar', ayuda: 'Firmados, falta enviarlos' },
  { estado: 'ENVIADO', texto: 'Enviados', ayuda: 'Salieron de la entidad' },
]

/**
 * La bandeja por etapas, como PESTAÑAS (Edison 2026-10-01: «hay mucha
 * duplicidad y esas cajas no van»): Todos y cada etapa con su número, en una
 * línea; la elegida subrayada. «A mi cargo» a la derecha, como interruptor.
 * Sustituye al desplegable «Estado» de la barra (los estados poco comunes,
 * como Archivado, siguen en «Más filtros»).
 */
function EtapasBandeja({ documentos, estado, soloMios, alElegir, alMios }: {
  documentos: ResumenDocumento[]; estado: string; soloMios: boolean; alElegir: (estado: string) => void; alMios: () => void
}) {
  const visibles = documentos.filter((d) => !d.oculto)
  const n = (e: string) => visibles.filter((d) => d.estado === e).length
  const mios = visibles.filter(esMio).length
  const pestanas = [
    { clave: 'TODOS', texto: 'Todos', ayuda: 'Todos los documentos', cuenta: visibles.length, color: '' },
    ...ETAPAS_BANDEJA.map((e) => ({ clave: e.estado, texto: e.texto, ayuda: e.ayuda, cuenta: n(e.estado), color: COLOR_ESTADO[e.estado] ?? PALETA.borrador })),
  ]
  const fuera = estado !== 'TODOS' && !pestanas.some((p) => p.clave === estado)
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, mb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box role="tablist" aria-label="Etapas del documento" sx={{ flex: 1, minWidth: 0, display: 'flex', overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
        {pestanas.map((p) => {
          const activa = estado === p.clave
          return (
            <Tooltip key={p.clave} title={p.ayuda} enterDelay={600}>
              <ButtonBase
                role="tab"
                aria-selected={activa}
                onClick={() => alElegir(p.clave)}
                sx={{
                  flexShrink: 0, gap: 0.75, px: { xs: 1.25, sm: 1.75 }, py: 1.1, fontSize: 14, fontWeight: activa ? 700 : 500,
                  color: activa ? 'primary.main' : 'text.secondary',
                  boxShadow: activa ? 'inset 0 -2px 0 currentColor' : 'none',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                {p.color && <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: p.color, opacity: p.cuenta ? 1 : 0.4 }} />}
                {p.texto}
                <Box component="span" sx={{ fontSize: 12, fontWeight: 600, minWidth: 22, px: 0.75, py: 0.1, borderRadius: 5, textAlign: 'center', fontVariantNumeric: 'tabular-nums', bgcolor: activa ? PALETA.guindaSuave : PALETA.superficieMedia, color: activa ? 'primary.main' : p.cuenta ? 'text.secondary' : PALETA.apagado }}>
                  {p.cuenta}
                </Box>
              </ButtonBase>
            </Tooltip>
          )
        })}
        {fuera && (
          <Box sx={{ flexShrink: 0, px: 1.75, py: 1.1, fontSize: 14, fontWeight: 700, color: 'primary.main', boxShadow: 'inset 0 -2px 0 currentColor' }}>
            {ETIQUETA_ESTADO[estado] ?? estado}
          </Box>
        )}
      </Box>
      <Tooltip title="Solo los documentos encargados a usted">
        <Chip
          icon={<PersonOutlineIcon />}
          label={`A mi cargo · ${mios}`}
          onClick={alMios}
          color={soloMios ? 'primary' : 'default'}
          variant={soloMios ? 'filled' : 'outlined'}
          sx={{ mb: 0.75, flexShrink: 0, fontWeight: 600, bgcolor: soloMios ? undefined : 'background.paper' }}
        />
      </Tooltip>
    </Box>
  )
}

export default function Bandeja() {
  // Datos cacheados de la sesión: se pintan AL INSTANTE al volver (evita el
  // parpadeo de recarga) y se refrescan en segundo plano (stale-while-revalidate).
  const [documentos, setDocumentos] = useState<ResumenDocumento[]>(() => {
    try {
      return JSON.parse(leerSS('datos') || '[]') as ResumenDocumento[]
    } catch {
      return []
    }
  })
  const [estado, setEstado] = useState<Estado>(() =>
    documentos.length ? 'ok' : 'cargando',
  )
  const [errorAccion, setErrorAccion] = useState('')
  const [avisoOk, setAvisoOk] = useState('')
  // Entrada doble de «Nuevo documento» (fase 9.5): el selector formulario/prompt, y de dónde
  // viene el pegado que el editor abrirá al crear ('skill' = caja vacía; un número = mensaje del chat).
  const [anclaNuevo, setAnclaNuevo] = useState<HTMLElement | null>(null)
  const [desdePrompt, setDesdePrompt] = useState<string>('')
  // `?pegar=<mid>` sin `nuevo`: un seguimiento del chat; se abre el documento que el bloque
  // nombra o, si no se halla, se avisa aquí con el texto a la mano.
  const [pegarSeg, setPegarSeg] = useState<{ mid: number; texto: string; numero: string } | null>(null)
  const [filtro, setFiltro] = useState(() => leerSS('filtro') ?? '')
  // Las opciones del módulo llegan por la consulta de la URL (navegacion.ts):
  // `?estado=…`, `?nuevo=1`, `?incorporar=1`, `?avanzada=1` (Edison
  // 2026-10-01: «la barra superior debe ser contextual»). Cuando la URL trae
  // estado, manda sobre el filtro guardado en la sesión.
  const [consulta, setConsulta] = useSearchParams()
  const desdeMenu = Boolean((useLocation().state as { desdeMenu?: boolean } | null)?.desdeMenu)
  const paramEstado = estadoValido(consulta.get('estado'))
  const [filtroEstado, setFiltroEstado] = useState(
    () => paramEstado ?? (desdeMenu ? 'TODOS' : leerSS('estado_f') ?? 'TODOS'),
  )
  const [filtroTipo, setFiltroTipo] = useState(() => leerSS('tipo_f') ?? 'TODOS')
  // Búsqueda AVANZADA (server-side): incluye el CONTENIDO del documento y los
  // filtros que la fila no trae (año, destinatario, firma, vínculo). Cuando
  // `busqueda` no es null, la tabla muestra ESOS resultados (el servidor ya
  // filtró) en vez de la lista completa. Regla Edison 2026-09-01.
  const [modoBusqueda, setModoBusqueda] = useState(false)
  const [busqueda, setBusqueda] = useState<ResumenDocumento[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [anio, setAnio] = useState('')
  const [destinatario, setDestinatario] = useState('')
  const [firma, setFirma] = useState('')
  const [vinculo, setVinculo] = useState('')
  // El orden/dirección ELEGIDOS se recuerdan durante la sesión y siembran el
  // predeterminado de la próxima (localStorage). Por omisión, por NÚMERO de mayor a
  // menor, igual en el celular y en la laptop (Edison 2026-10-06); las claves «2» dejan
  // atrás lo que cada equipo había guardado antes («reciente»).
  const [orden, setOrden] = useState<'reciente' | 'numero' | 'tipo'>(
    () =>
      (leerSS('orden2') as 'reciente' | 'numero' | 'tipo') ||
      (localStorage.getItem('sgdp_orden2') as 'reciente' | 'numero' | 'tipo') ||
      'numero',
  )
  const [ordenDir, setOrdenDir] = useState<'asc' | 'desc'>(
    () =>
      (leerSS('orden_dir2') as 'asc' | 'desc') ||
      (localStorage.getItem('sgdp_orden_dir2') as 'asc' | 'desc') ||
      'desc',
  )
  // Paginación (los documentos se acumulan): 10/20/50/100 por página.
  const [pagina, setPagina] = useState(() => Number(leerSS('pagina')) || 0)
  const [porPagina, setPorPagina] = useState(
    () => Number(leerSS('filas')) || Number(localStorage.getItem('sgdp_filas')) || 20,
  )
  const [tipos, setTipos] = useState<TipoDoc[]>([])
  const [menuNuevo, setMenuNuevo] = useState<null | HTMLElement>(null)
  const [dialogoIncorporar, setDialogoIncorporar] = useState(false)
  const [dialogoWord, setDialogoWord] = useState(false)
  const [menuEstado, setMenuEstado] = useState<{ el: HTMLElement; doc: ResumenDocumento } | null>(null)
  const [menuRecepcion, setMenuRecepcion] = useState<{ el: HTMLElement; doc: ResumenDocumento } | null>(null)
  // Cambio de estado CON comentario (Edison 2026-09-04): observar exige decir
  // qué corregir; devolver a borrador permite dejar la indicación del trabajo
  // y encargárselo a alguien. El resto de estados cambia directo, sin diálogo.
  const [dlgEstado, setDlgEstado] = useState<{ doc: ResumenDocumento; destino: string } | null>(null)
  const [comentario, setComentario] = useState('')
  const [encargadoA, setEncargadoA] = useState<number | ''>('')
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([])
  // Registro en el STD desde la propia bandeja (sin abrir el documento).
  const [dlgStd, setDlgStd] = useState<ResumenDocumento | null>(null)
  // Seguimiento y gestión SIN abrir el documento (Edison 2026-09-05): ruta del
  // trámite, encargo a una persona y observaciones. Es el mismo panel del
  // editor, montado en un diálogo: una sola implementación para los dos sitios.
  const [dlgGestion, setDlgGestion] = useState<ResumenDocumento | null>(null)
  const [stdNumero, setStdNumero] = useState('')
  const [stdFecha, setStdFecha] = useState(() => new Date().toISOString().slice(0, 10))
  // Último documento abierto en la sesión: se resalta al volver a la lista.
  const [ultimoDoc] = useState<number | null>(() => Number(leerSS('ultimo')) || null)
  // Config de columnas (ancho px + líneas por columna). Parte del predeterminado
  // y se sobrescribe con lo que el admin guardó (GET al montar). Solo el admin la
  // edita; el resto de usuarios solo la aplica.
  const [anchos, setAnchos] = useState<Record<string, number>>(ANCHOS_DEF)
  const [lineas, setLineas] = useState<Record<string, number>>(LINEAS_DEF)
  const [dlgColumnas, setDlgColumnas] = useState(false)
  const [guardadoJson, setGuardadoJson] = useState('')
  const navegar = useNavigate()
  // Celular (< 600 px) y tableta (< 900 px): el diputado trabaja casi siempre
  // desde el celular (Edison 2026-10-01). En ambos la tabla se vuelve una
  // lista de tarjetas; en el celular, además, los filtros se pliegan.
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const tarjetas = useMediaQuery(tema.breakpoints.down('md'))
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  // Menú ⋮ de una tarjeta: TODAS las acciones que la fila ofrece en la tabla.
  const [menuFila, setMenuFila] = useState<{ el: HTMLElement; doc: ResumenDocumento } | null>(null)
  // Documento cuya mesa de partes se consulta (ícono de «Institución destino» o menú ⋮).
  const [mesaDoc, setMesaDoc] = useState<number | null>(null)
  // Folios desde la tarjeta (en la tabla se escriben en la propia celda).
  const [dlgFolios, setDlgFolios] = useState<ResumenDocumento | null>(null)
  const [foliosTexto, setFoliosTexto] = useState('')
  const refNuevo = useRef<HTMLDivElement>(null)

  // --- La consulta de la URL (opciones del módulo en el Marco) ----------
  /** Cambia claves de la consulta sin sumar pasos al historial. */
  const cambiarConsulta = useCallback(
    (cambios: Record<string, string | null>) =>
      setConsulta(
        (previa) => {
          const n = new URLSearchParams(previa)
          Object.entries(cambios).forEach(([k, v]) => (v === null ? n.delete(k) : n.set(k, v)))
          return n
        },
        { replace: true },
      ),
    [setConsulta],
  )

  // Al VOLVER de un documento sin `?estado=` se recupera el filtro guardado y
  // se escribe en la URL (la pestaña activa del Marco dice lo que se ve). Si
  // se llegó desde el menú («Gestión documental», «Bandeja»), se ven todos.
  useEffect(() => {
    if (!paramEstado && filtroEstado !== 'TODOS') cambiarConsulta({ estado: filtroEstado })
    // Solo al montar: después la URL es la que manda.
  }, [])

  // La URL cambió (una pestaña del Marco, atrás/adelante): el filtro la sigue.
  // «Bandeja» (sin parámetro) = todos los estados.
  // Se compara con el valor anterior (no con «primera pasada») para no
  // pisar el filtro restaurado si el efecto corre dos veces al montar.
  const estadoPrevio = useRef(paramEstado)
  useEffect(() => {
    if (estadoPrevio.current === paramEstado) return
    estadoPrevio.current = paramEstado
    setFiltroEstado(paramEstado ?? 'TODOS')
  }, [paramEstado])

  // El filtro cambiado a mano actualiza la URL («Todos» = sin parámetro).
  // «A mi cargo»: los documentos encargados a quien está en la sesión.
  const [soloMios, setSoloMios] = useState(false)
  const [menuAdmin, setMenuAdmin] = useState<HTMLElement | null>(null)
  const elegirEstado = (v: string) => {
    setFiltroEstado(v)
    cambiarConsulta({ estado: v === 'TODOS' ? null : v })
  }

  // `?nuevo=1`: abre la elección «formulario o prompt» anclada a su botón; con `&pegar=<mid>`
  // (del chat) se trae el bloque y, si dice el tipo documental, se crea el borrador de ese tipo
  // y el editor se abre con el pegado ya leído; si no lo dice, se pide el tipo.
  // `?incorporar=1`: abre el diálogo de incorporar. Las dos son acciones de
  // un solo uso: se ejecutan y la consulta se borra (replace).
  const pideNuevo = consulta.get('nuevo') === '1'
  const pideIncorporar = consulta.get('incorporar') === '1'
  const pidePegar = Number(consulta.get('pegar') ?? '') || 0
  const tiposRef = useRef<TipoDoc[]>([])
  tiposRef.current = tipos
  // `?nuevo=1&tipo=oficio`: «Hacer ahora» de un «Crear al volver» (sin servidor no se pudo crear, 2026-10-18).
  const tipoPedido = consulta.get('tipo') ?? ''
  useEffect(() => {
    if (!pideNuevo) return
    cambiarConsulta({ nuevo: null, pegar: null, tipo: null })
    if (tipoPedido && tiposRef.current.some((x) => x.codigo === tipoPedido && !x.externo)) {
      void nuevoDocumento(tipoPedido, '')
      return
    }
    if (!pidePegar) {
      if (refNuevo.current) setAnclaNuevo(refNuevo.current)
      return
    }
    textoDeMensaje(pidePegar)
      .then((texto) => {
        const t = valorDelBloque(texto, 'tipo_documental').toLowerCase().replace(/\s+/g, '_')
        if (tiposRef.current.some((x) => x.codigo === t && !x.externo)) return nuevoDocumento(t, String(pidePegar))
        setDesdePrompt(String(pidePegar))
        if (refNuevo.current) setMenuNuevo(refNuevo.current)
      })
      .catch(() => {
        setErrorAccion('No se pudo traer el mensaje del chat; cree el documento y pegue el texto a mano.')
        setDesdePrompt('skill')
        if (refNuevo.current) setMenuNuevo(refNuevo.current)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pideNuevo, pidePegar, cambiarConsulta])
  // `?pegar=<mid>` solo (seguimiento desde el chat): el bloque dice el documento; se abre con el
  // pegado precargado. Si no está en la bandeja, el aviso queda aquí con el texto para copiar.
  useEffect(() => {
    if (pideNuevo || !pidePegar) return
    cambiarConsulta({ pegar: null })
    textoDeMensaje(pidePegar)
      .then((texto) => setPegarSeg({ mid: pidePegar, texto, numero: valorDelBloque(texto, 'documento') }))
      .catch(() => setErrorAccion('No se pudo traer el mensaje del chat.'))
  }, [pideNuevo, pidePegar, cambiarConsulta])
  useEffect(() => {
    if (!pegarSeg || estado === 'cargando') return
    const n = pegarSeg.numero.trim().toLowerCase()
    const doc = n ? documentos.find((d) => d.numero_completo.toLowerCase() === n) ?? documentos.find((d) => d.numero_completo.toLowerCase().includes(n)) : undefined
    if (doc) {
      setPegarSeg(null)
      navegar(`/documentos/${doc.id}?pegar=${pegarSeg.mid}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pegarSeg, estado, documentos])
  useEffect(() => {
    if (!pideIncorporar) return
    setDialogoIncorporar(true)
    cambiarConsulta({ incorporar: null })
  }, [pideIncorporar, cambiarConsulta])

  // `?avanzada=1`: el panel de búsqueda avanzada se abre y la consulta se
  // queda mientras esté abierto (la pestaña del Marco sigue encendida); al
  // cerrarlo se quita. Abrirlo con «Más filtros» también la pone.
  // El estado del panel ES la consulta: una sola fuente, sin desfase posible.
  const panelAvanzado = consulta.get('avanzada') === '1'
  const alternarPanelAvanzado = () => cambiarConsulta({ avanzada: panelAvanzado ? null : '1' })

  const cambiarOrden = (v: 'reciente' | 'numero' | 'tipo') => {
    setOrden(v)
    guardarSS('orden2', v)
    localStorage.setItem('sgdp_orden2', v)
  }
  const alternarDir = () => {
    setOrdenDir((d) => {
      const nuevo = d === 'asc' ? 'desc' : 'asc'
      guardarSS('orden_dir2', nuevo)
      localStorage.setItem('sgdp_orden_dir2', nuevo)
      return nuevo
    })
  }
  const esAdmin = localStorage.getItem('sgdp_rol') === 'administrador'
  // Mismo criterio que el backend (flujo.py::ve_autoria).
  const esEquipo = localStorage.getItem('sgdp_rol') !== 'invitado'

  // Abrir un documento recordándolo como «último abierto» de la sesión. `reemplazar`: desde el visor
  // rápido, cuya entrada del historial se sustituye (así «atrás» desde el documento vuelve a la bandeja).
  const abrir = (docId: number, reemplazar = false) => {
    guardarSS('ultimo', String(docId))
    navegar(`/documentos/${docId}`, { replace: reemplazar })
  }
  // TOCAR un documento (fila, tarjeta o ficha): se ve de inmediato en el visor rápido (Edison
  // 2026-10-19, desde el celular; ese mismo día pidió que también los borradores abran el visor). El
  // documento completo sigue a un toque largo, en el ⋮, en «Abrir documento» y en el propio visor.
  const [rapido, setRapido] = useState<number | null>(null)
  const tocar = (docId: number) => {
    const d = documentos.find((x) => x.id === docId)
    if (d && abreVisorRapido(d.estado)) {
      guardarSS('ultimo', String(docId))
      setRapido(docId)
    } else abrir(docId)
  }

  // Un borrador nuevo con todo lo de otro documento (POST /duplicar); se abre al instante.
  const duplicar = async (docId: number) => {
    try {
      const r = await api<{ id: number }>(`/api/documentos/${docId}/duplicar`, { method: 'POST' })
      abrir(r.id)
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo duplicar.')
    }
  }

  // --- Config de columnas (ancho/líneas, estilo Excel) -----------------
  const columnasVisibles = COLUMNAS.filter((c) => !c.soloEquipo || esEquipo)
  const anchoTotal = columnasVisibles.reduce((s, c) => s + (anchos[c.key] ?? c.anchoDef), 0)

  // sx de recorte del contenido según el nº de líneas de la columna.
  const sxLineas = (key: string) => {
    const n = lineas[key] ?? COLMAP[key]?.lineasDef ?? 1
    return n <= 1
      ? { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }
      : {
          display: '-webkit-box',
          WebkitLineClamp: n,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }
  }

  const setAncho = (key: string, px: number) =>
    setAnchos((a) => ({ ...a, [key]: Math.max(48, Math.min(900, Math.round(px) || 0)) }))
  const setLinea = (key: string, n: number) => setLineas((l) => ({ ...l, [key]: n }))
  const restablecerColumnas = () => {
    setAnchos(ANCHOS_DEF)
    setLineas(LINEAS_DEF)
  }

  // Arrastre del borde derecho del encabezado (estilo Excel). Solo admin.
  const iniciarRedim = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const inicioX = e.clientX
    const inicioW = anchos[key] ?? COLMAP[key]?.anchoDef ?? 120
    const mover = (ev: MouseEvent) => setAncho(key, inicioW + (ev.clientX - inicioX))
    const soltar = () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
  }

  // --- Selección múltiple para descargar varios PDF (Edison 2026-09-08) ---
  // Se guardan los ids: sobreviven al filtrado y a la paginación, así que se
  // puede marcar en una página, cambiar de página y seguir sumando.
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  // Otras formas de ver la bandeja (2026-10-05): la elección se recuerda en
  // este equipo; la lista sigue siendo la de siempre.
  const [vista, setVista] = useState<VistaBandeja>(() => {
    try {
      const v = localStorage.getItem('sgdp_bandeja_vista') as VistaBandeja | null
      return v && ['lista', 'etapas', 'seguimiento', 'instituciones', 'cronologia'].includes(v) ? v : 'lista'
    } catch {
      return 'lista'
    }
  })
  const cambiarVista = (v: VistaBandeja | null) => {
    if (!v) return
    setVista(v)
    try {
      localStorage.setItem('sgdp_bandeja_vista', v)
    } catch {
      /* solo esta vez */
    }
  }
  const [bajando, setBajando] = useState<{ hecho: number; total: number } | null>(null)
  // Qué versiones bajar de los seleccionados (2026-10-10) y comparar varios PDF a la vez.
  const [menuDescarga, setMenuDescarga] = useState<HTMLElement | null>(null)
  const [piezas, setPiezas] = useState<Set<Pieza>>(new Set<Pieza>(['pdf']))
  const [comparando, setComparando] = useState(false)
  const [carpeta, setCarpeta] = useState<string>('')
  useEffect(() => {
    void carpetaGuardada().then((d) => setCarpeta(d?.name ?? ''))
  }, [])

  const alternar = (id: number) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const elegirCarpetaDescargas = async () => {
    const dir = await elegirCarpeta()
    if (dir) {
      setCarpeta(dir.name)
      setAvisoOk(`Las descargas se guardarán en «${dir.name}».`)
    }
  }

  /** Baja el PDF de cada documento marcado. Con carpeta elegida se escriben
   *  todos ahí de una vez; sin ella, el navegador los manda a Descargas (y
   *  puede pedir permiso para varias descargas seguidas). */
  const descargarSeleccionados = async () => {
    const ids = [...seleccion]
    if (ids.length === 0) return
    // Cada documento aporta las versiones elegidas que tenga; el nombre lo pone el servidor.
    const tareas: { doc: ResumenDocumento | undefined; url: string }[] = []
    for (const id of ids) {
      const doc = documentos.find((d) => d.id === id)
      if (piezas.has('pdf')) tareas.push({ doc, url: `/api/documentos/${id}/pdf` })
      if (piezas.has('firmado') && doc?.firmado_id) tareas.push({ doc, url: `/api/documentos/${id}/adjuntos/${doc.firmado_id}` })
      if (piezas.has('cargos')) for (const r of doc?.recepciones ?? []) tareas.push({ doc, url: `/api/documentos/${id}/adjuntos/${r.id}` })
      if (piezas.has('expediente') && doc?.firmado_id) tareas.push({ doc, url: `/api/documentos/${id}/expediente` })
    }
    if (tareas.length === 0) {
      setErrorAccion('Ninguno de los seleccionados tiene las versiones elegidas.')
      return
    }
    let dir = await carpetaGuardada()
    if (!dir && puedeElegirCarpeta()) {
      dir = await elegirCarpeta()
      // Cancelar el selector cancela TODA la operación: preguntar destino
      // veinte veces seguidas, una por documento, sería peor que no hacer nada.
      if (!dir) return
      setCarpeta(dir.name)
    }
    setBajando({ hecho: 0, total: tareas.length })
    const fallos: string[] = []
    let hecho = 0
    for (const t of tareas) {
      try {
        const archivo = await traerArchivo(t.url)
        if (dir) await escribirEn(dir, archivo.nombre, archivo.blob)
        else await guardarEn(archivo.blob, archivo.nombre)
      } catch {
        fallos.push(t.doc?.numero_completo ?? t.url)
      }
      hecho += 1
      setBajando({ hecho, total: tareas.length })
    }
    setBajando(null)
    const bien = tareas.length - fallos.length
    if (fallos.length === 0) {
      setAvisoOk(
        dir
          ? `${bien} archivo(s) guardados en «${dir.name}».`
          : `${bien} archivo(s) descargados.`,
      )
      setSeleccion(new Set())
    } else {
      setErrorAccion(
        `Se bajaron ${bien} de ${tareas.length}. Con error: ${[...new Set(fallos)].join(', ')}.`,
      )
    }
  }

  // Casilla de la cabecera: actúa sobre los documentos de la PÁGINA visible
  // (marcar 500 de golpe sin verlos sería una descarga a ciegas).
  const cabeceraSeleccion = () => {
    const idsPagina = paginados.map((d) => d.id)
    const marcados = idsPagina.filter((id) => seleccion.has(id)).length
    return (
      <Tooltip title={marcados === idsPagina.length && marcados > 0 ? 'Quitar la selección de esta página' : 'Seleccionar los de esta página'}>
        <Checkbox
          size="small"
          sx={{ p: 0.25 }}
          checked={idsPagina.length > 0 && marcados === idsPagina.length}
          indeterminate={marcados > 0 && marcados < idsPagina.length}
          onChange={(e) =>
            setSeleccion((sel) => {
              const n = new Set(sel)
              idsPagina.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id)))
              return n
            })
          }
          inputProps={{ 'aria-label': 'Seleccionar los documentos de esta página' }}
        />
      </Tooltip>
    )
  }

  const guardarColumnas = async () => {
    const cuerpo = cuerpoColumnas(anchos, lineas)
    try {
      await api('/api/ajustes/bandeja-columnas', {
        method: 'PUT',
        body: JSON.stringify(cuerpo),
      })
      setGuardadoJson(JSON.stringify(cuerpo))
      setAvisoOk('Configuración de columnas guardada como predeterminada para todos.')
      setDlgColumnas(false)
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo guardar la configuración.')
    }
  }
  // Hay cambios sin guardar (para ofrecer «Guardar» tras arrastrar/editar).
  const hayCambiosColumnas =
    esAdmin && guardadoJson !== '' && JSON.stringify(cuerpoColumnas(anchos, lineas)) !== guardadoJson

  useEffect(() => {
    api<TipoDoc[]>('/api/tipos').then(setTipos).catch(() => {})
  }, [])

  // Config de columnas guardada por el admin (la aplican TODOS los usuarios).
  useEffect(() => {
    api<{ anchos?: Record<string, number>; lineas?: Record<string, number> }>(
      '/api/ajustes/bandeja-columnas',
    )
      .then((cfg) => {
        const a = { ...ANCHOS_DEF, ...(cfg.anchos || {}) }
        const l = { ...LINEAS_DEF, ...(cfg.lineas || {}) }
        setAnchos(a)
        setLineas(l)
        setGuardadoJson(JSON.stringify(cuerpoColumnas(a, l)))
      })
      .catch(() =>
        setGuardadoJson(JSON.stringify({ anchos: ANCHOS_DEF, lineas: LINEAS_DEF })),
      )
  }, [])

  // Se refresca en segundo plano; si ya hay datos cacheados NO se muestra el
  // spinner (continuidad visual). El resultado se cachea para la sesión.
  const hayDatos = useRef(documentos.length > 0)
  useEffect(() => {
    hayDatos.current = documentos.length > 0
  }, [documentos.length])

  const cargar = useCallback(() => {
    if (!hayDatos.current) setEstado('cargando')
    api<ResumenDocumento[]>('/api/documentos')
      .then((datos) => {
        setDocumentos(datos)
        guardarSS('datos', JSON.stringify(datos))
        setEstado('ok')
      })
      .catch(() => {
        if (!hayDatos.current) setEstado('error')
      })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Persistir la vista durante la sesión (continuidad de navegación).
  useEffect(() => {
    guardarSS('filtro', filtro)
  }, [filtro])
  useEffect(() => {
    guardarSS('estado_f', filtroEstado)
  }, [filtroEstado])
  useEffect(() => {
    guardarSS('tipo_f', filtroTipo)
  }, [filtroTipo])
  useEffect(() => {
    guardarSS('pagina', String(pagina))
  }, [pagina])

  // Guardar la posición de scroll mientras se recorre la lista…
  useEffect(() => {
    const alHacerScroll = () => guardarSS('scroll', String(window.scrollY))
    window.addEventListener('scroll', alHacerScroll, { passive: true })
    return () => window.removeEventListener('scroll', alHacerScroll)
  }, [])

  // …y restaurarla UNA vez, cuando ya hay filas que dan altura a la página.
  const restaurado = useRef(false)
  useEffect(() => {
    if (restaurado.current || estado !== 'ok' || documentos.length === 0) return
    const y = Number(leerSS('scroll')) || 0
    if (y) requestAnimationFrame(() => window.scrollTo(0, y))
    restaurado.current = true
  }, [estado, documentos.length])

  const visibles = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    const enBusqueda = busqueda !== null
    const filtrados = (busqueda ?? documentos).filter((d) => {
      // En modo búsqueda avanzada el SERVIDOR ya filtró (incluye el CONTENIDO
      // del documento, que la fila no trae): no re-filtrar aquí para no
      // descartar coincidencias de contenido.
      if (enBusqueda) return true
      if (filtroEstado !== 'TODOS' && d.estado !== filtroEstado) return false
      if (filtroTipo !== 'TODOS' && d.tipo !== filtroTipo) return false
      if (soloMios && !esMio(d)) return false
      if (!t) return true
      const etq = (ETIQUETA_ESTADO[d.estado] ?? d.estado).toLowerCase()
      return (
        d.numero_completo.toLowerCase().includes(t) ||
        d.asunto.toLowerCase().includes(t) ||
        d.destinatario.toLowerCase().includes(t) ||
        d.destinatarios.some((x) => x.toLowerCase().includes(t)) ||
        d.instituciones.some((x) => x.toLowerCase().includes(t)) ||
        d.tipo_nombre.toLowerCase().includes(t) ||
        etq.includes(t) ||
        (d.fecha ?? '').toLowerCase().includes(t)
      )
    })
    // La dirección invierte el COMPARADOR, no la lista: así los borradores (sin número) van
    // SIEMPRE PRIMERO en los órdenes por número y por tipo, en las dos direcciones (Edison
    // 2026-10-06: al final «no aparecen»; son lo que se está trabajando), del más reciente al más
    // antiguo; después, los numerados.
    const signo = ordenDir === 'desc' ? -1 : 1
    const sinNumero = (a: ResumenDocumento, b: ResumenDocumento) =>
      Number(b.numero == null) - Number(a.numero == null) ||
      (a.numero == null && b.numero == null ? b.actualizado_en.localeCompare(a.actualizado_en) : 0)
    const porNumero = (a: ResumenDocumento, b: ResumenDocumento) =>
      signo * ((a.numero ?? 0) - (b.numero ?? 0)) || (b.fecha ?? '').localeCompare(a.fecha ?? '') || a.tipo.localeCompare(b.tipo)
    const comparadores: Record<string, (a: ResumenDocumento, b: ResumenDocumento) => number> = {
      reciente: (a, b) => signo * b.actualizado_en.localeCompare(a.actualizado_en),
      numero: (a, b) => sinNumero(a, b) || porNumero(a, b),
      tipo: (a, b) => signo * a.tipo_nombre.localeCompare(b.tipo_nombre) || sinNumero(a, b) || porNumero(a, b),
    }
    const dirigidos = [...filtrados].sort(comparadores[orden])
    // Ocultos y archivados SIEMPRE al final (también para el administrador):
    // la vista queda enfocada en lo activo, sin eliminarlos del sistema.
    const relegado = (d: ResumenDocumento) => d.oculto || d.estado === 'ARCHIVADO'
    return [...dirigidos.filter((d) => !relegado(d)), ...dirigidos.filter(relegado)]
  }, [busqueda, documentos, filtro, filtroEstado, filtroTipo, orden, ordenDir, soloMios])

  // Al cambiar filtros/orden se vuelve a la primera página, PERO no en el
  // primer render (ahí se restaura la página guardada de la sesión).
  const primeraPasada = useRef(true)
  useEffect(() => {
    if (primeraPasada.current) {
      primeraPasada.current = false
      return
    }
    setPagina(0)
  }, [filtro, filtroEstado, filtroTipo, orden, ordenDir, busqueda])

  const paginados = useMemo(
    () => visibles.slice(pagina * porPagina, (pagina + 1) * porPagina),
    [visibles, pagina, porPagina],
  )

  // --- Búsqueda avanzada (server-side, incluye contenido + firma/vínculo) ---
  const runBusqueda = useCallback(async () => {
    const p = new URLSearchParams()
    if (filtro.trim()) p.set('q', filtro.trim())
    if (filtroTipo !== 'TODOS') p.set('tipo', filtroTipo)
    if (filtroEstado !== 'TODOS') p.set('estado', filtroEstado)
    if (anio.trim()) p.set('anio', anio.trim())
    if (destinatario.trim()) p.set('destinatario', destinatario.trim())
    if (firma) p.set('firma', firma)
    if (vinculo) p.set('vinculo', vinculo)
    setBuscando(true)
    try {
      const res = await api<ResumenDocumento[]>(
        `/api/documentos/buscar-avanzado?${p.toString()}`,
      )
      setBusqueda(res)
    } catch {
      setBusqueda([])
    } finally {
      setBuscando(false)
    }
  }, [filtro, filtroTipo, filtroEstado, anio, destinatario, firma, vinculo])

  // En modo búsqueda, re-consultar (con rebote) al cambiar cualquier criterio,
  // para que los resultados sigan a los controles.
  useEffect(() => {
    if (!modoBusqueda) return
    const h = setTimeout(runBusqueda, 300)
    return () => clearTimeout(h)
  }, [modoBusqueda, runBusqueda])

  const limpiarBusqueda = () => {
    setModoBusqueda(false)
    setBusqueda(null)
    setAnio('')
    setDestinatario('')
    setFirma('')
    setVinculo('')
  }

  // Ocultar/mostrar (solo admin): el documento oculto es invisible para los
  // demás roles y queda al final de la lista del admin. No elimina nada.
  const alternarOculto = async (doc: ResumenDocumento, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api(`/api/documentos/${doc.id}/oculto`, {
        method: 'PUT',
        body: JSON.stringify({ oculto: !doc.oculto }),
      })
      setAvisoOk(
        doc.oculto
          ? `${doc.numero_completo}: visible de nuevo para todos.`
          : `${doc.numero_completo}: oculto (solo administrador; va al final de la lista).`,
      )
      cargar()
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo cambiar la visibilidad.')
    }
  }

  const eliminar = async (doc: ResumenDocumento, e: React.MouseEvent) => {
    e.stopPropagation()
    const etiqueta = doc.numero ? doc.numero_completo : 'este borrador'
    if (!(await confirmar(`¿Eliminar ${etiqueta}? Esta acción no se puede deshacer.`, { aceptar: 'Eliminar', peligro: true })))
      return
    try {
      await api(`/api/documentos/${doc.id}`, { method: 'DELETE' })
      setDocumentos((prev) => prev.filter((x) => x.id !== doc.id))
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo eliminar.')
    }
  }

  // El admin elimina cualquiera; la secretaría solo borradores sin número.
  const puedeEliminar = (doc: ResumenDocumento) =>
    esAdmin || (doc.numero === null && doc.origen === 'sgdp')

  // --- Acciones directas desde la bandeja (sin abrir el documento) ------
  const parar = (e: React.SyntheticEvent) => e.stopPropagation()

  // Estados que abren el diálogo: OBSERVADO exige el comentario (el servidor
  // lo rechaza sin él) y BORRADOR lo ofrece junto con el encargo.
  const PIDEN_COMENTARIO = ['OBSERVADO', 'OBSERVADO_ENVIADO', 'BORRADOR']

  const cambiarEstado = async (
    doc: ResumenDocumento,
    destino: string,
    texto = '',
    responsableId: number | null = null,
  ) => {
    setMenuEstado(null)
    try {
      await api(`/api/documentos/${doc.id}/estado`, {
        method: 'PUT',
        body: JSON.stringify({
          estado: destino,
          comentario: texto,
          responsable_id: responsableId,
        }),
      })
      setDlgEstado(null)
      setComentario('')
      setEncargadoA('')
      cargar()
    } catch (err) {
      if (esSinServidor(err)) {
        setDlgEstado(null)
        void ofrecerAlVolver('estado', `Cambiar el estado de ${doc.numero_completo || 'el borrador'} a «${ETIQUETA_ESTADO[destino] ?? destino}»`, `/documentos/${doc.id}`)
        return
      }
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo cambiar el estado.')
    }
  }

  // Punto de entrada desde el menú de estado: decide si hace falta diálogo.
  const pedirCambioEstado = (doc: ResumenDocumento, destino: string) => {
    setMenuEstado(null)
    if (PIDEN_COMENTARIO.includes(destino)) {
      setComentario('')
      setEncargadoA('')
      setDlgEstado({ doc, destino })
      if (equipo.length === 0) {
        api<MiembroEquipo[]>('/api/admin/equipo').then(setEquipo).catch(() => setEquipo([]))
      }
      return
    }
    void cambiarEstado(doc, destino)
  }

  // Registro en el STD desde la bandeja (el servidor exige la constancia).
  const guardarStd = async () => {
    if (!dlgStd) return
    try {
      await api(`/api/documentos/${dlgStd.id}/std`, {
        method: 'PUT',
        body: JSON.stringify({ registrado: true, numero: stdNumero, fecha: stdFecha }),
      })
      setAvisoOk(`${dlgStd.numero_completo}: registrado en el STD del Congreso.`)
      setDlgStd(null)
      setStdNumero('')
      cargar()
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo registrar en el STD.')
    }
  }

  const guardarFolios = async (doc: ResumenDocumento, valor: string) => {
    const folios = valor.trim() === '' ? null : Number(valor)
    if (folios !== null && (!Number.isInteger(folios) || folios < 0)) return
    if (folios === doc.folios) return
    setDocumentos((prev) => prev.map((x) => (x.id === doc.id ? { ...x, folios } : x)))
    try {
      await api(`/api/documentos/${doc.id}/folios`, {
        method: 'PUT',
        body: JSON.stringify({ folios }),
      })
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'No se pudieron guardar los folios.')
      cargar()
    }
  }

  const subirDoc = (
    doc: ResumenDocumento,
    categoria: 'firmado' | 'recepcion',
    etiqueta = '',
  ) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = categoria === 'firmado' ? ACEPTA_FIRMADO : '.pdf,.jpg,.jpeg,.png'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append('archivo', file)
      fd.append('categoria', categoria)
      if (etiqueta) fd.append('etiqueta', etiqueta)
      try {
        const ruta = `/api/documentos/${doc.id}/adjuntos`
        // El firmado pasa por la validación (firmados.ts); una constancia, no.
        const r = categoria === 'firmado'
          ? await subirFirmado<{ envio_automatico?: boolean }>(ruta, fd)
          : await subirArchivo<{ envio_automatico?: boolean }>(ruta, fd)
        if (r === null) return
        if (r?.envio_automatico) {
          setAvisoOk(
            `${doc.numero_completo}: marcado como «Enviado» automáticamente (firmado + constancias completas).`,
          )
        }
        cargar()
      } catch (err) {
        setErrorAccion(err instanceof Error ? err.message : 'No se pudo subir el archivo.')
      }
    }
    input.click()
  }

  // Barrido admin: reconoce «…[R].pdf» y «CONSTANCIA_DE_RECEPCION …» ya
  // existentes en las carpetas y autocompleta folios de docs antiguos.
  const reconocer = async () => {
    try {
      const r = await api<{ reconocidos: number; folios_autocompletados: number }>(
        '/api/documentos/reconocer-archivos',
        { method: 'POST' },
      )
      setErrorAccion('')
      void avisar(
        `Reconocidos ${r.reconocidos} archivo(s); folios autocompletados en ${r.folios_autocompletados} documento(s).`,
      )
      cargar()
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo ejecutar el barrido.')
    }
  }

  // Sin nombre propio: el servidor manda el oficial (FIRM-…, CR-…), que es el que el sistema
  // reconoce al volver a subirlo (2026-10-10).
  const descargarDoc = (doc: ResumenDocumento, adjId: number, _etiqueta: string) => {
    descargarArchivo(`/api/documentos/${doc.id}/adjuntos/${adjId}`).catch((err) =>
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo descargar el archivo.'),
    )
  }

  // Celda ✓/subir para el documento firmado (uno por documento).
  const celdaFirmado = (doc: ResumenDocumento) =>
    doc.firmado_id ? (
      <Tooltip title="Descargar documento firmado">
        <IconButton size="small" color="success" onClick={(e) => { parar(e); descargarDoc(doc, doc.firmado_id!, 'firmado') }}>
          <CheckCircleIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    ) : (
      <Tooltip title="Subir documento firmado (se renombra «…[R].pdf» solo)">
        <IconButton size="small" color="default" onClick={(e) => { parar(e); subirDoc(doc, 'firmado') }}>
          <UploadFileIcon fontSize="small" sx={{ opacity: 0.5 }} />
        </IconButton>
      </Tooltip>
    )

  // Celda de constancias de recepción: en oficios con VARIOS destinatarios
  // muestra el avance n/m y un menú por destinatario (seguimiento).
  const celdaRecepcion = (doc: ResumenDocumento) => {
    const multiple = doc.destinatarios.length > 1
    if (!multiple) {
      const ultima = doc.recepciones[doc.recepciones.length - 1]
      return ultima ? (
        <Tooltip title="Descargar constancia de recepción">
          <IconButton size="small" color="success" onClick={(e) => { parar(e); descargarDoc(doc, ultima.id, 'constancia de recepción') }}>
            <CheckCircleIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="Subir constancia de recepción (se renombra solo)">
          <IconButton size="small" color="default" onClick={(e) => { parar(e); subirDoc(doc, 'recepcion') }}>
            <UploadFileIcon fontSize="small" sx={{ opacity: 0.5 }} />
          </IconButton>
        </Tooltip>
      )
    }
    const n = doc.recepciones.length
    const m = doc.destinatarios.length
    return (
      <Tooltip title="Constancias de recepción por destinatario">
        <Chip
          size="small"
          label={`${n}/${m}`}
          color={n >= m ? 'success' : n > 0 ? 'warning' : 'default'}
          variant={n > 0 ? 'filled' : 'outlined'}
          onClick={(e) => { parar(e); setMenuRecepcion({ el: e.currentTarget as HTMLElement, doc }) }}
          sx={{ cursor: 'pointer', minWidth: 52 }}
        />
      </Tooltip>
    )
  }

  // Celda «Destinatario»: una línea con elipsis; si hay varios destinatarios,
  // muestra el primero + «+N» y el detalle completo en el tooltip (para que la
  // fila no crezca a lo alto — pedido de Edison 2026-08-24).
  const celdaDestinatario = (doc: ResumenDocumento) => {
    const varios = doc.destinatarios.length > 1
    const principal = varios ? doc.destinatarios[0] : doc.destinatario
    const detalle = varios ? doc.destinatarios.join(' · ') : doc.destinatario
    return (
      <TableCell sx={{ overflow: 'hidden' }}>
        {principal ? (
          <Tooltip title={detalle} placement="top-start">
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
              <Box component="span" sx={{ ...sxLineas('destinatario'), minWidth: 0 }}>
                {principal}
              </Box>
              {varios && (
                <Chip
                  size="small"
                  label={`+${doc.destinatarios.length - 1}`}
                  sx={{ height: 18, fontSize: 11, flexShrink: 0, mt: '2px' }}
                />
              )}
            </Box>
          </Tooltip>
        ) : (
          '—'
        )}
      </TableCell>
    )
  }

  // Un solo formato (2026-10-08): el servidor ya entrega «Nombre (SIGLAS)» con el nombre del
  // directorio y en nombre propio; la celda muestra siempre el NOMBRE (las siglas, en el tooltip).
  const sinSiglas = (s: string): string => s.replace(/\s*\([^)]+\)\s*$/, '').trim() || s

  // Celda «Institución destino»: etiqueta con las siglas del primer órgano +
  // «+N» si hay varios; el/los nombre(s) completo(s) en el tooltip.
  const celdaInstitucion = (doc: ResumenDocumento) => {
    const insts = doc.instituciones ?? []
    if (insts.length === 0) {
      return <TableCell sx={{ overflow: 'hidden', color: 'text.disabled' }}>—</TableCell>
    }
    return (
      <TableCell sx={{ overflow: 'hidden' }}>
        <Tooltip title={insts.join(' · ')} placement="top-start">
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
            <Box
              sx={{
                ...sxLineas('institucion'),
                minWidth: 0,
                px: 0.75,
                py: '2px',
                borderRadius: 1,
                bgcolor: 'action.hover',
                color: 'primary.dark',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {sinSiglas(insts[0])}
            </Box>
            {insts.length > 1 && (
              <Chip
                size="small"
                label={`+${insts.length - 1}`}
                sx={{ height: 18, fontSize: 11, flexShrink: 0, mt: '2px' }}
              />
            )}
            {doc.tramite?.ambito !== 'interno' && <IconButton
              size="small"
              aria-label="Mesa de partes del destinatario"
              onClick={(e) => { e.stopPropagation(); setMesaDoc(doc.id) }}
              sx={{ p: 0.25, ml: 'auto', flexShrink: 0, color: 'text.secondary' }}
            >
              <InboxOutlinedIcon sx={{ fontSize: 17 }} />
            </IconButton>}
          </Box>
        </Tooltip>
      </TableCell>
    )
  }

  // Celda «Anexos»: nº de adjuntos genéricos (NO cuenta firmado ni recepción).
  const celdaAnexos = (doc: ResumenDocumento) => {
    const n = doc.anexos ?? 0
    return n > 0 ? (
      <Tooltip title={`${n} anexo(s) adjunto(s) — no cuenta el firmado ni las constancias`}>
        <Chip
          size="small"
          variant="outlined"
          icon={<AttachFileIcon />}
          label={n}
          sx={{ height: 22 }}
        />
      </Tooltip>
    ) : (
      <Box component="span" sx={{ color: 'text.disabled' }}>
        —
      </Box>
    )
  }

  const nuevoDocumento = async (tipo: string, pegar: string = desdePrompt) => {
    setMenuNuevo(null)
    setDesdePrompt('')
    try {
      const { id } = await api<{ id: number }>('/api/documentos', {
        method: 'POST',
        body: JSON.stringify({ tipo }),
      })
      if (pegar) {
        guardarSS('ultimo', String(id))
        navegar(`/documentos/${id}?pegar=${encodeURIComponent(pegar)}`)
      } else abrir(id)
    } catch (e) {
      // Sin servidor (2026-10-18): el id lo da el servidor, así que no se crea a ciegas; se ofrece
      // «Hacerlo al volver», que abre la bandeja con `?nuevo=1&tipo=…` y crea el documento.
      if (esSinServidor(e)) {
        const nombre = tipos.find((x) => x.codigo === tipo)?.nombre ?? 'documento'
        void ofrecerAlVolver('crear', `Crear ${nombre.toLowerCase()}`, `/documentos?nuevo=1&tipo=${encodeURIComponent(tipo)}`)
        return
      }
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo crear el documento.')
    }
  }

  // Registro en el STD (la casilla STD de la tabla y el menú ⋮ de la tarjeta).
  const abrirStd = (doc: ResumenDocumento) => {
    setStdNumero(doc.tramite.std_numero || '')
    setDlgStd(doc)
  }

  // El chip del trámite: si solo falta el STD y ya se puede, abrir directo el
  // registro; en cualquier otro caso, el panel de seguimiento completo, que
  // dice qué falta y permite hacerlo desde aquí.
  const abrirTramite = (doc: ResumenDocumento) => {
    if (!doc.tramite.std && doc.tramite.constancia) abrirStd(doc)
    else setDlgGestion(doc)
  }

  const textoVacio =
    documentos.length === 0
      ? 'Aún no hay documentos. Cree el primero con «Nuevo documento».'
      : 'Ningún documento coincide con la búsqueda.'

  // --- Lista de tarjetas (celular y tableta) ----------------------------
  // La fila de la tabla tiene 18 columnas: en 360 px no cabe ni girando el
  // teléfono. La tarjeta muestra lo que se mira de un vistazo (número, tipo,
  // asunto, destinatario, estado, fecha, firma, seguimiento, trámite) y deja
  // el resto de acciones de la fila en el menú ⋮, sin perder ninguna.
  const avisoLista = (): React.ReactNode => {
    if (estado === 'cargando') {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )
    }
    if (estado === 'error') {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={cargar}>
              Reintentar
            </Button>
          }
        >
          No se pudieron cargar los documentos.
        </Alert>
      )
    }
    if (visibles.length === 0) {
      return (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3, px: 1 }}>
          {textoVacio}
        </Typography>
      )
    }
    return null
  }

  const tarjeta = (doc: ResumenDocumento) => {
    const varios = doc.destinatarios.length > 1
    const principal = varios ? doc.destinatarios[0] : doc.destinatario
    const insts = doc.instituciones ?? []
    const marcado = seleccion.has(doc.id)
    const destino = [
      principal ? `${principal}${varios ? ` +${doc.destinatarios.length - 1}` : ''}` : '',
      insts.length ? `${sinSiglas(insts[0])}${insts.length > 1 ? ` +${insts.length - 1}` : ''}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <Paper
        key={doc.id}
        component="article"
        variant="outlined"
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0.25,
          py: 1,
          pl: 0.25,
          pr: 0.25,
          minWidth: 0,
          opacity: doc.oculto ? 0.6 : 1,
          borderColor: doc.id === ultimoDoc ? 'primary.main' : 'divider',
          borderLeftWidth: doc.id === ultimoDoc ? 3 : 1,
          bgcolor: marcado ? 'action.selected' : 'background.paper',
        }}
      >
        <Checkbox
          size="small"
          checked={marcado}
          onChange={() => alternar(doc.id)}
          inputProps={{ 'aria-label': `Seleccionar ${doc.numero_completo}` }}
        />
        {/* Solo el CUERPO de la tarjeta abre el documento (Edison 2026-10-19, con el cuadro rojo: número,
            tipo, asunto, destinatario y la línea del estado); la casilla, el ⋮, el seguimiento, el estado,
            el trámite y el clip hacen lo suyo y no abren nada. La pulsación larga, también solo aquí. */}
        <Box
          role="button"
          tabIndex={0}
          aria-label={`Abrir ${doc.numero_completo}`}
          onClick={() => tocar(doc.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tocar(doc.id) } }}
          {...pulsacionLarga(abreVisorRapido(doc.estado) ? () => abrir(doc.id) : undefined)}
          sx={{ ...SX_SIN_SELECCION, flex: 1, minWidth: 0, pt: 0.5, cursor: 'pointer', borderRadius: 1, '&:active': { bgcolor: 'action.hover' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
            <Typography component="span" sx={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
              {doc.numero != null ? `N.º ${String(doc.numero).padStart(4, '0')}` : 'S/N'}
            </Typography>
            <Typography component="span" noWrap sx={{ fontSize: 12.5, color: 'text.secondary', minWidth: 0 }}>
              {doc.tipo_nombre}
            </Typography>
            {doc.oculto && (
              <Chip size="small" label="Oculto" color="warning" variant="outlined" sx={{ height: 18, fontSize: 11, flexShrink: 0 }} />
            )}
          </Box>
          <Typography
            sx={{
              fontSize: 14,
              lineHeight: 1.35,
              mt: 0.25,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              color: doc.asunto ? 'text.primary' : 'text.disabled',
            }}
          >
            {doc.asunto || '(sin asunto)'}
          </Typography>
          {destino && (
            <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>
              {destino}
            </Typography>
          )}
          {/* Columnas fijas: estado y marcas | fecha | trámite. La fecha y el «n/4» del trámite
              caen en el mismo sitio en todas las tarjetas, aunque el estado mida distinto. */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 52px', alignItems: 'center', columnGap: 0.75, mt: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
              <Box component="span" onClick={parar} sx={{ display: 'inline-flex', flexShrink: 0 }}>
                <EstadoDocumento
                  estado={doc.estado}
                  tamano="sm"
                  onClick={doc.transiciones.length ? (e) => setMenuEstado({ el: e.currentTarget, doc }) : undefined}
                />
              </Box>
              {doc.anexos > 0 && (
                <Box component="span" onClick={parar} sx={{ display: 'inline-flex' }}>
                  <Chip size="small" variant="outlined" icon={<AttachFileIcon />} label={doc.anexos} sx={{ height: 22 }} />
                </Box>
              )}
            </Box>
            {/* dd/mm/aa: el año completo no cabe con la letra grande del celular. */}
            <Typography component="span" noWrap sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'right' }}>
              {fechaVisible(doc).replace(/\/(\d\d)(\d\d)$/, '/$2')}
            </Typography>
            <Box component="span" onClick={parar} sx={{ display: 'flex', justifyContent: 'center' }}>
              <ChipTramite t={doc.tramite} onClick={() => abrirTramite(doc)} />
            </Box>
          </Box>
          {/* Lo que falta tras la firma (antes un «✓ Firmado» que repetía el estado) y quién lo lleva. */}
          {(() => {
            const falta = ['FIRMADO', 'ENVIADO'].includes(doc.estado) ? faltaTramite(doc.tramite) : ''
            const linea = [falta, doc.responsable && `A cargo de ${doc.responsable}`].filter(Boolean).join(' · ')
            return linea ? (
              <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{linea}</Typography>
            ) : null
          })()}
        </Box>
        <Box onClick={parar} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <IconButton
            onClick={(e) => setMenuFila({ el: e.currentTarget, doc })}
            aria-label={`Acciones de ${doc.numero_completo}`}
          >
            <MoreVertIcon />
          </IconButton>
          {/* Seguimiento a la vista también en la tarjeta: es la función que
              el diputado usa para observar de corrido. */}
          <IconButton
            onClick={() => setDlgGestion(doc)}
            aria-label={`Seguimiento de ${doc.numero_completo}`}
          >
            <Badge
              badgeContent={doc.comentarios_pendientes}
              color="warning"
              sx={{ '& .MuiBadge-badge': { height: 15, minWidth: 15, fontSize: 10, px: 0.4 } }}
            >
              <FactCheckIcon
                fontSize="small"
                color={doc.comentarios_pendientes > 0 ? 'warning' : 'primary'}
                sx={doc.comentarios_pendientes > 0 ? undefined : { opacity: 0.7 }}
              />
            </Badge>
          </IconButton>
        </Box>
      </Paper>
    )
  }

  // Menú ⋮ de la tarjeta: cada acción llama a la MISMA función que su celda
  // de la tabla (permisos incluidos: puedeEliminar, esAdmin, puede_std…).
  const menuDeFila = () => {
    const doc = menuFila?.doc
    const cerrar = () => setMenuFila(null)
    const items: React.ReactNode[] = []
    if (doc) {
      const subtitulo = (clave: string, texto: string) => (
        <ListSubheader key={`sub-${clave}`} sx={{ lineHeight: '30px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {texto}
        </ListSubheader>
      )
      items.push(
        // ListSubheader (y no Box): el menú lo salta al enfocar con teclado.
        <ListSubheader key="cab" disableSticky sx={{ lineHeight: 1.4, pt: 0.5, pb: 1, maxWidth: 300 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'text.primary' }}>{doc.numero_completo}</Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {ETIQUETA_ORIGEN[doc.origen] ?? 'Plataforma'}
            {esEquipo && doc.procesado_por ? ` · Procesado por ${doc.procesado_por}` : ''}
          </Typography>
        </ListSubheader>,
        <MenuItem key="abrir" onClick={() => { cerrar(); abrir(doc.id) }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Abrir el documento" />
        </MenuItem>,
        ...(esEquipo && doc.origen !== 'manual' ? [
          <MenuItem key="duplicar" onClick={() => { cerrar(); void duplicar(doc.id) }}>
            <ListItemIcon><ContentCopyOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Duplicar como borrador" secondary="Copia todo para editar" />
          </MenuItem>,
        ] : []),
        // Solo externos: lo interno del Congreso va por el STD, no por mesa de partes.
        ...(doc.tramite?.ambito !== 'interno' ? [
          <MenuItem key="mesa" onClick={() => { cerrar(); setMesaDoc(doc.id) }}>
            <ListItemIcon><InboxOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Mesa de partes del destinatario" />
          </MenuItem>,
        ] : []),
        <MenuItem key="seguimiento" onClick={() => { cerrar(); setDlgGestion(doc) }}>
          <ListItemIcon><FactCheckIcon fontSize="small" color={doc.comentarios_pendientes > 0 ? 'warning' : undefined} /></ListItemIcon>
          <ListItemText
            primary="Seguimiento y observaciones"
            secondary={
              doc.comentarios_pendientes > 0
                ? `${doc.comentarios_pendientes} pendiente(s)`
                : doc.responsable
                  ? `A cargo de ${doc.responsable}`
                  : 'Encargar u observar'
            }
          />
        </MenuItem>,
      )
      if (doc.transiciones.length) {
        items.push(subtitulo('estado', `Estado: ${ETIQUETA_ESTADO[doc.estado] ?? doc.estado}`))
        doc.transiciones.forEach((destino) =>
          items.push(
            <MenuItem key={`est-${destino}`} onClick={() => { cerrar(); pedirCambioEstado(doc, destino) }}>
              <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={`Pasar a «${ETIQUETA_ESTADO[destino] ?? destino}»`} />
            </MenuItem>,
          ),
        )
      }
      items.push(subtitulo('archivos', 'Archivos'))
      items.push(
        doc.firmado_id ? (
          <MenuItem key="firmado" onClick={() => { cerrar(); descargarDoc(doc, doc.firmado_id!, 'firmado') }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText primary="Descargar el firmado" />
          </MenuItem>
        ) : (
          <MenuItem key="firmado" onClick={() => { cerrar(); subirDoc(doc, 'firmado') }}>
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Subir el documento firmado" secondary="Se renombra «…[R].pdf» solo" />
          </MenuItem>
        ),
      )
      if (doc.destinatarios.length > 1) {
        const el = menuFila!.el
        items.push(
          <MenuItem key="recepcion" onClick={() => { cerrar(); setMenuRecepcion({ el, doc }) }}>
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="Constancias de recepción…"
              secondary={`${doc.recepciones.length} de ${doc.destinatarios.length} destinatarios`}
            />
          </MenuItem>,
        )
      } else {
        const ultima = doc.recepciones[doc.recepciones.length - 1]
        items.push(
          ultima ? (
            <MenuItem key="recepcion" onClick={() => { cerrar(); descargarDoc(doc, ultima.id, 'constancia de recepción') }}>
              <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
              <ListItemText primary="Descargar la constancia de recepción" />
            </MenuItem>
          ) : (
            <MenuItem key="recepcion" onClick={() => { cerrar(); subirDoc(doc, 'recepcion') }}>
              <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Subir la constancia de recepción" />
            </MenuItem>
          ),
        )
      }
      items.push(
        <MenuItem
          key="folios"
          onClick={() => {
            cerrar()
            setFoliosTexto(doc.folios == null ? '' : String(doc.folios))
            setDlgFolios(doc)
          }}
        >
          <ListItemIcon><EditNoteIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Folios" secondary={doc.folios == null ? 'Sin registrar' : `${doc.folios}`} />
        </MenuItem>,
        subtitulo('tramite', 'Trámite'),
        <MenuItem key="tramite" onClick={() => { cerrar(); abrirTramite(doc) }}>
          <ListItemIcon><AssignmentTurnedInIcon fontSize="small" color={doc.tramite.completo ? 'success' : undefined} /></ListItemIcon>
          <ListItemText
            primary="Ruta del trámite"
            secondary={doc.tramite.completo ? 'Completo' : `${doc.tramite.hechos} de ${doc.tramite.total} pasos`}
          />
        </MenuItem>,
        doc.tramite.std ? (
          <MenuItem key="std" disabled>
            <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText
              primary="Registrado en el STD"
              secondary={[doc.tramite.std_numero && `Expediente ${doc.tramite.std_numero}`, doc.tramite.std_fecha].filter(Boolean).join(' · ') || undefined}
            />
          </MenuItem>
        ) : (
          <MenuItem key="std" disabled={!doc.tramite.puede_std} onClick={() => { cerrar(); abrirStd(doc) }}>
            <ListItemIcon><RadioButtonUncheckedIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="Registrar en el STD"
              secondary={doc.tramite.puede_std ? undefined : doc.tramite.motivo_std || 'Todavía no corresponde.'}
              secondaryTypographyProps={{ sx: { whiteSpace: 'normal' } }}
            />
          </MenuItem>
        ),
      )
      if (esAdmin || puedeEliminar(doc)) items.push(<Divider key="div-admin" />)
      if (esAdmin) {
        items.push(
          <MenuItem key="oculto" onClick={(e) => { cerrar(); void alternarOculto(doc, e) }}>
            <ListItemIcon>
              {doc.oculto ? <VisibilityIcon fontSize="small" color="warning" /> : <VisibilityOffIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText
              primary={doc.oculto ? 'Mostrar de nuevo' : 'Ocultar'}
              secondary={doc.oculto ? 'Visible para todos los roles' : 'Solo lo verá el administrador'}
            />
          </MenuItem>,
        )
      }
      if (puedeEliminar(doc)) {
        items.push(
          <MenuItem key="eliminar" onClick={(e) => { cerrar(); void eliminar(doc, e) }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText primary="Eliminar" />
          </MenuItem>,
        )
      }
    }
    return (
      <Menu
        anchorEl={menuFila?.el ?? null}
        open={menuFila !== null}
        onClose={cerrar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { maxWidth: 'calc(100vw - 24px)', minWidth: 260 } }}
      >
        {items}
      </Menu>
    )
  }

  const cuerpoTabla = () => {
    if (estado === 'cargando') {
      return (
        <TableRow>
          <TableCell colSpan={columnasVisibles.length} align="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </TableCell>
        </TableRow>
      )
    }
    if (estado === 'error') {
      return (
        <TableRow>
          <TableCell colSpan={columnasVisibles.length} align="center" sx={{ py: 3 }}>
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={cargar}>
                  Reintentar
                </Button>
              }
              sx={{ justifyContent: 'center' }}
            >
              No se pudieron cargar los documentos.
            </Alert>
          </TableCell>
        </TableRow>
      )
    }
    if (visibles.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={columnasVisibles.length} align="center">
            {textoVacio}
          </TableCell>
        </TableRow>
      )
    }
    return paginados.map((doc) => (
      <TableRow
        key={doc.id}
        hover
        selected={doc.id === ultimoDoc}
        sx={{ cursor: 'pointer', opacity: doc.oculto ? 0.55 : 1 }}
        onClick={() => tocar(doc.id)}
      >
        <TableCell align="center" onClick={parar} sx={{ px: 0.5 }}>
          <Checkbox
            size="small"
            sx={{ p: 0.25 }}
            checked={seleccion.has(doc.id)}
            onChange={() => alternar(doc.id)}
            inputProps={{ 'aria-label': `Seleccionar ${doc.numero_completo}` }}
          />
        </TableCell>
        <TableCell align="center" onClick={parar} sx={{ px: 0.25 }}>
          {/* Seguimiento y gestión: observar, encargar y registrar en el STD
              sin abrir el documento. Disponible para todos los roles —la API
              ya decide quién puede qué—, y es lo que le faltaba al diputado
              para observar de corrido desde la bandeja. Con observaciones
              pendientes se enciende y lleva el número. */}
          <Tooltip
            title={
              doc.comentarios_pendientes > 0
                ? `Seguimiento · ${doc.comentarios_pendientes} pendiente(s): observaciones, encargo y ruta del trámite`
                : 'Seguimiento: observaciones, encargo y ruta del trámite'
            }
          >
            <IconButton
              size="small"
              onClick={() => setDlgGestion(doc)}
              aria-label={`Seguimiento de ${doc.numero_completo}`}
            >
              <Badge
                badgeContent={doc.comentarios_pendientes}
                color="warning"
                sx={{ '& .MuiBadge-badge': { height: 15, minWidth: 15, fontSize: 10, px: 0.4 } }}
              >
                <FactCheckIcon
                  fontSize="small"
                  color={doc.comentarios_pendientes > 0 ? 'warning' : 'primary'}
                  sx={doc.comentarios_pendientes > 0 ? undefined : { opacity: 0.7 }}
                />
              </Badge>
            </IconButton>
          </Tooltip>
        </TableCell>
        <TableCell sx={{ overflow: 'hidden' }}>
          <Box sx={sxLineas('tipo')}>{doc.tipo_nombre}</Box>
        </TableCell>
        <TableCell sx={{ overflow: 'hidden' }}>
          {/* El origen (Archivo/Plataforma) ya no ocupa un chip: va en el
              tooltip (pedido 2026-08-24: vista limpia, sin etiquetas). */}
          <Tooltip
            title={`${doc.numero_completo} · ${ETIQUETA_ORIGEN[doc.origen] ?? 'Plataforma'}`}
            placement="top-start"
          >
            <Box sx={sxLineas('numero')}>
              {doc.numero != null ? String(doc.numero).padStart(4, '0') : 'S/N'}
            </Box>
          </Tooltip>
          {doc.oculto && (
            <Chip
              size="small"
              label="Oculto"
              color="warning"
              variant="outlined"
              sx={{ mt: 0.5, height: 18, fontSize: 11 }}
            />
          )}
        </TableCell>
        <TableCell sx={{ overflow: 'hidden' }}>
          <Tooltip
            title={doc.asunto || ''}
            placement="top-start"
            disableHoverListener={!doc.asunto}
          >
            <Box sx={sxLineas('asunto')}>{doc.asunto || '(sin asunto)'}</Box>
          </Tooltip>
        </TableCell>
        {celdaDestinatario(doc)}
        {celdaInstitucion(doc)}
        <TableCell onClick={parar}>
          <EstadoDocumento
            estado={doc.estado}
            tamano="sm"
            onClick={doc.transiciones.length ? (e) => setMenuEstado({ el: e.currentTarget, doc }) : undefined}
          />
        </TableCell>
        <TableCell align="center" onClick={parar}>
          <TextField
            key={`folios-${doc.id}-${doc.folios ?? ''}`}
            variant="standard"
            type="number"
            size="small"
            defaultValue={doc.folios ?? ''}
            onBlur={(e) => guardarFolios(doc, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            inputProps={{ min: 0, 'aria-label': 'Folios', style: { width: 40, textAlign: 'center' } }}
          />
        </TableCell>
        <TableCell align="center">{celdaFirmado(doc)}</TableCell>
        <TableCell align="center" onClick={parar}>{celdaRecepcion(doc)}</TableCell>
        <TableCell align="center" onClick={parar}>
          <ChipTramite t={doc.tramite} onClick={() => abrirTramite(doc)} />
        </TableCell>
        <TableCell align="center" onClick={parar}>
          {doc.tramite.std ? (
            <Tooltip title={`Registrado en el STD${doc.tramite.std_numero ? ` — expediente ${doc.tramite.std_numero}` : ''}${doc.tramite.std_fecha ? ` (${doc.tramite.std_fecha})` : ''}`}>
              <CheckCircleIcon fontSize="small" color="success" />
            </Tooltip>
          ) : (
            <Tooltip title={doc.tramite.puede_std ? 'Pendiente de registrar en el STD. Clic para registrarlo.' : (doc.tramite.motivo_std || 'Todavía no corresponde registrarlo en el STD.')}>
              <span>
                <IconButton
                  size="small"
                  disabled={!doc.tramite.puede_std}
                  onClick={() => abrirStd(doc)}
                  aria-label="Registrar en el STD"
                >
                  <RadioButtonUncheckedIcon sx={{ fontSize: 18, opacity: 0.4 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </TableCell>
        <TableCell sx={{ overflow: 'hidden', fontSize: 13 }} onClick={parar}>
          <Tooltip
            title={
              doc.comentarios_pendientes
                ? `${doc.comentarios_pendientes} observación(es)/indicación(es) pendiente(s). `
                  + 'Clic para verlas y atenderlas.'
                : 'Clic para encargar el documento o registrar una observación.'
            }
          >
            <Box
              onClick={() => setDlgGestion(doc)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                minWidth: 0,
                cursor: 'pointer',
              }}
            >
              <Box sx={{ ...sxLineas('responsable'), color: doc.responsable ? 'text.primary' : 'text.disabled' }}>
                {doc.responsable || '—'}
              </Box>
              {/* 2026-10-06: sin el chip con el conteo: lo repetía el seguimiento. */}
            </Box>
          </Tooltip>
        </TableCell>
        <TableCell align="center">{celdaAnexos(doc)}</TableCell>
        {esEquipo && (
          <TableCell sx={{ color: 'text.secondary', fontSize: 13, overflow: 'hidden' }}>
            <Box sx={sxLineas('procesado')}>{doc.procesado_por || '—'}</Box>
          </TableCell>
        )}
        <TableCell sx={{ overflow: 'hidden' }}>
          <Tooltip title={`Última modificación: ${new Date(doc.actualizado_en).toLocaleString('es-PE')}`}>
            <Box sx={sxLineas('fecha')}>
              {fechaVisible(doc)}
            </Box>
          </Tooltip>
        </TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 0.5 }}>
          {esAdmin && (
            <Tooltip
              title={
                doc.oculto
                  ? 'Mostrar de nuevo (visible para todos los roles)'
                  : 'Ocultar (solo lo verá el administrador, al final de la lista)'
              }
            >
              <IconButton
                size="small"
                onClick={(e) => alternarOculto(doc, e)}
                aria-label={doc.oculto ? `Mostrar ${doc.numero_completo}` : `Ocultar ${doc.numero_completo}`}
              >
                {doc.oculto ? (
                  <VisibilityIcon fontSize="small" color="warning" />
                ) : (
                  <VisibilityOffIcon fontSize="small" sx={{ opacity: 0.45 }} />
                )}
              </IconButton>
            </Tooltip>
          )}
          {puedeEliminar(doc) && (
            <Tooltip title="Eliminar">
              <IconButton
                size="small"
                color="error"
                onClick={(e) => eliminar(doc, e)}
                aria-label={`Eliminar ${doc.numero_completo}`}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>
    ))
  }

  // --- Piezas de la barra de filtros ------------------------------------
  // Se arman una vez y se colocan distinto según el ancho: en el escritorio,
  // en una fila como siempre; en el celular, buscador a todo el ancho, «Nuevo
  // documento» a la mano y el resto plegado bajo «Filtros».
  const botonNuevo = (
    <Box
      ref={refNuevo}
      sx={{ display: 'inline-flex', flex: celular ? 1 : undefined, minWidth: 0, '& > span': { width: celular ? '100%' : undefined } }}
    >
      <BotonPaso
        paso={PASO_NUEVO}
        variant="contained"
        endIcon={<ArrowDropDownIcon />}
        fullWidth={celular}
        onClick={(e) => setAnclaNuevo(e.currentTarget)}
      >
        Nuevo documento
      </BotonPaso>
    </Box>
  )
  // El seguimiento del chat sin documento hallado: una línea y el texto a la mano.
  const avisoSeguimiento = pegarSeg && estado !== 'cargando' ? (
    <Alert
      severity="info"
      onClose={() => setPegarSeg(null)}
      sx={{ mb: 1.5, '& .MuiAlert-message': { minWidth: 0 } }}
      action={
        <Button color="inherit" size="small" onClick={() => void copiarTexto(pegarSeg.texto).then(() => setAvisoOk('Texto copiado.')).catch(() => setErrorAccion('No se pudo copiar.'))}>
          Copiar
        </Button>
      }
    >
      <Typography variant="body2" noWrap>Abra el documento{pegarSeg.numero ? ` ${pegarSeg.numero}` : ''} y pegue el seguimiento.</Typography>
    </Alert>
  ) : null
  const campoBuscar = (
    <TextField
      size="small"
      fullWidth={celular}
      placeholder={celular ? 'Buscar (Enter: en el contenido)' : 'Buscar… (Enter: también en el contenido)'}
      value={filtro}
      onChange={(e) => setFiltro(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setModoBusqueda(true)
      }}
      sx={celular ? undefined : { flexGrow: 1, minWidth: 240 }}
      inputProps={{ enterKeyHint: 'search', 'aria-label': 'Buscar documentos' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon fontSize="small" />
          </InputAdornment>
        ),
      }}
    />
  )
  const selectTipo = (
    <TextField
      select
      size="small"
      label="Tipo"
      value={filtroTipo}
      onChange={(e) => setFiltroTipo(e.target.value)}
      fullWidth={celular}
      sx={celular ? undefined : { width: 170 }}
    >
      <MenuItem value="TODOS">Todos los tipos</MenuItem>
      {tipos.map((t) => (
        <MenuItem key={t.codigo} value={t.codigo}>
          {t.nombre}
        </MenuItem>
      ))}
    </TextField>
  )
  const selectEstado = (
    <TextField
      select
      size="small"
      label="Estado"
      value={filtroEstado}
      onChange={(e) => elegirEstado(e.target.value)}
      fullWidth={celular}
      sx={celular ? undefined : { width: 160 }}
    >
      <MenuItem value="TODOS">Todos</MenuItem>
      {Object.entries(ETIQUETA_ESTADO).map(([valor, texto]) => (
        <MenuItem key={valor} value={valor}>
          {texto}
        </MenuItem>
      ))}
    </TextField>
  )
  const botonMasFiltros = (
    <Button
      size="small"
      variant={panelAvanzado ? 'contained' : 'outlined'}
      endIcon={<ArrowDropDownIcon />}
      onClick={alternarPanelAvanzado}
      aria-expanded={panelAvanzado}
    >
      Más filtros
    </Button>
  )
  const selectOrden = (
    <TextField
      select
      size="small"
      label="Ordenar"
      value={orden}
      onChange={(e) => cambiarOrden(e.target.value as 'reciente' | 'numero' | 'tipo')}
      fullWidth={celular}
      sx={celular ? undefined : { width: 180 }}
    >
      <MenuItem value="reciente">Más reciente</MenuItem>
      <MenuItem value="numero">N.° de documento</MenuItem>
      <MenuItem value="tipo">Tipo de documento</MenuItem>
    </TextField>
  )
  const botonDir = (
    <Tooltip title={ordenDir === 'asc' ? 'Ascendente (clic: descendente)' : 'Descendente (clic: ascendente)'}>
      <IconButton size="small" onClick={alternarDir} aria-label="Invertir orden">
        <SwapVertIcon
          fontSize="small"
          sx={{ transform: ordenDir === 'desc' ? 'scaleY(-1)' : 'none', color: 'primary.main' }}
        />
      </IconButton>
    </Tooltip>
  )
  // El mismo «Actualizar» discreto de los demás módulos (BotonActualizar, 2026-10-18).
  const botonRefrescar = <BotonActualizar alActualizar={cargar} etiqueta="Actualizar documentos" />
  const botonReconocer = esAdmin && (
    <Tooltip title="Detectar firmados y constancias ya guardados; completar folios.">
      <Button size="small" startIcon={<TravelExploreIcon />} onClick={reconocer}>
        Reconocer archivos
      </Button>
    </Tooltip>
  )
  // Filtros activos: el botón «Filtros» plegado avisa con un punto.
  const hayFiltros = filtroTipo !== 'TODOS' || filtroEstado !== 'TODOS'

  // Selección para descargar. En la lista de tarjetas va DEBAJO y pegada al
  // borde inferior (sobre la barra del celular): quien marca bajando por la
  // lista la tiene siempre a la mano.
  const barraSeleccion = seleccion.size > 0 && (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        px: 1.5,
        py: 1,
        mb: 1,
        bgcolor: tarjetas ? 'background.paper' : 'action.hover',
        ...(tarjetas && {
          position: 'sticky',
          bottom: { xs: 'calc(66px + env(safe-area-inset-bottom))', sm: 8 },
          zIndex: 2,
          mt: 1,
          boxShadow: 3,
        }),
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {seleccion.size} documento(s) seleccionado(s)
      </Typography>
      <Button
        size="small"
        variant="contained"
        startIcon={<DownloadIcon />}
        disabled={bajando !== null}
        onClick={() => void descargarSeleccionados()}
      >
        {bajando ? `Descargando ${bajando.hecho}/${bajando.total}…` : `Descargar ${textoPiezas(piezas)}`}
      </Button>
      <Button size="small" onClick={(e) => setMenuDescarga(e.currentTarget)} disabled={bajando !== null} endIcon={<ExpandMoreIcon />}>
        Qué bajar
      </Button>
      <Menu anchorEl={menuDescarga} open={menuDescarga !== null} onClose={() => setMenuDescarga(null)}>
        {([['pdf', 'Documento generado (sin firmar)'], ['firmado', 'Firmado'], ['cargos', 'Cargos de recepción'], ['expediente', 'Expediente (firmado + cargos en un PDF)']] as [Pieza, string][]).map(([k, t]) => (
          <MenuItem key={k} dense onClick={() => setPiezas((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n.size ? n : new Set<Pieza>(['pdf']) })}>
            <Checkbox size="small" checked={piezas.has(k)} sx={{ p: 0, mr: 1 }} />{t}
          </MenuItem>
        ))}
      </Menu>
      <Tooltip title={seleccion.size < 2 ? 'Marque al menos dos documentos' : 'Ver los seleccionados lado a lado'}>
        <span>
          <Button size="small" startIcon={<CompareOutlinedIcon />} disabled={seleccion.size < 2 || seleccion.size > 8} onClick={() => setComparando(true)}>
            Comparar
          </Button>
        </span>
      </Tooltip>
      {puedeElegirCarpeta() && (
        <Tooltip title="Carpeta donde se guardarán las descargas de este equipo (se recuerda para la próxima vez)">
          <Button size="small" startIcon={<FolderOpenIcon />} onClick={() => void elegirCarpetaDescargas()}>
            {carpeta ? `Carpeta: ${carpeta}` : 'Elegir carpeta…'}
          </Button>
        </Tooltip>
      )}
      <Box sx={{ flexGrow: 1 }} />
      <Button size="small" onClick={() => setSeleccion(new Set())} disabled={bajando !== null}>
        Quitar selección
      </Button>
    </Paper>
  )

  const paginacion = (
    <TablePagination
      component="div"
      count={visibles.length}
      page={pagina}
      onPageChange={(_, p) => setPagina(p)}
      rowsPerPage={porPagina}
      onRowsPerPageChange={(e) => {
        const n = Number(e.target.value)
        setPorPagina(n)
        setPagina(0)
        guardarSS('filas', String(n))
        localStorage.setItem('sgdp_filas', String(n))
      }}
      rowsPerPageOptions={[10, 20, 50, 100]}
      labelRowsPerPage={celular ? 'Filas:' : 'Por página:'}
      labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
      sx={
        celular
          ? {
              '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', justifyContent: 'flex-end', px: 1, minHeight: 48 },
              '& .MuiTablePagination-spacer': { display: 'none' },
              '& .MuiTablePagination-input': { mr: 1.5 },
              '& .MuiTablePagination-actions': { ml: 1 },
            }
          : undefined
      }
    />
  )

  return (
    <Marco modulo="documentos">
      <Container maxWidth="xl" sx={{ mt: { xs: 1.5, sm: 2.5 }, mb: 2, px: { xs: 1.5, sm: 2, md: 3 } }}>
        {/* Avisos que no deben desbordar en 360 px: la acción del aviso sin
            conexión baja bajo el texto y la ruta de pasos se desplaza dentro
            de su recuadro en lugar de empujar la página. */}
        <Box sx={{ '& .MuiAlert-root': { flexWrap: { xs: 'wrap', sm: 'nowrap' } } }}>
          <BarraSinConexion alAvisar={setAvisoOk} />
        </Box>
        {/* La ruta del proceso, plegable: quien entra por primera vez ve por
            dónde empezar y en qué orden va todo (Edison 2026-09-05). */}
        {/* La bandeja por ETAPAS: cuánto hay en cada una y qué es mío; un
            toque filtra (Edison 2026-10-01: «hacer intuitiva la bandeja»). */}
        <EtapasBandeja
          documentos={documentos}
          estado={filtroEstado}
          soloMios={soloMios}
          alElegir={(v) => elegirEstado(v === 'TODOS' || filtroEstado === v ? 'TODOS' : v)}
          alMios={() => setSoloMios((x) => !x)}
        />
        <Box sx={{ minWidth: 0, '& .MuiCollapse-wrapperInner > .MuiBox-root': { overflowX: 'auto' } }}>
          <GuiaFlujo />
        </Box>
        {avisoSeguimiento}
        {celular ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
            {campoBuscar}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {botonNuevo}
              <Button
                variant={filtrosAbiertos ? 'contained' : 'outlined'}
                color={filtrosAbiertos ? 'primary' : 'inherit'}
                startIcon={
                  <Badge variant="dot" color="secondary" invisible={!hayFiltros}>
                    <TuneIcon />
                  </Badge>
                }
                onClick={() => setFiltrosAbiertos((v) => !v)}
                aria-expanded={filtrosAbiertos}
                sx={{ flexShrink: 0 }}
              >
                Filtros
              </Button>
              {botonRefrescar}
            </Box>
            <Collapse in={filtrosAbiertos}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, pt: 0.5 }}>
                {selectTipo}
                <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {selectOrden}
                  {botonDir}
                </Box>
                <Box sx={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  {botonMasFiltros}
                  {botonReconocer}
                </Box>
              </Box>
            </Collapse>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {botonNuevo}
            {campoBuscar}
            {selectTipo}
            {botonMasFiltros}
            {selectOrden}
            {botonDir}
            {botonRefrescar}
            {/* Lo del administrador, junto en un menú: la barra cabe en una línea. */}
            {esAdmin && (
              <>
                <Tooltip title="Herramientas del administrador">
                  <IconButton size="small" onClick={(e) => setMenuAdmin(e.currentTarget)} aria-label="Herramientas del administrador">
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Menu anchorEl={menuAdmin} open={menuAdmin !== null} onClose={() => setMenuAdmin(null)}>
                  <MenuItem onClick={() => { setMenuAdmin(null); void reconocer() }}>
                    <ListItemIcon><TravelExploreIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Reconocer archivos" secondary="«…[R].pdf» y constancias ya existentes; autocompletar folios" />
                  </MenuItem>
                  {!tarjetas && (
                    <MenuItem onClick={() => { setMenuAdmin(null); setDlgColumnas(true) }}>
                      <ListItemIcon><ViewColumnIcon fontSize="small" /></ListItemIcon>
                      <ListItemText primary="Columnas" secondary="Ancho y líneas de cada columna" />
                    </MenuItem>
                  )}
                </Menu>
              </>
            )}
            {hayCambiosColumnas && !tarjetas && (
              <Tooltip title="Guardar el ancho y las líneas actuales como predeterminado para todos">
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={guardarColumnas}
                >
                  Guardar columnas
                </Button>
              </Tooltip>
            )}
          </Box>
        )}
        <ElegirEntrada
          ancla={anclaNuevo}
          alWord={() => navegar('/documentos/word?nuevo=1')}
          alCerrar={() => setAnclaNuevo(null)}
          tipo="documento-administrativo"
          alManual={() => { setDesdePrompt(''); if (refNuevo.current) setMenuNuevo(refNuevo.current) }}
          alPrompt={() => { setDesdePrompt('skill'); if (refNuevo.current) setMenuNuevo(refNuevo.current) }}
        />
        <Menu
          anchorEl={menuNuevo}
          open={menuNuevo !== null}
          onClose={() => { setMenuNuevo(null); setDesdePrompt('') }}
        >
          {tipos.filter((t) => !t.externo).map((t) => (
            <MenuItem key={t.codigo} onClick={() => nuevoDocumento(t.codigo)}>
              {t.nombre}
            </MenuItem>
          ))}
          <Divider />
          {/* Un Word con uno o varios oficios → N borradores con sus campos y cuerpo leídos (2026-10-18,
              fase 0 de «Formato Word»); se completan y numeran en el editor, uno por uno. */}
          <MenuItem
            onClick={() => {
              setMenuNuevo(null)
              setDialogoWord(true)
            }}
          >
            Desde un Word (uno o varios documentos)…
          </MenuItem>
          {/* Documentos hechos en Word (p. ej. con el sistema caído) que ya
              llevan número impreso: entran con su PDF, sin editor, y siguen
              el trámite desde ahí (Edison 2026-09-11). */}
          <MenuItem
            onClick={() => {
              setMenuNuevo(null)
              setDialogoIncorporar(true)
            }}
          >
            Incorporar documento elaborado fuera del sistema…
          </MenuItem>
        </Menu>
        <CargarWordDocumentos
          abierto={dialogoWord}
          tipos={tipos}
          alCerrar={() => setDialogoWord(false)}
          alAvisar={(tipo, texto) => (tipo === 'error' ? setErrorAccion(texto) : setAvisoOk(texto))}
          alCreados={(creados) => {
            cargar()
            if (creados.length === 1) abrir(creados[0].id)
          }}
        />
        <DialogoIncorporar
          abierto={dialogoIncorporar}
          tipos={tipos.filter((t) => !SOLO_DESDE_SU_MODULO.includes(t.codigo))}
          alCerrar={() => setDialogoIncorporar(false)}
          alIncorporado={(id) => {
            setDialogoIncorporar(false)
            abrir(id)
          }}
          alAvisar={(tipo, texto) => (tipo === 'error' ? setErrorAccion(texto) : setAvisoOk(texto))}
        />
        {panelAvanzado && (
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 1.25, sm: 2 },
              mb: 2,
              flexWrap: 'wrap',
              alignItems: 'center',
              ...(celular && { p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }),
            }}
          >
            {celular && (
              <Typography variant="subtitle2" sx={{ width: '100%' }}>
                Búsqueda avanzada
              </Typography>
            )}
            {/* Estado: los de las pestañas y los poco comunes (Archivado,
                Observado posterior). */}
            <Box sx={{ width: { xs: '100%', sm: 190 } }}>{selectEstado}</Box>
            <TextField
              size="small"
              label="Año"
              placeholder="2026"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              inputProps={{ inputMode: 'numeric' }}
              sx={{ width: { xs: 'calc(35% - 6px)', sm: 110 } }}
            />
            <TextField
              size="small"
              label="Destinatario / institución"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              sx={{ width: { xs: 'calc(65% - 6px)', sm: 240 } }}
            />
            <TextField
              select
              size="small"
              label="Firma"
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              sx={{ width: { xs: 'calc(50% - 6px)', sm: 190 } }}
            >
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="firmado">Firmados</MenuItem>
              <MenuItem value="pendiente">Pendientes de firma</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              label="Vínculo"
              value={vinculo}
              onChange={(e) => setVinculo(e.target.value)}
              sx={{ width: { xs: 'calc(50% - 6px)', sm: 170 } }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="respondido">Respondidos</MenuItem>
              <MenuItem value="relacionado">Relacionados</MenuItem>
            </TextField>
            <Button
              size="small"
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={() => setModoBusqueda(true)}
              disabled={buscando}
              fullWidth={celular}
            >
              Buscar en todo
            </Button>
            {/* 2026-10-06: quitada la nota bajo «Buscar en todo» (lo dice el campo de búsqueda). */}
            {celular && (
              <Button size="small" onClick={alternarPanelAvanzado} sx={{ ml: 'auto' }}>
                Cerrar
              </Button>
            )}
          </Box>
        )}
        {modoBusqueda && (
          <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2" color="primary">
              {buscando
                ? 'Buscando…'
                : `Búsqueda avanzada: ${busqueda?.length ?? 0} resultado(s)`}
            </Typography>
            <Button size="small" onClick={limpiarBusqueda}>
              Limpiar
            </Button>
          </Box>
        )}
        <AvisoSync />
        {!tarjetas && barraSeleccion}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, minHeight: 24 }}>
          {/* En las tarjetas no hay cabecera: la casilla de «toda la
              página» se pone junto al conteo. */}
          {tarjetas && estado === 'ok' && paginados.length > 0 && (
            <Box sx={{ ml: '3px' }}>{cabeceraSeleccion()}</Box>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {estado === 'ok' && `${visibles.length} de ${documentos.length} documento(s)`}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={vista}
            onChange={(_, v) => cambiarVista(v)}
            aria-label="Forma de ver la bandeja"
            sx={{ bgcolor: 'background.paper', '& .MuiToggleButton-root': { px: { xs: 0.9, sm: 1.25 }, py: 0.4, gap: 0.6, textTransform: 'none', fontSize: 12.5 } }}
          >
            {([
              ['lista', 'Lista', ViewListOutlinedIcon, 'La tabla de siempre'],
              ['etapas', 'Por etapa', ViewKanbanOutlinedIcon, 'Un tablero por estado del documento'],
              ['seguimiento', 'Seguimiento', AltRouteOutlinedIcon, 'Qué le falta a cada uno: enviar, cargo de recepción, registro en el STD'],
              ['instituciones', 'Instituciones', AccountBalanceOutlinedIcon, 'Agrupados por la institución a la que van'],
              ['cronologia', 'Cronología', EventNoteOutlinedIcon, 'Por mes y semana de su fecha'],
            ] as const).map(([v, t, Icono, ayuda]) => (
              <ToggleButton key={v} value={v} aria-label={t}>
                <Tooltip title={ayuda}>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
                    <Icono sx={{ fontSize: 17 }} />
                    <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>{t}</Box>
                  </Box>
                </Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {vista !== 'lista' && estado === 'ok' ? (
          <VistasBandeja vista={vista} documentos={visibles} alAbrir={tocar} alAbrirCompleto={abrir} sigla={sinSiglas} />
        ) : tarjetas ? (
          <>
            {avisoLista() ?? (
              <Box
                component="section"
                aria-label="Documentos"
                sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}
              >
                {paginados.map(tarjeta)}
              </Box>
            )}
            {barraSeleccion}
            {visibles.length > 0 && (
              <Paper variant="outlined" sx={{ mt: 1 }}>
                {paginacion}
              </Paper>
            )}
            {menuDeFila()}
          </>
        ) : (
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table sx={{ tableLayout: 'fixed', minWidth: anchoTotal }}>
              <colgroup>
                {columnasVisibles.map((col) => (
                  <col key={col.key} style={{ width: `${anchos[col.key] ?? col.anchoDef}px` }} />
                ))}
              </colgroup>
              <TableHead>
                <TableRow>
                  {columnasVisibles.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align}
                      sx={{
                        position: 'relative',
                        // La cabecera puede partirse en 2 líneas («N.º de
                        // documento», «Institución destino»): aprovecha el
                        // ancho sin ensanchar la columna.
                        whiteSpace: 'normal',
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        userSelect: 'none',
                        pr: esAdmin ? 1.5 : undefined,
                      }}
                    >
                      {col.key === 'sel' ? (
                        cabeceraSeleccion()
                      ) : col.key === 'seguimiento' ? (
                        <Tooltip title="Seguimiento: observaciones, encargo y ruta del trámite">
                          <FactCheckIcon sx={{ fontSize: 18, verticalAlign: 'middle', opacity: 0.6 }} aria-label="Seguimiento" />
                        </Tooltip>
                      ) : (
                        col.label
                      )}
                      {esAdmin && !col.fija && (
                        <Tooltip title="Arrastra para ajustar el ancho">
                          <Box
                            onMouseDown={iniciarRedim(col.key)}
                            onClick={(e) => e.stopPropagation()}
                            sx={{
                              position: 'absolute',
                              top: 0,
                              right: 0,
                              height: '100%',
                              width: '10px',
                              cursor: 'col-resize',
                              '&:hover': { bgcolor: 'primary.main', opacity: 0.35 },
                            }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>{cuerpoTabla()}</TableBody>
            </Table>
            {paginacion}
          </TableContainer>
        )}
        <Menu
          anchorEl={menuEstado?.el ?? null}
          open={menuEstado !== null}
          onClose={() => setMenuEstado(null)}
        >
          {(menuEstado?.doc.transiciones ?? []).map((destino) => (
            <MenuItem key={destino} onClick={() => pedirCambioEstado(menuEstado!.doc, destino)}>
              Pasar a «{ETIQUETA_ESTADO[destino] ?? destino}»
            </MenuItem>
          ))}
        </Menu>
        <Menu
          anchorEl={menuRecepcion?.el ?? null}
          open={menuRecepcion !== null}
          onClose={() => setMenuRecepcion(null)}
        >
          {(menuRecepcion?.doc.destinatarios ?? []).map((dest) => {
            const doc = menuRecepcion!.doc
            const constancia = doc.recepciones.find((r) => r.etiqueta === dest)
            return (
              <MenuItem
                key={dest}
                onClick={() => {
                  setMenuRecepcion(null)
                  if (constancia) descargarDoc(doc, constancia.id, `constancia - ${dest}`)
                  else subirDoc(doc, 'recepcion', dest)
                }}
              >
                {constancia ? (
                  <CheckCircleIcon fontSize="small" color="success" sx={{ mr: 1 }} />
                ) : (
                  <UploadFileIcon fontSize="small" sx={{ mr: 1, opacity: 0.5 }} />
                )}
                {dest}
              </MenuItem>
            )
          })}
          {(menuRecepcion?.doc.recepciones ?? [])
            .filter((r) => !menuRecepcion!.doc.destinatarios.includes(r.etiqueta))
            .map((r) => (
              <MenuItem
                key={`extra-${r.id}`}
                onClick={() => {
                  setMenuRecepcion(null)
                  descargarDoc(menuRecepcion!.doc, r.id, r.etiqueta || 'constancia')
                }}
              >
                <CheckCircleIcon fontSize="small" color="success" sx={{ mr: 1 }} />
                {r.etiqueta || 'Constancia (sin destinatario)'}
              </MenuItem>
            ))}
        </Menu>
      </Container>
      <Snackbar
        open={errorAccion !== ''}
        autoHideDuration={5000}
        onClose={() => setErrorAccion('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 'calc(74px + env(safe-area-inset-bottom))', sm: 24 } }}
      >
        <Alert severity="error" onClose={() => setErrorAccion('')}>
          {errorAccion}
        </Alert>
      </Snackbar>
      <Snackbar
        open={avisoOk !== ''}
        autoHideDuration={6000}
        onClose={() => setAvisoOk('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 'calc(74px + env(safe-area-inset-bottom))', sm: 24 } }}
      >
        <Alert severity="success" onClose={() => setAvisoOk('')}>
          {avisoOk}
        </Alert>
      </Snackbar>

      {/* Cambio de estado con comentario. Observar EXIGE la observación: sin
          ella, el responsable no sabe qué corregir (regla de la entidad, y el
          servidor la hace cumplir con 409). Al devolver a borrador el
          comentario es la indicación del trabajo, y se puede encargar. */}
      <Dialog open={dlgEstado !== null} onClose={() => setDlgEstado(null)} maxWidth="sm" fullWidth fullScreen={celular}>
        <DialogTitle>
          {dlgEstado?.destino === 'BORRADOR'
            ? 'Devolver a borrador'
            : 'Observar el documento'}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {dlgEstado?.destino === 'BORRADOR'
              ? 'Indique el trabajo y, si corresponde, a quién.'
              : 'Indique qué corregir.'}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label={
              dlgEstado?.destino === 'BORRADOR'
                ? 'Indicación del trabajo'
                : 'Observación (obligatoria)'
            }
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            select
            fullWidth
            size="small"
            label="Encargar a (opcional)"
            value={encargadoA}
            onChange={(e) => setEncargadoA(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <MenuItem value="">— dejar como está —</MenuItem>
            {equipo.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.nombre_completo} ({m.rol})
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgEstado(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={
              dlgEstado?.destino !== 'BORRADOR' && comentario.trim().length < 5
            }
            onClick={() =>
              dlgEstado &&
              cambiarEstado(
                dlgEstado.doc,
                dlgEstado.destino,
                comentario,
                encargadoA === '' ? null : encargadoA,
              )
            }
          >
            {dlgEstado?.destino === 'BORRADOR' ? 'Devolver' : 'Observar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Registro en el STD del Congreso: último paso de la ruta del oficio. */}
      {/* Panel de seguimiento en diálogo: el MISMO componente del editor, para
          que la bandeja no tenga una copia que se desincronice. */}
      <Dialog
        open={dlgGestion !== null}
        onClose={() => {
          setDlgGestion(null)
          cargar()
        }}
        maxWidth="sm"
        fullWidth
        fullScreen={celular}
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          {dlgGestion?.numero_completo}
          <Typography variant="body2" color="text.secondary">
            {dlgGestion?.asunto}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {dlgGestion && (
            <PanelSeguimiento
              key={dlgGestion.id}
              documentoId={dlgGestion.id}
              tramite={dlgGestion.tramite}
              responsable={dlgGestion.responsable}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDlgGestion(null)
              cargar()
            }}
          >
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dlgStd !== null} onClose={() => setDlgStd(null)} maxWidth="xs" fullWidth fullScreen={celular}>
        <DialogTitle>Registrar en el STD del Congreso</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {dlgStd?.numero_completo}. Anote el número de expediente que devolvió
            Mesa de Partes / Oficialía Mayor al registrar el cargo.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="N.º de expediente STD"
            value={stdNumero}
            onChange={(e) => setStdNumero(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            size="small"
            type="date"
            label="Fecha de registro"
            InputLabelProps={{ shrink: true }}
            value={stdFecha}
            onChange={(e) => setStdFecha(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgStd(null)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarStd}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Folios desde la tarjeta: la misma guardarFolios de la celda. */}
      <Dialog open={dlgFolios !== null} onClose={() => setDlgFolios(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Folios</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {dlgFolios?.numero_completo}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type="number"
            label="Número de folios"
            value={foliosTexto}
            onChange={(e) => setFoliosTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dlgFolios) {
                void guardarFolios(dlgFolios, foliosTexto)
                setDlgFolios(null)
              }
            }}
            inputProps={{ min: 0, inputMode: 'numeric' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgFolios(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (dlgFolios) void guardarFolios(dlgFolios, foliosTexto)
              setDlgFolios(null)
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dlgColumnas} onClose={() => setDlgColumnas(false)} maxWidth="sm" fullWidth fullScreen={celular}>
        <DialogTitle>Configuración de columnas</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ajusta el ancho (px) y cuántas líneas puede ocupar el texto de cada
            columna. También puedes arrastrar el borde derecho de cada encabezado
            directamente en la tabla. «Guardar como predeterminado» fija la vista
            para todos los usuarios.
          </Typography>
          {columnasVisibles.filter((c) => !c.fija).map((col) => (
            <Box key={col.key} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
              <Typography sx={{ width: { xs: '100%', sm: 150 }, flexShrink: 0 }}>
                {col.label || '(acciones)'}
              </Typography>
              <TextField
                type="number"
                size="small"
                label="Ancho (px)"
                value={anchos[col.key] ?? col.anchoDef}
                onChange={(e) => setAncho(col.key, Number(e.target.value))}
                sx={{ width: 120 }}
                inputProps={{ min: 48, max: 900 }}
              />
              {col.texto ? (
                <TextField
                  select
                  size="small"
                  label="Líneas"
                  value={lineas[col.key] ?? col.lineasDef}
                  onChange={(e) => setLinea(col.key, Number(e.target.value))}
                  sx={{ width: 100 }}
                >
                  <MenuItem value={1}>1</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                  <MenuItem value={3}>3</MenuItem>
                </TextField>
              ) : (
                <Box sx={{ width: 100 }} />
              )}
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={restablecerColumnas} color="inherit">
            Restablecer
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => setDlgColumnas(false)}>Cerrar</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={guardarColumnas}>
            Guardar como predeterminado
          </Button>
        </DialogActions>
      </Dialog>
      <DialogoMesaDePartes documentoId={mesaDoc} alCerrar={() => setMesaDoc(null)} />
      {comparando && (
        <VisorComparar documentos={[...seleccion].map((id) => documentos.find((d) => d.id === id)).filter((d): d is ResumenDocumento => Boolean(d))} alCerrar={() => setComparando(false)} />
      )}
      {rapido !== null && (
        <VisorRapido
          documentos={visibles}
          id={rapido}
          alCambiar={(id) => {
            guardarSS('ultimo', String(id))
            setRapido(id)
          }}
          alCerrar={() => setRapido(null)}
          alAbrir={(id) => {
            setRapido(null)
            abrir(id, true)
          }}
        />
      )}
    </Marco>
  )
}

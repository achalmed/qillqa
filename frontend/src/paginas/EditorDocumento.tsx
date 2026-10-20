import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { extensionesDocumento } from '../extensiones/esquema'
import { AutocompletarReferencias, crearControl } from '../extensiones/AutocompletarReferencias'
import PopupReferencias, { avisarRelaciones, useAvisoReferencias } from '../componentes/PopupReferencias'
import SugerenciaInformeSR from '../componentes/SugerenciaInformeSR'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import type * as Y from 'yjs'
import type { Transaction } from '@tiptap/pm/state'
import type { Node as NodoPM } from '@tiptap/pm/model'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import {
  colorDe,
  estiloCursores,
  useOtrosEnTexto,
  useProveedorCompartido,
} from '../componentes/textoCompartido'
import BarraFormato, { MenuTabla, estiloHerramientas } from '../componentes/BarraFormato'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Menu from '@mui/material/Menu'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import EditNoteIcon from '@mui/icons-material/EditNote'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import SaveIcon from '@mui/icons-material/Save'
import VisibilityIcon from '@mui/icons-material/Visibility'
import HistoryIcon from '@mui/icons-material/History'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined'
import DownloadIcon from '@mui/icons-material/Download'
import FlagIcon from '@mui/icons-material/Flag'
import CajonActividad from '../componentes/CajonActividad'
import FormularioCampos, { type CampoEsquema } from '../componentes/FormularioCampos'
import PanelFormato from '../componentes/PanelFormato'
import { MarcaFormato } from '../componentes/AjusteFormato'
import VisorDocumento, { type VisorDocumentoHandle } from '../componentes/VisorDocumento'
import { destinatariosDe } from '../componentes/GestionEntrega'
import PanelArchivos from '../componentes/PanelArchivos'
import Adjuntos, {
  EVENTO_ADJUNTOS,
  cargarArchivoDeManual,
  parsearManuales,
  serializarManuales,
} from '../componentes/Adjuntos'
import PanelSeguimiento, { EVENTO_REGISTRAR_STD, type Tramite } from '../componentes/PanelSeguimiento'
import PegarDocumento from '../componentes/PegarDocumento'
import EstadoVistaPrevia, { type EstadoCompilacion } from '../componentes/EstadoVistaPrevia'
import DialogoPegarSeguimiento from '../componentes/seguimiento/DialogoPegarSeguimiento'
import { registrarPegado, textoDeMensaje, tipoDelBloque } from '../pegar'
import { textoDeCuerpo } from '../diferencias'
import { ALTO_INDICE, IndiceSecciones } from '../componentes/GuiaDocumento'
import AnexosEditor, {
  parsearAnexos,
  type AnexosEditorHandle,
} from '../componentes/AnexosEditor'
import { ETIQUETA_ESTADO } from '../estados'
import { etapaActual, etapaDe } from '../flujo'
import { numerarCampos, subNumero } from '../numeracion'
import { copiasOcultas } from '../formato'
import { ArmarExpediente, EVENTO_EXPEDIENTE } from '../componentes/Expediente'
import { conConfirmacion, esAnulaFirma, MENSAJE_NO_GUARDADO, textoAnulacion, type Anulacion } from '../vigencia'
import { Rotulo } from '../componentes/Paso'
import { Bloque, EstadoVacio, Titulo } from '../componentes/Estilo'
import Marco from '../componentes/Marco'
import DialogoRevision from '../componentes/DialogoRevision'
import { DialogoMesaDePartes } from '../componentes/MesaDePartes'
import { PALETA } from '../paleta'
import EquipoEnLinea, { haceCuanto } from '../componentes/EquipoEnLinea'
import MapaLocal from '../componentes/grafo/MapaLocal'
import { ConPresencia, ProveedorSala, useSala } from '../componentes/Presencia'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import BotonPaso from '../componentes/BotonPaso'
import BarraSinConexion from '../componentes/BarraSinConexion'
import BotonActualizar from '../componentes/BotonActualizar'
import { esSinServidor, leyendoDeCache } from '../api'
import { ofrecerAlVolver } from '../componentes/AvisoAlVolver'
import { encolar, claveConflicto, guardarApartado, leerApartadosAnteriores, escribirApartadosAnteriores, type ContenidoApartado } from '../sinconexion'
import DialogoVerificacion, {
  type Copia,
  type PuntoVerificacion,
} from '../componentes/DialogoVerificacion'
import PostAddIcon from '@mui/icons-material/PostAdd'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import ZonaBloqueada from '../componentes/ZonaBloqueada'
import { firmaEnCurso, PREGUNTA_DESBLOQUEO } from '../bloqueoFirma'
import { copiarTextoConFormato } from '../copiar'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { api, apiPdf, ErrorApi, hayServidor } from '../api'
import {
  Canal,
  ComentariosContext,
  ConObservaciones,
  MarcaObservacion,
  PendientesSeccion,
  TituloSeccion,
  useComentarios,
} from '../componentes/ObservacionesSeccion'
import { confirmar } from '../componentes/Dialogos'

// Cuerpo del 409 «verificacion_pendiente» de /generar.
interface DetalleVerificacion {
  codigo?: string
  puntos?: PuntoVerificacion[]
  copias?: Copia[]
  sugeridas?: Copia[]
}

interface DetalleConflicto {
  codigo?: string
  editado_por?: string
  editado_en?: string
}

const horaDe = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''

/** Alto de la conmutación «Redactar | Vista PDF» (pantallas angostas). */
/** Las partes del formulario, en su orden (índice de la redacción). */
const SECCIONES_FORM = [
  { id: 'seguimiento', texto: 'Seguimiento' },
  { id: 'datos', texto: 'Datos' },
  { id: 'cuerpo', texto: 'Cuerpo' },
  { id: 'anexos', texto: 'Anexos' },
  { id: 'archivos', texto: 'Archivos y firmado' },
  { id: 'formato', texto: 'Formato' },
  { id: 'relaciones', texto: 'Relaciones' },
]
/** Ancla de una sección: al saltar, queda debajo del índice fijo. */
const ANCLA = { scrollMarginTop: 64 }
const ALTO_CONMUTADOR = 52

interface Documento {
  estado_compilacion?: EstadoCompilacion
  id: number
  numero: number | null
  numero_completo: string
  tipo: string
  tipo_nombre: string
  estado: string
  campos: Record<string, string>
  cuerpo: object
  transiciones: string[]
  esquema_campos: CampoEsquema[]
  cuerpo_con_secciones: boolean
  actualizado_en: string
  // Versión del CONTENIDO (sube en cada guardado/vista previa/numeración).
  // Base del control de concurrencia: viaja como `version_base` en cada
  // guardado y el respaldo local se ata a ella (ver `baseRef`).
  version: number
  // Seguimiento del trámite: los 4 hitos de la ruta del oficio y quién tiene
  // el documento en mano (Edison 2026-09-04).
  tramite?: Tramite
  responsable?: string
  responsable_id?: number | null
  // Quién tocó el contenido por última vez y cuándo (2026-10-05); el nombre
  // llega vacío a quien no ve la autoría (rol invitado).
  ultima_edicion?: { por: string; en: string }
  // Edición simultánea (paso 5.6, 2026-10-05): si rige, si se podría
  // encender, la generación del texto compartido y lo último escrito en él.
  colaboracion?: boolean
  compartible?: boolean
  generacion?: number
  borrador?: { campos?: Record<string, string>; cuerpo?: object } | null
  // Firma en curso (vigencia.ciclo_activo, 2026-10-06): el editor abre en
  // solo lectura (bloqueoFirma.ts).
  firma_en_curso?: boolean
}

// Claves del formulario que NO se comparten en vivo: los anexos son editores
// aparte y viajan al guardar (por turnos).
const CAMPOS_LOCALES = new Set(['anexos', 'anexo_cuerpo', 'anexo_titulo'])
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

// Pausa tras la última tecla antes del guardado automático (2026-10-08).
const AUTO_MS = 4000

// Campo ausente y campo vacío valen lo mismo: borrar lo escrito vuelve a limpio.
function camposIguales(a: Record<string, string>, b: Record<string, string>): boolean {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of claves) if ((a[k] ?? '') !== (b[k] ?? '')) return false
  return true
}

export default function EditorDocumento() {
  const { id } = useParams()
  const navegar = useNavigate()
  const claveRespaldo = `sgdp_respaldo_${id}`
  const [documento, setDocumento] = useState<Documento | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [urlPdf, setUrlPdf] = useState('')
  const [ocupado, setOcupado] = useState('')
  const ocupadoRef = useRef(ocupado)
  ocupadoRef.current = ocupado
  const [errorCarga, setErrorCarga] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error' | 'info' | 'warning'; texto: string } | null>(null)
  // ¿Hay cambios en pantalla que la vista previa todavía no refleja? Se pinta
  // sobre el visor: sin esto, un PDF «viejo» se lee como «no se guardó».
  const [sucio, setSucio] = useState(false)
  // Conflicto de versiones (2026-09-14): lo de esta pestaña quedó APARTADO en
  // este equipo y en pantalla está la versión vigente del servidor.
  const [conflicto, setConflicto] = useState<DetalleConflicto | null>(null)
  // Apartados anteriores de este equipo (choques seguidos sin cargar; sinconexion.ts, 2026-10-12).
  const [anteriores, setAnteriores] = useState<ContenidoApartado[]>([])
  const [verAnteriores, setVerAnteriores] = useState(false)
  // Alguien guardó este documento desde otro lugar mientras aquí hay cambios
  // sin guardar: se avisa; al guardar, el servidor obligará a elegir.
  const [ajeno, setAjeno] = useState<DetalleConflicto | null>(null)
  // Documento FIRMADO = solo lectura (Edison 2026-10-06, bloqueoFirma.ts):
  // lo firmado, enviado o en trámite no se reescribe por un toque. Solo
  // «Editar de todos modos» lo abre, y vale para esta visita.
  const [desbloqueado, setDesbloqueado] = useState(false)
  useEffect(() => setDesbloqueado(false), [id])
  const firmado = documento ? firmaEnCurso(documento) : false
  const bloqueado = firmado && !desbloqueado
  const bloqueadoRef = useRef(bloqueado)
  bloqueadoRef.current = bloqueado
  // Guardado automático (2026-10-08): nunca en un firmado (aun desbloqueado:
  // guardar anularía la firma y eso lo decide la persona con Guardar) ni para
  // un invitado, que no edita.
  const autoPermitido = !firmado && localStorage.getItem('sgdp_rol') !== 'invitado'
  const autoPermitidoRef = useRef(autoPermitido)
  autoPermitidoRef.current = autoPermitido
  const [cajonAbierto, setCajonAbierto] = useState(false)
  // Reloj de minuto para que «hace N min» de la última edición avance solo.
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  // Verificación de copias antes de numerar (Edison 2026-09-05): el servidor
  // rechaza /generar con 409 y devuelve qué copias hay que confirmar.
  const [dlgCopias, setDlgCopias] = useState<{
    puntos: PuntoVerificacion[]
    copias: Copia[]
    sugeridas: Copia[]
  } | null>(null)
  // Visor derecho (componente compartido con la vista heredada): PDF del
  // documento + firmado / constancias / respuestas externas. Se refresca con
  // visorRef tras subir un firmado/constancia o registrar una respuesta.
  const visorRef = useRef<VisorDocumentoHandle>(null)
  // Estado de la última compilación (reparada o no al día): se muestra sobre el visor (2026-10-12).
  const [estadoVista, setEstadoVista] = useState<EstadoCompilacion | null>(null)
  useEffect(() => setEstadoVista(null), [id])
  // Celular y tableta (< md): en vez de dos columnas apretadas, una sola a
  // todo el ancho y una conmutación «Redactar | Vista PDF» arriba (Edison
  // 2026-10-01: «el diputado usa casi siempre el celular»). Las dos columnas
  // siguen montadas (solo se ocultan): el visor conserva su estado y su ref.
  const tema = useTheme()
  const angosta = useMediaQuery(tema.breakpoints.down('md'))
  const [vistaMovil, setVistaMovil] = useState<'redactar' | 'pdf'>('redactar')
  // La columna del formulario: lo que se desplaza en escritorio (el índice
  // de secciones la vigila para marcar en qué parte se está).
  const [columna, setColumna] = useState<HTMLElement | null>(null)
  const [menuMas, setMenuMas] = useState<HTMLElement | null>(null)
  const [mesaPartes, setMesaPartes] = useState(false)
  const [dlgRevision, setDlgRevision] = useState(false)
  // «Enviar» (2026-10-10): no cambia el estado. Externo: abre la mesa de partes; el cargo lo
  // marca enviado. Interno: abre el STD de la intranet (enlace fijado en Administración); el
  // registro en el STD lo marca enviado.
  const enviar = () => {
    if (documento?.tramite?.ambito === 'interno') {
      api<{ url: string }>('/api/ajustes/std-url')
        .then((r) => {
          if (r.url) window.open(r.url, '_blank', 'noopener')
          else setAviso({ tipo: 'info', texto: 'Falta el enlace del STD: el administrador lo fija en Administración.' })
        })
        .catch(() => setAviso({ tipo: 'error', texto: 'No se pudo leer el enlace del STD.' }))
      return
    }
    setMesaPartes(true)
  }

  // El cuerpo se carga en el editor UNA vez por documento; sin este
  // guardia, cualquier setDocumento posterior (p. ej. tras numerar)
  // revertiría el editor al contenido viejo y un Guardar lo grabaría.
  const cuerpoCargadoId = useRef<string | null>(null)

  // --- Edición simultánea (paso 5.6, 2026-10-05) -------------------------
  // Con el interruptor encendido, el cuerpo es un texto compartido
  // `doc:<id>:<generación>` (Yjs, como las partes del proyecto de ley) y los
  // datos del formulario viajan en su mapa `campos`. Si el servidor
  // compartido no responde, la página sigue por turnos (`modoTurnos`).
  const [modoTurnos, setModoTurnos] = useState(false)
  useEffect(() => setModoTurnos(false), [id])
  // Reintento solo (2026-10-12): el 12 de octubre el servidor compartido se cayó y las pestañas
  // siguieron por turnos hasta recargar, chocando entre ellas. Ahora, mientras el documento siga en
  // compartido, cada 30 s se vuelve a intentar; el aviso de falla sale una sola vez por caída.
  const fallaAvisadaRef = useRef(false)
  useEffect(() => {
    if (!modoTurnos || !documento?.colaboracion) return
    // Solo con todo guardado: pasar a compartido con cambios sin guardar los dejaría fuera del texto compartido.
    const t = window.setInterval(() => {
      if (!sucioRef.current) setModoTurnos(false)
    }, 30_000)
    return () => window.clearInterval(t)
  }, [modoTurnos, documento?.colaboracion])
  const nombreCompartido =
    documento?.colaboracion && !modoTurnos ? `doc:${id}:${documento.generacion ?? 0}` : null
  // cargarVigente se define más abajo; el proveedor la llama por esta ref.
  const recargarRef = useRef<() => void>(() => {})
  const { proveedor, estado: estadoCompartido } = useProveedorCompartido(nombreCompartido, {
    alRecargar: () => recargarRef.current(),
    alFallar: () => {
      setModoTurnos(true)
      // Por turnos desde lo último escrito en compartido, no desde lo guardado.
      const vivo = documento?.borrador?.campos
      if (vivo) setCampos((previos) => ({ ...previos, ...vivo }))
      if (!fallaAvisadaRef.current) {
        fallaAvisadaRef.current = true
        setAviso({
          tipo: 'warning',
          texto: 'La edición simultánea no responde: siga escribiendo; se guarda por turnos y se reintenta sola.',
        })
      }
    },
  })
  const otrosEnTexto = useOtrosEnTexto(proveedor)
  useEffect(() => { if (estadoCompartido === 'en_vivo') fallaAvisadaRef.current = false }, [estadoCompartido])
  // Sala de presencia del documento: etiqueta con el nombre de quien escribe
  // en cada campo del formulario (Presencia.tsx), haya o no texto compartido.
  const sala = useSala(id ? `sala:doc:${id}` : null)
  // Lo leen el respaldo local, el sondeo y el guardado (closures viejas).
  const enVivoRef = useRef(false)
  enVivoRef.current = proveedor !== null
  const generacionRef = useRef<number | undefined>(undefined)
  generacionRef.current = documento?.generacion
  const yo = localStorage.getItem('sgdp_nombre') ?? 'Yo'

  // Autocompletado de referencias (2026-10-06): la extensión avisa a la lista
  // (PopupReferencias) por este objeto, que vive lo que la página.
  const controlReferencias = useMemo(crearControl, [])
  const autocompletar = useMemo(() => AutocompletarReferencias.configure({ control: controlReferencias }), [controlReferencias])
  // Memorizadas: useEditor compara extensiones por identidad y recrearía el
  // editor (y su enlace con Yjs) en cada render.
  const extensionesCuerpo = useMemo(
    () =>
      proveedor
        ? [
            // Una sola lista con el servidor (extensiones/esquema.ts); en
            // compartido el deshacer lo lleva Yjs, por persona.
            ...extensionesDocumento({ historial: false }),
            Collaboration.configure({ document: proveedor.document }),
            CollaborationCaret.configure({ provider: proveedor, user: { name: yo, color: colorDe(yo) } }),
            autocompletar,
          ]
        : [...extensionesDocumento(), autocompletar],
    [proveedor, yo, autocompletar],
  )
  // Sin re-render por transacción (2026-10-06): por defecto useEditor repinta
  // TODA la página en cada tecla y en el celular se notaba al escribir. Lo que
  // depende del estado del editor (barra, recuento) lo vigila con useEditorState.
  const editor = useEditor(
    { extensions: extensionesCuerpo, shouldRerenderOnTransaction: false, editorProps: { attributes: { spellcheck: 'true', lang: 'es' } } },
    [extensionesCuerpo],
  )
  // false = sin evento 'update': setEditable lo emite por defecto y marcaría
  // el formulario como cambiado.
  useEffect(() => {
    if (editor && editor.isEditable === bloqueado) editor.setEditable(!bloqueado, false)
  }, [editor, bloqueado])
  // Las citas en pantalla, aún sin guardar, se ven en el mapa local como pendientes.
  useAvisoReferencias(editor, id ? `doc:${id}` : null)

  // Anexos compuestos (cuadros/tablas del formulario), aparte de los
  // adjuntos escaneados. Pueden ser VARIOS (ANEXO 1, 2, …): cada uno es un
  // editor TipTap propio dentro de <AnexosEditor>. Su contenido viaja en
  // campos.anexos (JSON de lista) y el generador emite una página por anexo
  // tras la firma. El padre los jala al guardar mediante esta ref.
  const anexosRef = useRef<AnexosEditorHandle>(null)

  // Menú contextual de TABLAS (clic derecho): alineaciones por celda/fila/
  // columna/tabla y operaciones de filas/columnas.
  const [menuTabla, setMenuTabla] = useState<{ x: number; y: number; ed: Editor } | null>(null)

  const abrirMenuTabla = (ed: Editor | null) => (e: React.MouseEvent) => {
    if (!ed || !ed.isActive('table')) return
    e.preventDefault()
    setMenuTabla({ x: e.clientX, y: e.clientY, ed })
  }


  // Respaldo local: guarda el trabajo en curso para que un refresco (el HMR de
  // Vite en las máquinas de las secretarias, una sesión vencida o un cierre
  // accidental) no lo pierda. Respalda TODO lo editable —campos, cuerpo y
  // anexos— vía datosActuales(); se limpia al Guardar. `datosActualesRef` evita
  // problemas de orden (datosActuales se define más abajo).
  const temporizadorRespaldo = useRef<ReturnType<typeof setTimeout>>()
  // ¿Hay cambios locales sin guardar? Evita re-crear el respaldo (y su aviso al
  // recargar) tras Guardar cuando el usuario solo refresca sin editar.
  const sucioRef = useRef(false)
  const datosActualesRef =
    useRef<() => { campos: Record<string, string>; cuerpo: object }>()
  // Versión del documento sobre la que se está editando. Va DENTRO del
  // respaldo para poder decidir, al recargar, si el respaldo sigue siendo
  // válido o si el documento cambió en el servidor mientras tanto.
  const baseRef = useRef(0)
  const guardarRespaldo = useCallback(() => {
    // En compartido, lo escrito lo conservan el servidor y cada pestaña (Yjs).
    if (!editor || !datosActualesRef.current || enVivoRef.current) return
    try {
      localStorage.setItem(
        claveRespaldo,
        JSON.stringify({ ...datosActualesRef.current(), base: baseRef.current }),
      )
    } catch {
      // localStorage lleno o no disponible: no interrumpir la edición.
    }
  }, [editor, claveRespaldo])
  // Lo que `sucio` vale en pantalla: setSucio solo si cambia, no en cada tecla.
  const sucioVistoRef = useRef(sucio)
  sucioVistoRef.current = sucio
  // Lo último guardado o compilado (cuerpo y campos): si la persona deshace
  // su cambio —escribe una letra y la borra— el aviso de vista previa se va,
  // en vez de quedarse hasta el próximo Guardar. `doc.eq` compara la
  // estructura sin serializar el documento.
  const camposRef = useRef(campos)
  camposRef.current = campos
  const limpioRef = useRef<{ doc: NodoPM; campos: Record<string, string> } | null>(null)
  const temporizadorLimpio = useRef<ReturnType<typeof setTimeout>>()
  const marcarLimpio = useCallback(() => {
    if (editor) limpioRef.current = { doc: editor.state.doc, campos: camposRef.current }
  }, [editor])
  const coincideConLimpio = useCallback(() => {
    const limpio = limpioRef.current
    return !!editor && !!limpio && editor.state.doc.eq(limpio.doc) && camposIguales(camposRef.current, limpio.campos)
  }, [editor])
  const quedarLimpio = useCallback(() => {
    sucioRef.current = false
    sucioVistoRef.current = false
    setSucio(false)
    localStorage.removeItem(claveRespaldo)
  }, [claveRespaldo])

  // Guardado automático: a los AUTO_MS de la última tecla se guarda y compila
  // solo (el mismo Guardar). Si ya hay un guardado o una compilación en curso,
  // espera a que termine; lo escrito mientras tanto sale en el siguiente.
  const guardarRef = useRef<(modo?: 'manual' | 'auto') => Promise<void>>(async () => {})
  const ajusteFirmaRef = useRef('')
  // Valores que el ajuste automático usó en la última compilación (se muestran en el panel).
  const [ajusteValores, setAjusteValores] = useState<Record<string, string>>({})
  const temporizadorAuto = useRef<ReturnType<typeof setTimeout>>()
  const programarAuto = useCallback((ms = AUTO_MS) => {
    clearTimeout(temporizadorAuto.current)
    temporizadorAuto.current = setTimeout(function intentar() {
      if (!sucioRef.current || bloqueadoRef.current || !autoPermitidoRef.current) return
      if (ocupadoRef.current !== '') {
        temporizadorAuto.current = setTimeout(intentar, 1000)
        return
      }
      void guardarRef.current('auto')
    }, ms)
  }, [])
  useEffect(() => () => clearTimeout(temporizadorAuto.current), [])

  const programarRespaldo = useCallback(() => {
    sucioRef.current = true
    if (!sucioVistoRef.current) {
      sucioVistoRef.current = true
      setSucio(true)
    }
    clearTimeout(temporizadorLimpio.current)
    temporizadorLimpio.current = setTimeout(() => {
      if (sucioRef.current && coincideConLimpio()) {
        quedarLimpio()
        clearTimeout(temporizadorAuto.current)
      }
    }, 300)
    programarAuto()
    clearTimeout(temporizadorRespaldo.current)
    // 1,5 s tras la última tecla y en un momento ocioso del navegador:
    // serializar todo el documento en cada pausa trababa la escritura.
    temporizadorRespaldo.current = setTimeout(() => {
      const respaldar = () => {
        if (sucioRef.current) guardarRespaldo() // ya guardado: no recrearlo
      }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(respaldar, { timeout: 2000 })
      } else {
        respaldar()
      }
    }, 1500)
  }, [guardarRespaldo, coincideConLimpio, quedarLimpio, programarAuto])

  // El respaldo se ata SIEMPRE a la versión que el editor tiene en pantalla:
  // tras Guardar, `refrescarEstado` trae la nueva y el próximo respaldo nace
  // apuntando a ella (si no, se descartaría al recargar).
  useEffect(() => {
    if (documento) baseRef.current = documento.version
  }, [documento])

  useEffect(() => {
    if (!editor) return
    // En compartido, Yjs carga el texto al abrir (y trae lo de los demás) con
    // transacciones que cambian el documento: no son cambios de esta pestaña y
    // encendían «Vista previa sin los últimos cambios» sin haber tocado nada.
    const alActualizar = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) {
        // Sin cambios propios, lo que llega de Yjs pasa a ser lo limpio.
        if (!sucioRef.current) marcarLimpio()
        return
      }
      programarRespaldo()
    }
    editor.on('update', alActualizar)
    return () => {
      editor.off('update', alActualizar)
    }
  }, [editor, programarRespaldo, marcarLimpio])

  // Un refresco inesperado (HMR de Vite, recarga o cierre de pestaña) dispara
  // `beforeunload`: volcamos el respaldo YA, sin esperar el debounce, para no
  // perder los últimos cambios. localStorage.setItem es síncrono, así alcanza.
  useEffect(() => {
    const alSalir = () => {
      if (sucioRef.current) guardarRespaldo()
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [guardarRespaldo])

  // Registrar la APERTURA del documento: si el revisor abre un borrador, el
  // sistema lo pone en revisión solo (servicios/revision.py). Se avisa para
  // que nadie se sorprenda de un cambio que no pidió expresamente.
  useEffect(() => {
    api<{ estado: string; revision_automatica: boolean }>(
      `/api/documentos/${id}/abrir`,
      { method: 'POST' },
    )
      .then((r) => {
        if (!r.revision_automatica) return
        setDocumento((d) => (d ? { ...d, estado: r.estado } : d))
        setAviso({
          tipo: 'info',
          texto: 'Pasó a «En revisión» al abrirlo.',
        })
      })
      .catch(() => {})
  }, [id])

  useEffect(() => {
    let respaldo:
      | { campos: Record<string, string>; cuerpo: object; base?: number }
      | null = null
    // Cambios de este equipo que NO entraron por un conflicto de versiones
    // (aquí o desde la cola sin conexión): se ofrecen al abrir.
    try {
      if (localStorage.getItem(claveConflicto(id ?? ''))) setConflicto({})
      setAnteriores(leerApartadosAnteriores(id ?? ''))
    } catch {
      /* sin localStorage */
    }
    try {
      const crudo = localStorage.getItem(claveRespaldo)
      if (crudo) respaldo = JSON.parse(crudo)
    } catch {
      respaldo = null
    }
    api<Documento>(`/api/documentos/${id}`)
      .then((doc) => {
        baseRef.current = doc.version
        // El respaldo vale SOLO si se hizo sobre la versión que hay ahora en
        // el servidor. Antes se restauraba siempre, así que una pestaña vieja
        // pisaba con texto obsoleto lo que otra persona (o la API) ya había
        // guardado: se perdió trabajo dos veces (Edison 2026-09-07). Se compara
        // la versión base y NO las fechas: los relojes de las laptops y el del
        // servidor no coinciden. Un respaldo del formato anterior no trae
        // `base` y se descarta, que es justo el caso que causó el problema.
        const vigente = respaldo?.base !== undefined && respaldo?.base === doc.version
        if (respaldo && !vigente) {
          localStorage.removeItem(claveRespaldo)
          respaldo = null
          setAviso({
            tipo: 'warning',
            texto: 'Se descartó un borrador local: hay una versión más reciente.',
          })
        }
        // Documento FIRMADO (2026-10-06): un respaldo local son cambios que
        // anularían la firma; no se cargan sobre lo firmado ni invitan a guardar.
        if (respaldo && firmaEnCurso(doc)) {
          localStorage.removeItem(claveRespaldo)
          respaldo = null
          setAviso({
            tipo: 'info',
            texto: 'Se descartaron cambios sin guardar: el documento está firmado.',
          })
        }
        if (respaldo) {
          // Incluir campos en `documento` para que los ANEXOS restaurados se
          // reflejen (AnexosEditor se inicializa con documento.campos).
          setDocumento({
            ...doc,
            campos: respaldo.campos ?? doc.campos,
            cuerpo: respaldo.cuerpo,
          })
          setCampos(respaldo.campos ?? doc.campos)
          sucioRef.current = true  // sigue habiendo trabajo sin guardar
          setAviso({
            tipo: 'info',
            texto:
              'Se restauraron cambios locales sin guardar. Use «Guardar» para conservarlos.',
          })
        } else {
          setDocumento(doc)
          setCampos(doc.campos)
        }
        // Los valores que el ajuste automático usó en el PDF vienen también al ABRIR
        // (`ajuste_valores` del GET); solo se tomaban al guardar, y al recargar la
        // pestaña el panel Formato volvía a callarlos (auditoría 2026-10-10).
        setAjusteValores((doc as Documento & { ajuste_valores?: Record<string, string> }).ajuste_valores ?? {})
      })
      .catch(() => setErrorCarga(true))
    apiPdf(`/api/documentos/${id}/pdf`)
      .then(setUrlPdf)
      .catch(() => {})
  }, [id, claveRespaldo])

  // Un editor nuevo (se encendió o apagó el modo compartido) carga de nuevo.
  useEffect(() => {
    cuerpoCargadoId.current = null
  }, [editor])

  useEffect(() => {
    // En compartido el texto lo trae Yjs: cargarlo aquí lo duplicaría.
    if (editor && documento && !proveedor && cuerpoCargadoId.current !== id) {
      // false: no emitir 'update' en la carga (evita un respaldo espurio).
      // Por turnos tras caerse el compartido: desde lo último escrito en él.
      // `addToHistory: false` (2026-10-18, Edison: «Ctrl+Z no deshace…»): la carga —y cada recarga desde el
      // servidor— quedaba como un paso del historial, así que deshacer justo después vaciaba el texto o lo
      // devolvía a la versión anterior en vez de deshacer lo que la persona escribió.
      editor
        .chain()
        .command(({ tr }) => { tr.setMeta('addToHistory', false); return true })
        .setContent(documento.borrador?.cuerpo ?? documento.cuerpo, { emitUpdate: false })
        .run()
      marcarLimpio()
      // Los anexos se inicializan dentro de <AnexosEditor> (se remonta por
      // documento con inicial=parsearAnexos), no aquí.
      cuerpoCargadoId.current = id ?? null
    }
  }, [editor, documento, id, proveedor, marcarLimpio])

  // Datos del formulario en vivo: el mapa `campos` del texto compartido. Lo
  // que escriben los demás llega aquí; lo de aquí sale en ponerCampo.
  useEffect(() => {
    if (!proveedor) return
    const mapa = proveedor.document.getMap<string>('campos')
    const aplicar = () =>
      setCampos((previos) => {
        const nuevos = { ...previos }
        mapa.forEach((valor, clave) => {
          if (!CAMPOS_LOCALES.has(clave)) nuevos[clave] = valor
        })
        return nuevos
      })
    const observar = (evento: Y.YMapEvent<string>) => {
      if (!evento.transaction.local) aplicar()
    }
    if (proveedor.isSynced) aplicar()
    proveedor.on('synced', aplicar)
    mapa.observe(observar)
    return () => {
      mapa.unobserve(observar)
      proveedor.off('synced', aplicar)
    }
  }, [proveedor])

  const ponerCampo = (nombre: string, valor: string) => {
    setCampos((previos) => ({ ...previos, [nombre]: valor }))
    if (proveedor && !CAMPOS_LOCALES.has(nombre)) proveedor.document.getMap<string>('campos').set(nombre, valor)
    programarRespaldo()
  }

  const datosActuales = useCallback(() => {
    // Los anexos (varios) viajan DENTRO de campos como JSON de lista en
    // campos.anexos; se limpian los campos heredados del anexo único para
    // que el generador use solo la lista nueva.
    const anexos = anexosRef.current?.recolectar() ?? []
    return {
      campos: {
        ...campos,
        anexos: anexos.length ? JSON.stringify(anexos) : '',
        anexo_cuerpo: '',
        anexo_titulo: '',
      },
      cuerpo: editor?.getJSON() ?? {},
      // Sobre qué versión se editó: el servidor rechaza (409) si ya no es la
      // vigente, en vez de pisar lo que otra persona guardó.
      version_base: baseRef.current,
      // En compartido: lo que viaja es el texto unido de todos y la base no
      // se exige si la generación es la vigente (api/documentos.py).
      generacion: enVivoRef.current ? generacionRef.current : undefined,
    }
  }, [campos, editor])

  // Mantener la ref al día para que el respaldo (beforeunload / debounce)
  // capture siempre la última versión, incluidos los anexos.
  useEffect(() => {
    datosActualesRef.current = datosActuales
  }, [datosActuales])

  // SALIR DE UN BORRADOR SIN GUARDAR (revisión de usabilidad 2026-10-01):
  // irse a la bandeja dejaba el cambio solo en el respaldo de ESTE equipo; la
  // bandeja seguía con el asunto viejo y nadie más lo veía. Un borrador SIN
  // número se guarda solo al salir por la web (no hay firma ni número que
  // invalidar). Uno numerado NO: guardarlo podría anular su firma sin que
  // nadie lo decida; ahí sigue valiendo el respaldo local y su aviso.
  const documentoRef = useRef<Documento | null>(null)
  documentoRef.current = documento
  useEffect(() => () => {
    const doc = documentoRef.current
    if (!sucioRef.current || !doc || doc.numero != null || enVivoRef.current) return
    let cuerpo: string
    try {
      cuerpo = JSON.stringify(datosActualesRef.current?.())
    } catch {
      return // el respaldo local ya lo tiene
    }
    const token = localStorage.getItem('sgdp_token')
    // Sin servidor (fallo de red o el 5xx del proxy), el guardado se ENCOLA (2026-10-18): antes se
    // perdía en silencio y solo quedaba el respaldo de este equipo. `confirmar_anulacion: false`,
    // como el guardado de siempre: un borrador sin número no anula nada.
    const encolarSalida = () => encolar(`/api/documentos/${doc.id}`, cuerpo, doc.numero_completo ?? 'Borrador')
    void fetch(`/api/documentos/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: cuerpo,
    }).then((r) => {
      // Guardado: el respaldo ya no hace falta. Si no (409), queda y al volver se ofrece como siempre.
      if (r.ok) localStorage.removeItem(`sgdp_respaldo_${doc.id}`)
      else if (r.status >= 502 || (r.status === 500 && !/uvicorn/i.test(r.headers.get('server') ?? ''))) encolarSalida()
    }).catch(encolarSalida)
  }, [])

  const limpiarRespaldo = () => {
    sucioRef.current = false
    sucioVistoRef.current = false
    setSucio(false)
    localStorage.removeItem(claveRespaldo)
    marcarLimpio()
  }

  // Vuelve a cargar la versión VIGENTE del servidor en formulario, cuerpo,
  // anexos y visor. Lo usan el conflicto de versiones y la detección de
  // cambios ajenos.
  recargarRef.current = () => void cargarVigente()
  const cargarVigente = async (): Promise<Documento | null> => {
    try {
      const doc = await api<Documento>(`/api/documentos/${id}`)
      baseRef.current = doc.version
      setDocumento(doc)
      setCampos(doc.campos)
      setAjusteValores((doc as Documento & { ajuste_valores?: Record<string, string> }).ajuste_valores ?? {})
      cuerpoCargadoId.current = null
      await refrescarPdf()
      visorRef.current?.refrescar()
      return doc
    } catch {
      return null
    }
  }

  // 409 `documento_modificado` (2026-09-14): lo de esta pestaña se APARTA en
  // este equipo —nunca se pierde—, se muestra la versión vigente y la persona
  // decide con los dos botones del aviso. Antes la pestaña vieja pisaba en
  // silencio lo que otra persona ya había guardado.
  const manejarConflicto = async (d: DetalleConflicto) => {
    try {
      const apartado: ContenidoApartado = { ...datosActuales(), apartado_en: Date.now() }
      guardarApartado(id ?? '', apartado)
      setAnteriores(leerApartadosAnteriores(id ?? ''))
    } catch {
      /* sin sitio en localStorage: se sigue, el aviso igual explica */
    }
    limpiarRespaldo()
    setAjeno(null)
    await cargarVigente()
    setConflicto(d)
  }
  const esConflicto = (e: unknown): e is ErrorApi =>
    e instanceof ErrorApi &&
    e.estado === 409 &&
    (e.detalle as DetalleConflicto | undefined)?.codigo === 'documento_modificado'

  const cargarApartado = (apartado: ContenidoApartado) => {
    const camposMios = apartado.campos ?? {}
    setDocumento((doc) => (doc ? { ...doc, campos: camposMios, cuerpo: apartado.cuerpo } : doc))
    setCampos(camposMios)
    cuerpoCargadoId.current = null
    sucioRef.current = true
    setSucio(true)
    setAviso({
      tipo: 'info',
      texto:
        'Sus cambios están cargados sobre la versión vigente. Revíselos y pulse '
        + 'Guardar: reemplazarán lo que guardó la otra persona.',
    })
  }
  const cargarMisCambios = () => {
    let apartado: ContenidoApartado | null = null
    try {
      const crudo = localStorage.getItem(claveConflicto(id ?? ''))
      if (crudo) apartado = JSON.parse(crudo) as ContenidoApartado
    } catch {
      apartado = null
    }
    setConflicto(null)
    if (!apartado) return
    localStorage.removeItem(claveConflicto(id ?? ''))
    cargarApartado(apartado)
  }
  const descartarMisCambios = () => {
    localStorage.removeItem(claveConflicto(id ?? ''))
    setConflicto(null)
  }
  const quitarAnterior = (i: number) => {
    const lista = anteriores.filter((_, j) => j !== i)
    escribirApartadosAnteriores(id ?? '', lista)
    setAnteriores(lista)
    if (!lista.length) setVerAnteriores(false)
  }
  const cargarAnterior = (i: number) => {
    const apartado = anteriores[i]
    quitarAnterior(i)
    setVerAnteriores(false)
    if (apartado) cargarApartado(apartado)
  }

  const refrescarPdf = async () => {
    const url = await apiPdf(`/api/documentos/${id}/pdf`)
    setUrlPdf((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior)
      return url
    })
  }

  // Tras subir firmado/constancias el estado puede cambiar solo (envío
  // automático): refresca SOLO estado + transiciones, sin tocar campos ni el
  // cuerpo ya cargado en el editor.
  // Refresca estado, transiciones, TRÁMITE (ruta y pasos) y responsable, sin
  // tocar campos ni cuerpo: así la ruta y los botones se mueven solos tras
  // cada acción (flujo dinámico, Edison 2026-09-05).
  const refrescarEstado = useCallback(() => {
    api<Documento>(`/api/documentos/${id}`)
      .then((d) =>
        setDocumento((prev) =>
          prev
            ? {
                ...prev,
                estado: d.estado,
                transiciones: d.transiciones,
                tramite: d.tramite,
                responsable: d.responsable,
                // Sin esto, el respaldo posterior a un Guardar quedaría atado
                // a la versión ANTERIOR y se descartaría al recargar.
                actualizado_en: d.actualizado_en,
                version: d.version,
                ultima_edicion: d.ultima_edicion,
              }
            : prev,
        ),
      )
      .catch(() => {})
  }, [id])

  // Comentarios del documento, compartidos por contexto con el formulario
  // (marcas junto a cada campo), las secciones y el panel de seguimiento:
  // una sola carga para todos (ObservacionesSeccion.tsx, Edison 2026-09-05).
  const avisarComentario = useCallback(
    (tipo: 'success' | 'error' | 'info', texto: string) => setAviso({ tipo, texto }),
    [],
  )
  const comentarios = useComentarios(id ?? '', Boolean(id), avisarComentario, refrescarEstado)
  // Cada campo lleva en el canal derecho su marca de observación y, si la
  // parte tiene formato propio (destinatario, copias, asunto), el icono de
  // ajustes (AjusteFormato.tsx, Edison 2026-09-07). Depende de `campos`
  // (los valores fmt_*), así que no se memoriza.
  const marcaFormato = (seccion: string) =>
    documento ? (
      <MarcaFormato
        seccion={seccion}
        tipo={documento.tipo}
        valores={campos}
        alCambiar={ponerFormato}
        predeterminados={predeterminados}
        alPredeterminar={predeterminarGrupo}
      />
    ) : null
  const envolverCampo = (clave: string, nodo: React.ReactNode) => (
    <ConObservaciones seccion={clave} extra={marcaFormato(clave)}>
      <ConPresencia clave={clave}>{nodo}</ConPresencia>
    </ConObservaciones>
  )

  // Guardar es la única acción: guarda, compila y deja la vista previa al día
  // (la «Vista previa» aparte guardaba igual; se fusionaron el 2026-10-08).
  // `auto` es el guardado automático: sin diálogos ni avisos de éxito y
  // agrupando versiones; sin servidor también va a la cola (2026-10-18).
  const guardar = async (modo: 'manual' | 'auto' = 'manual') => {
    const auto = modo === 'auto'
    if (bloqueadoRef.current) {
      if (!auto) setAviso({ tipo: 'info', texto: 'Documento firmado: solo lectura.' })
      return
    }
    clearTimeout(temporizadorAuto.current)
    ocupadoRef.current = 'guardar'
    setOcupado('guardar')
    // Lo que se envía: lo escrito mientras compila (unos segundos) NO queda
    // por guardado; sigue pendiente y sale en el guardado siguiente.
    const enviado = editor ? { doc: editor.state.doc, campos: camposRef.current } : null
    const datos = datosActuales()
    try {
      type Respuesta = {
        firmado_invalidado?: boolean
        anulacion?: Anulacion | null
        version?: number
        compilado?: boolean
        error_compilacion?: string
        ajuste_firma?: string
        estado_compilacion?: EstadoCompilacion
        ajuste_valores?: Record<string, string>
        agenda_propuesta?: number
      }
      const pedir = (confirmar: boolean) =>
        api<Respuesta>(`/api/documentos/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...datos, confirmar_anulacion: confirmar, auto }),
        })
      // Si el cambio anula la firma, el servidor avisa (409 `anula_firma`) y
      // se pregunta antes de guardar (vigencia.ts, 2026-10-06). El automático
      // nunca anula: ese caso queda para el Guardar de la persona.
      const r = auto ? await pedir(false) : await conConfirmacion(pedir)
      if (r === null) {
        setAviso({ tipo: 'warning', texto: MENSAJE_NO_GUARDADO })
        return
      }
      if (typeof r.version === 'number') baseRef.current = r.version
      if (enviado) limpioRef.current = enviado
      if (coincideConLimpio()) {
        quedarLimpio()
      } else {
        programarAuto()
      }
      setAjeno(null)
      // Guardar regenera SIEMPRE el PDF (borrador o numerado): datos, PDF y
      // pantalla coinciden (Edison 2026-09-14: «el visor debe mostrar lo que
      // está en el formulario»).
      await refrescarPdf()
      refrescarEstado()
      visorRef.current?.refrescar()
      // El expediente sin firma depende del contenido: su estado se revisa.
      window.dispatchEvent(new Event(EVENTO_EXPEDIENTE))
      if (r.firmado_invalidado) {
        window.dispatchEvent(new Event(EVENTO_ADJUNTOS))
        setAviso({ tipo: 'warning', texto: textoAnulacion(r.anulacion) })
      } else if (r.compilado === false) {
        setAviso({
          tipo: 'error',
          texto:
            'Guardado. La vista previa NO se actualizó: '
            + (r.error_compilacion || 'error al compilar.'),
        })
      } else if (r.agenda_propuesta) {
        // Lo que el documento anuncia (reunión, sesión… con fecha) ya está en la agenda, por
        // confirmar (servicios/agenda_detectada.py, 2026-10-08).
        setAviso({ tipo: 'info', texto: `El documento anuncia ${r.agenda_propuesta === 1 ? 'una fecha' : `${r.agenda_propuesta} fechas`}: confírmela${r.agenda_propuesta === 1 ? '' : 's'} con el icono de tareas del visor.` })
      } else if (r.ajuste_firma && r.ajuste_firma !== ajusteFirmaRef.current) {
        // La firma no queda sola (compilacion.py): se dice qué se ajustó, una vez por ajuste.
        setAviso({ tipo: 'info', texto: `Para que la firma no quede sola, la vista previa usa: ${r.ajuste_firma}.` })
      } else if (!auto) {
        setAviso({ tipo: 'success', texto: 'Guardado. Vista previa actualizada.' })
      }
      ajusteFirmaRef.current = r.ajuste_firma ?? ''
      if (r.estado_compilacion) setEstadoVista(r.estado_compilacion)
      setAjusteValores(r.ajuste_valores ?? {})
      // Las citas del cuerpo ya son relaciones: el mapa local las pide de nuevo.
      avisarRelaciones(`doc:${id}`)
    } catch (e) {
      if (esConflicto(e)) {
        await manejarConflicto(e.detalle as DetalleConflicto)
        return
      }
      // Sin servidor no se pierde el trabajo: el guardado se encola y sube
      // solo al volver la conexión (ver sinconexion.ts). Se distingue del
      // rechazo del servidor —que sí es un error— por el tipo de fallo:
      // `ErrorApi` significa que el servidor CONTESTÓ.
      // Sin servidor = fallo de red, o el 5xx que devuelve el proxy cuando la
      // API está caída. Un 4xx es el servidor hablando y sí es un error.
      if (esSinServidor(e)) {
        // También el guardado automático (2026-10-18): sin la franja, quien no es administrador
        // no ve que el servidor falta; lo escrito sube solo al volver (el último reemplaza al
        // anterior en la cola) y, si chocara, queda apartado para «Cargar mis cambios».
        encolar(
          `/api/documentos/${id}`,
          // confirmar_anulacion: false → si al reenviarse anulara la firma, el
          // servidor responde 409 y el cambio se aparta (nunca anula a ciegas).
          JSON.stringify({ ...datos, confirmar_anulacion: false, auto }),
          documento?.numero_completo ?? 'Borrador',
        )
        if (enviado) limpioRef.current = enviado
        if (auto) return
        setAviso({
          tipo: 'info',
          texto: 'Guardado en este equipo. Se enviará cuando vuelva la conexión.',
        })
        return
      }
      // El automático no anula una firma: queda pendiente para Guardar.
      if (auto && esAnulaFirma(e)) return
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' })
    } finally {
      ocupadoRef.current = ''
      setOcupado('')
    }
  }
  guardarRef.current = guardar
  // Ctrl+S (⌘S) guarda en vez de abrir el «Guardar página» del navegador.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (ocupadoRef.current === '') void guardarRef.current()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // Encender o apagar la edición simultánea (paso 5.6). Antes se guarda lo
  // de esta pestaña: el texto compartido nace de lo guardado y, al apagar,
  // nada de lo escrito en compartido se queda sin versión.
  const cambiarCompartido = async (activa: boolean) => {
    if (sucioRef.current) {
      await guardar()
      if (sucioRef.current) return // no se guardó: guardar() ya lo avisó
    }
    setOcupado('compartido')
    try {
      await api(`/api/documentos/${id}/colaboracion`, {
        method: 'PATCH',
        body: JSON.stringify({ activa }),
      })
      setModoTurnos(false)
      await cargarVigente()
      setAviso({
        tipo: 'success',
        texto: activa
          ? 'Edición simultánea activada.'
          : 'Edición por turnos.',
      })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo cambiar el modo.' })
    } finally {
      setOcupado('')
    }
  }
  const invitado = localStorage.getItem('sgdp_rol') === 'invitado'

  // Copiar el cuerpo entero, con formato y notas al pie, para empezar otro
  // documento (Edison 2026-10-06). Lo parcial se selecciona y se copia con
  // Ctrl+C, también en un firmado (ZonaBloqueada deja seleccionar).
  const copiarCuerpo = async () => {
    if (!editor) return
    try {
      await copiarTextoConFormato(editor.getHTML(), editor.getText({ blockSeparator: '\n\n' }))
      setAviso({ tipo: 'success', texto: 'Cuerpo copiado. Péguelo con Ctrl+V.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo copiar.' })
    }
  }

  // --- Cambios hechos desde OTRO lugar (2026-09-14) --------------------
  // Cada 20 s y al volver a la pestaña se consulta la versión del servidor.
  // Si subió y aquí no hay nada sin guardar, se adopta sola (formulario,
  // cuerpo, anexos y visor); si hay cambios locales, se avisa y el servidor
  // obligará a elegir al guardar. `>` y no `!==`: una copia del caché local
  // trae una versión VIEJA y no debe hacer retroceder nada.
  // Notas de sustento normativo que el sistema OFRECE (2026-10-18, `servicios/notas_normativas.py`): se piden al
  // abrir y tras cada guardado (el servidor mira el cuerpo guardado); insertarlas es decisión de quien redacta.
  interface NotaSugerida { clave: string; titulo: string; texto: string; ya_presente: boolean; fuente: { cita: string } }
  const [notasSugeridas, setNotasSugeridas] = useState<NotaSugerida[]>([])
  const [notasDescartadas, setNotasDescartadas] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!id || !documento) return
    let vivo = true
    api<{ notas: NotaSugerida[] }>(`/api/documentos/${id}/notas-sugeridas`).then((r) => { if (vivo) setNotasSugeridas(r.notas ?? []) }).catch(() => {})
    return () => { vivo = false }
  }, [id, documento?.version]) // eslint-disable-line react-hooks/exhaustive-deps
  const insertarNotaSugerida = (n: NotaSugerida) => {
    if (!editor) return
    // Al final del párrafo que habla del pedido; si no hay, al final del texto.
    let pos: number | null = null
    editor.state.doc.descendants((nodo, p) => {
      if (pos !== null) return false
      if (nodo.isTextblock && /informaci/i.test(nodo.textContent)) { pos = p + nodo.nodeSize - 1; return false }
      return true
    })
    const cadena = pos !== null ? editor.chain().focus().setTextSelection(pos) : editor.chain().focus('end')
    cadena.insertContent({ type: 'footnote', attrs: { texto: n.texto } }).run()
    setNotasSugeridas((l) => l.map((x) => (x.clave === n.clave ? { ...x, ya_presente: true } : x)))
    setAviso({ tipo: 'success', texto: 'Nota al pie insertada; tóquela para editarla.' })
  }
  const notasPorOfrecer = notasSugeridas.filter((n) => !n.ya_presente && !notasDescartadas.has(n.clave))

  // «Actualizar» del encabezado (2026-10-18): la misma comprobación, a pedido y aunque la pestaña esté oculta.
  const comprobarRef = useRef<() => Promise<void>>(() => Promise.resolve())
  useEffect(() => {
    if (!id) return
    let activo = true
    const comprobar = (forzado = false): Promise<void> => {
      if ((document.hidden && !forzado) || ocupadoRef.current) return Promise.resolve()
      return api<Documento>(`/api/documentos/${id}`)
        .then((d) => {
          if (!activo || leyendoDeCache()) return
          // Edición simultánea: alguien la encendió o apagó, o el texto
          // compartido se reinició (restaurar, guardado por turnos).
          const previo = documentoRef.current
          if (previo && (!!d.colaboracion !== !!previo.colaboracion || d.generacion !== previo.generacion)) {
            if (sucioRef.current && !enVivoRef.current) {
              setAjeno({ editado_por: d.ultima_edicion?.por, editado_en: d.actualizado_en })
              return
            }
            void cargarVigente().then(() =>
              setAviso({
                tipo: 'info',
                texto: d.colaboracion
                  ? 'Este documento se está editando en simultáneo: lo que escriban todos se ve al instante.'
                  : 'La edición simultánea se apagó en este documento; se guarda por turnos.',
              }),
            )
            return
          }
          if (enVivoRef.current) {
            // En compartido el contenido llega en vivo: solo la versión
            // guardada (base del próximo guardado) y quién guardó.
            baseRef.current = d.version
            setDocumento((prev) => (prev ? { ...prev, version: d.version, ultima_edicion: d.ultima_edicion, estado: d.estado, transiciones: d.transiciones, tramite: d.tramite } : prev))
            return
          }
          if (!(d.version > baseRef.current)) {
            // Sin versión nueva: igual se actualiza quién editó último.
            setDocumento((prev) => (prev ? { ...prev, ultima_edicion: d.ultima_edicion } : prev))
            return
          }
          if (sucioRef.current) {
            setAjeno({ editado_por: d.ultima_edicion?.por, editado_en: d.actualizado_en })
            return
          }
          baseRef.current = d.version
          setDocumento(d)
          setCampos(d.campos)
          cuerpoCargadoId.current = null
          void refrescarPdf()
          visorRef.current?.refrescar()
          setAviso({
            tipo: 'info',
            texto: 'Se cargó la versión más reciente de este documento, guardada desde otro lugar.',
          })
        })
        .catch(() => {})
    }
    comprobarRef.current = () => comprobar(true)
    const automatica = () => void comprobar()
    const temporizador = window.setInterval(automatica, 20_000)
    window.addEventListener('focus', automatica)
    document.addEventListener('visibilitychange', automatica)
    return () => {
      activo = false
      comprobarRef.current = () => Promise.resolve()
      window.clearInterval(temporizador)
      window.removeEventListener('focus', automatica)
      document.removeEventListener('visibilitychange', automatica)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  // Formato (Edison 2026-09-07: «que estos ajustes se visualicen
  // inmediatamente en la vista previa»): un ajuste se guarda y compila antes
  // que lo escrito, agrupando varios cambios seguidos.
  const ponerFormato = (clave: string, valor: string) => {
    ponerCampo(clave, valor)
    programarAuto(1200)
  }

  // Los fmt_* predeterminados del tipo (tabla `ajustes`): «Restablecer» en
  // cada globo vuelve a ellos y «Predeterminar» guarda SOLO las claves de
  // ese grupo, fusionadas con las que ya había.
  const [predeterminados, setPredeterminados] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!documento?.tipo) return
    api<{ valores: Record<string, string> }>(`/api/ajustes/formato/${documento.tipo}`)
      .then((r) => setPredeterminados(r.valores ?? {}))
      .catch(() => {})
  }, [documento?.tipo])
  const predeterminarGrupo = async (claves: string[]) => {
    if (!documento) return
    try {
      const r = await api<{ valores: Record<string, string> }>(`/api/ajustes/formato/${documento.tipo}`)
      const nuevos: Record<string, string> = { ...(r.valores ?? {}) }
      for (const k of claves) {
        const v = campos[k] ?? ''
        if (v) nuevos[k] = v
        else delete nuevos[k]
      }
      await api(`/api/ajustes/formato/${documento.tipo}`, {
        method: 'PUT',
        body: JSON.stringify({ valores: nuevos }),
      })
      setPredeterminados(nuevos)
      setAviso({ tipo: 'success', texto: 'Predeterminado guardado para los documentos nuevos de este tipo.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar el predeterminado.' })
    }
  }

  /**
   * Numera el documento. `revisados` llega cuando el usuario acaba de revisar
   * los datos en el diálogo (destinatario, asunto, fecha y copias, ya
   * corregidos ahí mismo): se vuelcan al formulario y se manda
   * `copias_verificadas`, que es lo que el servidor exige para numerar.
   */
  /** «Oficio S/N «Pedido de información…»» para los recordatorios de «hacerlo al volver». */
  const rotuloAlVolver = (): string => {
    const asunto = (campos.asunto || campos.sumilla_solicito || '').trim()
    return `${documento?.numero_completo || 'el borrador'}${asunto ? ` «${asunto.slice(0, 60)}»` : ''}`
  }
  const generar = async (revisados?: Record<string, string>) => {
    if (bloqueadoRef.current) {
      setAviso({ tipo: 'info', texto: 'Documento firmado: solo lectura.' })
      return
    }
    // Numerar sin servidor no es una limitación técnica que se pueda sortear:
    // el correlativo es un contador único y dos equipos numerando a ciegas
    // producirían el mismo número dos veces, o un hueco. Irreversible.
    if (!hayServidor()) {
      // Se explica en una línea y se ofrece «hacerlo al volver» (alvolver.ts, 2026-10-18).
      void ofrecerAlVolver('numerar', `Numerar ${rotuloAlVolver()}`, `/documentos/${id}?al_volver=numerar`)
      return
    }
    // Sin «¿Continuar?» del navegador: la primera vez el servidor responde
    // siempre con la revisión de datos (409 verificacion_pendiente), que ya
    // dice que el número no se deshace. Eran dos confirmaciones seguidas
    // (revisión de usabilidad 2026-10-01).
    setOcupado('generar')
    const base = datosActuales()
    // Al volver del diálogo, lo confirmado reemplaza a lo del formulario (el
    // usuario pudo corregir el asunto o quitar una copia ahí mismo).
    const datos =
      revisados === undefined
        ? base
        : { ...base, campos: { ...base.campos, ...revisados } }
    if (revisados !== undefined) setCampos((c) => ({ ...c, ...revisados }))
    try {
      const respuesta = await conConfirmacion((confirmar) =>
        api<{
          numero: number
          numero_completo: string
          estado?: string
          firmado_invalidado?: boolean
          anulacion?: Anulacion | null
        }>(`/api/documentos/${id}/generar`, {
          method: 'POST',
          body: JSON.stringify({
            ...datos,
            copias_verificadas: revisados !== undefined,
            confirmar_anulacion: confirmar,
          }),
        }),
      )
      if (respuesta === null) {
        setAviso({ tipo: 'warning', texto: MENSAJE_NO_GUARDADO })
        return
      }
      limpiarRespaldo()
      setDocumento((doc) =>
        doc
          ? {
              ...doc,
              numero: respuesta.numero,
              numero_completo: respuesta.numero_completo,
              estado: respuesta.estado ?? 'APROBADO',
            }
          : doc,
      )
      await refrescarPdf()
      visorRef.current?.refrescar()
      refrescarEstado()
      if (respuesta.firmado_invalidado) {
        window.dispatchEvent(new Event(EVENTO_ADJUNTOS))
        setAviso({ tipo: 'warning', texto: textoAnulacion(respuesta.anulacion) })
      } else {
        setAviso({ tipo: 'success', texto: `Documento oficial: ${respuesta.numero_completo}` })
      }
    } catch (e) {
      // El servidor no numera sin que alguien haya mirado las copias: no es un
      // error, es el paso que falta. Se abre el diálogo con lo que él mismo
      // devuelve (las puestas y las sugeridas que faltan).
      if (esConflicto(e)) {
        await manejarConflicto(e.detalle as DetalleConflicto)
        return
      }
      const d =
        e instanceof ErrorApi ? (e.detalle as DetalleVerificacion | undefined) : undefined
      if (d?.codigo === 'verificacion_pendiente') {
        setDlgCopias({
          puntos: d.puntos ?? [],
          copias: d.copias ?? [],
          sugeridas: d.sugeridas ?? [],
        })
        return
      }
      if (esSinServidor(e)) {
        void ofrecerAlVolver('numerar', `Numerar ${rotuloAlVolver()}`, `/documentos/${id}?al_volver=numerar`)
        return
      }
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al generar.' })
    } finally {
      setOcupado('')
    }
  }

  // Un borrador nuevo con todo lo de este documento (POST /duplicar).
  // Pegar el documento redactado con el skill (2026-10-12): prellena campos y cuerpo en memoria.
  const [pegarDoc, setPegarDoc] = useState(false)
  // `?pegar=skill` (entrada doble de «Nuevo documento»): la caja de pegado abierta al llegar;
  // `?pegar=<id de mensaje>` (chat): el bloque ya leído; si es un seguimiento, su diálogo.
  const [consulta, setConsulta] = useSearchParams()
  const [textoPegar, setTextoPegar] = useState('')
  const [pegarSeg, setPegarSeg] = useState<string | null>(null)
  const pedidoPegar = consulta.get('pegar') ?? ''
  // `?al_volver=numerar` (2026-10-18): «Hacer ahora» de un recordatorio hecho sin servidor
  // (AvisoAlVolver): con el documento cargado y servidor, empieza la numeración (la revisión de
  // copias sigue pidiendo la confirmación de la persona).
  const pedidoAlVolver = consulta.get('al_volver') ?? ''
  useEffect(() => {
    if (pedidoAlVolver !== 'numerar' || !documento) return
    const limpia = new URLSearchParams(consulta)
    limpia.delete('al_volver')
    setConsulta(limpia, { replace: true })
    if (documento.numero) {
      setAviso({ tipo: 'info', texto: `Ya está numerado: ${documento.numero_completo}.` })
      return
    }
    void generar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoAlVolver, documento === null])
  useEffect(() => {
    if (!pedidoPegar || !documento) return
    const limpia = new URLSearchParams(consulta)
    limpia.delete('pegar')
    setConsulta(limpia, { replace: true })
    if (localStorage.getItem('sgdp_rol') === 'invitado') return
    if (pedidoPegar === 'skill') {
      setTextoPegar('')
      setPegarDoc(true)
      return
    }
    textoDeMensaje(pedidoPegar)
      .then((texto) => {
        if (tipoDelBloque(texto) === 'seguimiento-documento') setPegarSeg(texto)
        else {
          setTextoPegar(texto)
          setPegarDoc(true)
        }
      })
      .catch(() => setAviso({ tipo: 'error', texto: 'No se pudo traer el mensaje del chat; pegue el texto a mano.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoPegar, documento === null])
  const aplicarPegado = (nuevos: Record<string, string>, cuerpoHtml: string | null, aplicado: { tipo: string; version: number | null; fuente: string; texto: string; campos_propuestos: Record<string, unknown>; aceptadas: Set<string>; rechazadas: string[] }) => {
    // Campo a campo por `ponerCampo`: en modo compartido el mapa Yjs es la fuente y pisaría un setCampos directo.
    for (const [k, v] of Object.entries(nuevos)) if ((campos[k] ?? '') !== (v ?? '')) ponerCampo(k, v)
    if (cuerpoHtml !== null && editor) editor.commands.setContent(cuerpoHtml, { emitUpdate: true })
    programarRespaldo()
    setPegarDoc(false)
    setTextoPegar('')
    setAviso({ tipo: 'info', texto: 'Aplicado. Revise el formulario y el texto y pulse Guardar.' })
    const { aceptadas, rechazadas, ...resto } = aplicado
    void registrarPegado({ ...resto, rechazados: rechazadas, entidad: `doc:${id}`, campos_aplicados: Object.fromEntries([...aceptadas].map((k) => [k, k === 'cuerpo' ? '(cuerpo)' : nuevos[k]])) })
  }

  const duplicar = () => {
    api<{ id: number }>(`/api/documentos/${id}/duplicar`, { method: 'POST' })
      .then((r) => navegar(`/documentos/${r.id}`))
      .catch((e) => setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo duplicar.' }))
  }

  const cambiarEstado = async (nuevo: string, extra: { responsable_id?: number | null; comentario?: string } = {}): Promise<boolean> => {
    if (!hayServidor()) {
      setDlgRevision(false)
      void ofrecerAlVolver('estado', `Cambiar el estado de ${rotuloAlVolver()} a «${ETIQUETA_ESTADO[nuevo] ?? nuevo}»`, `/documentos/${id}`)
      return false
    }
    try {
      const r = await api<{ estado: string; transiciones: string[] }>(
        `/api/documentos/${id}/estado`,
        { method: 'PUT', body: JSON.stringify({ estado: nuevo, ...extra }) },
      )
      setDocumento((d) =>
        d ? { ...d, estado: r.estado, transiciones: r.transiciones } : d,
      )
      refrescarEstado()
      setAviso({ tipo: 'success', texto: `Estado: ${ETIQUETA_ESTADO[r.estado] ?? r.estado}` })
      return true
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al cambiar estado.' })
      return false
    }
  }

  if (errorCarga) {
    return (
      <Marco modulo="documentos" volver="/documentos" sinBarraInferior>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 2, justifyContent: 'center' }}>
            No se pudo cargar el documento.
          </Alert>
          <Button variant="contained" onClick={() => navegar('/documentos')}>
            Volver a la bandeja
          </Button>
        </Box>
      </Marco>
    )
  }

  if (!documento) {
    return (
      <Marco modulo="documentos" volver="/documentos" sinBarraInferior>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      </Marco>
    )
  }

  // Números de paso de la barra de acciones (Edison 2026-09-05). Cada botón
  // se empareja con su etapa de `tramite.etapas`; los que no son parte del
  // flujo (Historial, formato) no llevan número, que es lo que hace legible la
  // numeración de los que sí.
  // Índice del formulario (Edison 2026-09-05): los campos se numeran dentro de
  // FormularioCampos y las secciones SIGUEN esa cuenta, para que el documento
  // se pueda dictar entero por número («falta el 9»). Es un índice, no un
  // orden obligatorio; por eso se ve distinto de los pasos del trámite.
  const numCampos = numerarCampos(documento.esquema_campos).total
  const secCuerpo = numCampos + 1
  const secAnexos = numCampos + 2

  const etapas = documento.tramite?.etapas
  const pasoPrevisualizar = etapaDe(etapas, 'previsualizar')
  // Los pasos 3 y 6 se ejecutan cambiando de estado: el botón está siempre
  // en la barra con su número (Edison 2026-09-05) y se habilita solo cuando
  // el rol tiene esa transición disponible en el estado actual.
  const puedeRevision = documento.transiciones.includes('EN_REVISION')
  // La acción destacada de la barra: la del paso que toca ahora.
  // Un solo lugar para el registro en el STD: el diálogo del seguimiento.
  const registrarStd = () => {
    irASeccion('seguimiento')
    window.dispatchEvent(new CustomEvent(EVENTO_REGISTRAR_STD, { detail: Number(id) }))
  }
  const irASeccion = (sec: string) => {
    if (angosta) setVistaMovil('redactar')
    setTimeout(() => document.getElementById(`sec-${sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const pasoActual = etapaActual(etapas)
  // Cambios de estado que NO tienen ya su acción propia en el trámite.
  const otrosEstados = documento.transiciones.filter((t) => t !== 'EN_REVISION' && t !== 'ENVIADO')
  const accionPrincipal: { texto: string; orden: number; ayuda: string; alPulsar: () => void; deshabilitada?: boolean } | null = (() => {
    if (!pasoActual) return null
    const base = { orden: pasoActual.orden, ayuda: pasoActual.ayuda }
    switch (pasoActual.accion) {
      case 'revision': return { ...base, texto: 'Enviar a revisión', alPulsar: () => setDlgRevision(true), deshabilitada: !puedeRevision }
      case 'generar': return { ...base, texto: documento.numero == null ? 'Generar oficial' : 'Regenerar PDF', alPulsar: () => void generar(), deshabilitada: bloqueado }
      case 'enviar': return { ...base, texto: 'Enviar', alPulsar: enviar, deshabilitada: documento.numero == null }
      case 'firmado': return { ...base, texto: 'Subir firmado', alPulsar: () => irASeccion('archivos') }
      case 'recepcion': return { ...base, texto: 'Subir cargo', alPulsar: () => irASeccion('archivos') }
      case 'std': return { ...base, texto: 'Registrar en el STD', alPulsar: registrarStd }
      default: return null // redactar / vista previa: los botones de siempre
    }
  })()

  // Botón de formato de los cuadros de ANEXOS (AnexosEditor: esquema reducido,
  // sin notas al pie ni enlaces; el cuerpo usa la BarraFormato común).
  const botonFormato = (
    icono: React.ReactNode,
    activo: boolean,
    accion: () => void,
    etiqueta: string,
  ) => (
    <IconButton size="small" color={activo ? 'primary' : 'default'} onClick={accion} aria-label={etiqueta} title={etiqueta}>
      {icono}
    </IconButton>
  )

  return (
    <ComentariosContext.Provider value={comentarios}>
    <ProveedorSala sala={sala}>
    <Marco
      modulo="documentos"
      // En el celular, «Oficio N.º 0122»: la denominación completa no entra y cortaba el número.
      titulo={angosta && documento.numero != null
        ? `${documento.tipo_nombre} N.º ${String(documento.numero).padStart(4, '0')}`
        : documento.numero_completo}
      volver="/documentos"
      sinBarraInferior
      equipo={<EquipoEnLinea documentoId={Number(id)} />}
      accionesFijas={
        <>
          {/* En el celular, la mesa de partes como ícono junto a los «⋮», arriba. */}
          {angosta && documento.numero != null && documento.tramite?.ambito !== 'interno' && (
            <Tooltip title="Mesa de partes">
              <IconButton color="inherit" onClick={() => setMesaPartes(true)} aria-label="Mesa de partes" sx={{ flexShrink: 0 }}>
                <InboxOutlinedIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Más acciones: trámite, estado e historial">
            <IconButton color="inherit" onClick={(e) => setMenuMas(e.currentTarget)} aria-label="Más acciones" sx={{ flexShrink: 0 }}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={menuMas} open={menuMas !== null} onClose={() => setMenuMas(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            {/* 2026-10-10 (Edison): aquí solo lo que NO tiene botón propio. Revisión, generar,
                enviar y mesa de partes ya están en la barra y en el paso que toca; el PDF se
                rehace en cada guardado, así que «Regenerar PDF» sobraba. */}
            {otrosEstados.length > 0 && (
              <ListSubheader sx={{ lineHeight: '30px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cambiar estado</ListSubheader>
            )}
            {otrosEstados.map((t) => (
              <MenuItem key={t} onClick={() => { setMenuMas(null); void cambiarEstado(t) }}>
                <ListItemIcon><FlagIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={`Pasar a «${ETIQUETA_ESTADO[t] ?? t}»`} />
              </MenuItem>
            ))}
            <Divider />
            {/* Sin duplicidades (2026-10-06): el historial lo abre «Última
                edición» y el mapa completo, «Ampliar» del mapa local; el menú
                ofrece el historial solo si aún no hay esa línea. */}
            {localStorage.getItem('sgdp_rol') !== 'invitado' && !bloqueado && (
              <MenuItem onClick={() => { setMenuMas(null); setPegarDoc(true) }}>
                <ListItemIcon><ContentPasteOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Pegar lo que redactó la IA" />
              </MenuItem>
            )}
            {localStorage.getItem('sgdp_rol') !== 'invitado' && (
              <MenuItem onClick={() => { setMenuMas(null); duplicar() }}>
                <ListItemIcon><ContentCopyOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Duplicar como borrador" />
              </MenuItem>
            )}
            {!documento.ultima_edicion?.en && (
              <MenuItem onClick={() => { setMenuMas(null); setCajonAbierto(true) }}>
                <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Historial y versiones" />
              </MenuItem>
            )}
          </Menu>
          <PegarDocumento abierto={pegarDoc} tipo={documento.tipo} campos={campos} cuerpoTexto={editor ? textoDeCuerpo(editor.getJSON()) : ''} textoInicial={textoPegar || undefined} alCerrar={() => { setPegarDoc(false); setTextoPegar('') }} alAplicar={aplicarPegado} />
          <DialogoPegarSeguimiento abierto={pegarSeg !== null} documentoId={Number(id)} textoInicial={pegarSeg ?? undefined} alCerrar={() => setPegarSeg(null)} alAplicado={() => { refrescarEstado(); setAviso({ tipo: 'success', texto: 'Seguimiento aplicado.' }) }} />
        </>
      }
      acciones={
        <>
          {/* La barra, ordenada (Edison 2026-10-01: «la barrita está fea; hay
              duplicidad»): Guardar y Vista previa siempre a la mano; UNA sola
              acción destacada, la del paso que toca ahora (con su número del
              flujo); el resto del trámite, los cambios de estado y el
              historial, en «Más acciones». El «Siguiente paso» del formulario
              explica qué toca y por qué. */}
          {/* Siempre en su sitio (Edison 2026-10-06: ocultarlos en un firmado confundía). Desactivados
              —firmado o con un trabajo en curso— en gris; mientras guarda, en tinta para leer el progreso
              (2026-10-19: la barra ya es clara, nada de blanco fijo). */}
          <Tooltip title={bloqueado ? 'Firmado: solo lectura' : ''}>
            <span style={{ flexShrink: 0 }}>
              <Button color="inherit" startIcon={ocupado === 'guardar' ? <CircularProgress size={16} color="inherit" thickness={5} /> : <SaveIcon />} onClick={() => void guardar()} sx={{ flexShrink: 0, whiteSpace: 'nowrap', '&.Mui-disabled': { color: ocupado === 'guardar' ? 'text.primary' : 'text.disabled' } }} disabled={ocupado !== '' || bloqueado}>
                {ocupado === 'guardar' ? (angosta ? 'Guardando…' : 'Guardando y compilando…') : 'Guardar'}
              </Button>
            </span>
          </Tooltip>
          {/* «Actualizar» (2026-10-18): trae lo guardado por otros ahora mismo. Con cambios sin guardar aquí,
              solo avisa (el servidor hará elegir al guardar); nunca descarta lo escrito. */}
          <BotonActualizar alActualizar={() => comprobarRef.current()} etiqueta="Actualizar: traer lo guardado por otros" color="inherit" />
          {/* La mesa de partes del destinatario, cuando toca enviar (ya con número): en su ventana,
              fuera del formulario (no estorba la redacción y funciona aunque esté firmado). Solo
              EXTERNOS: lo interno del Congreso va por el STD (Edison 2026-10-06). */}
          {!angosta && documento.numero != null && documento.tramite?.ambito !== 'interno' && (
            <Button color="inherit" startIcon={<InboxOutlinedIcon />} onClick={() => setMesaPartes(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              Mesa de partes
            </Button>
          )}
          {/* Sin paso pendiente porque el trámite terminó: se dice, en el lugar del botón del paso. */}
          {!accionPrincipal && documento.tramite?.completo && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.5, ml: 0.5, borderRadius: 1, flexShrink: 0, bgcolor: `${PALETA.exito}1A`, color: PALETA.exito, fontSize: 14, fontWeight: 600 }}>
              <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
              Trámite completo
            </Box>
          )}
          {accionPrincipal && (
            <Tooltip title={accionPrincipal.ayuda}>
              <span style={{ flexShrink: 0 }}>
                {/* La acción principal es el relleno de tinta del tema (2026-10-19: ya no dorado sobre
                    la barra vino) y el número del paso va DENTRO del botón, no como ícono: MUI agranda
                    los íconos a 20 px y el número se salía de su círculo (2026-10-06). */}
                <Button
                  variant="contained"
                  onClick={accionPrincipal.alPulsar}
                  disabled={ocupado !== '' || accionPrincipal.deshabilitada}
                  sx={{ flexShrink: 0, ml: 0.5, gap: 0.75, whiteSpace: 'nowrap' }}
                >
                  <Box component="span" sx={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', fontSize: 11.5, fontWeight: 800, lineHeight: 1, bgcolor: `${PALETA.sobrePrimario}33`, color: 'inherit', flexShrink: 0 }}>
                    {accionPrincipal.orden}
                  </Box>
                  {accionPrincipal.texto}
                </Button>
              </span>
            </Tooltip>
          )}
        </>
      }
    >
      {/* Celular y tableta: una columna a la vez, con la conmutación pegada
          arriba. La página se desplaza entera (sin alturas fijas, que en el
          celular cortan el contenido con el teclado abierto). */}
      {angosta && (
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: (t) => t.zIndex.appBar - 1,
            height: ALTO_CONMUTADOR,
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            value={vistaMovil}
            onChange={(_, v: 'redactar' | 'pdf' | null) => {
              if (!v) return
              setVistaMovil(v)
              window.scrollTo({ top: 0 })
            }}
            aria-label="Qué mostrar"
          >
            <ToggleButton value="redactar" sx={{ gap: 0.75, textTransform: 'none', fontWeight: 600 }}>
              <EditNoteIcon fontSize="small" /> Redactar
            </ToggleButton>
            <ToggleButton value="pdf" sx={{ gap: 0.75, textTransform: 'none', fontWeight: 600 }}>
              <PictureAsPdfOutlinedIcon fontSize="small" /> Vista PDF
              {sucio && urlPdf && (
                <Box component="span" title="Hay cambios que la vista previa aún no incluye" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'warning.main' }} />
              )}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Escritorio: dos columnas con desplazamiento propio, del alto que
          deja el Marco (flex 1 1 0 + minHeight 0). Angosta: flujo normal. */}
      <Box sx={{ flex: angosta ? 'none' : '1 1 0', minHeight: 0, display: 'flex', gap: 2, p: { xs: 1.5, sm: 2 }, overflow: angosta ? 'visible' : 'hidden' }}>
        <Box ref={setColumna} sx={{ flex: 1, minWidth: 0, overflowY: angosta ? 'visible' : 'auto', pr: angosta ? 0 : 1, display: angosta && vistaMovil !== 'redactar' ? 'none' : 'block' }}>
          <BarraSinConexion alAvisar={(texto) => setAviso({ tipo: 'info', texto })} />
          {/* Firmado (2026-10-12, uniformidad): las acciones con el aspecto de la ficha del recibido
              —pequeñas, delineadas en vino, con ícono— y «Editar de todos modos» como texto, aparte. */}
          {firmado && bloqueado && (
            <Alert severity="info" icon={<LockOutlinedIcon fontSize="small" />} sx={{ mb: 1.5, py: 0.25 }}>
              <b>Firmado: solo lectura.</b> Cambiarlo anularía la firma.
              <Box sx={{ mt: 0.75, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => visorRef.current?.descargar()}>
                  Descargar
                </Button>
                <Button size="small" variant="outlined" startIcon={<ContentCopyIcon fontSize="small" />} onClick={() => void copiarCuerpo()}>
                  Copiar cuerpo
                </Button>
                {!invitado && (
                  <Button size="small" variant="outlined" startIcon={<ContentCopyOutlinedIcon fontSize="small" />} onClick={duplicar}>
                    Duplicar
                  </Button>
                )}
                {!invitado && (
                  <Button size="small" startIcon={<LockOpenOutlinedIcon fontSize="small" />} onClick={async () => { if (await confirmar(PREGUNTA_DESBLOQUEO, { titulo: 'Editar un documento firmado', aceptar: 'Editar de todos modos', peligro: true })) setDesbloqueado(true) }}>
                    Editar de todos modos
                  </Button>
                )}
              </Box>
            </Alert>
          )}
          {firmado && !bloqueado && (
            <Alert severity="warning" icon={<LockOpenOutlinedIcon fontSize="small" />} sx={{ mb: 1.5, py: 0.25 }}
              action={!sucio ? (
                <Button size="small" variant="outlined" startIcon={<LockOutlinedIcon fontSize="small" />} onClick={() => setDesbloqueado(false)}>
                  Bloquear
                </Button>
              ) : undefined}>
              <b>Edición desbloqueada.</b> Guardar anula la firma.
            </Alert>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          {/* «Última edición: X, hace N min», como en Google Docs (Edison
              2026-10-05); al pulsarla se abren las versiones con «Ver cambios». */}
          {documento.ultima_edicion?.en && (
            <Box
              component="button"
              type="button"
              onClick={() => setCajonAbierto(true)}
              title={`Ver versiones y qué cambió (${new Date(documento.ultima_edicion.en).toLocaleString('es-PE')})`}
              sx={{
                all: 'unset',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: 13,
                color: 'text.secondary',
                '&:hover, &:focus-visible': { color: 'primary.main', textDecoration: 'underline' },
              }}
            >
              <HistoryIcon sx={{ fontSize: 16 }} />
              Última edición{documento.ultima_edicion.por ? `: ${documento.ultima_edicion.por}` : ''},{' '}
              {haceCuanto(documento.ultima_edicion.en, ahora)}
            </Box>
          )}
            <Box sx={{ flex: 1 }} />
            {/* Edición simultánea (paso 5.6): estado, quién está y el interruptor. */}
            {proveedor && (
              <>
                <Tooltip
                  title={
                    estadoCompartido === 'reconectando'
                      ? 'Sin conexión: siga escribiendo, no cierre la pestaña.'
                      : 'Se ve al instante. «Guardar» crea versión y PDF.'
                  }
                >
                  <Chip
                    size="small"
                    color={estadoCompartido === 'en_vivo' ? 'success' : estadoCompartido === 'reconectando' ? 'warning' : 'default'}
                    variant={estadoCompartido === 'en_vivo' ? 'filled' : 'outlined'}
                    label={
                      estadoCompartido === 'en_vivo'
                        ? otrosEnTexto.length
                          ? `En vivo · con ${otrosEnTexto.map((o) => o.name.split(' ')[0]).join(', ')}`
                          : 'En vivo'
                        : estadoCompartido === 'reconectando'
                          ? 'Sin conexión: siga escribiendo'
                          : 'Conectando…'
                    }
                  />
                </Tooltip>
                {otrosEnTexto.map((o, i) => (
                  <Tooltip key={`${o.name}-${i}`} title={`${o.name} está en este documento`}>
                    <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: o.color }}>{iniciales(o.name)}</Avatar>
                  </Tooltip>
                ))}
                {!invitado && (
                  <Tooltip title="Guarda y vuelve a la edición por turnos">
                    <span>
                      <Button size="small" onClick={() => void cambiarCompartido(false)} disabled={ocupado !== ''}>
                        Apagar
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </>
            )}
            {!proveedor && documento.compartible && !invitado && (
              <Tooltip
                title={
                  documento.colaboracion
                    ? 'El servidor de edición simultánea no responde: por ahora se guarda por turnos. Pulse para reintentar.'
                    : 'Varias personas escriben a la vez. Se apaga al firmar o enviar.'
                }
              >
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<GroupsOutlinedIcon />}
                    onClick={() => (documento.colaboracion ? setModoTurnos(false) : void cambiarCompartido(true))}
                    disabled={ocupado !== ''}
                  >
                    {documento.colaboracion ? 'Reintentar en simultáneo' : 'Editar en simultáneo'}
                  </Button>
                </span>
              </Tooltip>
            )}
          </Box>
          {(conflicto || anteriores.length > 0) && (
            <Alert
              severity="warning"
              sx={{ mb: 1.5 }}
              action={
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {conflicto && (
                    <Button size="small" variant="contained" color="warning" onClick={cargarMisCambios}>
                      Cargar mis cambios
                    </Button>
                  )}
                  {anteriores.length > 0 && (
                    <Button size="small" variant={conflicto ? 'text' : 'outlined'} color="warning" onClick={() => setVerAnteriores(true)}>
                      Anteriores ({anteriores.length})
                    </Button>
                  )}
                  {conflicto && (
                    <Button size="small" onClick={descartarMisCambios}>
                      Descartar
                    </Button>
                  )}
                </Box>
              }
            >
              {conflicto ? (
                <>
                  <b>{conflicto.editado_por || 'Otra persona'} guardó otra versión</b>
                  {conflicto.editado_en ? ` a las ${horaDe(conflicto.editado_en)}` : ''}. Sus cambios
                  quedaron apartados en este equipo; puede cargarlos.
                </>
              ) : (
                <>Hay cambios suyos apartados en este equipo por choques anteriores; revíselos antes de descartarlos.</>
              )}
            </Alert>
          )}
          <Dialog open={verAnteriores} onClose={() => setVerAnteriores(false)} fullWidth maxWidth="sm" scroll="paper">
            <DialogTitle>Cambios apartados en este equipo</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Cada choque apartó lo que había en pantalla. Cargue el que necesite; reemplaza lo de la pantalla y luego se guarda.
              </Typography>
              {anteriores.map((a, i) => (
                <Box key={a.apartado_en} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Apartado el {new Date(a.apartado_en).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                  {a.campos?.asunto && <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.campos.asunto}</Typography>}
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{textoDeCuerpo(a.cuerpo).slice(0, 220) || '(sin texto en el cuerpo)'}</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.75, justifyContent: 'flex-end' }}>
                    <Button size="small" color="inherit" onClick={() => quitarAnterior(i)}>Descartar</Button>
                    <Button size="small" variant="contained" onClick={() => cargarAnterior(i)}>Cargar este</Button>
                  </Box>
                </Box>
              ))}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setVerAnteriores(false)}>Cerrar</Button>
            </DialogActions>
          </Dialog>
          {ajeno && !conflicto && (
            <Alert severity="info" sx={{ mb: 1.5 }} onClose={() => setAjeno(null)}>
              {ajeno.editado_por || 'Otra persona'} guardó
              {ajeno.editado_en ? ` a las ${horaDe(ajeno.editado_en)}` : ''}. Al guardar elegirá qué versión queda.
            </Alert>
          )}

          {/* ORDEN de la columna (Edison 2026-09-05): el seguimiento del
              trámite ARRIBA (es lo primero que se quiere saber), luego los
              datos —con el tratamiento pegado al nombre y las copias
              autocompletadas—, el cuerpo, los anexos (línea «Adj.» + cuadros,
              todo lo que es «anexo» en un solo lugar) y al final los archivos.
              El formato del PDF vive en la columna del visor, que es lo que
              afecta. Las observaciones van junto a cada campo o sección. */}
          {/* Lo que toca ahora y el índice del formulario (Edison 2026-10-01:
              «hacer intuitiva la redacción»): GuiaDocumento.tsx. */}
          {/* 2026-10-10 (Edison): sin la tarjeta «Siguiente paso» —la ruta del seguimiento ya
              lo dice y la barra tiene la acción—; el índice va en VERTICAL a la izquierda del
              formulario en la computadora, y queda horizontal en el celular. */}
          {/* El índice NO se oculta al desplazar el formulario (Edison 2026-10-10, segunda vuelta):
              en el celular va pegado arriba; en la computadora el carril vertical ocupa toda la
              altura de la fila (alignSelf: stretch) para que su `sticky` tenga dónde quedarse. */}
          {angosta && <IndiceSecciones secciones={SECCIONES_FORM} contenedor={null} fijo />}
          <Box sx={{ display: 'grid', gridTemplateColumns: angosta ? '1fr' : '128px minmax(0, 1fr)', gap: angosta ? 0 : 2, alignItems: 'start' }}>
          {!angosta && <Box sx={{ alignSelf: 'stretch' }}><IndiceSecciones secciones={SECCIONES_FORM} contenedor={columna} fijo vertical /></Box>}
          <Box sx={{ minWidth: 0 }}>

          <Box id="sec-seguimiento" sx={ANCLA} />
          <PanelSeguimiento
            compacto
            documentoId={Number(id)}
            tramite={documento.tramite ?? null}
            responsable={documento.responsable ?? ''}
            estado={documento.estado}
            alCambiar={refrescarEstado}
          />
          <Box id="sec-datos" sx={ANCLA} />
          {/* Datos, cuerpo y anexos: lo impreso. Con la firma en curso se
              bloquean enteros (ZonaBloqueada); seguimiento, archivos y
              expediente siguen activos. */}
          <ZonaBloqueada activo={bloqueado}>
          {/* El oficio que presenta un informe SR reconoce su informe (2026-10-06). */}
          <SugerenciaInformeSR
            documentoId={id!}
            tipo={documento.tipo}
            numerado={documento.numero != null}
            campos={campos}
            alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
            alCambiar={() => {
              visorRef.current?.refrescar()
              refrescarEstado()
            }}
          />
          <Bloque>
          <Titulo>Datos del documento</Titulo>
          <FormularioCampos
            esquema={documento.esquema_campos}
            valores={campos}
            tipo={documento.tipo}
            documentoId={id}
            alCambiar={ponerCampo}
            alCambiarFormato={ponerFormato}
            alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
            envolver={envolverCampo}
            numerado={documento.numero != null}
          />

          </Bloque>
          <Box id="sec-cuerpo" sx={ANCLA} />
          <Bloque>
          {!bloqueado && notasPorOfrecer.map((n) => (
            <Alert key={n.clave} severity="info" icon={false} sx={{ mb: 1, py: 0.25, '& .MuiAlert-message': { width: '100%' } }}
              action={(
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
                  <Button size="small" onClick={() => insertarNotaSugerida(n)} sx={{ whiteSpace: 'nowrap' }}>Insertar</Button>
                  <Button size="small" color="inherit" onClick={() => setNotasDescartadas((d) => new Set(d).add(n.clave))} sx={{ whiteSpace: 'nowrap' }}>Ahora no</Button>
                </Box>
              )}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>Nota de sustento disponible</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }} title={n.texto}>{n.fuente.cita} · editable antes de emitir</Typography>
            </Alert>
          ))}
          <TituloSeccion seccion="cuerpo" sx={{ mb: 0.75 }} extra={marcaFormato('cuerpo')}>
            <Rotulo n={subNumero(secCuerpo)}>Cuerpo del documento</Rotulo>
          </TituloSeccion>
          <ConPresencia clave="cuerpo">
          <Paper variant="outlined" sx={{ overflow: 'visible' }}>
            {/* La barra SIGUE al scroll (pegajosa) para tener las opciones a
                mano cuando el cuerpo es largo (pedido de Edison 2026-08-15). */}
            <Box
              sx={{
                p: 0.5,
                display: 'flex',
                gap: 0.5,
                flexWrap: 'wrap',
                position: 'sticky',
                // En angosta la que se desplaza es la página: la barra se
                // pega bajo la conmutación «Redactar | Vista PDF».
                top: angosta ? ALTO_CONMUTADOR : ALTO_INDICE,
                zIndex: 3,
                bgcolor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'divider',
                borderTopLeftRadius: 'inherit',
                borderTopRightRadius: 'inherit',
              }}
            >
              <BarraFormato editor={editor} titulo={documento.cuerpo_con_secciones ? 'Sección' : undefined} nivelTitulo={2} />
            </Box>
            <Divider />
            <Box
              sx={{
                p: 2,
                minHeight: 260,
                '& .ProseMirror': { outline: 'none', minHeight: 240, counterReset: 'nota' },
                '& .ProseMirror h2': { fontSize: '1.05rem', fontWeight: 600, mt: 1.5 },
                // Numeradas como en el PDF (1, 2, 3…): el contador CSS tapa el «†».
                '& .ProseMirror sup.nota-al-pie': {
                  color: 'primary.main',
                  fontWeight: 700,
                  cursor: 'pointer',
                  px: '2px',
                  counterIncrement: 'nota',
                  fontSize: 0,
                  '&::after': { content: 'counter(nota)', fontSize: '0.75rem' },
                },
                // Solo al editar: en solo lectura la llamada debe entrar en lo
                // que se selecciona y copia, o la nota se pierde al pegar.
                '& .ProseMirror[contenteditable="true"] sup.nota-al-pie': { userSelect: 'none' },
                '& .ProseMirror table': {
                  borderCollapse: 'collapse',
                  width: '100%',
                  my: 1,
                },
                // Citas enlazadas (Referencia.ts): texto normal con un subrayado tenue.
                '& .ProseMirror span.referencia': {
                  borderBottom: '1px dotted',
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                  borderRadius: '2px',
                  px: '1px',
                },
                '& .ProseMirror td, & .ProseMirror th': {
                  border: '1px solid',
                  borderColor: 'divider',
                  p: '4px 8px',
                  verticalAlign: 'top',
                },
                '& .ProseMirror th': { bgcolor: PALETA.superficieMedia, fontWeight: 600 },
                // Cursores de las demás personas (edición simultánea).
                ...estiloCursores,
                // Búsqueda y rótulo del cuadro (BarraFormato).
                ...estiloHerramientas,
              }}
              onClick={() => editor?.chain().focus().run()}
              onContextMenu={abrirMenuTabla(editor)}
            >
              <EditorContent editor={editor} />
              <PopupReferencias editor={editor} control={controlReferencias} contexto="documento" />
            </Box>
          </Paper>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Para citar, escriba «Ley», «Oficio», «PL» o «@» y elija.
          </Typography>
          </ConPresencia>

          {/* ANEXOS (Edison 2026-09-05): solo DOS formularios, uno al lado del
              otro:
                1. Documentos adjuntos — archivos EXTERNOS que acompañan al
                   documento (nombre + archivo). Sus nombres forman SOLOS la
                   línea «Adj.» del pie del documento al compilar.
                2. Figuras y tablas — lo que se genera AQUÍ y se imprime como
                   páginas «ANEXO N» tras la firma. */}
          </Bloque>
          </ZonaBloqueada>
          <Box id="sec-anexos" sx={ANCLA} />
          <Bloque>
            <Titulo
              icono={<PostAddIcon />}
              accion={
                <Canal>
                  {marcaFormato('anexos')}
                  <MarcaObservacion seccion="anexos" />
                </Canal>
              }
            >
              <Rotulo n={subNumero(secAnexos)}>Anexos</Rotulo>
            </Titulo>
            <PendientesSeccion seccion="anexos" />
            <ZonaBloqueada activo={bloqueado}>
            <Box
              sx={{
                display: 'grid',
                // Por el ancho de la COLUMNA, no de la ventana: el formulario
                // ocupa media pantalla y a dos columnas «Figuras y tablas»
                // quedaba estrujada. Lado a lado solo si caben holgadas.
                // min(100%, …): en el celular la columna mide menos de 340 px
                // y sin esto la retícula desborda.
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                gap: 2,
                mt: 1.5,
              }}
            >
              <Box>
                <Titulo nivel="sub">Documentos adjuntos</Titulo>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Archivos externos: forman la línea «Adj.» y entran al expediente.
                </Typography>
                <Adjuntos
                  documentoId={id!}
                  manuales={parsearManuales(campos.anexo ?? '')}
                  alCambiarManuales={(ns) => ponerCampo('anexo', serializarManuales(ns))}
                  alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
                  alActualizar={() => {
                    visorRef.current?.refrescar()
                    // Un cambio de adjuntos puede anular la firma (estado y trámite).
                    refrescarEstado()
                  }}
                  alVer={(aid) => visorRef.current?.mostrar(aid)}
                />
              </Box>
              <Box>
                <Titulo nivel="sub">Figuras y tablas</Titulo>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Se imprimen como «ANEXO N» tras la firma.
                  {proveedor && ' No se ven en vivo; se comparten al guardar.'}
                </Typography>
                {documento && (
                  <AnexosEditor
                    key={id}
                    ref={anexosRef}
                    inicial={parsearAnexos(documento.campos)}
                    abrirMenuTabla={abrirMenuTabla}
                    botonFormato={botonFormato}
                  />
                )}
              </Box>
            </Box>
            </ZonaBloqueada>
            {/* Cierre de Anexos: el expediente junta el documento y estos
                adjuntos en un PDF (Edison 2026-10-01: «dentro de Anexos, que
                se entienda qué hace, cuándo usarlo y qué produce»). */}
            <ArmarExpediente
              documentoId={id!}
              alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
              alVer={() => visorRef.current?.mostrar('expediente')}
            />
          </Bloque>

          {/* Firmado, cargos, adjuntos y recibidos: un solo panel rotulado,
              para que nadie tenga que adivinar dónde va cada archivo
              (PanelArchivos.tsx, Edison 2026-09-05). */}
          <Box id="sec-archivos" sx={ANCLA} />
          <PanelArchivos
            documentoId={id!}
            interno={documento.tramite?.ambito === 'interno'}
            destinatarios={destinatariosDe(campos)}
            etapas={documento.tramite?.etapas}
            alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
            alActualizar={() => {
              visorRef.current?.refrescar()
              refrescarEstado()
            }}
          />
          {/* Mapa local (2026-10-05), al final (2026-10-10): con quién y con qué se conecta
              este documento —destinatario, respuestas, proyecto, referencias—. */}
          <Box id="sec-relaciones" sx={ANCLA} />
          <Box sx={{ mt: 2.5, mb: 2 }}>
            <MapaLocal foco={`doc:${id}`} alto={200} titulo="Relaciones de este documento" />
          </Box>
          </Box>
          </Box>
        </Box>

        {/* Columna del visor: el FORMATO del PDF va aquí, encima de la vista
            previa, porque es lo que sus ajustes cambian (antes iba entre los
            datos y el cuerpo, donde no se entendía qué afectaba). */}
        <Box sx={{ flex: 1, display: angosta && vistaMovil !== 'pdf' ? 'none' : 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box id="sec-formato" sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.25, mb: 1, scrollMarginTop: 8 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <ZonaBloqueada activo={bloqueado}>
              <PanelFormato
                tipo={documento.tipo}
                valores={campos}
                alCambiar={ponerFormato}
                alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
                alGuardado={(v) => setPredeterminados(v)}
                predeterminados={predeterminados}
                efectivos={ajusteValores}
              />
              </ZonaBloqueada>
            </Box>
            <MarcaObservacion seccion="formato" sx={{ mt: 1.5 }} />
          </Box>
          <PendientesSeccion seccion="formato" />
          {/* Con guardado automático la vista previa se pone al día sola; el aviso
              queda para un firmado desbloqueado, donde guardar lo decide la persona. */}
          {sucio && urlPdf && ocupado === '' && !autoPermitido && (
            <Alert severity="warning" variant="outlined" sx={{ mb: 1, py: 0 }}>
              Vista previa sin los últimos cambios: pulse <b>Guardar</b>.
            </Alert>
          )}
        <EstadoVistaPrevia estado={estadoVista ?? documento.estado_compilacion} />
        <VisorDocumento
          ref={visorRef}
          alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
          documentoId={id!}
          urlPrincipal={urlPdf}
          titulo="Vista previa"
          manuales={parsearManuales(campos.anexo ?? '')}
          referencias={(campos.referencia ?? '').split('\n').map((t) => t.trim()).filter(Boolean)}
          alCargarManual={async (nombre, archivo) => {
            const r = await cargarArchivoDeManual(id!, nombre, archivo)
            // El nombre suelto ya es un archivo: sale de campos.anexo (la
            // misma línea «Adj.»: no anula la firma; servicios/vigencia.py).
            ponerCampo(
              'anexo',
              serializarManuales(parsearManuales(campos.anexo ?? '').filter((n) => n !== nombre)),
            )
            return r
          }}
          placeholder={
            ocupado === 'guardar' || ocupado === 'generar' ? (
              <EstadoVacio icono={<CircularProgress size={36} />} titulo="Compilando el documento…" texto="Unos 15 segundos." />
            ) : (
              <EstadoVacio
                icono={<DescriptionOutlinedIcon />}
                titulo="Todavía no hay vista previa"
                texto="Compílelo para verlo aquí. No asigna número."
                accion={
                  <BotonPaso
                    paso={pasoPrevisualizar}
                    variant="outlined"
                    size="small"
                    startIcon={pasoPrevisualizar ? undefined : <VisibilityIcon />}
                    onClick={() => void guardar()}
                    disabled={ocupado !== '' || bloqueado}
                  >
                    Vista previa
                  </BotonPaso>
                }
              />
            )
          }
        />
        </Box>
      </Box>

      <DialogoVerificacion
        abierto={dlgCopias !== null}
        puntos={dlgCopias?.puntos ?? []}
        copias={dlgCopias?.copias ?? []}
        sugeridas={dlgCopias?.sugeridas ?? []}
        noSeImprimen={copiasOcultas(campos)}
        ocupado={ocupado === 'generar'}
        alCancelar={() => setDlgCopias(null)}
        alConfirmar={(revisados) => {
          setDlgCopias(null)
          void generar(revisados)
        }}
      />

      <MenuTabla estado={menuTabla} alCerrar={() => setMenuTabla(null)} />

      <Snackbar
        open={aviso !== null}
        autoHideDuration={5000}
        onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={aviso?.tipo ?? 'success'} onClose={() => setAviso(null)}>
          {aviso?.texto}
        </Alert>
      </Snackbar>

      <CajonActividad
        documentoId={id!}
        abierto={cajonAbierto}
        alCerrar={() => setCajonAbierto(false)}
        incluirVersiones
        alRestaurar={() => {
          // La restauración es la nueva verdad: descartar el respaldo
          // local obsoleto para que una recarga no reviva el borrador
          // viejo ni un Guardar deshaga la restauración.
          limpiarRespaldo()
          api<Documento>(`/api/documentos/${id}`).then((doc) => {
            setDocumento(doc)
            setCampos(doc.campos)
            cuerpoCargadoId.current = null
          })
        }}
      />
      <DialogoMesaDePartes documentoId={mesaPartes ? Number(id) : null} alCerrar={() => setMesaPartes(false)} />
      <DialogoRevision
        abierto={dlgRevision}
        alCerrar={() => setDlgRevision(false)}
        responsableActual={documento.responsable_id ?? null}
        alEnviar={(quien, nota) => cambiarEstado('EN_REVISION', { responsable_id: quien, comentario: nota })}
      />
    </Marco>
    </ProveedorSala>
    </ComentariosContext.Provider>
  )
}

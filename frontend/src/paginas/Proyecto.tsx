/**
 * PROYECTO — una página por proyecto (piloto 2026-10-01: el proyecto de ley).
 *
 *   Resumen · Texto · Fases y tareas · Fuentes y archivos · Conversación
 *
 * COLABORACIÓN POR PARTES (fase 1, docs/plataforma/propuesta.md): el texto se
 * divide en las partes del esquema oficial (fórmula legal, fundamentos,
 * costo-beneficio…). Quien pulsa «Escribir» toma esa parte —un candado que
 * late cada 30 s y caduca solo—; el resto la ve en lectura con «X está
 * escribiendo» y puede trabajar a la vez en OTRA parte. Cada guardado es una
 * versión con autor y nota; restaurar crea una versión nueva, nunca borra.
 * La página se refresca sola cada 15 s para mostrar lo que hacen los demás.
 *
 * EDICIÓN SIMULTÁNEA (fase 5): con el interruptor del proyecto encendido, las
 * partes se escriben a la vez y sin candado (componentes/EditorParteCompartida).
 * Si el servidor compartido no responde, la página vuelve sola al modo por
 * turnos de arriba, partiendo de lo último escrito (el borrador vivo).
 */
import { subirFirmado } from '../firmados'
import { BotonOpenProject, useEnlaceOpenProject } from '../componentes/OpenProject'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useEditor, EditorContent } from '@tiptap/react'
import Typography from '@mui/material/Typography'
import { PALETA } from '../paleta'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
import ListItemIcon from '@mui/material/ListItemIcon'
import Divider from '@mui/material/Divider'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import Checkbox from '@mui/material/Checkbox'
import Switch from '@mui/material/Switch'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import TableChartIcon from '@mui/icons-material/TableChartOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import VisorPdf from '../componentes/VisorPdf'
import type { ArchivoVisor } from '../componentes/PanelArchivosVisor'
import BuscarZotero from '../componentes/BuscarZotero'
import Avatar from '@mui/material/Avatar'
import Paper from '@mui/material/Paper'
import Autocomplete from '@mui/material/Autocomplete'
import Collapse from '@mui/material/Collapse'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ChecklistIcon from '@mui/icons-material/Checklist'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import EditIcon from '@mui/icons-material/Edit'
import SaveIcon from '@mui/icons-material/Save'
import HistoryIcon from '@mui/icons-material/History'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import LockIcon from '@mui/icons-material/Lock'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DownloadIcon from '@mui/icons-material/Download'
import { api, apiPdf, descargarArchivo, ErrorApi, subirArchivo } from '../api'
import PegarResultado from '../componentes/PegarResultado'
import { registrarPegado } from '../pegar'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { extensionesParte } from '../extensiones/esquema'
import { AutocompletarReferencias, crearControl } from '../extensiones/AutocompletarReferencias'
import PopupReferencias, { avisarRelaciones, useAvisoReferencias } from '../componentes/PopupReferencias'
import BotonFotografia from '../componentes/BotonFotografia'
import CargarWord from '../componentes/CargarWord'
import BarraFormato, { MenuTabla, barraFija, barraPanel, estiloContenido, useMenuTabla } from '../componentes/BarraFormato'
import Marco, { type OpcionPagina } from '../componentes/Marco'
import { EditorTitulo, MenuEstructura } from '../componentes/EstructuraLey'
import { usePartesProyecto } from '../componentes/PartesProyecto'
import ElegirModalidad from '../componentes/ElegirModalidad'
import { guardarPreferencia, leerPreferencias, modalidadAlAbrir, preferenciasInmediatas, type Modalidad } from '../preferencias'
import { MenuAnidado } from '../componentes/word/BarraWord'
import { plantillaParte, vacia } from '../estructuraLey'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import EquipoEnLinea, { iniciales, usePresencia, type Persona } from '../componentes/EquipoEnLinea'
import EditorParteCompartida from '../componentes/EditorParteCompartida'
import ComparadorVersiones from '../componentes/ComparadorVersiones'
import MapaLocal from '../componentes/grafo/MapaLocal'
import { ConPresencia, ProveedorSala, useSala } from '../componentes/Presencia'
import { fechaLarga, hoyIso } from '../fechas'
import { confirmar, pedirTexto } from '../componentes/Dialogos'

// --- Tipos -------------------------------------------------------------------

interface Seccion {
  /** Identidad estable; `fija`: su lugar lo fija la técnica legislativa; `de_plantilla`: nació de la plantilla. */
  id: number
  fija?: boolean
  de_plantilla?: boolean
  clave: string
  titulo: string
  grupo: string
  obligatoria: boolean
  estado: string
  contenido: object
  version: number
  responsable_id: number | null
  responsable: string
  editando_por: number | null
  editando: string
  actualizado_por: string
  actualizado_en: string | null
  palabras: number
  // Edición simultánea (fase 5): generación del texto compartido y lo escrito
  // que aún no es versión (borrador vivo).
  generacion: number
  sin_versionar: boolean
  borrador: object | null
  borrador_por: string
  borrador_en: string | null
}
interface Requisito { texto: string; fuente: string; naturaleza?: string; hecho: boolean }
// Las tres categorías que no se mezclan (Edison 2026-10-01, §5).
const NATURALEZA: Record<string, { t: string; color: string }> = {
  oficial: { t: 'Norma', color: PALETA.texto },
  despacho: { t: 'Despacho', color: PALETA.info },
  buena_practica: { t: 'Buena práctica', color: PALETA.textoTenue },
}
const naturalezaDe = (r: Requisito) =>
  r.naturaleza ?? (/^buena pr/i.test(r.fuente) ? 'buena_practica' : /reglamento|const\./i.test(r.fuente) ? 'oficial' : 'despacho')
interface Fase {
  id: number; clave: string; nombre: string; descripcion: string; ambito: string; estado: string
  responsable_id: number | null; responsable: string; inicio: string; limite: string; requisitos: Requisito[]
}
interface Tarea {
  id: number; fase_id: number | null; seccion: string; titulo: string; detalle: string
  responsable_id: number | null; responsable: string; estado: string; limite: string
}
interface Fuente {
  id: number; tipo: string; referencia: string; url: string; clave_externa: string; seccion: string; nota: string
  /** Lo que hoy es su clave externa (Biblioteca, datafw, documento de Qillqa). */
  resuelta?: { origen: string; titulo: string; detalle: string; ruta?: string } | null
}
interface Archivo { id: number; categoria: string; etiqueta: string; nombre: string; tamano: number; subido_en: string; subido_por: string; sha256?: string }
interface FichaPdf { id: number; etiqueta: string; subido_en: string | null; al_dia: boolean }
interface Miembro { usuario_id: number; nombre: string; usuario: string; rol: string }
interface ProyectoDatos {
  id: number; codigo: string; tipo_nombre: string; grupos: Record<string, string>; titulo: string; estado: string
  estados: string[]; numero_oficial: string; fecha_presentacion: string; datos: Record<string, string>
  responsable_id: number | null; creado_por: string; creado_en: string; miembros: Miembro[]; fases: Fase[]
  colaboracion: boolean
  /** El administrador, o el responsable mientras es borrador (API). */
  puede_eliminar?: boolean
  secciones: Seccion[]; tareas: Tarea[]; fuentes: Fuente[]; archivos: Archivo[]
  documentos: { documento_id: number; numero: string; tipo: string; asunto: string; estado: string; rol: string }[]
  avance: { fases_hechas: number; fases_total: number; partes_aprobadas: number; partes_total: number; tareas_abiertas: number }
  bloqueos: number
  /** PDF que se abre al entrar: último generado y último firmado, y si siguen al día. */
  pdf?: { generado: FichaPdf | null; firmado: FichaPdf | null; ultimo_cambio: string | null }
}
interface Actividad { id: number; tipo: string; usuario: string; seccion: string; texto: string; menciones: string[]; resuelto: boolean; creado_en: string }
interface Version { version: number; nota: string; usuario: string; creado_en: string; palabras: number; contenido: object; basada_en?: number | null; estado?: string }

export const ETIQUETA_ESTADO_PROYECTO: Record<string, string> = {
  idea: 'Idea', en_elaboracion: 'En elaboración', en_revision: 'En revisión',
  listo_para_presentar: 'Listo para presentar', presentado: 'Presentado', en_comision: 'En comisión',
  dictaminado: 'Dictaminado', en_pleno: 'En el Pleno', aprobado: 'Aprobado', ley_publicada: 'Ley publicada',
  archivado: 'Archivado', retirado: 'Retirado',
}
const ETIQUETA_SECCION: Record<string, { t: string; c: 'default' | 'info' | 'warning' | 'success' }> = {
  borrador: { t: 'Borrador', c: 'default' },
  en_revision: { t: 'En revisión', c: 'info' },
  observada: { t: 'Observada', c: 'warning' },
  aprobada: { t: 'Aprobada', c: 'success' },
}
// Color del punto de estado de cada parte (lista de la izquierda).
const COLOR_SECCION: Record<string, string> = { borrador: PALETA.apagado, en_revision: PALETA.info, observada: PALETA.aviso, aprobada: PALETA.exito }
const ETIQUETA_FASE: Record<string, string> = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha', omitida: 'No aplica' }
const ROLES = { responsable: 'Responsable', redactor: 'Redacción', revisor: 'Revisión', colaborador: 'Colaboración' } as Record<string, string>
const TIPOS_FUENTE = { norma: 'Norma', jurisprudencia: 'Jurisprudencia', dato: 'Dato o estadística', estudio: 'Estudio', prensa: 'Prensa', proyecto: 'Proyecto de ley', otro: 'Otro' } as Record<string, string>
const yo = () => localStorage.getItem('sgdp_nombre') ?? ''
// Alto de cada columna del Texto en escritorio: la pantalla menos un margen
// arriba y abajo (las tres quietas y alineadas al desplazar la página).
const ALTO_COLUMNA = 'calc(100vh - 24px)'
/** Todo el texto de un documento TipTap, en una línea. */
const textoPlano = (doc: unknown): string => {
  const plano = (n: { type?: string; text?: string; content?: unknown[] }): string =>
    n?.type === 'text' ? n.text ?? '' : ((n?.content ?? []) as { type?: string }[]).map(plano).join(' ')
  return plano((doc ?? {}) as { content?: unknown[] }).replace(/\s+/g, ' ').trim()
}
const esInvitado = () => localStorage.getItem('sgdp_rol') === 'invitado'
// Estados en que el proyecto ya salió de la entidad (servicios/proyectos.py).
const PRESENTADO = ['presentado', 'en_comision', 'dictaminado', 'en_pleno', 'aprobado', 'ley_publicada']
// Lo que la guía «Siguiente paso» ya dice (partes que faltan, [corchetes]) no
// se repite en el aviso de técnica legislativa.
const sinRepetirGuia = (avisos: string[]) => avisos.filter((x) => !/^Falta la parte obligatoria|^Quedan textos por completar/.test(x))
const RE_POR_COMPLETAR = /\[[^\]]{2,80}\]/
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

// --- Editor de una parte -----------------------------------------------------

/** Lo que el editor por turnos ofrece a la página para no perder lo escrito
 *  (revisión de usabilidad 2026-10-01: pasar a otra parte, a otra pestaña o
 *  salir SIN «Guardar» borraba el texto sin avisar). `vaciar` guarda lo
 *  pendiente y espera; `alSalir` lo manda sin esperar (cierre de pestaña o
 *  salida de la página) y dice si mandó algo —en ese caso suelta la parte en
 *  la misma llamada—. */
export interface Vaciado {
  /** true si todo quedó guardado (o no había nada); false si falló. */
  vaciar: () => Promise<boolean>
  alSalir: () => boolean
}
// Pausa al escribir tras la que se guarda solo.
const PAUSA_AUTOGUARDADO = 4000

function EditorParte({
  pid, s, editable, alGuardar, alAvisar, alPrevisualizar, enPanel = false, separador, registrar,
}: {
  pid: number; s: Seccion; editable: boolean
  /** La página recibe cómo vaciar lo pendiente antes de cambiar de parte o salir. */
  registrar: (v: Vaciado | null) => void
  /** Separador del número del artículo y la disposición («.-»), de la ficha. */
  separador?: string
  /** Escritorio (tres columnas): barra quieta y solo el texto se desplaza dentro del recuadro. */
  enPanel?: boolean
  alGuardar: () => void
  alAvisar: (tipo: 'success' | 'error' | 'info', t: string) => void
  /** Vista previa a la derecha; con contenido, el de esta parte AÚN SIN GUARDAR.
   *  `auto`: la refresca un guardado automático (no cambia lo que se mira). */
  alPrevisualizar: (contenido: object | null, auto?: boolean) => void
}) {
  const [nota, setNota] = useState('')
  const [sucio, setSucio] = useState(false)
  const menuTabla = useMenuTabla()
  const base = useRef(s.version)
  // Lo escrito A MANO que aún no llegó al servidor (la estructura base sola no
  // cuenta: mirar una parte opcional no debe meterla al PDF con [corchetes]).
  const pend = useRef({ pendiente: false, contenido: null as object | null, edicion: 0, clave: s.clave })
  const [estadoGuardado, setEstadoGuardado] = useState<{ t: 'guardando' | 'guardado' | 'error' | ''; texto?: string }>({ t: '' })
  const temporizador = useRef<number>()
  const guardarRef = useRef<(auto: boolean) => Promise<boolean>>()
  const marcarEscrito = (contenido: object) => {
    pend.current.pendiente = true
    pend.current.contenido = contenido
    pend.current.edicion += 1
    setSucio(true)
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => void guardarRef.current?.(true), PAUSA_AUTOGUARDADO)
  }
  // Autocompletado de referencias (2026-10-06): «Ley …», «@…» citan y relacionan.
  const controlReferencias = useMemo(crearControl, [])
  const editor = useEditor({
    extensions: [...extensionesParte(), AutocompletarReferencias.configure({ control: controlReferencias })],
    content: s.contenido,
    editable,
    // Tiptap 3 ya no repinta por transacción por omisión; esta página (barra,
    // botones) lo daba por hecho en la v2.
    shouldRerenderOnTransaction: true,
    // Solo lo que cambia el TEXTO: setEditable también emite «update» (sin
    // cambio) y abrir una parte parecía escribir en ella.
    onUpdate: ({ editor: e, transaction }) => { if (transaction.docChanged) marcarEscrito(e.getJSON()) },
  })
  useAvisoReferencias(editor, `pl:${pid}`, s.clave)
  // Al cambiar de parte o recibir una versión nueva AJENA, cargarla (sin
  // pisar lo que se está escribiendo aquí).
  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable, false)
    // Solo una versión MÁS NUEVA que la del editor (de otra persona). Tras
    // guardar, el editor ya va en la nueva y el proyecto aún trae la anterior
    // hasta recargarse: con «!==» se volvía a poner el texto viejo encima de lo
    // recién guardado (Edison 2026-10-01: «al guardar desaparece lo último»).
    if (!sucio && s.version > base.current) {
      editor.commands.setContent(s.contenido, { emitUpdate: false })
      base.current = s.version
    }
  }, [editor, editable, s.version, s.contenido, sucio])
  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(s.contenido, { emitUpdate: false })
    base.current = s.version
    setSucio(false)
    setEstadoGuardado({ t: '' })
    window.clearTimeout(temporizador.current)
    pend.current = { pendiente: false, contenido: null, edicion: 0, clave: s.clave }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, s.clave])
  // Parte de la fórmula legal VACÍA al empezar a escribir: se carga su
  // estructura base (artículos, disposiciones…) para completar lo que va
  // [entre corchetes]. No se guarda sola: queda «sin guardar» hasta Guardar.
  // Se decide por el TEXTO de esta parte (vacío en el servidor y en el
  // editor), no por «sin guardar»: esa marca podía venir de la parte anterior
  // y dejaba sin estructura a las demás (Edison 2026-10-01: «solo el cuerpo
  // estaba para completar»). Una vez por parte y visita.
  const [conPlantilla, setConPlantilla] = useState(false)
  const plantillaPuesta = useRef('')
  useEffect(() => {
    setConPlantilla(false)
    plantillaPuesta.current = ''
  }, [s.clave])
  useEffect(() => {
    if (!editor || !editable || plantillaPuesta.current === s.clave) return
    if (!vacia(s.contenido) || !editor.isEmpty) return
    const base = plantillaParte(s.clave, separador)
    if (!base) return
    plantillaPuesta.current = s.clave
    editor.commands.setContent(base, { emitUpdate: false })
    setSucio(true)
    setConPlantilla(true)
  }, [editor, editable, s.clave, s.contenido, separador])

  // Cuadro comparativo: se ARMA desde las citas de las modificatorias
  // (servicios/comparativo.py); lo ya pegado en «Texto vigente» se conserva.
  const armarCuadro = async () => {
    if (!editor) return
    try {
      const r = await api<{ contenido: object; citas: number; pendientes: number }>(`/api/proyectos/${pid}/comparativo/armado`)
      if (r.citas === 0) {
        alAvisar('info', 'Aún no hay textos citados en las modificatorias.')
        return
      }
      editor.commands.setContent(r.contenido, { emitUpdate: false })
      marcarEscrito(editor.getJSON())
      alAvisar(
        'info',
        // Texto breve, pedido de Edison (2026-10-06).
        `Cuadro armado: ${r.citas} artículo${r.citas > 1 ? 's' : ''}.` +
          (r.pendientes ? ` Falta el texto vigente de ${r.pendientes}.` : ''),
      )
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo armar el cuadro.')
    }
  }

  // GUARDAR: a mano (con nota: una versión con nombre) o SOLO, tras una pausa
  // al escribir, al pasar a otra parte o pestaña y al salir. Los automáticos
  // seguidos se unen en una sola versión en el servidor (NOTA_AUTO).
  const enVuelo = useRef<Promise<boolean> | null>(null)
  const guardar = async (auto = false): Promise<boolean> => {
    if (!editor) return true
    if (auto && !pend.current.pendiente) return true
    // Uno a la vez: dos PUT con la misma versión base chocarían (409).
    if (enVuelo.current) {
      await enVuelo.current
      if (auto && !pend.current.pendiente) return true
    }
    window.clearTimeout(temporizador.current)
    const edicion = pend.current.edicion
    const clave = pend.current.clave
    const tarea = (async () => {
      setEstadoGuardado({ t: 'guardando' })
      try {
        const r = await api<{ version: number }>(`/api/proyectos/${pid}/secciones/${clave}`, {
          method: 'PUT',
          body: JSON.stringify({ contenido: editor.getJSON(), version_base: base.current, nota: auto ? '' : nota, auto }),
        })
        base.current = r.version
        // Las citas de la parte ya son relaciones (y fuentes): el mapa local se refresca.
        avisarRelaciones(`pl:${pid}`)
        // Si se siguió escribiendo mientras viajaba, queda pendiente.
        if (pend.current.edicion === edicion && pend.current.clave === clave) {
          pend.current.pendiente = false
          setSucio(false)
        }
        setConPlantilla(false)
        setEstadoGuardado({ t: 'guardado', texto: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) })
        if (!auto) {
          setNota('')
          alAvisar('success', `Guardado: «${s.titulo}» v${r.version}.`)
        }
        alGuardar()
        // Como en los documentos: guardar refresca la vista previa (la
        // automática, sin quitar a la persona de lo que está mirando).
        alPrevisualizar(null, auto)
        return true
      } catch (e) {
        const texto = e instanceof Error ? e.message : 'No se pudo guardar.'
        setEstadoGuardado({ t: 'error', texto })
        alAvisar('error', auto ? `No se guardó: ${texto.replace(/\.$/, '')}. Pulse «Guardar».` : texto)
        return false
      }
    })()
    enVuelo.current = tarea
    try {
      return await tarea
    } finally {
      if (enVuelo.current === tarea) enVuelo.current = null
    }
  }
  guardarRef.current = guardar
  // Ctrl+S (⌘S) guarda, como en el editor de documentos.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void guardarRef.current?.(false)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // La página vacía lo pendiente antes de cambiar de parte o pestaña, y lo
  // manda sin esperar al cerrar la pestaña o salir del proyecto.
  useEffect(() => {
    if (!editor) return
    registrar({
      vaciar: () => guardar(true),
      alSalir: () => {
        if (!pend.current.pendiente) return false
        const token = localStorage.getItem('sgdp_token')
        void fetch(`/api/proyectos/${pid}/secciones/${pend.current.clave}`, {
          method: 'PUT', keepalive: true,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ contenido: pend.current.contenido ?? editor.getJSON(), version_base: base.current, nota: '', auto: true, soltar: true }),
        })
        pend.current.pendiente = false
        return true
      },
    })
  })
  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  return (
    <Box sx={enPanel ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : undefined}>
      <Box
        sx={{
          border: '1px solid', borderColor: editable ? 'primary.main' : 'divider', borderRadius: 1, p: 2, minHeight: 280,
          ...(enPanel ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, p: 0, overflow: 'hidden' } : {}),
          bgcolor: editable ? 'background.paper' : PALETA.superficieTenue,
          ...estiloContenido,
          '& .ProseMirror': { outline: 'none', minHeight: 240, fontSize: 14.5, lineHeight: 1.55 },
          '& .ProseMirror p': { my: 0.75 },
          '& .ProseMirror h3': { fontSize: 15, fontWeight: 700, mt: 1.5, mb: 0.5 },
          // Niveles de agrupación (Libro, Sección, Título, Capítulo…):
          // centrados, como en el PDF (estructuraLey.ts).
          '& .ProseMirror h2': { fontSize: 14.5, fontWeight: 700, textAlign: 'center', mt: 2, mb: 0.25 },
          // Texto citado de otra norma: sangrado, como sale en el PDF.
          '& .ProseMirror blockquote': { ml: 4, pl: 1.5, my: 1, borderLeft: '3px solid', borderColor: 'divider', color: 'text.secondary' },
        }}
        onContextMenu={menuTabla.abrir(editor)}
      >
        {conPlantilla && editable && (
          <Alert severity="info" onClose={() => setConPlantilla(false)} sx={{ m: enPanel ? 1.5 : 0, mb: 1.5, py: 0 }}>
            {/* 2026-10-06: el autoguardado ya lo dice el estado de la barra; texto breve, pedido de Edison. */}
            Complete lo que está [entre corchetes].
          </Alert>
        )}
        {editable && editor && (
          <BarraFormato
            editor={editor}
            titulo="Título de artículo, disposición o apartado"
            // Fija arriba al bajar por el texto, sin perder el marco del recuadro.
            sx={enPanel ? barraPanel : barraFija(true)}
            extras={<>
            <MenuEstructura editor={editor} clave={s.clave} separador={separador} alAvisar={(t, x) => alAvisar(t, x)} />
            <BotonFotografia editor={editor} pid={pid} alAvisar={alAvisar} />
            <Tooltip title="Cita de otra norma; sale sangrada en el PDF.">
              <Button
                size="small"
                startIcon={<FormatQuoteIcon />}
                variant={editor.isActive('blockquote') ? 'contained' : 'text'}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >
                Texto citado
              </Button>
            </Tooltip>
            {s.clave === 'comparativo' && (
              <Tooltip title="Arma el cuadro con los textos citados; conserva lo pegado.">
                <Button size="small" startIcon={<TableChartIcon />} onClick={() => void armarCuadro()}>
                  Armar desde las modificatorias
                </Button>
              </Tooltip>
            )}
            {/* 2026-10-08: sin «Vista previa» (como en Documentos): cada guardado la rehace. */}
            {/* Lo escrito se guarda solo; el botón queda para guardar YA
                (con nota, si se escribió una abajo). */}
            <Typography variant="caption" sx={{ px: 0.5, whiteSpace: 'nowrap', color: estadoGuardado.t === 'error' ? 'error.main' : 'text.secondary' }}>
              {estadoGuardado.t === 'guardando' ? 'Guardando…'
                : estadoGuardado.t === 'error' ? 'Sin guardar'
                  : sucio && pend.current.pendiente ? 'Se guarda solo…'
                    : sucio ? 'Estructura sin guardar'
                      : estadoGuardado.t === 'guardado' ? `Guardado ${estadoGuardado.texto}` : ''}
            </Typography>
            <Tooltip title={sucio ? 'Guardar versión ahora (Ctrl+S).' : 'Todo está guardado'}>
              <span>
                <Button size="small" variant="contained" onClick={() => void guardar()} disabled={!sucio || estadoGuardado.t === 'guardando'}
                  startIcon={estadoGuardado.t === 'guardando' ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}>
                  {estadoGuardado.t === 'guardando' ? 'Guardando y compilando…' : 'Guardar'}
                </Button>
              </span>
            </Tooltip>
            </>}
          />
        )}
        {enPanel ? (
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1.5 }}><EditorContent editor={editor} /></Box>
        ) : (
          <EditorContent editor={editor} />
        )}
        <PopupReferencias editor={editor} control={controlReferencias} contexto="parte" />
        <MenuTabla estado={menuTabla.estado} alCerrar={menuTabla.cerrar} />
      </Box>
      {editable && (
        <TextField size="small" fullWidth placeholder="Nota de versión (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} sx={{ mt: 1 }} />
      )}
    </Box>
  )
}

// --- Página ------------------------------------------------------------------

export default function Proyecto() {
  const { id } = useParams()
  const pid = Number(id)
  const navegar = useNavigate()
  const [p, setP] = useState<ProyectoDatos | null>(null)
  const [pestana, setPestanaBase] = useState<'resumen' | 'texto' | 'fases' | 'fuentes' | 'conversacion'>('texto')
  const [sel, setSelBase] = useState('')
  // Celular y tableta (Edison 2026-10-01: «las tres columnas no tienen que
  // mantenerse en un celular»): Partes | Redactar | PDF, una a la vez, con un
  // conmutador fijo arriba. Las tres siguen montadas (se ocultan, no se
  // desmontan): lo que se escribe no se pierde al mirar el PDF.
  const tema = useTheme()
  const compacta = useMediaQuery(tema.breakpoints.down('md'))
  // Escritorio con las tres columnas: las tres quietas y alineadas, del alto
  // de la pantalla; en la del centro solo se desplaza el texto (Edison
  // 2026-10-01: «esa barrita no debe ocultarse… solo el texto debe scrollar»).
  const tresColumnas = useMediaQuery(tema.breakpoints.up('lg'))
  const [panel, setPanel] = useState<'partes' | 'redactar' | 'pdf'>('redactar')
  const setSel = useCallback((v: string | ((x: string) => string)) => {
    setSelBase(v)
    if (typeof v === 'string') setPanel('redactar')
  }, [])
  const [escribiendo, setEscribiendo] = useState('')
  const setPestana = useCallback((x: 'resumen' | 'texto' | 'fases' | 'fuentes' | 'conversacion') => {
    // Si no se pudo guardar, se queda: irse desmontaría el editor con el texto.
    void (vaciado.current?.vaciar() ?? Promise.resolve(true)).then((ok) => ok && setPestanaBase(x))
  }, [])
  /** Elegir otra parte de la lista: primero se guarda lo escrito en la actual. */
  const elegirParte = useCallback(async (clave: string) => {
    if ((await vaciado.current?.vaciar()) === false) return
    setSel(clave)
  }, [setSel])
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error' | 'info'; texto: string } | null>(null)
  const [actividad, setActividad] = useState<Actividad[]>([])
  const [versiones, setVersiones] = useState<Version[] | null>(null)
  // «Ver cambios» de una versión contra la anterior (2026-10-05).
  const [comparando, setComparando] = useState<[Version, Version] | null>(null)
  const [generando, setGenerando] = useState(false)
  const [avisosTL, setAvisosTL] = useState<string[]>([])
  // Panel derecho: la vista previa de ESTA persona o el último PDF generado.
  const [visor, setVisor] = useState<{ ruta: string; version: number; titulo: string }>({ ruta: '', version: 0, titulo: '' })
  const [previsualizando, setPrevisualizando] = useState(false)
  // Pestaña del visor: la vista previa de esta persona, el último generado o el firmado.
  const [modo, setModo] = useState<'vista' | 'generado' | 'firmado'>('vista')
  // Desde un aviso: «?ir=parte:fundamentos», «?ir=tarea:12»… lleva directo al trabajo.
  const [buscar, setBuscar] = useSearchParams()
  const [resaltar, setResaltar] = useState('')
  // Si el servidor de edición simultánea falla al abrir, esta pestaña trabaja
  // por turnos (con candado) hasta que se pida reintentar.
  const [sinColab, setSinColab] = useState('')
  const avisar = useCallback((tipo: 'success' | 'error' | 'info', texto: string) => setAviso({ tipo, texto }), [])
  // Lo escrito sin guardar en el editor por turnos: se vacía antes de pasar a
  // otra parte o pestaña, y se manda al salir (ver EditorParte).
  const vaciado = useRef<Vaciado | null>(null)
  const registrarVaciado = useCallback((v: Vaciado | null) => { vaciado.current = v }, [])
  const vaciar = useCallback(async () => (await vaciado.current?.vaciar()) ?? true, [])

  // Modalidad al entrar (2026-10-19): formulario o Formato Word según la preferencia de la cuenta
  // (`?modalidad=` y `?ir=` mandan); sin preferencia, se pregunta. En Word se redirige.
  const [modalidad, setModalidad] = useState<Modalidad | null>(() => {
    const pr = preferenciasInmediatas()
    return pr ? modalidadAlAbrir(pr.modalidad_proyectos, new URLSearchParams(window.location.search)) : null
  })
  useEffect(() => {
    if (modalidad !== null) return
    void leerPreferencias().then((pr) => setModalidad(modalidadAlAbrir(pr.modalidad_proyectos, new URLSearchParams(window.location.search))))
  }, [modalidad])
  useEffect(() => {
    if (modalidad === 'word') navegar(`/proyectos/${pid}/word`, { replace: true })
  }, [modalidad, pid, navegar])
  const elegirModalidad = (m: 'formulario' | 'word', recordar: boolean) => {
    if (recordar) void guardarPreferencia('modalidad_proyectos', m)
    setModalidad(m)
  }
  const cargar = useCallback(() => {
    api<ProyectoDatos>(`/api/proyectos/${pid}`)
      .then((d) => {
        setP(d)
        setSel((s) => s || d.secciones[0]?.clave || '')
      })
      .catch(() => setP(null))
    api<Actividad[]>(`/api/proyectos/${pid}/actividad`).then(setActividad).catch(() => {})
  }, [pid])
  useEffect(() => {
    cargar()
    const t = window.setInterval(() => !document.hidden && cargar(), 15_000)
    return () => window.clearInterval(t)
  }, [cargar])

  const compartido = Boolean(p?.colaboracion) && !sinColab
  // Al encender el modo compartido no queda nadie «escribiendo» por turnos (la
  // API suelta los candados al cambiar el interruptor).
  useEffect(() => {
    if (compartido) setEscribiendo('')
  }, [compartido])
  // Sin aviso flotante (2026-10-06): duplicaba la alerta fija sobre el
  // editor, que dice lo mismo y trae «Reintentar».
  const alFallarColab = useCallback((motivo: string) => {
    setSinColab(motivo)
  }, [])
  // Volver sola al modo compartido cuando el servidor regrese: se reintenta
  // cada minuto, nunca mientras esta pestaña escribe por turnos (tiene la parte).
  useEffect(() => {
    if (!sinColab || escribiendo) return
    const t = window.setTimeout(() => setSinColab(''), 60_000)
    return () => window.clearTimeout(t)
  }, [sinColab, escribiendo])

  // Presencia: esta pestaña está en el proyecto y, si escribe, en su parte.
  const lugar = useMemo(() => ({ proyecto_id: pid, seccion: escribiendo || sel }), [pid, escribiendo, sel])
  const equipo = usePresencia(undefined, lugar)
  const aqui = (clave: string) => equipo.filter((x: Persona) => !x.yo && x.estado !== 'desconectado' && x.proyecto_id === pid && x.seccion === clave)

  // Candado: tomar la parte y mantenerlo vivo mientras se escribe.
  useEffect(() => {
    if (!escribiendo) return
    const t = window.setInterval(() => {
      api(`/api/proyectos/${pid}/secciones/${escribiendo}/tomar`, { method: 'POST' }).catch(() => {})
    }, 30_000)
    // Al cerrar la pestaña: lo pendiente se guarda Y suelta en una llamada
    // (dos sueltas podían llegar en desorden y dejar la parte tomada).
    const soltar = () => {
      if (vaciado.current?.alSalir()) return
      const token = localStorage.getItem('sgdp_token')
      void fetch(`/api/proyectos/${pid}/secciones/${escribiendo}/soltar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true })
    }
    window.addEventListener('beforeunload', soltar)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('beforeunload', soltar)
    }
  }, [escribiendo, pid])
  // Salir del proyecto por la web (Inicio, la flecha, un aviso) tampoco pierde
  // lo escrito ni deja la parte tomada hasta que caduque.
  const escribiendoRef = useRef('')
  escribiendoRef.current = escribiendo
  useEffect(() => () => {
    const enviado = vaciado.current?.alSalir()
    if (!enviado && escribiendoRef.current) {
      const token = localStorage.getItem('sgdp_token')
      void fetch(`/api/proyectos/${pid}/secciones/${escribiendoRef.current}/soltar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true })
    }
  }, [pid])

  const escribir = async (clave: string) => {
    try {
      if (escribiendo && escribiendo !== clave) await terminar(false)
      await api(`/api/proyectos/${pid}/secciones/${clave}/tomar`, { method: 'POST' })
      setEscribiendo(clave)
      setSel(clave)
      cargar()
    } catch (e) {
      avisar('info', e instanceof ErrorApi ? e.message : 'No se pudo abrir la parte.')
    }
  }
  /** `aProposito`: pulsó «Terminar de escribir» (no se vuelve a tomar sola);
   *  al pasar a otra parte se suelta sin esa marca. */
  const terminar = async (aProposito = true) => {
    if (!escribiendo) return
    if (!(await vaciar())) return
    if (aProposito) sinAuto.current.add(escribiendo)
    else sinAuto.current.delete(escribiendo)
    await api(`/api/proyectos/${pid}/secciones/${escribiendo}/soltar`, { method: 'POST' }).catch(() => {})
    setEscribiendo('')
    cargar()
  }

  // ESCRIBIR AL ENTRAR (Edison 2026-10-01: «no debería ser necesario activarlo
  // cada vez»): por turnos, al abrir una parte libre se toma sola. No si es
  // invitado, si otra persona la tiene o si aquí se pulsó «Terminar de
  // escribir» en ella; en compartido no hace falta (todos escriben a la vez).
  const sinAuto = useRef(new Set<string>())
  const intentado = useRef('')
  useEffect(() => {
    if (!p || compartido || esInvitado() || !sel || escribiendo === sel) return
    const parte = p.secciones.find((x) => x.clave === sel)
    if (!parte || sinAuto.current.has(sel) || (parte.editando_por && parte.editando !== yo())) return
    if (intentado.current === sel) return
    intentado.current = sel
    void escribir(sel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, sel, compartido, escribiendo])

  // El título de la ley se guarda como el texto de su parte (sin pasar por
  // el texto compartido: la API lo rehace si el proyecto es compartido).
  const guardarTitulo = async (s: Seccion, titulo: string) => {
    try {
      await api(`/api/proyectos/${pid}/secciones/titulo`, {
        method: 'PUT',
        body: JSON.stringify({ contenido: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: titulo }] }] }, version_base: s.version, nota: 'Título de la ley' }),
      })
      if (compartido) await api(`/api/proyectos/${pid}/secciones/titulo/soltar`, { method: 'POST' }).catch(() => {})
      avisar('success', 'Título guardado.')
      cargar()
      void previsualizar(null)
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo guardar el título.')
    }
  }

  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  // OBSERVAR pide la observación ahí mismo (antes llevaba a «Conversación» sin
  // decir qué escribir ni dónde) y la deja como comentario de la parte.
  const [presentando, setPresentando] = useState(false)
  const [editandoFecha, setEditandoFecha] = useState(false)
  const [observando, setObservando] = useState('')
  const [textoObs, setTextoObs] = useState('')
  const observar = async () => {
    const clave = observando
    try {
      await api(`/api/proyectos/${pid}/secciones/${clave}`, { method: 'PATCH', body: JSON.stringify({ estado: 'observada', observacion: textoObs.trim() }) })
      avisar('success', 'Observación registrada.')
      setObservando('')
      setTextoObs('')
      cargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo registrar la observación.')
    }
  }
  const eliminarProyecto = async () => {
    try {
      await api(`/api/proyectos/${pid}`, { method: 'DELETE' })
      navegar('/proyectos', { replace: true })
    } catch (e) {
      setConfirmarEliminar(false)
      avisar('error', e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  // Partes editables (2026-10-19): «Añadir», ⋮ por parte (renombrar, subir, bajar, quitar) y arrastre.
  const edicionPartes = usePartesProyecto({ pid, partes: p?.secciones ?? [], recargar: () => cargar(), avisar, soloLectura: esInvitado() })
  const [menuParte, setMenuParte] = useState<{ ancla: HTMLElement; s: Seccion } | null>(null)
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const accion = async (ruta: string, cuerpo: object, metodo = 'PATCH', ok?: string) => {
    try {
      await api(`/api/proyectos/${pid}${ruta}`, { method: metodo, body: JSON.stringify(cuerpo) })
      if (ok) avisar('success', ok)
      cargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  // Vista previa (como en los documentos): compila el proyecto tal como va,
  // con la parte que se escribe aunque no esté guardada; no crea versión.
  const compilando = useRef(false)
  const previsualizar = useCallback(async (contenido: object | null, auto = false) => {
    // Un doble clic no lanza dos compilaciones sobre la misma carpeta.
    if (compilando.current) return
    compilando.current = true
    setPrevisualizando(true)
    try {
      const r = await api<{ paginas: number; avisos: string[]; marca: number }>(`/api/proyectos/${pid}/vista-previa`, {
        method: 'POST',
        body: JSON.stringify({ clave: contenido ? escribiendo || (compartido ? sel : '') : '', contenido }),
      })
      setAvisosTL(sinRepetirGuia(r.avisos))
      setVisor({ ruta: `/api/proyectos/${pid}/vista-previa`, version: r.marca, titulo: `${r.paginas} págs.${contenido ? ' · con cambios sin guardar' : ''}` })
      // La que se compone sola al entrar no quita la pestaña que la persona
      // haya elegido mientras tanto (el firmado, el generado).
      if (!auto) {
        setModo('vista')
        setPanel('pdf')
      }
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo armar la vista previa.')
    } finally {
      compilando.current = false
      setPrevisualizando(false)
    }
  }, [pid, escribiendo, compartido, sel, avisar])


  // Al volver de la ficha (autor, lugar, fecha, base legal, adherentes van
  // al PDF) la vista previa se recompone sola: si no, mostraba la de antes.
  const pestanaPrevia = useRef(pestana)
  useEffect(() => {
    if (pestana === 'texto' && pestanaPrevia.current === 'resumen') void previsualizar(null, true)
    pestanaPrevia.current = pestana
  }, [pestana, previsualizar])

  // El PDF es un PRODUCTO de las partes (latex/proyecto_ley.py): cada
  // generación es una versión nueva, nunca reemplaza a la anterior. Se ve a
  // la derecha, dentro del sistema.
  const generar = async () => {
    setGenerando(true)
    try {
      const r = await api<{ id: number; version: number; paginas: number; avisos: string[] }>(`/api/proyectos/${pid}/generar`, { method: 'POST' })
      setAvisosTL(sinRepetirGuia(r.avisos))
      avisar('success', `PDF generado v${r.version} (${r.paginas} págs.).`)
      cargar()
      setModo('generado')
      setPestana('texto')
      setPanel('pdf')
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo generar el PDF.')
    } finally {
      setGenerando(false)
    }
  }

  useEffect(() => {
    const ir = buscar.get('ir')
    if (!p || !ir) return
    const [tipo, valor] = ir.split(':')
    if (tipo === 'parte' && p.secciones.some((x) => x.clave === valor)) {
      setPestana('texto')
      setSel(valor)
    } else if (tipo === 'tarea' || tipo === 'fase') {
      setPestana('fases')
      setResaltar(`${tipo}-${valor}`)
    } else if (tipo === 'conversacion') setPestana('conversacion')
    else if (tipo === 'resumen') setPestana('resumen')
    const resto = new URLSearchParams(buscar)
    resto.delete('ir')
    setBuscar(resto, { replace: true })
  }, [p, buscar, setBuscar])

  // Al entrar, el PDF se ve SIN pulsar nada (como en Gestión Documental): el
  // último generado si sigue al día con el texto; si no, la vista previa, que
  // se compone sola.
  const abierto = useRef(false)
  useEffect(() => {
    if (!p || abierto.current) return
    abierto.current = true
    if (p.pdf?.generado?.al_dia) setModo('generado')
    else void previsualizar(null, true)
  }, [p, previsualizar])

  const subirFirmadoPl = async (f: File | null) => {
    if (!f) return
    const fd = new FormData()
    fd.append('archivo', f)
    try {
      const r = await subirFirmado<{ version: number; sha256: string }>(`/api/proyectos/${pid}/firmado`, fd)
      if (!r) return
      avisar('success', `Firmado v${r.version} guardado.`)
      cargar()
      setModo('firmado')
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo subir el firmado.')
    }
  }

  // Sala de presencia del proyecto: etiquetas con el nombre de quien escribe en
  // cada tarjeta de la ficha y en cada parte (Presencia.tsx). ANTES de cualquier
  // return: un gancho después de «if (!p) return» deja la página en blanco.
  const sala = useSala(pid ? `sala:pl:${pid}` : null)
  const abrirWord = useRef<(() => void) | null>(null)
  if (modalidad === null || modalidad === 'word' || !p) return <LinearProgress />
  const s = p.secciones.find((x) => x.clave === sel) ?? p.secciones[0]
  const usuarios = equipo.map((x) => ({ id: x.id, nombre: x.nombre }))
  const selectorPersona = (valor: number | null, alCambiar: (v: number) => void, etiqueta = 'Responsable', ancho = 190) => (
    <TextField select size="small" label={etiqueta} value={valor ?? ''} onChange={(e) => alCambiar(Number(e.target.value))} sx={{ minWidth: ancho }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
      <MenuItem value=""><em>sin asignar</em></MenuItem>
      {usuarios.map((u) => <MenuItem key={u.id} value={u.id}>{u.nombre}</MenuItem>)}
    </TextField>
  )
  const a = p.avance
  const comentariosAbiertos = actividad.filter((x) => x.tipo === 'comentario' && !x.resuelto).length
  const generado = p.pdf?.generado ?? null
  const firmado = p.pdf?.firmado ?? null
  const rutaVisor =
    modo === 'generado' && generado ? `/api/proyectos/${pid}/archivos/${generado.id}`
      : modo === 'firmado' && firmado ? `/api/proyectos/${pid}/archivos/${firmado.id}`
        : modo === 'vista' ? visor.ruta : ''
  const versionVisor = modo === 'generado' ? generado?.id ?? 0 : modo === 'firmado' ? firmado?.id ?? 0 : visor.version
  // Todos los archivos del proyecto en la lista del visor completo (como Outlook, 2026-10-08).
  const archivosVisor: ArchivoVisor[] = p.archivos
    .filter((x) => /\.(pdf|png|jpe?g|webp)$/i.test(x.nombre))
    .map((x) => {
      const r = `/api/proyectos/${pid}/archivos/${x.id}`
      return {
        clave: String(x.id),
        nombre: x.nombre,
        grupo: x.categoria === 'firmado' ? 'Firmado' : x.categoria === 'generado' ? 'Generado' : x.etiqueta || 'Archivos',
        detalle: [x.subido_por, x.subido_en ? new Date(x.subido_en).toLocaleDateString('es-PE') : ''].filter(Boolean).join(' · '),
        obtener: () => apiPdf(r),
        descargar: () => void descargarArchivo(r, x.nombre),
      }
    })
  // ¿El siguiente paso es firmar? Entonces el visor no repite «subir firmado».
  const pasoFirmar = pasoActual(p) === PASO_FIRMAR
  // Las pestañas del proyecto van en la franja contextual de la barra superior.
  const pestanas: [typeof pestana, string, React.ReactNode, number?][] = [
    ['texto', 'Texto', <ArticleOutlinedIcon sx={{ fontSize: 18 }} />],
    ['resumen', 'Ficha y equipo', <InfoOutlinedIcon sx={{ fontSize: 18 }} />],
    ['fases', 'Fases y tareas', <ChecklistIcon sx={{ fontSize: 18 }} />, a.tareas_abiertas],
    ['fuentes', 'Fuentes y archivos', <FolderOpenOutlinedIcon sx={{ fontSize: 18 }} />, p.fuentes.length + p.archivos.length],
    ['conversacion', 'Conversación', <ForumOutlinedIcon sx={{ fontSize: 18 }} />, comentariosAbiertos],
  ]
  const opciones: OpcionPagina[] = pestanas.map(([clave, etiqueta, icono, contador]) => ({
    clave, etiqueta, icono, contador, activa: pestana === clave, alPulsar: () => setPestana(clave),
  }))
  const manejosPaso: ManejosPaso = {
    alIrParte: (c) => { setPestana('texto'); void elegirParte(c) },
    alSubirFirmado: (f) => void subirFirmadoPl(f),
    alPresentar: () => setPresentando(true),
    alVerTramite: () => setPestana('fases'),
  }
  // En modo compacto, cada columna del Texto se muestra solo en su panel.
  const enPanel = (x: typeof panel) => (compacta && panel !== x ? { display: 'none' } : {})

  return (
    <ProveedorSala sala={sala}>
    <Marco
      modulo="proyectos"
      titulo={`${p.codigo} · ${p.titulo}`}
      volver="/proyectos"
      sinBarraInferior
      fondo={PALETA.fondo}
      equipo={<EquipoEnLinea equipoExterno={equipo} />}
      opciones={opciones}
    >

      {/* Cabecera: estado y avance a la izquierda; la acción principal a la derecha. */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', px: { xs: 2, md: 3 } }}>
        {compacta ? (
          // Celular y tableta (revisión 9.7): una fila con el avance y la acción del
          // paso; lo demás en el menú ⋮.
          <CabeceraCompacta
            p={p}
            manejos={manejosPaso}
            generando={generando}
            alGenerar={() => void generar()}
            alColaborar={(v) => void accion('', { colaboracion: v }, 'PATCH', v ? 'Edición simultánea encendida.' : 'Edición simultánea apagada.')}
            alCargarWord={() => abrirWord.current?.()}
            alEliminar={() => setConfirmarEliminar(true)}
          />
        ) : (<>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap', py: 1.25 }}>
          <Chip size="small" color="primary" label={ETIQUETA_ESTADO_PROYECTO[p.estado] ?? p.estado} />
          {p.numero_oficial && <Typography variant="body2" sx={{ fontWeight: 600 }}>Proyecto de Ley N.º {p.numero_oficial}</Typography>}
          <Avance etiqueta="Partes aprobadas" hechas={a.partes_aprobadas} total={a.partes_total} />
          <Avance etiqueta="Fases" hechas={a.fases_hechas} total={a.fases_total} />
          {/* 2026-10-06: sin «N tareas abiertas»; duplicaba el contador de la pestaña «Fases y tareas». */}
          <Box sx={{ flex: 1 }} />
          {/* Edición simultánea: a la vista, y diciendo su estado con palabras. */}
          <Tooltip title={p.colaboracion
            ? 'Escriben varias personas a la vez. Guarde versión antes de apagar.'
            : 'Una persona por parte. Enciéndala para escribir a la vez.'}>
            <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.25, pl: 0.5, pr: 1.25, borderRadius: 5, border: '1px solid', cursor: esInvitado() ? 'default' : 'pointer',
              borderColor: p.colaboracion ? 'success.main' : 'divider', bgcolor: p.colaboracion ? `${PALETA.exito}1A` : 'transparent' }}>
              <Switch size="small" color="success" checked={p.colaboracion} disabled={esInvitado()} onChange={(_, v) => void accion('', { colaboracion: v }, 'PATCH', v ? 'Edición simultánea encendida.' : 'Edición simultánea apagada.')} />
              <Typography sx={{ fontSize: 13 }}>
                Edición simultánea:{' '}
                <Box component="b" sx={{ color: p.colaboracion ? 'success.main' : 'text.secondary' }}>{p.colaboracion ? 'Encendida' : 'Apagada'}</Box>
              </Typography>
            </Box>
          </Tooltip>
          {/* 2026-10-06: sin chip «Firmado / Firmado desactualizado»; duplicaba el ⚠ del visor y el paso 5. */}
          {p.puede_eliminar && (
            <Tooltip title={p.estado === 'idea' || p.estado === 'en_elaboracion' ? 'Eliminar proyecto (se conservan versiones y archivos)' : 'Eliminar este proyecto (solo el administrador, fuera de borrador)'}>
              <IconButton size="small" color="error" onClick={() => setConfirmarEliminar(true)} aria-label="Eliminar proyecto"><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          <BotonOpenProject clave={`sgdp:pl:${pid}`} compacto />
          <CargarWord pid={pid} deshabilitado={esInvitado()} alTerminar={() => { setAvisosTL([]); cargar() }} alAvisar={avisar} />
          <Tooltip title="Genera una versión nueva del PDF.">
            <span>
              <Button size="small" variant="contained" startIcon={<PictureAsPdfIcon />} onClick={() => void generar()} disabled={generando}>
                {generando ? 'Generando…' : 'Generar PDF'}
              </Button>
            </span>
          </Tooltip>
        </Box>
        <SiguientePaso p={p} {...manejosPaso} />
        </>)}
        {/* En el celular «Cargar desde Word» no tiene botón: lo abre el menú ⋮. */}
        {compacta && <CargarWord pid={pid} abrirRef={abrirWord} alTerminar={() => { setAvisosTL([]); cargar() }} alAvisar={avisar} />}
        {avisosTL.length > 0 && (
          <Alert severity="info" onClose={() => setAvisosTL([])} sx={{ mb: 1.25, py: 0 }}>
            <b>Técnica legislativa:</b> {avisosTL.join(' · ')}
          </Alert>
        )}
      </Box>

      <Box sx={{ flex: 1, p: { xs: 1.25, md: 2.5 }, maxWidth: pestana === 'texto' ? 'none' : 1320, width: '100%', mx: 'auto' }}>
        {/* ------------------------------ TEXTO ------------------------------ */}
        {/* Partes | editor | PDF. En pantallas angostas el PDF baja debajo. */}
        {pestana === 'texto' && s && (
          <>
          {compacta && (
            <Box sx={{ position: 'sticky', top: 0, zIndex: 5, mx: -1.25, mt: -1.25, mb: 1.25, px: 1.25, py: 0.75, bgcolor: PALETA.fondo, borderBottom: '1px solid', borderColor: 'divider' }}>
              <ToggleButtonGroup fullWidth size="small" exclusive value={panel} onChange={(_, v) => v && setPanel(v)} sx={{ bgcolor: 'background.paper', '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 13.5, py: 0.6, gap: 0.5 } }}>
                <ToggleButton value="partes">Partes</ToggleButton>
                <ToggleButton value="redactar" sx={{ minWidth: 0 }}><Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.titulo}</Box></ToggleButton>
                <ToggleButton value="pdf">PDF</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}
          {/* --alto-fijo: lo que ocupa el conmutador pegado arriba; la barra de
              formato se pega justo debajo de él en vez de taparlo. */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '250px minmax(0, 1.1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start', '--alto-fijo': compacta ? '48px' : '0px' }}>
            {/* Columna 1: las partes del proyecto */}
            <Tarjeta sx={{ position: { lg: 'sticky' }, top: { lg: 12 }, height: { lg: ALTO_COLUMNA }, display: 'flex', flexDirection: 'column', ...enPanel('partes') }} sinRelleno>
              <Box sx={{ px: 1.75, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Partes del proyecto</Typography>
                {!esInvitado() && (
                  <Tooltip title="Añadir una parte nueva o restaurar una de la plantilla">
                    <IconButton size="small" aria-label="Añadir parte" onClick={(e) => edicionPartes.abrirAnadir(e.currentTarget)}><AddIcon fontSize="small" /></IconButton>
                  </Tooltip>
                )}
                {/* La segunda modalidad (2026-10-19): todas las partes de corrido, como en Word. */}
                <Button size="small" variant="outlined" onClick={() => navegar(`/proyectos/${p.id}/word`)} sx={{ whiteSpace: 'nowrap', py: 0.25 }}>Formato Word</Button>
                {/* 2026-10-06: sin «x de y obligatorias aprobadas»; duplicaba el avance de la cabecera. */}
              </Box>
              <Box sx={{ overflowY: 'auto', px: 0.75, pb: 1, flex: 1 }}>
                {Object.entries(p.grupos).map(([g, nombreGrupo]) => (
                  <Box key={g} sx={{ mt: 1 }}>
                    <Typography sx={{ px: 1, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'text.secondary', textTransform: 'uppercase' }}>{nombreGrupo}</Typography>
                    {p.secciones.filter((x) => x.grupo === g).map((x) => {
                      const otros = aqui(x.clave)
                      const vacia = !x.palabras
                      const movible = !esInvitado() && !x.fija && x.clave !== 'titulo' && !compacta
                      return (
                        <Box key={x.clave} onClick={() => void elegirParte(x.clave)} role="button" aria-current={x.clave === sel}
                          draggable={movible}
                          onDragStart={movible ? (e) => { setArrastrando(x.clave); e.dataTransfer.setData('text/plain', x.clave); e.dataTransfer.effectAllowed = 'move' } : undefined}
                          onDragEnd={movible ? () => { setArrastrando(null); setSobre(null) } : undefined}
                          onDragOver={(e) => { if (arrastrando && arrastrando !== x.clave) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (sobre !== x.clave) setSobre(x.clave) } }}
                          onDragLeave={() => { if (sobre === x.clave) setSobre(null) }}
                          onDrop={(e) => { e.preventDefault(); const de = arrastrando ?? e.dataTransfer.getData('text/plain'); setArrastrando(null); setSobre(null); if (de && de !== x.clave) edicionPartes.mover(de, x.clave) }}
                          sx={{ px: 1, py: 0.6, mt: 0.25, borderRadius: 1.5, cursor: movible ? 'grab' : 'pointer', bgcolor: x.clave === sel ? PALETA.veloMedio : 'transparent', '&:hover': { bgcolor: x.clave === sel ? PALETA.veloFuerte : 'action.hover' }, opacity: arrastrando === x.clave ? 0.4 : 1, boxShadow: sobre === x.clave ? `inset 0 2px 0 ${PALETA.primario}` : 'none', '&:hover .opciones-parte': { opacity: 1 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Tooltip title={ETIQUETA_SECCION[x.estado]?.t ?? x.estado}>
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: COLOR_SECCION[x.estado] ?? 'text.disabled', opacity: vacia && !x.obligatoria ? 0.35 : 1 }} />
                            </Tooltip>
                            <Typography sx={{ fontSize: 13.5, flex: 1, lineHeight: 1.3, fontWeight: x.clave === sel ? 650 : 400, color: vacia && !x.obligatoria ? 'text.disabled' : 'text.primary' }}>{x.titulo}</Typography>
                            {x.sin_versionar && (
                              <Tooltip title={`Texto escrito en compartido que aún no es versión${x.borrador_por ? ` (último: ${x.borrador_por}, ${fecha(x.borrador_en)})` : ''}`}>
                                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />
                              </Tooltip>
                            )}
                            {x.editando && (x.editando === yo() ? (
                              <Tooltip title="Usted está escribiendo aquí"><EditIcon sx={{ fontSize: 14, color: 'primary.main' }} /></Tooltip>
                            ) : (
                              <Tooltip title={`${x.editando} está escribiendo aquí`}><LockIcon sx={{ fontSize: 14, color: 'warning.main' }} /></Tooltip>
                            ))}
                            {otros.slice(0, 2).map((o) => (
                              <Tooltip key={o.id} title={`${o.nombre} está en esta parte`}>
                                <Avatar sx={{ width: 18, height: 18, fontSize: 9, bgcolor: PALETA.superficieMedia, color: 'primary.main' }}>{iniciales(o.nombre)}</Avatar>
                              </Tooltip>
                            ))}
                            {!esInvitado() && (
                              <IconButton size="small" className="opciones-parte" aria-label={`Opciones de ${x.titulo}`} onClick={(e) => { e.stopPropagation(); setMenuParte({ ancla: e.currentTarget, s: x }) }} sx={{ p: 0.25, mr: -0.5, opacity: { xs: 1, lg: x.clave === sel ? 1 : 0 } }}>
                                <MoreVertIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            )}
                          </Box>
                          <Typography sx={{ pl: 2, fontSize: 11.5, color: 'text.secondary' }} noWrap>
                            {x.palabras ? `${x.palabras} palabras` : x.obligatoria ? 'por escribir' : 'opcional'}{x.responsable ? ` · ${x.responsable.split(' ')[0]}` : ''}
                          </Typography>
                        </Box>
                      )
                    })}
                  </Box>
                ))}
              </Box>
              {menuParte && <MenuAnidado ancla={menuParte.ancla} items={edicionPartes.menuDe(menuParte.s)} alCerrar={() => setMenuParte(null)} />}
              {edicionPartes.elementos}
            </Tarjeta>

            {/* Columna 2: la parte elegida */}
            <Tarjeta sx={{ minWidth: 0, ...enPanel('redactar'), ...(tresColumnas ? { position: 'sticky', top: 12, height: ALTO_COLUMNA, display: 'flex', flexDirection: 'column' } : {}) }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 650, lineHeight: 1.25 }}>
                    {s.titulo}
                    {s.clave !== 'titulo' && !esInvitado() && (
                      <Tooltip title="Renombrar la parte (así sale en el PDF).">
                        <IconButton size="small" sx={{ ml: 0.5, mt: -0.5 }} onClick={async () => {
                          const nuevo = await pedirTexto('Nombre de la parte (sale así en el PDF):', { inicial: s.titulo, etiqueta: 'Nombre', aceptar: 'Renombrar' })
                          if (nuevo !== null && nuevo.trim() && nuevo.trim() !== s.titulo) void accion(`/secciones/${s.clave}`, { titulo: nuevo }, 'PATCH', 'Parte renombrada.')
                        }}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {ETIQUETA_SECCION[s.estado]?.t ?? s.estado} · v{s.version}
                    {s.actualizado_por ? ` · último cambio de ${s.actualizado_por}, ${fecha(s.actualizado_en)}` : ' · sin cambios todavía'}
                  </Typography>
                </Box>
                <Tooltip title="Versiones de esta parte (restaurar crea una versión nueva)">
                  <IconButton size="small" onClick={() => api<Version[]>(`/api/proyectos/${pid}/secciones/${s.clave}/versiones`).then(setVersiones)} aria-label="Versiones"><HistoryIcon fontSize="small" /></IconButton>
                </Tooltip>
                {compartido || (s.clave === 'titulo' && escribiendo === s.clave) ? null : escribiendo === s.clave ? (
                  <Button size="small" variant="outlined" onClick={() => void terminar(true)}>Terminar de escribir</Button>
                ) : (
                  <Button size="small" variant="contained" startIcon={<EditIcon />} onClick={() => void escribir(s.clave)} disabled={Boolean(s.editando_por && s.editando !== yo())}>Escribir</Button>
                )}
              </Box>
              {p.colaboracion && sinColab && (
                <Alert severity="warning" sx={{ mb: 1, py: 0 }} action={<Button color="inherit" size="small" onClick={() => setSinColab('')} disabled={Boolean(escribiendo)}>Reintentar</Button>}>
                  Edición simultánea no disponible. Se escribe por turnos.
                </Alert>
              )}
              {!compartido && s.editando && s.editando !== yo() && (
                <Alert severity="info" icon={<LockIcon fontSize="small" />} sx={{ mb: 1, py: 0 }}>
                  <b>{s.editando}</b> está escribiendo aquí. Puede trabajar en otra parte.
                </Alert>
              )}
              <Box sx={{ mt: 1, ...(tresColumnas ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}) }}>
                <ConPresencia clave={`parte:${s.clave}`} sx={tresColumnas ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
                {s.clave === 'titulo' ? (
                  // El título de la ley, guiado: forma del Manual + lo que sigue.
                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <EditorTitulo inicial={textoPlano(p.colaboracion && s.borrador ? s.borrador : s.contenido) || p.titulo} editable={!esInvitado() && (compartido || escribiendo === s.clave)} alGuardar={(t) => guardarTitulo(s, t)} />
                  </Box>
                ) : compartido ? (
                  <EditorParteCompartida key={`${s.clave}:${s.generacion}`} pid={pid} s={s} lectura={esInvitado()} alGuardar={cargar} alAvisar={avisar} alPrevisualizar={(c) => void previsualizar(c)} alFallar={alFallarColab} enPanel={tresColumnas} />
                ) : (
                  // Por turnos. En un proyecto compartido sin servidor se parte del
                  // borrador vivo: lo escrito en compartido nunca se pierde.
                  <EditorParte pid={pid} s={p.colaboracion && s.borrador ? { ...s, contenido: s.borrador } : s} editable={escribiendo === s.clave} alGuardar={cargar} alAvisar={avisar} alPrevisualizar={(c, auto) => void previsualizar(c, auto)} enPanel={tresColumnas} separador={p.datos?.separador_articulo || '.-'} registrar={registrarVaciado} />
                )}
                </ConPresencia>
              </Box>
              {/* Pie de la parte: quién la redacta y su revisión. */}
              <Box sx={{ display: 'flex', gap: 1, mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap', alignItems: 'center' }}>
                {selectorPersona(s.responsable_id, (v) => void accion(`/secciones/${s.clave}`, { responsable_id: v }, 'PATCH', 'Responsable asignado.'), 'Responsable de esta parte', 210)}
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Revisión:</Typography>
                {/* Una parte vacía no se revisa ni se aprueba; antes de cada
                    paso se guarda lo escrito, para que se apruebe lo que se ve. */}
                {!s.palabras ? (
                  <Typography variant="caption" color="text.disabled">se revisa cuando tenga texto</Typography>
                ) : (
                  <>
                    {s.estado !== 'en_revision' && s.estado !== 'aprobada' && <Button size="small" onClick={() => void vaciar().then((ok) => { if (ok) void accion(`/secciones/${s.clave}`, { estado: 'en_revision' }, 'PATCH', `«${s.titulo}» enviada a revisión.`) })}>Enviar a revisión</Button>}
                    {s.estado !== 'observada' && <Button size="small" color="warning" onClick={() => void vaciar().then((ok) => { if (ok) setObservando(s.clave) })}>Observar</Button>}
                    {s.estado !== 'aprobada' && (
                      <Tooltip title={`Aprueba la v${s.version}. Si cambia, vuelve a revisión.`}>
                        <Button size="small" variant="outlined" onClick={() => void vaciar().then((ok) => { if (ok) void accion(`/secciones/${s.clave}`, { estado: 'aprobada' }, 'PATCH', `«${s.titulo}» aprobada.`) })}>Aprobar</Button>
                      </Tooltip>
                    )}
                  </>
                )}
              </Box>
            </Tarjeta>

            {/* Columna 3: el PDF, abierto al entrar */}
            <Tarjeta sinRelleno sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: 12 }, ...enPanel('pdf'), ...(tresColumnas ? { height: ALTO_COLUMNA, display: 'flex', flexDirection: 'column' } : {}) }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
                <ToggleButtonGroup size="small" exclusive value={modo} onChange={(_, v) => v && setModo(v)} sx={{ '& .MuiToggleButton-root': { textTransform: 'none', py: 0.25, px: 1.25, fontSize: 12.5 } }}>
                  <ToggleButton value="vista">Vista previa</ToggleButton>
                  <ToggleButton value="generado" disabled={!generado}>{generado ? generado.etiqueta.replace('PDF generado ', 'Generado ') : 'Generado'}</ToggleButton>
                  <ToggleButton value="firmado" disabled={!firmado}>{firmado ? <>Firmado {firmado.al_dia ? '✓' : '⚠'}</> : 'Firmado'}</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ flex: 1 }} />
                {modo === 'vista' && (
                  <Tooltip title="Volver a componer con lo último que hay escrito">
                    <span><IconButton size="small" onClick={() => void previsualizar(null)} disabled={previsualizando} aria-label="Actualizar vista previa"><RefreshIcon fontSize="small" /></IconButton></span>
                  </Tooltip>
                )}
                {/* 2026-10-06: oculto mientras el siguiente paso es firmar; duplicaba su botón «Subir firmado». */}
                {!pasoFirmar && (
                  <Tooltip title="Subir el PDF firmado (nueva versión).">
                    <Button component="label" size="small" startIcon={<UploadFileIcon />} disabled={esInvitado()}>
                      Firmado
                      <input hidden type="file" accept="application/pdf,.pdf" onChange={(e) => { void subirFirmadoPl(e.target.files?.[0] ?? null); e.target.value = '' }} />
                    </Button>
                  </Tooltip>
                )}
              </Box>
              {/* ¿Qué fecha lleva? A la vista y cambiable aquí mismo (antes solo
                  se adivinaba en la ficha, como «fecha de presentación»). */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, pt: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  {modo === 'vista' && visor.titulo ? `Vista previa · ${visor.titulo} · ` : ''}
                  Lugar y fecha: <b>{p.datos?.lugar || 'Lima'}, {fechaLarga(p.fecha_presentacion)}</b> ({p.fecha_presentacion ? 'fija' : 'automática, la del día'})
                </Typography>
                {!esInvitado() && <Button size="small" sx={{ minWidth: 0, py: 0, fontSize: 12 }} onClick={() => setEditandoFecha(true)}>Cambiar</Button>}
              </Box>
              {/* 2026-10-06: sin alerta «el texto cambió después de esta firma»; duplicaba el ⚠ del visor y el paso 5. */}
              <Box sx={{ p: 1, ...(tresColumnas ? { flex: 1, minHeight: 0 } : {}) }}>
                <VisorPdf
                  ruta={rutaVisor}
                  version={versionVisor}
                  cargando={modo === 'vista' && previsualizando}
                  alto={compacta ? 'calc(100dvh - 200px)' : tresColumnas ? '100%' : 'calc(100vh - 215px)'}
                  nombre={`${p.codigo}.pdf`}
                  archivos={archivosVisor}
                  claveInicial={modo === 'generado' && generado ? String(generado.id) : modo === 'firmado' && firmado ? String(firmado.id) : ''}
                  vacio={
                    <Box sx={{ textAlign: 'center' }}>
                      {/* 2026-10-06: sin botón «Vista previa»; la vista previa se compone sola al entrar (y está el ↻ de la barra). */}
                      <Typography variant="body2" color="text.secondary">{previsualizando ? 'Preparando el PDF…' : 'Aquí se verá el PDF.'}</Typography>
                    </Box>
                  }
                />
              </Box>
            </Tarjeta>
          </Box>
          </>
        )}

        {pestana === 'resumen' && <Resumen p={p} accion={accion} selectorPersona={selectorPersona} usuarios={usuarios} />}

        {pestana === 'fases' && <Fases p={p} accion={accion} selectorPersona={selectorPersona} resaltar={resaltar} />}
        {pestana === 'fuentes' && <Fuentes p={p} accion={accion} recargar={cargar} avisar={avisar} />}
        {pestana === 'conversacion' && <Conversacion p={p} actividad={actividad} accion={accion} />}
      </Box>

      <Dialog open={versiones !== null} onClose={() => setVersiones(null)} fullWidth maxWidth="md">
        <DialogTitle>Versiones de «{s?.titulo}»</DialogTitle>
        <DialogContent dividers>
          {(versiones ?? []).length === 0 && <Typography color="text.secondary">Todavía no hay versiones guardadas.</Typography>}
          {(versiones ?? []).map((v, i, todas) => (
            <Box key={v.version} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: `1px solid ${PALETA.borde}` }}>
              <Chip size="small" label={`v${v.version}`} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2">{v.nota || 'Sin nota'}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {v.usuario} · {fecha(v.creado_en)} · {v.palabras} palabras
                  {v.basada_en ? ` · basada en v${v.basada_en}` : ''}
                  {v.estado ? ` · ${ETIQUETA_SECCION[v.estado]?.t.toLowerCase() ?? v.estado}` : ''}
                </Typography>
              </Box>
              {todas[i + 1] && (
                <Button size="small" startIcon={<CompareArrowsIcon />} onClick={() => setComparando([todas[i + 1], v])}>
                  Ver cambios
                </Button>
              )}
              {s && v.version !== s.version && (
                <Button size="small" onClick={async () => {
                  if (p.colaboracion && !(await confirmar(`¿Restaurar v${v.version}? Reemplaza el texto para todos${s.sin_versionar ? ' y descarta lo que aún no es versión' : ''}.`, { aceptar: 'Restaurar' }))) return
                  void accion(`/secciones/${s.clave}/versiones/${v.version}/restaurar`, {}, 'POST', `Restaurada la v${v.version} como versión nueva.`); setVersiones(null)
                }}>
                  Restaurar
                </Button>
              )}
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setVersiones(null)}>Cerrar</Button></DialogActions>
      </Dialog>
      <ComparadorVersiones
        abierto={comparando !== null}
        alCerrar={() => setComparando(null)}
        antes={comparando && { etiqueta: `v${comparando[0].version}${comparando[0].usuario ? ` · ${comparando[0].usuario}` : ''}, ${fecha(comparando[0].creado_en)}`, cuerpo: comparando[0].contenido }}
        despues={comparando && { etiqueta: `v${comparando[1].version}${comparando[1].usuario ? ` · ${comparando[1].usuario}` : ''}, ${fecha(comparando[1].creado_en)}`, cuerpo: comparando[1].contenido }}
      />

      <DialogoLugarFecha p={p} abierto={editandoFecha} alCerrar={() => setEditandoFecha(false)} accion={accion} alGuardar={() => void previsualizar(null, true)} />
      <DialogoPresentacion p={p} abierto={presentando} alCerrar={() => setPresentando(false)} accion={accion} />

      <Dialog open={Boolean(observando)} onClose={() => setObservando('')} maxWidth="sm" fullWidth>
        <DialogTitle>Observar «{p.secciones.find((x) => x.clave === observando)?.titulo}»</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Escriba qué corregir; se avisará a quien la redacta.
          </Typography>
          <TextField autoFocus multiline minRows={3} fullWidth placeholder="Por ejemplo: el artículo 2 repite el objeto; precisar la finalidad." value={textoObs} onChange={(e) => setTextoObs(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setObservando('')}>Cancelar</Button>
          <Button variant="contained" disabled={textoObs.trim().length < 3} onClick={() => void observar()}>Registrar observación</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmarEliminar} onClose={() => setConfirmarEliminar(false)} maxWidth="xs" fullWidth>
        <DialogTitle>¿Eliminar {p.codigo}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Dejará de verse. Se conserva todo; el administrador puede recuperarlo.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmarEliminar(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => void eliminarProyecto()}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      <ElegirModalidad abierto={modalidad === ''} modulo="proyectos" alElegir={elegirModalidad} />

      <Snackbar open={aviso !== null} autoHideDuration={4500} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={aviso?.tipo ?? 'success'} onClose={() => setAviso(null)}>{aviso?.texto}</Alert>
      </Snackbar>
    </Marco>
    </ProveedorSala>
  )
}

// --- Piezas visuales comunes ----------------------------------------------------

/** Tarjeta: superficie blanca con borde suave; agrupa lo que va junto. */
function Tarjeta({ titulo, accion, children, sx, sinRelleno }: { titulo?: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode; sx?: object; sinRelleno?: boolean }) {
  const contenido = (
    <Paper variant="outlined" sx={{ borderRadius: 2, borderColor: PALETA.borde, p: sinRelleno ? 0 : 2, ...sx }}>
      {titulo && (
        // Con `wrap` y `1 1 auto`, la acción baja a otra línea en el celular en vez de apretar el título.
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14.5, flex: '1 1 auto', minWidth: 0 }}>{titulo}</Typography>
          {accion}
        </Box>
      )}
      {children}
    </Paper>
  )
  // Quién más escribe en esta tarjeta (2026-10-05): la clave es su título.
  return typeof titulo === 'string' ? <ConPresencia clave={`ficha:${titulo}`}>{contenido}</ConPresencia> : contenido
}

/** «Partes aprobadas 6/12» con una barrita de avance. */
function Avance({ etiqueta, hechas, total }: { etiqueta: string; hechas: number; total: number }) {
  return (
    <Tooltip title={`${etiqueta}: ${hechas} de ${total}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography variant="caption" color="text.secondary">{etiqueta}</Typography>
        <LinearProgress variant="determinate" value={total ? (100 * hechas) / total : 0} sx={{ width: 56, height: 5, borderRadius: 3 }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>{hechas}/{total}</Typography>
      </Box>
    </Tooltip>
  )
}

/** Qué falta en las partes y cuáles de los seis pasos están hechos. Lo usan
 *  SiguientePaso y la barra del visor (2026-10-06: el visor oculta su «subir
 *  firmado» cuando el paso actual ya lo ofrece). */
function revisarPasos(p: ProyectoDatos) {
  const texto = (x: Seccion) => textoPlano(p.colaboracion && x.borrador ? x.borrador : x.contenido)
  const oblig = p.secciones.filter((x) => x.obligatoria)
  const sinEscribir = oblig.filter((x) => !texto(x))
  const conCorchetes = p.secciones.filter((x) => RE_POR_COMPLETAR.test(texto(x)))
  const porAprobar = oblig.filter((x) => texto(x) && x.estado !== 'aprobada')
  const hechos = [
    !sinEscribir.length, !conCorchetes.length, !porAprobar.length,
    Boolean(p.pdf?.generado?.al_dia), Boolean(p.pdf?.firmado?.al_dia), PRESENTADO.includes(p.estado),
  ]
  return { sinEscribir, conCorchetes, porAprobar, hechos }
}
const PASO_FIRMAR = 4
/** Índice del paso que SiguientePaso muestra; -1 si no muestra ninguno. */
function pasoActual(p: ProyectoDatos) {
  if (p.estado === 'archivado' || p.estado === 'retirado' || PRESENTADO.includes(p.estado)) return -1
  return revisarPasos(p).hechos.findIndex((h) => !h)
}

/** SIGUIENTE PASO (revisión de usabilidad 2026-10-01): como en los
 *  documentos, el proyecto dice qué toca ahora y lo deja a un clic, del
 *  primer artículo a la presentación. Todo sale de lo que ya hay (partes,
 *  PDF, firmado, estado): nada se marca a mano para avanzar. */
interface ManejosPaso {
  alIrParte: (clave: string) => void; alSubirFirmado: (f: File | null) => void
  alPresentar: () => void; alVerTramite: () => void
}
type Paso = { t: string; hecho: boolean; detalle: string; accion: React.ReactNode }

/** Los seis pasos con su acción. En el celular (`compacto`) el botón dice solo
 *  el verbo: la línea «Siguiente paso» ya nombra la parte. */
function pasosProyecto(p: ProyectoDatos, { alIrParte, alSubirFirmado, alPresentar }: ManejosPaso, compacto = false): Paso[] {
  const { sinEscribir, conCorchetes, porAprobar, hechos } = revisarPasos(p)
  const generado = p.pdf?.generado ?? null
  const firmado = p.pdf?.firmado ?? null
  const lista = (xs: Seccion[]) => xs.map((x) => `«${x.titulo}»`).join(', ')
  const ir = (x: Seccion, verbo = 'Ir a') => (
    <Button size="small" variant="contained" onClick={() => alIrParte(x.clave)} sx={compacto ? { flexShrink: 0 } : undefined}>
      {compacto ? (verbo === 'Ir a' ? 'Ir a la parte' : verbo) : <>{verbo} «{x.titulo.length > 28 ? `${x.titulo.slice(0, 26)}…` : x.titulo}»</>}
    </Button>
  )
  // Detalles breves, pedido de Edison (2026-10-06).
  return [
    { t: 'Escribir las partes obligatorias', hecho: hechos[0], detalle: `Faltan: ${lista(sinEscribir)}.`, accion: sinEscribir[0] && ir(sinEscribir[0], 'Escribir') },
    { t: 'Completar lo que está [entre corchetes]', hecho: hechos[1], detalle: `Pendiente en: ${lista(conCorchetes)}.`, accion: conCorchetes[0] && ir(conCorchetes[0]) },
    { t: 'Revisar y aprobar las partes obligatorias', hecho: hechos[2], detalle: `Por aprobar: ${lista(porAprobar)}.`, accion: porAprobar[0] && ir(porAprobar[0], 'Revisar') },
    {
      // 2026-10-06: sin botón propio; duplicaba «Generar PDF» de la cabecera.
      t: generado ? 'Volver a generar el PDF' : 'Generar el PDF', hecho: hechos[3],
      detalle: generado ? 'El texto cambió desde el último PDF.' : 'Con «Generar PDF», arriba.',
      accion: null,
    },
    {
      t: firmado ? 'Subir otra vez el firmado' : 'Firmar y subir el firmado', hecho: hechos[PASO_FIRMAR],
      detalle: firmado ? 'El texto cambió tras la firma: firme el PDF nuevo y súbalo.' : 'Firme el PDF (autor y adherentes) y súbalo.',
      accion: (
        <Button component="label" size="small" variant="contained" startIcon={compacto ? undefined : <UploadFileIcon />} disabled={esInvitado()} sx={compacto ? { flexShrink: 0 } : undefined}>
          Subir firmado
          <input hidden type="file" accept="application/pdf,.pdf" onChange={(e) => { alSubirFirmado(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </Button>
      ),
    },
    { t: 'Registrar la presentación', hecho: hechos[5], detalle: 'Anote el número y la fecha del Congreso.', accion: <Button size="small" variant="contained" onClick={alPresentar} disabled={esInvitado()}>{compacto ? 'Registrar' : 'Registrar presentación'}</Button> },
  ]
}

function SiguientePaso({ p, ...manejos }: ManejosPaso & { p: ProyectoDatos }) {
  const { alVerTramite } = manejos
  const pasos = pasosProyecto(p, manejos)
  // Lo de la redacción se recorre en orden; el PDF y la firma solo cuentan
  // como pendientes si lo anterior ya está (no se pide firmar un borrador).
  const i = pasos.findIndex((x) => !x.hecho)
  // Archivado o retirado: ya no hay pasos que pedir.
  if (p.estado === 'archivado' || p.estado === 'retirado') return null
  // Presentado, el resumen manda aunque después se toque el texto.
  if (i === -1 || PRESENTADO.includes(p.estado)) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        {/* 2026-10-06: sin chip «Presentado» ni el número; duplicaban el estado y el N.º de la cabecera. */}
        <Typography variant="body2" sx={{ flex: 1, minWidth: 220 }}>
          Presentado el {fechaLarga(p.fecha_presentacion)}. El trámite sigue en «Fases y tareas».
        </Typography>
        <Button size="small" onClick={alVerTramite}>Ver el trámite</Button>
      </Box>
    )
  }
  const x = pasos[i]
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, flexWrap: 'wrap', py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', gap: 0.5 }} aria-label={`Paso ${i + 1} de ${pasos.length}`}>
        {/* Hechos son los de antes del actual: un paso posterior «cumplido»
            sin texto (no hay [corchetes] porque no hay nada) no se marca. */}
        {pasos.map((y, k) => (
          <Tooltip key={y.t} title={`${k + 1}. ${y.t}${k < i ? ' — hecho' : ''}`}>
            <Box sx={{ width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              // Hecho: pastilla tenue del éxito con la marca del mismo tono; actual: relleno de tinta con su texto de contraste (2026-10-19, nada blanco fijo).
              bgcolor: k < i ? `${PALETA.exito}26` : k === i ? 'primary.main' : 'transparent', color: k < i ? 'success.main' : k === i ? 'primary.contrastText' : 'text.disabled',
              border: '1.5px solid', borderColor: k < i ? 'success.main' : k === i ? 'primary.main' : 'divider' }}>{k < i ? '✓' : k + 1}</Box>
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'primary.main' }}>SIGUIENTE PASO · {i + 1} DE {pasos.length}</Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.35 }}><b>{x.t}.</b> <Box component="span" sx={{ color: 'text.secondary' }}>{x.detalle}</Box></Typography>
      </Box>
      {x.accion}
    </Box>
  )
}

/** Cabecera del proyecto en el celular y la tableta (revisión 9.7, 2026-10-12):
 *  una fila con el avance («3/6 · 2/14») y la acción del paso actual; el paso en
 *  una línea que se expande al tocarla; el resto, en el menú ⋮. */
function CabeceraCompacta({ p, manejos, generando, alGenerar, alColaborar, alCargarWord, alEliminar }: {
  p: ProyectoDatos; manejos: ManejosPaso; generando: boolean
  alGenerar: () => void; alColaborar: (v: boolean) => void; alCargarWord: () => void; alEliminar: () => void
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [abierto, setAbierto] = useState(false)
  const urlOP = useEnlaceOpenProject(`sgdp:pl:${p.id}`)
  const a = p.avance
  const pasos = pasosProyecto(p, manejos, true)
  const cerrado = p.estado === 'archivado' || p.estado === 'retirado'
  const presentado = PRESENTADO.includes(p.estado)
  const i = cerrado || presentado ? -1 : pasos.findIndex((x) => !x.hecho)
  const x = i >= 0 ? pasos[i] : null
  // El paso «Generar el PDF» no trae botón propio en escritorio (está en la
  // cabecera); aquí es la acción principal y sale del menú.
  const botonPdf = (
    <Button size="small" variant="contained" onClick={alGenerar} disabled={generando} sx={{ flexShrink: 0 }}>
      {generando ? 'Generando…' : 'Generar PDF'}
    </Button>
  )
  const principal = presentado ? <Button size="small" onClick={manejos.alVerTramite} sx={{ flexShrink: 0 }}>Ver el trámite</Button>
    : x ? (i === 3 ? botonPdf : x.accion) : null
  const linea = presentado ? <>Presentado el {fechaLarga(p.fecha_presentacion)}.</>
    : x ? <><b>Paso {i + 1}/{pasos.length} · {x.t}.</b> <Box component="span" sx={{ color: 'text.secondary' }}>{x.detalle}</Box></> : null
  const cerrar = (f?: () => void) => () => { setMenu(null); f?.() }
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, minHeight: 44 }}>
        <Tooltip title={`Partes aprobadas ${a.partes_aprobadas} de ${a.partes_total} · Fases ${a.fases_hechas} de ${a.fases_total}`}>
          <Typography variant="body2" aria-label={`Partes aprobadas ${a.partes_aprobadas} de ${a.partes_total}; fases ${a.fases_hechas} de ${a.fases_total}`}
            sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: 'text.secondary' }}>
            {a.partes_aprobadas}/{a.partes_total} · {a.fases_hechas}/{a.fases_total}
          </Typography>
        </Tooltip>
        {cerrado && <Chip size="small" label={ETIQUETA_ESTADO_PROYECTO[p.estado] ?? p.estado} />}
        <Box sx={{ flex: 1 }} />
        {principal}
        <IconButton size="small" aria-label="Más acciones" onClick={(e) => setMenu(e.currentTarget)}><MoreVertIcon /></IconButton>
      </Box>
      {linea && (
        <Typography variant="body2" role="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}
          sx={{ pb: 0.75, lineHeight: 1.35, cursor: 'pointer', ...(abierto ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>
          {linea}
        </Typography>
      )}
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={cerrar()} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ px: 2, pt: 0.5, pb: 1, maxWidth: 280 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {ETIQUETA_ESTADO_PROYECTO[p.estado] ?? p.estado}{p.numero_oficial ? ` · PL N.º ${p.numero_oficial}` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Partes aprobadas {a.partes_aprobadas}/{a.partes_total} · Fases {a.fases_hechas}/{a.fases_total}
          </Typography>
        </Box>
        <Divider />
        <MenuItem disabled={esInvitado()} onClick={() => alColaborar(!p.colaboracion)}>
          <ListItemIcon><Switch size="small" color="success" checked={p.colaboracion} tabIndex={-1} sx={{ ml: -1 }} /></ListItemIcon>
          Edición simultánea: {p.colaboracion ? 'encendida' : 'apagada'}
        </MenuItem>
        {i !== 3 && (
          <MenuItem disabled={generando} onClick={cerrar(alGenerar)}>
            <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>{generando ? 'Generando…' : 'Generar PDF'}
          </MenuItem>
        )}
        <MenuItem disabled={esInvitado()} onClick={cerrar(alCargarWord)}>
          <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>Cargar desde Word
        </MenuItem>
        {urlOP && (
          <MenuItem onClick={cerrar(() => window.open(urlOP, '_blank', 'noopener'))}>
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>Ver en OpenProject
          </MenuItem>
        )}
        {p.puede_eliminar && (
          <MenuItem onClick={cerrar(alEliminar)} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>Eliminar proyecto
          </MenuItem>
        )}
      </Menu>
    </>
  )
}

/** Lugar y fecha que cierran la exposición de motivos en el PDF. Vacía, la
 *  fecha es AUTOMÁTICA (la del día en que se compone); se fija sola al subir
 *  el firmado o al presentar, y aquí se puede fijar o devolver a automática. */
function DialogoLugarFecha({ p, abierto, alCerrar, accion, alGuardar }: { p: ProyectoDatos; abierto: boolean; alCerrar: () => void; accion: Accion; alGuardar: () => void }) {
  const [lugar, setLugar] = useState('')
  const [modo, setModo] = useState<'auto' | 'fija'>('auto')
  const [fecha, setFecha] = useState('')
  useEffect(() => {
    if (!abierto) return
    setLugar(p.datos?.lugar ?? '')
    setModo(p.fecha_presentacion ? 'fija' : 'auto')
    setFecha(p.fecha_presentacion || hoyIso())
  }, [abierto, p.datos?.lugar, p.fecha_presentacion])
  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="xs" fullWidth>
      <DialogTitle>Lugar y fecha del proyecto</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Van al final de la exposición de motivos: «{lugar || 'Lima'}, {modo === 'auto' ? fechaLarga() : fechaLarga(fecha)}».
        </Typography>
        <TextField fullWidth size="small" label="Lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} sx={{ mb: 2 }} />
        <ToggleButtonGroup fullWidth size="small" exclusive value={modo} onChange={(_, v) => v && setModo(v)} sx={{ mb: 1.5, '& .MuiToggleButton-root': { textTransform: 'none' } }}>
          <ToggleButton value="auto">Automática</ToggleButton>
          <ToggleButton value="fija">Fecha fija</ToggleButton>
        </ToggleButtonGroup>
        {modo === 'auto' ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            La del día del PDF; se fija al firmar o presentar.
          </Typography>
        ) : (
          <TextField fullWidth size="small" type="date" label="Fecha" value={fecha} onChange={(e) => setFecha(e.target.value)} InputLabelProps={{ shrink: true }} helperText={fecha ? fechaLarga(fecha) : ' '} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" disabled={!lugar.trim() || (modo === 'fija' && !fecha)} onClick={() => { void accion('', { datos: { lugar: lugar.trim() }, fecha_presentacion: modo === 'auto' ? '' : fecha }, 'PATCH', 'Lugar y fecha guardados; la vista previa se actualiza.').then(alGuardar); alCerrar() }}>Guardar</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Registrar que el proyecto se presentó: número del Congreso y fecha. */
function DialogoPresentacion({ p, abierto, alCerrar, accion }: { p: ProyectoDatos; abierto: boolean; alCerrar: () => void; accion: Accion }) {
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState('')
  useEffect(() => {
    if (!abierto) return
    setNumero(p.numero_oficial)
    setFecha(p.fecha_presentacion || hoyIso())
  }, [abierto, p.numero_oficial, p.fecha_presentacion])
  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="xs" fullWidth>
      <DialogTitle>Registrar la presentación</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Pasa a «Presentado». El número puede anotarse después.
        </Typography>
        <TextField fullWidth size="small" label="N.º del proyecto en el Congreso" placeholder="Por ejemplo: 1234/2026-CD" value={numero} onChange={(e) => setNumero(e.target.value)} sx={{ mb: 2 }} />
        <TextField fullWidth size="small" type="date" label="Fecha de presentación" value={fecha} onChange={(e) => setFecha(e.target.value)} InputLabelProps={{ shrink: true }} helperText={fecha ? `${fechaLarga(fecha)} · sale en el PDF` : ' '} />
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" disabled={!fecha} onClick={() => { void accion('', { estado: 'presentado', numero_oficial: numero.trim(), fecha_presentacion: fecha }, 'PATCH', 'Presentación registrada.'); alCerrar() }}>Registrar</Button>
      </DialogActions>
    </Dialog>
  )
}

// --- Pestañas ----------------------------------------------------------------

type Accion = (ruta: string, cuerpo: object, metodo?: string, ok?: string) => Promise<void>
type Selector = (valor: number | null, alCambiar: (v: number) => void, etiqueta?: string, ancho?: number) => React.ReactNode

interface Catalogos {
  comisiones: string[]; fuente_comisiones: string; grupos: string[]; camaras: string[]; diputados: string[]
  autor: string; cargo: string; lugar: string
}
interface DocListado { id: number; numero_completo: string; tipo_nombre: string; asunto?: string }
const lista = (t?: string) => (t ?? '').split(/\s*[;\n]\s*/).map((x) => x.trim()).filter(Boolean)
// La que pone el PDF si la ficha no trae otra (latex/proyecto_ley.py).
const BASE_LEGAL = 'el artículo 107 de la Constitución Política del Perú y los artículos 98 y 107 del Reglamento de la Cámara de Diputados'

function Resumen({ p, accion, selectorPersona, usuarios }: { p: ProyectoDatos; accion: Accion; selectorPersona: Selector; usuarios: { id: number; nombre: string }[] }) {
  const [cat, setCat] = useState<Catalogos | null>(null)
  const [datos, setDatos] = useState(p.datos)
  const [numero, setNumero] = useState(p.numero_oficial)
  const [fechaP, setFechaP] = useState(p.fecha_presentacion)
  const [nuevoMiembro, setNuevoMiembro] = useState<number | ''>('')
  const [docs, setDocs] = useState<DocListado[]>([])
  const [docElegido, setDocElegido] = useState<DocListado | null>(null)
  const [rolDoc, setRolDoc] = useState('relacionado')
  useEffect(() => {
    api<Catalogos>('/api/proyectos/catalogos').then((c) => {
      setCat(c)
      // Lo que se sabe se llena solo (si está vacío): autor, cámara, lugar.
      setDatos((d) => ({ ...d, autor: d.autor || c.autor, camara: d.camara || c.camaras[0], lugar: d.lugar || c.lugar }))
    }).catch(() => {})
    api<DocListado[]>('/api/documentos').then(setDocs).catch(() => {})
  }, [])
  // Clave por clave: PostgreSQL devuelve el JSONB con otro orden y comparar
  // el texto entero daba «cambiado» para siempre (y guardaba sin parar).
  const mismos = (x: Record<string, string>, y: Record<string, string>) =>
    [...new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])].every((k) => (x?.[k] ?? '') === (y?.[k] ?? ''))
  const cambiado = !mismos(datos, p.datos) || numero !== p.numero_oficial || fechaP !== p.fecha_presentacion
  // La ficha SE GUARDA SOLA (revisión de usabilidad 2026-10-01): con
  // «Guardar ficha» arriba y los campos abajo, cambiar de pestaña perdía lo
  // escrito sin aviso. Tras una pausa breve, y al salir de la pestaña.
  const [guardando, setGuardando] = useState<'' | 'guardando' | 'guardado'>('')
  const pendiente = useRef<object | null>(null)
  pendiente.current = cambiado ? { datos, numero_oficial: numero, fecha_presentacion: fechaP } : null
  // `accion` cambia en cada render de la página: se usa por referencia.
  const accionRef = useRef(accion)
  accionRef.current = accion
  useEffect(() => {
    if (!cambiado) return
    const t = window.setTimeout(() => {
      const cuerpo = pendiente.current
      if (!cuerpo) return
      setGuardando('guardando')
      void accionRef.current('', cuerpo, 'PATCH').then(() => setGuardando('guardado'))
    }, 1200)
    return () => window.clearTimeout(t)
  }, [cambiado, datos, numero, fechaP])
  useEffect(() => () => {
    if (pendiente.current) void accionRef.current('', pendiente.current, 'PATCH')
  }, [])
  const poner = (k: string, v: string) => setDatos((d) => ({ ...d, [k]: v }))
  const campo = (k: string, etiqueta: string, multiline = false) => (
    <TextField key={k} label={etiqueta} value={datos[k] ?? ''} onChange={(e) => poner(k, e.target.value)} fullWidth multiline={multiline} minRows={multiline ? 2 : undefined} size="small" />
  )
  // Un desplegable que también admite escribir lo que el catálogo aún no tenga.
  const eleccion = (k: string, etiqueta: string, opciones: string[]) => (
    <Autocomplete key={k} freeSolo size="small" options={opciones} value={datos[k] ?? ''} onChange={(_, v) => poner(k, v ?? '')} onInputChange={(_, v, motivo) => motivo === 'input' && poner(k, v)}
      renderInput={(params) => <TextField {...params} label={etiqueta} />} />
  )
  const varios = (k: string, etiqueta: string, opciones: string[], ayuda?: string, separador = '; ') => (
    <Autocomplete key={k} multiple freeSolo size="small" options={opciones} value={lista(datos[k])} onChange={(_, v) => poner(k, (v as string[]).join(separador))}
      renderTags={(v, getTagProps) => v.map((o, idx) => <Chip size="small" label={o} {...getTagProps({ index: idx })} key={o} />)}
      renderInput={(params) => <TextField {...params} label={etiqueta} helperText={ayuda} placeholder={lista(datos[k]).length ? '' : 'Elegir…'} />} />
  )
  const vinculados = new Set(p.documentos.map((d) => d.documento_id))
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Tarjeta titulo="Datos del proyecto" accion={
          <Typography variant="caption" color="text.secondary">{cambiado || guardando === 'guardando' ? 'Guardando…' : guardando === 'guardado' ? 'Guardado' : 'Se guarda solo'}</Typography>
        }>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
            <TextField select size="small" label="Estado" value={p.estado} onChange={(e) => void accion('', { estado: e.target.value }, 'PATCH', 'Estado actualizado.')}>
              {p.estados.map((e) => <MenuItem key={e} value={e}>{ETIQUETA_ESTADO_PROYECTO[e] ?? e}</MenuItem>)}
            </TextField>
            <TextField size="small" label="N.º oficial del proyecto" value={numero} onChange={(e) => setNumero(e.target.value)} helperText="Lo da el Congreso al presentarlo" />
            <TextField size="small" type="date" label="Fecha del proyecto (sale en el PDF)" value={fechaP} onChange={(e) => setFechaP(e.target.value)} InputLabelProps={{ shrink: true }}
              helperText={fechaP
                ? <>{fechaLarga(fechaP)} · fija · <Box component="span" role="button" sx={{ color: 'primary.main', cursor: 'pointer' }} onClick={() => setFechaP('')}>volver a automática</Box></>
                : 'Automática: la del día del PDF.'} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            {eleccion('autor', 'Autor', [...new Set([cat?.autor ?? '', ...(cat?.diputados ?? [])].filter(Boolean))])}
            {eleccion('grupo', 'Grupo parlamentario', cat?.grupos ?? [])}
            <TextField select size="small" label="Cámara" value={datos.camara ?? ''} onChange={(e) => poner('camara', e.target.value)}>
              {(cat?.camaras ?? ['Cámara de Diputados']).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            {campo('lugar', 'Lugar')}
          </Box>
          <TextField sx={{ mt: 1.5 }} label="Base legal que se invoca (sale en el PDF)" value={datos.base_legal_texto || BASE_LEGAL} onChange={(e) => poner('base_legal_texto', e.target.value === BASE_LEGAL ? '' : e.target.value)} fullWidth multiline size="small"
            helperText="Completa «…en ejercicio del derecho de iniciativa legislativa que le confiere ___, presenta…»." />
        </Tarjeta>
        {/* Pegar la ficha del prompt de proyecto de ley (2026-10-12): bloque `proyecto-de-ley` del prompt 08. */}
        <PegarResultado
          ruta="/api/pegar/interpretar"
          tipos={['proyecto-de-ley']}
          cuerpoExtra={{ tipos: ['proyecto-de-ley'] }}
          actual={datos as Record<string, unknown>}
          etiquetaBoton="Pegar la ficha del prompt"
          alAplicar={(campos, aplicado) => {
            // El título de la ley es una parte del texto, no un dato de la ficha; el estado lo cambia una persona.
            for (const [k, v] of Object.entries(campos)) {
              if (['titulo', 'estado', 'numero_presentado', 'observaciones'].includes(k) || (datos[k] ?? '') === v) continue
              poner(k, Array.isArray(v) ? v.map(String).join(k === 'adherentes' ? '\n' : '; ') : String(v ?? ''))
            }
            const { aceptadas, rechazadas, ...resto } = aplicado
            void registrarPegado({ ...resto, rechazados: rechazadas, entidad: `pl:${p.id}`, campos_aplicados: Object.fromEntries([...aceptadas].map((k) => [k, campos[k]])) })
          }}
        />
        <Tarjeta titulo="Sustento en pocas líneas" accion={<Typography variant="caption" color="text.secondary">Para el equipo: no sale en el PDF</Typography>}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {campo('problema', 'Problema público', true)}
            {campo('objetivo', 'Objetivo', true)}
            {campo('propuesta', 'Propuesta', true)}
          </Box>
        </Tarjeta>
        <Tarjeta titulo="Presentación y trámite">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {varios('adherentes', 'Firmas de respaldo y adhesiones', cat?.diputados ?? [], 'Elija o escriba quienes firman.', '\n')}
            {varios('comisiones', 'Comisión(es) a las que se envió', cat?.comisiones ?? [], cat ? `Comisiones ordinarias de la Cámara de Diputados · ${cat.fuente_comisiones}` : undefined)}
          </Box>
        </Tarjeta>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Tarjeta titulo="Equipo">
          <Box sx={{ mb: 1.5 }}>{selectorPersona(p.responsable_id, (v) => void accion('', { responsable_id: v }, 'PATCH', 'Responsable del proyecto actualizado.'), 'Responsable del proyecto', 240)}</Box>
          {p.miembros.map((m) => (
            <Box key={m.usuario_id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: PALETA.superficieMedia, color: 'primary.main' }}>{iniciales(m.nombre)}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>{m.nombre}</Typography>
                <Typography variant="caption" color="text.secondary">{ROLES[m.rol] ?? m.rol} · @{m.usuario}</Typography>
              </Box>
              <Tooltip title="Quitar del equipo">
                <IconButton size="small" onClick={() => void accion('/miembros', { miembros: p.miembros.filter((x) => x.usuario_id !== m.usuario_id) }, 'PUT')} aria-label="Quitar del equipo"><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Box>
          ))}
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <TextField select size="small" label="Sumar al equipo" value={nuevoMiembro} onChange={(e) => setNuevoMiembro(Number(e.target.value))} sx={{ flex: 1 }}>
              {usuarios.filter((u) => !p.miembros.some((m) => m.usuario_id === u.id)).map((u) => <MenuItem key={u.id} value={u.id}>{u.nombre}</MenuItem>)}
            </TextField>
            <Button disabled={!nuevoMiembro} onClick={() => { void accion('/miembros', { miembros: [...p.miembros, { usuario_id: nuevoMiembro, rol: 'colaborador' }] }, 'PUT', 'Persona sumada.'); setNuevoMiembro('') }}>Sumar</Button>
          </Box>
        </Tarjeta>
        <Tarjeta titulo="Documentos vinculados">
          {p.documentos.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Sin documentos vinculados.</Typography>}
          {p.documentos.map((d) => (
            <Typography key={d.documento_id} variant="body2" component="a" href={`/documentos/${d.documento_id}`} sx={{ display: 'block', color: 'primary.main', py: 0.25 }}>
              {d.numero} — {d.asunto}{d.rol ? ` (${d.rol})` : ''}
            </Typography>
          ))}
          <Autocomplete size="small" sx={{ mt: 1 }} options={docs.filter((d) => !vinculados.has(d.id))} value={docElegido} onChange={(_, v) => setDocElegido(v)}
            getOptionLabel={(d) => `${d.numero_completo} — ${d.asunto ?? ''}`} isOptionEqualToValue={(x, y) => x.id === y.id}
            renderInput={(params) => <TextField {...params} label="Buscar un documento de Qillqa" placeholder="N.º, tipo o asunto" />} />
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <TextField select size="small" label="Relación" value={rolDoc} onChange={(e) => setRolDoc(e.target.value)} sx={{ flex: 1 }}>
              {['relacionado', 'antecedente', 'pedido de información', 'respuesta', 'presentación'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
            <Button disabled={!docElegido} onClick={() => { if (docElegido) void accion('/documentos', { documento_id: docElegido.id, rol: rolDoc }, 'POST', 'Documento vinculado.'); setDocElegido(null) }}>Vincular</Button>
          </Box>
        </Tarjeta>
        {/* Mapa local (2026-10-05): sus documentos, los de ellos y sus fuentes. */}
        <MapaLocal foco={`pl:${p.id}`} alto={230} titulo="Relaciones del proyecto" />
        <Tarjeta titulo="Avance">
          {/* 2026-10-06: sin partes, fases y tareas (duplicaban la cabecera) ni la línea técnica de partes ocupadas. */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="caption" color="text.disabled">Creado por {p.creado_por} el {fecha(p.creado_en)}.</Typography>
          </Box>
        </Tarjeta>
      </Box>
    </Box>
  )
}

function Fases({ p, accion, selectorPersona, resaltar }: { p: ProyectoDatos; accion: Accion; selectorPersona: Selector; resaltar: string }) {
  const [nueva, setNueva] = useState<Record<number, string>>({})
  // Abiertas: la fase en curso, y la que pide un aviso (o la de su tarea).
  const faseDeResaltar = resaltar.startsWith('tarea-') ? p.tareas.find((x) => `tarea-${x.id}` === resaltar)?.fase_id : resaltar.startsWith('fase-') ? Number(resaltar.slice(5)) : undefined
  const [abiertas, setAbiertas] = useState<Set<number>>(() => new Set(p.fases.filter((f) => f.estado === 'en_curso' || f.id === faseDeResaltar).map((f) => f.id)))
  useEffect(() => {
    if (faseDeResaltar) setAbiertas((a) => new Set([...a, faseDeResaltar]))
    if (!resaltar) return
    const t = window.setTimeout(() => document.getElementById(resaltar)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
    return () => window.clearTimeout(t)
  }, [resaltar, faseDeResaltar])
  const alternar = (id: number) => setAbiertas((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const bloque = (ambito: string, titulo: string, nota: string) => {
    const fases = p.fases.filter((f) => f.ambito === ambito)
    const hechas = fases.filter((f) => f.estado === 'hecha').length
    return (
      <Tarjeta titulo={<>{titulo} <Typography component="span" variant="caption" color="text.secondary">· {hechas}/{fases.length} hechas</Typography></>} sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -1, mb: 1.5 }}>{nota}</Typography>
        {fases.map((f, i) => {
          const tareas = p.tareas.filter((t) => t.fase_id === f.id)
          const abiertasT = tareas.filter((t) => t.estado !== 'hecha').length
          const reqHechos = f.requisitos.filter((r) => r.hecho).length
          const color = f.estado === 'hecha' ? 'success.main' : f.estado === 'en_curso' ? 'primary.main' : 'text.disabled'
          const abierta = abiertas.has(f.id)
          return (
            <Box key={f.id} id={`fase-${f.id}`} sx={{ border: '1px solid', borderColor: resaltar === `fase-${f.id}` ? 'primary.main' : PALETA.borde, borderRadius: 1.5, mb: 1, bgcolor: f.estado === 'en_curso' ? PALETA.velo : 'transparent' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 0.9, cursor: 'pointer' }} onClick={() => alternar(f.id)}>
                <Box sx={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', border: '2px solid', borderColor: color, bgcolor: f.estado === 'hecha' ? `${PALETA.exito}26` : 'transparent', color, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.estado === 'hecha' ? '✓' : i + 1}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14.5 }} noWrap>{f.nombre}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {ETIQUETA_FASE[f.estado] ?? f.estado}
                    {f.responsable ? ` · ${f.responsable}` : ''}
                    {f.limite ? ` · hasta ${f.limite}` : ''}
                    {f.requisitos.length ? ` · requisitos ${reqHechos}/${f.requisitos.length}` : ''}
                    {tareas.length ? ` · ${abiertasT ? `${abiertasT} tarea(s) por hacer` : 'tareas hechas'}` : ''}
                  </Typography>
                </Box>
                <ExpandMoreIcon sx={{ color: 'text.secondary', transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </Box>
              <Collapse in={abierta} unmountOnExit>
                <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5, borderTop: `1px solid ${PALETA.borde}` }}>
                  {f.descripcion && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{f.descripcion}</Typography>}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                    <TextField select size="small" label="Estado" value={f.estado} onChange={(e) => void accion(`/fases/${f.id}`, { estado: e.target.value })} sx={{ minWidth: 140 }}>
                      {Object.entries(ETIQUETA_FASE).map(([k, t]) => <MenuItem key={k} value={k}>{t}</MenuItem>)}
                    </TextField>
                    {selectorPersona(f.responsable_id, (v) => void accion(`/fases/${f.id}`, { responsable_id: v }, 'PATCH', 'Responsable asignado.'), 'Responsable de la fase')}
                    <TextField size="small" type="date" label="Límite" value={f.limite} onChange={(e) => void accion(`/fases/${f.id}`, { limite: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
                  </Box>
                  {f.requisitos.length > 0 && <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary', mt: 1 }}>REQUISITOS</Typography>}
                  {f.requisitos.map((r, j) => (
                    <Box key={j} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                      <Checkbox size="small" checked={r.hecho} sx={{ p: 0.25, mt: 0.1 }} onChange={() => void accion(`/fases/${f.id}`, { requisitos: f.requisitos.map((x, k) => (k === j ? { ...x, hecho: !x.hecho } : x)) })} />
                      <Typography variant="body2" sx={{ fontSize: 13, color: r.hecho ? 'text.secondary' : 'text.primary' }}>
                        <Box component="span" sx={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, px: 0.6, mr: 0.75, borderRadius: 0.5, color: NATURALEZA[naturalezaDe(r)].color, border: `1px solid ${NATURALEZA[naturalezaDe(r)].color}55` }}>
                          {NATURALEZA[naturalezaDe(r)].t}
                        </Box>
                        {r.texto}{' '}
                        <Box component="span" sx={{ color: 'text.secondary', fontSize: 11.5 }}>· {r.fuente}</Box>
                      </Typography>
                    </Box>
                  ))}
                  <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary', mt: 1.5 }}>TAREAS</Typography>
                  {tareas.map((t) => (
                    <Box key={t.id} id={`tarea-${t.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25, px: 0.5, borderRadius: 1, bgcolor: resaltar === `tarea-${t.id}` ? PALETA.resaltado : 'transparent', transition: 'background-color 1s' }}>
                      <Checkbox size="small" checked={t.estado === 'hecha'} sx={{ p: 0.25 }} onChange={() => void accion(`/tareas/${t.id}`, { estado: t.estado === 'hecha' ? 'por_hacer' : 'hecha' })} />
                      <Typography variant="body2" sx={{ flex: 1, textDecoration: t.estado === 'hecha' ? 'line-through' : 'none', color: t.estado === 'hecha' ? 'text.disabled' : 'text.primary' }}>{t.titulo}</Typography>
                      {selectorPersona(t.responsable_id, (v) => void accion(`/tareas/${t.id}`, { responsable_id: v }, 'PATCH', 'Responsable asignado.'), 'Responsable', 170)}
                      {t.limite && <Typography variant="caption" color="text.secondary">{t.limite}</Typography>}
                      <Tooltip title="Quitar tarea">
                        <IconButton size="small" onClick={() => void accion(`/tareas/${t.id}`, {}, 'DELETE')} aria-label="Quitar tarea"><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                  <TextField
                    size="small" variant="standard" placeholder="+ Agregar tarea (Enter)" value={nueva[f.id] ?? ''} sx={{ mt: 0.5, width: '100%' }}
                    onChange={(e) => setNueva({ ...nueva, [f.id]: e.target.value })}
                    onKeyDown={(e) => {
                      const t = (nueva[f.id] ?? '').trim()
                      if (e.key === 'Enter' && t) {
                        void accion('/tareas', { titulo: t, fase_id: f.id }, 'POST')
                        setNueva({ ...nueva, [f.id]: '' })
                      }
                    }}
                  />
                </Box>
              </Collapse>
            </Box>
          )
        })}
      </Tarjeta>
    )
  }
  return (
    <Box sx={{ maxWidth: 1040, mx: 'auto' }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
        {Object.entries(NATURALEZA).map(([k, n]) => (
          <Typography key={k} variant="caption" sx={{ color: n.color }}>
            <b>{n.t}</b>{k === 'oficial' ? ': lo exige la normativa' : k === 'despacho' ? ': flujo interno de la entidad' : ': mejora el trabajo, no es requisito'}
          </Typography>
        ))}
      </Box>
      {bloque('interna', 'En el despacho', 'Del encargo a la presentación.')}
      {bloque('congreso', 'En el Congreso (trámite oficial)', 'Lo que hace el Congreso tras la presentación.')}
    </Box>
  )
}

// Clases de archivo del proyecto, en el orden en que se buscan.
const CLASES_ARCHIVO: [string, string][] = [
  ['firmado', 'Proyecto firmado'],
  ['generado', 'PDF generados por el sistema'],
  ['presentado', 'Proyecto presentado'],
  ['origen', 'Versiones de origen (Word)'],
  ['', 'Antecedentes, estudios y otros'],
]

function Fuentes({ p, accion, recargar, avisar }: { p: ProyectoDatos; accion: Accion; recargar: () => void; avisar: (t: 'success' | 'error' | 'info', x: string) => void }) {
  const navegar = useNavigate()
  const [f, setF] = useState({ tipo: 'norma', referencia: '', url: '', seccion: '', clave_externa: '' })
  const subir = async (archivo: File | null) => {
    if (!archivo) return
    const fd = new FormData()
    fd.append('archivo', archivo)
    fd.append('etiqueta', archivo.name.replace(/\.[^.]+$/, ''))
    try {
      await subirArchivo(`/api/proyectos/${p.id}/archivos`, fd)
      avisar('success', 'Archivo subido.')
      recargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo subir.')
    }
  }
  const conocidas = new Set(CLASES_ARCHIVO.map(([k]) => k))
  const [agregando, setAgregando] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busca, setBusca] = useState('')
  const q = busca.trim().toLowerCase()
  const visibles = p.fuentes.filter((x) => (!filtroTipo || x.tipo === filtroTipo) && (!q || `${x.referencia} ${x.resuelta?.titulo ?? ''}`.toLowerCase().includes(q)))
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 2, alignItems: 'start' }}>
      <Tarjeta titulo={`Fuentes que sustentan el proyecto (${p.fuentes.length})`} accion={
        <Button size="small" variant={agregando ? 'outlined' : 'contained'} onClick={() => setAgregando(!agregando)}>{agregando ? 'Cerrar' : '+ Agregar fuente'}</Button>
      }>
        <Collapse in={agregando}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, gap: 1, mb: 2, p: 1.25, borderRadius: 1.5, bgcolor: PALETA.superficieTenue }}>
            <TextField select size="small" label="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {Object.entries(TIPOS_FUENTE).map(([k, t]) => <MenuItem key={k} value={k}>{t}</MenuItem>)}
            </TextField>
            {/* Zotero manda en la referencia y la cita (2026-10-06, roles corregidos por Edison): elegir una
                obra llena la referencia que formatea Zotero y la enlaza por «zotero:<clave>»; el archivo, si
                Zotero lo enlaza a Calibre, se ve al resolver la fuente. Las claves escritas a mano
                (calibre:…, sgdp:doc:…) y las fuentes calibre:N de antes siguen valiendo. */}
            <BuscarZotero sx={{ gridColumn: '1 / -1' }} alElegir={(o) => setF((x) => ({
              ...x, tipo: o.tipo === 'statute' ? 'norma' : o.tipo === 'case' ? 'jurisprudencia' : x.tipo === 'norma' ? 'estudio' : x.tipo,
              referencia: o.cita, clave_externa: `zotero:${o.zotero_key}`, url: x.url || (o.doi ? `https://doi.org/${o.doi}` : o.url),
            }))} />
            <TextField size="small" label="Referencia o clave" placeholder="Ley 30424 · zotero:ABCD1234 · sgdp:doc:272" value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.target.value, clave_externa: e.target.value.trim() ? f.clave_externa : '' })}
              helperText={f.clave_externa ? (
                <>Enlazada a {f.clave_externa.startsWith('zotero:') ? 'Zotero' : 'la biblioteca'} ({f.clave_externa}) · <Box component="span" role="button" tabIndex={0} sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => setF({ ...f, clave_externa: '' })} onKeyDown={(e) => { if (e.key === 'Enter') setF({ ...f, clave_externa: '' }) }}>quitar enlace</Box></>
              ) : undefined} />
            <TextField select size="small" label="Sustenta" value={f.seccion} onChange={(e) => setF({ ...f, seccion: e.target.value })} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
              <MenuItem value=""><em>Todo el proyecto</em></MenuItem>
              {p.secciones.map((s) => <MenuItem key={s.clave} value={s.clave}>{s.titulo}</MenuItem>)}
            </TextField>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" label="Enlace (opcional)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} sx={{ flex: 1 }} />
              <Button variant="contained" disabled={f.referencia.trim().length < 2} onClick={() => { void accion('/fuentes', f, 'POST', 'Fuente agregada.'); setF({ ...f, referencia: '', url: '', clave_externa: '' }) }}>Agregar</Button>
            </Box>
          </Box>
        </Collapse>
        {p.fuentes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Sin fuentes todavía.</Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 1.25 }}>
              <Chip size="small" label={`Todas · ${p.fuentes.length}`} color={filtroTipo === '' ? 'primary' : 'default'} variant={filtroTipo === '' ? 'filled' : 'outlined'} onClick={() => setFiltroTipo('')} />
              {Object.entries(TIPOS_FUENTE).map(([tipo, titulo]) => {
                const n = p.fuentes.filter((x) => x.tipo === tipo).length
                return n ? <Chip key={tipo} size="small" label={`${titulo} · ${n}`} color={filtroTipo === tipo ? 'primary' : 'default'} variant={filtroTipo === tipo ? 'filled' : 'outlined'} onClick={() => setFiltroTipo(tipo)} /> : null
              })}
              <Box sx={{ flex: 1 }} />
              <TextField size="small" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} sx={{ width: { xs: '100%', sm: 180 } }} />
            </Box>
            {visibles.length === 0 && <Typography variant="body2" color="text.secondary">Ninguna fuente con ese filtro.</Typography>}
            {visibles.map((x) => {
              const titulo = x.resuelta?.titulo ?? x.referencia
              const parte = x.seccion ? p.secciones.find((s) => s.clave === x.seccion)?.titulo : ''
              const enlace = x.resuelta?.ruta ? undefined : x.url
              return (
                <Box key={x.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.75, px: 0.5, borderRadius: 1, borderBottom: `1px solid ${PALETA.borde}`, '&:hover': { bgcolor: PALETA.superficieTenue }, '&:hover .acciones': { opacity: 1 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={x.referencia}>
                      {x.resuelta?.ruta ? (
                        <a href={x.resuelta.ruta} onClick={(e) => { e.preventDefault(); navegar(x.resuelta!.ruta!) }}>{titulo}</a>
                      ) : titulo}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {TIPOS_FUENTE[x.tipo] ?? x.tipo}{parte ? ` · ${parte}` : ' · todo el proyecto'}{x.resuelta ? ` · ${x.resuelta.origen}` : x.clave_externa ? ` · ${x.clave_externa}` : ''}{x.resuelta?.detalle ? ` · ${x.resuelta.detalle}` : ''}
                    </Typography>
                  </Box>
                  <Box className="acciones" sx={{ display: 'flex', opacity: { xs: 1, md: 0 }, transition: 'opacity .15s' }}>
                    {enlace && (
                      <Tooltip title="Abrir el enlace">
                        <IconButton size="small" component="a" href={enlace} target="_blank" rel="noreferrer" aria-label="Abrir el enlace"><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Quitar fuente">
                      <IconButton size="small" onClick={() => void accion(`/fuentes/${x.id}`, {}, 'DELETE')} aria-label="Quitar fuente"><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              )
            })}
          </>
        )}
      </Tarjeta>
      <Tarjeta titulo={`Archivos (${p.archivos.length})`} accion={
        <Button component="label" size="small" startIcon={<UploadFileIcon />}>Subir<input hidden type="file" onChange={(e) => { void subir(e.target.files?.[0] ?? null); e.target.value = '' }} /></Button>
      }>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -1, mb: 1 }}>
          Cada PDF queda como versión, con su huella.
        </Typography>
        {CLASES_ARCHIVO.map(([clase, titulo]) => {
          const lista = p.archivos.filter((x) => (clase === '' ? !conocidas.has(x.categoria) || x.categoria === '' : x.categoria === clase)).slice().reverse()
          if (!lista.length) return null
          return (
            <Box key={clase || 'otros'} sx={{ mb: 1.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary' }}>{titulo.toUpperCase()} · {lista.length}</Typography>
              {lista.map((x, k) => (
                <Box key={x.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: `1px solid ${PALETA.borde}` }}>
                  {clase === 'firmado' ? <VerifiedOutlinedIcon fontSize="small" sx={{ color: k === 0 ? 'success.main' : 'text.disabled' }} /> : <DescriptionOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{x.etiqueta}{k === 0 && (clase === 'firmado' || clase === 'generado') ? ' · el último' : ''}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fecha(x.subido_en)} · {x.subido_por} · {(x.tamano / 1024 / 1024).toFixed(1)} MB
                      {x.sha256 && (
                        <Tooltip title={`Huella SHA-256: ${x.sha256}`}>
                          <Box component="span" sx={{ ml: 0.75, fontFamily: 'monospace', fontSize: 10.5 }}>#{x.sha256.slice(0, 8)}</Box>
                        </Tooltip>
                      )}
                    </Typography>
                  </Box>
                  {/\.pdf$/i.test(x.nombre) && (
                    <Tooltip title="Ver en otra pestaña">
                      <IconButton size="small" onClick={() => void apiPdf(`/api/proyectos/${p.id}/archivos/${x.id}`).then((u) => window.open(u, '_blank', 'noopener'))} aria-label="Ver"><VisibilityOutlinedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Descargar">
                    <IconButton size="small" onClick={() => void descargarArchivo(`/api/proyectos/${p.id}/archivos/${x.id}`, x.nombre)} aria-label="Descargar"><DownloadIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )
        })}
        {p.archivos.length === 0 && <Typography variant="body2" color="text.secondary">Todavía no hay archivos.</Typography>}
      </Tarjeta>
    </Box>
  )
}

function Conversacion({ p, actividad, accion }: { p: ProyectoDatos; actividad: Actividad[]; accion: Accion }) {
  const navegarChat = useNavigate()
  // El canal del proyecto en el Chat (2026-10-12, fase 8): se crea al primer uso; las observaciones
  // ancladas a una parte siguen aquí (decisión pendiente de Edison: hoja de ruta 8.6).
  const abrirCanal = () =>
    api<{ id: number }>(`/api/chat/entidad?entidad=pl:${p.id}&nombre=${encodeURIComponent(`${p.codigo} · ${p.titulo}`.slice(0, 120))}`, { method: 'POST' })
      .then((c) => navegarChat(`/chat?canal=${c.id}`))
      .catch(() => {})
  const [texto, setTexto] = useState('')
  const [seccion, setSeccion] = useState('')
  const [filtro, setFiltro] = useState<'todo' | 'comentarios' | 'pendientes'>('todo')
  const lista = filtro === 'todo' ? actividad : actividad.filter((a) => a.tipo === 'comentario' && (filtro === 'comentarios' || !a.resuelto))
  return (
    <Box sx={{ maxWidth: 920, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Tarjeta titulo="Nuevo comentario u observación" accion={<Button size="small" variant="outlined" onClick={abrirCanal}>Canal del proyecto en el Chat</Button>}>
        <TextField multiline minRows={2} fullWidth size="small" placeholder="Escriba aquí. Mencione con @usuario para avisarle." value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField select size="small" value={seccion} onChange={(e) => setSeccion(e.target.value)} sx={{ width: { xs: '100%', sm: 240 } }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value=""><em>Todo el proyecto</em></MenuItem>
            {p.secciones.map((s) => <MenuItem key={s.clave} value={s.clave}>{s.titulo}</MenuItem>)}
          </TextField>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Equipo: {p.miembros.map((m) => `@${m.usuario}`).join(' · ')}</Typography>
          <Button variant="contained" disabled={!texto.trim()} onClick={() => { void accion('/comentarios', { texto, seccion }, 'POST'); setTexto('') }}>Publicar</Button>
        </Box>
      </Tarjeta>
      <Tarjeta titulo="Línea de tiempo" accion={
        <ToggleButtonGroup size="small" exclusive value={filtro} onChange={(_, v) => v && setFiltro(v)} sx={{ '& .MuiToggleButton-root': { textTransform: 'none', py: 0.25, px: 1, fontSize: 12.5 } }}>
          <ToggleButton value="todo">Todo</ToggleButton>
          <ToggleButton value="comentarios">Comentarios</ToggleButton>
          <ToggleButton value="pendientes">Por resolver</ToggleButton>
        </ToggleButtonGroup>
      }>
        {lista.length === 0 && <Typography variant="body2" color="text.secondary">Nada que mostrar con este filtro.</Typography>}
        {lista.map((a) => {
          const esComentario = a.tipo === 'comentario'
          return (
            <Box key={a.id} sx={{ display: 'flex', gap: 1.25, py: 0.9, borderBottom: `1px solid ${PALETA.borde}`, opacity: esComentario && a.resuelto ? 0.55 : 1 }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: esComentario ? PALETA.superficieMedia : PALETA.superficieTenue, color: esComentario ? 'primary.main' : 'text.secondary' }}>{iniciales(a.usuario)}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  <b>{a.usuario}</b> · {fecha(a.creado_en)}{a.seccion ? ` · ${p.secciones.find((s) => s.clave === a.seccion)?.titulo ?? a.seccion}` : ''}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: esComentario ? 'text.primary' : 'text.secondary', fontSize: esComentario ? 14 : 13 }}>{a.texto}</Typography>
              </Box>
              {esComentario && (
                <Button size="small" onClick={() => void accion(`/comentarios/${a.id}`, {})}>{a.resuelto ? 'Reabrir' : 'Resuelto'}</Button>
              )}
            </Box>
          )
        })}
      </Tarjeta>
    </Box>
  )
}

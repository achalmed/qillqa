/**
 * VISOR AVANZADO de PDF e imágenes, a pantalla completa (Edison 2026-10-08,
 * fase 5: «que el visor de los PDF en todo el sistema sea muy similar o mejor
 * al que tiene Outlook; que sea fácil visualizar los PDF del documento»).
 *
 *   ┌ ▤ ▣ Nombre del archivo ······ ‹ [3] de 12 › · − 125 % + ⇔ ▢ · ↻ · 🔍 🖶 ⬇ · ✕ ┐
 *   │ miniaturas │            hojas en desplazamiento continuo                  │
 *   └────────────┴──────────────────────────────────────────────────────────────┘
 *
 * Por qué pdf.js y no el <object> del navegador: el lector integrado no existe
 * en el celular (Chrome de Android, Safari de iPhone solo la primera hoja), no
 * deja ofrecer miniaturas ni búsqueda propias y cambia de aspecto según el
 * navegador. Con pdf.js el mismo visor funciona en la laptop y en el teléfono.
 *
 * Cómo trabaja: el archivo se lee una vez (blob → ArrayBuffer); cada hoja es un
 * marco del tamaño final y solo se dibuja en un canvas cuando se acerca a la
 * vista (IntersectionObserver); al alejarse se libera. Encima del canvas va la
 * capa de texto de pdf.js, que permite seleccionar y copiar y donde se marcan
 * las coincidencias de la búsqueda. Utilidades puras en visorPdfjs.ts.
 *
 * Teclado: ←/→ hoja anterior/siguiente, Inicio/Fin, +/− zoom, Ctrl+0 ajustar,
 * Ctrl+F buscar, Ctrl+P imprimir, Esc cerrar. Ctrl+rueda y pellizco: zoom.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import Drawer from '@mui/material/Drawer'
import PanelArchivosVisor, { type ArchivoVisor } from './PanelArchivosVisor'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import WidthFullIcon from '@mui/icons-material/WidthFull'
import FitScreenIcon from '@mui/icons-material/FitScreen'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import SearchIcon from '@mui/icons-material/Search'
import PrintIcon from '@mui/icons-material/Print'
import DownloadIcon from '@mui/icons-material/Download'
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import { PALETA } from '../paleta'
import {
  MARGEN,
  PT_A_PX,
  SEPARACION,
  acotarZoom,
  cargarPdfJs,
  contar,
  esPdfPorFirma,
  girar,
  hojaEn,
  imprimir,
  normalizar,
  pareceImagen,
  pdfEnLinea,
  pasoZoom,
  posiciones,
  type Medida,
  type ModuloPdfJs,
} from './visorPdfjs'

export interface VisorAvanzadoProps {
  /** blob URL (apiPdf) o URL del PDF o la imagen. */
  url: string
  /** Nombre del archivo: título de la barra y nombre al descargar. */
  nombre: string
  abierto: boolean
  alCerrar: () => void
  /** Hoja con la que abre (base 1). */
  paginaInicial?: number
  /** Descarga propia del padre (p. ej. la que avisa dónde quedó el archivo).
   *  Sin ella se descarga el blob con `nombre`. */
  alDescargar?: () => void
  /** Todos los archivos del documento (lista de la derecha, como Outlook). Con uno o ninguno,
   *  no hay lista. */
  archivos?: ArchivoVisor[]
  /** Clave del archivo que muestra `url` al abrir (se resalta en la lista). */
  claveInicial?: string
}

export default function VisorAvanzado(props: VisorAvanzadoProps) {
  const { abierto, alCerrar, archivos = [], claveInicial = '' } = props
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('md'))
  // Archivo elegido en la lista (Outlook): mientras no se elija otro, el que trae el padre.
  const [elegido, setElegido] = useState<{ clave: string; url: string; nombre: string; descargar?: () => void } | null>(null)
  const [cargando, setCargando] = useState('')
  const [conLista, setConLista] = useState(true)
  const [listaMovil, setListaMovil] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!abierto) {
      setElegido(null)
      setError('')
    }
  }, [abierto])
  const elegir = async (a: ArchivoVisor) => {
    setCargando(a.clave)
    setError('')
    try {
      const url = await a.obtener()
      setElegido({ clave: a.clave, url, nombre: a.nombre, descargar: a.descargar })
      setListaMovil(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.')
    } finally {
      setCargando('')
    }
  }
  const url = elegido?.url ?? props.url
  const nombre = elegido?.nombre ?? props.nombre
  const alDescargar = elegido ? elegido.descargar : props.alDescargar
  const actual = elegido?.clave ?? claveInicial
  const hayLista = archivos.length > 1
  const panel = (cerrar?: () => void) => (
    <PanelArchivosVisor archivos={archivos} actual={actual} cargando={cargando} alElegir={(a) => void elegir(a)} alCerrar={cerrar} />
  )
  return (
    <Dialog
      fullScreen
      open={abierto}
      onClose={alCerrar}
      aria-label={`Visor: ${nombre}`}
      PaperProps={{ sx: { bgcolor: PALETA.borde, display: 'flex', flexDirection: 'row', overflow: 'hidden' } }}
    >
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {abierto && url ? <Cuerpo key={url} {...props} url={url} nombre={nombre} alDescargar={alDescargar} /> : null}
        {error && <Box sx={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', bgcolor: PALETA.superficie, color: PALETA.error, px: 2, py: 1, borderRadius: 1, boxShadow: 3, fontSize: 14 }}>{error}</Box>}
        {/* Con la lista oculta (o en el celular), un botón la trae de vuelta. */}
        {hayLista && (celular || !conLista) && (
          <Box
            component="button"
            onClick={() => (celular ? setListaMovil(true) : setConLista(true))}
            sx={{ position: 'absolute', right: 16, bottom: celular ? 76 : 16, display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1, border: 0, borderRadius: 5, bgcolor: PALETA.guinda, color: PALETA.sobrePrimario, font: 'inherit', fontSize: 13.5, fontWeight: 600, boxShadow: 3, cursor: 'pointer' }}
          >
            <ViewSidebarOutlinedIcon sx={{ fontSize: 18 }} /> Archivos ({archivos.length})
          </Box>
        )}
      </Box>
      {hayLista && !celular && conLista && (
        <Box sx={{ width: 330, flexShrink: 0, borderLeft: `1px solid ${PALETA.bordeFuerte}` }}>{panel(() => setConLista(false))}</Box>
      )}
      {hayLista && celular && (
        <Drawer anchor="right" open={listaMovil} onClose={() => setListaMovil(false)} PaperProps={{ sx: { width: 'min(88vw, 360px)' } }}>
          {panel(() => setListaMovil(false))}
        </Drawer>
      )}
    </Dialog>
  )
}

type Modo = 'auto' | 'ancho' | 'pagina' | 'libre'
type Estado = { fase: 'cargando' } | { fase: 'error'; texto: string } | { fase: 'pdf' } | { fase: 'imagen' }

/** Estilos de la capa de texto de pdf.js (los de su pdf_viewer.css que hacen
 *  falta) y de las coincidencias: borde dorado de la marca, sin fondo amarillo. */
const ESTILO_CAPA_TEXTO = {
  '& .textLayer': {
    position: 'absolute',
    inset: 0,
    overflow: 'clip',
    lineHeight: 1,
    textAlign: 'initial',
    textSizeAdjust: 'none',
    forcedColorAdjust: 'none',
    transformOrigin: '0 0',
    zIndex: 1,
  },
  '& .textLayer[data-main-rotation="90"]': { transform: 'rotate(90deg) translateY(-100%)' },
  '& .textLayer[data-main-rotation="180"]': { transform: 'rotate(180deg) translate(-100%, -100%)' },
  '& .textLayer[data-main-rotation="270"]': { transform: 'rotate(270deg) translateX(-100%)' },
  '& .textLayer span, & .textLayer br': {
    color: 'transparent',
    position: 'absolute',
    whiteSpace: 'pre',
    cursor: 'text',
    transformOrigin: '0% 0%',
  },
  '& .textLayer span.markedContent': { top: 0, height: 0 },
  '& .textLayer ::selection': { background: `${PALETA.acento}47` },
  '& .textLayer br::selection': { background: 'transparent' },
  '& .textLayer .endOfContent': { display: 'block', position: 'absolute', inset: '100% 0 0', zIndex: 0, cursor: 'default', userSelect: 'none' },
  '& .textLayer span.sgdp-coincide': {
    borderRadius: '2px',
    background: PALETA.resaltado,
    boxShadow: `0 0 0 2px ${PALETA.doradoLinea}`,
  },
} as const

/** ¿El elemento entra (o está por entrar) en la vista de `raiz`? */
function useVisible(ref: React.RefObject<HTMLElement>, raiz: HTMLElement | null, margen: string): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !raiz) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { root: raiz, rootMargin: margen })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, raiz, margen])
  return visible
}

/** Marca (o desmarca) los trozos de la capa de texto que contienen la búsqueda. */
function resaltar(capa: HTMLElement | null, consulta: string) {
  if (!capa) return
  const q = normalizar(consulta).trim()
  capa.querySelectorAll('span').forEach((s) => {
    const si = !!q && !s.classList.contains('markedContent') && normalizar(s.textContent ?? '').includes(q)
    s.classList.toggle('sgdp-coincide', si)
  })
}

/** Libera la memoria de los canvas de un contenedor (los móviles tienen poca). */
function vaciar(host: HTMLElement | null) {
  if (!host) return
  host.querySelectorAll('canvas').forEach((c) => {
    c.width = 0
    c.height = 0
  })
  host.replaceChildren()
}

/** Densidad del canvas: nítido en pantallas retina, sin pasar del tope de
 *  píxeles que aceptan los navegadores de celular (~16 millones). */
function densidad(ancho: number, alto: number): number {
  let r = Math.min(window.devicePixelRatio || 1, 2)
  const tope = 16_000_000
  if (ancho * alto * r * r > tope) r = Math.sqrt(tope / (ancho * alto))
  return r
}

// --- Una hoja del área central ------------------------------------------------
function Hoja({
  pagina,
  numero,
  medida,
  zoom,
  giro,
  raiz,
  pdfjs,
  consulta,
}: {
  pagina: PDFPageProxy
  numero: number
  medida: Medida
  zoom: number
  giro: number
  raiz: HTMLElement | null
  pdfjs: ModuloPdfJs
  consulta: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLDivElement>(null)
  const texto = useRef<HTMLDivElement>(null)
  const visible = useVisible(caja, raiz, '900px 0px')
  const consultaRef = useRef(consulta)
  consultaRef.current = consulta

  useEffect(() => {
    if (!visible) {
      vaciar(lienzo.current)
      texto.current?.replaceChildren()
      return
    }
    let cancelado = false
    let tarea: RenderTask | null = null
    let capa: TextLayer | null = null
    // La capa de texto anterior sigue al zoom nuevo mientras se redibuja.
    texto.current?.querySelector<HTMLElement>('.textLayer')?.style.setProperty('--scale-factor', String(zoom * PT_A_PX))
    // Una pausa breve: con Ctrl+rueda el zoom cambia muchas veces por segundo
    // y no vale la pena dibujar cada paso (mientras, el canvas viejo se estira).
    const espera = window.setTimeout(() => {
      const vp = pagina.getViewport({ scale: zoom * PT_A_PX, rotation: (pagina.rotate + giro) % 360 })
      const r = densidad(vp.width, vp.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(vp.width * r))
      canvas.height = Math.max(1, Math.floor(vp.height * r))
      Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' })
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      tarea = pagina.render({ canvasContext: ctx, viewport: vp, transform: r !== 1 ? [r, 0, 0, r, 0, 0] : undefined })
      tarea.promise
        .then(async () => {
          if (cancelado) return
          vaciar(lienzo.current)
          lienzo.current?.appendChild(canvas)
          const div = document.createElement('div')
          div.className = 'textLayer'
          div.style.setProperty('--scale-factor', String(vp.scale))
          capa = new pdfjs.TextLayer({ textContentSource: pagina.streamTextContent(), container: div, viewport: vp })
          await capa.render()
          if (cancelado) return
          texto.current?.replaceChildren(div)
          resaltar(div, consultaRef.current)
        })
        .catch(() => {
          /* cancelado por un zoom nuevo o el documento se cerró */
        })
    }, 60)
    return () => {
      cancelado = true
      window.clearTimeout(espera)
      tarea?.cancel()
      capa?.cancel()
    }
  }, [visible, zoom, giro, pagina, pdfjs])

  useEffect(() => resaltar(texto.current, consulta), [consulta])

  const m = girar(medida, giro)
  return (
    <Box
      ref={caja}
      data-hoja={numero}
      sx={{
        position: 'relative',
        width: m.ancho * zoom,
        height: m.alto * zoom,
        mx: 'auto',
        mb: `${SEPARACION}px`,
        bgcolor: '#FFFFFF',
        boxShadow: PALETA.sombra,
        ...ESTILO_CAPA_TEXTO,
      }}
    >
      <Box ref={lienzo} sx={{ position: 'absolute', inset: 0 }} />
      <Box ref={texto} sx={{ position: 'absolute', inset: 0 }} />
    </Box>
  )
}

// --- Una miniatura del panel izquierdo -----------------------------------------
const ANCHO_MINIATURA = 112

function Miniatura({
  pagina,
  numero,
  medida,
  giro,
  activa,
  raiz,
  alElegir,
}: {
  pagina: PDFPageProxy
  numero: number
  medida: Medida
  giro: number
  activa: boolean
  raiz: HTMLElement | null
  alElegir: (n: number) => void
}) {
  const caja = useRef<HTMLButtonElement>(null)
  const lienzo = useRef<HTMLDivElement>(null)
  const visible = useVisible(caja, raiz, '400px 0px')
  const [dibujada, setDibujada] = useState('')
  const m = girar(medida, giro)
  const escala = ANCHO_MINIATURA / m.ancho

  useEffect(() => {
    const clave = `${giro}`
    if (!visible || dibujada === clave) return
    let cancelado = false
    const vp = pagina.getViewport({ scale: escala * PT_A_PX, rotation: (pagina.rotate + giro) % 360 })
    const r = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(vp.width * r))
    canvas.height = Math.max(1, Math.floor(vp.height * r))
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' })
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    const tarea = pagina.render({ canvasContext: ctx, viewport: vp, transform: r !== 1 ? [r, 0, 0, r, 0, 0] : undefined })
    tarea.promise
      .then(() => {
        if (cancelado) return
        vaciar(lienzo.current)
        lienzo.current?.appendChild(canvas)
        setDibujada(clave)
      })
      .catch(() => {})
    return () => {
      cancelado = true
      tarea.cancel()
    }
  }, [visible, giro, pagina, escala, dibujada])

  useEffect(() => {
    if (activa) caja.current?.scrollIntoView({ block: 'nearest' })
  }, [activa])

  return (
    <Box
      component="button"
      ref={caja}
      type="button"
      onClick={() => alElegir(numero)}
      aria-label={`Hoja ${numero}`}
      aria-current={activa ? 'page' : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        p: 0.75,
        border: 'none',
        borderRadius: 1,
        bgcolor: activa ? PALETA.guindaSuave : 'transparent',
        cursor: 'pointer',
        font: 'inherit',
        '&:hover': { bgcolor: activa ? PALETA.guindaSuave : PALETA.velo },
        '&:focus-visible': { outline: `2px solid ${PALETA.guinda}`, outlineOffset: -2 },
      }}
    >
      <Box
        ref={lienzo}
        sx={{
          width: ANCHO_MINIATURA,
          height: m.alto * escala,
          bgcolor: '#FFFFFF',
          outline: activa ? `2px solid ${PALETA.guinda}` : `1px solid ${PALETA.bordeFuerte}`,
          boxShadow: PALETA.sombra,
        }}
      />
      <Typography variant="caption" sx={{ color: activa ? PALETA.guinda : PALETA.textoTenue, fontWeight: activa ? 700 : 400, lineHeight: 1.2 }}>
        {numero}
      </Typography>
    </Box>
  )
}

// --- Botón de la barra con su tooltip ----------------------------------------------
function Boton({ titulo, onClick, children, disabled, activo }: { titulo: string; onClick: (e: React.MouseEvent<HTMLElement>) => void; children: ReactNode; disabled?: boolean; activo?: boolean }) {
  return (
    <Tooltip title={titulo}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          aria-label={titulo}
          aria-pressed={activo}
          sx={{ color: activo ? PALETA.guinda : PALETA.textoSecundario, bgcolor: activo ? PALETA.guindaSuave : undefined }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  )
}

// --- El visor ---------------------------------------------------------------------
function Cuerpo({ url, nombre, alCerrar, paginaInicial = 1, alDescargar }: VisorAvanzadoProps) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('md'))
  const enLinea = useMemo(() => pdfEnLinea(), [])

  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [pdfjs, setPdfjs] = useState<ModuloPdfJs | null>(null)
  const [paginas, setPaginas] = useState<PDFPageProxy[]>([])
  const [medidas, setMedidas] = useState<Medida[]>([])
  const [modo, setModo] = useState<Modo>('auto')
  const [zoomLibre, setZoomLibre] = useState(1)
  const [giro, setGiro] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [campo, setCampo] = useState('1')
  const [conMiniaturas, setConMiniaturas] = useState(true)
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null)
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 })
  const [menuZoom, setMenuZoom] = useState<HTMLElement | null>(null)
  const [menuMas, setMenuMas] = useState<HTMLElement | null>(null)
  // Búsqueda
  const [buscando, setBuscando] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [buscada, setBuscada] = useState('')
  const [hallazgos, setHallazgos] = useState<{ pagina: number; n: number }[]>([])
  const [indiceHallazgo, setIndiceHallazgo] = useState(0)
  const [trabajando, setTrabajando] = useState(false)
  const textos = useRef(new Map<number, string>())
  const campoBusqueda = useRef<HTMLInputElement>(null)

  const paginaRef = useRef(pagina)
  paginaRef.current = pagina
  const inicialRef = useRef(paginaInicial)
  const total = estado.fase === 'imagen' ? 1 : paginas.length

  // --- Carga del archivo ----------------------------------------------------
  useEffect(() => {
    let vivo = true
    let doc: PDFDocumentProxy | null = null
    setEstado({ fase: 'cargando' })
    textos.current = new Map()
    ;(async () => {
      try {
        const r = await fetch(url)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const blob = await r.blob()
        if (pareceImagen(nombre, blob.type)) {
          const img = new Image()
          img.src = url
          await img.decode()
          if (!vivo) return
          setMedidas([{ ancho: img.naturalWidth, alto: img.naturalHeight }])
          setPaginas([])
          setEstado({ fase: 'imagen' })
          return
        }
        const datos = await blob.arrayBuffer()
        if (!blob.type.includes('pdf') && !esPdfPorFirma(datos)) throw new Error('formato')
        const mod = await cargarPdfJs()
        doc = await mod.getDocument({ data: new Uint8Array(datos), isEvalSupported: false }).promise
        const lista = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc!.getPage(i + 1)))
        if (!vivo) return
        setPdfjs(() => mod)
        setPaginas(lista)
        setMedidas(
          lista.map((p) => {
            const vp = p.getViewport({ scale: PT_A_PX, rotation: p.rotate })
            return { ancho: vp.width, alto: vp.height }
          }),
        )
        setEstado({ fase: 'pdf' })
      } catch (e) {
        if (!vivo) return
        const texto =
          e instanceof Error && e.message === 'formato'
            ? 'Este archivo no es un PDF ni una imagen.'
            : e instanceof Error && e.name === 'PasswordException'
              ? 'El PDF está protegido con contraseña.'
              : 'No se pudo abrir el archivo.'
        setEstado({ fase: 'error', texto })
      }
    })()
    return () => {
      vivo = false
      // La hoja que se veía se conserva si el archivo cambia (vista previa nueva).
      inicialRef.current = paginaRef.current
      void doc?.destroy()
    }
  }, [url, nombre])

  // --- Tamaño del área central --------------------------------------------------
  useEffect(() => {
    if (!raiz) return
    const ro = new ResizeObserver(() => setCaja({ ancho: raiz.clientWidth, alto: raiz.clientHeight }))
    ro.observe(raiz)
    return () => ro.disconnect()
  }, [raiz])

  // --- Zoom efectivo ---------------------------------------------------------------
  const girada = useMemo(() => medidas.map((m) => girar(m, giro)), [medidas, giro])
  const ajuste = useCallback(
    (m: Exclude<Modo, 'libre'>): number => {
      if (!girada.length || !caja.ancho) return 1
      const masAncha = Math.max(...girada.map((x) => x.ancho))
      const actual = girada[Math.min(paginaRef.current, girada.length) - 1] ?? girada[0]
      const porAncho = (caja.ancho - 2 * MARGEN) / masAncha
      const porAlto = (caja.alto - 2 * MARGEN) / actual.alto
      if (m === 'ancho') return acotarZoom(porAncho)
      if (m === 'pagina') return acotarZoom(Math.min(porAncho, (caja.ancho - 2 * MARGEN) / actual.ancho, porAlto))
      // auto: al ancho en el celular; en la laptop sin pasar de 150 % (una
      // hoja A4 a 300 % en un monitor ancho no se lee mejor). Una imagen
      // pequeña no se agranda.
      const tope = estado.fase === 'imagen' ? 1 : celular ? 4 : 1.5
      return acotarZoom(Math.min(porAncho, tope, estado.fase === 'imagen' ? porAlto : Infinity))
    },
    [girada, caja, celular, estado.fase],
  )
  const zoom = modo === 'libre' ? zoomLibre : ajuste(modo)
  const zoomRef = useRef(zoom)
  const tops = useMemo(() => posiciones(girada, zoom), [girada, zoom])

  const cambiarZoom = useCallback((z: number) => {
    setZoomLibre(acotarZoom(z))
    setModo('libre')
  }, [])

  // Al cambiar el zoom o el giro, la misma parte de la misma hoja sigue a la vista.
  const anterior = useRef<{ tops: number[]; alturas: number[]; ancho: number } | null>(null)
  useLayoutEffect(() => {
    const prev = anterior.current
    const alturas = girada.map((m) => m.alto * zoom)
    const anchoTotal = Math.max(0, ...girada.map((m) => m.ancho * zoom)) + 2 * MARGEN
    if (raiz && prev && prev.tops.length === tops.length && tops.length) {
      const y = raiz.scrollTop
      const i = hojaEn(prev.tops, y)
      const fraccion = prev.alturas[i] ? (y - prev.tops[i]) / prev.alturas[i] : 0
      raiz.scrollTop = tops[i] + fraccion * alturas[i]
      if (prev.ancho > 0 && anchoTotal !== prev.ancho) {
        const centro = (raiz.scrollLeft + raiz.clientWidth / 2) / prev.ancho
        raiz.scrollLeft = centro * anchoTotal - raiz.clientWidth / 2
      }
    }
    anterior.current = { tops, alturas, ancho: anchoTotal }
    zoomRef.current = zoom
  }, [tops, girada, zoom, raiz])

  // --- Navegación -------------------------------------------------------------------
  const irA = useCallback(
    (n: number) => {
      if (!total) return
      const k = Math.min(total, Math.max(1, Math.round(n)))
      setPagina(k)
      setCampo(String(k))
      if (raiz && tops[k - 1] !== undefined) raiz.scrollTo({ top: Math.max(0, tops[k - 1] - MARGEN / 2) })
    },
    [total, raiz, tops],
  )

  // Hoja inicial, una sola vez por archivo, cuando ya hay medidas y caja.
  const posicionado = useRef('')
  useLayoutEffect(() => {
    if ((estado.fase !== 'pdf' && estado.fase !== 'imagen') || !raiz || !caja.ancho || posicionado.current === url) return
    posicionado.current = url
    irA(inicialRef.current || 1)
  }, [estado.fase, raiz, caja.ancho, url, irA])

  const alDesplazar = () => {
    if (!raiz || !tops.length) return
    // Al fondo del todo cuenta la última hoja, aunque no llegue arriba.
    const alFondo = raiz.scrollTop > 0 && raiz.scrollTop + raiz.clientHeight >= raiz.scrollHeight - 2
    const n = alFondo ? tops.length : hojaEn(tops, raiz.scrollTop + raiz.clientHeight * 0.35) + 1
    if (n !== paginaRef.current) {
      setPagina(n)
      if (document.activeElement?.getAttribute('data-campo-hoja') !== '1') setCampo(String(n))
    }
  }

  // --- Ctrl+rueda y pellizco ------------------------------------------------------------
  useEffect(() => {
    if (!raiz) return
    const rueda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      cambiarZoom(zoomRef.current * Math.exp(-e.deltaY * 0.0025))
    }
    let inicio: { d: number; z: number } | null = null
    let cuadro = 0
    const distancia = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const toca = (e: TouchEvent) => {
      if (e.touches.length === 2) inicio = { d: distancia(e.touches), z: zoomRef.current }
    }
    const mueve = (e: TouchEvent) => {
      if (!inicio || e.touches.length !== 2) return
      e.preventDefault()
      const z = inicio.z * (distancia(e.touches) / inicio.d)
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(() => cambiarZoom(z))
    }
    const suelta = (e: TouchEvent) => {
      if (e.touches.length < 2) inicio = null
    }
    raiz.addEventListener('wheel', rueda, { passive: false })
    raiz.addEventListener('touchstart', toca, { passive: true })
    raiz.addEventListener('touchmove', mueve, { passive: false })
    raiz.addEventListener('touchend', suelta)
    return () => {
      raiz.removeEventListener('wheel', rueda)
      raiz.removeEventListener('touchstart', toca)
      raiz.removeEventListener('touchmove', mueve)
      raiz.removeEventListener('touchend', suelta)
      cancelAnimationFrame(cuadro)
    }
  }, [raiz, cambiarZoom])

  // --- Acciones ------------------------------------------------------------------------
  const esImagen = estado.fase === 'imagen'
  const listo = estado.fase === 'pdf' || estado.fase === 'imagen'
  const descargar = () => {
    if (alDescargar) return alDescargar()
    const a = document.createElement('a')
    a.href = url
    a.download = nombre || 'documento.pdf'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  const imprimirArchivo = () => imprimir(url, esImagen, enLinea)
  const rotar = () => setGiro((g) => (g + 90) % 360)

  const buscar = useCallback(
    async (texto: string) => {
      const q = normalizar(texto).trim()
      setBuscada(texto)
      if (!q || !paginas.length) {
        setHallazgos([])
        return
      }
      setTrabajando(true)
      const lista: { pagina: number; n: number }[] = []
      for (let i = 0; i < paginas.length; i++) {
        let t = textos.current.get(i)
        if (t === undefined) {
          try {
            const c = await paginas[i].getTextContent()
            t = normalizar(c.items.map((x) => ('str' in x ? x.str + (x.hasEOL ? ' ' : '') : '')).join(''))
          } catch {
            t = ''
          }
          textos.current.set(i, t)
        }
        const n = contar(t, q)
        if (n) lista.push({ pagina: i + 1, n })
      }
      setTrabajando(false)
      setHallazgos(lista)
      // La primera coincidencia desde la hoja que se está viendo.
      const desde = lista.findIndex((h) => h.pagina >= paginaRef.current)
      const k = desde === -1 ? 0 : desde
      setIndiceHallazgo(k)
      if (lista.length) irA(lista[k].pagina)
    },
    [paginas, irA],
  )
  const saltarHallazgo = (dir: 1 | -1) => {
    if (!hallazgos.length) return
    const k = (indiceHallazgo + dir + hallazgos.length) % hallazgos.length
    setIndiceHallazgo(k)
    irA(hallazgos[k].pagina)
  }
  const abrirBusqueda = () => {
    setBuscando(true)
    setTimeout(() => campoBusqueda.current?.select(), 30)
  }
  const cerrarBusqueda = () => {
    setBuscando(false)
    setConsulta('')
    setBuscada('')
    setHallazgos([])
  }
  const totalCoincidencias = hallazgos.reduce((s, h) => s + h.n, 0)

  // --- Teclado ---------------------------------------------------------------------------
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      const enCampo = (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')
      if (ctrl && e.key.toLowerCase() === 'f' && estado.fase === 'pdf') {
        e.preventDefault()
        abrirBusqueda()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'p' && listo) {
        e.preventDefault()
        imprimirArchivo()
        return
      }
      if (ctrl && e.key === '0') {
        e.preventDefault()
        setModo('auto')
        return
      }
      if (enCampo) return
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault()
        cambiarZoom(pasoZoom(zoomRef.current, 1))
      } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault()
        cambiarZoom(pasoZoom(zoomRef.current, -1))
      } else if (e.key === 'ArrowLeft' && !ctrl) {
        e.preventDefault()
        irA(paginaRef.current - 1)
      } else if (e.key === 'ArrowRight' && !ctrl) {
        e.preventDefault()
        irA(paginaRef.current + 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        irA(1)
      } else if (e.key === 'End') {
        e.preventDefault()
        irA(total)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  // --- Barra -------------------------------------------------------------------------------
  const verMiniaturas = !celular && conMiniaturas && estado.fase === 'pdf' && total > 1
  const confirmarCampo = () => {
    const n = parseInt(campo, 10)
    if (Number.isFinite(n)) irA(n)
    else setCampo(String(pagina))
  }
  const porcentaje = `${Math.round(zoom * 100)} %`
  const IconoTipo = esImagen ? ImageOutlinedIcon : PictureAsPdfOutlinedIcon

  const navegacion = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <Boton titulo="Hoja anterior (←)" onClick={() => irA(pagina - 1)} disabled={!listo || pagina <= 1}>
        <NavigateBeforeIcon fontSize="small" />
      </Boton>
      <InputBase
        value={campo}
        onChange={(e) => setCampo(e.target.value.replace(/\D/g, ''))}
        onBlur={confirmarCampo}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            confirmarCampo()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        onFocus={(e) => e.target.select()}
        disabled={!listo || total <= 1}
        inputProps={{ 'aria-label': 'Hoja', inputMode: 'numeric', 'data-campo-hoja': '1' }}
        sx={{
          width: 44,
          fontSize: 14,
          '& input': { textAlign: 'center', py: 0.25, px: 0.5, border: `1px solid ${PALETA.bordeFuerte}`, borderRadius: 1, bgcolor: '#FFFFFF' },
        }}
      />
      <Typography variant="body2" sx={{ color: PALETA.textoSecundario, whiteSpace: 'nowrap', px: 0.5 }}>
        de {total || '…'}
      </Typography>
      <Boton titulo="Hoja siguiente (→)" onClick={() => irA(pagina + 1)} disabled={!listo || pagina >= total}>
        <NavigateNextIcon fontSize="small" />
      </Boton>
    </Box>
  )

  const controlesZoom = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <Boton titulo="Alejar (−)" onClick={() => cambiarZoom(pasoZoom(zoom, -1))} disabled={!listo}>
        <ZoomOutIcon fontSize="small" />
      </Boton>
      <Tooltip title="Elegir el zoom">
        <span>
        <Button
          size="small"
          onClick={(e) => setMenuZoom(e.currentTarget)}
          disabled={!listo}
          sx={{ minWidth: 62, px: 0.5, color: PALETA.textoSecundario, fontVariantNumeric: 'tabular-nums', textTransform: 'none' }}
        >
          {porcentaje}
        </Button>
        </span>
      </Tooltip>
      <Boton titulo="Acercar (+)" onClick={() => cambiarZoom(pasoZoom(zoom, 1))} disabled={!listo}>
        <ZoomInIcon fontSize="small" />
      </Boton>
    </Box>
  )

  const separador = <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />

  return (
    <>
      {/* Barra superior */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: { xs: 0.5, md: 1 },
          minHeight: 52,
          bgcolor: PALETA.superficie,
          borderBottom: `1px solid ${PALETA.borde}`,
          flexShrink: 0,
        }}
      >
        {celular ? (
          <Boton titulo="Cerrar (Esc)" onClick={alCerrar}>
            <CloseIcon />
          </Boton>
        ) : (
          estado.fase === 'pdf' &&
          total > 1 && (
            <Boton titulo={conMiniaturas ? 'Ocultar miniaturas' : 'Mostrar miniaturas'} onClick={() => setConMiniaturas((v) => !v)} activo={conMiniaturas}>
              <ViewSidebarOutlinedIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
            </Boton>
          )
        )}
        <IconoTipo sx={{ color: PALETA.guinda, fontSize: 22, ml: 0.5, display: { xs: 'none', sm: 'block' } }} />
        <Typography
          variant="subtitle2"
          title={nombre}
          sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: PALETA.texto, ml: 0.5 }}
        >
          {nombre || 'Documento'}
        </Typography>

        {!celular && (
          <>
            {navegacion}
            {separador}
            {controlesZoom}
            <Boton titulo="Ajustar al ancho" onClick={() => setModo('ancho')} disabled={!listo} activo={modo === 'ancho'}>
              <WidthFullIcon fontSize="small" />
            </Boton>
            <Boton titulo="Página completa" onClick={() => setModo('pagina')} disabled={!listo} activo={modo === 'pagina'}>
              <FitScreenIcon fontSize="small" />
            </Boton>
            {separador}
            <Boton titulo="Girar" onClick={rotar} disabled={!listo}>
              <RotateRightIcon fontSize="small" />
            </Boton>
            {estado.fase === 'pdf' && (
              <Boton titulo="Buscar (Ctrl+F)" onClick={() => (buscando ? cerrarBusqueda() : abrirBusqueda())} activo={buscando}>
                <SearchIcon fontSize="small" />
              </Boton>
            )}
            <Boton titulo="Imprimir" onClick={imprimirArchivo} disabled={!listo}>
              <PrintIcon fontSize="small" />
            </Boton>
            <Boton titulo="Descargar" onClick={descargar}>
              <DownloadIcon fontSize="small" />
            </Boton>
            {separador}
            <Boton titulo="Cerrar (Esc)" onClick={alCerrar}>
              <CloseIcon />
            </Boton>
          </>
        )}
        {celular && (
          <>
            {estado.fase === 'pdf' && (
              <Boton titulo="Buscar" onClick={() => (buscando ? cerrarBusqueda() : abrirBusqueda())} activo={buscando}>
                <SearchIcon fontSize="small" />
              </Boton>
            )}
            <Boton titulo="Descargar" onClick={descargar}>
              <DownloadIcon fontSize="small" />
            </Boton>
            <Boton titulo="Más opciones" onClick={(e) => setMenuMas(e.currentTarget)} disabled={!listo}>
              <MoreVertIcon fontSize="small" />
            </Boton>
          </>
        )}
      </Box>

      {/* Barra de búsqueda */}
      {buscando && estado.fase === 'pdf' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: { xs: 1, md: 1.5 },
            py: 0.5,
            bgcolor: PALETA.superficieTenue,
            borderBottom: `1px solid ${PALETA.borde}`,
            flexShrink: 0,
          }}
        >
          <SearchIcon fontSize="small" sx={{ color: PALETA.textoTenue }} />
          <InputBase
            inputRef={campoBusqueda}
            autoFocus
            value={consulta}
            placeholder="Buscar en el documento"
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (consulta === buscada && hallazgos.length) saltarHallazgo(e.shiftKey ? -1 : 1)
                else void buscar(consulta)
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                cerrarBusqueda()
              }
            }}
            inputProps={{ 'aria-label': 'Buscar en el documento' }}
            sx={{ flex: 1, maxWidth: 420, fontSize: 14 }}
          />
          <Typography variant="caption" sx={{ color: PALETA.textoTenue, whiteSpace: 'nowrap' }} aria-live="polite">
            {trabajando
              ? 'Buscando…'
              : buscada && consulta === buscada
                ? hallazgos.length
                  ? `Hoja ${hallazgos[indiceHallazgo]?.pagina} · ${indiceHallazgo + 1} de ${hallazgos.length} hojas (${totalCoincidencias})`
                  : 'Sin resultados'
                : ''}
          </Typography>
          <Boton titulo="Anterior (Mayús+Intro)" onClick={() => saltarHallazgo(-1)} disabled={hallazgos.length < 2}>
            <KeyboardArrowUpIcon fontSize="small" />
          </Boton>
          <Boton titulo="Siguiente (Intro)" onClick={() => (consulta === buscada ? saltarHallazgo(1) : void buscar(consulta))} disabled={!consulta.trim()}>
            <KeyboardArrowDownIcon fontSize="small" />
          </Boton>
          <Boton titulo="Cerrar la búsqueda" onClick={cerrarBusqueda}>
            <CloseIcon fontSize="small" />
          </Boton>
        </Box>
      )}

      {/* Cuerpo: miniaturas + hojas */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {verMiniaturas && (
          <Box
            ref={setPanel}
            component="nav"
            aria-label="Miniaturas"
            sx={{
              width: ANCHO_MINIATURA + 36,
              flexShrink: 0,
              overflowY: 'auto',
              py: 1,
              px: 0.5,
              bgcolor: PALETA.fondo,
              borderRight: `1px solid ${PALETA.bordeFuerte}`,
            }}
          >
            {pdfjs &&
              paginas.map((p, i) => (
                <Miniatura key={i} pagina={p} numero={i + 1} medida={medidas[i]} giro={giro} activa={pagina === i + 1} raiz={panel} alElegir={irA} />
              ))}
          </Box>
        )}

        <Box
          ref={setRaiz}
          onScroll={alDesplazar}
          tabIndex={-1}
          sx={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative', outline: 'none', touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }}
        >
          {estado.fase === 'cargando' && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: PALETA.textoSecundario }}>
              <CircularProgress size={22} />
              <Typography variant="body2">Abriendo…</Typography>
            </Box>
          )}
          {estado.fase === 'error' && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, p: 3, textAlign: 'center' }}>
              <PictureAsPdfOutlinedIcon sx={{ fontSize: 48, color: PALETA.guinda, opacity: 0.8 }} />
              <Typography variant="body2" sx={{ color: PALETA.textoSecundario }}>{estado.texto}</Typography>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={descargar}>Descargar</Button>
            </Box>
          )}
          {estado.fase === 'pdf' && pdfjs && (
            <Box sx={{ width: 'max-content', minWidth: '100%', p: `${MARGEN}px`, pb: `${MARGEN - SEPARACION + 4}px` }}>
              {paginas.map((p, i) => (
                <Hoja key={i} pagina={p} numero={i + 1} medida={medidas[i]} zoom={zoom} giro={giro} raiz={raiz} pdfjs={pdfjs} consulta={buscada} />
              ))}
            </Box>
          )}
          {estado.fase === 'imagen' && medidas[0] && (
            <Box sx={{ width: 'max-content', minWidth: '100%', p: `${MARGEN}px` }}>
              <Box sx={{ position: 'relative', mx: 'auto', width: girada[0].ancho * zoom, height: girada[0].alto * zoom, boxShadow: PALETA.sombra }}>
                <Box
                  component="img"
                  src={url}
                  alt={nombre}
                  draggable={false}
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: medidas[0].ancho * zoom,
                    height: medidas[0].alto * zoom,
                    maxWidth: 'none',
                    transform: `translate(-50%, -50%) rotate(${giro}deg)`,
                    bgcolor: '#FFFFFF',
                  }}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Celular: hoja y zoom abajo, al alcance del pulgar */}
      {celular && listo && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 0.5,
            px: 0.5,
            py: 0.25,
            pb: 'calc(env(safe-area-inset-bottom, 0px) + 2px)',
            bgcolor: PALETA.superficie,
            borderTop: `1px solid ${PALETA.borde}`,
            flexShrink: 0,
          }}
        >
          {total > 1 ? navegacion : <span />}
          {controlesZoom}
        </Box>
      )}

      {/* Menú del zoom */}
      <Menu anchorEl={menuZoom} open={!!menuZoom} onClose={() => setMenuZoom(null)}>
        {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((z) => (
          <MenuItem
            key={z}
            dense
            selected={modo === 'libre' && Math.abs(zoom - z) < 0.001}
            onClick={() => {
              cambiarZoom(z)
              setMenuZoom(null)
            }}
          >
            {Math.round(z * 100)} %
          </MenuItem>
        ))}
        <Divider />
        <MenuItem dense selected={modo === 'ancho'} onClick={() => (setModo('ancho'), setMenuZoom(null))}>
          <ListItemIcon><WidthFullIcon fontSize="small" /></ListItemIcon>
          Ajustar al ancho
        </MenuItem>
        <MenuItem dense selected={modo === 'pagina'} onClick={() => (setModo('pagina'), setMenuZoom(null))}>
          <ListItemIcon><FitScreenIcon fontSize="small" /></ListItemIcon>
          Página completa
        </MenuItem>
      </Menu>

      {/* Celular: lo que no cabe en la barra */}
      <Menu anchorEl={menuMas} open={!!menuMas} onClose={() => setMenuMas(null)}>
        <MenuItem onClick={() => (setModo('ancho'), setMenuMas(null))} selected={modo === 'ancho'}>
          <ListItemIcon><WidthFullIcon fontSize="small" /></ListItemIcon>
          Ajustar al ancho
        </MenuItem>
        <MenuItem onClick={() => (setModo('pagina'), setMenuMas(null))} selected={modo === 'pagina'}>
          <ListItemIcon><FitScreenIcon fontSize="small" /></ListItemIcon>
          Página completa
        </MenuItem>
        <MenuItem onClick={() => (rotar(), setMenuMas(null))}>
          <ListItemIcon><RotateRightIcon fontSize="small" /></ListItemIcon>
          Girar
        </MenuItem>
        <MenuItem onClick={() => (imprimirArchivo(), setMenuMas(null))}>
          <ListItemIcon><PrintIcon fontSize="small" /></ListItemIcon>
          Imprimir
        </MenuItem>
      </Menu>
    </>
  )
}

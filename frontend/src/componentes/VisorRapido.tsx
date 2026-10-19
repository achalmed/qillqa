/**
 * VISOR RÁPIDO de la bandeja (2026-10-19). Edison, desde el celular: al tocar un documento enviado o
 * firmado «debe verse de inmediato» y se pasa al siguiente «solo arrastrando la pantalla». Una vista
 * a pantalla completa con la imagen de la primera página del PDF —el firmado si lo hay—, sin pasar
 * por el formulario ni por el visor completo.
 *
 *   - La imagen la rasteriza el SERVIDOR (`GET /api/documentos/{id}/imagen?pagina=&archivo=`, PNG a
 *     150 ppp: una A4 sale en 1240 px de ancho, nítida hasta en un celular de 3× de densidad). Así no
 *     hay que cargar pdf.js (≈1 MB) para ver un oficio, y precargar el siguiente es pedir una imagen
 *     más. `docs/decisiones.md` §«Visor rápido».
 *   - Deslizar de lado cambia de documento (dentro de la misma lista filtrada de la bandeja); de
 *     arriba abajo (como TikTok, desde el 2026-10-19 por la tarde), de documento; de lado, de lámina
 *     (página o archivo del mismo documento). En el escritorio, flechas y teclas. Doble toque: acercar.
 *   - Pocas acciones: «Compartir» (Web Share con el PDF; si el navegador no comparte archivos,
 *     descargar), «Copiar imagen» (la página al portapapeles, como en el editor) y «Abrir documento»
 *     (la ficha completa, `/documentos/:id`). Dónde van (2026-10-19, Edison: «en una ubicación que
 *     resalte… y que funcione muy bien en el celular y la tableta, va a ser de uso diario»): en el
 *     celular, una barra inferior a lo ancho (donde llega el pulgar); en la tableta y el escritorio,
 *     arriba a la derecha, en la cabecera, sin tapar la página. Los demás archivos (documento,
 *     cargos, recibidos, adjuntos) van en una fila de fichas cortas; el nombre largo de un adjunto se
 *     dice en una línea aparte. Acercar: doble toque, pellizco del sistema o los botones «+ / −».
 *   - El botón «atrás» del celular cierra el visor (se apila una entrada en el historial al abrir).
 *
 * La lógica pura (qué abre, vecinos, archivos, gestos, teclas) está en `src/visorRapido.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as KeyboardEventReact, type PointerEvent as PointerEventReact } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import SwipeVerticalIcon from '@mui/icons-material/SwipeVertical'
import SwipeIcon from '@mui/icons-material/Swipe'
import IosShareIcon from '@mui/icons-material/IosShare'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import ViewCarouselOutlinedIcon from '@mui/icons-material/ViewCarouselOutlined'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import CloseIcon from '@mui/icons-material/Close'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import { api, descargarArchivo, traerArchivo } from '../api'
import { copiarArchivoImagen, copiarPaginaComoImagen, puedeCopiarImagenes, traerPaginaComoImagen } from '../copiar'
import { PALETA } from '../paleta'
import { COLOR_ESTADO, ETIQUETA_ESTADO } from '../estados'
import {
  aPrecargar,
  anchoImagen,
  archivoInicial,
  archivosDe,
  secuencia,
  claveImagen,
  interpretarGesto,
  interpretarTecla,
  laminaTras,
  CLAVE_GUIA,
  VECES_GUIA,
  rutaImagen,
  vecinos,
  type AdjuntoRapido,
  type ArchivoRapido,
  type DocRapido,
  type Gesto,
} from '../visorRapido'

interface Imagen {
  url: string
  total: number
}

// ---------------------------------------------------------------- caché de la sesión
// Las imágenes y los PDF ya pedidos se quedan en memoria (acotado): volver atrás es instantáneo y
// «Compartir» no vuelve a pedir el archivo. Al desalojar una imagen se libera su URL.
const TOPE = 40
const imagenes = new Map<string, Promise<Imagen>>()
const resueltas = new Map<string, Imagen>()
const pdfs = new Map<string, Promise<{ blob: Blob; nombre: string }>>()

function imagenDe(docId: number, archivo: ArchivoRapido, pagina: number, ancho = 0): Promise<Imagen> {
  const k = claveImagen(docId, archivo.clave, pagina, ancho)
  const ya = imagenes.get(k)
  if (ya) return ya
  // JPEG para VER (menos de la mitad de peso que el PNG); «Copiar imagen» pide su propio PNG.
  const ruta = rutaImagen(docId, archivo, pagina, ancho, 'jpeg')
  const p = (archivo.esImagen ? traerArchivo(ruta).then((r) => ({ blob: r.blob, total: 1 })) : traerPaginaComoImagen(ruta)).then(
    (r) => {
      const i = { url: URL.createObjectURL(r.blob), total: r.total }
      resueltas.set(k, i)
      return i
    },
  )
  p.catch(() => imagenes.delete(k))
  imagenes.set(k, p)
  if (imagenes.size > TOPE) {
    const primera = imagenes.keys().next().value as string
    imagenes.delete(primera)
    const i = resueltas.get(primera)
    resueltas.delete(primera)
    if (i) URL.revokeObjectURL(i.url)
  }
  return p
}

// Miniaturas de la tira (2026-10-19, Edison: «ver miniaturas de todos los documentos para navegar
// rápido»): la primera página de cada documento a 160 px (`&ancho=`), en memoria, pedidas solo
// cuando la miniatura entra a la vista.
const TOPE_MINIATURAS = 300
const miniaturas = new Map<number, Promise<string>>()
function miniaturaDe(d: DocRapido): Promise<string> {
  const ya = miniaturas.get(d.id)
  if (ya) return ya
  const p = traerArchivo(rutaImagen(d.id, archivoInicial(d.id, d.firmado_id), 1, 160, 'jpeg')).then((r) => URL.createObjectURL(r.blob))
  p.catch(() => miniaturas.delete(d.id))
  miniaturas.set(d.id, p)
  if (miniaturas.size > TOPE_MINIATURAS) {
    const primera = miniaturas.keys().next().value as number
    const vieja = miniaturas.get(primera)
    miniaturas.delete(primera)
    vieja?.then((u) => URL.revokeObjectURL(u)).catch(() => undefined)
  }
  return p
}

function Miniatura({ d, activa, alElegir, grande = false }: { d: DocRapido; activa: boolean; alElegir: () => void; grande?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let vivo = true
    const ob = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return
      ob.disconnect()
      miniaturaDe(d).then((u) => vivo && setUrl(u)).catch(() => vivo && setFallo(true))
    }, { rootMargin: '0px 200px' })
    ob.observe(el)
    return () => { vivo = false; ob.disconnect() }
  }, [d])
  useEffect(() => { if (activa) ref.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }) }, [activa])
  return (
    <ButtonBase ref={ref} onClick={alElegir} title={`${d.numero_completo}${d.asunto ? ` · ${d.asunto}` : ''}`} aria-label={d.numero_completo} aria-current={activa} sx={{ flexShrink: 0, width: grande ? '100%' : 54, aspectRatio: grande ? '210 / 297' : undefined, height: grande ? 'auto' : 76, borderRadius: 1, overflow: 'hidden', bgcolor: fallo ? FONDO_PIEZA : '#fff', outline: activa ? `2px solid ${PALETA.doradoLinea}` : '1px solid rgba(255,255,255,0.15)', outlineOffset: -1, opacity: activa ? 1 : 0.75, '&:hover': { opacity: 1 } }}>
      {url ? <Box component="img" src={url} alt="" draggable={false} sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} /> : <Skeleton variant="rectangular" animation={fallo ? false : 'wave'} sx={{ width: '100%', height: '100%', bgcolor: 'rgba(255,255,255,0.08)' }} />}
    </ButtonBase>
  )
}

function pdfDe(archivo: ArchivoRapido, nombre: string): Promise<{ blob: Blob; nombre: string }> {
  const ya = pdfs.get(archivo.ruta)
  if (ya) return ya
  const p = traerArchivo(archivo.ruta, nombre)
  p.catch(() => pdfs.delete(archivo.ruta))
  pdfs.set(archivo.ruta, p)
  if (pdfs.size > TOPE) pdfs.delete(pdfs.keys().next().value as string)
  return p
}

const ZOOM = 2.5
const ZOOM_MAX = 4
const PASO = 0.75
const TEXTO_SUAVE = 'rgba(255,255,255,0.72)'
const FONDO_PIEZA = 'rgba(255,255,255,0.1)'

export default function VisorRapido({
  documentos,
  id,
  alCambiar,
  alCerrar,
  alAbrir,
}: {
  /** La lista de la bandeja ya filtrada y ordenada: por ella se desliza. */
  documentos: readonly DocRapido[]
  id: number
  alCambiar: (id: number) => void
  alCerrar: () => void
  /** Abrir la ficha completa (`/documentos/:id`); reemplaza la entrada del historial del visor. */
  alAbrir: (id: number) => void
}) {
  const tema = useTheme()
  const escritorio = useMediaQuery(tema.breakpoints.up('md'))
  // Celular: acciones abajo (el pulgar); tableta y escritorio: arriba a la derecha.
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const doc = documentos.find((d) => d.id === id)
  const v = useMemo(() => vecinos(documentos, id), [documentos, id])

  // --- archivos del documento (firmado, documento, cargos…) --------------
  const [adjuntos, setAdjuntos] = useState<Record<number, AdjuntoRapido[]>>({})
  const lista = adjuntos[id]
  const archivos = useMemo(() => (lista ? archivosDe(id, lista) : []), [id, lista])
  const [archivoClave, setArchivoClave] = useState<string | null>(null)
  const archivo = (archivoClave && archivos.find((a) => a.clave === archivoClave)) || archivoInicial(id, doc?.firmado_id, archivos)
  const [pagina, setPagina] = useState(1)
  const [zoom, setZoom] = useState<{ x: number; y: number; escala: number } | null>(null)
  useEffect(() => {
    setArchivoClave(null)
    setPagina(1)
    setZoom(null)
  }, [id])
  useEffect(() => {
    if (lista) return
    let vivo = true
    api<AdjuntoRapido[]>(`/api/documentos/${id}/adjuntos`)
      .then((l) => vivo && setAdjuntos((s) => ({ ...s, [id]: l })))
      .catch(() => vivo && setAdjuntos((s) => ({ ...s, [id]: [] })))
    return () => {
      vivo = false
    }
  }, [id, lista])

  // --- la imagen de la página ------------------------------------------
  // Liviano (Edison 2026-10-19): la página se pide al ancho justo de la lámina en esta pantalla
  // (`anchoImagen`: ancho del escenario × densidad, en pasos de 128 px), nunca más grande.
  const escenario = useRef<HTMLDivElement>(null)
  const [anchoLamina, setAnchoLamina] = useState(() => window.innerWidth - 24)
  useEffect(() => {
    const el = escenario.current
    if (!el) return
    const medir = () => setAnchoLamina(el.clientWidth - 24)
    medir()
    const ob = new ResizeObserver(medir)
    ob.observe(el)
    return () => ob.disconnect()
  }, [])
  const ancho = anchoImagen(anchoLamina, window.devicePixelRatio || 1)
  const [imagen, setImagen] = useState<Imagen | null>(null)
  const [error, setError] = useState('')
  const claveActual = claveImagen(id, archivo.clave, pagina, ancho)
  useEffect(() => {
    const ya = resueltas.get(claveActual)
    setImagen(ya ?? null)
    setError('')
    if (ya) return
    let vivo = true
    imagenDe(id, archivo, pagina, ancho)
      .then((i) => vivo && setImagen(i))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo mostrar la página.'))
    return () => {
      vivo = false
    }
    // `archivo` cambia de identidad en cada render; lo que importa es su clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActual])
  const total = imagen?.total ?? 1

  // Precarga: la página siguiente de este archivo, la primera del documento siguiente y del anterior,
  // y el PDF de este (para que «Compartir» responda en el acto).
  // Solo el siguiente, el anterior y la página 2 de este archivo, y recién cuando la página actual
  // ya se ve (un respiro de 300 ms): nada compite con lo que la persona está mirando.
  useEffect(() => {
    if (!imagen) return
    const t = window.setTimeout(() => {
      if (total > pagina) imagenDe(id, archivo, pagina + 1, ancho).catch(() => undefined)
      for (const d of aPrecargar(documentos, id)) imagenDe(d.id, archivoInicial(d.id, d.firmado_id), 1, ancho).catch(() => undefined)
      pdfDe(archivo, archivo.clave === 'documento' && doc ? `${doc.numero_completo}.pdf` : '').catch(() => undefined)
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagen, claveActual])

  // --- cerrar: también con «atrás» del celular ---------------------------
  // Al abrir se apila una entrada en el historial; «atrás» la saca y eso cierra el visor. Cerrar con
  // la flecha o con Escape hace lo mismo al revés: saca la entrada y el `popstate` cierra. Así el
  // historial queda limpio y «atrás» desde la bandeja sale de la bandeja, no del visor. Si la entrada ya
  // está (el modo estricto de React monta dos veces), no se apila otra.
  const cerrarRef = useRef(alCerrar)
  cerrarRef.current = alCerrar
  const conEntrada = () => Boolean((window.history.state as { sgdpVisorRapido?: boolean } | null)?.sgdpVisorRapido)
  useEffect(() => {
    if (!conEntrada()) window.history.pushState({ ...(window.history.state ?? {}), sgdpVisorRapido: true }, '')
    const alVolver = () => cerrarRef.current()
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])
  useEffect(() => {
    const anular = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', anular)
    document.addEventListener('gesturechange', anular)
    return () => {
      document.removeEventListener('gesturestart', anular)
      document.removeEventListener('gesturechange', anular)
    }
  }, [])
  // Idempotente: Escape llega por `onClose` del diálogo y por `onKeyDown`; un segundo `back()` sacaría
  // también la bandeja del historial.
  const cerrando = useRef(false)
  const cerrar = () => {
    if (cerrando.current) return
    cerrando.current = true
    if (conEntrada()) window.history.back()
    else alCerrar()
  }

  // --- gestos --------------------------------------------------------------
  const lamina = useRef<HTMLImageElement>(null)
  const toque = useRef<{ x: number; y: number; t: number; zx: number; zy: number } | null>(null)
  // Pellizco (2026-10-19, Edison: «en táctil no funciona bien»): los dedos activos y, mientras hay dos,
  // la distancia y el punto medio de partida con la escala y el desplazamiento de entonces.
  const dedos = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pellizco = useRef<{ dist: number; cx: number; cy: number; escala: number; x: number; y: number; px: number; py: number } | null>(null)
  const ultimoToque = useRef<{ t: number; x: number; y: number } | null>(null)
  const [arrastre, setArrastre] = useState({ dx: 0, dy: 0 })
  const [aviso, setAviso] = useState('')
  // La tira de miniaturas (2026-10-19): apagada SIEMPRE al abrir (Edison: «no deben aparecer de forma
  // predeterminada sino cuando se requiera»); se enciende con su botón y se carga bajo demanda.
  const [tira, setTira] = useState(false)
  const alternarTira = () => setTira((t) => !t)
  // La cuadrícula de miniaturas a pantalla completa (2026-10-19): todos los documentos de la lista;
  // tocar uno lo abre en el visor y la cuadrícula se cierra.
  const [cuadricula, setCuadricula] = useState(false)
  const secuenciaDocs = useMemo(() => secuencia(documentos), [documentos])

  // Guía de gestos tipo TikTok (2026-10-19, Edison: «si no das esa señal no los van a usar: no hay
  // flechas en el celular»): las tres primeras veces por aparato, hasta el primer gesto o toque.
  const [guia, setGuia] = useState(() => {
    try { return !escritorio && Number(localStorage.getItem(CLAVE_GUIA) ?? 0) < VECES_GUIA } catch { return false }
  })
  useEffect(() => {
    if (!guia) return
    try { localStorage.setItem(CLAVE_GUIA, String(Number(localStorage.getItem(CLAVE_GUIA) ?? 0) + 1)) } catch { /* sin almacenamiento */ }
    const t = window.setTimeout(() => setGuia(false), 6000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const aplicar = useCallback(
    (g: Gesto) => {
      setGuia(false)
      if (g === 'siguiente' && v.siguiente) alCambiar(v.siguiente.id)
      else if (g === 'anterior' && v.anterior) alCambiar(v.anterior.id)
      else if (g === 'pagina_siguiente' || g === 'pagina_anterior') {
        // De lado: la lámina siguiente del MISMO documento (página o archivo), como TikTok (2026-10-19).
        const sig = laminaTras(g, archivos, archivo.clave, pagina, total)
        if (sig.clave !== archivo.clave) { setArchivoClave(sig.clave); setZoom(null) }
        setPagina(sig.pagina)
      }
    },
    [v, alCambiar, total, archivos, archivo.clave, pagina],
  )

  /** Acerca con `escala` dejando quieto el punto (cx, cy) de la pantalla (origen de la transformación: 0 0). */
  const acercarEn = (cx: number, cy: number, escala: number) => {
    const r = lamina.current?.getBoundingClientRect()
    if (!r) return
    const previa = zoom?.escala ?? 1
    // Coordenadas del punto dentro de la lámina sin acercar.
    const px = (cx - r.left) / previa
    const py = (cy - r.top) / previa
    setZoom({ x: cx - (r.left - (zoom?.x ?? 0)) - px * escala, y: cy - (r.top - (zoom?.y ?? 0)) - py * escala, escala })
  }
  const alternarZoom = (cx: number, cy: number) => {
    if (zoom) return setZoom(null)
    acercarEn(cx, cy, ZOOM)
  }
  /** Los botones «+» y «−» (2026-10-19): por pasos, centrados en la lámina; «−» por debajo de 1 vuelve al tamaño normal. */
  const acercar = (sentido: 1 | -1) => {
    const r = lamina.current?.getBoundingClientRect()
    if (!r) return
    const escala = Math.round(((zoom?.escala ?? 1) + sentido * PASO) * 100) / 100
    if (escala <= 1) return setZoom(null)
    acercarEn(r.left + r.width / 2, r.top + r.height / 2, Math.min(ZOOM_MAX, escala))
  }

  const alBajar = (e: PointerEventReact<HTMLDivElement>) => {
    if (e.button !== 0) return
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* un puntero que el navegador no reconoce (pruebas) */ }
    if (dedos.current.size === 2) {
      // Segundo dedo: empieza el pellizco desde la escala y el desplazamiento actuales (la lámina sin
      // acercar tiene escala 1 y origen 0,0), con el punto medio como ancla.
      const [a, b] = [...dedos.current.values()]
      const r = lamina.current?.getBoundingClientRect()
      const escala = zoom?.escala ?? 1
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const izq = (r?.left ?? 0) - (zoom?.x ?? 0)
      const arr = (r?.top ?? 0) - (zoom?.y ?? 0)
      pellizco.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx, cy, escala, x: zoom?.x ?? 0, y: zoom?.y ?? 0, px: (cx - izq - (zoom?.x ?? 0)) / escala, py: (cy - arr - (zoom?.y ?? 0)) / escala }
      toque.current = null
      setArrastre({ dx: 0, dy: 0 })
      setGuia(false)
      return
    }
    toque.current = { x: e.clientX, y: e.clientY, t: performance.now(), zx: zoom?.x ?? 0, zy: zoom?.y ?? 0 }
  }
  const alMover = (e: PointerEventReact<HTMLDivElement>) => {
    if (dedos.current.has(e.pointerId)) dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pellizco.current
    if (p && dedos.current.size >= 2) {
      const [a, b] = [...dedos.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const escala = Math.max(1, Math.min(ZOOM_MAX, (p.escala * dist) / Math.max(1, p.dist)))
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      // El punto de la lámina que estaba bajo el medio de los dedos sigue bajo ellos (y se puede arrastrar).
      const r = lamina.current?.getBoundingClientRect()
      const izq = (r?.left ?? 0) - (zoom?.x ?? 0)
      const arr = (r?.top ?? 0) - (zoom?.y ?? 0)
      if (escala <= 1.02) setZoom(null)
      else setZoom({ x: cx - izq - p.px * escala, y: cy - arr - p.py * escala, escala })
      return
    }
    const t = toque.current
    if (!t) return
    const dx = e.clientX - t.x
    const dy = e.clientY - t.y
    if (zoom) setZoom({ x: t.zx + dx, y: t.zy + dy, escala: zoom.escala })
    else if (Math.abs(dx) >= Math.abs(dy)) setArrastre({ dx, dy: 0 })
    else setArrastre({ dx: 0, dy })
  }
  const alSoltar = (e: PointerEventReact<HTMLDivElement>) => {
    dedos.current.delete(e.pointerId)
    if (pellizco.current) {
      // Al levantar un dedo del pellizco termina el gesto; el otro dedo no arrastra ni pasa de lámina.
      if (dedos.current.size === 0) pellizco.current = null
      toque.current = null
      setArrastre({ dx: 0, dy: 0 })
      return
    }
    const t = toque.current
    toque.current = null
    setArrastre({ dx: 0, dy: 0 })
    if (!t) return
    const dx = e.clientX - t.x
    const dy = e.clientY - t.y
    const ahora = performance.now()
    if (Math.hypot(dx, dy) < 10) {
      // Un toque; dos seguidos en el mismo sitio: acercar o volver.
      const u = ultimoToque.current
      if (u && ahora - u.t < 300 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 24) {
        ultimoToque.current = null
        alternarZoom(e.clientX, e.clientY)
      } else ultimoToque.current = { t: ahora, x: e.clientX, y: e.clientY }
      return
    }
    if (zoom) return // se estaba arrastrando la lámina acercada
    const r = escenario.current?.getBoundingClientRect()
    aplicar(interpretarGesto(dx, dy, ahora - t.t, r?.width ?? 375, r?.height ?? 600))
  }
  const alCancelar = (e: PointerEventReact<HTMLDivElement>) => {
    dedos.current.delete(e.pointerId)
    if (dedos.current.size === 0) pellizco.current = null
    toque.current = null
    setArrastre({ dx: 0, dy: 0 })
  }

  // La rueda del mouse (2026-10-19, Edison: «que haga caso al scroll para no estar mandando ese
  // botón»): hacia abajo, el documento siguiente; hacia arriba, el anterior; con Ctrl, acercar o
  // alejar donde está el puntero. Un tope de medio segundo evita que una rueda suave salte varios.
  const ultimaRueda = useRef(0)
  const alRueda = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey) {
      e.preventDefault()
      const escala = Math.max(1, Math.min(ZOOM_MAX, (zoom?.escala ?? 1) * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
      if (escala <= 1.02) setZoom(null)
      else acercarEn(e.clientX, e.clientY, escala)
      return
    }
    if (zoom || Math.abs(e.deltaY) < 4) return
    const ahora = performance.now()
    if (ahora - ultimaRueda.current < 500) return
    ultimaRueda.current = ahora
    aplicar(e.deltaY > 0 ? 'siguiente' : 'anterior')
  }

  const alTecla = (e: KeyboardEventReact<HTMLDivElement>) => {
    const t = interpretarTecla(e.key)
    if (!t) return
    e.preventDefault()
    if (t === 'cerrar') return cerrar()
    if (t === 'abrir') alAbrir(id)
    else aplicar(t)
  }

  // --- compartir ---------------------------------------------------------
  const compartir = async () => {
    setAviso('Preparando…')
    try {
      const { blob, nombre } = await pdfDe(archivo, archivo.clave === 'documento' && doc ? `${doc.numero_completo}.pdf` : '')
      const file = new File([blob], nombre, { type: blob.type || 'application/pdf' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: doc?.numero_completo ?? nombre, text: doc?.asunto ?? '' })
        setAviso('')
      } else {
        const destino = await descargarArchivo(archivo.ruta, nombre)
        setAviso(destino === 'cancelado' ? '' : 'Descargado')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return setAviso('')
      setAviso(e instanceof Error ? e.message : 'No se pudo compartir.')
    } finally {
      window.setTimeout(() => setAviso(''), 2500)
    }
  }

  // --- copiar como imagen (2026-10-19) ------------------------------------
  const copiarImagen = async () => {
    if (!puedeCopiarImagenes()) return setAviso('Este navegador no copia imágenes; use Compartir.')
    setAviso('Copiando…')
    try {
      if (archivo.esImagen) await copiarArchivoImagen(archivo.ruta)
      else await copiarPaginaComoImagen(rutaImagen(id, archivo, pagina))
      setAviso(total > 1 ? `Copiada la página ${pagina} como imagen` : 'Copiado como imagen')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo copiar.')
    } finally {
      window.setTimeout(() => setAviso(''), 2500)
    }
  }

  // --- pintar ------------------------------------------------------------
  const transformar = zoom
    ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.escala})`
    : arrastre.dx || arrastre.dy
      ? `translate(${arrastre.dx}px, ${arrastre.dy}px)`
      : 'none'
  const posicion = v.indice >= 0 ? `${v.indice + 1}/${v.total}` : ''
  const botonSx = { color: '#fff', textTransform: 'none', fontSize: 13.5, fontWeight: 600, px: 1.5, borderRadius: 5, bgcolor: FONDO_PIEZA, minWidth: 0, whiteSpace: 'nowrap', '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.35)' } } as const
  // La acción principal resalta: blanca sobre el visor oscuro.
  const botonPrincipalSx = { ...botonSx, color: PALETA.oscuroVisor, bgcolor: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.88)' } } as const
  const acciones = (
    <>
      <Button onClick={() => void compartir()} startIcon={<IosShareIcon />} disabled={!imagen} sx={{ ...botonSx, flex: celular ? 1 : 'none' }}>
        Compartir
      </Button>
      <Button onClick={() => void copiarImagen()} startIcon={<ContentCopyOutlinedIcon />} disabled={!imagen} sx={{ ...botonSx, flex: celular ? 1 : 'none' }}>
        {celular ? 'Copiar' : 'Copiar imagen'}
      </Button>
      <Button onClick={() => alAbrir(id)} startIcon={<OpenInNewIcon />} sx={{ ...botonPrincipalSx, flex: celular ? 1.2 : 'none' }}>
        {celular ? 'Abrir' : 'Abrir documento'}
      </Button>
    </>
  )
  const zoomBotones = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
      <IconButton size="small" onClick={() => acercar(-1)} disabled={!zoom} aria-label="Alejar" sx={{ color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}><ZoomOutIcon fontSize="small" /></IconButton>
      <Typography sx={{ fontSize: 11.5, color: TEXTO_SUAVE, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'center' }} aria-live="polite">{Math.round((zoom?.escala ?? 1) * 100)} %</Typography>
      <IconButton size="small" onClick={() => acercar(1)} disabled={!imagen || (zoom?.escala ?? 1) >= ZOOM_MAX} aria-label="Acercar" sx={{ color: '#fff', '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}><ZoomInIcon fontSize="small" /></IconButton>
    </Box>
  )

  return (
    <Dialog
      fullScreen
      open
      onClose={cerrar}
      onKeyDown={alTecla}
      aria-label={`Visor rápido: ${doc?.numero_completo ?? 'documento'}`}
      // El visor es una pantalla fija (Edison 2026-10-19: «a veces se mueve o se oculta la flecha de
      // retroceder»): ningún gesto sobre la cabecera, el pie o la lámina llega al navegador, así que
      // ni el pellizco del sistema ni el rebote del desplazamiento mueven la pantalla. Lo que sí se
      // desplaza (la tira, las fichas, la cuadrícula) lo declara con su propio `touch-action`.
      sx={{ '& .MuiDialog-container': { touchAction: 'none', overscrollBehavior: 'none' } }}
      PaperProps={{ sx: { bgcolor: PALETA.oscuroVisor, color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', maxWidth: '100vw', touchAction: 'none', overscrollBehavior: 'none', position: 'relative' } }}
    >
      {/* Cabecera: volver, número y estado, asunto; la posición en la lista. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5, pr: 1.5, pt: 'env(safe-area-inset-top)', minHeight: 56, flexShrink: 0, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
        <IconButton onClick={cerrar} aria-label="Volver a la bandeja" sx={{ color: '#fff', flexShrink: 0 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, minWidth: 0 }} noWrap>
              {doc?.numero_completo ?? 'Documento'}
            </Typography>
            {doc && (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 11.5, color: TEXTO_SUAVE, flexShrink: 0 }}>
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: COLOR_ESTADO[doc.estado] ?? PALETA.apagado }} />
                {ETIQUETA_ESTADO[doc.estado] ?? doc.estado}
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: 12.5, color: TEXTO_SUAVE }} noWrap>
            {doc?.asunto || doc?.tipo_nombre || ''}
          </Typography>
        </Box>
        {!celular && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, ml: 1 }}>{acciones}</Box>}
      </Box>

      {/* La lámina: se arrastra de arriba abajo (otro documento) o de lado (sus archivos y páginas). */}
      <Box
        ref={escenario}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alCancelar}
        onWheel={alRueda}
        sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1.5, py: 1, touchAction: 'none', userSelect: 'none', cursor: zoom ? 'grab' : 'default', overflow: 'hidden' }}
      >
        {imagen ? (
          <Box
            ref={lamina}
            component="img"
            key={imagen.url}
            src={imagen.url}
            alt={`${doc?.numero_completo ?? 'Documento'}, página ${pagina}`}
            draggable={false}
            sx={{
              maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', bgcolor: '#fff', boxShadow: '0 8px 30px -10px rgba(0,0,0,0.8)',
              transform: transformar, transformOrigin: '0 0', transition: toque.current ? 'none' : 'transform .2s ease-out',
              animation: 'sgdpAparecer .18s ease-out', '@keyframes sgdpAparecer': { from: { opacity: 0 }, to: { opacity: 1 } },
            }}
          />
        ) : error ? (
          <Box sx={{ textAlign: 'center', color: TEXTO_SUAVE, px: 3, transform: transformar, transition: 'transform .2s ease-out' }}>
            <PictureAsPdfOutlinedIcon sx={{ fontSize: 44, opacity: 0.6 }} />
            <Typography sx={{ fontSize: 14, mt: 1 }}>{/404|encontr/i.test(error) ? 'Este documento no tiene PDF en el sistema.' : error}</Typography>
          </Box>
        ) : (
          <Skeleton
            variant="rectangular"
            animation="wave"
            sx={{ width: 'min(100%, calc((100dvh - 190px) * 0.707))', aspectRatio: '210 / 297', maxHeight: '100%', bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 0.5, transform: transformar, transition: 'transform .2s ease-out' }}
          />
        )}
        {/* Flechas del escritorio (en el celular se desliza): de lado, las láminas del documento; arriba y abajo, otro documento. */}
        {escritorio && (
          <>
            <IconButton onPointerDown={(e) => e.stopPropagation()} onClick={() => aplicar('pagina_anterior')} disabled={pagina <= 1 && archivos.findIndex((a) => a.clave === archivo.clave) <= 0} aria-label="Lámina anterior (←)" sx={{ position: 'absolute', left: 12, color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)', bgcolor: 'rgba(0,0,0,0.35)' } }}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton onPointerDown={(e) => e.stopPropagation()} onClick={() => aplicar('pagina_siguiente')} disabled={pagina >= total && archivos.findIndex((a) => a.clave === archivo.clave) >= archivos.length - 1} aria-label="Lámina siguiente (→)" sx={{ position: 'absolute', right: 64, color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)', bgcolor: 'rgba(0,0,0,0.35)' } }}>
              <ChevronRightIcon />
            </IconButton>
            {/* Documento anterior y siguiente: al costado derecho, como TikTok (2026-10-19, Edison: sobre la hoja blanca no se veían). */}
            <Box onPointerDown={(e) => e.stopPropagation()} sx={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 1, zIndex: 2 }}>
              <IconButton onClick={() => aplicar('anterior')} disabled={!v.anterior} aria-label="Documento anterior (↑)" sx={{ color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)', bgcolor: 'rgba(0,0,0,0.35)' } }}>
                <KeyboardArrowUpIcon />
              </IconButton>
              <IconButton onClick={() => aplicar('siguiente')} disabled={!v.siguiente} aria-label="Documento siguiente (↓)" sx={{ color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)', bgcolor: 'rgba(0,0,0,0.35)' } }}>
                <KeyboardArrowDownIcon />
              </IconButton>
            </Box>
          </>
        )}
        {cuadricula && (
          <Box onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} sx={{ position: 'absolute', inset: 0, zIndex: 4, bgcolor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, flexShrink: 0 }}>
              <Typography sx={{ color: '#fff', fontWeight: 600, flex: 1 }}>Todos los documentos ({secuenciaDocs.length})</Typography>
              <IconButton onClick={() => setCuadricula(false)} aria-label="Cerrar las miniaturas" sx={{ color: '#fff' }}><CloseIcon /></IconButton>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, pb: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 1.5, alignContent: 'start', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
              {secuenciaDocs.map((d, i) => (
                <Box key={d.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                  <Miniatura d={d} activa={d.id === id} grande alElegir={() => { setCuadricula(false); if (d.id !== id) alCambiar(d.id) }} />
                  <Typography noWrap sx={{ fontSize: 11, color: TEXTO_SUAVE }} title={d.asunto}>{i + 1} · {d.numero_completo}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {/* La guía de gestos: una mano que sube (otro documento) y otra que va de lado (sus archivos). */}
        {guia && (
          <Box
            onPointerDown={(e) => { e.stopPropagation(); setGuia(false) }}
            sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', zIndex: 3, animation: 'sgdpAparecer .3s ease-out', '@keyframes sgdpSube': { '0%': { transform: 'translateY(26px)', opacity: 0.4 }, '60%': { transform: 'translateY(-18px)', opacity: 1 }, '100%': { transform: 'translateY(-18px)', opacity: 0 } }, '@keyframes sgdpLado': { '0%': { transform: 'translateX(26px)', opacity: 0.4 }, '60%': { transform: 'translateX(-18px)', opacity: 1 }, '100%': { transform: 'translateX(-18px)', opacity: 0 } } }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <SwipeVerticalIcon sx={{ fontSize: 56, animation: 'sgdpSube 1.6s ease-in-out infinite' }} />
              <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 0.5 }}>Desliza hacia arriba</Typography>
              <Typography sx={{ fontSize: 13, color: TEXTO_SUAVE }}>para ver el siguiente documento</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <SwipeIcon sx={{ fontSize: 56, animation: 'sgdpLado 1.6s ease-in-out infinite', animationDelay: '.8s' }} />
              <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 0.5 }}>Desliza de lado</Typography>
              <Typography sx={{ fontSize: 13, color: TEXTO_SUAVE }}>para sus páginas, firmado, cargos y adjuntos</Typography>
            </Box>
            <Typography sx={{ fontSize: 12, color: TEXTO_SUAVE, position: 'absolute', bottom: 16 }}>Toca para empezar</Typography>
          </Box>
        )}
      </Box>

      {/* Pie: la tira de miniaturas (si está encendida), el nombre largo del adjunto, los archivos (fichas
          cortas), la posición, el zoom y la página; en el celular, además, la barra de acciones. */}
      {/* `minmax(0, 1fr)` y no `1fr`: con `1fr` (= minmax(auto, 1fr)) la columna crecía al ancho mínimo de
          la tira (68 miniaturas en fila, ~3700 px) y arrastraba a la barra de acciones: el primer botón
          medía 1200 px y se veía como una barra gris vacía con el texto fuera de la pantalla, y la tira,
          tan ancha como su contenido, no tenía nada que desplazar (Edison 2026-10-19, dos capturas). */}
      <Box sx={{ flexShrink: 0, px: 1.5, pt: 0.5, pb: 'calc(env(safe-area-inset-bottom) + 10px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, maxHeight: '55%', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
        {tira && secuenciaDocs.length > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Box onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() } }} sx={{ flex: 1, minWidth: 0, display: 'flex', gap: 0.75, overflowX: 'auto', py: 0.5, px: 0.25, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, touchAction: 'pan-x', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }} aria-label="Miniaturas de los documentos">
              {secuenciaDocs.map((d) => <Miniatura key={d.id} d={d} activa={d.id === id} alElegir={() => { if (d.id !== id) alCambiar(d.id) }} />)}
            </Box>
            <Tooltip title="Ver todas las miniaturas a pantalla completa">
              <IconButton size="small" onClick={() => setCuadricula(true)} aria-label="Todas las miniaturas" sx={{ color: '#fff', bgcolor: FONDO_PIEZA, flexShrink: 0 }}><GridViewOutlinedIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>
        )}
        {archivo.detalle && (
          <Typography sx={{ fontSize: 12, color: TEXTO_SUAVE, lineHeight: 1.3, overflowWrap: 'anywhere' }} title={archivo.nombre}>
            {archivo.detalle}
          </Typography>
        )}
        {archivos.length > 1 && (
          <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', minWidth: 0, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, touchAction: 'pan-x', overscrollBehaviorX: 'contain' }} aria-label="Archivos del documento">
            {archivos.map((a) => {
              const activo = a.clave === archivo.clave
              return (
                <ButtonBase
                  key={a.clave}
                  onClick={() => {
                    setArchivoClave(a.clave)
                    setPagina(1)
                    setZoom(null)
                  }}
                  title={a.nombre}
                  sx={{ px: 1.25, py: 0.4, borderRadius: 4, fontSize: 12, fontWeight: activo ? 700 : 500, whiteSpace: 'nowrap', color: activo ? '#fff' : TEXTO_SUAVE, bgcolor: activo ? PALETA.guinda : FONDO_PIEZA, border: '1px solid', borderColor: activo ? PALETA.doradoLinea : 'transparent', flexShrink: 0 }}
                >
                  {a.rotulo}
                </ButtonBase>
              )
            })}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          {posicion && (
            <Typography sx={{ fontSize: 12.5, color: TEXTO_SUAVE, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }} aria-label={`Documento ${posicion} de la lista`}>
              {posicion}
            </Typography>
          )}
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12.5, color: TEXTO_SUAVE }} noWrap aria-live="polite">
            {aviso}
          </Typography>
          {secuenciaDocs.length > 1 && (
            <Tooltip title={tira ? 'Ocultar las miniaturas' : 'Miniaturas de los documentos'}>
              <IconButton size="small" onClick={alternarTira} aria-label="Miniaturas" aria-pressed={tira} sx={{ color: tira ? PALETA.doradoLinea : '#fff' }}><ViewCarouselOutlinedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          {zoomBotones}
          {total > 1 && (
            <Tooltip title={escritorio ? 'Página siguiente (→)' : 'Toque para pasar de página; o deslice de lado'}>
              <ButtonBase onClick={() => setPagina((p) => (p >= total ? 1 : p + 1))} aria-label={`Página ${pagina} de ${total}`} sx={{ px: 1.25, py: 0.5, borderRadius: 4, fontSize: 12.5, fontWeight: 600, color: '#fff', bgcolor: FONDO_PIEZA, fontVariantNumeric: 'tabular-nums' }}>
                {pagina}/{total}
              </ButtonBase>
            </Tooltip>
          )}
        </Box>
        {celular && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, '& .MuiButton-root': { minHeight: 42, px: 1, flexBasis: 0, overflow: 'hidden' } }}>{acciones}</Box>}
      </Box>
    </Dialog>
  )
}

/**
 * Interacción común del MAPA DE RELACIONES (Edison 2026-10-06: «que ese mapa
 * sea muy funcional, dinámico, interactivo»): la tarjeta que aparece al pasar
 * el cursor sobre un nodo, el menú de acciones (clic derecho, o clic sobre el
 * nodo ya elegido) y la apertura de archivos. La usan el mapa completo
 * (paginas/Mapa.tsx) y la ventanita del mapa local (MapaLocal.tsx).
 *
 * Los archivos se piden por las rutas de siempre, que pasan por
 * `enviar_archivo` del backend: `/api/documentos/{id}/pdf` (el PDF del
 * documento), `/api/documentos/{id}/adjuntos/{adjunto}` (firmado, cargos,
 * adjuntos, archivos de respuestas) y `/api/documentos/{id}/expediente`.
 */
import { textoCorrespondencia, textoRespuesta } from '../../correspondencia'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Snackbar from '@mui/material/Snackbar'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { apiPdf, descargarArchivo } from '../../api'
import { fijado, type LIENZO, type Nodo, type TemaMapa } from './estilo'

/** El id numérico de un documento del sistema (`doc:278` → 278). */
export const idDocumento = (n: Nodo): number | null =>
  n.tipo === 'documento' && /^doc:\d+$/.test(n.id) ? Number(n.id.slice(4)) : n.tipo === 'archivo' ? (n.documento ?? null) : null

/** La URL del archivo que se ve o descarga desde un nodo, si tiene uno. */
export const urlArchivo = (n: Nodo): string | null => {
  if (n.tipo === 'archivo') return n.archivo ?? null
  const id = idDocumento(n)
  return id !== null ? `/api/documentos/${id}/pdf` : null
}

/** El nodo que se enfoca en el mapa completo: un archivo, por su documento. */
export const focoDe = (n: Nodo) => (n.tipo === 'archivo' && n.documento ? `doc:${n.documento}` : n.id)

const legible = (estado: string) => estado.replace(/_/g, ' ').toLowerCase()

/** Ver y descargar archivos, con el aviso de error al pie. */
export function useArchivos() {
  const [error, setError] = useState('')
  const ver = useCallback(async (url: string) => {
    try {
      const u = await apiPdf(url)
      window.open(u, '_blank', 'noopener')
    } catch {
      setError('No se pudo abrir el archivo (¿todavía no tiene PDF?).')
    }
  }, [])
  const descargar = useCallback(async (url: string, nombre = '') => {
    try {
      await descargarArchivo(url, nombre)
    } catch {
      setError('No se pudo descargar el archivo.')
    }
  }, [])
  const aviso = (
    <Snackbar
      open={error !== ''}
      autoHideDuration={4500}
      onClose={() => setError('')}
      message={error}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
  )
  return { ver, descargar, aviso }
}

/** Tarjeta flotante junto al nodo bajo el cursor: qué es, estado y fecha. */
export function TarjetaNodo({
  nodo,
  x,
  y,
  ancho,
  lienzo,
  formatoEstado = legible,
  pista,
}: {
  nodo: Nodo
  /** Posición del nodo en pantalla, relativa al lienzo. */
  x: number
  y: number
  /** Ancho del lienzo: la tarjeta se da la vuelta cerca del borde derecho. */
  ancho: number
  lienzo: (typeof LIENZO)[TemaMapa]
  formatoEstado?: (estado: string) => string
  pista?: string
}) {
  const anchoTarjeta = Math.min(260, ancho - 16)
  const izquierda = x + 14 + anchoTarjeta > ancho ? Math.max(8, x - 14 - anchoTarjeta) : x + 14
  const detalle = [nodo.institucion, nodo.fecha].filter(Boolean).join(' · ')
  return (
    <Box
      sx={{
        position: 'absolute', left: izquierda, top: Math.max(8, y - 10), width: anchoTarjeta, zIndex: 4,
        bgcolor: lienzo.panel, color: lienzo.texto, border: '1px solid', borderColor: lienzo.borde, borderRadius: 1.5,
        px: 1.25, py: 0.75, pointerEvents: 'none', boxShadow: lienzo.sombra,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <Typography sx={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: lienzo.tenue, fontWeight: 600 }} noWrap>
        {nodo.subtipo}
        {nodo.estado ? ` · ${formatoEstado(nodo.estado)}` : ''}
      </Typography>
      <Typography sx={{ fontSize: 12.5, fontWeight: 650, lineHeight: 1.3 }}>{nodo.etiqueta}</Typography>
      {nodo.titulo && nodo.titulo !== nodo.etiqueta && (
        <Typography sx={{ fontSize: 11.5, opacity: 0.8, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: nodo.tipo === 'libro' || nodo.tipo === 'norma' ? 5 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {nodo.titulo}
        </Typography>
      )}
      {detalle && <Typography sx={{ fontSize: 11, color: lienzo.tenue, mt: 0.25 }}>{detalle}</Typography>}
      {(nodo.correspondencia || nodo.respuesta) && (
        <Typography sx={{ fontSize: 11, color: lienzo.tenue, mt: 0.25 }}>
          {textoCorrespondencia(nodo.correspondencia) || textoRespuesta(nodo.respuesta)}
        </Typography>
      )}
      {nodo.pendiente && <Typography sx={{ fontSize: 10.5, color: lienzo.tenue, mt: 0.25 }}>Citado en el texto · se relaciona al guardar</Typography>}
      {fijado(nodo) && <Typography sx={{ fontSize: 10.5, color: lienzo.tenue, mt: 0.25 }}>Fijado · doble clic para soltarlo</Typography>}
      {pista && <Typography sx={{ fontSize: 10.5, color: lienzo.tenue, mt: 0.25 }}>{pista}</Typography>}
    </Box>
  )
}

export type MenuAbierto = { nodo: Nodo; x: number; y: number } | null

/**
 * Menú de acciones de un nodo, en la posición del puntero (`clientX/Y`):
 * abrir su página, ver o descargar su PDF o archivo, ir al documento de un
 * archivo, enfocarlo, verlo en el mapa completo y soltarlo si está fijado.
 */
export function MenuNodo({
  menu,
  cerrar,
  navegar,
  ver,
  descargar,
  alEnfocar,
  enMapaCompleto,
  alSoltar,
}: {
  menu: MenuAbierto
  cerrar: () => void
  navegar: (ruta: string) => void
  ver: (url: string) => void
  descargar: (url: string, nombre?: string) => void
  /** Enfocar aquí, dentro del mismo mapa; sin él, no se ofrece. */
  alEnfocar?: (n: Nodo) => void
  /** Si ya se está en el mapa completo (no se ofrece «Ver en el mapa completo»). */
  enMapaCompleto?: boolean
  alSoltar: (n: Nodo) => void
}) {
  const n = menu?.nodo
  const items: { t: string; i: ReactNode; f: () => void; separar?: boolean }[] = []
  if (n) {
    const url = urlArchivo(n)
    const doc = idDocumento(n)
    if (n.tipo === 'archivo') {
      if (url) items.push({ t: 'Ver', i: <PictureAsPdfOutlinedIcon fontSize="small" />, f: () => ver(url) })
      if (url) items.push({ t: 'Descargar', i: <DownloadOutlinedIcon fontSize="small" />, f: () => descargar(url, n.nombre ?? '') })
      if (doc !== null) items.push({ t: 'Ir a su documento', i: <DescriptionOutlinedIcon fontSize="small" />, f: () => navegar(`/documentos/${doc}`) })
    } else if (n.tipo === 'norma' || n.tipo === 'libro') {
      // Citas (2026-10-06): la norma se abre en su fuente oficial si se conoce; del libro
      // se copia la referencia APA (la tarjeta ya la muestra entera).
      if (n.url) items.push({ t: 'Abrir la norma', i: <OpenInNewIcon fontSize="small" />, f: () => window.open(n.url, '_blank', 'noopener') })
      const cita = n.cita || n.titulo
      if (cita) items.push({ t: n.tipo === 'libro' ? 'Copiar la referencia APA' : 'Copiar la cita', i: <ContentCopyIcon fontSize="small" />, f: () => void navigator.clipboard?.writeText(cita) })
    } else {
      if (n.ruta) items.push({ t: 'Abrir', i: <OpenInNewIcon fontSize="small" />, f: () => navegar(n.ruta!) })
      if (url) items.push({ t: 'Ver PDF', i: <PictureAsPdfOutlinedIcon fontSize="small" />, f: () => ver(url) })
      if (url) items.push({ t: 'Descargar PDF', i: <DownloadOutlinedIcon fontSize="small" />, f: () => descargar(url) })
    }
    if (alEnfocar && n.tipo !== 'archivo')
      items.push({ t: 'Enfocar aquí', i: <CenterFocusStrongOutlinedIcon fontSize="small" />, f: () => alEnfocar(n), separar: true })
    if (!enMapaCompleto)
      items.push({ t: 'Ver en el mapa completo', i: <HubOutlinedIcon fontSize="small" />, f: () => navegar(`/mapa?foco=${encodeURIComponent(focoDe(n))}`), separar: !alEnfocar })
    if (fijado(n)) items.push({ t: 'Soltar (que vuelva a acomodarse)', i: <PushPinOutlinedIcon fontSize="small" />, f: () => alSoltar(n), separar: true })
  }
  return (
    <Menu
      open={menu !== null}
      onClose={cerrar}
      anchorReference="anchorPosition"
      anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        cerrar()
      }}
      PaperProps={{ sx: { minWidth: 220 } }}
    >
      {n && (
        <Box sx={{ px: 2, pt: 0.5, pb: 1, maxWidth: 300 }}>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }} noWrap>{n.subtipo}</Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 650 }} noWrap>{n.etiqueta}</Typography>
        </Box>
      )}
      {items.flatMap((it) => [
        ...(it.separar ? [<Divider key={`${it.t}-div`} />] : []),
        <MenuItem
          key={it.t}
          dense
          onClick={() => {
            cerrar()
            it.f()
          }}
        >
          <ListItemIcon>{it.i}</ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13.5 }}>{it.t}</ListItemText>
        </MenuItem>,
      ])}
    </Menu>
  )
}

/**
 * Clic sobre un nodo, sin confundirlo con un arrastre ni con un doble clic:
 * el clic que cierra un arrastre no cuenta, y sobre un nodo FIJADO se espera
 * un instante por si es un doble clic (que lo suelta) antes de actuar.
 */
export function useClicNodo(activar: (n: Nodo, e: MouseEvent) => void, soltarNodo: (n: Nodo) => void) {
  const ultimoArrastre = useRef(0)
  const pendiente = useRef<{ id: string; espera: number } | null>(null)
  useEffect(() => () => window.clearTimeout(pendiente.current?.espera), [])
  const alClic = (n: Nodo, e: MouseEvent) => {
    if (Date.now() - ultimoArrastre.current < 250) return
    if (!fijado(n)) {
      activar(n, e)
      return
    }
    if (pendiente.current?.id === n.id) {
      window.clearTimeout(pendiente.current.espera)
      pendiente.current = null
      soltarNodo(n)
      return
    }
    window.clearTimeout(pendiente.current?.espera)
    const espera = window.setTimeout(() => {
      pendiente.current = null
      activar(n, e)
    }, 280)
    pendiente.current = { id: n.id, espera }
  }
  const marcarArrastre = () => {
    ultimoArrastre.current = Date.now()
  }
  return { alClic, marcarArrastre }
}

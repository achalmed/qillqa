/**
 * FOTOTECA — tipos, llamadas y geometría compartidos por la página, el visor, el
 * editor y el selector (2026-10-06; backend/app/api/fototeca.py).
 *
 * La geometría de los ajustes es la MISMA de backend/app/servicios/fototeca.py
 * (girar → voltear → enderezar → recortar): lo que el editor muestra en su lienzo
 * es lo que sale al exportar. Si cambia allá, cambia aquí.
 */
import { cerrarSesion } from '../../api'
import { PALETA } from '../../paleta'

export type Estado = 'por_revisar' | 'publica' | 'reservada'

export interface Ajustes {
  rotar?: number
  voltear?: boolean
  voltear_v?: boolean
  enderezar?: number
  /** [x, y, ancho, alto] relativos (0–1) al encuadre ya girado y enderezado. */
  recorte?: [number, number, number, number]
  brillo?: number
  contraste?: number
  saturacion?: number
}

export interface Vinculo {
  tipo: 'semana' | 'proyecto' | 'documento'
  id: number
  codigo?: string
  etiqueta?: string
  seleccion?: boolean
}

export interface Foto {
  id: number
  /** 'video' (2026-10-06): se reproduce en el visor; no se edita ni se exporta por tamaños. */
  medio?: 'foto' | 'video'
  /** Segundos (solo videos). */
  duracion?: number | null
  nombre_original: string
  ancho: number
  alto: number
  /** Ancho/alto tras los ajustes (para la cuadrícula). */
  proporcion: number
  bytes: number
  tomada_en: string | null
  fecha_exif: boolean
  camara: string
  lat: number | null
  lon: number | null
  titulo: string
  descripcion: string
  lugar: string
  etiquetas: string[]
  personas: string[]
  estado: Estado
  favorita: boolean
  calificacion: number
  album_id: number | null
  ajustes: Ajustes
  /** Huella de los ajustes: va en la dirección de la miniatura y la vista. */
  version: string
  vinculos: Vinculo[]
  eliminada_en: string | null
  // Solo en el detalle.
  exif?: Record<string, string>
  sha256?: string
  creado_en?: string
  subido_por_nombre?: string
}

export interface Album {
  id: number
  nombre: string
  descripcion: string
  fecha: string
  portada_id: number | null
  n: number
}

export interface Facetas {
  total: number
  por_revisar: number
  favoritas: number
  sin_album: number
  papelera: number
  videos?: number
  albumes: Album[]
  etiquetas: { valor: string; n: number }[]
  personas: { valor: string; n: number }[]
  meses: { mes: string; n: number }[]
  vinculos: { tipo: string; id: number; etiqueta: string; n: number }[]
}

export interface Pagina {
  fotos: Foto[]
  total: number
  siguiente: number | null
}

export const ESTADOS: { valor: Estado; etiqueta: string; color: string }[] = [
  { valor: 'por_revisar', etiqueta: 'Por revisar', color: PALETA.aviso },
  { valor: 'publica', etiqueta: 'Pública', color: PALETA.exito },
  { valor: 'reservada', etiqueta: 'Reservada', color: PALETA.textoTenue },
]
export const etiquetaEstado = (e: string) => ESTADOS.find((x) => x.valor === e)?.etiqueta ?? e

export const PRESETS: { clave: string; etiqueta: string; proporcion: number | null }[] = [
  { clave: 'original', etiqueta: 'Original con ajustes', proporcion: null },
  { clave: 'documento', etiqueta: 'Documento (2400 px)', proporcion: null },
  { clave: 'informe', etiqueta: 'Informe 3:2', proporcion: 3 / 2 },
  { clave: 'publicacion', etiqueta: 'Publicación 4:5', proporcion: 4 / 5 },
  { clave: 'cuadrada', etiqueta: 'Cuadrada 1:1', proporcion: 1 },
  { clave: 'historia', etiqueta: 'Historia 9:16', proporcion: 9 / 16 },
]

export const ORDENES = [
  { valor: 'reciente', etiqueta: 'Más recientes' },
  { valor: 'antigua', etiqueta: 'Más antiguas' },
  { valor: 'subida', etiqueta: 'Últimas subidas' },
  { valor: 'calificacion', etiqueta: 'Mejor calificadas' },
  { valor: 'nombre', etiqueta: 'Por nombre de archivo' },
]

export const RUTA_VINCULO: Record<Vinculo['tipo'], (id: number) => string> = {
  semana: (id) => `/informes/${id}`,
  proyecto: (id) => `/proyectos/${id}`,
  documento: (id) => `/documentos/${id}`,
}
export const NOMBRE_VINCULO: Record<Vinculo['tipo'], string> = {
  semana: 'Semana de representación',
  proyecto: 'Proyecto de ley',
  documento: 'Documento',
}

export const urlMiniatura = (f: Pick<Foto, 'id' | 'version'>) => `/api/fototeca/${f.id}/miniatura?v=${f.version}`
export const urlVista = (f: Pick<Foto, 'id' | 'version'>) => `/api/fototeca/${f.id}/vista?v=${f.version}`
export const urlCruda = (id: number) => `/api/fototeca/${id}/vista?crudo=1`

export const esVideo = (f: Pick<Foto, 'medio'>) => f.medio === 'video'

/** «1:05», «12:30», «1:02:03». */
export function duracionLegible(segundos: number | null | undefined): string {
  if (!segundos || segundos < 0) return ''
  const s = Math.round(segundos)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** Extensiones que acepta la subida (fotos y videos). */
export const ACEPTA = 'image/*,.heic,.heif,video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm'

// --- Imágenes autenticadas -------------------------------------------------------------------

const token = () => localStorage.getItem('sgdp_token')
const autorizacion = (): Record<string, string> => (token() ? { Authorization: `Bearer ${token()}` } : {})

// Las imágenes piden token, así que no sirve un <img src> directo: se bajan como
// blob y se guardan aquí (las direcciones llevan la versión de los ajustes, así
// que una entrada nunca queda vieja). Se limita el número para no acumular memoria.
const imagenes = new Map<string, Promise<string>>()
const MAX_IMAGENES = 600

export function traerImagen(ruta: string): Promise<string> {
  const hay = imagenes.get(ruta)
  if (hay) {
    imagenes.delete(ruta)
    imagenes.set(ruta, hay) // la más usada pasa al final
    return hay
  }
  const promesa = fetch(ruta, { headers: autorizacion() }).then(async (r) => {
    if (r.status === 401) cerrarSesion()
    if (!r.ok) throw new Error(`No se pudo traer la imagen (${r.status}).`)
    return URL.createObjectURL(await r.blob())
  })
  promesa.catch(() => imagenes.delete(ruta))
  imagenes.set(ruta, promesa)
  while (imagenes.size > MAX_IMAGENES) {
    const [vieja, p] = imagenes.entries().next().value as [string, Promise<string>]
    imagenes.delete(vieja)
    void p.then((u) => URL.revokeObjectURL(u)).catch(() => {})
  }
  return promesa
}

/** Baja un archivo a la carpeta de descargas del navegador. */
export function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function nombreDe(cd: string | null, defecto: string): string {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd ?? '') ?? /filename="?([^";]+)"?/i.exec(cd ?? '')
  try {
    return m ? decodeURIComponent(m[1]) : defecto
  } catch {
    return m ? m[1] : defecto
  }
}

/** Exporta una o varias fotos (con sus ajustes) en un tamaño: una sola → su archivo; varias → .zip. */
export async function exportar(ids: number[], preset: string): Promise<{ blob: Blob; nombre: string }> {
  const r = await fetch('/api/fototeca/exportar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...autorizacion() },
    body: JSON.stringify({ ids, preset }),
  })
  if (r.status === 401) cerrarSesion()
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => null)
    throw new Error((cuerpo as { detail?: string } | null)?.detail ?? `No se pudo exportar (${r.status}).`)
  }
  return { blob: await r.blob(), nombre: nombreDe(r.headers.get('content-disposition'), ids.length > 1 ? 'fototeca.zip' : 'foto.jpg') }
}

export interface ResultadoSubida {
  nuevas: Foto[]
  duplicadas: { nombre: string; id: number; en_papelera: boolean }[]
  rechazadas: { nombre: string; motivo: string }[]
  /** Si eran de una Semana de Representación: lo que registró la semana. */
  semana?: { fotos: string[]; repetidas: number[] } | null
}

/**
 * Sube fotos en tandas (una petición cada pocas fotos) informando el avance en
 * bytes: con 200 fotos del celular, una sola petición tardaría minutos sin decir
 * nada y un corte la perdería entera.
 */
export async function subirFotos(
  archivos: File[],
  albumId: number | null,
  alAvanzar: (enviado: number, total: number) => void,
  /** Fotos de una Semana de Representación: van también a su banco de trabajo y a su actividad. */
  semana?: { id: number; actividad: string } | null,
): Promise<ResultadoSubida> {
  const total = archivos.reduce((s, a) => s + a.size, 0)
  const salida: ResultadoSubida = { nuevas: [], duplicadas: [], rechazadas: [] }
  let hecho = 0
  const tandas: File[][] = []
  let tanda: File[] = []
  let peso = 0
  for (const a of archivos) {
    if (tanda.length && (tanda.length >= 6 || peso + a.size > 60 * 1024 * 1024)) {
      tandas.push(tanda)
      tanda = []
      peso = 0
    }
    tanda.push(a)
    peso += a.size
  }
  if (tanda.length) tandas.push(tanda)
  for (const t of tandas) {
    const datos = new FormData()
    for (const a of t) datos.append('archivos', a)
    if (albumId) datos.append('album_id', String(albumId))
    if (semana) {
      datos.append('semana_id', String(semana.id))
      datos.append('actividad', semana.actividad)
    }
    const r = await new Promise<ResultadoSubida>((resolver, rechazar) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/fototeca/subir')
      const tk = token()
      if (tk) xhr.setRequestHeader('Authorization', `Bearer ${tk}`)
      xhr.upload.onprogress = (e) => alAvanzar(hecho + (e.lengthComputable ? e.loaded : 0), total)
      xhr.onload = () => {
        if (xhr.status === 401) cerrarSesion()
        let cuerpo: unknown = null
        try {
          cuerpo = JSON.parse(xhr.responseText)
        } catch {
          /* sin JSON */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolver(cuerpo as ResultadoSubida)
        else rechazar(new Error((cuerpo as { detail?: string } | null)?.detail ?? `Error ${xhr.status}`))
      }
      xhr.onerror = () => rechazar(new Error('Se cortó la conexión con el servidor.'))
      xhr.send(datos)
    })
    hecho += t.reduce((s, a) => s + a.size, 0)
    alAvanzar(hecho, total)
    salida.nuevas.push(...r.nuevas)
    salida.duplicadas.push(...r.duplicadas)
    salida.rechazadas.push(...r.rechazadas)
  }
  return salida
}

// --- Geometría (la de servicios/fototeca.py) ------------------------------------------------

export function escalaEnderezar(ancho: number, alto: number, grados: number): number {
  if (!grados || ancho <= 0 || alto <= 0) return 1
  const a = (Math.abs(grados) * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return Math.min(ancho / (ancho * c + alto * s), alto / (ancho * s + alto * c))
}

/**
 * Dibuja en un lienzo la foto con girar, voltear y enderezar (sin el recorte: el
 * editor lo muestra encima). El lienzo queda con el tamaño del encuadre.
 */
export function dibujarEncuadre(lienzo: HTMLCanvasElement, img: HTMLImageElement, a: Ajustes) {
  const rotar = a.rotar ?? 0
  const giradaW = rotar === 90 || rotar === 270 ? img.naturalHeight : img.naturalWidth
  const giradaH = rotar === 90 || rotar === 270 ? img.naturalWidth : img.naturalHeight
  const e = escalaEnderezar(giradaW, giradaH, a.enderezar ?? 0)
  const w = Math.max(1, Math.floor(giradaW * e))
  const h = Math.max(1, Math.floor(giradaH * e))
  lienzo.width = w
  lienzo.height = h
  const ctx = lienzo.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.translate(w / 2, h / 2)
  // Enderezar (horario), luego voltear y girar: en el lienzo las transformaciones
  // se componen al revés de como se aplican a la imagen.
  if (a.enderezar) ctx.rotate((a.enderezar * Math.PI) / 180)
  ctx.scale(a.voltear ? -1 : 1, a.voltear_v ? -1 : 1)
  ctx.rotate((rotar * Math.PI) / 180)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  ctx.restore()
}

/** El filtro CSS equivalente a brillo / contraste / saturación (vista previa en vivo). */
export function filtroCss(a: Ajustes): string {
  return `brightness(${a.brillo ?? 1}) contrast(${a.contraste ?? 1}) saturate(${a.saturacion ?? 1})`
}

/** El mayor recorte centrado de proporción `prop` (en píxeles del encuadre w×h), en relativo. */
export function recorteCentrado(w: number, h: number, prop: number): [number, number, number, number] {
  if (w / h > prop) {
    const rw = (h * prop) / w
    return [(1 - rw) / 2, 0, rw, 1]
  }
  const rh = w / prop / h
  return [0, (1 - rh) / 2, 1, rh]
}

// --- Fechas ---------------------------------------------------------------------------------

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «2026-09» → «septiembre de 2026». */
export const nombreMes = (m: string) => {
  const [a, n] = m.split('-')
  return `${MESES[Number(n) - 1] ?? n} de ${a}`
}

/** La fecha local (AAAA-MM-DD) de `tomada_en` (que ya llega con la zona de la entidad). */
export const diaDe = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
/** «2026-09-14» → «lunes 14 de septiembre de 2026». */
export function nombreDia(d: string): string {
  if (!d) return 'Sin fecha'
  const [a, m, n] = d.split('-').map(Number)
  const dia = new Date(a, m - 1, n)
  return `${DIAS[dia.getDay()]} ${n} de ${MESES[m - 1]} de ${a}`
}

export const pesoLegible = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

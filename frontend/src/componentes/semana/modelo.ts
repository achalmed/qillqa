/**
 * SEMANA DE REPRESENTACIÓN — tipos y utilidades del módulo (2026-10-02).
 *
 * Cada fila (actividad, pedido, foto) trae en `datos` el diccionario que el
 * generador del informe lee de su YAML (marco_documental/generadores/informe-sr,
 * docs/arquitectura.md §3): la web edita esas mismas claves, sin traducirlas, y
 * el servidor las exporta tal cual al expediente (backend/app/servicios/semanas_sr.py).
 */
import { apiPdf, descargarArchivo } from '../../api'
import type { ArchivoVisor } from '../PanelArchivosVisor'

export type Datos = Record<string, unknown>

export interface Opcion {
  valor: string
  etiqueta: string
}

export interface Vocabularios {
  sectores: Opcion[]
  tipos_actividad: Opcion[]
  prioridades: string[]
  estados_pedido: string[]
  estados_informe: string[]
  tipos_foto: string[]
  estados_foto: string[]
  estados_semana: string[]
}

export interface DocRef {
  id: number
  codigo: string | null
  estado: string
  serie: string
  numero: number | null
}

export interface Fila {
  id: number
  codigo: string
  datos: Datos
  documento?: DocRef | null
}

export interface Pdf {
  nombre: string
  version: string
  estado: string
  una_columna: boolean
  tamano: number
}

export interface Generacion {
  estado: 'en_curso' | 'listo' | 'error' | 'sin_generar'
  inicio?: string
  fin?: string
  edicion?: string
  aprobar?: boolean
  pdfs?: string[]
  avisos?: string[]
  registro?: string
  error?: string | null
  isr?: { id: number; codigo: string | null } | null
}

export interface SemanaDetalle {
  id: number
  codigo: string
  numero: number
  carpeta: string
  estado: string
  version: number
  expediente: Datos
  informe: Datos
  resto: { actividades?: Datos; pedidos?: Datos; fotos?: Datos }
  actividades: Fila[]
  pedidos: Fila[]
  fotos: Fila[]
  isr: DocRef | null
  pendientes: string[]
  pdfs: Pdf[]
  generacion: Generacion | null
}

export type Avisar = (tipo: 'success' | 'error' | 'info', texto: string) => void

export interface PropsSeccion {
  s: SemanaDetalle
  voc: Vocabularios
  recargar: () => Promise<void>
  avisar: Avisar
}

/** Texto de un valor cualquiera (los YAML traen null, números y listas). */
export const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
export const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(texto) : v ? [texto(v)] : [])

/** Los días de la semana: `actividades.yaml → dias` ({fecha, nombre, ambito}). */
export interface Dia {
  fecha: string
  nombre: string
  ambito: string
}
export const diasDe = (s: SemanaDetalle): Dia[] =>
  ((s.resto.actividades?.dias as Dia[] | undefined) ?? []).map((d) => ({
    fecha: texto(d.fecha),
    nombre: texto(d.nombre),
    ambito: texto(d.ambito),
  }))

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaLocal = (iso: string) => new Date(`${iso}T12:00:00`)
export const nombreDia = (iso: string) => (iso ? DIAS[fechaLocal(iso).getDay()] : '')
/** Solo la primera letra en mayúscula: «Lunes 21 de septiembre». */
export const conMayuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)
/** El tema de la semana o, si el expediente no lo trae, el de su carpeta («educacion superior»). */
export const temaDe = (s: SemanaDetalle) => texto(s.expediente.tema) || conMayuscula(s.carpeta.split('_').slice(2).join('_').replace(/-/g, ' '))
/** «lunes 21 de septiembre». */
export const fechaLarga = (iso: string) => {
  if (!iso) return ''
  const d = fechaLocal(iso)
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}
/** Las fechas del periodo, una por día (para armar los días de la semana). */
export function fechasEntre(inicio: string, fin: string): string[] {
  if (!inicio || !fin) return []
  const salida: string[] = []
  const d = fechaLocal(inicio)
  const f = fechaLocal(fin)
  for (let i = 0; d <= f && i < 15; i++) {
    salida.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return salida
}

export const etiquetaDe = (opciones: Opcion[], valor: unknown) =>
  opciones.find((o) => o.valor === valor)?.etiqueta ?? texto(valor)

export const COLOR_PRIORIDAD: Record<string, 'error' | 'warning' | 'default'> = {
  urgente: 'error',
  alta: 'warning',
  ordinaria: 'default',
}

/** Los PDF de una semana para la lista del visor completo (como Outlook, igual que Documentos). */
export function archivosSemana(carpeta: string, pdfs: Pdf[], extra: ArchivoVisor[] = []): ArchivoVisor[] {
  const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
  return [
    ...extra,
    ...pdfs.map((p): ArchivoVisor => {
      const ruta = `/api/informes-sr/${encodeURIComponent(carpeta)}/${encodeURIComponent(p.nombre)}`
      return {
        clave: p.nombre,
        nombre: p.nombre,
        grupo: p.una_columna ? 'Para celular' : 'Informe',
        detalle: `v${p.version} · ${p.estado} · ${kb(p.tamano)}`,
        obtener: () => apiPdf(ruta),
        descargar: () => void descargarArchivo(ruta, p.nombre),
      }
    }),
  ]
}

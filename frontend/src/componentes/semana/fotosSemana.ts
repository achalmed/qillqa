/**
 * FOTOS DE LA SEMANA — el modelo de la vista que escala a cientos de fotos
 * (2026-10-06; Fotos.tsx, VisorFoto.tsx, OrdenInforme.tsx).
 *
 * Una semana trae 180–230 fotos. Se agrupan como se tomaron —día → actividad—,
 * porque así se revisan (una actividad tras otra) y así las lee el generador del
 * informe: las fotos públicas y elegidas de cada actividad, en el orden de
 * fotos.yaml (la primera va en la ficha de la actividad; las de todas las
 * actividades del día forman la galería del día).
 */
import { api } from '../../api'
import { type Datos, type Fila, type SemanaDetalle, conMayuscula, fechaLarga, lista, texto } from './modelo'

export interface FotoS {
  codigo: string
  datos: Datos
  /** Ancho/alto (de la medida al subir; 1,5 si no se midió). */
  proporcion: number
  actividad: string
}

export interface GrupoActividad {
  codigo: string
  titulo: string
  detalle: string
  fotos: FotoS[]
}

export interface GrupoDia {
  clave: string
  titulo: string
  actividades: GrupoActividad[]
}

export type Filtro = 'todas' | 'sin_actividad' | 'sin_pie' | 'revisar' | 'informe' | 'reservada' | 'con_relacion'

export const FILTROS: { clave: Filtro; etiqueta: string; ayuda: string }[] = [
  { clave: 'todas', etiqueta: 'Todas', ayuda: 'Todas las fotos de la semana' },
  { clave: 'revisar', etiqueta: 'Por revisar', ayuda: 'Recién subidas: decidir si son públicas o reservadas' },
  { clave: 'sin_actividad', etiqueta: 'Sin actividad', ayuda: 'No van al informe hasta tener actividad' },
  { clave: 'sin_pie', etiqueta: 'Sin pie', ayuda: 'El informe imprime el pie bajo cada foto' },
  { clave: 'informe', etiqueta: 'En el informe', ayuda: 'Públicas y elegidas: las que llegan al PDF' },
  { clave: 'reservada', etiqueta: 'Reservadas', ayuda: 'No salen en el informe (menores, consentimiento…)' },
  { clave: 'con_relacion', etiqueta: 'Con pedido', ayuda: 'Relacionadas con un pedido o una institución' },
]

export const enInforme = (d: Datos) => d.estado === 'publica' && Boolean(d.seleccion)

export function cumple(f: FotoS, filtro: Filtro, actividades: Set<string>): boolean {
  const d = f.datos
  switch (filtro) {
    case 'sin_actividad':
      return !f.actividad || !actividades.has(f.actividad)
    case 'sin_pie':
      return !texto(d.pie).trim()
    case 'revisar':
      return d.estado === 'revisar'
    case 'informe':
      return enInforme(d)
    case 'reservada':
      return d.estado === 'reservada'
    case 'con_relacion':
      return lista(d.pedidos).length > 0 || lista(d.instituciones).length > 0
    default:
      return true
  }
}

export const aFotoS = (f: Fila): FotoS => {
  const ancho = Number(f.datos.ancho) || 0
  const alto = Number(f.datos.alto) || 0
  return { codigo: f.codigo, datos: f.datos, proporcion: ancho && alto ? ancho / alto : 1.5, actividad: texto(f.datos.actividad) }
}

/** Las actividades en el orden de la semana: día y hora (orden_dia). */
export function actividadesOrdenadas(s: SemanaDetalle): Fila[] {
  return [...s.actividades].sort((a, b) =>
    texto(a.datos.fecha).localeCompare(texto(b.datos.fecha)) ||
    (Number(a.datos.orden_dia) || 99) - (Number(b.datos.orden_dia) || 99) ||
    a.codigo.localeCompare(b.codigo))
}

export const SIN_ACTIVIDAD = '__sin__'

/** Día → actividad → fotos (en el orden del registro, que es el del informe). Lo que no tiene
 *  actividad va primero: es lo que hay que clasificar. Los grupos vacíos no se devuelven. */
export function agrupar(s: SemanaDetalle, fotos: FotoS[]): GrupoDia[] {
  const acts = actividadesOrdenadas(s)
  const conocidas = new Set(acts.map((a) => a.codigo))
  const porAct = new Map<string, FotoS[]>()
  for (const f of fotos) {
    const k = conocidas.has(f.actividad) ? f.actividad : SIN_ACTIVIDAD
    porAct.set(k, [...(porAct.get(k) ?? []), f])
  }
  const dias: GrupoDia[] = []
  const sin = porAct.get(SIN_ACTIVIDAD)
  if (sin?.length) {
    dias.push({ clave: SIN_ACTIVIDAD, titulo: 'Sin actividad', actividades: [{ codigo: SIN_ACTIVIDAD, titulo: 'Por clasificar', detalle: 'Asígnelas a su actividad: sin ella no llegan al informe', fotos: sin }] })
  }
  for (const a of acts) {
    const del = porAct.get(a.codigo)
    if (!del?.length) continue
    const fecha = texto(a.datos.fecha)
    let dia = dias.find((d) => d.clave === fecha)
    if (!dia) {
      dia = { clave: fecha, titulo: fecha ? conMayuscula(fechaLarga(fecha)) : 'Sin fecha', actividades: [] }
      dias.push(dia)
    }
    const hora = [texto(a.datos.hora_inicio), texto(a.datos.hora_fin)].filter(Boolean).join('–')
    const lugar = [texto(a.datos.localidad), texto(a.datos.distrito)].filter(Boolean).join(', ')
    dia.actividades.push({ codigo: a.codigo, titulo: texto(a.datos.titulo), detalle: [hora, lugar].filter(Boolean).join(' · '), fotos: del })
  }
  return dias
}

export interface Lote {
  cambios?: Datos
  sumar?: { pedidos?: string[]; instituciones?: string[] }
  pie_de_actividad?: boolean
  fototeca?: boolean
}

export interface ResumenLote {
  cambiadas: number
  fototeca: { nuevas: number; ya_estaban: number; sin_original: number }
}

/** Cambia varias fotos en UNA petición (api/semanas_sr.py → fotos-lote). */
export const cambiarLote = (semanaId: number, codigos: string[], lote: Lote) =>
  api<ResumenLote>(`/api/semanas/${semanaId}/fotos-lote`, { method: 'POST', body: JSON.stringify({ codigos, ...lote }) })

export const rutaMiniatura = (semanaId: number, codigo: string) => `/api/semanas/${semanaId}/fotos/${codigo}/miniatura`
export const rutaVista = (semanaId: number, codigo: string) => `/api/semanas/${semanaId}/fotos/${codigo}/vista`

/**
 * Estilo del MAPA DE RELACIONES, común al mapa completo (paginas/Mapa.tsx) y a
 * la ventanita del mapa local (componentes/grafo/MapaLocal.tsx).
 *
 * Paleta sobria (Edison 2026-10-05: «los colores parecen neón»): tonos
 * apagados, sin halos salvo en lo elegido; el fondo claro es el de omisión y
 * el oscuro, una opción. Desde el rediseño tipo macOS (2026-10-19) los colores
 * salen de las dos paletas de `paleta.ts` (clara y oscura) y de hex neutros
 * apagados; el vino y el dorado de la marca ya no se usan en la web.
 *
 * Dibujo en DOS PASADAS (Edison 2026-10-06: «que las etiquetas no interfieran
 * visualmente con los nodos»): `dibujarNodo` pinta solo el punto y
 * `dibujarEtiquetas`, al final de cada cuadro, los rótulos con un halo del
 * color del fondo; un rótulo que taparía otro punto u otro rótulo prueba otra
 * posición (abajo, arriba, a la derecha, a la izquierda) y, si ninguna cabe,
 * no se dibuja. Los puntos arrastrados quedan FIJOS donde se sueltan (marca
 * pequeña) hasta que se sueltan con doble clic o «Reordenar».
 */
import type { CorrespondenciaNodo, RespuestaDoc } from '../../correspondencia'
import { PALETA_CLARA, PALETA_OSCURA } from '../../paleta'

export type TipoNodo =
  | 'documento'
  | 'externo'
  | 'entrada'
  | 'archivo'
  | 'proyecto'
  | 'semana'
  | 'pedido'
  | 'norma'
  | 'libro'
  | 'persona'
  | 'institucion'
  | 'usuario'
  | 'rendicion'

export interface Nodo {
  id: string
  tipo: TipoNodo
  subtipo: string
  etiqueta: string
  titulo: string
  estado?: string
  fecha?: string
  ruta?: string
  institucion?: string
  grado: number
  /** Archivos (solo en el mapa local): su URL de la API, nombre, categoría y
   * documento al que pertenecen (backend/app/servicios/grafo.py). */
  archivo?: string
  nombre?: string
  categoria?: string
  documento?: number
  /** Norma: su enlace oficial, si el catálogo lo tiene. Libro: su cita APA. */
  url?: string
  cita?: string
  /** Citada en el texto en pantalla, aún sin guardar (mapa local). */
  pendiente?: boolean
  /** Correspondencia (2026-10-19; la misma que Estadísticas, src/correspondencia.ts): en
   * instituciones y personas, lo que se les envió y respondieron; en un oficio enviado, su respuesta. */
  correspondencia?: CorrespondenciaNodo
  respuesta?: RespuestaDoc
  x?: number
  y?: number
  vx?: number
  vy?: number
  /** Fijado por la persona al arrastrarlo. */
  fx?: number
  fy?: number
}
export interface Arista {
  source: string | Nodo
  target: string | Nodo
  tipo: string
  fiable: boolean
  etiqueta: string
}
export interface DatosGrafo {
  nodos: Nodo[]
  aristas: Arista[]
}

export const idDe = (extremo: string | Nodo) => (typeof extremo === 'string' ? extremo : extremo.id)

export type TemaMapa = 'claro' | 'oscuro'

// Un color apagado por tipo (2026-10-19, rediseño macOS): los roles de la paleta
// (tinta, grises, arena, azul apagado) y, para el resto, neutros de la misma
// familia (taupe, salvia, piedra, lavanda gris, pizarra, petróleo, malva), cada
// uno con su versión oscura más luminosa.
const C = PALETA_CLARA
const O = PALETA_OSCURA
export const TIPOS: { tipo: TipoNodo; nombre: string; claro: string; oscuro: string }[] = [
  { tipo: 'proyecto', nombre: 'Proyectos de ley', claro: C.primario, oscuro: O.primario },
  { tipo: 'documento', nombre: 'Documentos', claro: C.textoSecundario, oscuro: O.textoSecundario },
  { tipo: 'externo', nombre: 'Documentos externos', claro: C.textoTenue, oscuro: O.textoTenue },
  // Bandeja de entrada (2026-10-06): lo recibido, en el arena de atención.
  { tipo: 'entrada', nombre: 'Documentos recibidos', claro: C.aviso, oscuro: O.aviso },
  { tipo: 'archivo', nombre: 'Archivos (firmado, cargos, adjuntos)', claro: '#8C7B6B', oscuro: '#B5A696' }, // taupe
  { tipo: 'semana', nombre: 'Semanas de representación', claro: '#5F8A6B', oscuro: '#8FB79B' }, // salvia
  { tipo: 'pedido', nombre: 'Pedidos de la semana', claro: '#7E9470', oscuro: '#AEBE9F' }, // oliva apagado
  // Citas del texto (2026-10-06): normas y obras (de Zotero; las antiguas, de Calibre).
  { tipo: 'norma', nombre: 'Normas citadas', claro: '#6F7260', oscuro: '#A8AB97' }, // piedra
  { tipo: 'libro', nombre: 'Obras citadas', claro: '#6F6A8A', oscuro: '#A8A3C4' }, // lavanda gris
  { tipo: 'persona', nombre: 'Personas', claro: '#5B6B85', oscuro: '#9FB0C9' }, // pizarra
  { tipo: 'institucion', nombre: 'Instituciones', claro: '#4A7378', oscuro: '#8AB1B5' }, // petróleo apagado
  { tipo: 'usuario', nombre: 'Equipo', claro: C.info, oscuro: O.info },
  // Rendición de cuentas (2026-10-18): unida a su semana, su memorando, su comisionado y la otra de su comisión.
  { tipo: 'rendicion', nombre: 'Rendiciones de cuentas', claro: '#8E6B74', oscuro: '#C19AA3' }, // malva apagado
]

export const coloresDe = (tema: TemaMapa) =>
  Object.fromEntries(TIPOS.map((t) => [t.tipo, t[tema]])) as Record<TipoNodo, string>

// El lienzo toma los roles de cada paleta; los velos son hex + alfa
// (1A ≈ 10 %, 33 ≈ 20 %, 8C ≈ 55 %, EB ≈ 92 %) para no escribir rgba a mano.
export const LIENZO = {
  claro: {
    fondo: C.fondo,
    texto: C.texto,
    tenue: C.textoTenue,
    linea: `${C.texto}33`,
    lineaViva: `${C.primario}8C`,
    particula: `${C.primario}B3`,
    panel: `${C.superficie}EB`,
    borde: C.borde,
    acento: C.primario,
    sobreAcento: C.sobrePrimario,
    sombra: C.sombraFlotante,
  },
  oscuro: {
    fondo: O.fondo,
    texto: O.texto,
    tenue: O.textoTenue,
    linea: `${O.texto}33`,
    lineaViva: `${O.primario}8C`,
    particula: `${O.primario}B3`,
    panel: `${O.superficie}E6`,
    borde: O.borde,
    acento: O.primario,
    sobreAcento: O.sobrePrimario,
    sombra: O.sombraFlotante,
  },
} as const

export const radio = (n: Nodo) =>
  n.tipo === 'archivo' ? 3 : 3 + Math.sqrt(n.grado || 0) * 1.5 + (n.tipo === 'proyecto' ? 2 : 0)

export const fijado = (n: Nodo) => n.fx !== undefined && n.fx !== null

/** Suelta un punto fijado: vuelve a moverse con la física. */
export function soltar(n: Nodo) {
  n.fx = undefined
  n.fy = undefined
}

/** Una atracción suave hacia el centro: con ella los puntos pueden apartarse
 * a mano con libertad, pero lo suelto no se va lejos ni se dispersa. Es una
 * fuerza de d3 (función de `alpha` con `initialize`). */
export function atraccionAlCentro(k = 0.035) {
  let nodos: Nodo[] = []
  const fuerza = (alpha: number) => {
    for (const n of nodos) {
      if (fijado(n)) continue
      n.vx = (n.vx ?? 0) - (n.x ?? 0) * k * alpha
      n.vy = (n.vy ?? 0) - (n.y ?? 0) * k * alpha
    }
  }
  fuerza.initialize = (ns: Nodo[]) => {
    nodos = ns
  }
  return fuerza
}

/** Dibuja un nodo: círculo (rombo las instituciones, cuadrado los externos,
 * hoja con la esquina doblada los archivos), anillo si está elegido y una
 * marca pequeña si está fijado. El rótulo va aparte (`dibujarEtiquetas`). */
export function dibujarNodo(
  n: Nodo,
  ctx: CanvasRenderingContext2D,
  escala: number,
  o: {
    colores: Record<TipoNodo, string>
    lienzo: (typeof LIENZO)[TemaMapa]
    apagado: boolean
    elegido: boolean
  },
) {
  const r = radio(n)
  const x = n.x ?? 0
  const y = n.y ?? 0
  ctx.save()
  // Lo citado en pantalla y aún sin guardar, más tenue (mapa local).
  ctx.globalAlpha = o.apagado ? 0.14 : n.pendiente ? 0.5 : 1
  if (o.elegido) {
    ctx.shadowColor = o.colores[n.tipo]
    ctx.shadowBlur = 8
  }
  ctx.beginPath()
  if (n.tipo === 'institucion') {
    ctx.moveTo(x, y - r * 1.15)
    ctx.lineTo(x + r * 1.15, y)
    ctx.lineTo(x, y + r * 1.15)
    ctx.lineTo(x - r * 1.15, y)
    ctx.closePath()
  } else if (n.tipo === 'externo') {
    ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7)
  } else if (n.tipo === 'archivo') {
    // Hoja: más alta que ancha, con la esquina superior derecha doblada.
    const w = r * 0.8
    const h = r * 1.05
    const d = r * 0.5
    ctx.moveTo(x - w, y - h)
    ctx.lineTo(x + w - d, y - h)
    ctx.lineTo(x + w, y - h + d)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x - w, y + h)
    ctx.closePath()
  } else {
    ctx.arc(x, y, r, 0, 2 * Math.PI)
  }
  ctx.fillStyle = o.colores[n.tipo]
  ctx.fill()
  ctx.shadowBlur = 0
  // Borde fino del color del fondo: separa los puntos que se tocan.
  ctx.lineWidth = 0.8 / escala
  ctx.strokeStyle = o.lienzo.fondo
  ctx.stroke()
  if (o.elegido) {
    ctx.lineWidth = 1.5 / escala
    ctx.strokeStyle = o.lienzo.acento
    ctx.beginPath()
    ctx.arc(x, y, r + 3.5 / escala + 1.5, 0, 2 * Math.PI)
    ctx.stroke()
  }
  if (fijado(n)) {
    // Fijado a mano: un punto pequeño del color de acento arriba a la derecha.
    const m = Math.max(1.6 / escala, 0.9)
    ctx.beginPath()
    ctx.arc(x + r * 0.85, y - r * 0.85, m, 0, 2 * Math.PI)
    ctx.fillStyle = o.lienzo.acento
    ctx.fill()
    ctx.lineWidth = 0.8 / escala
    ctx.strokeStyle = o.lienzo.fondo
    ctx.stroke()
  }
  ctx.restore()
}

/** Tamaño del rótulo EN PANTALLA (px): el mismo con cualquier acercamiento. */
const TAM_ROTULO = 11

type Caja = { x0: number; y0: number; x1: number; y1: number }
const chocan = (a: Caja, b: Caja) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/**
 * Segunda pasada: los rótulos, encima de todo pero sin tapar ningún punto.
 * Prioridad: el elegido y el que está bajo el cursor (siempre se dibujan),
 * luego los proyectos y después los de más conexiones. Se llama desde
 * `onRenderFramePost` con los nodos visibles.
 */
export function dibujarEtiquetas(
  nodos: Nodo[],
  ctx: CanvasRenderingContext2D,
  escala: number,
  o: {
    lienzo: (typeof LIENZO)[TemaMapa]
    /** ¿Lleva rótulo este nodo? (según acercamiento, iluminación, tamaño…) */
    rotular: (n: Nodo) => boolean
    /** Los que se rotulan siempre (elegido, bajo el cursor, el foco). */
    siempre?: Set<string>
  },
) {
  // Lo que se ve del lienzo, en coordenadas del grafo: fuera no se rotula.
  const t = ctx.getTransform()
  const vx0 = -t.e / t.a
  const vy0 = -t.f / t.d
  const vx1 = (ctx.canvas.width - t.e) / t.a
  const vy1 = (ctx.canvas.height - t.f) / t.d
  const margen = 40 / escala
  const enVista = nodos.filter((n) => {
    const x = n.x ?? 0
    const y = n.y ?? 0
    return x > vx0 - margen && x < vx1 + margen && y > vy0 - margen && y < vy1 + margen
  })

  // Cajas de los puntos, en una rejilla para no compararlas todas con todas.
  const celda = 60 / escala
  const rejilla = new Map<string, { id: string; c: Caja }[]>()
  const clave = (i: number, j: number) => `${i},${j}`
  for (const n of enVista) {
    const r = radio(n) + 1.5 / escala
    const c = { x0: (n.x ?? 0) - r, y0: (n.y ?? 0) - r, x1: (n.x ?? 0) + r, y1: (n.y ?? 0) + r }
    const k = clave(Math.floor((n.x ?? 0) / celda), Math.floor((n.y ?? 0) / celda))
    if (!rejilla.has(k)) rejilla.set(k, [])
    rejilla.get(k)!.push({ id: n.id, c })
  }
  const tapaUnPunto = (c: Caja, propio: string) => {
    for (let i = Math.floor(c.x0 / celda) - 1; i <= Math.floor(c.x1 / celda) + 1; i++) {
      for (let j = Math.floor(c.y0 / celda) - 1; j <= Math.floor(c.y1 / celda) + 1; j++) {
        for (const p of rejilla.get(clave(i, j)) ?? []) if (p.id !== propio && chocan(c, p.c)) return true
      }
    }
    return false
  }

  const siempre = o.siempre ?? new Set<string>()
  const candidatos = enVista
    .filter((n) => siempre.has(n.id) || o.rotular(n))
    .sort(
      (a, b) =>
        Number(siempre.has(b.id)) - Number(siempre.has(a.id)) ||
        Number(b.tipo === 'proyecto') - Number(a.tipo === 'proyecto') ||
        (b.grado || 0) - (a.grado || 0),
    )

  const tam = TAM_ROTULO / escala
  const pad = 2 / escala
  const puestas: Caja[] = []
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const n of candidatos) {
    const texto = n.etiqueta.length > 34 ? `${n.etiqueta.slice(0, 32)}…` : n.etiqueta
    const fuerte = n.tipo === 'proyecto' || siempre.has(n.id)
    ctx.font = `${fuerte ? 600 : 500} ${tam}px Inter, system-ui, sans-serif`
    const w = ctx.measureText(texto).width
    const h = tam * 1.2
    const r = radio(n)
    const x = n.x ?? 0
    const y = n.y ?? 0
    const sep = 3 / escala
    // Posiciones a probar: abajo, arriba, derecha, izquierda (x = borde izquierdo).
    const opciones = [
      { x: x - w / 2, y: y + r + sep + h / 2 },
      { x: x - w / 2, y: y - r - sep - h / 2 },
      { x: x + r + sep, y },
      { x: x - r - sep - w, y },
    ]
    const caja = (p: { x: number; y: number }): Caja => ({ x0: p.x - pad, y0: p.y - h / 2 - pad, x1: p.x + w + pad, y1: p.y + h / 2 + pad })
    let elegida = opciones.find((p) => {
      const c = caja(p)
      return !puestas.some((q) => chocan(c, q)) && !tapaUnPunto(c, n.id)
    })
    if (!elegida && siempre.has(n.id)) elegida = opciones[0]
    if (!elegida) continue
    puestas.push(caja(elegida))
    // Halo del color del fondo: el texto se lee aunque cruce una línea.
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
    ctx.lineWidth = 3.5 / escala
    ctx.strokeStyle = o.lienzo.fondo
    ctx.strokeText(texto, elegida.x, elegida.y)
    ctx.globalAlpha = 0.9
    ctx.fillStyle = o.lienzo.texto
    ctx.fillText(texto, elegida.x, elegida.y)
  }
  ctx.restore()
}

/** Zona sensible al cursor: un poco más grande que el punto. */
export function zonaNodo(n: Nodo, color: string, ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(n.x ?? 0, n.y ?? 0, radio(n) + 3, 0, 2 * Math.PI)
  ctx.fill()
}

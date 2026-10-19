// Organigrama GRÁFICO de una institución: cajas conectadas con líneas, con
// zoom (rueda, pellizco y botones), paneo (arrastrar) y cajas clicables. Sin
// librerías de gráficos.
//
// Diseño (rediseño 2026-10-06: «mejorar visualmente los organigramas»), a la
// manera del organigrama oficial del ROF:
//  - JERARQUÍA a simple vista: la entidad (raíz) va en una caja mayor rellena
//    de la tinta (primario); la Alta Dirección, en caja propia con borde de la
//    tinta; el resto, en tarjetas de superficie con un tinte tenue del color de
//    su categoría (leyenda abajo a la izquierda). Rediseño macOS 2026-10-19:
//    sin franjas de color ni vino ni dorado; tonos apagados de paleta.ts.
//  - ÓRGANOS LATERALES: control, defensa jurídica, asesoramiento, apoyo y
//    comisiones que no tienen dependencias cuelgan a los lados del TRONCO
//    (entre el órgano y sus órganos de línea), como en el ROF; si un órgano
//    solo tiene laterales, van en la fila de siempre.
//  - DISTRIBUCIÓN: en la vista vertical, cuando un órgano tiene más de cuatro
//    hijos sin dependencias (o desde tres si todos lo son), esas hojas se
//    APILAN en columnas compactas agrupadas por categoría (con su marco y
//    rótulo: «Organismos adscritos · 10»), en vez de una fila interminable. Los adscritos se unen con línea
//    discontinua (vínculo de adscripción).
//  - Conectores ortogonales de esquina redondeada, trazo uniforme.
//  - Contraer / desplegar cada rama (botón al pie de la caja, con el número de
//    dependencias que oculta), «desplegar todo» y «dos niveles».
//  - BUSCAR una unidad: resalta las coincidencias, atenúa el resto, abre las
//    ramas contraídas que la contienen y centra la vista (Intro = siguiente).
//
// Dos orientaciones:
//  - vertical  (arriba→abajo): el clásico, con laterales y columnas compactas.
//  - horizontal (izq→der): la profundidad va a la derecha y los hermanos se
//    APILAN en vertical; para instituciones con muchas dependencias evita el
//    "estirón" horizontal y se lee/imprime mejor en una hoja vertical.
//
// «Imprimir / PDF» arma un SVG del organigrama tal como se ve (con lo
// contraído resumido) y lo abre en una ventana lista para imprimir, escalado
// para entrar en una sola hoja A4 u oficio (texto nítido, vectorial), con el
// mismo diseño, la leyenda y la procedencia.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import InputBase from '@mui/material/InputBase'
import CloseIcon from '@mui/icons-material/Close'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import PrintIcon from '@mui/icons-material/Print'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import SearchIcon from '@mui/icons-material/Search'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import LegendToggleIcon from '@mui/icons-material/LegendToggle'
import useMediaQuery from '@mui/material/useMediaQuery'
import { alpha, useTheme, type SxProps, type Theme } from '@mui/material/styles'
import type { InstitucionDet } from './DetalleInstitucion'
import { ETIQUETA_CATEGORIA } from './DetalleInstitucion'
import { normal, tipoUno } from '../directorio'
import { MODO, PALETA, PALETA_CLARA, type Paleta } from '../paleta'

// --- Colores por categoría (solo de paleta.ts; 2026-10-19, rediseño macOS) ---
// Tinta para la Alta Dirección; arena para asesoramiento; los apagados de la
// paleta (verde azulado, pizarra, azul, salvia) para apoyo, línea, resolutivos
// y desconcentrados; neutros de la misma familia (malva, ciruela gris, piedra,
// taupe, lavanda gris) para control, defensa, programas, proyectos y adscritos,
// cada uno con su versión oscura más luminosa; grises para comisiones y unidades.
const colorCat = (p: Paleta, oscuro: boolean): Record<string, string> => {
  const tono = (claro: string, luminoso: string) => (oscuro ? luminoso : claro)
  return {
    alta_direccion: p.guinda,
    organo_control: tono('#8E6B74', '#C19AA3'),
    organo_defensa: tono('#7A6470', '#B39AAC'),
    organo_asesoramiento: p.aviso,
    organo_apoyo: p.aprobado,
    organo_linea: p.firmado,
    organo_resolutivo: p.info,
    organo_desconcentrado: p.exito,
    programa: tono('#6F7260', '#A8AB97'),
    proyecto: tono('#8C7B6B', '#B5A696'),
    adscrito: tono('#6F6A8A', '#A8A3C4'),
    comision: p.textoSecundario,
    unidad_organica: p.textoTenue,
  }
}
const COLOR_CAT = colorCat(PALETA, MODO === 'oscuro')
const SIN_CATEGORIA = PALETA.apagado
const colorDe = (i: InstitucionDet) => COLOR_CAT[i.categoria] ?? SIN_CATEGORIA
// Color del rótulo (texto): el de la categoría si da contraste; si no, el
// gris tenue de la paleta.
const colorRotulo = (i: InstitucionDet) =>
  COLOR_CAT[i.categoria] && i.categoria !== 'unidad_organica' ? COLOR_CAT[i.categoria] : PALETA.textoTenue
// El papel es blanco en los dos modos: lo que se imprime toma la paleta clara
// (`PAPEL`) y cada color de categoría de pantalla se traduce al suyo (`enPapel`).
const PAPEL = PALETA_CLARA
const COLOR_CAT_PAPEL = colorCat(PAPEL, false)
const A_PAPEL = new Map<string, string>([
  ...Object.keys(COLOR_CAT).map((k): [string, string] => [COLOR_CAT[k], COLOR_CAT_PAPEL[k]]),
  [SIN_CATEGORIA, PAPEL.apagado],
])
const enPapel = (color: string) => A_PAPEL.get(color) ?? color

// Rótulo en plural para el marco de un grupo de hojas apiladas.
const GRUPO_CAT: Record<string, string> = {
  alta_direccion: 'Alta Dirección',
  organo_control: 'Órganos de control',
  organo_defensa: 'Defensa jurídica',
  organo_linea: 'Órganos de línea',
  organo_apoyo: 'Órganos de apoyo',
  organo_asesoramiento: 'Órganos de asesoramiento',
  organo_resolutivo: 'Órganos resolutivos',
  organo_desconcentrado: 'Órganos desconcentrados',
  unidad_organica: 'Unidades orgánicas',
  programa: 'Programas',
  proyecto: 'Proyectos especiales',
  adscrito: 'Organismos adscritos',
  comision: 'Comisiones y consejos',
}

// Órganos que en el ROF cuelgan a los lados del tronco.
const LATERALES = new Set(['organo_control', 'organo_defensa', 'organo_asesoramiento', 'organo_apoyo', 'comision'])

const etiquetaDe = (i: InstitucionDet, esRaiz: boolean) => {
  if (esRaiz && i.tipo) return tipoUno(i.tipo)
  if (i.categoria) return ETIQUETA_CATEGORIA[i.categoria] ?? i.categoria
  return i.tipo ? tipoUno(i.tipo) : ''
}

// --- Geometría ---
type Orient = 'vertical' | 'horizontal'
type Clase = 'raiz' | 'alta' | 'normal' | 'compacta'
const DIM: Record<Clase, { w: number; h: number }> = {
  raiz: { w: 264, h: 86 },
  alta: { w: 220, h: 72 },
  normal: { w: 204, h: 72 },
  compacta: { w: 204, h: 56 },
}
const MARGEN = 16
// Columnas compactas: con más de 4 hojas entre los hijos, o desde 3 si todos
// los hijos son hojas (las subunidades de una dirección, una bajo otra).
const UMBRAL_COLUMNA = 4
const FILAS_MAX = 8 // filas por columna compacta
const ESCALA_MIN = 0.12
const ESCALA_MAX = 2.5

interface NodoArbol {
  inst: InstitucionDet
  hijos: NodoArbol[]
  total: number // dependencias (todas, a cualquier profundidad)
}
interface Caja {
  inst: InstitucionDet
  clase: Clase
  x: number
  y: number
  w: number
  h: number
  total: number
  colapsado: boolean
  salida: { x: number; y: number } | null // dónde va el botón de contraer
}
interface Linea { d: string; discontinua: boolean }
interface Marco { x: number; y: number; w: number; h: number; etiqueta: string; color: string; n: number }
interface Layout {
  ancho: number
  alto: number
  cajas: Caja[]
  lineas: Linea[]
  marcos: Marco[]
  porId: Map<number, Caja>
}

function construir(raiz: InstitucionDet, todas: InstitucionDet[]): NodoArbol {
  const porPadre = new Map<number, InstitucionDet[]>()
  for (const i of todas) {
    if (i.parent_id !== null && i.activo) {
      const l = porPadre.get(i.parent_id) ?? []
      l.push(i)
      porPadre.set(i.parent_id, l)
    }
  }
  porPadre.forEach((l) => l.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)))
  const vistos = new Set<number>() // a prueba de ciclos en los datos
  const rec = (inst: InstitucionDet): NodoArbol => {
    vistos.add(inst.id)
    const hijos = (porPadre.get(inst.id) ?? []).filter((h) => !vistos.has(h.id)).map(rec)
    return { inst, hijos, total: hijos.reduce((s, h) => s + 1 + h.total, 0) }
  }
  return rec(raiz)
}

interface Entrada { nodo: NodoArbol; padre: NodoArbol | null; prof: number }
function indexar(arbol: NodoArbol) {
  const porId = new Map<number, Entrada>()
  const orden: NodoArbol[] = [] // preorden: el orden de lectura del organigrama
  const rec = (n: NodoArbol, padre: NodoArbol | null, prof: number) => {
    porId.set(n.inst.id, { nodo: n, padre, prof })
    orden.push(n)
    n.hijos.forEach((h) => rec(h, n, prof + 1))
  }
  rec(arbol, null, 0)
  return { porId, orden }
}

// Trazo ortogonal con esquinas redondeadas (quita puntos repetidos y
// colineales; el radio se achica en tramos cortos).
type Pt = [number, number]
function trazo(pts: Pt[], r = 8): string {
  const q: Pt[] = []
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.5
  for (const p of pts) {
    const u = q[q.length - 1]
    if (u && igual(u[0], p[0]) && igual(u[1], p[1])) continue
    if (q.length >= 2) {
      const a = q[q.length - 2]
      const b = q[q.length - 1]
      if ((igual(a[0], b[0]) && igual(b[0], p[0])) || (igual(a[1], b[1]) && igual(b[1], p[1]))) {
        q[q.length - 1] = p
        continue
      }
    }
    q.push(p)
  }
  const f = (n: number) => Math.round(n * 10) / 10
  let d = `M ${f(q[0][0])} ${f(q[0][1])}`
  for (let i = 1; i < q.length - 1; i++) {
    const a = q[i - 1], b = q[i], c = q[i + 1]
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1])
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1])
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const p1x = b[0] + ((a[0] - b[0]) / l1) * rr, p1y = b[1] + ((a[1] - b[1]) / l1) * rr
    const p2x = b[0] + ((c[0] - b[0]) / l2) * rr, p2y = b[1] + ((c[1] - b[1]) / l2) * rr
    d += ` L ${f(p1x)} ${f(p1y)} Q ${f(b[0])} ${f(b[1])} ${f(p2x)} ${f(p2y)}`
  }
  const z = q[q.length - 1]
  if (q.length > 1) d += ` L ${f(z[0])} ${f(z[1])}`
  return d
}

// --- Distribución ---
// Se calcula en coordenadas ABSTRACTAS: t (eje transversal, donde van los
// hermanos) y p (profundidad). Al final se proyecta a x/y según la
// orientación. Cada subárbol es un BLOQUE (rectángulo) que se coloca junto a
// sus hermanos; el padre se centra sobre ellos.
interface CajaA { n: NodoArbol; clase: Clase; t: number; p: number; T: number; P: number; salida: Pt | null }
interface ConA { pts: Pt[]; discontinua: boolean }
interface MarcoA { t: number; p: number; T: number; P: number; etiqueta: string; color: string; n: number }
interface Bloque { T: number; P: number; ancla: number; cajas: CajaA[]; con: ConA[]; marcos: MarcoA[] }
// Un elemento de la fila de hijos: su bloque y, por cada hijo que contiene,
// la «cola» del conector (desde la entrada por arriba, p = 0, hasta la caja).
interface Elem { b: Bloque; colas: { pts: Pt[]; discontinua: boolean }[] }

function calcular(arbol: NodoArbol, orient: Orient, colapsados: ReadonlySet<number>): Layout {
  const horiz = orient === 'horizontal'
  const agrupar = !horiz
  const gT = horiz ? 12 : 22 // entre hermanos
  const gP = horiz ? 64 : 48 // entre niveles
  const LAT = 22 // de un lateral al tronco
  const SANG = 26 // sangría de la columna compacta
  const LOMO = 12 // posición del lomo de la columna
  const FILA = 10 // entre cajas apiladas
  const PAD = 10 // marco de grupo
  const CAB = 24 // cabecera del marco (rótulo)
  const tam = (c: Clase) => (horiz ? { T: DIM[c].h, P: DIM[c].w } : { T: DIM[c].w, P: DIM[c].h })
  const visibles = (n: NodoArbol) => (colapsados.has(n.inst.id) ? [] : n.hijos)
  const adscrito = (n: NodoArbol) => n.inst.categoria === 'adscrito'
  const claseDe = (n: NodoArbol): Clase => (n.inst.categoria === 'alta_direccion' ? 'alta' : 'normal')

  const desplazar = (b: Bloque, dt: number, dp: number, destino: Bloque) => {
    for (const c of b.cajas)
      destino.cajas.push({ ...c, t: c.t + dt, p: c.p + dp, salida: c.salida && [c.salida[0] + dt, c.salida[1] + dp] })
    for (const c of b.con) destino.con.push({ ...c, pts: c.pts.map(([t, p]) => [t + dt, p + dp] as Pt) })
    for (const m of b.marcos) destino.marcos.push({ ...m, t: m.t + dt, p: m.p + dp })
  }

  const hoja = (n: NodoArbol, clase: Clase): Bloque => {
    const { T, P } = tam(clase)
    return { T, P, ancla: T / 2, cajas: [{ n, clase, t: 0, p: 0, T, P, salida: n.hijos.length ? [T / 2, P] : null }], con: [], marcos: [] }
  }

  // Hojas apiladas en columnas (solo vertical), con marco si son de una
  // misma categoría.
  const grupo = (miembros: NodoArbol[], etiqueta: string, color: string): Elem => {
    const { T: Tc, P: Pc } = tam('compacta')
    const k = miembros.length
    const nCol = Math.ceil(k / FILAS_MAX)
    const filas = Math.ceil(k / nCol)
    const pad = etiqueta ? PAD : 0
    const cab = etiqueta ? CAB : 8
    const anchoCol = SANG + Tc
    const T = 2 * pad + nCol * anchoCol + (nCol - 1) * gT
    const P = pad + cab + filas * Pc + (filas - 1) * FILA + pad
    const b: Bloque = { T, P, ancla: T / 2, cajas: [], con: [], marcos: [] }
    const colas: Elem['colas'] = []
    miembros.forEach((m, i) => {
      const col = Math.floor(i / filas), fila = i % filas
      const t0 = pad + col * (anchoCol + gT)
      const p0 = pad + cab + fila * (Pc + FILA)
      b.cajas.push({ n: m, clase: 'compacta', t: t0 + SANG, p: p0, T: Tc, P: Pc, salida: m.hijos.length ? [t0 + SANG + Tc, p0 + Pc / 2] : null })
      const lomo = t0 + LOMO
      colas.push({ pts: [[lomo, 0], [lomo, p0 + Pc / 2], [t0 + SANG, p0 + Pc / 2]], discontinua: adscrito(m) })
    })
    if (etiqueta) b.marcos.push({ t: 0, p: 0, T, P, etiqueta, color, n: k })
    return { b, colas }
  }

  const bloque = (n: NodoArbol, clase: Clase): Bloque => {
    const hijos = visibles(n)
    if (!hijos.length) return hoja(n, clase)
    const { T, P } = tam(clase)

    // Laterales (staff) y fila principal.
    let laterales = hijos.filter((h) => LATERALES.has(h.inst.categoria) && visibles(h).length === 0)
    let fila = hijos.filter((h) => !laterales.includes(h))
    if (!fila.length) { fila = hijos; laterales = [] }

    // Elementos de la fila (subárboles, hojas sueltas y grupos apilados).
    const elems: Elem[] = []
    const hojas = fila.filter((h) => visibles(h).length === 0)
    const claveDe = new Map<NodoArbol, string>()
    const soloHojas = hojas.length === fila.length
    if (agrupar && (hojas.length > UMBRAL_COLUMNA || (soloHojas && hojas.length >= 3))) {
      const porCat = new Map<string, NodoArbol[]>()
      for (const h of hojas) porCat.set(h.inst.categoria, [...(porCat.get(h.inst.categoria) ?? []), h])
      for (const h of hojas) claveDe.set(h, (porCat.get(h.inst.categoria)!.length >= 2 ? h.inst.categoria : '~'))
      // Las hojas sueltas de categorías distintas se apilan juntas (sin
      // marco) solo si son muchas; si no, quedan en la fila.
      if (!soloHojas && hojas.filter((h) => claveDe.get(h) === '~').length <= 3)
        for (const h of hojas) if (claveDe.get(h) === '~') claveDe.delete(h)
    }
    const emitidos = new Set<string>()
    for (const h of fila) {
      const clave = claveDe.get(h)
      if (clave !== undefined) {
        if (emitidos.has(clave)) continue
        emitidos.add(clave)
        const miembros = fila.filter((x) => claveDe.get(x) === clave)
        const conMarco = clave !== '~' && clave !== ''
        elems.push(grupo(miembros, conMarco ? GRUPO_CAT[clave] ?? ETIQUETA_CATEGORIA[clave] ?? clave : '', COLOR_CAT[clave] ?? SIN_CATEGORIA))
      } else {
        const b = bloque(h, claseDe(h))
        elems.push({ b, colas: [{ pts: [[b.ancla, 0]], discontinua: adscrito(h) }] })
      }
    }

    // Fila: elementos uno junto a otro; el padre, centrado sobre ellos.
    const dts: number[] = []
    let x = 0
    for (const e of elems) { dts.push(x); x += e.b.T + gT }
    const anchoFila = x - gT
    const c = (dts[0] + elems[0].b.ancla + dts[dts.length - 1] + elems[elems.length - 1].b.ancla) / 2

    // Banda de laterales: de a dos por fila, a izquierda y derecha del tronco.
    const { T: Ts, P: Ps } = tam('normal')
    const pBase = P + Math.round(gP * 0.5)
    const nFilasLat = Math.ceil(laterales.length / 2)
    const hayIzq = laterales.length > 0
    const hayDer = laterales.length > 1
    const finLat = nFilasLat ? pBase + nFilasLat * Ps + (nFilasLat - 1) * (FILA + 4) : P
    const pFila = finLat + gP
    const pBus = pFila - gP / 2

    let minT = Math.min(0, c - T / 2)
    let maxT = Math.max(anchoFila, c + T / 2)
    if (hayIzq) minT = Math.min(minT, c - LAT - Ts)
    if (hayDer) maxT = Math.max(maxT, c + LAT + Ts)
    const s = -minT

    const out: Bloque = { T: maxT - minT, P: 0, ancla: c + s, cajas: [], con: [], marcos: [] }
    out.cajas.push({ n, clase, t: c + s - T / 2, p: 0, T, P, salida: [c + s, P] })
    laterales.forEach((h, i) => {
      const izq = i % 2 === 0
      const pr = pBase + Math.floor(i / 2) * (Ps + FILA + 4)
      const t = izq ? c + s - LAT - Ts : c + s + LAT
      out.cajas.push({ n: h, clase: 'normal', t, p: pr, T: Ts, P: Ps, salida: h.hijos.length ? [t + Ts / 2, pr + Ps] : null })
      out.con.push({ pts: [[c + s, P], [c + s, pr + Ps / 2], [izq ? t + Ts : t, pr + Ps / 2]], discontinua: adscrito(h) })
    })
    let fondo = pFila
    elems.forEach((e, i) => {
      const dt = dts[i] + s
      desplazar(e.b, dt, pFila, out)
      for (const cola of e.colas) {
        const [t0] = cola.pts[0]
        out.con.push({
          pts: [[c + s, P], [c + s, pBus], [t0 + dt, pBus], ...cola.pts.map(([t, p]) => [t + dt, p + pFila] as Pt)],
          discontinua: cola.discontinua,
        })
      }
      fondo = Math.max(fondo, pFila + e.b.P)
    })
    out.P = fondo
    return out
  }

  const raiz = bloque(arbol, 'raiz')
  const proy = (t: number, p: number) => (horiz ? { x: p + MARGEN, y: t + MARGEN } : { x: t + MARGEN, y: p + MARGEN })
  const cajas: Caja[] = raiz.cajas.map((c) => {
    const o = proy(c.t, c.p)
    return {
      inst: c.n.inst,
      clase: c.clase,
      x: o.x,
      y: o.y,
      w: DIM[c.clase].w,
      h: DIM[c.clase].h,
      total: c.n.total,
      colapsado: colapsados.has(c.n.inst.id) && c.n.hijos.length > 0,
      salida: c.salida && proy(c.salida[0], c.salida[1]),
    }
  })
  const lineas: Linea[] = raiz.con.map((c) => ({
    d: trazo(c.pts.map(([t, p]) => { const o = proy(t, p); return [o.x, o.y] as Pt })),
    discontinua: c.discontinua,
  }))
  const marcos: Marco[] = raiz.marcos.map((m) => {
    const o = proy(m.t, m.p)
    return { x: o.x, y: o.y, w: horiz ? m.P : m.T, h: horiz ? m.T : m.P, etiqueta: m.etiqueta, color: m.color, n: m.n }
  })
  const ancho = (horiz ? raiz.P : raiz.T) + 2 * MARGEN
  const alto = (horiz ? raiz.T : raiz.P) + 2 * MARGEN
  return { ancho, alto, cajas, lineas, marcos, porId: new Map(cajas.map((c) => [c.inst.id, c])) }
}

// Categorías presentes (para la leyenda), en el orden del ROF.
function leyendaDe(orden: NodoArbol[]) {
  const presentes = new Set<string>()
  let sinCategoria = false
  orden.forEach((n, i) => {
    if (i === 0) return
    if (n.inst.categoria) presentes.add(n.inst.categoria)
    else sinCategoria = true
  })
  const items = Object.keys(ETIQUETA_CATEGORIA)
    .filter((k) => presentes.has(k))
    .map((k) => ({ clave: k, etiqueta: ETIQUETA_CATEGORIA[k], color: COLOR_CAT[k] ?? SIN_CATEGORIA }))
  for (const k of presentes) if (!(k in ETIQUETA_CATEGORIA)) items.push({ clave: k, etiqueta: k, color: COLOR_CAT[k] ?? SIN_CATEGORIA })
  if (sinCategoria) items.push({ clave: '', etiqueta: 'Sin clasificar', color: SIN_CATEGORIA })
  return { items, adscritos: presentes.has('adscrito') }
}

// --- SVG del organigrama (para imprimir / PDF): el mismo diseño ---
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function envolver(texto: string, maxCar: number, maxLin: number): string[] {
  const lineas: string[] = []
  let actual = ''
  for (const p of texto.split(/\s+/).filter(Boolean)) {
    if (actual && (actual + ' ' + p).length > maxCar) {
      lineas.push(actual)
      actual = p
    } else {
      actual = actual ? actual + ' ' + p : p
    }
  }
  if (actual) lineas.push(actual)
  if (lineas.length > maxLin) {
    lineas.length = maxLin
    const u = lineas[maxLin - 1]
    lineas[maxLin - 1] = (u.length > maxCar - 1 ? u.slice(0, maxCar - 1) : u).replace(/[\s,;.:-]+$/, '') + '…'
  }
  return lineas
}

interface FilaTexto { texto: string; tam: number; peso: number; color: string; mayus?: boolean; derecha?: string }
const FUENTE_SVG = 'Arial, Helvetica, sans-serif'

function cajaSvg(c: Caja, k: number): string {
  const i = c.inst
  const { x, y, w, h } = c
  const color = enPapel(colorDe(i))
  const titulo = (i.siglas ? `${i.siglas} · ` : '') + i.nombre
  let fondo = ''
  let filas: FilaTexto[] = []
  let centrado = true
  let pad = 10
  if (c.clase === 'raiz') {
    fondo = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${PAPEL.guinda}"/>`
    const et = etiquetaDe(i, true)
    if (et) filas.push({ texto: et, tam: 7.5, peso: 600, color: PAPEL.sobrePrimario, mayus: true })
    if (i.siglas) filas.push({ texto: i.siglas, tam: 15, peso: 700, color: PAPEL.sobrePrimario })
    filas.push(...envolver(i.nombre, 40, i.siglas ? 2 : 3).map((t) => ({ texto: t, tam: 10.5, peso: 600, color: PAPEL.sobrePrimario })))
  } else {
    const alta = c.clase === 'alta'
    // Sin franja: la categoría es un tinte tenue (10 %) del color sobre la superficie.
    const tinte = alta ? '' : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" fill-opacity="0.1"/>`
    fondo =
      `<clipPath id="k${k}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/></clipPath>` +
      `<g clip-path="url(#k${k})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${alta ? PAPEL.superficieMedia : PAPEL.superficie}"/>${tinte}</g>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${alta ? alpha(PAPEL.guinda, 0.35) : PAPEL.bordeFuerte}" stroke-width="1"/>`
    if (alta) {
      filas.push({ texto: 'Alta Dirección', tam: 7.5, peso: 700, color: PAPEL.guinda, mayus: true })
      filas.push(...envolver(titulo, 34, 3).map((t) => ({ texto: t, tam: 10, peso: 700, color: PAPEL.texto })))
    } else if (c.clase === 'compacta') {
      centrado = false
      pad = 12
      filas = envolver(titulo, 33, 3).map((t) => ({ texto: t, tam: 9.6, peso: 600, color: PAPEL.texto }))
    } else {
      centrado = false
      pad = 12
      const et = etiquetaDe(i, false)
      if (et || i.siglas) filas.push({ texto: et, tam: 7.5, peso: 700, color: enPapel(colorRotulo(i)), mayus: true, derecha: i.siglas })
      filas.push(...envolver(i.nombre, 31, 3).map((t) => ({ texto: t, tam: 10, peso: 600, color: PAPEL.texto })))
    }
  }
  const total = filas.reduce((s, f) => s + f.tam * 1.25, 0)
  let cur = y + (h - total) / 2 + (c.clase === 'alta' ? 2 : 0)
  const xt = centrado ? x + w / 2 : x + pad
  const ancla = centrado ? 'middle' : 'start'
  const textos = filas
    .map((f) => {
      const base = cur + f.tam * 0.95
      cur += f.tam * 1.25
      const est = `font-family="${FUENTE_SVG}" font-size="${f.tam}" font-weight="${f.peso}" fill="${f.color}"` + (f.mayus ? ' letter-spacing="0.5"' : '')
      return (
        (f.texto ? `<text x="${xt}" y="${base}" text-anchor="${ancla}" ${est}>${esc(f.mayus ? f.texto.toUpperCase() : f.texto)}</text>` : '') +
        (f.derecha
          ? `<text x="${x + w - 8}" y="${base}" text-anchor="end" font-family="${FUENTE_SVG}" font-size="8.5" font-weight="700" fill="${PAPEL.textoSecundario}">${esc(f.derecha)}</text>`
          : '')
      )
    })
    .join('')
  // En la hoja, lo contraído lleva su «+N» (cuántas dependencias resume).
  const resumen =
    c.colapsado && c.salida
      ? (() => {
          const t = `+${c.total}`
          const bw = 10 + t.length * 5.6
          return (
            `<rect x="${c.salida.x - bw / 2}" y="${c.salida.y - 8}" width="${bw}" height="16" rx="8" fill="${PAPEL.guinda}"/>` +
            `<text x="${c.salida.x}" y="${c.salida.y + 3.5}" text-anchor="middle" font-family="${FUENTE_SVG}" font-size="9" font-weight="700" fill="${PAPEL.sobrePrimario}">${t}</text>`
          )
        })()
      : ''
  return `<g>${fondo}${textos}${resumen}</g>`
}

function svgDe(l: Layout): string {
  const marcos = l.marcos
    .map(
      (m) =>
        `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="10" fill="${enPapel(m.color)}" fill-opacity="0.04" stroke="${enPapel(m.color)}" stroke-opacity="0.4" stroke-width="1"/>` +
        `<text x="${m.x + 36}" y="${m.y + 25}" font-family="${FUENTE_SVG}" font-size="9" font-weight="700" letter-spacing="0.6" fill="${enPapel(m.color)}">${esc(m.etiqueta.toUpperCase())} · ${m.n}</text>`,
    )
    .join('')
  const paths = l.lineas
    .map(
      (d) =>
        `<path d="${d.d}" fill="none" stroke="${PAPEL.apagado}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"${d.discontinua ? ' stroke-dasharray="5 4"' : ''}/>`,
    )
    .join('')
  const cajas = l.cajas.map(cajaSvg).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.ancho} ${l.alto}" ` +
    `preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">${marcos}${paths}${cajas}</svg>`
  )
}

// --- Piezas de la vista en pantalla ---
const lineas3 = (n: number) => ({
  display: '-webkit-box',
  WebkitLineClamp: n,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
})
const BASE_TARJETA = {
  position: 'absolute',
  boxSizing: 'border-box',
  cursor: 'pointer',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  transition: 'box-shadow .15s, opacity .2s',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
} as const
const ESTILO: Record<Clase, SxProps<Theme>> = {
  raiz: {
    ...BASE_TARJETA,
    alignItems: 'center',
    textAlign: 'center',
    px: 1.5,
    bgcolor: 'primary.main',
    color: 'primary.contrastText',
    borderRadius: '8px',
    boxShadow: 3,
    '&:hover': { boxShadow: 6 },
  },
  alta: {
    ...BASE_TARJETA,
    alignItems: 'center',
    textAlign: 'center',
    px: 1.25,
    bgcolor: 'background.paper',
    backgroundImage: (t: Theme) => `linear-gradient(${alpha(t.palette.primary.main, 0.06)}, ${alpha(t.palette.primary.main, 0.06)})`,
    border: '1px solid',
    borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.3),
    borderRadius: '6px',
    boxShadow: 1,
    '&:hover': { boxShadow: 4 },
  },
  normal: {
    ...BASE_TARJETA,
    px: 1.25,
    py: 0.75,
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: '6px',
    boxShadow: PALETA.sombra,
    '&:hover': { boxShadow: 4 },
  },
  compacta: {
    ...BASE_TARJETA,
    px: 1.25,
    py: 0.5,
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: '6px',
    boxShadow: PALETA.sombra,
    '&:hover': { boxShadow: 4 },
  },
}
const BASE_CONMUTADOR = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  minWidth: 20,
  height: 20,
  px: 0.5,
  borderRadius: '10px',
  border: '1px solid',
  fontFamily: 'inherit',
  fontSize: 10.5,
  fontWeight: 700,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1,
} as const
const CONMUTADOR_ABIERTO: SxProps<Theme> = {
  ...BASE_CONMUTADOR,
  bgcolor: 'background.paper',
  color: 'text.secondary',
  borderColor: 'divider',
  '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
}
const CONMUTADOR_CERRADO: SxProps<Theme> = {
  ...BASE_CONMUTADOR,
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderColor: 'primary.main',
  '&:hover': { boxShadow: 3 },
}

function Tarjeta({
  c,
  marcada,
  actual,
  atenuada,
  acento,
  alPulsar,
  alConmutar,
}: {
  c: Caja
  marcada: boolean
  actual: boolean
  atenuada: boolean
  acento: (color: string) => string
  alPulsar: (id: number) => void
  alConmutar: (id: number) => void
}) {
  const i = c.inst
  const estilo: React.CSSProperties = { left: c.x, top: c.y, width: c.w, height: c.h, opacity: atenuada ? 0.35 : 1 }
  // La categoría, como tinte tenue (10 %) sobre la superficie; lo buscado, un anillo de la tinta.
  if (c.clase === 'normal' || c.clase === 'compacta') estilo.backgroundImage = `linear-gradient(${acento(colorDe(i))}1A, ${acento(colorDe(i))}1A)`
  if (marcada) { estilo.outline = `2px solid ${PALETA.primario}`; estilo.outlineOffset = 2 }
  if (actual) estilo.boxShadow = `0 0 0 7px ${PALETA.primario}26`
  const etiqueta = etiquetaDe(i, c.clase === 'raiz')
  const ayuda = (
    <>
      <Box sx={{ fontWeight: 600 }}>{i.siglas ? `${i.siglas} · ` : ''}{i.nombre}</Box>
      {etiqueta && <Box sx={{ opacity: 0.85 }}>{etiqueta}</Box>}
      {c.total > 0 && <Box sx={{ opacity: 0.85 }}>{c.total} {c.total === 1 ? 'dependencia' : 'dependencias'}</Box>}
    </>
  )
  let cuerpo: React.ReactNode
  if (c.clase === 'raiz') {
    cuerpo = (
      <>
        {etiqueta && <Box sx={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>{etiqueta}</Box>}
        {i.siglas && <Box sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.25 }}>{i.siglas}</Box>}
        <Box sx={{ ...lineas3(i.siglas ? 2 : 3), fontSize: i.siglas ? 12 : 13.5, fontWeight: 600, lineHeight: 1.22 }}>{i.nombre}</Box>
      </>
    )
  } else if (c.clase === 'alta') {
    cuerpo = (
      <>
        <Box sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: acento(PALETA.guinda), mb: 0.25 }}>Alta Dirección</Box>
        <Box sx={{ ...lineas3(3), fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: 'text.primary' }}>
          {i.siglas && <b>{i.siglas} · </b>}{i.nombre}
        </Box>
      </>
    )
  } else if (c.clase === 'compacta') {
    cuerpo = (
      <Box sx={{ ...lineas3(3), fontSize: 11, fontWeight: 600, lineHeight: 1.2, color: 'text.primary' }}>
        {i.siglas && <Box component="span" sx={{ fontWeight: 700 }}>{i.siglas} · </Box>}{i.nombre}
      </Box>
    )
  } else {
    cuerpo = (
      <>
        {(etiqueta || i.siglas) && (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 0.25 }}>
            <Box sx={{ flex: 1, minWidth: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} style={{ color: acento(colorRotulo(i)) }}>
              {etiqueta}
            </Box>
            {i.siglas && <Box sx={{ fontSize: 10, fontWeight: 700, color: 'text.secondary', flexShrink: 0 }}>{i.siglas}</Box>}
          </Box>
        )}
        <Box sx={{ ...lineas3(3), fontSize: 11.5, fontWeight: 600, lineHeight: 1.2, color: 'text.primary' }}>{i.nombre}</Box>
      </>
    )
  }
  return (
    <>
      <Tooltip title={ayuda} placement="top" enterDelay={450} disableInteractive>
        <Box
          role="button"
          tabIndex={0}
          aria-label={`${i.nombre}: abrir su ficha`}
          onClick={() => alPulsar(i.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') alPulsar(i.id) }}
          style={estilo}
          sx={ESTILO[c.clase]}
        >
          {cuerpo}
        </Box>
      </Tooltip>
      {c.salida && (
        <Box
          component="button"
          type="button"
          title={c.colapsado ? `Desplegar (${c.total} ${c.total === 1 ? 'dependencia' : 'dependencias'})` : `Contraer (${c.total} ${c.total === 1 ? 'dependencia' : 'dependencias'})`}
          aria-label={c.colapsado ? `Desplegar ${i.nombre}` : `Contraer ${i.nombre}`}
          aria-expanded={!c.colapsado}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); alConmutar(i.id) }}
          style={{ left: c.salida.x, top: c.salida.y, opacity: atenuada ? 0.35 : 1 }}
          sx={c.colapsado ? CONMUTADOR_CERRADO : CONMUTADOR_ABIERTO}
        >
          {c.colapsado ? `+${c.total}` : '−'}
        </Box>
      )}
    </>
  )
}

// El lienzo (líneas, marcos y cajas) va aparte y memorizado: mover o
// acercar el organigrama no vuelve a pintar las ~300 cajas.
const Lienzo = memo(function Lienzo({
  layout,
  marcadas,
  actual,
  colorLinea,
  acento,
  alPulsar,
  alConmutar,
}: {
  layout: Layout
  marcadas: ReadonlySet<number>
  actual: number | null
  colorLinea: string
  acento: (color: string) => string
  alPulsar: (id: number) => void
  alConmutar: (id: number) => void
}) {
  const { ancho, alto, cajas, lineas, marcos } = layout
  const buscando = marcadas.size > 0
  return (
    <>
      <svg width={ancho} height={alto} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
        {marcos.map((m, k) => (
          <g key={k} opacity={buscando ? 0.5 : 1}>
            <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={10} fill={alpha(m.color, 0.04)} stroke={alpha(acento(m.color), 0.4)} strokeWidth={1} />
            <text x={m.x + 36} y={m.y + 25} fontSize={10} fontWeight={700} letterSpacing="0.06em" fill={acento(m.color)} style={{ fontFamily: 'inherit' }}>
              {m.etiqueta.toUpperCase()} · {m.n}
            </text>
          </g>
        ))}
        <g opacity={buscando ? 0.45 : 1}>
          {lineas.map((l, k) => (
            <path key={k} d={l.d} fill="none" stroke={colorLinea} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={l.discontinua ? '5 4' : undefined} />
          ))}
        </g>
      </svg>
      {cajas.map((c) => (
        <Tarjeta
          key={c.inst.id}
          c={c}
          marcada={marcadas.has(c.inst.id)}
          actual={actual === c.inst.id}
          atenuada={buscando && !marcadas.has(c.inst.id)}
          acento={acento}
          alPulsar={alPulsar}
          alConmutar={alConmutar}
        />
      ))}
    </>
  )
})

const RESERVA_SUP = 52 // la barra de herramientas flota arriba
const limitar = (e: number) => Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, e))
type Pendiente =
  | { tipo: 'ajustar' }
  | { tipo: 'fijar'; id: number; sx: number; sy: number }
  | { tipo: 'centrar'; id: number }

export default function Organigrama({
  raiz,
  todas,
  orient,
  colapsados,
  alCambiarColapsados,
  alAbrir,
}: {
  raiz: InstitucionDet
  todas: InstitucionDet[]
  orient: Orient
  colapsados: ReadonlySet<number>
  alCambiarColapsados: (s: Set<number>) => void
  alAbrir: (id: number) => void
}) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  // La paleta ya trae el tono del modo (2026-10-19): no se aclara otra vez en la oscura.
  const acento = useCallback((c: string) => c, [])
  const colorLinea = PALETA.apagado

  const arbol = useMemo(() => construir(raiz, todas), [raiz, todas])
  const indice = useMemo(() => indexar(arbol), [arbol])
  const layout = useMemo(() => calcular(arbol, orient, colapsados), [arbol, orient, colapsados])
  const leyenda = useMemo(() => leyendaDe(indice.orden), [indice])
  const { ancho, alto } = layout

  // Vista: escala y desplazamiento en un solo estado (el zoom alrededor de un
  // punto cambia los tres a la vez).
  const [vista, setVista] = useState({ e: 1, x: 20, y: RESERVA_SUP })
  const vistaRef = useRef(vista)
  vistaRef.current = vista
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const colapsadosRef = useRef(colapsados)
  colapsadosRef.current = colapsados
  const alAbrirRef = useRef(alAbrir)
  alAbrirRef.current = alAbrir
  const pendiente = useRef<Pendiente | null>(null)
  const cont = useRef<HTMLDivElement>(null)
  const [verLeyenda, setVerLeyenda] = useState(!celular)

  // Gestos con eventos de PUNTERO (ratón, dedo y lápiz por igual; Edison
  // 2026-10-01: «el diputado usa casi siempre el celular»): un puntero
  // arrastra, dos pellizcan (zoom alrededor del punto medio).
  const punteros = useRef(new Map<number, { x: number; y: number }>())
  const gesto = useRef<
    | { tipo: 'mover'; x: number; y: number; dx: number; dy: number }
    | { tipo: 'pellizco'; dist: number; mx: number; my: number; escala: number; dx: number; dy: number }
    | null
  >(null)
  // Si hubo arrastre, el clic que sigue no abre la ficha de la caja.
  const movido = useRef(false)
  const [arrastrando, setArrastrando] = useState(false)

  const local = (e: { clientX: number; clientY: number }) => {
    const r = cont.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }
  const iniciarGesto = () => {
    const ps = [...punteros.current.values()]
    const v = vistaRef.current
    if (ps.length >= 2) {
      const [a, b] = ps
      gesto.current = {
        tipo: 'pellizco',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        escala: v.e,
        dx: v.x,
        dy: v.y,
      }
    } else if (ps.length === 1) {
      gesto.current = { tipo: 'mover', x: ps[0].x, y: ps[0].y, dx: v.x, dy: v.y }
    } else {
      gesto.current = null
    }
  }
  const alBajar = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    punteros.current.set(e.pointerId, local(e))
    movido.current = false
    setArrastrando(true)
    iniciarGesto()
  }
  const alMover = (e: React.PointerEvent) => {
    if (!punteros.current.has(e.pointerId)) return
    punteros.current.set(e.pointerId, local(e))
    const g = gesto.current
    if (!g) return
    const ps = [...punteros.current.values()]
    if (g.tipo === 'mover' && ps.length === 1) {
      const ddx = ps[0].x - g.x
      const ddy = ps[0].y - g.y
      if (Math.abs(ddx) + Math.abs(ddy) > 4) movido.current = true
      setVista((v) => ({ ...v, x: g.dx + ddx, y: g.dy + ddy }))
    } else if (g.tipo === 'pellizco' && ps.length >= 2) {
      const [a, b] = ps
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const nueva = limitar(g.escala * (dist / g.dist))
      const k = nueva / g.escala
      movido.current = true
      // El punto del organigrama que estaba bajo los dedos sigue bajo ellos.
      setVista({ e: nueva, x: mx - (g.mx - g.dx) * k, y: my - (g.my - g.dy) * k })
    }
  }
  const alSoltar = (e: React.PointerEvent) => {
    punteros.current.delete(e.pointerId)
    if (punteros.current.size === 0) setArrastrando(false)
    iniciarGesto()
  }

  // Zoom alrededor de un punto del contenedor (por omisión, su centro).
  const zoomEn = useCallback((f: number, px?: number, py?: number) => {
    const c = cont.current
    if (!c) return
    const cx = px ?? c.clientWidth / 2
    const cy = py ?? c.clientHeight / 2
    setVista((v) => {
      const e = limitar(v.e * f)
      const k = e / v.e
      return { e, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }, [])
  // La rueda acerca hacia el cursor. Escucha nativa (no pasiva) para poder
  // impedir que la página se desplace.
  useEffect(() => {
    const c = cont.current
    if (!c) return
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault()
      const r = c.getBoundingClientRect()
      zoomEn(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top)
    }
    c.addEventListener('wheel', rueda, { passive: false })
    return () => c.removeEventListener('wheel', rueda)
  }, [zoomEn])

  const ajustar = useCallback(() => {
    const c = cont.current
    if (!c) return
    const l = layoutRef.current
    const aw = c.clientWidth - 24
    const ah = c.clientHeight - RESERVA_SUP - 16
    const e = Math.max(ESCALA_MIN, Math.min(1, aw / l.ancho, ah / l.alto))
    setVista({ e, x: (c.clientWidth - l.ancho * e) / 2, y: RESERVA_SUP + Math.max(0, (ah - l.alto * e) / 2) })
  }, [])
  const centrar = useCallback((id: number) => {
    const c = cont.current
    const caja = layoutRef.current.porId.get(id)
    if (!c || !caja) return
    setVista((v) => {
      const e = Math.max(v.e, Math.min(1, 0.8))
      return { e, x: c.clientWidth / 2 - (caja.x + caja.w / 2) * e, y: (c.clientHeight + RESERVA_SUP) / 2 - (caja.y + caja.h / 2) * e }
    })
  }, [])

  // Al abrir y al cambiar la orientación: todo el organigrama a la vista.
  useLayoutEffect(() => { ajustar() }, [ajustar, orient, raiz.id])
  // Tras contraer, desplegar o buscar, lo que toca según lo pedido.
  useLayoutEffect(() => {
    const p = pendiente.current
    if (!p) return
    pendiente.current = null
    if (p.tipo === 'ajustar') ajustar()
    else if (p.tipo === 'centrar') centrar(p.id)
    else {
      // La caja que se contrajo o desplegó se queda donde estaba en pantalla.
      const caja = layout.porId.get(p.id)
      if (caja) setVista((v) => ({ ...v, x: p.sx - caja.x * v.e, y: p.sy - caja.y * v.e }))
    }
  }, [layout, ajustar, centrar])

  const alPulsar = useCallback((id: number) => {
    if (!movido.current) alAbrirRef.current(id)
  }, [])
  const alConmutar = useCallback((id: number) => {
    if (movido.current) return
    const caja = layoutRef.current.porId.get(id)
    const v = vistaRef.current
    if (caja) pendiente.current = { tipo: 'fijar', id, sx: v.x + caja.x * v.e, sy: v.y + caja.y * v.e }
    const s = new Set(colapsadosRef.current)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    alCambiarColapsados(s)
  }, [alCambiarColapsados])

  const desplegarTodo = () => {
    pendiente.current = { tipo: 'ajustar' }
    alCambiarColapsados(new Set())
  }
  // Solo la entidad y dos niveles: se contrae todo lo que cuelga del 2.º.
  const dosNiveles = () => {
    const s = new Set<number>()
    indice.porId.forEach((en, id) => { if (en.prof === 2 && en.nodo.hijos.length) s.add(id) })
    pendiente.current = { tipo: 'ajustar' }
    alCambiarColapsados(s)
  }

  // --- Búsqueda ---
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const coincidencias = useMemo(() => {
    const t = normal(q)
    if (t.length < 2) return [] as number[]
    return indice.orden.filter((n) => normal(`${n.inst.nombre} ${n.inst.siglas}`).includes(t)).map((n) => n.inst.id)
  }, [q, indice])
  const marcadas = useMemo(() => new Set(coincidencias), [coincidencias])
  const ir = (k: number) => {
    if (!coincidencias.length) return
    const i = ((k % coincidencias.length) + coincidencias.length) % coincidencias.length
    setCursor(i)
    const id = coincidencias[i]
    // Se abren las ramas contraídas que la contienen.
    const abrir: number[] = []
    let en = indice.porId.get(id)
    while (en?.padre) {
      if (colapsados.has(en.padre.inst.id)) abrir.push(en.padre.inst.id)
      en = indice.porId.get(en.padre.inst.id)
    }
    if (abrir.length) {
      const s = new Set(colapsados)
      abrir.forEach((a) => s.delete(a))
      pendiente.current = { tipo: 'centrar', id }
      alCambiarColapsados(s)
    } else {
      centrar(id)
    }
  }
  const irRef = useRef(ir)
  irRef.current = ir
  useEffect(() => {
    setCursor(0)
    if (coincidencias.length) irRef.current(0)
  }, [coincidencias])
  const actual = coincidencias.length ? coincidencias[Math.min(cursor, coincidencias.length - 1)] : null

  const boton = (titulo: string, icono: React.ReactNode, accion: () => void, deshabilitado = false) => (
    <Tooltip title={titulo}>
      <span>
        <IconButton size="small" onClick={accion} disabled={deshabilitado} aria-label={titulo}>{icono}</IconButton>
      </span>
    </Tooltip>
  )
  const panel = { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '8px', boxShadow: PALETA.sombra } as const

  return (
    <Box ref={cont}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') alSoltar(e) }}
      // touch-action none: el navegador no desplaza ni amplía la página
      // mientras se mueve el organigrama con el dedo.
      sx={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none', userSelect: 'none',
        cursor: arrastrando ? 'grabbing' : 'grab',
        // Fondo de papel milimetrado tenue: orienta al mover sin competir.
        bgcolor: PALETA.fondo,
        backgroundImage: `radial-gradient(${PALETA.apagado}59 1px, transparent 1px)`,
        backgroundSize: `${22 * vista.e}px ${22 * vista.e}px`,
        backgroundPosition: `${vista.x}px ${vista.y}px`,
      }}
    >
      {/* Barra de herramientas: búsqueda a la izquierda, vista a la derecha. */}
      <Box onPointerDown={(e) => e.stopPropagation()}
        sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 2, display: 'flex', gap: 1, alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none', '& > *': { pointerEvents: 'auto' } }}>
        <Box sx={{ ...panel, display: 'flex', alignItems: 'center', pl: 1, pr: 0.25, minWidth: 0, flexShrink: 1 }}>
          <SearchIcon fontSize="small" sx={{ color: 'text.secondary', mr: 0.5 }} />
          <InputBase
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); ir(cursor + (e.shiftKey ? -1 : 1)) }
              if (e.key === 'Escape') setQ('')
            }}
            placeholder="Buscar unidad o sigla…"
            inputProps={{ 'aria-label': 'Buscar una unidad en el organigrama' }}
            sx={{ width: { xs: 118, sm: 210 }, fontSize: 13, py: 0.25 }}
          />
          {normal(q).length >= 2 && (
            <>
              <Typography variant="caption" sx={{ color: coincidencias.length ? 'text.secondary' : 'error.main', whiteSpace: 'nowrap', mx: 0.5 }}>
                {coincidencias.length ? `${cursor + 1}/${coincidencias.length}` : 'sin resultados'}
              </Typography>
              {boton('Anterior (Mayús + Intro)', <KeyboardArrowUpIcon fontSize="small" />, () => ir(cursor - 1), !coincidencias.length)}
              {boton('Siguiente (Intro)', <KeyboardArrowDownIcon fontSize="small" />, () => ir(cursor + 1), !coincidencias.length)}
              {boton('Limpiar la búsqueda', <CloseIcon fontSize="small" />, () => setQ(''))}
            </>
          )}
        </Box>
        <Box sx={{ ...panel, display: 'flex', alignItems: 'center', gap: 0.25, px: 0.25, flexShrink: 0 }}>
          {boton('Alejar', <ZoomOutIcon fontSize="small" />, () => zoomEn(1 / 1.2))}
          <Tooltip title="Tamaño real (100 %)">
            <Box component="button" type="button" onClick={() => zoomEn(1 / vista.e)}
              sx={{ border: 0, bgcolor: 'transparent', color: 'text.secondary', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', minWidth: 38, p: 0, display: { xs: 'none', sm: 'block' } }}>
              {Math.round(vista.e * 100)} %
            </Box>
          </Tooltip>
          {boton('Acercar', <ZoomInIcon fontSize="small" />, () => zoomEn(1.2))}
          {boton('Ajustar a la pantalla', <CenterFocusStrongIcon fontSize="small" />, ajustar)}
          <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'divider', mx: 0.25, my: 0.75 }} />
          {boton('Desplegar todo', <UnfoldMoreIcon fontSize="small" />, desplegarTodo, colapsados.size === 0)}
          {boton('Solo los dos primeros niveles', <UnfoldLessIcon fontSize="small" />, dosNiveles)}
          {boton(verLeyenda ? 'Ocultar la leyenda' : 'Ver la leyenda', <LegendToggleIcon fontSize="small" color={verLeyenda ? 'primary' : 'inherit'} />, () => setVerLeyenda((x) => !x))}
        </Box>
      </Box>

      {/* Leyenda de categorías presentes. */}
      {verLeyenda && (leyenda.items.length > 0 || leyenda.adscritos) && (
        <Box onPointerDown={(e) => e.stopPropagation()}
          sx={{ ...panel, position: 'absolute', left: 8, bottom: 8, zIndex: 2, px: 1.25, py: 1, maxWidth: { xs: 'calc(100% - 16px)', sm: 300 }, maxHeight: '45%', overflowY: 'auto', cursor: 'default' }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Leyenda</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr' }, columnGap: 1.5, rowGap: 0.4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 11.5 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: 'primary.main', flexShrink: 0 }} />
              Entidad
            </Box>
            {leyenda.items.map((it) => (
              <Box key={it.clave} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 11.5, minWidth: 0 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '3px', flexShrink: 0, border: '1px solid' }} style={{ backgroundColor: `${acento(it.color)}26`, borderColor: acento(it.color) }} />
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.etiqueta}</Box>
              </Box>
            ))}
          </Box>
          {leyenda.adscritos && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 11.5, mt: 0.75, color: 'text.secondary' }}>
              <svg width="22" height="6" aria-hidden><path d="M 1 3 H 21" stroke={colorLinea} strokeWidth={1.6} strokeDasharray="5 4" /></svg>
              Vínculo de adscripción
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ position: 'absolute', bottom: 8, right: 8, zIndex: 1, fontSize: 11, color: 'text.secondary', bgcolor: alpha(tema.palette.background.paper, 0.85), px: 1, borderRadius: 1, maxWidth: '55%', textAlign: 'right', display: { xs: verLeyenda ? 'none' : 'block', sm: 'block' } }}>
        <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Rueda = zoom · arrastrar = mover · clic en una caja = su ficha · «−/+» = contraer o desplegar</Box>
        <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>Dos dedos = zoom · un dedo = mover · tocar una caja = su ficha</Box>
      </Box>

      <Box sx={{ position: 'absolute', transformOrigin: '0 0', width: ancho, height: alto }}
        style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.e})` }}>
        <Lienzo layout={layout} marcadas={marcadas} actual={actual} colorLinea={colorLinea} acento={acento} alPulsar={alPulsar} alConmutar={alConmutar} />
      </Box>
    </Box>
  )
}

// Abre el organigrama como SVG en una ventana lista para imprimir, ajustado a
// una sola hoja (A4 u oficio; orientación según la forma del árbol). Sale tal
// como se ve: lo contraído, resumido con su «+N».
function imprimir(
  raiz: InstitucionDet,
  todas: InstitucionDet[],
  orient: Orient,
  papel: 'A4' | 'oficio',
  colapsados: ReadonlySet<number>,
) {
  const arbol = construir(raiz, todas)
  const layout = calcular(arbol, orient, colapsados)
  const svg = svgDe(layout)
  const leyenda = leyendaDe(indexar(arbol).orden)
  const apais = layout.ancho >= layout.alto
  // A4: 297×210 mm apaisado; Oficio (US legal): 356×216 mm apaisado.
  const size = papel === 'A4'
    ? (apais ? '297mm 210mm' : '210mm 297mm')
    : (apais ? '356mm 216mm' : '216mm 356mm')
  const titulo = (raiz.siglas ? `${raiz.siglas} · ` : '') + raiz.nombre
  const items =
    `<span class="it"><i style="background:${PAPEL.guinda}"></i>Entidad</span>` +
    leyenda.items.map((it) => `<span class="it"><i style="background:${enPapel(it.color)}1A;border-color:${enPapel(it.color)}"></i>${esc(it.etiqueta)}</span>`).join('') +
    (leyenda.adscritos
      ? `<span class="it"><svg width="20" height="6"><path d="M 1 3 H 19" stroke="${PAPEL.apagado}" stroke-width="1.5" stroke-dasharray="4 3"/></svg>Vínculo de adscripción</span>`
      : '')
  const procedencia = [
    raiz.norma && `Norma: ${raiz.norma}`,
    raiz.fuente && `Fuente: ${raiz.fuente}`,
    raiz.fecha_consulta && `consultado el ${raiz.fecha_consulta}`,
  ].filter(Boolean).join(' · ')
  const resumida = colapsados.size > 0 ? ' · vista resumida (las cifras «+N» son dependencias contraídas)' : ''
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Organigrama — ${esc(titulo)}</title>` +
    `<style>@page{size:${size};margin:7mm} html,body{margin:0;height:100%;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:Arial,Helvetica,sans-serif;color:${PAPEL.texto}} ` +
    `.hoja{box-sizing:border-box;width:100%;height:100vh;padding:1mm 2mm;display:flex;flex-direction:column} ` +
    `header{display:flex;align-items:flex-end;gap:4mm;border-bottom:1.5px solid ${PAPEL.guinda};padding-bottom:1.5mm;margin-bottom:2mm} ` +
    `h1{font-size:13px;font-weight:700;margin:0;color:${PAPEL.texto};flex:1} ` +
    `.sub{font-size:8.5px;color:${PAPEL.textoTenue};text-transform:uppercase;letter-spacing:.08em;margin-bottom:.8mm} ` +
    `.ley{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:1mm 3mm;font-size:8px;color:${PAPEL.textoSecundario};max-width:55%} ` +
    `.it{display:inline-flex;align-items:center;gap:1.2mm;white-space:nowrap} .it i{display:inline-block;box-sizing:border-box;width:9px;height:9px;border-radius:2px;border:1px solid transparent} ` +
    `.lienzo{flex:1;min-height:0} footer{font-size:7.5px;color:${PAPEL.textoTenue};margin-top:1.5mm;border-top:.5px solid ${PAPEL.borde};padding-top:1mm}</style></head><body>` +
    `<div class="hoja"><header><div style="flex:1"><div class="sub">Organigrama institucional</div><h1>${esc(titulo)}</h1></div>` +
    `<div class="ley">${items}</div></header>` +
    `<div class="lienzo">${svg}</div>` +
    `<footer>${esc(procedencia || 'Directorio de Qillqa')}${esc(resumida)}</footer></div>` +
    `<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>` +
    `</body></html>`,
  )
  w.document.close()
}

export function DialogoOrganigrama({
  raiz,
  todas,
  alCerrar,
  alAbrir,
}: {
  raiz: InstitucionDet | null
  todas: InstitucionDet[]
  alCerrar: () => void
  alAbrir: (id: number) => void
}) {
  // Un organigrama grande (más de 40 dependencias) abre RESUMIDO: la entidad y
  // dos niveles, en vertical, como el gráfico oficial del ROF; abierto entero
  // salía a 13 % e ilegible (revisión 2026-10-06). «Desplegar todo» o el «+N»
  // de cada rama muestran el resto.
  const resumen = useMemo(() => {
    const s = new Set<number>()
    if (!raiz) return s
    const porPadre = new Map<number, number[]>()
    for (const i of todas) if (i.parent_id !== null && i.activo) {
      const l = porPadre.get(i.parent_id) ?? []; l.push(i.id); porPadre.set(i.parent_id, l)
    }
    let total = 0
    const contar = (id: number, prof: number, vistos: Set<number>) => {
      for (const h of porPadre.get(id) ?? []) {
        if (vistos.has(h)) continue
        vistos.add(h)
        total += 1
        if (prof + 1 === 2 && (porPadre.get(h) ?? []).length) s.add(h)
        contar(h, prof + 1, vistos)
      }
    }
    contar(raiz.id, 0, new Set([raiz.id]))
    return total > 40 ? s : new Set<number>()
  }, [raiz, todas])
  const [orient, setOrient] = useState<Orient>('vertical')
  const [menuImp, setMenuImp] = useState<null | HTMLElement>(null)
  // Ramas contraídas: aquí, para que «Imprimir» salga como se ve.
  const [colapsados, setColapsados] = useState<Set<number>>(() => new Set(resumen))
  // Al abrir otra entidad (no en cada recarga del directorio: no deshace lo que
  // el usuario contrajo o desplegó). Se ajusta DURANTE el render, no en un
  // efecto: así el primer «ajustar a la pantalla» ya mide la vista resumida.
  const [raizVista, setRaizVista] = useState(raiz?.id)
  if (raizVista !== raiz?.id) {
    setRaizVista(raiz?.id)
    setColapsados(new Set(resumen))
  }
  // En el celular: a pantalla completa y con los botones de la cabecera en
  // icono, para dejarle al organigrama todo el sitio posible.
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))

  const nDesc = useMemo(() => {
    if (!raiz) return 0
    const porPadre = new Map<number, number[]>()
    for (const i of todas) if (i.parent_id !== null && i.activo) {
      const l = porPadre.get(i.parent_id) ?? []; l.push(i.id); porPadre.set(i.parent_id, l)
    }
    const vistos = new Set<number>()
    const c = (id: number): number => {
      vistos.add(id)
      return (porPadre.get(id) ?? []).filter((h) => !vistos.has(h)).reduce((s, h) => s + 1 + c(h), 0)
    }
    return c(raiz.id)
  }, [raiz, todas])

  return (
    <Dialog open={raiz !== null} onClose={alCerrar} maxWidth={false} fullWidth fullScreen={celular}
      PaperProps={{ sx: celular ? {} : { width: '96vw', maxWidth: '96vw', height: '92vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.25, sm: 1 }, py: 1, px: { xs: 1.5, sm: 3 }, flexWrap: { xs: 'nowrap', sm: 'wrap' } }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, fontSize: { xs: 15, sm: 'inherit' }, lineHeight: 1.3 }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Organigrama — </Box>
          {raiz?.siglas ? `${raiz.siglas} · ` : ''}{raiz?.nombre}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({nDesc} dependencias)</Typography>
          {raiz?.norma && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ display: { xs: 'none', md: 'block' }, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {raiz.norma}
            </Typography>
          )}
        </Box>
        {celular ? (
          <>
            <Tooltip title={orient === 'horizontal' ? 'Vista vertical' : 'Vista horizontal'}>
              <IconButton onClick={() => setOrient((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))} aria-label="Cambiar la orientación">
                <SwapHorizIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Imprimir / PDF">
              <IconButton onClick={(e) => setMenuImp(e.currentTarget)} aria-label="Imprimir o PDF">
                <PrintIcon />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <>
            <Button size="small" startIcon={<SwapHorizIcon />} onClick={() => setOrient((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}>
              {orient === 'horizontal' ? 'Vista vertical' : 'Vista horizontal'}
            </Button>
            <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={(e) => setMenuImp(e.currentTarget)}>
              Imprimir / PDF
            </Button>
          </>
        )}
        <Menu anchorEl={menuImp} open={menuImp !== null} onClose={() => setMenuImp(null)}>
          <MenuItem onClick={() => { setMenuImp(null); if (raiz) imprimir(raiz, todas, orient, 'A4', colapsados) }}>Hoja A4 (una página)</MenuItem>
          <MenuItem onClick={() => { setMenuImp(null); if (raiz) imprimir(raiz, todas, orient, 'oficio', colapsados) }}>Hoja oficio (una página)</MenuItem>
          {colapsados.size > 0 && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, pt: 0.5, maxWidth: 260 }}>
              Sale tal como se ve: las ramas contraídas van resumidas.
            </Typography>
          )}
        </Menu>
        <IconButton onClick={alCerrar} aria-label="Cerrar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {raiz && (
          <Organigrama raiz={raiz} todas={todas} orient={orient} colapsados={colapsados} alCambiarColapsados={setColapsados} alAbrir={alAbrir} />
        )}
      </DialogContent>
    </Dialog>
  )
}

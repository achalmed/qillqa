/**
 * VISOR RÁPIDO de la bandeja: la lógica pura (2026-10-19). Edison, desde el celular: «al tocar un
 * documento enviado o firmado debe verse de inmediato, y pasar al siguiente solo arrastrando la
 * pantalla». Aquí vive lo que se puede probar sin navegador (`pruebas/visorRapido.test.ts`):
 *
 *   - qué documentos abre el visor rápido en vez del editor (los de después de la firma);
 *   - la secuencia por la que se desliza y los vecinos de uno (la misma lista filtrada de la bandeja);
 *   - los archivos de un documento que se pueden ver como imagen (firmado, documento, cargos,
 *     recibidos, adjuntos) y cuál se muestra primero;
 *   - la ruta de la imagen de una página (el servidor rasteriza: `GET /api/documentos/{id}/imagen`);
 *   - la lectura de un gesto (desde el 2026-10-19 por la tarde, Edison: «como TikTok»: de arriba
 *     abajo = otro documento; de lado = los archivos y páginas del mismo documento) y de una tecla.
 *
 * El componente (`componentes/VisorRapido.tsx`) solo pinta y pide.
 */

/** Estados en los que el documento ya no se edita y su PDF es el que vale. Al principio solo estos
 *  abrían el visor rápido; desde el 2026-10-19 (Edison, con la tarjeta de un borrador: «cuando haga
 *  clic en esa tarjeta debe mostrarse el visor rápido») TODO documento se ve primero en el visor,
 *  y el editor queda en «Abrir documento», en la pulsación larga y en el ⋮. */
export const ESTADOS_VISOR_RAPIDO: readonly string[] = ['FIRMADO', 'ENVIADO', 'OBSERVADO_ENVIADO', 'ARCHIVADO']

/** ¿Tocar el documento abre el visor rápido? Sí, en cualquier estado (el parámetro queda por si vuelve a depender del estado). */
export const abreVisorRapido = (_estado: string): boolean => true

/** Lo que el visor necesita de cada fila de la bandeja. */
export interface DocRapido {
  id: number
  estado: string
  numero_completo: string
  asunto: string
  tipo_nombre?: string
  destinatario?: string
  fecha?: string | null
  /** Id del adjunto «firmado» (lo trae el listado): es lo primero que se muestra. */
  firmado_id?: number | null
}

/** Por qué documentos se desliza: los de la lista (ya filtrada y ordenada) que abre el visor rápido. */
export function secuencia<T extends { estado: string }>(docs: readonly T[]): T[] {
  return docs.filter((d) => abreVisorRapido(d.estado))
}

/** Dónde está un documento en la secuencia y quiénes lo rodean (null en los extremos: no da la vuelta). */
export function vecinos<T extends { id: number; estado: string }>(
  docs: readonly T[],
  id: number,
): { indice: number; total: number; anterior: T | null; siguiente: T | null } {
  const lista = secuencia(docs)
  const indice = lista.findIndex((d) => d.id === id)
  if (indice < 0) return { indice: -1, total: lista.length, anterior: null, siguiente: null }
  return {
    indice,
    total: lista.length,
    anterior: indice > 0 ? lista[indice - 1] : null,
    siguiente: indice < lista.length - 1 ? lista[indice + 1] : null,
  }
}

/** Qué se precarga alrededor de un documento: el siguiente y el anterior (en ese orden). */
export function aPrecargar<T extends { id: number; estado: string }>(docs: readonly T[], id: number): T[] {
  const v = vecinos(docs, id)
  return [v.siguiente, v.anterior].filter((d): d is T => d !== null)
}

// ---------------------------------------------------------------- archivos

/** Lo que el visor usa del `GET /api/documentos/{id}/adjuntos`. */
export interface AdjuntoRapido {
  id: number
  nombre: string
  tipo_mime?: string
  es_imagen: boolean
  categoria: string
  etiqueta?: string
  anulado?: boolean
}

/** Un archivo del documento que se puede ver en el visor rápido. */
export interface ArchivoRapido {
  /** «documento» (el PDF del sistema) o el id del adjunto, como lo espera el parámetro `archivo`. */
  clave: string
  /** Rótulo corto de la ficha: «Firmado», «Documento», «Cargo», «Recibido», «Adjunto»… */
  rotulo: string
  /** El nombre largo de un adjunto (su etiqueta), para decirlo aparte de la ficha (2026-10-19). */
  detalle?: string
  nombre: string
  /** Ya es imagen (un cargo escaneado en JPG): se muestra tal cual, no se rasteriza. */
  esImagen: boolean
  /** Ruta del archivo en sí, para compartirlo o descargarlo. */
  ruta: string
}

const esPdf = (a: AdjuntoRapido) => a.tipo_mime === 'application/pdf' || /\.pdf$/i.test(a.nombre)

const ROTULO: Record<string, string> = {
  firmado: 'Firmado',
  recepcion: 'Cargo',
  recepcion_anulada: 'Cargo anulado',
  respuesta: 'Recibido',
  '': 'Adjunto',
}
const ORDEN = ['firmado', 'recepcion', 'recepcion_anulada', 'respuesta', '']

/**
 * Los archivos de un documento, en el orden en que se ofrecen: el firmado, el PDF del sistema, los
 * cargos, los recibidos y los adjuntos. Solo PDF e imágenes (lo demás no se puede ver como imagen).
 * Cuando hay varios de un grupo se numeran («Cargo 1», «Cargo 2»).
 */
export function archivosDe(docId: number, adjuntos: readonly AdjuntoRapido[]): ArchivoRapido[] {
  const base = `/api/documentos/${docId}`
  const documento: ArchivoRapido = { clave: 'documento', rotulo: 'Documento', nombre: 'documento.pdf', esImagen: false, ruta: `${base}/pdf` }
  const visibles = adjuntos.filter((a) => esPdf(a) || a.es_imagen)
  const porGrupo = (cat: string) => visibles.filter((a) => (a.categoria === 'recepcion_anulada' ? 'recepcion_anulada' : a.anulado ? 'recepcion_anulada' : a.categoria) === cat)
  const grupos = ORDEN.map((cat) => ({ cat, lista: porGrupo(cat) })).filter((g) => g.lista.length)
  const fichas = (g: { cat: string; lista: AdjuntoRapido[] }): ArchivoRapido[] =>
    g.lista.map((a, i) => ({
      clave: String(a.id),
      // La ficha va corta (Edison 2026-10-19: «el nombre largo no está bien»); la etiqueta entera, en `detalle`.
      rotulo: g.lista.length > 1 ? `${ROTULO[g.cat]} ${i + 1}` : ROTULO[g.cat],
      detalle: g.cat === '' && a.etiqueta ? a.etiqueta : undefined,
      nombre: a.nombre,
      esImagen: a.es_imagen && !esPdf(a),
      ruta: `${base}/adjuntos/${a.id}`,
    }))
  const firmados = grupos.filter((g) => g.cat === 'firmado').flatMap(fichas)
  const resto = grupos.filter((g) => g.cat !== 'firmado').flatMap(fichas)
  return [...firmados, documento, ...resto]
}

/** El archivo que se abre primero: el firmado si lo hay (es lo que salió de la entidad); si no, el PDF
 *  del sistema. Sirve también sin haber pedido los adjuntos, con el `firmado_id` del listado. */
export function archivoInicial(docId: number, firmadoId?: number | null, archivos?: readonly ArchivoRapido[]): ArchivoRapido {
  if (archivos?.length) return archivos.find((a) => a.clave === String(firmadoId)) ?? archivos[0]
  if (firmadoId) return { clave: String(firmadoId), rotulo: 'Firmado', nombre: 'firmado.pdf', esImagen: false, ruta: `/api/documentos/${docId}/adjuntos/${firmadoId}` }
  return { clave: 'documento', rotulo: 'Documento', nombre: 'documento.pdf', esImagen: false, ruta: `/api/documentos/${docId}/pdf` }
}

/** Formato de la imagen de página: «png» (lo que admite el portapapeles: «Copiar imagen») o «jpeg»
 *  (lo que muestra el visor: menos de la mitad de peso, sin diferencia a la vista). */
export type FormatoImagen = 'png' | 'jpeg'

/** La ruta de la imagen de una página: el servidor rasteriza el PDF (`adjuntos.py::imagen_de_pagina`);
 *  una imagen se pide tal cual (siempre una sola «página»). PNG es el valor por omisión; el visor pide
 *  `formato=jpeg` (2026-10-19). El servidor responde con ETag y 304 cuando el PDF no cambió. */
export function rutaImagen(docId: number, archivo: ArchivoRapido, pagina = 1, ancho = 0, formato: FormatoImagen = 'png'): string {
  if (archivo.esImagen) return archivo.ruta
  return `/api/documentos/${docId}/imagen?pagina=${Math.max(1, pagina)}&archivo=${encodeURIComponent(archivo.clave)}${ancho > 0 ? `&ancho=${ancho}` : ''}${formato === 'jpeg' ? '&formato=jpeg' : ''}`
}

/** Ancho de la página entera a 150 ppp (A4): por encima no se gana nitidez. */
export const ANCHO_PAGINA = 1240
const PASO_ANCHO = 128

/**
 * A qué ancho (px de imagen) pedir la página para una lámina de `anchoLamina` px CSS en una pantalla
 * de densidad `dpr`: el justo para que se vea nítida, redondeado hacia arriba a un paso de 128 px
 * (así un cambio pequeño de tamaño no vuelve a pedir la imagen). 0 = la página entera. Edison
 * 2026-10-19: «debe ser lo más liviano posible»: en un celular de 375 px a 2× salen 768 px (100 KB,
 * 0,16 s) en vez de 1240 px (184 KB, 0,30 s), medido en la instancia de prueba.
 */
export function anchoImagen(anchoLamina: number, dpr: number): number {
  const px = Math.ceil((Math.max(1, anchoLamina) * Math.max(1, dpr)) / PASO_ANCHO) * PASO_ANCHO
  return px >= ANCHO_PAGINA ? 0 : px
}

/** Clave del caché de imágenes del navegador (la misma página a dos anchos son dos imágenes). */
export const claveImagen = (docId: number, archivoClave: string, pagina: number, ancho = 0): string => `${docId}:${archivoClave}:${pagina}:${ancho}`

// ---------------------------------------------------------------- gestos y teclas

export type Gesto = 'siguiente' | 'anterior' | 'pagina_siguiente' | 'pagina_anterior' | null

/** Más que esto en menos de este tiempo es un deslizamiento, aunque sea corto. */
const RAPIDO_PX = 40
const RAPIDO_MS = 400
/** Si fue lento, tiene que recorrer esta parte de la pantalla. */
const PARTE_ANCHO = 0.2
const PARTE_ALTO = 0.15

/**
 * Qué quiso hacer el dedo. `dx`/`dy` son el recorrido en píxeles desde que tocó hasta que soltó (a la
 * derecha y hacia abajo son positivos), `ms` lo que tardó, y `ancho`/`alto` el tamaño de la zona.
 * Como TikTok (Edison, 2026-10-19): de arriba abajo (hacia arriba = el siguiente) cambia de
 * DOCUMENTO; de lado (hacia la izquierda = la siguiente, como pasar una hoja) cambia de LÁMINA: la
 * página siguiente o, acabadas, el siguiente archivo del mismo documento (firmado, cargo, adjuntos…).
 * Un gesto en diagonal o demasiado corto no hace nada: mejor no moverse que moverse mal.
 */
export function interpretarGesto(dx: number, dy: number, ms: number, ancho: number, alto: number): Gesto {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const horizontal = ax >= ay * 1.5
  const vertical = ay >= ax * 1.5
  const rapido = ms <= RAPIDO_MS
  if (vertical && (ay >= alto * PARTE_ALTO || (rapido && ay >= RAPIDO_PX))) return dy < 0 ? 'siguiente' : 'anterior'
  if (horizontal && (ax >= ancho * PARTE_ANCHO || (rapido && ax >= RAPIDO_PX))) return dx < 0 ? 'pagina_siguiente' : 'pagina_anterior'
  return null
}

export type Tecla = Gesto | 'cerrar' | 'abrir'

/** La tecla pulsada en el escritorio: arriba/abajo = documento (como el gesto); de lado y AvPág/RePág = lámina. */
export function interpretarTecla(key: string): Tecla {
  switch (key) {
    case 'ArrowDown':
      return 'siguiente'
    case 'ArrowUp':
      return 'anterior'
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      return 'pagina_siguiente'
    case 'ArrowLeft':
    case 'PageUp':
      return 'pagina_anterior'
    case 'Escape':
      return 'cerrar'
    case 'Enter':
      return 'abrir'
    default:
      return null
  }
}

/** La página a la que se va con un gesto vertical (acotada: no da la vuelta). */
export function paginaTras(gesto: Gesto, pagina: number, total: number): number {
  if (gesto === 'pagina_siguiente') return Math.min(total, pagina + 1)
  if (gesto === 'pagina_anterior') return Math.max(1, pagina - 1)
  return pagina
}

/**
 * La lámina que sigue dentro del mismo documento (2026-10-19): la página siguiente de este archivo
 * o, agotadas, la primera del archivo siguiente (firmado → documento → cargos → adjuntos); hacia
 * atrás, la página anterior o la primera del archivo anterior (su última página no se conoce sin
 * pedirla). En los extremos no se mueve. Pura.
 */
export function laminaTras(gesto: Gesto, archivos: readonly { clave: string }[], clave: string, pagina: number, total: number): { clave: string; pagina: number } {
  const i = archivos.findIndex((a) => a.clave === clave)
  if (gesto === 'pagina_siguiente') {
    if (pagina < total) return { clave, pagina: pagina + 1 }
    return i >= 0 && i < archivos.length - 1 ? { clave: archivos[i + 1].clave, pagina: 1 } : { clave, pagina }
  }
  if (gesto === 'pagina_anterior') {
    if (pagina > 1) return { clave, pagina: pagina - 1 }
    return i > 0 ? { clave: archivos[i - 1].clave, pagina: 1 } : { clave, pagina }
  }
  return { clave, pagina }
}

/** Cuántas veces se ha mostrado la guía de gestos; tras TRES, ya no (se recuerda por aparato). */
export const VECES_GUIA = 3
export const CLAVE_GUIA = 'sgdp_visor_guia'

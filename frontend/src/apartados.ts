/**
 * LO APARTADO TRAS UN CHOQUE DE VERSIONES (2026-10-21, separado de `sinconexion.ts`): el contenido de un documento que
 * el servidor rechazó por 409 `documento_modificado` se aparta en este equipo (localStorage) y el editor lo ofrece al
 * abrir («Cargar mis cambios» / «Descartar»). Lo usan la cola sin conexión de Qillqa (al subir lo encolado) y el editor
 * de Gestión documental (al guardar, con o sin Qillqa). Gestión documental tiene su copia IDÉNTICA en
 * `componentes/qillqasqa/apartados.ts` (Qillqasqa Q6b-2d); la prueba de fronteras vigila que no se separen.
 */

/**
 * Contenido de un documento APARTADO en este equipo porque el servidor lo
 * rechazó por conflicto de versiones (409 `documento_modificado`): alguien lo
 * guardó desde otro lugar. El editor lo ofrece al abrir el documento
 * («Cargar mis cambios» / «Descartar»). Nunca se descarta solo.
 */
export interface ContenidoApartado {
  campos: Record<string, string>
  cuerpo: object
  version_base?: number
  apartado_en: number
}

export const claveConflicto = (documentoId: string | number): string =>
  `qillqa_conflicto_${documentoId}`

/** Los apartados anteriores de un documento (2026-10-12): antes, cada choque nuevo REEMPLAZABA al
 * apartado que la persona aún no había cargado y lo escrito entre un choque y otro se perdía (el
 * 12 de octubre, con la edición simultánea caída, hubo quince choques seguidos en un oficio). Ahora
 * el que se reemplaza pasa a esta lista (los cinco más recientes) y el editor los ofrece. */
export const claveApartadosAnteriores = (documentoId: string | number): string =>
  `qillqa_conflicto_${documentoId}_anteriores`

const MAX_ANTERIORES = 5

export function leerApartadosAnteriores(documentoId: string | number): ContenidoApartado[] {
  try {
    const lista = JSON.parse(localStorage.getItem(claveApartadosAnteriores(documentoId)) || '[]')
    return Array.isArray(lista) ? (lista as ContenidoApartado[]) : []
  } catch {
    return []
  }
}

export function escribirApartadosAnteriores(documentoId: string | number, lista: ContenidoApartado[]): void {
  try {
    if (lista.length) localStorage.setItem(claveApartadosAnteriores(documentoId), JSON.stringify(lista.slice(0, MAX_ANTERIORES)))
    else localStorage.removeItem(claveApartadosAnteriores(documentoId))
  } catch {
    /* sin sitio: el apartado vigente sigue */
  }
}

const mismoContenido = (a: Pick<ContenidoApartado, 'campos' | 'cuerpo'>, b: Pick<ContenidoApartado, 'campos' | 'cuerpo'>) =>
  JSON.stringify(a.campos ?? {}) === JSON.stringify(b.campos ?? {}) && JSON.stringify(a.cuerpo ?? {}) === JSON.stringify(b.cuerpo ?? {})

/** Aparta lo de este equipo tras un choque, sin perder el apartado que aún no se cargó. */
export function guardarApartado(documentoId: string | number, apartado: ContenidoApartado): void {
  const clave = claveConflicto(documentoId)
  try {
    const previo = localStorage.getItem(clave)
    if (previo) {
      const viejo = JSON.parse(previo) as ContenidoApartado
      if (!mismoContenido(viejo, apartado)) escribirApartadosAnteriores(documentoId, [viejo, ...leerApartadosAnteriores(documentoId)])
    }
  } catch {
    /* apartado previo ilegible: se reemplaza */
  }
  localStorage.setItem(clave, JSON.stringify(apartado))
}

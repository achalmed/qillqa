/**
 * LOS MENÚS del Formato Word (2026-10-19, Edison: «que se parezca a la imagen de Google Docs»): el
 * modelo puro de la fila «Archivo · Editar · Ver · Insertar · Formato · Herramientas · Ayuda». Cada
 * módulo aporta su «Archivo» (nuevo, desde un Word, descargar…); lo demás lo arma `BarraWord` sobre el
 * editor activo. Aquí solo tipos y funciones puras (probadas en pruebas/menus.test.ts): la búsqueda
 * «Buscar en los menús» recorre este árbol, y los pasos del tamaño de letra y del zoom son de aquí.
 */
import type { ReactNode } from 'react'

export interface ItemMenu {
  texto: string
  icono?: ReactNode
  /** Atajo, como se escribe («Ctrl+B»). Solo se muestra. */
  atajo?: string
  accion?: () => void
  /** Submenú (se abre dentro del mismo menú, con «‹ Volver»). */
  hijos?: ItemMenu[]
  deshabilitado?: boolean
  /** Con una marca de «activo» (negrita puesta, zoom actual…). */
  activo?: boolean
  /** Una línea divisoria (lo demás se ignora). */
  separador?: boolean
}

export interface MenuDef { clave: string; titulo: string; items: ItemMenu[] }

export const SEPARADOR: ItemMenu = { texto: '', separador: true }

/** Los zoom que se ofrecen (como Google Docs). */
export const ZOOMS = [50, 75, 90, 100, 125, 150, 200]
/** Tamaños de letra del PDF que el marco admite (fmt_tamano). */
export const TAMANOS = ['10', '10.5', '11', '11.5', '12']
export const INTERLINEADOS: { valor: string; etiqueta: string }[] = [
  { valor: '1', etiqueta: 'Sencillo' }, { valor: '1.15', etiqueta: '1,15' }, { valor: '1.25', etiqueta: '1,25' }, { valor: '1.5', etiqueta: '1,5' },
]

/** El id del campo «comentario nuevo» del panel: el botón «Comentario» de la barra lo enfoca. */
export const ID_COMENTARIO_NUEVO = 'sgdp-comentario-nuevo'

export const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** El siguiente tamaño de letra hacia arriba (+1) o abajo (−1); en el borde, se queda. */
export function pasoTamano(actual: string, direccion: 1 | -1): string {
  const i = TAMANOS.indexOf(actual || '11')
  const j = Math.max(0, Math.min(TAMANOS.length - 1, (i < 0 ? TAMANOS.indexOf('11') : i) + direccion))
  return TAMANOS[j]
}

/** «Buscar en los menús»: las acciones cuyo camino («Formato › Texto › Negrita») contiene la consulta
 *  (sin tildes ni mayúsculas); las deshabilitadas y los separadores no salen. */
export function buscarEnMenus(menus: MenuDef[], consulta: string, tope = 12): { ruta: string; item: ItemMenu }[] {
  const q = normalizar(consulta.trim())
  if (!q) return []
  const salida: { ruta: string; item: ItemMenu }[] = []
  const recorrer = (items: ItemMenu[], ruta: string[]) => {
    for (const it of items) {
      if (it.separador) continue
      const r = [...ruta, it.texto]
      if (it.hijos?.length) recorrer(it.hijos, r)
      else if (it.accion && !it.deshabilitado && normalizar(r.join(' ')).includes(q)) salida.push({ ruta: r.join(' › '), item: it })
    }
  }
  for (const m of menus) recorrer(m.items, [m.titulo])
  return salida.slice(0, tope)
}

/** Cuántos ítems ejecutables tiene un árbol de menús (para la prueba y para el aviso de Ayuda). */
export function contarAcciones(menus: MenuDef[]): number {
  let n = 0
  const recorrer = (items: ItemMenu[]) => { for (const it of items) { if (it.separador) continue; if (it.hijos?.length) recorrer(it.hijos); else if (it.accion) n += 1 } }
  for (const m of menus) recorrer(m.items)
  return n
}

/** El corrector del navegador (ortografía) está encendido salvo que la persona lo apagara. */
export const CLAVE_ORTOGRAFIA = 'sgdp_ortografia'
export function leerOrtografia(): boolean {
  try { return localStorage.getItem(CLAVE_ORTOGRAFIA) !== 'no' } catch { return true }
}

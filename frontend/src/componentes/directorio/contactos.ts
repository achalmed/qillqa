/**
 * CONTACTOS del directorio (2026-10-13) — la lógica pura de la lista al estilo de Google Contacts:
 * la letra de cada nombre, los grupos por letra con «Favoritos» arriba, el color del avatar, la
 * búsqueda sin tildes y los enlaces de Llamar y WhatsApp. Sin React ni MUI: lo prueban
 * `pruebas/contactos.test.ts` con `node --test`.
 */

/** Lo mínimo de una persona que usa la lista (directorio.ts → Persona). */
export interface ContactoLista {
  id: number
  nombre: string
  cargo: string
  institucion_id: number | null
  celular: string
  telefono: string
  email: string
  email_alterno: string
  area?: string
  oficina?: string
  anexo?: string
  notas?: string
  activo: boolean
  etiquetas?: string[]
  favorito?: boolean
}

/** Sin tildes y en minúsculas, pero la «ñ» se queda (es otra letra en español). */
export function plano(texto: string): string {
  return (texto ?? '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** La letra del encabezado: A…Z y Ñ; lo que no empieza con letra va en «#». */
export function letraDe(nombre: string): string {
  const c = plano(nombre).charAt(0)
  if (c === 'ñ') return 'Ñ'
  return /[a-z]/.test(c) ? c.toUpperCase() : '#'
}

/** La inicial del avatar (una sola letra, como Google). */
export function inicial(nombre: string): string {
  const c = (nombre ?? '').trim().charAt(0)
  return c ? c.toLocaleUpperCase('es') : '·'
}

/** Orden del español: «Ñ» después de «N», «#» al final. */
export function compararNombres(a: string, b: string): number {
  const la = letraDe(a)
  const lb = letraDe(b)
  if (la !== lb) {
    if (la === '#') return 1
    if (lb === '#') return -1
  }
  return a.localeCompare(b, 'es', { sensitivity: 'base' })
}

export interface Grupo<T> {
  clave: string
  titulo: string
  contactos: T[]
}

/** «Favoritos» arriba (si hay) y luego un grupo por letra. Un favorito también sale en su letra,
 *  como en Google Contacts. */
export function agrupar<T extends ContactoLista>(lista: T[], conFavoritos = true): Grupo<T>[] {
  const ordenados = [...lista].sort((a, b) => compararNombres(a.nombre, b.nombre))
  const grupos: Grupo<T>[] = []
  const favoritos = conFavoritos ? ordenados.filter((c) => c.favorito) : []
  if (favoritos.length) grupos.push({ clave: 'favoritos', titulo: 'Favoritos', contactos: favoritos })
  let actual: Grupo<T> | null = null
  for (const c of ordenados) {
    const l = letraDe(c.nombre)
    if (!actual || actual.clave !== l) {
      actual = { clave: l, titulo: l, contactos: [] }
      grupos.push(actual)
    }
    actual.contactos.push(c)
  }
  return grupos
}

/** Colores de los avatares sin foto: de la paleta (vino, dorado oscuro, petróleo, azul marino,
 *  azul, verde y gris cálido), sin naranja ni rosa. Siempre el mismo para la misma persona. */
// Tonos apagados (2026-10-19, rediseño tipo macOS): se distinguen sin colores vivos.
export const COLORES_AVATAR = ['#5E5E63', '#9A7A3C', '#5E7A7B', '#6A7A94', '#7A6A8C', '#6F8A72', '#7D6A60']

export function colorDe(id: number): string {
  return COLORES_AVATAR[Math.abs(id) % COLORES_AVATAR.length]
}

/** Los dígitos de un número peruano de 9 que empieza con 9 (quitando +51), o '' si no lo es. */
export function celularPeruano(numero: string): string {
  let d = (numero ?? '').replace(/\D/g, '')
  if (d.startsWith('0051')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('51')) d = d.slice(2)
  return d.length === 9 && d.startsWith('9') ? d : ''
}

/** «987654321» → «987 654 321»; otro número, tal cual. */
export function telefonoLegible(numero: string): string {
  const p = celularPeruano(numero)
  return p ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : (numero ?? '').trim()
}

export function enlaceLlamada(numero: string): string {
  const p = celularPeruano(numero)
  if (p) return `tel:+51${p}`
  const d = (numero ?? '').replace(/[^\d+]/g, '')
  return d ? `tel:${d}` : ''
}

/** WhatsApp: un celular peruano (con +51) o un número internacional escrito con «+». */
export function enlaceWhatsapp(numero: string): string {
  const p = celularPeruano(numero)
  if (p) return `https://wa.me/51${p}`
  const t = (numero ?? '').trim()
  const d = t.replace(/\D/g, '')
  return t.startsWith('+') && d.length >= 8 ? `https://wa.me/${d}` : ''
}

export interface Filtro {
  q?: string
  etiqueta?: string
  soloFavoritos?: boolean
}

/** Búsqueda por palabras sin tildes en nombre, cargo, institución, contacto y etiquetas; todas las
 *  palabras deben aparecer (como la búsqueda del servidor). `institucion` da el nombre y las
 *  siglas de la institución de cada persona. */
export function filtrar<T extends ContactoLista>(lista: T[], f: Filtro, institucion: (id: number | null) => string = () => ''): T[] {
  const palabras = plano(f.q ?? '').split(' ').filter(Boolean)
  const etiqueta = plano(f.etiqueta ?? '')
  return lista.filter((c) => {
    if (f.soloFavoritos && !c.favorito) return false
    if (etiqueta && !(c.etiquetas ?? []).some((e) => plano(e) === etiqueta)) return false
    if (!palabras.length) return true
    const texto = plano([c.nombre, c.cargo, c.area, c.oficina, c.email, c.email_alterno, c.celular, c.telefono, c.anexo,
      institucion(c.institucion_id), ...(c.etiquetas ?? [])].filter(Boolean).join(' '))
    const soloDigitos = texto.replace(/\s/g, '')
    return palabras.every((p) => texto.includes(p) || (/^\d{3,}$/.test(p) && soloDigitos.includes(p)))
  })
}

/** Las etiquetas en uso, con cuántos contactos activos tiene cada una, en orden alfabético. */
export function etiquetasEnUso(lista: ContactoLista[]): { nombre: string; n: number }[] {
  const m = new Map<string, { nombre: string; n: number }>()
  for (const c of lista) {
    if (!c.activo) continue
    for (const e of c.etiquetas ?? []) {
      const k = plano(e)
      const x = m.get(k) ?? { nombre: e, n: 0 }
      x.n += 1
      m.set(k, x)
    }
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}

/** La línea secundaria de la lista: «Cargo · SIGLAS» (o el nombre de la institución). */
export function lineaSecundaria(c: ContactoLista, inst?: { nombre: string; siglas?: string } | null): string {
  const donde = inst ? inst.siglas || inst.nombre : ''
  return [c.cargo, donde].filter(Boolean).join(' · ')
}

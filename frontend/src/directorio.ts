/**
 * DIRECTORIO — el modelo común de la página, la ficha y los formularios
 * (Edison 2026-10-01: «el directorio es una base estructural del sistema: debe
 * estar bien organizado, ser fácil de administrar y servir a los procesos»).
 *
 * Aquí viven los tipos, las etiquetas legibles y, sobre todo, QUÉ DATOS USA EL
 * SISTEMA de cada ficha: una entidad sin mesa de partes no se puede enviar por
 * vía virtual; una persona sin tratamiento sale «Señor/Señora» a ciegas en el
 * oficio. Esas reglas dicen qué está «por completar» en el resumen y en cada
 * ficha; no bloquean nada (el backend acepta la ficha incompleta, como antes).
 */

export interface Institucion {
  id: number
  nombre: string
  siglas: string
  tipo: string
  sector: string
  nivel_gobierno: string
  parent_id: number | null
  region: string
  url_oficial: string
  url_mesa_partes: string
  email: string
  telefono: string
  direccion: string
  ruc: string
  activo: boolean
  notas: string
  origen: string
  categoria: string
  orden: number
  fuente: string
  url_fuente: string
  fecha_consulta: string
  norma: string
}

export interface Persona {
  id: number
  nombre: string
  cargo: string
  tratamiento: string
  institucion_id: number | null
  email: string
  // Contacto ampliado (Edison 2026-09-04): el celular es el dato de uso
  // diario y el ANEXO es la vía interna del Congreso.
  email_alterno: string
  telefono: string
  celular: string
  anexo: string
  oficina: string
  area: string
  activo: boolean
  notas: string
  origen: string
  // Contactos (2026-10-13): versión de la foto ('' = sin foto), etiquetas o grupos, la cuenta del
  // Qillqa si la tiene (Mensaje; su ficha se cambia en Mi perfil) y si es favorito de quien mira.
  foto?: string
  etiquetas?: string[]
  usuario_id?: number | null
  favorito?: boolean
}

export const INST_VACIA: Institucion = {
  id: 0, nombre: '', siglas: '', tipo: 'otro', sector: '', nivel_gobierno: '',
  parent_id: null, region: '', url_oficial: '', url_mesa_partes: '', email: '',
  telefono: '', direccion: '', ruc: '', activo: true, notas: '', origen: 'manual',
  categoria: '', orden: 0, fuente: '', url_fuente: '', fecha_consulta: '', norma: '',
}
export const PERS_VACIA: Persona = {
  id: 0, nombre: '', cargo: '', tratamiento: '', institucion_id: null,
  email: '', email_alterno: '', telefono: '', celular: '', anexo: '',
  oficina: '', area: '', activo: true, notas: '', origen: 'manual', etiquetas: [],
}

/** Tipo de institución: el valor guardado (no cambia) y cómo se lee. */
export const TIPO_INST: Record<string, { uno: string; varios: string }> = {
  poder: { uno: 'Poder del Estado', varios: 'Poderes del Estado' },
  autonomo: { uno: 'Organismo autónomo', varios: 'Organismos autónomos' },
  ministerio: { uno: 'Ministerio', varios: 'Ministerios' },
  organismo: { uno: 'Organismo público', varios: 'Organismos públicos' },
  regulador: { uno: 'Regulador / superintendencia', varios: 'Reguladores y superintendencias' },
  region: { uno: 'Gobierno regional', varios: 'Gobiernos regionales' },
  municipalidad: { uno: 'Municipalidad', varios: 'Municipalidades' },
  universidad: { uno: 'Universidad', varios: 'Universidades' },
  empresa: { uno: 'Empresa pública', varios: 'Empresas públicas' },
  organo: { uno: 'Órgano', varios: 'Órganos' },
  direccion: { uno: 'Dirección', varios: 'Direcciones' },
  oficina: { uno: 'Oficina', varios: 'Oficinas' },
  unidad: { uno: 'Unidad orgánica', varios: 'Unidades orgánicas' },
  programa: { uno: 'Programa', varios: 'Programas' },
  proyecto: { uno: 'Proyecto', varios: 'Proyectos' },
  otro: { uno: 'Otro', varios: 'Otros' },
}
/** Orden de presentación (del Estado hacia sus dependencias). */
export const ORDEN_TIPOS = Object.keys(TIPO_INST)
export const tipoUno = (t: string) => TIPO_INST[t]?.uno ?? t
export const tipoVarios = (t: string) => TIPO_INST[t]?.varios ?? t

export const NIVELES: Record<string, string> = { nacional: 'Nacional', regional: 'Regional', local: 'Local' }

/**
 * Tratamientos: los MISMOS del oficio (backend/app/tipos.py `_TRATAMIENTOS`),
 * con dos puntos, porque el generador los pone solos en su línea («Señor:»)
 * y el formulario del documento los elige de esa lista. Se puede escribir
 * otro; `conDosPuntos` le añade los dos puntos al guardar.
 */
export const TRATAMIENTOS = ['Señor:', 'Señora:', 'Señorita:', 'Señores:', 'Señoras:']
export const conDosPuntos = (t: string) => {
  const v = t.trim().replace(/[.:;,]+$/, '')
  return v ? `${v}:` : ''
}
/** Para leerlo junto al nombre: «Señor Óscar…», sin los dos puntos. */
export const tratamientoLegible = (t: string) => t.trim().replace(/:$/, '')

/** Una entidad es la cabeza (sin padre); el resto son sus dependencias. */
export const esEntidad = (i: Institucion) => i.parent_id === null

export interface Requisito {
  clave: string
  texto: string
  /** Para qué lo usa el sistema (se muestra en la ficha). */
  uso: string
  ok: boolean
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RE_URL = /^https?:\/\/\S+\.\S+/i

/**
 * Lo que el sistema usa de una ENTIDAD. Las dependencias (direcciones,
 * oficinas) tramitan por la mesa de partes de su entidad, así que solo se les
 * mide lo que es suyo (autoridad).
 */
export function requisitosInstitucion(i: Institucion, autoridades: number | null): Requisito[] {
  const r: Requisito[] = []
  if (esEntidad(i)) {
    r.push(
      { clave: 'mesa', texto: 'Mesa de partes virtual', uso: 'Envío de documentos por la vía virtual', ok: RE_URL.test(i.url_mesa_partes) },
      { clave: 'correo', texto: 'Correo institucional', uso: 'Envío por correo y constancias', ok: RE_CORREO.test(i.email) },
      { clave: 'direccion', texto: 'Dirección', uso: 'Oficios en papel y cargo de recepción', ok: Boolean(i.direccion.trim()) },
      { clave: 'ruc', texto: 'RUC', uso: 'Trámites administrativos', ok: /^\d{11}$/.test(i.ruc.trim()) },
    )
  }
  if (autoridades !== null) {
    r.push({ clave: 'autoridad', texto: 'Autoridad registrada', uso: 'Destinatario sugerido al redactar un documento', ok: autoridades > 0 })
  }
  return r
}

/** Lo que el sistema usa de una PERSONA (destinatario de un oficio). */
export function requisitosPersona(p: Persona): Requisito[] {
  return [
    { clave: 'tratamiento', texto: 'Tratamiento', uso: 'Encabezado del oficio («Señor…»)', ok: Boolean(p.tratamiento.trim()) },
    { clave: 'cargo', texto: 'Cargo', uso: 'Destinatario del documento', ok: Boolean(p.cargo.trim()) },
    { clave: 'institucion', texto: 'Institución', uso: 'Entidad destino y su mesa de partes', ok: p.institucion_id !== null },
    { clave: 'contacto', texto: 'Una vía de contacto', uso: 'Celular, anexo o correo', ok: Boolean(p.celular || p.anexo || p.email || p.email_alterno || p.telefono) },
  ]
}

export const faltan = (r: Requisito[]) => r.filter((x) => !x.ok)

/** Avisos de formato al escribir (no impiden guardar). */
export const avisoRuc = (v: string) => (v.trim() && !/^\d{11}$/.test(v.trim()) ? 'El RUC tiene 11 dígitos' : '')
export const avisoCorreo = (v: string) => (v.trim() && !RE_CORREO.test(v.trim()) ? 'Revise el correo (falta @ o el dominio)' : '')
export const avisoUrl = (v: string) => (v.trim() && !RE_URL.test(v.trim()) ? 'Debe empezar con https://' : '')

/** Para comparar nombres sin tildes, mayúsculas ni signos. */
export const normal = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Posibles duplicados al crear: fichas cuyo nombre (o siglas) coincide o
 * contiene al escrito. Una base con duplicados reparte las autoridades y
 * los enlaces entre dos fichas y el autocompletado ofrece las dos.
 */
export function parecidas<T extends { id: number; nombre: string; siglas?: string }>(lista: T[], nombre: string, siglas = '', id = 0): T[] {
  const n = normal(nombre)
  const s = normal(siglas)
  if (n.length < 5 && !s) return []
  return lista
    .filter((x) => x.id !== id)
    .filter((x) => {
      const xn = normal(x.nombre)
      return (n.length >= 5 && (xn === n || xn.includes(n) || (xn.length >= 5 && n.includes(xn)))) || (s.length >= 2 && normal(x.siglas ?? '') === s)
    })
    .slice(0, 4)
}

export const iniciales = (n: string) =>
  n.split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(p)).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '·'

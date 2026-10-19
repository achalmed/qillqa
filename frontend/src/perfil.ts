/**
 * PERFIL — lógica pura del perfil y la tarjeta de contacto (2026-10-12). Espejo de
 * `backend/app/servicios/perfil.py` (el servidor manda: estas reglas solo avisan antes de
 * guardar). Pruebas en `pruebas/perfil.test.ts`.
 */

/** La tarjeta de una persona tal como la devuelve `GET /api/usuarios/{id}/perfil`. */
export interface Tarjeta {
  id: number
  nombre: string
  nombres: string
  apellidos: string
  cuenta: string
  cargo: string
  rol: string
  acerca: string
  /** Versión de la foto (cambia con cada subida); vacío sin foto. */
  foto: string
  activo: boolean
  estado: 'en_linea' | 'ausente' | 'desconectado'
  ultima_actividad: string | null
  propia: boolean
  con_contacto: boolean
  email: string
  celular: string
  whatsapp: string
  puede_chatear: boolean
  /** Solo para la propia persona o quien administra. */
  dni?: string
}

/** Mi perfil (`GET /api/cuenta/perfil`): la tarjeta propia y los cargos que puedo elegir. */
export interface MiPerfil extends Tarjeta {
  dni: string
  cargos: string[]
  max_acerca: number
}

export const MAX_ACERCA = 140

export const ETIQUETA_ROL: Record<string, string> = {
  administrador: 'Administrador',
  secretaria: 'Secretaría',
  asesor: 'Asesor',
  diputado: 'Diputado',
  prensa: 'Prensa',
  invitado: 'Invitado (solo lectura)',
}

/** Celular peruano: «+51 987 654 321», «987-654-321»… → «987654321»; null si no es válido; '' vacío. */
export function normalizarCelular(texto: string): string | null {
  let d = (texto ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 11 && d.startsWith('51')) d = d.slice(2)
  return d.length === 9 && d.startsWith('9') ? d : null
}

/** «987654321» → «987 654 321». */
export function celularLegible(c: string): string {
  return c && c.length === 9 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : c ?? ''
}

export const enlaceWhatsapp = (c: string) => (c ? `https://wa.me/51${c}` : '')
export const enlaceLlamada = (c: string) => (c ? `tel:+51${c}` : '')
export const enlaceCorreo = (e: string) => (e ? `mailto:${e}` : '')

export const dniValido = (d: string) => /^\d{8}$/.test((d ?? '').replace(/\s+/g, ''))
export const correoValido = (e: string) => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test((e ?? '').trim())

/** El problema de un dato antes de guardarlo, o '' si está bien (los mismos textos del servidor). */
export function errorDe(campo: 'nombres' | 'apellidos' | 'dni' | 'email' | 'celular' | 'acerca', valor: string): string {
  const v = (valor ?? '').trim()
  switch (campo) {
    case 'nombres':
    case 'apellidos':
      return v ? (v.length > 80 ? `Sus ${campo}: 80 caracteres como mucho.` : '') : `Escriba sus ${campo}.`
    case 'dni':
      return !v || dniValido(v) ? '' : 'El DNI tiene 8 dígitos.'
    case 'email':
      return !v || correoValido(v) ? '' : 'El correo no es válido (ejemplo: nombre@dominio.pe).'
    case 'celular':
      return normalizarCelular(v) === null ? 'El celular tiene 9 dígitos y empieza con 9 (ejemplo: 987 654 321).' : ''
    case 'acerca':
      return v.replace(/\s+/g, ' ').length > MAX_ACERCA ? `«Info»: ${MAX_ACERCA} caracteres como mucho.` : ''
  }
}

/** Nombres y apellidos para editar: los guardados o, en una cuenta antigua sin ellos, el nombre entero. */
export function nombresParaEditar(t: Pick<Tarjeta, 'nombres' | 'apellidos' | 'nombre'>): { nombres: string; apellidos: string } {
  if (t.nombres || t.apellidos) return { nombres: t.nombres, apellidos: t.apellidos }
  return { nombres: t.nombre ?? '', apellidos: '' }
}

/** Ruta de la foto de una persona; la versión entra en la clave del caché local. */
export const rutaFoto = (id: number) => `/api/usuarios/${id}/foto`

/** Datos al primer ingreso (2026-10-18): lo que se pide, con su rótulo (el orden del formulario). Espejo de
 *  `servicios/perfil.py::DATOS_PEDIDOS`; el servidor manda (`POST /api/cuenta/bienvenida`). */
export const DATOS_BIENVENIDA = [
  ['nombres', 'nombres'],
  ['apellidos', 'apellidos'],
  ['celular', 'celular'],
  ['email', 'correo'],
  ['cargo', 'cargo'],
] as const

export type DatosBienvenida = Record<(typeof DATOS_BIENVENIDA)[number][0], string>

/** Los rótulos de lo que falta escribir. */
export const faltanEnBienvenida = (d: DatosBienvenida): string[] =>
  DATOS_BIENVENIDA.filter(([campo]) => !(d[campo] ?? '').trim()).map(([, rotulo]) => rotulo)

/** El primer problema de los datos (lo que falta o lo que está mal escrito), o '' si se puede guardar. */
export function problemaBienvenida(d: DatosBienvenida): string {
  const faltan = faltanEnBienvenida(d)
  if (faltan.length) return `Falta: ${faltan.join(', ')}.`
  for (const campo of ['nombres', 'apellidos', 'celular', 'email'] as const) {
    const e = errorDe(campo, d[campo])
    if (e) return e
  }
  return ''
}

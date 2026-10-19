/**
 * El mensaje para COMPARTIR EL ACCESO de una cuenta (2026-10-18). Edison: «un ícono compartir que me dé
 * los datos para copiar y pegar en Telegram o WhatsApp: primero el saludo y luego la información, muy
 * breve y exacto, con lo relevante (instalar en el celular, la extensión), sin abrumar». Puro: lo arma
 * `componentes/admin/CompartirAcceso.tsx`; pruebas en `pruebas/acceso.test.ts`.
 */

export interface DatosAcceso {
  /** Nombre completo de la persona (se saluda por el primero). */
  nombre: string
  usuario: string
  enlace: string
  /** La contraseña temporal; vacía si la persona ya tiene la suya. */
  clave: string
  /** Si al entrar confirmará sus datos (paso de bienvenida). */
  datosPendientes: boolean
  /** Si usa las mesas de partes desde la computadora (la extensión): no prensa ni invitado. */
  conExtension: boolean
}

/** Alfabeto sin letras ni cifras que se confundan (0/O, 1/l/I). */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Una contraseña temporal legible: «sgdp-xxxx-xxxx» (sirve una sola vez). */
export function claveTemporal(azar: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n): string {
  const tramo = () => Array.from({ length: 4 }, () => ALFABETO[azar(ALFABETO.length)]).join('')
  return `sgdp-${tramo()}-${tramo()}`
}

export function mensajeAcceso(d: DatosAcceso): string {
  const primero = d.nombre.trim().split(/\s+/)[0] ?? ''
  const pasos = [
    d.clave ? 'Al entrar, elija su propia contraseña.' : 'Entre con su contraseña de siempre.',
    d.datosPendientes && 'Confirme su celular, correo y cargo.',
    'En el celular, ábralo en Chrome y elija «Instalar app» (o «Agregar a pantalla principal»).',
    d.conExtension && 'En la computadora, para las mesas de partes: Directorio → Mesas de partes → «Descargar la extensión».',
  ].filter(Boolean) as string[]
  return [
    `Hola${primero ? `, ${primero}` : ''}. Ya tiene su cuenta en Qillqa de la entidad.`,
    '',
    `🔗 ${d.enlace}`,
    `👤 Usuario: ${d.usuario}`,
    ...(d.clave ? [`🔑 Contraseña temporal: ${d.clave}`] : []),
    '',
    ...pasos.map((p, i) => `${i + 1}. ${p}`),
  ].join('\n')
}

/** Enlaces para abrir el chat ya escrito (el celular peruano, de 9 dígitos, si lo hay). */
export const enlaceWhatsappCon = (texto: string, celular = '') =>
  `https://wa.me/${celular ? `51${celular}` : ''}?text=${encodeURIComponent(texto)}`
export const enlaceTelegramCon = (texto: string, enlace: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(enlace)}&text=${encodeURIComponent(texto)}`

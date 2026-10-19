import { PALETA } from './paleta'
// Estados del ciclo de vida documental (deben coincidir con el backend).
export const ESTADOS = [
  'BORRADOR',
  'EN_REVISION',
  'OBSERVADO',
  'APROBADO',
  'FIRMADO',
  'ENVIADO',
  'OBSERVADO_ENVIADO',
  'ARCHIVADO',
] as const

export type Estado = (typeof ESTADOS)[number]

export const ETIQUETA_ESTADO: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  OBSERVADO: 'Observado',
  APROBADO: 'Aprobado',
  FIRMADO: 'Firmado',
  ENVIADO: 'Enviado',
  OBSERVADO_ENVIADO: 'Observado posterior',
  ARCHIVADO: 'Archivado',
}

// Cada estado tiene SU PROPIO color (pedido de Edison), de la paleta común
// (paleta.ts; desde el 2026-10-19 tonos apagados tipo macOS): gris=borrador ·
// azul apagado=en revisión · arena=observado · verde azulado=aprobado · pizarra=firmado ·
// salvia=enviado · rojo apagado=observado posterior · gris oscuro=archivado.
// (Edison 2026-08-24: enviado=verde «listo»; el observado
// POSTERIOR al envío va en rojo para distinguirlo del primer observado.)
export const COLOR_ESTADO: Record<string, string> = {
  BORRADOR: PALETA.borrador,
  EN_REVISION: PALETA.enRevision,
  OBSERVADO: PALETA.observado,
  APROBADO: PALETA.aprobado,
  FIRMADO: PALETA.firmado,
  ENVIADO: PALETA.enviado,
  OBSERVADO_ENVIADO: PALETA.observadoPosterior,
  ARCHIVADO: PALETA.archivado,
}

// sx para un Chip del estado: la pastilla tenue (un velo del tono al 10 % y el texto del tono),
// la misma gramática de EstadoDocumento (2026-10-19: nada de relleno con texto blanco).
export function sxEstado(estado: string) {
  const tono = COLOR_ESTADO[estado] ?? PALETA.borrador
  return {
    bgcolor: `${tono}1A`,
    color: tono,
    fontWeight: 600,
  }
}

// Qué significa cada estado, cuándo se usa y quién lo pone (Edison
// 2026-09-05: «definir claramente qué función cumple cada estado»). Es el
// texto de la ayuda del panel de seguimiento y de la guía.
export const DESCRIPCION_ESTADO: Record<string, string> = {
  BORRADOR:
    'Se está redactando. Lo pone el sistema al crear el documento; vuelve aquí si el revisor lo devuelve.',
  EN_REVISION:
    'El diputado o un asesor lo está revisando. Se pone al «Enviar a revisión» o solo, cuando el revisor abre el borrador.',
  OBSERVADO:
    'Hay observaciones pendientes de corregir (antes de numerar). Lo pone el sistema al registrar una observación; vuelve a «En revisión» al atenderlas todas.',
  APROBADO:
    'Tiene número oficial y espera la firma. Lo pone «Generar oficial».',
  FIRMADO:
    'Ya está firmado y listo para salir. Se marca al subir el documento firmado.',
  ENVIADO:
    'Salió de la entidad. Lo pone el sistema al tener firmado + cargo de recepción (o registro en el STD si es interno), o se marca a mano.',
  OBSERVADO_ENVIADO:
    'Después de enviado surgió una observación (error detectado, respuesta que pide corrección). Vuelve a «Enviado» al atenderla.',
  ARCHIVADO:
    'Trámite cerrado. Un documento con número no se borra: se archiva.',
}

/** Cada estado en pocas palabras, para la ayuda del seguimiento (2026-10-12: «mensajes breves
 *  y directos»); el detalle completo sigue en el tooltip del chip (DESCRIPCION_ESTADO). */
export const RESUMEN_ESTADO: Record<string, string> = {
  BORRADOR: 'Se redacta.',
  EN_REVISION: 'Lo revisa el diputado o un asesor.',
  OBSERVADO: 'Tiene observaciones por corregir.',
  APROBADO: 'Tiene número; espera la firma.',
  FIRMADO: 'Firmado, listo para salir.',
  ENVIADO: 'Salió de la entidad.',
  OBSERVADO_ENVIADO: 'Enviado, pero con una observación nueva.',
  ARCHIVADO: 'Trámite cerrado.',
}

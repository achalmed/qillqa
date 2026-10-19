/**
 * La RUTA NUMERADA del proceso documental (pedido de Edison 2026-09-05).
 *
 * «Que cada botón lleve su número, como un flujo, y que lo ya hecho se vea más
 * tenue»: quien entra al sistema debe saber por dónde empezar y qué sigue, sin
 * que nadie se lo explique.
 *
 * El catálogo de pasos NO vive aquí: lo calcula el backend
 * (`servicios/tramite.py::ETAPAS`) y viaja dentro de `tramite.etapas` de cada
 * documento, con su avance real. Así la bandeja, el editor y la vista heredada
 * numeran igual, y cambiar el proceso es cambiar un solo archivo.
 *
 * Este módulo solo pone el tipo y los ayudantes para emparejar cada BOTÓN con
 * su paso: cada botón declara qué `accion` ejecuta y aquí se busca la etapa
 * correspondiente.
 */

export interface Etapa {
  clave: string
  titulo: string
  /** Con qué botón se empareja: 'guardar', 'revision', 'generar', 'firmado',
   *  'enviar', 'recepcion', 'std'. */
  accion: string
  ayuda: string
  orden: number
  /** Paso que no detiene el flujo (Vista previa): se puede saltar o repetir. */
  opcional?: boolean
  /** Ya ocurrió (el botón se ve atenuado). */
  hecho: boolean
  /** Es el paso que toca ahora (el botón se resalta). */
  actual: boolean
  /** 'observado' = el documento volvió atrás con una observación en este paso. */
  estado?: string
}

/** La etapa que ejecuta un botón, o null si ese botón no es parte del flujo
 *  (Historial, Columnas, Directorio…: no llevan número). */
export function etapaDe(etapas: Etapa[] | undefined, accion: string): Etapa | null {
  return etapas?.find((e) => e.accion === accion) ?? null
}

/** El paso que toca ahora, para el aviso «lo que sigue es…». */
export function etapaActual(etapas: Etapa[] | undefined): Etapa | null {
  return etapas?.find((e) => e.actual) ?? null
}

/**
 * Atenuado de lo ya hecho. Edison lo pidió «con el brillo un poco más bajo»:
 * ni invisible ni desactivado —el paso sigue disponible, se puede volver a
 * guardar o a previsualizar—, solo deja de reclamar la atención.
 */
export const OPACIDAD_HECHO = 0.55

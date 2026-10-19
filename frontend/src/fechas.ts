/**
 * Fechas como las escribe el PDF (latex/generador.py::fecha_en_espanol):
 * «01 de octubre del 2026». La usan el proyecto de ley (lugar y fecha) y los
 * documentos (fecha del documento), para que la pantalla diga la misma fecha
 * que va a salir impresa.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Hoy en AAAA-MM-DD con la hora de aquí (toISOString es la de Greenwich: de noche ya sería mañana). */
export const hoyIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** «01 de octubre del 2026». Sin fecha válida: la de hoy. */
export const fechaLarga = (iso?: string | null): string => {
  const v = /^\d{4}-\d{2}-\d{2}/.test(iso ?? '') ? (iso as string) : hoyIso()
  return `${v.slice(8, 10)} de ${MESES[Number(v.slice(5, 7)) - 1]} del ${v.slice(0, 4)}`
}

/** ¿Es una fecha ISO anterior a hoy? (una fecha que se quedó vieja) */
export const esAnterior = (iso?: string | null): boolean => /^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') && (iso as string) < hoyIso()

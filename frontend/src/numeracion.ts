/**
 * Numeración ÚNICA del sistema (Edison 2026-09-05: «definir una única lógica
 * de numeración y aplicarla de manera consistente»).
 *
 * Hay una sola cuenta: los PASOS del trámite (1 Redactar y guardar · 2 Vista
 * previa · 3 Enviar a revisión · 4 Generar oficial · 5 Firmar · 6 Enviar ·
 * 7 Cargo de recepción · 8 Registrar en el STD), que define el backend en
 * `servicios/tramite.py::ETAPAS`. Todo lo demás cuelga de un paso:
 *
 *   · Los CAMPOS y secciones del formulario son sub-numerales del paso 1
 *     (Redactar): «1.1 Destinatario», «1.2 Asunto», … «1.6 Cuerpo»,
 *     «1.7 Anexos». Se numeran en el orden VISUAL (primero los campos anchos,
 *     luego los cortos en fila), no en el del esquema.
 *   · Las secciones de archivos llevan el número del paso al que sirven:
 *     «Paso 5 · Documento firmado», «Paso 7 · Cargos de recepción».
 *
 * Así un «falta el 1.3» y un «vamos por el paso 5» hablan de la misma escala.
 * Los pasos van en círculo (sobre los botones y en la ruta); los
 * sub-numerales, como texto delante de la etiqueta.
 */

/** Paso del trámite al que pertenece todo el formulario. */
export const PASO_REDACTAR = 1

export interface CampoNumerable {
  clave: string
  tipo?: string
  ancho?: string
  /** Campo que se pinta DENTRO de una sección (p. ej. la línea «Adj.» en
   *  Anexos): no lleva número propio, lo lleva la sección. */
  seccion?: string
}

export interface Numeracion {
  /** clave del campo -> su número en el formulario. */
  orden: Record<string, number>
  /** Cuántos campos se numeraron (las secciones siguen desde aquí). */
  total: number
}

export function numerarCampos(esquema: CampoNumerable[] | undefined): Numeracion {
  const visibles = (esquema ?? []).filter((c) => c.tipo !== 'oculto' && !c.seccion)
  const largos = visibles.filter((c) => c.ancho !== 'corto')
  const cortos = visibles.filter((c) => c.ancho === 'corto')
  const orden: Record<string, number> = {}
  ;[...largos, ...cortos].forEach((c, i) => {
    orden[c.clave] = i + 1
  })
  return { orden, total: largos.length + cortos.length }
}

/** «1.3» — el sub-numeral de un campo o sección del paso 1 (texto). Para
 *  pintarlo se usa `<Rotulo n={subNumero(n)}>` de componentes/Paso.tsx: es la
 *  única forma visual permitida. */
export function subNumero(n: number | undefined): string | undefined {
  return n ? `${PASO_REDACTAR}.${n}` : undefined
}

/** «1.3 Asunto» en texto plano (aria-label, títulos de ventana, mensajes). */
export function conNumero(n: number | undefined, etiqueta: string): string {
  return n ? `${PASO_REDACTAR}.${n} ${etiqueta}` : etiqueta
}

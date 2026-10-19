/**
 * Rótulo corto de un campo para el celular (revisión 9.7, 2026-10-12): MUI corta
 * con «…» una etiqueta que no cabe en una línea, así que en xs la etiqueta queda
 * sin lo que va entre paréntesis y eso pasa a la nota bajo el campo.
 *
 *   rotuloCorto('Iniciales de responsabilidad (p. ej. ABC/xyz)', true)
 *   → { corto: 'Iniciales de responsabilidad', nota: 'Opcional · p. ej. ABC/xyz' }
 *
 * Las claves y la etiqueta de escritorio no cambian.
 */
export function rotuloCorto(etiqueta: string, opcional = false): { corto: string; nota: string } {
  const notas: string[] = opcional ? ['opcional'] : []
  const corto = etiqueta
    .replace(/\s*\(([^()]*)\)/g, (_, dentro: string) => {
      const t = dentro.trim()
      if (t && !(opcional && /^opcional$/i.test(t))) notas.push(t)
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  const nota = notas.join(' · ')
  return { corto: corto || etiqueta.trim(), nota: nota ? nota[0].toUpperCase() + nota.slice(1) : '' }
}

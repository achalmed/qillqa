/**
 * Aviso breve en el momento (2026-10-18): «Se guardará cuando vuelva la conexión». Lo pinta
 * `componentes/AvisoBreve.tsx` (en el marco) unos segundos, abajo, sin alarmar. Para lo que una
 * pantalla no puede decir en su propio lugar (un diálogo que se cierra, una lista sin aviso).
 */
export const EVENTO_AVISO_BREVE = 'sgdp:aviso-breve'

export const SE_GUARDARA = 'Se guardará cuando vuelva la conexión.'

export function avisoBreve(texto: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENTO_AVISO_BREVE, { detail: texto }))
}

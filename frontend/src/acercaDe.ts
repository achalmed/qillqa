/**
 * «ACERCA DE QILLQA» (2026-10-19). Edison: «su ventanita de versión, como la que tienen los programas:
 * su versión e información, el link de GitHub del demo y de su página web, las versiones de los
 * programas usados, el autor»; y desde ese día el sistema se llama como el demo, Qillqa.
 *
 * Los datos del proyecto viven aquí y no en el servidor: la ventana se abre aun sin conexión. Lo de
 * la construcción (versión, commit, bibliotecas) lo fija vite.config.ts; lo del servidor llega de
 * `GET /api/sistema/acerca` (backend/app/servicios/acerca.py). La ventana: componentes/AcercaDe.tsx.
 */

export const QILLQA = {
  nombre: 'Qillqa',
  lema: 'Gestión documental',
  significado: '«Escritura» en quechua',
  autor: 'Edison Achalma',
  licencia: 'AGPL-3.0',
  repositorio: 'https://github.com/achalmed/qillqa',
  sitio: 'https://achalmed.github.io/qillqa/',
  /** El día que empezó a funcionar: la versión 0.1.0 y el primer commit (CHANGELOG.md). */
  desde: '2026-08-06',
  construccion: __QILLQA__,
} as const

/** Lo que responde el servidor (`servicios/acerca.py::ficha`). */
export interface FichaServidor {
  version: string
  commit: string | null
  fecha_commit: string | null
  arranque: string
  sistema: string
  componentes: { nombre: string; version: string | null }[]
}

const EVENTO = 'qillqa:acerca'

/** Abre la ventana desde cualquier menú (la monta una sola vez el Marco). */
export const abrirAcercaDe = () => window.dispatchEvent(new Event(EVENTO))

/** Se suscribe a la apertura; devuelve la baja. */
export function alAbrirAcercaDe(fn: () => void): () => void {
  window.addEventListener(EVENTO, fn)
  return () => window.removeEventListener(EVENTO, fn)
}

/** «19 oct 2026, 19:36», en la hora del equipo; vacío si no hay fecha. */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** «En funcionamiento desde el 6 de agosto de 2026 · 74 días», contado hasta `hoy`. */
export function enFuncionamiento(hoy = new Date()): string {
  const [a, m, d] = QILLQA.desde.split('-').map(Number)
  const inicio = new Date(a, m - 1, d)
  const dias = Math.max(0, Math.floor((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - inicio.getTime()) / 86_400_000))
  const fecha = inicio.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
  return `En funcionamiento desde el ${fecha} · ${dias} ${dias === 1 ? 'día' : 'días'}`
}

/** La versión con su commit: «0.2.0 (a61e3f5)». */
export const versionConCommit = (version: string, commit: string | null) => (commit ? `${version} (${commit})` : version)

/** El texto que se copia para un reporte de error: todo lo de la ventana, en líneas simples. */
export function textoParaCopiar(servidor: FichaServidor | null): string {
  const c = QILLQA.construccion
  const lineas = [
    `${QILLQA.nombre} ${versionConCommit(c.version, c.commit)} — ${QILLQA.lema}`,
    enFuncionamiento(),
    `Web construida: ${fechaHora(c.construida)}`,
    ...c.bibliotecas.map(([n, v]) => `  ${n}: ${v ?? 'no disponible'}`),
  ]
  if (servidor) {
    lineas.push(
      `Servidor: ${versionConCommit(servidor.version, servidor.commit)}, en marcha desde ${fechaHora(servidor.arranque)} (${servidor.sistema})`,
      ...servidor.componentes.map((x) => `  ${x.nombre}: ${x.version ?? 'no instalado'}`),
    )
  } else {
    lineas.push('Servidor: sin respuesta')
  }
  lineas.push(`Navegador: ${navigator.userAgent}`, `Código: ${QILLQA.repositorio}`)
  return lineas.join('\n')
}

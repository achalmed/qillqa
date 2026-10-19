/**
 * LA HOJA del Formato Word (2026-10-19): el marco de página que comparten todos los módulos —la franja
 * de la sección (rótulo, estado, acciones), la regla con los márgenes del documento y la hoja simulada
 * al ancho del PDF— sin saber qué va dentro. Gestión documental pone sus campos en línea y su cuerpo;
 * Proyectos de ley, el título de la parte y su texto. Un solo marco, un solo aspecto.
 */
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { PALETA } from '../../paleta'
import Regla from './Regla'
import { paginaPx } from './modelo'

/** Estilos del editor dentro de la hoja (el mismo que el formulario, en serifa y justificado). */
export const estilosHoja = (letra: number) => ({
  fontSize: letra, lineHeight: 1.5, textAlign: 'justify',
  '& .ProseMirror': { outline: 'none', minHeight: 120, counterReset: 'nota' },
  '& .ProseMirror p': { m: 0, mb: 1.25 },
  '& .ProseMirror h2, & .ProseMirror h3': { fontSize: letra + 1, fontWeight: 700, mt: 1.5, mb: 0.75 },
  '& .ProseMirror sup.nota-al-pie': { color: 'primary.main', fontWeight: 700, cursor: 'pointer', px: '2px', counterIncrement: 'nota', fontSize: 0, '&::after': { content: 'counter(nota)', fontSize: '0.75em' } },
  '& .ProseMirror[contenteditable="true"] sup.nota-al-pie': { userSelect: 'none' },
  '& .ProseMirror table': { borderCollapse: 'collapse', width: '100%', my: 1 },
  '& .ProseMirror td, & .ProseMirror th': { border: '1px solid', borderColor: 'divider', p: '4px 8px', verticalAlign: 'top' },
  '& .ProseMirror th': { bgcolor: PALETA.superficieMedia, fontWeight: 600 },
  '& .ProseMirror span.referencia': { borderBottom: '1px dotted', borderColor: 'primary.main', bgcolor: 'action.hover', borderRadius: '2px', px: '1px' },
  '& .ProseMirror p.is-editor-empty:first-of-type::before': { content: '"Escriba aquí"', color: PALETA.apagado, float: 'left', pointerEvents: 'none', height: 0 },
  // Cursores de la edición simultánea (CollaborationCursor), como en el formulario.
  '& .collaboration-cursor__caret': { position: 'relative', borderLeft: '1px solid', borderRight: '1px solid', ml: '-1px', mr: '-1px', pointerEvents: 'none', wordBreak: 'normal' },
  '& .collaboration-cursor__label': { position: 'absolute', top: '-1.4em', left: '-1px', fontSize: 10, fontWeight: 600, color: '#fff', px: 0.5, borderRadius: '3px 3px 3px 0', whiteSpace: 'nowrap', userSelect: 'none', fontFamily: 'system-ui, sans-serif' },
})

/** Evento (window) con el id del comentario cuyo tramo se tocó en la hoja. */
export const EVENTO_COMENTARIO = 'sgdp:comentario-anclado'

export default function PaginaWord({ id, anchoHoja, campos, activo, franja, aviso, cargando, alActivar, children }: {
  id: string
  anchoHoja: number
  /** Los campos del documento (de ahí salen los márgenes, `fmt_margenes`); vacío = los del marco. */
  campos: Record<string, string> | undefined
  activo: boolean
  /** La franja sobre la hoja: rótulo, estado, acciones. */
  franja: ReactNode
  /** Una línea tenue dentro de la hoja (solo lectura, firma en curso…). */
  aviso?: string
  cargando?: boolean
  alActivar: () => void
  children: ReactNode
}) {
  const pagina = paginaPx(campos, anchoHoja / 794)
  return (
    <Box id={id} onClick={(e) => { alActivar(); const m = (e.target as HTMLElement).closest?.('[data-comentario]'); if (m) window.dispatchEvent(new CustomEvent(EVENTO_COMENTARIO, { detail: { id: Number(m.getAttribute('data-comentario')) } })) }} sx={{ scrollMarginTop: 96, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: anchoHoja, maxWidth: '100%', mx: 'auto', mb: 0.5, px: 0.5 }}>{franja}</Box>
      <Regla campos={campos} escala={anchoHoja / 794} />
      <Box sx={{ width: anchoHoja, maxWidth: '100%', mx: 'auto', bgcolor: PALETA.superficie, boxShadow: PALETA.sombra, borderRadius: '0 0 3px 3px', px: `${pagina.margen}px`, py: `${Math.round(pagina.margen * 0.9)}px`, minHeight: Math.round(anchoHoja * 1.2), fontFamily: 'Georgia, "Times New Roman", serif', color: PALETA.texto, outline: activo ? `2px solid ${PALETA.primario}59` : 'none', position: 'relative' }}>
        {cargando && <Typography variant="caption" sx={{ color: PALETA.textoTenue }}>Cargando…</Typography>}
        {aviso && <Typography variant="caption" sx={{ display: 'block', mb: 1.5, color: PALETA.textoTenue, fontFamily: 'inherit' }}>{aviso}</Typography>}
        {children}
      </Box>
    </Box>
  )
}

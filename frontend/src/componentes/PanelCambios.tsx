/**
 * PANEL «CAMBIOS» del control de cambios (2026-10-19): las sugerencias del documento abierto (inserciones,
 * supresiones, formato y párrafos divididos o unidos, con autor y fecha), filtrables por autor; aceptar
 * o rechazar cada una, o todas las del autor elegido; un toque lleva al tramo. Lo abre el botón
 * «Cambios (n)» de BarraFormato en cualquier editor del sistema (formulario, Formato Word, Proyectos).
 * La lista la arma `extensiones/cambios.ts` (pura) desde el JSON del editor.
 */
import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { autoresDe, cambiosDe, etiquetaDe, filtrarPorAutor, type Cambio } from '../extensiones/cambios'
import { COLORES_TEXTO } from '../extensiones/ColorTexto'
import { PALETA } from '../paleta'

const fecha = (iso: string) => (iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '')
const NOMBRES_COLOR = Object.fromEntries(COLORES_TEXTO.map((c) => [c.hex, c.nombre]))
const COLOR_TIPO: Record<Cambio['tipo'], string> = { insercion: PALETA.exito, supresion: PALETA.error, formato: PALETA.info, parrafo: PALETA.dorado }

export default function PanelCambios({ editor }: { editor: Editor }) {
  const todos = useEditorState({ editor, selector: ({ editor: e }) => (e ? cambiosDe(e.getJSON() as Parameters<typeof cambiosDe>[0], NOMBRES_COLOR) : []) }) ?? []
  const [autor, setAutor] = useState<string | null>(null)
  const autores = autoresDe(todos)
  const filtro = autor !== null && autores.includes(autor) ? autor : null
  const cambios = filtrarPorAutor(todos, filtro)
  const ir = (c: Cambio) => {
    try {
      const de = c.tipo === 'parrafo' ? c.de + 1 : c.de
      const a = c.tipo === 'parrafo' ? c.a - 1 : c.a
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, de, a)).scrollIntoView())
      editor.view.focus()
    } catch { /* el tramo ya cambió */ }
  }
  const filtroDe = (c: Cambio) => ({ tipo: c.tipo, autor: c.autor })
  if (todos.length === 0) return <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No hay sugerencias pendientes.</Typography>
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {autores.length > 1 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip size="small" label={`Todos (${todos.length})`} variant={filtro === null ? 'filled' : 'outlined'} onClick={() => setAutor(null)} />
          {autores.map((a) => (
            <Chip key={a} size="small" label={`${a} (${todos.filter((c) => c.autor === a).length})`} variant={filtro === a ? 'filled' : 'outlined'} onClick={() => setAutor(a)} />
          ))}
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {cambios.length === 1 ? 'Una sugerencia' : `${cambios.length} sugerencias`}{filtro ? ` de ${filtro}` : ''}
        </Typography>
        <Button size="small" variant="outlined" onClick={() => editor.chain().focus().aceptarTodos(filtro ?? undefined).run()}>{filtro ? 'Aceptar las suyas' : 'Aceptar todas'}</Button>
        <Button size="small" color="inherit" onClick={() => editor.chain().focus().rechazarTodos(filtro ?? undefined).run()} sx={{ color: 'text.secondary' }}>{filtro ? 'Rechazar las suyas' : 'Rechazar todas'}</Button>
      </Box>
      {cambios.map((c, i) => (
        <Box key={`${c.tipo}-${c.de}-${i}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: PALETA.superficieTenue }}>
          <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => ir(c)}>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 0.25, flexWrap: 'wrap' }}>
              <Chip size="small" label={etiquetaDe(c)} sx={{ height: 18, fontSize: 10.5, fontWeight: 600, color: COLOR_TIPO[c.tipo], bgcolor: `${COLOR_TIPO[c.tipo]}1A` }} />
              <Typography variant="caption" color="text.secondary" noWrap>{c.autor || 'Sin autor'}{c.en ? ` · ${fecha(c.en)}` : ''}</Typography>
            </Box>
            <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textDecoration: c.tipo === 'supresion' ? 'line-through' : 'none', color: c.tipo === 'parrafo' ? 'text.secondary' : 'text.primary' }}>
              {c.tipo === 'parrafo' ? `${c.detalle === 'insercion' ? 'Empieza aquí un párrafo nuevo' : 'Se une con el párrafo anterior'}: «${c.texto || '…'}»` : c.texto}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0 }}>
            <Button size="small" onClick={() => editor.chain().focus().aceptarCambio(c.de, c.a, filtroDe(c)).run()}>Aceptar</Button>
            <Button size="small" color="inherit" onClick={() => editor.chain().focus().rechazarCambio(c.de, c.a, filtroDe(c)).run()} sx={{ color: 'text.secondary' }}>Rechazar</Button>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

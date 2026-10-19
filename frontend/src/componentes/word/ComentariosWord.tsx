/**
 * COMENTARIOS de un documento en el Formato Word (2026-10-19): los mismos del formulario
 * (`useComentarios`, `TarjetaComentario` de ObservacionesSeccion: observaciones, indicaciones y notas,
 * con levantar y conformidad), listados en el panel de estructura para el documento activo y con la
 * caja para añadir uno. Se anclan a la sección «cuerpo» (el anclaje a un tramo del texto es la fase
 * siguiente del plan).
 */
import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { TarjetaComentario, useComentarios } from '../ObservacionesSeccion'
import { anclasDe, citaDe } from '../../extensiones/anclas'
import { ID_COMENTARIO_NUEVO } from './menus'
import { EVENTO_COMENTARIO } from './PaginaWord'
import { PALETA } from '../../paleta'

export default function ComentariosWord({ documentoId, editor, alAviso }: { documentoId: number; editor: Editor | null; alAviso: (tipo: 'success' | 'error' | 'info', texto: string) => void }) {
  const com = useComentarios(documentoId, true, alAviso)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('nota')
  const [ocupado, setOcupado] = useState(false)
  const [destacado, setDestacado] = useState<number | null>(null)
  // Las anclas del texto y si hay un tramo seleccionado para comentar.
  const estado = useEditorState({ editor, selector: ({ editor: e }) => (e ? { anclas: anclasDe(e.getJSON() as Parameters<typeof anclasDe>[0]), haySeleccion: !e.state.selection.empty } : { anclas: [], haySeleccion: false }) })
  const anclas = estado?.anclas ?? []
  useEffect(() => {
    const f = (e: Event) => { const id = Number((e as CustomEvent).detail?.id); setDestacado(id || null); document.getElementById(`comentario-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    window.addEventListener(EVENTO_COMENTARIO, f)
    return () => window.removeEventListener(EVENTO_COMENTARIO, f)
  }, [])
  const irA = (id: number) => {
    const a = anclas.find((x) => x.id === id)
    if (!a || !editor) return
    try { editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, a.de, a.a)).scrollIntoView()); editor.view.focus() } catch { /* el tramo cambió */ }
  }
  const enviar = async (anclar = false) => {
    const t = texto.trim()
    if (t.length < 5) return
    setOcupado(true)
    try {
      const id = await com.agregar(t, tipo, 'cuerpo')
      // Anclado al tramo seleccionado (2026-10-19): la marca lleva el id; el comentario vive donde siempre.
      if (anclar && id && editor && !editor.state.selection.empty) editor.chain().focus().anclarComentario(id).run()
      setTexto('')
    } finally {
      setOcupado(false)
    }
  }
  const levantar = async (c: Parameters<typeof com.levantar>[0]) => {
    await com.levantar(c)
    editor?.commands.desanclarComentario(c.id)
  }
  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>Comentarios{com.pendientes.length ? ` · ${com.pendientes.length} por resolver` : ''}</Typography>
      {com.lista.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Sin comentarios en este documento.</Typography>}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
        {com.lista.map((c) => {
          const cita = citaDe(anclas, c.id)
          return (
            <Box key={c.id} id={`comentario-${c.id}`} sx={{ borderRadius: 1.5, outline: destacado === c.id ? `2px solid ${PALETA.info}` : 'none', outlineOffset: 2 }}>
              {cita && <Typography variant="caption" onClick={() => irA(c.id)} sx={{ display: 'block', px: 1, color: PALETA.info, cursor: 'pointer', fontStyle: 'italic' }} title="Ir al tramo">«{cita}»</Typography>}
              <TarjetaComentario c={c} alLevantar={(x) => void levantar(x)} conSeccion />
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
        <TextField select size="small" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 118 }} inputProps={{ 'aria-label': 'Tipo de comentario' }}>
          <MenuItem value="nota">Nota</MenuItem>
          <MenuItem value="observacion">Observación</MenuItem>
          <MenuItem value="indicacion">Indicación</MenuItem>
        </TextField>
        <TextField size="small" fullWidth multiline minRows={2} placeholder="Escriba el comentario (5 letras como mínimo)" value={texto} onChange={(e) => setTexto(e.target.value)} inputProps={{ id: ID_COMENTARIO_NUEVO }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" onClick={() => void enviar(false)} disabled={texto.trim().length < 5 || ocupado}>Comentar</Button>
        {estado?.haySeleccion && <Button size="small" variant="contained" onClick={() => void enviar(true)} disabled={texto.trim().length < 5 || ocupado}>Comentar el tramo seleccionado</Button>}
      </Box>
    </Box>
  )
}

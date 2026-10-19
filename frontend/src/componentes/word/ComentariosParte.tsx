/**
 * COMENTARIOS de una parte del proyecto en el Formato Word (2026-10-19): la «Conversación» del
 * proyecto (`GET /api/proyectos/{pid}/actividad`, filas `comentario` con su `seccion`), filtrada por la
 * parte activa; escribir uno (`POST /comentarios {texto, seccion}`, con @menciones) y marcarlo resuelto
 * (`PATCH /comentarios/{id}`). Los mismos datos que la pestaña Conversación: nada se duplica.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../../api'
import { PALETA } from '../../paleta'
import { ID_COMENTARIO_NUEVO } from './menus'
import { anclasDe, citaDe } from '../../extensiones/anclas'
import { EVENTO_COMENTARIO } from './PaginaWord'

interface Fila { id: number; tipo: string; seccion?: string | null; texto: string; usuario?: string; autor?: string; resuelto?: boolean; creado_en?: string }

export default function ComentariosParte({ pid, clave, titulo, editor, alAviso }: { pid: number; clave: string; titulo: string; editor: Editor | null; alAviso: (tipo: 'success' | 'error', texto: string) => void }) {
  const [filas, setFilas] = useState<Fila[]>([])
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [destacado, setDestacado] = useState<number | null>(null)
  const estado = useEditorState({ editor, selector: ({ editor: e }) => (e ? { anclas: anclasDe(e.getJSON() as Parameters<typeof anclasDe>[0]), haySeleccion: !e.state.selection.empty } : { anclas: [], haySeleccion: false }) })
  const anclas = estado?.anclas ?? []
  useEffect(() => {
    const f = (e: Event) => { const id = Number((e as CustomEvent).detail?.id); setDestacado(id || null); document.getElementById(`comentario-pl-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    window.addEventListener(EVENTO_COMENTARIO, f)
    return () => window.removeEventListener(EVENTO_COMENTARIO, f)
  }, [])
  const irA = (id: number) => {
    const a = anclas.find((x) => x.id === id)
    if (!a || !editor) return
    try { editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, a.de, a.a)).scrollIntoView()); editor.view.focus() } catch { /* el tramo cambió */ }
  }
  const cargar = useCallback(() => api<Fila[]>(`/api/proyectos/${pid}/actividad`).then((f) => setFilas(f.filter((x) => x.tipo === 'comentario' && (x.seccion ?? '') === clave))).catch(() => setFilas([])), [pid, clave])
  useEffect(() => { void cargar() }, [cargar])
  const enviar = async (anclar = false) => {
    const t = texto.trim()
    if (!t) return
    setOcupado(true)
    try {
      const r = await api<{ id?: number }>(`/api/proyectos/${pid}/comentarios`, { method: 'POST', body: JSON.stringify({ texto: t, seccion: clave }) })
      if (anclar && r?.id && editor && !editor.state.selection.empty) editor.chain().focus().anclarComentario(r.id).run()
      setTexto('')
      await cargar()
    } catch (e) {
      alAviso('error', e instanceof Error ? e.message : 'No se pudo comentar.')
    } finally {
      setOcupado(false)
    }
  }
  const alternar = async (f: Fila) => {
    try {
      await api(`/api/proyectos/${pid}/comentarios/${f.id}`, { method: 'PATCH', body: JSON.stringify({ resuelto: !f.resuelto }) })
      if (!f.resuelto) editor?.commands.desanclarComentario(f.id)
      await cargar()
    } catch (e) {
      alAviso('error', e instanceof Error ? e.message : 'No se pudo cambiar.')
    }
  }
  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>Comentarios · {titulo}</Typography>
      {filas.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Sin comentarios en esta parte.</Typography>}
      {filas.map((f) => (
        <Box key={f.id} id={`comentario-pl-${f.id}`} sx={{ p: 1, mb: 0.75, borderRadius: 1.5, bgcolor: f.resuelto ? PALETA.superficieTenue : PALETA.guindaSuave, opacity: f.resuelto ? 0.7 : 1, outline: destacado === f.id ? `2px solid ${PALETA.info}` : 'none', outlineOffset: 1 }}>
          {citaDe(anclas, f.id) && <Typography variant="caption" onClick={() => irA(f.id)} sx={{ display: 'block', color: PALETA.info, cursor: 'pointer', fontStyle: 'italic' }} title="Ir al tramo">«{citaDe(anclas, f.id)}»</Typography>}
          <Typography variant="caption" color="text.secondary">{f.usuario || f.autor || ''}{f.creado_en ? ` · ${new Date(f.creado_en).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', textDecoration: f.resuelto ? 'line-through' : 'none' }}>{f.texto}</Typography>
          <Button size="small" color="inherit" onClick={() => void alternar(f)} sx={{ color: 'text.secondary', px: 0.5, minWidth: 0 }}>{f.resuelto ? 'Reabrir' : 'Resuelto'}</Button>
        </Box>
      ))}
      <TextField size="small" fullWidth multiline minRows={2} placeholder="Comentar esta parte (@ menciona)" value={texto} onChange={(e) => setTexto(e.target.value)} sx={{ mt: 0.5 }} inputProps={{ id: ID_COMENTARIO_NUEVO }} />
      <Box sx={{ display: 'flex', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" onClick={() => void enviar(false)} disabled={!texto.trim() || ocupado}>Comentar</Button>
        {estado?.haySeleccion && <Button size="small" variant="contained" onClick={() => void enviar(true)} disabled={!texto.trim() || ocupado}>Comentar el tramo seleccionado</Button>}
      </Box>
    </Box>
  )
}

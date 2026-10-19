/**
 * UNA PARTE de un proyecto de ley como página del Formato Word (2026-10-19). La misma hoja
 * (`PaginaWord`), el mismo editor (`extensionesParte`, el del módulo), el mismo guardado que la pestaña
 * Texto: `PUT /api/proyectos/{pid}/secciones/{clave}` con `version_base` (y `generacion` en edición
 * simultánea, que aquí es la regla cuando el proyecto la tiene: el texto compartido
 * `pl:<pid>:<parte>:<generación>`). 409 `parte_ocupada` o `parte_modificada`: se avisa y se recarga lo
 * vigente. Las versiones de la parte se listan y restauran con los endpoints de siempre.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EditorContent } from '@tiptap/react'
import { NodeSelection, type Transaction } from '@tiptap/pm/state'
import { ySyncPluginKey } from 'y-prosemirror'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import HistoryIcon from '@mui/icons-material/History'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { api, ErrorApi, esSinServidor } from '../../api'
import { avisoBreve, SE_GUARDARA } from '../../avisoBreve'
import { encolar } from '../../sinconexion'
import { extensionesParte } from '../../extensiones/esquema'
import { EVENTO_ABRIR_NOTA } from '../../extensiones/NotaAlPie'
import { PALETA } from '../../paleta'
import PaginaWord, { estilosHoja } from './PaginaWord'
import { useEditorWord } from './useEditorWord'
import { crearControl, type ControlReferencias } from '../../extensiones/AutocompletarReferencias'
import type { ManejadorSeccion } from './SeccionWord'
import type { NotaResumen, SeccionResumen } from './PanelEstructura'

export interface ParteWord {
  /** Identidad numérica estable de la parte (sobrevive a reordenar y quitar otras). */
  id: number
  clave: string
  titulo: string
  grupo: string
  obligatoria: boolean
  /** Su lugar lo fija la técnica legislativa (no se arrastra). */
  fija?: boolean
  palabras?: number
  estado: string
  contenido: object
  version: number
  generacion?: number
  editando?: string
}

const COLOR_PARTE: Record<string, string> = { borrador: PALETA.borrador, en_revision: PALETA.enRevision, observada: PALETA.observado, aprobada: PALETA.aprobado }
const ROTULO_PARTE: Record<string, string> = { borrador: 'Borrador', en_revision: 'En revisión', observada: 'Observada', aprobada: 'Aprobada' }

function notasDe(editor: ReturnType<typeof useEditorWord>['editor']): NotaResumen[] {
  const salida: NotaResumen[] = []
  editor?.state.doc.descendants((n, pos) => {
    if (n.type.name === 'footnote') salida.push({ pos, texto: String(n.attrs.texto ?? '') })
    return true
  })
  return salida
}

const SeccionParte = forwardRef<ManejadorSeccion, {
  pid: number
  indice: number
  /** El índice numérico con que el espacio identifica la parte (su posición). */
  id: number
  parte: ParteWord
  grupoNombre: string
  colaboracion: boolean
  anchoHoja: number
  activo: boolean
  alActivar: (id: number) => void
  alEditor: (id: number, editor: ReturnType<typeof useEditorWord>['editor'], control?: ControlReferencias) => void
  alCambio: (r: SeccionResumen, notas: NotaResumen[]) => void
  /** La parte cambió en el servidor (guardado, versión restaurada): el proyecto se relee. */
  alRecargar: () => Promise<unknown>
  alAviso: (tipo: 'success' | 'info' | 'warning' | 'error', texto: string) => void
}>(function SeccionParte({ pid, indice, id, parte, grupoNombre, colaboracion, anchoHoja, activo, alActivar, alEditor, alCambio, alRecargar, alAviso }, ref) {
  const navegar = useNavigate()
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [versiones, setVersiones] = useState<{ version: number; nota: string; usuario?: string; creado_en?: string }[] | null>(null)
  const sucioRef = useRef(false)
  const baseRef = useRef(parte.version)
  const temporizador = useRef<number | null>(null)
  const contenedor = useRef<HTMLDivElement | null>(null)
  const editable = parte.estado !== 'aprobada'

  const controlReferencias = useMemo(crearControl, [])
  const { editor, enVivo } = useEditorWord({
    extensiones: extensionesParte,
    nombreCompartido: colaboracion ? `pl:${pid}:${parte.clave}:${parte.generacion ?? 0}` : null,
    control: controlReferencias,
    alRecargar: () => void alRecargar(),
    alFallar: () => alAviso('warning', `«${parte.titulo}»: la edición simultánea no responde; abra la pestaña Texto para seguir por turnos.`),
  })
  const enVivoRef = useRef(enVivo)
  enVivoRef.current = enVivo
  useEffect(() => { alEditor(id, editor, controlReferencias); return () => alEditor(id, null) }, [editor, id, alEditor, controlReferencias])

  const guardarRef = useRef<(auto?: boolean) => Promise<boolean>>(async () => false)
  const marcarSucio = useCallback(() => {
    sucioRef.current = true
    setSucio(true)
    if (temporizador.current) window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => void guardarRef.current(true), 4000)
  }, [])

  // El contenido guardado, en el editor (en compartido lo trae Yjs); la versión base, al día.
  useEffect(() => { baseRef.current = parte.version }, [parte.version])
  useEffect(() => {
    if (!editor) return
    if (!enVivo) editor.chain().command(({ tr }) => { tr.setMeta('addToHistory', false); return true }).setContent(parte.contenido ?? { type: 'doc', content: [] }, false).run()
    editor.setEditable(editable, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, parte.version, enVivo, editable])
  useEffect(() => {
    if (!editor) return
    // Lo que llega del texto compartido (Yjs) no es un cambio de esta persona: no ensucia ni guarda.
    const alCambiar = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.getMeta(ySyncPluginKey)) return
      marcarSucio()
      alCambio({ id, tipoNombre: parte.titulo, rotulo: grupoNombre, campos: { asunto: parte.titulo }, estado: parte.estado, numero: null, sucio: true }, notasDe(editor))
    }
    const alEnfocar = () => alActivar(id)
    editor.on('update', alCambiar)
    editor.on('focus', alEnfocar)
    return () => { editor.off('update', alCambiar); editor.off('focus', alEnfocar) }
  }, [editor, id, parte.titulo, parte.estado, grupoNombre, alActivar, alCambio, marcarSucio])
  useEffect(() => {
    alCambio({ id, tipoNombre: parte.titulo, rotulo: grupoNombre, campos: { asunto: parte.titulo }, estado: parte.estado, numero: null, sucio }, notasDe(editor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parte.titulo, parte.estado, sucio, editor])

  const guardar = useCallback(async (auto = false): Promise<boolean> => {
    if (!editor || !editable || !sucioRef.current) return true
    if (temporizador.current) window.clearTimeout(temporizador.current)
    const datos = { contenido: editor.getJSON(), version_base: baseRef.current, generacion: enVivoRef.current ? parte.generacion : undefined, auto }
    setGuardando(true)
    try {
      const r = await api<{ version: number; estado: string }>(`/api/proyectos/${pid}/secciones/${parte.clave}`, { method: 'PUT', body: JSON.stringify(datos) })
      baseRef.current = r.version
      sucioRef.current = false
      setSucio(false)
      setError('')
      return true
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) {
        const codigo = (e.detalle as { codigo?: string } | undefined)?.codigo ?? ''
        sucioRef.current = false
        setSucio(false)
        await alRecargar()
        alAviso('warning', codigo === 'parte_ocupada' ? `«${parte.titulo}» la tiene otra persona: se muestra lo vigente.` : `«${parte.titulo}»: otra persona guardó antes; se cargó su versión.`)
        return false
      }
      if (esSinServidor(e)) {
        encolar(`/api/proyectos/${pid}/secciones/${parte.clave}`, JSON.stringify(datos), parte.titulo)
        sucioRef.current = false
        setSucio(false)
        if (!auto) avisoBreve(SE_GUARDARA)
        return true
      }
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      return false
    } finally {
      setGuardando(false)
    }
  }, [editor, editable, pid, parte.clave, parte.titulo, parte.generacion, alRecargar, alAviso])
  guardarRef.current = guardar
  useEffect(() => () => { if (sucioRef.current) void guardarRef.current(true) }, [])

  const versionesRef = useRef<() => void>(() => {})
  useImperativeHandle(ref, () => ({
    guardar: () => guardar(false),
    recargar: () => alRecargar(),
    editor,
    sucio,
    abrirHistorial: () => versionesRef.current(),
    desplazar: () => contenedor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    irANota: (pos: number) => {
      if (!editor) return
      try {
        const sel = NodeSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView())
        editor.view.focus()
        editor.view.dom.dispatchEvent(new CustomEvent(EVENTO_ABRIR_NOTA, { detail: { texto: sel.node.attrs.texto } }))
      } catch { /* la nota ya no está */ }
    },
  }), [guardar, alRecargar, editor, sucio])

  const abrirVersiones = async () => {
    try {
      setVersiones(await api<{ version: number; nota: string; usuario?: string; creado_en?: string }[]>(`/api/proyectos/${pid}/secciones/${parte.clave}/versiones`))
    } catch (e) {
      alAviso('error', e instanceof Error ? e.message : 'No se pudieron leer las versiones.')
    }
  }
  versionesRef.current = () => { void abrirVersiones() }
  const restaurar = async (v: number) => {
    try {
      await api(`/api/proyectos/${pid}/secciones/${parte.clave}/versiones/${v}/restaurar`, { method: 'POST' })
      setVersiones(null)
      await alRecargar()
      alAviso('success', `«${parte.titulo}»: restaurada la versión ${v}.`)
    } catch (e) {
      alAviso('error', e instanceof Error ? e.message : 'No se pudo restaurar.')
    }
  }
  const letra = anchoHoja < 560 ? 15 : 14.5
  const franja = (
    <>
      <Typography variant="subtitle2" sx={{ color: activo ? 'primary.main' : 'text.secondary', fontWeight: 700 }}>{grupoNombre} · {indice + 1}. {parte.titulo}</Typography>
      <Chip size="small" label={ROTULO_PARTE[parte.estado] ?? parte.estado} sx={{ height: 20, fontSize: 11, fontWeight: 600, color: COLOR_PARTE[parte.estado] ?? PALETA.textoTenue, bgcolor: `${COLOR_PARTE[parte.estado] ?? PALETA.textoTenue}1A` }} />
      {enVivo && <Chip size="small" label="En vivo" sx={{ height: 20, fontSize: 11, fontWeight: 600, color: PALETA.exito, bgcolor: `${PALETA.exito}1A` }} />}
      {sucio && <Typography variant="caption" sx={{ color: 'warning.main' }}>{guardando ? 'Guardando…' : 'Sin guardar'}</Typography>}
      {!sucio && editable && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Guardado</Typography>}
      {error && <Typography variant="caption" color="error">{error}</Typography>}
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Versiones de esta parte"><IconButton size="small" aria-label="Versiones" onClick={(e) => { e.stopPropagation(); void abrirVersiones() }}><HistoryIcon fontSize="small" /></IconButton></Tooltip>
      <Tooltip title="Abrir en la pestaña Texto: revisión, aprobación, vista PDF y comparativo">
        <Button size="small" color="inherit" startIcon={<OpenInNewIcon fontSize="small" />} onClick={(e) => { e.stopPropagation(); navegar(`/proyectos/${pid}?modalidad=formulario`) }} sx={{ color: 'text.secondary' }}>Texto</Button>
      </Tooltip>
    </>
  )
  return (
    <Box ref={contenedor}>
      <PaginaWord id={`seccion-${id}`} anchoHoja={anchoHoja} campos={undefined} activo={activo} franja={franja} aviso={!editable ? 'Parte aprobada: para cambiarla, reábrala desde la pestaña Texto.' : undefined} alActivar={() => alActivar(id)}>
        <Typography sx={{ fontSize: letra + 2, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', mb: 2, fontFamily: 'inherit' }}>{parte.titulo}</Typography>
        <Box sx={estilosHoja(letra)}><EditorContent editor={editor} /></Box>
      </PaginaWord>
      <Dialog open={versiones !== null} onClose={() => setVersiones(null)} fullWidth maxWidth="xs">
        <DialogTitle>Versiones · {parte.titulo}</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <List dense>
            {(versiones ?? []).length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Sin versiones guardadas todavía.</Typography>}
            {(versiones ?? []).slice().reverse().map((v) => (
              <ListItemButton key={v.version} onClick={() => void restaurar(v.version)} disabled={v.version === parte.version}>
                <ListItemText primary={`v${v.version}${v.version === parte.version ? ' · vigente' : ''}`} secondary={[v.nota, v.usuario, v.creado_en ? new Date(v.creado_en).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : ''].filter(Boolean).join(' · ') || 'Sin nota'} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  )
})

export default SeccionParte

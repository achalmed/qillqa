/**
 * BarraFormato — la barra de redacción COMÚN de los editores de Qillqa
 * (2026-10-01): documentos (oficio, carta, informe, memorando…) y partes de un
 * proyecto de ley, por turnos o en edición simultánea. Antes vivía dentro de
 * EditorDocumento y el proyecto de ley solo tenía «Texto citado»; ahora todos
 * comparten la misma lógica y cada tipo agrega lo suyo en `extras`.
 *
 * Sutil a propósito: a la vista, lo frecuente (negrita, cursiva, subrayado,
 * listas, sangría, enlace, nota al pie, tabla); lo demás (alineación, tipo de
 * sangría, título, salto de página) en el menú «⋯». Todo funciona igual dentro
 * de una celda de tabla: los comandos actúan sobre la selección.
 *
 * El menú contextual de TABLAS (clic derecho sobre una tabla) es `MenuTabla`
 * con `useMenuTabla`: alinear celda/fila/columna/tabla y filas/columnas.
 *
 * Herramientas tipo Word (2026-10-05, pedido del asesor de proyectos de ley):
 * deshacer/rehacer, tachado, superíndice y subíndice, buscar y reemplazar
 * (Ctrl+F / Ctrl+H), contador de palabras, nota al pie en su diálogo, y en las
 * tablas fila arriba, columna a la izquierda, combinar y dividir celdas, y el
 * título y la fuente del cuadro («CUADRO — N° n» en el PDF).
 */
import type { SxProps, Theme } from '@mui/material/styles'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import ToggleButton from '@mui/material/ToggleButton'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import SubscriptIcon from '@mui/icons-material/Subscript'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import CloseIcon from '@mui/icons-material/Close'
import NotesIcon from '@mui/icons-material/Notes'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha'
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease'
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease'
import InsertLinkIcon from '@mui/icons-material/InsertLink'
import SuperscriptIcon from '@mui/icons-material/Superscript'
import TableChartIcon from '@mui/icons-material/TableChart'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight'
import TitleIcon from '@mui/icons-material/Title'
import InsertPageBreakIcon from '@mui/icons-material/InsertPageBreak'
import CheckIcon from '@mui/icons-material/Check'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import type { SangriaTipo } from '../extensiones/SangriaParrafo'
import { alinearTabla, type Alineacion, type AmbitoAlineacion } from '../extensiones/TablaAlineada'
import { claveBusqueda } from '../extensiones/BuscarReemplazar'
import { EVENTO_ABRIR_NOTA } from '../extensiones/NotaAlPie'
import { contarCambios } from '../extensiones/cambios'
import PanelCambios from './PanelCambios'
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined'
import FormatClearIcon from '@mui/icons-material/FormatClear'
import FormatPaintOutlinedIcon from '@mui/icons-material/FormatPaintOutlined'
import type { Mark as MarcaPM } from '@tiptap/pm/model'
import { describirInforme, huboCambios, ordenarTextoWord, pareceWordSinOrdenar, type Nodo } from '../extensiones/ordenarWord'
import { pedirTexto } from './Dialogos'
import { PALETA } from '../paleta'

/** Estilos del contenido compartidos por los editores: listas, tablas, notas,
 *  saltos de página y texto citado se ven igual en todos. */
/**
 * La barra FIJA dentro del recuadro del editor (p: 2): pegada a su borde
 * superior y, al bajar por el texto, quieta arriba (Edison 2026-10-01: «cuando
 * haga scroll debe quedar así», como sin desplazar). Al desplazar, el borde
 * superior del recuadro se va con el texto; por eso la barra dibuja el suyo
 * POR DENTRO (sombra interior de 1 px del mismo color) y en reposo se monta
 * 1 px sobre el del recuadro, así que se ve una sola línea; quieta arriba, esa
 * línea sigue a la vista. Debajo, una sombra suave para que el texto pase limpio.
 * `--alto-fijo`: lo que ya está fijo encima (el conmutador del celular).
 */
export const barraFija = (activo: boolean, conLinea = true): SxProps<Theme> => (t) => ({
  position: 'sticky',
  top: 'var(--alto-fijo, 0px)',
  zIndex: 4,
  bgcolor: activo ? 'background.paper' : PALETA.superficieTenue,
  mx: -2,
  mt: '-17px', // el relleno del recuadro (16 px) y su borde (1 px)
  px: 2,
  mb: 1.5,
  pt: '11px',
  boxShadow: `inset 0 1px 0 0 ${activo ? t.palette.primary.main : t.palette.divider}, ${PALETA.sombra}`,
  ...(conLinea ? { pb: 1, borderBottom: '1px solid', borderColor: 'divider' } : {}),
})

/** La barra en un recuadro de alto fijo (escritorio): quieta arriba, y el
 *  texto se desplaza debajo, dentro de su propia caja. */
export const barraPanel: SxProps<Theme> = { flexShrink: 0, px: 2, pt: 1.25, pb: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }

/** Estilos de las herramientas tipo Word (2026-10-05): lo que la búsqueda
 *  resalta y el título y la fuente del cuadro. Los usan todos los editores. */
export const estiloHerramientas = {
  // Buscar y reemplazar: todas las coincidencias y la actual.
  '& .ProseMirror .busqueda-coincidencia': { bgcolor: PALETA.resaltado, borderRadius: '2px' },
  '& .ProseMirror .busqueda-actual': { bgcolor: `${PALETA.aviso}66`, borderRadius: '2px', outline: `1px solid ${PALETA.aviso}` },
  // Título y fuente del cuadro, como saldrán en el PDF (encima y debajo).
  '& .ProseMirror table[data-titulo]::before': {
    content: '"CUADRO — " attr(data-titulo)', display: 'table-caption', captionSide: 'top', textAlign: 'center',
    fontStyle: 'italic', fontSize: '0.9em', color: 'primary.main', pb: 0.5,
  },
  '& .ProseMirror table[data-fuente]::after': {
    content: '"Fuente: " attr(data-fuente)', display: 'table-caption', captionSide: 'bottom', fontSize: '0.8em', color: 'text.secondary', pt: 0.5,
  },
} as const

export const estiloContenido = {
  '& .ProseMirror ul, & .ProseMirror ol': { pl: 3, my: 0.5 },
  '& .ProseMirror li > p': { my: 0.25 },
  // a) b) c) e i) ii) como en el PDF (el navegador pondría «a.»).
  '& .ProseMirror ol[type="a"], & .ProseMirror ol[type="i"]': {
    listStyleType: 'none', counterReset: 'inciso',
    '& > li': { counterIncrement: 'inciso', position: 'relative' },
  },
  '& .ProseMirror ol[type="a"] > li::before': { content: 'counter(inciso, lower-alpha) ")"', position: 'absolute', left: '-1.6em' },
  '& .ProseMirror ol[type="i"] > li::before': { content: 'counter(inciso, lower-roman) ")"', position: 'absolute', left: '-1.9em' },
  // Las notas se ven numeradas como en el PDF (1, 2, 3…), no con «†».
  '& .ProseMirror': { counterReset: 'nota' },
  '& .ProseMirror sup.nota-al-pie': { color: 'primary.main', fontWeight: 700, cursor: 'pointer', px: '2px', userSelect: 'none',
    counterIncrement: 'nota', fontSize: 0, '&::after': { content: 'counter(nota)', fontSize: '0.75rem' } },
  // Citas enlazadas (extensiones/Referencia.ts): texto normal con un subrayado tenue.
  '& .ProseMirror span.referencia': { borderBottom: '1px dotted', borderColor: 'primary.main', bgcolor: 'action.hover', borderRadius: '2px', px: '1px' },
  '& .ProseMirror hr.salto-pagina': {
    border: 0, borderTop: '1px dashed', borderColor: 'text.disabled', my: 2, position: 'relative', overflow: 'visible',
    '&::after': { content: '"salto de página"', position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', px: 1, fontSize: 11, color: 'text.disabled', bgcolor: 'background.paper' },
  },
  '& .ProseMirror hr.salto-pagina.ProseMirror-selectednode': { borderColor: 'primary.main' },
  '& .ProseMirror table': { borderCollapse: 'collapse', width: '100%', my: 1 },
  '& .ProseMirror td, & .ProseMirror th': { border: '1px solid #ddd', p: '3px 6px', verticalAlign: 'top' },
  '& .ProseMirror td p, & .ProseMirror th p': { my: 0.25 },
  // Celdas en bandera (como en el PDF): justificar en columnas estrechas abre huecos.
  '& .ProseMirror td:not([style*="text-align"]) p, & .ProseMirror th:not([style*="text-align"]) p': { textAlign: 'left' },
  '& .ProseMirror .selectedCell': { bgcolor: 'action.selected' },
  ...estiloHerramientas,
} as const

export function Boton({ icono, activo = false, etiqueta, accion, deshabilitado = false }: {
  icono: ReactNode; activo?: boolean; etiqueta: string; accion: () => void; deshabilitado?: boolean
}) {
  return (
    <Tooltip title={etiqueta} disableInteractive>
      <span>
        <IconButton size="small" color={activo ? 'primary' : 'default'} onClick={accion} aria-label={etiqueta} disabled={deshabilitado} sx={{ p: 0.5 }}>
          {icono}
        </IconButton>
      </span>
    </Tooltip>
  )
}

/** Lista numerada (1.), alfabética (a)) o romana (i)): pasa de una a otra sin
 *  deshacer la lista; pulsar la activa la quita. */
export function lista(editor: Editor, tipo: string | null) {
  const activa = editor.isActive('orderedList')
  const actual = (editor.getAttributes('orderedList').type as string | null) ?? null
  if (activa && actual === tipo) {
    editor.chain().focus().toggleOrderedList().run()
  } else if (activa) {
    editor.chain().focus().updateAttributes('orderedList', { type: tipo }).run()
  } else {
    editor.chain().focus().toggleOrderedList().updateAttributes('orderedList', { type: tipo }).run()
  }
}

export async function ponerEnlace(editor: Editor) {
  const actual = (editor.getAttributes('link').href as string) ?? ''
  const { from, to } = editor.state.selection
  const url = await pedirTexto('Dirección del enlace (https://…). Vacío para quitarlo:', { inicial: actual, etiqueta: 'Dirección', titulo: 'Enlace' })
  if (url === null) return
  if (url.trim() === '') editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').unsetLink().run()
  else editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').setLink({ href: url.trim() }).run()
}

/** Nota al pie seleccionada (para editarla) o null. */
function notaSeleccionada(editor: Editor): string | null {
  const { selection } = editor.state
  const nodo = selection instanceof NodeSelection ? selection.node : null
  return nodo?.type.name === 'footnote' ? ((nodo.attrs.texto as string) ?? '') : null
}

/** Nota al pie: si hay una seleccionada, edita su texto; si no, inserta una
 *  nueva en el cursor. El texto va en el atributo (\footnote{...}).
 *  (La barra usa su diálogo; esta versión con prompt queda para quien la importe.) */
export async function insertarNota(editor: Editor) {
  const { selection } = editor.state
  const nodo = selection instanceof NodeSelection ? selection.node : null
  const esNota = nodo?.type.name === 'footnote'
  const actual = esNota ? (nodo?.attrs.texto as string) : ''
  const { from, to } = selection
  const texto = await pedirTexto('Texto de la nota al pie:', { inicial: actual ?? '', multilinea: true, titulo: 'Nota al pie' })
  if (texto === null) return
  if (esNota) editor.chain().focus().setNodeSelection(from).updateAttributes('footnote', { texto }).run()
  else if (texto.trim()) editor.chain().focus().setTextSelection({ from, to }).insertContent({ type: 'footnote', attrs: { texto } }).run()
}

/** Lo que la barra pinta según el cursor, en primitivos: useEditorState la
 *  repinta solo si algo de esto cambia, no en cada tecla (2026-10-06). */
function estadoBarra(ed: Editor | null, nivelTitulo: 2 | 3) {
  if (!ed) return null
  const parrafo = ed.getAttributes('paragraph')
  return {
    deshacer: ed.can().undo(),
    rehacer: ed.can().redo(),
    negrita: ed.isActive('bold'),
    cursiva: ed.isActive('italic'),
    subrayado: ed.isActive('underline'),
    tachado: ed.isActive('strike'),
    vinetas: ed.isActive('bulletList'),
    numerada: ed.isActive('orderedList') && !ed.getAttributes('orderedList').type,
    alfabetica: ed.isActive('orderedList', { type: 'a' }),
    sangria: (Number(parrafo.sangria) || 0) > 0,
    enlace: ed.isActive('link'),
    nota: ed.isActive('footnote'),
    sugerir: Boolean((ed.storage as { controlCambios?: { sugerir?: boolean } }).controlCambios?.sugerir),
    resaltado: ed.isActive('resaltado'),
    cambios: contarCambios(ed.getJSON() as Parameters<typeof contarCambios>[0]),
    tabla: ed.isActive('table'),
    superindice: ed.isActive('superscript'),
    subindice: ed.isActive('subscript'),
    titulo: ed.isActive('heading', { level: nivelTitulo }),
    alineacion: (parrafo.textAlign as string) || 'justify',
    tipoSangria: (parrafo.sangriaTipo as string) || 'completa',
    editable: ed.isEditable,
  }
}

/** Palabras del texto, recontadas con pausa (500 ms tras el último cambio):
 *  contar todo el documento en cada tecla trababa la escritura en el celular.
 *  Escucha 'transaction' y no 'update': la carga inicial (setContent sin
 *  evento) también cambia el texto. */
function usePalabras(editor: Editor | null): number {
  const [palabras, setPalabras] = useState(0)
  useEffect(() => {
    if (!editor) return
    const contar = () => setPalabras(editor.state.doc.textContent.split(/\s+/).filter(Boolean).length)
    contar()
    let t: ReturnType<typeof setTimeout> | undefined
    const alCambiar = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return
      clearTimeout(t)
      t = setTimeout(contar, 500)
    }
    editor.on('transaction', alCambiar)
    return () => { clearTimeout(t); editor.off('transaction', alCambiar) }
  }, [editor])
  return palabras
}

/**
 * LAS HERRAMIENTAS CON ESTADO que comparten esta barra y la del Formato Word (`word/BarraWord`,
 * 2026-10-19): el pincel de copiar formato, la nota al pie y su diálogo, buscar y reemplazar, el panel
 * de sugerencias de cambio, el orden del texto pegado de Word y el contador de palabras. Un solo lugar:
 * las dos barras pintan botones distintos sobre la misma lógica y los mismos diálogos (`dialogos`).
 */
export function useHerramientasEditor(editor: Editor | null, nivelTitulo: 2 | 3 = 3) {
  const [nota, setNota] = useState<{ texto: string; editando: boolean } | null>(null)
  const [buscando, setBuscando] = useState<{ reemplazar: boolean } | null>(null)
  const [cambiosAbierto, setCambiosAbierto] = useState(false)
  // Copiar formato (2026-10-19, como el pincel de Google Docs): un clic toma las marcas de la selección; la
  // siguiente selección las recibe y el pincel se suelta.
  const [pincel, setPincel] = useState<MarcaPM[] | null>(null)
  useEffect(() => {
    if (!editor || !pincel) return
    const aplicar = () => {
      const { from, to, empty } = editor.state.selection
      if (empty) return
      let tr = editor.state.tr
      editor.state.doc.nodesBetween(from, to, (n, pos) => {
        if (n.isText) for (const m of n.marks) if (!['insercion', 'supresion', 'cambioFormato'].includes(m.type.name)) tr = tr.removeMark(Math.max(pos, from), Math.min(pos + n.nodeSize, to), m.type)
        return true
      })
      for (const m of pincel) tr = tr.addMark(from, to, m)
      editor.view.dispatch(tr)
      setPincel(null)
    }
    editor.on('selectionUpdate', aplicar)
    return () => { editor.off('selectionUpdate', aplicar) }
  }, [editor, pincel])
  // Texto pegado de Word sin ordenar (lo aprendido del asesor, 2026-10-06):
  // se ofrece ordenarlo; el resultado se avisa abajo.
  const [sugerirOrden, setSugerirOrden] = useState(false)
  const [descartado, setDescartado] = useState(false)
  const [avisoOrden, setAvisoOrden] = useState<string | null>(null)
  useEffect(() => {
    if (!editor) return
    let t: ReturnType<typeof setTimeout> | undefined
    const revisar = () => {
      clearTimeout(t)
      // Con pausa: un texto largo no se revisa a cada tecla.
      t = setTimeout(() => setSugerirOrden(editor.isEditable && pareceWordSinOrdenar(editor.getJSON() as Nodo)), 1200)
    }
    revisar()
    editor.on('update', revisar)
    return () => { clearTimeout(t); editor.off('update', revisar) }
  }, [editor])
  // Ctrl+F / Ctrl+H dentro del texto abren el panel (BuscarReemplazar.ts).
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    const abrir = (e: Event) => setBuscando({ reemplazar: Boolean((e as CustomEvent).detail?.reemplazar) })
    dom.addEventListener('sgdp-buscar', abrir)
    return () => dom.removeEventListener('sgdp-buscar', abrir)
  }, [editor])
  // Un clic en el número de una nota al pie abre su editor (NotaAlPie.ts, 2026-10-18).
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    const abrir = (e: Event) => setNota({ texto: String((e as CustomEvent).detail?.texto ?? ''), editando: true })
    dom.addEventListener(EVENTO_ABRIR_NOTA, abrir)
    return () => dom.removeEventListener(EVENTO_ABRIR_NOTA, abrir)
  }, [editor])
  // Al PEGAR, se ordena solo (Edison 2026-10-06: «debe ser automático al momento de pegar»). El
  // pegado de Word ya se ordena en su porción (PegadoNotas), pero las notas «[1]» y su lista al final,
  // o lo pegado desde el celular sin formato, solo se reconocen mirando el documento entero: tras el
  // pegado se revisa el todo y, si parece Word sin ordenar, se ordena con aviso (Ctrl+Z lo deshace).
  // El botón «Ordenar texto pegado de Word» sigue en «Más» para hacerlo a mano.
  const ordenarAuto = useRef<() => void>(() => {})
  useEffect(() => {
    const dom = editor?.view.dom
    if (!editor || !dom) return
    let t: ReturnType<typeof setTimeout> | undefined
    const alPegar = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        if (editor.isEditable && pareceWordSinOrdenar(editor.getJSON() as Nodo)) ordenarAuto.current()
      }, 120)
    }
    dom.addEventListener('paste', alPegar)
    return () => { clearTimeout(t); dom.removeEventListener('paste', alPegar) }
  }, [editor])
  const palabras = usePalabras(editor)
  const est = useEditorState({ editor, selector: ({ editor: e }) => estadoBarra(e, nivelTitulo) })
  const abrirNota = () => {
    if (!editor) return
    const actual = notaSeleccionada(editor)
    setNota({ texto: actual ?? '', editando: actual !== null })
  }
  const guardarNota = () => {
    if (!nota || !editor) return
    const texto = nota.texto.replace(/\s+/g, ' ').trim()
    if (nota.editando) editor.chain().focus().updateAttributes('footnote', { texto }).run()
    else if (texto) editor.chain().focus().insertContent({ type: 'footnote', attrs: { texto } }).run()
    setNota(null)
  }
  const ordenar = (automatico = false) => {
    if (!editor) return
    const { doc, informe } = ordenarTextoWord(editor.getJSON() as Nodo)
    // setContent queda en el historial: Ctrl+Z lo deshace entero.
    if (huboCambios(informe)) editor.chain().focus().setContent(doc, true).run()
    else if (automatico) return
    setAvisoOrden(automatico ? `Texto pegado ordenado solo. ${describirInforme(informe).replace(/^Ordenado: /, 'Se arregló: ')} Ctrl+Z lo deshace.` : describirInforme(informe))
    setSugerirOrden(false)
  }
  ordenarAuto.current = () => ordenar(true)
  const alternarPincel = () => {
    if (!editor) return
    setPincel(pincel ? null : editor.state.selection.$from.marks().filter((m) => !['insercion', 'supresion'].includes(m.type.name)))
  }
  const alternarBuscar = () => setBuscando(buscando ? null : { reemplazar: true })
  const avisoWord = sugerirOrden && !descartado ? (
    <Alert
      severity="info"
      icon={<AutoFixHighIcon fontSize="small" />}
      onClose={() => setDescartado(true)}
      sx={{ flexBasis: '100%', mt: 0.5, py: 0, alignItems: 'center' }}
      action={<Button size="small" onClick={() => ordenar()}>Ordenar ahora</Button>}
    >
      Parece pegado de Word sin ordenar (notas «[1]», listas a mano). Ctrl+Z lo deshace.
    </Alert>
  ) : null
  const dialogos = editor ? (
    <>
      <Snackbar open={avisoOrden !== null} autoHideDuration={9000} onClose={() => setAvisoOrden(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setAvisoOrden(null)} sx={{ maxWidth: 560 }}>{avisoOrden}</Alert>
      </Snackbar>
      {buscando && <PanelBuscar editor={editor} reemplazarVisible={buscando.reemplazar} alCerrar={() => { editor.commands.limpiarBusqueda(); setBuscando(null); editor.commands.focus() }} />}
      <Dialog open={cambiosAbierto} onClose={() => setCambiosAbierto(false)} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle>Sugerencias de cambio</DialogTitle>
        <DialogContent dividers><PanelCambios editor={editor} /></DialogContent>
        <DialogActions><Button onClick={() => setCambiosAbierto(false)}>Cerrar</Button></DialogActions>
      </Dialog>
      <Dialog open={nota !== null} onClose={() => setNota(null)} fullWidth maxWidth="sm">
        <DialogTitle>{nota?.editando ? 'Editar nota al pie' : 'Nueva nota al pie'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            sx={{ mt: 1 }}
            label="Texto de la nota"
            placeholder="Ley N° 29664, artículo 14. Disponible en: https://…"
            value={nota?.texto ?? ''}
            onChange={(e) => setNota((n) => (n ? { ...n, texto: e.target.value } : n))}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardarNota() }}
            helperText="Va al pie de la página con su número. Las direcciones web se parten solas. Ctrl+Enter para guardar."
          />
        </DialogContent>
        <DialogActions>
          {nota?.editando && (
            <Button color="error" onClick={() => { editor.chain().focus().deleteSelection().run(); setNota(null) }} sx={{ mr: 'auto' }}>Quitar la nota</Button>
          )}
          <Button onClick={() => setNota(null)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarNota} disabled={!nota?.editando && !nota?.texto.trim()}>
            {nota?.editando ? 'Guardar' : 'Insertar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  ) : null
  return { est, palabras, pincel: pincel !== null, alternarPincel, abrirNota, buscando: buscando !== null, alternarBuscar, abrirCambios: () => setCambiosAbierto(true), ordenar, avisoWord, dialogos }
}

export type HerramientasEditor = ReturnType<typeof useHerramientasEditor>

export default function BarraFormato({
  editor, titulo, nivelTitulo = 3, extras, conEnlace = true, sx,
}: {
  editor: Editor | null
  /** Rótulo del botón de título del menú «⋯» (p. ej. «Sección», «Título de
   *  artículo o apartado»); sin él, no se ofrece. */
  titulo?: string
  /** Nivel del título (los documentos con secciones usan 2). */
  nivelTitulo?: 2 | 3
  /** Acciones propias del tipo (Texto citado, Armar cuadro…), a la derecha. */
  extras?: ReactNode
  conEnlace?: boolean
  sx?: SxProps<Theme>
}) {
  const [masAncla, setMasAncla] = useState<HTMLElement | null>(null)
  const h = useHerramientasEditor(editor, nivelTitulo)
  const { est, palabras } = h
  if (!editor || !est) return null
  const ed = editor
  const { alineacion, tipoSangria } = est
  const cerrarMas = (accion?: () => void) => {
    setMasAncla(null)
    accion?.()
  }
  const opcion = (icono: ReactNode, texto: string, activo: boolean, accion: () => void) => (
    <MenuItem key={texto} dense onClick={() => cerrarMas(accion)}>
      <ListItemIcon>{icono}</ListItemIcon>
      <ListItemText>{texto}</ListItemText>
      {activo && <CheckIcon fontSize="small" sx={{ ml: 2, color: 'primary.main' }} />}
    </MenuItem>
  )

  return (
    <Box sx={[{ display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'wrap' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Boton icono={<UndoIcon fontSize="small" />} etiqueta="Deshacer (Ctrl+Z)" accion={() => ed.chain().focus().undo().run()} deshabilitado={!est.deshacer} />
      <Boton icono={<RedoIcon fontSize="small" />} etiqueta="Rehacer (Ctrl+Y)" accion={() => ed.chain().focus().redo().run()} deshabilitado={!est.rehacer} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Boton icono={<FormatBoldIcon fontSize="small" />} activo={est.negrita} etiqueta="Negrita (Ctrl+B)" accion={() => ed.chain().focus().toggleBold().run()} />
      <Boton icono={<FormatItalicIcon fontSize="small" />} activo={est.cursiva} etiqueta="Cursiva (Ctrl+I)" accion={() => ed.chain().focus().toggleItalic().run()} />
      <Boton icono={<FormatUnderlinedIcon fontSize="small" />} activo={est.subrayado} etiqueta="Subrayado (Ctrl+U)" accion={() => ed.chain().focus().toggleUnderline().run()} />
      <Boton icono={<StrikethroughSIcon fontSize="small" />} activo={est.tachado} etiqueta="Tachado (Ctrl+Shift+S): lo que se suprime en el cuadro comparativo" accion={() => ed.chain().focus().toggleStrike().run()} />
      <Boton icono={<BorderColorOutlinedIcon fontSize="small" />} activo={est.resaltado} etiqueta="Resaltar (Ctrl+Shift+H): ayuda de revisión; no sale al PDF" accion={() => ed.chain().focus().toggleResaltado().run()} />
      <Boton icono={<FormatPaintOutlinedIcon fontSize="small" />} activo={h.pincel} etiqueta={h.pincel ? 'Copiar formato: seleccione el texto que lo recibirá' : 'Copiar formato: toma el formato de la selección y lo aplica a la siguiente'} accion={h.alternarPincel} />
      <Boton icono={<FormatClearIcon fontSize="small" />} etiqueta="Quitar formato (negrita, cursiva, resaltado, enlaces…) de la selección" accion={() => ed.chain().focus().unsetAllMarks().run()} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Boton icono={<FormatListBulletedIcon fontSize="small" />} activo={est.vinetas} etiqueta="Viñetas" accion={() => ed.chain().focus().toggleBulletList().run()} />
      <Boton icono={<FormatListNumberedIcon fontSize="small" />} activo={est.numerada} etiqueta="Lista numerada (1. 2. 3.)" accion={() => lista(ed, null)} />
      <Boton icono={<SortByAlphaIcon fontSize="small" />} activo={est.alfabetica} etiqueta="Lista alfabética (a) b) c)); Tab dentro de una lista crea una sublista" accion={() => lista(ed, 'a')} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Boton icono={<FormatIndentDecreaseIcon fontSize="small" />} etiqueta="Sacar sangría (Shift+Tab)" accion={() => ed.chain().focus().ajustarSangria(-1).run()} />
      <Boton icono={<FormatIndentIncreaseIcon fontSize="small" />} activo={est.sangria} etiqueta="Adentrar sangría (Tab)" accion={() => ed.chain().focus().ajustarSangria(1).run()} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      {conEnlace && <Boton icono={<InsertLinkIcon fontSize="small" />} activo={est.enlace} etiqueta="Enlace" accion={() => ponerEnlace(ed)} />}
      <Boton icono={<NotesIcon fontSize="small" />} activo={est.nota} etiqueta="Nota al pie (seleccione una para editarla)" accion={h.abrirNota} />
      <Boton icono={<TableChartIcon fontSize="small" />} activo={est.tabla} etiqueta="Insertar tabla (clic derecho sobre ella: alinear, filas, columnas)" accion={() => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} deshabilitado={est.tabla} />
      <Boton icono={<FindReplaceIcon fontSize="small" />} activo={h.buscando} etiqueta="Buscar y reemplazar (Ctrl+F, Ctrl+H)" accion={h.alternarBuscar} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      {/* Control de cambios (2026-10-19): «Sugerir» marca lo escrito y lo borrado; «Cambios» los acepta o rechaza. */}
      <Boton icono={<TrackChangesIcon fontSize="small" />} activo={est.sugerir} etiqueta={est.sugerir ? 'Sugerir: encendido (lo que escribe o borra queda como sugerencia)' : 'Sugerir: lo que escriba o borre quedará como sugerencia para aceptar o rechazar'} accion={() => ed.commands.ponerSugerir(!est.sugerir, localStorage.getItem('sgdp_nombre') ?? 'Yo')} />
      {(est.cambios > 0 || est.sugerir) && (
        <Tooltip title="Sugerencias pendientes: aceptar o rechazar" disableInteractive>
          <Button size="small" color={est.cambios ? 'primary' : 'inherit'} startIcon={<RateReviewOutlinedIcon fontSize="small" />} onClick={h.abrirCambios} sx={{ minWidth: 0, px: 0.75, whiteSpace: 'nowrap', color: est.cambios ? undefined : 'text.secondary' }}>
            Cambios{est.cambios ? ` (${est.cambios})` : ''}
          </Button>
        </Tooltip>
      )}
      <Tooltip title="Más: superíndice, subíndice, alineación, tipo de sangría, título, salto de página" disableInteractive>
        <IconButton size="small" onClick={(e) => setMasAncla(e.currentTarget)} aria-label="Más opciones de formato" sx={{ p: 0.5 }}>
          <MoreHorizIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={masAncla} open={masAncla !== null} onClose={() => cerrarMas()}>
        {opcion(<SuperscriptIcon fontSize="small" />, 'Superíndice (m², 1.º)', est.superindice, () => ed.chain().focus().toggleSuperscript().run())}
        {opcion(<SubscriptIcon fontSize="small" />, 'Subíndice (CO₂)', est.subindice, () => ed.chain().focus().toggleSubscript().run())}
        <Divider />
        {opcion(<FormatAlignJustifyIcon fontSize="small" />, 'Justificar (normal)', alineacion === 'justify', () => ed.chain().focus().setTextAlign('justify').run())}
        {opcion(<FormatAlignLeftIcon fontSize="small" />, 'Alinear a la izquierda', alineacion === 'left', () => ed.chain().focus().setTextAlign('left').run())}
        {opcion(<FormatAlignCenterIcon fontSize="small" />, 'Centrar', alineacion === 'center', () => ed.chain().focus().setTextAlign('center').run())}
        {opcion(<FormatAlignRightIcon fontSize="small" />, 'Alinear a la derecha', alineacion === 'right', () => ed.chain().focus().setTextAlign('right').run())}
        <Divider />
        {(['completa', 'primera', 'francesa'] as SangriaTipo[]).map((tipo) =>
          opcion(
            <FormatIndentIncreaseIcon fontSize="small" />,
            { completa: 'Sangría de bloque (todo el párrafo)', primera: 'Sangría de primera línea', francesa: 'Sangría francesa (colgante)' }[tipo],
            tipoSangria === tipo,
            () => ed.chain().focus().fijarTipoSangria(tipo).run(),
          ),
        )}
        <Divider />
        {titulo && opcion(<TitleIcon fontSize="small" />, titulo, est.titulo, () => ed.chain().focus().toggleHeading({ level: nivelTitulo }).run())}
        {opcion(<InsertPageBreakIcon fontSize="small" />, 'Salto de página', false, () => ed.chain().focus().insertarSaltoPagina().run())}
        {est.editable && <Divider />}
        {est.editable && opcion(<AutoFixHighIcon fontSize="small" />, 'Ordenar texto pegado de Word (notas, listas, vacíos)', false, () => h.ordenar())}
      </Menu>
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Palabras del texto (las notas al pie no cuentan)" disableInteractive>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.75, whiteSpace: 'nowrap' }}>
          {palabras.toLocaleString('es-PE')} palabra{palabras === 1 ? '' : 's'}
        </Typography>
      </Tooltip>
      {extras}
      {h.avisoWord}
      {h.dialogos}
    </Box>
  )
}

/** Panel de buscar y reemplazar, bajo la barra (Word: Ctrl+F / Ctrl+H). */
function PanelBuscar({ editor, reemplazarVisible, alCerrar }: { editor: Editor; reemplazarVisible: boolean; alCerrar: () => void }) {
  const [termino, setTermino] = useState('')
  const [por, setPor] = useState('')
  const [mayusculas, setMayusculas] = useState(false)
  const [conReemplazo, setConReemplazo] = useState(reemplazarVisible)
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => setConReemplazo((v) => v || reemplazarVisible), [reemplazarVisible])
  useEffect(() => campo.current?.focus(), [])
  useEffect(() => {
    editor.commands.buscar(termino, mayusculas)
  }, [editor, termino, mayusculas])
  // Sin re-render por transacción: el recuento se vigila aparte.
  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const b = claveBusqueda.getState(e.state)
      return { total: b?.resultados.length ?? 0, actual: b?.actual ?? 0 }
    },
  })
  const total = estado.total
  const irA = (sentido: 1 | -1) => {
    if (sentido === 1) editor.commands.siguienteCoincidencia()
    else editor.commands.anteriorCoincidencia()
    const e = claveBusqueda.getState(editor.state)
    const r = e?.resultados[e.actual]
    if (r) {
      const dom = editor.view.domAtPos(r.desde).node as HTMLElement
      ;(dom.nodeType === 3 ? dom.parentElement : dom)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }
  return (
    <Box sx={{ flexBasis: '100%', display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.75, pt: 0.75, borderTop: '1px dashed', borderColor: 'divider' }}>
      <TextField
        inputRef={campo}
        size="small"
        placeholder="Buscar en el texto"
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); irA(e.shiftKey ? -1 : 1) }
          if (e.key === 'Escape') alCerrar()
        }}
        sx={{ width: { xs: '100%', sm: 220 } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 64 }}>
        {termino ? (total ? `${(estado?.actual ?? 0) + 1} de ${total}` : 'sin resultados') : ''}
      </Typography>
      <IconButton size="small" onClick={() => irA(-1)} disabled={!total} aria-label="Anterior"><KeyboardArrowUpIcon fontSize="small" /></IconButton>
      <IconButton size="small" onClick={() => irA(1)} disabled={!total} aria-label="Siguiente"><KeyboardArrowDownIcon fontSize="small" /></IconButton>
      <Tooltip title="Distinguir mayúsculas y minúsculas">
        <ToggleButton size="small" value="Aa" selected={mayusculas} onChange={() => setMayusculas((v) => !v)} sx={{ py: 0.25, px: 0.9, textTransform: 'none', fontSize: 12 }}>Aa</ToggleButton>
      </Tooltip>
      {conReemplazo ? (
        <>
          <TextField size="small" placeholder="Reemplazar por" value={por} onChange={(e) => setPor(e.target.value)} sx={{ width: { xs: '100%', sm: 200 } }} />
          <Button size="small" disabled={!total} onClick={() => editor.chain().reemplazarActual(por).run()}>Reemplazar</Button>
          <Button size="small" disabled={!total} onClick={() => editor.chain().reemplazarTodo(por).run()}>Reemplazar todo ({total})</Button>
        </>
      ) : (
        <Button size="small" onClick={() => setConReemplazo(true)}>Reemplazar…</Button>
      )}
      <Box sx={{ flex: 1 }} />
      <IconButton size="small" onClick={alCerrar} aria-label="Cerrar la búsqueda"><CloseIcon fontSize="small" /></IconButton>
    </Box>
  )
}

// --- Menú contextual de tablas ---------------------------------------------

export type EstadoMenuTabla = { x: number; y: number; ed: Editor } | null

/** Estado y apertura del menú: `abrir(editor)` es el onContextMenu del área. */
export function useMenuTabla() {
  const [estado, setEstado] = useState<EstadoMenuTabla>(null)
  const abrir = (ed: Editor | null) => (e: React.MouseEvent) => {
    if (!ed || !ed.isActive('table')) return
    e.preventDefault()
    setEstado({ x: e.clientX, y: e.clientY, ed })
  }
  return { estado, abrir, cerrar: () => setEstado(null) }
}

export function MenuTabla({ estado, alCerrar }: { estado: EstadoMenuTabla; alCerrar: () => void }) {
  const [rotulo, setRotulo] = useState<{ ed: Editor; titulo: string; fuente: string } | null>(null)
  const alinear = (ambito: AmbitoAlineacion, align: Alineacion) => {
    if (estado) alinearTabla(estado.ed, ambito, align)
    alCerrar()
  }
  const operar = (accion: (ed: Editor) => void) => {
    if (estado) accion(estado.ed)
    alCerrar()
  }
  return (
    <>
    <Menu open={estado !== null} onClose={alCerrar} anchorReference="anchorPosition" anchorPosition={estado ? { top: estado.y, left: estado.x } : undefined}>
      {(['celda', 'fila', 'columna', 'tabla'] as AmbitoAlineacion[]).map((ambito) => (
        <MenuItem key={ambito} disableRipple sx={{ cursor: 'default', py: 0 }}>
          <ListItemText sx={{ mr: 1, textTransform: 'capitalize' }}>Alinear {ambito}</ListItemText>
          <IconButton size="small" onClick={() => alinear(ambito, 'left')} aria-label={`Alinear ${ambito} a la izquierda`}><FormatAlignLeftIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => alinear(ambito, 'center')} aria-label={`Centrar ${ambito}`}><FormatAlignCenterIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => alinear(ambito, 'right')} aria-label={`Alinear ${ambito} a la derecha`}><FormatAlignRightIcon fontSize="small" /></IconButton>
        </MenuItem>
      ))}
      <Divider />
      <MenuItem onClick={() => operar((ed) => ed.chain().focus().addRowBefore().run())}>Insertar fila arriba</MenuItem>
      <MenuItem onClick={() => operar((ed) => ed.chain().focus().addRowAfter().run())}>Insertar fila debajo</MenuItem>
      <MenuItem onClick={() => operar((ed) => ed.chain().focus().deleteRow().run())}>Eliminar fila</MenuItem>
      <MenuItem onClick={() => operar((ed) => ed.chain().focus().addColumnBefore().run())}>Insertar columna a la izquierda</MenuItem>
      <MenuItem onClick={() => operar((ed) => ed.chain().focus().addColumnAfter().run())}>Insertar columna a la derecha</MenuItem>
      <MenuItem onClick={() => operar((ed) => ed.chain().focus().deleteColumn().run())}>Eliminar columna</MenuItem>
      <Divider />
      <MenuItem disabled={!estado?.ed.can().mergeCells()} onClick={() => operar((ed) => ed.chain().focus().mergeCells().run())}>
        Combinar celdas <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>(seleccione varias arrastrando)</Typography>
      </MenuItem>
      <MenuItem disabled={!estado?.ed.can().splitCell()} onClick={() => operar((ed) => ed.chain().focus().splitCell().run())}>Dividir celda</MenuItem>
      <MenuItem onClick={() => operar((ed) => ed.chain().focus().toggleHeaderRow().run())}>Alternar fila de encabezado</MenuItem>
      <MenuItem
        onClick={() => {
          if (estado) {
            const a = estado.ed.getAttributes('table')
            setRotulo({ ed: estado.ed, titulo: (a.titulo as string) ?? '', fuente: (a.fuente as string) ?? '' })
          }
          alCerrar()
        }}
      >
        Título y fuente del cuadro…
      </MenuItem>
      <Divider />
      <MenuItem sx={{ color: 'error.main' }} onClick={() => operar((ed) => ed.chain().focus().deleteTable().run())}>Eliminar tabla</MenuItem>
    </Menu>
    <Dialog open={rotulo !== null} onClose={() => setRotulo(null)} fullWidth maxWidth="sm">
      <DialogTitle>Título y fuente del cuadro</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          En el PDF sale «CUADRO — N° n» con el título encima de la tabla y la fuente debajo, numerados en orden. Sin título ni fuente, la tabla va sola.
        </Typography>
        <TextField autoFocus fullWidth label="Título" placeholder="Pérdidas agropecuarias por distrito, 2026" value={rotulo?.titulo ?? ''} onChange={(e) => setRotulo((r) => (r ? { ...r, titulo: e.target.value } : r))} sx={{ mb: 2 }} />
        <TextField fullWidth label="Fuente" placeholder="INEI, Censo Nacional Agropecuario 2012. Elaboración propia." value={rotulo?.fuente ?? ''} onChange={(e) => setRotulo((r) => (r ? { ...r, fuente: e.target.value } : r))} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRotulo(null)}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={() => {
            if (rotulo) rotulo.ed.chain().focus().updateAttributes('table', { titulo: rotulo.titulo.trim(), fuente: rotulo.fuente.trim() }).run()
            setRotulo(null)
          }}
        >
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
    </>
  )
}

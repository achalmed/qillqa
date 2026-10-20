/**
 * BARRA WORD (2026-10-19; Edison: «que se parezca a la imagen de Google Docs que mandé») — el frente
 * del Formato Word en los tres pisos de Google Docs, sobre el mismo editor y los mismos comandos:
 *
 *   1. El TÍTULO del documento activo (icono, nombre, estado, «Guardado»), con historial, comentarios
 *      y «Compartir» a la derecha.
 *   2. La fila de MENÚS «Archivo · Editar · Ver · Insertar · Formato · Herramientas · Ayuda». Cada
 *      módulo aporta su «Archivo» (nuevo, desde un Word, descargar…); lo demás se arma aquí sobre el
 *      editor activo (`menus.ts` es el modelo puro; los submenús se abren dentro del mismo menú).
 *   3. La PÍLDORA de herramientas, en el orden de Google Docs: buscar en los menús · deshacer, rehacer,
 *      imprimir, ortografía, copiar formato · zoom · estilo · letra y tamaño · negrita, cursiva,
 *      subrayado, color, resaltador · enlace, comentario, imagen, referencia · alinear, interlineado,
 *      listas, sangrías, quitar formato · y, a la derecha, el modo «Edición · Sugerencias · Vista».
 *
 * Nada de esto es un segundo editor: la lógica con estado (pincel, nota al pie, buscar, cambios, orden
 * del pegado de Word) es `useHerramientasEditor`, la misma que la barra del formulario. En el celular
 * la píldora y los menús se desplazan de lado; el chevrón del extremo pliega el título y los menús.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import SpellcheckIcon from '@mui/icons-material/Spellcheck'
import FormatPaintOutlinedIcon from '@mui/icons-material/FormatPaintOutlined'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import RemoveIcon from '@mui/icons-material/Remove'
import AddIcon from '@mui/icons-material/Add'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined'
import InsertLinkIcon from '@mui/icons-material/InsertLink'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight'
import FormatLineSpacingIcon from '@mui/icons-material/FormatLineSpacing'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease'
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease'
import FormatClearIcon from '@mui/icons-material/FormatClear'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import HistoryIcon from '@mui/icons-material/History'
import ModeCommentOutlinedIcon from '@mui/icons-material/ModeCommentOutlined'
import LinkIcon from '@mui/icons-material/Link'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CheckIcon from '@mui/icons-material/Check'
import NotesIcon from '@mui/icons-material/Notes'
import TableChartIcon from '@mui/icons-material/TableChart'
import InsertPageBreakIcon from '@mui/icons-material/InsertPageBreak'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import SuperscriptIcon from '@mui/icons-material/Superscript'
import SubscriptIcon from '@mui/icons-material/Subscript'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import TitleIcon from '@mui/icons-material/Title'
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import { Boton, editorVivo, lista, ponerEnlace, useHerramientasEditor } from '../BarraFormato'
import type { SangriaTipo } from '../../extensiones/SangriaParrafo'
import { COLORES_TEXTO } from '../../extensiones/ColorTexto'
import { ETIQUETA_ESTADO, sxEstado } from '../../estados'
import { PALETA } from '../../paleta'
import { ESTILOS_PARRAFO, fechaLarga } from './modelo'
import { INTERLINEADOS, SEPARADOR, TAMANOS, ZOOMS, buscarEnMenus, leerOrtografia, pasoTamano, type ItemMenu, type MenuDef } from './menus'

/** El tamaño de letra y el interlineado de la sección activa (campos del PDF); sin esto, la plantilla manda. */
export interface FormatoHoja {
  tamano: string
  interlineado: string
  alTamano: (v: string) => void
  alInterlineado: (v: string) => void
}

/** Lo que la barra dice del documento o la parte activa. */
export interface DocumentoActivo { titulo: string; rotulo?: string; estado?: string; sucio?: boolean; cargando?: boolean }

export type Modo = 'edicion' | 'sugerir' | 'vista'

const yo = () => localStorage.getItem('sgdp_nombre') ?? 'Yo'
const ICONO_ALINEACION: Record<string, ReactNode> = {
  justify: <FormatAlignJustifyIcon fontSize="small" />, left: <FormatAlignLeftIcon fontSize="small" />, center: <FormatAlignCenterIcon fontSize="small" />, right: <FormatAlignRightIcon fontSize="small" />,
}

/** Pinta una lista de ítems de menú (los submenús los abre quien llama con `alHijos`). */
function pintarItems(items: ItemMenu[], cerrar: (accion?: () => void) => void, alHijos: (hijos: ItemMenu[], titulo: string) => void) {
  return items.map((it, i) => {
    if (it.separador) return <Divider key={`sep-${i}`} sx={{ my: 0.5 }} />
    if (it.hijos) {
      return (
        <MenuItem key={it.texto} dense disabled={it.deshabilitado} onClick={() => alHijos(it.hijos ?? [], it.texto)}>
          {it.icono && <ListItemIcon>{it.icono}</ListItemIcon>}
          <ListItemText inset={!it.icono}>{it.texto}</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ ml: 2, color: 'text.secondary' }} />
        </MenuItem>
      )
    }
    return (
      <MenuItem key={it.texto} dense disabled={it.deshabilitado || !it.accion} onClick={() => cerrar(it.accion)}>
        {it.icono && <ListItemIcon>{it.icono}</ListItemIcon>}
        <ListItemText inset={!it.icono}>{it.texto}</ListItemText>
        {it.activo && <CheckIcon fontSize="small" sx={{ ml: 2, color: 'primary.main' }} />}
        {it.atajo && !it.activo && <Typography variant="caption" color="text.secondary" sx={{ ml: 3 }}>{it.atajo}</Typography>}
      </MenuItem>
    )
  })
}

/** Un menú con submenús que se abren dentro («‹ Volver» arriba): funciona igual con el dedo. */
export function MenuAnidado({ ancla, items, alCerrar, titulo }: { ancla: HTMLElement | null; items: ItemMenu[]; alCerrar: () => void; titulo?: string }) {
  const [pila, setPila] = useState<{ items: ItemMenu[]; titulo: string }[]>([])
  useEffect(() => { if (!ancla) setPila([]) }, [ancla])
  const nivel = pila.length ? pila[pila.length - 1] : { items, titulo: titulo ?? '' }
  const cerrar = (accion?: () => void) => { alCerrar(); accion?.() }
  return (
    <Menu anchorEl={ancla} open={ancla !== null} onClose={() => cerrar()} slotProps={{ paper: { sx: { minWidth: 240, maxWidth: 360 } } }} MenuListProps={{ dense: true }}>
      {pila.length > 0 && (
        <MenuItem dense onClick={() => setPila((p) => p.slice(0, -1))} sx={{ fontWeight: 600 }}>
          <ListItemIcon><ChevronLeftIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{nivel.titulo}</ListItemText>
        </MenuItem>
      )}
      {pila.length > 0 && <Divider sx={{ my: 0.5 }} />}
      {pintarItems(nivel.items, cerrar, (hijos, t) => setPila((p) => [...p, { items: hijos, titulo: t }]))}
    </Menu>
  )
}

/** Un botón de la píldora que abre un menú de ítems (zoom, estilo, alinear…). */
function Desplegable({ etiqueta, icono, titulo, items, deshabilitado = false, ancho }: { etiqueta?: ReactNode; icono?: ReactNode; titulo: string; items: ItemMenu[]; deshabilitado?: boolean; ancho?: number }) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  return (
    <>
      <Tooltip title={titulo} disableInteractive>
        <span>
          <Button size="small" color="inherit" disabled={deshabilitado} onClick={(e) => setAncla(e.currentTarget)} aria-label={titulo} sx={{ minWidth: ancho ?? 0, px: 0.5, py: 0.25, fontSize: 13.5, fontWeight: 400, textTransform: 'none', whiteSpace: 'nowrap', color: 'text.primary', justifyContent: 'space-between', gap: 0.25 }}>
            {icono}
            {etiqueta && <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{etiqueta}</Box>}
            <ArrowDropDownIcon fontSize="small" sx={{ ml: -0.25, color: 'text.secondary' }} />
          </Button>
        </span>
      </Tooltip>
      <MenuAnidado ancla={ancla} items={items} alCerrar={() => setAncla(null)} />
    </>
  )
}

/** «Buscar en los menús» (la lupa de Google Docs): escribe y ejecuta. */
function BuscarMenus({ menus, angosta }: { menus: MenuDef[]; angosta: boolean }) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const [q, setQ] = useState('')
  const resultados = buscarEnMenus(menus, q)
  const cerrar = () => { setAncla(null); setQ('') }
  const ejecutar = (accion?: () => void) => { cerrar(); accion?.() }
  return (
    <>
      <Tooltip title="Buscar en los menús (Alt+/)" disableInteractive>
        <Button size="small" color="inherit" onClick={(e) => setAncla(e.currentTarget)} aria-label="Buscar en los menús" sx={{ minWidth: 0, px: 0.75, py: 0.25, gap: 0.5, textTransform: 'none', fontWeight: 400, color: 'text.secondary', fontSize: 13.5 }}>
          <SearchIcon fontSize="small" />
          {!angosta && 'Menús'}
        </Button>
      </Tooltip>
      <Popover open={ancla !== null} anchorEl={ancla} onClose={cerrar} slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 24px)', p: 1 } } }}>
        <TextField size="small" fullWidth autoFocus placeholder="Buscar en los menús" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && resultados[0]) ejecutar(resultados[0].item.accion); if (e.key === 'Escape') cerrar() }} inputProps={{ 'aria-label': 'Buscar en los menús' }} />
        <List dense disablePadding sx={{ mt: 0.5, maxHeight: 320, overflowY: 'auto' }}>
          {q.trim() && resultados.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Nada con ese nombre.</Typography>}
          {resultados.map((r) => (
            <ListItemButton key={r.ruta} onClick={() => ejecutar(r.item.accion)}>
              {r.item.icono && <ListItemIcon sx={{ minWidth: 32 }}>{r.item.icono}</ListItemIcon>}
              <ListItemText primary={r.item.texto} secondary={r.ruta} secondaryTypographyProps={{ noWrap: true, fontSize: 11.5 }} />
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  )
}

const ATAJOS: [string, string][] = [
  ['Ctrl+Z · Ctrl+Y', 'Deshacer · Rehacer'], ['Ctrl+B · Ctrl+I · Ctrl+U', 'Negrita · Cursiva · Subrayado'], ['Ctrl+Shift+S', 'Tachado'],
  ['Ctrl+Shift+H', 'Resaltar'], ['Ctrl+F · Ctrl+H', 'Buscar · Buscar y reemplazar'], ['Tab · Shift+Tab', 'Adentrar · Sacar sangría (y sublistas)'],
  ['Ctrl+Enter', 'Guardar la nota al pie'], ['@ o «Ley…»', 'Citar un documento o una norma'], ['Alt+/', 'Buscar en los menús'],
]

export default function BarraWord({ editor, documento, icono, archivo, herramientas = [], formato, zoom, alZoom, angosta, estructuraVisible, alEstructura, alImprimir, alComentar, alHistorial, imagen, tituloEstilo, enlaceCompartir, alAviso }: {
  editor: Editor | null
  documento: DocumentoActivo | null
  icono?: ReactNode
  /** El menú «Archivo» del módulo. */
  archivo: ItemMenu[]
  /** Lo que el módulo suma al final de «Herramientas». */
  herramientas?: ItemMenu[]
  formato?: FormatoHoja | null
  zoom: number
  alZoom: (z: number) => void
  angosta: boolean
  estructuraVisible: boolean
  alEstructura: () => void
  alImprimir?: () => void
  alComentar?: () => void
  alHistorial?: () => void
  /** El botón de imagen del módulo (la fotografía de un proyecto); sin él, el icono explica por qué no. */
  imagen?: ReactNode
  /** Rótulo del estilo «Título» del módulo («Artículo o apartado»). */
  tituloEstilo?: string
  /** Lo que copia «Compartir» (el enlace del documento o del proyecto). */
  enlaceCompartir?: string
  alAviso?: (tipo: 'success' | 'error' | 'info', texto: string) => void
}) {
  const h = useHerramientasEditor(editor, 2)
  const { est, palabras } = h
  const extra = useEditorState({
    editor,
    selector: ({ editor: e }) => (!editorVivo(e) ? null : {
      color: (e.getAttributes('colorTexto').color as string | undefined) ?? null,
      estilo: e.isActive('heading') ? 'titulo' : e.isActive('bulletList') ? 'vinetas' : e.isActive('orderedList') ? 'numerada' : 'parrafo',
      romana: e.isActive('orderedList', { type: 'i' }),
      caracteres: e.getText().length,
    }),
  })
  const [menu, setMenu] = useState<{ clave: string; ancla: HTMLElement } | null>(null)
  const [colorAncla, setColorAncla] = useState<HTMLElement | null>(null)
  const [modoAncla, setModoAncla] = useState<HTMLElement | null>(null)
  const [contar, setContar] = useState(false)
  const [atajos, setAtajos] = useState(false)
  const [nota, setNota] = useState<string | null>(null)
  const [ocultas, setOcultas] = useState(() => { try { return localStorage.getItem('sgdp_word_menus') === 'no' } catch { return false } })
  // El corrector del navegador: se apaga y se prende para todos los editores (se recuerda).
  const [ortografia, setOrtografia] = useState(leerOrtografia)
  useEffect(() => {
    if (!editor) return
    editor.view.dom.spellcheck = ortografia
    editor.view.dom.setAttribute('spellcheck', ortografia ? 'true' : 'false')
  }, [editor, ortografia])
  // Modo «Vista»: el editor se cierra y se recuerda cómo estaba para volver.
  const vista = useRef<{ editor: Editor; antes: boolean } | null>(null)
  const [, repintar] = useState(0)
  const modo: Modo = est?.sugerir ? 'sugerir' : editor && vista.current?.editor === editor && !est?.editable ? 'vista' : 'edicion'
  const ponerModo = (m: Modo) => {
    if (!editor) return
    if (vista.current?.editor === editor && m !== 'vista') { editor.setEditable(vista.current.antes); vista.current = null }
    if (m === 'vista') {
      if (!vista.current) vista.current = { editor, antes: editor.isEditable }
      editor.commands.ponerSugerir(false, yo())
      editor.setEditable(false)
    } else editor.commands.ponerSugerir(m === 'sugerir', yo())
    repintar((n) => n + 1)
    setModoAncla(null)
  }
  // Alt+/ abre «Buscar en los menús».
  const buscarRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.altKey && e.key === '/') { e.preventDefault(); buscarRef.current?.click() } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])
  const plegar = (v: boolean) => { setOcultas(v); try { localStorage.setItem('sgdp_word_menus', v ? 'no' : 'si') } catch { /* sin almacenamiento */ } }
  // La píldora no se parte en dos filas (como en Google Docs): si no cabe entera, se compacta (sin los
  // rótulos «Menús», «Letra oficial» y el nombre del modo) antes de desplazarse de lado.
  const pildora = useRef<HTMLDivElement | null>(null)
  const [anchoPildora, setAnchoPildora] = useState(0)
  useEffect(() => {
    const el = pildora.current
    if (!el) return
    const medir = () => setAnchoPildora(el.clientWidth)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const compacta = angosta || anchoPildora < 1330

  const ed = editor
  const hay = Boolean(ed && est)
  const puede = (f: (e: Editor) => void) => () => { if (ed) f(ed) }
  const aviso = (tipo: 'success' | 'error' | 'info', texto: string) => (alAviso ? alAviso(tipo, texto) : setNota(texto))
  const compartir = async () => {
    const enlace = enlaceCompartir ?? window.location.href
    try { await navigator.clipboard.writeText(enlace); aviso('success', 'Enlace copiado. Quien entre con su cuenta lo abre.') } catch { aviso('error', `No se pudo copiar. El enlace: ${enlace}`) }
  }
  const pegar = async () => {
    if (!ed) return
    try { const t = await navigator.clipboard.readText(); if (t) ed.chain().focus().insertContent(t).run() } catch { aviso('info', 'El navegador no deja pegar desde el menú: use Ctrl+V.') }
  }
  const ejecutar = (orden: 'cut' | 'copy') => { if (!ed) return; ed.view.focus(); document.execCommand(orden) }

  // ---- Los menús (sobre el editor activo) ---------------------------------------------------------
  const estilos: ItemMenu[] = ESTILOS_PARRAFO.map((e) => ({
    texto: e.clave === 'titulo' && tituloEstilo ? tituloEstilo : e.etiqueta, activo: extra?.estilo === e.clave, deshabilitado: !hay,
    accion: puede((x) => { const c = x.chain().focus(); if (e.clave === 'titulo') c.toggleHeading({ level: 2 }).run(); else if (e.clave === 'vinetas') c.toggleBulletList().run(); else if (e.clave === 'numerada') c.toggleOrderedList().run(); else c.setParagraph().run() }),
  }))
  const alineaciones: ItemMenu[] = ([['justify', 'Justificar (normal)'], ['left', 'Alinear a la izquierda'], ['center', 'Centrar'], ['right', 'Alinear a la derecha']] as const).map(([v, t]) => ({
    texto: t, icono: ICONO_ALINEACION[v], activo: est?.alineacion === v, deshabilitado: !hay, accion: puede((x) => x.chain().focus().setTextAlign(v).run()),
  }))
  const sangrias: ItemMenu[] = (['completa', 'primera', 'francesa'] as SangriaTipo[]).map((tipo) => ({
    texto: { completa: 'Sangría de bloque (todo el párrafo)', primera: 'Sangría de primera línea', francesa: 'Sangría francesa (colgante)' }[tipo], activo: est?.tipoSangria === tipo, deshabilitado: !hay,
    accion: puede((x) => x.chain().focus().fijarTipoSangria(tipo).run()),
  }))
  const interlineados: ItemMenu[] = INTERLINEADOS.map((i) => ({ texto: i.etiqueta, activo: (formato?.interlineado || '1') === i.valor, deshabilitado: !formato, accion: () => formato?.alInterlineado(i.valor === '1' ? '' : i.valor) }))
  const tamanos: ItemMenu[] = TAMANOS.map((t) => ({ texto: `${t.replace('.', ',')} pt`, activo: (formato?.tamano || '11') === t, deshabilitado: !formato, accion: () => formato?.alTamano(t === '11' ? '' : t) }))
  const colores: ItemMenu[] = [
    { texto: 'Automático (quitar el color)', activo: !extra?.color, deshabilitado: !hay, accion: puede((x) => x.chain().focus().ponerColorTexto(null).run()) },
    ...COLORES_TEXTO.map((c) => ({ texto: c.nombre, icono: <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: `#${c.hex}`, border: `1px solid ${PALETA.bordeFuerte}` }} />, activo: extra?.color === c.hex, deshabilitado: !hay, accion: puede((x) => x.chain().focus().ponerColorTexto(c.hex).run()) })),
  ]
  const listas: ItemMenu[] = [
    { texto: 'Viñetas', icono: <FormatListBulletedIcon fontSize="small" />, activo: est?.vinetas, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleBulletList().run()) },
    { texto: 'Numerada (1. 2. 3.)', icono: <FormatListNumberedIcon fontSize="small" />, activo: est?.numerada, deshabilitado: !hay, accion: puede((x) => lista(x, null)) },
    { texto: 'Alfabética (a) b) c))', icono: <SortByAlphaIcon fontSize="small" />, activo: est?.alfabetica, deshabilitado: !hay, accion: puede((x) => lista(x, 'a')) },
    { texto: 'Romana (i) ii) iii))', icono: <FormatListNumberedIcon fontSize="small" />, activo: extra?.romana, deshabilitado: !hay, accion: puede((x) => lista(x, 'i')) },
  ]
  const modos: ItemMenu[] = [
    { texto: 'Edición', icono: <EditOutlinedIcon fontSize="small" />, activo: modo === 'edicion', deshabilitado: !hay, accion: () => ponerModo('edicion') },
    { texto: 'Sugerencias', icono: <RateReviewOutlinedIcon fontSize="small" />, activo: modo === 'sugerir', deshabilitado: !hay, accion: () => ponerModo('sugerir') },
    { texto: 'Vista', icono: <VisibilityOutlinedIcon fontSize="small" />, activo: modo === 'vista', deshabilitado: !hay, accion: () => ponerModo('vista') },
  ]
  const zooms: ItemMenu[] = ZOOMS.map((z) => ({ texto: `${z} %`, activo: zoom === z, deshabilitado: angosta, accion: () => alZoom(z) }))
  const menus: MenuDef[] = [
    { clave: 'archivo', titulo: 'Archivo', items: archivo },
    { clave: 'editar', titulo: 'Editar', items: [
      { texto: 'Deshacer', icono: <UndoIcon fontSize="small" />, atajo: 'Ctrl+Z', deshabilitado: !est?.deshacer, accion: puede((x) => x.chain().focus().undo().run()) },
      { texto: 'Rehacer', icono: <RedoIcon fontSize="small" />, atajo: 'Ctrl+Y', deshabilitado: !est?.rehacer, accion: puede((x) => x.chain().focus().redo().run()) },
      SEPARADOR,
      { texto: 'Cortar', icono: <ContentCutIcon fontSize="small" />, atajo: 'Ctrl+X', deshabilitado: !hay, accion: () => ejecutar('cut') },
      { texto: 'Copiar', icono: <ContentCopyIcon fontSize="small" />, atajo: 'Ctrl+C', deshabilitado: !hay, accion: () => ejecutar('copy') },
      { texto: 'Pegar', icono: <ContentPasteIcon fontSize="small" />, atajo: 'Ctrl+V', deshabilitado: !hay, accion: () => void pegar() },
      SEPARADOR,
      { texto: 'Seleccionar todo', icono: <SelectAllIcon fontSize="small" />, atajo: 'Ctrl+A', deshabilitado: !hay, accion: puede((x) => x.chain().focus().selectAll().run()) },
      { texto: 'Buscar y reemplazar', icono: <FindReplaceIcon fontSize="small" />, atajo: 'Ctrl+H', deshabilitado: !hay, accion: h.alternarBuscar },
    ] },
    { clave: 'ver', titulo: 'Ver', items: [
      { texto: 'Modo', icono: <EditOutlinedIcon fontSize="small" />, hijos: modos },
      { texto: 'Zoom', icono: <ZoomInIcon fontSize="small" />, hijos: zooms, deshabilitado: angosta },
      SEPARADOR,
      { texto: angosta ? 'Secciones y notas' : estructuraVisible ? 'Ocultar el panel de estructura' : 'Mostrar el panel de estructura', icono: <ViewSidebarOutlinedIcon fontSize="small" />, accion: alEstructura },
      { texto: ocultas ? 'Mostrar los menús' : 'Ocultar los menús', icono: ocultas ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowUpIcon fontSize="small" />, accion: () => plegar(!ocultas) },
      { texto: document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa', icono: <FullscreenIcon fontSize="small" />, accion: () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.() } },
    ] },
    { clave: 'insertar', titulo: 'Insertar', items: [
      { texto: 'Imagen', icono: <ImageOutlinedIcon fontSize="small" />, deshabilitado: !imagen, accion: imagen ? () => document.querySelector<HTMLButtonElement>('[aria-label="Insertar fotografía"]')?.click() : undefined },
      { texto: 'Tabla (3 × 3)', icono: <TableChartIcon fontSize="small" />, deshabilitado: !hay || est?.tabla, accion: puede((x) => x.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()) },
      { texto: 'Enlace', icono: <InsertLinkIcon fontSize="small" />, deshabilitado: !hay, accion: puede((x) => void ponerEnlace(x)) },
      { texto: 'Nota al pie', icono: <NotesIcon fontSize="small" />, deshabilitado: !hay, accion: h.abrirNota },
      { texto: 'Comentario', icono: <AddCommentOutlinedIcon fontSize="small" />, deshabilitado: !alComentar, accion: alComentar },
      { texto: 'Referencia (documento o norma)', icono: <FormatQuoteIcon fontSize="small" />, atajo: '@', deshabilitado: !hay, accion: puede((x) => x.chain().focus().insertContent('@').run()) },
      SEPARADOR,
      { texto: 'Salto de página', icono: <InsertPageBreakIcon fontSize="small" />, deshabilitado: !hay, accion: puede((x) => x.chain().focus().insertarSaltoPagina().run()) },
      { texto: 'Fecha de hoy', icono: <EventOutlinedIcon fontSize="small" />, deshabilitado: !hay, accion: puede((x) => x.chain().focus().insertContent(fechaLarga(new Date().toISOString().slice(0, 10))).run()) },
    ] },
    { clave: 'formato', titulo: 'Formato', items: [
      { texto: 'Texto', icono: <TextFieldsIcon fontSize="small" />, hijos: [
        { texto: 'Negrita', icono: <FormatBoldIcon fontSize="small" />, atajo: 'Ctrl+B', activo: est?.negrita, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleBold().run()) },
        { texto: 'Cursiva', icono: <FormatItalicIcon fontSize="small" />, atajo: 'Ctrl+I', activo: est?.cursiva, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleItalic().run()) },
        { texto: 'Subrayado', icono: <FormatUnderlinedIcon fontSize="small" />, atajo: 'Ctrl+U', activo: est?.subrayado, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleUnderline().run()) },
        { texto: 'Tachado', icono: <StrikethroughSIcon fontSize="small" />, atajo: 'Ctrl+Shift+S', activo: est?.tachado, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleStrike().run()) },
        { texto: 'Superíndice (m², 1.º)', icono: <SuperscriptIcon fontSize="small" />, activo: est?.superindice, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleSuperscript().run()) },
        { texto: 'Subíndice (CO₂)', icono: <SubscriptIcon fontSize="small" />, activo: est?.subindice, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleSubscript().run()) },
        SEPARADOR,
        { texto: 'Color de texto', icono: <FormatColorTextIcon fontSize="small" />, hijos: colores },
        { texto: 'Resaltar (no sale al PDF)', icono: <BorderColorOutlinedIcon fontSize="small" />, atajo: 'Ctrl+Shift+H', activo: est?.resaltado, deshabilitado: !hay, accion: puede((x) => x.chain().focus().toggleResaltado().run()) },
      ] },
      { texto: 'Estilos de párrafo', icono: <TitleIcon fontSize="small" />, hijos: estilos },
      { texto: 'Alinear', icono: <FormatAlignLeftIcon fontSize="small" />, hijos: alineaciones },
      { texto: 'Interlineado (el del PDF)', icono: <FormatLineSpacingIcon fontSize="small" />, hijos: interlineados, deshabilitado: !formato },
      { texto: 'Tamaño de letra (el del PDF)', icono: <TextFieldsIcon fontSize="small" />, hijos: tamanos, deshabilitado: !formato },
      { texto: 'Listas', icono: <FormatListBulletedIcon fontSize="small" />, hijos: listas },
      { texto: 'Sangría', icono: <FormatIndentIncreaseIcon fontSize="small" />, hijos: [
        { texto: 'Adentrar', icono: <FormatIndentIncreaseIcon fontSize="small" />, atajo: 'Tab', deshabilitado: !hay, accion: puede((x) => x.chain().focus().ajustarSangria(1).run()) },
        { texto: 'Sacar', icono: <FormatIndentDecreaseIcon fontSize="small" />, atajo: 'Shift+Tab', deshabilitado: !hay, accion: puede((x) => x.chain().focus().ajustarSangria(-1).run()) },
        SEPARADOR,
        ...sangrias,
      ] },
      SEPARADOR,
      { texto: h.pincel ? 'Copiar formato: elija el texto que lo recibe' : 'Copiar formato', icono: <FormatPaintOutlinedIcon fontSize="small" />, activo: h.pincel, deshabilitado: !hay, accion: h.alternarPincel },
      { texto: 'Quitar formato', icono: <FormatClearIcon fontSize="small" />, deshabilitado: !hay, accion: puede((x) => x.chain().focus().unsetAllMarks().run()) },
    ] },
    { clave: 'herramientas', titulo: 'Herramientas', items: [
      { texto: 'Ortografía (corrector del navegador)', icono: <SpellcheckIcon fontSize="small" />, activo: ortografia, accion: () => { setOrtografia((v) => { try { localStorage.setItem('sgdp_ortografia', v ? 'no' : 'si') } catch { /* sin almacenamiento */ } return !v }) } },
      { texto: 'Contar palabras', icono: <TextFieldsIcon fontSize="small" />, deshabilitado: !hay, accion: () => setContar(true) },
      SEPARADOR,
      { texto: 'Sugerir cambios (modo sugerencias)', icono: <TrackChangesIcon fontSize="small" />, activo: modo === 'sugerir', deshabilitado: !hay, accion: () => ponerModo(modo === 'sugerir' ? 'edicion' : 'sugerir') },
      { texto: `Sugerencias pendientes${est?.cambios ? ` (${est.cambios})` : ''}`, icono: <RateReviewOutlinedIcon fontSize="small" />, deshabilitado: !hay, accion: h.abrirCambios },
      SEPARADOR,
      { texto: 'Ordenar texto pegado de Word', icono: <AutoFixHighIcon fontSize="small" />, deshabilitado: !est?.editable, accion: () => h.ordenar() },
      ...(herramientas.length ? [SEPARADOR, ...herramientas] : []),
    ] },
    { clave: 'ayuda', titulo: 'Ayuda', items: [
      { texto: 'Atajos de teclado', icono: <KeyboardIcon fontSize="small" />, accion: () => setAtajos(true) },
      { texto: 'Manual de uso', icono: <HelpOutlineIcon fontSize="small" />, accion: () => window.open('/manual', '_blank', 'noopener') },
    ] },
  ]
  const abrirMenu = (clave: string, e: MouseEvent<HTMLElement>) => setMenu({ clave, ancla: e.currentTarget })
  const menuAbierto = menus.find((m) => m.clave === menu?.clave)

  const sep = <Divider orientation="vertical" flexItem sx={{ mx: compacta ? 0.25 : 0.5, my: 0.75 }} />
  const estadoDoc = documento?.estado ?? ''
  const letraTamano = (formato?.tamano || '11').replace('.', ',')
  const iconoModo = modo === 'sugerir' ? <RateReviewOutlinedIcon fontSize="small" /> : modo === 'vista' ? <VisibilityOutlinedIcon fontSize="small" /> : <EditOutlinedIcon fontSize="small" />
  const nombreModo = modo === 'sugerir' ? 'Sugerencias' : modo === 'vista' ? 'Vista' : 'Edición'

  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      {!ocultas && (
        <>
          {/* 1. El título del documento activo, con historial, comentarios y compartir. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, md: 1.25 }, px: { xs: 1, md: 1.5 }, pt: { xs: 0.75, md: 1 } }}>
            <Box sx={{ color: 'text.primary', display: 'flex', flexShrink: 0 }}>{icono ?? <DescriptionOutlinedIcon sx={{ fontSize: { xs: 28, md: 36 } }} />}</Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap component="h2" sx={{ fontSize: { xs: 15.5, md: 18 }, fontWeight: 400, lineHeight: 1.25, color: documento ? 'text.primary' : 'text.secondary' }}>
                {documento ? documento.titulo : 'Sin documento activo'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, mt: 0.25 }}>
                {documento?.rotulo && !angosta && <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>{documento.rotulo}</Typography>}
                {estadoDoc && <Chip size="small" label={ETIQUETA_ESTADO[estadoDoc] ?? estadoDoc} sx={{ height: 18, fontSize: 10.5, ...sxEstado(estadoDoc) }} />}
                {documento && !documento.cargando && (
                  <Typography variant="caption" noWrap sx={{ color: documento.sucio ? 'warning.main' : 'text.secondary' }}>
                    {documento.sucio ? 'Sin guardar' : 'Guardado'}{hay && !angosta ? ` · ${palabras.toLocaleString('es-PE')} palabra${palabras === 1 ? '' : 's'}` : ''}
                  </Typography>
                )}
              </Box>
            </Box>
            {alHistorial && (
              <Tooltip title="Historial y versiones" disableInteractive>
                <IconButton size={angosta ? 'small' : 'medium'} onClick={alHistorial} aria-label="Historial y versiones"><HistoryIcon /></IconButton>
              </Tooltip>
            )}
            {alComentar && (
              <Tooltip title="Comentarios" disableInteractive>
                <IconButton size={angosta ? 'small' : 'medium'} onClick={alComentar} aria-label="Comentarios"><ModeCommentOutlinedIcon /></IconButton>
              </Tooltip>
            )}
            <Tooltip title="Copiar el enlace para compartirlo con el equipo" disableInteractive>
              <Button variant="contained" size={angosta ? 'small' : 'medium'} startIcon={angosta ? undefined : <LinkIcon />} onClick={() => void compartir()} aria-label="Compartir" sx={{ borderRadius: 20, px: angosta ? 1.25 : 2, minWidth: 0, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {angosta ? <LinkIcon fontSize="small" /> : 'Compartir'}
              </Button>
            </Tooltip>
          </Box>
          {/* 2. La fila de menús, alineada con el título. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, pl: { xs: 0.5, md: 6.25 }, pr: 1, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            {menus.map((m) => (
              <Button key={m.clave} size="small" color="inherit" onClick={(e) => abrirMenu(m.clave, e)} sx={{ minWidth: 0, px: 1, py: 0.25, textTransform: 'none', fontWeight: 400, fontSize: 14, borderRadius: 1, color: 'text.primary', bgcolor: menu?.clave === m.clave ? 'action.selected' : undefined, whiteSpace: 'nowrap' }}>
                {m.titulo}
              </Button>
            ))}
          </Box>
          {menuAbierto && <MenuAnidado ancla={menu?.ancla ?? null} items={menuAbierto.items} alCerrar={() => setMenu(null)} titulo={menuAbierto.titulo} />}
        </>
      )}
      {/* 3. La píldora de herramientas. */}
      <Box ref={pildora} sx={{ mx: { xs: 1, md: 1.5 }, my: { xs: 0.75, md: 1 }, px: 1, py: 0.25, borderRadius: 24, bgcolor: PALETA.superficieMedia, display: 'flex', alignItems: 'center', gap: compacta ? 0 : 0.25, overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, '& > *': { flexShrink: 0 } }}>
        <Box ref={buscarRef as never} sx={{ display: 'flex' }}><BuscarMenus menus={menus} angosta={compacta} /></Box>
        {sep}
        <Boton icono={<UndoIcon fontSize="small" />} etiqueta="Deshacer (Ctrl+Z)" accion={puede((x) => x.chain().focus().undo().run())} deshabilitado={!est?.deshacer} />
        <Boton icono={<RedoIcon fontSize="small" />} etiqueta="Rehacer (Ctrl+Y)" accion={puede((x) => x.chain().focus().redo().run())} deshabilitado={!est?.rehacer} />
        <Boton icono={<PrintOutlinedIcon fontSize="small" />} etiqueta="Imprimir: el PDF tal como sale del sistema" accion={() => alImprimir?.()} deshabilitado={!alImprimir} />
        <Boton icono={<SpellcheckIcon fontSize="small" />} activo={ortografia} etiqueta={ortografia ? 'Ortografía: encendida (el corrector del navegador subraya lo dudoso)' : 'Ortografía: apagada'} accion={() => setOrtografia((v) => { try { localStorage.setItem('sgdp_ortografia', v ? 'no' : 'si') } catch { /* sin almacenamiento */ } return !v })} />
        <Boton icono={<FormatPaintOutlinedIcon fontSize="small" />} activo={h.pincel} etiqueta={h.pincel ? 'Copiar formato: seleccione el texto que lo recibirá' : 'Copiar formato'} accion={h.alternarPincel} deshabilitado={!hay} />
        {!angosta && (
          <>
            {sep}
            <Desplegable etiqueta={`${zoom} %`} titulo="Zoom" items={zooms} ancho={compacta ? 0 : 78} />
          </>
        )}
        {sep}
        <Desplegable etiqueta={ESTILOS_PARRAFO.find((e) => e.clave === extra?.estilo)?.etiqueta ?? 'Normal'} titulo="Estilo de párrafo" items={estilos} deshabilitado={!hay} ancho={compacta ? 0 : 150} />
        {sep}
        {!compacta && <Desplegable etiqueta="Letra oficial" titulo="La letra la fija la plantilla oficial de cada documento (el PDF); aquí se ve en una serif parecida" items={[{ texto: 'La letra del PDF la fija la plantilla oficial del tipo de documento. En pantalla se ve en una serif parecida.' }]} ancho={118} />}
        <Tooltip title={formato ? 'Tamaño de letra del documento (el del PDF)' : 'El tamaño lo fija la plantilla de esta parte'} disableInteractive>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton size="small" aria-label="Letra más chica" disabled={!formato} onClick={() => formato && formato.alTamano(pasoTamano(formato.tamano, -1) === '11' ? '' : pasoTamano(formato.tamano, -1))} sx={{ p: 0.5 }}><RemoveIcon fontSize="small" /></IconButton>
            <Desplegable etiqueta={formato ? letraTamano : '—'} titulo="Tamaño de letra (el del PDF)" items={tamanos} deshabilitado={!formato} ancho={compacta ? 0 : 56} />
            <IconButton size="small" aria-label="Letra más grande" disabled={!formato} onClick={() => formato && formato.alTamano(pasoTamano(formato.tamano, 1) === '11' ? '' : pasoTamano(formato.tamano, 1))} sx={{ p: 0.5 }}><AddIcon fontSize="small" /></IconButton>
          </Box>
        </Tooltip>
        {sep}
        <Boton icono={<FormatBoldIcon fontSize="small" />} activo={est?.negrita} etiqueta="Negrita (Ctrl+B)" accion={puede((x) => x.chain().focus().toggleBold().run())} deshabilitado={!hay} />
        <Boton icono={<FormatItalicIcon fontSize="small" />} activo={est?.cursiva} etiqueta="Cursiva (Ctrl+I)" accion={puede((x) => x.chain().focus().toggleItalic().run())} deshabilitado={!hay} />
        <Boton icono={<FormatUnderlinedIcon fontSize="small" />} activo={est?.subrayado} etiqueta="Subrayado (Ctrl+U)" accion={puede((x) => x.chain().focus().toggleUnderline().run())} deshabilitado={!hay} />
        <Tooltip title="Color de texto (sale al PDF y al Word)" disableInteractive>
          <span>
            <IconButton size="small" aria-label="Color de texto" disabled={!hay} onClick={(e) => setColorAncla(e.currentTarget)} sx={{ p: 0.5, position: 'relative' }}>
              <FormatColorTextIcon fontSize="small" />
              <Box sx={{ position: 'absolute', left: 6, right: 6, bottom: 3, height: 3, borderRadius: 1, bgcolor: extra?.color ? `#${extra.color}` : PALETA.texto }} />
            </IconButton>
          </span>
        </Tooltip>
        <Popover open={colorAncla !== null} anchorEl={colorAncla} onClose={() => setColorAncla(null)} slotProps={{ paper: { sx: { p: 1 } } }}>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>Color de texto</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 28px)', gap: 0.5 }}>
            {COLORES_TEXTO.map((c) => (
              <Tooltip key={c.hex} title={c.nombre} disableInteractive>
                <IconButton size="small" aria-label={c.nombre} onClick={() => { ed?.chain().focus().ponerColorTexto(c.hex).run(); setColorAncla(null) }} sx={{ p: 0.25 }}>
                  <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: `#${c.hex}`, outline: extra?.color === c.hex ? `2px solid ${PALETA.primario}` : `1px solid ${PALETA.bordeFuerte}`, outlineOffset: 1 }} />
                </IconButton>
              </Tooltip>
            ))}
          </Box>
          <Button size="small" fullWidth onClick={() => { ed?.chain().focus().ponerColorTexto(null).run(); setColorAncla(null) }} sx={{ mt: 0.75, textTransform: 'none' }}>Automático</Button>
        </Popover>
        <Boton icono={<BorderColorOutlinedIcon fontSize="small" />} activo={est?.resaltado} etiqueta="Resaltar (Ctrl+Shift+H): ayuda de revisión; no sale al PDF" accion={puede((x) => x.chain().focus().toggleResaltado().run())} deshabilitado={!hay} />
        {sep}
        <Boton icono={<InsertLinkIcon fontSize="small" />} activo={est?.enlace} etiqueta="Enlace" accion={puede((x) => void ponerEnlace(x))} deshabilitado={!hay} />
        <Boton icono={<AddCommentOutlinedIcon fontSize="small" />} etiqueta="Comentar (seleccione un tramo para anclarlo)" accion={() => alComentar?.()} deshabilitado={!alComentar} />
        {imagen ?? <Boton icono={<ImageOutlinedIcon fontSize="small" />} etiqueta="Las fotografías van en los proyectos de ley; un oficio lleva sus anexos como archivos" accion={() => {}} deshabilitado />}
        <Boton icono={<FormatQuoteIcon fontSize="small" />} etiqueta="Citar un documento o una norma (escriba @ o «Ley…»)" accion={puede((x) => x.chain().focus().insertContent('@').run())} deshabilitado={!hay} />
        {sep}
        <Desplegable icono={ICONO_ALINEACION[est?.alineacion ?? 'justify']} titulo="Alinear" items={alineaciones} deshabilitado={!hay} />
        <Desplegable icono={<FormatLineSpacingIcon fontSize="small" />} titulo={formato ? 'Interlineado (el del PDF) y tipo de sangría' : 'Tipo de sangría (el interlineado lo fija la plantilla)'} items={[...interlineados, SEPARADOR, ...sangrias]} deshabilitado={!hay} />
        <Boton icono={<FormatListBulletedIcon fontSize="small" />} activo={est?.vinetas} etiqueta="Viñetas" accion={puede((x) => x.chain().focus().toggleBulletList().run())} deshabilitado={!hay} />
        <Desplegable icono={<FormatListNumberedIcon fontSize="small" />} titulo="Lista numerada: 1. · a) · i)" items={listas.slice(1)} deshabilitado={!hay} />
        <Boton icono={<FormatIndentDecreaseIcon fontSize="small" />} etiqueta="Sacar sangría (Shift+Tab)" accion={puede((x) => x.chain().focus().ajustarSangria(-1).run())} deshabilitado={!hay} />
        <Boton icono={<FormatIndentIncreaseIcon fontSize="small" />} activo={est?.sangria} etiqueta="Adentrar sangría (Tab)" accion={puede((x) => x.chain().focus().ajustarSangria(1).run())} deshabilitado={!hay} />
        <Boton icono={<FormatClearIcon fontSize="small" />} etiqueta="Quitar formato" accion={puede((x) => x.chain().focus().unsetAllMarks().run())} deshabilitado={!hay} />
        <Box sx={{ flex: '1 1 8px', minWidth: 8 }} />
        {est && (est.cambios > 0) && (
          <Tooltip title="Sugerencias pendientes: aceptar o rechazar" disableInteractive>
            <Button size="small" color="primary" startIcon={<RateReviewOutlinedIcon fontSize="small" />} onClick={h.abrirCambios} sx={{ minWidth: 0, px: 0.75, textTransform: 'none', whiteSpace: 'nowrap' }}>{est.cambios}</Button>
          </Tooltip>
        )}
        <Tooltip title="Modo: Edición, Sugerencias (lo escrito queda para aceptar o rechazar) o Vista (solo lectura)" disableInteractive>
          <span>
            <Button size="small" color="inherit" disabled={!hay} onClick={(e) => setModoAncla(e.currentTarget)} startIcon={iconoModo} endIcon={<ArrowDropDownIcon fontSize="small" />} aria-label="Modo" sx={{ textTransform: 'none', fontWeight: 400, fontSize: 13.5, color: modo === 'sugerir' ? PALETA.exito : 'text.primary', bgcolor: 'background.paper', borderRadius: 20, px: 1.25, py: 0.25, whiteSpace: 'nowrap', '& .MuiButton-startIcon': { mr: compacta ? 0 : 0.5 } }}>
              {!compacta && nombreModo}
            </Button>
          </span>
        </Tooltip>
        <MenuAnidado ancla={modoAncla} items={modos} alCerrar={() => setModoAncla(null)} />
        <Tooltip title={ocultas ? 'Mostrar el título y los menús' : 'Ocultar el título y los menús'} disableInteractive>
          <IconButton size="small" onClick={() => plegar(!ocultas)} aria-label={ocultas ? 'Mostrar los menús' : 'Ocultar los menús'} sx={{ p: 0.5 }}>
            {ocultas ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowUpIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      {h.avisoWord && <Box sx={{ px: { xs: 1, md: 1.5 }, pb: 1 }}>{h.avisoWord}</Box>}
      <Box sx={{ px: { xs: 1, md: 1.5 } }}>{h.dialogos}</Box>
      <Dialog open={contar} onClose={() => setContar(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Contar palabras</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">Palabras: <b>{palabras.toLocaleString('es-PE')}</b></Typography>
          <Typography variant="body2">Caracteres: <b>{(extra?.caracteres ?? 0).toLocaleString('es-PE')}</b></Typography>
          <Typography variant="caption" color="text.secondary">Las notas al pie no cuentan. Es la sección activa.</Typography>
        </DialogContent>
        <DialogActions><Button onClick={() => setContar(false)}>Cerrar</Button></DialogActions>
      </Dialog>
      <Dialog open={atajos} onClose={() => setAtajos(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Atajos de teclado</DialogTitle>
        <DialogContent dividers>
          {ATAJOS.map(([teclas, que]) => (
            <Box key={teclas} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{teclas}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>{que}</Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setAtajos(false)}>Cerrar</Button></DialogActions>
      </Dialog>
      <Snackbar open={nota !== null} autoHideDuration={5000} onClose={() => setNota(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="info" onClose={() => setNota(null)}>{nota}</Alert>
      </Snackbar>
    </Box>
  )
}

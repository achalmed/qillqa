import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow } from '@tiptap/extension-table'
import type { Content, Editor } from '@tiptap/core'
import { CeldaAlineada, CabeceraAlineada } from '../extensiones/TablaAlineada'
import { SangriaParrafo } from '../extensiones/SangriaParrafo'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import TableChartIcon from '@mui/icons-material/TableChart'
import { PALETA } from '../paleta'

// Tiptap 3: el subrayado viene en el kit; sin enlace ni nodo final, como en
// la v2. Configuradas una vez: useEditor compara las extensiones por identidad.
const KitAnexo = StarterKit.configure({ link: false, trailingNode: false })
const TablaAnexo = Table.configure({ resizable: false })

// Un anexo compuesto del formulario: título + un doc TipTap (cuadros/
// tablas/texto). El generador emite cada uno como página «ANEXO» tras la
// firma. `cuerpo` es null cuando el editor está vacío (no se imprime).
export interface AnexoData {
  titulo: string
  cuerpo: object | null
}

// El padre (EditorDocumento) jala los anexos al guardar vía esta ref.
export interface AnexosEditorHandle {
  recolectar: () => AnexoData[]
}

type BotonFormato = (
  icono: React.ReactNode,
  activo: boolean,
  accion: () => void,
  etiqueta: string,
) => React.ReactNode

type AbrirMenuTabla = (ed: Editor | null) => (e: React.MouseEvent) => void

// Lee los anexos guardados en los campos. Fuente NUEVA: campos.anexos
// (JSON de lista [{titulo, cuerpo}]). Fuente HEREDADA (anexo único):
// anexo_titulo + anexo_cuerpo. Devuelve [] si no hay nada válido.
function parseDoc(v: unknown): object | null {
  if (v && typeof v === 'object') return v as object
  if (typeof v === 'string' && v.trim()) {
    try {
      const d = JSON.parse(v)
      return d && typeof d === 'object' ? d : null
    } catch {
      return null
    }
  }
  return null
}

export function parsearAnexos(campos: Record<string, string>): AnexoData[] {
  const crudo = (campos.anexos ?? '').trim()
  if (crudo) {
    try {
      const arr = JSON.parse(crudo)
      if (Array.isArray(arr)) {
        return arr
          .filter((x) => x && typeof x === 'object')
          .map((x) => ({
            titulo: typeof x.titulo === 'string' ? x.titulo : '',
            cuerpo: parseDoc(x.cuerpo),
          }))
          .filter((a) => a.cuerpo != null)
      }
    } catch {
      /* anexos corruptos: se ignoran */
    }
  }
  // Heredado: un solo anexo (docs anteriores a esta mejora).
  const uno = parseDoc(campos.anexo_cuerpo)
  if (uno) return [{ titulo: campos.anexo_titulo ?? '', cuerpo: uno }]
  return []
}

interface UnAnexoHandle {
  getData: () => AnexoData
}

// Estilos de la tabla dentro del editor (extremo a extremo, como el PDF).
const sxTabla = {
  p: 2,
  minHeight: 120,
  '& .ProseMirror': { outline: 'none', minHeight: 100 },
  '& .ProseMirror table': { borderCollapse: 'collapse', width: '100%', my: 1 },
  '& .ProseMirror td, & .ProseMirror th': {
    border: '1px solid',
    borderColor: 'divider',
    p: '4px 8px',
    verticalAlign: 'top',
  },
  '& .ProseMirror th': { bgcolor: PALETA.superficieMedia, fontWeight: 600 },
} as const

// ---------------------------------------------------------------------
// UN anexo: su propio editor TipTap + campo de título. Expone getData().
// ---------------------------------------------------------------------
const UnAnexo = forwardRef<
  UnAnexoHandle,
  {
    indice: number
    inicialTitulo: string
    inicialCuerpo: object | null
    abrirMenuTabla: AbrirMenuTabla
    botonFormato: BotonFormato
    alQuitar: () => void
  }
>(function UnAnexo(
  { indice, inicialTitulo, inicialCuerpo, abrirMenuTabla, botonFormato, alQuitar },
  ref,
) {
  const [titulo, setTitulo] = useState(inicialTitulo)
  const editor = useEditor({
    extensions: [
      KitAnexo,
      TablaAnexo,
      TableRow,
      CabeceraAlineada,
      CeldaAlineada,
      SangriaParrafo,
    ],
    content: (inicialCuerpo ?? undefined) as Content,
    shouldRerenderOnTransaction: true,
  })

  useImperativeHandle(
    ref,
    () => ({
      getData: () => ({
        titulo: titulo.trim(),
        // Vacío -> null (el padre lo descarta y no se emite página ANEXO).
        cuerpo: editor && editor.getText().trim() !== '' ? editor.getJSON() : null,
      }),
    }),
    [titulo, editor],
  )

  return (
    <Paper variant="outlined" sx={{ overflow: 'visible', mb: 1.5, p: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
        <TextField
          size="small"
          fullWidth
          label={`Título del anexo ${indice + 1}`}
          placeholder={`ANEXO ${indice + 1} — Relación de participantes`}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <Tooltip title="Quitar anexo">
          <IconButton
            size="small"
            onClick={alQuitar}
            aria-label={`Quitar anexo ${indice + 1}`}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
        {botonFormato(
          <FormatBoldIcon fontSize="small" />,
          editor?.isActive('bold') ?? false,
          () => editor?.chain().focus().toggleBold().run(),
          'Negrita',
        )}
        {botonFormato(
          <FormatListNumberedIcon fontSize="small" />,
          editor?.isActive('orderedList') ?? false,
          () => editor?.chain().focus().toggleOrderedList().run(),
          'Numeración',
        )}
        {botonFormato(
          <TableChartIcon fontSize="small" />,
          editor?.isActive('table') ?? false,
          () =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          'Insertar tabla',
        )}
      </Box>
      <Divider sx={{ mb: 1 }} />
      <Box sx={sxTabla} onClick={() => editor?.chain().focus().run()} onContextMenu={abrirMenuTabla(editor)}>
        <EditorContent editor={editor} />
      </Box>
    </Paper>
  )
})

// ---------------------------------------------------------------------
// Lista de anexos con «Agregar anexo». Expone recolectar() para que el
// padre serialice todos al guardar. Se REMONTA (key por documento) para
// re-inicializar desde `inicial` al cargar otro documento.
// ---------------------------------------------------------------------
const AnexosEditor = forwardRef<
  AnexosEditorHandle,
  {
    inicial: AnexoData[]
    abrirMenuTabla: AbrirMenuTabla
    botonFormato: BotonFormato
  }
>(function AnexosEditor({ inicial, abrirMenuTabla, botonFormato }, ref) {
  const siguienteId = useRef(1)
  const [filas, setFilas] = useState<{ id: number; titulo: string; cuerpo: object | null }[]>(
    () => inicial.map((a) => ({ id: siguienteId.current++, titulo: a.titulo, cuerpo: a.cuerpo })),
  )

  // Refs a los hijos, cacheadas por id para no re-registrar en cada render.
  const hijos = useRef(new Map<number, UnAnexoHandle>())
  const cacheRef = useRef(new Map<number, (h: UnAnexoHandle | null) => void>())
  const refHijo = (id: number) => {
    let fn = cacheRef.current.get(id)
    if (!fn) {
      fn = (h: UnAnexoHandle | null) => {
        if (h) hijos.current.set(id, h)
        else hijos.current.delete(id)
      }
      cacheRef.current.set(id, fn)
    }
    return fn
  }

  useImperativeHandle(
    ref,
    () => ({
      recolectar: () =>
        filas
          .map((f) => hijos.current.get(f.id)?.getData())
          .filter((d): d is AnexoData => !!d && d.cuerpo != null),
    }),
    [filas],
  )

  const agregar = () =>
    setFilas((fs) => [...fs, { id: siguienteId.current++, titulo: '', cuerpo: null }])
  const quitar = (id: number) => {
    cacheRef.current.delete(id)
    hijos.current.delete(id)
    setFilas((fs) => fs.filter((f) => f.id !== id))
  }

  return (
    <Box>
      {filas.map((f, i) => (
        <UnAnexo
          key={f.id}
          ref={refHijo(f.id)}
          indice={i}
          inicialTitulo={f.titulo}
          inicialCuerpo={f.cuerpo}
          abrirMenuTabla={abrirMenuTabla}
          botonFormato={botonFormato}
          alQuitar={() => quitar(f.id)}
        />
      ))}
      {filas.length === 0 && (
        // 2026-10-06: estado vacío breve (el botón «Agregar anexo» está debajo).
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Sin anexos.
        </Typography>
      )}
      <Button size="small" startIcon={<AddIcon />} onClick={agregar}>
        Agregar anexo
      </Button>
    </Box>
  )
})

export default AnexosEditor

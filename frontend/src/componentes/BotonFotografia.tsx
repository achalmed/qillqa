// BotonFotografia — «Fotografía» en la barra de una parte del proyecto (2026-10-05).
//
// Sube la imagen al servidor (`POST /api/proyectos/{pid}/imagenes`), pide el título
// y la fuente, e inserta el nodo `fotografia` donde está el cursor. Con una
// fotografía seleccionada, edita su título y su fuente sin volver a subirla.
//
// «Elegir de la Fototeca» (2026-10-06): la foto se exporta con sus ajustes (tamaño
// «documento», JPG) y entra por el MISMO camino de subida, así que el nodo y el PDF
// no distinguen su origen; la Fototeca anota que se usó en este proyecto.
import { useRef, useState } from 'react'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import UploadIcon from '@mui/icons-material/Upload'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'
import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { api, descargarBlob, subirArchivo } from '../api'
import Selector from './fototeca/Selector'
import type { Foto } from './fototeca/modelo'
import { pedirTexto } from './Dialogos'

interface Props {
  editor: Editor
  pid: number
  alAvisar: (tipo: 'success' | 'error' | 'info', t: string) => void
  /** Solo el icono (la píldora del Formato Word, 2026-10-19); el menú y los diálogos son los mismos. */
  soloIcono?: boolean
}

export default function BotonFotografia({ editor, pid, alAvisar, soloIcono = false }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [fototeca, setFototeca] = useState(false)

  async function pedirTextos(titulo: string, fuente: string) {
    const t = await pedirTexto('Título de la fotografía (va debajo de «FOTOGRAFÍA — N° …»):', { inicial: titulo, etiqueta: 'Título' })
    if (t === null) return null
    const f = await pedirTexto('Fuente de la fotografía (va en nota al pie; puede quedar vacía):', { inicial: fuente, etiqueta: 'Fuente' })
    if (f === null) return null
    return { titulo: t.trim(), fuente: f.trim() }
  }

  async function alPulsar(e: React.MouseEvent<HTMLElement>) {
    const { selection } = editor.state
    const nodo = selection instanceof NodeSelection ? selection.node : null
    if (nodo?.type.name === 'fotografia') {
      const pos = selection.from
      const textos = await pedirTextos(nodo.attrs.titulo as string, nodo.attrs.fuente as string)
      if (textos) editor.chain().focus().setNodeSelection(pos).updateAttributes('fotografia', textos).run()
      return
    }
    setMenu(e.currentTarget)
  }

  async function desdeFototeca(fotos: Foto[]) {
    const foto = fotos[0]
    if (!foto) return
    setFototeca(false)
    const textos = await pedirTextos(foto.descripcion || foto.titulo, '')
    if (!textos) return
    setSubiendo(true)
    try {
      const blob = await descargarBlob(`/api/fototeca/${foto.id}/exportar?preset=documento&formato=jpg`)
      const archivo = new File([blob], `fototeca-${foto.id}.jpg`, { type: 'image/jpeg' })
      await insertar(archivo, textos)
      // Que la Fototeca sepa dónde se usó (si falla, la foto ya está en el texto).
      void api(`/api/fototeca/${foto.id}/vincular`, { method: 'POST', body: JSON.stringify({ tipo: 'proyecto', id: pid }) }).catch(() => {})
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo traer la foto de la Fototeca.')
    } finally {
      setSubiendo(false)
    }
  }

  async function insertar(archivo: File, textos: { titulo: string; fuente: string }) {
    const datos = new FormData()
    datos.append('archivo', archivo)
    const r = await subirArchivo<{ archivo: string; url: string }>(`/api/proyectos/${pid}/imagenes`, datos)
    editor.chain().focus().insertarFotografia({ archivo: r.archivo, src: r.url, ...textos }).run()
    alAvisar('success', 'Fotografía insertada.')
  }

  async function alElegir(archivo: File | undefined) {
    if (!archivo) return
    const textos = await pedirTextos('', '')
    if (!textos) return
    setSubiendo(true)
    try {
      await insertar(archivo, textos)
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo subir la fotografía.')
    } finally {
      setSubiendo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <>
      <Tooltip title={subiendo ? 'Subiendo la fotografía…' : 'Insertar fotografía con título y fuente.'} disableInteractive>
        <span>
          {soloIcono ? (
            <IconButton size="small" aria-label="Insertar fotografía" disabled={subiendo} onClick={(e) => void alPulsar(e)} sx={{ p: 0.5 }}>
              <AddPhotoAlternateOutlinedIcon fontSize="small" />
            </IconButton>
          ) : (
            <Button size="small" startIcon={<AddPhotoAlternateOutlinedIcon />} disabled={subiendo} onClick={(e) => void alPulsar(e)}>
              {subiendo ? 'Subiendo…' : 'Fotografía'}
            </Button>
          )}
        </span>
      </Tooltip>
      <input ref={entrada} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => void alElegir(e.target.files?.[0])} />
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setMenu(null); entrada.current?.click() }}>
          <ListItemIcon><UploadIcon fontSize="small" /></ListItemIcon>
          Subir desde el equipo
        </MenuItem>
        <MenuItem onClick={() => { setMenu(null); setFototeca(true) }}>
          <ListItemIcon><PhotoLibraryOutlinedIcon fontSize="small" /></ListItemIcon>
          Elegir de la Fototeca
        </MenuItem>
      </Menu>
      <Selector abierto={fototeca} accion="Insertar" alCerrar={() => setFototeca(false)} alElegir={desdeFototeca} />
    </>
  )
}

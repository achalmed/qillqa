/**
 * Botón «Copiar»: el documento al portapapeles, listo para pegar (Edison
 * 2026-09-08). Un clic, Ctrl+V en WhatsApp, Word o el correo, y ahí está el
 * oficio — sin descargar, sin abrir carpetas.
 *
 * Se copia como IMAGEN porque es lo único que el portapapeles del navegador
 * admite además de texto (ver copiar.ts). La imagen la rasteriza el servidor
 * desde el PDF vigente de la carpeta, no es una captura de pantalla.
 *
 * Si el documento tiene varias páginas, tras la primera copia el botón ofrece
 * elegir cuál copiar: el total lo dice el servidor al copiar, así que no hace
 * falta ninguna consulta extra.
 */
import { useState } from 'react'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'

import { copiarArchivoImagen, copiarPaginaComoImagen, puedeCopiarImagenes } from '../copiar'

type Avisar = (tipo: 'success' | 'error', texto: string) => void

export default function BotonCopiar({
  documentoId,
  /** Qué archivo del documento: 'documento' | 'expediente' | id del adjunto. */
  archivo,
  /** El archivo ya es una imagen (escaneo): se copia tal cual, sin rasterizar. */
  esImagen = false,
  /** Nombre de lo que se copia, para el aviso y la ayuda. */
  que = 'el documento',
  alAvisar,
}: {
  documentoId: string
  archivo: string
  esImagen?: boolean
  que?: string
  alAvisar?: Avisar
}) {
  const [ocupado, setOcupado] = useState(false)
  const [total, setTotal] = useState(1)
  const [menu, setMenu] = useState<HTMLElement | null>(null)

  const copiar = async (pagina: number) => {
    setMenu(null)
    setOcupado(true)
    try {
      const n = esImagen
        ? await copiarArchivoImagen(`/api/documentos/${documentoId}/adjuntos/${archivo}`)
        : await copiarPaginaComoImagen(
            `/api/documentos/${documentoId}/imagen?archivo=${archivo}&pagina=${pagina}`,
          )
      setTotal(n)
      alAvisar?.(
        'success',
        n > 1
          ? `Copiado: ${que}, página ${pagina} de ${n}. Pegue con Ctrl+V (o «Pegar»).`
          : `Copiado: ${que}. Pegue con Ctrl+V (o «Pegar») donde lo necesite.`,
      )
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo copiar.')
    } finally {
      setOcupado(false)
    }
  }

  if (!puedeCopiarImagenes()) return null

  const ayuda =
    total > 1
      ? `Copiar ${que} (${total} páginas) para pegarlo en WhatsApp, Word, un correo…`
      : `Copiar ${que} para pegarlo en WhatsApp, Word, un correo…`

  return (
    <>
      <Tooltip title={ayuda}>
        <span>
          <IconButton
            size="small"
            disabled={ocupado}
            aria-label="Copiar el documento para pegarlo"
            onClick={(e) => (total > 1 ? setMenu(e.currentTarget) : void copiar(1))}
          >
            {ocupado ? <CircularProgress size={16} /> : <ContentCopyOutlinedIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        {Array.from({ length: total }, (_, i) => (
          <MenuItem key={i} dense onClick={() => void copiar(i + 1)}>
            Copiar página {i + 1} de {total}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

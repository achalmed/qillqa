/**
 * VISOR DE UN PDF dentro de la página (Edison 2026-10-01: «la vista previa de
 * los informes debe ser en la parte derecha, dentro del mismo sistema, no en
 * otra ventana»). El mismo patrón que VisorDocumento: el PDF se pide con la
 * sesión (apiPdf → URL local) y se muestra en un <object>; cada `version`
 * nueva lo vuelve a pedir, y la URL anterior se libera.
 *
 * Fase 5 (2026-10-08): el botón ⤢ (y «Abrir PDF» en el celular) abre el mismo
 * PDF en el visor completo (VisorAvanzado: miniaturas, zoom, búsqueda).
 *
 * 2026-10-08 (Edison: «lo que se mejora en Documentos aplica a Semana de representación y
 * Proyectos de ley»): la misma barra que VisorDocumento —Copiar como imagen, visor completo y
 * Descargar— y, con `archivos`, la lista de archivos del visor completo al estilo de Outlook.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Button from '@mui/material/Button'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import DownloadIcon from '@mui/icons-material/Download'
import CircularProgress from '@mui/material/CircularProgress'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import { apiPdf, descargarArchivo } from '../api'
import { copiarPdfLocalComoImagen, puedeCopiarImagenes } from '../copiar'
import VisorAvanzado from './VisorAvanzado'
import type { ArchivoVisor } from './PanelArchivosVisor'
import { pdfEnLinea } from './visorPdfjs'
import { PALETA } from '../paleta'

// `pdfEnLinea` vive en visorPdfjs.ts (lo usa también el visor completo); se
// reexporta aquí porque el resto del sistema lo importa de este archivo.
export { pdfEnLinea }

export default function VisorPdf({
  ruta,
  version = 0,
  cargando = false,
  vacio,
  alto = '100%',
  nombre = 'documento.pdf',
  archivos,
  claveInicial,
}: {
  /** Ruta de la API que entrega el PDF; vacía = no hay nada que mostrar. */
  ruta: string
  /** Cambiarla obliga a volver a pedirlo (tras una vista previa nueva). */
  version?: number | string
  /** El PDF se está preparando (compilación en curso). */
  cargando?: boolean
  /** Qué mostrar cuando aún no hay PDF. */
  vacio?: React.ReactNode
  alto?: string | number
  /** Nombre del archivo al descargarlo. */
  nombre?: string
  /** Los demás archivos del módulo, para la lista del visor completo (como Outlook). */
  archivos?: ArchivoVisor[]
  claveInicial?: string
}) {
  const enLinea = pdfEnLinea()
  const [url, setUrl] = useState('')
  const [fallo, setFallo] = useState(false)
  const [completo, setCompleto] = useState(false)
  const [copia, setCopia] = useState<'' | 'copiando' | 'copiado' | string>('')
  const copiar = () => {
    setCopia('copiando')
    copiarPdfLocalComoImagen(url)
      .then(() => setCopia('copiado'))
      .catch((e) => setCopia(e instanceof Error ? e.message : 'No se pudo copiar.'))
      .finally(() => setTimeout(() => setCopia(''), 2500))
  }
  useEffect(() => {
    setFallo(false)
    if (!ruta) {
      setUrl('')
      return
    }
    let vivo = true
    let propia = ''
    apiPdf(ruta)
      .then((u) => {
        propia = u
        if (vivo) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => vivo && (setUrl(''), setFallo(true)))
    return () => {
      vivo = false
      if (propia) URL.revokeObjectURL(propia)
    }
  }, [ruta, version])

  return (
    <Box sx={{ position: 'relative', height: alto, minHeight: 360, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: PALETA.superficieMedia, overflow: 'hidden' }}>
      {cargando && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }} />}
      {url && !enLinea ? (
        // Celular: el <object> sale en blanco; el visor completo (pdf.js) sí
        // funciona en el teléfono (fase 5, 2026-10-08).
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, p: 3, textAlign: 'center' }}>
          <PictureAsPdfOutlinedIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.8 }} />
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
            Ábralo en el visor o descárguelo.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="contained" startIcon={<OpenInFullIcon />} onClick={() => setCompleto(true)}>Abrir PDF</Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => void descargarArchivo(ruta, nombre || '').catch(() => undefined)}>Descargar</Button>
          </Box>
        </Box>
      ) : url ? (
        <>
          {/* La barra de VisorDocumento: copiar, visor completo y descargar. */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25, px: 0.75, py: 0.25, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0, pl: 0.5 }}>{nombre}</Typography>
            {puedeCopiarImagenes() && (
              <Tooltip title={copia === 'copiado' ? 'Copiado: pegue con Ctrl+V' : copia && copia !== 'copiando' ? copia : 'Copiar la primera página como imagen (WhatsApp, Word, correo…)'} open={copia !== '' && copia !== 'copiando' ? true : undefined}>
                <span>
                  <IconButton size="small" onClick={copiar} disabled={copia === 'copiando'} aria-label="Copiar como imagen">
                    {copia === 'copiando' ? <CircularProgress size={16} /> : <ContentCopyOutlinedIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <Tooltip title="Abrir en el visor completo">
              <IconButton size="small" onClick={() => setCompleto(true)} aria-label="Abrir en el visor completo">
                <OpenInFullIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Descargar">
              <IconButton size="small" onClick={() => void descargarArchivo(ruta, nombre || '').catch(() => undefined)} aria-label="Descargar">
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box component="object" data={`${url}#toolbar=0&navpanes=0`} type="application/pdf" sx={{ flex: 1, width: '100%', border: 'none', opacity: cargando ? 0.55 : 1, transition: 'opacity .2s' }} />
        </>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center' }}>
          {fallo ? (
            <Typography variant="body2" color="text.secondary">No se pudo abrir el PDF.</Typography>
          ) : cargando || ruta ? (
            // Con ruta y sin URL aún, se está abriendo (sin servidor puede esperar el permiso de la
            // carpeta sincronizada): no es «no hay PDF».
            <Typography variant="body2" color="text.secondary">{cargando ? 'Preparando el PDF…' : 'Abriendo el PDF…'}</Typography>
          ) : (
            vacio ?? <Typography variant="body2" color="text.secondary">Sin PDF todavía.</Typography>
          )}
        </Box>
      )}
      {url && <VisorAvanzado url={url} nombre={nombre} abierto={completo} alCerrar={() => setCompleto(false)} archivos={archivos} claveInicial={claveInicial} />}
    </Box>
  )
}

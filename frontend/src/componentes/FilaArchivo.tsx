/**
 * UNA fila de archivo, igual en todas las secciones del panel de archivos
 * (Edison 2026-09-05: «toda esta sección de archivos también debería
 * estandarizarse visualmente»).
 *
 * Antes cada sección pintaba sus archivos a su manera: chips verdes en la
 * entrega, una lista Material en los adjuntos, cajas a mano en las respuestas.
 * Aquí: icono a la izquierda, nombre (con detalle debajo), y a la derecha las
 * acciones —descargar y eliminar—, siempre en el mismo orden.
 */
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'

export default function FilaArchivo({
  nombre,
  detalle,
  icono,
  hecho = false,
  extra,
  alDescargar,
  alEliminar,
  textoEliminar = 'Eliminar (para reemplazar)',
}: {
  nombre: React.ReactNode
  detalle?: React.ReactNode
  icono?: React.ReactNode
  /** Archivo ya subido (firmado, cargo…): su ícono de PDF en el color de la marca. El estado lo dice la
   * etiqueta de la sección; aquí no va otro check (Edison 2026-10-06: «dos checks no se ven bien»). */
  hecho?: boolean
  /** Acciones adicionales, antes de descargar/eliminar. */
  extra?: React.ReactNode
  alDescargar?: () => void
  alEliminar?: () => void
  textoEliminar?: string
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        px: 0.75,
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ color: hecho ? 'primary.main' : 'text.secondary', display: 'flex', flex: '0 0 auto' }}>
        {hecho ? <PictureAsPdfOutlinedIcon fontSize="small" /> : icono ?? <InsertDriveFileOutlinedIcon fontSize="small" />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          // Un archivo subido muestra su nombre en hasta dos líneas (en la tarjeta de la pieza la
          // columna es angosta); el resto, en una.
          sx={hecho
            ? { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-all', lineHeight: 1.35 }
            : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={typeof nombre === 'string' ? nombre : undefined}
        >
          {nombre}
        </Typography>
        {detalle && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {detalle}
          </Typography>
        )}
      </Box>
      {extra}
      {alDescargar && (
        <Tooltip title="Descargar">
          <IconButton size="small" onClick={alDescargar} aria-label="Descargar">
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {alEliminar && (
        <Tooltip title={textoEliminar}>
          <IconButton size="small" color="error" onClick={alEliminar} aria-label="Eliminar">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}

/** Texto de sección vacía, el mismo en todas partes. */
export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 0.75, py: 0.5 }}>
      {children}
    </Typography>
  )
}

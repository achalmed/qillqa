// Lista de archivos del visor completo, al estilo Outlook (Edison 2026-10-08: «en la parte
// derecha la lista de todos los PDF para ir seleccionando y abrirlos en esa misma ventana»).
// Cada archivo se pide recién al elegirlo (obtener → blob URL).
import { useMemo, useState } from 'react'
import { Box, IconButton, InputBase, Tooltip, Typography } from '@mui/material'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import { PALETA } from '../paleta'

export interface ArchivoVisor {
  /** Identidad estable en la lista. */
  clave: string
  nombre: string
  /** Grupo de la lista: «Documento», «Firmado», «Adjuntos», «Cargos», «Expediente»… */
  grupo: string
  /** Una línea de datos: fecha, tamaño, quién lo subió… */
  detalle?: string
  /** URL para mostrarlo (blob o ruta); se llama al elegirlo. */
  obtener: () => Promise<string>
  descargar?: () => void
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Icono({ nombre }: { nombre: string }) {
  const sx = { fontSize: 22, flexShrink: 0 }
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(nombre)) return <ImageOutlinedIcon sx={{ ...sx, color: PALETA.textoSecundario }} />
  if (/\.\w{2,4}$/.test(nombre) && !/\.pdf$/i.test(nombre)) return <InsertDriveFileOutlinedIcon sx={{ ...sx, color: PALETA.textoTenue }} />
  return <PictureAsPdfOutlinedIcon sx={{ ...sx, color: PALETA.texto }} />
}

export default function PanelArchivosVisor({
  archivos,
  actual,
  cargando,
  alElegir,
  alCerrar,
}: {
  archivos: ArchivoVisor[]
  actual: string
  cargando: string
  alElegir: (a: ArchivoVisor) => void
  alCerrar?: () => void
}) {
  const [filtro, setFiltro] = useState('')
  const grupos = useMemo(() => {
    const f = norm(filtro.trim())
    const visibles = f ? archivos.filter((a) => norm(`${a.nombre} ${a.grupo} ${a.detalle ?? ''}`).includes(f)) : archivos
    const salida = new Map<string, ArchivoVisor[]>()
    for (const a of visibles) salida.set(a.grupo, [...(salida.get(a.grupo) ?? []), a])
    return [...salida.entries()]
  }, [archivos, filtro])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: PALETA.superficie }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, minHeight: 52, borderBottom: `1px solid ${PALETA.borde}` }}>
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
          Archivos <Box component="span" sx={{ color: PALETA.textoTenue, fontWeight: 400 }}>({archivos.length})</Box>
        </Typography>
        {alCerrar && (
          <Tooltip title="Ocultar la lista">
            <IconButton size="small" onClick={alCerrar} aria-label="Ocultar la lista de archivos"><CloseIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
      </Box>
      {archivos.length > 5 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mx: 1.5, my: 1, px: 1, borderRadius: 1, bgcolor: PALETA.superficieMedia }}>
          <SearchIcon sx={{ fontSize: 18, color: PALETA.textoTenue }} />
          <InputBase placeholder="Buscar archivo" value={filtro} onChange={(e) => setFiltro(e.target.value)} sx={{ flex: 1, fontSize: 13.5 }} />
        </Box>
      )}
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 2 }}>
        {grupos.map(([grupo, lista]) => (
          <Box key={grupo}>
            <Typography sx={{ px: 1.5, pt: 1.5, pb: 0.5, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: PALETA.textoTenue }}>
              {grupo}
            </Typography>
            {lista.map((a) => {
              const elegido = a.clave === actual
              return (
                <Box
                  key={a.clave}
                  role="button"
                  tabIndex={0}
                  aria-current={elegido}
                  onClick={() => alElegir(a)}
                  onKeyDown={(e) => { if (e.key === 'Enter') alElegir(a) }}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, mx: 0.75, px: 1, py: 0.9, borderRadius: 1.5, cursor: 'pointer',
                    bgcolor: elegido ? PALETA.veloMedio : 'transparent',
                    opacity: cargando && cargando !== a.clave ? 0.6 : 1,
                    '&:hover': { bgcolor: elegido ? PALETA.veloMedio : PALETA.velo },
                    '&:hover .descargar': { opacity: 1 },
                  }}
                >
                  <Icono nombre={a.nombre} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{ fontSize: 13.5, fontWeight: elegido ? 700 : 500, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}
                      title={a.nombre}
                    >
                      {a.nombre}
                    </Typography>
                    {a.detalle && <Typography sx={{ fontSize: 11.5, color: PALETA.textoTenue, lineHeight: 1.3 }}>{cargando === a.clave ? 'Abriendo…' : a.detalle}</Typography>}
                  </Box>
                  {a.descargar && (
                    <Tooltip title="Descargar">
                      <IconButton
                        className="descargar"
                        size="small"
                        sx={{ opacity: elegido ? 1 : 0, transition: 'opacity .15s' }}
                        onClick={(e) => { e.stopPropagation(); a.descargar?.() }}
                        aria-label={`Descargar ${a.nombre}`}
                      >
                        <DownloadOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )
            })}
          </Box>
        ))}
        {!grupos.length && <Typography sx={{ px: 1.5, py: 2, fontSize: 13, color: PALETA.textoTenue }}>Ningún archivo coincide.</Typography>}
      </Box>
    </Box>
  )
}

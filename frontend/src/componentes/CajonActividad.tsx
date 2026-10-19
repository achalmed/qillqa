import { useEffect, useState } from 'react'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListItemIcon from '@mui/material/ListItemIcon'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import CloseIcon from '@mui/icons-material/Close'
import RestoreIcon from '@mui/icons-material/Restore'
import EditIcon from '@mui/icons-material/Edit'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import GavelIcon from '@mui/icons-material/Gavel'
import FlagIcon from '@mui/icons-material/Flag'
import RefreshIcon from '@mui/icons-material/Refresh'
import ArchiveIcon from '@mui/icons-material/Inventory2'
import HistoryIcon from '@mui/icons-material/History'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import { api } from '../api'
import ComparadorVersiones, { type LadoComparado } from './ComparadorVersiones'
import { confirmar } from './Dialogos'

interface EventoHist {
  accion: string
  detalle: string
  usuario: string
  fecha: string
}
interface VersionMeta {
  numero_version: number
  nota: string
  asunto: string
  usuario: string
  creado_en: string
}
interface VersionCompleta extends VersionMeta {
  campos: Record<string, unknown>
  cuerpo: unknown
}

const ICONO_ACCION: Record<string, React.ReactNode> = {
  creado: <AddCircleIcon fontSize="small" />,
  editado: <EditIcon fontSize="small" />,
  numerado: <GavelIcon fontSize="small" />,
  estado: <FlagIcon fontSize="small" />,
  recompilado: <RefreshIcon fontSize="small" />,
  restaurado: <RestoreIcon fontSize="small" />,
  importado: <ArchiveIcon fontSize="small" />,
}

// Cada acción con su nombre (2026-10-08: «toda acción registrada: quién subió la firma, quién
// generó el documento, a qué hora»); lo que no está aquí se muestra con su clave.
const TEXTO_ACCION: Record<string, string> = {
  creado: 'Creó el documento',
  editado: 'Editó el documento',
  numerado: 'Asignó número oficial',
  generado: 'Generó el PDF',
  datos_verificados: 'Verificó los datos al numerar',
  estado: 'Cambió el estado',
  recompilado: 'Regeneró el PDF',
  restaurado: 'Restauró una versión',
  importado: 'Importó del archivo',
  incorporado: 'Incorporó el documento',
  convertido: 'Convirtió el documento',
  duplicado: 'Duplicó el documento',
  adjunto: 'Subió un archivo',
  adjunto_reemplazado: 'Reemplazó un archivo',
  adjunto_renombrado: 'Renombró un archivo',
  adjunto_eliminado: 'Eliminó un archivo',
  anexo: 'Cambió los anexos',
  expediente: 'Armó el expediente',
  firmado_forzado: 'Subió el firmado (forzado por el administrador)',
  firmado_automatico: 'Registró el firmado',
  firmado_retirado: 'Retiró el firmado',
  firma_invalidada: 'La firma quedó sin efecto',
  envio_automatico: 'Marcó como enviado',
  pdf_reemplazado: 'Reemplazó el PDF',
  numero_anulado: 'Anuló el número',
  folios: 'Registró los folios',
  oculto: 'Ocultó o mostró el documento',
  responsable: 'Cambió el responsable',
  comentario: 'Dejó una observación',
  comentario_levantado: 'Levantó observaciones',
  conformidad: 'Dio conformidad',
  ambito: 'Cambió el ámbito',
  std: 'Registró en el STD',
  vinculado: 'Vinculó un documento',
  desvinculado: 'Quitó un vínculo',
  derivado_de_pedido: 'Nació de un pedido de la semana',
  expediente_externo: 'Registró el n.º de expediente de la entidad',
}

function fechaLegible(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CajonActividad({
  documentoId,
  abierto,
  alCerrar,
  incluirVersiones,
  alRestaurar,
}: {
  documentoId: string
  abierto: boolean
  alCerrar: () => void
  incluirVersiones: boolean
  alRestaurar?: () => void
}) {
  const [historial, setHistorial] = useState<EventoHist[]>([])
  const [versiones, setVersiones] = useState<VersionMeta[]>([])
  // «Ver cambios»: la versión elegida contra la anterior (2026-10-05).
  const [comparando, setComparando] = useState(false)
  const [lados, setLados] = useState<[LadoComparado, LadoComparado] | null>(null)

  const recargar = () => {
    api<EventoHist[]>(`/api/documentos/${documentoId}/historial`)
      .then(setHistorial)
      .catch(() => setHistorial([]))
    if (incluirVersiones) {
      api<VersionMeta[]>(`/api/documentos/${documentoId}/versiones`)
        .then(setVersiones)
        .catch(() => setVersiones([]))
    }
  }

  useEffect(() => {
    if (abierto) recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, documentoId])

  const restaurar = async (n: number) => {
    if (!(await confirmar(`¿Restaurar la versión ${n}? Se creará una versión nueva con ese contenido (no se borra nada).`, { aceptar: 'Restaurar' })))
      return
    await api(`/api/documentos/${documentoId}/versiones/${n}/restaurar`, { method: 'POST' })
    recargar()
    alRestaurar?.()
  }

  const etiqueta = (v: VersionMeta) =>
    `v${v.numero_version}${v.usuario ? ` · ${v.usuario}` : ''}, ${fechaLegible(v.creado_en)}`

  const verCambios = async (n: number, anterior: number) => {
    setLados(null)
    setComparando(true)
    try {
      const [a, b] = await Promise.all(
        [anterior, n].map((k) => api<VersionCompleta>(`/api/documentos/${documentoId}/versiones/${k}`)),
      )
      setLados([
        { etiqueta: etiqueta(a), campos: a.campos, cuerpo: a.cuerpo },
        { etiqueta: etiqueta(b), campos: b.campos, cuerpo: b.cuerpo },
      ])
    } catch {
      setComparando(false)
    }
  }

  return (
    <Drawer anchor="right" open={abierto} onClose={alCerrar}>
      <Box sx={{ width: { xs: '100vw', sm: 380 }, maxWidth: '100vw', p: 2 }} role="presentation">
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <HistoryIcon sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Actividad
          </Typography>
          <IconButton onClick={alCerrar} aria-label="Cerrar">
            <CloseIcon />
          </IconButton>
        </Box>

        {incluirVersiones && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
              Versiones ({versiones.length})
            </Typography>
            <List dense>
              {versiones.map((v, i) => (
                <ListItem
                  key={v.numero_version}
                  sx={{ pr: 1 }}
                  secondaryAction={
                    i === 0 ? (
                      <Chip size="small" label="actual" color="success" />
                    ) : (
                      <Button
                        size="small"
                        startIcon={<RestoreIcon />}
                        onClick={() => restaurar(v.numero_version)}
                      >
                        Restaurar
                      </Button>
                    )
                  }
                >
                  <ListItemText
                    sx={{ pr: 11 }}
                    primary={`v${v.numero_version} — ${v.nota || 'Guardado'}`}
                    secondary={
                      <>
                        {v.usuario && <b>{v.usuario}</b>}
                        {v.usuario ? ' · ' : ''}
                        {fechaLegible(v.creado_en)}
                        <br />
                        {v.asunto || '(sin asunto)'}
                        {versiones[i + 1] && (
                          <>
                            <br />
                            <Button
                              size="small"
                              startIcon={<CompareArrowsIcon />}
                              onClick={() => verCambios(v.numero_version, versiones[i + 1].numero_version)}
                              sx={{ ml: -0.75, mt: 0.25, p: '0 6px', minHeight: 0 }}
                            >
                              Ver cambios
                            </Button>
                          </>
                        )}
                      </>
                    }
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
              {versiones.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Aún no hay versiones guardadas. Use «Guardar» para crear la primera.
                </Typography>
              )}
            </List>
            <Divider sx={{ my: 1 }} />
          </>
        )}

        <Typography variant="subtitle2" color="text.secondary">
          Historial
        </Typography>
        <List dense>
          {historial.map((e, i) => (
            <ListItem key={i} alignItems="flex-start">
              <ListItemIcon sx={{ minWidth: 34, mt: 0.5 }}>
                {ICONO_ACCION[e.accion] ?? <FlagIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText
                primary={`${TEXTO_ACCION[e.accion] ?? e.accion}${e.detalle ? ` — ${e.detalle}` : ''}`}
                secondary={`${e.usuario} · ${fechaLegible(e.fecha)}`}
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItem>
          ))}
          {historial.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              Sin actividad registrada.
            </Typography>
          )}
        </List>
      </Box>
      <ComparadorVersiones
        abierto={comparando}
        alCerrar={() => setComparando(false)}
        antes={lados?.[0] ?? null}
        despues={lados?.[1] ?? null}
      />
    </Drawer>
  )
}

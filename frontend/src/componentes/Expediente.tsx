/**
 * EXPEDIENTE del documento = firmado (o PDF sin firma) + adjuntos PDF en un
 * solo archivo (servicios/expediente.py). Este módulo concentra su estado y
 * su generación para que el VISOR (selector de archivos) y el PANEL de
 * archivos del trámite muestren lo mismo sin duplicar lógica (Edison
 * 2026-09-07: «debería ser fácil de ubicar y contar con una opción clara
 * para descargarlo»). Al generarlo se avisa por un evento de ventana para
 * que las dos vistas se refresquen.
 */
import { useCallback, useEffect, useState } from 'react'
import { api, descargarArchivo } from '../api'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import DownloadIcon from '@mui/icons-material/Download'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { confirmar } from './Dialogos'

export interface EstadoExpediente {
  existe: boolean
  nombre?: string
  con_firma?: boolean
  paginas?: number
  generado_en?: string
  desactualizado?: boolean
  // Vigencia (2026-10-06, servicios/vigencia.py): por qué ya no coincide con
  // lo que hay (se quitó/agregó un adjunto, cambió su PDF, se anuló la firma…).
  vigencia?: 'vigente' | 'desactualizado' | 'inexistente'
  motivos?: string[]
  omitidos?: string[]
  // Lo elegido al armarlo (2026-10-18): adjuntos que quedaron fuera y cargos o respuestas que entraron.
  seleccion?: { excluidos: number[]; extras: number[] }
  piezas?: { id: number; etiqueta: string }[]
}

/** «Expediente desactualizado: vuelva a armarlo (se quitó «X»; …)». */
export function avisoDesactualizado(e: EstadoExpediente): string {
  const motivos = e.motivos?.length ? ` (${e.motivos.join('; ')})` : ''
  return `Expediente desactualizado: vuelva a armarlo${motivos}.`
}

export const EVENTO_EXPEDIENTE = 'sgdp:expediente'

type Avisar = (tipo: 'success' | 'error', texto: string) => void

export function useExpediente(documentoId: string, alAvisar?: Avisar) {
  const [estado, setEstado] = useState<EstadoExpediente>({ existe: false })
  const [generando, setGenerando] = useState(false)

  const cargar = useCallback(() => {
    api<EstadoExpediente>(`/api/documentos/${documentoId}/expediente/estado`)
      .then(setEstado)
      .catch(() => setEstado({ existe: false }))
  }, [documentoId])

  useEffect(() => {
    cargar()
    const f = () => cargar()
    window.addEventListener(EVENTO_EXPEDIENTE, f)
    // También cambia cuando se sube/quita un firmado o un adjunto.
    window.addEventListener('sgdp:adjuntos', f)
    return () => {
      window.removeEventListener(EVENTO_EXPEDIENTE, f)
      window.removeEventListener('sgdp:adjuntos', f)
    }
  }, [cargar])

  /** Genera (o regenera) el expediente. Devuelve true si se generó. `piezas`: los ids elegidos en
   *  la ventana «Qué entra» (que ya avisa si falta el firmado); sin ella, los adjuntos de siempre. */
  const generar = useCallback(async (piezas?: number[]): Promise<boolean> => {
    // El expediente debe llevar como principal el documento FIRMADO (versión
    // oficial). Si aún no hay firmado, se avisa antes de armarlo sin firma.
    if (!piezas) try {
      const lista = await api<{ categoria: string }[]>(`/api/documentos/${documentoId}/adjuntos`)
      const hayFirmado = (lista || []).some((a) => a.categoria === 'firmado')
      if (
        !hayFirmado &&
        !(await confirmar(
          'Aún no hay firmado: saldrá «SIN FIRMA». ¿Armarlo igual?',
          { aceptar: 'Armar sin firma' },
        ))
      )
        return false
    } catch {
      /* si no se puede consultar, se sigue: el servidor decide */
    }
    setGenerando(true)
    try {
      const datos = await api<{ con_firma: boolean; paginas: number; omitidos?: string[]; nombre: string }>(
        `/api/documentos/${documentoId}/expediente`,
        { method: 'POST', body: JSON.stringify(piezas ? { piezas } : {}) },
      )
      const base = datos.con_firma ? 'documento principal: el FIRMADO' : 'SIN FIRMA: documento principal sin firmar'
      const omit = datos.omitidos?.length ? ` Omitidos por no ser PDF: ${datos.omitidos.join(', ')}.` : ''
      alAvisar?.('success', `Expediente generado (${datos.paginas} págs., ${base}).${omit}`)
      window.dispatchEvent(new Event(EVENTO_EXPEDIENTE))
      cargar()
      return true
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'Error al generar el expediente.')
      return false
    } finally {
      setGenerando(false)
    }
  }, [documentoId, alAvisar, cargar])

  const descargar = useCallback(
    () => descargarArchivo(`/api/documentos/${documentoId}/expediente`, estado.nombre ?? ''),
    [documentoId, estado.nombre],
  )

  return { estado, generando, cargar, generar, descargar }
}

/** «firmado · 12 págs.» / «SIN FIRMA · 3 págs.» (+ « · desactualizado»). */
export function resumenExpediente(e: EstadoExpediente): string {
  if (!e.existe) return 'no generado'
  const base = e.con_firma ? 'firmado' : 'SIN FIRMA'
  return `${base} · ${e.paginas ?? '?'} págs.${e.desactualizado ? ' · desactualizado' : ''}`
}

// --- Armar el expediente, DENTRO de Anexos (Edison 2026-10-01) -----------
// «El botón Generar expediente debería ubicarse dentro de la sección Anexos…
// que el usuario entienda qué hace, en qué momento usarlo, qué documentos
// intervienen y qué resultado genera.» Antes era un botón suelto en
// «Archivos del trámite» y una opción escondida en el selector del visor.
// Ahora es el cierre de la sección Anexos: dice qué entra y en qué orden
// (el documento —firmado si ya se subió— y los adjuntos PDF), avisa de lo que
// quedará fuera, y el resultado se ve en la pestaña «Expediente» del visor.

interface Pieza {
  id: number
  nombre: string
  etiqueta: string
  categoria: string
  es_anexo?: boolean
}

export function ArmarExpediente({
  documentoId,
  alAvisar,
  alVer,
}: {
  documentoId: string
  alAvisar?: Avisar
  /** Abre el expediente en el visor (pestaña «Expediente»). */
  alVer?: () => void
}) {
  const expediente = useExpediente(documentoId, alAvisar)
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [piezas, setPiezas] = useState<Pieza[]>([])
  const cargarPiezas = useCallback(() => {
    api<Pieza[]>(`/api/documentos/${documentoId}/adjuntos`)
      .then((l) => setPiezas(l || []))
      .catch(() => setPiezas([]))
  }, [documentoId])
  useEffect(() => {
    cargarPiezas()
    window.addEventListener('sgdp:adjuntos', cargarPiezas)
    return () => window.removeEventListener('sgdp:adjuntos', cargarPiezas)
  }, [cargarPiezas])

  const firmado = piezas.some((p) => p.categoria === 'firmado')
  // En orden de carga, que es el del expediente y el de la línea «Adj.»
  // (servicios/adjuntos.py ordena por id; el listado viene al revés).
  // Las imágenes incrustadas ya son páginas del documento (no van aparte).
  const adjuntos = piezas.filter((p) => p.categoria === '' && !p.es_anexo).sort((a, b) => a.id - b.id)
  const incrustadas = piezas.filter((p) => p.categoria === '' && p.es_anexo)
  const entran = adjuntos.filter((p) => /\.pdf$/i.test(p.nombre))
  const fuera = adjuntos.filter((p) => !/\.pdf$/i.test(p.nombre))
  const e = expediente.estado
  const nombre = (p: Pieza) => p.etiqueta || p.nombre.replace(/\.[^.]+$/, '')

  // La ventana «Qué entra en el expediente» (2026-10-18): cada pieza con su casilla.
  const [eligiendo, setEligiendo] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const cargos = piezas.filter((p) => p.categoria === 'recepcion').sort((a, b) => a.id - b.id)
  const respuestas = piezas.filter((p) => p.categoria === 'respuesta').sort((a, b) => a.id - b.id)
  const esPdf = (p: Pieza) => /\.pdf$/i.test(p.nombre)
  const abrir = () => {
    const sel = expediente.estado.seleccion
    setMarcadas(new Set([
      ...entran.filter((p) => !sel?.excluidos.includes(p.id)).map((p) => p.id),
      // Los cargos entran de fábrica; las respuestas, si se eligieron la vez anterior.
      ...cargos.filter(esPdf).map((p) => p.id),
      ...respuestas.filter((p) => esPdf(p) && sel?.extras.includes(p.id)).map((p) => p.id),
    ]))
    setEligiendo(true)
  }
  const alternar = (id: number) => setMarcadas((m) => {
    const n = new Set(m)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const elegidas = [...adjuntos, ...cargos, ...respuestas].filter((p) => marcadas.has(p.id)).map((p) => p.id)
  const armar = async () => {
    setEligiendo(false)
    if ((await expediente.generar(elegidas)) && alVer) alVer()
  }
  const grupo = (titulo: string, lista: Pieza[]) => lista.length > 0 && (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{titulo}</Typography>
      {lista.map((p) => (
        <FormControlLabel
          key={p.id}
          sx={{ display: 'flex', mr: 0, alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0.5 } }}
          control={<Checkbox size="small" checked={marcadas.has(p.id)} disabled={!esPdf(p)} onChange={() => alternar(p.id)} />}
          label={<Typography variant="body2" sx={{ pt: 0.75, overflowWrap: 'anywhere' }}>{nombre(p)}{!esPdf(p) && <Typography component="span" variant="caption" color="text.secondary"> · no es PDF</Typography>}</Typography>}
        />
      ))}
    </>
  )

  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <FolderZipOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Expediente
        </Typography>
        <Typography variant="caption" color="text.secondary">
          documento, adjuntos y cargos en un solo PDF
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {e.existe && (
          <>
            <Typography variant="caption" color={e.desactualizado ? 'warning.main' : 'text.secondary'}>
              {resumenExpediente(e)}
            </Typography>
            {alVer && (
              <Tooltip title="Ver en la pestaña «Expediente» de la vista previa">
                <IconButton size="small" onClick={alVer} aria-label="Ver expediente">
                  <VisibilityOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={`Descargar ${e.nombre ?? 'el expediente'}`}>
              <IconButton size="small" onClick={() => void expediente.descargar()} aria-label="Descargar expediente">
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Button
          size="small"
          variant={e.desactualizado ? 'contained' : e.existe ? 'text' : 'outlined'}
          color={e.desactualizado ? 'warning' : 'primary'}
          onClick={abrir}
          disabled={expediente.generando}
        >
          {expediente.generando ? 'Armando…' : e.existe ? 'Volver a armar' : 'Armar expediente'}
        </Button>
      </Box>
      {e.existe && e.desactualizado && (
        <Alert severity="warning" sx={{ mt: 0.75, py: 0, fontSize: 12.5 }}>
          {avisoDesactualizado(e)} No lo envíe ni lo registre así.
        </Alert>
      )}
      <Box component="ol" sx={{ m: 0, mt: 0.75, pl: 4.5, fontSize: 12.5, color: 'text.secondary', '& li': { py: 0.1 } }}>
        <li>
          Documento {firmado ? 'firmado' : (
            <Box component="span" sx={{ color: 'warning.main' }}>
              sin firma (aún no se subió el firmado: saldrá marcado «SIN FIRMA»)
            </Box>
          )}
        </li>
        {/* Armado: lo que lleva; sin armar, lo que entraría de fábrica. */}
        {(e.existe && e.piezas ? e.piezas.map((x) => ({ id: x.id, texto: x.etiqueta })) : entran.map((p) => ({ id: p.id, texto: nombre(p) }))).map((x) => {
          const cat = piezas.find((p) => p.id === x.id)?.categoria
          return <li key={x.id}>{cat === 'recepcion' ? 'Cargo' : cat === 'respuesta' ? 'Respuesta' : 'Adjunto'}: {x.texto}</li>
        })}
      </Box>
      <Dialog open={eligiendo} onClose={() => setEligiendo(false)} fullWidth maxWidth="xs" fullScreen={celular}>
        <DialogTitle>Qué entra en el expediente</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">Un solo PDF, en este orden. Marque lo que debe ir.</Typography>
          <FormControlLabel
            sx={{ display: 'flex', mr: 0, mt: 1 }}
            control={<Checkbox size="small" checked disabled />}
            label={<Typography variant="body2">{firmado ? 'Documento firmado' : 'Documento sin firma (saldrá «SIN FIRMA»)'}</Typography>}
          />
          {grupo('Adjuntos', adjuntos)}
          {grupo('Cargos de recepción', cargos)}
          {grupo('Respuestas recibidas', respuestas)}
          {adjuntos.length + cargos.length + respuestas.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>No hay adjuntos, cargos ni respuestas: irá solo el documento.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setEligiendo(false)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void armar()}>Armar ({elegidas.length + 1} {elegidas.length ? 'piezas' : 'pieza'})</Button>
        </DialogActions>
      </Dialog>
      {incrustadas.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 4.5, mt: 0.25 }}>
          Ya van dentro del documento (incrustadas como página): {incrustadas.map(nombre).join(', ')}.
        </Typography>
      )}
      {fuera.length > 0 && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', pl: 4.5, mt: 0.25 }}>
          Fuera por no ser PDF: {fuera.map(nombre).join(', ')}.
        </Typography>
      )}
      {/* 2026-10-06: quitado el pie «Ármelo al final…»: lo dicen la lista (sin firma) y el aviso de desactualizado. */}
    </Box>
  )
}

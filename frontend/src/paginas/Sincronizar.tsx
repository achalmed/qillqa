import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Link from '@mui/material/Link'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import FolderSyncIcon from '@mui/icons-material/DriveFolderUpload'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import {
  obtenerManifiesto,
  sincronizar,
  asegurarPermiso,
  vaciarRetirados,
  CARPETA_RETIRADOS,
  CARPETA_IMPORTADOS,
  importarFirmados,
  type FirmadoImportado,
  type ResumenSync,
} from '../sync/sincronizador'
import { guardarHandle, leerHandle, olvidarHandle as olvidarCarpeta } from '../sync/almacen'
import { olvidarMapaEnMemoria } from '../sync/carpetaLocal'
import Marco from '../componentes/Marco'
import { confirmar } from '../componentes/Dialogos'

/** Olvidar la carpeta también olvida su mapa: sin servidor ya no se abre nada de ella. */
async function olvidarHandle(): Promise<void> {
  await olvidarCarpeta()
  olvidarMapaEnMemoria()
}

function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function Sincronizar() {
  const soportado = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [prog, setProg] = useState<{ hecho: number; total: number; ruta: string } | null>(null)
  const [resumen, setResumen] = useState<ResumenSync | null>(null)
  // Firmados «…[R].pdf» hallados en la carpeta e incorporados al sistema (USB del firmador).
  const [firmados, setFirmados] = useState<FirmadoImportado[]>([])
  const [error, setError] = useState('')
  const [vaciando, setVaciando] = useState(false)
  const [ayuda, setAyuda] = useState(false)

  // Borrado DEFINITIVO de lo apartado: lo pide la persona, nunca la
  // sincronización. Se confirma porque es lo único de este flujo que no tiene
  // vuelta atrás.
  const vaciar = async () => {
    if (!handle) return
    const cuantos = resumen?.retirados ?? 0
    if (
      !(await confirmar(
        `Se van a borrar definitivamente ${cuantos} archivo(s) de «${CARPETA_RETIRADOS}» ` +
          '(versiones anteriores que el sistema ya reemplazó). Esta acción no se puede deshacer.',
        { titulo: 'Vaciar lo apartado', aceptar: 'Borrar', peligro: true },
      ))
    ) {
      return
    }
    setVaciando(true)
    try {
      await vaciarRetirados(handle)
      setResumen((r) => (r ? { ...r, retirados: 0 } : r))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vaciar la carpeta.')
    } finally {
      setVaciando(false)
    }
  }
  const [ultima, setUltima] = useState(() => localStorage.getItem('sgdp_sync_ultima') || '')

  // Recupera la carpeta elegida antes (mismo origen); si el enlace cambió,
  // el usuario la reelige y el índice de la carpeta evita re-descargas.
  useEffect(() => {
    leerHandle()
      .then((h) => h && setHandle(h))
      .catch(() => {})
  }, [])

  const correr = async (dir: FileSystemDirectoryHandle) => {
    setError('')
    setResumen(null)
    try {
      // Permiso ANTES de cualquier otro await (conserva el gesto del usuario).
      const ok = await asegurarPermiso(dir)
      if (!ok) {
        setError('No se concedió permiso de escritura sobre la carpeta.')
        return
      }
      setSincronizando(true)
      setProg({ hecho: 0, total: 0, ruta: '' })
      // Primero lo que VUELVE firmado en el USB (así el FIRM-… que baja después ya es el suyo).
      setFirmados(await importarFirmados(dir, (hecho, total, ruta) => setProg({ hecho, total, ruta: `Firmado: ${ruta}` })))
      const items = await obtenerManifiesto()
      const r = await sincronizar(dir, items, (hecho, total, ruta) =>
        setProg({ hecho, total, ruta }),
      )
      setResumen(r)
      const ahora = new Date().toISOString()
      localStorage.setItem('sgdp_sync_ultima', ahora)
      setUltima(ahora)
    } catch (e) {
      // Validación de §4: si la carpeta recordada se movió/borró o se revocó
      // el permiso, se olvida el handle y se pide elegir de nuevo.
      const nombre = (e as DOMException)?.name
      if (nombre === 'NotFoundError' || nombre === 'NotAllowedError') {
        await olvidarHandle()
        setHandle(null)
        setError(
          'La carpeta de sincronización ya no está disponible (se movió, se ' +
            'borró o se revocó el permiso). Elige de nuevo la carpeta.',
        )
      } else {
        setError(e instanceof Error ? e.message : 'Error al sincronizar.')
      }
    } finally {
      setSincronizando(false)
      setProg(null)
    }
  }

  const elegirCarpeta = async () => {
    try {
      // startIn: 'documents' abre el selector en la carpeta Documentos (lo más
      // cerca que puede el navegador de «buscar Qillqa ahí»; no puede recorrer
      // rutas por su cuenta). id: 'sgdp' hace que recuerde la última ubicación.
      const dir = await window.showDirectoryPicker!({
        id: 'sgdp',
        mode: 'readwrite',
        startIn: 'documents',
      })
      await guardarHandle(dir)
      setHandle(dir)
      await correr(dir)
    } catch (e) {
      // Cancelar el selector no es un error.
      if ((e as DOMException)?.name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'No se pudo abrir la carpeta.')
      }
    }
  }

  const cambiarCarpeta = async () => {
    await olvidarHandle()
    setHandle(null)
    setResumen(null)
    await elegirCarpeta()
  }

  const pct = prog && prog.total ? Math.round((prog.hecho / prog.total) * 100) : 0

  return (
    // Sincronizar es una opción de Gestión documental (navegacion.ts): el
    // Marco da la barra, la franja de opciones y la vuelta a la bandeja.
    <Marco modulo="documentos">
      <Container maxWidth="md" sx={{ mt: { xs: 2, sm: 4 }, mb: 6, px: { xs: 1.5, sm: 3 } }}>
        <Typography component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600, fontSize: { xs: 17, sm: 19 }, mb: 1.5 }}>
          <CloudSyncIcon color="primary" /> Sincronizar documentos a este dispositivo
        </Typography>
        {!soportado ? (
          <Alert severity="warning">
            <AlertTitle>Este navegador no puede guardar en carpetas</AlertTitle>
            Funciona en <strong>Chrome</strong> o <strong>Edge</strong> de una computadora; ábralo allí para sincronizar.
          </Alert>
        ) : (
          <>
            {/* Revisión 9.7 (2026-10-12): dos líneas directas; el detalle, en «Cómo funciona». */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Copia los PDF, firmados, adjuntos y recibidos a una carpeta de este dispositivo; cada vez baja solo lo nuevo. Sin conexión, el sistema los abre de ahí.{' '}
              <Link component="button" type="button" variant="body2" onClick={() => setAyuda(true)} sx={{ verticalAlign: 'baseline' }}>
                Cómo funciona
              </Link>
            </Typography>
            <Dialog open={ayuda} onClose={() => setAyuda(false)} maxWidth="sm" fullWidth>
              <DialogTitle>Cómo funciona</DialogTitle>
              <DialogContent>
                {/* Revisión 2026-10-12 («mensajes breves»): una línea por idea. */}
                <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 }, typography: 'body2' }}>
                  <li>En la carpeta se crean Oficios, Cartas, Informes…, cada una con sus documentos, y Recibidos, por mes.</li>
                  <li>Bajan solo PDF, cargos, firmados, adjuntos y recibidos; nada interno.</li>
                  <li>Sin conexión, la bandeja, el editor y Recibidos abren el PDF de esta carpeta, sin guardarlo otra vez en el navegador.</li>
                  <li>El navegador pide autorizar la carpeta una vez por sesión.</li>
                  <li>Si un archivo cambia de nombre, la copia vieja pasa a <code>{CARPETA_RETIRADOS}</code>; lo demás no se toca.</li>
                  <li>Los firmados <code>…[R].pdf</code> que deje en la carpeta se incorporan solos.</li>
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setAyuda(false)}>Entendido</Button>
              </DialogActions>
            </Dialog>

            {/* En el celular, los botones a lo ancho y uno bajo otro (se
                alcanzan con el pulgar); en pantallas anchas, en fila. */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              useFlexGap
              sx={{ mb: 2, flexWrap: 'wrap', alignItems: { xs: 'stretch', sm: 'center' } }}
            >
              {handle ? (
                <>
                  <Chip
                    icon={<FolderOpenIcon />}
                    label={`Carpeta: ${handle.name}`}
                    variant="outlined"
                    color="primary"
                    sx={{ maxWidth: '100%', alignSelf: { xs: 'flex-start', sm: 'center' } }}
                  />
                  <Button
                    variant="contained"
                    startIcon={<CloudSyncIcon />}
                    onClick={() => correr(handle)}
                    disabled={sincronizando}
                  >
                    Sincronizar ahora
                  </Button>
                  <Button onClick={cambiarCarpeta} disabled={sincronizando}>
                    Cambiar carpeta
                  </Button>
                </>
              ) : (
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<FolderSyncIcon />}
                  onClick={elegirCarpeta}
                  disabled={sincronizando}
                >
                  Elegir carpeta y sincronizar
                </Button>
              )}
            </Stack>

            {sincronizando && prog && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Sincronizando… {prog.hecho} / {prog.total}
                </Typography>
                <LinearProgress variant="determinate" value={pct} sx={{ mb: 1, height: 8, borderRadius: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                  {prog.ruta}
                </Typography>
              </Paper>
            )}

            {resumen && !sincronizando && (
              <Alert severity={resumen.errores ? 'warning' : 'success'} sx={{ mb: 2 }}>
                <AlertTitle>
                  <CheckCircleIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  Sincronización completa
                </AlertTitle>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                  <Chip size="small" color="success" label={`${resumen.bajados} nuevos`} />
                  <Chip size="small" color="info" label={`${resumen.actualizados} actualizados`} />
                  <Chip size="small" label={`${resumen.alDia} ya al día`} />
                  {resumen.errores > 0 && (
                    <Chip size="small" color="error" label={`${resumen.errores} con error`} />
                  )}
                  {resumen.retirados > 0 && (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={`${resumen.retirados} versiones anteriores apartadas`}
                    />
                  )}
                  <Chip size="small" variant="outlined" label={`descargado: ${pesoLegible(resumen.bytes)}`} />
                </Stack>
                {resumen.retirados > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Se apartaron {resumen.retirados} archivo(s) que el sistema ya no reconoce
                      —normalmente copias con el nombre anterior— en la carpeta{' '}
                      <b>{CARPETA_RETIRADOS}</b>, dentro de la carpeta que eligió. No se borró
                      nada: revíselos si quiere y vacíelos cuando esté conforme.
                    </Typography>
                    <Button
                      size="small"
                      color="warning"
                      variant="outlined"
                      startIcon={<DeleteSweepIcon />}
                      disabled={vaciando}
                      onClick={() => void vaciar()}
                    >
                      {vaciando ? 'Vaciando…' : 'Vaciar definitivamente'}
                    </Button>
                  </Box>
                )}
              </Alert>
            )}

            {firmados.length > 0 && !sincronizando && (
              <Alert severity={firmados.some((f) => f.estado === 'pendiente' || f.estado === 'error') ? 'warning' : 'success'} sx={{ mb: 2 }}>
                <AlertTitle>Firmados encontrados en la carpeta</AlertTitle>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 1 }}>
                  <Chip size="small" color="success" label={`${firmados.filter((f) => f.estado === 'incorporado').length} incorporados`} />
                  {firmados.some((f) => f.estado === 'ya_estaba') && <Chip size="small" label={`${firmados.filter((f) => f.estado === 'ya_estaba').length} ya estaban`} />}
                  {firmados.some((f) => f.estado === 'pendiente' || f.estado === 'error') && (
                    <Chip size="small" color="warning" label={`${firmados.filter((f) => f.estado === 'pendiente' || f.estado === 'error').length} por revisar`} />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Los incorporados se apartaron a <b>{CARPETA_IMPORTADOS}</b> (el sistema baja su copia con el nombre oficial FIRM-…). Los demás siguen donde estaban:
                </Typography>
                {firmados.filter((f) => f.estado === 'pendiente' || f.estado === 'error').map((f) => (
                  <Typography key={f.ruta} variant="body2" sx={{ mt: 0.5, wordBreak: 'break-all' }}>
                    <b>{f.ruta}</b>{f.motivos?.length ? ` — ${f.motivos.join(' ')}` : ''}
                  </Typography>
                ))}
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {ultima && (
              <Typography variant="caption" color="text.secondary">
                Última sincronización en este navegador:{' '}
                {new Date(ultima).toLocaleString('es-PE')}
              </Typography>
            )}
          </>
        )}
      </Container>
    </Marco>
  )
}

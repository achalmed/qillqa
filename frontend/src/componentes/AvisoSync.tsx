import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Collapse from '@mui/material/Collapse'
import Snackbar from '@mui/material/Snackbar'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import { leerHandle } from '../sync/almacen'
import {
  asegurarPermiso,
  contarPendientes,
  obtenerManifiesto,
  sincronizar,
} from '../sync/sincronizador'

/**
 * Aviso automático en la bandeja: si el dispositivo ya tiene una carpeta de
 * sincronización elegida (mismo origen), invita a copiar los documentos nuevos
 * o modificados sin salir de la lista. Cuenta los pendientes SIN pedir permiso
 * (si ya está concedido); si el permiso está en «prompt», muestra un aviso
 * genérico. No aparece en navegadores sin soporte ni si no hay carpeta.
 */
export default function AvisoSync() {
  const soportado = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [pendientes, setPendientes] = useState<number | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [prog, setProg] = useState<{ hecho: number; total: number } | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'success' | 'error' } | null>(null)
  const [oculto, setOculto] = useState(false)

  useEffect(() => {
    if (!soportado) return
    let vivo = true
    leerHandle()
      .then(async (h) => {
        if (!h || !vivo) return
        setHandle(h)
        try {
          // queryPermission NO requiere gesto: si ya está concedido, contamos.
          if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') {
            const n = await contarPendientes(h)
            if (vivo) setPendientes(n)
          }
        } catch {
          /* la carpeta pudo moverse/borrarse: se ignora el conteo */
        }
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [soportado])

  const correr = async () => {
    if (!handle) return
    const ok = await asegurarPermiso(handle)
    if (!ok) {
      setAviso({ texto: 'No se concedió permiso de escritura a la carpeta.', tipo: 'error' })
      return
    }
    setSincronizando(true)
    setProg({ hecho: 0, total: 0 })
    try {
      const items = await obtenerManifiesto()
      const r = await sincronizar(handle, items, (hecho, total) => setProg({ hecho, total }))
      setPendientes(0)
      localStorage.setItem('sgdp_sync_ultima', new Date().toISOString())
      setAviso({
        texto: `Sincronización lista: ${r.bajados} nuevos, ${r.actualizados} actualizados, ${r.alDia} ya al día${r.errores ? `, ${r.errores} con error` : ''}.`,
        tipo: r.errores ? 'error' : 'success',
      })
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : 'Error al sincronizar.', tipo: 'error' })
    } finally {
      setSincronizando(false)
      setProg(null)
    }
  }

  // Mostrar solo si: hay soporte + carpeta elegida + no lo cerró + hay algo que
  // hacer (sincronizando, conteo desconocido, o pendientes > 0).
  const mostrar =
    soportado &&
    !!handle &&
    !oculto &&
    (sincronizando || pendientes === null || (pendientes ?? 0) > 0)
  const pct = prog && prog.total ? Math.round((prog.hecho / prog.total) * 100) : 0

  return (
    <>
      <Collapse in={mostrar}>
        <Alert
          severity="info"
          icon={<CloudSyncIcon />}
          action={
            <Button color="inherit" size="small" onClick={correr} disabled={sincronizando}>
              {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
            </Button>
          }
          onClose={sincronizando ? undefined : () => setOculto(true)}
          sx={{ mb: 2 }}
        >
          {sincronizando && prog
            ? `Copiando a «${handle?.name}»… ${prog.hecho}/${prog.total}`
            : pendientes === null
              ? `Tienes documentos para copiar a tu carpeta «${handle?.name}».`
              : `Tienes ${pendientes} documento(s) nuevos o actualizados para copiar a «${handle?.name}».`}
          {sincronizando && prog && (
            <LinearProgress variant="determinate" value={pct} sx={{ mt: 1, borderRadius: 1 }} />
          )}
        </Alert>
      </Collapse>
      <Snackbar
        open={aviso !== null}
        autoHideDuration={6000}
        onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={aviso?.tipo ?? 'success'} onClose={() => setAviso(null)}>
          {aviso?.texto}
        </Alert>
      </Snackbar>
    </>
  )
}

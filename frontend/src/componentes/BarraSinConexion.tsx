/**
 * Aviso de que no hay servidor, y de lo que quedó pendiente de enviar.
 *
 * Sin esto el modo sin conexión sería peor que no tenerlo: la gente seguiría
 * escribiendo creyendo que se está guardando en el sistema. La barra dice tres
 * cosas, en este orden de importancia:
 *
 *   1. Que no hay servidor (y que se puede seguir escribiendo igual).
 *   2. Cuántos cambios esperan para subir.
 *   3. Qué NO se puede hacer hasta que vuelva: numerar y cambiar de estado.
 *
 * El punto 3 no es una disculpa técnica. El correlativo oficial es un contador
 * único; si dos equipos numeraran a ciegas saldrían dos oficios con el mismo
 * número, y eso no se deshace.
 */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import { EVENTO_CACHE, leyendoDeCache } from '../api'
import { alCambiarCola, pendientes, sincronizar, type CambioPendiente } from '../sinconexion'
import { esAdmin } from '../navegacion'

export default function BarraSinConexion({
  alAvisar,
}: {
  alAvisar?: (texto: string) => void
}) {
  // «Hay servidor» NO es `navigator.onLine`: eso solo dice que hay red, y el
  // caso típico de la entidad es tener wifi con la laptop-servidor apagada. La
  // señal buena es que la última lectura vino del caché (ver api.ts).
  const [enLinea, setEnLinea] = useState(navigator.onLine && !leyendoDeCache())
  const [cola, setCola] = useState<CambioPendiente[]>(pendientes)
  const [subiendo, setSubiendo] = useState(false)

  useEffect(() => {
    const recalcular = () => {
      setEnLinea(navigator.onLine && !leyendoDeCache())
      setCola(pendientes())
    }
    const quitar = alCambiarCola(recalcular)
    window.addEventListener(EVENTO_CACHE, recalcular)
    return () => {
      quitar()
      window.removeEventListener(EVENTO_CACHE, recalcular)
    }
  }, [])

  // Sondeo mientras haya algo pendiente y no se vea el servidor.
  //
  // Hace falta porque el evento `online` del navegador NO se dispara en el
  // caso típico de la entidad: la wifi nunca se cayó, se cayó la laptop que
  // hace de servidor. Sin esto, lo encolado esperaría a que alguien navegara.
  // Se consulta /api/health, que es barato, y solo mientras hay cola.
  useEffect(() => {
    if (enLinea || cola.length === 0) return
    const id = setInterval(() => {
      fetch('/api/health')
        .then((r) => r.ok && setEnLinea(true))
        .catch(() => undefined)
    }, 30_000)
    return () => clearInterval(id)
  }, [enLinea, cola.length])

  // Al volver la conexión, subir lo pendiente sin que nadie lo pida. Lo que pasó (enviados,
  // apartados, no aceptados) lo dice una sola vez la franja del marco (FranjaSinConexion), para
  // todos; aquí no se repite (2026-10-18).
  useEffect(() => {
    if (!enLinea || cola.length === 0 || subiendo) return
    setSubiendo(true)
    void sincronizar()
      .then(() => setCola(pendientes()))
      .finally(() => setSubiendo(false))
  }, [enLinea, cola.length, subiendo])

  const reintentar = async () => {
    setSubiendo(true)
    const { subidos } = await sincronizar()
    setCola(pendientes())
    setSubiendo(false)
    alAvisar?.(subidos > 0 ? `Se enviaron ${subidos} cambio(s).` : 'Todavía no hay servidor.')
  }

  if (enLinea && cola.length === 0) return null
  // Sin servidor, la barra es solo para el administrador (Edison 2026-10-18: los demás creían que
  // no tenían conexión); a ellos cada acción les dice en su momento que se guardará al volver.
  if (!enLinea && !esAdmin()) return null

  return (
    <Alert
      severity={enLinea ? 'info' : 'warning'}
      icon={enLinea ? <CloudSyncIcon fontSize="small" /> : false}
      sx={{ mb: 1.5, py: 0, fontSize: 13.5 }}
      action={
        cola.length > 0 && (
          <Button size="small" onClick={reintentar} disabled={subiendo}>
            Enviar ahora
          </Button>
        )
      }
    >
      {/* «Sin conexión · mostrando lo guardado» ya lo dice la franja del marco (2026-10-13): aquí,
          solo lo propio de esta pantalla. */}
      {!enLinea && (
        <>
          Puede seguir escribiendo. <b>Numerar</b> y cambiar de estado esperan al servidor.
        </>
      )}
      {enLinea && cola.length > 0 && (
        <>
          Enviando {cola.length} cambio(s) guardado(s) mientras no había
          servidor: {cola.map((c) => c.rotulo).join(', ')}.
        </>
      )}
    </Alert>
  )
}

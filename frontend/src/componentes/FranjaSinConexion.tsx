/**
 * Franja de «sin conexión» (2026-10-13), en TODAS las pantallas del marco.
 *
 * Edison: «no puede ser que cuando se vaya el servidor o la línea se deje de visualizar la
 * información». Sin servidor, cada pantalla muestra lo último guardado en este equipo
 * (cachelecturas.ts). Mientras tanto se consulta /api/health cada 20 s y, cuando el servidor
 * vuelve (el evento `online` no llega si lo que cayó es el servidor y no la wifi), se sube lo que
 * quedó en la cola (guardados del editor, mensajes, comentarios, tareas, actuaciones) desde
 * cualquier pantalla, y se dice en una línea qué pasó.
 *
 * Quién ve qué (Edison 2026-10-18: «la franja solo debe verla el administrador; los demás se
 * complican y creen que no tienen conexión»):
 *   · el ADMINISTRADOR, la franja «Sin conexión · mostrando lo guardado a las HH:MM» y lo que espera;
 *   · los DEMÁS, nada mientras solo se lee; si algo suyo espera para enviarse, un ícono discreto en
 *     la barra (`IndicadorConexion`), sin texto. Cada acción que no se completa lo dice en su
 *     momento («Se guardará cuando vuelva la conexión», avisoBreve.ts).
 *   · TODOS, al volver: lo enviado y, si el servidor rechazó algo, que quedó guardado en el equipo
 *     («No enviados», con su texto para copiar) o apartado en el documento. Nada se pierde.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import { confirmarServidor, EVENTO_CACHE, leyendoDeCache, momentoDeLaCopia } from '../api'
import { textoFranja } from '../cachelecturas'
import { alCambiarCola, descartarNoEnviado, noEnviados, pendientes, sincronizar, textoLegible, type NoEnviado } from '../sinconexion'
import { esAdmin } from '../navegacion'
import { PALETA } from '../paleta'

const SONDEO_MS = 20_000

/** El estado de conexión que comparten la franja y el indicador. */
function useConexion() {
  const calcular = () => ({ sin: leyendoDeCache() || !navigator.onLine, momento: momentoDeLaCopia(), cola: pendientes().length })
  const [estado, setEstado] = useState(calcular)
  useEffect(() => {
    const recalcular = () => setEstado(calcular())
    const quitar = alCambiarCola(recalcular)
    window.addEventListener(EVENTO_CACHE, recalcular)
    return () => {
      quitar()
      window.removeEventListener(EVENTO_CACHE, recalcular)
    }
  }, [])
  return estado
}

/** Para los que no son administrador: un ícono en la barra cuando algo suyo espera al servidor. */
export function IndicadorConexion() {
  const { sin, cola } = useConexion()
  if (esAdmin() || !sin || cola === 0) return null
  return (
    <Tooltip title={`${cola === 1 ? 'Un cambio guardado' : `${cola} cambios guardados`} en este equipo; se enviará${cola === 1 ? '' : 'n'} solo${cola === 1 ? '' : 's'} al volver la conexión.`}>
      <Box component="span" role="img" aria-label="Cambios por enviar" sx={{ display: 'inline-flex', alignItems: 'center', px: 0.5, opacity: 0.75 }}>
        <CloudUploadOutlinedIcon sx={{ fontSize: 19 }} />
      </Box>
    </Tooltip>
  )
}

/** Lo que el servidor rechazó al subir: su texto, para copiarlo, y «Descartar». */
function DialogoNoEnviados({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const [lista, setLista] = useState<NoEnviado[]>(noEnviados)
  useEffect(() => {
    if (!abierto) return
    setLista(noEnviados())
    return alCambiarCola(() => setLista(noEnviados()))
  }, [abierto])
  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle>No enviados</DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 1.5 }}>
        {lista.length === 0 && <Typography variant="body2" color="text.secondary">Nada pendiente.</Typography>}
        {lista.map((c) => (
          <Box key={c.id} sx={{ border: `1px solid ${PALETA.borde}`, borderRadius: 1.5, p: 1.25 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.rotulo}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{c.motivo}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflowY: 'auto', bgcolor: PALETA.superficieTenue, p: 1, borderRadius: 1 }}>
              {textoLegible(c)}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.75 }}>
              <Button size="small" onClick={() => void navigator.clipboard?.writeText(textoLegible(c)).catch(() => undefined)}>Copiar</Button>
              <Button size="small" color="inherit" onClick={() => descartarNoEnviado(c.id)}>Descartar</Button>
            </Box>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function FranjaSinConexion() {
  const estado = useConexion()
  const [aviso, setAviso] = useState('')
  const [hayNoEnviados, setHayNoEnviados] = useState(false)
  const [verNoEnviados, setVerNoEnviados] = useState(false)
  const admin = esAdmin()

  useEffect(() => {
    if (!estado.sin) return
    const id = window.setInterval(() => {
      if (!navigator.onLine) return
      fetch('/api/health', { cache: 'no-store' })
        .then((r) => r.ok && (r.headers.get('server') ?? '').toLowerCase().includes('uvicorn') && confirmarServidor())
        .catch(() => undefined)
    }, SONDEO_MS)
    return () => window.clearInterval(id)
  }, [estado.sin])

  // Con servidor y algo en la cola: se sube (una sola subida a la vez, ver sincronizar()).
  useEffect(() => {
    if (estado.sin || estado.cola === 0) return
    let vivo = true
    void sincronizar().then(({ subidos, rechazados, conflictos }) => {
      if (!vivo) return
      const partes = [
        subidos > 0 ? `Se ${subidos === 1 ? 'envió 1 cambio pendiente' : `enviaron ${subidos} cambios pendientes`}` : '',
        conflictos.length ? `${conflictos.join(', ')}: alguien lo guardó desde otro lugar o no se aceptó; sus cambios quedaron apartados en el documento` : '',
        rechazados.length ? `No se aceptó ${rechazados.join(', ')}; quedó guardado en este equipo` : '',
      ].filter(Boolean)
      setHayNoEnviados(rechazados.length > 0)
      if (partes.length) setAviso(partes.join(' · '))
    })
    return () => {
      vivo = false
    }
  }, [estado.sin, estado.cola])

  useEffect(() => {
    // Lo que no se aceptó se queda a la vista hasta que la persona lo mira.
    if (!aviso || hayNoEnviados) return
    const id = window.setTimeout(() => setAviso(''), 8000)
    return () => window.clearTimeout(id)
  }, [aviso, hayNoEnviados])

  const dialogo = <DialogoNoEnviados abierto={verNoEnviados} alCerrar={() => { setVerNoEnviados(false); setAviso(''); setHayNoEnviados(false) }} />

  if (!estado.sin && aviso) {
    return (
      <>
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, sm: 2 }, py: 0.5, bgcolor: hayNoEnviados ? PALETA.avisoFondo : PALETA.exitoFondo, borderBottom: `1px solid ${hayNoEnviados ? PALETA.avisoBorde : PALETA.exitoBorde}`, color: PALETA.texto, fontSize: 13, lineHeight: 1.35 }}>
          <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{aviso}</Box>
          {hayNoEnviados && <Button size="small" variant="outlined" sx={{ flexShrink: 0, py: 0 }} onClick={() => setVerNoEnviados(true)}>Ver</Button>}
        </Box>
        {dialogo}
      </>
    )
  }
  // La franja de conexión, solo para el administrador (Edison 2026-10-18).
  if (!estado.sin || !admin) return null
  return (
    <Box
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.75, px: { xs: 1.5, sm: 2 }, py: 0.5,
        bgcolor: PALETA.avisoFondo, borderBottom: `1px solid ${PALETA.avisoBorde}`, color: PALETA.avisoOscuro,
        fontSize: 13, lineHeight: 1.35,
      }}
    >
      <CloudOffIcon sx={{ fontSize: 16, flexShrink: 0 }} />
      <Box component="span" sx={{ minWidth: 0 }}>
        {textoFranja(estado.momento)}
        {estado.cola > 0 && ` · ${estado.cola} por enviar`}
      </Box>
    </Box>
  )
}

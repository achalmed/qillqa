/**
 * «Actualizar» discreto (2026-10-18, Edison: «recargar la información cuando otros cambian algo, sin
 * borrar el trabajo pendiente»). Un ícono pequeño que gira mientras relee; cada módulo le pasa su
 * `cargar`, que repone la lista o el documento desde el servidor. No toca diálogos abiertos ni lo que
 * espera en la cola sin conexión: solo vuelve a leer. Sitio fijo: `BarraModulo` lo pone junto al «⋮»;
 * la bandeja y el editor lo usan en su propia barra.
 */
import { useEffect, useRef, useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import RefreshIcon from '@mui/icons-material/Refresh'

export default function BotonActualizar({ alActualizar, etiqueta = 'Actualizar', tamano = 'small', color = 'text.secondary' }: {
  /** Vuelve a leer; si devuelve una promesa, el ícono gira hasta que termine. */
  alActualizar: () => void | Promise<unknown>
  etiqueta?: string
  tamano?: 'small' | 'medium'
  /** Color del ícono: `inherit` sobre el encabezado vino del editor. */
  color?: string
}) {
  const [girando, setGirando] = useState(false)
  const vivo = useRef(true)
  useEffect(() => () => { vivo.current = false }, [])
  const pulsar = async () => {
    if (girando) return
    setGirando(true)
    const desde = Date.now()
    try {
      await alActualizar()
    } catch {
      /* el módulo ya muestra su propio error */
    } finally {
      // Al menos media vuelta: una relectura instantánea también se nota.
      window.setTimeout(() => { if (vivo.current) setGirando(false) }, Math.max(0, 450 - (Date.now() - desde)))
    }
  }
  return (
    <Tooltip title={etiqueta} disableInteractive>
      <span>
        <IconButton size={tamano} onClick={() => void pulsar()} aria-label={etiqueta} disabled={girando} sx={{ color, '&.Mui-disabled': { color, opacity: 0.7 } }}>
          <RefreshIcon fontSize={tamano} sx={{ '@keyframes sgdp-girar': { to: { transform: 'rotate(360deg)' } }, animation: girando ? 'sgdp-girar 0.9s linear infinite' : 'none' }} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

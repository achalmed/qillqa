/**
 * «Hacerlo al volver» (alvolver.ts, 2026-10-18). `ofrecerAlVolver` explica en una línea por qué
 * algo espera al servidor y ofrece recordarlo; el componente, en el marco, muestra lo recordado en
 * cuanto el servidor contesta, con «Hacer ahora» (abre el documento y retoma la acción) y «Quitar».
 * Lo ve cada persona con lo suyo: no es la franja de conexión del administrador.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import { EVENTO_CACHE, leyendoDeCache } from '../api'
import { accionesAlVolver, EVENTO_AL_VOLVER, POR_QUE, quitarAccion, recordarAlVolver, type TipoAlVolver } from '../alvolver'
import { avisoBreve } from '../avisoBreve'
import { confirmar } from './Dialogos'
import { PALETA } from '../paleta'

/** Sin servidor: «Numerar necesita el servidor…» + «Hacerlo al volver». true si se recordó. */
export async function ofrecerAlVolver(tipo: TipoAlVolver, rotulo: string, rutaWeb: string): Promise<boolean> {
  if (!rutaWeb) {
    avisoBreve(`${POR_QUE[tipo]} Inténtelo cuando vuelva la conexión.`)
    return false
  }
  const si = await confirmar(`${POR_QUE[tipo]} ¿Se lo recuerdo cuando vuelva la conexión?`, {
    titulo: 'Sin conexión',
    aceptar: 'Hacerlo al volver',
    cancelar: 'Ahora no',
  })
  if (!si) return false
  recordarAlVolver(tipo, rotulo, rutaWeb)
  avisoBreve('Listo: se lo recordaré cuando vuelva la conexión.')
  return true
}

export default function AvisoAlVolver() {
  const navegar = useNavigate()
  const calcular = () => (navigator.onLine && !leyendoDeCache() ? accionesAlVolver() : [])
  const [lista, setLista] = useState(calcular)
  useEffect(() => {
    const recalcular = () => setLista(calcular())
    window.addEventListener(EVENTO_AL_VOLVER, recalcular)
    window.addEventListener(EVENTO_CACHE, recalcular)
    window.addEventListener('online', recalcular)
    window.addEventListener('offline', recalcular)
    return () => {
      window.removeEventListener(EVENTO_AL_VOLVER, recalcular)
      window.removeEventListener(EVENTO_CACHE, recalcular)
      window.removeEventListener('online', recalcular)
      window.removeEventListener('offline', recalcular)
    }
  }, [])
  if (lista.length === 0) return null
  return (
    <Box role="status" sx={{ px: { xs: 1.5, sm: 2 }, py: 0.5, bgcolor: PALETA.superficieTenue, borderBottom: `1px solid ${PALETA.borde}` }}>
      {lista.map((a) => (
        <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, lineHeight: 1.35, minHeight: 32 }}>
          <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: { xs: 'normal', sm: 'nowrap' } }}>
            Ya hay conexión · {a.rotulo}
          </Box>
          <Button
            size="small"
            variant="outlined"
            sx={{ flexShrink: 0, py: 0 }}
            onClick={() => {
              quitarAccion(a.id)
              navegar(a.ruta)
            }}
          >
            Hacer ahora
          </Button>
          <IconButton size="small" aria-label="Quitar el recordatorio" onClick={() => quitarAccion(a.id)}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      ))}
    </Box>
  )
}

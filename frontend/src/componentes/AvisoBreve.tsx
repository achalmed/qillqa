/** El aviso breve del momento (avisoBreve.ts): abajo, cuatro segundos, sin ícono de alarma. */
import { useEffect, useState } from 'react'
import Snackbar from '@mui/material/Snackbar'
import { EVENTO_AVISO_BREVE } from '../avisoBreve'

export default function AvisoBreve() {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const oir = (e: Event) => {
      setTexto((e as CustomEvent<string>).detail)
      setAbierto(true)
    }
    window.addEventListener(EVENTO_AVISO_BREVE, oir)
    return () => window.removeEventListener(EVENTO_AVISO_BREVE, oir)
  }, [])
  return (
    <Snackbar
      open={abierto}
      autoHideDuration={4000}
      onClose={(_, motivo) => motivo !== 'clickaway' && setAbierto(false)}
      message={texto}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ bottom: { xs: 'calc(76px + env(safe-area-inset-bottom))', sm: 24 } }}
    />
  )
}

/**
 * «Abrir carpeta» (2026-10-18): sin servidor, un PDF que está en la carpeta sincronizada se abre de
 * ahí (sync/carpetaLocal.ts). Si Chrome pide confirmar el permiso, solo lo concede tras un clic:
 * esta ventanita lo pide una vez para todos los PDF que esperan. Chrome lo recuerda («Permitir
 * siempre») y desde entonces no aparece.
 */
import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import { EVENTO_PERMISO, type PedidoPermiso } from '../sync/carpetaLocal'

export default function PermisoCarpeta() {
  const [pedido, setPedido] = useState<PedidoPermiso | null>(null)
  useEffect(() => {
    const oir = (e: Event) => setPedido((e as CustomEvent<PedidoPermiso>).detail)
    window.addEventListener(EVENTO_PERMISO, oir)
    return () => window.removeEventListener(EVENTO_PERMISO, oir)
  }, [])
  if (!pedido) return null
  const cerrar = () => {
    pedido.rechazar()
    setPedido(null)
  }
  return (
    <Dialog open onClose={cerrar} maxWidth="xs" fullWidth>
      <DialogContent sx={{ pb: 1 }}>
        <Typography variant="body2">
          Este archivo está en su carpeta sincronizada «{pedido.carpeta}». Permita abrirla para verlo.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={cerrar}>Ahora no</Button>
        <Button
          variant="contained"
          onClick={() => {
            void pedido.conceder()
            setPedido(null)
          }}
        >
          Abrir carpeta
        </Button>
      </DialogActions>
    </Dialog>
  )
}

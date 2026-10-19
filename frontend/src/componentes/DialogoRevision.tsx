/**
 * «Enviar a revisión» con delegación (Edison 2026-10-10): una ventana para elegir a quién se
 * le encarga revisar el documento y qué se le pide. El servidor (PUT /estado con
 * `responsable_id` y `comentario`) registra quién delega, a quién y deja la nota; el estado
 * de la revisión se sigue en el panel de seguimiento (responsable, observaciones, estado).
 */
import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../api'

interface Miembro {
  id: number
  nombre_completo: string
  rol: string
  cargo?: string
}

export default function DialogoRevision({ abierto, alCerrar, alEnviar, responsableActual }: {
  abierto: boolean
  alCerrar: () => void
  /** Se llama con la persona elegida (o null: sin cambiar el responsable) y la nota. */
  /** Resuelve `true` si el envío se registró: solo entonces se cierra el diálogo. */
  alEnviar: (responsableId: number | null, nota: string) => Promise<boolean>
  responsableActual?: number | null
}) {
  const [equipo, setEquipo] = useState<Miembro[]>([])
  const [quien, setQuien] = useState<number | ''>('')
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (!abierto) return
    api<Miembro[]>('/api/admin/equipo').then((e) => setEquipo(e.filter((m) => m.rol !== 'invitado'))).catch(() => setEquipo([]))
    setQuien(responsableActual ?? '')
    setNota('')
  }, [abierto, responsableActual])
  // Mi id sale del JWT (`sgdp_usuario_id` nunca se escribe en localStorage; auditoría
  // 2026-10-10, GD-06): así la lista no me ofrece a mí mismo como revisor.
  const yo = miIdDesdeToken()
  const enviar = async () => {
    setOcupado(true)
    try {
      // Cierra solo si el servidor aceptó: antes se cerraba aunque fallara y el aviso de
      // error quedaba detrás sin que se notara (GD-06).
      if (await alEnviar(quien === '' ? null : Number(quien), nota.trim())) alCerrar()
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="xs" fullWidth>
      <DialogTitle>Enviar a revisión</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          Elija quién revisa el documento. Recibirá un aviso y lo verá en su bandeja como pendiente.
        </Typography>
        <TextField select label="Quién lo revisa" value={quien} onChange={(e) => setQuien(e.target.value === '' ? '' : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value=""><em>Sin asignar a nadie en particular</em></MenuItem>
          {equipo.filter((m) => m.id !== yo).map((m) => (
            <MenuItem key={m.id} value={m.id}>{m.nombre_completo}{m.cargo ? ` · ${m.cargo}` : ` · ${m.rol}`}</MenuItem>
          ))}
        </TextField>
        <TextField label="Qué revisar (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} multiline minRows={2} placeholder="p. ej. revisar la base legal del segundo párrafo" />
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" onClick={() => void enviar()} disabled={ocupado}>Enviar a revisión</Button>
      </DialogActions>
    </Dialog>
  )
}

function miIdDesdeToken(): number {
  try {
    const t = localStorage.getItem('sgdp_token') ?? ''
    return Number(JSON.parse(atob(t.split('.')[1])).sub)
  } catch {
    return 0
  }
}

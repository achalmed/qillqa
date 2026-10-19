/**
 * DIÁLOGOS DEL SISTEMA (2026-10-06, Edison: «la ventanita de mensaje no es del sistema, usa la del
 * navegador; todas las ventanas de notificaciones y mensajes deben ser nuestras, con nuestros
 * colores y formatos»). Reemplazan a `window.confirm`, `window.prompt` y `window.alert`, que no
 * se usan más en la interfaz.
 *
 *   if (!(await confirmar('¿Eliminar «X»?', { aceptar: 'Eliminar', peligro: true }))) return
 *   const nombre = await pedirTexto('Nombre de la lista', { inicial: '' })   // null si cancela
 *   await avisar('No se pudo mover la tarea.')
 *
 * Son promesas: quien las llama espera la respuesta. `<DialogosSistema />` va montado una sola vez
 * (main.tsx) y pinta el diálogo de turno con el tema del sistema; si se piden dos a la vez, van en
 * fila.
 */
import { useEffect, useRef, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

interface Opciones {
  /** Título en negrita; sin él, el mensaje va solo. */
  titulo?: string
  /** Texto del botón que acepta («Eliminar», «Desbloquear»…); por omisión «Aceptar». */
  aceptar?: string
  /** Texto del botón que cancela; por omisión «Cancelar». */
  cancelar?: string
  /** El botón de aceptar en rojo: la acción borra o anula algo. */
  peligro?: boolean
}

interface OpcionesTexto extends Opciones {
  inicial?: string
  /** Una caja de varias líneas (notas, descripciones). */
  multilinea?: boolean
  etiqueta?: string
}

type Pedido =
  | { tipo: 'confirmar'; mensaje: string; op: Opciones; resolver: (v: boolean) => void }
  | { tipo: 'texto'; mensaje: string; op: OpcionesTexto; resolver: (v: string | null) => void }
  | { tipo: 'aviso'; mensaje: string; op: Opciones; resolver: () => void }

const cola: Pedido[] = []
let avisarCambio: (() => void) | null = null

function pedir(p: Pedido) {
  cola.push(p)
  avisarCambio?.()
}

/** ¿Sí o no? Resuelve true solo si se pulsa el botón de aceptar. */
export function confirmar(mensaje: string, op: Opciones = {}): Promise<boolean> {
  return new Promise((resolver) => pedir({ tipo: 'confirmar', mensaje, op, resolver }))
}

/** Un texto: el escrito (sin recortar) o null si se cancela. */
export function pedirTexto(mensaje: string, op: OpcionesTexto = {}): Promise<string | null> {
  return new Promise((resolver) => pedir({ tipo: 'texto', mensaje, op, resolver }))
}

/** Un aviso con un solo botón. */
export function avisar(mensaje: string, op: Opciones = {}): Promise<void> {
  return new Promise((resolver) => pedir({ tipo: 'aviso', mensaje, op, resolver }))
}

export function DialogosSistema() {
  const [actual, setActual] = useState<Pedido | null>(null)
  const [texto, setTexto] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const siguiente = () => setActual((a) => {
      if (a || !cola.length) return a
      const p = cola.shift()!
      if (p.tipo === 'texto') setTexto(p.op.inicial ?? '')
      return p
    })
    avisarCambio = siguiente
    siguiente()
    return () => { avisarCambio = null }
  }, [])

  const cerrar = (aceptado: boolean) => {
    if (!actual) return
    if (actual.tipo === 'confirmar') actual.resolver(aceptado)
    else if (actual.tipo === 'texto') actual.resolver(aceptado ? texto : null)
    else actual.resolver()
    setActual(null)
    // El siguiente de la fila, después de que este se cierre.
    setTimeout(() => avisarCambio?.(), 0)
  }

  const op = actual?.op ?? {}
  return (
    <Dialog
      open={actual !== null}
      onClose={() => cerrar(false)}
      fullWidth
      maxWidth="xs"
      TransitionProps={{ onEntered: () => campo.current?.select() }}
    >
      {op.titulo && <DialogTitle sx={{ pb: 1 }}>{op.titulo}</DialogTitle>}
      <DialogContent sx={{ pt: op.titulo ? 0 : 2.5 }}>
        <Typography sx={{ whiteSpace: 'pre-line', fontSize: 15, lineHeight: 1.5 }}>{actual?.mensaje}</Typography>
        {actual?.tipo === 'texto' && (
          <TextField
            inputRef={campo}
            autoFocus
            fullWidth
            size="small"
            label={actual.op.etiqueta}
            value={texto}
            multiline={actual.op.multilinea}
            minRows={actual.op.multilinea ? 3 : undefined}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !actual.op.multilinea) { e.preventDefault(); cerrar(true) } }}
            sx={{ mt: 2 }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {actual?.tipo !== 'aviso' && <Button onClick={() => cerrar(false)}>{op.cancelar ?? 'Cancelar'}</Button>}
        <Button
          variant="contained"
          color={op.peligro ? 'error' : 'primary'}
          autoFocus={actual?.tipo !== 'texto'}
          onClick={() => cerrar(true)}
        >
          {op.aceptar ?? (actual?.tipo === 'aviso' ? 'Entendido' : 'Aceptar')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

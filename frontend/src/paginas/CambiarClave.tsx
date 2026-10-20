/**
 * Cambio de contraseña — la propia, no la de otros (Edison 2026-09-05).
 *
 * Dos modos, la misma pantalla:
 *
 *  · OBLIGATORIO (`/clave`, con la marca `debe_cambiar_clave`): la persona
 *    entró con la clave temporal que el administrador le mandó por WhatsApp y
 *    el sistema no la deja hacer nada más hasta que elija la suya. No hay
 *    «Cancelar»: solo cambiarla o salir. El bloqueo real está en el servidor
 *    (428 `clave_temporal`), así que esconder botones no es lo que protege.
 *  · VOLUNTARIO (desde el menú del usuario): la misma pantalla, con vuelta a
 *    la bandeja.
 *
 * Primer ingreso (2026-10-18): si además le toca confirmar sus datos, esta es el paso 1 de 2 y al
 * guardar sigue a /bienvenida (Bienvenida.tsx), con la misma carcasa (PasoIngreso.tsx).
 *
 * Pide la contraseña ACTUAL aunque la sesión ya esté abierta: si alguien deja
 * el sistema abierto en una computadora ajena, que no le puedan cambiar la
 * clave y dejarlo fuera de su propia cuenta.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import LockResetIcon from '@mui/icons-material/LockReset'
import { api, cerrarSesion, claveTemporalRecordada, leyendoDeCache, recordarClaveTemporal } from '../api'
import PasoIngreso from '../componentes/PasoIngreso'

// Debe coincidir con seguridad.py::LARGO_MINIMO_CLAVE (el servidor manda).
const LARGO_MINIMO = 8

export default function CambiarClave() {
  const navegar = useNavigate()
  const obligatorio = localStorage.getItem('sgdp_clave_temporal') === 'si'
  // Recién llegados del login con la clave temporal: ya está escrita (solo en
  // memoria) y la persona empieza por la nueva. Tras un refresco se pide.
  const [actual, setActual] = useState(() => (obligatorio ? claveTemporalRecordada() : ''))
  const actualRecordada = obligatorio && actual !== '' && actual === claveTemporalRecordada()
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Se mide y se compara la clave YA sin los espacios de los bordes, que es
  // como el servidor la guarda (seguridad.py::_normalizar). Antes «MiClave» y
  // «MiClave » se veían como distintas aquí y como iguales allá.
  // La marca local de «clave temporal» puede haber quedado vieja (la clave se
  // cambió en otra pestaña o equipo). Se pregunta al servidor: si deja pasar,
  // la marca sobra y se va a la bandeja; si responde 428, sigue aquí.
  useEffect(() => {
    if (!obligatorio) return
    api('/api/notificaciones')
      .then(() => {
        // Una copia del caché (sin servidor) no prueba nada: se ignora.
        if (leyendoDeCache()) return
        localStorage.removeItem('sgdp_clave_temporal')
        navegar('/', { replace: true })
      })
      .catch(() => {})
  }, [obligatorio, navegar])

  const limpiaNueva = nueva.trim()
  const limpiaRepetir = repetir.trim()
  const cortas = limpiaNueva.length > 0 && limpiaNueva.length < LARGO_MINIMO
  const noCoinciden = limpiaRepetir.length > 0 && limpiaNueva !== limpiaRepetir
  const listo =
    actual.trim().length > 0 &&
    limpiaNueva.length >= LARGO_MINIMO &&
    limpiaNueva === limpiaRepetir

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError('')
    setGuardando(true)
    try {
      // El servidor devuelve un token NUEVO: el anterior se emitió cuando la
      // cuenta todavía estaba bloqueada por la clave temporal.
      const r = await api<{ token: string; debe_completar_datos?: boolean }>('/api/auth/clave', {
        method: 'POST',
        body: JSON.stringify({
          clave_actual: actual.trim(),
          clave_nueva: limpiaNueva,
        }),
      })
      localStorage.setItem('sgdp_token', r.token)
      localStorage.removeItem('sgdp_clave_temporal')
      recordarClaveTemporal('')
      // Paso 2 del primer ingreso: sus datos (2026-10-18).
      if (r.debe_completar_datos) {
        localStorage.setItem('sgdp_datos_pendientes', 'si')
        navegar('/bienvenida', { replace: true })
        return
      }
      navegar('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <PasoIngreso
      icono={<LockResetIcon color="primary" />}
      titulo={obligatorio ? 'Elija su contraseña' : 'Cambiar mi contraseña'}
      paso={obligatorio ? 1 : undefined}
      alEnviar={guardar}
    >
      {obligatorio && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Su contraseña es <b>temporal</b>. Elija una propia para continuar; nadie más la sabrá.
          <Box component="span" sx={{ display: 'block', mt: 0.75, fontSize: 12.5 }}>
            Si el navegador avisa «contraseña filtrada», es por la temporal: ciérrelo.
          </Box>
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Oculto y solo para el gestor de contraseñas: le dice de QUÉ cuenta
          es la clave que se está cambiando, sin lo cual no ofrece
          actualizar la que tiene guardada. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={localStorage.getItem('sgdp_usuario') ?? ''}
        readOnly
        hidden
      />
      <TextField
        label={obligatorio ? 'Contraseña temporal (la que le enviaron)' : 'Contraseña actual'}
        type="password"
        name="clave-actual"
        autoComplete="current-password"
        fullWidth
        margin="normal"
        autoFocus={!actualRecordada}
        value={actual}
        helperText={actualRecordada ? 'Ya está escrita: es la que usó para entrar.' : ' '}
        onChange={(e) => setActual(e.target.value)}
      />
      <TextField
        label="Contraseña nueva"
        type="password"
        name="clave-nueva"
        autoComplete="new-password"
        fullWidth
        margin="normal"
        autoFocus={actualRecordada}
        value={nueva}
        error={cortas}
        helperText={
          cortas
            ? `Al menos ${LARGO_MINIMO} caracteres.`
            : `Mínimo ${LARGO_MINIMO} caracteres. Sirve una frase corta que recuerde.`
        }
        onChange={(e) => setNueva(e.target.value)}
      />
      <TextField
        label="Repita la contraseña nueva"
        type="password"
        name="clave-repetir"
        autoComplete="new-password"
        fullWidth
        margin="normal"
        value={repetir}
        error={noCoinciden}
        helperText={noCoinciden ? 'Las dos contraseñas no son iguales.' : ' '}
        onChange={(e) => setRepetir(e.target.value)}
      />

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" fullWidth size="large" disabled={!listo || guardando}>
          Guardar contraseña
        </Button>
        {obligatorio ? (
          <Button onClick={cerrarSesion} disabled={guardando}>
            Salir
          </Button>
        ) : (
          <Button onClick={() => navegar('/')} disabled={guardando}>
            Cancelar
          </Button>
        )}
      </Stack>
    </PasoIngreso>
  )
}

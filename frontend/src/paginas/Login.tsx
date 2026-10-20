import { useState } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { api, recordarClaveTemporal } from '../api'

interface RespuestaLogin {
  token: string
  usuario: { nombre: string; rol: string; debe_cambiar_clave?: boolean; debe_completar_datos?: boolean }
}

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  // «¿Olvidaste tu contraseña?»: avisa al administrador, que restablece la
  // cuenta a su clave inicial. No hay correo de recuperación porque el sistema
  // no guarda correos de los usuarios (ver api/auth.py::olvide_mi_clave).
  const [dlgOlvide, setDlgOlvide] = useState(false)
  const [usuarioOlvido, setUsuarioOlvido] = useState('')
  const [avisoOlvido, setAvisoOlvido] = useState('')
  const navegar = useNavigate()

  const pedirAyuda = async () => {
    try {
      const r = await api<{ mensaje: string }>('/api/auth/olvide', {
        method: 'POST',
        body: JSON.stringify({ usuario: usuarioOlvido }),
      })
      setAvisoOlvido(r.mensaje)
      setUsuarioOlvido('')
    } catch {
      // La respuesta es siempre la misma, exista o no la cuenta: si fallara
      // distinto, se podría averiguar qué usuarios hay probando nombres.
      setAvisoOlvido('Aviso enviado. El administrador de la entidad lo atenderá.')
    }
  }

  const entrar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError('')
    setCargando(true)
    try {
      const datos = await api<RespuestaLogin>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usuario: usuario.trim(), clave: clave.trim() }),
      })
      localStorage.setItem('sgdp_token', datos.token)
      localStorage.setItem('sgdp_usuario', usuario.trim())
      localStorage.setItem('sgdp_nombre', datos.usuario.nombre)
      localStorage.setItem('sgdp_rol', datos.usuario.rol)
      // Clave TEMPORAL (la puso el administrador y viajó por un mensaje): antes
      // de nada, la persona elige la suya. El servidor también lo exige, así
      // que esto solo evita el rebote feo de entrar y ser expulsado.
      // Datos al primer ingreso (2026-10-18): después de la contraseña (si es temporal), sus datos.
      if (datos.usuario.debe_completar_datos) localStorage.setItem('sgdp_datos_pendientes', 'si')
      else localStorage.removeItem('sgdp_datos_pendientes')
      localStorage.setItem('sgdp_pasos_ingreso', datos.usuario.debe_cambiar_clave && datos.usuario.debe_completar_datos ? '2' : '1')
      if (datos.usuario.debe_cambiar_clave) {
        localStorage.setItem('sgdp_clave_temporal', 'si')
        recordarClaveTemporal(clave.trim())
        navegar('/clave', { replace: true })
        return
      }
      localStorage.removeItem('sgdp_clave_temporal')
      navegar(datos.usuario.debe_completar_datos ? '/bienvenida' : '/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Box
      sx={{
        // 100dvh: en el celular la barra del navegador y el teclado no
        // empujan el formulario fuera de la vista.
        minHeight: '100dvh',
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'center',
        bgcolor: 'background.default',
        pt: { xs: 4, sm: 2 },
        px: 2,
        pb: 2,
      }}
    >
      {/* La tarjeta se ajusta al ancho del celular (360 px) sin desbordar. */}
      <Card variant="outlined" sx={{ width: '100%', maxWidth: 380, borderRadius: 3.5, p: 1 }}>
        <CardContent component="form" onSubmit={entrar}>
          <Typography variant="h5" gutterBottom>
            Qillqa
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            {import.meta.env.VITE_NOMBRE_DESPACHO || 'Entidad de demostración'}
          </Typography>
          {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
          <TextField
            label="Usuario o correo institucional"
            name="usuario"
            autoComplete="username"
            fullWidth
            margin="normal"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
          />
          <TextField
            label="Contraseña"
            type="password"
            name="clave"
            autoComplete="current-password"
            fullWidth
            margin="normal"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            sx={{ mt: 2 }}
            disabled={cargando || !usuario || !clave}
          >
            Ingresar
          </Button>
          <Box sx={{ textAlign: 'center', mt: 1.5 }}>
            <Link
              component="button"
              type="button"
              variant="body2"
              underline="hover"
              onClick={() => {
                setUsuarioOlvido(usuario)
                setAvisoOlvido('')
                setDlgOlvide(true)
              }}
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dlgOlvide} onClose={() => setDlgOlvide(false)} fullWidth maxWidth="xs">
        <DialogTitle>¿Olvidaste tu contraseña?</DialogTitle>
        <DialogContent>
          {avisoOlvido ? (
            <Alert severity="success" sx={{ mt: 1 }}>
              {avisoOlvido}
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Escriba su usuario y avisamos al administrador de la entidad. Él
                restablece su contraseña y se lo comunica; al entrar, usted
                elige una nueva.
              </Typography>
              <TextField
                autoFocus
                fullWidth
                size="small"
                label="Su usuario"
                value={usuarioOlvido}
                onChange={(e) => setUsuarioOlvido(e.target.value)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgOlvide(false)}>
            {avisoOlvido ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!avisoOlvido && (
            <Button
              variant="contained"
              onClick={pedirAyuda}
              disabled={usuarioOlvido.trim().length < 3}
            >
              Avisar al administrador
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  )
}

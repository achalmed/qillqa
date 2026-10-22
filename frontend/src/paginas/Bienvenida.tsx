/**
 * BIENVENIDA — los datos al primer ingreso (2026-10-18). Edison: «cuando una persona entra por
 * primera vez, que el sistema le pida completar sus datos antes de seguir». Nombres, celular, correo
 * y cargo, ya llenos con lo que puso quien administra: la persona confirma o corrige. No se salta:
 * el servidor responde 428 `datos_pendientes` a todo lo demás hasta que se guarda aquí
 * (`POST /api/cuenta/bienvenida`, que también pone al día su ficha del directorio). A quien tiene
 * un cargo exceptuado (el titular, de fábrica) no se le pide: lo configura Administración → Cuentas.
 * Si además tenía la contraseña temporal, este es el paso 2 de 2 (PasoIngreso.tsx).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import WavingHandOutlinedIcon from '@mui/icons-material/WavingHandOutlined'
import { api, cerrarSesion } from '../api'
import PasoIngreso from '../componentes/PasoIngreso'
import { celularLegible, errorDe, nombresParaEditar, normalizarCelular, problemaBienvenida, type DatosBienvenida, type MiPerfil } from '../perfil'

type Perfil = MiPerfil & { bienvenida: boolean }

export default function Bienvenida() {
  const navegar = useNavigate()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [d, setD] = useState<DatosBienvenida>({ nombres: '', apellidos: '', celular: '', email: '', cargo: '' })
  const [tocado, setTocado] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const entrar = () => {
    localStorage.removeItem('qillqa_datos_pendientes')
    localStorage.removeItem('qillqa_pasos_ingreso')
    navegar('/', { replace: true })
  }

  useEffect(() => {
    api<Perfil>('/api/cuenta/perfil')
      .then((p) => {
        // Ya no le toca (lo confirmó en otra pestaña, o su cargo está exceptuado): adelante.
        if (!p.bienvenida) return entrar()
        const n = nombresParaEditar(p)
        setPerfil(p)
        setD({
          nombres: n.nombres, apellidos: n.apellidos, celular: celularLegible(p.celular), email: p.email,
          // Con un solo cargo posible, ya elegido.
          cargo: p.cargo && p.cargos.includes(p.cargo) ? p.cargo : p.cargos.length === 1 ? p.cargos[0] : '',
        })
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron leer sus datos.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const problema = problemaBienvenida(d)
  const poner = (campo: keyof DatosBienvenida) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [campo]: e.target.value }))
  const marca = (campo: 'nombres' | 'apellidos' | 'celular' | 'email') => {
    const e = tocado || d[campo] ? (d[campo].trim() ? errorDe(campo, d[campo]) : tocado ? 'Obligatorio.' : '') : ''
    return { error: e !== '', helperText: e || ' ' }
  }

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setTocado(true)
    setError('')
    if (problema) return
    setGuardando(true)
    try {
      await api('/api/cuenta/bienvenida', {
        method: 'POST',
        body: JSON.stringify({ ...d, celular: normalizarCelular(d.celular) ?? d.celular }),
      })
      entrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar sus datos.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <PasoIngreso icono={<WavingHandOutlinedIcon color="primary" />} titulo="Le damos la bienvenida" paso={2} ancho={480} alEnviar={guardar}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Confirme sus datos para empezar. Así el equipo le encuentra en el directorio y en el chat.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {!perfil && !error && <LinearProgress sx={{ mb: 2 }} />}
      {perfil && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 1.5, rowGap: 1 }}>
          <TextField label="Nombres" name="given-name" autoComplete="given-name" value={d.nombres} onChange={poner('nombres')} {...marca('nombres')} />
          <TextField label="Apellidos" name="family-name" autoComplete="family-name" value={d.apellidos} onChange={poner('apellidos')} {...marca('apellidos')} />
          <TextField
            label="Celular" type="tel" name="tel-national" autoComplete="tel-national" value={d.celular} onChange={poner('celular')}
            {...marca('celular')} inputProps={{ inputMode: 'tel', maxLength: 16 }}
            InputProps={{ startAdornment: <InputAdornment position="start">+51</InputAdornment> }}
          />
          <TextField label="Correo" type="email" name="email" autoComplete="email" value={d.email} onChange={poner('email')} {...marca('email')} inputProps={{ inputMode: 'email' }} />
          <TextField
            select label="Cargo" value={d.cargo} onChange={poner('cargo')} sx={{ gridColumn: '1 / -1' }}
            error={tocado && !d.cargo} helperText={tocado && !d.cargo ? 'Elija su cargo.' : perfil.cargos.length > 1 ? 'Si no está el suyo, avise a quien administra.' : ' '}
          >
            {perfil.cargos.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
        </Box>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button type="submit" variant="contained" fullWidth size="large" disabled={!perfil || guardando}>
          Guardar y entrar
        </Button>
        <Button onClick={cerrarSesion} disabled={guardando}>Salir</Button>
      </Stack>
    </PasoIngreso>
  )
}

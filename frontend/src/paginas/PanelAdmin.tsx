/**
 * ADMINISTRACIÓN (`/admin`) — ordenada en secciones (Edison 2026-10-18: «más ordenada y completa»).
 * Las secciones son las opciones del módulo (navegacion.ts): pestañas en escritorio y el botón
 * flotante en el celular, como en todos los módulos; la página lee `?seccion=`.
 *
 *   Resumen        lo pendiente y el estado del sistema (admin/Resumen.tsx)
 *   Cuentas        cuentas, contraseñas olvidadas y datos al primer ingreso (admin/Cuentas.tsx)
 *   Módulos        encender y apagar; la mesa de partes virtual (admin/Modulos.tsx)
 *   Avisos         aviso a todos (AdminAnuncio.tsx)
 *   Reglas         lo que el sistema hace solo y las copias sugeridas (AdminReglas, ReglasCopia)
 *   Integraciones  el STD del Congreso y OpenProject (AdminEnlaceStd, OpenProject)
 *
 * Las cuentas, los avisos de contraseña y los módulos se cargan aquí: el Resumen y su sección los usan.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import Alert from '@mui/material/Alert'
import Container from '@mui/material/Container'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import { api } from '../api'
import { recordarModulos, type EstadoModulo } from '../modulos'
import Marco from '../componentes/Marco'
import AdminAnuncio from '../componentes/AdminAnuncio'
import AdminEnlaceStd from '../componentes/AdminEnlaceStd'
import AdminReglas from '../componentes/AdminReglas'
import ReglasCopia from '../componentes/ReglasCopia'
import ReglasNotas from '../componentes/ReglasNotas'
import { AdminOpenProject } from '../componentes/OpenProject'
import Cuentas, { type Estado, type SolicitudClave, type UsuarioAdmin } from '../componentes/admin/Cuentas'
import Modulos from '../componentes/admin/Modulos'
import Resumen from '../componentes/admin/Resumen'
import Uso from '../componentes/admin/Uso'

const SECCIONES: Record<string, { titulo: string; texto: string }> = {
  resumen: { titulo: 'Resumen', texto: 'Lo que pide atención y el estado del sistema.' },
  cuentas: { titulo: 'Cuentas', texto: 'Quién entra al sistema, con qué cargo y qué le falta.' },
  modulos: { titulo: 'Módulos', texto: 'Qué partes del sistema están en uso.' },
  avisos: { titulo: 'Avisos', texto: 'Un mensaje en la pantalla de todos.' },
  reglas: { titulo: 'Reglas', texto: 'Lo que el sistema hace o propone solo.' },
  integraciones: { titulo: 'Integraciones', texto: 'Los otros sistemas con los que trabaja.' },
  uso: { titulo: 'Uso', texto: 'Qué se usa, en qué aparatos, con qué errores; cada cuenta y su estado real.' },
}

// Mi propio id sale del JWT (campo sub); sirve para no ofrecerme acciones
// que el backend rechazaría sobre mi propia cuenta (autobloqueo).
function miIdDesdeToken(): number {
  try {
    const t = localStorage.getItem('qillqa_token') ?? ''
    return Number(JSON.parse(atob(t.split('.')[1])).sub)
  } catch {
    return -1
  }
}

export default function PanelAdmin() {
  const [consulta, setConsulta] = useSearchParams()
  const seccion = SECCIONES[consulta.get('seccion') ?? ''] ? (consulta.get('seccion') as string) : 'resumen'
  const miId = useMemo(miIdDesdeToken, [])
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [estado, setEstado] = useState<Estado>('cargando')
  const [solicitudes, setSolicitudes] = useState<SolicitudClave[]>([])
  const [modulos, setModulos] = useState<EstadoModulo[] | null>(null)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const avisar = (tipo: 'success' | 'error', texto: string) => (tipo === 'success' ? setExito(texto) : setError(texto))

  const cargarSolicitudes = () => {
    api<SolicitudClave[]>('/api/admin/solicitudes-clave').then(setSolicitudes).catch(() => setSolicitudes([]))
  }
  const cargar = () => {
    setEstado((e) => (e === 'ok' ? 'ok' : 'cargando'))
    api<UsuarioAdmin[]>('/api/admin/usuarios')
      .then((datos) => {
        setUsuarios(datos)
        setEstado('ok')
      })
      .catch(() => setEstado('error'))
    cargarSolicitudes()
  }
  useEffect(() => {
    cargar()
    api<EstadoModulo[]>('/api/modulos')
      .then((l) => {
        setModulos(l)
        recordarModulos(l)
      })
      .catch(() => setModulos(null))
  }, [])

  const ir = (s: string) => setConsulta(s === 'resumen' ? {} : { seccion: s })
  const { titulo, texto } = SECCIONES[seccion]

  return (
    <Marco modulo="admin">
      <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 3 }, mb: 6, px: { xs: 1.5, sm: 3 } }}>
        {/* La sección ya la dicen la pestaña (escritorio) y la barra (celular): aquí, solo qué es. */}
        <Typography component="h2" variant="body2" color="text.secondary" sx={{ mb: 2 }} aria-label={titulo}>{texto}</Typography>

        {seccion === 'resumen' && <Resumen usuarios={usuarios} solicitudes={solicitudes} modulos={modulos} alIr={ir} />}
        {seccion === 'cuentas' && (
          <Cuentas
            usuarios={usuarios}
            setUsuarios={setUsuarios}
            estado={estado}
            cargar={cargar}
            solicitudes={solicitudes}
            cargarSolicitudes={cargarSolicitudes}
            miId={miId}
            crearAlAbrir={consulta.get('nueva') === '1'}
            alCrearAbierto={() => setConsulta({ seccion: 'cuentas' }, { replace: true })}
            alAvisar={avisar}
          />
        )}
        {seccion === 'modulos' && <Modulos lista={modulos} alCambiar={setModulos} alAvisar={avisar} />}
        {seccion === 'avisos' && <AdminAnuncio />}
        {seccion === 'uso' && <Uso alAvisar={(t) => avisar('success', t)} />}
        {seccion === 'reglas' && (
          <>
            <AdminReglas />
            {/* Copias sugeridas: qué c.c. propone el sistema y en qué documentos. */}
            <ReglasCopia alAvisar={avisar} />
            {/* Notas de sustento normativo: en qué tipos las ofrece el editor (2026-10-19). */}
            <ReglasNotas alAvisar={avisar} />
          </>
        )}
        {seccion === 'integraciones' && (
          <>
            <AdminEnlaceStd />
            <AdminOpenProject alAvisar={avisar} />
          </>
        )}
      </Container>

      <Snackbar
        open={error !== ''}
        autoHideDuration={6000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 76, sm: 24 } }}
      >
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
      <Snackbar
        open={exito !== ''}
        autoHideDuration={3500}
        onClose={() => setExito('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 76, sm: 24 } }}
      >
        <Alert severity="success" onClose={() => setExito('')}>{exito}</Alert>
      </Snackbar>
    </Marco>
  )
}

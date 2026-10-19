/**
 * ADMINISTRACIÓN → CUENTAS (antes, toda la pantalla de Administración; sección propia desde el
 * 2026-10-18): las cuentas del equipo —crear, editar, restablecer la contraseña, activar o
 * desactivar—, los avisos de «¿Olvidó su contraseña?» y los datos al primer ingreso (PrimerIngreso).
 * Las cuentas y los avisos los carga PanelAdmin, que también los resume en «Resumen».
 */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/PersonAddAlt1'
import EditIcon from '@mui/icons-material/Edit'
import KeyIcon from '@mui/icons-material/VpnKey'
import BlockIcon from '@mui/icons-material/Block'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SearchIcon from '@mui/icons-material/Search'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import { api } from '../../api'
import { MAX_ACERCA, celularLegible, errorDe } from '../../perfil'
import { EstadoPieza } from '../Estilo'
import { confirmar } from '../Dialogos'
import CompartirAcceso from './CompartirAcceso'
import PrimerIngreso from './PrimerIngreso'
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined'
import Tarjeta from './Tarjeta'

export interface SolicitudClave {
  id: number
  nombre_usuario: string
  usuario_id: number | null
  existe: boolean
  nota: string
  creado_en: string | null
}

export interface UsuarioAdmin {
  id: number
  nombre_usuario: string
  nombre_completo: string
  // Datos de la persona (Edison 2026-09-05): de nombres + apellidos salen el
  // correo institucional y el usuario; el DNI es la clave inicial.
  nombres: string
  apellidos: string
  dni: string
  email: string
  cargo: string
  // Perfil (2026-10-12): celular (9 dígitos) e «Info»; la persona los cambia en Mi perfil.
  celular: string
  acerca: string
  rol: string
  // Permiso extra de administrar el sistema (no es un cargo de la entidad).
  administrador: boolean
  activo: boolean
  // La cuenta sigue con la clave temporal que entregó el administrador: su
  // dueño todavía no entró a elegir la suya.
  debe_cambiar_clave: boolean
  // Datos al primer ingreso (2026-10-18): se le pedirán al entrar; o su cargo no pasa por ese paso.
  datos_pendientes: boolean
  datos_exceptuado: boolean
  datos_completos_en: string | null
  creado_en: string | null
}

export type Estado = 'cargando' | 'error' | 'ok'
type Avisar = (tipo: 'success' | 'error', texto: string) => void

// El CARGO es lo único que se elige (Edison 2026-09-05: «el rol y el cargo
// son lo mismo»); los permisos los deriva el servidor (cuentas.CARGOS). La
// casilla «Administrador del sistema» es un permiso aparte, no un cargo.
const CARGOS = [
  'Diputado',
  'Asesor principal',
  'Asesor',
  'Coordinador',
  'Asistente',
  'Auxiliar',
  'Técnico',
  'Secretaría',
  'Practicante',
  'Prensa',
  'Invitado',
]

const coincide = (u: UsuarioAdmin, q: string) =>
  !q || [u.nombre_completo, u.nombre_usuario, u.email, u.cargo, u.celular].some((x) => (x ?? '').toLowerCase().includes(q))

/** Las marcas de estado de una cuenta (activa, clave temporal, datos pendientes). */
function Estados({ u }: { u: UsuarioAdmin }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'row', md: 'column' }, flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}>
      <EstadoPieza estado={u.activo ? 'completo' : 'neutro'} texto={u.activo ? 'Activa' : 'Inactiva'} />
      {u.debe_cambiar_clave && (
        <Tooltip title="Entró (o entrará) con la contraseña temporal que usted le dio; el sistema no la deja usar nada hasta que elija la suya.">
          <span><EstadoPieza estado="parcial" texto="clave temporal" /></span>
        </Tooltip>
      )}
      {u.datos_pendientes && (
        <Tooltip title="Al entrar, confirmará sus datos antes de seguir.">
          <span><EstadoPieza estado="parcial" texto="datos pendientes" /></span>
        </Tooltip>
      )}
    </Box>
  )
}

/** Las acciones de una cuenta en el celular: un solo botón ⋮ que abre el
 *  menú (editar, contraseña, activar/desactivar), para que la tarjeta no
 *  se llene de iconos pequeños difíciles de pulsar. */
function MenuCuenta({ u, soyYo, alEditar, alClave, alCompartir, alAlternar }: {
  u: UsuarioAdmin
  soyYo: boolean
  alEditar: () => void
  alClave: () => void
  alCompartir: () => void
  alAlternar: () => void
}) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const hacer = (f: () => void) => () => {
    setAncla(null)
    f()
  }
  return (
    <>
      <IconButton onClick={(e) => setAncla(e.currentTarget)} aria-label={`Acciones de ${u.nombre_usuario}`}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={ancla} open={Boolean(ancla)} onClose={() => setAncla(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={hacer(alCompartir)}>
          <ListItemIcon><ShareOutlinedIcon fontSize="small" /></ListItemIcon>
          Compartir acceso
        </MenuItem>
        <MenuItem onClick={hacer(alEditar)}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          Editar datos
        </MenuItem>
        <MenuItem onClick={hacer(alClave)}>
          <ListItemIcon><KeyIcon fontSize="small" /></ListItemIcon>
          Restablecer contraseña
        </MenuItem>
        <MenuItem onClick={hacer(alAlternar)} disabled={soyYo && u.activo} sx={{ color: u.activo ? 'error.main' : 'success.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}>{u.activo ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}</ListItemIcon>
          {soyYo && u.activo ? 'No puede desactivar su propia cuenta' : u.activo ? 'Desactivar' : 'Activar'}
        </MenuItem>
      </Menu>
    </>
  )
}

export default function Cuentas({
  usuarios,
  setUsuarios,
  estado,
  cargar,
  solicitudes,
  cargarSolicitudes,
  miId,
  crearAlAbrir,
  alCrearAbierto,
  alAvisar,
}: {
  usuarios: UsuarioAdmin[]
  setUsuarios: React.Dispatch<React.SetStateAction<UsuarioAdmin[]>>
  estado: Estado
  cargar: () => void
  solicitudes: SolicitudClave[]
  cargarSolicitudes: () => void
  miId: number
  /** `?nueva=1`: abrir el alta al llegar (opción «Nueva cuenta» del módulo). */
  crearAlAbrir: boolean
  alCrearAbierto: () => void
  alAvisar: Avisar
}) {
  const tema = useTheme()
  // Celular (< 600 px): las cuentas en tarjetas y los diálogos a pantalla
  // completa (Edison 2026-10-01: «el diputado usa casi siempre el celular»).
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [buscar, setBuscar] = useState('')

  // Diálogo de creación: se llenan los DATOS DE LA PERSONA; el correo y el
  // usuario los propone el servidor (previsualizar) y la clave inicial es el
  // DNI, de un solo uso.
  const [creando, setCreando] = useState(false)
  const [nNombres, setNNombres] = useState('')
  const [nApellidos, setNApellidos] = useState('')
  const [nDni, setNDni] = useState('')
  const [nCargo, setNCargo] = useState('Asistente')
  const [nAdmin, setNAdmin] = useState(false)
  const [nEmail, setNEmail] = useState('')       // '' = generado
  const [nUsuario, setNUsuario] = useState('')   // '' = generado
  const [nClave, setNClave] = useState('')       // '' = DNI (o el usuario sin DNI)
  const [previa, setPrevia] = useState({ email: '', nombre_usuario: '' })
  // Contraseña temporal escrita a mano en el diálogo de edición ('' = no tocar).
  const [claveEdicion, setClaveEdicion] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!creando || !nNombres.trim() || !nApellidos.trim()) {
      setPrevia({ email: '', nombre_usuario: '' })
      return
    }
    const t = setTimeout(() => {
      api<{ email: string; nombre_usuario: string }>(
        `/api/admin/usuarios/previsualizar?nombres=${encodeURIComponent(nNombres)}&apellidos=${encodeURIComponent(nApellidos)}`,
      )
        .then(setPrevia)
        .catch(() => setPrevia({ email: '', nombre_usuario: '' }))
    }, 250)
    return () => clearTimeout(t)
  }, [creando, nNombres, nApellidos])

  // Diálogo de edición (copia de trabajo de la cuenta seleccionada) y si se le piden sus datos al entrar.
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)
  const [pedirDatos, setPedirDatos] = useState(false)

  // Compartir el acceso (2026-10-18): la cuenta y la contraseña recién entregada, si se conoce.
  const [compartiendo, setCompartiendo] = useState<{ u: UsuarioAdmin; clave: string } | null>(null)

  // Diálogo de restablecer clave
  const [claveDe, setClaveDe] = useState<UsuarioAdmin | null>(null)
  const [claveNueva, setClaveNueva] = useState('')

  const descartarSolicitud = async (id: number) => {
    try {
      await api(`/api/admin/solicitudes-clave/${id}/descartar`, { method: 'POST' })
      cargarSolicitudes()
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo descartar el aviso.')
    }
  }

  const reemplazar = (u: UsuarioAdmin) =>
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? u : x)))

  const abrirCrear = () => {
    setNNombres('')
    setNApellidos('')
    setNDni('')
    setNCargo('Asistente')
    setNAdmin(false)
    setNEmail('')
    setNUsuario('')
    setNClave('')
    setCreando(true)
  }
  useEffect(() => {
    if (crearAlAbrir) {
      abrirCrear()
      alCrearAbierto()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crearAlAbrir])

  const abrirEdicion = (u: UsuarioAdmin) => {
    setClaveEdicion('')
    setPedirDatos(u.datos_pendientes)
    setEditando({ ...u })
  }

  const crear = async () => {
    setGuardando(true)
    try {
      const nuevo = await api<UsuarioAdmin & { clave_entregada: string }>(
        '/api/admin/usuarios',
        {
          method: 'POST',
          body: JSON.stringify({
            nombres: nNombres,
            apellidos: nApellidos,
            dni: nDni,
            cargo: nCargo,
            administrador: nAdmin,
            // Vacíos = los genera el servidor (correo institucional y usuario).
            email: nEmail,
            nombre_usuario: nUsuario,
            // Vacía = DNI (o el usuario si no hay DNI).
            clave: nClave,
          }),
        },
      )
      setUsuarios((prev) => [...prev, nuevo])
      setCreando(false)
      alAvisar('success', `Cuenta «${nuevo.nombre_usuario}» creada.`)
      // Lo siguiente es mandarle el acceso: el mensaje ya listo, con la contraseña de un solo uso.
      setCompartiendo({ u: nuevo, clave: nuevo.clave_entregada })
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo crear la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  const guardarEdicion = async () => {
    if (!editando) return
    setGuardando(true)
    try {
      const actualizado = await api<UsuarioAdmin>(
        `/api/admin/usuarios/${editando.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            nombre_usuario: editando.nombre_usuario,
            nombres: editando.nombres,
            apellidos: editando.apellidos,
            dni: editando.dni,
            email: editando.email,
            cargo: editando.cargo,
            celular: editando.celular ?? '',
            acerca: editando.acerca ?? '',
            administrador: editando.administrador,
            activo: editando.activo,
            // Solo si cambió: volver a pedirle sus datos, o darlos por confirmados.
            ...(pedirDatos !== editando.datos_pendientes && !editando.datos_exceptuado ? { pedir_datos: pedirDatos } : {}),
          }),
        },
      )
      let aviso = 'Cuenta actualizada.'
      if (claveEdicion.trim()) {
        const r = await api<{ clave_entregada: string }>(
          `/api/admin/usuarios/${editando.id}/clave`,
          { method: 'POST', body: JSON.stringify({ clave: claveEdicion }) },
        )
        aviso += ` Contraseña temporal: «${r.clave_entregada}» (la cambiará al entrar).`
        cargar()
      } else {
        reemplazar(actualizado)
      }
      setEditando(null)
      setClaveEdicion('')
      alAvisar('success', aviso)
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo actualizar la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  const alternarActivo = async (u: UsuarioAdmin) => {
    const accion = u.activo ? 'desactivar' : 'activar'
    if (!(await confirmar(`¿Seguro que desea ${accion} la cuenta «${u.nombre_usuario}»?`, { aceptar: u.activo ? 'Desactivar' : 'Activar', peligro: u.activo })))
      return
    try {
      const actualizado = await api<UsuarioAdmin>(`/api/admin/usuarios/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !u.activo }),
      })
      reemplazar(actualizado)
      alAvisar('success', `Cuenta ${actualizado.activo ? 'activada' : 'desactivada'}.`)
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
    }
  }

  const guardarClave = async () => {
    if (!claveDe) return
    setGuardando(true)
    try {
      const r = await api<{ clave_entregada: string }>(
        `/api/admin/usuarios/${claveDe.id}/clave`,
        { method: 'POST', body: JSON.stringify({ clave: claveNueva }) },
      )
      cargar()
      alAvisar('success', `Contraseña de «${claveDe.nombre_usuario}» restablecida.`)
      setCompartiendo({ u: { ...claveDe, debe_cambiar_clave: true }, clave: r.clave_entregada })
      setClaveDe(null)
      setClaveNueva('')
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo restablecer la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  const q = buscar.trim().toLowerCase()
  const visibles = usuarios.filter((u) => coincide(u, q))
  const pendientesDatos = usuarios.filter((u) => u.activo && u.datos_pendientes).length

  const cargandoOError = () => {
    if (estado === 'cargando') {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )
    }
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={cargar}>Reintentar</Button>}>
        No se pudieron cargar las cuentas.
      </Alert>
    )
  }

  const tabla = () => (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Persona</TableCell>
            <TableCell>Contacto</TableCell>
            <TableCell>Cargo</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="right">Acciones</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visibles.map((u) => {
            const soyYo = u.id === miId
            return (
              <TableRow key={u.id} hover sx={{ opacity: u.activo ? 1 : 0.55 }}>
                <TableCell>
                  <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
                    {u.nombre_completo || u.nombre_usuario}
                    {soyYo && <Chip label="usted" size="small" variant="outlined" sx={{ ml: 1, height: 18, fontSize: 11 }} />}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {u.nombre_usuario}
                    {u.creado_en ? ` · desde ${new Date(u.creado_en).toLocaleDateString('es-PE')}` : ''}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{u.email || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {u.celular ? celularLegible(u.celular) : 'sin celular'} · {u.dni ? `DNI ${u.dni}` : 'sin DNI'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{u.cargo || '—'}</Typography>
                  {u.administrador && (
                    <Tooltip title="Administra el sistema: cuentas, módulos, avisos y reglas">
                      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                        Administrador del sistema
                      </Typography>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell><Estados u={u} /></TableCell>
                <TableCell align="right" padding="none" sx={{ pr: 1, whiteSpace: 'nowrap' }}>
                  <Tooltip title="Compartir acceso (mensaje para el chat)">
                    <IconButton size="small" onClick={() => setCompartiendo({ u, clave: '' })} aria-label={`Compartir el acceso de ${u.nombre_usuario}`}>
                      <ShareOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Editar datos">
                    <IconButton size="small" onClick={() => abrirEdicion(u)} aria-label={`Editar ${u.nombre_usuario}`}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Restablecer contraseña">
                    <IconButton size="small" onClick={() => { setClaveNueva(''); setClaveDe(u) }} aria-label={`Restablecer contraseña de ${u.nombre_usuario}`}>
                      <KeyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={soyYo ? 'No puede desactivar su propia cuenta' : u.activo ? 'Desactivar' : 'Activar'}>
                    <span>
                      <IconButton
                        size="small"
                        color={u.activo ? 'error' : 'success'}
                        disabled={soyYo && u.activo}
                        onClick={() => alternarActivo(u)}
                        aria-label={`${u.activo ? 'Desactivar' : 'Activar'} ${u.nombre_usuario}`}
                      >
                        {u.activo ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Paper>
  )

  // La misma información, en tarjetas apiladas para el celular.
  const tarjetas = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {visibles.map((u) => {
        const soyYo = u.id === miId
        return (
          <Paper key={u.id} variant="outlined" sx={{ p: 1.5, pr: 0.5, display: 'flex', gap: 1, alignItems: 'flex-start', opacity: u.activo ? 1 : 0.6 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{u.nombre_completo || u.nombre_usuario}</Typography>
                {soyYo && <Chip label="usted" size="small" variant="outlined" sx={{ height: 18, fontSize: 11 }} />}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {u.nombre_usuario} · {u.cargo || 'sin cargo'}
              </Typography>
              {u.administrador && (
                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, display: 'block' }}>
                  Administrador del sistema
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                {u.email || 'sin correo'} · {u.celular ? celularLegible(u.celular) : 'sin celular'}
              </Typography>
              <Box sx={{ mt: 0.5 }}><Estados u={u} /></Box>
            </Box>
            <MenuCuenta
              u={u}
              soyYo={soyYo}
              alEditar={() => abrirEdicion(u)}
              alClave={() => { setClaveNueva(''); setClaveDe(u) }}
              alCompartir={() => setCompartiendo({ u, clave: '' })}
              alAlternar={() => alternarActivo(u)}
            />
          </Paper>
        )
      })}
    </Box>
  )

  return (
    <>
      {/* Avisos de «¿Olvidaste tu contraseña?». No hay recuperación por
          correo (el sistema no guarda correos): lo que llega es este pedido,
          y se atiende restableciendo la cuenta a su clave inicial. */}
      {solicitudes.length > 0 && (
        <Alert severity="warning" icon={<KeyIcon />} sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {solicitudes.length} persona(s) olvidaron su contraseña
          </Typography>
          {solicitudes.map((s) => {
            const cuenta = usuarios.find((u) => u.id === s.usuario_id)
            return (
              <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.25 }}>
                <Typography variant="body2">
                  <b>{s.nombre_usuario}</b>
                  {cuenta ? ` — ${cuenta.nombre_completo}` : ' — no existe esa cuenta'}
                  {s.creado_en ? ` · ${new Date(s.creado_en).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                </Typography>
                {cuenta && (
                  <Button size="small" variant="outlined" onClick={() => { setClaveNueva(''); setClaveDe(cuenta) }}>
                    Restablecer
                  </Button>
                )}
                <Button size="small" onClick={() => descartarSolicitud(s.id)}>Descartar</Button>
              </Box>
            )
          })}
        </Alert>
      )}

      <Tarjeta
        icono={<GroupOutlinedIcon />}
        titulo="Cuentas del equipo"
        accion={<Button variant="contained" size="small" startIcon={<AddIcon />} onClick={abrirCrear}>Nueva cuenta</Button>}
        texto={estado === 'ok' ? `${usuarios.filter((u) => u.activo).length} activa(s) de ${usuarios.length}. Del cargo salen los permisos.` : undefined}
      >
        {usuarios.length > 6 && (
          <TextField
            size="small" fullWidth placeholder="Buscar una cuenta" value={buscar} onChange={(e) => setBuscar(e.target.value)}
            sx={{ mb: 1.5 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
        )}
        {estado !== 'ok' ? cargandoOError() : celular ? tarjetas() : tabla()}
        {estado === 'ok' && q && visibles.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Ninguna cuenta coincide.</Typography>
        )}
      </Tarjeta>

      <PrimerIngreso pendientes={pendientesDatos} alCambiar={cargar} alAvisar={alAvisar} />

      <CompartirAcceso
        u={compartiendo?.u ?? null}
        claveConocida={compartiendo?.clave ?? ''}
        alCerrar={() => setCompartiendo(null)}
        alAvisar={alAvisar}
        alCambiarClave={cargar}
      />

      {/* --- Diálogo: crear usuario --- */}
      <Dialog open={creando} onClose={() => setCreando(false)} fullWidth maxWidth="sm" fullScreen={celular}>
        <DialogTitle>Nueva cuenta</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            El correo y el usuario se generan con nombres y apellidos; la contraseña inicial es el DNI y sirve una sola vez.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mt: 1 }}>
            <TextField label="Nombres" value={nNombres} onChange={(e) => setNNombres(e.target.value)} autoFocus required />
            <TextField label="Apellidos" value={nApellidos} onChange={(e) => setNApellidos(e.target.value)} required />
            <TextField
              label="DNI"
              value={nDni}
              onChange={(e) => setNDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
              helperText="8 dígitos. Será la contraseña de entrada."
              inputProps={{ inputMode: 'numeric' }}
            />
            <TextField select label="Cargo" value={nCargo} onChange={(e) => setNCargo(e.target.value)} helperText="Del cargo salen los permisos.">
              {CARGOS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Switch checked={nAdmin} onChange={(e) => setNAdmin(e.target.checked)} />} label="Administrador del sistema" />
            <TextField
              label="Correo institucional"
              value={nEmail}
              onChange={(e) => setNEmail(e.target.value)}
              placeholder={previa.email || 'se genera con nombres y apellidos'}
              helperText={nEmail ? 'Escrito a mano.' : previa.email ? `Se generará: ${previa.email}` : ' '}
            />
            <TextField
              label="Usuario"
              value={nUsuario}
              onChange={(e) => setNUsuario(e.target.value)}
              placeholder={previa.nombre_usuario || 'parte local del correo'}
              helperText={nUsuario ? 'Escrito a mano.' : previa.nombre_usuario ? `Se generará: ${previa.nombre_usuario}` : ' '}
            />
            <TextField
              label="Contraseña inicial (opcional)"
              value={nClave}
              onChange={(e) => setNClave(e.target.value)}
              placeholder={nDni || nUsuario.trim().toLowerCase() || previa.nombre_usuario || 'DNI, o el usuario si no hay DNI'}
              helperText={
                nClave
                  ? 'Escrita a mano. Igual es de un solo uso.'
                  : nDni
                    ? `Si se deja vacía será el DNI (${nDni}).`
                    : `Sin DNI, será el propio usuario (${nUsuario.trim().toLowerCase() || previa.nombre_usuario || '…'}).`
              }
              sx={{ gridColumn: '1 / -1' }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreando(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={crear}
            disabled={guardando || !nNombres.trim() || !nApellidos.trim() || (nDni !== '' && nDni.length !== 8)}
          >
            Crear cuenta
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- Diálogo: editar usuario --- */}
      <Dialog open={editando !== null} onClose={() => setEditando(null)} fullWidth maxWidth="sm" fullScreen={celular}>
        <DialogTitle>Editar «{editando?.nombre_usuario}»</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Todo se puede corregir, también el usuario de inicio de sesión (avise a la persona si lo cambia).
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mt: 1 }}>
            <TextField
              label="Usuario (inicio de sesión)"
              value={editando?.nombre_usuario ?? ''}
              onChange={(e) => editando && setEditando({ ...editando, nombre_usuario: e.target.value })}
              helperText="Mínimo 3 caracteres; se guarda en minúsculas."
              sx={{ gridColumn: '1 / -1' }}
            />
            <TextField label="Nombres" value={editando?.nombres ?? ''} onChange={(e) => editando && setEditando({ ...editando, nombres: e.target.value })} autoFocus />
            <TextField label="Apellidos" value={editando?.apellidos ?? ''} onChange={(e) => editando && setEditando({ ...editando, apellidos: e.target.value })} />
            <TextField
              label="DNI"
              value={editando?.dni ?? ''}
              onChange={(e) => editando && setEditando({ ...editando, dni: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              helperText="Clave de entrada al restablecer la contraseña."
            />
            <TextField
              select
              label="Cargo"
              value={CARGOS.includes(editando?.cargo ?? '') ? editando?.cargo : ''}
              onChange={(e) => editando && setEditando({ ...editando, cargo: e.target.value })}
              helperText="Del cargo salen los permisos."
            >
              {CARGOS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField
              label="Correo institucional"
              value={editando?.email ?? ''}
              onChange={(e) => editando && setEditando({ ...editando, email: e.target.value })}
              sx={{ gridColumn: '1 / -1' }}
            />
            <TextField
              label="Celular"
              type="tel"
              value={editando?.celular ?? ''}
              onChange={(e) => editando && setEditando({ ...editando, celular: e.target.value })}
              error={errorDe('celular', editando?.celular ?? '') !== ''}
              helperText={errorDe('celular', editando?.celular ?? '') || '9 dígitos; para llamar o WhatsApp.'}
              inputProps={{ inputMode: 'tel', maxLength: 16 }}
              InputProps={{ startAdornment: <InputAdornment position="start">+51</InputAdornment> }}
            />
            <TextField
              label="Info"
              value={editando?.acerca ?? ''}
              onChange={(e) => editando && setEditando({ ...editando, acerca: e.target.value })}
              inputProps={{ maxLength: MAX_ACERCA }}
              helperText={`${(editando?.acerca ?? '').length}/${MAX_ACERCA} · se ve en su tarjeta.`}
            />
            <TextField
              label="Nueva contraseña temporal (opcional)"
              value={claveEdicion}
              onChange={(e) => setClaveEdicion(e.target.value)}
              placeholder={editando?.dni || editando?.nombre_usuario || ''}
              helperText={claveEdicion ? 'Se entregará esta; la persona la cambiará al entrar.' : 'Vacía = no se toca. Para volver a la inicial (DNI o usuario) use la llave.'}
              sx={{ gridColumn: '1 / -1' }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editando?.administrador ?? false}
                  disabled={editando?.id === miId}
                  onChange={(e) => editando && setEditando({ ...editando, administrador: e.target.checked })}
                />
              }
              label="Administrador del sistema"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editando?.activo ?? false}
                  disabled={editando?.id === miId}
                  onChange={(e) => editando && setEditando({ ...editando, activo: e.target.checked })}
                />
              }
              label={editando?.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
            />
            <FormControlLabel
              sx={{ gridColumn: '1 / -1' }}
              control={<Switch checked={pedirDatos} disabled={editando?.datos_exceptuado} onChange={(e) => setPedirDatos(e.target.checked)} />}
              label={editando?.datos_exceptuado ? 'Su cargo no confirma datos al entrar' : 'Pedirle que confirme sus datos al entrar'}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditando(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={guardarEdicion}
            disabled={
              guardando
              || !(editando?.nombres ?? '').trim()
              || !(editando?.apellidos ?? '').trim()
              || (editando?.nombre_usuario ?? '').trim().length < 3
              || ((editando?.dni ?? '') !== '' && (editando?.dni ?? '').length !== 8)
              || errorDe('celular', editando?.celular ?? '') !== ''
            }
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- Diálogo: restablecer contraseña --- */}
      <Dialog open={claveDe !== null} onClose={() => setClaveDe(null)} fullWidth maxWidth="xs">
        <DialogTitle>Restablecer contraseña</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Cuenta: <strong>{claveDe?.nombre_usuario}</strong>. La que entregue es <b>temporal</b>: al entrar, el sistema le pide elegir la suya.
          </Typography>
          <TextField
            label="Contraseña temporal (opcional)"
            fullWidth
            margin="normal"
            value={claveNueva}
            placeholder={claveDe?.dni || claveDe?.nombre_usuario || ''}
            helperText={
              claveDe?.dni
                ? `Vacía: vuelve a la inicial, su DNI (${claveDe.dni}).`
                : `Vacía: vuelve a la inicial, el propio usuario («${claveDe?.nombre_usuario ?? ''}»).`
            }
            onChange={(e) => setClaveNueva(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClaveDe(null)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarClave} disabled={guardando}>Restablecer</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

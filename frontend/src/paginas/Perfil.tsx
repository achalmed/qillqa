/**
 * MI PERFIL (`/perfil`, 2026-10-12) — como los ajustes de Telegram o WhatsApp en el celular.
 *
 *   ┌ foto grande con el botón de cámara · nombre · «Info» ┐
 *   │ Nombre · Celular · Correo · DNI · Cargo · Rol · Usuario │  ← filas tocables
 *   └ Cambiar contraseña (la página de siempre, /clave)     ┘
 *
 * Cada fila abre su edición en una hoja inferior (diálogo en escritorio) que guarda SOLO ese
 * dato (`PUT /api/cuenta/perfil`). El rol se muestra y lo cambia quien administra; el cargo se
 * elige entre los de su mismo rol. La foto se recorta cuadrada en el servidor
 * (`POST|DELETE /api/cuenta/foto`). Se llega desde el menú de la cuenta (Marco) y desde el chat.
 * «Avisos y sonidos» (2026-10-13): activar los avisos push en este dispositivo y apagar los sonidos
 * de Qillqa (`componentes/perfil/AvisosYSonidos.tsx`).
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { guardarPreferencia, leerPreferencias, MODALIDADES, type Modalidad, type Preferencias } from '../preferencias'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import LockResetIcon from '@mui/icons-material/LockReset'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'
import WorkOutlineIcon from '@mui/icons-material/WorkOutline'
import { api, subirArchivo } from '../api'
import Marco from '../componentes/Marco'
import AvatarPersona from '../componentes/perfil/AvatarPersona'
import AvisosYSonidos from '../componentes/perfil/AvisosYSonidos'
import { abrirTarjeta, ponerVersion } from '../componentes/perfil/fotos'
import { useVentanaVisible } from '../componentes/chat/teclado'
import { PALETA } from '../paleta'
import { ETIQUETA_ROL, MAX_ACERCA, celularLegible, errorDe, nombresParaEditar, normalizarCelular, type MiPerfil } from '../perfil'

type Campo = 'nombre' | 'celular' | 'email' | 'dni' | 'cargo' | 'acerca'

const TITULO: Record<Campo, string> = {
  nombre: 'Su nombre',
  celular: 'Su celular',
  email: 'Su correo',
  dni: 'Su DNI',
  cargo: 'Su cargo',
  acerca: 'Info',
}

/** Una fila tocable del perfil: icono, etiqueta pequeña y el valor (o «Añadir»). */
function Fila({ icono, etiqueta, valor, ayuda, alPulsar }: { icono: React.ReactNode; etiqueta: string; valor: string; ayuda?: string; alPulsar?: () => void }) {
  return (
    <ButtonBase
      onClick={alPulsar}
      disabled={!alPulsar}
      sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 2, px: 2, py: 1.25, textAlign: 'left', minHeight: 60, '&:hover': { bgcolor: alPulsar ? PALETA.superficieTenue : undefined }, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}
    >
      <Box sx={{ color: PALETA.textoTenue, display: 'flex', flexShrink: 0 }}>{icono}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.3 }}>{etiqueta}</Typography>
        <Typography sx={{ fontSize: 15.5, color: valor ? 'text.primary' : 'primary.main', overflowWrap: 'anywhere' }}>{valor || 'Añadir'}</Typography>
        {ayuda && <Typography variant="caption" sx={{ color: PALETA.textoTenue, display: 'block', lineHeight: 1.3 }}>{ayuda}</Typography>}
      </Box>
      {alPulsar && <ChevronRightIcon sx={{ color: PALETA.apagado, flexShrink: 0 }} />}
    </ButtonBase>
  )
}

/** «Mostrar mi estado en línea a los demás» (2026-10-19): apagado, el equipo me ve desconectado; el
 *  administrador sigue viendo el estado real (Administración → Uso). */
function MostrarPresencia({ alAviso }: { alAviso: (t: string) => void }) {
  const [visible, setVisible] = useState<boolean | null>(null)
  useEffect(() => { api<{ visible: boolean }>('/api/presencia/visible').then((r) => setVisible(r.visible)).catch(() => setVisible(true)) }, [])
  const cambiar = (v: boolean) => {
    setVisible(v)
    api('/api/presencia/visible', { method: 'PUT', body: JSON.stringify({ visible: v }) }).then(() => alAviso(v ? 'Los demás ven tu estado.' : 'Los demás te ven desconectado.')).catch(() => { setVisible(!v); alAviso('No se pudo cambiar.') })
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.25, minHeight: 60 }}>
      <Box sx={{ color: 'text.secondary', display: 'flex', flexShrink: 0 }}><VisibilityOutlinedIcon /></Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2">Mostrar mi estado en línea a los demás</Typography>
        <Typography variant="caption" color="text.secondary">Apagado, el equipo te ve desconectado. El administrador sigue viendo tu estado.</Typography>
      </Box>
      <Switch size="small" checked={visible ?? true} disabled={visible === null} onChange={(_, v) => cambiar(v)} inputProps={{ 'aria-label': 'Mostrar mi estado en línea a los demás' }} />
    </Box>
  )
}

/** Cómo abrir un proyecto de ley y un documento (2026-10-19): formulario, Formato Word o preguntar. */
function ComoAbrir({ alAviso }: { alAviso: (t: string) => void }) {
  const [pref, setPref] = useState<Preferencias | null>(null)
  useEffect(() => { void leerPreferencias().then(setPref) }, [])
  const fila = (clave: keyof Preferencias, etiqueta: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.25, minHeight: 60, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
      <Box sx={{ color: 'text.secondary', display: 'flex', flexShrink: 0 }}><TuneOutlinedIcon /></Box>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{etiqueta}</Typography>
      <TextField select size="small" value={pref?.[clave] ?? ''} disabled={!pref} onChange={(e) => { const v = e.target.value as Modalidad; setPref((p) => (p ? { ...p, [clave]: v } : p)); void guardarPreferencia(clave, v).then(() => alAviso('Guardado.')) }} sx={{ minWidth: 168 }} inputProps={{ 'aria-label': etiqueta }}>
        {MODALIDADES.map((m) => <MenuItem key={m.valor} value={m.valor}>{m.nombre}</MenuItem>)}
      </TextField>
    </Box>
  )
  return (
    <>
      <Typography variant="overline" sx={{ display: 'block', px: 2, pt: 1.5, color: 'text.secondary', lineHeight: 1.6 }}>Cómo abrir</Typography>
      {fila('modalidad_proyectos', 'Un proyecto de ley')}
      {fila('modalidad_documentos', 'Un documento (borrador)')}
    </>
  )
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  // En el celular, de borde a borde (como los ajustes de Android); en pantalla ancha, una tarjeta.
  return (
    <Box sx={(t) => ({ bgcolor: 'background.paper', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', overflow: 'hidden', [t.breakpoints.up('sm')]: { border: '1px solid', borderColor: 'divider', borderRadius: 2 } })}>
      {children}
    </Box>
  )
}

/** La hoja de edición de un dato: hoja inferior sobre el teclado en el celular, diálogo en escritorio. */
function HojaEdicion({ campo: pedido, perfil, alCerrar, alGuardado }: { campo: Campo | null; perfil: MiPerfil; alCerrar: () => void; alGuardado: (p: MiPerfil) => void }) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  // La hoja queda montada al cerrarse (sale deslizándose) con el último dato que se editó.
  const abierta = pedido !== null
  const ultimo = useRef<Campo | null>(pedido)
  if (pedido) ultimo.current = pedido
  const campo = pedido ?? ultimo.current
  const visible = useVentanaVisible(celular && abierta)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  // El primer campo: en la hoja inferior, `autoFocus` llega cuando la hoja aún está oculta (la
  // transición la muestra después) y se pierde; se enfoca al terminar de entrar.
  const primero = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!pedido) return
    setError('')
    const n = nombresParaEditar(perfil)
    setValores({
      nombres: n.nombres, apellidos: n.apellidos, celular: celularLegible(perfil.celular), email: perfil.email,
      dni: perfil.dni, cargo: perfil.cargo, acerca: perfil.acerca,
    })
  }, [pedido, perfil])

  if (!campo) return null
  const poner = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setValores((v) => ({ ...v, [k]: e.target.value }))
  const errores: Record<string, string> =
    campo === 'nombre'
      ? { nombres: errorDe('nombres', valores.nombres ?? ''), apellidos: errorDe('apellidos', valores.apellidos ?? '') }
      : campo === 'cargo' ? {} : { [campo]: errorDe(campo, valores[campo] ?? '') }
  const hayError = Object.values(errores).some(Boolean)

  const guardar = async () => {
    if (hayError) return
    const cuerpo: Record<string, string> =
      campo === 'nombre' ? { nombres: valores.nombres, apellidos: valores.apellidos }
        : campo === 'celular' ? { celular: normalizarCelular(valores.celular) ?? valores.celular }
          : { [campo]: valores[campo] ?? '' }
    setGuardando(true)
    setError('')
    try {
      alGuardado(await api<MiPerfil>('/api/cuenta/perfil', { method: 'PUT', body: JSON.stringify(cuerpo) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const campoTexto = (k: string, etiqueta: string, { helperText: ayuda, ...extra }: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <TextField
      key={k}
      label={etiqueta}
      value={valores[k] ?? ''}
      onChange={poner(k)}
      error={Boolean(errores[k])}
      helperText={errores[k] || ayuda || ' '}
      fullWidth
      margin="dense"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !(extra.multiline)) {
          e.preventDefault()
          void guardar()
        }
      }}
      {...extra}
      inputRef={extra.autoFocus ? primero : undefined}
      sx={{ '& input, & textarea': { fontSize: { xs: 16, md: 15 } } }}
    />
  )

  const cuerpo = (
    <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); void guardar() }} sx={{ px: 2, pt: 1.5, pb: 2 }}>
      <Typography component="h2" sx={{ fontSize: 17, fontWeight: 650, mb: 0.5 }}>{TITULO[campo]}</Typography>
      {campo === 'nombre' && (
        <>
          {campoTexto('nombres', 'Nombres', { autoFocus: true, autoComplete: 'given-name', inputProps: { maxLength: 80, autoCapitalize: 'words' } })}
          {campoTexto('apellidos', 'Apellidos', { autoComplete: 'family-name', inputProps: { maxLength: 80, autoCapitalize: 'words' } })}
        </>
      )}
      {campo === 'celular' && campoTexto('celular', 'Celular', {
        autoFocus: true, type: 'tel', autoComplete: 'tel-national', placeholder: '987 654 321',
        inputProps: { inputMode: 'tel', maxLength: 16 },
        InputProps: { startAdornment: <InputAdornment position="start">+51</InputAdornment> },
        helperText: 'Para llamarle o escribirle por WhatsApp.',
      })}
      {campo === 'email' && campoTexto('email', 'Correo', { autoFocus: true, type: 'email', autoComplete: 'email', inputProps: { inputMode: 'email', maxLength: 120 }, helperText: 'También sirve para entrar al sistema.' })}
      {campo === 'dni' && campoTexto('dni', 'DNI', { autoFocus: true, autoComplete: 'off', inputProps: { inputMode: 'numeric', maxLength: 8, pattern: '[0-9]*' }, helperText: 'Lo ven solo usted y quien administra.' })}
      {campo === 'acerca' && campoTexto('acerca', 'Info', {
        autoFocus: true, placeholder: 'En comisión, de viaje, disponible…', inputProps: { maxLength: MAX_ACERCA },
        helperText: `${(valores.acerca ?? '').length}/${MAX_ACERCA} · la ve el equipo en su tarjeta.`,
      })}
      {campo === 'cargo' && (
        <RadioGroup value={valores.cargo ?? ''} onChange={(e) => setValores((v) => ({ ...v, cargo: e.target.value }))} sx={{ py: 0.5 }}>
          {perfil.cargos.map((c) => <FormControlLabel key={c} value={c} control={<Radio />} label={c} sx={{ minHeight: 44 }} />)}
        </RadioGroup>
      )}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button onClick={alCerrar} disabled={guardando}>Cancelar</Button>
        <Button type="submit" variant="contained" disableElevation disabled={hayError || guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </Box>
    </Box>
  )

  if (celular) {
    // Con el teclado abierto, la hoja sube hasta el borde de lo que se ve (teclado.ts).
    const abajo = visible ? Math.max(0, window.innerHeight - (visible.alto + visible.arriba)) : 0
    return (
      <Drawer
        anchor="bottom"
        open={abierta}
        onClose={alCerrar}
        SlideProps={{ onEntered: () => primero.current?.focus() }}
        PaperProps={{ sx: { bottom: `${abajo}px`, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: visible ? `${visible.alto - 16}px` : '90dvh', pb: abajo ? 0 : 'env(safe-area-inset-bottom)' } }}
      >
        {cuerpo}
      </Drawer>
    )
  }
  return (
    <Dialog open={abierta} onClose={alCerrar} fullWidth maxWidth="xs">
      {cuerpo}
    </Dialog>
  )
}

export default function Perfil() {
  const navegar = useNavigate()
  const [perfil, setPerfil] = useState<MiPerfil | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [campo, setCampo] = useState<Campo | null>(null)
  const [menuFoto, setMenuFoto] = useState<HTMLElement | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const entrada = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    api<MiPerfil>('/api/cuenta/perfil').then(setPerfil).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar su perfil.'))
  }, [])

  const alGuardado = (p: MiPerfil) => {
    setPerfil(p)
    setCampo(null)
    setAviso('Guardado.')
    // El nombre de la barra y del chat sale de aquí.
    localStorage.setItem('sgdp_nombre', p.nombre)
  }

  const subirFoto = async (archivo: File) => {
    setSubiendo(true)
    try {
      const datos = new FormData()
      datos.append('archivo', archivo)
      const p = await subirArchivo<MiPerfil>('/api/cuenta/foto', datos)
      setPerfil(p)
      ponerVersion(p.id, p.foto)
      setAviso('Foto actualizada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const quitarFoto = async () => {
    setMenuFoto(null)
    setSubiendo(true)
    try {
      const p = await api<MiPerfil>('/api/cuenta/foto', { method: 'DELETE' })
      setPerfil(p)
      ponerVersion(p.id, '')
      setAviso('Foto quitada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  const elegirFoto = () => {
    setMenuFoto(null)
    entrada.current?.click()
  }

  const rol = perfil ? ETIQUETA_ROL[perfil.rol] ?? perfil.rol : ''
  const cargoEditable = Boolean(perfil && perfil.cargos.length > 1)

  return (
    <Marco modulo="cuenta" titulo="Mi perfil" opciones={[]} fondo={PALETA.fondo}>
      {!perfil && !error && <LinearProgress />}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ m: 2 }}>{error}</Alert>}
      {perfil && (
        <Box sx={{ width: '100%', maxWidth: 560, mx: 'auto', py: { xs: 0, sm: 3 }, display: 'flex', flexDirection: 'column', gap: { xs: 1.25, sm: 2 } }}>
          <Tarjeta>
          <Box sx={{ px: 2, pt: 3, pb: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Box sx={{ position: 'relative', mb: 1.5 }}>
              <ButtonBase onClick={() => abrirTarjeta(perfil.id)} aria-label="Ver mi tarjeta como la ve el equipo" sx={{ borderRadius: '50%' }}>
                <AvatarPersona id={perfil.id} nombre={perfil.nombre} tamano={128} />
              </ButtonBase>
              {subiendo && (
                <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: `${PALETA.oscuroVisor}73`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CircularProgress size={32} sx={{ color: '#fff' }} />
                </Box>
              )}
              <IconButton
                aria-label="Cambiar la foto"
                disabled={subiendo}
                onClick={(e) => (perfil.foto ? setMenuFoto(e.currentTarget) : elegirFoto())}
                sx={{ position: 'absolute', right: -2, bottom: -2, width: 44, height: 44, bgcolor: 'primary.main', color: 'primary.contrastText', border: '3px solid', borderColor: 'background.paper', '&:hover': { bgcolor: 'primary.dark' } }}
              >
                <PhotoCameraOutlinedIcon sx={{ fontSize: 22 }} />
              </IconButton>
              <input ref={entrada} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirFoto(f) }} />
              <Menu anchorEl={menuFoto} open={Boolean(menuFoto)} onClose={() => setMenuFoto(null)}>
                <MenuItem onClick={elegirFoto}><ListItemIcon><PhotoLibraryOutlinedIcon fontSize="small" /></ListItemIcon>Cambiar la foto</MenuItem>
                <MenuItem onClick={() => void quitarFoto()}><ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>Quitar la foto</MenuItem>
              </Menu>
            </Box>
            <Typography component="h2" sx={{ fontSize: 21, fontWeight: 650, lineHeight: 1.25 }}>{perfil.nombre}</Typography>
            <Typography variant="body2" color="text.secondary">{perfil.cargo && perfil.cargo !== rol ? `${perfil.cargo} · ${rol}` : rol}</Typography>
            <ButtonBase onClick={() => setCampo('acerca')} sx={{ mt: 1, px: 1.5, py: 0.75, borderRadius: 2, maxWidth: '100%', '&:hover': { bgcolor: PALETA.superficieTenue } }}>
              <Typography variant="body2" sx={{ color: perfil.acerca ? 'text.primary' : 'primary.main', overflowWrap: 'anywhere' }}>{perfil.acerca || 'Añadir Info'}</Typography>
            </ButtonBase>
          </Box>
          </Tarjeta>

          <Tarjeta>
            <Fila icono={<PersonOutlineIcon />} etiqueta="Nombre" valor={perfil.nombre} alPulsar={() => setCampo('nombre')} />
            <Fila icono={<PhoneIphoneOutlinedIcon />} etiqueta="Celular" valor={perfil.celular ? `+51 ${celularLegible(perfil.celular)}` : ''} alPulsar={() => setCampo('celular')} />
            <Fila icono={<MailOutlineIcon />} etiqueta="Correo" valor={perfil.email} alPulsar={() => setCampo('email')} />
            <Fila icono={<BadgeOutlinedIcon />} etiqueta="DNI" valor={perfil.dni} alPulsar={() => setCampo('dni')} />
            <Fila icono={<WorkOutlineIcon />} etiqueta="Cargo" valor={perfil.cargo} alPulsar={cargoEditable ? () => setCampo('cargo') : undefined} />
            <Fila icono={<AdminPanelSettingsOutlinedIcon />} etiqueta="Rol" valor={rol} ayuda="Lo cambia quien administra." />
            <Fila icono={<AlternateEmailIcon />} etiqueta="Usuario" valor={`@${perfil.cuenta}`} />
          </Tarjeta>

          <Tarjeta>
            <AvisosYSonidos alAviso={setAviso} />
          </Tarjeta>

          <Tarjeta>
            <ComoAbrir alAviso={setAviso} />
          </Tarjeta>

          <Tarjeta>
            <MostrarPresencia alAviso={setAviso} />
          </Tarjeta>

          <Tarjeta>
            <Fila icono={<LockResetIcon />} etiqueta="Seguridad" valor="Cambiar contraseña" alPulsar={() => navegar('/clave')} />
          </Tarjeta>
        </Box>
      )}

      {perfil && <HojaEdicion campo={campo} perfil={perfil} alCerrar={() => setCampo(null)} alGuardado={alGuardado} />}
      <Snackbar open={Boolean(aviso)} autoHideDuration={2500} onClose={() => setAviso('')} message={aviso} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} sx={{ bottom: { xs: 80, sm: 24 } }} />
    </Marco>
  )
}

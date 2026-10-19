/**
 * ALTA Y EDICIÓN DE UN CONTACTO (2026-10-13), como el formulario de Google Contacts: a la vista
 * solo lo que se usa siempre —foto, nombre, celular, correo, institución y cargo— y «Ver más»
 * para el resto (tratamiento, área, oficina, teléfono fijo, anexo, correo alterno, etiquetas,
 * notas y si se sugiere al redactar). Se guarda por la API de siempre (`/api/directorio/personas`),
 * con la ficha completa; la foto se sube después, a su propia ruta.
 *
 * Antes de crear avisa de los posibles duplicados (mismo nombre, celular o correo). Quien tiene
 * cuenta en Qillqa: nombre, cargo, correo y celular quedan fijos (se cambian en Mi perfil o en
 * Administración, docs/arquitectura.md §27).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import AddAPhotoOutlinedIcon from '@mui/icons-material/AddAPhotoOutlined'
import CloseIcon from '@mui/icons-material/Close'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import WorkOutlineIcon from '@mui/icons-material/WorkOutline'
import { api, subirArchivo } from '../../api'
import { TRATAMIENTOS, avisoCorreo, conDosPuntos, parecidas, tipoUno, type Institucion, type Persona } from '../../directorio'
import AvatarContacto from './AvatarContacto'
import { celularPeruano, plano } from './contactos'

function Icono({ children }: { children: React.ReactNode }) {
  return <InputAdornment position="start" sx={{ color: 'text.secondary', '& svg': { fontSize: 20 } }}>{children}</InputAdornment>
}

/** Un celular que no parece celular: aviso suave, no impide guardar (puede ser un número de otro país). */
function avisoCelular(v: string): string {
  const t = v.trim()
  if (!t || celularPeruano(t) || t.startsWith('+')) return ''
  return 'Un celular del Perú tiene 9 dígitos y empieza con 9 (de otro país, con +).'
}

export default function FormularioContacto({
  inicial,
  todas,
  personas,
  etiquetas,
  alCerrar,
  alGuardado,
  alAbrirOtra,
}: {
  /** La persona a editar (id 0 = nueva); null = cerrado. */
  inicial: Persona | null
  todas: Institucion[]
  personas: Persona[]
  etiquetas: string[]
  alCerrar: () => void
  alGuardado: (p: Persona, nuevo: boolean) => void
  /** «Abrir esa»: el posible duplicado. */
  alAbrirOtra?: (p: Persona) => void
}) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [p, setP] = useState<Persona | null>(inicial)
  const [mas, setMas] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [quitarFoto, setQuitarFoto] = useState(false)
  const [vista, setVista] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const entradaFoto = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setP(inicial ? { ...inicial, etiquetas: [...(inicial.etiquetas ?? [])] } : null)
    setFoto(null)
    setQuitarFoto(false)
    setError('')
    // «Ver más» abierto si la ficha ya tiene algo en esos campos (nada queda escondido).
    setMas(Boolean(inicial && (inicial.tratamiento || inicial.area || inicial.oficina || inicial.telefono || inicial.anexo || inicial.email_alterno || inicial.notas || (inicial.etiquetas?.length ?? 0) || !inicial.activo)))
  }, [inicial])
  useEffect(() => {
    if (!foto) {
      setVista(null)
      return
    }
    const u = URL.createObjectURL(foto)
    setVista(u)
    return () => URL.revokeObjectURL(u)
  }, [foto])

  // Posibles duplicados al crear: mismo nombre (parecido), mismo celular o mismo correo.
  const duplicados = useMemo(() => {
    if (!p || p.id !== 0) return []
    const porNombre = parecidas(personas, p.nombre)
    const cel = celularPeruano(p.celular)
    const correo = plano(p.email)
    const porDato = personas.filter((x) => (cel && celularPeruano(x.celular) === cel) || (correo.includes('@') && [plano(x.email), plano(x.email_alterno)].includes(correo)))
    const vistos = new Set<number>()
    return [...porDato, ...porNombre].filter((x) => !vistos.has(x.id) && vistos.add(x.id)).slice(0, 4)
  }, [p, personas])

  if (!p) return null
  const nuevo = p.id === 0
  const deCuenta = Boolean(p.usuario_id)
  const ayudaCuenta = 'Se cambia en Mi perfil o en Administración'
  const poner = (x: Partial<Persona>) => setP({ ...p, ...x })
  const instElegida = todas.find((t) => t.id === p.institucion_id) ?? null

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const cuerpo = { ...p, tratamiento: conDosPuntos(p.tratamiento), celular: celularPeruano(p.celular) || p.celular.trim(), email: p.email.trim().toLowerCase() }
      let r = await api<Persona>(`/api/directorio/personas${nuevo ? '' : `/${p.id}`}`, { method: nuevo ? 'POST' : 'PUT', body: JSON.stringify(cuerpo) })
      if (foto) {
        const f = new FormData()
        f.append('archivo', foto)
        r = await subirArchivo<Persona>(`/api/directorio/personas/${r.id}/foto`, f)
      } else if (quitarFoto && p.foto) {
        r = await api<Persona>(`/api/directorio/personas/${r.id}/foto`, { method: 'DELETE' })
      }
      alGuardado({ ...p, ...r }, nuevo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onClose={guardando ? undefined : alCerrar} fullWidth maxWidth="sm" fullScreen={celular}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>{nuevo ? 'Nuevo contacto' : 'Editar contacto'}</Box>
        <IconButton onClick={alCerrar} aria-label="Cerrar sin guardar" disabled={guardando}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* La foto: un toque para elegirla (en el celular, la cámara o la galería). */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box component="button" type="button" onClick={() => entradaFoto.current?.click()} aria-label="Elegir la foto del contacto"
            sx={{ position: 'relative', border: 0, p: 0, bgcolor: 'transparent', borderRadius: '50%', cursor: 'pointer' }}>
            <AvatarContacto id={p.id} nombre={p.nombre} foto={quitarFoto ? '' : p.foto} usuarioId={quitarFoto ? null : p.usuario_id} tamano={88} vistaPrevia={vista} />
            <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: '50%', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'grid', placeItems: 'center', color: 'primary.main' }}>
              <AddAPhotoOutlinedIcon sx={{ fontSize: 18 }} />
            </Box>
          </Box>
          <input ref={entradaFoto} hidden type="file" accept="image/*" onChange={(e) => { setFoto(e.target.files?.[0] ?? null); setQuitarFoto(false); e.target.value = '' }} />
          {(foto || (p.foto && !quitarFoto)) && (
            <Link component="button" type="button" variant="caption" onClick={() => { setFoto(null); setQuitarFoto(true) }}>Quitar foto</Link>
          )}
        </Box>

        {duplicados.length > 0 && (
          <Alert severity="warning" variant="outlined">
            <b>¿Ya existe?</b> {duplicados.length === 1 ? 'Hay un contacto parecido' : 'Hay contactos parecidos'}:
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {duplicados.map((x) => (
                <li key={x.id}>
                  {x.nombre}{x.cargo ? ` · ${x.cargo}` : ''}
                  {alAbrirOtra && <Link component="button" type="button" onClick={() => alAbrirOtra(x)} sx={{ ml: 1, fontSize: 'inherit' }}>Abrir</Link>}
                </li>
              ))}
            </Box>
          </Alert>
        )}

        <TextField label="Nombre" value={p.nombre} onChange={(e) => poner({ nombre: e.target.value })} required autoFocus={nuevo && !celular}
          disabled={deCuenta} helperText={deCuenta ? ayudaCuenta : ' '} InputProps={{ startAdornment: <Icono><PersonOutlineIcon /></Icono> }}
          inputProps={{ autoComplete: 'off', maxLength: 200 }} />
        <TextField label="Celular" type="tel" value={p.celular} onChange={(e) => poner({ celular: e.target.value })} placeholder="987 654 321"
          disabled={deCuenta} helperText={deCuenta ? ayudaCuenta : avisoCelular(p.celular) || ' '} InputProps={{ startAdornment: <Icono><PhoneIphoneOutlinedIcon /></Icono> }}
          inputProps={{ autoComplete: 'off', inputMode: 'tel', maxLength: 40 }} />
        <TextField label="Correo" type="email" value={p.email} onChange={(e) => poner({ email: e.target.value })}
          disabled={deCuenta} error={Boolean(avisoCorreo(p.email))} helperText={deCuenta ? ayudaCuenta : avisoCorreo(p.email) || ' '}
          InputProps={{ startAdornment: <Icono><MailOutlineIcon /></Icono> }} inputProps={{ autoComplete: 'off', maxLength: 200 }} />
        <Autocomplete
          options={todas}
          getOptionLabel={(i) => (i.siglas ? `${i.siglas} — ${i.nombre}` : i.nombre)}
          renderOption={(props, i) => (
            <li {...props} key={i.id}>
              <Box>
                <Typography sx={{ fontSize: 14 }}>{i.siglas ? <b>{i.siglas} · </b> : null}{i.nombre}</Typography>
                <Typography variant="caption" color="text.secondary">{tipoUno(i.tipo)}{i.region ? ` · ${i.region}` : ''}</Typography>
              </Box>
            </li>
          )}
          value={instElegida}
          onChange={(_, v) => poner({ institucion_id: v?.id ?? null })}
          renderInput={(params) => (
            <TextField {...params} label="Institución" placeholder="Siglas o parte del nombre" helperText=" "
              InputProps={{ ...params.InputProps, startAdornment: <><Icono><ApartmentOutlinedIcon /></Icono>{params.InputProps.startAdornment}</> }} />
          )}
        />
        <TextField label="Cargo" value={p.cargo} onChange={(e) => poner({ cargo: e.target.value })} placeholder="Director regional de Educación"
          disabled={deCuenta} helperText={deCuenta ? ayudaCuenta : ' '} InputProps={{ startAdornment: <Icono><WorkOutlineIcon /></Icono> }}
          inputProps={{ maxLength: 200 }} />

        {!mas ? (
          <Button onClick={() => setMas(true)} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>Ver más</Button>
        ) : (
          <>
            <Autocomplete
              multiple
              freeSolo
              options={etiquetas.filter((e) => !(p.etiquetas ?? []).some((x) => plano(x) === plano(e)))}
              value={p.etiquetas ?? []}
              onChange={(_, v) => poner({ etiquetas: (v as string[]).map((x) => x.trim()).filter(Boolean) })}
              renderInput={(params) => <TextField {...params} label="Etiquetas" placeholder="Prensa, Comisión de Educación…" helperText="Para agrupar y filtrar, como los grupos de Google Contacts. Enter agrega una nueva." />}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              <Autocomplete
                freeSolo
                options={TRATAMIENTOS}
                value={p.tratamiento}
                onInputChange={(_, v) => poner({ tratamiento: v })}
                renderInput={(params) => <TextField {...params} label="Tratamiento" placeholder="Señor: / Señora:" helperText="Como destinatario de un oficio" />}
              />
              <TextField label="Área o unidad" value={p.area} onChange={(e) => poner({ area: e.target.value })} helperText=" " />
              <TextField label="Teléfono fijo" type="tel" value={p.telefono} onChange={(e) => poner({ telefono: e.target.value })} helperText=" " />
              <TextField label="Anexo" value={p.anexo} onChange={(e) => poner({ anexo: e.target.value })} inputProps={{ inputMode: 'numeric' }} helperText="Vía interna del Congreso" />
              <TextField label="Correo alterno" type="email" value={p.email_alterno} onChange={(e) => poner({ email_alterno: e.target.value })}
                error={Boolean(avisoCorreo(p.email_alterno))} helperText={avisoCorreo(p.email_alterno) || ' '} />
              <TextField label="Oficina o sede" value={p.oficina} onChange={(e) => poner({ oficina: e.target.value })} placeholder="Jr. Carabaya, 4.º piso" helperText=" " />
            </Box>
            <TextField label="Notas" value={p.notas} onChange={(e) => poner({ notas: e.target.value })} multiline minRows={2} />
            <FormControlLabel
              control={<Switch checked={p.activo} onChange={(e) => poner({ activo: e.target.checked })} disabled={deCuenta} />}
              label={p.activo ? 'Activo: se sugiere al redactar' : 'Inactivo: no se sugiere (no se borra)'}
            />
          </>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.25 }}>
        <Button onClick={alCerrar} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" disableElevation onClick={() => void guardar()} disabled={guardando || !p.nombre.trim()}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

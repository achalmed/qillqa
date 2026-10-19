// Autocompletado del DIRECTORIO INSTITUCIONAL para el formulario de
// documentos: sugiere personas (autoridades, con su institución) e
// instituciones mientras se escribe; elegir una rellena los campos de la
// fila. Incluye el diálogo «Agregar al directorio» para registrar un dato
// nuevo sin salir del formulario, y el helper para ACTUALIZAR un registro
// elegido cuya información cambió (p. ej. cambió el ministro).

import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import PersonIcon from '@mui/icons-material/Person'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import { api } from '../api'

export interface PersonaDir {
  id: number
  nombre: string
  cargo: string
  tratamiento: string
  institucion_id: number | null
  email: string
  telefono: string
  activo: boolean
  notas: string
  institucion_nombre?: string
  institucion_siglas?: string
}

export interface InstitucionDir {
  id: number
  nombre: string
  siglas: string
  tipo: string
  sector: string
  nivel_gobierno: string
  parent_id: number | null
  region: string
  url_oficial: string
  url_mesa_partes: string
  email: string
  telefono: string
  direccion: string
  activo: boolean
  notas: string
}

// Referencia al registro del directorio del que se rellenó una fila: permite
// ofrecer «Actualizar información» si el usuario corrige el dato.
export type RefDir =
  | { tipo: 'persona'; datos: PersonaDir }
  | { tipo: 'institucion'; datos: InstitucionDir }

export interface Eleccion {
  nombre: string
  cargo: string
  tratamiento: string
  ref: RefDir
}

type Opcion =
  | { grupo: 'Personas'; p: PersonaDir }
  | { grupo: 'Instituciones'; i: InstitucionDir }

/** Nombre sin tildes, espacios repetidos ni mayúsculas, para comparar. */
export function nombreClave(nombre: string): string {
  return nombre
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * ¿Existe en el directorio alguien con EXACTAMENTE este nombre? Se usa al
 * salir del campo cuando la persona escribió libre en vez de elegir: si hay
 * coincidencia se vincula la fila sola; si no, se le PREGUNTA si quiere
 * agregarlo (Edison 2026-09-05). Devuelve null si no hay coincidencia.
 */
export async function buscarExacto(nombre: string): Promise<Eleccion | null> {
  const clave = nombreClave(nombre)
  if (clave.length < 4) return null
  try {
    const r = await api<{ personas: PersonaDir[]; instituciones: InstitucionDir[] }>(
      `/api/directorio/sugerencias?q=${encodeURIComponent(nombre.trim())}`,
    )
    const p = r.personas.find((x) => nombreClave(x.nombre) === clave)
    if (p) return { nombre: p.nombre, cargo: p.cargo, tratamiento: p.tratamiento, ref: { tipo: 'persona', datos: p } }
    const i = r.instituciones.find((x) => nombreClave(x.nombre) === clave)
    if (i) return { nombre: i.nombre, cargo: '', tratamiento: 'Señores:', ref: { tipo: 'institucion', datos: i } }
  } catch {
    /* sin servidor: no se pregunta nada */
  }
  return null
}

// Actualiza en el directorio el registro del que se rellenó la fila,
// conservando el resto de sus campos (el PUT reemplaza todo el modelo).
export async function actualizarEnDirectorio(
  ref: RefDir,
  nombre: string,
  cargo: string,
): Promise<RefDir> {
  if (ref.tipo === 'persona') {
    const datos = await api<PersonaDir>(`/api/directorio/personas/${ref.datos.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...ref.datos, nombre, cargo }),
    })
    return { tipo: 'persona', datos: { ...ref.datos, ...datos } }
  }
  const datos = await api<InstitucionDir>(`/api/directorio/instituciones/${ref.datos.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...ref.datos, nombre }),
  })
  return { tipo: 'institucion', datos }
}

export default function AutocompletadoDirectorio({
  etiqueta,
  valor,
  alEscribir,
  alElegir,
  alSalir,
  alPegar,
  sx,
}: {
  etiqueta: React.ReactNode
  valor: string
  alEscribir: (v: string) => void
  alElegir: (e: Eleccion) => void
  /** Al salir del campo (para preguntar si el nombre libre va al directorio). */
  alSalir?: () => void
  /** Texto pegado de varias líneas (un bloque de destinatario): true si lo repartió. */
  alPegar?: (texto: string) => boolean
  sx?: object
}) {
  const [opciones, setOpciones] = useState<Opcion[]>([])
  const [cargando, setCargando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const buscar = (q: string) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (q.trim().length < 2) {
      setOpciones([])
      return
    }
    temporizador.current = setTimeout(async () => {
      setCargando(true)
      try {
        const r = await api<{ personas: PersonaDir[]; instituciones: InstitucionDir[] }>(
          `/api/directorio/sugerencias?q=${encodeURIComponent(q)}`,
        )
        setOpciones([
          ...r.personas.map((p): Opcion => ({ grupo: 'Personas', p })),
          ...r.instituciones.map((i): Opcion => ({ grupo: 'Instituciones', i })),
        ])
      } catch {
        setOpciones([])
      } finally {
        setCargando(false)
      }
    }, 250)
  }

  return (
    <Autocomplete
      freeSolo
      size="small"
      sx={sx}
      options={opciones}
      groupBy={(o) => o.grupo}
      // El backend ya filtró (por nombre, cargo o siglas): no re-filtrar aquí.
      filterOptions={(x) => x}
      getOptionLabel={(o) =>
        typeof o === 'string' ? o : o.grupo === 'Personas' ? o.p.nombre : o.i.nombre
      }
      inputValue={valor}
      onInputChange={(_, v, motivo) => {
        // Solo el TIPEO escribe: la selección la maneja onChange (evita que
        // el «reset» interno del Autocomplete pise el valor elegido).
        if (motivo === 'input') {
          alEscribir(v)
          buscar(v)
        }
      }}
      onChange={(_, o) => {
        if (!o || typeof o === 'string') return
        if (o.grupo === 'Personas') {
          alElegir({
            nombre: o.p.nombre,
            cargo: o.p.cargo,
            tratamiento: o.p.tratamiento,
            ref: { tipo: 'persona', datos: o.p },
          })
        } else {
          alElegir({
            nombre: o.i.nombre,
            cargo: '',
            tratamiento: 'Señores:',
            ref: { tipo: 'institucion', datos: o.i },
          })
        }
      }}
      loading={cargando}
      renderOption={(props, o) => (
        <li
          {...props}
          key={o.grupo === 'Personas' ? `p${o.p.id}` : `i${o.i.id}`}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            {o.grupo === 'Personas' ? (
              <PersonIcon sx={{ fontSize: 18, mt: '2px', color: 'text.secondary' }} />
            ) : (
              <AccountBalanceIcon sx={{ fontSize: 18, mt: '2px', color: 'text.secondary' }} />
            )}
            {o.grupo === 'Personas' ? (
              <Box>
                <Box sx={{ fontWeight: 600, fontSize: 13 }}>{o.p.nombre}</Box>
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {o.p.cargo}
                  {o.p.institucion_nombre
                    ? ` — ${o.p.institucion_siglas || o.p.institucion_nombre}`
                    : ''}
                </Box>
              </Box>
            ) : (
              <Box>
                <Box sx={{ fontWeight: 600, fontSize: 13 }}>
                  {o.i.siglas ? `${o.i.siglas} — ` : ''}
                  {o.i.nombre}
                </Box>
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {o.i.tipo}
                  {o.i.region ? ` · ${o.i.region}` : ''}
                </Box>
              </Box>
            )}
          </Box>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={etiqueta}
          placeholder="Escriba y elija del directorio, o texto libre"
          onBlur={alSalir}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text')
            if (alPegar && /\n\s*\S/.test(t) && alPegar(t)) e.preventDefault()
          }}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {cargando ? <CircularProgress size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  )
}

// ---------------------------------------------------------------------
// Diálogo «Agregar al directorio»: registra una persona (con su cargo e
// institución) o una institución nueva SIN salir del formulario. Devuelve
// la referencia creada para que la fila quede vinculada.
// ---------------------------------------------------------------------
const TIPOS_INST = [
  'ministerio', 'poder', 'autonomo', 'organismo', 'regulador', 'region',
  'municipalidad', 'universidad', 'empresa', 'direccion', 'oficina', 'otro',
]
const TRATAMIENTOS = ['', 'Señor:', 'Señora:', 'Señorita:', 'Señores:', 'Señoras:']

export function DialogoAgregarDirectorio({
  abierto,
  inicial,
  editar = null,
  alCerrar,
  alCreado,
  alAvisar,
}: {
  abierto: boolean
  inicial: { nombre: string; cargo: string; tratamiento?: string }
  /** Registro a EDITAR (modo «editar»): se guardan los cambios con PUT en vez
   *  de crear uno nuevo. Null = modo «agregar». */
  editar?: RefDir | null
  alCerrar: () => void
  /** Registro creado (o actualizado) para que la fila quede vinculada. */
  alCreado: (ref: RefDir) => void
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
}) {
  const [clase, setClase] = useState<'persona' | 'institucion'>('persona')
  const [nombre, setNombre] = useState(inicial.nombre)
  const [cargo, setCargo] = useState(inicial.cargo)
  const [tratamiento, setTratamiento] = useState('')
  const [inst, setInst] = useState<InstitucionDir | null>(null)
  const [instTexto, setInstTexto] = useState('')
  const [instOpciones, setInstOpciones] = useState<InstitucionDir[]>([])
  const [siglas, setSiglas] = useState('')
  const [tipoInst, setTipoInst] = useState('otro')
  const [guardando, setGuardando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Re-sembrar los campos cuando el diálogo se abre con otra fila (o con un
  // registro a editar: se parte de lo que el directorio tiene hoy, más lo que
  // la fila ya corrigió).
  const anterior = useRef(abierto)
  if (abierto && !anterior.current) {
    if (editar?.tipo === 'persona') {
      const d = editar.datos
      setClase('persona')
      setNombre(inicial.nombre || d.nombre)
      setCargo(inicial.cargo || d.cargo)
      setTratamiento(inicial.tratamiento || d.tratamiento || '')
      const i = d.institucion_id
        ? ({ id: d.institucion_id, nombre: d.institucion_nombre ?? '', siglas: d.institucion_siglas ?? '' } as InstitucionDir)
        : null
      setInst(i)
      setInstTexto(i ? (i.siglas ? `${i.siglas} — ${i.nombre}` : i.nombre) : '')
      setSiglas('')
      setTipoInst('otro')
    } else if (editar?.tipo === 'institucion') {
      const d = editar.datos
      setClase('institucion')
      setNombre(inicial.nombre || d.nombre)
      setCargo('')
      setTratamiento('')
      setInst(null)
      setInstTexto('')
      setSiglas(d.siglas)
      setTipoInst(d.tipo || 'otro')
    } else {
      setClase('persona')
      setNombre(inicial.nombre)
      setCargo(inicial.cargo)
      setTratamiento(inicial.tratamiento ?? '')
      setInst(null)
      setInstTexto('')
      setSiglas('')
      setTipoInst('otro')
    }
  }
  anterior.current = abierto

  const buscarInst = (q: string) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(async () => {
      try {
        const r = await api<InstitucionDir[]>(
          `/api/directorio/instituciones?q=${encodeURIComponent(q)}`,
        )
        setInstOpciones(r)
      } catch {
        setInstOpciones([])
      }
    }, 250)
  }

  const guardar = async () => {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      if (editar?.tipo === 'persona') {
        // El PUT reemplaza el modelo completo: se parte del registro que ya
        // había para no borrar teléfono, correo ni notas.
        const datos = await api<PersonaDir>(`/api/directorio/personas/${editar.datos.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...editar.datos,
            nombre: nombre.trim(),
            cargo: cargo.trim(),
            tratamiento,
            institucion_id: inst?.id ?? null,
          }),
        })
        alCreado({
          tipo: 'persona',
          datos: {
            ...editar.datos,
            ...datos,
            institucion_nombre: inst?.nombre ?? '',
            institucion_siglas: inst?.siglas ?? '',
          },
        })
        alAvisar?.('success', `«${datos.nombre}» actualizado en el directorio.`)
      } else if (editar?.tipo === 'institucion') {
        const datos = await api<InstitucionDir>(`/api/directorio/instituciones/${editar.datos.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...editar.datos, nombre: nombre.trim(), siglas: siglas.trim(), tipo: tipoInst }),
        })
        alCreado({ tipo: 'institucion', datos })
        alAvisar?.('success', `«${datos.nombre}» actualizada en el directorio.`)
      } else if (clase === 'persona') {
        const datos = await api<PersonaDir>('/api/directorio/personas', {
          method: 'POST',
          body: JSON.stringify({
            nombre: nombre.trim(),
            cargo: cargo.trim(),
            tratamiento,
            institucion_id: inst?.id ?? null,
          }),
        })
        alCreado({
          tipo: 'persona',
          datos: {
            ...datos,
            institucion_nombre: inst?.nombre ?? '',
            institucion_siglas: inst?.siglas ?? '',
          },
        })
        alAvisar?.('success', `«${datos.nombre}» agregado al directorio.`)
      } else {
        const datos = await api<InstitucionDir>('/api/directorio/instituciones', {
          method: 'POST',
          body: JSON.stringify({
            nombre: nombre.trim(),
            siglas: siglas.trim(),
            tipo: tipoInst,
          }),
        })
        alCreado({ tipo: 'institucion', datos })
        alAvisar?.('success', `«${datos.nombre}» agregada al directorio.`)
      }
      alCerrar()
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo guardar en el directorio.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editar ? 'Editar en el directorio institucional' : 'Agregar al directorio institucional'}
      </DialogTitle>
      <DialogContent dividers>
        {editar && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Los cambios valen para los PRÓXIMOS documentos; los ya enviados
            conservan el dato con el que se hicieron.
          </Typography>
        )}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={clase}
          onChange={(_, v) => v && setClase(v)}
          sx={{ mb: 2, display: editar ? 'none' : undefined }}
        >
          <ToggleButton value="persona">
            <PersonIcon sx={{ fontSize: 18, mr: 0.5 }} /> Persona / autoridad
          </ToggleButton>
          <ToggleButton value="institucion">
            <AccountBalanceIcon sx={{ fontSize: 18, mr: 0.5 }} /> Institución
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          {clase === 'persona' ? (
            <>
              <TextField
                select
                size="small"
                label="Tratamiento"
                value={tratamiento}
                onChange={(e) => setTratamiento(e.target.value)}
              >
                {TRATAMIENTOS.map((t) => (
                  <MenuItem key={t} value={t}>{t || '—'}</MenuItem>
                ))}
              </TextField>
              <Box />
              <TextField
                size="small"
                label="Nombre completo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                sx={{ gridColumn: '1 / 3' }}
                required
              />
              <TextField
                size="small"
                label="Cargo"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                sx={{ gridColumn: '1 / 3' }}
              />
              <Autocomplete
                sx={{ gridColumn: '1 / 3' }}
                size="small"
                options={instOpciones}
                filterOptions={(x) => x}
                getOptionLabel={(i) => (i.siglas ? `${i.siglas} — ${i.nombre}` : i.nombre)}
                value={inst}
                inputValue={instTexto}
                onInputChange={(_, v, motivo) => {
                  setInstTexto(v)
                  if (motivo === 'input') buscarInst(v)
                }}
                onChange={(_, v) => setInst(v)}
                renderInput={(params) => (
                  <TextField {...params} label="Institución (opcional)" placeholder="Buscar en el directorio…" />
                )}
              />
            </>
          ) : (
            <>
              <TextField
                size="small"
                label="Nombre de la institución"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                sx={{ gridColumn: '1 / 3' }}
                required
              />
              <TextField
                size="small"
                label="Siglas"
                value={siglas}
                onChange={(e) => setSiglas(e.target.value)}
              />
              <TextField
                select
                size="small"
                label="Tipo"
                value={tipoInst}
                onChange={(e) => setTipoInst(e.target.value)}
              >
                {TIPOS_INST.map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={guardando || !nombre.trim()}>
          {editar ? 'Guardar cambios' : 'Guardar en el directorio'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

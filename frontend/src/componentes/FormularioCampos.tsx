import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PublishedWithChangesIcon from '@mui/icons-material/PublishedWithChanges'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import AutocompletadoDirectorio, {
  DialogoAgregarDirectorio,
  actualizarEnDirectorio,
  buscarExacto,
  nombreClave,
  type Eleccion,
  type RefDir,
} from './AutocompletadoDirectorio'
import { api } from '../api'
import { esAnterior, fechaLarga, hoyIso } from '../fechas'
import { numerarCampos, subNumero } from '../numeracion'
import { rotuloCorto } from '../rotulos'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { copiasOcultas } from '../formato'
import { Rotulo } from './Paso'
import { Titulo } from './Estilo'
import { adjuntarArchivo, excedeLimite } from './Adjuntos'
import { EVENTO_RELACIONES } from './RelacionesDocumento'
import { ListaReferencias, usePopupReferencias } from './PopupReferencias'
import type { ResultadoReferencia } from '../extensiones/consultaReferencias'

export interface CampoEsquema {
  clave: string
  etiqueta: string
  tipo:
    | 'texto'
    | 'area'
    | 'select'
    | 'fecha'
    | 'destinatarios'
    | 'copias'
    | 'referencias'
    | 'oculto'
  opciones?: string[]
  ancho?: 'corto'
  opcional?: boolean
  /** Campo que se pinta dentro de OTRA sección del editor (p. ej. la línea
   *  «Adj.» dentro de Anexos). El formulario principal lo omite. */
  seccion?: string
}

// ---------------------------------------------------------------------
// Utilidad: estado LOCAL de filas sincronizado con el valor serializado
// del formulario. Sin esto, una fila recién agregada (aún vacía) se
// perdería al re-render, porque la serialización descarta filas vacías.
// ---------------------------------------------------------------------
function useFilas<T>(
  valor: string,
  parsear: (v: string) => T[],
  serializar: (filas: T[]) => string,
  alCambiar: (v: string) => void,
) {
  const [filas, setFilas] = useState<T[]>(() => parsear(valor))
  const ultimaEmision = useRef(valor)
  useEffect(() => {
    // Cambio EXTERNO del valor (restaurar versión, carga inicial…):
    // re-parsear; los cambios propios no rebotan (ultimaEmision).
    if (valor !== ultimaEmision.current) {
      setFilas(parsear(valor))
      ultimaEmision.current = valor
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])
  const escribir = (nuevas: T[]) => {
    setFilas(nuevas)
    const s = serializar(nuevas)
    ultimaEmision.current = s
    alCambiar(s)
  }
  return [filas, escribir] as const
}

// ---------------------------------------------------------------------
// Directorio en las filas de destinatario y de copia (Edison 2026-09-05):
//
//   · Si el nombre se escribió LIBRE y al salir del campo no existe en el
//     directorio, el sistema PREGUNTA si se quiere agregar (antes había que
//     descubrir un iconito). Si existe con ese nombre exacto, vincula solo.
//   · Si la fila viene del directorio, se puede EDITAR el registro (diálogo
//     completo) o, si se corrigió aquí el nombre/cargo, ACTUALIZARLO de un
//     clic.
// ---------------------------------------------------------------------
type Avisar = (tipo: 'success' | 'error', texto: string) => void

function usePreguntarDirectorio(
  nombre: string,
  ref: RefDir | undefined,
  alVincular: (e: Eleccion) => void,
) {
  // Nombre que resultó ausente (se muestra la pregunta) y nombre para el que
  // la persona ya dijo «omitir» (no se vuelve a preguntar por él).
  const [ausente, setAusente] = useState('')
  const [omitido, setOmitido] = useState('')
  const consultar = async () => {
    const n = nombre.trim()
    if (ref || nombreClave(n).length < 4 || nombreClave(n) === nombreClave(omitido)) {
      setAusente('')
      return
    }
    const e = await buscarExacto(n)
    if (e) {
      alVincular(e)
      setAusente('')
    } else {
      setAusente(n)
    }
  }
  useEffect(() => {
    if (ausente && nombreClave(ausente) !== nombreClave(nombre)) setAusente('')
  }, [nombre, ausente])
  return {
    consultar,
    ausente: ref ? '' : ausente,
    omitir: () => {
      setOmitido(nombre)
      setAusente('')
    },
  }
}

function AvisoNoEnDirectorio({
  nombre,
  alAgregar,
  alOmitir,
}: {
  nombre: string
  alAgregar: () => void
  alOmitir: () => void
}) {
  return (
    <Alert
      severity="info"
      icon={false}
      sx={{ py: 0, mb: 0.75, '& .MuiAlert-message': { py: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' } }}
    >
      <span>
        «{nombre}» no está en el directorio. ¿Agregarlo?
      </span>
      <Button size="small" variant="outlined" onClick={alAgregar}>
        Agregar
      </Button>
      <Button size="small" onClick={alOmitir}>
        Omitir
      </Button>
    </Alert>
  )
}

/** ¿La fila difiere del registro del directorio del que se rellenó? */
function modificado(nombre: string, cargo: string, ref?: RefDir): boolean {
  if (!ref) return false
  return ref.tipo === 'persona'
    ? nombre.trim() !== ref.datos.nombre || cargo.trim() !== ref.datos.cargo
    : nombre.trim() !== ref.datos.nombre
}

function BotonesDirectorio({
  nombre,
  cargo,
  registro: ref,
  alActualizar,
  alEditar,
  alAgregar,
}: {
  nombre: string
  cargo: string
  /** Registro del directorio vinculado a la fila (`ref` es prop reservada). */
  registro?: RefDir
  alActualizar: () => void
  alEditar: () => void
  alAgregar: () => void
}) {
  if (ref) {
    return (
      <>
        {modificado(nombre, cargo, ref) && (
          <Tooltip title={`Actualizar «${ref.datos.nombre}» en el directorio con este dato`}>
            <IconButton size="small" color="primary" onClick={alActualizar} aria-label="Actualizar en el directorio">
              <PublishedWithChangesIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Tomado del directorio. Editar sus datos (cargo, institución…)">
          <IconButton size="small" onClick={alEditar} aria-label="Editar en el directorio">
            <EditOutlinedIcon fontSize="small" sx={{ opacity: 0.7 }} />
          </IconButton>
        </Tooltip>
      </>
    )
  }
  if (nombre.trim()) {
    return (
      <Tooltip title="Agregar al directorio institucional (se reutilizará en próximos documentos)">
        <IconButton size="small" onClick={alAgregar} aria-label="Agregar al directorio">
          <BookmarkAddOutlinedIcon fontSize="small" sx={{ opacity: 0.6 }} />
        </IconButton>
      </Tooltip>
    )
  }
  return null
}

// ---------------------------------------------------------------------
// Destinatarios: filas Nombre + Cargo (opcional) con «Agregar
// destinatario». Se serializan en el MISMO campo destinatario_nombre:
//   1 fila  -> nombre (y el cargo va aparte, en destinatario_cargo)
//   2+ filas-> líneas «Nombre — Cargo» (el generador las apila o las
//              enumera según traigan cargo o no; formato de la casa).
// El TRATAMIENTO («Señor:») va inline, delante del nombre de la primera fila:
// es donde se lee «Señor: Fulano» (Edison 2026-09-05).
// ---------------------------------------------------------------------
interface FilaDest {
  nombre: string
  cargo: string
  // Registro del directorio del que se rellenó la fila (para ofrecer
  // «Actualizar información» si el usuario corrige el dato). Vive solo en
  // el estado local: NO se serializa al documento.
  ref?: RefDir
}

type Dialogo = { i: number; modo: 'agregar' | 'editar' } | null

function FilaDestinatario({
  i,
  total,
  numero,
  fila,
  tratamientos,
  tratamiento,
  alCambiarTratamiento,
  alCambiar,
  alElegir,
  alActualizar,
  alQuitar,
  alDialogo,
  alPegar,
}: {
  i: number
  total: number
  numero?: number
  fila: FilaDest
  tratamientos?: string[]
  tratamiento: string
  alCambiarTratamiento: (v: string) => void
  alCambiar: (campo: 'nombre' | 'cargo', v: string) => void
  alElegir: (e: Eleccion) => void
  alActualizar: () => void
  alQuitar?: () => void
  alDialogo: (modo: 'agregar' | 'editar') => void
  alPegar?: (texto: string) => boolean
}) {
  const pregunta = usePreguntarDirectorio(fila.nombre, fila.ref, alElegir)
  return (
    <Box sx={{ mb: 0.75 }}>
      {/* En el celular la fila se parte en dos (tratamiento + nombre; cargo +
          botones) en vez de apretar cinco piezas en 360 px. */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        {tratamientos && i === 0 && (
          <TextField
            select
            size="small"
            label="Trat."
            value={tratamiento || tratamientos[0] || ''}
            onChange={(e) => alCambiarTratamiento(e.target.value)}
            sx={{ width: 112, flex: '0 0 auto' }}
          >
            {tratamientos.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
        )}
        <AutocompletadoDirectorio
          etiqueta={
            <Rotulo n={subNumero(numero)}>
              {/* Celular: junto a «Trat.» no cabe «Nombre del destinatario». */}
              {total > 1 ? `Destinatario ${i + 1}` : (
                <>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Nombre del destinatario</Box>
                  <Box component="span" sx={{ display: { sm: 'none' } }}>Destinatario</Box>
                </>
              )}
            </Rotulo>
          }
          valor={fila.nombre}
          alEscribir={(v) => alCambiar('nombre', v)}
          alElegir={alElegir}
          alSalir={() => void pregunta.consultar()}
          alPegar={alPegar}
          sx={{ flex: { xs: '1 1 150px', sm: 1.1 }, minWidth: 0 }}
        />
        <TextField
          size="small"
          label="Cargo (opcional)"
          value={fila.cargo}
          onChange={(e) => alCambiar('cargo', e.target.value)}
          sx={{ flex: { xs: '1 1 180px', sm: 1 }, minWidth: 0 }}
        />
        <BotonesDirectorio
          nombre={fila.nombre}
          cargo={fila.cargo}
          registro={fila.ref}
          alActualizar={alActualizar}
          alEditar={() => alDialogo('editar')}
          alAgregar={() => alDialogo('agregar')}
        />
        {alQuitar && (
          <Tooltip title="Quitar destinatario">
            <IconButton size="small" onClick={alQuitar} aria-label={`Quitar destinatario ${i + 1}`}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {pregunta.ausente && (
        <Box sx={{ mt: 0.5 }}>
          <AvisoNoEnDirectorio
            nombre={pregunta.ausente}
            alAgregar={() => alDialogo('agregar')}
            alOmitir={pregunta.omitir}
          />
        </Box>
      )}
    </Box>
  )
}

function DestinatariosCampo({
  numero,
  valores,
  tratamientos,
  conInstitucion = false,
  alCambiar,
  alAvisar,
}: {
  /** El tipo tiene «Institución o entidad del destinatario» (se completa sola). */
  conInstitucion?: boolean
  // Su lugar en el índice del formulario («1. Nombre del destinatario»).
  numero?: number
  valores: Record<string, string>
  // Opciones del tratamiento (del esquema); si no hay, no se pinta.
  tratamientos?: string[]
  alCambiar: (clave: string, valor: string) => void
  alAvisar?: Avisar
}) {
  const cargoSuelto = useRef(valores.destinatario_cargo ?? '')
  cargoSuelto.current = valores.destinatario_cargo ?? ''

  const parsear = (nombre: string): FilaDest[] => {
    const lineas = (nombre ?? '').split('\n').filter((l) => l.trim() !== '')
    if (lineas.length === 0) return [{ nombre: '', cargo: cargoSuelto.current }]
    const filas = lineas.map((l) => {
      const [n, c] = l.split(' — ', 2)
      return { nombre: (n ?? '').trim(), cargo: (c ?? '').trim() }
    })
    if (filas.length === 1 && !filas[0].cargo) filas[0].cargo = cargoSuelto.current
    return filas
  }

  const [filas, setFilas] = useState<FilaDest[]>(() => parsear(valores.destinatario_nombre ?? ''))
  const ultimaEmision = useRef(valores.destinatario_nombre ?? '')
  useEffect(() => {
    const v = valores.destinatario_nombre ?? ''
    if (v !== ultimaEmision.current) {
      setFilas(parsear(v))
      ultimaEmision.current = v
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores.destinatario_nombre])

  const escribir = (nuevas: FilaDest[]) => {
    const limpias = nuevas.length > 0 ? nuevas : [{ nombre: '', cargo: '' }]
    setFilas(limpias)
    const conDatos = limpias.filter((f) => f.nombre.trim() !== '' || f.cargo.trim() !== '')
    if (limpias.length === 1) {
      ultimaEmision.current = limpias[0].nombre
      alCambiar('destinatario_nombre', limpias[0].nombre)
      alCambiar('destinatario_cargo', limpias[0].cargo)
    } else {
      const serial = conDatos
        .map((f) => (f.cargo.trim() ? `${f.nombre.trim()} — ${f.cargo.trim()}` : f.nombre.trim()))
        .join('\n')
      ultimaEmision.current = serial
      alCambiar('destinatario_nombre', serial)
      alCambiar('destinatario_cargo', '')
    }
  }

  const cambiarFila = (i: number, campo: 'nombre' | 'cargo', v: string) =>
    escribir(filas.map((f, j) => (j === i ? { ...f, [campo]: v } : f)))

  // Elegir una sugerencia del directorio rellena nombre + cargo (y el
  // tratamiento del documento cuando hay UN destinatario y la sugerencia
  // lo trae; con varios no se toca, el formato usa «Señores:»).
  const elegir = (i: number, e: Eleccion) => {
    escribir(filas.map((f, j) => (j === i ? { nombre: e.nombre, cargo: e.cargo || f.cargo, ref: e.ref } : f)))
    if (filas.length === 1 && e.tratamiento) {
      alCambiar('destinatario_tratamiento', e.tratamiento)
    }
    // La entidad de la persona elegida completa «Institución o entidad» si está vacía
    // (2026-10-06: lo que el directorio ya sabe no se vuelve a escribir; lo escrito a
    // mano no se pisa).
    const entidad = e.ref.tipo === 'persona' ? e.ref.datos.institucion_nombre ?? '' : ''
    if (conInstitucion && filas.length === 1 && entidad && !(valores.destinatario_institucion ?? '').trim()) {
      alCambiar('destinatario_institucion', entidad)
    }
  }

  const actualizar = async (i: number) => {
    const f = filas[i]
    if (!f.ref) return
    try {
      const nuevoRef = await actualizarEnDirectorio(f.ref, f.nombre.trim(), f.cargo.trim())
      escribir(filas.map((x, j) => (j === i ? { ...x, ref: nuevoRef } : x)))
      alAvisar?.('success', 'Directorio actualizado: los próximos documentos usarán este dato.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo actualizar el directorio.')
    }
  }

  // Un bloque de destinatario PEGADO («Señor:» / nombre / cargo / institución / «Presente.»)
  // se reparte solo en sus campos (Edison 2026-10-10: «los formularios deben reconocer y
  // estructurar el texto pegado»). Devuelve false si no parece un bloque.
  const pegarDestinatario = (i: number, texto: string): boolean => {
    const lineas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !/^presente\b/i.test(l))
    if (lineas.length < 2) return false
    const ES_TRATO = /^(se[ñn]or(a|es|as)?|doctor(a)?|ingenier[oa]|licenciad[oa]|mag[ií]ster|profesor(a)?|dr(a)?\.?|ing\.?|lic\.?|mg\.?|abog\.?|arq\.?|econ\.?|estimad[oa]s?)\b.{0,25}$/i
    let trato = ''
    if (ES_TRATO.test(lineas[0])) trato = lineas.shift() ?? ''
    if (!lineas.length) return false
    const nombre = lineas.shift() ?? ''
    const cargo = lineas.shift() ?? ''
    const resto = lineas.join(' ')
    escribir(filas.map((f, j) => (j === i ? { nombre, cargo: conInstitucion ? cargo : [cargo, resto].filter(Boolean).join(' ') } : f)))
    if (conInstitucion && resto) alCambiar('destinatario_institucion', resto)
    if (trato && filas.length === 1) {
      const limpio = trato.replace(/\s*:?\s*$/, ':')
      const opcion = (tratamientos ?? []).find((t) => t.toLowerCase() === limpio.toLowerCase())
      alCambiar('destinatario_tratamiento', opcion ?? limpio)
    }
    return true
  }

  // Diálogo «Agregar / Editar en el directorio» (fila que lo abrió y modo).
  const [dlg, setDlg] = useState<Dialogo>(null)
  const filaDlg = dlg !== null ? filas[dlg.i] : undefined

  return (
    <Box sx={{ mt: 1, mb: 0.5 }}>
      {filas.map((f, i) => (
        <FilaDestinatario
          key={i}
          i={i}
          total={filas.length}
          numero={numero}
          fila={f}
          tratamientos={tratamientos}
          tratamiento={valores.destinatario_tratamiento ?? ''}
          alCambiarTratamiento={(v) => alCambiar('destinatario_tratamiento', v)}
          alCambiar={(campo, v) => cambiarFila(i, campo, v)}
          alElegir={(e) => elegir(i, e)}
          alActualizar={() => void actualizar(i)}
          alQuitar={filas.length > 1 ? () => escribir(filas.filter((_, j) => j !== i)) : undefined}
          alDialogo={(modo) => setDlg({ i, modo })}
          alPegar={(t) => pegarDestinatario(i, t)}
        />
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => escribir([...filas, { nombre: '', cargo: '' }])}
      >
        Agregar destinatario
      </Button>
      <DialogoAgregarDirectorio
        abierto={dlg !== null}
        editar={dlg?.modo === 'editar' ? filaDlg?.ref ?? null : null}
        inicial={{
          nombre: filaDlg?.nombre ?? '',
          cargo: filaDlg?.cargo ?? '',
          tratamiento: filas.length === 1 ? valores.destinatario_tratamiento ?? '' : '',
        }}
        alCerrar={() => setDlg(null)}
        alCreado={(ref) => {
          if (dlg === null) return
          const nombre = ref.datos.nombre
          const cargo = ref.tipo === 'persona' ? ref.datos.cargo : filas[dlg.i]?.cargo ?? ''
          escribir(filas.map((x, j) => (j === dlg.i ? { nombre, cargo, ref } : x)))
          if (ref.tipo === 'persona' && filas.length === 1 && ref.datos.tratamiento) {
            alCambiar('destinatario_tratamiento', ref.datos.tratamiento)
          }
        }}
        alAvisar={alAvisar}
      />
    </Box>
  )
}

// ---------------------------------------------------------------------
// Con copia (c.c.): VARIAS copias, cada una con tratamiento + nombre +
// cargo. Se serializa al formato de líneas que el generador agrupa
// (parsear_copias): «Señor:» abre una copia; luego nombre; luego cargo.
// Cada fila se autocompleta del directorio con las mismas acciones que el
// destinatario (agregar/editar/actualizar), y el sistema muestra como chip
// las copias SUGERIDAS por las reglas que todavía no están puestas
// (la primera, por defecto, es la del Presidente de la Cámara de Diputados:
// se siembra al crear el documento; Edison 2026-09-05).
// ---------------------------------------------------------------------
const TRATAMIENTOS_COPIA = ['Señor:', 'Señora:', 'Señorita:', 'Señores:', 'Señoras:']

interface FilaCopia {
  trat: string
  nombre: string
  cargo: string
  ref?: RefDir
}

interface CopiaSugerida {
  regla_id: number
  tratamiento: string
  nombre: string
  cargo: string
  motivo: string
  cambio_en_directorio: boolean
}

function aCopias(valor: string): FilaCopia[] {
  const lineas = (valor ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const copias: FilaCopia[] = []
  let actual: FilaCopia | null = null
  for (const l of lineas) {
    // Con o sin los dos puntos («Señor» o «Señor:»; 2026-10-12): se guarda siempre la forma de la lista.
    const trat = TRATAMIENTOS_COPIA.find((t) => t.toLowerCase() === `${l.replace(/:\s*$/, '')}:`.toLowerCase())
    if (trat) {
      actual = { trat, nombre: '', cargo: '' }
      copias.push(actual)
      continue
    }
    if (!actual) {
      actual = { trat: '', nombre: '', cargo: '' }
      copias.push(actual)
    }
    if (!actual.nombre) actual.nombre = l
    else actual.cargo = actual.cargo ? `${actual.cargo} / ${l}` : l
  }
  return copias
}

// Orden institucional de las copias (mismas reglas que
// servicios/copias.py::rango_copia): Oficialía → Mesa Directiva → comisión →
// grupo parlamentario → oficina de enlace → Defensoría → el resto.
const RANGOS_COPIA: [number, string[]][] = [
  [1, ['oficial mayor', 'oficialia mayor']],
  [2, ['mesa directiva', 'presidente de la camara', 'presidenta de la camara']],
  [3, ['presidente de la comision', 'presidenta de la comision', 'comision ordinaria']],
  [4, ['grupo parlamentario', 'bancada', 'vocero']],
  [5, ['oficina de enlace', 'enlace con el congreso']],
  [6, ['defensor del pueblo', 'defensora del pueblo', 'defensoria del pueblo']],
]
function rangoCopia(c: FilaCopia): number {
  const texto = nombreClave(`${c.cargo} ${c.nombre}`)
  for (const [rango, claves] of RANGOS_COPIA) {
    if (claves.some((k) => texto.includes(k))) return rango
  }
  return 99
}
export function ordenarCopias(copias: FilaCopia[]): FilaCopia[] {
  return copias
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rangoCopia(a.c) - rangoCopia(b.c) || a.i - b.i)
    .map((x) => x.c)
}

function deCopias(copias: FilaCopia[]): string {
  return copias
    .filter((c) => c.nombre.trim() !== '' || c.cargo.trim() !== '')
    .map((c) =>
      [
        c.trat || 'Señor:',
        c.nombre.trim(),
        ...c.cargo.split(' / ').map((s) => s.trim()).filter(Boolean),
      ].join('\n'),
    )
    .join('\n')
}

function FilaCopiaCampo({
  i,
  copia,
  alCambiar,
  alElegir,
  alActualizar,
  alQuitar,
  alDialogo,
}: {
  i: number
  copia: FilaCopia
  alCambiar: (campo: keyof FilaCopia, v: string) => void
  alElegir: (e: Eleccion) => void
  alActualizar: () => void
  alQuitar: () => void
  alDialogo: (modo: 'agregar' | 'editar') => void
}) {
  const pregunta = usePreguntarDirectorio(copia.nombre, copia.ref, alElegir)
  return (
    <Box sx={{ mb: 0.75 }}>
      {/* En el celular la fila se parte en dos (tratamiento + nombre; cargo +
          botones) en vez de apretar cinco piezas en 360 px. */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        <TextField
          select
          size="small"
          label="Trat."
          value={copia.trat || 'Señor:'}
          onChange={(e) => alCambiar('trat', e.target.value)}
          sx={{ width: 112, flex: '0 0 auto' }}
        >
          {TRATAMIENTOS_COPIA.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <AutocompletadoDirectorio
          etiqueta={`Copia ${i + 1}: nombre`}
          valor={copia.nombre}
          alEscribir={(v) => alCambiar('nombre', v)}
          alElegir={alElegir}
          alSalir={() => void pregunta.consultar()}
          sx={{ flex: { xs: '1 1 150px', sm: 1 }, minWidth: 0 }}
        />
        <TextField
          size="small"
          label="Cargo (opcional; use / para 2 líneas)"
          value={copia.cargo}
          onChange={(e) => alCambiar('cargo', e.target.value)}
          sx={{ flex: { xs: '1 1 180px', sm: 1 }, minWidth: 0 }}
        />
        <BotonesDirectorio
          nombre={copia.nombre}
          cargo={copia.cargo}
          registro={copia.ref}
          alActualizar={alActualizar}
          alEditar={() => alDialogo('editar')}
          alAgregar={() => alDialogo('agregar')}
        />
        <Tooltip title="Quitar copia">
          <IconButton size="small" onClick={alQuitar} aria-label={`Quitar copia ${i + 1}`}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {pregunta.ausente && (
        <Box sx={{ mt: 0.5 }}>
          <AvisoNoEnDirectorio
            nombre={pregunta.ausente}
            alAgregar={() => alDialogo('agregar')}
            alOmitir={pregunta.omitir}
          />
        </Box>
      )}
    </Box>
  )
}

function CopiasCampo({
  etiqueta,
  valor,
  tipo,
  oculto,
  alCambiar,
  alMostrar,
  alAvisar,
}: {
  etiqueta: React.ReactNode
  valor: string
  // Tipo documental, para pedir las copias sugeridas que le corresponden.
  tipo?: string
  // Copias DESACTIVADAS para este documento (fmt_copia_mostrar='no'): se
  // siguen escribiendo y guardando, pero no salen en el PDF. El ajuste vive
  // en el globo de formato de esta misma parte (AjusteFormato.tsx); aquí solo
  // se avisa —si no, el texto escrito parecería perdido— y se ofrece volver
  // a imprimirlas de un clic.
  oculto?: boolean
  alCambiar: (valor: string) => void
  alMostrar?: () => void
  alAvisar?: Avisar
}) {
  const [copias, escribirCrudo] = useFilas<FilaCopia>(valor, aCopias, deCopias, alCambiar)
  // Toda escritura deja las copias en el orden institucional (las filas
  // vacías o a medio llenar se quedan al final para no saltar mientras se
  // escribe).
  const escribir = (nuevas: FilaCopia[]) => {
    const llenas = nuevas.filter((c) => c.nombre.trim())
    const vacias = nuevas.filter((c) => !c.nombre.trim())
    escribirCrudo([...ordenarCopias(llenas), ...vacias])
  }
  const [sugeridas, setSugeridas] = useState<CopiaSugerida[]>([])

  useEffect(() => {
    if (!tipo) return
    api<CopiaSugerida[]>(`/api/copias/sugeridas?tipo=${encodeURIComponent(tipo)}`)
      .then(setSugeridas)
      .catch(() => setSugeridas([]))
  }, [tipo])

  const cambiar = (i: number, campo: keyof FilaCopia, v: string) =>
    escribir(copias.map((c, j) => (j === i ? { ...c, [campo]: v } : c)))

  const elegir = (i: number, e: Eleccion) =>
    escribir(
      copias.map((x, j) =>
        j === i
          ? { trat: e.tratamiento || x.trat, nombre: e.nombre, cargo: e.cargo || x.cargo, ref: e.ref }
          : x,
      ),
    )

  const actualizar = async (i: number) => {
    const c = copias[i]
    if (!c.ref) return
    try {
      const nuevoRef = await actualizarEnDirectorio(c.ref, c.nombre.trim(), c.cargo.trim())
      escribir(copias.map((x, j) => (j === i ? { ...x, ref: nuevoRef } : x)))
      alAvisar?.('success', 'Directorio actualizado: los próximos documentos usarán este dato.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo actualizar el directorio.')
    }
  }

  // Sugeridas que aún no están (mismo criterio que el servidor: nombre sin
  // tildes ni mayúsculas).
  const puestas = new Set(copias.map((c) => nombreClave(c.nombre)).filter(Boolean))
  const faltantes = sugeridas.filter((s) => !puestas.has(nombreClave(s.nombre)))

  const agregarSugerida = (s: CopiaSugerida) => {
    const nueva: FilaCopia = { trat: s.tratamiento || 'Señor:', nombre: s.nombre, cargo: s.cargo }
    // Si la última fila está vacía, se rellena en vez de agregar otra.
    const ultima = copias[copias.length - 1]
    if (ultima && !ultima.nombre.trim() && !ultima.cargo.trim()) {
      escribir([...copias.slice(0, -1), nueva])
    } else {
      escribir([...copias, nueva])
    }
  }

  const [dlg, setDlg] = useState<Dialogo>(null)
  const copiaDlg = dlg !== null ? copias[dlg.i] : undefined

  return (
    <Box sx={{ mt: 1, mb: 0.5 }}>
      <Titulo
        nivel="grupo"
        accion={
          oculto ? (
            <Tooltip
              title={
                'Las copias no se imprimen.' + (alMostrar ? ' Clic para imprimirlas.' : '')
              }
            >
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                icon={<VisibilityOffOutlinedIcon />}
                label="No se imprimen"
                onClick={alMostrar}
              />
            </Tooltip>
          ) : undefined
        }
      >
        {etiqueta}
      </Titulo>
      <Box sx={oculto ? { opacity: 0.55 } : undefined}>
        {copias.map((c, i) => (
          <FilaCopiaCampo
            key={i}
            i={i}
            copia={c}
            alCambiar={(campo, v) => cambiar(i, campo, v)}
            alElegir={(e) => elegir(i, e)}
            alActualizar={() => void actualizar(i)}
            alQuitar={() => escribir(copias.filter((_, j) => j !== i))}
            alDialogo={(modo) => setDlg({ i, modo })}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => escribir([...copias, { trat: 'Señor:', nombre: '', cargo: '' }])}
        >
          Agregar copia
        </Button>
        {faltantes.map((s) => (
          <Tooltip
            key={s.regla_id}
            title={`Copia que el despacho suele poner${s.motivo ? `: ${s.motivo}` : ''}. Clic para agregarla.`}
          >
            <Chip
              size="small"
              variant="outlined"
              color={s.cambio_en_directorio ? 'warning' : 'primary'}
              icon={<AddIcon />}
              label={`Sugerida: ${s.nombre}`}
              onClick={() => agregarSugerida(s)}
            />
          </Tooltip>
        ))}
      </Box>
      <DialogoAgregarDirectorio
        abierto={dlg !== null}
        editar={dlg?.modo === 'editar' ? copiaDlg?.ref ?? null : null}
        inicial={{
          nombre: copiaDlg?.nombre ?? '',
          cargo: copiaDlg?.cargo ?? '',
          tratamiento: copiaDlg?.trat ?? '',
        }}
        alCerrar={() => setDlg(null)}
        alCreado={(ref) => {
          if (dlg === null) return
          const cargo = ref.tipo === 'persona' ? ref.datos.cargo : copias[dlg.i]?.cargo ?? ''
          const trat = ref.tipo === 'persona' ? ref.datos.tratamiento || copias[dlg.i]?.trat : 'Señores:'
          escribir(copias.map((x, j) => (j === dlg.i ? { trat: trat || x.trat, nombre: ref.datos.nombre, cargo, ref } : x)))
        }}
        alAvisar={alAvisar}
      />
    </Box>
  )
}

// ---------------------------------------------------------------------
// Referencias: VARIAS líneas (leyes, oficios previos…). Cada fila usa el
// MISMO autocompletado de referencias que el cuerpo del documento
// (GET /api/referencias/buscar, lista de PopupReferencias: normas,
// documentos, proyectos, semanas, personas, biblioteca…) y admite texto
// libre. Se serializan como líneas en el campo `referencia` que el
// generador une con «; » (referencia_texto).
// ---------------------------------------------------------------------

/** Un resultado de la búsqueda de referencias con el tipo del documento. */
type ResultadoRef = ResultadoReferencia & { doc_tipo?: string }

/**
 * Una referencia: nombre/número (con autocompletado) y, AL LADO, el archivo
 * (Edison 2026-09-05). Tres automatismos:
 *   · Elegir un documento DEL SISTEMA lo vincula solo como «relacionado»
 *     (sección Documentos recibidos y relacionados → Internos).
 *   · Si ese documento es uno RECIBIDO (tipo `recibido`: lo que llegó de otra
 *     entidad), se PROPONE con un clic marcarlo «responde a» (2026-10-06): el
 *     oficio que cita lo recibido suele ser su respuesta, pero no siempre, así
 *     que nunca se marca solo. El despacho no se responde a sí mismo: a un
 *     documento propio no se le propone.
 *   · Subir un archivo lo registra como ADJUNTO del documento, con la
 *     referencia como nombre.
 */
function FilaReferencia({
  indice,
  valor,
  documentoId,
  alCambiar,
  alQuitar,
  alAvisar,
}: {
  indice: number
  valor: string
  documentoId?: string
  alCambiar: (v: string) => void
  alQuitar: () => void
  alAvisar?: Avisar
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [archivoNombre, setArchivoNombre] = useState('')
  const [vinculado, setVinculado] = useState<{ numero: string; tipo: 'relacionado' | 'responde' } | null>(null)
  // La propuesta «responde a» de un documento recibido recién elegido.
  const [propuesta, setPropuesta] = useState<{ id: number; numero: string; relacionId?: number } | null>(null)
  const [consulta, setConsulta] = useState<{ consulta: string; izquierda: number; abajo: number } | null>(null)
  const campo = useRef<HTMLInputElement | null>(null)

  const vincular = async (r: ResultadoRef) => {
    const destino = Number(r.id)
    if (!documentoId || !destino || String(destino) === documentoId) return
    const recibido = r.doc_tipo === 'recibido'
    try {
      const res = await api<{ relacion_id: number }>(`/api/documentos/${documentoId}/relaciones`, {
        method: 'POST',
        body: JSON.stringify({ destino_id: destino, tipo: 'relacionado' }),
      })
      setVinculado({ numero: r.texto, tipo: 'relacionado' })
      window.dispatchEvent(new Event(EVENTO_RELACIONES))
      if (recibido) setPropuesta({ id: destino, numero: r.texto, relacionId: res.relacion_id })
      else alAvisar?.('success', `${r.texto} quedó vinculado como documento relacionado.`)
    } catch (e) {
      // 409 = ya estaba vinculado: no es un error para quien redacta.
      const msg = e instanceof Error ? e.message : ''
      if (/ya existe/i.test(msg)) {
        setVinculado({ numero: r.texto, tipo: 'relacionado' })
        if (recibido) setPropuesta({ id: destino, numero: r.texto })
      } else alAvisar?.('error', msg || 'No se pudo vincular el documento.')
    }
  }

  /** «Responde a»: el vínculo dirigido reemplaza al «relacionado» que se acaba de crear. */
  const marcarRespuesta = async () => {
    if (!documentoId || !propuesta) return
    try {
      await api(`/api/documentos/${documentoId}/relaciones`, {
        method: 'POST',
        body: JSON.stringify({ destino_id: propuesta.id, tipo: 'responde' }),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (!/ya existe/i.test(msg)) {
        alAvisar?.('error', msg || 'No se pudo marcar como respuesta.')
        return
      }
    }
    // El «relacionado» con ese mismo documento sobra: se quita (el de ahora o uno de antes).
    let relacionId = propuesta.relacionId
    if (!relacionId) {
      const lista = await api<{ relacion_id: number; tipo: string; documento: { id: number | null } }[]>(
        `/api/documentos/${documentoId}/relaciones`,
      ).catch(() => [])
      relacionId = lista.find((x) => x.tipo === 'relacionado' && x.documento?.id === propuesta.id)?.relacion_id
    }
    if (relacionId) {
      await api(`/api/documentos/${documentoId}/relaciones/${relacionId}`, { method: 'DELETE' }).catch(() => {})
    }
    setVinculado({ numero: propuesta.numero, tipo: 'responde' })
    setPropuesta(null)
    window.dispatchEvent(new Event(EVENTO_RELACIONES))
    alAvisar?.('success', `Este documento quedó como respuesta a ${propuesta.numero}.`)
  }

  const elegir = (r: ResultadoRef) => {
    alCambiar(r.texto)
    setConsulta(null)
    if (r.tipo === 'documento') void vincular(r)
    // Un documento RECIBIDO (bandeja de entrada): este oficio queda como su respuesta;
    // al firmarse o enviarse, la entrada pasa sola a «respondida» (servicios/entradas.py).
    if (r.tipo === 'entrada' && documentoId) {
      api(`/api/entradas/${r.id}/vincular`, { method: 'POST', body: JSON.stringify({ documento_id: Number(documentoId) }) })
        .then(() => {
          setVinculado({ numero: r.texto, tipo: 'responde' })
          alAvisar?.('success', `Este documento quedó como respuesta del recibido ${r.texto}.`)
        })
        .catch((e) => alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo vincular el documento recibido.'))
    }
  }
  const popup = usePopupReferencias(consulta, 'documento', elegir)

  const buscar = (v: string) => {
    const caja = campo.current?.getBoundingClientRect()
    setConsulta(v.trim().length >= 2 && caja ? { consulta: v.trim(), izquierda: caja.left, abajo: caja.bottom } : null)
  }

  const subir = async (f: File | null) => {
    if (!f || !documentoId) return
    const exceso = excedeLimite(f)
    if (exceso) {
      alAvisar?.('error', exceso)
      return
    }
    setSubiendo(true)
    try {
      await adjuntarArchivo(documentoId, f, valor.trim() ? `Ref. ${valor.trim()}` : `Referencia ${indice + 1}`)
      setArchivoNombre(f.name)
      alAvisar?.('success', `Archivo de la referencia registrado en los adjuntos (${f.name}).`)
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo subir el archivo.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Box sx={{ mb: 0.75 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          fullWidth
          size="small"
          label={`Referencia ${indice + 1}`}
          placeholder="Oficio N.° 95, Ley N.° 27795, @persona… o texto libre"
          value={valor}
          inputRef={campo}
          onChange={(e) => {
            alCambiar(e.target.value)
            buscar(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && consulta) {
              setConsulta(null)
              e.preventDefault()
              return
            }
            if (popup.teclado(e)) e.preventDefault()
          }}
          onBlur={() => setConsulta(null)}
          inputProps={{ 'aria-autocomplete': 'list', autoComplete: 'off' }}
          InputProps={{ endAdornment: popup.cargando && consulta ? <CircularProgress size={16} /> : undefined }}
        />
        {vinculado && (
          <Tooltip title={vinculado.tipo === 'responde' ? `Este documento responde a ${vinculado.numero}` : `Vinculado como documento relacionado: ${vinculado.numero}`}>
            <Chip size="small" color="success" variant="outlined" label={vinculado.tipo === 'responde' ? 'responde a' : 'vinculado'} sx={{ height: 22 }} />
          </Tooltip>
        )}
        {documentoId && (
          <Tooltip title={archivoNombre ? `Archivo adjuntado: ${archivoNombre}` : 'Subir el archivo de esta referencia (queda en los adjuntos)'}>
            <Button
              component="label"
              size="small"
              variant={archivoNombre ? 'text' : 'outlined'}
              color={archivoNombre ? 'success' : 'primary'}
              disabled={subiendo}
              startIcon={<AttachFileIcon fontSize="small" />}
              sx={{ whiteSpace: 'nowrap', flex: '0 0 auto', textTransform: 'none' }}
            >
              {archivoNombre ? 'Archivo ✓' : 'Archivo'}
              <input
                type="file"
                hidden
                accept=".pdf,.docx,.xlsx,.ods,.odt,.jpg,.jpeg,.png,.zip,.csv"
                onChange={(e) => void subir(e.target.files?.[0] ?? null)}
              />
            </Button>
          </Tooltip>
        )}
        <Tooltip title="Quitar referencia">
          <IconButton
            size="small"
            onClick={alQuitar}
            aria-label={`Quitar referencia ${indice + 1}`}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {propuesta && (
        <Alert
          severity="info"
          variant="outlined"
          sx={{ mt: 0.5, py: 0, alignItems: 'center' }}
          action={
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button size="small" onClick={() => void marcarRespuesta()} sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}>
                Sí, le responde
              </Button>
              <Button size="small" color="inherit" onClick={() => setPropuesta(null)} sx={{ textTransform: 'none' }}>
                No
              </Button>
            </Box>
          }
        >
          {propuesta.numero} es un documento recibido. ¿Este documento le responde?
        </Alert>
      )}
      {consulta && (
        <ListaReferencias
          estado={consulta}
          resultados={popup.resultados}
          cargando={popup.cargando}
          indice={popup.indice}
          alElegir={elegir}
          alApuntar={popup.setIndice}
        />
      )}
    </Box>
  )
}

function ReferenciasCampo({
  etiqueta,
  valor,
  documentoId,
  alCambiar,
  alAvisar,
}: {
  etiqueta: React.ReactNode
  valor: string
  documentoId?: string
  alCambiar: (valor: string) => void
  alAvisar?: Avisar
}) {
  const parsear = (v: string) =>
    (v ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const serializar = (fs: string[]) => fs.map((f) => f.trim()).filter(Boolean).join('\n')
  const [refs, escribir] = useFilas<string>(valor, parsear, serializar, alCambiar)

  const cambiar = (i: number, v: string) => escribir(refs.map((r, j) => (j === i ? v : r)))

  return (
    <Box sx={{ mt: 1, mb: 0.5 }}>
      <Titulo nivel="grupo">{etiqueta}</Titulo>
      {refs.map((r, i) => (
        <FilaReferencia
          key={i}
          indice={i}
          valor={r}
          documentoId={documentoId}
          alCambiar={(v) => cambiar(i, v)}
          alQuitar={() => escribir(refs.filter((_, j) => j !== i))}
          alAvisar={alAvisar}
        />
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={() => escribir([...refs, ''])}>
        Agregar referencia
      </Button>
    </Box>
  )
}

// Formulario que se pinta desde el ESQUEMA del tipo documental. Añadir
// campos a un tipo (backend/app/tipos.py) los hace aparecer aquí sin
// tocar este componente.
export default function FormularioCampos({
  esquema,
  valores,
  alCambiar,
  alAvisar,
  tipo,
  documentoId,
  seccion = '',
  envolver,
  alCambiarFormato,
  numerado = false,
}: {
  /** Ya tiene número oficial: su fecha es la que salió y no se sugiere cambiarla. */
  numerado?: boolean
  esquema: CampoEsquema[]
  valores: Record<string, string>
  alCambiar: (clave: string, valor: string) => void
  // Avisos (éxito/error) de las acciones del directorio institucional.
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
  // Tipo documental (para las copias sugeridas).
  tipo?: string
  // Id del documento (para adjuntar archivos y vincular referencias).
  documentoId?: string
  // Qué campos pintar: los del bloque principal ('') o los de una sección
  // del editor (p. ej. 'anexos' → la línea «Adj.»).
  seccion?: string
  // Envoltorio de cada campo (el editor pone ahí la marca de observación).
  envolver?: (clave: string, nodo: React.ReactNode) => React.ReactNode
  // Escritura de un ajuste fmt_* desde el propio formulario (hoy: volver a
  // imprimir las copias). El editor pasa `ponerFormato`, que además dispara
  // la vista previa automática; sin él se cae a `alCambiar`.
  alCambiarFormato?: (clave: string, valor: string) => void
}) {
  const cambiarFormato = alCambiarFormato ?? alCambiar
  const visibles = esquema.filter((c) => c.tipo !== 'oculto' && (c.seccion ?? '') === seccion)
  const cortos = visibles.filter((c) => c.ancho === 'corto')
  const largos = visibles.filter((c) => c.ancho !== 'corto')
  // Índice del formulario: «1. Destinatario», «2. Asunto»… en el orden en que
  // se ven, no en el del esquema (ver numeracion.ts). Los campos de una
  // sección no llevan número: lo lleva la sección.
  const { orden } = numerarCampos(esquema)
  // Celular: el rótulo de un campo de texto va sin paréntesis (MUI lo cortaría);
  // lo que iba entre paréntesis y el «opcional» bajan a la nota del campo.
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  const rotuloCampo = (c: CampoEsquema): { label: React.ReactNode; helperText?: string } => {
    if (!celular) return { label: rotulo(c) }
    const { corto, nota } = rotuloCorto(c.etiqueta, c.opcional)
    return { label: <Rotulo n={subNumero(orden[c.clave])}>{corto}</Rotulo>, helperText: nota || undefined }
  }
  const rotulo = (c: CampoEsquema): React.ReactNode => (
    <Rotulo n={subNumero(orden[c.clave])}>
      {c.etiqueta + (c.opcional ? ' (opcional)' : '')}
    </Rotulo>
  )
  const tratamientos = esquema.find((c) => c.clave === 'destinatario_tratamiento')?.opciones

  const campo = (c: CampoEsquema): React.ReactNode => {
    if (c.tipo === 'destinatarios') {
      return (
        <DestinatariosCampo
          numero={orden[c.clave]}
          valores={valores}
          tratamientos={tratamientos}
          conInstitucion={esquema.some((x) => x.clave === 'destinatario_institucion')}
          alCambiar={alCambiar}
          alAvisar={alAvisar}
        />
      )
    }
    if (c.tipo === 'copias') {
      return (
        <CopiasCampo
          etiqueta={rotulo(c)}
          valor={valores[c.clave] ?? ''}
          tipo={tipo}
          oculto={copiasOcultas(valores)}
          alCambiar={(v) => alCambiar(c.clave, v)}
          alMostrar={() => cambiarFormato('fmt_copia_mostrar', '')}
          alAvisar={alAvisar}
        />
      )
    }
    if (c.tipo === 'referencias') {
      return (
        <ReferenciasCampo
          etiqueta={rotulo(c)}
          valor={valores[c.clave] ?? ''}
          documentoId={documentoId}
          alCambiar={(v) => alCambiar(c.clave, v)}
          alAvisar={alAvisar}
        />
      )
    }
    const comun = {
      ...rotuloCampo(c),
      value: valores[c.clave] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => alCambiar(c.clave, e.target.value),
      fullWidth: true,
      margin: 'dense' as const,
    }
    if (c.tipo === 'select') {
      return (
        <TextField select {...comun}>
          {(c.opciones ?? []).map((o) => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </TextField>
      )
    }
    if (c.tipo === 'fecha') {
      // La fecha nace con el día en que se CREÓ el borrador; si se numera días
      // después, salía vieja sin que nadie lo notara (revisión de usabilidad
      // 2026-10-01). Se dice cómo saldrá y, si quedó atrás, se ofrece la de hoy.
      const v = valores[c.clave] ?? ''
      const vieja = !numerado && esAnterior(v)
      return (
        <TextField type="date" InputLabelProps={{ shrink: true }} {...comun}
          helperText={vieja
            ? <>Es del {fechaLarga(v)}, anterior a hoy. <Box component="span" role="button" sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }} onClick={() => alCambiar(c.clave, hoyIso())}>Usar la de hoy</Box></>
            : v ? `Sale: ${fechaLarga(v)}` : comun.helperText}
          FormHelperTextProps={vieja ? { sx: { color: 'warning.main' } } : undefined} />
      )
    }
    // Pegar «ASUNTO: …» o «REFERENCIA: …» desde otro documento: el rótulo sobra (2026-10-10).
    const sinRotulo = (c.clave === 'asunto' || c.clave === 'referencia')
      ? { onPaste: (e: React.ClipboardEvent) => {
          const t = e.clipboardData.getData('text')
          const limpio = t.replace(/^\s*(asunto|referencia|ref\.?)\s*[:.]?\s*/i, '').replace(/\s+/g, ' ').trim()
          if (limpio !== t.trim()) { e.preventDefault(); alCambiar(c.clave, limpio) }
        } }
      : {}
    if (c.tipo === 'area') {
      return <TextField multiline minRows={1} {...comun} {...sinRotulo} />
    }
    return <TextField {...comun} {...sinRotulo} />
  }

  // Retícula: los campos cortos (fecha, selects) miden 240 px. Sin envoltorio
  // comparten fila; CON envoltorio (el editor, que pone las marcas en el
  // canal derecho) cada uno va en su propia fila para que su marca quede en
  // la misma vertical que las de los campos anchos (Edison 2026-09-07).
  const render = (c: CampoEsquema) => {
    const caja =
      c.ancho === 'corto' ? <Box sx={{ width: { xs: '100%', sm: 240 }, maxWidth: '100%' }}>{campo(c)}</Box> : campo(c)
    return <Box key={c.clave}>{envolver ? envolver(c.clave, caja) : caja}</Box>
  }

  return (
    <Box>
      {largos.map(render)}
      {cortos.length > 0 &&
        (envolver ? (
          cortos.map(render)
        ) : (
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>{cortos.map(render)}</Box>
        ))}
    </Box>
  )
}

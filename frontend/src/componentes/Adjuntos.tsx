/**
 * DOCUMENTOS ADJUNTOS: archivos EXTERNOS que acompañan al documento (informes,
 * escaneos, planillas). No cambian el PDF oficial; se unen en el expediente.
 * Una imagen puede marcarse para incrustarse como página final del PDF.
 *
 * Forma de llenado (Edison 2026-10-01, tercera vuelta): PRIMERO el archivo y,
 * al elegirlo, su nombre (propuesto desde el archivo). Antes se podía escribir
 * el nombre y olvidar el archivo: quedaban filas «Sin archivo» y, al cargarlas
 * por otro lado, se veían duplicadas. Un documento que solo existe en papel se
 * registra por su nombre, pero a propósito («solo en papel»), no por descuido.
 *
 * Un nombre escrito y un archivo con esa misma etiqueta son EL MISMO adjunto
 * (como en el visor y en la línea «Adj.», adjuntos.py::combinar_adjuntos): se
 * muestra una sola fila y el nombre suelto sale de `campos.anexo`.
 * Otras partes del editor (Referencias) también suben adjuntos y avisan por
 * el evento `sgdp:adjuntos` para que esta lista se refresque.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import InsertPhotoIcon from '@mui/icons-material/InsertPhoto'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import Typography from '@mui/material/Typography'
import { api, descargarArchivo, subirArchivo } from '../api'
import { conConfirmacion, MENSAJE_NO_GUARDADO, textoAnulacion, type Anulacion } from '../vigencia'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import FilaArchivo, { Vacio } from './FilaArchivo'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { esVisualizable } from './VisorDocumento'
import { confirmar, pedirTexto } from './Dialogos'

export const EVENTO_ADJUNTOS = 'sgdp:adjuntos'

interface AdjuntoMeta {
  id: number
  nombre: string
  tamano: number
  tipo_mime: string
  subido_en: string
  es_anexo: boolean
  es_imagen: boolean
  categoria: string
  etiqueta: string
  /** Cómo se cita en la línea «Adj.» (la calcula el servidor; adjuntos.citas_de). */
  cita?: string
}

const ACEPTA = '.pdf,.docx,.xlsx,.ods,.odt,.jpg,.jpeg,.png,.zip,.csv'
// Mismo límite que el servidor (servicios/adjuntos.py::MAX_BYTES).
export const MAX_MB = 50
export function excedeLimite(f: File): string | null {
  return f.size > MAX_MB * 1024 * 1024
    ? `«${f.name}» pesa ${(f.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${MAX_MB} MB.`
    : null
}

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Respuesta de las escrituras sobre adjuntos (servicios/vigencia.py). */
export interface RespuestaVigencia {
  firmado_invalidado?: boolean
  anulacion?: Anulacion | null
}

/** Sube un archivo como ADJUNTO del documento (categoría vacía) con su
 *  descripción; lo usan este componente y Referencias. Un adjunto nuevo
 *  agrega su nombre a la línea «Adj.»: si el documento ya estaba firmado, se
 *  pregunta antes (anula la firma). Si la persona no acepta, lanza un error
 *  con el motivo y no se sube nada. */
export async function adjuntarArchivo(
  documentoId: string,
  archivo: File,
  descripcion: string,
): Promise<RespuestaVigencia> {
  const r = await conConfirmacion((confirmar) => {
    const fd = new FormData()
    fd.append('archivo', archivo)
    // La descripción viaja como «etiqueta»: el backend nombra el archivo con
    // ella (corto, sin datos del oficio: la carpeta ya identifica el trámite).
    fd.append('etiqueta', descripcion.trim())
    fd.append('confirmar_anulacion', String(confirmar))
    return subirArchivo<RespuestaVigencia>(`/api/documentos/${documentoId}/adjuntos`, fd)
  })
  if (r === null) throw new Error(MENSAJE_NO_GUARDADO)
  window.dispatchEvent(new Event(EVENTO_ADJUNTOS))
  return r
}

/** Clave para comparar un nombre escrito con la etiqueta de un archivo. */
export const claveNombre = (t: string) => t.toLowerCase().split(/\s+/).filter(Boolean).join(' ')

/**
 * Carga el ARCHIVO de un adjunto que estaba registrado solo por nombre
 * (Edison 2026-10-01: «hay 5 adjuntos y no se pueden ver»). El archivo sube
 * con ese mismo nombre como etiqueta y el nombre suelto deja de hacer falta:
 * quien llama lo quita de `campos.anexo`. Aunque el formulario no se guarde,
 * el servidor no lo repite en la línea «Adj.» (adjuntos.py::combinar_adjuntos).
 */
export async function cargarArchivoDeManual(documentoId: string, nombre: string, archivo: File) {
  const exceso = excedeLimite(archivo)
  if (exceso) throw new Error(exceso)
  return adjuntarArchivo(documentoId, archivo, nombre)
}

/** Lista de adjuntos SIN archivo <-> texto del campo `anexo` («A; B»). */
export function parsearManuales(texto: string): string[] {
  return (texto ?? '').split(';').map((n) => n.trim()).filter(Boolean)
}
export function serializarManuales(nombres: string[]): string {
  return nombres.map((n) => n.trim()).filter(Boolean).join('; ')
}

export default function Adjuntos({
  documentoId,
  manuales,
  alCambiarManuales,
  alAvisar,
  alActualizar,
  alVer,
  alContar,
}: {
  documentoId: string
  /** Adjuntos registrados SOLO por nombre (documento físico, sin archivo):
   *  salen en la línea «Adj.» igual que los archivos. Es el campo `anexo`
   *  del documento (Edison 2026-09-05: el formulario de nombre hereda la
   *  función del antiguo campo «Adj.»). */
  manuales?: string[]
  alCambiarManuales?: (nombres: string[]) => void
  alAvisar?: (tipo: 'success' | 'error' | 'warning', texto: string) => void
  // Se llama tras recargar la lista (subir/eliminar/marcar): permite al
  // editor refrescar el visor de firmado/constancias del panel derecho.
  alActualizar?: () => void
  /** Abre el adjunto (PDF o imagen) en el visor del documento, como los
   *  firmados y constancias (Edison 2026-09-07). */
  alVer?: (id: number) => void
  // Informa cuántos adjuntos hay, para el contador de la sección.
  alContar?: (n: number) => void
}) {
  const [adjuntos, setAdjuntos] = useState<AdjuntoMeta[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Adjunto escrito por nombre al que se le está cargando el archivo.
  const [cargandoManual, setCargandoManual] = useState('')
  // Registro de un documento que solo existe en papel (sin archivo).
  const [soloPapel, setSoloPapel] = useState(false)
  const [nombrePapel, setNombrePapel] = useState('')

  // Un nombre escrito que ya tiene su archivo (misma etiqueta) no es otro
  // adjunto: no se lista dos veces.
  const conArchivo = new Set(adjuntos.map((a) => claveNombre(a.etiqueta || a.nombre.replace(/\.[^.]+$/, ''))))
  const pendientes = (manuales ?? []).filter((n) => !conArchivo.has(claveNombre(n)))
  const sobrantes = (manuales ?? []).length - pendientes.length
  // …y sale de campos.anexo (se guarda con el documento; la línea «Adj.» ya
  // no lo repetía). Solo cuando la lista de archivos ya llegó.
  const [listaCargada, setListaCargada] = useState(false)
  useEffect(() => {
    if (listaCargada && sobrantes > 0 && alCambiarManuales) alCambiarManuales(pendientes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaCargada, sobrantes])

  const cargarManual = async (nombre: string, f: File | null) => {
    if (!f) return
    setCargandoManual(nombre)
    try {
      const r = await cargarArchivoDeManual(documentoId, nombre, f)
      alCambiarManuales?.((manuales ?? []).filter((n) => n !== nombre))
      if (r.firmado_invalidado) alAvisar?.('warning', textoAnulacion(r.anulacion))
      else alAvisar?.('success', `Archivo cargado para «${nombre}». Ya se puede ver en la vista previa.`)
      recargar()
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo subir el archivo.')
    } finally {
      setCargandoManual('')
    }
  }

  const recargar = useCallback(() => {
    api<AdjuntoMeta[]>(`/api/documentos/${documentoId}/adjuntos`)
      .then((lista) => {
        // El firmado, las constancias y las respuestas NO son adjuntos: se
        // gestionan aparte. Aquí solo los de categoría vacía.
        // En el orden de la línea «Adj.» (el de carga): cada cargo queda debajo de su documento.
        const propios = (lista || []).filter((a) => !a.categoria).sort((x, y) => x.id - y.id)
        setAdjuntos(propios)
        setListaCargada(true)
        alContar?.(propios.length)
        alActualizar?.()
      })
      .catch(() => {
        setAdjuntos([])
        alContar?.(0)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentoId])

  useEffect(recargar, [recargar])
  useEffect(() => {
    window.addEventListener(EVENTO_ADJUNTOS, recargar)
    return () => window.removeEventListener(EVENTO_ADJUNTOS, recargar)
  }, [recargar])

  const elegir = (f: File | null) => {
    const exceso = f && excedeLimite(f)
    if (exceso) {
      alAvisar?.('error', exceso)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setArchivo(f)
    // Se propone el nombre del archivo; la persona lo corrige antes de subir.
    if (f) setDescripcion(f.name.replace(/\.[^.]+$/, ''))
  }
  const cancelar = () => {
    setArchivo(null)
    setDescripcion('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const registrarPapel = () => {
    const nombre = nombrePapel.trim()
    if (!nombre || !alCambiarManuales) return
    alCambiarManuales([...(manuales ?? []), nombre])
    // 2026-10-06: aviso acortado; la etiqueta del campo ya dice que sale en la línea «Adj.».
    alAvisar?.('success', `«${nombre}» registrado como documento en papel.`)
    setNombrePapel('')
    setSoloPapel(false)
  }

  const subir = async () => {
    if (!archivo || !descripcion.trim()) return
    setSubiendo(true)
    try {
      const r = await adjuntarArchivo(documentoId, archivo, descripcion.trim())
      if (r.firmado_invalidado) alAvisar?.('warning', textoAnulacion(r.anulacion))
      else alAvisar?.('success', `Adjuntado «${descripcion.trim()}».`)
      setDescripcion('')
      setArchivo(null)
      if (inputRef.current) inputRef.current.value = ''
      recargar()
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo subir el archivo.')
    } finally {
      setSubiendo(false)
    }
  }

  // Tras cualquier cambio: refresca esta lista, el visor y el expediente, y
  // avisa si la firma se anuló (vigencia.ts).
  const despues = (r: RespuestaVigencia | null, exito: string) => {
    if (r === null) {
      alAvisar?.('warning', MENSAJE_NO_GUARDADO)
      return
    }
    recargar()
    window.dispatchEvent(new Event(EVENTO_ADJUNTOS))
    if (r.firmado_invalidado) alAvisar?.('warning', textoAnulacion(r.anulacion))
    else alAvisar?.('success', exito)
  }

  const eliminar = async (a: AdjuntoMeta) => {
    if (!(await confirmar(`¿Eliminar «${a.nombre}»? El expediente quedará desactualizado.`, { aceptar: 'Eliminar', peligro: true }))) return
    try {
      const r = await conConfirmacion((confirmar) =>
        api<RespuestaVigencia>(`/api/documentos/${documentoId}/adjuntos/${a.id}?confirmar_anulacion=${confirmar}`, { method: 'DELETE' }),
      )
      despues(r, `Se quitó «${a.etiqueta || a.nombre}».`)
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'Error al eliminar.')
    }
  }

  // Marca/desmarca una imagen para incrustarla como página final del PDF.
  const marcarAnexo = async (a: AdjuntoMeta, valor: boolean) => {
    try {
      const r = await conConfirmacion((confirmar) =>
        api<RespuestaVigencia>(`/api/documentos/${documentoId}/adjuntos/${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ es_anexo: valor, confirmar_anulacion: confirmar }),
        }),
      )
      despues(r, valor ? 'Se incrustará como página del PDF.' : 'Ya no se incrusta en el PDF.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'Error.')
    }
  }

  // «Cambiar nombre»: el nombre sale en la línea «Adj.» del documento, así
  // que en un documento firmado anula la firma (se pregunta antes).
  const renombrar = async (a: AdjuntoMeta) => {
    const actual = a.etiqueta || a.nombre.replace(/\.[^.]+$/, '')
    // 2026-10-06: sin «sale en la línea Adj.» (lo dice la etiqueta del campo de alta).
    const nuevo = await pedirTexto('Nuevo nombre del adjunto:', { inicial: actual, etiqueta: 'Nombre', aceptar: 'Cambiar' })
    if (nuevo === null || !nuevo.trim() || nuevo.trim() === actual) return
    try {
      const r = await conConfirmacion((confirmar) =>
        api<RespuestaVigencia>(`/api/documentos/${documentoId}/adjuntos/${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ etiqueta: nuevo.trim(), confirmar_anulacion: confirmar }),
        }),
      )
      despues(r, `Nombre cambiado a «${nuevo.trim()}».`)
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo cambiar el nombre.')
    }
  }

  // «Reemplazar archivo»: otra versión del mismo adjunto (conserva su nombre y
  // su lugar). La firma sigue —la línea «Adj.» no cambia— pero el expediente
  // queda desactualizado; una imagen incrustada sí anula la firma.
  const reemplazar = async (a: AdjuntoMeta, f: File | null) => {
    if (!f) return
    const exceso = excedeLimite(f)
    if (exceso) {
      alAvisar?.('error', exceso)
      return
    }
    try {
      const r = await conConfirmacion((confirmar) => {
        const fd = new FormData()
        fd.append('archivo', f)
        fd.append('confirmar_anulacion', String(confirmar))
        return subirArchivo<RespuestaVigencia>(`/api/documentos/${documentoId}/adjuntos/${a.id}/archivo`, fd, 'PUT')
      })
      despues(
        r,
        `Archivo de «${a.etiqueta || a.nombre}» reemplazado (el anterior quedó en «anteriores»). Si ya armó el expediente, vuelva a armarlo.`,
      )
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo reemplazar el archivo.')
    }
  }

  return (
    <Box>
      {/* Paso 1: el archivo. Paso 2 (al elegirlo): su nombre y «Adjuntar». */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        <Button
          component="label"
          variant={archivo ? 'outlined' : 'contained'}
          size="small"
          startIcon={<AttachFileIcon />}
          sx={{ textTransform: 'none', maxWidth: 260 }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {archivo ? archivo.name : 'Elegir archivo para adjuntar'}
          </Box>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={ACEPTA}
            onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          />
        </Button>
        {archivo && (
          <>
            <TextField
              size="small"
              autoFocus
              label="Nombre (línea Adj.)"
              placeholder="p. ej. Relación de dirigentes participantes"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              sx={{ flex: 1, minWidth: 'min(100%, 220px)' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && descripcion.trim()) void subir()
              }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<UploadFileIcon />}
              onClick={() => void subir()}
              disabled={subiendo || !descripcion.trim()}
            >
              {subiendo ? 'Subiendo…' : 'Adjuntar'}
            </Button>
            <Tooltip title="Cancelar">
              <IconButton size="small" onClick={cancelar} aria-label="Cancelar"><CloseIcon fontSize="small" /></IconButton>
            </Tooltip>
          </>
        )}
        {!archivo && alCambiarManuales && !soloPapel && (
          <Tooltip title="Para un documento que se entrega solo en papel y no tiene archivo digital">
            <Button size="small" sx={{ textTransform: 'none' }} onClick={() => setSoloPapel(true)}>
              Es un documento solo en papel
            </Button>
          </Tooltip>
        )}
      </Box>
      {soloPapel && !archivo && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
          <TextField
            size="small"
            autoFocus
            label="Nombre del documento en papel"
            value={nombrePapel}
            onChange={(e) => setNombrePapel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') registrarPapel()
            }}
            sx={{ flex: 1, minWidth: 'min(100%, 220px)' }}
          />
          <Button size="small" variant="outlined" onClick={registrarPapel} disabled={!nombrePapel.trim()}>Registrar sin archivo</Button>
          <IconButton size="small" onClick={() => { setSoloPapel(false); setNombrePapel('') }} aria-label="Cancelar"><CloseIcon fontSize="small" /></IconButton>
        </Box>
      )}

      {/* Estado de la sección: completo (✓) o cuántos faltan. */}
      {(adjuntos.length > 0 || pendientes.length > 0) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          {pendientes.length === 0 ? (
            <>
              <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                {adjuntos.length === 1 ? 'El adjunto tiene su archivo' : `Los ${adjuntos.length} adjuntos tienen su archivo`}
              </Typography>
            </>
          ) : (
            <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
              {pendientes.length === 1 ? 'Falta 1 archivo' : `Faltan ${pendientes.length} archivos`} · {adjuntos.length} cargado{adjuntos.length === 1 ? '' : 's'}
            </Typography>
          )}
        </Box>
      )}

      {pendientes.map((n, i) => (
        <FilaArchivo
          key={`m-${i}`}
          icono={<AttachFileIcon fontSize="small" sx={{ opacity: 0.5 }} />}
          nombre={n}
          // 2026-10-06: sin «ya sale en la línea Adj.» (repetido; lo dice la etiqueta del campo).
          detalle={<Box component="span" sx={{ color: 'warning.main' }}>Falta el archivo</Box>}
          extra={
            <Tooltip title="Cargar su PDF">
              <Button
                component="label"
                size="small"
                startIcon={<UploadFileIcon fontSize="small" />}
                disabled={cargandoManual !== ''}
                sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
              >
                {cargandoManual === n ? 'Subiendo…' : 'Cargar archivo'}
                <input type="file" hidden accept={ACEPTA} onChange={(e) => void cargarManual(n, e.target.files?.[0] ?? null)} />
              </Button>
            </Tooltip>
          }
          alEliminar={() => alCambiarManuales?.((manuales ?? []).filter((x) => x !== n))}
          textoEliminar="Quitar de la línea Adj."
        />
      ))}

      {adjuntos.map((a) => (
        <FilaArchivo
          key={a.id}
          icono={<AttachFileIcon fontSize="small" />}
          nombre={
            <>
              {/* Como se cita en la línea «Adj.» (la descripción), no el nombre del archivo, que
                  queda al pasar el puntero (Edison 2026-10-19: «sigue con el nombre anterior»). */}
              <Box
                component="span"
                title={a.nombre}
                sx={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.35 }}
              >
                {a.cita || a.etiqueta || a.nombre}
              </Box>
              {a.es_anexo && (
                <Chip
                  label="página del PDF"
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ ml: 1, height: 18, fontSize: 11 }}
                />
              )}
            </>
          }
          detalle={`${(a.nombre.split('.').pop() || '').toUpperCase()} · ${tamanoLegible(a.tamano)} · ${a.subido_en ? new Date(a.subido_en).toLocaleDateString('es-PE') : ''} · cargado`}
          extra={
            <>
              {alVer && esVisualizable(a.nombre) && (
                <Tooltip title="Ver en el visor del documento">
                  <IconButton size="small" aria-label={`Ver ${a.nombre}`} onClick={() => alVer(a.id)}>
                    <VisibilityOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {/* 2026-10-06: sin «sale en la línea Adj.» (repetido en la sección). */}
              <Tooltip title="Cambiar nombre (en un documento firmado anula la firma)">
                <IconButton size="small" aria-label={`Cambiar nombre de ${a.nombre}`} onClick={() => void renombrar(a)}>
                  <DriveFileRenameOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reemplazar archivo (conserva el nombre)">
                <IconButton size="small" component="label" aria-label={`Reemplazar archivo de ${a.nombre}`}>
                  <SwapHorizIcon fontSize="small" />
                  <input
                    type="file"
                    hidden
                    accept={ACEPTA}
                    onChange={(e) => {
                      void reemplazar(a, e.target.files?.[0] ?? null)
                      e.target.value = ''
                    }}
                  />
                </IconButton>
              </Tooltip>
              {a.es_imagen ? (
              <Tooltip
                title={
                  a.es_anexo
                    ? 'Quitar como página del PDF'
                    : 'Incrustar como página final del PDF (escaneo que forma parte del documento)'
                }
              >
                <IconButton
                  size="small"
                  color={a.es_anexo ? 'primary' : 'default'}
                  aria-label="Incrustar como página del PDF"
                  onClick={() => marcarAnexo(a, !a.es_anexo)}
                >
                  <InsertPhotoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              ) : null}
            </>
          }
          alDescargar={() =>
            descargarArchivo(`/api/documentos/${documentoId}/adjuntos/${a.id}`, a.nombre)
          }
          alEliminar={() => void eliminar(a)}
          textoEliminar="Eliminar adjunto"
        />
      ))}
      {adjuntos.length === 0 && pendientes.length === 0 && (
        // 2026-10-06: estado vacío breve; el formulario de arriba ya explica cómo adjuntar.
        <Vacio>Sin adjuntos.</Vacio>
      )}
    </Box>
  )
}

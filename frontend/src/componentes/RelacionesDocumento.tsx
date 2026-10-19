/**
 * DOCUMENTOS RECIBIDOS Y RELACIONADOS, en dos partes (Edison 2026-09-05):
 *
 *  INTERNOS — otros documentos DEL DESPACHO ligados a este. Se vinculan solos
 *    cuando en Referencias (1.3) se cita un documento del sistema; aquí se ve
 *    la lista y se puede vincular otro. Un solo tipo de vínculo, «Relacionado
 *    con» (continuación, mismo expediente, reiteración): el despacho no se
 *    responde a sí mismo, así que aquí NO se ofrece «Responde a».
 *
 *  EXTERNOS — documentos de OTRAS entidades. Dos vínculos, y solo dos:
 *    · «Respondido por»: la entidad contestó ESTE documento (lo normal: se
 *      registra la respuesta recibida, con sus archivos).
 *    · «Responde a»: este documento contesta a uno que la entidad envió.
 *    El encabezado dice de un vistazo si el documento ya tiene respuesta.
 *
 * El tipo de documento externo es una lista ESTÁNDAR ampliable (no texto
 * libre); la fecha nace con la de hoy pero se CONFIRMA antes de guardar (la
 * respuesta casi nunca es de hoy); el asunto es opcional.
 *
 * Los vínculos viajan por la API de siempre (`/relaciones`,
 * `/relaciones-externas`); este componente solo cambia cómo se llenan. Escucha
 * el evento `sgdp:relaciones` para refrescarse cuando otra parte del editor
 * (Referencias) vincula un documento.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import LinkIcon from '@mui/icons-material/Link'
import AddIcon from '@mui/icons-material/Add'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import DownloadIcon from '@mui/icons-material/Download'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PublicIcon from '@mui/icons-material/Public'
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined'

import { api, subirArchivo, descargarArchivo as descargarConNombre } from '../api'
import { Vacio } from './FilaArchivo'
import { Titulo } from './Estilo'
import { confirmar, pedirTexto } from './Dialogos'

export const EVENTO_RELACIONES = 'sgdp:relaciones'

interface DocRef {
  id: number | null
  numero_completo: string
  tipo_nombre: string
  estado: string
  asunto: string
  institucion?: string
  fecha?: string
}
interface Relacion {
  relacion_id: number
  tipo: string
  sale: boolean
  externo: boolean
  etiqueta: string
  nota: string
  tiene_archivo: boolean
  archivos?: { id: number; nombre: string }[]
  documento: DocRef
}

// Vínculos posibles con un documento EXTERNO (y solo estos).
const MODOS_EXT = [
  {
    valor: 'respondido',
    etiqueta: 'Respondido por',
    ayuda: 'La entidad contestó ESTE documento: registre la respuesta recibida.',
  },
  {
    valor: 'responde',
    etiqueta: 'Responde a',
    ayuda: 'Este documento contesta a uno que la entidad envió antes.',
  },
]
const NUEVO_TIPO = '__nuevo__'
const hoy = () => new Date().toISOString().slice(0, 10)
const EXT_VACIO = () => ({ numero: '', tipo: 'Oficio', institucion: '', fecha: hoy(), asunto: '' })

export default function RelacionesDocumento({
  documentoId,
  alAvisar,
  alActualizar,
  alContar,
}: {
  documentoId: string
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
  // Refresca dependencias externas (el visor de adjuntos del editor) cuando una
  // respuesta externa con archivo se registra o se quita.
  alActualizar?: () => void
  // Informa cuántos vínculos hay, para el contador de la sección que lo
  // contiene (PanelArchivos) sin repetir la consulta.
  alContar?: (n: number) => void
}) {
  const [rels, setRels] = useState<Relacion[]>([])
  const [guardando, setGuardando] = useState(false)
  // Vínculo interno.
  const [opciones, setOpciones] = useState<DocRef[]>([])
  const [texto, setTexto] = useState('')
  const [sel, setSel] = useState<DocRef | null>(null)
  const [cargando, setCargando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Documento externo.
  const [formExt, setFormExt] = useState(false)
  const [modo, setModo] = useState('respondido')
  const [ext, setExt] = useState(EXT_VACIO())
  const [tipos, setTipos] = useState<string[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const archivoRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(() => {
    api<Relacion[]>(`/api/documentos/${documentoId}/relaciones`)
      .then((r) => {
        setRels(r)
        alContar?.(r.length)
      })
      .catch(() => {
        setRels([])
        alContar?.(0)
      })
  }, [documentoId, alContar])
  useEffect(cargar, [cargar])
  useEffect(() => {
    window.addEventListener(EVENTO_RELACIONES, cargar)
    return () => window.removeEventListener(EVENTO_RELACIONES, cargar)
  }, [cargar])
  useEffect(() => {
    api<string[]>('/api/ajustes/tipos-externos').then(setTipos).catch(() => setTipos(['Oficio', 'Carta', 'Otro']))
  }, [])

  const buscar = (q: string) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (q.trim().length < 2) {
      setOpciones([])
      return
    }
    temporizador.current = setTimeout(async () => {
      setCargando(true)
      try {
        setOpciones(
          await api<DocRef[]>(
            `/api/documentos/buscar-vinculo?q=${encodeURIComponent(q)}&excluir=${documentoId}`,
          ),
        )
      } catch {
        setOpciones([])
      } finally {
        setCargando(false)
      }
    }, 250)
  }

  const vincularInterno = async () => {
    if (!sel || sel.id == null) return
    setGuardando(true)
    try {
      await api(`/api/documentos/${documentoId}/relaciones`, {
        method: 'POST',
        body: JSON.stringify({ destino_id: sel.id, tipo: 'relacionado' }),
      })
      setSel(null)
      setTexto('')
      setOpciones([])
      cargar()
      alAvisar?.('success', 'Documento vinculado.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo vincular.')
    } finally {
      setGuardando(false)
    }
  }

  const elegirTipo = async (valor: string) => {
    if (valor !== NUEVO_TIPO) {
      setExt({ ...ext, tipo: valor })
      return
    }
    const nombre = await pedirTexto('Nombre del nuevo tipo de documento (p. ej. «Carta múltiple»):', { inicial: '', etiqueta: 'Nombre', aceptar: 'Agregar' })
    if (!nombre || nombre.trim().length < 2) return
    try {
      const lista = await api<string[]>('/api/ajustes/tipos-externos', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim() }),
      })
      setTipos(lista)
      const puesto = lista.find((t) => t.toLowerCase() === nombre.trim().toLowerCase()) ?? nombre.trim()
      setExt({ ...ext, tipo: puesto })
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo agregar el tipo.')
    }
  }

  const registrarExterno = async () => {
    if (!ext.numero.trim()) {
      alAvisar?.('error', 'Indique el número del documento externo.')
      return
    }
    // La fecha nace con la de hoy para no dejarla vacía, pero la respuesta de
    // una entidad casi nunca es de hoy: se confirma antes de guardar.
    if (
      ext.fecha === hoy() &&
      !(await confirmar(
        'La fecha del documento externo quedó como HOY. ¿Es realmente la fecha que lleva ese documento?',
        { aceptar: 'Sí, es de hoy', cancelar: 'Corregir la fecha' },
      ))
    )
      return
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.append('tipo', modo) // responde | respondido
      fd.append('numero', ext.numero)
      fd.append('doc_tipo', ext.tipo)
      fd.append('institucion', ext.institucion)
      fd.append('fecha', ext.fecha)
      fd.append('asunto', ext.asunto)
      const files = archivoRef.current?.files
      if (files) Array.from(files).forEach((f) => fd.append('archivos', f))
      await subirArchivo(`/api/documentos/${documentoId}/relaciones-externas`, fd)
      setExt(EXT_VACIO())
      setNombreArchivo('')
      if (archivoRef.current) archivoRef.current.value = ''
      setFormExt(false)
      cargar()
      alActualizar?.() // refresca el visor de adjuntos del editor
      alAvisar?.('success', 'Documento externo registrado.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo registrar.')
    } finally {
      setGuardando(false)
    }
  }

  // Descarga con el nombre del sistema (2026-10-10): una pestaña con un blob se guardaba como
  // «b11b11e4-….pdf» en otras computadoras.
  const descargarArchivo = async (adjuntoId: number) => {
    try {
      await descargarConNombre(`/api/documentos/${documentoId}/adjuntos/${adjuntoId}`)
    } catch {
      alAvisar?.('error', 'No se pudo descargar el archivo.')
    }
  }

  const desvincular = async (rel: Relacion) => {
    const quien = rel.documento.numero_completo
    if (!(await confirmar(`¿Quitar el vínculo con ${quien}?`, { aceptar: 'Quitar', peligro: true }))) return
    try {
      await api(`/api/documentos/${documentoId}/relaciones/${rel.relacion_id}`, {
        method: 'DELETE',
      })
      cargar()
      alActualizar?.() // el visor pierde la respuesta si tenía archivo
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo desvincular.')
    }
  }

  const internos = rels.filter((r) => !r.externo)
  const externos = rels.filter((r) => r.externo)
  const respuestas = externos.filter((r) => r.tipo === 'respondido')
  const respondeA = externos.filter((r) => r.tipo === 'responde')

  const fila = (r: Relacion) => (
    <Box
      key={r.relacion_id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        // En el celular, los archivos y el quitar bajan a otra línea.
        flexWrap: { xs: 'wrap', sm: 'nowrap' },
        gap: 1,
        py: 0.5,
        px: 0.75,
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Chip
        size="small"
        label={r.etiqueta}
        color={r.tipo === 'responde' || r.tipo === 'respondido' ? 'primary' : 'default'}
        variant="outlined"
        sx={{ flexShrink: 0, minWidth: 118 }}
      />
      <Box sx={{ flex: { xs: '1 1 150px', sm: 1 }, minWidth: 0 }}>
        {r.externo ? (
          // Quién responde, primero (Edison 2026-09-05): la institución es lo
          // que se reconoce de un vistazo; el número va debajo.
          <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>
            {r.documento.institucion || r.documento.numero_completo || r.documento.asunto || '(sin institución)'}
          </Typography>
        ) : (
          <Link
            component={RouterLink}
            to={`/documentos/${r.documento.id}`}
            sx={{ fontSize: 13, fontWeight: 600, display: 'block' }}
            noWrap
          >
            {r.documento.numero_completo}
          </Link>
        )}
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {[
            r.externo ? [r.documento.tipo_nombre, r.documento.numero_completo].filter(Boolean).join(' ') : null,
            r.externo ? r.documento.fecha : null,
            r.documento.asunto,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </Typography>
      </Box>
      {(r.archivos?.length ?? 0) > 0 &&
        r.archivos!.map((a, i) => (
          <Tooltip key={a.id} title={`Ver / descargar: ${a.nombre}`}>
            <Chip
              size="small"
              icon={<DownloadIcon sx={{ fontSize: 14 }} />}
              label={r.archivos!.length > 1 ? `Archivo ${i + 1}` : 'Archivo'}
              variant="outlined"
              clickable
              onClick={() => descargarArchivo(a.id)}
              sx={{ height: 22, fontSize: 11 }}
            />
          </Tooltip>
        ))}
      <Tooltip title="Quitar vínculo">
        <IconButton size="small" color="error" onClick={() => desvincular(r)} aria-label="Quitar vínculo">
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )

  const subtitulo = (icono: React.ReactNode, titulo: string, extra?: React.ReactNode) => (
    <Titulo nivel="sub" icono={icono} accion={extra} sx={{ mt: 1 }}>
      {titulo}
    </Titulo>
  )

  return (
    <Box>
      {/* ---------------- INTERNOS ---------------- */}
      {subtitulo(<AccountBalanceIcon fontSize="small" />, 'Internos (documentos de la entidad)')}
      {internos.length === 0 && (
        <Vacio>Ninguno. Se vinculan solos al citar un documento del sistema en 1.3 Referencia.</Vacio>
      )}
      {internos.map(fila)}
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <Autocomplete
          size="small"
          sx={{ flex: 1, minWidth: 'min(100%, 220px)' }}
          options={opciones}
          filterOptions={(x) => x}
          getOptionLabel={(o) => `${o.numero_completo} — ${o.asunto}`}
          value={sel}
          inputValue={texto}
          onInputChange={(_, v, motivo) => {
            setTexto(v)
            if (motivo === 'input') buscar(v)
          }}
          onChange={(_, o) => setSel(o)}
          loading={cargando}
          renderOption={(props, o) => (
            <li {...props} key={o.id}>
              <Box>
                <Box sx={{ fontWeight: 600, fontSize: 13 }}>{o.numero_completo}</Box>
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {o.tipo_nombre} · {o.estado} — {o.asunto}
                </Box>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label={
                <>
                  Vincular otro documento
                  {/* El resto del rótulo no cabe en el celular (revisión 2026-10-12). */}
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}> de la entidad (número o asunto)</Box>
                </>
              }
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
        <Button
          variant="outlined"
          size="small"
          startIcon={<LinkIcon />}
          onClick={vincularInterno}
          disabled={!sel || guardando}
        >
          Vincular
        </Button>
      </Box>

      {/* ---------------- EXTERNOS ---------------- */}
      {subtitulo(
        <PublicIcon fontSize="small" />,
        'Externos (de otras entidades)',
        respuestas.length > 0 ? (
          <Chip
            size="small"
            color="success"
            icon={<MarkEmailReadOutlinedIcon />}
            label={respuestas.length === 1 ? 'Respondido' : `Respondido (${respuestas.length})`}
          />
        ) : respondeA.length > 0 ? (
          <Chip size="small" color="info" variant="outlined" label="Responde a un documento recibido" />
        ) : (
          <Chip size="small" variant="outlined" label="Sin respuesta registrada" />
        ),
      )}
      {externos.length === 0 && <Vacio>Ninguno todavía.</Vacio>}
      {externos.map(fila)}

      {!formExt ? (
        <Button size="small" startIcon={<AddIcon />} onClick={() => setFormExt(true)} sx={{ mt: 0.5 }}>
          Registrar documento externo
        </Button>
      ) : null}
      <Collapse in={formExt}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            p: 1.5,
            mt: 1,
          }}
        >
          <TextField
            select
            size="small"
            label="Vínculo"
            value={modo}
            onChange={(e) => setModo(e.target.value)}
            helperText={MODOS_EXT.find((m) => m.valor === modo)?.ayuda}
          >
            {MODOS_EXT.map((m) => (
              <MenuItem key={m.valor} value={m.valor}>
                {m.etiqueta}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Tipo de documento"
            value={tipos.includes(ext.tipo) ? ext.tipo : ''}
            onChange={(e) => void elegirTipo(e.target.value)}
          >
            {tipos.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
            <MenuItem value={NUEVO_TIPO} sx={{ color: 'primary.main' }}>
              <AddIcon fontSize="small" sx={{ mr: 0.5 }} /> Agregar otro tipo…
            </MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Número del documento"
            placeholder="p. ej. Oficio N.° 123-2026-MINEDU/DM"
            value={ext.numero}
            onChange={(e) => setExt({ ...ext, numero: e.target.value })}
            required
          />
          <TextField
            size="small"
            type="date"
            label="Fecha del documento"
            value={ext.fecha}
            onChange={(e) => setExt({ ...ext, fecha: e.target.value })}
            InputLabelProps={{ shrink: true }}
            helperText={ext.fecha === hoy() ? 'Viene con la fecha de hoy: verifique la del documento.' : ' '}
          />
          <TextField
            size="small"
            label="Institución / entidad"
            value={ext.institucion}
            onChange={(e) => setExt({ ...ext, institucion: e.target.value })}
            sx={{ gridColumn: '1 / 3' }}
          />
          <TextField
            size="small"
            label="Asunto (opcional)"
            value={ext.asunto}
            onChange={(e) => setExt({ ...ext, asunto: e.target.value })}
            sx={{ gridColumn: '1 / 3' }}
          />
          <Button
            component="label"
            variant="outlined"
            size="small"
            startIcon={<AttachFileIcon />}
            sx={{ justifySelf: 'start', textTransform: 'none', maxWidth: '100%' }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nombreArchivo || 'Archivo(s) del documento'}
            </Box>
            <input
              type="file"
              hidden
              multiple
              ref={archivoRef}
              onChange={(e) => {
                const fs = e.target.files
                setNombreArchivo(
                  !fs || fs.length === 0 ? '' : fs.length === 1 ? fs[0].name : `${fs.length} archivos`,
                )
              }}
            />
          </Button>
          <Stack direction="row" spacing={1} sx={{ justifySelf: 'end' }}>
            <Button size="small" onClick={() => setFormExt(false)}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<LinkIcon />}
              onClick={registrarExterno}
              disabled={guardando || !ext.numero.trim()}
            >
              Registrar
            </Button>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  )
}

import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, subirArchivo } from '../api'
import { Titulo } from './Estilo'
import FormularioCampos, { type CampoEsquema } from './FormularioCampos'

/**
 * Incorporar un documento ELABORADO FUERA DEL SISTEMA (Edison 2026-09-11).
 *
 * Cuando el sistema estuvo caído, el despacho numeró y redactó oficios en
 * Word. Esos documentos ya existen en papel con su número impreso: aquí se
 * meten al flujo con su PDF y sus datos, sin editor ni LaTeX, para poder
 * seguir con lo que viene (firmado, cargo de recepción, STD…). Los datos se
 * capturan con el MISMO formulario del editor (destinatario con directorio,
 * copias, referencias), así la bandeja y el seguimiento no distinguen el
 * origen.
 *
 * El número lo decide el papel, no el sistema; pero el sistema solo acepta
 * el SIGUIENTE de la serie (correlativo sin huecos). Por eso el campo
 * muestra cuál espera y, si el número se saltó, se puede declarar como no
 * utilizado (queda reservado y archivado, sin PDF).
 */

export interface TipoIncorporable {
  codigo: string
  nombre: string
  serie?: string
  campos?: CampoEsquema[]
}

interface Siguiente {
  serie: string
  ultimo: number
  siguiente: number
}

const hoy = () => new Date().toISOString().slice(0, 10)

export default function DialogoIncorporar({
  abierto,
  tipos,
  alCerrar,
  alIncorporado,
  alAvisar,
}: {
  abierto: boolean
  tipos: TipoIncorporable[]
  alCerrar: () => void
  alIncorporado: (id: number) => void
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
}) {
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [tipo, setTipo] = useState('oficio')
  const [numero, setNumero] = useState('')
  const [siguiente, setSiguiente] = useState<Siguiente | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({ fecha: hoy() })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [noUtilizado, setNoUtilizado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const inputArchivo = useRef<HTMLInputElement>(null)

  // Al abrir: formulario limpio.
  useEffect(() => {
    if (!abierto) return
    setNumero('')
    setCampos({ fecha: hoy() })
    setArchivo(null)
    setNoUtilizado(false)
    setMotivo('')
    setError('')
  }, [abierto])

  // Qué número espera la serie del tipo elegido. Se propone como valor
  // inicial (el caso común: el documento hecho a mano es el siguiente).
  useEffect(() => {
    if (!abierto) return
    setSiguiente(null)
    api<Siguiente>(`/api/tipos/${tipo}/siguiente-numero`)
      .then((s) => {
        setSiguiente(s)
        setNumero((n) => (n ? n : String(s.siguiente)))
      })
      .catch(() => {})
  }, [abierto, tipo])

  const cfg = tipos.find((t) => t.codigo === tipo)
  const esquema = cfg?.campos ?? []
  const n = Number(numero)
  const numeroValido = Number.isInteger(n) && n >= 1
  // Aviso en línea, con el mismo criterio que el servidor (que es quien
  // decide): ya emitido, o dejaría números sin usar.
  let ayudaNumero = siguiente
    ? `Siguiente en la serie ${siguiente.serie}: ${String(siguiente.siguiente).padStart(4, '0')} (último emitido: ${
        siguiente.ultimo ? String(siguiente.ultimo).padStart(4, '0') : 'ninguno'
      })`
    : ''
  let numeroConflicto = false
  if (siguiente && numeroValido && n !== siguiente.siguiente) {
    numeroConflicto = true
    ayudaNumero =
      n <= siguiente.ultimo
        ? `El ${String(n).padStart(4, '0')} ya fue emitido. Búsquelo en la bandeja o revise el número.`
        : `Dejaría sin usar del ${String(siguiente.siguiente).padStart(4, '0')} al ${String(n - 1).padStart(4, '0')}: incorpore (o declare como no utilizados) esos números primero, en orden.`
  }

  const listo =
    numeroValido && !numeroConflicto && (noUtilizado ? motivo.trim().length > 0 : archivo !== null)

  const incorporar = async () => {
    setOcupado(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('tipo', tipo)
      fd.append('numero', String(n))
      fd.append('campos', JSON.stringify(campos))
      if (noUtilizado) fd.append('motivo', motivo.trim())
      else if (archivo) fd.append('archivo', archivo, archivo.name)
      const r = await subirArchivo<{ id: number; numero_completo: string }>(
        '/api/documentos/incorporar',
        fd,
      )
      alAvisar?.(
        'success',
        noUtilizado
          ? `${r.numero_completo} quedó declarado como no utilizado y archivado.`
          : `${r.numero_completo} incorporado al sistema.`,
      )
      alIncorporado(r.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo incorporar el documento.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Dialog open={abierto} onClose={ocupado ? undefined : alCerrar} maxWidth="md" fullWidth fullScreen={celular}>
      <DialogTitle>Incorporar documento elaborado fuera del sistema</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          {/* 2026-10-12: breve; antes, un párrafo de siete líneas. */}
          Para un documento hecho fuera (en Word) que ya lleva su número. Entra con su PDF y sigue el
          trámite normal; si hay que corregirlo, se corrige en Word y se reemplaza el PDF.
        </Alert>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
          <TextField
            select
            label="Tipo de documento"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value)
              setNumero('')
            }}
            sx={{ minWidth: 260 }}
            size="small"
          >
            {tipos.map((t) => (
              <MenuItem key={t.codigo} value={t.codigo}>
                {t.nombre}
                {t.serie ? ` (${t.serie})` : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Número impreso en el documento"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
            inputProps={{ inputMode: 'numeric' }}
            size="small"
            sx={{ width: 260 }}
            error={numeroConflicto}
            helperText={ayudaNumero || ' '}
          />
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={noUtilizado}
              onChange={(e) => setNoUtilizado(e.target.checked)}
              size="small"
            />
          }
          label="Este número NO se utilizó: declararlo como no utilizado y archivarlo (sin documento)"
        />

        {noUtilizado ? (
          <TextField
            label="Motivo (queda en la bitácora)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
            placeholder="p. ej. omitido al numerar a mano mientras el sistema estuvo fuera de servicio"
          />
        ) : (
          <>
            <Titulo nivel="sub" sx={{ mt: 2 }}>
              Documento (PDF)
            </Titulo>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <input
                ref={inputArchivo}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => inputArchivo.current?.click()}
              >
                Elegir PDF
              </Button>
              <Typography variant="body2" color={archivo ? 'text.primary' : 'text.secondary'}>
                {archivo
                  ? `${archivo.name} · ${(archivo.size / 1024).toFixed(0)} KB`
                  : 'Exporte el documento a PDF desde Word (Guardar como → PDF).'}
              </Typography>
            </Box>

            <Titulo nivel="sub" sx={{ mt: 2 }}>
              Datos del documento (los que ve la bandeja)
            </Titulo>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Transcriba destinatario, asunto y fecha tal como figuran en el
              documento; el PDF no se modifica. Sirven para buscarlo, contar
              cargos de recepción y seguir el trámite.
            </Typography>
            <FormularioCampos
              esquema={esquema}
              valores={campos}
              tipo={tipo}
              alCambiar={(clave, valor) => setCampos((c) => ({ ...c, [clave]: valor }))}
              alAvisar={alAvisar}
            />
          </>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar} disabled={ocupado}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={incorporar}
          disabled={!listo || ocupado}
          startIcon={ocupado ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {noUtilizado ? 'Declarar no utilizado' : 'Incorporar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

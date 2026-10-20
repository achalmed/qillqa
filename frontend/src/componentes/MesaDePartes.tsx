/**
 * MESA DE PARTES DEL DESTINATARIO (2026-10-06, pedido de Edison): el enlace de la mesa de partes
 * virtual de cada destinatario, a un clic, sin abrir el Directorio. Va en su ventana (botón «Mesa de
 * partes» de la barra del documento, «Más acciones» y la lista), no en el formulario: ahí estorbaba la
 * redacción y, con el documento firmado (formulario bloqueado), ni abría ni copiaba. Si la institución no lo tiene, se añade aquí mismo (queda en el directorio para
 * todos); si el destinatario no está en el directorio, se busca. El reconocimiento lo hace el
 * servidor (`POST /api/directorio/destinos`, servicios/mesas_partes.py).
 */
import { Link as RouterLink } from 'react-router'
import { abrirMesaDePartes, extensionInstalada } from '../mesaExtension'
import { DialogoInstalarExtension } from './InstalarExtension'
import Alert from '@mui/material/Alert'
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined'
import PictureInPictureAltOutlinedIcon from '@mui/icons-material/PictureInPictureAltOutlined'
import { abrirVentanaApoyo } from './VentanaApoyo'
import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api'
import { PALETA } from '../paleta'

interface Destino {
  destino: { nombre: string; cargo: string; institucion: string }
  institucion: { id: number; nombre: string; siglas: string; url_oficial: string; email: string; telefono: string; recepcion_canal?: string; recepcion_dato?: string; recepcion_nota?: string } | null
  persona: { email: string; celular: string; telefono: string } | null
  mesa_partes: string
  mesa_de: string
}

/** Copiar al portapapeles: `navigator.clipboard` solo existe en https; por la red local (http)
 * se usa el método clásico con un campo oculto. */
async function copiar(texto: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto)
  const t = document.createElement('textarea')
  t.value = texto
  t.style.position = 'fixed'
  t.style.opacity = '0'
  document.body.appendChild(t)
  t.select()
  document.execCommand('copy')
  t.remove()
}

const buscarEnLaWeb = (nombre: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`mesa de partes virtual ${nombre}`)}`

function Fila({ r, soloLectura, alGuardado, documentoId }: { r: Destino; soloLectura: boolean; alGuardado: () => void; documentoId?: number }) {
  const [anadiendo, setAnadiendo] = useState(false)
  const [sinExtension, setSinExtension] = useState(false)
  const [url, setUrl] = useState(r.mesa_partes || '')
  const [canal, setCanal] = useState(r.institucion?.recepcion_canal || (r.mesa_partes ? 'virtual' : ''))
  const [dato, setDato] = useState(r.institucion?.recepcion_dato || '')
  const [nota, setNota] = useState(r.institucion?.recepcion_nota || '')
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  const inst = r.institucion
  const nombreNuevo = r.destino.institucion || r.destino.cargo || r.destino.nombre
  // Cómo recibe documentos cuando no hay mesa virtual (2026-10-10): correo, WhatsApp, presencial…
  const CANALES: Record<string, string> = { virtual: 'Mesa de partes virtual', correo: 'Por correo electrónico', whatsapp: 'Por WhatsApp', presencial: 'Presencial (en su sede)', otro: 'Otro canal' }
  const canalVigente = inst?.recepcion_canal && inst.recepcion_canal !== 'virtual' ? inst.recepcion_canal : ''
  const quien = inst ? (inst.siglas ? `${inst.siglas} · ${inst.nombre}` : inst.nombre) : [r.destino.nombre, r.destino.cargo].filter(Boolean).join(' · ')
  const contactos = [inst?.email, inst?.telefono, r.persona?.email, r.persona?.celular].filter(Boolean).join(' · ')

  const guardar = async () => {
    setError('')
    try {
      // Sin institución en el directorio, se registra de paso (id 0 + nombre).
      await api(`/api/directorio/instituciones/${inst?.id ?? 0}/recepcion`, {
        method: 'PUT',
        body: JSON.stringify({ canal, dato: dato.trim(), nota: nota.trim(), url: canal === 'virtual' ? url.trim() : '', nombre_nuevo: inst ? '' : nombreNuevo }),
      })
      setAnadiendo(false)
      alGuardado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  const puedeGuardar = canal === 'virtual' ? /^https?:\/\/\S+$/.test(url.trim()) : canal !== '' && (canal === 'presencial' || dato.trim() !== '')

  return (
    <Box sx={{ py: 0.75, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, flex: '1 1 220px', wordBreak: 'break-word' }}>
          {quien}
          {r.mesa_de && (
            <Typography component="span" variant="caption" color="text.secondary"> · usa la mesa de {r.mesa_de}</Typography>
          )}
        </Typography>
        {r.mesa_partes ? (
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            <Button
              size="small"
              variant={documentoId ? 'contained' : 'outlined'}
              endIcon={<OpenInNewIcon />}
              href={r.mesa_partes}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e: React.MouseEvent) => {
                // Con un documento: se abre la mesa y la extensión muestra en ella el panel
                // con sus datos (mesaExtension.ts). Sin extensión, se dice cómo tenerla.
                if (!documentoId) return
                e.preventDefault()
                void abrirMesaDePartes(documentoId, r.mesa_partes).then((m) => setSinExtension(m === 'sin-extension'))
              }}
            >
              Abrir mesa de partes
            </Button>
            <Tooltip title={copiado ? 'Copiado' : 'Copiar el enlace'}>
              <IconButton
                size="small"
                aria-label="Copiar el enlace de la mesa de partes"
                onClick={() => void copiar(r.mesa_partes).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: canalVigente ? 'text.secondary' : PALETA.avisoOscuro }}>
              {canalVigente ? `Recibe ${CANALES[canalVigente]?.toLowerCase() ?? canalVigente}` : inst ? 'Sin mesa de partes virtual' : 'No está en el directorio'}
            </Typography>
            {!soloLectura && !anadiendo && <Button size="small" onClick={() => setAnadiendo(true)}>{canalVigente ? 'Cambiar' : 'Indicar cómo recibe'}</Button>}
            {!inst && (
              <Button size="small" href={`/directorio?pestana=instituciones&q=${encodeURIComponent(r.destino.institucion || r.destino.nombre)}`} target="_blank">
                Buscar en el directorio
              </Button>
            )}
            <Tooltip title="Buscar su mesa de partes en la web">
              <IconButton size="small" href={buscarEnLaWeb(inst?.nombre || r.destino.institucion || r.destino.cargo || r.destino.nombre)} target="_blank" rel="noopener noreferrer" aria-label="Buscar en la web">
                <SearchIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
      {canalVigente && inst?.recepcion_dato && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{inst.recepcion_dato}</Typography>
          <Tooltip title={copiado ? 'Copiado' : 'Copiar'}>
            <IconButton size="small" aria-label="Copiar el dato de recepción" onClick={() => void copiar(inst.recepcion_dato ?? '').then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      {inst?.recepcion_nota && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{inst.recepcion_nota}</Typography>}
      {contactos && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>{contactos}</Typography>}
      {r.mesa_partes && !soloLectura && !anadiendo && (
        <Button size="small" sx={{ px: 0.5, minWidth: 0, color: 'text.secondary' }} onClick={() => { setCanal('virtual'); setAnadiendo(true) }}>Cambiar el enlace</Button>
      )}
      {anadiendo && (
        <Box sx={{ display: 'grid', gap: 1, mt: 0.75, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {!inst && (
            <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
              Se registrará en el directorio como «{nombreNuevo}».
            </Typography>
          )}
          <TextField select size="small" label="Cómo recibe documentos" value={canal} onChange={(e) => setCanal(e.target.value)} SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}>
            <option value="">Elija…</option>
            {Object.entries(CANALES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </TextField>
          {canal === 'virtual' ? (
            <TextField size="small" autoFocus label="Enlace de la mesa de partes virtual" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} error={Boolean(error)} helperText={error || 'Pegue aquí el enlace encontrado.'} />
          ) : canal && canal !== 'presencial' ? (
            <TextField size="small" autoFocus label={canal === 'correo' ? 'Correo de mesa de partes' : canal === 'whatsapp' ? 'Número de WhatsApp' : 'Dato de contacto'} value={dato} onChange={(e) => setDato(e.target.value)} error={Boolean(error)} helperText={error} />
          ) : canal === 'presencial' ? (
            <TextField size="small" label="Dirección y horario" value={dato} onChange={(e) => setDato(e.target.value)} />
          ) : <span />}
          <TextField size="small" label="Nota (opcional)" placeholder="p. ej. llevar dos copias; solo mañanas" value={nota} onChange={(e) => setNota(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
          <Box sx={{ display: 'flex', gap: 1, gridColumn: '1 / -1' }}>
            <Button variant="contained" size="small" onClick={() => void guardar()} disabled={!puedeGuardar}>Guardar en el directorio</Button>
            <Button size="small" onClick={() => setAnadiendo(false)}>Cancelar</Button>
          </Box>
        </Box>
      )}
      {/* Sin la extensión, el panel no puede aparecer dentro de la mesa: se pide instalarla. */}
      <DialogoInstalarExtension
        abierto={sinExtension}
        alCerrar={() => setSinExtension(false)}
        alUsarVentana={documentoId ? () => void abrirVentanaApoyo(documentoId).catch(() => undefined) : undefined}
      />
    </Box>
  )
}

export default function MesaDePartes({
  nombre,
  cargo,
  institucion,
  soloLectura = false,
  pausa = 700,
  documentoId,
}: {
  /** Con él, «Abrir mesa de partes» pasa el documento a la extensión de Qillqa. */
  documentoId?: number
  nombre: string
  cargo: string
  institucion: string
  soloLectura?: boolean
  /** Espera antes de consultar (ms): mientras se escribe no se pregunta a cada tecla. */
  pausa?: number
}) {
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [vuelta, setVuelta] = useState(0)

  // Se consulta con una pausa: mientras se escribe el destinatario no se pregunta a cada tecla.
  useEffect(() => {
    if (!nombre.trim() && !institucion.trim()) {
      setDestinos([])
      return
    }
    const t = setTimeout(() => {
      api<Destino[]>('/api/directorio/destinos', {
        method: 'POST',
        body: JSON.stringify({ campos: { destinatario_nombre: nombre, destinatario_cargo: cargo, destinatario_institucion: institucion } }),
      }).then(setDestinos).catch(() => setDestinos([]))
    }, pausa)
    return () => clearTimeout(t)
  }, [nombre, cargo, institucion, vuelta, pausa])

  if (!destinos.length) return null
  return (
    <Box sx={{ mt: 1, px: 1.25, py: 0.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: PALETA.superficieTenue }}>
      <Typography variant="overline" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', lineHeight: 2 }}>
        <InboxOutlinedIcon sx={{ fontSize: 16 }} />
        Mesa de partes
      </Typography>
      {destinos.map((r, i) => (
        <Fila key={`${r.destino.nombre}-${i}`} r={r} soloLectura={soloLectura} documentoId={documentoId} alGuardado={() => setVuelta((v) => v + 1)} />
      ))}
    </Box>
  )
}

/** La misma ayuda desde la lista de documentos (sin abrir el documento): para enviar varios
 * oficios seguidos a sus mesas de partes. */
export function DialogoMesaDePartes({ documentoId, alCerrar }: { documentoId: number | null; alCerrar: () => void }) {
  const [doc, setDoc] = useState<{ numero_completo?: string; campos: Record<string, string> } | null>(null)
  const [error, setError] = useState('')
  const [instalar, setInstalar] = useState(false)
  useEffect(() => {
    setDoc(null)
    if (documentoId) api<{ numero_completo?: string; campos: Record<string, string> }>(`/api/documentos/${documentoId}`).then(setDoc).catch(() => setDoc({ campos: {} }))
  }, [documentoId])
  const c = doc?.campos ?? {}
  const sinDestino = doc && !(c.destinatario_nombre ?? '').trim() && !(c.destinatario_institucion ?? '').trim()
  return (
    <Dialog open={documentoId !== null} onClose={alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Mesa de partes
        {doc?.numero_completo && <Typography variant="body2" color="text.secondary">{doc.numero_completo}</Typography>}
      </DialogTitle>
      <DialogContent>
        {!extensionInstalada() && localStorage.getItem('sgdp_rol') !== 'invitado' && (
          <Alert
            severity="info"
            icon={<ExtensionOutlinedIcon />}
            sx={{ mb: 1.5 }}
            action={<Button color="inherit" size="small" onClick={() => setInstalar(true)}>Instalar</Button>}
          >
            Instale la extensión de Qillqa para que los datos y el acceso aparezcan dentro de la mesa de partes.
          </Alert>
        )}
        <DialogoInstalarExtension abierto={instalar} alCerrar={() => setInstalar(false)} />
        {!doc && <Typography variant="body2" color="text.secondary">Buscando…</Typography>}
        {sinDestino && <Typography variant="body2" color="text.secondary">El documento aún no tiene destinatario.</Typography>}
        {doc && !sinDestino && (
          <MesaDePartes nombre={c.destinatario_nombre ?? ''} cargo={c.destinatario_cargo ?? ''} institucion={c.destinatario_institucion ?? ''} pausa={0} documentoId={documentoId ?? undefined} />
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {/* Ventana siempre encima con los datos para copiar o autocompletar (VentanaApoyo.tsx). */}
        {documentoId !== null && localStorage.getItem('sgdp_rol') !== 'invitado' && (
          <Button
            size="small"
            color="inherit"
            sx={{ color: 'text.secondary', fontWeight: 500 }}
            startIcon={<PictureInPictureAltOutlinedIcon />}
            onClick={() => {
              abrirVentanaApoyo(documentoId)
                .then(alCerrar)
                .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir la ventana.'))
            }}
          >
            Ventana de apoyo
          </Button>
        )}
        <Button size="small" color="inherit" sx={{ color: 'text.secondary', fontWeight: 500 }} component={RouterLink} to="/contrasenas" onClick={alCerrar}>Contraseñas</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={alCerrar}>Cerrar</Button>
      </DialogActions>
      {error && <Typography variant="body2" color="error" sx={{ px: 3, pb: 2 }}>{error}</Typography>}
    </Dialog>
  )
}

interface Faltantes {
  sin_mesa: (NonNullable<Destino['institucion']> & { documentos: string[] })[]
  sin_reconocer: { destino: string; documentos: string[] }[]
}

/** Para completar el directorio: las instituciones destinatarias sin mesa de partes (con los
 * documentos que van a ellas) y los destinatarios que no están en el directorio
 * (`GET /api/directorio/mesas-faltantes`). */
export function DialogoMesasFaltantes({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const [datos, setDatos] = useState<Faltantes | null>(null)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    if (abierto) api<Faltantes>('/api/directorio/mesas-faltantes').then(setDatos).catch(() => setDatos({ sin_mesa: [], sin_reconocer: [] }))
  }, [abierto, vuelta])
  const docs = (d: string[]) => `${d.length} documento${d.length === 1 ? '' : 's'}: ${d.slice(0, 3).join(', ')}${d.length > 3 ? '…' : ''}`
  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Mesas de partes que faltan
        <Typography variant="body2" color="text.secondary">De los destinatarios de todos los documentos.</Typography>
      </DialogTitle>
      <DialogContent dividers>
        {!datos && <Typography variant="body2" color="text.secondary">Buscando…</Typography>}
        {datos && !datos.sin_mesa.length && !datos.sin_reconocer.length && (
          <Typography variant="body2">Todas las instituciones destinatarias tienen su mesa de partes.</Typography>
        )}
        {datos && datos.sin_mesa.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary">Sin mesa de partes ({datos.sin_mesa.length})</Typography>
            {datos.sin_mesa.map((i) => (
              <Box key={i.id}>
                <Fila
                  r={{ destino: { nombre: '', cargo: '', institucion: '' }, institucion: i, persona: null, mesa_partes: '', mesa_de: '' }}
                  soloLectura={false}
                  alGuardado={() => setVuelta((v) => v + 1)}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.5, mb: 0.5 }}>{docs(i.documentos)}</Typography>
              </Box>
            ))}
          </>
        )}
        {datos && datos.sin_reconocer.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              No están en el directorio ({datos.sin_reconocer.length})
            </Typography>
            {datos.sin_reconocer.map((x) => (
              <Box key={x.destino} sx={{ py: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2">{x.destino}</Typography>
                <Typography variant="caption" color="text.secondary">{docs(x.documentos)}</Typography>
              </Box>
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  )
}

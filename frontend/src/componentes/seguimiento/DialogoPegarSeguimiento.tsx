/**
 * PEGAR EL SEGUIMIENTO de un documento propio (2026-10-12): el resultado del prompt de
 * seguimiento (bloque `seguimiento-documento`) → `POST /api/documentos/{id}/pegar-seguimiento`
 * devuelve la vista previa (expediente en la entidad, plazo legal, actuaciones nuevas o ya
 * registradas, respuestas halladas en Recibidos, tarea de próxima revisión) → la persona marca
 * → `POST /aplicar-seguimiento` escribe lo marcado y deja la constancia. El estado del
 * documento no se toca: la «situación según la fuente» solo se muestra.
 */
import { useEffect, useRef, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import { api } from '../../api'
import { PALETA } from '../../paleta'
import { mensajePegado, textoValor, type Diferencia, type LecturaPegado, usePausaTrasLeer } from '../../pegar'
import BotonesPrompt from '../BotonesPrompt'

interface ActuacionProp { fecha: string; clase: string; texto: string; fuente?: string; estado: 'nuevo' | 'igual'; existente_id: number | null }
interface RespuestaProp { fecha?: string; documento?: string; std_numero?: string; completa?: boolean; entrada: { id: number; asunto: string; documento: string; estado: string } | null; estado: 'vinculada' | 'hallada' | 'no_hallada' }
interface Vista {
  lectura: LecturaPegado
  mismo_documento: boolean
  numero: string
  diferencias: Diferencia[]
  propuesto: { expediente_entidad: string; plazo_legal: Record<string, unknown>; estado_propuesto: string; ubicacion: string; responsable_entidad: string; pendientes: string[]; proxima_revision: string }
  actuaciones: ActuacionProp[]
  respuestas: RespuestaProp[]
  tarea: { titulo: string; vence: string } | null
  resto: string
}

const fechaCorta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

export default function DialogoPegarSeguimiento({ abierto, documentoId, alCerrar, alAplicado, textoInicial }: {
  abierto: boolean
  documentoId: number | string
  alCerrar: () => void
  alAplicado: () => void
  /** Texto que llega ya pegado (del chat): se lee solo al abrir. */
  textoInicial?: string
}) {
  const [texto, setTexto] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const [v, setV] = useState<Vista | null>(null)
  const [campos, setCampos] = useState<Set<string>>(new Set())
  const [acts, setActs] = useState<Set<number>>(new Set())
  const [resps, setResps] = useState<Set<number>>(new Set())
  const [tarea, setTarea] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => { setTexto(''); setV(null); setError(''); alCerrar() }

  const leer = async (t: string = texto) => {
    setLeyendo(true)
    setError('')
    try {
      const r = await api<Vista>(`/api/documentos/${documentoId}/pegar-seguimiento`, { method: 'POST', body: JSON.stringify({ texto: t }) })
      setV(r)
      setCampos(new Set(r.diferencias.filter((d) => d.aceptar).map((d) => d.clave)))
      setActs(new Set(r.actuaciones.map((a, i) => (a.estado === 'nuevo' ? i : -1)).filter((i) => i >= 0)))
      setResps(new Set(r.respuestas.map((x, i) => (x.estado === 'hallada' ? i : -1)).filter((i) => i >= 0)))
      setTarea(Boolean(r.tarea))
    } catch (e) {
      setError(mensajePegado(e))
    } finally {
      setLeyendo(false)
    }
  }

  const leidoInicial = useRef('')
  useEffect(() => {
    if (!abierto || !textoInicial || leidoInicial.current === textoInicial) return
    leidoInicial.current = textoInicial
    setTexto(textoInicial)
    void leer(textoInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, textoInicial])

  const aplicar = async () => {
    if (!v) return
    setGuardando(true)
    setError('')
    try {
      const anexar = [v.propuesto.ubicacion && `Dónde está: ${v.propuesto.ubicacion}`, v.propuesto.responsable_entidad && `Responsable en la entidad: ${v.propuesto.responsable_entidad}`].filter(Boolean)
      await api(`/api/documentos/${documentoId}/aplicar-seguimiento`, {
        method: 'POST',
        body: JSON.stringify({
          expediente_entidad: campos.has('expediente_entidad') ? v.propuesto.expediente_entidad : null,
          plazo_legal: campos.has('plazo_legal') ? v.propuesto.plazo_legal : null,
          std_nota_anexar: anexar,
          actuaciones: v.actuaciones.filter((_, i) => acts.has(i)).map((a) => ({ fecha: a.fecha, clase: a.clase, texto: a.texto, fuente: a.fuente ?? '' })),
          vincular_entradas: v.respuestas.filter((x, i) => resps.has(i) && x.entrada).map((x) => x.entrada!.id),
          tarea: tarea && v.tarea ? v.tarea : null,
          pegado: {
            tipo: v.lectura.tipo, version: v.lectura.version, fuente: v.lectura.fuente, texto, campos_propuestos: v.propuesto,
            rechazados: [...v.diferencias.filter((d) => !campos.has(d.clave)).map((d) => d.clave), ...v.actuaciones.map((a, i) => (!acts.has(i) ? `actuacion:${a.fecha}` : '')).filter(Boolean)],
          },
        }),
      })
      alAplicado()
      cerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar.')
    } finally {
      setGuardando(false)
    }
  }

  const alternar = <T,>(s: Set<T>, k: T, set: (x: Set<T>) => void) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); set(n) }
  const fila = (marcado: boolean, alMarcar: () => void, cuerpo: React.ReactNode, apagado = false) => (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start', p: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: PALETA.superficieTenue, opacity: marcado ? 1 : 0.6 }}>
      <Checkbox size="small" checked={marcado} onChange={alMarcar} disabled={apagado} sx={{ p: 0.25 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>{cuerpo}</Box>
    </Box>
  )
  const total = campos.size + acts.size + resps.size + (tarea ? 1 : 0)

  const pausa = usePausaTrasLeer(Boolean(v))
  return (
    <Dialog open={abierto} onClose={cerrar} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>Pegar el seguimiento</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!v && (
          <>
            <Typography variant="body2" color="text.secondary">
              Pegue aquí la respuesta de la IA con el seguimiento.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">¿Aún sin el prompt?</Typography>
              <BotonesPrompt tipo="seguimiento-documento" />
            </Box>
            <TextField multiline minRows={6} maxRows={16} autoFocus size="small" value={texto} onChange={(e) => setTexto(e.target.value)} label="Respuesta de la IA" />
            {leyendo && <LinearProgress />}
          </>
        )}
        {v && (
          <>
            {!v.mismo_documento && <Alert severity="warning" sx={{ py: 0 }}>{v.lectura.avisos[v.lectura.avisos.length - 1]}</Alert>}
            {v.lectura.avisos.filter((a) => v.mismo_documento || !a.startsWith('El bloque dice')).map((a) => <Alert key={a} severity="info" sx={{ py: 0 }}>{a}</Alert>)}
            {v.propuesto.estado_propuesto && (
              <Typography variant="body2">Situación según la fuente: <b>{v.propuesto.estado_propuesto.replace(/_/g, ' ')}</b> <Typography component="span" variant="caption" color="text.secondary">(solo se muestra; el estado lo cambia usted por el flujo del documento)</Typography></Typography>
            )}
            {v.diferencias.map((d) => fila(campos.has(d.clave), () => alternar(campos, d.clave, setCampos), (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{d.etiqueta} <Chip size="small" label={d.estado === 'nuevo' ? 'nuevo' : 'cambia'} sx={{ height: 18, fontSize: 10.5, ml: 0.5 }} /></Typography>
                {d.actual != null && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textDecoration: 'line-through' }}>{textoValor(d.actual)}</Typography>}
                <Typography variant="body2">{textoValor(d.propuesto)}</Typography>
              </>
            )))}
            {v.actuaciones.length > 0 && <Typography variant="subtitle2" sx={{ mt: 0.5 }}>Actuaciones</Typography>}
            {v.actuaciones.map((a, i) => fila(acts.has(i), () => alternar(acts, i, setActs), (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{fechaCorta(a.fecha)} · {a.clase} {a.estado === 'igual' && <Chip size="small" label="ya registrada" sx={{ height: 18, fontSize: 10.5, ml: 0.5 }} />}</Typography>
                <Typography variant="body2">{a.texto}{a.fuente ? <Typography component="span" variant="caption" color="text.secondary"> · {a.fuente}</Typography> : null}</Typography>
              </>
            ), a.estado === 'igual'))}
            {v.respuestas.length > 0 && <Typography variant="subtitle2" sx={{ mt: 0.5 }}>Respuestas de la entidad</Typography>}
            {v.respuestas.map((x, i) => fila(resps.has(i), () => alternar(resps, i, setResps), (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{[x.documento, x.std_numero && `STD ${x.std_numero}`, x.fecha && fechaCorta(x.fecha)].filter(Boolean).join(' · ')}{x.completa === false ? ' · parcial' : ''}</Typography>
                <Typography variant="body2" color={x.entrada ? 'text.primary' : 'text.secondary'}>
                  {x.estado === 'vinculada' ? `Ya vinculada: «${x.entrada!.asunto}»` : x.estado === 'hallada' ? `En Mesa de Partes: «${x.entrada!.asunto}» → vincular como respuesta` : 'No está en Mesa de Partes: regístrela allí con su PDF (nunca se crea un recibido desde texto).'}
                </Typography>
              </>
            ), x.estado !== 'hallada'))}
            {v.propuesto.pendientes.length > 0 && (
              <Typography variant="caption" color="text.secondary">Qué falta: {v.propuesto.pendientes.join(' · ')}</Typography>
            )}
            {v.tarea && fila(tarea, () => setTarea(!tarea), <Typography variant="body2">Tarea: {v.tarea.titulo} · vence {fechaCorta(v.tarea.vence)}</Typography>)}
          </>
        )}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={cerrar}>Cancelar</Button>
        {v && <Button color="inherit" onClick={() => setV(null)}>Volver a pegar</Button>}
        {!v
          ? <Button variant="contained" disabled={!texto.trim() || leyendo} onClick={() => void leer()}>Leer</Button>
          : <Button variant="contained" disabled={guardando || total === 0 || pausa} onClick={() => void aplicar()}>Aplicar {total ? `(${total})` : ''}</Button>}
      </DialogActions>
    </Dialog>
  )
}

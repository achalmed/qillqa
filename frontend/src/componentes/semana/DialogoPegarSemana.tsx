/**
 * PEGAR EL REGISTRO de una jornada de la Semana de representación (2026-10-12): el resultado
 * del prompt (bloque `registro-representacion`) → `POST /api/semanas/{id}/pegar` devuelve
 * cada actividad y cada pedido listos, con lo ya registrado marcado → la persona marca →
 * se crean por los endpoints de siempre (`POST /actividades`, `POST /pedidos`, con la
 * actividad recién creada enlazada por su referencia A-NN). Constancia en `pegados`.
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
import { mensajePegado, registrarPegado, type LecturaPegado, usePausaTrasLeer } from '../../pegar'
import { fechaLarga, texto, type Datos, type SemanaDetalle } from './modelo'

interface Fila { n: number; ref: string; datos: Datos; avisos: string[]; existente: { codigo: string; titulo?: string } | null; estado: 'nuevo' | 'existente' }
interface Pedido extends Fila { actividad_ref: string }
interface Vista { lectura: LecturaPegado; actividades: Fila[]; pedidos: Pedido[]; resto: string }

export default function DialogoPegarSemana({ abierto, s, alCerrar, recargar, textoInicial }: {
  abierto: boolean
  s: SemanaDetalle
  alCerrar: () => void
  recargar: () => Promise<void>
  /** Texto que llega ya pegado (del chat): se lee solo al abrir. */
  textoInicial?: string
}) {
  const [textoPegado, setTextoPegado] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const [v, setV] = useState<Vista | null>(null)
  const [acts, setActs] = useState<Set<number>>(new Set())
  const [peds, setPeds] = useState<Set<number>>(new Set())
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => { setTextoPegado(''); setV(null); setError(''); alCerrar() }

  const leer = async (t: string = textoPegado) => {
    setLeyendo(true)
    setError('')
    try {
      const r = await api<Vista>(`/api/semanas/${s.id}/pegar`, { method: 'POST', body: JSON.stringify({ texto: t }) })
      setV(r)
      setActs(new Set(r.actividades.filter((a) => a.estado === 'nuevo').map((a) => a.n)))
      setPeds(new Set(r.pedidos.filter((p) => p.estado === 'nuevo').map((p) => p.n)))
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
    setTextoPegado(textoInicial)
    void leer(textoInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, textoInicial])

  const registrar = async () => {
    if (!v) return
    setGuardando(true)
    setError('')
    const codigos: Record<string, string> = {}
    for (const a of v.actividades) if (a.existente) codigos[a.ref] = a.existente.codigo
    const fallos: string[] = []
    for (const a of v.actividades) {
      if (!acts.has(a.n)) continue
      try {
        const r = await api<{ codigo: string }>(`/api/semanas/${s.id}/actividades`, { method: 'POST', body: JSON.stringify({ datos: a.datos }) })
        codigos[a.ref] = r.codigo
      } catch (e) {
        fallos.push(`${a.ref}: ${e instanceof Error ? e.message : 'no se registró'}`)
      }
    }
    for (const p of v.pedidos) {
      if (!peds.has(p.n)) continue
      try {
        const datos = { ...p.datos, actividad: codigos[p.actividad_ref] ?? p.datos.actividad ?? null }
        await api(`/api/semanas/${s.id}/pedidos`, { method: 'POST', body: JSON.stringify({ datos }) })
      } catch (e) {
        fallos.push(`${p.ref}: ${e instanceof Error ? e.message : 'no se registró'}`)
      }
    }
    void registrarPegado({
      tipo: v.lectura.tipo, version: v.lectura.version, fuente: v.lectura.fuente, texto: textoPegado, entidad: `sr:${s.id}`,
      campos_propuestos: { actividades: v.actividades.map((a) => a.datos), pedidos: v.pedidos.map((p) => p.datos) },
      campos_aplicados: { actividades: Object.values(codigos), pedidos: v.pedidos.filter((p) => peds.has(p.n)).map((p) => p.ref) },
      rechazados: [...v.actividades.filter((a) => !acts.has(a.n)).map((a) => a.ref), ...v.pedidos.filter((p) => !peds.has(p.n)).map((p) => p.ref)],
    })
    await recargar()
    setGuardando(false)
    if (fallos.length) setError(`No se registró: ${fallos.join('; ')}`)
    else cerrar()
  }

  const alternar = (set: Set<number>, n: number, poner: (x: Set<number>) => void) => { const x = new Set(set); if (x.has(n)) x.delete(n); else x.add(n); poner(x) }
  const tarjeta = (marcada: boolean, alMarcar: () => void, f: Fila, cuerpo: React.ReactNode) => (
    <Box key={`${f.ref}-${f.n}`} sx={{ display: 'flex', gap: 0.5, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: PALETA.superficieTenue, opacity: marcada ? 1 : 0.6 }}>
      <Checkbox size="small" checked={marcada} onChange={alMarcar} sx={{ p: 0.25, alignSelf: 'flex-start' }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {cuerpo}
        {f.existente && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Ya registrada como {f.existente.codigo}: no se duplica.</Typography>}
        {f.avisos.map((a) => <Typography key={a} variant="caption" sx={{ display: 'block', color: PALETA.dorado }}>{a}</Typography>)}
      </Box>
    </Box>
  )
  const total = acts.size + peds.size

  const pausa = usePausaTrasLeer(Boolean(v))
  return (
    <Dialog open={abierto} onClose={cerrar} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>Pegar el registro de la jornada</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!v && (
          <>
            <Typography variant="body2" color="text.secondary">
              Pegue aquí la respuesta de la IA con el registro de la jornada.
            </Typography>
            <TextField multiline minRows={6} maxRows={16} autoFocus size="small" value={textoPegado} onChange={(e) => setTextoPegado(e.target.value)} label="Respuesta de la IA" />
            {leyendo && <LinearProgress />}
          </>
        )}
        {v && (
          <>
            {v.lectura.avisos.map((a) => <Alert key={a} severity="info" sx={{ py: 0 }}>{a}</Alert>)}
            <Typography variant="subtitle2">Actividades ({v.actividades.length})</Typography>
            {v.actividades.map((a) => tarjeta(acts.has(a.n), () => alternar(acts, a.n, setActs), a, (
              <>
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{a.ref}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{texto(a.datos.titulo)}</Typography>
                  <Chip size="small" label={a.estado === 'nuevo' ? 'nueva' : 'ya está'} sx={{ height: 18, fontSize: 10.5 }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {[a.datos.fecha && fechaLarga(texto(a.datos.fecha)), a.datos.hora_inicio && `${texto(a.datos.hora_inicio)}${a.datos.hora_fin ? `–${texto(a.datos.hora_fin)}` : ''}`, a.datos.distrito, a.datos.tipo, a.datos.sector].filter(Boolean).map(texto).join(' · ')}
                </Typography>
              </>
            )))}
            {v.pedidos.length > 0 && <Typography variant="subtitle2" sx={{ mt: 0.5 }}>Pedidos ({v.pedidos.length})</Typography>}
            {v.pedidos.map((p) => tarjeta(peds.has(p.n), () => alternar(peds, p.n, setPeds), p, (
              <>
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>{p.ref} · {p.actividad_ref || 'sin actividad'}</Typography>
                  <Chip size="small" label={p.estado === 'nuevo' ? 'nuevo' : 'ya está'} sx={{ height: 18, fontSize: 10.5 }} />
                </Box>
                <Typography variant="body2">{texto(p.datos.pedido)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[(p.datos.entidades as string[] | undefined)?.join(', '), p.datos.prioridad_propuesta, p.datos.responsable, p.datos.plazo && `plazo ${texto(p.datos.plazo)}`].filter(Boolean).map(texto).join(' · ')}
                </Typography>
              </>
            )))}
          </>
        )}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={cerrar}>Cancelar</Button>
        {v && <Button color="inherit" onClick={() => setV(null)}>Volver a pegar</Button>}
        {!v
          ? <Button variant="contained" disabled={!textoPegado.trim() || leyendo} onClick={() => void leer()}>Leer</Button>
          : <Button variant="contained" disabled={guardando || total === 0 || pausa} onClick={() => void registrar()}>Registrar {total ? `(${total})` : ''}</Button>}
      </DialogActions>
    </Dialog>
  )
}

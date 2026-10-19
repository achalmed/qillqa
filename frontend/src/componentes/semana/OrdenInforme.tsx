/**
 * ORDEN DEL INFORME (2026-10-06): las fotos elegidas, actividad por actividad, en
 * el orden en que el generador las toma (lib/datos.py del informe-sr): la PRIMERA
 * de cada actividad va en su ficha; las de las actividades de un día forman la
 * galería de ese día (hasta 4 al cierre del día, hasta 8 en la crónica). Subir o
 * bajar una foto aquí cambia su orden en fotos.yaml (POST fotos-ordenar).
 */
import { useEffect, useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import { api } from '../../api'
import { PALETA } from '../../paleta'
import Miniatura from './MiniaturaFoto'
import { type SemanaDetalle, texto } from './modelo'
import { type Lote, aFotoS, agrupar, enInforme } from './fotosSemana'

interface Props {
  s: SemanaDetalle
  abierto: boolean
  alCerrar: () => void
  cambiar: (codigos: string[], lote: Lote) => Promise<void>
  recargar: () => Promise<void>
  avisar: (tipo: 'success' | 'error' | 'info', t: string) => void
}

export default function OrdenInforme({ s, abierto, alCerrar, cambiar, recargar, avisar }: Props) {
  const tema = useTheme()
  const angosta = useMediaQuery(tema.breakpoints.down('sm'))
  const grupos = useMemo(() => agrupar(s, s.fotos.map(aFotoS).filter((f) => enInforme(f.datos))), [s])
  // El orden propio de cada actividad mientras se edita (código de actividad → códigos de foto).
  const [orden, setOrden] = useState<Record<string, string[]>>({})
  const [guardando, setGuardando] = useState(false)
  // Al recargar (p. ej. tras quitar una foto) se conserva lo ya movido y entra lo nuevo al final.
  useEffect(() => {
    if (!abierto) {
      setOrden({})
      return
    }
    setOrden((previo) => Object.fromEntries(grupos.flatMap((d) => d.actividades.map((a) => {
      const ahora = a.fotos.map((f) => f.codigo)
      const quedan = (previo[a.codigo] ?? []).filter((c) => ahora.includes(c))
      return [a.codigo, [...quedan, ...ahora.filter((c) => !quedan.includes(c))]]
    }))))
  }, [abierto, grupos])
  const cambiado = grupos.some((d) => d.actividades.some((a) => (orden[a.codigo] ?? []).join() !== a.fotos.map((f) => f.codigo).join()))
  const mover = (act: string, i: number, delta: number) =>
    setOrden((o) => {
      const l = [...(o[act] ?? [])]
      const j = i + delta
      if (j < 0 || j >= l.length) return o
      ;[l[i], l[j]] = [l[j], l[i]]
      return { ...o, [act]: l }
    })
  const guardar = async () => {
    setGuardando(true)
    try {
      const codigos = grupos.flatMap((d) => d.actividades.flatMap((a) => orden[a.codigo] ?? []))
      await api(`/api/semanas/${s.id}/fotos-ordenar`, { method: 'POST', body: JSON.stringify({ codigos }) })
      await recargar()
      avisar('success', 'Orden del informe guardado.')
      alCerrar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo guardar el orden.')
    } finally {
      setGuardando(false)
    }
  }
  const datosDe = (c: string) => s.fotos.find((f) => f.codigo === c)?.datos ?? {}
  const total = grupos.reduce((n, d) => n + d.actividades.reduce((m, a) => m + a.fotos.length, 0), 0)

  return (
    <Dialog open={abierto} onClose={alCerrar} fullScreen={angosta} fullWidth maxWidth="md">
      <DialogTitle>Orden del informe · {total} fotos</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          La 1.ª de cada actividad va en su ficha. Máx. 8 por día.
        </Alert>
        {!total && <Typography color="text.secondary">Aún no hay fotos elegidas.</Typography>}
        {grupos.map((d) => {
          const delDia = d.actividades.reduce((m, a) => m + a.fotos.length, 0)
          return (
            <Box key={d.clave} sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>
                {d.titulo} <Typography component="span" variant="caption" color={delDia > 8 ? PALETA.aviso : 'text.secondary'}>· {delDia} fotos</Typography>{/* 2026-10-06: sin «(la crónica muestra hasta 8)»; el aviso de arriba ya da el máximo. */}
              </Typography>
              {d.actividades.map((a) => (
                <Box key={a.codigo} sx={{ mb: 1.25, pl: 1, borderLeft: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">{a.codigo} · {a.titulo}</Typography>
                  {(orden[a.codigo] ?? []).map((c, i, l) => {
                    const dd = datosDe(c)
                    return (
                      <Box key={c} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                        <Box sx={{ width: 72, height: 48, flexShrink: 0, borderRadius: 0.5, overflow: 'hidden' }}>
                          <Miniatura semanaId={s.id} codigo={c} />
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontSize: 13 }} noWrap>
                            <b>{c}</b>{i === 0 ? <Typography component="span" sx={{ fontSize: 11.5, color: PALETA.aviso, ml: 0.75 }}>ficha</Typography> : null}
                            {dd.orientacion === 'vertical' ? <Typography component="span" sx={{ fontSize: 11.5, color: 'text.secondary', ml: 0.75 }}>vertical · recorte {texto(dd.recorte) || 'centro'}</Typography> : null}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap component="div">{texto(dd.pie) || 'Sin pie'}</Typography>
                        </Box>
                        <IconButton size="small" aria-label="Subir" disabled={i === 0} onClick={() => mover(a.codigo, i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
                        <IconButton size="small" aria-label="Bajar" disabled={i === l.length - 1} onClick={() => mover(a.codigo, i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
                        <IconButton size="small" aria-label="Quitar del informe" title="Quitar del informe"
                          onClick={() => void cambiar([c], { cambios: { seleccion: false } })}>
                          <RemoveCircleOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )
                  })}
                </Box>
              ))}
            </Box>
          )
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cerrar</Button>
        <Button variant="contained" disabled={!cambiado || guardando} onClick={guardar}>Guardar orden</Button>
      </DialogActions>
    </Dialog>
  )
}

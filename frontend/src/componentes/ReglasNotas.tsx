/**
 * NOTAS DE SUSTENTO que el sistema ofrece (2026-10-19; Administración → Reglas). Edison: «ofrecerla
 * también en otros tipos; que sea un ajuste editable por tipo». Cada nota del catálogo
 * (`servicios/notas_normativas.py`: texto fiel a la norma y su fuente en la biblioteca) se marca en los
 * tipos de documento donde el editor debe ofrecerla; lo de fábrica se puede restablecer. Solo el
 * administrador guarda (`PUT /api/ajustes/notas-normativas`).
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'
import { api } from '../api'
import { PALETA } from '../paleta'

interface Nota { clave: string; titulo: string; texto: string; fuente: { cita: string; calibre_id: number }; tipos: string[]; tipos_defecto: string[] }
interface Tipo { codigo: string; nombre: string; externo?: boolean }

export default function ReglasNotas({ alAvisar }: { alAvisar: (tipo: 'success' | 'error', texto: string) => void }) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [elegidos, setElegidos] = useState<Record<string, string[]>>({})
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    api<Nota[]>('/api/ajustes/notas-normativas').then((n) => { setNotas(n); setElegidos(Object.fromEntries(n.map((x) => [x.clave, x.tipos]))) }).catch(() => {})
    api<Tipo[]>('/api/tipos').then((t) => setTipos(t.filter((x) => !x.externo))).catch(() => {})
  }, [])
  const alternar = (clave: string, tipo: string) => setElegidos((e) => ({ ...e, [clave]: (e[clave] ?? []).includes(tipo) ? (e[clave] ?? []).filter((x) => x !== tipo) : [...(e[clave] ?? []), tipo] }))
  const guardar = async () => {
    setGuardando(true)
    try {
      const n = await api<Nota[]>('/api/ajustes/notas-normativas', { method: 'PUT', body: JSON.stringify(elegidos) })
      setNotas(n)
      alAvisar('success', 'Notas de sustento guardadas.')
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }
  const cambiado = notas.some((n) => JSON.stringify([...(elegidos[n.clave] ?? [])].sort()) !== JSON.stringify([...n.tipos].sort()))
  if (notas.length === 0) return null
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ fontSize: 17, mb: 0.5 }}>Notas de sustento que el editor ofrece</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>En estos tipos, cuando el texto lo amerita, el editor ofrece la nota al pie (nunca la inserta solo).</Typography>
      {notas.map((n) => (
        <Box key={n.clave} sx={{ p: 1.5, mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: PALETA.superficieTenue }}>
          <Typography variant="subtitle2">{n.titulo}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }} title={n.texto}>{n.fuente.cita} · Calibre {n.fuente.calibre_id}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, rowGap: 0 }}>
            {tipos.map((t) => (
              <FormControlLabel key={t.codigo} sx={{ mr: 0 }} control={<Checkbox size="small" checked={(elegidos[n.clave] ?? []).includes(t.codigo)} onChange={() => alternar(n.clave, t.codigo)} />} label={<Typography variant="body2">{t.nombre}</Typography>} />
            ))}
          </Box>
          <Button size="small" color="inherit" sx={{ mt: 0.5, color: 'text.secondary' }} onClick={() => setElegidos((e) => ({ ...e, [n.clave]: n.tipos_defecto }))}>Restablecer lo de fábrica</Button>
        </Box>
      ))}
      <Button variant="contained" size="small" onClick={() => void guardar()} disabled={!cambiado || guardando}>Guardar</Button>
    </Box>
  )
}

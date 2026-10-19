/**
 * ADMINISTRACIÓN → CUENTAS → DATOS AL PRIMER INGRESO (2026-10-18): si quien entra por primera vez
 * confirma sus datos antes de seguir (paginas/Bienvenida.tsx) y a qué cargos no se les pide (de
 * fábrica, «Diputado»). `GET|PUT /api/admin/primer-ingreso`; en `ajustes`, clave `primer_ingreso`.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import WavingHandOutlinedIcon from '@mui/icons-material/WavingHandOutlined'
import { api } from '../../api'
import { PALETA } from '../../paleta'
import Tarjeta from './Tarjeta'

/** «a, b y c». */
const enLista = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs.join(''))

interface Config { activo: boolean; excluir_cargos: string[]; cargos: string[]; datos: string[] }

export default function PrimerIngreso({ pendientes, alCambiar, alAvisar }: {
  pendientes: number
  alCambiar: () => void
  alAvisar: (tipo: 'success' | 'error', texto: string) => void
}) {
  const [c, setC] = useState<Config | null>(null)
  useEffect(() => { api<Config>('/api/admin/primer-ingreso').then(setC).catch(() => setC(null)) }, [])
  if (!c) return null
  const guardar = async (cambio: Partial<Config>) => {
    try {
      const r = await api<Config>('/api/admin/primer-ingreso', { method: 'PUT', body: JSON.stringify({ activo: c.activo, excluir_cargos: c.excluir_cargos, ...cambio }) })
      setC(r)
      alCambiar()
      alAvisar('success', 'Guardado.')
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  const alternarCargo = (cargo: string) =>
    void guardar({ excluir_cargos: c.excluir_cargos.includes(cargo) ? c.excluir_cargos.filter((x) => x !== cargo) : [...c.excluir_cargos, cargo] })

  return (
    <Tarjeta
      icono={<WavingHandOutlinedIcon />}
      titulo="Datos al primer ingreso"
      accion={<Switch checked={c.activo} onChange={(e) => void guardar({ activo: e.target.checked })} inputProps={{ 'aria-label': 'Pedir los datos al primer ingreso' }} />}
      texto={`Quien entra por primera vez confirma sus ${enLista(c.datos)} antes de seguir.${c.activo && pendientes ? ` Pendientes: ${pendientes}.` : ''}`}
    >
      <Box sx={{ opacity: c.activo ? 1 : 0.55 }}>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>No se piden a estos cargos:</Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {c.cargos.map((cargo) => {
            const fuera = c.excluir_cargos.includes(cargo)
            return (
              <Chip
                key={cargo} size="small" label={cargo} clickable disabled={!c.activo}
                onClick={() => alternarCargo(cargo)}
                variant={fuera ? 'filled' : 'outlined'}
                sx={fuera ? { bgcolor: PALETA.guindaSuave, color: PALETA.guinda, fontWeight: 600, borderColor: 'transparent' } : undefined}
              />
            )
          })}
        </Box>
      </Box>
    </Tarjeta>
  )
}

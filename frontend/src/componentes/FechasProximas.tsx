// Próximas fechas del Inicio (2026-10-08, Edison: «feriados del Perú y aniversarios de distritos…
// sutiles pero informativos, que no ocupen mucho espacio ni quiten protagonismo a la agenda»).
// Una franja de una o dos líneas: los feriados y días no laborables de los próximos 30 días, las
// fechas cívicas de los próximos 7 y los aniversarios de creación de distritos de los próximos 15.
// Reemplaza a la tarjeta grande de aniversarios.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material'
import CakeOutlinedIcon from '@mui/icons-material/CakeOutlined'
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined'
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined'
import { api } from '../api'
import { PALETA } from '../paleta'
import type { Distrito } from './Distritos'
import type { Feriado } from './tareas/tipos'
import { isoDia, sumarDias, DIAS_CORTOS, MESES_CORTOS, desdeIso, diaSemana } from './tareas/calendario'

interface Fecha {
  fecha: string
  texto: string
  detalle: string
  clase: 'feriado' | 'civica' | 'aniversario'
  ir: string
}

const fechaCorta = (iso: string) => {
  const d = desdeIso(iso)
  return `${DIAS_CORTOS[diaSemana(d)]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`
}

export default function FechasProximas() {
  const navegar = useNavigate()
  const [fechas, setFechas] = useState<Fecha[] | null>(null)
  useEffect(() => {
    const hoy = new Date()
    const desde = isoDia(hoy)
    const hasta = isoDia(sumarDias(hoy, 30))
    const civicasHasta = isoDia(sumarDias(hoy, 7))
    Promise.all([
      api<Feriado[]>(`/api/agenda/feriados?desde=${desde}&hasta=${hasta}`).catch(() => [] as Feriado[]),
      api<Distrito[]>('/api/territorio/aniversarios?dias=15').catch(() => [] as Distrito[]),
    ]).then(([fs, ds]) => {
      const lista: Fecha[] = [
        ...fs
          .filter((f) => f.tipo !== 'civica' || f.fecha <= civicasHasta)
          .map((f): Fecha => ({
            fecha: f.fecha,
            texto: f.nombre,
            detalle: f.tipo === 'feriado' ? 'Feriado' : f.tipo === 'no_laborable' ? 'Día no laborable' : 'Fecha cívica',
            clase: f.tipo === 'civica' ? 'civica' : 'feriado',
            ir: `/agenda?vista=semana&fecha=${f.fecha}`,
          })),
        ...ds
          .filter((d) => d.fecha_aniversario)
          .map((d): Fecha => ({
            fecha: d.fecha_aniversario!,
            texto: `Aniv. de ${d.distrito}`,
            detalle: `${d.provincia}${d.anios ? ` · ${d.anios} años de su creación` : ''}${d.norma ? ` · ${d.norma}` : ''}`,
            clase: 'aniversario',
            ir: `/directorio?pestana=distritos&q=${encodeURIComponent(d.distrito)}`,
          })),
      ].sort((a, b) => a.fecha.localeCompare(b.fecha))
      setFechas(lista)
    })
  }, [])

  if (!fechas?.length) return null
  const ICONO = { feriado: EventBusyOutlinedIcon, civica: FlagOutlinedIcon, aniversario: CakeOutlinedIcon }
  const COLOR = { feriado: PALETA.error, civica: PALETA.textoTenue, aniversario: PALETA.dorado }
  return (
    <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1.5, py: 1, borderRadius: 2, bgcolor: PALETA.superficieTenue, border: `1px solid ${PALETA.borde}` }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: PALETA.textoTenue, textTransform: 'uppercase', letterSpacing: 0.6, mr: 0.5 }}>Próximas fechas</Typography>
      {fechas.slice(0, 8).map((f) => {
        const Icono = ICONO[f.clase]
        return (
          <Tooltip key={`${f.fecha}-${f.texto}`} title={`${f.detalle} · ${fechaCorta(f.fecha)}`}>
            <ButtonBase
              onClick={() => navegar(f.ir)}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.25, borderRadius: 5, fontSize: 12.5, color: PALETA.textoSecundario, '&:hover': { bgcolor: PALETA.superficieMedia } }}
            >
              <Icono sx={{ fontSize: 15, color: COLOR[f.clase] }} />
              <Box component="span" sx={{ fontWeight: 600, color: f.clase === 'feriado' ? PALETA.error : PALETA.texto }}>{fechaCorta(f.fecha)}</Box>
              <Box component="span" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.texto}</Box>
            </ButtonBase>
          </Tooltip>
        )
      })}
      {fechas.length > 8 && (
        <ButtonBase onClick={() => navegar('/directorio?pestana=distritos&orden=proximo')} sx={{ fontSize: 12.5, color: 'primary.main', fontWeight: 600, px: 0.5 }}>
          +{fechas.length - 8}
        </ButtonBase>
      )}
    </Box>
  )
}

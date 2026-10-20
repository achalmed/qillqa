/**
 * Trazabilidad de vuelta: en la gestión documental, el ISR y los oficios que derivan un
 * pedido muestran de qué Semana de representación vienen, y un clic lleva allí.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import { api } from '../../api'

interface Origen {
  semana_id: number
  codigo: string
  tema: string
  pedido: string | null
  es_isr: boolean
}

export default function OrigenSemana({ documentoId }: { documentoId: number }) {
  const navegar = useNavigate()
  const [o, setO] = useState<Origen | null>(null)
  useEffect(() => {
    api<Origen | null>(`/api/semanas/origen/${documentoId}`).then(setO).catch(() => setO(null))
  }, [documentoId])
  if (!o) return null
  const destino = `/informes/${o.semana_id}?ver=${o.es_isr ? 'informe' : 'pedidos'}`
  return (
    <Tooltip title={o.es_isr ? `Informe de la ${o.codigo} (${o.tema}): abrir la semana` : `Deriva el pedido ${o.pedido} de la ${o.codigo} (${o.tema}): abrir la semana`}>
      <Chip
        size="small"
        icon={<CampaignOutlinedIcon />}
        label={o.es_isr ? `Semana ${o.codigo}` : `${o.codigo} · pedido ${o.pedido}`}
        onClick={() => navegar(destino)}
        variant="outlined"
      />
    </Tooltip>
  )
}

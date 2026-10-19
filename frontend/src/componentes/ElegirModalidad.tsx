/**
 * ¿CÓMO QUIERE ABRIR? (2026-10-19; Edison: «al entrar a un proyecto de ley ofrecer desde el inicio
 * Formulario o Formato Word, y recordar la elección por cuenta»). El mismo diálogo para un proyecto
 * de ley y para un documento de Gestión documental: dos opciones grandes y «Recordar en esta cuenta»
 * (se cambia después en Mi perfil → Cómo abrir). Quién lo muestra y cuándo lo decide
 * `modalidadAlAbrir` (src/modalidad.ts): nunca con un enlace explícito ni con un aviso que lleva a
 * una parte.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { PALETA } from '../paleta'

export default function ElegirModalidad({ abierto, modulo, alElegir }: {
  abierto: boolean
  modulo: 'proyectos' | 'documentos'
  alElegir: (modalidad: 'formulario' | 'word', recordar: boolean) => void
}) {
  const [recordar, setRecordar] = useState(true)
  const que = modulo === 'proyectos' ? 'el proyecto' : 'el documento'
  const opciones: { valor: 'formulario' | 'word'; nombre: string; detalle: string; icono: React.ReactNode }[] = [
    { valor: 'formulario', nombre: 'Formulario', detalle: modulo === 'proyectos' ? 'Partes una a una, trámite, revisión y PDF.' : 'Campos, trámite, numeración y firma.', icono: <ArticleOutlinedIcon sx={{ fontSize: 30 }} /> },
    { valor: 'word', nombre: 'Formato Word', detalle: modulo === 'proyectos' ? 'Todas las partes de corrido, como en Word.' : 'Varios documentos en un espacio, como en Word.', icono: <DescriptionOutlinedIcon sx={{ fontSize: 30 }} /> },
  ]
  return (
    <Dialog open={abierto} fullWidth maxWidth="xs" disableEscapeKeyDown>
      <DialogTitle sx={{ pb: 1 }}>¿Cómo quiere abrir {que}?</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: '4px !important' }}>
        {opciones.map((o) => (
          <ButtonBase key={o.valor} onClick={() => alElegir(o.valor, recordar)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: PALETA.superficieTenue, '&:hover': { borderColor: 'primary.main', bgcolor: PALETA.veloMedio } }}>
            <Box sx={{ color: 'primary.main', display: 'flex' }}>{o.icono}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 650 }}>{o.nombre}</Typography>
              <Typography variant="body2" color="text.secondary">{o.detalle}</Typography>
            </Box>
          </ButtonBase>
        ))}
        <FormControlLabel control={<Checkbox size="small" checked={recordar} onChange={(_, v) => setRecordar(v)} />} label={<Typography variant="body2">Recordar en esta cuenta (se cambia en Mi perfil)</Typography>} sx={{ ml: -0.5 }} />
      </DialogContent>
    </Dialog>
  )
}

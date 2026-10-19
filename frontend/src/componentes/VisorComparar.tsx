/**
 * Varios PDF a la vez, lado a lado, para compararlos (Edison 2026-10-10: «visualizar
 * simultáneamente varios PDF seleccionados en la bandeja»). Hasta cuatro columnas en una
 * computadora (dos en el celular); con más documentos, los demás esperan en pestañas que
 * sustituyen a una columna. Cada columna lleva el visor de siempre (copiar, ampliar, descargar)
 * y elige qué versión mostrar: el PDF generado, el firmado o un cargo.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import VisorPdf from './VisorPdf'
import { PALETA } from '../paleta'

export interface DocumentoComparable {
  id: number
  numero_completo: string
  asunto?: string
  firmado_id: number | null
  recepciones: { id: number; etiqueta: string }[]
}

type Pieza = { clave: string; texto: string; ruta: string; nombre: string }

function piezasDe(d: DocumentoComparable): Pieza[] {
  const base = `/api/documentos/${d.id}`
  const p: Pieza[] = [{ clave: 'pdf', texto: 'Documento', ruta: `${base}/pdf`, nombre: `${d.numero_completo}.pdf` }]
  if (d.firmado_id) p.push({ clave: 'firmado', texto: 'Firmado', ruta: `${base}/adjuntos/${d.firmado_id}`, nombre: '' })
  for (const r of d.recepciones) p.push({ clave: `cr${r.id}`, texto: `Cargo${r.etiqueta ? ` · ${r.etiqueta}` : ''}`, ruta: `${base}/adjuntos/${r.id}`, nombre: '' })
  return p
}

function Columna({ d }: { d: DocumentoComparable }) {
  const piezas = piezasDe(d)
  const [clave, setClave] = useState(piezas[0].clave)
  const pieza = piezas.find((p) => p.clave === clave) ?? piezas[0]
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} title={d.asunto}>{d.numero_completo}</Typography>
        {piezas.length > 1 && (
          <TextField select size="small" value={clave} onChange={(e) => setClave(e.target.value)} sx={{ minWidth: 130, '& .MuiInputBase-input': { py: 0.4, fontSize: 12.5 } }}>
            {piezas.map((p) => <MenuItem key={p.clave} value={p.clave} dense>{p.texto}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <VisorPdf ruta={pieza.ruta} version={pieza.clave} nombre={pieza.nombre} alto="100%" />
      </Box>
    </Box>
  )
}

export default function VisorComparar({ documentos, alCerrar }: { documentos: DocumentoComparable[]; alCerrar: () => void }) {
  const celular = useMediaQuery(useTheme().breakpoints.down('md'))
  const maximo = celular ? 2 : 4
  // Los que caben se ven a la vez; el resto se trae a una columna con las pestañas.
  const [visibles, setVisibles] = useState<number[]>(documentos.slice(0, maximo).map((d) => d.id))
  const enEspera = documentos.filter((d) => !visibles.includes(d.id))
  const traer = (id: number) => setVisibles((v) => [...v.slice(1), id])
  return (
    <Dialog open fullScreen onClose={alCerrar}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: PALETA.superficieTenue }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, bgcolor: PALETA.superficie, color: PALETA.texto, borderBottom: `1px solid ${PALETA.borde}` }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>Comparar documentos · {documentos.length}</Typography>
          {enEspera.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: PALETA.textoSecundario }}>Traer a la vista:</Typography>
              {enEspera.map((d) => (
                <Chip key={d.id} size="small" label={d.numero_completo} onClick={() => traer(d.id)} variant="outlined" />
              ))}
            </Box>
          )}
          <IconButton onClick={alCerrar} aria-label="Cerrar"><CloseIcon /></IconButton>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, p: 1, display: 'grid', gap: 1, gridTemplateColumns: `repeat(${Math.min(visibles.length, maximo)}, minmax(0, 1fr))` }}>
          {visibles.map((id) => {
            const d = documentos.find((x) => x.id === id)
            return d ? <Columna key={d.id} d={d} /> : null
          })}
        </Box>
      </Box>
    </Dialog>
  )
}

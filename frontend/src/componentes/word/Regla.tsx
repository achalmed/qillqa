/**
 * La REGLA del Formato Word (2026-10-19): una marca por centímetro al ancho de la hoja, con los
 * márgenes laterales del documento sombreados (los de `fmt_margenes`, que es lo que el PDF usa).
 * Solo informa: los márgenes se cambian en el panel Formato del formulario, para que un ajuste tenga
 * un único lugar (regla «todo conectado»).
 */
import Box from '@mui/material/Box'
import { PALETA } from '../../paleta'
import { A4, marcasRegla, margenCm, PX_POR_CM } from './modelo'

export default function Regla({ campos, escala }: { campos: Record<string, string> | undefined; escala: number }) {
  const marcas = marcasRegla(campos, escala)
  const ancho = Math.round(A4.ancho * PX_POR_CM * escala)
  const margen = Math.round(margenCm(campos) * PX_POR_CM * escala)
  return (
    <Box aria-label={`Regla: márgenes de ${margenCm(campos)} cm`} sx={{ position: 'relative', width: ancho, height: 18, mx: 'auto', bgcolor: PALETA.superficieMedia, borderRadius: '3px 3px 0 0', overflow: 'hidden', userSelect: 'none' }}>
      <Box sx={{ position: 'absolute', left: margen, right: margen, top: 0, bottom: 0, bgcolor: 'background.paper' }} />
      {marcas.map((m) => (
        <Box key={m.cm} sx={{ position: 'absolute', left: m.x, top: m.cm % 5 === 0 ? 4 : 10, bottom: 0, width: '1px', bgcolor: m.margen ? PALETA.apagado : PALETA.textoTenue }}>
          {m.cm % 5 === 0 && m.cm > 0 && m.cm < A4.ancho && escala > 0.55 && (
            <Box component="span" sx={{ position: 'absolute', left: 3, top: -5, fontSize: 9, color: PALETA.textoTenue, lineHeight: 1 }}>{m.cm}</Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

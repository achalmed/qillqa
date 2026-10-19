import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha } from '@mui/material/styles'
import { camposCambiados, compararTextos, textoDeCuerpo, type Trozo } from '../diferencias'

/** Una versión a comparar: rótulo («v3 · Ana Pérez, 05/10 12:30»), cuerpo
 * TipTap y, en los documentos, sus campos del formulario. */
export interface LadoComparado {
  etiqueta: string
  cuerpo: unknown
  campos?: Record<string, unknown>
}

/** Nombres legibles de los campos más comunes; el resto, su clave sin «_». */
const NOMBRE_CAMPO: Record<string, string> = {
  asunto: 'Asunto',
  fecha: 'Fecha',
  lugar: 'Lugar',
  saludo: 'Saludo',
  sumilla: 'Sumilla',
  referencia: 'Referencia',
  con_copia: 'Con copia',
  anexos: 'Anexos',
  destinatario_tratamiento: 'Tratamiento',
  destinatario_nombre: 'Destinatario',
  destinatario_cargo: 'Cargo del destinatario',
  destinatario_institucion: 'Institución del destinatario',
}
const nombreCampo = (c: string) =>
  NOMBRE_CAMPO[c] ?? (c.startsWith('fmt_') ? `Formato: ${c.slice(4).replace(/_/g, ' ')}` : c.replace(/_/g, ' '))

/** Texto con lo agregado subrayado en verde y lo quitado tachado en rojo. */
export function TextoComparado({ trozos }: { trozos: Trozo[] }) {
  return (
    <Box component="div" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14.5 }}>
      {trozos.map((t, i) =>
        t.tipo === 'igual' ? (
          <span key={i}>{t.texto}</span>
        ) : (
          <Box
            key={i}
            component={t.tipo === 'agregado' ? 'ins' : 'del'}
            sx={(tema) => ({
              textDecoration: t.tipo === 'agregado' ? 'underline' : 'line-through',
              bgcolor: alpha(t.tipo === 'agregado' ? tema.palette.success.main : tema.palette.error.main, 0.14),
              color: t.tipo === 'agregado' ? 'success.dark' : 'error.dark',
              borderRadius: 0.5,
            })}
          >
            {t.texto}
          </Box>
        ),
      )}
    </Box>
  )
}

/** Qué cambió entre dos versiones (2026-10-05, «como en Google Docs»): los
 * datos del formulario que cambiaron y el texto con las diferencias marcadas.
 * Lo usan las versiones de los documentos y las de las partes del proyecto. */
export default function ComparadorVersiones({
  abierto,
  alCerrar,
  antes,
  despues,
}: {
  abierto: boolean
  alCerrar: () => void
  antes: LadoComparado | null
  despues: LadoComparado | null
}) {
  const listo = antes !== null && despues !== null
  const campos = listo && (antes.campos || despues.campos) ? camposCambiados(antes.campos, despues.campos) : []
  const trozos = listo ? compararTextos(textoDeCuerpo(antes.cuerpo), textoDeCuerpo(despues.cuerpo)) : []
  const cambioTexto = trozos.some((t) => t.tipo !== 'igual')

  return (
    <Dialog open={abierto} onClose={alCerrar} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle sx={{ pb: 0.5 }}>
        Qué cambió
        {listo && (
          <Typography variant="body2" color="text.secondary">
            De {antes.etiqueta} a {despues.etiqueta}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {!listo && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {listo && (
          <>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
              <Box component="ins" sx={{ color: 'success.dark', textDecoration: 'underline' }}>Subrayado verde</Box>: se
              agregó · <Box component="del" sx={{ color: 'error.dark' }}>tachado rojo</Box>: se quitó.
            </Typography>
            {campos.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Datos del documento
                </Typography>
                {campos.map((c) => (
                  <Box key={c.clave} sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {nombreCampo(c.clave)}
                    </Typography>
                    <TextoComparado trozos={compararTextos(c.antes, c.despues)} />
                  </Box>
                ))}
              </Box>
            )}
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Texto
            </Typography>
            {cambioTexto ? (
              <TextoComparado trozos={trozos} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                El texto no cambió{campos.length ? '; solo los datos de arriba' : ''}.
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  )
}

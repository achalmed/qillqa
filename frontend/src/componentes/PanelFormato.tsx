// PanelFormato — FORMATO GENERAL: lo que afecta al documento COMPLETO
// (panel encima de la vista previa, que es lo que sus ajustes cambian).
// Auditado 2026-10-01 (Edison: «diferenciar claramente configuración global y
// configuración específica; que una propiedad no se configure desde varios
// lugares»): cuatro secciones fijas —Texto, Espacios entre partes, Página y
// pie, Firma y sello— y nada que también esté en una parte. El formato de
// CADA PARTE (destinatario, copias, asunto, cuerpo) vive en el icono ⚙ junto
// a ella (AjusteFormato.tsx) y, si fija un valor propio, manda sobre esto.
//
// Plegado, el panel dice en una línea lo que rige («11 pt · 1,15 · párrafos
// 4 pt») para no tener que abrirlo. Las definiciones están en `formato.ts`.
//
// Cada control escribe un campo fmt_* en `campos`; el generador del
// backend los traduce a comandos del framework VALIDANDO cada valor contra
// una lista blanca. Por eso son selects de valores fijos, no texto libre.
import { useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TuneIcon from '@mui/icons-material/Tune'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import StarOutlineIcon from '@mui/icons-material/StarOutline'
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore'
import { api } from '../api'
import {
  ajustesActivos,
  coma,
  CLAVES_GENERALES,
  formatoGeneral,
  interlineadoDocumento,
  interlineadoLegible,
  tamanoDocumento,
} from '../formato'
import CintaFormato from './CintaFormato'

interface Props {
  tipo: string
  valores: Record<string, string>
  alCambiar: (clave: string, valor: string) => void
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
  /** Se llama con los predeterminados recién guardados (todos los fmt_*). */
  alGuardado?: (valores: Record<string, string>) => void
  /** fmt_* predeterminados del tipo (para señalar ★ y el pie de cada select). */
  predeterminados?: Record<string, string>
  /** Valores con que se compiló la última vista previa cuando el ajuste automático intervino. */
  efectivos?: Record<string, string>
}

/** «11 pt · interlineado 1,15 · párrafos 4 pt» — lo que rige, en una línea. */
function resumen(valores: Record<string, string>): string {
  const parrafos = (valores.fmt_espacioparrafos || '4pt').replace('pt', ' pt')
  return `${coma(tamanoDocumento(valores))} pt · interlineado ${interlineadoLegible(interlineadoDocumento(valores))} · párrafos ${parrafos}`
}

export default function PanelFormato({ tipo, valores, alCambiar, alAvisar, alGuardado, predeterminados = {}, efectivos = {} }: Props) {
  const nAuto = Object.keys(efectivos).filter((k) => k.startsWith('fmt_')).length + (efectivos._aligerar ? 1 : 0)
  const [guardandoDefecto, setGuardandoDefecto] = useState(false)
  const secciones = formatoGeneral(tipo)

  const activosGeneral = secciones.reduce((n, g) => n + ajustesActivos(g, valores), 0)
  // 2026-10-06: ya no se cuenta aquí lo ajustado por parte: la nota se acortó.
  const igualAlPredeterminado = CLAVES_GENERALES.every(
    (k) => (valores[k] ?? '') === (predeterminados[k] ?? ''),
  )

  const restablecer = () => {
    CLAVES_GENERALES.forEach((k) => {
      if ((valores[k] ?? '') !== (predeterminados[k] ?? '')) alCambiar(k, predeterminados[k] ?? '')
    })
  }

  const guardarDefecto = async () => {
    setGuardandoDefecto(true)
    try {
      const fmt = Object.fromEntries(
        Object.entries(valores).filter(([k, v]) => k.startsWith('fmt_') && v !== ''),
      )
      await api(`/api/ajustes/formato/${tipo}`, {
        method: 'PUT',
        body: JSON.stringify({ valores: fmt }),
      })
      alGuardado?.(fmt as Record<string, string>)
      alAvisar?.('success', 'Formato guardado como predeterminado para los nuevos documentos de este tipo.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo guardar el predeterminado.')
    } finally {
      setGuardandoDefecto(false)
    }
  }

  return (
    <Accordion disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'baseline', gap: 1, minWidth: 0 } }}>
        <TuneIcon fontSize="small" sx={{ color: 'text.secondary', alignSelf: 'center' }} />
        <Typography sx={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>Formato general</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
          {resumen(valores)}
          {activosGeneral > 0 && (
            <Box component="span" sx={{ color: 'primary.main', ml: 0.75 }}>
              · {activosGeneral} ajuste{activosGeneral > 1 ? 's' : ''}
            </Box>
          )}
          {nAuto > 0 && (
            <Box component="span" sx={{ color: 'error.main', ml: 0.75, fontWeight: 600 }}>
              · {nAuto} automático{nAuto > 1 ? 's' : ''}
            </Box>
          )}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
          Afecta a todo el documento; los ajustes por parte prevalecen.
        </Typography>
        {nAuto > 0 && (
          <Typography variant="caption" sx={{ display: 'block', mb: 1.25, color: 'error.main' }}>
            Para que la firma no quede sola, el PDF usa valores distintos de los elegidos (en rojo abajo{efectivos._aligerar ? `; la primera hoja va ${efectivos._aligerar} líneas más corta` : ''}).
            Para que mande lo elegido: «Si la firma queda sola» → «No tocar».
          </Typography>
        )}
        {/* Cinta al estilo de Word (Edison 2026-10-10, segunda vuelta): los mismos controles,
            en grupos horizontales con icono, valor y rótulo; el detalle, al pasar el ratón. */}
        <Box sx={{ mb: 1.5 }}>
          <CintaFormato grupos={secciones} valores={valores} alCambiar={alCambiar} predeterminados={predeterminados} efectivos={efectivos} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Tooltip title="Volver al formato predeterminado de este tipo de documento (solo el formato general)">
            <span>
              <Button size="small" startIcon={<SettingsBackupRestoreIcon />} onClick={restablecer} disabled={igualAlPredeterminado}>
                Restablecer
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Usar este formato en los nuevos documentos de este tipo.">
            <span>
              <Button size="small" startIcon={<StarOutlineIcon />} onClick={guardarDefecto} disabled={guardandoDefecto}>
                Usar como predeterminado
              </Button>
            </span>
          </Tooltip>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

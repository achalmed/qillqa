/**
 * «Copiar el prompt» y «Descargar .md» de un formato de pegado (2026-10-18).
 *
 * La lógica vivía dentro de `ElegirEntrada` (el «Nuevo» de cada módulo); Edison pidió los mismos
 * botones en la sección de seguimiento del documento, así que salen a un gancho y un componente que
 * cualquier módulo reutiliza con el `tipo` de su esquema (`GET /api/pegar/prompt/{tipo}`). Un solo
 * lugar para el texto de los avisos y para «el prompt no está en este equipo».
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import { copiarTexto, descargarMd, promptDe } from '../pegar'

export type AvisoPrompt = { tipo: 'success' | 'info' | 'error'; texto: string }

/** Copia o descarga el prompt del formato `tipo`; `aviso` dice qué pasó (lo pinta quien lo use). */
export function useConPrompt(tipo: string) {
  const [aviso, setAviso] = useState<AvisoPrompt | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const conPrompt = async (que: 'copiar' | 'bajar') => {
    if (ocupado) return
    setOcupado(true)
    try {
      const p = await promptDe(tipo)
      if (!p.disponible) {
        setAviso({ tipo: 'info', texto: `El prompt no está en este equipo. En el vault: ${p.ruta}` })
        return
      }
      if (que === 'copiar') {
        await copiarTexto(p.texto)
        setAviso({ tipo: 'success', texto: 'Prompt copiado. Péguelo en su IA, agregue sus datos y traiga la respuesta.' })
      } else {
        descargarMd(p.nombre || `${tipo}.md`, p.texto)
        setAviso({ tipo: 'success', texto: `Descargado ${p.nombre || `${tipo}.md`}.` })
      }
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo obtener el prompt.' })
    } finally {
      setOcupado(false)
    }
  }
  return { aviso, setAviso, ocupado, conPrompt }
}

/** El aviso de `useConPrompt`, abajo y centrado (el mismo en todos los módulos). */
export function AvisoPromptSnackbar({ aviso, alCerrar }: { aviso: AvisoPrompt | null; alCerrar: () => void }) {
  return (
    <Snackbar open={aviso !== null} autoHideDuration={6000} onClose={alCerrar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      {aviso ? <Alert severity={aviso.tipo} variant="filled" onClose={alCerrar} sx={{ maxWidth: 'calc(100vw - 32px)' }}>{aviso.texto}</Alert> : undefined}
    </Snackbar>
  )
}

/** Los dos botones. `compacto`: solo íconos con su explicación (celular, cabeceras estrechas).
 *  Con `sinAviso`, quien lo usa pinta el aviso con `AvisoPromptSnackbar` (p. ej. dentro de un diálogo). */
export default function BotonesPrompt({ tipo, compacto = false, soloCopiar = false }: { tipo: string; compacto?: boolean; soloCopiar?: boolean }) {
  const { aviso, setAviso, ocupado, conPrompt } = useConPrompt(tipo)
  const copiar = () => void conPrompt('copiar')
  const bajar = () => void conPrompt('bajar')
  return (
    <>
      <Box sx={{ display: 'inline-flex', gap: compacto ? 0 : 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {compacto ? (
          <>
            <Tooltip title="Copiar el prompt"><IconButton size="small" disabled={ocupado} onClick={copiar} aria-label="Copiar el prompt"><ContentCopyOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            {!soloCopiar && <Tooltip title="Descargar el prompt (.md)"><IconButton size="small" disabled={ocupado} onClick={bajar} aria-label="Descargar el prompt"><DownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
          </>
        ) : (
          <>
            <Button size="small" variant="outlined" startIcon={<ContentCopyOutlinedIcon fontSize="small" />} disabled={ocupado} onClick={copiar}>
              Copiar el prompt
            </Button>
            {!soloCopiar && (
              <Button size="small" color="inherit" startIcon={<DownloadOutlinedIcon fontSize="small" />} disabled={ocupado} onClick={bajar} sx={{ color: 'text.secondary' }}>
                Descargar .md
              </Button>
            )}
          </>
        )}
      </Box>
      <AvisoPromptSnackbar aviso={aviso} alCerrar={() => setAviso(null)} />
    </>
  )
}

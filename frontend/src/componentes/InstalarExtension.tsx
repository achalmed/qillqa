// Instalar la extensión de Qillqa (2026-10-08, Edison: «pedir al usuario que instale la extensión
// cuando comienza a usar Mesa de Partes… una vez instalada, dejar de salir esa notificación»).
// Reconoce el navegador (Chrome/Edge o Zen/Firefox) y ofrece primero su descarga, con los pasos.
// Sin la extensión, el panel de apoyo no puede aparecer DENTRO de la página de la mesa.
import { useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from '@mui/material'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined'
import PictureInPictureAltOutlinedIcon from '@mui/icons-material/PictureInPictureAltOutlined'
import { descargarDirecto } from '../api'
import { extensionInstalada } from '../mesaExtension'
import { PALETA } from '../paleta'

const esFirefox = () => /firefox|zen/i.test(navigator.userAgent)

const PASOS = {
  chrome: [
    'Descomprima el archivo descargado en una carpeta que no vaya a borrar.',
    'Abra chrome://extensions (en Edge, edge://extensions) y active «Modo de desarrollador».',
    'Pulse «Cargar descomprimida» y elija la carpeta sgdp-mesa-de-partes.',
    'Vuelva aquí y pulse «Ya la instalé».',
  ],
  firefox: [
    'Abra about:config y ponga xpinstall.signatures.required en false.',
    'Abra about:addons, pulse ⚙ → «Instalar complemento desde archivo» y elija el archivo descargado.',
    'En los permisos de la extensión, permita el acceso a todos los sitios.',
    'Vuelva aquí y pulse «Ya la instalé». (Si el paso 1 no existe: about:debugging → «Cargar complemento temporal».)',
  ],
}

/** Botón de descarga para este navegador, el enlace para el otro y los pasos. */
export function InstalarExtension({ alError }: { alError?: (texto: string) => void }) {
  const [otro, setOtro] = useState(false)
  const ff = esFirefox() !== otro
  // Directo a Descargas (2026-10-18): la cascada de carpetas de los PDF fallaba con el mensaje crudo del
  // navegador si la carpeta recordada ya no existía, y Chrome descomprime el zip desde Descargas.
  const descargar = () =>
    void descargarDirecto(
      ff ? '/api/mesa/extension.zip?navegador=firefox' : '/api/mesa/extension.zip',
      ff ? 'sgdp-mesa-de-partes.xpi' : 'sgdp-mesa-de-partes.zip',
    ).catch((e) => alError?.(e instanceof Error ? e.message : 'No se pudo descargar.'))
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<DownloadOutlinedIcon />} onClick={descargar}>
          Descargar para {ff ? 'Zen o Firefox' : 'Chrome o Edge'}
        </Button>
        <Link component="button" type="button" variant="body2" onClick={() => setOtro((v) => !v)}>
          ¿Usa {ff ? 'Chrome o Edge' : 'Zen o Firefox'}?
        </Link>
      </Box>
      <Box component="ol" sx={{ pl: 2.5, mt: 1.5, mb: 0, color: PALETA.textoSecundario, fontSize: 14, '& li': { mb: 0.5 } }}>
        {(ff ? PASOS.firefox : PASOS.chrome).map((p) => <li key={p}>{p}</li>)}
      </Box>
    </Box>
  )
}

/** Aviso que aparece al abrir una mesa de partes sin la extensión. «Usar la ventana de apoyo»
 *  abre la ventana flotante como respaldo (el clic permite abrirla). */
export function DialogoInstalarExtension({ abierto, alCerrar, alUsarVentana }: { abierto: boolean; alCerrar: () => void; alUsarVentana?: () => void }) {
  const [error, setError] = useState('')
  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ExtensionOutlinedIcon color="primary" /> Instale la extensión de Qillqa (una sola vez)
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>
          Con ella, al abrir una mesa de partes, los datos del documento y el usuario y la contraseña de esa mesa
          aparecen <b>dentro de la página de la mesa</b>, listos para autocompletar o copiar con un clic.
        </Typography>
        <InstalarExtension alError={setError} />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {alUsarVentana && (
          <Button startIcon={<PictureInPictureAltOutlinedIcon />} onClick={() => { alUsarVentana(); alCerrar() }}>
            Por ahora, usar la ventana de apoyo
          </Button>
        )}
        <Button onClick={() => (extensionInstalada() ? alCerrar() : window.location.reload())}>Ya la instalé</Button>
        <Button onClick={alCerrar}>Ahora no</Button>
      </DialogActions>
    </Dialog>
  )
}

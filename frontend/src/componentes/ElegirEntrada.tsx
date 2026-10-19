/**
 * ENTRADA DOBLE en cada «Nuevo» (2026-10-12, fase 9.5; rediseño del mismo día, Edison: «que sea más amigable;
 * ellos no tienen skill, solo usan prompts para pegar en el chat de alguna IA»). Al pulsar el botón principal
 * de un módulo se elige cómo empezar, con dos tarjetas grandes:
 *   - «Llenar el formulario»: la persona escribe;
 *   - «Con ayuda de la IA»: pega la respuesta de ChatGPT, Gemini, Claude u otra y el formulario se llena solo
 *     (el flujo de pegado que ya tiene el módulo).
 * Para quien aún no tiene la respuesta, los tres pasos y el prompt mismo: copiarlo o bajarlo como `.md`
 * (desde el 2026-10-18, en el segundo paso); si no está en esta máquina se muestra su ruta en el vault. En
 * escritorio es un panel anclado al botón; en el celular, una hoja inferior con tarjetas altas para el pulgar.
 *
 * 2026-10-18 (Edison: «más agradable, bonita y fácil de entender, en lo visual y en lo que informa»): un
 * subtítulo que tranquiliza («después puede corregir todo»), cada opción con lo que hace en una línea y una
 * flecha, la de la IA marcada «más rápido», y los tres pasos numerados. Mismas props: no rompe a ningún módulo.
 *
 * 2026-10-18, segunda vuelta (Edison: «los tres pasos y copiar o descargar, SOLO al elegir la IA»): dos pasos
 * en la misma ventana. Primero se elige: «Uno por uno» (o el rótulo del módulo) va directo al formulario
 * (`alManual`); «Con ayuda de la IA» abre el segundo paso —los tres pasos con «Copiar el prompt» y «Descargar
 * .md», y al final «Pegar la respuesta», que llama a `alPrompt`—, con «Volver». Mismas props.
 */
import { useEffect, useState } from 'react'
import Popover from '@mui/material/Popover'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined'
import IconButton from '@mui/material/IconButton'
import { PALETA } from '../paleta'
import { AvisoPromptSnackbar, useConPrompt } from './BotonesPrompt'

export interface PropsElegirEntrada {
  /** El botón que lo abrió; `null` lo cierra. */
  ancla: HTMLElement | null
  alCerrar: () => void
  /** Formato del módulo (`agenda-actividades`, `documento-administrativo`…): fija el prompt. */
  tipo: string
  alManual: () => void
  alPrompt: () => void
  /** Gestión documental (2026-10-19): la segunda modalidad, «Formato Word»; sin esto no se ofrece. */
  alWord?: () => void
  etiquetaManual?: string
  etiquetaPrompt?: string
  /** Una línea bajo cada opción (opcional; hay una por omisión). */
  ayudaManual?: string
  ayudaPrompt?: string
}

export default function ElegirEntrada({
  ancla, alCerrar, tipo, alManual, alPrompt, alWord,
  etiquetaManual = 'Llenar el formulario',
  etiquetaPrompt = 'Con ayuda de la IA',
  ayudaManual = 'Usted escribe cada dato en el formulario.',
  ayudaPrompt = 'Pegue la respuesta de su IA y el formulario se llena solo.',
}: PropsElegirEntrada) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  // Copiar o descargar el prompt: la misma lógica que el seguimiento y los demás módulos (BotonesPrompt).
  const { aviso, setAviso, ocupado, conPrompt } = useConPrompt(tipo)
  const [pasoActual, setPaso] = useState<'elegir' | 'ia'>('elegir')
  // Cada vez que se abre, empieza por elegir.
  useEffect(() => { if (!ancla) setPaso('elegir') }, [ancla])

  const elegir = (f: () => void) => () => { alCerrar(); f() }

  // Una opción: ícono en círculo, título, lo que hace en UNA línea y, a la derecha, la flecha (2026-10-18,
  // Edison: «más agradable, bonita y fácil de entender»). La recomendada lleva su etiqueta.
  const tarjeta = (titulo: string, ayuda: string, icono: React.ReactNode, alPulsar: () => void, destacada: boolean) => (
    <ButtonBase
      onClick={alPulsar}
      focusRipple
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', textAlign: 'left', borderRadius: 2.5,
        px: 1.75, py: celular ? 1.75 : 1.5, border: '1px solid',
        borderColor: destacada ? 'primary.main' : 'divider',
        bgcolor: destacada ? PALETA.guindaSuave : 'background.paper',
        transition: 'border-color .15s, box-shadow .15s, transform .15s',
        '&:hover': { borderColor: 'primary.main', boxShadow: PALETA.sombra },
        '&:active': { transform: 'scale(.99)' },
      }}
    >
      <Box sx={{
        width: 44, height: 44, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
        bgcolor: destacada ? 'primary.main' : PALETA.superficieMedia, color: destacada ? 'primary.contrastText' : 'primary.main',
      }}>
        {icono}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 650, fontSize: celular ? 16 : 15, lineHeight: 1.3 }}>{titulo}</Typography>
          {destacada && (
            <Box component="span" sx={{ fontSize: 11, fontWeight: 600, px: 0.75, py: 0.1, borderRadius: 1, color: PALETA.dorado, border: '1px solid', borderColor: PALETA.doradoLinea, lineHeight: 1.5 }}>
              más rápido
            </Box>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35, mt: 0.25 }}>{ayuda}</Typography>
      </Box>
      <ChevronRightIcon sx={{ color: 'text.disabled', flex: '0 0 auto' }} />
    </ButtonBase>
  )

  const paso = (n: number, texto: string, accion?: React.ReactNode) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
      <Box sx={{ width: 22, height: 22, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
        bgcolor: 'primary.main', color: 'primary.contrastText', mt: 0.1 }}>{n}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ lineHeight: 1.4 }}>{texto}</Typography>
        {accion && <Box sx={{ display: 'flex', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>{accion}</Box>}
      </Box>
    </Box>
  )

  // Primer paso: elegir. «Con ayuda de la IA» NO cierra: abre el segundo paso en la misma ventana.
  const elegirComo = (
    <>
      <Box sx={{ mb: 0.25 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>¿Cómo quiere empezar?</Typography>
        <Typography variant="body2" color="text.secondary">Elija una; después puede corregir todo.</Typography>
      </Box>
      {tarjeta(etiquetaPrompt, ayudaPrompt, <AutoAwesomeOutlinedIcon />, () => setPaso('ia'), true)}
      {tarjeta(alWord ? 'Formato formulario' : etiquetaManual, ayudaManual, <EditOutlinedIcon />, elegir(alManual), false)}
      {alWord && tarjeta('Formato Word', 'Redacte varios oficios en un mismo espacio, como en Word.', <DescriptionOutlinedIcon />, elegir(alWord), false)}
    </>
  )

  // Segundo paso (2026-10-18, Edison: «los tres pasos y copiar o descargar, solo al elegir la IA»): los tres
  // pasos con su acción, y al final el botón que abre el pegado del módulo (`alPrompt`).
  const conIa = (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, ml: -0.75 }}>
        <IconButton size="small" aria-label="Volver" onClick={() => setPaso('elegir')}><ArrowBackIcon fontSize="small" /></IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>{etiquetaPrompt}</Typography>
          <Typography variant="body2" color="text.secondary">{ayudaPrompt}</Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, p: 1.5, borderRadius: 2, bgcolor: PALETA.superficieTenue, border: '1px solid', borderColor: 'divider' }}>
        {paso(1, 'Copie el prompt (o descárguelo).', (
          <>
            <Button size="small" variant="outlined" startIcon={<ContentCopyOutlinedIcon fontSize="small" />} disabled={ocupado} onClick={() => void conPrompt('copiar')}>
              Copiar el prompt
            </Button>
            <Button size="small" color="inherit" startIcon={<DownloadOutlinedIcon fontSize="small" />} disabled={ocupado} onClick={() => void conPrompt('bajar')} sx={{ color: 'text.secondary' }}>
              Descargar .md
            </Button>
          </>
        ))}
        {paso(2, 'Péguelo en su IA (ChatGPT, Gemini, Claude…) con sus datos o fotos.')}
        {paso(3, 'Copie lo que responda y péguelo aquí.')}
      </Box>
      <Button variant="contained" size="large" startIcon={<ContentPasteOutlinedIcon />} onClick={elegir(alPrompt)} sx={{ mt: 0.25 }}>
        Pegar la respuesta
      </Button>
    </>
  )

  const contenido = (
    <Box sx={{ p: 2, pt: celular ? 1 : 2, display: 'flex', flexDirection: 'column', gap: 1.25, width: celular ? 'auto' : 400 }}>
      {pasoActual === 'ia' ? conIa : elegirComo}
    </Box>
  )

  const abierto = Boolean(ancla)
  const avisoEl = <AvisoPromptSnackbar aviso={aviso} alCerrar={() => setAviso(null)} />

  if (celular)
    return (
      <>
        <Drawer anchor="bottom" open={abierto} onClose={alCerrar} PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' } }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }} />
          {contenido}
        </Drawer>
        {avisoEl}
      </>
    )

  return (
    <>
      <Popover
        open={abierto}
        anchorEl={ancla}
        onClose={alCerrar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.75, borderRadius: 2 } } }}
      >
        {contenido}
      </Popover>
      {avisoEl}
    </>
  )
}

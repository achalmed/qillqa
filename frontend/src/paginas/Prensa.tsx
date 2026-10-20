/**
 * PRENSA — el estudio de Identidad Visual dentro del sistema (2026-10-06).
 *
 * La página no se programa aquí: los editores de piezas (`editor.html`, tipo
 * Canva), fotos (`foto.html`, tipo Photoshop sobre miniPaint), video
 * (`video.html`, línea de tiempo multipista) y formatos y marcos (`media.html`)
 * son del repo identidad-visual y corren en su
 * propio servidor. La API los publica bajo /estudio/ (backend/app/api/prensa.py)
 * y aquí solo se muestran dentro del marco del sistema, como el Observatorio.
 *
 * El marco no puede mandar el token de la web: antes de abrirlo se pide la
 * sesión del estudio (`POST /api/prensa/sesion`), una cookie de vida corta solo
 * para /estudio/, que se renueva mientras la página siga abierta.
 *
 * Opciones del módulo (navegacion.ts):
 *   /prensa?ver=piezas                   → PIEZAS registradas (componentes/prensa/Piezas.tsx; fase 9.4), sin el estudio
 *   /prensa                              → estudio: editor de piezas (plantillas)
 *   /prensa?vista=foto[&imagen=<url>]    → editor de fotos («Usar en Prensa» de la Fototeca)
 *   /prensa?vista=video                  → editor de video
 *   /prensa?vista=media[&imagen=<url>]   → formatos y marcos rápidos
 *
 * Las fotos del estudio son las de la Fototeca (la única biblioteca) y lo que se
 * exporta vuelve a ella, al álbum «Piezas de prensa».
 */
import { useEffect, useState } from 'react'
import { PALETA } from '../paleta'
import { useSearchParams } from 'react-router'
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import Marco from '../componentes/Marco'
import Piezas from '../componentes/prensa/Piezas'
import { api } from '../api'

interface Sesion {
  ok: boolean
  estudio: boolean
  vence: string
  banco: boolean
}

type Estado = { tipo: 'cargando' } | { tipo: 'listo'; banco: boolean } | { tipo: 'apagado' } | { tipo: 'error'; texto: string }

/** Cada cuánto se renueva la cookie del estudio (vive 2 horas). */
const RENOVAR_MS = 30 * 60 * 1000

export default function Prensa() {
  const [consulta] = useSearchParams()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)
  // La pestaña «Piezas» es del sistema (sin iframe): no pide sesión al estudio.
  const piezas = consulta.get('ver') === 'piezas'

  useEffect(() => {
    if (piezas) return
    let vivo = true
    const abrir = () =>
      api<Sesion>('/api/prensa/sesion', { method: 'POST' })
        .then((s) => vivo && setEstado(s.estudio ? { tipo: 'listo', banco: s.banco } : { tipo: 'apagado' }))
        .catch((e) => vivo && setEstado({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo abrir el estudio.' }))
    void abrir()
    // Renovar sin tocar el estado: el marco sigue tal cual (no se recarga).
    const reloj = window.setInterval(() => {
      api<Sesion>('/api/prensa/sesion', { method: 'POST' }).catch(() => {})
    }, RENOVAR_MS)
    return () => {
      vivo = false
      window.clearInterval(reloj)
    }
  }, [intento, piezas])

  const PAGINAS: Record<string, string> = { foto: 'foto.html', video: 'video.html', media: 'media.html' }
  const vista = consulta.get('vista') ?? ''
  const imagen = consulta.get('imagen')
  const pagina = PAGINAS[vista] ?? 'editor.html'
  const src = `/estudio/${pagina}${imagen && vista !== 'video' ? `?imagen=${encodeURIComponent(imagen)}` : ''}`

  if (piezas)
    return (
      <Marco modulo="prensa" fondo={PALETA.fondo}>
        <Piezas />
      </Marco>
    )

  return (
    // El estudio ocupa todo el alto: el botón del módulo flota encima, sin franja vacía debajo.
    <Marco modulo="prensa" sinReservaFlotante>
      {estado.tipo === 'cargando' && (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {(estado.tipo === 'apagado' || estado.tipo === 'error') && (
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720 }}>
          <Alert
            severity={estado.tipo === 'apagado' ? 'warning' : 'error'}
            action={<Button color="inherit" size="small" onClick={() => { setEstado({ tipo: 'cargando' }); setIntento((n) => n + 1) }}>Reintentar</Button>}
          >
            {estado.tipo === 'apagado' ? (
              <>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>El estudio de Prensa no está encendido.</Typography>
                Lo enciende <code>./iniciar.sh</code> si el <code>.env</code> tiene <code>IDENTIDAD_PERFIL</code>. Las fotos siguen en la Mediateca.
              </>
            ) : (
              estado.texto
            )}
          </Alert>
        </Box>
      )}
      {estado.tipo === 'listo' && (
        <>
          {!estado.banco && (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              Las fotos de la Fototeca no llegan al estudio: falta su banco (<code>IDENTIDAD_PERFIL</code> o <code>ESTUDIO_BANCO</code>).
            </Alert>
          )}
          <Box
            component="iframe"
            key={src}
            title={`Estudio de Prensa: ${({ foto: 'fotos', video: 'video', media: 'formatos y marcos' } as Record<string, string>)[vista] ?? 'piezas'}`}
            src={src}
            sx={{ flex: 1, width: '100%', border: 0, display: 'block', bgcolor: 'background.default' }}
          />
        </>
      )}
    </Marco>
  )
}

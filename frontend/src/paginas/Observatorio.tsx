/**
 * OBSERVATORIO DE DATOS — el mismo observatorio de la web, con la identidad del
 * despacho (Edison 2026-10-01: «no creemos dos observatorios diferentes»).
 *
 * La página no se programa aquí: la construye datafw (`tools/plataforma.py`,
 * el núcleo con sus vistas, datos y gráficos) con el tema que genera
 * `scripts/observatorio.py` desde los tokens de Identidad Visual, y se sirve
 * como archivo estático en /obs/. Aquí solo se muestra dentro del marco del
 * sistema, sin otra ventana. `estado.json` dice si existe y de cuándo es; si
 * falta, el servidor devuelve la aplicación en su lugar y el JSON no se lee.
 *
 * UNA SOLA NAVEGACIÓN (Edison 2026-10-06: «revisar la barra superior… para que
 * se integre visualmente con el resto del sistema»). Dentro del sistema el
 * tema oculta la barra propia del observatorio, y sus vistas son las opciones
 * del módulo (navegacion.ts). La dirección y el enlace interno del marco se
 * corresponden en los dos sentidos:
 *
 *   /observatorio                          ⇄  #panorama
 *   /observatorio?vista=catalogo           ⇄  #catalogo   (también comparar, fuentes, metodo)
 *   /observatorio?vista=catalogo&ir=tema-x ⇄  #tema-x     (un tema del catálogo)
 *   /observatorio?vista=catalogo&ir=ind-x  ⇄  #ind-x      (la ficha de un indicador)
 *
 * Una opción pulsada en la franja cambia la consulta y aquí se lleva al marco
 * sin recargarlo (`location.replace` del enlace: no suma otra entrada al
 * historial). Lo que se navega DENTRO del marco (un tema, una ficha, «volver»)
 * vuelve a la dirección con `replace`: el marco ya sumó su entrada, y «Atrás»
 * del navegador lo recorre. El enlace antiguo /observatorio#comparar sigue
 * sirviendo: se traduce a la consulta al cargar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Box, CircularProgress, Typography } from '@mui/material'
import Marco from '../componentes/Marco'

interface Estado {
  generado: string
}

/** Las vistas que son opción del módulo; la ficha y el tema cuelgan del catálogo. */
const VISTAS = ['catalogo', 'comparar', 'fuentes', 'metodo'] as const

/** Enlace interno del marco (sin «#») → la consulta de la dirección. */
function consultaDe(enlace: string): string {
  const q = new URLSearchParams()
  if (enlace.startsWith('ind-') || enlace.startsWith('tema-')) {
    q.set('vista', 'catalogo')
    q.set('ir', enlace)
  } else if ((VISTAS as readonly string[]).includes(enlace)) {
    q.set('vista', enlace)
  }
  return q.toString()
}

/** La consulta de la dirección → el enlace interno del marco. */
function enlaceDe(consulta: URLSearchParams): string {
  const ir = consulta.get('ir')
  if (ir && (ir.startsWith('ind-') || ir.startsWith('tema-'))) return ir
  const vista = consulta.get('vista') ?? ''
  return (VISTAS as readonly string[]).includes(vista) ? vista : 'panorama'
}

/** «#panorama» y la página sin enlace son lo mismo para el marco. */
const normal = (enlace: string) => (enlace === '' ? 'panorama' : enlace)

/** Lleva el marco a un enlace sin recargarlo ni sumar otra entrada al historial. */
function llevar(w: Window, enlace: string) {
  if (normal(w.location.hash.replace(/^#/, '')) !== enlace) {
    w.location.replace(`${w.location.pathname}${w.location.search}#${enlace}`)
  }
}

export default function Observatorio() {
  const [estado, setEstado] = useState<Estado | null | undefined>(undefined)
  const [consulta] = useSearchParams()
  const { hash } = useLocation()
  const navegar = useNavigate()
  const marco = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetch('/obs/estado.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((e: Estado | null) => setEstado(e && e.generado ? e : null))
      .catch(() => setEstado(null))
  }, [])

  // El enlace con que se abre el marco se fija UNA vez: si `src` cambiara con
  // cada vista, el navegador volvería a cargar la página entera (pesa).
  // Un enlace antiguo (/observatorio#comparar) manda sobre la consulta.
  const inicial = useRef(hash.length > 1 ? hash.slice(1) : enlaceDe(consulta))
  const src = useMemo(
    () => (estado ? `/obs/plataforma.html?v=${encodeURIComponent(estado.generado)}#${inicial.current}` : ''),
    [estado],
  )

  /** La ventana del marco, solo si ya es el observatorio (no el about:blank inicial). */
  const ventana = useCallback((): Window | null => {
    const w = marco.current?.contentWindow
    try {
      return w && w.location.pathname.startsWith('/obs/') ? w : null
    } catch {
      return null // otro origen (no debería pasar): no se toca
    }
  }, [])

  // Del marco a la dirección: lo que se navegó dentro se refleja en la consulta.
  const reflejar = useCallback(() => {
    const w = ventana()
    if (!w) return
    const nueva = consultaDe(w.location.hash.replace(/^#/, ''))
    const actual = new URLSearchParams(window.location.search).toString()
    if (nueva !== actual || window.location.hash) {
      navegar({ pathname: '/observatorio', search: nueva ? `?${nueva}` : '' }, { replace: true })
    }
  }, [navegar, ventana])

  const alCargar = useCallback(() => {
    const w = ventana()
    if (!w) return
    w.addEventListener('hashchange', reflejar)
    // Si mientras cargaba se pulsó otra opción, manda la dirección; si se
    // entró por un enlace antiguo (#comparar), el marco la corrige a ella.
    if (window.location.hash) reflejar()
    else llevar(w, enlaceDe(new URLSearchParams(window.location.search)))
  }, [reflejar, ventana])

  // De la dirección al marco: una opción pulsada o «Atrás» del navegador.
  useEffect(() => {
    const w = ventana()
    if (w) llevar(w, enlaceDe(consulta))
  }, [consulta, ventana])

  // Sin título propio: la fecha y las cifras ya las dice el panorama, y en el
  // celular un título largo desplaza el nombre del módulo.
  return (
    <Marco modulo="observatorio">
      {estado === undefined && (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {estado === null && (
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720 }}>
          <Alert severity="info">
            <Typography sx={{ fontWeight: 600, mb: 0.5 }}>El observatorio aún no está disponible en este sistema.</Typography>
            Se genera desde los estudios publicados con <code>python3 scripts/observatorio.py --aplicar</code> y
            se publica con la web.
          </Alert>
        </Box>
      )}
      {estado && (
        <Box
          component="iframe"
          ref={marco}
          onLoad={alCargar}
          title="Observatorio de datos del Perú"
          src={src}
          sx={{ flex: 1, width: '100%', border: 0, display: 'block', bgcolor: 'background.default' }}
        />
      )}
    </Marco>
  )
}

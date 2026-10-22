/**
 * PRENSA — las piezas de prensa y los editores del estudio dentro del sistema (2026-10-06; editores E0–E4a, 2026-10-20).
 *
 * La página no programa los editores: son módulos, cada uno con su API, su sesión (una cookie de vida corta solo para
 * su carpeta: el marco no puede mandar el token de la web) y su pantalla, que llega por su manifiesto y se pinta en el
 * marco de Prensa:
 *   · el editor de piezas, Awana (`editor.html`, tipo Canva; /api/piezas/editor/, `AWANA.cargar`);
 *   · el editor de fotos, Tullpu (`foto.html` sobre miniPaint y el revelado de `media.html`; /api/fotos/, `TULLPU.cargar`);
 *   · el editor de videos, Kuyuy (`video.html`, línea de tiempo multipista; /api/videos/, `KUYUY.cargar`), que también
 *     recorta los videos de `media.html`.
 *
 * Opciones del módulo (navegacion.ts):
 *   /prensa?ver=piezas                   → PIEZAS registradas (del editor de piezas, Awana: su pantalla del registro)
 *   /prensa                              → editor de piezas (plantillas)
 *   /prensa?pieza=N                      → el editor para la pieza N: lo que se exporte se le vincula en la Mediateca
 *   /prensa?vista=foto[&imagen=<url>]    → editor de fotos («Usar en Prensa» de la Mediateca)
 *   /prensa?vista=video                  → editor de video
 *   /prensa?vista=media[&imagen=<url>]   → formatos y marcos rápidos
 *
 * Las fotos de los editores son las de la Mediateca (la única biblioteca) y lo que se exporta vuelve a ella.
 */
import { Suspense, useEffect } from 'react'
import { PALETA } from '../paleta'
import { useSearchParams } from 'react-router'
import { Box, CircularProgress } from '@mui/material'
import Marco from '../componentes/Marco'
import { api } from '../api'
import { cargarPagina } from '../arranque'
import { AWANA, REGISTRO } from '@qillqa/awana/modulo'
import { TULLPU } from '@qillqa/tullpu/modulo'
import { KUYUY } from '@qillqa/kuyuy/modulo'

// Los editores, por su manifiesto: su pantalla, sin su marco (va en el de Prensa).
const EditorPiezas = cargarPagina(AWANA.cargar)
const EditorFotos = cargarPagina(TULLPU.cargar)
const EditorVideos = cargarPagina(KUYUY.cargar)
// El registro de las piezas de prensa: otra pantalla del editor de piezas (Awana E4b), por su manifiesto.
const RegistroPiezas = cargarPagina(AWANA.pantallas!.find((p) => p.ruta === REGISTRO)!.cargar)
// Las sesiones de los editores: la del que se muestra la abre su pantalla; las otras, Prensa, porque sus páginas se
// enlazan entre sí («Publicaciones», «Editor de video»). Abrir una limpia la caché de Prensa en la Mediateca.
const SESIONES = { piezas: '/api/piezas/editor/sesion', fotos: '/api/fotos/sesion', videos: '/api/videos/sesion' } as const
type Editor = keyof typeof SESIONES

/** Cada cuánto se renuevan las cookies de los editores (viven 2 horas). */
const RENOVAR_MS = 30 * 60 * 1000

export default function Prensa() {
  const [consulta, setConsulta] = useSearchParams()
  // La pestaña «Piezas» es del sistema (sin marco): no pide sesión a ningún editor.
  const piezas = consulta.get('ver') === 'piezas'
  // Con ?pieza=N lo que se exporte queda vinculado a esa pieza de prensa (2026-10-20; viaja en la cookie).
  const pieza = Number(consulta.get('pieza')) || 0
  const vista = consulta.get('vista') ?? ''
  const mostrado: Editor = vista === 'foto' || vista === 'media' ? 'fotos' : vista === 'video' ? 'videos' : 'piezas'

  useEffect(() => {
    if (piezas) return
    const pedido = { method: 'POST', body: JSON.stringify(pieza ? { pieza } : {}) }
    const otras = (Object.keys(SESIONES) as Editor[]).filter((k) => k !== mostrado)
    const abrir = () => { for (const k of otras) api(SESIONES[k], pedido).catch(() => {}) }
    abrir()
    const reloj = window.setInterval(abrir, RENOVAR_MS)
    return () => window.clearInterval(reloj)
  }, [piezas, pieza, mostrado])

  const quitarPieza = () => { const c = new URLSearchParams(consulta); c.delete('pieza'); setConsulta(c) }
  // «Usar en Prensa» de la Mediateca da la foto ya en el banco del editor de fotos (/api/fotos/banco/…).
  const imagen = consulta.get('imagen')

  if (piezas)
    return (
      <Marco modulo="prensa" fondo={PALETA.fondo}>
        <Suspense fallback={<Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>}>
          <RegistroPiezas sinMarco rutaEditor={(id: number) => `/prensa?pieza=${id}`} />
        </Suspense>
      </Marco>
    )

  return (
    // El editor ocupa todo el alto: el botón del módulo flota encima, sin franja vacía debajo.
    <Marco modulo="prensa" sinReservaFlotante>
      <Suspense fallback={<Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>}>
        {mostrado === 'fotos' && (
          <EditorFotos sinMarco vista={vista === 'media' ? 'media' : 'foto'} pieza={pieza} imagen={imagen}
            video="/api/videos/" alCerrarPieza={quitarPieza} />
        )}
        {mostrado === 'videos' && <EditorVideos sinMarco pieza={pieza} alCerrarPieza={quitarPieza} />}
        {mostrado === 'piezas' && <EditorPiezas sinMarco pieza={pieza} alCerrarPieza={quitarPieza} />}
      </Suspense>
    </Marco>
  )
}

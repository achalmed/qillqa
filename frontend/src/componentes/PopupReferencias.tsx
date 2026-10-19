/**
 * PopupReferencias — la lista del autocompletado de referencias (2026-10-06).
 *
 * La abre la extensión AutocompletarReferencias cuando se escribe «Ley », «D.S.»,
 * «Oficio», «Informe», «PL»… o «@». Pide `GET /api/referencias/buscar` y muestra
 * los resultados en grupos (normas, documentos, proyectos, semanas, pedidos, personas,
 * instituciones, biblioteca). Se elige con clic, Enter o Tab; Escape la cierra. Elegir
 * inserta el nodo `referencia` (se imprime como su texto) y, al guardar, el servidor lo
 * vuelve relación: nadie registra la cita dos veces.
 *
 * `usePopupReferencias` sirve también a un área de texto plano (AreaMarkdown): recibe el
 * estado y la acción de elegir, sin TipTap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { api } from '../api'
import type { ControlReferencias, EstadoConsulta } from '../extensiones/AutocompletarReferencias'
import {
  agrupar,
  referenciasDe,
  EVENTO_REFERENCIAS,
  EVENTO_RELACIONES,
  type DetalleReferencias,
  type ResultadoReferencia,
} from '../extensiones/consultaReferencias'

const ANCHO = 400

/** Busca con una pausa breve (se escribe rápido) y descarta respuestas viejas. */
function useBusqueda(consulta: string | null, contexto: string) {
  const [resultados, setResultados] = useState<ResultadoReferencia[]>([])
  const [cargando, setCargando] = useState(false)
  useEffect(() => {
    if (consulta === null) {
      setResultados([])
      return
    }
    let vigente = true
    setCargando(true)
    const t = window.setTimeout(() => {
      api<ResultadoReferencia[]>(`/api/referencias/buscar?q=${encodeURIComponent(consulta)}&contexto=${encodeURIComponent(contexto)}`)
        .then((r) => vigente && setResultados(r))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setCargando(false))
    }, 250)
    return () => {
      vigente = false
      window.clearTimeout(t)
    }
  }, [consulta, contexto])
  return { resultados, cargando }
}

/** La lista flotante (común al editor y al área de texto). */
export function ListaReferencias({
  estado,
  resultados,
  cargando,
  indice,
  alElegir,
  alApuntar,
}: {
  estado: { izquierda: number; abajo: number; consulta: string }
  resultados: ResultadoReferencia[]
  cargando: boolean
  indice: number
  alElegir: (r: ResultadoReferencia) => void
  alApuntar: (i: number) => void
}) {
  const lista = useRef<HTMLDivElement>(null)
  useEffect(() => {
    lista.current?.querySelector(`[data-i="${indice}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [indice])
  const grupos = useMemo(() => agrupar(resultados), [resultados])
  if (!resultados.length && !(cargando && estado.consulta.startsWith('@'))) return null
  const izquierda = Math.max(8, Math.min(estado.izquierda, window.innerWidth - ANCHO - 8))
  // Debajo de la línea; si no cabe, encima.
  const abajo = estado.abajo + 4
  const alto = Math.min(340, window.innerHeight - 16)
  const arriba = abajo + alto > window.innerHeight ? Math.max(8, estado.abajo - alto - 28) : abajo
  return (
    <Paper
      ref={lista}
      elevation={8}
      role="listbox"
      aria-label="Referencias"
      onMouseDown={(e) => e.preventDefault()}
      sx={{ position: 'fixed', left: izquierda, top: arriba, width: ANCHO, maxWidth: 'calc(100vw - 16px)', maxHeight: alto, overflowY: 'auto', zIndex: 1600, py: 0.5 }}
    >
      {cargando && !resultados.length && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">Buscando…</Typography>
        </Box>
      )}
      {grupos.map((g) => (
        <Box key={g.grupo}>
          <Typography sx={{ px: 1.5, pt: 0.75, pb: 0.25, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 650, color: 'text.secondary' }}>
            {g.grupo}
          </Typography>
          {g.items.map(({ r, i }) => (
            <Box
              key={`${r.tipo}:${r.id}`}
              data-i={i}
              role="option"
              aria-selected={i === indice}
              onMouseEnter={() => alApuntar(i)}
              onClick={() => alElegir(r)}
              sx={{ px: 1.5, py: 0.6, cursor: 'pointer', bgcolor: i === indice ? 'action.selected' : 'transparent' }}
            >
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }} noWrap>{r.etiqueta}</Typography>
              {r.detalle && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.3 }} noWrap>{r.detalle}</Typography>}
            </Box>
          ))}
        </Box>
      ))}
      <Typography sx={{ px: 1.5, pt: 0.5, fontSize: 10.5, color: 'text.disabled' }}>
        ↑↓ para moverse · Enter o Tab para elegir · Esc para cerrar
      </Typography>
    </Paper>
  )
}

/** Estado común: resultados, elegido y teclado. */
export function usePopupReferencias(
  estado: { consulta: string } | null,
  contexto: string,
  elegir: (r: ResultadoReferencia) => void,
) {
  const { resultados, cargando } = useBusqueda(estado ? estado.consulta : null, contexto)
  const [indice, setIndice] = useState(0)
  useEffect(() => setIndice(0), [resultados])
  const vivo = useRef({ resultados, indice, elegir, abierto: false })
  vivo.current = { resultados, indice, elegir, abierto: estado !== null && resultados.length > 0 }
  /** Contesta una tecla; true si la usó. */
  const teclado = useCallback((e: { key: string; preventDefault?: () => void }) => {
    const v = vivo.current
    if (!v.abierto) return false
    if (e.key === 'ArrowDown') {
      setIndice((i) => (i + 1) % v.resultados.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      setIndice((i) => (i - 1 + v.resultados.length) % v.resultados.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const r = v.resultados[v.indice]
      if (!r) return false
      v.elegir(r)
      return true
    }
    return false
  }, [])
  return { resultados, cargando, indice, setIndice, teclado, abierto: () => vivo.current.abierto }
}

/**
 * La lista para un editor TipTap. `control` es el mismo objeto que se pasó a
 * `AutocompletarReferencias.configure({ control })`.
 */
export default function PopupReferencias({
  editor,
  control,
  contexto,
  alElegir,
}: {
  editor: Editor | null
  control: ControlReferencias
  /** 'documento' | 'parte' | 'informe': ordena los grupos según lo que suele citarse. */
  contexto: string
  alElegir?: (r: ResultadoReferencia) => void
}) {
  const [estado, setEstado] = useState<EstadoConsulta | null>(null)
  const elegir = useCallback(
    (r: ResultadoReferencia) => {
      if (!editor || !estado) return
      editor
        .chain()
        .focus()
        .insertContentAt({ from: estado.desde, to: estado.hasta }, [
          { type: 'referencia', attrs: { tipo: r.tipo, id: r.id, texto: r.texto, nota: r.nota ?? '' } },
          { type: 'text', text: ' ' },
        ])
        .run()
      setEstado(null)
      alElegir?.(r)
    },
    [editor, estado, alElegir],
  )
  const p = usePopupReferencias(estado, contexto, elegir)
  // El plugin llama a estas funciones del MISMO objeto `control`.
  control.alCambiar = setEstado
  control.teclado = p.teclado
  control.abierto = p.abierto
  if (!estado || !editor?.isEditable) return null
  return (
    <ListaReferencias
      estado={estado}
      resultados={p.resultados}
      cargando={p.cargando}
      indice={p.indice}
      alElegir={elegir}
      alApuntar={p.setIndice}
    />
  )
}

/**
 * Avisa al mapa local (misma pestaña) qué referencias tiene el texto en pantalla, aún
 * sin guardar: las nuevas aparecen como relaciones «pendientes» (punteadas) al instante.
 * `clave` distingue los textos de un mismo foco (las partes de un proyecto).
 */
export function useAvisoReferencias(editor: Editor | null, foco: string | null, clave = 'cuerpo') {
  useEffect(() => {
    if (!editor || !foco) return
    let t: number | undefined
    let ultima = ''
    const avisar = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const referencias = referenciasDe(editor.getJSON())
        const firma = JSON.stringify(referencias)
        if (firma === ultima) return
        ultima = firma
        const detalle: DetalleReferencias = { foco, clave, referencias }
        window.dispatchEvent(new CustomEvent(EVENTO_REFERENCIAS, { detail: detalle }))
      }, 1200) // getJSON + stringify del texto entero: con pausa larga, no a cada tecla
    }
    avisar()
    editor.on('update', avisar)
    return () => {
      window.clearTimeout(t)
      editor.off('update', avisar)
    }
  }, [editor, foco, clave])
}

/** Tras guardar: el mapa local de `foco` vuelve a pedir sus relaciones. */
export const avisarRelaciones = (foco: string) =>
  window.dispatchEvent(new CustomEvent(EVENTO_RELACIONES, { detail: { foco } }))

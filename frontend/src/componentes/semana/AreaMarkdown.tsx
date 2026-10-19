/**
 * Texto del informe de la semana con su barra de formato (Edison 2026-10-05:
 * «las herramientas del editor también en la semana de representación»).
 *
 * El generador del informe (marco_documental/generadores/informe-sr,
 * lib/latex.py::md_a_tex) imprime un Markdown mínimo: párrafos (línea en
 * blanco), **negrita**, *cursiva* y listas con «- ». La barra escribe
 * exactamente eso —ni más ni menos de lo que llega al PDF— e inserta como si
 * se tecleara (execCommand), así Ctrl+Z sigue deshaciendo. Lleva el conteo de
 * palabras (las crónicas piden 300 a 500).
 *
 * Citas (2026-10-06): como en el editor de documentos, «Ley …», «Oficio …» o «@…» (y
 * Ctrl+Espacio) abren la lista de referencias; elegir escribe el texto de la cita y la
 * registra como relación de la semana (`POST /api/referencias/texto`). Si después el
 * texto se borra, la relación se quita al guardar la semana.
 */
import { createContext, useContext, useRef, useState } from 'react'
import { api } from '../../api'
import { ListaReferencias, usePopupReferencias } from '../PopupReferencias'
import { detectarConsulta, type ResultadoReferencia } from '../../extensiones/consultaReferencias'

/** De qué semana son los textos (`sr:<id>`): lo pone la página de la semana. */
export const OrigenCitas = createContext<string | null>(null)

/** Posición en pantalla del carácter `pos` de un área de texto (espejo invisible). */
function coordsEn(area: HTMLTextAreaElement, pos: number): { izquierda: number; abajo: number } {
  const estilo = window.getComputedStyle(area)
  const espejo = document.createElement('div')
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'boxSizing', 'width', 'wordSpacing', 'textIndent'] as const) {
    espejo.style[p] = estilo[p]
  }
  Object.assign(espejo.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' })
  espejo.textContent = area.value.slice(0, pos)
  const marca = document.createElement('span')
  marca.textContent = '\u200b'
  espejo.appendChild(marca)
  document.body.appendChild(espejo)
  const r = area.getBoundingClientRect()
  const izquierda = r.left + marca.offsetLeft - area.scrollLeft
  const abajo = r.top + marca.offsetTop + marca.offsetHeight - area.scrollTop
  document.body.removeChild(espejo)
  return { izquierda, abajo }
}
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'

/** Reemplaza la selección como si se tecleara (queda en el historial de deshacer). */
function insertar(area: HTMLTextAreaElement, texto: string, desde: number, hasta: number, seleccion?: [number, number]) {
  area.focus()
  area.setSelectionRange(desde, hasta)
  const hecho = document.execCommand('insertText', false, texto)
  if (!hecho) {
    // Navegadores sin execCommand: se pierde el deshacer de este paso, nada más.
    area.setRangeText(texto, desde, hasta, 'end')
    area.dispatchEvent(new Event('input', { bubbles: true }))
  }
  if (seleccion) area.setSelectionRange(...seleccion)
}

export default function AreaMarkdown({ etiqueta, ayuda, valor, alCambiar, clave = '' }: {
  etiqueta: string
  ayuda?: string
  valor: string
  alCambiar: (v: string) => void
  /** La clave del texto (resumen, conclusiones…): contexto de las citas. */
  clave?: string
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const palabras = valor.split(/\s+/).filter(Boolean).length
  const origen = useContext(OrigenCitas)

  // --- citas ---
  const [consulta, setConsulta] = useState<{ inicio: number; fin: number; consulta: string; izquierda: number; abajo: number } | null>(null)
  const descartada = useRef<number | null>(null)
  const mirar = (forzar = false) => {
    const a = ref.current
    if (!a || a.selectionStart !== a.selectionEnd) {
      setConsulta(null)
      return
    }
    const fin = a.selectionStart
    const linea = a.value.lastIndexOf('\n', fin - 1) + 1
    const antes = a.value.slice(linea, fin)
    let c = detectarConsulta(antes)
    if (!c && forzar) {
      // Ctrl+Espacio: busca la palabra que está antes del cursor.
      const palabra = /[^\s]*$/.exec(antes)?.[0] ?? ''
      c = { inicio: antes.length - palabra.length, consulta: `@${palabra}`, disparador: 'arroba' }
      if (!palabra) c = { inicio: antes.length, consulta: '@', disparador: 'arroba' }
    }
    if (!c || (!forzar && descartada.current === linea + c.inicio)) {
      if (!c) descartada.current = null
      setConsulta(null)
      return
    }
    const inicio = linea + c.inicio
    setConsulta({ inicio, fin, consulta: c.consulta, ...coordsEn(a, inicio) })
  }
  const elegir = (r: ResultadoReferencia) => {
    const a = ref.current
    if (!a || !consulta) return
    insertar(a, `${r.texto} `, consulta.inicio, consulta.fin)
    setConsulta(null)
    if (origen) {
      void api('/api/referencias/texto', {
        method: 'POST',
        body: JSON.stringify({ origen, contexto: clave ? `informe:${clave}` : 'informe', tipo: r.tipo, id: r.id, texto: r.texto, nota: r.nota ?? '' }),
      }).catch(() => {})
    }
  }
  const popup = usePopupReferencias(consulta, 'informe', elegir)

  // Negrita o cursiva: envuelve la selección (o pone las marcas para escribir dentro).
  const marcar = (marca: '**' | '*') => {
    const a = ref.current
    if (!a) return
    const [i, f] = [a.selectionStart, a.selectionEnd]
    const sel = a.value.slice(i, f)
    // Ya marcada: se quita.
    if (sel.startsWith(marca) && sel.endsWith(marca) && sel.length >= marca.length * 2) {
      const limpio = sel.slice(marca.length, sel.length - marca.length)
      insertar(a, limpio, i, f, [i, i + limpio.length])
      return
    }
    insertar(a, `${marca}${sel}${marca}`, i, f, [i + marca.length, i + marca.length + sel.length])
  }

  // Lista: «- » al inicio de cada línea seleccionada (o la quita si ya la tienen).
  const lista = () => {
    const a = ref.current
    if (!a) return
    const inicio = a.value.lastIndexOf('\n', a.selectionStart - 1) + 1
    const finLinea = a.value.indexOf('\n', a.selectionEnd)
    const fin = finLinea === -1 ? a.value.length : finLinea
    const lineas = a.value.slice(inicio, fin).split('\n')
    const todas = lineas.every((l) => l.startsWith('- ') || !l.trim())
    const nuevo = lineas.map((l) => (todas ? l.replace(/^- /, '') : l.trim() ? `- ${l.replace(/^- /, '')}` : l)).join('\n')
    insertar(a, nuevo, inicio, fin, [inicio, inicio + nuevo.length])
  }

  const boton = (t: string, icono: React.ReactNode, accion: () => void) => (
    <Tooltip title={t} disableInteractive>
      <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={accion} sx={{ p: 0.5 }} aria-label={t}>
        {icono}
      </IconButton>
    </Tooltip>
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mb: 0.5 }}>
        {boton('Deshacer (Ctrl+Z)', <UndoIcon fontSize="small" />, () => { ref.current?.focus(); document.execCommand('undo') })}
        {boton('Rehacer (Ctrl+Y)', <RedoIcon fontSize="small" />, () => { ref.current?.focus(); document.execCommand('redo') })}
        {boton('Negrita (sale en negrita en el informe)', <FormatBoldIcon fontSize="small" />, () => marcar('**'))}
        {boton('Cursiva', <FormatItalicIcon fontSize="small" />, () => marcar('*'))}
        {boton('Lista con viñetas (una línea por punto)', <FormatListBulletedIcon fontSize="small" />, lista)}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {palabras.toLocaleString('es-PE')} palabra{palabras === 1 ? '' : 's'}
        </Typography>
      </Box>
      <TextField
        label={etiqueta}
        // 2026-10-06: sin ayuda por defecto (salía bajo ~14 campos); «Textos» la da una vez arriba.
        helperText={ayuda}
        value={valor}
        onChange={(e) => {
          alCambiar(e.target.value)
          window.setTimeout(() => mirar(), 0)
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' && e.ctrlKey) {
            e.preventDefault()
            mirar(true)
            return
          }
          if (!consulta) return
          if (e.key === 'Escape' && popup.abierto()) {
            e.preventDefault()
            e.stopPropagation()
            descartada.current = consulta.inicio
            setConsulta(null)
            return
          }
          if (popup.teclado(e)) e.preventDefault()
        }}
        onBlur={() => setConsulta(null)}
        onClick={() => mirar()}
        inputRef={ref}
        multiline
        minRows={3}
        fullWidth
      />
      {consulta && (
        <ListaReferencias
          estado={consulta}
          resultados={popup.resultados}
          cargando={popup.cargando}
          indice={popup.indice}
          alElegir={elegir}
          alApuntar={popup.setIndice}
        />
      )}
    </Box>
  )
}

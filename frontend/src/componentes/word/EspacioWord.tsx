/**
 * EL ESPACIO del Formato Word (2026-10-19): el armazón que comparten los módulos — el Marco de Qillqa
 * arriba, la BarraWord (título del documento activo, menús «Archivo · Editar · Ver · Insertar · Formato
 * · Herramientas · Ayuda» y la píldora de herramientas, con la forma de Google Docs) pegada arriba de la
 * columna de hojas, el panel de estructura a la izquierda (o en una hoja inferior en el celular) y las
 * hojas. Cada módulo pone sus secciones (`PaginaWord`), su menú «Archivo» y lo que va en el panel bajo
 * la lista (comentarios, historial…). Así Gestión documental y Proyectos de ley se ven y se usan igual.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import Box from '@mui/material/Box'
import Fab from '@mui/material/Fab'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ListAltIcon from '@mui/icons-material/ListAlt'
import Marco from '../Marco'
import HojaInferior from '../HojaInferior'
import PanelEstructura, { type NotaResumen, type SeccionResumen } from './PanelEstructura'
import PopupReferencias from '../PopupReferencias'
import BarraWord, { type DocumentoActivo, type FormatoHoja } from './BarraWord'
import type { ControlReferencias } from '../../extensiones/AutocompletarReferencias'
import { ID_COMENTARIO_NUEVO, type ItemMenu } from './menus'
import { tituloSeccion } from './modelo'
import { PALETA } from '../../paleta'
import type { IdModulo } from '../../navegacion'

export default function EspacioWord({ modulo, titulo, volver, acciones, editorActivo, controlActivo, contextoReferencias = 'documento', secciones, activo, notas, alIr, alNota, alNuevo, rotuloLista, textoNuevo, menuSeccion, alMoverSeccion, panelExtra, tituloBarra, vacio, alAncho, archivo, herramientas, formato, alImprimir, alHistorial, imagen, enlaceCompartir, alAviso, icono, children }: {
  modulo: IdModulo
  titulo: ReactNode
  volver: string
  acciones?: ReactNode
  editorActivo: Editor | null
  /** El control de referencias de la sección activa (autocompletado «Ley…», «@…»). */
  controlActivo?: ControlReferencias | null
  contextoReferencias?: string
  secciones: SeccionResumen[]
  activo: number | null
  notas: NotaResumen[]
  alIr: (id: number) => void
  alNota: (pos: number) => void
  alNuevo?: (ancla: HTMLElement) => void
  /** Rótulo y texto del botón de la lista («Partes», «Añadir parte»); los de los documentos si faltan. */
  rotuloLista?: string
  textoNuevo?: string
  /** Partes editables (2026-10-19): el ⋮ de cada sección y el arrastre para reordenar. */
  menuSeccion?: (s: SeccionResumen) => ItemMenu[]
  alMoverSeccion?: (id: number, destino: number) => void
  /** Lo que el módulo pone bajo la estructura (comentarios, historial…). */
  panelExtra?: ReactNode
  /** Rótulo del estilo «Título» del módulo («Artículo o apartado»); sin él, «Título». */
  tituloBarra?: string
  /** Lo que se muestra cuando no hay secciones. */
  vacio?: ReactNode
  /** El ancho de hoja que cabe (la columna lo mide y lo avisa). */
  alAncho: (px: number) => void
  /** El menú «Archivo» del módulo (nuevo, desde un Word, descargar, quitar…). */
  archivo: ItemMenu[]
  /** Lo que el módulo suma a «Herramientas». */
  herramientas?: ItemMenu[]
  /** Tamaño de letra e interlineado de la sección activa (campos del PDF); sin esto, la plantilla manda. */
  formato?: FormatoHoja | null
  alImprimir?: () => void
  alHistorial?: () => void
  /** El botón de imagen del módulo (fotografía de un proyecto). */
  imagen?: ReactNode
  enlaceCompartir?: string
  alAviso?: (tipo: 'success' | 'error' | 'info', texto: string) => void
  icono?: ReactNode
  children: ReactNode
}) {
  const tema = useTheme()
  const angosta = useMediaQuery(tema.breakpoints.down('md'))
  const [hoja, setHoja] = useState(false)
  // Ver › panel de estructura (escritorio): se recuerda.
  const [estructura, setEstructura] = useState(() => { try { return localStorage.getItem('sgdp_word_estructura') !== 'no' } catch { return true } })
  // Zoom (2026-10-19, como Google Docs): la hoja al 50–200 % de su ancho real; se recuerda.
  const [zoom, setZoom] = useState(() => { try { return Number(localStorage.getItem('sgdp_word_zoom')) || 100 } catch { return 100 } })
  const principal = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = principal.current
    if (!el) return
    const medir = () => alAncho(Math.max(300, Math.min(angosta ? 794 : Math.round(794 * zoom / 100), el.clientWidth - (angosta ? 16 : 48))))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [angosta, alAncho, zoom])
  const alZoom = (z: number) => { setZoom(z); try { localStorage.setItem('sgdp_word_zoom', String(z)) } catch { /* sin almacenamiento */ } }
  const alEstructura = () => {
    if (angosta) { setHoja(true); return }
    setEstructura((v) => { try { localStorage.setItem('sgdp_word_estructura', v ? 'no' : 'si') } catch { /* sin almacenamiento */ } return !v })
  }
  // «Comentario» de la barra: abre el panel (la hoja, en el celular) y pone el cursor en el campo nuevo.
  const alComentar = panelExtra ? () => {
    if (angosta) setHoja(true)
    else if (!estructura) setEstructura(true)
    window.setTimeout(() => document.getElementById(ID_COMENTARIO_NUEVO)?.focus(), angosta ? 350 : 50)
  } : undefined
  const seccion = activo != null ? secciones.find((s) => s.id === activo) : undefined
  const documento: DocumentoActivo | null = seccion
    ? { titulo: seccion.cargando ? 'Cargando…' : tituloSeccion(seccion.campos), rotulo: seccion.rotulo ?? seccion.tipoNombre, estado: seccion.estado, sucio: seccion.sucio, cargando: seccion.cargando }
    : null
  const panel = (
    <>
      <PanelEstructura secciones={secciones} activo={activo} notas={notas} alIr={(id) => { alIr(id); setHoja(false) }} alNota={(p) => { alNota(p); setHoja(false) }} alNuevo={alNuevo ?? (() => {})} sinNuevo={!alNuevo} rotulo={rotuloLista} textoNuevo={textoNuevo} menuDe={menuSeccion} alMover={alMoverSeccion} compacto={angosta} />
      {panelExtra}
    </>
  )
  return (
    <Marco modulo={modulo} titulo={titulo} volver={volver} sinBarraInferior acciones={acciones}>
      <Box sx={{ flex: '1 1 0', minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {!angosta && estructura && <Box sx={{ width: 280, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflowY: 'auto' }}>{panel}</Box>}
        <Box ref={principal} sx={{ flex: 1, minWidth: 0, overflowY: 'auto', bgcolor: PALETA.fondo, position: 'relative' }}>
          <BarraWord
            editor={editorActivo}
            documento={documento}
            icono={icono}
            archivo={archivo}
            herramientas={herramientas}
            formato={formato}
            zoom={zoom}
            alZoom={alZoom}
            angosta={angosta}
            estructuraVisible={estructura}
            alEstructura={alEstructura}
            alImprimir={alImprimir}
            alComentar={alComentar}
            alHistorial={alHistorial}
            imagen={imagen}
            tituloEstilo={tituloBarra}
            enlaceCompartir={enlaceCompartir}
            alAviso={alAviso}
          />
          <Box sx={{ px: { xs: 1, md: 3 }, py: 2 }}>
            {/* Los hijos se pintan SIEMPRE (traen los menús y diálogos del módulo: «Añadir» vive ahí); el
                estado vacío se suma cuando no hay secciones (2026-10-19: sin esto, «Añadir» no abría nada). */}
            {secciones.length === 0 && vacio}
            {children}
          </Box>
          {controlActivo && <PopupReferencias editor={editorActivo} control={controlActivo} contexto={contextoReferencias} />}
          {angosta && (
            <Fab color="primary" size="medium" aria-label="Secciones y notas" onClick={() => setHoja(true)} sx={{ position: 'fixed', right: 16, bottom: 'max(16px, env(safe-area-inset-bottom))', zIndex: 4 }}>
              <ListAltIcon />
            </Fab>
          )}
        </Box>
      </Box>
      {angosta && (
        <HojaInferior abierta={hoja} alCerrar={() => setHoja(false)} titulo="Secciones y notas">
          <Box sx={{ maxHeight: '70dvh', overflowY: 'auto' }}>{panel}</Box>
        </HojaInferior>
      )}
    </Marco>
  )
}

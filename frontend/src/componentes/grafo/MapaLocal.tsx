/**
 * MapaLocal — la ventanita del mapa de relaciones dentro de una página (Edison
 * 2026-10-05: «como la ventanita de Obsidian, para casos específicos»): el
 * elemento al centro y lo que está conectado con él, a 1 salto, con los
 * archivos de sus documentos (firmado, cargos de recepción, adjuntos,
 * expediente). Pasar el cursor muestra una tarjeta con qué es; pulsar un punto
 * lleva a su página o abre su archivo; el clic derecho (o pulsar el del
 * centro) abre el menú de acciones; arrastrar un punto lo deja fijo donde se
 * suelta (doble clic o «Reordenar» lo sueltan); «Ampliar» abre el mapa
 * completo enfocado ahí (/mapa?foco=…).
 *
 * Pide solo la vecindad (`GET /api/grafo?foco=`); el dibujo y la interacción
 * son los del mapa completo (componentes/grafo/estilo.ts e Interaccion.tsx),
 * en el tema claro.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { api } from '../../api'
import { MODO } from '../../paleta'
import {
  LIENZO,
  atraccionAlCentro,
  coloresDe,
  dibujarEtiquetas,
  dibujarNodo,
  fijado,
  soltar,
  zonaNodo,
  idDe,
  type Arista,
  type DatosGrafo,
  type Nodo,
  type TipoNodo,
} from './estilo'
import {
  EVENTO_REFERENCIAS,
  EVENTO_RELACIONES,
  nodoDe,
  type AtributosReferencia,
  type DetalleReferencias,
} from '../../extensiones/consultaReferencias'

// Tipo de punto y rótulo de una cita aún sin guardar, según a qué apunta.
const TIPO_DE: Record<string, TipoNodo> = {
  documento: 'documento', proyecto: 'proyecto', semana: 'semana', pedido: 'pedido',
  persona: 'persona', institucion: 'institucion', norma: 'norma', libro: 'libro', entrada: 'entrada',
}
const SUBTIPO: Record<string, string> = {
  documento: 'Documento', proyecto: 'Proyecto de ley', semana: 'Semana de representación', pedido: 'Pedido',
  persona: 'Persona', institucion: 'Institución', norma: 'Norma', libro: 'Libro (biblioteca)', entrada: 'Documento recibido',
}
import { MenuNodo, TarjetaNodo, focoDe, urlArchivo, useArchivos, useClicNodo, type MenuAbierto } from './Interaccion'

// El mapa local va en el modo de la aplicación (2026-10-19, apariencia oscura).
const L = LIENZO[MODO]
const COLORES = coloresDe(MODO)

export default function MapaLocal({ foco, alto = 220, titulo = 'Relaciones' }: { foco: string; alto?: number; titulo?: string }) {
  const navegar = useNavigate()
  const [datos, setDatos] = useState<DatosGrafo | null>(null)
  const [encima, setEncima] = useState<Nodo | null>(null)
  const [tarjeta, setTarjeta] = useState<{ nodo: Nodo; x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<MenuAbierto>(null)
  const [fijados, setFijados] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(300)
  const grafo = useRef<ForceGraphMethods<NodeObject<Nodo>, LinkObject<Nodo, Arista>>>()
  const ajustado = useRef(false)
  const { ver, descargar, aviso } = useArchivos()

  useEffect(() => {
    setDatos(null)
    setFijados(0)
    setPendientes(new Map())
    ajustado.current = false
    api<DatosGrafo>(`/api/grafo?foco=${encodeURIComponent(foco)}`)
      .then(setDatos)
      .catch(() => setDatos({ nodos: [], aristas: [] }))
  }, [foco])

  // TIEMPO REAL (2026-10-06): al guardar, la página avisa (EVENTO_RELACIONES) y el mapa
  // vuelve a pedir sus relaciones sin parpadear: los puntos que ya estaban conservan su
  // lugar. Mientras se escribe, las citas aún sin guardar (EVENTO_REFERENCIAS) se dibujan
  // como relaciones pendientes, punteadas y tenues.
  const [pendientes, setPendientes] = useState<Map<string, AtributosReferencia[]>>(new Map())
  const datosRef = useRef<DatosGrafo | null>(null)
  datosRef.current = datos
  useEffect(() => {
    let t: number | undefined
    const recargar = (e: Event) => {
      if ((e as CustomEvent<{ foco: string }>).detail?.foco !== foco) return
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        api<DatosGrafo>(`/api/grafo?foco=${encodeURIComponent(foco)}`, { cache: 'no-store' } as RequestInit)
          .then((nuevos) => {
            const antes = new Map((datosRef.current?.nodos ?? []).map((n) => [n.id, n]))
            for (const n of nuevos.nodos) {
              const v = antes.get(n.id)
              if (v) Object.assign(n, { x: v.x, y: v.y, vx: 0, vy: 0, fx: v.fx, fy: v.fy })
            }
            setDatos(nuevos)
          })
          .catch(() => {})
      }, 300)
    }
    const citas = (e: Event) => {
      const d = (e as CustomEvent<DetalleReferencias>).detail
      if (!d || d.foco !== foco) return
      setPendientes((m) => new Map(m).set(d.clave, d.referencias))
    }
    window.addEventListener(EVENTO_RELACIONES, recargar)
    window.addEventListener(EVENTO_REFERENCIAS, citas)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener(EVENTO_RELACIONES, recargar)
      window.removeEventListener(EVENTO_REFERENCIAS, citas)
    }
  }, [foco])
  // Los nodos pendientes se conservan por id (la física no los reubica en cada tecla).
  const nodosPendientes = useRef(new Map<string, Nodo>())

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // La física: más suave que la de fábrica, con una atracción leve al centro
  // para que lo que se aparta a mano no se salga de la ventanita.
  useEffect(() => {
    const g = grafo.current
    if (!g) return
    g.d3Force('charge')?.strength(-70)
    g.d3Force('link')?.distance((l: Arista) => (l.fiable ? 32 : 42))
    g.d3Force('atraer', atraccionAlCentro(0.06))
  }, [datos])

  const grafoDatos = useMemo(() => {
    const nodos = [...(datos?.nodos ?? [])]
    const aristas = [...(datos?.aristas ?? [])]
    if (datos) {
      const ids = new Set(nodos.map((n) => n.id))
      const unidos = new Set(
        aristas.flatMap((a) => [idDe(a.source), idDe(a.target)]).filter(Boolean),
      )
      const vistos = new Set<string>()
      for (const r of [...pendientes.values()].flat()) {
        const id = nodoDe(r.tipo, r.id)
        if (!id || id === foco || vistos.has(id)) continue
        vistos.add(id)
        // Ya relacionado y guardado: nada que agregar.
        if (ids.has(id) && unidos.has(id)) continue
        if (!ids.has(id)) {
          let n = nodosPendientes.current.get(id)
          if (!n) {
            n = {
              id, tipo: TIPO_DE[r.tipo] ?? 'documento', subtipo: SUBTIPO[r.tipo] ?? 'Referencia',
              etiqueta: r.texto.split(',')[0].slice(0, 60), titulo: r.texto, grado: 1, pendiente: true,
            }
            nodosPendientes.current.set(id, n)
          }
          nodos.push(n)
          ids.add(id)
        }
        aristas.push({ source: foco, target: id, tipo: 'pendiente', fiable: false, etiqueta: 'citado (sin guardar)' })
      }
    }
    return { nodes: nodos, links: aristas } as { nodes: NodeObject<Nodo>[]; links: LinkObject<Nodo, Arista>[] }
  }, [datos, pendientes, foco])
  const vecinos = datos ? grafoDatos.nodes.length - 1 : 0

  const contarFijados = () => setFijados(grafoDatos.nodes.filter((n) => fijado(n as Nodo)).length)
  const soltarNodo = (n: Nodo) => {
    soltar(n)
    contarFijados()
    grafo.current?.d3ReheatSimulation()
  }
  const reordenar = () => {
    grafoDatos.nodes.forEach((n) => soltar(n as Nodo))
    setFijados(0)
    grafo.current?.d3ReheatSimulation()
  }

  // Pulsar: el del centro abre el menú; un archivo se abre; lo demás lleva a
  // su página (o, si no tiene, al mapa completo enfocado en él).
  const { alClic, marcarArrastre } = useClicNodo((nodo, e) => {
    if (nodo.id === foco) {
      setMenu({ nodo, x: e.clientX, y: e.clientY })
      return
    }
    const url = urlArchivo(nodo)
    if (nodo.tipo === 'archivo' && url) {
      void ver(url)
      return
    }
    // Normas, libros y lo citado sin guardar no tienen página: su menú (abrir la norma,
    // copiar la cita APA).
    if (nodo.tipo === 'norma' || nodo.tipo === 'libro' || nodo.pendiente) {
      setMenu({ nodo, x: e.clientX, y: e.clientY })
      return
    }
    navegar(nodo.ruta && !nodo.ruta.startsWith('/directorio') ? nodo.ruta : `/mapa?foco=${encodeURIComponent(focoDe(nodo))}`)
  }, soltarNodo)

  const leyenda = useMemo(() => {
    if (!datos) return []
    const nodos = grafoDatos.nodes as Nodo[]
    return [...new Set(nodos.filter((n) => n.id !== foco).map((n) => n.tipo))].map((t) => ({
      tipo: t,
      nombre: t === 'archivo' ? 'Archivos' : (nodos.find((n) => n.tipo === t)?.subtipo ?? t),
    }))
  }, [datos, grafoDatos, foco])

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden', bgcolor: L.fondo }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <HubOutlinedIcon sx={{ fontSize: 17, color: 'primary.main' }} />
        <Typography sx={{ fontSize: 13, fontWeight: 650, flex: 1 }}>
          {titulo}
          {datos && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}> · {vecinos} conectado{vecinos === 1 ? '' : 's'}</Box>}
        </Typography>
        {fijados > 0 && (
          <Tooltip title={`Soltar ${fijados === 1 ? 'el punto fijado' : `los ${fijados} puntos fijados`} y reacomodar`}>
            <IconButton size="small" onClick={reordenar} sx={{ p: 0.25 }} aria-label="Reordenar">
              <RestartAltIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        )}
        <Button size="small" startIcon={<OpenInFullIcon sx={{ fontSize: '15px !important' }} />} onClick={() => navegar(`/mapa?foco=${encodeURIComponent(foco)}`)} sx={{ textTransform: 'none', py: 0, minHeight: 0 }}>
          Ampliar
        </Button>
      </Box>
      <Box ref={caja} onContextMenu={(e) => e.preventDefault()} sx={{ position: 'relative', height: alto }}>
        {!datos && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={20} />
          </Box>
        )}
        {datos && vecinos === 0 && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', px: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Sin relaciones todavía.
            </Typography>
          </Box>
        )}
        {datos && vecinos > 0 && (
          <ForceGraph2D
            ref={grafo}
            width={ancho}
            height={alto}
            graphData={grafoDatos}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeCanvasObject={(n, ctx, escala) =>
              dibujarNodo(n as Nodo, ctx, escala, {
                colores: COLORES,
                lienzo: L,
                apagado: encima !== null && encima.id !== (n as Nodo).id && (n as Nodo).id !== foco,
                elegido: (n as Nodo).id === foco,
              })
            }
            onRenderFramePost={(ctx, escala) =>
              dibujarEtiquetas(grafoDatos.nodes as Nodo[], ctx, escala, {
                lienzo: L,
                rotular: (n) => encima === null || n.id === encima.id || n.id === foco,
                siempre: new Set([foco, ...(encima ? [encima.id] : [])]),
              })
            }
            nodePointerAreaPaint={(n, color, ctx) => zonaNodo(n as Nodo, color, ctx)}
            nodeLabel={() => ''}
            linkColor={() => L.linea}
            linkWidth={(l) => ((l as Arista).fiable ? 1 : 0.7)}
            linkLineDash={(l) => ((l as Arista).tipo === 'pendiente' ? [1.5, 2.5] : (l as Arista).fiable ? null : [3, 3])}
            cooldownTicks={120}
            onEngineStop={() => {
              // Encajar la primera vez, sin acercar de más cuando hay pocos
              // puntos; después de un arrastre la vista se queda donde está.
              const g = grafo.current
              if (!g || ajustado.current) return
              ajustado.current = true
              g.zoomToFit(0, 36)
              if (g.zoom() > 2.2) g.zoom(2.2)
            }}
            onNodeHover={(n) => {
              const nodo = (n as Nodo) ?? null
              setEncima(nodo)
              const p = nodo && grafo.current?.graph2ScreenCoords(nodo.x ?? 0, nodo.y ?? 0)
              setTarjeta(nodo && p ? { nodo, x: p.x, y: p.y } : null)
              if (caja.current) caja.current.style.cursor = n ? 'pointer' : 'default'
            }}
            onNodeClick={(n, e) => alClic(n as Nodo, e)}
            onNodeRightClick={(n, e) => setMenu({ nodo: n as Nodo, x: e.clientX, y: e.clientY })}
            onNodeDrag={() => {
              marcarArrastre()
              setTarjeta(null)
            }}
            onNodeDragEnd={(n) => {
              // Donde se suelta, se queda; los vecinos se acomodan alrededor.
              n.fx = n.x
              n.fy = n.y
              marcarArrastre()
              contarFijados()
            }}
            enableNodeDrag
            enableZoomInteraction={false}
            enablePanInteraction={false}
          />
        )}
        {tarjeta && !menu && (
          <TarjetaNodo
            nodo={tarjeta.nodo}
            x={tarjeta.x}
            y={tarjeta.y}
            ancho={ancho}
            lienzo={L}
            pista={tarjeta.nodo.id === foco ? 'Clic: acciones' : tarjeta.nodo.tipo === 'archivo' ? 'Clic: ver · clic derecho: más' : tarjeta.nodo.tipo === 'norma' || tarjeta.nodo.tipo === 'libro' ? 'Clic: acciones' : 'Clic: abrir · clic derecho: más'}
          />
        )}
      </Box>
      {datos && datos.aristas.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, px: 1.5, py: 0.6, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexWrap: 'wrap' }}>
          {leyenda.map((t) => (
            <Box key={t.tipo} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 11, color: 'text.secondary' }}>
              <Box sx={{ width: t.tipo === 'archivo' ? 6 : 7, height: t.tipo === 'archivo' ? 8 : 7, borderRadius: t.tipo === 'archivo' || t.tipo === 'externo' ? '1px' : '50%', bgcolor: COLORES[t.tipo] }} />
              {t.nombre}
            </Box>
          ))}
        </Box>
      )}
      <MenuNodo
        menu={menu}
        cerrar={() => setMenu(null)}
        navegar={navegar}
        ver={(u) => void ver(u)}
        descargar={(u, nombre) => void descargar(u, nombre)}
        alSoltar={soltarNodo}
      />
      {aviso}
    </Box>
  )
}

/**
 * MAPA DE RELACIONES (Edison 2026-10-05: «como el gráfico de Obsidian, pero
 * más completo, interactivo, moderno y útil»). Todo lo que el sistema sabe que
 * está conectado —documentos, proyectos de ley, semanas de representación,
 * personas e instituciones del directorio y el equipo— en un lienzo vivo.
 *
 * Cómo se usa:
 *   - Pasar el cursor (o tocar) ilumina un nodo y sus vecinos; las conexiones
 *     muestran partículas en el sentido de la relación.
 *   - Pulsar abre su ficha: qué es, con qué se conecta (cada conexión lleva a
 *     su nodo), «Abrir» va a la página y «Enfocar» deja solo su vecindad a 1 o
 *     2 saltos (el «mapa local» de Obsidian). `/mapa?foco=doc:278` llega ya
 *     enfocado (desde el editor de un documento).
 *   - Arrastrar un punto lo deja FIJO donde se suelta (Edison 2026-10-06:
 *     «permitir cierto nivel de separación dinámica y limitada»); sus vecinos
 *     se siguen acomodando. Doble clic lo suelta; «Reordenar» suelta todos.
 *   - Clic derecho (o clic sobre el nodo ya elegido): menú de acciones (abrir,
 *     ver o descargar su PDF, enfocar). Pasar el cursor muestra una tarjeta.
 *   - Enfocado en un documento, se suman sus archivos (firmado, cargos,
 *     adjuntos, expediente), que se abren desde el mapa.
 *   - Capas: tipos de nodo y de relación. Las relaciones FIABLES están
 *     guardadas en la base; las INFERIDAS salen del texto (destinatario, copia,
 *     referencia) y van punteadas. Datos y reglas: backend/app/servicios/grafo.py.
 *
 * Dibujo: react-force-graph-2d (canvas y física de fuerzas de d3).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import CircularProgress from '@mui/material/CircularProgress'
import Switch from '@mui/material/Switch'
import ButtonBase from '@mui/material/ButtonBase'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined'
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { api } from '../api'
import Marco from '../componentes/Marco'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import {
  LIENZO,
  TIPOS,
  atraccionAlCentro,
  coloresDe,
  dibujarEtiquetas,
  dibujarNodo as dibujar,
  fijado,
  idDe,
  soltar,
  zonaNodo,
  radio,
  type Arista,
  type DatosGrafo,
  type Nodo,
  type TemaMapa,
  type TipoNodo,
} from '../componentes/grafo/estilo'
import { MenuNodo, TarjetaNodo, focoDe, idDocumento, urlArchivo, useArchivos, useClicNodo, type MenuAbierto } from '../componentes/grafo/Interaccion'
import { ETIQUETA_ESTADO_PROYECTO } from './Proyecto'
import { MODO } from '../paleta'
import { RUTA_ESTADISTICAS, textoCorrespondencia, textoRespuesta } from '../correspondencia'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'

// Tipos, colores y dibujo: los comunes con la ventanita del mapa local.
const TEMA_GUARDADO = 'sgdp_mapa_tema'

// --- página ----------------------------------------------------------------

export default function Mapa() {
  const navegar = useNavigate()
  const [consulta, setConsulta] = useSearchParams()
  const muiTema = useTheme()
  const celular = useMediaQuery(muiTema.breakpoints.down('md'))

  const [datosApi, setDatosApi] = useState<DatosGrafo | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<DatosGrafo>('/api/grafo')
      .then(setDatosApi)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el mapa.'))
  }, [])

  // Enfocado: los archivos de los documentos cercanos (firmado, cargos,
  // adjuntos, expediente) solo vienen con la vecindad (`?foco=`); se suman al
  // mapa mientras dure el enfoque. En el mapa completo serían miles de puntos.
  const foco = consulta.get('foco')
  const [archivosFoco, setArchivosFoco] = useState<DatosGrafo | null>(null)
  useEffect(() => {
    setArchivosFoco(null)
    if (!foco) return
    let vivo = true
    api<DatosGrafo>(`/api/grafo?foco=${encodeURIComponent(foco)}&saltos=2`)
      .then((v) => {
        if (!vivo) return
        const archivos = new Set(v.nodos.filter((n) => n.tipo === 'archivo').map((n) => n.id))
        setArchivosFoco({
          nodos: v.nodos.filter((n) => archivos.has(n.id)),
          aristas: v.aristas.filter((a) => archivos.has(idDe(a.target)) || archivos.has(idDe(a.source))),
        })
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [foco])
  const datos = useMemo(() => {
    if (!datosApi || !archivosFoco) return datosApi
    return { nodos: [...datosApi.nodos, ...archivosFoco.nodos], aristas: [...datosApi.aristas, ...archivosFoco.aristas] }
  }, [datosApi, archivosFoco])

  // Arranca en el modo de la aplicación (2026-10-19, apariencia oscura); si la persona
  // eligió uno aquí, se respeta el suyo.
  const [tema, setTema] = useState<TemaMapa>(() => {
    try {
      const guardado = localStorage.getItem(TEMA_GUARDADO)
      return guardado === 'oscuro' || guardado === 'claro' ? guardado : MODO
    } catch {
      return MODO
    }
  })
  const L = LIENZO[tema]
  const colores = coloresDe(tema)

  // Capas (lo que se ve).
  const [tiposVisibles, setTiposVisibles] = useState<Set<TipoNodo>>(
    () => new Set(['proyecto', 'documento', 'externo', 'entrada', 'archivo', 'semana', 'persona', 'institucion', 'rendicion']),
  )
  const [inferidas, setInferidas] = useState(true)
  const [copias, setCopias] = useState(false)
  const [sueltos, setSueltos] = useState(false)
  const [capasAbiertas, setCapasAbiertas] = useState(!celular)

  // Selección, cursor y enfoque (mapa local).
  const [seleccion, setSeleccion] = useState<Nodo | null>(null)
  const [encima, setEncima] = useState<Nodo | null>(null)
  const [tarjeta, setTarjeta] = useState<{ nodo: Nodo; x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<MenuAbierto>(null)
  const [fijados, setFijados] = useState(0)
  const { ver, descargar, aviso } = useArchivos()
  const [saltos, setSaltos] = useState<1 | 2>(1)

  // Lo visible, según capas y enfoque.
  const visible = useMemo(() => {
    if (!datos) return { nodes: [] as Nodo[], links: [] as Arista[] }
    const equipo = tiposVisibles.has('usuario')
    let links = datos.aristas.filter(
      (a) =>
        (a.fiable || inferidas) &&
        (a.tipo !== 'copia' || copias) &&
        (a.tipo !== 'equipo' || equipo),
    )
    const porId = new Map(datos.nodos.map((n) => [n.id, n]))
    links = links.filter((a) => {
      const s = porId.get(idDe(a.source))
      const t = porId.get(idDe(a.target))
      return s && t && tiposVisibles.has(s.tipo) && tiposVisibles.has(t.tipo)
    })
    // «Trabaja en» solo acompaña: una persona cuya única relación visible es
    // su institución (p. ej. llegó por una copia, y las copias están ocultas)
    // quedaba flotando en pareja con ella.
    const conAlgoMas = new Set<string>()
    links.forEach((a) => {
      if (a.tipo !== 'trabaja_en') {
        conAlgoMas.add(idDe(a.source))
        conAlgoMas.add(idDe(a.target))
      }
    })
    links = links.filter((a) => a.tipo !== 'trabaja_en' || conAlgoMas.has(idDe(a.source)))
    let ids = new Set<string>()
    links.forEach((a) => {
      ids.add(idDe(a.source))
      ids.add(idDe(a.target))
    })
    if (foco && porId.has(foco)) {
      // Mapa local: el nodo y sus vecinos a 1 o 2 saltos.
      let frontera = new Set([foco])
      const cerca = new Set([foco])
      for (let i = 0; i < saltos; i++) {
        const nueva = new Set<string>()
        links.forEach((a) => {
          const s = idDe(a.source)
          const t = idDe(a.target)
          if (frontera.has(s) && !cerca.has(t)) nueva.add(t)
          if (frontera.has(t) && !cerca.has(s)) nueva.add(s)
        })
        nueva.forEach((x) => cerca.add(x))
        frontera = nueva
      }
      ids = cerca
      links = links.filter((a) => cerca.has(idDe(a.source)) && cerca.has(idDe(a.target)))
    }
    const nodes = datos.nodos.filter(
      (n) => tiposVisibles.has(n.tipo) && (ids.has(n.id) || (sueltos && !foco && (n.tipo === 'documento' || n.tipo === 'proyecto'))),
    )
    return { nodes, links }
  }, [datos, tiposVisibles, inferidas, copias, sueltos, foco, saltos])

  // Vecinos de cada nodo visible (para iluminar y para la ficha).
  const vecinos = useMemo(() => {
    const m = new Map<string, { nodo: string; arista: Arista; sale: boolean }[]>()
    visible.links.forEach((a) => {
      const s = idDe(a.source)
      const t = idDe(a.target)
      if (!m.has(s)) m.set(s, [])
      if (!m.has(t)) m.set(t, [])
      m.get(s)!.push({ nodo: t, arista: a, sale: true })
      m.get(t)!.push({ nodo: s, arista: a, sale: false })
    })
    return m
  }, [visible])
  const porId = useMemo(() => new Map((datos?.nodos ?? []).map((n) => [n.id, n])), [datos])

  const activo = encima ?? seleccion
  const iluminados = useMemo(() => {
    if (!activo) return null
    return new Set([activo.id, ...(vecinos.get(activo.id) ?? []).map((v) => v.nodo)])
  }, [activo, vecinos])

  // Tamaño del lienzo: el del contenedor.
  const contenedor = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState({ ancho: 800, alto: 600 })
  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setTam({ ancho: e.contentRect.width, alto: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const grafo = useRef<ForceGraphMethods<NodeObject<Nodo>, LinkObject<Nodo, Arista>>>()
  // La física: un poco más de separación que la de fábrica, para que respire;
  // la repulsión no alcanza lejos y una atracción leve al centro sujeta lo
  // suelto: lo que se aparta a mano no arrastra todo ni sale volando.
  useEffect(() => {
    const g = grafo.current
    if (!g) return
    g.d3Force('charge')?.strength(-42).distanceMax(320)
    g.d3Force('link')?.distance((l: Arista) => (l.fiable ? 34 : 46))
    g.d3Force('atraer', atraccionAlCentro(0.02))
  }, [datos])
  const ajustado = useRef(false)
  useEffect(() => {
    ajustado.current = false
  }, [foco, tiposVisibles, inferidas, copias])

  const irA = useCallback((n: Nodo, zoom = 2.6) => {
    setSeleccion(n)
    if (n.x !== undefined && n.y !== undefined) {
      grafo.current?.centerAt(n.x, n.y, 700)
      grafo.current?.zoom(zoom, 700)
    }
  }, [])

  const enfocar = (id: string | null) => {
    const c = new URLSearchParams(consulta)
    if (id) c.set('foco', id)
    else c.delete('foco')
    setConsulta(c, { replace: true })
  }

  // Llega con ?foco: seleccionarlo cuando haya datos.
  useEffect(() => {
    if (foco && porId.has(foco)) setSeleccion(porId.get(foco)!)
  }, [foco, porId])

  const cambiarTema = () => {
    const t = tema === 'oscuro' ? 'claro' : 'oscuro'
    setTema(t)
    try {
      localStorage.setItem(TEMA_GUARDADO, t)
    } catch {
      /* solo esta vez */
    }
  }

  // --- dibujo de cada nodo y, aparte, de los rótulos ------------------------
  const dibujarNodo = useCallback(
    (nodo: NodeObject<Nodo>, ctx: CanvasRenderingContext2D, escala: number) => {
      const n = nodo as Nodo
      dibujar(n, ctx, escala, {
        colores,
        lienzo: L,
        apagado: iluminados !== null && !iluminados.has(n.id),
        elegido: seleccion?.id === n.id,
      })
    },
    [iluminados, seleccion, colores, L],
  )
  const dibujarRotulos = useCallback(
    (ctx: CanvasRenderingContext2D, escala: number) => {
      dibujarEtiquetas(visible.nodes, ctx, escala, {
        lienzo: L,
        rotular: (n) =>
          (iluminados === null || iluminados.has(n.id)) &&
          (escala > 1.7 || iluminados !== null || n.grado >= 12 || n.tipo === 'proyecto'),
        siempre: new Set([seleccion?.id, encima?.id, foco].filter((x): x is string => !!x)),
      })
    },
    [visible, iluminados, seleccion, encima, foco, L],
  )

  // --- puntos fijados a mano ---------------------------------------------------
  const contarFijados = () => setFijados(visible.nodes.filter(fijado).length)
  const soltarNodo = (n: Nodo) => {
    soltar(n)
    contarFijados()
    grafo.current?.d3ReheatSimulation()
  }
  const reordenar = () => {
    datos?.nodos.forEach(soltar)
    setFijados(0)
    grafo.current?.d3ReheatSimulation()
  }
  // Pulsar elige el nodo (su ficha); pulsar el ya elegido abre sus acciones.
  const { alClic, marcarArrastre } = useClicNodo((n, e) => {
    if (seleccion?.id === n.id) setMenu({ nodo: n, x: e.clientX, y: e.clientY })
    else irA(n, Math.max(grafo.current?.zoom() ?? 1, 2))
  }, soltarNodo)

  const resaltada = (a: Arista) => activo !== null && (idDe(a.source) === activo.id || idDe(a.target) === activo.id)

  // --- ficha del nodo elegido -------------------------------------------------
  const conexiones = useMemo(() => {
    if (!seleccion) return []
    return (vecinos.get(seleccion.id) ?? [])
      .map((v) => ({ ...v, otro: porId.get(v.nodo)! }))
      .filter((v) => v.otro)
      .sort((p, q) => Number(q.arista.fiable) - Number(p.arista.fiable) || p.otro.tipo.localeCompare(q.otro.tipo))
  }, [seleccion, vecinos, porId])

  const cuenta = useMemo(() => {
    const c: Record<string, number> = {}
    datos?.nodos.forEach((n) => {
      c[n.tipo] = (c[n.tipo] ?? 0) + 1
    })
    return c
  }, [datos])

  const panel = {
    bgcolor: L.panel,
    color: L.texto,
    border: '1px solid',
    borderColor: L.borde,
    borderRadius: 3,
    backdropFilter: 'blur(14px) saturate(140%)',
    WebkitBackdropFilter: 'blur(14px) saturate(140%)',
    boxShadow: L.sombra,
  } as const

  return (
    <Marco modulo="mapa" sinBarraInferior={false}>
      <Box ref={contenedor} onContextMenu={(e) => e.preventDefault()} sx={{ flex: 1, position: 'relative', overflow: 'hidden', background: L.fondo, minHeight: 360 }}>
        {!datos && !error && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: L.tenue }}>
            <Box sx={{ textAlign: 'center' }}>
              <CircularProgress size={28} sx={{ color: L.acento }} />
              <Typography sx={{ mt: 1.5, fontSize: 13 }}>Trazando las relaciones…</Typography>
            </Box>
          </Box>
        )}
        {error && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: L.texto, p: 3 }}>
            <Typography>{error}</Typography>
          </Box>
        )}
        {datos && (
          <ForceGraph2D
            ref={grafo}
            width={tam.ancho}
            height={tam.alto}
            graphData={visible as { nodes: NodeObject<Nodo>[]; links: LinkObject<Nodo, Arista>[] }}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeRelSize={4}
            nodeVal={(n) => radio(n as Nodo) / 2}
            nodeCanvasObject={dibujarNodo}
            onRenderFramePost={dibujarRotulos}
            nodePointerAreaPaint={(n, color, ctx) => zonaNodo(n as Nodo, color, ctx)}
            nodeLabel={() => ''}
            linkColor={(l) => (resaltada(l as Arista) ? L.lineaViva : iluminados ? `${L.texto}0D` : L.linea)}
            linkWidth={(l) => (resaltada(l as Arista) ? 1.6 : (l as Arista).fiable ? 0.9 : 0.6)}
            linkLineDash={(l) => ((l as Arista).fiable ? null : [3, 3])}
            linkDirectionalParticles={(l) => (resaltada(l as Arista) ? 2 : 0)}
            linkDirectionalParticleWidth={1.6}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalParticleColor={() => L.particula}
            cooldownTicks={180}
            onEngineStop={() => {
              if (!ajustado.current) {
                ajustado.current = true
                grafo.current?.zoomToFit(600, foco ? 80 : 50)
              }
            }}
            onNodeHover={(n) => {
              const nodo = (n as Nodo) ?? null
              setEncima(nodo)
              const p = nodo && grafo.current?.graph2ScreenCoords(nodo.x ?? 0, nodo.y ?? 0)
              setTarjeta(nodo && p ? { nodo, x: p.x, y: p.y } : null)
              if (contenedor.current) contenedor.current.style.cursor = n ? 'pointer' : 'grab'
            }}
            onNodeClick={(n, e) => alClic(n as Nodo, e)}
            onNodeRightClick={(n, e) => setMenu({ nodo: n as Nodo, x: e.clientX, y: e.clientY })}
            onNodeDrag={() => {
              marcarArrastre()
              setTarjeta(null)
            }}
            onNodeDragEnd={(n) => {
              // Donde se suelta, se queda; sus vecinos se siguen acomodando.
              n.fx = n.x
              n.fy = n.y
              marcarArrastre()
              contarFijados()
            }}
            // d3-zoom avisa al instante cuando cambian width/height (force-graph
            // reencuadra con translateBy) y react-kapsule aplica esas props DURANTE
            // el render de ForceGraph2D: un setState aquí daba «Cannot update a
            // component (Mapa) while rendering…». Se difiere al terminar el render.
            onZoom={() => queueMicrotask(() => setTarjeta(null))}
            onBackgroundClick={() => setSeleccion(null)}
            enableNodeDrag
          />
        )}

        {/* Arriba: buscador y cifras. */}
        {datos && (
          <Box sx={{ position: 'absolute', top: 12, left: 12, right: { xs: 12, md: 'auto' }, width: { md: 380 }, display: 'flex', gap: 1, zIndex: 2 }}>
            <Autocomplete
              sx={{ flex: 1 }}
              size="small"
              options={datos.nodos}
              getOptionLabel={(n) => n.etiqueta}
              filterOptions={(ops, { inputValue }) => {
                const q = inputValue.trim().toLowerCase()
                if (q.length < 2) return []
                return ops.filter((n) => `${n.etiqueta} ${n.titulo}`.toLowerCase().includes(q)).slice(0, 12)
              }}
              onChange={(_, n) => {
                if (!n) return
                if (!visible.nodes.includes(n)) {
                  // Fuera de lo visible: se enfoca su vecindad.
                  enfocar(n.id)
                  setSeleccion(n)
                } else irA(n)
              }}
              noOptionsText="Escriba al menos dos letras"
              renderOption={(props, n) => (
                <Box component="li" {...props} key={n.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start !important' }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: colores[n.tipo], mt: 0.75, flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }} noWrap>{n.etiqueta}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }} noWrap>{n.subtipo}{n.titulo ? ` · ${n.titulo}` : ''}</Typography>
                  </Box>
                </Box>
              )}
              renderInput={(p) => (
                <TextField
                  {...p}
                  placeholder="Buscar un documento, persona, institución…"
                  InputProps={{ ...p.InputProps, startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: L.tenue }} /></InputAdornment> }}
                  sx={{ '& .MuiOutlinedInput-root': { ...panel, borderRadius: 2.5, color: L.texto }, '& fieldset': { border: 'none' }, '& input::placeholder': { color: L.tenue, opacity: 1 } }}
                />
              )}
            />
            <Tooltip title={capasAbiertas ? 'Ocultar capas' : 'Capas: qué se ve'}>
              <IconButton onClick={() => setCapasAbiertas((v) => !v)} sx={{ ...panel, borderRadius: 2.5, color: L.texto }}>
                <LayersOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Capas. */}
        {datos && capasAbiertas && (
          <Box sx={{ ...panel, position: 'absolute', top: 64, left: 12, width: { xs: 'calc(100% - 24px)', sm: 290 }, p: 2, zIndex: 2, maxHeight: 'calc(100% - 140px)', overflowY: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <HubOutlinedIcon sx={{ fontSize: 18, color: L.acento }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
                {visible.nodes.length} nodos · {visible.links.length} conexiones
              </Typography>
              {celular && (
                <IconButton size="small" onClick={() => setCapasAbiertas(false)} sx={{ color: L.tenue }}><CloseIcon fontSize="small" /></IconButton>
              )}
            </Box>
            {TIPOS.filter((t) => cuenta[t.tipo]).map((t) => {
              const on = tiposVisibles.has(t.tipo)
              return (
                <ButtonBase
                  key={t.tipo}
                  onClick={() =>
                    setTiposVisibles((prev) => {
                      const s = new Set(prev)
                      if (s.has(t.tipo)) s.delete(t.tipo)
                      else s.add(t.tipo)
                      return s
                    })
                  }
                  sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', gap: 1.25, py: 0.6, px: 0.75, borderRadius: 1.5, opacity: on ? 1 : 0.45, '&:hover': { bgcolor: L.borde } }}
                >
                  <Box sx={{ width: 10, height: 10, borderRadius: t.tipo === 'institucion' ? 0.5 : '50%', transform: t.tipo === 'institucion' ? 'rotate(45deg)' : 'none', bgcolor: colores[t.tipo], boxShadow: 'none' }} />
                  <Typography sx={{ fontSize: 13, flex: 1, textAlign: 'left' }}>{t.nombre}</Typography>
                  <Typography sx={{ fontSize: 12, color: L.tenue }}>{cuenta[t.tipo]}</Typography>
                </ButtonBase>
              )
            })}
            <Box sx={{ height: '1px', bgcolor: L.borde, my: 1.25 }} />
            {[
              { v: inferidas, set: setInferidas, t: 'Relaciones inferidas', d: 'Del texto: destinatario, copia o referencia que coinciden con el directorio o con otro documento (punteadas).' },
              { v: copias, set: setCopias, t: 'Copias (c.c.)', d: 'Las copias de rutina (Oficialía, Mesa Directiva) unen casi todo con casi todo.' },
              { v: sueltos, set: setSueltos, t: 'Mostrar lo que no se conecta', d: 'Documentos y proyectos sin ninguna relación todavía.' },
            ].map((o) => (
              <Tooltip key={o.t} title={o.d} placement="right">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 0.75 }}>
                  <Typography sx={{ fontSize: 13 }}>{o.t}</Typography>
                  <Switch
                    size="small"
                    checked={o.v}
                    onChange={(e) => o.set(e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: L.acento },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: L.acento, opacity: 0.5 },
                      '& .MuiSwitch-track': { bgcolor: L.tenue },
                    }}
                  />
                </Box>
              </Tooltip>
            ))}
            <Typography sx={{ fontSize: 11.5, color: L.tenue, mt: 1, lineHeight: 1.45 }}>
              Línea continua: relación guardada en el sistema. Punteada: inferida del texto. Tamaño: cuántas conexiones tiene.
              Arrastre un punto para dejarlo fijo (marca pequeña); doble clic lo suelta. Clic derecho: acciones.
            </Typography>
          </Box>
        )}

        {/* Mapa local activo. */}
        {foco && datos && porId.has(foco) && (
          <Box sx={{ ...panel, position: 'absolute', bottom: { xs: 76, md: 16 }, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, zIndex: 3, borderRadius: 5 }}>
            <CenterFocusStrongOutlinedIcon sx={{ fontSize: 18, color: L.acento }} />
            <Typography sx={{ fontSize: 13, whiteSpace: 'nowrap', maxWidth: { xs: 120, sm: 280 }, overflow: 'hidden', textOverflow: 'ellipsis' }}>Vecindad de {porId.get(foco)?.etiqueta}</Typography>
            <ToggleButtonGroup size="small" exclusive value={saltos} onChange={(_, v) => v && setSaltos(v)} sx={{ '& .MuiToggleButton-root': { color: L.tenue, borderColor: L.borde, py: 0.1, px: 1, fontSize: 12 }, '& .Mui-selected': { color: `${L.texto} !important` } }}>
              <ToggleButton value={1}>1 salto</ToggleButton>
              <ToggleButton value={2}>2 saltos</ToggleButton>
            </ToggleButtonGroup>
            <Button size="small" onClick={() => enfocar(null)} sx={{ color: L.acento, textTransform: 'none' }}>Ver todo</Button>
          </Box>
        )}

        {/* Zoom y tema. */}
        {datos && (
          <Box sx={{ ...panel, position: 'absolute', right: 12, bottom: { xs: seleccion ? 'calc(52vh + 12px)' : 76, md: 16 }, display: 'flex', flexDirection: 'column', p: 0.5, zIndex: 2, borderRadius: 2.5 }}>
            {[
              { t: 'Acercar', i: <AddIcon fontSize="small" />, f: () => grafo.current?.zoom((grafo.current?.zoom() ?? 1) * 1.4, 300) },
              { t: 'Alejar', i: <RemoveIcon fontSize="small" />, f: () => grafo.current?.zoom((grafo.current?.zoom() ?? 1) / 1.4, 300) },
              { t: 'Ver todo el mapa', i: <CenterFocusStrongOutlinedIcon fontSize="small" />, f: () => grafo.current?.zoomToFit(500, 50) },
              ...(fijados > 0
                ? [{ t: `Reordenar: soltar ${fijados === 1 ? 'el punto fijado' : `los ${fijados} puntos fijados`}`, i: <RestartAltIcon fontSize="small" />, f: reordenar }]
                : []),
              { t: tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro', i: tema === 'oscuro' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />, f: cambiarTema },
            ].map((b) => (
              <Tooltip key={b.t} title={b.t} placement="left">
                <IconButton size="small" onClick={b.f} sx={{ color: L.texto }}>{b.i}</IconButton>
              </Tooltip>
            ))}
          </Box>
        )}

        {/* Ficha del nodo elegido: a la derecha en escritorio, abajo en el celular. */}
        {seleccion && (
          <Box
            sx={{
              ...panel,
              position: 'absolute', zIndex: 3, p: 2, overflowY: 'auto',
              ...(celular
                ? { left: 8, right: 8, bottom: 8, maxHeight: '52vh', borderRadius: 3.5 }
                : { top: 12, right: 12, width: 360, maxHeight: 'calc(100% - 24px)' }),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colores[seleccion.tipo], mt: 0.7, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', color: L.tenue, fontWeight: 600 }}>
                  {seleccion.subtipo}
                  {seleccion.estado ? ` · ${ETIQUETA_ESTADO_PROYECTO[seleccion.estado] ?? seleccion.estado.replace(/_/g, ' ').toLowerCase()}` : ''}
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, mt: 0.25 }}>{seleccion.etiqueta}</Typography>
              </Box>
              <IconButton size="small" onClick={() => setSeleccion(null)} sx={{ color: L.tenue, mt: -0.5 }}><CloseIcon fontSize="small" /></IconButton>
            </Box>
            {seleccion.titulo && <Typography sx={{ fontSize: 13.5, color: L.texto, opacity: 0.85, mt: 1, lineHeight: 1.5 }}>{seleccion.titulo}</Typography>}
            {(seleccion.fecha || seleccion.institucion) && (
              <Typography sx={{ fontSize: 12, color: L.tenue, mt: 0.75 }}>
                {[seleccion.institucion, seleccion.fecha].filter(Boolean).join(' · ')}
              </Typography>
            )}
            {/* Correspondencia: lo mismo que Estadísticas (src/correspondencia.ts). */}
            {(seleccion.correspondencia?.enviados || seleccion.respuesta) && (
              <Typography sx={{ fontSize: 12.5, color: L.texto, mt: 0.75 }}>
                {textoCorrespondencia(seleccion.correspondencia) || textoRespuesta(seleccion.respuesta)}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
              {seleccion.tipo === 'archivo' && seleccion.archivo && (
                <>
                  <Button size="small" variant="contained" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => void ver(seleccion.archivo!)} sx={{ textTransform: 'none', bgcolor: L.acento, color: L.sobreAcento, '&:hover': { bgcolor: L.acento, filter: 'brightness(1.08)' } }}>
                    Ver
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => void descargar(seleccion.archivo!, seleccion.nombre ?? '')} sx={{ textTransform: 'none', color: L.texto, borderColor: L.borde }}>
                    Descargar
                  </Button>
                  {seleccion.documento && (
                    <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => navegar(`/documentos/${seleccion.documento}`)} sx={{ textTransform: 'none', color: L.texto, borderColor: L.borde }}>
                      Su documento
                    </Button>
                  )}
                </>
              )}
              {seleccion.ruta && (
                <Button size="small" variant="contained" startIcon={<OpenInNewIcon />} onClick={() => navegar(seleccion.ruta!)} sx={{ textTransform: 'none', bgcolor: L.acento, color: L.sobreAcento, '&:hover': { bgcolor: L.acento, filter: 'brightness(1.08)' } }}>
                  Abrir
                </Button>
              )}
              {seleccion.tipo === 'documento' && idDocumento(seleccion) !== null && (
                <Button size="small" variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => void ver(urlArchivo(seleccion)!)} sx={{ textTransform: 'none', color: L.texto, borderColor: L.borde }}>
                  Ver PDF
                </Button>
              )}
              {(seleccion.correspondencia?.enviados || seleccion.respuesta) && (
                <Button size="small" variant="outlined" startIcon={<InsightsOutlinedIcon />} onClick={() => navegar(RUTA_ESTADISTICAS)} sx={{ textTransform: 'none', color: L.texto, borderColor: L.borde }}>
                  Estadísticas
                </Button>
              )}
              {foco !== seleccion.id && seleccion.tipo !== 'archivo' && (
                <Button size="small" variant="outlined" startIcon={<CenterFocusStrongOutlinedIcon />} onClick={() => enfocar(seleccion.id)} sx={{ textTransform: 'none', color: L.texto, borderColor: L.borde }}>
                  Enfocar
                </Button>
              )}
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: L.tenue, mt: 2, mb: 0.5, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Conexiones ({conexiones.length})
            </Typography>
            {conexiones.length === 0 && (
              <Typography sx={{ fontSize: 13, color: L.tenue }}>Sin conexiones con las capas que están a la vista.</Typography>
            )}
            {conexiones.map((c, i) => (
              <ButtonBase
                key={`${c.nodo}-${c.arista.tipo}-${i}`}
                onClick={() => irA(c.otro)}
                onMouseEnter={() => setEncima(c.otro)}
                onMouseLeave={() => setEncima(null)}
                sx={{ display: 'flex', width: '100%', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 1, py: 0.75, px: 0.75, borderRadius: 1.5, textAlign: 'left', '&:hover': { bgcolor: L.borde } }}
              >
                {c.sale ? <ArrowForwardIcon sx={{ fontSize: 14, color: L.tenue, mt: 0.4 }} /> : <ArrowBackIcon sx={{ fontSize: 14, color: L.tenue, mt: 0.4 }} />}
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colores[c.otro.tipo], mt: 0.7, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>{c.otro.etiqueta}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: L.tenue }} noWrap>
                    {c.arista.etiqueta}
                    {c.arista.fiable ? '' : ' · inferida'}
                    {c.otro.titulo ? ` · ${c.otro.titulo}` : ''}
                  </Typography>
                </Box>
              </ButtonBase>
            ))}
          </Box>
        )}

        {/* Tarjeta del nodo bajo el cursor (no la del elegido: ya tiene su ficha). */}
        {tarjeta && !menu && tarjeta.nodo.id !== seleccion?.id && (
          <TarjetaNodo
            nodo={tarjeta.nodo}
            x={tarjeta.x}
            y={tarjeta.y}
            ancho={tam.ancho}
            lienzo={L}
            formatoEstado={(e) => ETIQUETA_ESTADO_PROYECTO[e] ?? e.replace(/_/g, ' ').toLowerCase()}
            pista="Clic: ficha · clic derecho: acciones"
          />
        )}
        <MenuNodo
          menu={menu}
          cerrar={() => setMenu(null)}
          navegar={navegar}
          ver={(u) => void ver(u)}
          descargar={(u, nombre) => void descargar(u, nombre)}
          alEnfocar={(n) => enfocar(focoDe(n))}
          enMapaCompleto
          alSoltar={soltarNodo}
        />
        {aviso}
      </Box>
    </Marco>
  )
}

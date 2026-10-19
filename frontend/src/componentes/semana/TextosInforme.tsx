/**
 * Los TEXTOS del informe (`informe.yaml`) con su VISTA PREVIA al lado, como el texto de un
 * proyecto de ley (paginas/Proyecto.tsx) y el editor de documentos: a la izquierda se
 * escribe, a la derecha se ve el informe tal como va. La vista previa no numera ni crea
 * versión, y no toca los PDF de la semana (backend: POST /api/semanas/{id}/vista-previa).
 * Generar y aprobar el PDF siguen en su propia sección («Generar informe»).
 *
 * 2026-10-08 (Edison: «lo mejorado en Documentos aplica aquí»): como el editor de documentos,
 * se guarda solo tras una pausa de 4 s, hay UN botón Guardar (Ctrl+S) con su rueda, y cada
 * guardado rehace la vista previa sin pedirla.
 *
 * Las CIFRAS no se escriben: el generador las calcula de actividades y pedidos. Título,
 * periodo y ámbito se escriben solos desde «Datos de la semana» mientras nadie los cambie.
 * La prosa admite **negrita** y *cursiva* (Markdown mínimo de lib/latex.py del generador).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PALETA } from '../../paleta'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Alert from '@mui/material/Alert'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SaveIcon from '@mui/icons-material/Save'
import CircularProgress from '@mui/material/CircularProgress'
import { ErrorApi, api } from '../../api'
import VisorPdf from '../VisorPdf'
import { Bloque, Titulo } from '../Estilo'
import { CamposFila, type Campo } from './DialogoFila'
import { type Datos, type Opcion, type PropsSeccion, archivosSemana, conMayuscula, diasDe, fechaLarga, lista, texto } from './modelo'

type Galeria = (string | { id: string; pie?: string })[]
const idsGaleria = (g: unknown) => ((g as Galeria | undefined) ?? []).map((x) => (typeof x === 'string' ? x : x.id))
const palabras = (t: unknown) => texto(t).split(/\s+/).filter(Boolean).length

const GRAFICOS: Opcion[] = [
  { valor: 'pedidos_sector', etiqueta: 'Pedidos por sector' },
  { valor: 'entidades', etiqueta: 'Entidades más requeridas' },
  { valor: 'prioridad', etiqueta: 'Pedidos por prioridad' },
  { valor: 'tipo', etiqueta: 'Actividades por tipo' },
  { valor: 'por_dia', etiqueta: 'Actividades por día' },
  { valor: 'actividades_sector', etiqueta: 'Actividades por sector' },
]
const CIFRAS: Opcion[] = [
  { valor: 'horas', etiqueta: 'Horas en territorio' },
  { valor: 'provincias', etiqueta: 'Provincias' },
  { valor: 'ie', etiqueta: 'Instituciones educativas' },
]
// Lo que la vista previa no debe cambiar (lo fija «Generar informe»).
const SIN_VISTA = ['version', 'estado']
// La misma pausa que el editor de documentos (EditorDocumento.tsx: AUTO_MS).
const AUTO_MS = 4000

export default function TextosInforme({ s, recargar, avisar }: PropsSeccion) {
  const tema = useTheme()
  const dosColumnas = useMediaQuery(tema.breakpoints.up('lg'))
  const [panel, setPanel] = useState<'redactar' | 'pdf'>('redactar')
  const [inf, setInf] = useState<Datos>(s.informe)
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  // Lo último que se escribió, para el guardado automático (sin cierres viejos).
  const infRef = useRef(inf)
  infRef.current = inf
  const versionRef = useRef(s.version)
  versionRef.current = s.version
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [abierta, setAbierta] = useState<string | false>(false)
  // Vista previa: la de esta persona (como en Proyectos) o el último PDF generado; al entrar
  // se ve el generado (si lo hay) y la vista previa aparece con el primer guardado.
  const [modo, setModo] = useState<'vista' | 'generado'>(s.pdfs.length ? 'generado' : 'vista')
  const [vista, setVista] = useState<{ marca: number; paginas: number; conCambios: boolean } | null>(null)
  const [previsualizando, setPrevisualizando] = useState(false)
  const [erroresVista, setErroresVista] = useState<string[]>([])
  const [inicioVista, setInicioVista] = useState(0)
  const [segundos, setSegundos] = useState(0)
  // Qué se mostró en la última vista previa, para avisar cuando quedó atrás.
  const mostrado = useRef('')
  // Las fotos también salen en el informe: elegir, quitar o cambiar el pie de
  // una deja atrás la vista previa (2026-10-06; antes solo se miraban los textos).
  const huella = useMemo(
    () => JSON.stringify([inf, s.fotos.filter((f) => f.datos.seleccion).map((f) => [f.codigo, f.datos])]),
    [inf, s.fotos],
  )
  const desactualizada = vista !== null && mostrado.current !== huella

  useEffect(() => {
    // Lo que se está escribiendo no se pisa al recargar (otra sección guardó).
    if (!sucio) setInf(s.informe)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.version, s.informe])
  // Avisar antes de cerrar o recargar la pestaña con textos sin guardar.
  useEffect(() => {
    if (!sucio) return
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sucio])
  useEffect(() => {
    if (!previsualizando) return
    const t = setInterval(() => setSegundos(Math.round((Date.now() - inicioVista) / 1000)), 1000)
    return () => clearInterval(t)
  }, [previsualizando, inicioVista])

  const poner = (k: string, v: unknown) => {
    setInf((d) => ({ ...d, [k]: v }))
    setSucio(true)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => void guardarRef.current(true), AUTO_MS)
  }
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  const previsualizar = useCallback(async () => {
    if (previsualizando) return
    setPrevisualizando(true)
    setErroresVista([])
    setInicioVista(Date.now())
    setSegundos(0)
    const enviado = huella
    try {
      const textos = Object.fromEntries(Object.entries(inf).filter(([k]) => !SIN_VISTA.includes(k)))
      const r = await api<{ paginas: number; marca: number }>(`/api/semanas/${s.id}/vista-previa`, {
        method: 'POST',
        body: JSON.stringify({ informe: textos }),
      })
      mostrado.current = enviado
      setVista({ marca: r.marca, paginas: r.paginas, conCambios: sucio })
      setModo('vista')
    } catch (e) {
      const det = e instanceof ErrorApi ? (e.detalle as { errores?: string[] } | undefined) : undefined
      setErroresVista(det?.errores ?? [e instanceof Error ? e.message : 'No se pudo armar la vista previa.'])
    } finally {
      setPrevisualizando(false)
    }
  }, [previsualizando, huella, inf, s.id, sucio])

  const ocupado = useRef(false)
  const guardar = async (auto = false) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (ocupado.current) return
    ocupado.current = true
    setGuardando(true)
    const enviado = infRef.current
    try {
      await api(`/api/semanas/${s.id}`, { method: 'PUT', body: JSON.stringify({ version_base: versionRef.current, informe: enviado }) })
      // Lo escrito mientras se guardaba sigue pendiente (y se guardará en la próxima pausa).
      if (infRef.current === enviado) setSucio(false)
      else temporizador.current = setTimeout(() => void guardarRef.current(true), AUTO_MS)
      setGuardadoEn(new Date())
      if (!auto) avisar('success', 'Textos guardados.')
      await recargar()
      void previsualizarRef.current()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }
  const guardarRef = useRef(guardar)
  guardarRef.current = guardar
  const previsualizarRef = useRef(previsualizar)
  previsualizarRef.current = previsualizar
  // Ctrl+S (⌘S) guarda, como en el editor de documentos.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void guardarRef.current(false)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const publicas = useMemo(
    () => s.fotos.filter((f) => f.datos.estado === 'publica' && f.datos.seleccion)
      .map((f) => ({ valor: f.codigo, etiqueta: `${f.codigo} · ${texto(f.datos.pie).slice(0, 60)}` })),
    [s.fotos],
  )
  const cita = (inf.cita_cierre as Datos | undefined) ?? {}
  const equipo = ((inf.equipo as { nombre?: string; rol?: string }[] | undefined) ?? []).map((r) => (r.rol ? `${r.nombre ?? ''} — ${r.rol}` : r.nombre ?? ''))
  const datosVista: Datos = { ...inf, equipo, cita_texto: cita.texto, cita_autor: cita.autor, cita_contexto: cita.contexto }
  const ponerVista = (k: string, v: unknown) => {
    if (k === 'equipo') {
      poner('equipo', lista(v).map((l) => {
        const [nombre, ...rol] = l.split(/\s+[—-]\s+/)
        return { nombre: nombre.trim(), rol: rol.join(' — ').trim() }
      }))
    } else if (k.startsWith('cita_')) {
      poner('cita_cierre', { ...cita, [k.slice(5)]: v })
    } else poner(k, v)
  }

  const portada: Campo[] = [
    { clave: 'titulo_documento', etiqueta: 'Título del informe', tipo: 'texto', ayuda: 'Automático; cámbielo solo si hace falta.' },
    { clave: 'periodo_texto', etiqueta: 'Periodo, como se lee', tipo: 'texto', medio: true, ayuda: 'Sale de las fechas de la semana.' },
    { clave: 'ambito_texto', etiqueta: 'Ámbito, como se lee', tipo: 'texto', medio: true, ayuda: 'Sale de las provincias de la semana.' },
    { clave: 'foto_portada', etiqueta: 'Foto de portada', tipo: 'opcion', medio: true, opciones: publicas, ayuda: publicas.length ? 'Horizontal. Vacía: la primera elegida.' : 'Elija fotos primero en «Fotos».' },
    { clave: 'foto_evidencia', etiqueta: 'Foto del balance', tipo: 'opcion', medio: true, opciones: publicas, ayuda: 'Vertical: infraestructura o evidencia.' },
    { clave: 'grafico_balance', etiqueta: 'Gráfico del balance', tipo: 'opcion', medio: true, opciones: GRAFICOS },
    { clave: 'cifra_resumen', etiqueta: 'Tercera cifra del resumen', tipo: 'opcion', medio: true, opciones: CIFRAS },
  ]
  const prosa: Campo[] = [
    { clave: 'presentacion', etiqueta: 'Presentación (carta del diputado, en primera persona)', tipo: 'area' },
    { clave: 'resumen', etiqueta: 'Resumen', tipo: 'area' },
    { clave: 'marco_normativo', etiqueta: 'La Semana de Representación (marco)', tipo: 'area' },
  ]
  const cierre: Campo[] = [
    { clave: 'compromisos_prosa', etiqueta: 'Compromisos del diputado', tipo: 'area' },
    { clave: 'conclusiones', etiqueta: 'Conclusiones', tipo: 'area' },
    { clave: 'recomendaciones', etiqueta: 'Agenda inmediata', tipo: 'lineas', ayuda: 'Acciones del diputado hacia fuera, una por línea.' },
    { clave: 'cita_texto', etiqueta: 'Cita de cierre', tipo: 'area' },
    { clave: 'cita_autor', etiqueta: 'Autor de la cita', tipo: 'texto', medio: true },
    { clave: 'cita_contexto', etiqueta: 'Contexto de la cita', tipo: 'texto', medio: true },
  ]
  const creditos: Campo[] = [
    { clave: 'equipo', etiqueta: 'Equipo (créditos)', tipo: 'lineas', ayuda: 'Uno por línea: «Nombre — rol». Se copia de la semana anterior.' },
    { clave: 'titulo_corrido', etiqueta: 'Título en la cabecera de página', tipo: 'texto' },
    { clave: 'lugar_firma', etiqueta: 'Lugar de firma', tipo: 'texto', medio: true },
    { clave: 'fecha_documento', etiqueta: 'Fecha del informe', tipo: 'fecha', medio: true, ayuda: 'Al aprobar se pone la del día.' },
    { clave: 'portada_codigo', etiqueta: 'Texto de portada si aún no hay foto', tipo: 'texto' },
    { clave: 'nota_contraportada', etiqueta: 'Nota de contraportada', tipo: 'area' },
    { clave: 'fuentes', etiqueta: 'Fuentes', tipo: 'lineas' },
  ]
  // Balance y seguimiento: los imprime la edición PÚBLICA (parte_balance, parte_seguimiento),
  // junto al gráfico y a los pedidos urgentes que el generador calcula.
  const balance: Campo[] = [
    { clave: 'analisis_intro', etiqueta: 'Balance: introducción', tipo: 'area' },
    { clave: 'analisis_sectores', etiqueta: 'Balance por sectores', tipo: 'area' },
    { clave: 'analisis_entidades', etiqueta: 'Balance por entidades', tipo: 'area' },
    { clave: 'analisis_prioridad', etiqueta: 'Balance por prioridad', tipo: 'area' },
    { clave: 'seguimiento_intro', etiqueta: 'Seguimiento: qué se atenderá primero', tipo: 'area', ayuda: 'Va antes de la lista de pedidos urgentes (si los hay).' },
  ]
  const interna: Campo[] = [
    { clave: 'criterio_competencia', etiqueta: 'Criterio de competencia', tipo: 'area' },
    { clave: 'pauta_prosa', etiqueta: 'Pauta de seguimiento', tipo: 'area' },
    { clave: 'metodologia', etiqueta: 'Metodología', tipo: 'area' },
    { clave: 'prioridad_explicacion', etiqueta: 'Cómo se propuso la prioridad', tipo: 'area' },
    { clave: 'pendientes', etiqueta: 'Notas de esta versión (pendientes)', tipo: 'lineas' },
    { clave: 'ficha_sin_notas', etiqueta: 'Ocultar las notas de versión en la ficha técnica', tipo: 'si_no' },
  ]

  // Crónicas: una por día del recorrido, unida por fecha (como lo hace el generador), y
  // editadas AQUÍ mismo: se guardan con el resto de los textos y entran a la vista previa.
  const dias = diasDe(s)
  const cronicas = (inf.dias as Datos[] | undefined) ?? []
  const cronicaDe = (fecha: string) => cronicas.find((c) => texto(c.fecha) === fecha)
  const kickerDe = (i: number, fecha: string, ambito: string) => `Día ${i + 1} · ${conMayuscula(fechaLarga(fecha))}${ambito ? ` · ${ambito}` : ''}`
  const fotosDelDia = (fecha: string) => {
    const acts = new Set(s.actividades.filter((a) => a.datos.fecha === fecha).map((a) => a.codigo))
    return s.fotos.filter((f) => acts.has(texto(f.datos.actividad)) && f.datos.estado === 'publica')
      .map((f) => ({ valor: f.codigo, etiqueta: `${f.codigo} · ${texto(f.datos.pie).slice(0, 50)}` }))
  }
  const camposCronica = (fecha: string): Campo[] => {
    const disponibles = fotosDelDia(fecha)
    return [
      { clave: 'kicker', etiqueta: 'Antetítulo', tipo: 'texto', ayuda: 'Se propone solo: «Día 1 · Lunes 21 de septiembre · lugar».' },
      { clave: 'titular', etiqueta: 'Titular', tipo: 'texto' },
      { clave: 'entrada', etiqueta: 'Entrada (una o dos frases)', tipo: 'area' },
      { clave: 'relato', etiqueta: 'Crónica', tipo: 'area', ayuda: '300–500 palabras: qué se vio, qué pidieron, qué se hará.' },
      { clave: 'foto', etiqueta: 'Foto de apertura', tipo: 'opcion', medio: true, opciones: disponibles },
      { clave: 'foto_pie', etiqueta: 'Pie de la apertura', tipo: 'texto', medio: true },
      { clave: 'foto_columna', etiqueta: 'Foto en la columna (opcional)', tipo: 'opcion', medio: true, opciones: disponibles },
      { clave: 'foto_columna_tras', etiqueta: 'Tras el párrafo n.º', tipo: 'numero', medio: true },
      { clave: 'galeria', etiqueta: 'Galería «En imágenes» (códigos de foto, en orden)', tipo: 'chips',
        ayuda: disponibles.length ? `Al menos una por actividad. Públicas de este día: ${disponibles.map((o) => o.valor).join(', ')}` : 'Este día aún no tiene fotos públicas (sección «Fotos»).' },
    ]
  }
  const ponerCronica = (fecha: string, i: number, ambito: string, k: string, v: unknown) => {
    const previa: Datos = cronicaDe(fecha) ?? { fecha, kicker: kickerDe(i, fecha, ambito) }
    let valor = v
    if (k === 'galeria') {
      // La galería conserva el pie propio de cada foto que ya lo tenía.
      const pies = Object.fromEntries(((previa.galeria as Galeria | undefined) ?? []).filter((x) => typeof x !== 'string').map((x) => [(x as { id: string }).id, x]))
      valor = lista(v).map((id) => pies[id] ?? id)
    }
    const nueva = { ...previa, [k]: valor }
    const otras = cronicas.filter((c) => texto(c.fecha) !== fecha)
    poner('dias', [...otras, nueva].sort((a, b) => texto(a.fecha).localeCompare(texto(b.fecha))))
  }

  const pendientes = s.pendientes
  // Los pendientes por su nombre en el formulario, no por la clave del YAML.
  const nombres: Record<string, string> = Object.fromEntries(
    [...portada, ...prosa, ...balance, ...cierre, ...creditos, ...interna].map((c) => [c.clave, c.etiqueta]),
  )
  nombres.cita_cierre = 'Cita de cierre'
  const legibles = pendientes.map((p) => nombres[p] ?? p)
  const formulario = (
    <Box>
      {/* 2026-10-06: una sola línea de ayuda para todos los textos (antes, bajo cada campo). */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Línea en blanco separa párrafos. **negrita**, *cursiva*, «@» para citar.
      </Typography>
      {pendientes.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {legibles.length === 1 ? 'Falta 1 texto' : `Faltan ${legibles.length} textos`} para aprobar: {legibles.join(' · ')}.
        </Alert>
      )}
      <Titulo>Portada</Titulo>
      <CamposFila campos={portada} datos={datosVista} poner={ponerVista} pendientes={pendientes} />
      <Bloque>
        <Titulo>Presentación, resumen y marco</Titulo>
        <CamposFila campos={prosa} datos={datosVista} poner={ponerVista} pendientes={pendientes} />
      </Bloque>
      <Bloque>
        <Titulo>Crónicas, una por día</Titulo>
        {dias.length === 0 && <Typography variant="body2" color="text.secondary">Los días salen de «Datos de la semana».</Typography>}
        {dias.map((d, i) => {
          const c = cronicaDe(d.fecha)
          const n = palabras(c?.relato)
          return (
            <Accordion key={d.fecha} disableGutters expanded={abierta === d.fecha} onChange={(_, x) => setAbierta(x ? d.fecha : false)}
              sx={{ mb: 1, border: '1px solid', borderColor: n ? 'divider' : 'warning.light', borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">Día {i + 1} · {conMayuscula(fechaLarga(d.fecha))}{d.ambito ? ` · ${d.ambito}` : ''}</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{texto(c?.titular) || 'Crónica por escribir'}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                    {/* 2026-10-06: la cuenta de palabras solo cuando advierte; si no, repite la del editor. */}
                    {n > 0 && (n < 250 || n > 600) && <Chip size="small" label={`${n} palabras`} color="warning" sx={{ height: 20, fontSize: 11 }} />}
                    <Chip size="small" label={`${idsGaleria(c?.galeria).length} fotos en galería`} sx={{ height: 20, fontSize: 11 }} />
                    {c?.foto ? <Chip size="small" label={`apertura ${texto(c.foto)}`} sx={{ height: 20, fontSize: 11 }} /> : null}
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {abierta === d.fecha && (
                  <CamposFila campos={camposCronica(d.fecha)} prefijo={`cronica-${d.fecha}:`}
                    datos={{ ...(c ?? { kicker: kickerDe(i, d.fecha, d.ambito) }), galeria: idsGaleria(c?.galeria) }}
                    poner={(k, v) => ponerCronica(d.fecha, i, d.ambito, k, v)} />
                )}
              </AccordionDetails>
            </Accordion>
          )
        })}
      </Bloque>
      <Bloque>
        <Titulo>Balance y seguimiento</Titulo>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Cifras y gráfico se calculan solos; escriba aquí su lectura.
        </Typography>
        <CamposFila campos={balance} datos={datosVista} poner={ponerVista} pendientes={pendientes} />
      </Bloque>
      <Bloque>
        <Titulo>Compromisos, conclusiones y cierre</Titulo>
        <CamposFila campos={cierre} datos={datosVista} poner={ponerVista} pendientes={pendientes} />
      </Bloque>
      {([['Créditos, fuentes y contraportada', creditos], ['Edición interna (documento de trabajo de la entidad)', interna]] as [string, Campo[]][]).map(([titulo, campos]) => (
        <Accordion key={titulo} disableGutters sx={{ mt: 2, bgcolor: 'transparent', boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography sx={{ fontWeight: 600 }}>{titulo}</Typography></AccordionSummary>
          <AccordionDetails><CamposFila campos={campos} datos={datosVista} poner={ponerVista} pendientes={pendientes} /></AccordionDetails>
        </Accordion>
      ))}
      {/* Guardar y ver, siempre a mano al pie del formulario. */}
      <Box sx={{ position: 'sticky', bottom: { xs: 'calc(58px + env(safe-area-inset-bottom))', sm: 0 }, zIndex: 2, display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', mt: 3, py: 1, bgcolor: PALETA.fondo, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
          {guardando ? 'Guardando…' : previsualizando ? `Componiendo la vista previa… ${segundos} s`
            : sucio ? 'Se guarda solo al dejar de escribir' : guardadoEn ? `Guardado ${guardadoEn.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}` : 'Todo guardado'}
        </Typography>
        <Button variant="contained" onClick={() => void guardar(false)} disabled={guardando || previsualizando}
          startIcon={guardando || previsualizando ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}>
          {guardando || previsualizando ? 'Guardando y compilando…' : 'Guardar'}
        </Button>
      </Box>
    </Box>
  )

  const generado = s.pdfs.find((p) => !p.una_columna) ?? s.pdfs[0]
  const ruta = modo === 'generado' && generado
    ? `/api/informes-sr/${encodeURIComponent(s.carpeta)}/${encodeURIComponent(generado.nombre)}`
    : modo === 'vista' && vista ? `/api/semanas/${s.id}/vista-previa` : ''
  const visor = (
    <Paper variant="outlined" sx={{ borderRadius: 2, borderColor: PALETA.borde, display: 'flex', flexDirection: 'column', height: dosColumnas ? 'calc(100vh - 150px)' : { xs: 'calc(100dvh - 250px)', sm: 'calc(100dvh - 190px)' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={modo} onChange={(_, v) => v && setModo(v)} sx={{ '& .MuiToggleButton-root': { textTransform: 'none', py: 0.25, px: 1.25, fontSize: 12.5 } }}>
          <ToggleButton value="vista">Vista previa</ToggleButton>
          <ToggleButton value="generado" disabled={!generado}>{generado ? `Generado v${generado.version}` : 'Generado'}</ToggleButton>
        </ToggleButtonGroup>
        {/* La vista previa se rehace sola en cada guardado. */}
      </Box>
      <Box sx={{ px: 1.5, pt: 0.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', minHeight: 26 }}>
        {/* 2026-10-06: mientras se compone no hay texto (quedan el contador del pie y la rueda) y,
            sin vista previa, tampoco; el aviso de desactualizada es solo un indicador. */}
        <Typography variant="caption" color="text.secondary">
          {modo === 'generado' && generado ? `Último PDF generado (${generado.estado}).`
            : !previsualizando && vista ? `Vista previa · ${vista.paginas} págs. · no se registra` : ''}
        </Typography>
        {modo === 'vista' && desactualizada && !previsualizando && (
          <Chip size="small" color="warning" variant="outlined" label="Vista previa desactualizada" />
        )}
      </Box>
      {erroresVista.length > 0 && modo === 'vista' && (
        <Alert severity="warning" sx={{ m: 1, '& pre': { whiteSpace: 'pre-wrap', fontSize: 11.5, m: 0 } }} onClose={() => setErroresVista([])}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>No se pudo armar la vista previa:</Typography>
          {erroresVista.map((e) => <pre key={e}>{e}</pre>)}
        </Alert>
      )}
      <Box sx={{ p: 1, flex: 1, minHeight: 0 }}>
        <VisorPdf
          ruta={ruta}
          version={modo === 'vista' ? vista?.marca ?? 0 : generado?.nombre}
          cargando={modo === 'vista' && previsualizando}
          alto="100%"
          nombre={modo === 'generado' && generado ? generado.nombre : `ISR-${String(s.numero).padStart(2, '0')}_vista-previa.pdf`}
          archivos={archivosSemana(s.carpeta, s.pdfs)}
          claveInicial={modo === 'generado' && generado ? generado.nombre : ''}
          vacio={
            <Box sx={{ textAlign: 'center', px: 2 }}>
              {!previsualizando && (
                <Typography variant="body2" color="text.secondary">La vista previa aparece sola al guardar (Ctrl+S o una pausa al escribir).</Typography>
              )}
            </Box>
          }
        />
      </Box>
    </Paper>
  )

  if (dosColumnas) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 2, alignItems: 'start' }}>
        <Box sx={{ minWidth: 0, height: 'calc(100vh - 150px)', overflowY: 'auto', pr: 1 }}>{formulario}</Box>
        <Box sx={{ minWidth: 0, position: 'sticky', top: 12 }}>{visor}</Box>
      </Box>
    )
  }
  return (
    <Box>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 5, mx: { xs: -1.5, sm: -2.5 }, mt: { xs: -1.5, sm: -2.5 }, mb: 1.5, px: { xs: 1.5, sm: 2.5 }, py: 0.75, bgcolor: PALETA.fondo, borderBottom: '1px solid', borderColor: 'divider' }}>
        <ToggleButtonGroup fullWidth size="small" exclusive value={panel} onChange={(_, v) => v && setPanel(v)} sx={{ bgcolor: 'background.paper', '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 13.5, py: 0.6 } }}>
          <ToggleButton value="redactar">Redactar{sucio ? ' •' : ''}</ToggleButton>
          <ToggleButton value="pdf">Ver el informe{desactualizada ? ' •' : ''}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: panel === 'redactar' ? 'block' : 'none' }}>{formulario}</Box>
      <Box sx={{ display: panel === 'pdf' ? 'block' : 'none' }}>{visor}</Box>
    </Box>
  )
}

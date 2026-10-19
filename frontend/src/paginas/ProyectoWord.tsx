/**
 * FORMATO WORD DE UN PROYECTO DE LEY (2026-10-19; Edison: «la modalidad Word también en Proyectos de
 * Ley»). Todas las partes del proyecto, en el orden del esquema, como páginas de un solo documento
 * largo (`SeccionParte` sobre el armazón común `EspacioWord`): se escribe de corrido, con la barra de
 * formato e insertar, los estilos de párrafo, el panel de partes y notas, la Conversación de la parte
 * activa (comentarios) y el guardado de siempre por parte (versiones, edición simultánea). Lo que es
 * del trámite —revisión, aprobación, vista PDF, comparativo, generar— sigue en la pestaña Texto.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Editor } from '@tiptap/react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import SaveIcon from '@mui/icons-material/Save'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import HistoryIcon from '@mui/icons-material/History'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import { api, apiPdf, descargarDirecto } from '../api'
import EspacioWord from '../componentes/word/EspacioWord'
import SeccionParte, { type ParteWord } from '../componentes/word/SeccionParte'
import ComentariosParte from '../componentes/word/ComentariosParte'
import type { ManejadorSeccion } from '../componentes/word/SeccionWord'
import type { NotaResumen, SeccionResumen } from '../componentes/word/PanelEstructura'
import type { ControlReferencias } from '../extensiones/AutocompletarReferencias'
import BotonFotografia from '../componentes/BotonFotografia'
import { SEPARADOR, type ItemMenu } from '../componentes/word/menus'
import { usePartesProyecto } from '../componentes/PartesProyecto'

interface ProyectoWordDatos {
  id: number
  codigo: string
  titulo: string
  colaboracion?: boolean
  secciones: ParteWord[]
  grupos: Record<string, string>
}

export default function ProyectoWord() {
  const { id } = useParams()
  const pid = Number(id)
  const [p, setP] = useState<ProyectoWordDatos | null>(null)
  const [error, setError] = useState('')
  const [activo, setActivo] = useState<number | null>(null)
  const [editores, setEditores] = useState<Record<number, Editor | null>>({})
  const controles = useRef<Record<number, ControlReferencias | undefined>>({})
  const [resumenes, setResumenes] = useState<Record<number, SeccionResumen>>({})
  const [notas, setNotas] = useState<Record<number, NotaResumen[]>>({})
  const [anchoHoja, setAnchoHoja] = useState(794)
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'info' | 'warning' | 'error'; texto: string } | null>(null)
  const manejadores = useRef<Record<number, ManejadorSeccion | null>>({})
  const refs = useRef<Record<number, (m: ManejadorSeccion | null) => void>>({})
  const refDe = (k: number) => (refs.current[k] ??= (m) => { manejadores.current[k] = m })

  const cargar = useCallback(async () => {
    try {
      const d = await api<ProyectoWordDatos>(`/api/proyectos/${pid}`)
      setP(d)
      // La parte activa se identifica por su id (estable aunque se reordene o se quite otra).
      setActivo((a) => (a != null && d.secciones.some((s) => s.id === a) ? a : d.secciones[0]?.id ?? null))
      return d
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el proyecto.')
      return null
    }
  }, [pid])
  useEffect(() => { void cargar() }, [cargar])

  const alActivar = useCallback((k: number) => setActivo((a) => (a === k ? a : k)), [])
  const alEditor = useCallback((k: number, e: Editor | null, control?: ControlReferencias) => { if (control) controles.current[k] = control; setEditores((x) => (x[k] === e ? x : { ...x, [k]: e })) }, [])
  const alCambio = useCallback((r: SeccionResumen, n: NotaResumen[]) => {
    setResumenes((x) => ({ ...x, [r.id]: r }))
    setNotas((x) => ({ ...x, [r.id]: n }))
  }, [])
  const guardarTodo = async () => {
    const pendientes = Object.values(manejadores.current).filter((m): m is ManejadorSeccion => Boolean(m?.sucio))
    const r = await Promise.all(pendientes.map((m) => m.guardar()))
    setAviso(r.every(Boolean) ? { tipo: 'success', texto: pendientes.length ? 'Todo guardado.' : 'No había cambios por guardar.' } : { tipo: 'warning', texto: 'Algo no se pudo guardar; revise las partes marcadas.' })
  }

  const navegar = useNavigate()
  const fallo = (e: unknown, texto: string) => setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : texto })
  const descargar = (ruta: string) => { void descargarDirecto(ruta).catch((e) => fallo(e, 'No se pudo exportar.')) }
  // Imprimir: se guarda lo pendiente, se compone la vista previa del proyecto entero y se abre el PDF.
  const imprimir = () => {
    void (async () => {
      await Promise.all(Object.values(manejadores.current).filter((m): m is ManejadorSeccion => Boolean(m?.sucio)).map((m) => m.guardar()))
      await api(`/api/proyectos/${pid}/vista-previa`, { method: 'POST', body: JSON.stringify({ clave: '', contenido: null }) })
      window.open(await apiPdf(`/api/proyectos/${pid}/vista-previa`), '_blank', 'noopener')
    })().catch((e) => fallo(e, 'No se pudo componer el PDF.'))
  }
  const partes = p?.secciones ?? []
  const secciones: SeccionResumen[] = partes.map((s) => ({ ...(resumenes[s.id] ?? { id: s.id, tipoNombre: s.titulo, rotulo: p?.grupos[s.grupo] ?? s.grupo, campos: { asunto: s.titulo }, estado: s.estado, numero: null, sucio: false }), arrastrable: !s.fija && s.clave !== 'titulo' }))
  const haySucio = secciones.some((s) => s.sucio)
  const parteActiva = activo != null ? partes.find((s) => s.id === activo) : undefined
  // Partes editables (2026-10-19): «Añadir parte», ⋮ (renombrar, subir, bajar, quitar) y arrastre.
  const edicionPartes = usePartesProyecto({ pid, partes, recargar: cargar, avisar: (tipo, texto) => setAviso({ tipo, texto }), soloLectura: localStorage.getItem('sgdp_rol') === 'invitado' })
  const porId = (id: number) => partes.find((s) => s.id === id)
  const editorActivo = activo != null ? editores[activo] ?? null : null
  const abrirVersiones = activo != null ? () => manejadores.current[activo]?.abrirHistorial?.() : undefined
  const archivo: ItemMenu[] = [
    { texto: 'Guardar todo', icono: <SaveIcon fontSize="small" />, deshabilitado: !haySucio, accion: () => void guardarTodo() },
    { texto: 'Ver o imprimir el PDF (vista previa)', icono: <PrintOutlinedIcon fontSize="small" />, accion: imprimir },
    { texto: 'Versiones de esta parte', icono: <HistoryIcon fontSize="small" />, deshabilitado: !abrirVersiones, accion: abrirVersiones },
    { texto: 'Descargar', icono: <DownloadOutlinedIcon fontSize="small" />, hijos: [
      { texto: 'Word (.docx): copia de trabajo', accion: () => descargar(`/api/proyectos/${pid}/docx`) },
      { texto: 'Markdown (.md): para un prompt o el chat', accion: () => descargar(`/api/proyectos/${pid}/md`) },
    ] },
    SEPARADOR,
    { texto: 'Volver al proyecto (trámite, revisión, comparativo)', icono: <ArrowBackIcon fontSize="small" />, accion: () => navegar(`/proyectos/${pid}?modalidad=formulario`) },
  ]

  if (error) return <Box sx={{ p: 4 }}><Alert severity="error">{error}</Alert></Box>
  if (!p) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
  return (
    <EspacioWord
      modulo="proyectos"
      titulo={`Formato Word · ${p.codigo || p.titulo}`}
      volver={`/proyectos/${pid}?modalidad=formulario`}
      archivo={archivo}
      alImprimir={imprimir}
      alHistorial={abrirVersiones}
      imagen={editorActivo ? <BotonFotografia soloIcono editor={editorActivo} pid={pid} alAvisar={(tipo, texto) => setAviso({ tipo, texto })} /> : undefined}
      enlaceCompartir={`${window.location.origin}/proyectos/${pid}/word`}
      alAviso={(tipo, texto) => setAviso({ tipo, texto })}
      icono={<GavelOutlinedIcon sx={{ fontSize: { xs: 28, md: 36 } }} />}
      editorActivo={editorActivo}
      controlActivo={activo != null ? controles.current[activo] ?? null : null}
      contextoReferencias="parte"
      secciones={secciones}
      activo={activo}
      notas={activo != null ? notas[activo] ?? [] : []}
      alIr={(k) => { alActivar(k); manejadores.current[k]?.desplazar() }}
      alNota={(pos) => { if (activo != null) manejadores.current[activo]?.irANota(pos) }}
      alNuevo={localStorage.getItem('sgdp_rol') === 'invitado' ? undefined : edicionPartes.abrirAnadir}
      rotuloLista="Partes"
      textoNuevo="Añadir parte"
      menuSeccion={(s) => { const parte = porId(s.id); return parte ? edicionPartes.menuDe(parte) : [] }}
      alMoverSeccion={(id, destino) => { const a = porId(id); const b = porId(destino); if (a && b) edicionPartes.mover(a.clave, b.clave) }}
      tituloBarra="Artículo o apartado"
      panelExtra={parteActiva ? <ComentariosParte pid={pid} clave={parteActiva.clave} titulo={parteActiva.titulo} editor={activo != null ? editores[activo] ?? null : null} alAviso={(tipo, texto) => setAviso({ tipo, texto })} /> : null}
      alAncho={setAnchoHoja}
      vacio={<Box sx={{ p: 4, textAlign: 'center' }}><Alert severity="info">Este proyecto no tiene partes todavía.</Alert></Box>}
    >
      {partes.map((s, k) => (
        <SeccionParte
          key={s.clave}
          ref={refDe(s.id)}
          pid={pid}
          id={s.id}
          indice={k}
          parte={s}
          grupoNombre={p.grupos[s.grupo] ?? s.grupo}
          colaboracion={Boolean(p.colaboracion)}
          anchoHoja={anchoHoja}
          activo={s.id === activo}
          alActivar={alActivar}
          alEditor={alEditor}
          alCambio={alCambio}
          alRecargar={cargar}
          alAviso={(tipo, texto) => setAviso({ tipo, texto })}
        />
      ))}
      {edicionPartes.elementos}
      <Snackbar open={aviso !== null} autoHideDuration={6000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {aviso ? <Alert severity={aviso.tipo} variant="filled" onClose={() => setAviso(null)} sx={{ maxWidth: 'calc(100vw - 32px)' }}>{aviso.texto}</Alert> : undefined}
      </Snackbar>
    </EspacioWord>
  )
}

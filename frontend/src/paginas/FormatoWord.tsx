/**
 * FORMATO WORD — el espacio de trabajo (2026-10-19; fase 2 de docs/plataforma/formato-word.md).
 *
 * La segunda modalidad de Gestión documental, pedida por Edison: redactar «como en Word», varios
 * oficios en un mismo espacio, sin formulario por documento. No es otro editor: cada sección es un
 * documento real del sistema (`SeccionWord`, con el editor TipTap del formulario y su guardado), así
 * que registro, numeración, revisión, firma y seguimiento siguen siendo los de siempre, uno por uno.
 * Qué documentos tiene abierto cada cuenta lo recuerda `/api/ajustes/espacio-word` (celular y
 * escritorio ven lo mismo). Arriba, pegada, la barra de formato e insertar de la sección activa y el
 * estilo de párrafo; a la izquierda (o en una hoja inferior en el celular), la estructura: secciones y
 * notas al pie. «Añadir»: un documento nuevo, varios desde un Word (fase 0), el resultado de un prompt
 * (fase 4) o un borrador que ya existe.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import type { Editor } from '@tiptap/react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import SaveIcon from '@mui/icons-material/Save'
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined'
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined'
import ContentPasteGoOutlinedIcon from '@mui/icons-material/ContentPasteGoOutlined'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import HistoryIcon from '@mui/icons-material/History'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import CloseIcon from '@mui/icons-material/Close'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { api, apiPdf, descargarDirecto } from '../api'
import CargarWordDocumentos from '../componentes/CargarWordDocumentos'
import PegarDocumento from '../componentes/PegarDocumento'
import SeccionWord, { type ContenidoInicial, type ManejadorSeccion } from '../componentes/word/SeccionWord'
import EspacioWord from '../componentes/word/EspacioWord'
import ComentariosWord from '../componentes/word/ComentariosWord'
import CajonActividad from '../componentes/CajonActividad'
import type { NotaResumen, SeccionResumen } from '../componentes/word/PanelEstructura'
import type { ControlReferencias } from '../extensiones/AutocompletarReferencias'
import { conDocumento, sinDocumento } from '../componentes/word/modelo'
import { SEPARADOR, type ItemMenu } from '../componentes/word/menus'
import type { FormatoHoja } from '../componentes/word/BarraWord'

interface Espacio { documentos: number[]; activo: number | null }
interface TipoDoc { codigo: string; nombre: string; externo?: boolean }
interface Borrador { id: number; tipo_nombre: string; numero: number | null; origen: string; asunto: string; destinatario: string }

export default function FormatoWord() {
  const [consulta, setConsulta] = useSearchParams()
  const [espacio, setEspacio] = useState<Espacio | null>(null)
  const [tipos, setTipos] = useState<TipoDoc[]>([])
  const [resumenes, setResumenes] = useState<Record<number, SeccionResumen>>({})
  const [notas, setNotas] = useState<Record<number, NotaResumen[]>>({})
  const [iniciales, setIniciales] = useState<Record<number, ContenidoInicial>>({})
  const [menuAnadir, setMenuAnadir] = useState<HTMLElement | null>(null)
  const [menuTipos, setMenuTipos] = useState<{ ancla: HTMLElement; para: 'nuevo' | 'pegar' } | null>(null)
  const [dialogoWord, setDialogoWord] = useState(false)
  const [pegarTipo, setPegarTipo] = useState<string | null>(null)
  const [abrirExistente, setAbrirExistente] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'info' | 'warning' | 'error'; texto: string } | null>(null)
  const [historialDe, setHistorialDe] = useState<number | null>(null)
  const [editores, setEditores] = useState<Record<number, Editor | null>>({})
  const controles = useRef<Record<number, ControlReferencias | undefined>>({})
  const manejadores = useRef<Record<number, ManejadorSeccion | null>>({})
  const refsSecciones = useRef<Record<number, (m: ManejadorSeccion | null) => void>>({})
  const refDe = (id: number) => (refsSecciones.current[id] ??= (m) => { manejadores.current[id] = m })
  const [anchoHoja, setAnchoHoja] = useState(794)

  // El espacio de esta cuenta y los tipos redactables.
  useEffect(() => {
    api<Espacio>('/api/ajustes/espacio-word').then((e) => setEspacio({ documentos: e.documentos ?? [], activo: e.activo ?? null })).catch(() => setEspacio({ documentos: [], activo: null }))
    api<TipoDoc[]>('/api/tipos').then((t) => setTipos(t.filter((x) => !x.externo))).catch(() => {})
  }, [])
  // `?doc=N` trae un documento al espacio (desde la bandeja); `?nuevo=1` abre «Añadir» de entrada.
  useEffect(() => {
    if (!espacio) return
    const doc = Number(consulta.get('doc') ?? '') || 0
    if (doc) {
      setEspacio((e) => (e ? conDocumento(e, doc) : e))
      setConsulta((c) => { const n = new URLSearchParams(c); n.delete('doc'); return n }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [espacio !== null, consulta])
  // Se recuerda en el servidor en cuanto cambia (sin bloquear la escritura).
  const primeraVez = useRef(true)
  useEffect(() => {
    if (!espacio) return
    if (primeraVez.current) { primeraVez.current = false; return }
    const t = window.setTimeout(() => { void api('/api/ajustes/espacio-word', { method: 'PUT', body: JSON.stringify(espacio) }).catch(() => {}) }, 600)
    return () => window.clearTimeout(t)
  }, [espacio])
  const activo = espacio?.activo ?? null
  const editorActivo = activo != null ? editores[activo] ?? null : null
  const alEditor = useCallback((id: number, e: Editor | null, control?: ControlReferencias) => { if (control) controles.current[id] = control; setEditores((x) => (x[id] === e ? x : { ...x, [id]: e })) }, [])
  const alActivar = useCallback((id: number) => setEspacio((e) => (e && e.activo !== id ? { ...e, activo: id } : e)), [])
  const alCambio = useCallback((r: SeccionResumen, n: NotaResumen[]) => {
    setResumenes((x) => ({ ...x, [r.id]: r }))
    setNotas((x) => ({ ...x, [r.id]: n }))
  }, [])
  const quitar = useCallback((id: number) => {
    void manejadores.current[id]?.guardar()
    setEspacio((e) => (e ? sinDocumento(e, id) : e))
    setResumenes((x) => { const n = { ...x }; delete n[id]; return n })
  }, [])
  const anadir = (id: number, inicial?: ContenidoInicial) => {
    if (inicial) setIniciales((x) => ({ ...x, [id]: inicial }))
    setEspacio((e) => (e ? conDocumento(e, id) : e))
    window.setTimeout(() => manejadores.current[id]?.desplazar(), 400)
  }
  const crear = async (tipo: string, inicial?: ContenidoInicial) => {
    try {
      const { id } = await api<{ id: number }>('/api/documentos', { method: 'POST', body: JSON.stringify({ tipo }) })
      anadir(id, inicial)
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo crear el documento.' })
    }
  }
  const guardarTodo = async () => {
    const pendientes = Object.values(manejadores.current).filter((m): m is ManejadorSeccion => Boolean(m?.sucio))
    const resultados = await Promise.all(pendientes.map((m) => m.guardar()))
    setAviso(resultados.every(Boolean) ? { tipo: 'success', texto: pendientes.length ? 'Todo guardado.' : 'No había cambios por guardar.' } : { tipo: 'warning', texto: 'Algo no se pudo guardar; revise las secciones marcadas.' })
  }
  const irA = (id: number) => { alActivar(id); manejadores.current[id]?.desplazar() }
  const irANota = (pos: number) => { if (activo != null) manejadores.current[activo]?.irANota(pos) }

  const secciones: SeccionResumen[] = (espacio?.documentos ?? []).map((id) => resumenes[id] ?? { id, tipoNombre: '', campos: {}, estado: '', numero: null, sucio: false, cargando: true })
  const haySucio = secciones.some((s) => s.sucio)
  const elegirTipo = (codigo: string) => {
    const para = menuTipos?.para
    setMenuTipos(null)
    if (para === 'nuevo') void crear(codigo)
    else if (para === 'pegar') setPegarTipo(codigo)
  }
  // Lo que la BarraWord (título, menús y píldora, 2026-10-19) necesita del documento activo.
  const navegar = useNavigate()
  const fallo = (e: unknown, texto: string) => setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : texto })
  const imprimir = activo != null ? () => {
    const id = activo
    void (manejadores.current[id]?.guardar() ?? Promise.resolve(true)).then(() => apiPdf(`/api/documentos/${id}/pdf`)).then((url) => { window.open(url, '_blank', 'noopener') }).catch((e) => fallo(e, 'No se pudo abrir el PDF.'))
  } : undefined
  const descargar = (ruta: string) => { void descargarDirecto(ruta).catch((e) => fallo(e, 'No se pudo exportar.')) }
  const resumenActivo = activo != null ? resumenes[activo] : undefined
  const formato: FormatoHoja | null = activo != null && resumenActivo && !resumenActivo.cargando && editorActivo?.isEditable
    ? {
      tamano: resumenActivo.campos.fmt_tamano ?? '',
      interlineado: resumenActivo.campos.fmt_interlineado ?? '',
      alTamano: (v) => manejadores.current[activo]?.ponerCampo?.('fmt_tamano', v),
      alInterlineado: (v) => manejadores.current[activo]?.ponerCampo?.('fmt_interlineado', v),
    }
    : null
  const porTipo = (para: 'nuevo' | 'pegar'): ItemMenu[] => tipos.map((t) => ({ texto: t.nombre, accion: () => { if (para === 'nuevo') void crear(t.codigo); else setPegarTipo(t.codigo) } }))
  const archivo: ItemMenu[] = [
    { texto: 'Documento nuevo', icono: <NoteAddOutlinedIcon fontSize="small" />, hijos: porTipo('nuevo'), deshabilitado: tipos.length === 0 },
    { texto: 'Desde un Word (uno o varios)…', icono: <UploadFileOutlinedIcon fontSize="small" />, accion: () => setDialogoWord(true) },
    { texto: 'Pegar el resultado de un prompt', icono: <ContentPasteGoOutlinedIcon fontSize="small" />, hijos: porTipo('pegar'), deshabilitado: tipos.length === 0 },
    { texto: 'Traer un borrador que ya existe…', icono: <FolderOpenOutlinedIcon fontSize="small" />, accion: () => setAbrirExistente(true) },
    SEPARADOR,
    { texto: 'Guardar todo', icono: <SaveIcon fontSize="small" />, deshabilitado: !haySucio, accion: () => void guardarTodo() },
    { texto: 'Ver o imprimir el PDF', icono: <PrintOutlinedIcon fontSize="small" />, deshabilitado: !imprimir, accion: imprimir },
    { texto: 'Historial y versiones', icono: <HistoryIcon fontSize="small" />, deshabilitado: activo == null, accion: () => { if (activo != null) setHistorialDe(activo) } },
    { texto: 'Descargar', icono: <DownloadOutlinedIcon fontSize="small" />, deshabilitado: activo == null, hijos: [
      { texto: 'Word (.docx): copia de trabajo', accion: () => descargar(`/api/documentos/${activo}/docx`) },
      { texto: 'Markdown (.md): para un prompt o el chat', accion: () => descargar(`/api/documentos/${activo}/md`) },
    ] },
    { texto: 'Abrir en el formulario (trámite, numeración, firma)', icono: <OpenInNewIcon fontSize="small" />, deshabilitado: activo == null, accion: () => navegar(`/documentos/${activo}?modalidad=formulario`) },
    SEPARADOR,
    { texto: 'Quitar del espacio (sigue en la bandeja)', icono: <CloseIcon fontSize="small" />, deshabilitado: activo == null, accion: () => { if (activo != null) quitar(activo) } },
    { texto: 'Volver a la bandeja', icono: <ArrowBackIcon fontSize="small" />, accion: () => navegar('/documentos') },
  ]

  return (
    <EspacioWord
      modulo="documentos"
      titulo="Formato Word"
      volver="/documentos"
      archivo={archivo}
      formato={formato}
      alImprimir={imprimir}
      alHistorial={activo != null ? () => setHistorialDe(activo) : undefined}
      enlaceCompartir={activo != null ? `${window.location.origin}/documentos/${activo}` : undefined}
      alAviso={(tipo, texto) => setAviso({ tipo, texto })}
      editorActivo={editorActivo}
      controlActivo={activo != null ? controles.current[activo] ?? null : null}
      contextoReferencias="documento"
      secciones={secciones}
      activo={activo}
      notas={activo != null ? notas[activo] ?? [] : []}
      alIr={irA}
      alNota={irANota}
      alNuevo={(a) => setMenuAnadir(a)}
      panelExtra={activo != null ? <ComentariosWord documentoId={activo} editor={editorActivo} alAviso={(tipo, texto) => setAviso({ tipo, texto })} /> : null}
      alAncho={setAnchoHoja}
      vacio={espacio && (
        <Box sx={{ maxWidth: 520, mx: 'auto', textAlign: 'center', py: 6 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Redacte como en Word</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Varios oficios en un mismo espacio, cada uno con su registro y su número. Empiece con un documento nuevo, traiga un Word o pegue el resultado de un prompt.</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={(e) => setMenuAnadir(e.currentTarget)}>Añadir</Button>
        </Box>
      )}
    >
      {espacio?.documentos.map((id, i) => (
        <SeccionWord
          key={id}
          ref={refDe(id)}
          id={id}
          indice={i}
          total={espacio.documentos.length}
          anchoHoja={anchoHoja}
          activo={id === activo}
          inicial={iniciales[id]}
          alActivar={alActivar}
          alEditor={alEditor}
          alCambio={alCambio}
          alQuitar={quitar}
          alHistorial={setHistorialDe}
          alAviso={(tipo, texto) => setAviso({ tipo, texto })}
        />
      ))}
      {/* El historial y las versiones del documento activo: el mismo cajón del formulario. */}
      {historialDe != null && (
        <CajonActividad
          documentoId={String(historialDe)}
          abierto
          alCerrar={() => setHistorialDe(null)}
          incluirVersiones
          alRestaurar={() => { void manejadores.current[historialDe]?.recargar(); setAviso({ tipo: 'success', texto: 'Versión restaurada.' }) }}
        />
      )}
      <Menu anchorEl={menuAnadir} open={menuAnadir !== null} onClose={() => setMenuAnadir(null)}>
        <MenuItem onClick={(e) => { setMenuTipos({ ancla: e.currentTarget, para: 'nuevo' }); setMenuAnadir(null) }}>Documento nuevo…</MenuItem>
        <MenuItem onClick={() => { setMenuAnadir(null); setDialogoWord(true) }}>Desde un Word (uno o varios)…</MenuItem>
        <MenuItem onClick={(e) => { setMenuTipos({ ancla: e.currentTarget, para: 'pegar' }); setMenuAnadir(null) }}>Pegar el resultado de un prompt…</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenuAnadir(null); setAbrirExistente(true) }}>Un borrador que ya existe…</MenuItem>
      </Menu>
      <Menu anchorEl={menuTipos?.ancla ?? null} open={menuTipos !== null} onClose={() => setMenuTipos(null)}>
        {tipos.map((t) => <MenuItem key={t.codigo} onClick={() => elegirTipo(t.codigo)}>{t.nombre}</MenuItem>)}
      </Menu>
      <CargarWordDocumentos abierto={dialogoWord} tipos={tipos} alCerrar={() => setDialogoWord(false)} alCreados={(creados) => creados.forEach((c) => anadir(c.id))} alAvisar={(tipo, texto) => setAviso({ tipo: tipo === 'ok' ? 'success' : 'error', texto })} />
      {pegarTipo && (
        <PegarDocumento
          abierto
          tipo={pegarTipo}
          campos={{}}
          cuerpoTexto=""
          alCerrar={() => setPegarTipo(null)}
          alAplicar={(campos, cuerpoHtml) => { const t = pegarTipo; setPegarTipo(null); void crear(t, { campos, cuerpoHtml }) }}
        />
      )}
      <DialogoBorradores abierto={abrirExistente} excluir={espacio?.documentos ?? []} alCerrar={() => setAbrirExistente(false)} alElegir={(id) => { setAbrirExistente(false); anadir(id) }} />
      <Snackbar open={aviso !== null} autoHideDuration={6000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {aviso ? <Alert severity={aviso.tipo} variant="filled" onClose={() => setAviso(null)} sx={{ maxWidth: 'calc(100vw - 32px)' }}>{aviso.texto}</Alert> : undefined}
      </Snackbar>
    </EspacioWord>
  )
}

/** Los borradores del sistema que aún no están en el espacio, para traer uno. */
function DialogoBorradores({ abierto, excluir, alCerrar, alElegir }: { abierto: boolean; excluir: number[]; alCerrar: () => void; alElegir: (id: number) => void }) {
  const [lista, setLista] = useState<Borrador[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!abierto) return
    api<Borrador[]>('/api/documentos').then((d) => setLista(d.filter((x) => x.numero == null && (x.origen ?? 'sgdp') === 'sgdp'))).catch(() => setLista([]))
  }, [abierto])
  const n = q.trim().toLowerCase()
  const visibles = useMemo(() => lista.filter((x) => !excluir.includes(x.id) && (!n || `${x.asunto} ${x.destinatario} ${x.tipo_nombre}`.toLowerCase().includes(n))).slice(0, 40), [lista, excluir, n])
  return (
    <Dialog open={abierto} onClose={alCerrar} fullWidth maxWidth="sm">
      <DialogTitle>Traer un borrador</DialogTitle>
      <DialogContent dividers sx={{ p: 1 }}>
        <TextField size="small" fullWidth autoFocus placeholder="Buscar por asunto o destinatario" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 1 }} />
        <List dense disablePadding>
          {visibles.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No hay borradores fuera del espacio.</Typography>}
          {visibles.map((x) => (
            <ListItemButton key={x.id} onClick={() => alElegir(x.id)}>
              <ListItemText primary={x.asunto || 'Sin asunto'} secondary={`${x.tipo_nombre}${x.destinatario ? ` · ${x.destinatario}` : ''}`} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  )
}

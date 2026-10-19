/**
 * EditorParteCompartida — una parte de un proyecto en EDICIÓN SIMULTÁNEA
 * (fase 5, 2026-10-01; diseño en docs/plataforma/fase-5-edicion-simultanea.md).
 *
 * Varias personas escriben a la vez el mismo texto: Yjs une las ediciones y el
 * servidor de colaboración (frontend/colab/servidor.ts, por /colab) las reparte
 * con el cursor y el nombre de cada una. No hay candado. «Guardar» sigue
 * creando la versión con nota; lo escrito entre versiones lo conserva el
 * servidor como borrador vivo.
 *
 * El texto compartido se llama `pl:<proyecto>:<parte>:<generación>`. Si la
 * generación cambia (alguien restauró una versión, se apagó el modo…), el
 * nombre cambia, el padre monta un editor nuevo y el estado viejo se descarta
 * entero: unirlo con el nuevo duplicaría el texto (servicios/colab.py).
 *
 * Si el servidor no responde al abrir, `alFallar` devuelve la página al modo
 * por turnos (con candado), que no depende de él.
 */
import { useEffect, useMemo, useState } from 'react'
import { PALETA } from '../paleta'
import { useEditor, EditorContent } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Avatar from '@mui/material/Avatar'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import TableChartIcon from '@mui/icons-material/TableChartOutlined'
import SaveIcon from '@mui/icons-material/Save'
import { api, ErrorApi } from '../api'
import { extensionesParte } from '../extensiones/esquema'
import { AutocompletarReferencias, crearControl } from '../extensiones/AutocompletarReferencias'
import PopupReferencias, { avisarRelaciones, useAvisoReferencias } from './PopupReferencias'
import { MenuEstructura } from './EstructuraLey'
import { plantillaParte } from '../estructuraLey'
import BotonFotografia from './BotonFotografia'
import BarraFormato, { MenuTabla, barraFija, estiloContenido, useMenuTabla } from './BarraFormato'
import { colorDe, estiloCursores, useOtrosEnTexto, useProveedorCompartido, type EstadoConexion } from './textoCompartido'

export interface ParteCompartida {
  clave: string
  titulo: string
  contenido: object
  version: number
  generacion: number
  sin_versionar: boolean
}

type Aviso = (tipo: 'success' | 'error' | 'info', t: string) => void

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

/** JSON canónico (claves ordenadas) para saber si hay algo sin versionar. */
function estable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(estable).join(',')}]`
  if (x && typeof x === 'object') {
    return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${estable((x as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(x)
}

export default function EditorParteCompartida({
  pid, s, lectura, alGuardar, alAvisar, alPrevisualizar, alFallar, enPanel = false,
}: {
  /** Escritorio (tres columnas): barras quietas y solo el texto se desplaza dentro del recuadro. */
  enPanel?: boolean
  pid: number
  s: ParteCompartida
  lectura: boolean
  /** Recargar el proyecto (versión, generación, borradores). */
  alGuardar: () => void
  alAvisar: Aviso
  alPrevisualizar: (contenido: object | null, auto?: boolean) => void
  /** El servidor compartido no responde: volver al modo por turnos. */
  alFallar: (motivo: string) => void
}) {
  const nombre = `pl:${pid}:${s.clave}:${s.generacion}`
  // La conexión (y su recarga y caída) es la común de todo texto compartido.
  const { proveedor, estado } = useProveedorCompartido(nombre, { alRecargar: alGuardar, alFallar })

  if (!proveedor) return <Box sx={{ minHeight: 280, flex: enPanel ? 1 : undefined }} />
  return (
    <Lienzo
      key={nombre}
      pid={pid}
      s={s}
      lectura={lectura}
      proveedor={proveedor}
      estado={estado}
      alGuardar={alGuardar}
      alAvisar={alAvisar}
      alPrevisualizar={alPrevisualizar}
      enPanel={enPanel}
    />
  )
}

function Lienzo({
  pid, s, lectura, proveedor, estado, alGuardar, alAvisar, alPrevisualizar, enPanel,
}: {
  enPanel: boolean
  pid: number
  s: ParteCompartida
  lectura: boolean
  proveedor: HocuspocusProvider
  estado: EstadoConexion
  alGuardar: () => void
  alAvisar: Aviso
  alPrevisualizar: (contenido: object | null, auto?: boolean) => void
}) {
  const yo = localStorage.getItem('sgdp_nombre') ?? 'Yo'
  const [nota, setNota] = useState('')
  const otros = useOtrosEnTexto(proveedor)
  const [pendiente, setPendiente] = useState(s.sin_versionar)
  const menuTabla = useMenuTabla()

  // Memorizadas: useEditor compara extensiones por identidad y recrearía el
  // editor (y su enlace con Yjs) en cada render.
  const controlReferencias = useMemo(crearControl, [])
  const extensiones = useMemo(
    () => [
      ...extensionesParte({ historial: false }),
      Collaboration.configure({ document: proveedor.document }),
      CollaborationCursor.configure({ provider: proveedor, user: { name: yo, color: colorDe(yo) } }),
      // Autocompletado de referencias (2026-10-06): «Ley …», «@…» citan y relacionan.
      AutocompletarReferencias.configure({ control: controlReferencias }),
    ],
    [proveedor, yo, controlReferencias],
  )
  const editor = useEditor({ extensions: extensiones, editable: !lectura }, [extensiones])
  useAvisoReferencias(editor, `pl:${pid}`, s.clave)

  // ¿Lo que hay difiere de la última versión? (habilita «Guardar»). La versión
  // se pasa por el esquema del editor para comparar con los mismos atributos.
  const base = useMemo(() => {
    if (!editor) return ''
    try {
      return estable(editor.schema.nodeFromJSON(s.contenido).toJSON())
    } catch {
      return ''
    }
  }, [editor, s.contenido])
  useEffect(() => {
    if (!editor) return
    let t = 0
    const medir = () => {
      window.clearTimeout(t)
      // getJSON + JSON canónico del texto entero: con pausa de 1 s, no a cada
      // tecla ('update' ya llega solo cuando cambia el documento).
      t = window.setTimeout(() => setPendiente(estable(editor.getJSON()) !== base), 1000)
    }
    medir()
    editor.on('update', medir)
    return () => {
      window.clearTimeout(t)
      editor.off('update', medir)
    }
  }, [editor, base])

  // Vista previa automática (2026-10-08, como en Documentos): tras 6 s sin cambios, el texto en
  // vivo (de todos) se compone a la derecha sin crear versión; ya no hay botón «Vista previa».
  useEffect(() => {
    if (!editor) return
    let t = 0
    const programar = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => alPrevisualizar(editor.getJSON(), true), 6000)
    }
    editor.on('update', programar)
    return () => {
      window.clearTimeout(t)
      editor.off('update', programar)
    }
  }, [editor, alPrevisualizar])

  const armarCuadro = async () => {
    if (!editor) return
    try {
      const r = await api<{ contenido: object; citas: number; pendientes: number }>(`/api/proyectos/${pid}/comparativo/armado`)
      if (r.citas === 0) {
        alAvisar('info', 'Aún no hay textos citados en las modificatorias.')
        return
      }
      // Pasa por Yjs como cualquier edición: todos ven el cuadro armado.
      editor.commands.setContent(r.contenido)
      // Texto breve, pedido de Edison (2026-10-06).
      alAvisar('info', `Cuadro armado: ${r.citas} artículo${r.citas > 1 ? 's' : ''}.` + (r.pendientes ? ` Falta el texto vigente de ${r.pendientes}.` : ''))
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo armar el cuadro.')
    }
  }

  const guardar = async () => {
    if (!editor) return
    try {
      const r = await api<{ version: number }>(`/api/proyectos/${pid}/secciones/${s.clave}`, {
        method: 'PUT',
        body: JSON.stringify({ contenido: editor.getJSON(), version_base: s.version, generacion: s.generacion, nota }),
      })
      setNota('')
      avisarRelaciones(`pl:${pid}`)
      alAvisar('success', `Versión v${r.version} guardada.`)
      alGuardar()
      alPrevisualizar(null)
    } catch (e) {
      const codigo = e instanceof ErrorApi ? (e.detalle as { codigo?: string } | undefined)?.codigo : undefined
      if (codigo === 'parte_modificada') {
        // Otra persona guardó una versión entre medio: el texto es el mismo
        // para todos, solo hay que tomar su número.
        alGuardar()
        alAvisar('info', 'Otra persona guardó antes. Pulse «Guardar» de nuevo.')
      } else {
        if (codigo === 'generacion_vieja') alGuardar()
        alAvisar('error', e instanceof Error ? e.message : 'No se pudo guardar.')
      }
    }
  }

  const etiquetaEstado =
    estado === 'en_vivo'
      ? { t: otros.length ? `En vivo · con ${otros.map((o) => o.name.split(' ')[0]).join(', ')}` : 'En vivo', c: 'success' as const, d: 'Se ve al instante y se conserva solo.' }
      : estado === 'reconectando'
        ? { t: 'Sin conexión: siga escribiendo', c: 'warning' as const, d: 'Siga escribiendo; no cierre la pestaña.' }
        : { t: 'Conectando…', c: 'default' as const, d: 'Abriendo el texto compartido.' }

  return (
    <Box sx={enPanel ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : undefined}>
      <Box
        sx={{
          border: '1px solid', borderColor: lectura ? 'divider' : 'primary.main', borderRadius: 1, p: 2, minHeight: 280,
          ...(enPanel ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, p: 0, overflow: 'hidden' } : {}),
          bgcolor: lectura ? PALETA.superficieTenue : 'background.paper',
          ...estiloContenido,
          '& .ProseMirror': { outline: 'none', minHeight: 240, fontSize: 14.5, lineHeight: 1.55 },
          '& .ProseMirror p': { my: 0.75 },
          '& .ProseMirror h3': { fontSize: 15, fontWeight: 700, mt: 1.5, mb: 0.5 },
          '& .ProseMirror h2': { fontSize: 14.5, fontWeight: 700, textAlign: 'center', mt: 2, mb: 0.25 },
          '& .ProseMirror blockquote': { ml: 4, pl: 1.5, my: 1, borderLeft: '3px solid', borderColor: 'divider', color: 'text.secondary' },
          // Cursores de las demás personas, con su nombre encima.
          ...estiloCursores,
        }}
      >
        {/* Fila 1: estado de la conexión, quién está, y las acciones de la parte.
            Fila 2: la barra común de formato (la misma de los documentos).
            Las dos quedan FIJAS arriba al bajar por el texto, como en el cuerpo
            de los documentos (2026-10-01). */}
        <Box sx={enPanel ? { flexShrink: 0, px: 2, pt: 1.25, bgcolor: lectura ? PALETA.superficieTenue : 'background.paper' } : barraFija(!lectura, false)}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1, pb: 1, borderBottom: '1px solid', borderColor: 'divider', alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip title={etiquetaEstado.d}>
            <Chip size="small" color={etiquetaEstado.c} variant={estado === 'en_vivo' ? 'filled' : 'outlined'} label={etiquetaEstado.t} sx={{ mr: 0.5 }} />
          </Tooltip>
          {otros.map((o, i) => (
            <Tooltip key={`${o.name}-${i}`} title={`${o.name} está escribiendo aquí`}>
              <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: o.color }}>{iniciales(o.name)}</Avatar>
            </Tooltip>
          ))}
          {!lectura && editor && (
            <>
              <MenuEstructura editor={editor} clave={s.clave} alAvisar={(t, x) => alAvisar(t, x)} />
              {editor.isEmpty && plantillaParte(s.clave) && (
                <Tooltip title="Inserta la estructura base: artículos o disposiciones numerados.">
                  <Button size="small" variant="outlined" onClick={() => { const b = plantillaParte(s.clave); if (b) editor.commands.setContent(b) }}>Estructura base</Button>
                </Tooltip>
              )}
              <Tooltip title="Cita de otra norma; sale sangrada en el PDF.">
                <Button size="small" startIcon={<FormatQuoteIcon />} variant={editor.isActive('blockquote') ? 'contained' : 'text'} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                  Texto citado
                </Button>
              </Tooltip>
              {s.clave === 'comparativo' && (
                <Tooltip title="Arma el cuadro con los textos citados (para todos); conserva lo pegado.">
                  <Button size="small" startIcon={<TableChartIcon />} onClick={() => void armarCuadro()}>Armar desde las modificatorias</Button>
                </Tooltip>
              )}
            </>
          )}
          <Box sx={{ flex: 1 }} />
          {!lectura && (
            <Tooltip title={pendiente ? 'Crea una versión con lo escrito por todos hasta ahora' : 'No hay cambios desde la última versión'}>
              <span>
                <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={() => void guardar()} disabled={!pendiente || estado !== 'en_vivo'}>
                  Guardar versión
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
        {!lectura && editor && (
          <BarraFormato editor={editor} titulo="Título de artículo, disposición o apartado" sx={{ pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}
            extras={<BotonFotografia editor={editor} pid={pid} alAvisar={alAvisar} />} />
        )}
        </Box>
        <Box onContextMenu={menuTabla.abrir(editor)} sx={enPanel ? { flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1.5 } : undefined}>
          <EditorContent editor={editor} />
        </Box>
        <PopupReferencias editor={editor} control={controlReferencias} contexto="parte" />
        <MenuTabla estado={menuTabla.estado} alCerrar={menuTabla.cerrar} />
      </Box>
      {!lectura && (
        <TextField size="small" fullWidth placeholder="Nota de versión (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} sx={{ mt: 1 }} />
      )}
    </Box>
  )
}

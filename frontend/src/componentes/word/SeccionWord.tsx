/**
 * UNA SECCIÓN del Formato Word (2026-10-19): un documento real del sistema como página simulada.
 *
 * Arriba, una franja con «Oficio 2 de 3», el estado y el número; en la hoja, los campos del formulario
 * escritos en su sitio (lugar y fecha, «Señor:», nombre, cargo, institución, ASUNTO, REFERENCIA…) como
 * texto editable en línea, el cuerpo con el mismo editor TipTap del formulario (`extensionesDocumento`)
 * y, al cierre, «Atentamente,», Adj., c.c. e iniciales. El guardado es el de siempre: `PUT
 * /api/documentos/{id}` con `version_base` (409 → lo escrito queda apartado para «Cargar mis cambios»
 * del formulario, y se recarga lo vigente); sin servidor, se encola (`sinconexion.encolar`). Solo se
 * edita un borrador sin número y sin firma en curso: lo numerado se ve y se tramita en el formulario.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { EditorContent, type Editor } from '@tiptap/react'
import { NodeSelection, type Transaction } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { api, ErrorApi, esSinServidor } from '../../api'
import { avisoBreve, SE_GUARDARA } from '../../avisoBreve'
import { COLOR_ESTADO } from '../../estados'
import { encolar, guardarApartado } from '../../sinconexion'
import { extensionesDocumento } from '../../extensiones/esquema'
import { EVENTO_ABRIR_NOTA } from '../../extensiones/NotaAlPie'
import type { CampoEsquema } from '../FormularioCampos'
import { PALETA } from '../../paleta'
import PaginaWord, { estilosHoja } from './PaginaWord'
import { useEditorWord } from './useEditorWord'
import { crearControl, type ControlReferencias } from '../../extensiones/AutocompletarReferencias'
import { disposicion, editableEnWord, fechaLarga, rotuloSeccion, type DisposicionPagina } from './modelo'
import type { NotaResumen, SeccionResumen } from './PanelEstructura'

const AUTO_MS = 4000

interface DocumentoWord {
  colaboracion?: boolean
  generacion?: number
  id: number
  tipo: string
  tipo_nombre: string
  numero: number | null
  numero_completo: string
  estado: string
  campos: Record<string, string>
  cuerpo: object
  esquema_campos: CampoEsquema[]
  version: number
  origen?: string
  firma_en_curso?: boolean
  borrador?: { campos?: Record<string, string>; cuerpo?: object } | null
}

export interface ManejadorSeccion {
  guardar: () => Promise<boolean>
  /** Vuelve a leer el documento del servidor (tras restaurar una versión). */
  recargar: () => Promise<unknown>
  editor: Editor | null
  irANota: (pos: number) => void
  desplazar: () => void
  sucio: boolean
  /** Cambia un campo del documento (la barra del Formato Word: tamaño de letra, interlineado). */
  ponerCampo?: (clave: string, valor: string) => void
  /** Abre el historial o las versiones de la sección (la barra y el menú Archivo). */
  abrirHistorial?: () => void
}

/** Lo que una sección recién creada trae del pegado de un prompt (fase 4): se aplica al cargar. */
export interface ContenidoInicial { campos: Record<string, string>; cuerpoHtml: string | null }

function notasDe(editor: Editor | null): NotaResumen[] {
  const salida: NotaResumen[] = []
  editor?.state.doc.descendants((n, pos) => {
    if (n.type.name === 'footnote') salida.push({ pos, texto: String(n.attrs.texto ?? '') })
    return true
  })
  return salida
}

const SeccionWord = forwardRef<ManejadorSeccion, {
  id: number
  indice: number
  total: number
  /** Ancho de la hoja en píxeles (la página se adapta al contenedor; los márgenes van en proporción). */
  anchoHoja: number
  activo: boolean
  inicial?: ContenidoInicial
  alActivar: (id: number) => void
  /** El editor de esta sección, cuando existe (la barra de formato de arriba lo usa). */
  alEditor: (id: number, editor: Editor | null, control?: ControlReferencias) => void
  alCambio: (r: SeccionResumen, notas: NotaResumen[]) => void
  alQuitar: (id: number) => void
  /** Abre el historial y las versiones del documento (CajonActividad, el mismo del formulario). */
  alHistorial?: (id: number) => void
  alAviso: (tipo: 'success' | 'info' | 'warning' | 'error', texto: string) => void
}>(function SeccionWord({ id, indice, total, anchoHoja, activo, inicial, alActivar, alEditor, alCambio, alQuitar, alHistorial, alAviso }, ref) {
  const navegar = useNavigate()
  const [doc, setDoc] = useState<DocumentoWord | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const baseRef = useRef(0)
  const sucioRef = useRef(false)
  const camposRef = useRef(campos)
  camposRef.current = campos
  const temporizador = useRef<number | null>(null)
  const inicialRef = useRef<ContenidoInicial | undefined>(inicial)
  const contenedor = useRef<HTMLDivElement | null>(null)

  // Local o en edición simultánea, según el documento (como el formulario: `doc:<id>:<generación>`).
  const cargarRef = useRef<() => Promise<unknown>>(async () => undefined)
  const controlReferencias = useMemo(crearControl, [])
  const { editor, enVivo } = useEditorWord({
    extensiones: extensionesDocumento,
    nombreCompartido: doc?.colaboracion ? `doc:${id}:${doc.generacion ?? 0}` : null,
    control: controlReferencias,
    alRecargar: () => void cargarRef.current(),
    alFallar: () => alAviso('warning', `${doc?.tipo_nombre ?? 'Documento'} ${indice + 1}: la edición simultánea no responde; abra el formulario para seguir por turnos.`),
  })
  const enVivoRef = useRef(enVivo)
  enVivoRef.current = enVivo
  useEffect(() => { alEditor(id, editor, controlReferencias); return () => alEditor(id, null) }, [editor, id, alEditor, controlReferencias])

  const marcarSucio = useCallback(() => {
    sucioRef.current = true
    setSucio(true)
    if (temporizador.current) window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => void guardarRef.current(true), AUTO_MS)
  }, [])

  // Cargar el documento y ponerlo en el editor (sin entrar al historial de deshacer).
  const cargar = useCallback(async () => {
    const d = await api<DocumentoWord>(`/api/documentos/${id}`)
    baseRef.current = d.version
    setDoc(d)
    const c = { ...d.campos, ...(d.borrador?.campos ?? {}) }
    setCampos(c)
    return d
  }, [id])
  useEffect(() => {
    let vivo = true
    cargar().catch((e) => {
      if (!vivo) return
      // El documento ya no existe (lo borraron desde la bandeja u otra cuenta): la sección se retira del
      // espacio sin aviso, en vez de quedar en «Cargando…» con «El documento no existe» (2026-10-19).
      if (e instanceof ErrorApi && e.estado === 404) { alQuitar(id); return }
      setError(e instanceof Error ? e.message : 'No se pudo cargar.')
    })
    return () => { vivo = false }
  }, [cargar, alQuitar, id])
  cargarRef.current = cargar
  useEffect(() => {
    if (!editor || !doc) return
    if (!enVivo) {
      const cuerpo = doc.borrador?.cuerpo ?? doc.cuerpo
      editor.chain().command(({ tr }) => { tr.setMeta('addToHistory', false); return true }).setContent(cuerpo, { emitUpdate: false }).run()
    }
    editor.setEditable(editableEnWord(doc), false)
    // Lo pegado de un prompt (fase 4) entra una vez, ya sobre el documento creado, y se guarda solo.
    const ini = inicialRef.current
    if (ini) {
      inicialRef.current = undefined
      setCampos((c) => ({ ...c, ...ini.campos }))
      if (ini.cuerpoHtml) editor.commands.setContent(ini.cuerpoHtml, { emitUpdate: false })
      marcarSucio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc?.id, doc?.version, enVivo])

  // Cada tecleo del cuerpo: cambios sin guardar y el guardado automático.
  useEffect(() => {
    if (!editor) return
    // Lo que llega del texto compartido (Yjs) no es un cambio de esta persona: no ensucia ni guarda.
    const alCambiar = ({ transaction }: { transaction: Transaction }) => { if (!transaction.getMeta(ySyncPluginKey)) marcarSucio() }
    const alEnfocar = () => alActivar(id)
    editor.on('update', alCambiar)
    editor.on('focus', alEnfocar)
    return () => { editor.off('update', alCambiar); editor.off('focus', alEnfocar) }
  }, [editor, id, alActivar, marcarSucio])

  const guardarRef = useRef<(auto?: boolean) => Promise<boolean>>(async () => false)
  const guardar = useCallback(async (auto = false): Promise<boolean> => {
    if (!doc || !editor || !editableEnWord(doc) || !sucioRef.current) return true
    if (temporizador.current) window.clearTimeout(temporizador.current)
    const datos = { campos: camposRef.current, cuerpo: editor.getJSON(), version_base: baseRef.current, confirmar_anulacion: false, auto, generacion: enVivoRef.current ? doc.generacion : undefined }
    setGuardando(true)
    try {
      const r = await api<{ version: number; estado: string }>(`/api/documentos/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
      baseRef.current = r.version
      sucioRef.current = false
      setSucio(false)
      setDoc((d) => (d ? { ...d, version: r.version, estado: r.estado, campos: datos.campos, cuerpo: datos.cuerpo } : d))
      setError('')
      return true
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409 && (e.detalle as { codigo?: string } | undefined)?.codigo === 'documento_modificado') {
        // Otra persona guardó antes: lo de aquí se aparta (nunca se pierde) y se muestra lo vigente.
        try { guardarApartado(id, { campos: datos.campos, cuerpo: datos.cuerpo, version_base: datos.version_base, apartado_en: Date.now() }) } catch { /* sin sitio */ }
        sucioRef.current = false
        setSucio(false)
        await cargar().catch(() => {})
        alAviso('warning', `${doc.tipo_nombre} ${indice + 1}: otra persona guardó antes; se cargó su versión y lo suyo quedó apartado («Cargar mis cambios» en el formulario).`)
        return false
      }
      if (esSinServidor(e)) {
        encolar(`/api/documentos/${id}`, JSON.stringify(datos), doc.numero_completo || 'Borrador')
        sucioRef.current = false
        setSucio(false)
        if (!auto) avisoBreve(SE_GUARDARA)
        return true
      }
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      return false
    } finally {
      setGuardando(false)
    }
  }, [doc, editor, id, indice, cargar, alAviso])
  guardarRef.current = guardar

  // Al salir con cambios: un último guardado (como el formulario con un borrador sin número).
  useEffect(() => () => { if (sucioRef.current) void guardarRef.current(true) }, [])

  // Lo que el panel de estructura muestra de esta sección.
  useEffect(() => {
    alCambio({ id, tipoNombre: doc?.tipo_nombre ?? '', campos, estado: doc?.estado ?? '', numero: doc?.numero ?? null, sucio, cargando: !doc }, notasDe(editor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.tipo_nombre, doc?.estado, doc?.numero, campos.asunto, campos.destinatario_nombre, campos.fmt_tamano, campos.fmt_interlineado, sucio, doc === null])
  useEffect(() => {
    if (!editor) return
    // Lo que llega de Yjs (la sincronía al abrir, el tecleo de otra persona) refresca las notas sin ensuciar.
    const alCambiar = ({ transaction }: { transaction: Transaction }) => {
      const sucioAhora = sucioRef.current || !transaction.getMeta(ySyncPluginKey)
      alCambio({ id, tipoNombre: doc?.tipo_nombre ?? '', campos: camposRef.current, estado: doc?.estado ?? '', numero: doc?.numero ?? null, sucio: sucioAhora }, notasDe(editor))
    }
    editor.on('update', alCambiar)
    return () => { editor.off('update', alCambiar) }
  }, [editor, id, doc?.tipo_nombre, doc?.estado, doc?.numero, alCambio])

  const ponerCampoRef = useRef<(clave: string, valor: string) => void>(() => {})
  useImperativeHandle(ref, () => ({
    guardar: () => guardar(false),
    recargar: () => cargar(),
    editor,
    sucio,
    ponerCampo: (clave: string, valor: string) => ponerCampoRef.current(clave, valor),
    abrirHistorial: alHistorial ? () => alHistorial(id) : undefined,
    desplazar: () => contenedor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    irANota: (pos: number) => {
      if (!editor) return
      try {
        const sel = NodeSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView())
        editor.view.focus()
        editor.view.dom.dispatchEvent(new CustomEvent(EVENTO_ABRIR_NOTA, { detail: { texto: sel.node.attrs.texto } }))
      } catch { /* la nota ya no está */ }
    },
  }), [guardar, cargar, editor, sucio])

  const ponerCampo = (clave: string, valor: string) => {
    setCampos((c) => ({ ...c, [clave]: valor }))
    marcarSucio()
  }
  ponerCampoRef.current = ponerCampo

  const editable = doc ? editableEnWord(doc) : false
  const dispo: DisposicionPagina = useMemo(() => disposicion(doc?.esquema_campos), [doc?.esquema_campos])
  const letra = anchoHoja < 560 ? 15 : 14.5

  /** Un campo escrito en su sitio: texto plano, sin caja; la etiqueta solo como guía cuando está vacío. */
  const campo = (c: CampoEsquema, sx: object = {}, prefijo?: string) => {
    const valor = campos[c.clave] ?? ''
    if (c.opciones?.length) {
      return (
        <Select key={c.clave} variant="standard" disableUnderline size="small" value={valor} displayEmpty disabled={!editable} onChange={(e) => ponerCampo(c.clave, String(e.target.value))} onFocus={() => alActivar(id)} sx={{ fontSize: letra, ...sx }} inputProps={{ 'aria-label': c.etiqueta }}>
          <MenuItem value=""><em>{c.etiqueta}</em></MenuItem>
          {c.opciones.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
      )
    }
    const multilinea = c.tipo === 'area' || c.tipo === 'copias' || c.tipo === 'destinatarios' || c.tipo === 'referencias' || c.clave === 'anexo'
    return (
      <Box key={c.clave} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
        {prefijo && <Typography component="span" sx={{ fontSize: letra, fontWeight: 700, flexShrink: 0 }}>{prefijo}</Typography>}
        <InputBase
          value={valor}
          onChange={(e) => ponerCampo(c.clave, e.target.value)}
          onFocus={() => alActivar(id)}
          placeholder={c.etiqueta}
          multiline={multilinea}
          disabled={!editable}
          inputProps={{ 'aria-label': c.etiqueta, type: c.tipo === 'fecha' ? 'date' : 'text' }}
          sx={{ fontSize: letra, lineHeight: 1.45, width: '100%', p: 0, '& input, & textarea': { p: 0 }, '&.Mui-disabled': { color: 'text.primary', WebkitTextFillColor: 'inherit' }, ...sx }}
        />
      </Box>
    )
  }
  const lugar = dispo.lugarFecha.find((c) => c.clave === 'lugar')
  const fecha = dispo.lugarFecha.find((c) => c.clave === 'fecha')
  const estadoColor = COLOR_ESTADO[doc?.estado ?? ''] ?? PALETA.textoTenue

  const franja = (
    <>
      <Typography variant="subtitle2" sx={{ color: activo ? 'primary.main' : 'text.secondary', fontWeight: 700 }}>{rotuloSeccion(doc?.tipo_nombre ?? '', indice, total)}</Typography>
      {doc && <Chip size="small" label={doc.numero != null ? doc.numero_completo : (doc.estado || 'Borrador').toLowerCase().replace(/_/g, ' ')} sx={{ height: 20, fontSize: 11, fontWeight: 600, color: estadoColor, bgcolor: `${estadoColor}1A` }} />}
      {sucio && <Typography variant="caption" sx={{ color: 'warning.main' }}>{guardando ? 'Guardando…' : 'Sin guardar'}</Typography>}
      {!sucio && doc && editable && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Guardado</Typography>}
      {error && <Typography variant="caption" color="error">{error}</Typography>}
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Abrir en el formulario: trámite, numeración, firma, formato y vista PDF">
        <Button size="small" color="inherit" startIcon={<OpenInNewIcon fontSize="small" />} onClick={(e) => { e.stopPropagation(); navegar(`/documentos/${id}?modalidad=formulario`) }} sx={{ color: 'text.secondary' }}>Formulario</Button>
      </Tooltip>
      {enVivo && <Chip size="small" label="En vivo" sx={{ height: 20, fontSize: 11, fontWeight: 600, color: PALETA.exito, bgcolor: `${PALETA.exito}1A` }} />}
      <Tooltip title="Quitar del espacio (el documento sigue en la bandeja)">
        <IconButton size="small" aria-label="Quitar del espacio" onClick={(e) => { e.stopPropagation(); alQuitar(id) }}><CloseIcon fontSize="small" /></IconButton>
      </Tooltip>
    </>
  )
  const avisoHoja = doc && !editable
    ? (doc.numero != null ? 'Ya tiene número: se edita y se tramita en el formulario.' : doc.firma_en_curso ? 'Firma en curso: solo lectura.' : 'Este documento se elaboró fuera del editor: solo lectura.')
    : undefined

  return (
    <Box ref={contenedor}>
      <PaginaWord id={`seccion-${id}`} anchoHoja={anchoHoja} campos={campos} activo={activo} franja={franja} aviso={avisoHoja} cargando={!doc && !error} alActivar={() => alActivar(id)}>
        {!doc && error && <Typography variant="caption" color="error">{error}</Typography>}
        {doc && (
          <>
            {(lugar || fecha || campos.lugar) && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 0.5, mb: 2, fontSize: letra }}>
                {lugar ? <Box sx={{ width: 160 }}>{campo(lugar, { textAlign: 'right', '& input': { textAlign: 'right' } })}</Box>
                  : campos.lugar ? <Typography component="span" sx={{ fontSize: letra }}>{campos.lugar}</Typography> : null}
                {(lugar || campos.lugar) && <Typography component="span" sx={{ fontSize: letra }}>,</Typography>}
                {fecha && (editable ? <Box sx={{ width: 150 }}>{campo(fecha)}</Box> : <Typography component="span" sx={{ fontSize: letra }}>{fechaLarga(campos.fecha)}</Typography>)}
              </Box>
            )}
            <Box sx={{ mb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {dispo.encabezado.filter((c) => !['asunto', 'sumilla', 'sumilla_solicito', 'referencia'].includes(c.clave)).map((c) => campo(c, c.clave === 'destinatario_nombre' ? { fontWeight: 700, textTransform: 'uppercase' } : {}))}
              {dispo.encabezado.some((c) => c.clave.startsWith('destinatario')) && <Typography sx={{ fontSize: letra, mt: 0.5 }}>Presente.-</Typography>}
            </Box>
            <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {dispo.encabezado.filter((c) => ['asunto', 'sumilla', 'sumilla_solicito'].includes(c.clave)).map((c) => campo(c, { fontWeight: 600 }, 'ASUNTO:'))}
              {dispo.encabezado.filter((c) => c.clave === 'referencia').map((c) => campo(c, {}, 'REFERENCIA:'))}
              {dispo.otros.map((c) => campo(c, {}, `${c.etiqueta}:`))}
            </Box>
            <Box sx={estilosHoja(letra)}>
              <EditorContent editor={editor} />
            </Box>
            <Typography sx={{ fontSize: letra, mt: 2, mb: 5 }}>Atentamente,</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: letra - 1.5, color: PALETA.textoSecundario }}>
              {dispo.cierre.map((c) => campo(c, { fontSize: letra - 1.5 }, c.clave === 'anexo' ? 'Adj.:' : c.clave === 'con_copia' ? 'c.c.:' : undefined))}
            </Box>
          </>
        )}
      </PaginaWord>
    </Box>
  )
})

export default SeccionWord

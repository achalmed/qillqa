// Visor del documento y de TODO lo que lo acompaña, en CINCO pestañas fijas
// ordenadas como el trámite (Edison 2026-10-01, segunda vuelta: «ver cada
// adjunto por separado, otra pestaña para el documento de referencia, la de
// expediente y la de cargos; el orden más adecuado y la agrupación más
// intuitiva»):
//
//   [Documento] [Adjuntos 5] [Referencia 1] [Cargos] [Expediente]      ⧉ ⬇
//    └─ fichas de la pestaña, una por pieza:
//       Documento:  (Vista previa) (Firmado ✓)
//       Adjuntos:   (1 · Oficio N° 108…) (2 · Oficio múltiple…) …
//       Referencia: (Oficio N° 108-19492…) …
//
// Por qué así: lo que el despacho ESCRIBE (el documento, en borrador y
// firmado), lo que lo ACOMPAÑA (adjuntos, en el orden de la línea «Adj.»), lo
// que CITA o responde (referencia y documentos relacionados), la prueba de
// que LLEGÓ (cargos) y el PAQUETE final (expediente). Las cinco están
// siempre, en el mismo sitio: una vacía se ve atenuada y, al abrirla, dice
// qué falta y cómo resolverlo. Un adjunto registrado solo por su nombre
// también tiene su ficha: muestra que no tiene archivo y permite cargarlo
// ahí mismo (antes no aparecía y la pestaña solo ofrecía armar el
// expediente). La pestaña «Copias» del primer diseño se retiró: las copias
// no son archivos y ya se leen en el formulario y en el PDF.
//
// Compartido por el editor (documentos 'sgdp') y la vista heredada
// ('framework'): el PDF principal lo pasa el padre (urlPrincipal); el resto lo
// carga este componente. El padre refresca con `refrescar()` y selecciona con
// `mostrar(...)`.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Box from '@mui/material/Box'
import { PALETA } from '../paleta'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'

import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'

import { api, apiPdf, descargarArchivo } from '../api'
import { adjuntarArchivo, excedeLimite, type RespuestaVigencia } from './Adjuntos'
import { textoAnulacion } from '../vigencia'
import { avisoSiCorresponde } from '../descargas'
import BotonCopiar from './BotonCopiar'
import BotonAgendaDocumento from './tareas/BotonAgendaDocumento'
import { avisoDesactualizado, resumenExpediente, useExpediente } from './Expediente'
import { EstadoVacio } from './Estilo'
import { pdfEnLinea } from './VisorPdf'
import VisorAvanzado from './VisorAvanzado'
import type { ArchivoVisor } from './PanelArchivosVisor'

export interface AdjVista {
  id: number
  nombre: string
  categoria: string
  etiqueta: string
}
/** Qué mostrar desde fuera: el documento, el expediente o un archivo por id. */
export type Seleccion = 'documento' | 'expediente' | number

export interface VisorDocumentoHandle {
  refrescar: () => void
  mostrar: (sel: Seleccion) => void
  /** Descarga el archivo que se está viendo, con el nombre del sistema. */
  descargar: () => void
}

interface Relacion {
  relacion_id: number
  externo: boolean
  etiqueta: string
  archivos?: { id: number; nombre: string }[]
  documento: { id: number | null; numero_completo: string; tipo_nombre: string; asunto?: string }
}

type Pestana = 'documento' | 'adjuntos' | 'referencia' | 'cargos' | 'expediente'

/** Una pieza (ficha) de una pestaña. `vista` es su clave de selección:
 *  doc · exp · a:<id> archivo de este documento · d:<id> PDF de otro documento
 *  de la entidad · m:<n> adjunto sin archivo · s:<n> referencia sin archivo. */
interface Pieza {
  vista: string
  rotulo: string
  titulo: string
  sinArchivo?: boolean
  firmado?: boolean
}

const EXT_IMAGEN = /\.(png|jpe?g|webp|gif)$/i
/** ¿El visor sabe mostrarlo? PDF o imagen. */
export const esVisualizable = (nombre: string): boolean =>
  /\.pdf$/i.test(nombre) || EXT_IMAGEN.test(nombre)

const sinExtension = (n: string) => n.replace(/\.[^.]+$/, '')
const clave = (t: string) => t.toLowerCase().split(/\s+/).filter(Boolean).join(' ')
const recortar = (t: string, n = 34) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

/** Rótulo de pestaña: nombre + contador discreto (o ✓). */
function Rotulo({ texto, n, hecho, apagado }: { texto: string; n?: number; hecho?: boolean; apagado?: boolean }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, opacity: apagado ? 0.5 : 1 }}>
      {texto}
      {hecho && <CheckCircleIcon sx={{ fontSize: 13, color: 'success.main' }} />}
      {n !== undefined && n > 0 && (
        <Box component="span" sx={{ fontSize: 11, lineHeight: '16px', minWidth: 16, px: 0.5, borderRadius: 8, bgcolor: 'action.selected', textAlign: 'center' }}>
          {n}
        </Box>
      )}
    </Box>
  )
}

const VisorDocumento = forwardRef<
  VisorDocumentoHandle,
  {
    documentoId: string
    urlPrincipal: string
    titulo?: string
    placeholder?: ReactNode
    alAvisar?: (tipo: 'success' | 'error' | 'info' | 'warning', texto: string) => void
    /** Adjuntos registrados solo por NOMBRE (campo `anexo`), en orden. */
    manuales?: string[]
    /** Carga el archivo de un adjunto escrito por nombre (solo el editor). */
    alCargarManual?: (nombre: string, archivo: File) => Promise<RespuestaVigencia | void>
    /** Referencias escritas en el formulario (una por línea). */
    referencias?: string[]
  }
>(function VisorDocumento(
  { documentoId, urlPrincipal, titulo = 'Vista previa', placeholder, alAvisar, manuales = [], alCargarManual, referencias = [] },
  ref,
) {
  const [archivos, setArchivos] = useState<AdjVista[]>([])
  const [relaciones, setRelaciones] = useState<Relacion[]>([])
  const [vista, setVista] = useState('doc')
  const [urlVista, setUrlVista] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [falloCarga, setFalloCarga] = useState(false)
  // Visor completo (fase 5, 2026-10-08): el mismo archivo que se ve aquí.
  const [completo, setCompleto] = useState(false)
  const expediente = useExpediente(documentoId, alAvisar)

  const cargar = useCallback(() => {
    api<AdjVista[]>(`/api/documentos/${documentoId}/adjuntos`)
      .then((lista) => setArchivos((lista || []).slice().sort((a, b) => a.id - b.id)))
      .catch(() => setArchivos([]))
    api<Relacion[]>(`/api/documentos/${documentoId}/relaciones`)
      .then((l) => setRelaciones(l || []))
      .catch(() => setRelaciones([]))
  }, [documentoId])
  useEffect(cargar, [cargar])
  useEffect(() => {
    window.addEventListener('sgdp:adjuntos', cargar)
    return () => window.removeEventListener('sgdp:adjuntos', cargar)
  }, [cargar])
  // La descarga se define más abajo (depende del archivo activo): se llama por ref.
  const descargarRef = useRef<() => Promise<void>>(async () => undefined)
  useImperativeHandle(
    ref,
    () => ({
      descargar: () => void descargarRef.current(),
      refrescar: () => {
        cargar()
        expediente.cargar()
      },
      mostrar: (sel) => {
        cargar()
        setVista(sel === 'documento' ? 'doc' : sel === 'expediente' ? 'exp' : `a:${sel}`)
      },
    }),
    [cargar, expediente],
  )

  // --- Las piezas de cada pestaña -------------------------------------
  const firmado = archivos.find((a) => a.categoria === 'firmado')
  const archivosAdj = archivos.filter((a) => a.categoria === '')
  const conArchivo = new Set(archivosAdj.map((a) => clave(a.etiqueta || sinExtension(a.nombre))))
  // Mismo orden que la línea «Adj.»: los escritos (que aún no tienen
  // archivo) y luego los archivos, en orden de carga.
  const manualesPendientes = manuales.filter((m) => !conArchivo.has(clave(m)))
  const adjuntos: Pieza[] = [
    ...manualesPendientes.map((m, i) => ({ vista: `m:${i}`, rotulo: m, titulo: m, sinArchivo: true })),
    ...archivosAdj.map((a) => ({ vista: `a:${a.id}`, rotulo: a.etiqueta || sinExtension(a.nombre), titulo: a.nombre })),
  ]
  const documento: Pieza[] = [
    { vista: 'doc', rotulo: 'Vista previa', titulo: 'PDF que compone el sistema' },
    firmado
      ? { vista: `a:${firmado.id}`, rotulo: 'Firmado', titulo: firmado.nombre, firmado: true }
      : { vista: 'sinfirma', rotulo: 'Firmado · pendiente', titulo: 'Aún no se subió el documento firmado', sinArchivo: true },
  ]
  // Referencia: documentos vinculados (internos y externos con archivo) y
  // las referencias escritas que todavía no tienen documento ni archivo.
  const referencia: Pieza[] = []
  const citados: string[] = []
  for (const r of relaciones) {
    const num = r.documento.numero_completo
    citados.push(clave(num))
    if (!r.externo && r.documento.id) {
      referencia.push({ vista: `d:${r.documento.id}`, rotulo: num, titulo: `${r.etiqueta}: ${num}` })
    } else if (r.archivos?.length) {
      r.archivos.forEach((f) => referencia.push({ vista: `a:${f.id}`, rotulo: num, titulo: `${r.etiqueta}: ${f.nombre}` }))
    } else {
      referencia.push({ vista: `s:r${r.relacion_id}`, rotulo: num, titulo: `${r.etiqueta}: ${num} (sin archivo)`, sinArchivo: true })
    }
  }
  const enRelacion = new Set(relaciones.flatMap((r) => (r.archivos ?? []).map((f) => f.id)))
  for (const a of archivos.filter((x) => x.categoria === 'respuesta' && !enRelacion.has(x.id))) {
    referencia.push({ vista: `a:${a.id}`, rotulo: a.etiqueta || sinExtension(a.nombre), titulo: a.nombre })
  }
  referencias.forEach((t, i) => {
    const k = clave(t)
    if (citados.some((c) => c && (k.includes(c) || c.includes(k)))) return
    // El botón «Archivo» junto a la referencia (formulario, 1.4) la sube como
    // adjunto «Ref. <texto>»: se ve aquí Y en Adjuntos (va en la línea Adj.).
    const suyo = archivosAdj.find((a) => clave(a.etiqueta) === clave(`Ref. ${t}`))
    if (suyo) referencia.push({ vista: `a:${suyo.id}`, rotulo: t, titulo: suyo.nombre })
    else referencia.push({ vista: `s:t${i}`, rotulo: t, titulo: t, sinArchivo: true })
  })
  const cargos: Pieza[] = [
    ...archivos
      .filter((a) => a.categoria === 'recepcion')
      .map((a) => ({ vista: `a:${a.id}`, rotulo: a.etiqueta || sinExtension(a.nombre), titulo: a.nombre })),
    // Cargos de una versión cuya firma se anuló (servicios/vigencia.py): se
    // conservan como historia, pero ya no cuentan para el seguimiento.
    ...archivos
      .filter((a) => a.categoria === 'recepcion_anulada')
      .map((a) => ({
        vista: `a:${a.id}`,
        rotulo: `${a.etiqueta || sinExtension(a.nombre)} (versión anulada)`,
        titulo: `${a.nombre} — cargo de la versión anulada: ya no cuenta`,
        sinArchivo: false,
      })),
  ]
  const cargosVigentes = archivos.filter((a) => a.categoria === 'recepcion').length
  const exp = expediente.estado

  const piezas: Record<Pestana, Pieza[]> = {
    documento,
    adjuntos,
    referencia,
    cargos,
    expediente: [{ vista: 'exp', rotulo: 'Expediente', titulo: 'Documento + adjuntos en un PDF' }],
  }
  // La pestaña la decide la última que se eligió cuando una pieza está en dos
  // (el archivo de una referencia también es adjunto).
  const [preferida, setPreferida] = useState<Pestana>('documento')
  const pestanaDe = (v: string): Pestana =>
    piezas[preferida].some((x) => x.vista === v)
      ? preferida
      : (Object.keys(piezas) as Pestana[]).find((p) => piezas[p].some((x) => x.vista === v)) ?? 'documento'
  const pestana = pestanaDe(vista)
  const actual = piezas[pestana].find((x) => x.vista === vista)

  // Si lo elegido desapareció (se eliminó, o el adjunto escrito ya tiene su
  // archivo), volver al documento. Las pestañas vacías no son una pieza.
  const existe =
    vista.startsWith('vacio:') ||
    vista.startsWith('a:') || // un archivo recién subido llega antes que la lista
    (Object.values(piezas) as Pieza[][]).some((l) => l.some((x) => x.vista === vista))
  useEffect(() => {
    if (!existe) setVista('doc')
  }, [existe])

  const elegirPestana = (p: Pestana) => {
    setPreferida(p)
    const lista = piezas[p]
    const primera = lista.find((x) => !x.sinArchivo) ?? lista[0]
    if (primera) setVista(primera.vista)
    else setVista(p === 'cargos' ? 'vacio:cargos' : p === 'referencia' ? 'vacio:referencia' : 'vacio:adjuntos')
  }
  const pestanaVisible: Pestana = vista.startsWith('vacio:') ? (vista.slice(6) as Pestana) : pestana

  // --- Archivo a la vista -------------------------------------------------
  const archivoId = vista.startsWith('a:') ? Number(vista.slice(2)) : null
  const activo = archivoId !== null ? archivos.find((a) => a.id === archivoId) : undefined
  const esImagen = activo ? EXT_IMAGEN.test(activo.nombre) : false
  const noVisualizable = activo ? !esVisualizable(activo.nombre) : false
  const rutaActual = (): string | null => {
    if (vista === 'doc') return `/api/documentos/${documentoId}/pdf`
    if (vista === 'exp') return exp.existe ? `/api/documentos/${documentoId}/expediente` : null
    if (archivoId !== null) return `/api/documentos/${documentoId}/adjuntos/${archivoId}`
    if (vista.startsWith('d:')) return `/api/documentos/${vista.slice(2)}/pdf`
    return null
  }
  const ruta = rutaActual()

  useEffect(() => {
    setUrlVista('')
    setFalloCarga(false)
    if (vista === 'doc' || !ruta || noVisualizable) return
    let creada = ''
    let vivo = true
    apiPdf(ruta)
      .then((u) => {
        creada = u
        if (vivo) setUrlVista(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => {
        if (vivo) setFalloCarga(true)
      })
    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [ruta, vista, noVisualizable, exp.generado_en])

  const nombreActual = (): string => {
    if (vista === 'exp') return exp.nombre ?? ''
    return activo?.nombre ?? ''
  }
  const descargarActual = async () => {
    if (!ruta) return
    try {
      const destino = await descargarArchivo(ruta, nombreActual())
      const aviso = avisoSiCorresponde(destino, nombreActual() || actual?.rotulo || 'el documento')
      if (aviso) alAvisar?.('success', aviso)
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo descargar.')
    }
  }
  descargarRef.current = descargarActual
  // 2026-10-06: armar / volver a armar el expediente vive solo en el panel
  // «Expediente» (Expediente.tsx); el visor solo lo muestra y lo descarga.

  // Carga del PDF de una REFERENCIA escrita, desde su ficha (Edison
  // 2026-10-01). Sube como el botón «Archivo» del formulario: adjunto con la
  // etiqueta «Ref. <texto>», que es como esta pestaña la reconoce.
  const cargarReferencia = async (texto: string, f: File | null) => {
    if (!f) return
    const exceso = excedeLimite(f)
    if (exceso) {
      alAvisar?.('error', exceso)
      return
    }
    setSubiendo(true)
    try {
      const r = await adjuntarArchivo(documentoId, f, `Ref. ${texto}`)
      cargar()
      if (r.firmado_invalidado) alAvisar?.('warning', textoAnulacion(r.anulacion))
      else alAvisar?.('success', `Archivo cargado para la referencia «${texto}».`)
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo subir el archivo.')
    } finally {
      setSubiendo(false)
    }
  }

  // Carga del archivo de un adjunto escrito por nombre, desde su ficha.
  const cargarManual = async (nombre: string, f: File | null) => {
    if (!f || !alCargarManual) return
    setSubiendo(true)
    try {
      const r = await alCargarManual(nombre, f)
      cargar()
      if (r && r.firmado_invalidado) alAvisar?.('warning', textoAnulacion(r.anulacion))
      else alAvisar?.('success', `Archivo cargado para «${nombre}».`)
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo subir el archivo.')
    } finally {
      setSubiendo(false)
    }
  }

  // --- Contenido ----------------------------------------------------------
  const marco = (hijo: ReactNode) => (
    <Box sx={{ flex: 1, minHeight: { xs: 280, md: 0 }, display: 'flex', flexDirection: 'column', bgcolor: PALETA.superficieTenue, borderRadius: 2 }}>{hijo}</Box>
  )
  let contenido: ReactNode
  if (vista.startsWith('vacio:')) {
    const p = vista.slice(6)
    contenido = marco(
      <EstadoVacio
        icono={<DescriptionOutlinedIcon />}
        titulo={p === 'cargos' ? 'Todavía no hay cargos de recepción' : p === 'referencia' ? 'Sin documento de referencia' : 'Sin adjuntos'}
        texto={
          p === 'cargos'
            ? 'El cargo sellado que devuelve la entidad se sube en «Archivos del trámite › Cargos de recepción».'
            : p === 'referencia'
              ? 'Las referencias se escriben en el formulario (Referencia) y se vinculan en «Archivos del trámite › Documentos recibidos y relacionados» para verlas aquí.'
              : 'Los adjuntos se agregan en la sección Anexos del formulario.'
        }
      />,
    )
  } else if (vista === 'sinfirma') {
    contenido = marco(
      <EstadoVacio
        icono={<DescriptionOutlinedIcon />}
        titulo="Aún no se subió el documento firmado"
        texto="Súbalo en «Archivos del trámite › Documento firmado»: aparecerá aquí y pasará a ser la base del expediente."
      />,
    )
  } else if (vista.startsWith('m:')) {
    const nombre = actual?.rotulo ?? ''
    contenido = marco(
      <EstadoVacio
        icono={<LinkOffIcon />}
        titulo="Este adjunto no tiene archivo"
        texto={`«${nombre}» figura en la línea «Adj.» del documento, pero solo con su nombre. Cargue su PDF para verlo aquí y para que entre en el expediente.`}
        accion={
          alCargarManual ? (
            <Button component="label" size="small" variant="outlined" startIcon={<UploadFileIcon />} disabled={subiendo}>
              {subiendo ? 'Subiendo…' : 'Cargar su PDF'}
              <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(e) => void cargarManual(nombre, e.target.files?.[0] ?? null)} />
            </Button>
          ) : undefined
        }
      />,
    )
  } else if (vista.startsWith('s:t')) {
    // Referencia escrita en el formulario: su PDF se carga aquí mismo.
    const texto = actual?.rotulo ?? ''
    contenido = marco(
      <EstadoVacio
        icono={<LinkOffIcon />}
        titulo="Referencia sin archivo"
        texto={`«${texto}» está citada, pero sin archivo. Cargue su PDF para verlo aquí; también entra en la línea «Adj.» y en el expediente.`}
        accion={
          <Button component="label" size="small" variant="outlined" startIcon={<UploadFileIcon />} disabled={subiendo}>
            {subiendo ? 'Subiendo…' : 'Cargar su PDF'}
            <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={(e) => void cargarReferencia(texto, e.target.files?.[0] ?? null)} />
          </Button>
        }
      />,
    )
  } else if (vista.startsWith('s:')) {
    contenido = marco(
      <EstadoVacio
        icono={<LinkOffIcon />}
        titulo="Referencia sin archivo"
        texto={`«${actual?.rotulo ?? ''}» está vinculada como documento externo, pero sin archivo. Súbalo en «Archivos del trámite › Documentos recibidos y relacionados»; se verá aquí.`}
      />,
    )
  } else if (vista === 'exp' && !exp.existe) {
    contenido = marco(
      <EstadoVacio
        icono={<FolderZipOutlinedIcon />}
        titulo="Aún no armado."
      />,
    )
  } else if (noVisualizable && activo) {
    contenido = marco(
      <EstadoVacio
        icono={<DescriptionOutlinedIcon />}
        titulo="Este archivo no se puede previsualizar"
        texto={`«${activo.nombre}» no es PDF ni imagen. Descárguelo para abrirlo; para que entre en el expediente, cárguelo en PDF.`}
        accion={<Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => void descargarActual()}>Descargar</Button>}
      />,
    )
  } else {
    const url = vista === 'doc' ? urlPrincipal : urlVista
    contenido = url && esImagen ? (
      <Box sx={{ flex: 1, overflow: 'auto', borderRadius: 1, bgcolor: PALETA.superficieMedia, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', p: 1 }}>
        <Box component="img" src={url} alt={activo?.nombre ?? ''} onDoubleClick={() => setCompleto(true)} title="Doble clic: visor completo" sx={{ maxWidth: '100%', height: 'auto', cursor: 'zoom-in' }} />
      </Box>
    ) : url && !pdfEnLinea() ? (
      // Celular (Chrome de Android, Safari de iPhone): el <object> sale en
      // blanco. Mismo patrón que VisorPdf: abrir en el visor completo (pdf.js,
      // que sí funciona en el teléfono) o descargar con su nombre (Edison 2026-10-01: «el diputado usa casi
      // siempre el celular»).
      marco(
        <Box sx={{ m: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, p: 3, textAlign: 'center' }}>
          <PictureAsPdfOutlinedIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.8 }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{actual?.rotulo ?? 'Documento'}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
            Ábralo en el visor o descárguelo.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="contained" startIcon={<OpenInFullIcon />} onClick={() => setCompleto(true)}>Abrir PDF</Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => void descargarActual()}>Descargar</Button>
          </Box>
        </Box>,
      )
    ) : url ? (
      // En pantallas angostas la página se desplaza entera (no hay alto fijo
      // que reparta flex): el visor necesita alto propio.
      <Box component="object" data={`${url}#toolbar=0&navpanes=0`} type="application/pdf" sx={{ flex: 1, width: '100%', minHeight: { xs: '75dvh', md: 0 }, border: 'none', borderRadius: 1, bgcolor: PALETA.superficieMedia }} />
    ) : falloCarga ? (
      marco(<Box sx={{ m: 'auto', color: 'text.secondary', fontSize: 14 }}>No se pudo abrir este archivo (¿se eliminó?).</Box>)
    ) : vista === 'doc' ? (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{placeholder}</Box>
    ) : (
      marco(<Box sx={{ m: 'auto', color: 'text.secondary', fontSize: 14 }}>Cargando…</Box>)
    )
  }

  const pestanaSx = { minHeight: 34, py: 0.5, px: 1.25, minWidth: 0, fontSize: 13, textTransform: 'none' as const }
  const fichas = pestanaVisible === 'expediente' ? [] : piezas[pestanaVisible]
  const numerar = pestanaVisible === 'adjuntos'
  const puedeDescargar = ruta !== null && !vista.startsWith('vacio:')
  // Lo que se está mostrando, para el visor completo: solo un PDF o una imagen
  // ya cargados (no las fichas vacías ni lo que no se puede previsualizar).
  const urlMostrada =
    puedeDescargar && !noVisualizable && !vista.startsWith('m:') && !vista.startsWith('s:') && !(vista === 'exp' && !exp.existe)
      ? vista === 'doc'
        ? urlPrincipal
        : urlVista
      : ''
  // Todos los archivos del documento para la lista del visor completo (como Outlook): las mismas
  // fichas de las pestañas, sin las que aún no tienen archivo (2026-10-08).
  const rutaDe = (v: string): string | null => {
    if (v === 'doc') return `/api/documentos/${documentoId}/pdf`
    if (v === 'exp') return exp.existe ? `/api/documentos/${documentoId}/expediente` : null
    if (v.startsWith('a:')) return `/api/documentos/${documentoId}/adjuntos/${v.slice(2)}`
    if (v.startsWith('d:')) return `/api/documentos/${v.slice(2)}/pdf`
    return null
  }
  const GRUPOS: Record<Pestana, string> = {
    documento: 'Documento', adjuntos: 'Adjuntos', referencia: 'Referencia', cargos: 'Cargos de recepción', expediente: 'Expediente',
  }
  const vistos = new Set<string>()
  const archivosVisor: ArchivoVisor[] = (Object.keys(piezas) as Pestana[]).flatMap((p) =>
    piezas[p].flatMap((x): ArchivoVisor[] => {
      const r = rutaDe(x.vista)
      const adj = x.vista.startsWith('a:') ? archivos.find((a) => a.id === Number(x.vista.slice(2))) : undefined
      if (x.sinArchivo || !r || vistos.has(x.vista) || (adj && !esVisualizable(adj.nombre))) return []
      vistos.add(x.vista)
      const nombre = x.vista === 'exp' ? exp.nombre || 'Expediente.pdf' : adj?.nombre || x.rotulo
      return [{
        clave: x.vista,
        nombre,
        grupo: GRUPOS[p],
        detalle: x.vista === 'doc' ? 'PDF que compone el sistema' : x.firmado ? 'Documento firmado' : x.rotulo !== nombre ? x.rotulo : undefined,
        obtener: () => (x.vista === 'doc' && urlPrincipal ? Promise.resolve(urlPrincipal) : apiPdf(r)),
        descargar: () => void descargarArchivo(r, nombre).catch((e) => alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo descargar.')),
      }]
    }),
  )
  const nombreVisor = nombreActual() || (vista === 'doc' && titulo !== 'Vista previa' ? titulo : actual?.rotulo) || 'Documento'

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderBottom: '1px solid', borderColor: 'divider', mb: 0.75 }}>
        <Tabs
          value={pestanaVisible}
          onChange={(_, p: Pestana) => elegirPestana(p)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={titulo}
          sx={{ flex: 1, minHeight: 34, '& .MuiTabs-indicator': { height: 2.5 } }}
        >
          <Tab value="documento" label={<Rotulo texto="Documento" hecho={!!firmado} />} sx={pestanaSx} title="El documento: vista previa del sistema y firmado" />
          <Tab value="adjuntos" label={<Rotulo texto="Adjuntos" n={adjuntos.length} hecho={adjuntos.length > 0 && adjuntos.every((x) => !x.sinArchivo)} apagado={!adjuntos.length} />} sx={pestanaSx} title="Cada documento adjunto, en el orden de la línea «Adj.»" />
          <Tab value="referencia" label={<Rotulo texto="Referencia" n={referencia.length} hecho={referencia.length > 0 && referencia.every((x) => !x.sinArchivo)} apagado={!referencia.length} />} sx={pestanaSx} title="Documentos citados, respondidos o relacionados" />
          <Tab value="cargos" label={<Rotulo texto="Cargos" n={cargosVigentes} apagado={!cargosVigentes} />} sx={pestanaSx} title="Cargos (constancias) de recepción" />
          <Tab
            value="expediente"
            label={<Rotulo texto="Expediente" hecho={exp.existe && exp.con_firma && !exp.desactualizado} apagado={!exp.existe} />}
            sx={pestanaSx}
            title={exp.existe ? `Expediente: ${resumenExpediente(exp)}` : 'Documento + adjuntos en un solo PDF (aún no armado)'}
          />
        </Tabs>
        {puedeDescargar && !noVisualizable && (
          <BotonCopiar
            documentoId={vista.startsWith('d:') ? vista.slice(2) : documentoId}
            archivo={vista === 'exp' ? 'expediente' : archivoId !== null ? String(archivoId) : 'documento'}
            esImagen={esImagen}
            que={(actual?.rotulo ?? 'el documento').toLowerCase()}
            alAvisar={alAvisar}
          />
        )}
        {/* Tareas y Agenda (2026-10-06): un encargo nacido del documento queda vinculado a él. */}
        <BotonAgendaDocumento documentoId={documentoId} texto={titulo !== 'Vista previa' ? titulo : 'este documento'} recarga={urlPrincipal} alAvisar={alAvisar} />
        {urlMostrada && (
          <Tooltip title="Abrir en el visor completo">
            <IconButton size="small" onClick={() => setCompleto(true)} aria-label="Abrir en el visor completo">
              <OpenInFullIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {puedeDescargar && (
          <Tooltip title={`Descargar: ${actual?.rotulo ?? 'documento'}`}>
            <IconButton size="small" onClick={() => void descargarActual()} aria-label="Descargar lo que se muestra">
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {(fichas.length > 1 || (fichas.length === 1 && pestanaVisible !== 'documento') || (vista === 'exp' && exp.existe)) && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
          {fichas.map((p, i) => (
            <Chip
              key={p.vista}
              size="small"
              label={`${numerar ? `${i + 1} · ` : ''}${recortar(p.rotulo)}`}
              variant={p.vista === vista ? 'filled' : 'outlined'}
              color={p.vista === vista ? 'primary' : 'default'}
              icon={p.sinArchivo ? <LinkOffIcon sx={{ fontSize: '14px !important' }} /> : p.firmado ? <CheckCircleIcon sx={{ fontSize: '14px !important' }} /> : undefined}
              onClick={() => setVista(p.vista)}
              title={p.sinArchivo ? `${p.titulo} — sin archivo` : p.titulo}
              sx={{ maxWidth: 260, height: 24, fontSize: 12, opacity: p.sinArchivo && p.vista !== vista ? 0.75 : 1 }}
            />
          ))}
          {vista === 'exp' && exp.existe && (
            <>
              <Typography variant="caption" color="text.secondary">{resumenExpediente(exp)}</Typography>
              {exp.desactualizado && (
                <Tooltip title={avisoDesactualizado(exp)}>
                  <Chip size="small" color="warning" variant="outlined" label="desactualizado" sx={{ height: 20, fontSize: 11 }} />
                </Tooltip>
              )}
              {/* 2026-10-06: sin «Volver a armar» ni el aviso de desactualizado
                  aquí: ambos están en el panel «Expediente»; queda el chip. */}
            </>
          )}
        </Box>
      )}
      {contenido}
      {urlMostrada && (
        <VisorAvanzado
          url={urlMostrada}
          nombre={nombreVisor}
          abierto={completo}
          alCerrar={() => setCompleto(false)}
          alDescargar={() => void descargarActual()}
          archivos={archivosVisor}
          claveInicial={vista}
        />
      )}
    </Box>
  )
})

export default VisorDocumento

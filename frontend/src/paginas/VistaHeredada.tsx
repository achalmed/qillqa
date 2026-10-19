import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import HistoryIcon from '@mui/icons-material/History'
import FlagIcon from '@mui/icons-material/Flag'
import EditIcon from '@mui/icons-material/Edit'
import SaveIcon from '@mui/icons-material/Save'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, apiPdf, descargarPdf, esSinServidor, subirArchivo } from '../api'
import { ofrecerAlVolver } from '../componentes/AvisoAlVolver'
import { ETIQUETA_ESTADO } from '../estados'
import { etapaDe } from '../flujo'
import BotonPaso from '../componentes/BotonPaso'
import { Bloque, Titulo } from '../componentes/Estilo'
import Marco from '../componentes/Marco'
import EquipoEnLinea from '../componentes/EquipoEnLinea'
import CajonActividad from '../componentes/CajonActividad'
import PostAddIcon from '@mui/icons-material/PostAdd'
import { destinatariosDe } from '../componentes/GestionEntrega'
import Adjuntos from '../componentes/Adjuntos'
import FormularioCampos, { type CampoEsquema } from '../componentes/FormularioCampos'
import PanelArchivos from '../componentes/PanelArchivos'
import { ArmarExpediente } from '../componentes/Expediente'
import PanelSeguimiento, { type Tramite } from '../componentes/PanelSeguimiento'
import VisorDocumento, { type VisorDocumentoHandle } from '../componentes/VisorDocumento'
import { confirmar } from '../componentes/Dialogos'

interface Documento {
  id: number
  tipo: string
  numero_completo: string
  estado: string
  // 'framework' = del archivo (.tex a mano); 'manual' = elaborado fuera del
  // sistema e incorporado con su PDF (sin .tex: no se recompila ni convierte,
  // pero sus DATOS sí se corrigen y el PDF se puede reemplazar).
  origen: string
  campos: Record<string, string>
  esquema_campos?: CampoEsquema[]
  transiciones: string[]
  // Los documentos heredados siguen la MISMA ruta de trámite que los de la
  // plataforma: el seguimiento no depende de cómo se redactó el documento.
  tramite?: Tramite
  responsable?: string
}

export default function VistaHeredada() {
  const { id } = useParams()
  const [doc, setDoc] = useState<Documento | null>(null)
  const [urlPdf, setUrlPdf] = useState('')
  const [ocupado, setOcupado] = useState('')
  // 'info' lo usa el aviso de puesta en revisión automática al abrir.
  const [aviso, setAviso] = useState<
    { tipo: 'success' | 'error' | 'info' | 'warning'; texto: string } | null
  >(null)
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const [menuEstado, setMenuEstado] = useState<null | HTMLElement>(null)
  const visorRef = useRef<VisorDocumentoHandle>(null)
  // Datos editables de un documento manual (copia local hasta Guardar).
  const [camposEd, setCamposEd] = useState<Record<string, string>>({})
  const [datosSucios, setDatosSucios] = useState(false)
  const inputPdf = useRef<HTMLInputElement>(null)
  // Celular y tableta (< md): una columna a la vez con la conmutación
  // «Datos y trámite | Documento», como en el editor (Edison 2026-10-01).
  const tema = useTheme()
  const angosta = useMediaQuery(tema.breakpoints.down('md'))
  const [vistaMovil, setVistaMovil] = useState<'datos' | 'pdf'>('datos')

  useEffect(() => {
    api<Documento>(`/api/documentos/${id}`).then((d) => {
      setDoc(d)
      setCamposEd(d.campos)
      setDatosSucios(false)
    })
    apiPdf(`/api/documentos/${id}/pdf`).then(setUrlPdf).catch(() => {})
  }, [id])

  const recargarPdf = async () => {
    try {
      const url = await apiPdf(`/api/documentos/${id}/pdf`)
      setUrlPdf((ant) => {
        if (ant) URL.revokeObjectURL(ant)
        return url
      })
    } catch {
      /* sin PDF (número anulado) */
    }
  }

  // Documento manual: corregir sus DATOS (el PDF no cambia, la firma tampoco).
  const guardarDatos = async () => {
    setOcupado('guardar')
    try {
      await api(`/api/documentos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ campos: camposEd }),
      })
      const d = await api<Documento>(`/api/documentos/${id}`)
      setDoc(d)
      setCamposEd(d.campos)
      setDatosSucios(false)
      setAviso({ tipo: 'success', texto: 'Datos del documento guardados.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al guardar.' })
    } finally {
      setOcupado('')
    }
  }

  // Documento manual: reemplazar el PDF (corrección hecha en Word). Si ya
  // estaba firmado, el servidor anula la firma y avisa.
  const reemplazarPdf = async (archivo: File) => {
    setOcupado('reemplazar')
    try {
      const fd = new FormData()
      fd.append('archivo', archivo, archivo.name)
      const r = await subirArchivo<{ firmado_invalidado: boolean; estado: string }>(
        `/api/documentos/${id}/archivo-manual`,
        fd,
        'PUT',
      )
      await recargarPdf()
      visorRef.current?.refrescar()
      api<Documento>(`/api/documentos/${id}`).then(setDoc).catch(() => {})
      setAviso({
        tipo: r.firmado_invalidado ? 'info' : 'success',
        texto: r.firmado_invalidado
          ? 'PDF reemplazado. La firma anterior quedó anulada: es necesario volver a firmarlo.'
          : 'PDF reemplazado. El anterior quedó guardado en la carpeta del documento (anteriores/).',
      })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al reemplazar el PDF.' })
    } finally {
      setOcupado('')
      if (inputPdf.current) inputPdf.current.value = ''
    }
  }

  // Registrar la APERTURA del documento: si el revisor abre un borrador, el
  // sistema lo pone en revisión solo (servicios/revision.py). Se avisa para
  // que nadie se sorprenda de un cambio que no pidió expresamente.
  useEffect(() => {
    api<{ estado: string; revision_automatica: boolean }>(
      `/api/documentos/${id}/abrir`,
      { method: 'POST' },
    )
      .then((r) => {
        if (!r.revision_automatica) return
        setDoc((d) => (d ? { ...d, estado: r.estado } : d))
        setAviso({
          tipo: 'info',
          texto: 'Pasó a «En revisión» al abrirlo.',
        })
      })
      .catch(() => {})
  }, [id])


  const cambiarEstado = async (nuevo: string) => {
    setMenuEstado(null)
    try {
      const r = await api<{ estado: string; transiciones: string[] }>(
        `/api/documentos/${id}/estado`,
        { method: 'PUT', body: JSON.stringify({ estado: nuevo }) },
      )
      setDoc((d) => (d ? { ...d, estado: r.estado, transiciones: r.transiciones } : d))
      api<Documento>(`/api/documentos/${id}`).then(setDoc).catch(() => {})
      setAviso({ tipo: 'success', texto: `Estado: ${ETIQUETA_ESTADO[r.estado] ?? r.estado}` })
    } catch (e) {
      if (esSinServidor(e)) {
        void ofrecerAlVolver('estado', `Cambiar el estado de ${doc?.numero_completo || 'el documento'} a «${ETIQUETA_ESTADO[nuevo] ?? nuevo}»`, `/documentos/${id}`)
        return
      }
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al cambiar estado.' })
    }
  }

  const descargar = async () => {
    try {
      await descargarPdf(`/api/documentos/${id}/pdf`, doc?.campos.sumilla || doc?.numero_completo || 'documento')
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al descargar.' })
    }
  }

  const convertir = async () => {
    if (
      !(await confirmar(
        '¿Convertir a editable? Formatos muy especiales pueden simplificarse.',
        { aceptar: 'Convertir' },
      ))
    )
      return
    setOcupado('convertir')
    try {
      await api(`/api/documentos/${id}/convertir`, { method: 'POST' })
      // Ya es un documento de plataforma: recargar abre el editor.
      window.location.reload()
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al convertir.' })
      setOcupado('')
    }
  }

  const recompilar = async () => {
    setOcupado('recompilar')
    try {
      await api(`/api/documentos/${id}/recompilar`, { method: 'POST' })
      const url = await apiPdf(`/api/documentos/${id}/pdf`)
      setUrlPdf((ant) => {
        if (ant) URL.revokeObjectURL(ant)
        return url
      })
      setAviso({ tipo: 'success', texto: 'PDF regenerado del documento original.' })
    } catch (e) {
      if (esSinServidor(e)) {
        void ofrecerAlVolver('compilar', `Compilar ${doc?.numero_completo || 'el documento'}`, `/documentos/${id}`)
        return
      }
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al recompilar.' })
    } finally {
      setOcupado('')
    }
  }

  if (!doc) {
    return (
      <Marco modulo="documentos" volver="/documentos" sinBarraInferior>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      </Marco>
    )
  }

  const etapas = doc.tramite?.etapas
  const pasoEnviar = etapaDe(etapas, 'enviar')
  const puedeEnviar = doc.transiciones.includes('ENVIADO')
  // 2026-10-06: la bandera no repite «Enviar» (ya es el botón de la barra),
  // como la lista de otros estados del editor.
  const otrosEstados = doc.transiciones.filter((t) => t !== 'ENVIADO')
  const esManual = doc.origen === 'manual'
  // El ISR viene de su Semana de representación: allí se corrige y, al aprobar una versión
  // nueva, su PDF se reemplaza aquí solo. Reemplazarlo a mano lo separaría de lo aprobado.
  const esIsr = doc.tipo === 'informe_sr'

  const dato = (etiqueta: string, valor: string) => (
    <TextField
      label={etiqueta}
      value={valor || '—'}
      fullWidth
      margin="dense"
      InputProps={{ readOnly: true }}
      variant="filled"
    />
  )

  return (
    <Marco
      modulo="documentos"
      titulo={doc.numero_completo}
      volver="/documentos"
      sinBarraInferior
      equipo={<EquipoEnLinea documentoId={Number(id)} />}
      acciones={
        <>
          {/* Misma barra que el editor: estado como etiqueta, después la acción
              del paso que toca (con número) y luego lo que no es flujo. */}
          <BotonPaso
            paso={pasoEnviar}
            sobreOscuro
            color="inherit"
            onClick={() => cambiarEstado('ENVIADO')}
            disabled={!puedeEnviar}
            ayudaDeshabilitado={
              pasoEnviar?.hecho ? 'El documento ya salió de la entidad.' : 'Se habilita con el documento firmado.'
            }
          >
            Enviar
          </BotonPaso>
          <Button color="inherit" startIcon={<DownloadIcon />} onClick={descargar}>
            Descargar
          </Button>
          {esIsr ? null : esManual ? (
            <>
              <input
                ref={inputPdf}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void reemplazarPdf(f)
                }}
              />
              <Button
                color="inherit"
                startIcon={<UploadFileIcon />}
                onClick={() => inputPdf.current?.click()}
                disabled={ocupado !== ''}
              >
                {urlPdf ? 'Reemplazar PDF' : 'Cargar PDF'}
              </Button>
            </>
          ) : (
            <>
              <Button
                color="inherit"
                startIcon={<RefreshIcon />}
                onClick={recompilar}
                disabled={ocupado !== ''}
              >
                Regenerar PDF
              </Button>
              <Button
                color="inherit"
                startIcon={<EditIcon />}
                onClick={convertir}
                disabled={ocupado !== ''}
                sx={{ fontWeight: 'bold' }}
              >
                Convertir a editable
              </Button>
            </>
          )}
          <Box sx={{ width: 8, flexShrink: 0 }} />
          <IconButton
            color="inherit"
            onClick={() => setCajonAbierto(true)}
            aria-label="Historial"
            title="Historial"
          >
            <HistoryIcon />
          </IconButton>
          <IconButton
            color="inherit"
            onClick={(e) => setMenuEstado(e.currentTarget)}
            disabled={otrosEstados.length === 0}
            aria-label="Cambiar estado"
            title="Cambiar estado (otras transiciones)"
          >
            <FlagIcon />
          </IconButton>
          <Menu
            anchorEl={menuEstado}
            open={menuEstado !== null}
            onClose={() => setMenuEstado(null)}
          >
            {otrosEstados.map((t) => (
              <MenuItem key={t} onClick={() => cambiarEstado(t)}>
                Pasar a «{ETIQUETA_ESTADO[t] ?? t}»
              </MenuItem>
            ))}
          </Menu>
        </>
      }
    >
      {angosta && (
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: (t) => t.zIndex.appBar - 1,
            height: 52,
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            value={vistaMovil}
            onChange={(_, v: 'datos' | 'pdf' | null) => {
              if (!v) return
              setVistaMovil(v)
              window.scrollTo({ top: 0 })
            }}
            aria-label="Qué mostrar"
          >
            <ToggleButton value="datos" sx={{ gap: 0.75, textTransform: 'none', fontWeight: 600 }}>
              <InfoOutlinedIcon fontSize="small" /> Datos y trámite
            </ToggleButton>
            <ToggleButton value="pdf" sx={{ gap: 0.75, textTransform: 'none', fontWeight: 600 }}>
              <PictureAsPdfOutlinedIcon fontSize="small" /> Documento
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Escritorio: dos columnas con desplazamiento propio. Angosta: una
          sola, con el desplazamiento normal de la página. */}
      <Box sx={{ flex: angosta ? 'none' : '1 1 0', minHeight: 0, display: 'flex', gap: 2, p: { xs: 1.5, sm: 2 }, overflow: angosta ? 'visible' : 'hidden' }}>
        <Box sx={{ flex: 1, minWidth: 0, overflowY: angosta ? 'visible' : 'auto', pr: angosta ? 0 : 1, display: angosta && vistaMovil !== 'datos' ? 'none' : 'block' }}>
          {esIsr ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Se corrige en Semana de representación; al aprobar, el PDF se actualiza.
            </Alert>
          ) : esManual ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Hecho fuera del sistema: corrija en Word y use «{urlPdf ? 'Reemplazar PDF' : 'Cargar PDF'}».
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              Documento del archivo. Para editarlo, use «Convertir a editable».
            </Alert>
          )}

          {/* El seguimiento va ARRIBA, como en el editor: es lo primero que se
              quiere saber al abrir un documento (Edison 2026-09-05). */}
          <PanelSeguimiento
            documentoId={Number(id)}
            tramite={doc.tramite ?? null}
            responsable={doc.responsable ?? ''}
            estado={doc.estado}
            // 2026-10-06: sin la orientación del paso: la barra ya lleva la acción.
            orientacion={false}
            alCambiar={() => {
              api<Documento>(`/api/documentos/${id}`).then(setDoc).catch(() => {})
            }}
          />

          <Titulo
            sx={{ mt: 2.5 }}
            accion={
              esManual ? (
                <Button
                  size="small"
                  variant={datosSucios ? 'contained' : 'outlined'}
                  startIcon={<SaveIcon />}
                  onClick={guardarDatos}
                  disabled={!datosSucios || ocupado !== ''}
                >
                  Guardar datos
                </Button>
              ) : undefined
            }
          >
            Datos del documento
          </Titulo>
          {dato('Numeración oficial', doc.numero_completo)}
          {esManual ? (
            // Mismo formulario que el editor: los datos que ve la bandeja y usa
            // el seguimiento (destinatarios → cargos de recepción). El PDF no
            // cambia al guardarlos.
            <FormularioCampos
              esquema={doc.esquema_campos ?? []}
              valores={camposEd}
              tipo={doc.tipo}
              documentoId={id}
              alCambiar={(clave, valor) => {
                setCamposEd((c) => ({ ...c, [clave]: valor }))
                setDatosSucios(true)
              }}
              alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
            />
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: { xs: 0, sm: 2 }, flexDirection: { xs: 'column', sm: 'row' } }}>
                {dato('Tratamiento', doc.campos.destinatario_tratamiento)}
                {dato('Fecha', doc.campos.fecha)}
              </Box>
              {dato('Destinatario', doc.campos.destinatario_nombre)}
              {dato('Cargo', doc.campos.destinatario_cargo)}
              {dato('Asunto', doc.campos.asunto)}
            </>
          )}

          {/* 2026-10-06: quitado el bloque «Gestión»: repetía el estado del seguimiento. */}

          {/* ANEXOS, como en el editor (Edison 2026-09-05): los documentos
              adjuntos van aquí y no entre los archivos del trámite. Un
              documento del archivo no tiene «Figuras y tablas» editables:
              están dentro de su .tex original. */}
          <Bloque>
            <Titulo icono={<PostAddIcon />}>Anexos</Titulo>
            <Titulo nivel="sub">Documentos adjuntos</Titulo>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Archivos externos que acompañan al documento. No cambian el PDF
              oficial; se unen en el expediente.
            </Typography>
            <Adjuntos
              documentoId={id!}
              alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
              alActualizar={() => visorRef.current?.refrescar()}
              alVer={(aid) => visorRef.current?.mostrar(aid)}
            />
            {/* 2026-10-06: quitada la nota de figuras y tablas: repetía el aviso de arriba. */}
            <ArmarExpediente
              documentoId={id!}
              alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
              alVer={() => visorRef.current?.mostrar('expediente')}
            />
          </Bloque>

          {/* Mismo panel de archivos que el editor: el seguimiento del
              trámite no depende de cómo se redactó el documento. */}
          <PanelArchivos
            documentoId={id!}
            interno={doc.tramite?.ambito === 'interno'}
            destinatarios={destinatariosDe(doc.campos)}
            etapas={doc.tramite?.etapas}
            alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
            alActualizar={() => {
              visorRef.current?.refrescar()
              api<Documento>(`/api/documentos/${id}`).then(setDoc).catch(() => {})
            }}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: angosta && vistaMovil !== 'pdf' ? 'none' : 'flex', flexDirection: 'column' }}>
        <VisorDocumento
          ref={visorRef}
          alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
          documentoId={id!}
          urlPrincipal={urlPdf}
          titulo="Documento"
          referencias={(doc.campos.referencia ?? '').split('\n').map((t) => t.trim()).filter(Boolean)}
          placeholder={
            ocupado === 'recompilar' || ocupado === 'reemplazar'
              ? <CircularProgress />
              : esManual && !urlPdf
                ? 'Número reservado sin PDF. Use «Cargar PDF».'
                : 'Cargando documento…'
          }
        />
        </Box>
      </Box>

      <Snackbar
        open={aviso !== null}
        autoHideDuration={5000}
        onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={aviso?.tipo ?? 'success'} onClose={() => setAviso(null)}>
          {aviso?.texto}
        </Alert>
      </Snackbar>

      <CajonActividad
        documentoId={id!}
        abierto={cajonAbierto}
        alCerrar={() => setCajonAbierto(false)}
        incluirVersiones={false}
      />
    </Marco>
  )
}

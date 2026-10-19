/**
 * Panel de SEGUIMIENTO del documento (pedidos de Edison 2026-09-04).
 *
 * Reúne en un solo lugar las tres cosas que responden «¿en qué va este
 * documento y quién tiene que hacer qué?»:
 *
 *  1. RUTA DEL TRÁMITE — los cuatro hitos (generado → enviado → constancia de
 *     recepción → registrado en el STD del Congreso) con el check verde cuando
 *     el proceso está completo. El registro en el STD se marca desde aquí y el
 *     servidor exige tener antes la constancia (no es solo la UI la que manda).
 *  2. RESPONSABLE — a quién se le encargó el documento, con su historial.
 *  3. OBSERVACIONES E INDICACIONES — qué hay que corregir o hacer, quién lo
 *     pidió, y el botón para darlo por atendido.
 *
 * Lo usan por igual el editor de la plataforma y la vista heredada: el
 * seguimiento del trámite no depende de cómo se redactó el documento.
 */
import { BotonOpenProject } from './OpenProject'
import { PALETA } from '../paleta'
import OrigenSemana from './semana/OrigenSemana'
import { Fragment, useCallback, useContext, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd'
import CommentIcon from '@mui/icons-material/Comment'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PublicIcon from '@mui/icons-material/Public'
import { api } from '../api'
import { RESUMEN_ESTADO } from '../estados'
import BotonAyuda from './BotonAyuda'
import { EstadoDocumento, Titulo } from './Estilo'
import type { Etapa } from '../flujo'
import BotonPaso from './BotonPaso'
import { RutaPasos } from './Paso'
import Actuaciones from './seguimiento/Actuaciones'
import DialogoPegarSeguimiento from './seguimiento/DialogoPegarSeguimiento'
import BotonesPrompt from './BotonesPrompt'
import {
  ComentariosContext,
  TarjetaComentario,
  fechaCorta,
  useComentarios,
  type Comentarios,
} from './ObservacionesSeccion'

// ---------------------------------------------------------------- tipos
/** Evento para abrir «Registrar en el STD» desde fuera del panel (detail = id del documento). */
export const EVENTO_REGISTRAR_STD = 'sgdp:registrar-std'

export interface Tramite {
  generado: boolean
  enviado: boolean
  constancia: boolean
  std: boolean
  recepciones: number
  recepciones_requeridas: number
  firmado: boolean
  hechos: number
  total: number
  completo: boolean
  siguiente: string
  std_numero: string
  std_fecha: string
  std_nota?: string
  /** N.º de expediente que le dio la entidad destinataria (leído del cargo o escrito). */
  expediente_entidad?: string
  /** Plazo legal de respuesta de la entidad (pegado de seguimiento): {norma, articulo, dias, desde, vence}. */
  plazo_legal?: { norma?: string; articulo?: string; dias?: number; desde?: string; vence?: string }
  puede_std?: boolean
  motivo_std?: string
  // Ruta COMPLETA del proceso (redactar → … → STD) con el avance de este
  // documento: es la que numera los botones del sistema (ver flujo.ts).
  etapas?: Etapa[]
  // 'interno' (circula por el STD, sin cargo) o 'externo' (necesita cargo de
  // recepción). `ambito_automatico` = lo dedujo el sistema, nadie lo fijó.
  ambito?: string
  ambito_automatico?: boolean
  // Hitos que cuentan para ESTE documento: los internos no llevan constancia.
  hitos_aplicables?: string[]
}

interface Asignacion {
  id: number
  responsable: string
  asignado_por: string
  nota: string
  creado_en: string | null
}

export interface MiembroEquipo {
  id: number
  nombre_completo: string
  rol: string
  cargo?: string
}

// Etiqueta y explicación de cada hito de la ruta del oficio. El orden es el
// del trámite real: sin el anterior, el siguiente no procede.
const HITOS: { clave: keyof Tramite; titulo: string; ayuda: string }[] = [
  {
    clave: 'generado',
    titulo: 'Generado',
    ayuda: 'El documento tiene número oficial de la entidad.',
  },
  {
    clave: 'enviado',
    titulo: 'Enviado',
    ayuda: 'Salió de la entidad hacia la entidad destinataria.',
  },
  {
    clave: 'constancia',
    titulo: 'Constancia',
    ayuda: 'Está el cargo sellado que prueba la recepción.',
  },
  {
    clave: 'std',
    titulo: 'Registrado en STD',
    ayuda:
      'Quedó registrado en el Sistema de Trámite Documentario del Congreso. ' +
      'Requiere la constancia de recepción.',
  },
]

const fecha = fechaCorta

// ------------------------------------------------------- ruta del trámite
/** Fila de cuatro hitos con el check verde. Reutilizable (bandeja y panel). */
export function RutaTramite({ t, compacto = false }: { t: Tramite; compacto?: boolean }) {
  // Un documento interno no lleva el hito del cargo de recepción.
  const aplican = HITOS.filter(
    (h) => !t.hitos_aplicables || t.hitos_aplicables.includes(h.clave),
  )
  return (
    <Stack direction="row" spacing={compacto ? 0.5 : 1.5} alignItems="center" flexWrap="wrap">
      {aplican.map((h) => {
        const hecho = Boolean(t[h.clave])
        const detalle =
          h.clave === 'constancia' && !hecho
            ? `${h.ayuda} (${t.recepciones}/${t.recepciones_requeridas})`
            : h.clave === 'std' && hecho && t.std_numero
              ? `${h.ayuda} — expediente ${t.std_numero}`
              : h.ayuda
        return (
          <Tooltip key={h.clave} title={`${h.titulo}: ${detalle}`}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              {hecho ? (
                <CheckCircleIcon fontSize="small" color="success" />
              ) : (
                <RadioButtonUncheckedIcon fontSize="small" sx={{ opacity: 0.35 }} />
              )}
              {!compacto && (
                <Typography
                  variant="caption"
                  sx={{ color: hecho ? 'success.main' : 'text.disabled', fontWeight: hecho ? 600 : 400 }}
                >
                  {h.titulo}
                </Typography>
              )}
            </Stack>
          </Tooltip>
        )
      })}
    </Stack>
  )
}

/**
 * Indicador compacto para la bandeja: check verde si el trámite está
 * completo, o «n/4» con el detalle de lo que falta en el tooltip.
 */
/** Lo que falta del trámite ya firmado («Falta enviarlo», «Falta el cargo de recepción», «Falta
 * registrarlo en el STD»); vacío si no hay número o está completo. Va en la tarjeta del celular,
 * donde el tooltip del «n/4» no se ve. */
export function faltaTramite(t: Tramite): string {
  if (t.completo || !t.generado) return ''
  const breve: Partial<Record<keyof Tramite, string>> = {
    enviado: 'Falta enviarlo', constancia: 'Falta el cargo de recepción', std: 'Falta registrarlo en el STD',
  }
  const h = HITOS.find((x) => !t[x.clave] && (!t.hitos_aplicables || t.hitos_aplicables.includes(x.clave)))
  return h ? breve[h.clave] ?? '' : ''
}

export function ChipTramite({ t, onClick }: { t: Tramite; onClick?: (e: React.MouseEvent) => void }) {
  const faltan = HITOS.filter(
    (h) =>
      !t[h.clave] && (!t.hitos_aplicables || t.hitos_aplicables.includes(h.clave)),
  ).map((h) => h.titulo)
  const interno = t.ambito === 'interno'
  const titulo = t.completo
    ? interno
      ? 'Trámite completo: documento interno generado, enviado y registrado en el STD del Congreso.'
      : 'Trámite completo: generado, enviado, con constancia de recepción y registrado en el STD.'
    : `${interno ? 'Documento interno. ' : ''}Falta: ${faltan.join(', ')}.`
  return (
    <Tooltip title={titulo}>
      {t.completo ? (
        <IconButton size="small" color="success" onClick={onClick}>
          <CheckCircleIcon fontSize="small" />
        </IconButton>
      ) : (
        <Chip
          size="small"
          label={`${t.hechos}/${t.total}`}
          color={t.hechos >= 3 ? 'warning' : 'default'}
          variant={t.hechos >= 3 ? 'filled' : 'outlined'}
          onClick={onClick}
          sx={{ cursor: onClick ? 'pointer' : 'default', minWidth: 48 }}
        />
      )}
    </Tooltip>
  )
}

// ------------------------------------------------------------ el panel
/**
 * Qué significa cada pieza del seguimiento (Edison 2026-09-05: «definir claramente qué función
 * cumple cada estado»). Revisión 2026-10-12 («me abruma; no se ajusta al celular»): una línea por
 * pieza y por estado, en el «?» común (BotonAyuda: hoja inferior en el celular). El detalle de
 * cada estado sigue en el tooltip de su chip y en GUIA.md.
 */
function AyudaSeguimiento() {
  return (
    <BotonAyuda titulo="Cómo leer el seguimiento" etiqueta="Ayuda del seguimiento">
      <p><b>Ruta:</b> el orden del trámite. Relleno, el paso de ahora; check, lo hecho; punteado, opcional.</p>
      <p><b>Estado:</b> lo mueve el sistema con cada acción.</p>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.5, alignItems: 'center', mb: 1 }}>
        {Object.entries(RESUMEN_ESTADO).map(([k, v]) => (
          <Fragment key={k}>
            <EstadoDocumento estado={k} tamano="sm" />
            <Typography variant="caption">{v}</Typography>
          </Fragment>
        ))}
      </Box>
      <p><b>Responsable:</b> quien da el siguiente paso.</p>
      <p><b>Interno / externo:</b> el interno va por el STD; el externo necesita cargo.</p>
      <p><b>Observaciones:</b> van junto al campo; con una pendiente, el documento queda «Observado».</p>
    </BotonAyuda>
  )
}

// Mi id sale del JWT: sirve para ofrecer «Conforme / Sigue pendiente» solo a
// quien escribió la observación.
function miIdDesdeToken(): number {
  try {
    const t = localStorage.getItem('sgdp_token') ?? ''
    return Number(JSON.parse(atob(t.split('.')[1])).sub)
  } catch {
    return -1
  }
}

export default function PanelSeguimiento({
  documentoId,
  tramite,
  responsable,
  estado,
  alCambiar,
  compacto = false,
  orientacion,
}: {
  documentoId: number
  tramite: Tramite | null
  responsable: string
  /** Estado actual del documento, para el chip de cabecera. */
  estado?: string
  alCambiar?: () => void
  /** Arriba del editor (Edison 2026-09-05: «el seguimiento en la parte
   *  superior, más accesible»): las observaciones ancladas a un campo se ven
   *  JUNTO al campo, así que aquí solo van las generales y un resumen. */
  compacto?: boolean
  /** «Siguiente: …» bajo la ruta. Por defecto, solo fuera del editor; una
   *  pantalla cuya barra ya lleva la acción del paso lo apaga (2026-10-06). */
  orientacion?: boolean
}) {
  // En el celular, el diálogo ocupa la pantalla entera: es un formulario.
  const celular = useMediaQuery((t: Theme) => t.breakpoints.down('sm'))
  const miId = miIdDesdeToken()
  const [t, setT] = useState<Tramite | null>(tramite)
  const [resp, setResp] = useState(responsable)
  // Comentarios: si el editor los comparte por contexto, se usan esos (una
  // sola carga para el panel y para las marcas junto a cada campo); si no
  // —bandeja, vista heredada—, este panel carga los suyos.
  const compartidos = useContext(ComentariosContext)
  const propios = useComentarios(documentoId, compartidos === null, (tipo, texto) => {
    if (tipo === 'error') setError(texto)
    else setAviso(texto)
  }, alCambiar)
  const com: Comentarios = compartidos ?? propios
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  // Diálogos
  const [dlgStd, setDlgStd] = useState(false)
  const [pegarSeg, setPegarSeg] = useState(false)
  const [versionActuaciones, setVersionActuaciones] = useState(0)
  // «Registrar en el STD» de «Siguiente paso» y de la barra del editor abren
  // ESTE diálogo (un solo lugar para la acción, 2026-10-06).
  useEffect(() => {
    const abrir = (e: Event) => {
      if ((e as CustomEvent<number>).detail === documentoId) setDlgStd(true)
    }
    window.addEventListener(EVENTO_REGISTRAR_STD, abrir)
    return () => window.removeEventListener(EVENTO_REGISTRAR_STD, abrir)
  }, [documentoId])
  const [stdNumero, setStdNumero] = useState('')
  const [stdFecha, setStdFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [dlgEncargo, setDlgEncargo] = useState(false)
  const [encargoA, setEncargoA] = useState<number | ''>('')
  const [encargoNota, setEncargoNota] = useState('')
  const [nuevoTexto, setNuevoTexto] = useState('')
  const [nuevoTipo, setNuevoTipo] = useState('observacion')
  const [verHistorial, setVerHistorial] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [tr, asig] = await Promise.all([
        api<Tramite>(`/api/documentos/${documentoId}/tramite`),
        api<Asignacion[]>(`/api/documentos/${documentoId}/asignaciones`),
      ])
      setT(tr)
      setAsignaciones(asig)
      setStdNumero(tr.std_numero || '')
      if (tr.std_fecha) setStdFecha(tr.std_fecha)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el seguimiento.')
    }
  }, [documentoId])

  useEffect(() => {
    void cargar()
    api<MiembroEquipo[]>('/api/admin/equipo').then(setEquipo).catch(() => setEquipo([]))
  }, [cargar])

  useEffect(() => setResp(responsable), [responsable])
  // El flujo es DINÁMICO (Edison 2026-09-05): cuando el editor refresca el
  // trámite tras una acción (subir firmado, cambiar estado…), la ruta se
  // actualiza sola, sin recargar la página.
  useEffect(() => {
    if (tramite) setT(tramite)
  }, [tramite])

  const refrescar = () => {
    void cargar()
    void com.recargar()
    alCambiar?.()
  }

  // --- ámbito: interno o externo ---
  // Cambiarlo cambia el trámite (un interno deja de esperar cargo de
  // recepción), así que el servidor lo deja en la bitácora.
  const cambiarAmbito = async (valor: string) => {
    try {
      const r = await api<Tramite>(`/api/documentos/${documentoId}/ambito`, {
        method: 'PUT',
        body: JSON.stringify({ ambito: valor }),
      })
      setT(r)
      setAviso(
        valor === ''
          ? 'El sistema vuelve a deducir si el documento es interno o externo.'
          : valor === 'interno'
            ? 'Marcado como INTERNO: circula por el STD y no se le pedirá cargo de recepción.'
            : 'Marcado como EXTERNO: se le pedirá cargo o constancia de recepción.',
      )
      refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el ámbito.')
    }
  }

  // --- registro en el STD ---
  const guardarStd = async () => {
    try {
      const r = await api<Tramite>(`/api/documentos/${documentoId}/std`, {
        method: 'PUT',
        body: JSON.stringify({ registrado: true, numero: stdNumero, fecha: stdFecha }),
      })
      setT(r)
      setDlgStd(false)
      setAviso('Registro en el STD guardado.')
      refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar en el STD.')
    }
  }

  const quitarStd = async () => {
    try {
      const r = await api<Tramite>(`/api/documentos/${documentoId}/std`, {
        method: 'PUT',
        body: JSON.stringify({ registrado: false }),
      })
      setT(r)
      setAviso('Se retiró la marca de registro en el STD.')
      refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el registro.')
    }
  }

  // --- encargo ---
  const guardarEncargo = async () => {
    try {
      const r = await api<{ responsable: string }>(`/api/documentos/${documentoId}/responsable`, {
        method: 'PUT',
        body: JSON.stringify({
          responsable_id: encargoA === '' ? null : encargoA,
          nota: encargoNota,
        }),
      })
      setResp(r.responsable)
      setDlgEncargo(false)
      setEncargoNota('')
      setAviso(r.responsable ? `Documento encargado a ${r.responsable}.` : 'Se quitó el responsable.')
      refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar el responsable.')
    }
  }

  // --- comentarios (el hook compartido hace el POST y avisa si el estado
  // se movió solo; aquí solo se elige el texto y el tipo) ---
  const agregarComentario = async () => {
    await com.agregar(nuevoTexto, nuevoTipo, '')
    setNuevoTexto('')
    void cargar()
    alCambiar?.()
  }

  // En modo compacto, las observaciones de un campo se ven junto al campo:
  // aquí quedan las generales y un resumen de las otras.
  const pendientes = com.pendientes.filter((c) => !compacto || !c.seccion)
  // En el editor, el botón del STD sale aquí solo si NO es el paso que toca (ese
  // lo ofrece «Siguiente paso») y si ya se puede; el motivo lo explica esa tarjeta.
  const mostrarBotonStd = !compacto || (Boolean(t?.puede_std) && t?.etapas?.find((e) => e.actual)?.accion !== 'std')
  const enSecciones = compacto ? com.pendientes.filter((c) => c.seccion) : []
  const atendidos = com.lista.filter((c) => c.resuelto && (!compacto || !c.seccion))

  return (
    <Paper sx={{ p: 2, bgcolor: compacto ? PALETA.superficieTenue : 'transparent', borderRadius: 2.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Titulo sx={{ mb: 0 }} accion={<AyudaSeguimiento />}>
          Seguimiento del trámite
        </Titulo>
        <Box sx={{ flexGrow: 1 }} />
        <OrigenSemana documentoId={documentoId} />
        <BotonOpenProject clave={`sgdp:doc:${documentoId}`} compacto />
        {estado && <EstadoDocumento estado={estado} prefijo="Estado" />}
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {aviso && (
        <Alert severity="success" onClose={() => setAviso('')} sx={{ mb: 1 }}>
          {aviso}
        </Alert>
      )}

      {/* --- Ruta del documento ----------------------------------------
          Los SIETE pasos del proceso con el avance real, en la misma
          numeración que llevan los botones (Edison 2026-09-05). Antes aquí
          iban solo los cuatro hitos del oficio ya numerado, que dejaban fuera
          justo los pasos donde la gente se pierde: redactar, mandar a revisar
          y firmar. Si un documento viejo no trae etapas, se cae a los cuatro
          hitos de siempre. */}
      {t && (
        <Box sx={{ mb: 1.5 }}>
          {/* Interno o externo: es lo que decide si hará falta cargo de
              recepción, así que se ve ANTES de la ruta (Edison 2026-09-05). */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
            <Tooltip
              title={
                t.ambito === 'interno'
                  ? 'Va a otra oficina del Congreso: circula por el STD y no se le pide cargo de recepción.'
                  : 'Va a una entidad de fuera del Congreso: hace falta guardar el cargo o la constancia de recepción.'
              }
            >
              <Chip
                size="small"
                icon={t.ambito === 'interno' ? <AccountBalanceIcon /> : <PublicIcon />}
                label={t.ambito === 'interno' ? 'Documento interno' : 'Entidad externa'}
                color={t.ambito === 'interno' ? 'info' : 'default'}
                variant="outlined"
              />
            </Tooltip>
            {t.ambito_automatico && (
              <Typography variant="caption" color="text.disabled">
                (deducido del destinatario)
              </Typography>
            )}
            <TextField
              select
              size="small"
              value={t.ambito_automatico ? '' : (t.ambito ?? '')}
              onChange={(e) => cambiarAmbito(e.target.value)}
              sx={{ width: 150 }}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="">Automático</MenuItem>
              <MenuItem value="interno">Marcar interno</MenuItem>
              <MenuItem value="externo">Marcar externo</MenuItem>
            </TextField>
          </Stack>
          {t.etapas?.length ? (
            <Box sx={{ maxWidth: 820, my: 0.5 }}>
              {/* En el editor (compacto) la orientación ya la da «Siguiente paso»:
                  aquí solo la ruta (Edison 2026-10-06: «aquí hay una duplicidad»). */}
              <RutaPasos etapas={t.etapas} orientacion={orientacion ?? !compacto} />
            </Box>
          ) : (
            <RutaTramite t={t} />
          )}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap">
            {/* La orientación («Siguiente: …») la da la propia ruta; aquí solo
                quedan las acciones del STD, que no tienen botón en otro sitio. */}
            {t.std ? (
              <>
                <Chip
                  size="small"
                  variant="outlined"
                  color="success"
                  label={`STD ${t.std_numero || 'registrado'}${t.std_fecha ? ` · ${t.std_fecha}` : ''}`}
                />
                <Button size="small" onClick={quitarStd}>
                  Quitar registro
                </Button>
              </>
            ) : !mostrarBotonStd ? null : (
              <Tooltip title={t.puede_std ? '' : t.motivo_std ?? ''}>
                <span>
                  <BotonPaso
                    paso={t.etapas?.find((e) => e.accion === 'std') ?? null}
                    size="small"
                    variant="contained"
                    startIcon={t.etapas?.length ? undefined : <HowToRegIcon />}
                    disabled={!t.puede_std}
                    onClick={() => setDlgStd(true)}
                  >
                    Registrar en el STD
                  </BotonPaso>
                </span>
              </Tooltip>
            )}
          </Stack>
          {t.recepciones_requeridas > 0 && (
            <ExpedienteEntidad documentoId={documentoId} valor={t.expediente_entidad ?? ''} alGuardar={(v) => setT({ ...t, expediente_entidad: v })} alError={setError} />
          )}
          {t.plazo_legal?.vence && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Plazo legal: vence el {String(t.plazo_legal.vence).slice(8, 10)}/{String(t.plazo_legal.vence).slice(5, 7)}/{String(t.plazo_legal.vence).slice(0, 4)}
              {t.plazo_legal.norma ? ` (${t.plazo_legal.norma}${t.plazo_legal.articulo ? `, art. ${t.plazo_legal.articulo}` : ''})` : ''}
            </Typography>
          )}
          {/* Actuaciones del seguimiento (2026-10-12): llamadas, reiteraciones, compromisos, y el pegado del prompt. */}
          <Box sx={{ mt: 1.25 }}>
            <Actuaciones
              entidad={`doc:${documentoId}`}
              compacto={compacto}
              version={versionActuaciones}
              acciones={(
                <>
                  <Button size="small" variant="outlined" onClick={() => setPegarSeg(true)}>Pegar seguimiento</Button>
                  {/* El prompt de seguimiento a la mano (2026-10-18, Edison: «no hay forma visible de copiar o descargar el prompt»). */}
                  <BotonesPrompt tipo="seguimiento-documento" compacto />
                </>
              )}
            />
          </Box>
          <DialogoPegarSeguimiento abierto={pegarSeg} documentoId={documentoId} alCerrar={() => setPegarSeg(false)} alAplicado={() => { setVersionActuaciones((n) => n + 1); void cargar() }} />
          {!compacto && !t.puede_std && !t.std && t.motivo_std && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t.motivo_std}
            </Typography>
          )}
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* --- Responsable ----------------------------------------------- */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <AssignmentIndIcon fontSize="small" sx={{ opacity: 0.6 }} />
        <Typography variant="body2">
          Responsable: <b>{resp || '— sin asignar —'}</b>
        </Typography>
        <Button size="small" onClick={() => { setEncargoA(''); setDlgEncargo(true) }}>
          {resp ? 'Cambiar' : 'Encargar a…'}
        </Button>
        {asignaciones.length > 0 && (
          <Button size="small" onClick={() => setVerHistorial((v) => !v)}>
            {verHistorial ? 'Ocultar historial' : `Historial (${asignaciones.length})`}
          </Button>
        )}
      </Stack>
      {verHistorial && (
        <Box sx={{ mt: 1, pl: 3 }}>
          {asignaciones.map((a) => (
            <Typography key={a.id} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              {fecha(a.creado_en)} · <b>{a.responsable}</b> (asignó {a.asignado_por})
              {a.nota ? ` — ${a.nota}` : ''}
            </Typography>
          ))}
        </Box>
      )}

      {compacto && (
        <>
          {/* En el editor las observaciones van JUNTO a cada campo o sección
              (Edison 2026-09-05: «esa sección debemos eliminarla»). Aquí solo
              queda el resumen de lo pendiente y las generales que lleguen de la
              bandeja, para que no se pierdan. */}
          {(enSecciones.length > 0 || pendientes.length > 0) && <Divider sx={{ my: 1.5 }} />}
          {enSecciones.length > 0 && (
            <Alert severity="warning" icon={false} sx={{ mb: 1, py: 0 }}>
              <Typography variant="body2">
                {enSecciones.length === 1
                  ? 'Hay 1 observación pendiente en '
                  : `Hay ${enSecciones.length} observaciones pendientes en `}
                <b>{Array.from(new Set(enSecciones.map((c) => c.seccion_nombre))).join(', ')}</b>.
                Están junto al campo, con el icono dorado.
              </Typography>
            </Alert>
          )}
          {pendientes.map((c) => (
            <TarjetaComentario key={c.id} c={c} conSeccion alLevantar={(x) => void com.levantar(x)} />
          ))}
        </>
      )}

      {!compacto && <Divider sx={{ my: 1.5 }} />}

      {/* --- Observaciones e indicaciones (bandeja y vista heredada) ------ */}
      {!compacto && (<>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <CommentIcon fontSize="small" sx={{ opacity: 0.6 }} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Observaciones e indicaciones
        </Typography>
        {pendientes.length > 0 && (
          <Chip size="small" color="warning" label={`${pendientes.length} pendiente(s)`} />
        )}
      </Stack>

      {pendientes.length === 0 && atendidos.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Sin comentarios. Escriba aquí lo que debe corregirse o el trabajo encargado.
        </Typography>
      )}

      {pendientes.map((c) => (
        <TarjetaComentario key={c.id} c={c} conSeccion alLevantar={(x) => void com.levantar(x)} />
      ))}

      {atendidos.map((c) => (
        <Box key={c.id} sx={{ mb: 0.75, pl: 1, borderLeft: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" sx={{ textDecoration: 'line-through', opacity: 0.65 }}>
            {c.texto}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {/* Un punto del tono (salvia = conforme, arena = pendiente de conformidad) en vez de la franja. */}
            <Box component="span" sx={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', mr: 0.75, verticalAlign: 'middle', bgcolor: c.conformidad === 'conforme' ? PALETA.exito : PALETA.aviso }} />
            {c.tipo_nombre}
            {c.seccion ? ` sobre «${c.seccion_nombre}»` : ''} de {c.autor} · subsanada por {c.resuelto_por || '—'} {fecha(c.resuelto_en)}
            {c.respuesta ? ` — ${c.respuesta}` : ''}
            {c.conformidad === 'conforme' ? ' · conforme' : ' · pendiente de conformidad'}
          </Typography>
          {c.tipo === 'observacion' && !c.conformidad && c.usuario_id === miId && (
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Button size="small" variant="outlined" onClick={() => void com.conformidad(c, 'conforme')}>
                Conforme
              </Button>
              <Button size="small" color="warning" onClick={() => void com.conformidad(c, 'pendiente')}>
                Sigue pendiente
              </Button>
            </Stack>
          )}
        </Box>
      ))}

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="flex-start">
        <TextField
          select
          size="small"
          value={nuevoTipo}
          onChange={(e) => setNuevoTipo(e.target.value)}
          sx={{ width: 150 }}
        >
          <MenuItem value="observacion">Observación</MenuItem>
          <MenuItem value="indicacion">Indicación</MenuItem>
          <MenuItem value="nota">Nota</MenuItem>
        </TextField>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={1}
          placeholder="¿Qué se debe corregir o hacer?"
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
        />
        <Button variant="outlined" onClick={() => void agregarComentario()} sx={{ whiteSpace: 'nowrap' }}>
          Agregar
        </Button>
      </Stack>
      </>)}

      {/* --- Diálogo: registrar en el STD ------------------------------ */}
      <Dialog open={dlgStd} onClose={() => setDlgStd(false)} fullWidth maxWidth="xs" fullScreen={celular}>
        <DialogTitle>Registrar en el STD del Congreso</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            El n.º que dio Mesa de Partes al registrar el cargo.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="N.º de expediente STD"
            value={stdNumero}
            onChange={(e) => setStdNumero(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            size="small"
            type="date"
            label="Fecha de registro"
            InputLabelProps={{ shrink: true }}
            value={stdFecha}
            onChange={(e) => setStdFecha(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgStd(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarStd}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- Diálogo: encargar el documento ---------------------------- */}
      <Dialog open={dlgEncargo} onClose={() => setDlgEncargo(false)} fullWidth maxWidth="xs" fullScreen={celular}>
        <DialogTitle>Encargar el documento</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            size="small"
            label="Responsable"
            value={encargoA}
            onChange={(e) => setEncargoA(e.target.value === '' ? '' : Number(e.target.value))}
            sx={{ mt: 1, mb: 2 }}
          >
            <MenuItem value="">— sin responsable —</MenuItem>
            {equipo.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.nombre_completo} ({m.cargo || m.rol})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            size="small"
            multiline
            minRows={3}
            label="Indicación del trabajo (opcional)"
            placeholder="Qué debe hacer la persona encargada"
            value={encargoNota}
            onChange={(e) => setEncargoNota(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgEncargo(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarEncargo}>
            Encargar
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

/** N.º de expediente de la entidad (2026-10-08): se lee solo del cargo de recepción; aquí se ve,
 *  se copia y se corrige. Sirve para preguntar por el documento en la entidad. */
function ExpedienteEntidad({ documentoId, valor, alGuardar, alError }: {
  documentoId: number | string
  valor: string
  alGuardar: (v: string) => void
  alError: (t: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(valor)
  useEffect(() => setTexto(valor), [valor])
  const guardar = async () => {
    try {
      const r = await api<{ expediente_entidad: string }>(`/api/documentos/${documentoId}/expediente-entidad`, {
        method: 'PUT',
        body: JSON.stringify({ numero: texto }),
      })
      alGuardar(r.expediente_entidad)
      setEditando(false)
    } catch (err) {
      alError(err instanceof Error ? err.message : 'No se pudo guardar el n.º de expediente.')
    }
  }
  if (editando) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField size="small" label="N.º de expediente en la entidad" value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void guardar() }} autoFocus sx={{ flex: 1 }} />
        <Button size="small" variant="contained" onClick={() => void guardar()}>Guardar</Button>
        <Button size="small" onClick={() => { setTexto(valor); setEditando(false) }}>Cancelar</Button>
      </Stack>
    )
  }
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
      Expediente en la entidad:{' '}
      {valor ? <b style={{ color: 'inherit' }}>{valor}</b> : <span>se lee solo del cargo de recepción</span>}
      <Button size="small" onClick={() => setEditando(true)} sx={{ ml: 0.5, minWidth: 0 }}>{valor ? 'Corregir' : 'Escribir'}</Button>
    </Typography>
  )
}

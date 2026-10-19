/**
 * OBSERVACIONES JUNTO A CADA PARTE DEL DOCUMENTO (Edison 2026-09-05).
 *
 * «Las observaciones deberían colocarse al lado de cada formulario o sección
 * correspondiente. De esta manera, el secretario podrá identificar fácilmente
 * qué parte debe modificarse.» Antes todas iban en el panel de seguimiento,
 * en una lista, y quien corregía tenía que adivinar a qué campo se refería
 * «está mal el cargo».
 *
 * Cómo funciona:
 *   · Cada comentario lleva `seccion`: la clave del campo ('asunto',
 *     'con_copia'…) o de la sección ('cuerpo', 'anexos', 'archivos'). Vacío
 *     = el documento en general (lo de siempre, en el panel de seguimiento).
 *   · UN solo origen de datos: `useComentarios` carga la lista una vez y la
 *     comparte por contexto con el formulario, las secciones y el panel de
 *     seguimiento. Sin contexto (la bandeja, la vista heredada) el panel usa
 *     su propia copia del hook: nada cambia para ellos.
 *   · `MarcaObservacion` es el botoncito de comentario que se pone junto a
 *     un campo o al título de una sección (con el conteo de pendientes);
 *     abre un globo para escribir la observación anclada ahí.
 *   · `PendientesSeccion` pinta, debajo del campo, las observaciones abiertas
 *     de esa parte, con el botón de «atendido».
 *   · `ConObservaciones` envuelve un campo con las dos cosas de arriba.
 *
 * La regla de quién puede observar y si eso mueve el estado sigue en el
 * servidor (`servicios/revision.py`): aquí solo se ELIGE el lugar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CommentOutlinedIcon from '@mui/icons-material/CommentOutlined'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import { api, esSinServidor } from '../api'
import { cuerpoDe, encolarEscritura } from '../sinconexion'
import { SE_GUARDARA } from '../avisoBreve'
import { useEnEspera } from './EnEsperaLista'
import { ETIQUETA_ESTADO } from '../estados'
import { Titulo } from './Estilo'

export interface Comentario {
  id: number
  tipo: string
  tipo_nombre: string
  texto: string
  seccion: string
  seccion_nombre: string
  autor: string
  dirigido_a: string
  estado_destino: string
  resuelto: boolean
  resuelto_por: string
  resuelto_en: string | null
  respuesta: string
  creado_en: string | null
  usuario_id?: number
  conformidad?: string
}

// Copia del mapa del servidor (servicios/comentarios.py::ETIQUETA_SECCION)
// para rotular sin esperar la respuesta; el servidor manda `seccion_nombre`
// en cada comentario y es el que vale.
export const ETIQUETA_SECCION: Record<string, string> = {
  '': 'General',
  destinatario_nombre: 'Destinatario',
  destinatario_tratamiento: 'Tratamiento',
  destinatario_cargo: 'Cargo del destinatario',
  asunto: 'Asunto',
  referencia: 'Referencia',
  fecha: 'Fecha',
  con_copia: 'Copias (c.c.)',
  anexo: 'Línea Adj.',
  para: 'Para',
  de: 'De',
  sumilla_solicito: 'Sumilla',
  destinatario_institucion: 'Institución',
  destinatario_lugar: 'Dependencia',
  clase_sesion: 'Clase de sesión',
  organo: 'Órgano',
  presidente_nombre: 'Presidente',
  presidente_cargo: 'Cargo del presidente',
  secretario_nombre: 'Secretario',
  secretario_cargo: 'Cargo del secretario',
  cuerpo: 'Cuerpo del documento',
  anexos: 'Anexos',
  formato: 'Formato',
  archivos: 'Archivos',
}

interface RespuestaEstado {
  estado?: string
  estado_automatico?: boolean
  /** El id del comentario creado (2026-10-19): para anclarlo a un tramo del texto. */
  id?: number
}

export interface Comentarios {
  lista: Comentario[]
  pendientes: Comentario[]
  recargar: () => Promise<void>
  /** Devuelve el id del comentario creado, o null si quedó en espera o falló. */
  agregar: (texto: string, tipo: string, seccion: string) => Promise<number | null>
  levantar: (c: Comentario) => Promise<void>
  /** Quien observó revisa la subsanación: 'conforme' o 'pendiente' (reabre). */
  conformidad: (c: Comentario, valor: 'conforme' | 'pendiente') => Promise<void>
}

export const fechaCorta = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : ''

/**
 * Carga y opera los comentarios de UN documento. `activo=false` no consulta
 * nada (para que un componente pueda ceder el trabajo al contexto).
 * `alAvisar` recibe los mensajes de éxito/error; `alEstado` se llama cuando
 * un comentario movió el estado del documento (observar / levantar).
 */
export function useComentarios(
  documentoId: number | string,
  activo = true,
  alAvisar?: (tipo: 'success' | 'error' | 'info', texto: string) => void,
  alEstado?: () => void,
): Comentarios {
  const [lista, setLista] = useState<Comentario[]>([])

  const recargar = useCallback(async () => {
    if (!activo) return
    try {
      setLista(await api<Comentario[]>(`/api/documentos/${documentoId}/comentarios`))
    } catch {
      setLista([])
    }
  }, [documentoId, activo])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const agregar = useCallback(
    async (texto: string, tipo: string, seccion: string) => {
      if (texto.trim().length < 5) {
        alAvisar?.('error', 'Escriba al menos una frase: quien corrige debe entender qué hacer.')
        return null
      }
      try {
        const r = await api<RespuestaEstado>(`/api/documentos/${documentoId}/comentarios`, {
          method: 'POST',
          body: JSON.stringify({ texto, tipo, seccion }),
        }).catch((e: unknown) => {
          if (!esSinServidor(e)) throw e
          // Sin servidor (2026-10-18): la observación espera en la cola y se ve «En espera»; el
          // servidor aplica al recibirla las mismas reglas (y el cambio de estado, si toca).
          encolarEscritura(`/api/documentos/${documentoId}/comentarios`, JSON.stringify({ texto, tipo, seccion }), `Comentario: ${texto.slice(0, 40)}`, 'observacion')
          return 'en_espera' as const
        })
        if (r === 'en_espera') {
          alAvisar?.('info', SE_GUARDARA)
          return null
        }
        await recargar()
        if (r?.estado_automatico) {
          alAvisar?.(
            'info',
            `Observación registrada. El documento pasó a «${ETIQUETA_ESTADO[r.estado ?? ''] ?? r.estado}».`,
          )
          alEstado?.()
        } else {
          alAvisar?.('success', 'Comentario registrado.')
        }
        return r?.id ?? null
      } catch (e) {
        alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo guardar el comentario.')
        return null
      }
    },
    [documentoId, recargar, alAvisar, alEstado],
  )

  const levantar = useCallback(
    async (c: Comentario) => {
      if (c.id < 0) return alAvisar?.('info', SE_GUARDARA)
      try {
        const r = await api<RespuestaEstado>(
          `/api/documentos/${documentoId}/comentarios/${c.id}/levantar`,
          { method: 'POST', body: JSON.stringify({ respuesta: '' }) },
        )
        await recargar()
        if (r?.estado_automatico) {
          alAvisar?.(
            'info',
            'Era la última observación pendiente: el documento volvió a '
              + `«${ETIQUETA_ESTADO[r.estado ?? ''] ?? r.estado}».`,
          )
          alEstado?.()
        }
      } catch (e) {
        alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo atender el comentario.')
      }
    },
    [documentoId, recargar, alAvisar, alEstado],
  )

  const conformidad = useCallback(
    async (c: Comentario, valor: 'conforme' | 'pendiente') => {
      if (c.id < 0) return alAvisar?.('info', SE_GUARDARA)
      try {
        const r = await api<RespuestaEstado>(
          `/api/documentos/${documentoId}/comentarios/${c.id}/conformidad`,
          { method: 'POST', body: JSON.stringify({ valor }) },
        )
        await recargar()
        alAvisar?.(
          valor === 'conforme' ? 'success' : 'info',
          valor === 'conforme'
            ? 'Conformidad registrada.'
            : `La observación vuelve a estar pendiente${r?.estado_automatico ? ` y el documento pasó a «${ETIQUETA_ESTADO[r.estado ?? ''] ?? r.estado}»` : ''}.`,
        )
        if (r?.estado_automatico) alEstado?.()
      } catch (e) {
        alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo registrar.')
      }
    },
    [documentoId, recargar, alAvisar, alEstado],
  )

  // Lo observado sin servidor, al final y rotulado «En espera» (id negativo: no se atiende aún).
  const enEspera = useEnEspera(`/api/documentos/${documentoId}/comentarios`, undefined, () => void recargar())
  const listaCompleta = useMemo(
    () => [
      ...lista,
      ...enEspera.map((c, i): Comentario => {
        const o = cuerpoDe(c)
        const seccion = String(o.seccion ?? '')
        return {
          id: -(i + 1), tipo: String(o.tipo ?? 'comentario'), tipo_nombre: o.tipo === 'observacion' ? 'Observación' : 'Comentario', texto: String(o.texto ?? ''),
          seccion, seccion_nombre: ETIQUETA_SECCION[seccion] ?? seccion, autor: 'usted · en espera, se enviará al volver la conexión',
          dirigido_a: '', estado_destino: '', resuelto: false, resuelto_por: '', resuelto_en: null, respuesta: '',
          creado_en: new Date(c.creado_en).toISOString(),
        }
      }),
    ],
    [lista, enEspera],
  )
  const pendientes = useMemo(() => listaCompleta.filter((c) => !c.resuelto), [listaCompleta])

  return useMemo(
    () => ({ lista: listaCompleta, pendientes, recargar, agregar, levantar, conformidad }),
    [listaCompleta, pendientes, recargar, agregar, levantar, conformidad],
  )
}

export const ComentariosContext = createContext<Comentarios | null>(null)

/** Botón de comentario anclado a una parte del documento. Sin contexto (una
 *  vista que no comparte comentarios) no pinta nada. */
export function MarcaObservacion({
  seccion,
  sx,
}: {
  seccion: string
  sx?: object
}) {
  const com = useContext(ComentariosContext)
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('observacion')
  const [enviando, setEnviando] = useState(false)
  if (!com) return null
  const n = com.pendientes.filter((c) => c.seccion === seccion).length
  const etiqueta = ETIQUETA_SECCION[seccion] ?? seccion

  const enviar = async () => {
    setEnviando(true)
    await com.agregar(texto, tipo, seccion)
    setEnviando(false)
    setTexto('')
    setAncla(null)
  }

  return (
    <>
      <Tooltip title={n ? `${n} pendiente(s) en «${etiqueta}». Clic para observar esta parte.` : `Observar «${etiqueta}»`}>
        <IconButton
          size="small"
          onClick={(e) => setAncla(e.currentTarget)}
          aria-label={`Observar ${etiqueta}`}
          sx={{ color: n ? 'warning.main' : 'text.disabled', ...sx }}
        >
          <Badge badgeContent={n} color="warning" overlap="circular">
            <CommentOutlinedIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={ancla !== null}
        anchorEl={ancla}
        onClose={() => setAncla(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 1.5, width: 360, maxWidth: '90vw' } } }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
          Sobre «{etiqueta}»
        </Typography>
        <Stack spacing={1}>
          <TextField
            select
            size="small"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            sx={{ width: 160 }}
          >
            <MenuItem value="observacion">Observación</MenuItem>
            <MenuItem value="indicacion">Indicación</MenuItem>
            <MenuItem value="nota">Nota</MenuItem>
          </TextField>
          <TextField
            autoFocus
            size="small"
            fullWidth
            multiline
            minRows={2}
            placeholder="¿Qué hay que corregir aquí?"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviar()
            }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={() => setAncla(null)}>
              Cancelar
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => void enviar()}
              disabled={enviando || texto.trim().length < 5}
            >
              Registrar
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  )
}

/** Una observación pendiente, compacta, con su botón de «atendido». */
export function TarjetaComentario({
  c,
  alLevantar,
  conSeccion = false,
}: {
  c: Comentario
  alLevantar?: (c: Comentario) => void
  conSeccion?: boolean
}) {
  return (
    <Alert
      severity={c.tipo === 'observacion' ? 'warning' : 'info'}
      sx={{ mb: 0.75, py: 0, '& .MuiAlert-message': { py: 0.5 } }}
      action={
        alLevantar && (
          <Tooltip title="Marcar como subsanada: avisa a quien observó para que revise la nueva versión">
            <IconButton size="small" onClick={() => alLevantar(c)}>
              <DoneAllIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )
      }
    >
      <Typography variant="body2">{c.texto}</Typography>
      <Typography variant="caption" color="text.secondary">
        {c.tipo_nombre}
        {conSeccion && c.seccion ? ` sobre «${c.seccion_nombre}»` : ''} de {c.autor}
        {c.dirigido_a ? ` para ${c.dirigido_a}` : ''} · {fechaCorta(c.creado_en)}
      </Typography>
    </Alert>
  )
}

/** Las observaciones abiertas de una parte, debajo del campo. */
export function PendientesSeccion({ seccion }: { seccion: string }) {
  const com = useContext(ComentariosContext)
  if (!com) return null
  const propias = com.pendientes.filter((c) => c.seccion === seccion)
  if (propias.length === 0) return null
  return (
    <Box sx={{ mt: 0.5 }}>
      {propias.map((c) => (
        <TarjetaComentario key={c.id} c={c} alLevantar={(x) => void com.levantar(x)} />
      ))}
    </Box>
  )
}

/**
 * CANAL DERECHO de marcas (Edison 2026-09-07: «alinear verticalmente todos
 * los iconos de comentarios»). Cada campo y cada título de sección reserva a
 * la derecha una columna del MISMO ancho, con los iconos pegados al borde
 * derecho; así la marca de observación queda siempre en la misma vertical
 * (antes la de la fecha se quedaba junto a su campo corto y la del cuerpo
 * junto al texto del título). Si una parte tiene además ajustes de formato,
 * su icono va a la IZQUIERDA de la marca de observación, en el mismo canal.
 */
export const ANCHO_CANAL = 64

/** El canal: iconos a la derecha, ancho fijo. */
export function Canal({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        flex: `0 0 ${ANCHO_CANAL}px`,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 0,
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

/**
 * Envuelve un campo del formulario: el botón de observar (y, si lo hay, el
 * de formato) en el canal derecho, y las pendientes debajo. Sin contexto
 * devuelve el campo tal cual.
 */
export function ConObservaciones({
  seccion,
  children,
  extra,
}: {
  seccion: string
  children: React.ReactNode
  /** Otra marca de la misma parte (p. ej. el icono de formato). */
  extra?: React.ReactNode
}) {
  const com = useContext(ComentariosContext)
  if (!com) return <>{children}</>
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
        <Canal sx={{ mt: 1.25 }}>
          {extra}
          <MarcaObservacion seccion={seccion} />
        </Canal>
      </Box>
      <PendientesSeccion seccion={seccion} />
    </Box>
  )
}

/** Título de sección con su marca de observación (y la de formato, si la
 *  hay) en el canal derecho (mismo `Titulo` del sistema, ver Estilo.tsx). */
export function TituloSeccion({
  seccion,
  children,
  variant = 'h6',
  sx,
  extra,
}: {
  seccion: string
  children: React.ReactNode
  variant?: 'h6' | 'subtitle2'
  sx?: object
  extra?: React.ReactNode
}) {
  return (
    <Box>
      <Titulo
        nivel={variant === 'h6' ? 'seccion' : 'sub'}
        sx={sx}
        accion={
          <Canal>
            {extra}
            <MarcaObservacion seccion={seccion} />
          </Canal>
        }
      >
        {children}
      </Titulo>
      <PendientesSeccion seccion={seccion} />
    </Box>
  )
}

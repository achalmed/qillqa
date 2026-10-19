/**
 * ARCHIVOS DEL TRÁMITE — una fila por pieza, y nada más (Edison 2026-09-05:
 * «es muy abrumador; hay duplicidad de iconos»).
 *
 * Cada pieza es UNA línea: el círculo de su paso (el mismo de toda la
 * aplicación), su nombre, su estado (punto + palabra) y, a la derecha, la
 * única acción posible: el botón para subir, o el archivo ya subido con
 * descargar/eliminar. Sin icono de sección, sin párrafo explicativo (va en el
 * tooltip ⓘ) y sin texto de «todavía no hay…» que repita lo que el botón ya
 * dice.
 *
 *   ┌ ⑤ Documento firmado  ● firmado ┐  ┌ ⑦ Cargo de recepción  ● pendiente ┐
 *   │ [PDF] FIRM-OF-0121….pdf   ⤓ 🗑 │  │     [Subir cargo de recepción]     │
 *   └────────────────────────────────┘  └────────────────────────────────────┘
 *     Documentos recibidos      ● ninguno                                   ⌄
 * (firmado y cargo lado a lado desde 2026-10-06; en el celular, uno bajo otro)
 *
 * La tercera pieza (recibidos y relacionados) sí se pliega, porque dentro
 * lleva formularios. Se abre sola cuando tiene contenido.
 *
 * Los DOCUMENTOS ADJUNTOS no van aquí: son anexos (sección 1.7).
 */
import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import GestionEntrega from './GestionEntrega'
import RelacionesDocumento from './RelacionesDocumento'
import { MarcaObservacion, PendientesSeccion } from './ObservacionesSeccion'
import { etapaDe, type Etapa } from '../flujo'
import { NumeroPaso } from './Paso'
import { Bloque, EstadoPieza, Titulo } from './Estilo'
import { PALETA } from '../paleta'

type Avisar = (tipo: 'success' | 'error', texto: string) => void

/** Cabecera de una pieza: [círculo] nombre ⓘ · estado · (acción a la derecha). */
function Pieza({
  paso,
  titulo,
  ayuda,
  estado,
  texto,
  derecha,
  onClick,
  abierta,
  children,
}: {
  paso?: Etapa | null
  titulo: string
  ayuda: string
  estado: 'pendiente' | 'parcial' | 'completo' | 'neutro'
  texto: string
  derecha?: React.ReactNode
  onClick?: () => void
  abierta?: boolean
  children?: React.ReactNode
}) {
  return (
    <Box sx={{ py: 1, borderTop: `1px solid ${PALETA.borde}` }}>
      <Box
        onClick={onClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          minHeight: 36,
          cursor: onClick ? 'pointer' : 'default',
          borderRadius: 1,
          '&:hover': onClick ? { bgcolor: 'action.hover' } : undefined,
        }}
      >
        <Box sx={{ width: 20, display: 'flex', justifyContent: 'center', flex: '0 0 auto' }}>
          {/* El número del paso, sin check: el estado lo dice la etiqueta («● firmado»), una sola marca. */}
          {paso && <NumeroPaso paso={paso} tamano={18} siempreNumero />}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {titulo}
        </Typography>
        <Tooltip title={ayuda}>
          <InfoOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
        </Tooltip>
        <Box sx={{ width: 8 }} />
        <EstadoPieza estado={estado} texto={texto} />
        <Box sx={{ flexGrow: 1 }} />
        {derecha}
        {onClick && (
          <IconButton size="small" aria-label={abierta ? 'Plegar' : 'Desplegar'}>
            {abierta ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>
      {children}
    </Box>
  )
}

/** Tarjeta de una pieza del trámite (firmado, cargo): cabecera con su paso, nombre, ⓘ y estado;
 * debajo, el archivo o el botón para subirlo. Completa: borde verde tenue y fondo blanco. */
function Ranura({
  paso,
  titulo,
  ayuda,
  estado,
  texto,
  children,
}: {
  paso?: Etapa | null
  titulo: string
  ayuda: string
  estado: 'pendiente' | 'parcial' | 'completo' | 'neutro'
  texto: string
  children: React.ReactNode
}) {
  const completa = estado === 'completo'
  return (
    <Box
      sx={{
        minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, borderRadius: 2,
        border: '1px solid', borderColor: completa ? PALETA.exitoBorde : 'divider',
        bgcolor: completa ? 'background.paper' : PALETA.superficieTenue,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {paso && <NumeroPaso paso={paso} tamano={20} siempreNumero />}
        <Typography variant="body2" sx={{ fontWeight: 650 }}>{titulo}</Typography>
        <Tooltip title={ayuda}>
          <InfoOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <EstadoPieza estado={estado} texto={texto} />
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

export default function PanelArchivos({
  documentoId,
  destinatarios,
  etapas,
  interno = false,
  alAvisar,
  alActualizar,
}: {
  documentoId: string
  destinatarios: string[]
  etapas?: Etapa[]
  // Documento que circula DENTRO del Congreso: el cargo de recepción no se
  // exige (basta el registro en el STD), así que la pieza lo dice.
  interno?: boolean
  alAvisar?: Avisar
  alActualizar?: () => void
}) {
  const [entrega, setEntrega] = useState({ firmado: false, recepciones: 0, requeridas: 1 })
  const [nRespuestas, setNRespuestas] = useState(0)
  // `null` = manda la apertura automática (se abre si tiene contenido).
  const [abierta, setAbierta] = useState<boolean | null>(null)

  const contarEntrega = useCallback((r: typeof entrega) => setEntrega(r), [])
  const contarRespuestas = useCallback((n: number) => setNRespuestas(n), [])
  useEffect(() => setAbierta(null), [documentoId])

  const recepcionCompleta = entrega.recepciones >= entrega.requeridas
  const multiple = destinatarios.length > 1
  const recibidosAbierto = abierta ?? nRespuestas > 0

  const comun = { documentoId, destinatarios, etapas, alAvisar, alActualizar }

  return (
    <Bloque>
      <Titulo accion={<MarcaObservacion seccion="archivos" />}>Archivos del trámite</Titulo>
      <PendientesSeccion seccion="archivos" />

      {/* ⑤ Documento firmado y ⑦ cargo de recepción, lado a lado (Edison 2026-10-06: «en una sola
          fila»; en el celular, uno bajo otro). Cada uno en su tarjeta: sin archivo, el botón para
          subirlo; con archivo, el archivo. Una sola marca de estado por tarjeta. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mt: 1, mb: 1.5 }}>
        <Ranura
          paso={etapaDe(etapas, 'firmado')}
          titulo="Documento firmado"
          ayuda="PDF firmado; el documento pasa a «Firmado»."
          estado={entrega.firmado ? 'completo' : 'pendiente'}
          texto={entrega.firmado ? 'firmado' : 'pendiente'}
        >
          <GestionEntrega {...comun} parte="firmado" alContar={contarEntrega} compacto />
        </Ranura>
        <Ranura
          paso={etapaDe(etapas, 'recepcion')}
          titulo="Cargo de recepción"
          ayuda={
            interno
              ? 'Interno: basta el registro en el STD.'
              : multiple
                ? 'El cargo sellado que devuelve CADA entidad al recibir el documento (uno por destinatario).'
                : 'El cargo sellado que devuelve la entidad al recibir el documento.'
          }
          estado={recepcionCompleta ? 'completo' : entrega.recepciones > 0 ? 'parcial' : interno ? 'neutro' : 'pendiente'}
          texto={
            multiple
              ? `${entrega.recepciones}/${entrega.requeridas}`
              : recepcionCompleta
                ? 'recibido'
                : interno
                  ? 'no requerido'
                  : 'pendiente'
          }
        >
          <GestionEntrega {...comun} parte="recepcion" compacto />
        </Ranura>
      </Box>

      {/* El EXPEDIENTE ya no va aquí: se arma al cierre de la sección Anexos
          (Expediente.tsx::ArmarExpediente), donde están los adjuntos que lo
          forman, y se ve en la pestaña «Expediente» del visor (2026-10-01). */}

      {/* Recibidos y relacionados: se pliega porque lleva formularios. */}
      <Pieza
        titulo="Documentos recibidos y relacionados"
        ayuda="Internos y respuestas de entidades."
        estado={nRespuestas > 0 ? 'completo' : 'neutro'}
        texto={nRespuestas > 0 ? String(nRespuestas) : 'ninguno'}
        onClick={() => setAbierta(!recibidosAbierto)}
        abierta={recibidosAbierto}
      >
        <Collapse in={recibidosAbierto}>
          <Box sx={{ pl: 4, pt: 1 }} onClick={(e) => e.stopPropagation()}>
            <RelacionesDocumento
              documentoId={documentoId}
              alAvisar={alAvisar}
              alActualizar={alActualizar}
              alContar={contarRespuestas}
            />
          </Box>
        </Collapse>
      </Pieza>
    </Bloque>
  )
}

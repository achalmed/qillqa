import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PALETA } from '../paleta'
import Typography from '@mui/material/Typography'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import RefreshIcon from '@mui/icons-material/Refresh'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import Marco from '../componentes/Marco'
import { api } from '../api'
import { COLOR_ESTADO, ETIQUETA_ESTADO } from '../estados'
import { type Correspondencia, rutaEstado, rutaMapa, textoEspera } from '../correspondencia'

interface Datos {
  totales: {
    documentos: number
    en_tramite: number
    enviados: number
    archivados: number
    numerados: number
    borradores: number
    anexos: number
    firmados: number
    constancias: number
    eventos: number
  }
  por_estado: Record<string, number>
  por_tipo: { tipo: string; nombre: string; total: number; numerados: number; enviados: number }[]
  por_mes: { mes: string; total: number }[]
  // `foco`: su nodo en el Mapa de relaciones ('' si no está en el directorio).
  top_instituciones: { nombre: string; total: number; foco: string }[]
  top_destinatarios: { nombre: string; total: number; foco: string }[]
  actividad: { dia: string; eventos: number }[]
  correspondencia?: Correspondencia
}

// Lo que se puede pulsar se ve igual en todo el panel: fondo tenue al pasar y foco de teclado.
const PULSABLE = {
  cursor: 'pointer', borderRadius: 1.5, mx: -0.75, px: 0.75,
  '&:hover': { bgcolor: PALETA.superficieMedia },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 1 },
} as const

function pulsable(al?: () => void, rotulo?: string) {
  if (!al) return {}
  return {
    role: 'button', tabIndex: 0, 'aria-label': rotulo, onClick: al,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); al() } },
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

function Tarjeta({ titulo, valor, color, al }: { titulo: string; valor: number; color?: string; al?: () => void }) {
  return (
    <Paper
      {...pulsable(al, `${titulo}: ${valor}. Ver la lista`)}
      sx={{ p: { xs: 1, sm: 1.5 }, minWidth: 0, textAlign: 'center', bgcolor: PALETA.superficieTenue, borderRadius: 2.5, ...(al ? { cursor: 'pointer', '&:hover': { bgcolor: PALETA.superficieMedia } } : {}) }}
    >
      {/* La cifra en tinta; el color del estado, como punto junto al rótulo (rediseño 2026-10-19). */}
      <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: 26, sm: 34 } }}>
        {valor}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        {color && <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />}
        {titulo}
      </Typography>
    </Paper>
  )
}

// Barra horizontal: etiqueta + barra proporcional + conteo.
function BarraH({
  etiqueta,
  valor,
  max,
  color,
  detalle,
  al,
  pista,
}: {
  etiqueta: string
  valor: number
  max: number
  color?: string
  detalle?: string
  /** Al pulsar la fila (la lista filtrada o su nodo del mapa). */
  al?: () => void
  pista?: string
}) {
  const pct = max > 0 ? Math.max(3, Math.round((valor / max) * 100)) : 0
  return (
    <Box {...pulsable(al, `${etiqueta}: ${valor}. ${pista ?? ''}`)} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, ...(al ? PULSABLE : {}) }}>
      <Tooltip title={pista ? `${etiqueta} · ${pista}` : etiqueta} placement="top-start">
        <Box
          sx={{
            // En el celular la etiqueta cede sitio a la barra (el nombre
            // completo sigue en el tooltip).
            width: { xs: 108, sm: 210 },
            flexShrink: 0,
            fontSize: { xs: 12, sm: 13 },
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {etiqueta}
        </Box>
      </Tooltip>
      <Box sx={{ flex: 1, bgcolor: PALETA.superficieMedia, borderRadius: 1, height: 18 }}>
        <Box
          sx={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 1,
            bgcolor: color ?? 'primary.main',
            transition: 'width .3s',
          }}
        />
      </Box>
      <Box sx={{ width: { xs: 'auto', sm: 64 }, minWidth: 28, flexShrink: 0, fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <b>{valor}</b>
        {detalle ? <span style={{ color: PALETA.textoTenue }}> {detalle}</span> : null}
      </Box>
    </Box>
  )
}

// Mini gráfico de columnas (meses o días).
function Columnas({
  datos,
  color,
  etiquetaDe,
  tituloDe,
}: {
  datos: { clave: string; valor: number }[]
  color: string
  etiquetaDe: (clave: string) => string
  tituloDe: (clave: string, valor: number) => string
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  // Con muchas columnas (30 días) en pantalla angosta, las etiquetas se
  // pisarían: se rotula una de cada tres (el valor sigue en el tooltip).
  const salto = datos.length > 14 ? 3 : 1
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: 0.25, sm: 0.75 }, height: 120 }}>
      {datos.map((d, i) => (
        <Tooltip key={d.clave} title={tituloDe(d.clave, d.valor)}>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
            <Box sx={{ fontSize: { xs: 9.5, sm: 11 }, color: 'text.secondary' }}>{d.valor || ''}</Box>
            <Box
              sx={{
                width: '100%',
                maxWidth: 34,
                height: `${Math.max(3, (d.valor / max) * 84)}px`,
                bgcolor: d.valor ? color : PALETA.superficieMedia,
                borderRadius: '3px 3px 0 0',
              }}
            />
            <Box sx={{ fontSize: 10.5, color: 'text.secondary', whiteSpace: 'nowrap', visibility: { xs: i % salto === 0 ? 'visible' : 'hidden', sm: 'visible' } }}>
              {etiquetaDe(d.clave)}
            </Box>
          </Box>
        </Tooltip>
      ))}
    </Box>
  )
}

function Panel({ titulo, children, id, accion }: { titulo: string; children: React.ReactNode; id?: string; accion?: React.ReactNode }) {
  return (
    <Paper id={id} sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: PALETA.superficieTenue, borderRadius: 2.5, minWidth: 0, scrollMarginTop: 72 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }}>
          {titulo}
        </Typography>
        {accion}
      </Box>
      {children}
    </Paper>
  )
}

// Correspondencia (2026-10-19): lo que dice el Mapa de relaciones sobre las respuestas a lo
// enviado. Cada institución y cada oficio sin respuesta abre su nodo en el mapa.
function PanelCorrespondencia({ c, ir }: { c: Correspondencia; ir: (ruta: string) => void }) {
  const max = c.por_institucion[0]?.enviados ?? 1
  return (
    <Panel
      id="correspondencia"
      titulo="Correspondencia: respuestas a lo enviado"
      accion={
        <Button size="small" color="inherit" startIcon={<HubOutlinedIcon />} onClick={() => ir('/mapa')} sx={{ flexShrink: 0 }}>
          Mapa
        </Button>
      }
    >
      <Box sx={{ display: 'grid', gap: 1, mb: 2, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Tarjeta titulo="Enviados" valor={c.enviados} color={COLOR_ESTADO.ENVIADO} />
        <Tarjeta titulo="Con respuesta" valor={c.respondidos} color={COLOR_ESTADO.APROBADO} />
        <Tarjeta titulo="Sin respuesta" valor={c.sin_respuesta} color={COLOR_ESTADO.OBSERVADO} />
      </Box>
      {c.dias_promedio !== null && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Responden en {c.dias_promedio} día(s) en promedio, desde la fecha del oficio.
        </Typography>
      )}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Por institución (enviados y con respuesta)
          </Typography>
          {c.por_institucion.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Ningún oficio enviado se une todavía a una institución del directorio.</Typography>
          ) : (
            c.por_institucion.map((i) => (
              <BarraH
                key={i.foco}
                etiqueta={i.nombre}
                valor={i.enviados}
                max={max}
                color={COLOR_ESTADO.ENVIADO}
                detalle={`(${i.respondidos} resp.)`}
                al={() => ir(rutaMapa(i.foco)!)}
                pista={i.dias_promedio !== null ? `responde en ${i.dias_promedio} día(s) · abrir en el mapa` : 'abrir en el mapa'}
              />
            ))
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Sin respuesta, los más antiguos
          </Typography>
          {c.pendientes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Todo lo enviado tiene respuesta.</Typography>
          ) : (
            c.pendientes.map((p) => (
              <Box key={p.foco} {...pulsable(() => ir(rutaMapa(p.foco)!), `${p.numero}: abrir en el mapa`)} sx={{ ...PULSABLE, py: 0.5, mb: 0.25 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{p.numero}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 1, minWidth: 0, textAlign: 'right' }} noWrap>
                    {textoEspera(p.espera)}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }} noWrap>
                  {[p.destino, p.asunto].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Panel>
  )
}

export default function Estadisticas() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState(false)
  const ir = useNavigate()
  const { hash } = useLocation()
  const yaBajo = useRef(false)
  // Desde el mapa («Ver en Estadísticas») se llega al panel de correspondencia.
  useEffect(() => {
    if (!datos || yaBajo.current || hash !== '#correspondencia') return
    yaBajo.current = true
    document.getElementById('correspondencia')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [datos, hash])

  const cargar = () => {
    setError(false)
    api<Datos>('/api/estadisticas')
      .then(setDatos)
      .catch(() => setError(true))
  }
  useEffect(cargar, [])

  const mesCorto = (m: string) => {
    const [a, mm] = m.split('-')
    const nombre = MESES[Number(mm) - 1] ?? mm
    return mm === '01' ? `${nombre} ${a.slice(2)}` : nombre
  }

  return (
    // Estadísticas es una opción de Gestión documental (navegacion.ts): el
    // Marco da la barra, la franja de opciones y la vuelta a la bandeja.
    <Marco
      modulo="documentos"
      fondo={PALETA.fondo}
      acciones={
        <Tooltip title="Volver a pedir las cifras">
          <Button color="inherit" startIcon={<RefreshIcon />} onClick={cargar}>
            Refrescar
          </Button>
        </Tooltip>
      }
    >
      <Container maxWidth="xl" sx={{ mt: { xs: 2, sm: 3 }, mb: 6, px: { xs: 1.5, sm: 3 } }}>
        <Typography component="h2" sx={{ fontWeight: 600, fontSize: { xs: 17, sm: 19 }, mb: 1.5 }}>
          Estadísticas del sistema documental
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            No se pudieron cargar las estadísticas.
          </Alert>
        )}
        {!datos && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        )}
        {datos && (
          <>
            {/* Tarjetas de resumen */}
            {/* Rejilla: 2 por fila en el celular, 4 en tableta, 8 en escritorio. */}
            <Box sx={{ display: 'grid', gap: { xs: 1, sm: 1.5 }, mb: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(8, minmax(0, 1fr))' } }}>
              <Tarjeta titulo="Documentos" valor={datos.totales.documentos} />
              <Tarjeta titulo="En trámite" valor={datos.totales.en_tramite} color={COLOR_ESTADO.EN_REVISION} />
              <Tarjeta titulo="Enviados" valor={datos.totales.enviados} color={COLOR_ESTADO.ENVIADO} al={() => ir(rutaEstado('ENVIADO'))} />
              <Tarjeta titulo="Archivados" valor={datos.totales.archivados} color={COLOR_ESTADO.ARCHIVADO} al={() => ir(rutaEstado('ARCHIVADO'))} />
              <Tarjeta titulo="Con número oficial" valor={datos.totales.numerados} />
              <Tarjeta titulo="Con firmado subido" valor={datos.totales.firmados} color={COLOR_ESTADO.FIRMADO} />
              <Tarjeta titulo="Constancias" valor={datos.totales.constancias} />
              <Tarjeta titulo="Anexos y adjuntos" valor={datos.totales.anexos} />
            </Box>

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
              }}
            >
              <Panel titulo="Documentos por estado">
                {Object.entries(datos.por_estado)
                  .sort((a, b) => b[1] - a[1])
                  .map(([estado, n]) => (
                    <BarraH
                      key={estado}
                      etiqueta={ETIQUETA_ESTADO[estado] ?? estado}
                      valor={n}
                      max={Math.max(...Object.values(datos.por_estado))}
                      color={COLOR_ESTADO[estado] ?? PALETA.textoTenue}
                      al={() => ir(rutaEstado(estado))}
                      pista="ver la lista"
                    />
                  ))}
              </Panel>

              <Panel titulo="Documentos por tipo">
                {datos.por_tipo.map((t) => (
                  <BarraH
                    key={t.tipo}
                    etiqueta={t.nombre}
                    valor={t.total}
                    max={datos.por_tipo[0]?.total ?? 1}
                    detalle={`(${t.enviados} env.)`}
                  />
                ))}
              </Panel>

              <Panel titulo="Documentos creados por mes (últimos 12)">
                <Columnas
                  datos={datos.por_mes.map((m) => ({ clave: m.mes, valor: m.total }))}
                  color={COLOR_ESTADO.EN_REVISION}
                  etiquetaDe={mesCorto}
                  tituloDe={(c, v) => `${c}: ${v} documento(s)`}
                />
              </Panel>

              <Panel titulo={`Actividad del sistema (últimos 30 días · ${datos.totales.eventos} eventos en total)`}>
                {datos.actividad.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin actividad registrada en los últimos 30 días.
                  </Typography>
                ) : (
                  <Columnas
                    datos={datos.actividad.map((a) => ({ clave: a.dia, valor: a.eventos }))}
                    color={COLOR_ESTADO.APROBADO}
                    etiquetaDe={(d) => d.slice(8)}
                    tituloDe={(c, v) => `${c}: ${v} evento(s)`}
                  />
                )}
              </Panel>

              <Panel titulo="Instituciones más frecuentes (destino)">
                {datos.top_instituciones.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Aún no hay instituciones derivables de los documentos.
                  </Typography>
                ) : (
                  datos.top_instituciones.map((i) => (
                    <BarraH
                      key={i.nombre}
                      etiqueta={i.nombre}
                      valor={i.total}
                      max={datos.top_instituciones[0]?.total ?? 1}
                      color={COLOR_ESTADO.FIRMADO}
                      al={i.foco ? () => ir(rutaMapa(i.foco)!) : undefined}
                      pista={i.foco ? 'abrir en el mapa' : undefined}
                    />
                  ))
                )}
              </Panel>

              <Panel titulo="Destinatarios más frecuentes">
                {datos.top_destinatarios.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Aún no hay destinatarios registrados.
                  </Typography>
                ) : (
                  datos.top_destinatarios.map((d) => (
                    <BarraH
                      key={d.nombre}
                      etiqueta={d.nombre}
                      valor={d.total}
                      max={datos.top_destinatarios[0]?.total ?? 1}
                      color={COLOR_ESTADO.ENVIADO}
                      al={d.foco ? () => ir(rutaMapa(d.foco)!) : undefined}
                      pista={d.foco ? 'abrir en el mapa' : undefined}
                    />
                  ))
                )}
              </Panel>
            </Box>
            {datos.correspondencia && (
              <Box sx={{ mt: 2 }}>
                <PanelCorrespondencia c={datos.correspondencia} ir={ir} />
              </Box>
            )}
          </>
        )}
      </Container>
    </Marco>
  )
}

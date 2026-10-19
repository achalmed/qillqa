/**
 * ADMINISTRACIÓN → USO (2026-10-19, Edison): lo básico de las estadísticas de uso propias
 * (`GET /api/uso/resumen`, `GET /api/uso/cuentas`): módulos más usados, aparatos, versiones de la web
 * en uso, errores recientes y la supervisión por cuenta (estado de presencia REAL aunque la persona lo
 * haya apagado para los demás, última actividad, último módulo, vistas y errores de hoy). Sin
 * contenido: aquí nunca aparece un asunto, un texto ni una búsqueda. Paneles limpios: filas y
 * barras tenues, un «Copiar» por error.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { api } from '../../api'
import { PALETA } from '../../paleta'
import { MODULOS } from '../../navegacion'

interface Resumen {
  dias: number
  modulos: { modulo: string; vistas: number; personas: number; duracion_media_s: number }[]
  aparatos: { aparato: string; vistas: number; personas: number }[]
  anchos: { ancho: number; vistas: number }[]
  versiones: { version: string; ultimo: string; personas: number }[]
  por_dia: { dia: string; vistas: number; personas: number }[]
  errores_total: number
  errores: { momento: string; usuario: string; modulo: string; ruta: string; aparato: string; version: string; detalle: string }[]
}
interface Cuenta {
  id: number; nombre: string; rol: string; estado: 'en_linea' | 'ausente' | 'desconectado'; muestra_presencia: boolean
  ultima_actividad: string | null; ultimo_momento: string | null; ultimo_modulo: string; aparato: string; version: string; vistas_hoy: number; errores_hoy: number
}

const ESTADO = { en_linea: { t: 'En línea', c: PALETA.exito }, ausente: { t: 'Ausente', c: PALETA.apagado }, desconectado: { t: 'Desconectado', c: PALETA.bordeFuerte } } as const
const APARATO: Record<string, string> = { celular: 'Celular', tableta: 'Tableta', escritorio: 'Escritorio' }
const nombreModulo = (id: string) => MODULOS.find((m) => m.id === id)?.nombre ?? (id === 'inicio' ? 'Inicio' : id)
const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function Bloque({ titulo, children, nota }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: PALETA.borde, borderRadius: 2, bgcolor: PALETA.superficie, p: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 650, mb: nota ? 0 : 1 }}>{titulo}</Typography>
      {nota && <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>{nota}</Typography>}
      {children}
    </Box>
  )
}

function Barra({ etiqueta, valor, maximo, detalle }: { etiqueta: string; valor: number; maximo: number; detalle?: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 1, py: 0.4 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>{etiqueta}</Typography>
        <Box sx={{ height: 6, borderRadius: 3, bgcolor: PALETA.superficieMedia, mt: 0.4, overflow: 'hidden' }}>
          <Box sx={{ width: `${maximo ? Math.max(2, Math.round((valor / maximo) * 100)) : 0}%`, height: '100%', bgcolor: PALETA.primario, opacity: 0.55 }} />
        </Box>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{valor}{detalle ? ` · ${detalle}` : ''}</Typography>
    </Box>
  )
}

export default function Uso({ alAvisar }: { alAvisar: (texto: string) => void }) {
  const [dias, setDias] = useState<1 | 7 | 30 | 90>(7)
  const [r, setR] = useState<Resumen | null>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    setR(null)
    api<Resumen>(`/api/uso/resumen?dias=${dias}`).then(setR).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer el uso.'))
  }, [dias])
  useEffect(() => {
    const leer = () => api<Cuenta[]>('/api/uso/cuentas').then(setCuentas).catch(() => {})
    void leer()
    const t = window.setInterval(() => { if (!document.hidden) void leer() }, 30_000)
    return () => window.clearInterval(t)
  }, [])
  const copiar = (texto: string) => { void navigator.clipboard?.writeText(texto).then(() => alAvisar('Copiado.')).catch(() => alAvisar('No se pudo copiar.')) }
  const maxMod = Math.max(0, ...(r?.modulos.map((m) => m.vistas) ?? [0]))
  const vistas = r?.por_dia.reduce((a, d) => a + d.vistas, 0) ?? 0
  const personas = r ? Math.max(0, ...r.por_dia.map((d) => d.personas)) : 0
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={dias} onChange={(_, v) => v && setDias(v)} sx={{ '& .MuiToggleButton-root': { textTransform: 'none', py: 0.25, px: 1.25, fontSize: 12.5 } }}>
          <ToggleButton value={1}>Hoy</ToggleButton>
          <ToggleButton value={7}>7 días</ToggleButton>
          <ToggleButton value={30}>30 días</ToggleButton>
          <ToggleButton value={90}>90 días</ToggleButton>
        </ToggleButtonGroup>
        {r && <Typography variant="body2" color="text.secondary">{vistas} vistas · hasta {personas} persona{personas === 1 ? '' : 's'} en un día · {r.errores_total} error{r.errores_total === 1 ? '' : 'es'}</Typography>}
        {error && <Typography variant="body2" color="error">{error}</Typography>}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Bloque titulo="Módulos más usados" nota="Vistas, personas distintas y cuánto dura cada vista.">
          {r?.modulos.length === 0 && <Typography variant="body2" color="text.secondary">Todavía no hay datos.</Typography>}
          {r?.modulos.slice(0, 12).map((m) => <Barra key={m.modulo} etiqueta={nombreModulo(m.modulo)} valor={m.vistas} maximo={maxMod} detalle={`${m.personas} p. · ${m.duracion_media_s} s`} />)}
        </Bloque>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Bloque titulo="Aparatos" nota="Por el ancho de la ventana; los anchos más frecuentes, en píxeles.">
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
              {r?.aparatos.map((a) => <Chip key={a.aparato} size="small" label={`${APARATO[a.aparato] ?? a.aparato}: ${a.vistas} (${a.personas} p.)`} sx={{ bgcolor: PALETA.superficieMedia }} />)}
            </Box>
            <Typography variant="caption" color="text.secondary">{r?.anchos.map((a) => `${a.ancho} px (${a.vistas})`).join(' · ') || '—'}</Typography>
          </Bloque>
          <Bloque titulo="Versiones de la web en uso" nota="Una versión vieja en la lista es una pestaña que no se recargó tras publicar.">
            {r?.versiones.map((v) => (
              <Box key={v.version} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.25 }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{v.version}</Typography>
                <Typography variant="caption" color="text.secondary">{v.personas} p. · {cuando(v.ultimo)}</Typography>
              </Box>
            ))}
            {r?.versiones.length === 0 && <Typography variant="body2" color="text.secondary">—</Typography>}
          </Bloque>
        </Box>
      </Box>

      <Bloque titulo="Cuentas" nota="Supervisión: el estado es el real aunque la persona haya apagado «mostrar mi estado» (los demás la ven desconectada). Lo demás sale de las vistas registradas.">
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap', px: 1 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Cuenta</TableCell><TableCell>Estado</TableCell><TableCell>Última actividad</TableCell><TableCell>Último módulo</TableCell><TableCell>Aparato</TableCell><TableCell>Versión</TableCell><TableCell align="right">Vistas hoy</TableCell><TableCell align="right">Errores hoy</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cuentas.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>{c.nombre}{!c.muestra_presencia && <Tooltip title="Apagó «mostrar mi estado»: los demás la ven desconectada"><Box component="span" sx={{ ml: 0.75, fontSize: 11, color: 'text.secondary' }}>oculta</Box></Tooltip>}</TableCell>
                  <TableCell><Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}><Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ESTADO[c.estado].c }} />{ESTADO[c.estado].t}</Box></TableCell>
                  <TableCell>{cuando(c.ultima_actividad ?? c.ultimo_momento)}</TableCell>
                  <TableCell>{c.ultimo_modulo ? nombreModulo(c.ultimo_modulo) : '—'}</TableCell>
                  <TableCell>{APARATO[c.aparato] ?? c.aparato ?? '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{c.version || '—'}</TableCell>
                  <TableCell align="right">{c.vistas_hoy}</TableCell>
                  <TableCell align="right" sx={{ color: c.errores_hoy ? PALETA.aviso : undefined }}>{c.errores_hoy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Bloque>

      <Bloque titulo={`Errores recientes${r ? ` (${r.errores_total})` : ''}`} nota="Mensaje y pila recortados de JavaScript; sin ningún contenido del documento.">
        {r?.errores.length === 0 && <Typography variant="body2" color="text.secondary">Ninguno en el periodo.</Typography>}
        {r?.errores.map((e, i) => (
          <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, py: 0.75, borderTop: i ? '1px solid' : 'none', borderColor: 'divider' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">{cuando(e.momento)} · {e.usuario || '—'} · {nombreModulo(e.modulo)} {e.ruta} · {APARATO[e.aparato] ?? e.aparato} · {e.version}</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.detalle}</Typography>
            </Box>
            <Tooltip title="Copiar"><IconButton size="small" onClick={() => copiar(`${e.momento} · ${e.modulo} ${e.ruta} · ${e.version}\n${e.detalle}`)}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
        ))}
      </Bloque>
    </Box>
  )
}

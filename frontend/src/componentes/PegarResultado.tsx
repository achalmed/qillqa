/**
 * PEGAR EL RESULTADO DE UN PROMPT (2026-10-11): el componente único del mecanismo común
 * (`docs/plataforma/propuesta-automatizacion.md` §3.3). Una caja para pegar, el endpoint
 * de pegado del módulo (`ruta`), y la tabla de diferencias —valor actual, propuesto y
 * estado por campo— que la persona acepta fila por fila; «Aplicar» vuelca lo aceptado al
 * formulario del módulo (no guarda: el botón de guardar de siempre sigue mandando). Lo
 * `dudoso` (no casó con el vocabulario) exige elegir. En celular la tabla son tarjetas.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Collapse from '@mui/material/Collapse'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { api } from '../api'
import { PALETA } from '../paleta'
import {
  aceptadasPorOmision, aplicarDiferencias, mensajePegado, pegarEn, textoValor,
  type Diferencia, type Formato, type PegadoAplicado, type RespuestaPegado,
} from '../pegar'

const COLOR_ESTADO: Record<Diferencia['estado'], string> = {
  nuevo: PALETA.exito, distinto: PALETA.error, dudoso: PALETA.dorado, igual: PALETA.textoTenue,
}
const ROTULO_ESTADO: Record<Diferencia['estado'], string> = { nuevo: 'nuevo', distinto: 'cambia', dudoso: 'elija', igual: 'igual' }

let formatosCache: Formato[] | null = null
async function formatosDe(tipos: string[]): Promise<Formato[]> {
  if (!formatosCache) {
    try {
      formatosCache = (await api<{ formatos: Formato[] }>('/api/pegar/formatos')).formatos
    } catch {
      return []
    }
  }
  return formatosCache.filter((f) => tipos.includes(f.tipo))
}

export default function PegarResultado<P = Record<string, unknown>>({
  ruta,
  tipos,
  actual,
  cuerpoExtra,
  alAplicar,
  propuestas,
  abiertoAlInicio = false,
  compacto = false,
  etiquetaBoton = 'Pegar el resultado del prompt',
  textoInicial,
}: {
  /** Endpoint de pegado del módulo (`/api/entradas/pegar`). */
  ruta: string
  /** Formatos que este formulario acepta (para el enlace al prompt). */
  tipos: string[]
  /** La ficha como está en pantalla: con ella se arma la tabla de diferencias. */
  actual: Record<string, unknown>
  cuerpoExtra?: Record<string, unknown>
  /** Recibe los campos con lo aceptado, la constancia y la respuesta entera (para las propuestas del módulo). */
  alAplicar: (campos: Record<string, unknown>, aplicado: PegadoAplicado, respuesta: RespuestaPegado<P>) => void
  /** Lo que el módulo pinta debajo de la tabla (crear el evento, vincular…), con la respuesta leída. */
  propuestas?: (respuesta: RespuestaPegado<P>) => ReactNode
  abiertoAlInicio?: boolean
  /** Solo el icono (en la cabecera de una fila de subida). */
  compacto?: boolean
  etiquetaBoton?: string
  /** Un texto que llega ya pegado (del chat, `?pegar=<id>`): abre la caja y lo lee de inmediato. */
  textoInicial?: string
}) {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [abierto, setAbierto] = useState(abiertoAlInicio)
  const [texto, setTexto] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const [r, setR] = useState<RespuestaPegado<P> | null>(null)
  const [aceptadas, setAceptadas] = useState<Set<string>>(new Set())
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [formatos, setFormatos] = useState<Formato[]>([])

  useEffect(() => {
    if (abierto) void formatosDe(tipos).then(setFormatos)
  }, [abierto, tipos])
  // Lo que llega ya pegado se lee solo: la persona ve de entrada la tabla de diferencias.
  const leidoInicial = useRef('')
  useEffect(() => {
    if (!textoInicial || leidoInicial.current === textoInicial) return
    leidoInicial.current = textoInicial
    setAbierto(true)
    setTexto(textoInicial)
    void leer(textoInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoInicial])

  const leer = async (t: string = texto) => {
    setLeyendo(true)
    setError('')
    try {
      const resp = await pegarEn<P>(ruta, { texto: t, actual, ...(cuerpoExtra ?? {}) })
      setR(resp)
      setAceptadas(aceptadasPorOmision(resp.diferencias))
      setElegidos({})
    } catch (e) {
      setR(null)
      setError(mensajePegado(e))
    } finally {
      setLeyendo(false)
    }
  }

  const alternar = (clave: string) =>
    setAceptadas((s) => {
      const n = new Set(s)
      if (n.has(clave)) n.delete(clave)
      else n.add(clave)
      return n
    })

  const aplicar = () => {
    if (!r) return
    // Una duda resuelta reemplaza el valor propuesto por el elegido.
    const difs = r.diferencias.map((d) => (elegidos[d.clave] ? { ...d, propuesto: elegidos[d.clave] } : d))
    const campos = aplicarDiferencias(difs, actual, aceptadas)
    const rechazadas = r.diferencias.filter((d) => !aceptadas.has(d.clave)).map((d) => d.clave)
    alAplicar(campos, {
      tipo: r.lectura.tipo, version: r.lectura.version, fuente: r.lectura.fuente, texto,
      campos_propuestos: r.campos, aceptadas, rechazadas,
    }, r)
    setAbierto(false)
    setTexto('')
    setR(null)
  }

  const dudaDe = (d: Diferencia) => {
    const porClave = r?.lectura.dudas ?? {}
    return porClave[d.clave] ?? Object.entries(porClave).find(([k]) => k.split('.')[0] === d.clave)?.[1] ?? null
  }

  const boton = compacto ? (
    <Tooltip title={etiquetaBoton}>
      <IconButton size="small" onClick={() => setAbierto((v) => !v)} aria-label={etiquetaBoton}>
        <ContentPasteOutlinedIcon fontSize="small" color={abierto ? 'primary' : undefined} />
      </IconButton>
    </Tooltip>
  ) : (
    <Button size="small" variant={abierto ? 'contained' : 'outlined'} startIcon={<ContentPasteOutlinedIcon />} onClick={() => setAbierto((v) => !v)}>
      {etiquetaBoton}
    </Button>
  )

  const fila = (d: Diferencia) => {
    const duda = d.estado === 'dudoso' ? dudaDe(d) : null
    const marcada = aceptadas.has(d.clave)
    const propuesto = duda ? (
      <TextField select size="small" fullWidth value={elegidos[d.clave] ?? ''} onChange={(e) => { setElegidos((x) => ({ ...x, [d.clave]: e.target.value })); if (e.target.value) setAceptadas((s) => new Set(s).add(d.clave)) }}
        label={`Decía «${duda.valor}»`}>
        {duda.opciones.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
      </TextField>
    ) : (
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{textoValor(d.propuesto)}</Typography>
    )
    const estado = <Chip size="small" label={ROTULO_ESTADO[d.estado]} sx={{ height: 20, fontSize: 11, fontWeight: 600, color: COLOR_ESTADO[d.estado], bgcolor: `${COLOR_ESTADO[d.estado]}1A` }} />
    if (celular)
      return (
        <Box key={d.clave} sx={{ display: 'flex', gap: 0.5, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, opacity: marcada ? 1 : 0.6 }}>
          <Checkbox size="small" checked={marcada} onChange={() => alternar(d.clave)} sx={{ p: 0.25, alignSelf: 'flex-start' }} inputProps={{ 'aria-label': `Aceptar ${d.etiqueta}` }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>{d.etiqueta}</Typography>{estado}
            </Box>
            {d.actual != null && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textDecoration: 'line-through' }}>{textoValor(d.actual)}</Typography>}
            {propuesto}
          </Box>
        </Box>
      )
    return (
      <Box key={d.clave} component="tr" sx={{ opacity: marcada ? 1 : 0.6, '& td': { p: 0.75, borderBottom: '1px solid', borderColor: 'divider', verticalAlign: 'top' } }}>
        <td><Checkbox size="small" checked={marcada} onChange={() => alternar(d.clave)} sx={{ p: 0.25 }} inputProps={{ 'aria-label': `Aceptar ${d.etiqueta}` }} /></td>
        <td><Typography variant="body2" sx={{ fontWeight: 600 }}>{d.etiqueta}</Typography></td>
        <td><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{textoValor(d.actual)}</Typography></td>
        <td>{propuesto}</td>
        <td>{estado}</td>
      </Box>
    )
  }

  return (
    <Box>
      {boton}
      <Collapse in={abierto} unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1, p: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: PALETA.superficieTenue }}>
          {!r && (
            <>
              <TextField size="small" multiline minRows={4} maxRows={14} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)}
                label="Pegue aquí el resultado del prompt" placeholder="El bloque que empieza por «tipo: …» (o el mensaje del grupo)" />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="contained" disabled={!texto.trim() || leyendo} onClick={() => void leer()}>Leer</Button>
                <Button size="small" color="inherit" onClick={() => { setAbierto(false); setError('') }}>Cancelar</Button>
                {formatos.map((f) => (
                  <Typography key={f.tipo} variant="caption" color="text.secondary">
                    Prompt: <Link href={`obsidian://open?file=${encodeURIComponent(f.prompt.replace(/\.md$/, ''))}`} underline="hover">{f.prompt.split('/').pop()?.replace(/\.md$/, '')}</Link>
                  </Typography>
                ))}
              </Box>
              {leyendo && <LinearProgress />}
              {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
            </>
          )}
          {r && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2">{r.lectura.titulo || 'Lo leído'}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.lectura.fuente === 'rotulos' ? 'mensaje con rótulos' : `formato ${r.lectura.tipo} v${r.lectura.version ?? '?'}`} · marque lo que se aplica
                </Typography>
              </Box>
              {r.lectura.avisos.map((a) => <Alert key={a} severity="info" sx={{ py: 0 }}>{a}</Alert>)}
              {r.diferencias.length === 0 && <Alert severity="success" sx={{ py: 0 }}>La ficha ya dice lo mismo: nada que aplicar.</Alert>}
              {celular ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>{r.diferencias.map(fila)}</Box>
              ) : (
                <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', '& th': { textAlign: 'left', p: 0.75, fontSize: 12, color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid', borderColor: 'divider' } }}>
                  <thead><tr><th /><th>Campo</th><th>Ahora</th><th>Propuesto</th><th /></tr></thead>
                  <tbody>{r.diferencias.map(fila)}</tbody>
                </Box>
              )}
              {Object.keys(r.informativos).length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                  {Object.entries(r.informativos).filter(([k]) => k !== 'agenda' && k !== 'respuestas' && k !== 'actuaciones').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${textoValor(v)}`).join('\n')}
                </Typography>
              )}
              {propuestas?.(r)}
              {r.resto && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Mensaje para el grupo: {r.resto.split('\n').find((l) => l.trim())}
                  </Typography>
                  <Tooltip title="Copiar el mensaje">
                    <IconButton size="small" aria-label="Copiar el mensaje" onClick={() => void navigator.clipboard?.writeText(r.resto)}><ContentCopyIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" color="inherit" onClick={() => setR(null)}>Volver a pegar</Button>
                <Button size="small" variant="contained" onClick={aplicar} disabled={r.diferencias.some((d) => d.estado === 'dudoso' && aceptadas.has(d.clave) && !elegidos[d.clave])}>
                  Aplicar {aceptadas.size ? `(${aceptadas.size})` : ''}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

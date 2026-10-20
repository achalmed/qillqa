// Módulo Contraseñas (2026-10-08, Edison: «gestionar los usuarios y contraseñas de todas las mesas
// de partes a las que entra el diputado… similar a Google Contraseñas o KeePassXC»). Lista a la
// izquierda (buscador, categorías, favoritas) y la ficha a la derecha: usuario y clave para ver o
// copiar, abrir el sitio, notas, institución, quién la usó. El administrador agrega, edita,
// borra e importa el CSV de Google o KeePassXC. Las claves van cifradas en el servidor
// (api/contrasenas.py) y cada vez que alguien ve o copia una queda registrado. La extensión del
// Qillqa (extension/) autocompleta el ingreso en el sitio.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  Alert, Autocomplete, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, InputAdornment, InputBase, LinearProgress, Slider, Switch, TextField, Tooltip, Typography,
} from '@mui/material'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined'
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined'
import Marco from '../componentes/Marco'
import { api, subirArchivo } from '../api'
import { esAdmin } from '../navegacion'
import { confirmar } from '../componentes/Dialogos'
import { copiarEn } from '../componentes/VentanaApoyo'
import { extensionInstalada } from '../mesaExtension'
import { PALETA } from '../paleta'

export interface Ingreso { id: string; tipo: string; usuario: string; tiene_clave: boolean }
export interface Cuenta {
  id: number
  nombre: string
  url: string
  host: string
  usuario: string
  tiene_clave: boolean
  /** Formas de ingreso del mismo sitio (DNI, correo, usuario…), cada una con su clave. */
  ingresos: Ingreso[]
  notas: string
  categoria: string
  favorita: boolean
  institucion_id: number | null
  institucion: string
  actualizado_en: string | null
  actualizado_por: string
  ultimo_uso: string | null
}
interface IngresoEdicion { id?: string; tipo: string; usuario: string; clave: string }
interface Edicion {
  id?: number
  nombre: string
  url: string
  ingresos: IngresoEdicion[]
  notas: string
  categoria: string
  favorita: boolean
  institucion_id: number | null
  institucion: string
}
interface Institucion { id: number; nombre: string; siglas?: string }

const TIPOS = ['DNI', 'Correo', 'Usuario', 'RUC', 'Código', 'Otro']
const nuevoIngreso = (): IngresoEdicion => ({ tipo: 'DNI', usuario: '', clave: '' })
const VACIA: Edicion = { nombre: '', url: '', ingresos: [nuevoIngreso()], notas: '', categoria: '', favorita: false, institucion_id: null, institucion: '' }
/** Para editar: las formas de ingreso sin claves (vacía = se conserva la guardada). */
const aEdicion = (c: Cuenta): Edicion => ({ ...c, ingresos: c.ingresos.map((i) => ({ id: i.id, tipo: i.tipo, usuario: i.usuario, clave: '' })) })
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** El servicio (primera línea de las notas: «Mesa de partes en línea», «Intranet»…). */
const servicio = (c: { notas: string }) => c.notas.split('\n')[0].trim()
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

/** Clave nueva al azar (crypto), sin caracteres que se confunden (0/O, l/1). */
export function generarClave(largo = 16, simbolos = true): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const juego = simbolos ? `${letras}!@#$%&*?-_=+` : letras
  const azar = new Uint32Array(largo)
  crypto.getRandomValues(azar)
  return Array.from(azar, (n) => juego[n % juego.length]).join('')
}

/** Seguridad aproximada: 0 débil · 1 regular · 2 buena · 3 fuerte. */
export function fuerza(clave: string): number {
  if (!clave) return 0
  let tipos = 0
  for (const re of [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]) if (re.test(clave)) tipos++
  const bits = clave.length * Math.log2([0, 26, 52, 62, 94][tipos] || 26)
  return bits >= 80 ? 3 : bits >= 60 ? 2 : bits >= 40 ? 1 : 0
}
const FUERZA = [
  { texto: 'Débil', color: PALETA.error },
  { texto: 'Regular', color: PALETA.aviso },
  { texto: 'Buena', color: PALETA.info },
  { texto: 'Fuerte', color: PALETA.exito },
]

function Inicial({ c, tam = 36 }: { c: { nombre: string; host?: string }; tam?: number }) {
  const letra = (c.nombre || c.host || '?').trim().charAt(0).toUpperCase()
  // Un tono estable por cuenta, dentro de la paleta, como pastilla tenue: fondo al 15 % y la letra del tono (2026-10-19).
  const tonos = [PALETA.guinda, PALETA.dorado, PALETA.aprobado, PALETA.firmado, PALETA.enviado]
  const tono = tonos[[...(c.host || c.nombre)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % tonos.length]
  return <Avatar sx={{ width: tam, height: tam, bgcolor: `${tono}26`, color: tono, fontSize: tam * 0.45, fontWeight: 700 }}>{letra}</Avatar>
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <Box sx={{ py: 1.25, borderBottom: `1px solid ${PALETA.borde}` }}>
      <Typography sx={{ fontSize: 12, color: PALETA.textoTenue, mb: 0.25 }}>{etiqueta}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>{children}</Box>
    </Box>
  )
}

export default function Contrasenas() {
  const admin = esAdmin()
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('md'))
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const [lista, setLista] = useState<Cuenta[] | null>(null)
  const [filtro, setFiltro] = useState('')
  const [categoria, setCategoria] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [visible, setVisible] = useState<Record<string, string>>({})
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [importar, setImportar] = useState(false)
  const [accesos, setAccesos] = useState<{ en: string; accion: string; quien: string }[] | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)

  const decir = useCallback((texto: string, error = false) => {
    setAviso({ texto, error })
    if (!error) setTimeout(() => setAviso(null), 2500)
  }, [])
  // Lo que la extensión vio al ingresar en una mesa (cuenta nueva o clave distinta): pendiente
  // de aprobar aquí (2026-10-10).
  const [observadas, setObservadas] = useState<{ id: string; host: string; usuario: string; visto_por: string; en: string }[]>([])
  const cargar = useCallback(() => {
    api<Cuenta[]>('/api/contrasenas').then(setLista).catch((e) => decir(e.message, true))
    api<typeof observadas>('/api/contrasenas/observadas').then(setObservadas).catch(() => setObservadas([]))
  }, [decir])
  const resolverObservada = async (id: string, accion: 'aceptar' | 'descartar') => {
    try {
      await api(`/api/contrasenas/observadas/${id}/${accion}`, { method: 'POST' })
      decir(accion === 'aceptar' ? 'Clave guardada.' : 'Descartada.')
      cargar()
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo.', true)
    }
  }
  useEffect(cargar, [cargar])
  // Accesos directos del menú: ?nueva=1 y ?importar=1.
  useEffect(() => {
    if (params.get('nueva') && admin) setEdicion({ ...VACIA })
    if (params.get('importar') && admin) setImportar(true)
    if (params.get('nueva') || params.get('importar')) setParams({}, { replace: true })
  }, [params, setParams, admin])

  const categorias = useMemo(() => [...new Set((lista ?? []).map((c) => c.categoria).filter(Boolean))].sort(), [lista])
  const filtradas = useMemo(() => {
    const f = norm(filtro.trim())
    return (lista ?? []).filter((c) =>
      (categoria === '' || (categoria === '★' ? c.favorita : c.categoria === categoria)) &&
      (!f || norm(`${c.nombre} ${c.host} ${c.usuario} ${c.institucion} ${c.categoria}`).includes(f)))
  }, [lista, filtro, categoria])
  const actual = (lista ?? []).find((c) => c.id === sel) ?? (celular ? undefined : filtradas[0])

  // La clave visible se oculta sola a los 30 s.
  const revelar = async (c: Cuenta, i: Ingreso, accion: 'ver' | 'copiar') => {
    const r = await api<{ clave: string }>(`/api/contrasenas/${c.id}/revelar?accion=${accion}&ingreso=${encodeURIComponent(i.id)}`, { method: 'POST' })
    return r.clave
  }
  const ocultar = (k: string) => setVisible(({ [k]: _, ...resto }) => resto)
  const verClave = async (c: Cuenta, i: Ingreso) => {
    const k = `${c.id}:${i.id}`
    if (visible[k] !== undefined) return ocultar(k)
    try {
      const clave = await revelar(c, i, 'ver')
      setVisible((v) => ({ ...v, [k]: clave }))
      setTimeout(() => ocultar(k), 30000)
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo mostrar.', true)
    }
  }
  const copiar = async (texto: string, que: string) => {
    await copiarEn(window, texto)
    decir(`${que} copiado.`)
  }
  const copiarClave = async (c: Cuenta, i: Ingreso) => {
    try {
      await copiar(visible[`${c.id}:${i.id}`] ?? (await revelar(c, i, 'copiar')), 'Contraseña')
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo copiar.', true)
    }
  }
  const favorita = async (c: Cuenta) => {
    await api(`/api/contrasenas/${c.id}/favorita`, { method: 'PATCH' }).then(cargar).catch((e) => decir(e.message, true))
  }
  const borrar = async (c: Cuenta) => {
    if (!(await confirmar(`¿Eliminar la cuenta «${c.nombre}»? No se puede deshacer.`, { aceptar: 'Eliminar', peligro: true }))) return
    await api(`/api/contrasenas/${c.id}`, { method: 'DELETE' }).catch((e) => decir(e.message, true))
    setSel(null)
    cargar()
  }
  const verAccesos = async (c: Cuenta) => {
    setAccesos(await api<{ en: string; accion: string; quien: string }[]>(`/api/contrasenas/${c.id}/accesos`).catch(() => []))
  }
  useEffect(() => setAccesos(null), [actual?.id])

  // --- La lista ---
  const panelLista = (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', bgcolor: PALETA.superficie, borderRight: celular ? 0 : `1px solid ${PALETA.borde}` }}>
      <Box sx={{ p: 1.5, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.5, borderRadius: 5, bgcolor: PALETA.superficieMedia }}>
          <SearchIcon sx={{ fontSize: 20, color: PALETA.textoTenue }} />
          <InputBase autoFocus={!celular} placeholder="Buscar sitio, usuario o institución" value={filtro} onChange={(e) => setFiltro(e.target.value)} sx={{ flex: 1, fontSize: 14 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
          {[['', 'Todas'], ['★', 'Favoritas'], ...categorias.map((c) => [c, c])].map(([v, t]) => (
            <Chip key={v || 'todas'} size="small" label={t} onClick={() => setCategoria(v)} color={categoria === v ? 'primary' : 'default'} variant={categoria === v ? 'filled' : 'outlined'} />
          ))}
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 0.75, pb: 2 }}>
        {!lista && <LinearProgress sx={{ mx: 1 }} />}
        {lista && !filtradas.length && (
          <Typography sx={{ p: 2, color: PALETA.textoTenue, fontSize: 14 }}>
            {lista.length ? 'Ninguna cuenta coincide.' : admin ? 'Aún no hay cuentas. Agréguelas o importe el CSV de Google o KeePassXC.' : 'Aún no hay cuentas guardadas.'}
          </Typography>
        )}
        {filtradas.map((c) => {
          const elegida = actual?.id === c.id
          return (
            <Box
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setSel(c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSel(c.id) }}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1, borderRadius: 2, cursor: 'pointer', bgcolor: elegida ? PALETA.guindaSuave : 'transparent', '&:hover': { bgcolor: elegida ? PALETA.guindaSuave : PALETA.superficieTenue } }}
            >
              <Inicial c={c} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* El nombre entero, en dos líneas (no «Ministerio de Ener…»); debajo, el servicio. */}
                <Typography sx={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.nombre}</Typography>
                <Typography noWrap sx={{ fontSize: 12.5, color: PALETA.textoTenue }}>
                  {[servicio(c), c.ingresos.length > 1 ? `${c.ingresos.length} formas de ingreso` : c.usuario].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {c.favorita && <StarIcon sx={{ fontSize: 18, color: PALETA.dorado }} />}
            </Box>
          )
        })}
      </Box>
    </Box>
  )

  // --- La ficha ---
  const c = actual
  const ficha = c ? (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 720, width: '100%' }}>
      {celular && <Button startIcon={<ArrowBackIcon />} onClick={() => setSel(null)} sx={{ mb: 1, ml: -1 }}>Cuentas</Button>}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Inicial c={c} tam={56} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{c.nombre}</Typography>
          <Typography sx={{ color: PALETA.textoTenue, fontSize: 14 }}>{[servicio(c), c.host].filter(Boolean).join(' · ')}</Typography>
        </Box>
        <Tooltip title={c.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}>
          <IconButton onClick={() => void favorita(c)}>{c.favorita ? <StarIcon sx={{ color: PALETA.dorado }} /> : <StarBorderIcon />}</IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ border: `1px solid ${PALETA.borde}`, borderRadius: 3, px: 2, bgcolor: PALETA.superficie }}>
        <Campo etiqueta="Sitio">
          <Typography sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 14.5 }}>{c.url || '—'}</Typography>
          {c.url && <Button size="small" endIcon={<OpenInNewIcon />} href={c.url} target="_blank" rel="noopener noreferrer">Abrir</Button>}
        </Campo>
        {c.ingresos.map((i, n) => {
          const k = `${c.id}:${i.id}`
          return (
            <Box key={i.id} sx={{ py: 1.25, borderBottom: `1px solid ${PALETA.borde}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: 12, color: PALETA.textoTenue }}>{c.ingresos.length > 1 ? `Forma de ingreso ${n + 1}` : 'Ingreso'}</Typography>
                <Chip size="small" label={i.tipo} sx={{ height: 20, fontSize: 11.5, bgcolor: PALETA.guindaSuave, color: PALETA.guinda, fontWeight: 600 }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
                <Typography sx={{ width: 92, flexShrink: 0, fontSize: 13, color: PALETA.textoTenue }}>{i.tipo === 'Correo' ? 'Correo' : i.tipo === 'DNI' ? 'N.º de DNI' : 'Usuario'}</Typography>
                <Typography sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 15, fontWeight: 500 }}>{i.usuario || '—'}</Typography>
                {i.usuario && <Tooltip title="Copiar"><IconButton onClick={() => void copiar(i.usuario, i.tipo)}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
                <Typography sx={{ width: 92, flexShrink: 0, fontSize: 13, color: PALETA.textoTenue }}>Contraseña</Typography>
                <Typography sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontFamily: visible[k] ? 'ui-monospace, monospace' : 'inherit', fontSize: 15, letterSpacing: visible[k] ? 0.5 : 2, color: i.tiene_clave ? 'inherit' : PALETA.textoTenue }}>
                  {!i.tiene_clave ? (admin ? 'sin contraseña: pulse Editar' : 'sin contraseña') : visible[k] ?? '••••••••••'}
                </Typography>
                {i.tiene_clave && (
                  <>
                    <Tooltip title={visible[k] !== undefined ? 'Ocultar' : 'Mostrar (30 s)'}>
                      <IconButton onClick={() => void verClave(c, i)}>{visible[k] !== undefined ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}</IconButton>
                    </Tooltip>
                    <Tooltip title="Copiar contraseña"><IconButton onClick={() => void copiarClave(c, i)}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                  </>
                )}
              </Box>
            </Box>
          )
        })}
        {c.notas && (
          <Campo etiqueta="Notas">
            <Typography sx={{ whiteSpace: 'pre-line', fontSize: 14 }}>{c.notas}</Typography>
          </Campo>
        )}
        <Box sx={{ py: 1.25, color: PALETA.textoTenue, fontSize: 12.5 }}>
          Modificada {fecha(c.actualizado_en)}{c.actualizado_por ? ` por ${c.actualizado_por}` : ''} · Último uso: {fecha(c.ultimo_uso)}
        </Box>
      </Box>
      {!extensionInstalada() && c.url && (
        <Alert severity="info" icon={<ExtensionOutlinedIcon />} sx={{ mt: 2 }}>
          Con la extensión de Qillqa, al abrir este sitio se ofrece autocompletar el usuario y la contraseña.{' '}
          <Button size="small" onClick={() => navegar('/mesas-de-partes')}>Instalarla</Button>
        </Alert>
      )}
      {admin && (
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEdicion(aEdicion(c))}>Editar</Button>
          <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => void borrar(c)}>Eliminar</Button>
          <Button onClick={() => void verAccesos(c)}>Quién la usó</Button>
        </Box>
      )}
      {accesos && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>Quién la vio, copió o autocompletó</Typography>
          {accesos.length ? accesos.map((a) => (
            <Typography key={`${a.en}-${a.quien}`} sx={{ fontSize: 13.5 }}>{fecha(a.en)} · {a.quien} · {a.accion}</Typography>
          )) : <Typography sx={{ fontSize: 13.5, color: PALETA.textoTenue }}>Nadie todavía.</Typography>}
        </Box>
      )}
    </Box>
  ) : (
    <Box sx={{ m: 'auto', textAlign: 'center', color: PALETA.textoTenue, p: 4 }}>
      <KeyOutlinedIcon sx={{ fontSize: 48, opacity: 0.4 }} />
      <Typography>Elija una cuenta.</Typography>
    </Box>
  )

  const acciones = admin ? (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button color="inherit" startIcon={<UploadFileOutlinedIcon />} onClick={() => setImportar(true)}>{celular ? '' : 'Importar'}</Button>
      <Button color="inherit" startIcon={<AddIcon />} onClick={() => setEdicion({ ...VACIA })}>{celular ? '' : 'Agregar'}</Button>
    </Box>
  ) : undefined

  return (
    <Marco modulo="contrasenas" titulo="Contraseñas" acciones={acciones}>
      {aviso && (
        <Alert severity={aviso.error ? 'error' : 'success'} onClose={() => setAviso(null)} sx={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 1400, boxShadow: PALETA.sombraFlotante }}>
          {aviso.texto}
        </Alert>
      )}
      {observadas.length > 0 && (
        <Alert severity="info" sx={{ m: 1.5, mb: 0 }}>
          La extensión vio {observadas.length === 1 ? 'un ingreso' : `${observadas.length} ingresos`} con una clave nueva o distinta:
          {observadas.map((o) => (
            <Box key={o.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
              <Typography variant="body2"><b>{o.host}</b> · {o.usuario || 'sin usuario'} · {o.visto_por}, {new Date(o.en).toLocaleString('es-PE')}</Typography>
              {admin && <Button size="small" variant="contained" onClick={() => void resolverObservada(o.id, 'aceptar')}>Guardar la clave</Button>}
              {admin && <Button size="small" onClick={() => void resolverObservada(o.id, 'descartar')}>Descartar</Button>}
            </Box>
          ))}
        </Alert>
      )}
      <Box sx={{ flex: '1 1 0', minHeight: 0, display: 'flex', bgcolor: PALETA.fondo, height: { xs: 'auto', md: '100%' } }}>
        {(!celular || !c) && <Box sx={{ width: { xs: '100%', md: 380 }, flexShrink: 0, minHeight: 0 }}>{panelLista}</Box>}
        {(!celular || c) && <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex' }}>{ficha}</Box>}
      </Box>
      {edicion && <DialogoCuenta inicial={edicion} categorias={categorias} alCerrar={() => setEdicion(null)} alGuardar={(id) => { setEdicion(null); cargar(); if (id) setSel(id); decir('Cuenta guardada.') }} />}
      <DialogoImportar abierto={importar} alCerrar={() => setImportar(false)} alTerminar={(t) => { setImportar(false); cargar(); decir(t) }} />
    </Marco>
  )
}

function FilaIngreso({ ing, n, total, largo, simbolos, alCambiar, alQuitar }: {
  ing: IngresoEdicion
  n: number
  total: number
  largo: number
  simbolos: boolean
  alCambiar: (i: IngresoEdicion) => void
  alQuitar: () => void
}) {
  const [ver, setVer] = useState(!ing.id)
  const f = fuerza(ing.clave)
  return (
    <Box sx={{ p: 1.5, border: `1px solid ${PALETA.borde}`, borderRadius: 2, bgcolor: PALETA.superficieTenue, display: 'grid', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Forma de ingreso {n + 1}</Typography>
        {total > 1 && (
          <Tooltip title="Quitar esta forma de ingreso"><IconButton size="small" onClick={alQuitar}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
        )}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '130px 1fr' }, gap: 1.25 }}>
        <TextField select size="small" label="Se entra con" value={ing.tipo} onChange={(e) => alCambiar({ ...ing, tipo: e.target.value })} SelectProps={{ native: true }}>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </TextField>
        <TextField
          size="small"
          label={ing.tipo === 'Correo' ? 'Correo' : ing.tipo === 'DNI' ? 'Número de DNI' : ing.tipo === 'RUC' ? 'Número de RUC' : 'Usuario'}
          autoComplete="off"
          value={ing.usuario}
          onChange={(e) => alCambiar({ ...ing, usuario: e.target.value })}
        />
      </Box>
      <TextField
        size="small"
        label="Contraseña"
        type={ver ? 'text' : 'password'}
        autoComplete="new-password"
        value={ing.clave}
        helperText={ing.id && !ing.clave ? 'Vacía: se conserva la contraseña guardada.' : undefined}
        onChange={(e) => alCambiar({ ...ing, clave: e.target.value })}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={ver ? 'Ocultar' : 'Mostrar'}>
                <IconButton size="small" onClick={() => setVer((v) => !v)}>{ver ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}</IconButton>
              </Tooltip>
              <Tooltip title="Generar una contraseña segura">
                <IconButton size="small" aria-label="Generar una contraseña segura" onClick={() => { alCambiar({ ...ing, clave: generarClave(largo, simbolos) }); setVer(true) }}><CasinoOutlinedIcon fontSize="small" /></IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />
      {ing.clave && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinearProgress variant="determinate" value={(f + 1) * 25} sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: PALETA.borde, '& .MuiLinearProgress-bar': { bgcolor: FUERZA[f].color } }} />
          <Typography sx={{ fontSize: 12, color: FUERZA[f].color, minWidth: 52 }}>{FUERZA[f].texto}</Typography>
        </Box>
      )}
    </Box>
  )
}

function DialogoCuenta({ inicial, categorias, alCerrar, alGuardar }: { inicial: Edicion; categorias: string[]; alCerrar: () => void; alGuardar: (id?: number) => void }) {
  const [e, setE] = useState<Edicion>(inicial)
  const [largo, setLargo] = useState(16)
  const [simbolos, setSimbolos] = useState(true)
  const [opciones, setOpciones] = useState<Institucion[]>([])
  const [error, setError] = useState('')
  const buscar = (q: string) => {
    if (q.trim().length < 2) return
    api<Institucion[]>(`/api/directorio/instituciones?q=${encodeURIComponent(q)}&limite=20`).then(setOpciones).catch(() => setOpciones([]))
  }
  const cambiarIngreso = (n: number, i: IngresoEdicion) => setE((x) => ({ ...x, ingresos: x.ingresos.map((y, k) => (k === n ? i : y)) }))
  const guardar = async () => {
    setError('')
    const { id, institucion: _i, ...cuerpo } = e
    const ingresos = cuerpo.ingresos
      .filter((i) => i.usuario.trim() || i.clave || i.id)
      .map((i) => ({ id: i.id ?? null, tipo: i.tipo, usuario: i.usuario, clave: i.clave || null }))
    try {
      const r = await api<Cuenta>(id ? `/api/contrasenas/${id}` : '/api/contrasenas', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({ ...cuerpo, ingresos }),
      })
      alGuardar(r.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
  }
  return (
    <Dialog open onClose={alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle>{e.id ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.75, pt: '8px !important' }}>
        <TextField size="small" label="Sitio (dirección de ingreso)" placeholder="https://…" value={e.url} onChange={(ev) => setE({ ...e, url: ev.target.value })} />
        <TextField size="small" label="Nombre" placeholder="Ministerio de Educación (MINEDU) · Mesa de partes en línea" value={e.nombre} onChange={(ev) => setE({ ...e, nombre: ev.target.value })} />
        <Typography sx={{ fontSize: 13, color: PALETA.textoTenue, mt: 0.5 }}>
          Formas de ingreso: si el sitio deja entrar con DNI y también con correo, agréguelas aquí, cada una con su contraseña.
        </Typography>
        {e.ingresos.map((i, n) => (
          <FilaIngreso
            key={i.id ?? `nuevo-${n}`}
            ing={i}
            n={n}
            total={e.ingresos.length}
            largo={largo}
            simbolos={simbolos}
            alCambiar={(x) => cambiarIngreso(n, x)}
            alQuitar={() => setE((x) => ({ ...x, ingresos: x.ingresos.filter((_, k) => k !== n) }))}
          />
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setE((x) => ({ ...x, ingresos: [...x.ingresos, { ...nuevoIngreso(), tipo: x.ingresos.some((y) => y.tipo === 'DNI') ? 'Correo' : 'DNI' }] }))}>
            Otra forma de ingreso
          </Button>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 12.5, color: PALETA.textoTenue, whiteSpace: 'nowrap' }}>Generar: {largo} caracteres</Typography>
          <Slider size="small" min={10} max={32} value={largo} onChange={(_, v) => setLargo(v as number)} sx={{ width: 110 }} />
          <FormControlLabel control={<Switch size="small" checked={simbolos} onChange={(ev) => setSimbolos(ev.target.checked)} />} label={<Typography sx={{ fontSize: 12.5 }}>Símbolos</Typography>} />
        </Box>
        <Autocomplete
          freeSolo
          options={categorias}
          value={e.categoria}
          onInputChange={(_, v) => setE((x) => ({ ...x, categoria: v }))}
          renderInput={(p) => <TextField {...p} size="small" label="Categoría" placeholder="Mesas de partes, Congreso…" />}
        />
        <Autocomplete
          options={opciones}
          getOptionLabel={(o) => (o.siglas ? `${o.siglas} · ${o.nombre}` : o.nombre)}
          onInputChange={(_, q) => buscar(q)}
          onChange={(_, o) => setE({ ...e, institucion_id: o?.id ?? null, institucion: o?.nombre ?? '', nombre: e.nombre || (o ? `${o.nombre}${o.siglas ? ` (${o.siglas})` : ''}` : '') })}
          renderInput={(p) => <TextField {...p} size="small" label="Institución del directorio (opcional)" helperText={e.institucion ? `Vinculada: ${e.institucion}` : 'Así aparece al enviar un documento a esa institución'} />}
        />
        <TextField size="small" label="Notas" multiline minRows={2} value={e.notas} onChange={(ev) => setE({ ...e, notas: ev.target.value })} />
        <FormControlLabel control={<Switch checked={e.favorita} onChange={(ev) => setE({ ...e, favorita: ev.target.checked })} />} label="Favorita" />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cancelar</Button>
        <Button variant="contained" onClick={() => void guardar()} disabled={!e.nombre.trim() && !e.url.trim()}>Guardar</Button>
      </DialogActions>
    </Dialog>
  )
}

function DialogoImportar({ abierto, alCerrar, alTerminar }: { abierto: boolean; alCerrar: () => void; alTerminar: (texto: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [prueba, setPrueba] = useState<{ leidas: number; creadas: number; actualizadas: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!abierto) { setArchivo(null); setPrueba(null); setError('') }
  }, [abierto])
  const enviar = async (simular: boolean) => {
    if (!archivo) return
    setError('')
    const fd = new FormData()
    fd.append('archivo', archivo)
    try {
      const r = await subirArchivo<{ leidas: number; creadas: number; actualizadas: number }>(`/api/contrasenas/importar?simular=${simular}`, fd)
      if (simular) setPrueba(r)
      else alTerminar(`Importadas: ${r.creadas} nuevas y ${r.actualizadas} actualizadas. Borre el archivo CSV: tiene las contraseñas sin cifrar.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    }
  }
  return (
    <Dialog open={abierto} onClose={alCerrar} maxWidth="sm" fullWidth>
      <DialogTitle>Importar contraseñas</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Acepta el archivo CSV que exportan <b>Google Contraseñas</b> (passwords.google.com → Configuración → Exportar),
          <b> KeePassXC</b> (Base de datos → Exportar → Archivo CSV), Bitwarden o Firefox. Una cuenta con el mismo sitio
          y usuario se actualiza; las demás se agregan.
        </Typography>
        <Button component="label" variant="outlined" startIcon={<UploadFileOutlinedIcon />}>
          {archivo ? archivo.name : 'Elegir archivo CSV'}
          <input hidden type="file" accept=".csv,text/csv" onChange={(ev) => { setArchivo(ev.target.files?.[0] ?? null); setPrueba(null) }} />
        </Button>
        {prueba && (
          <Alert severity="info" sx={{ mt: 2 }}>
            El archivo tiene {prueba.leidas} cuenta(s): se agregarán {prueba.creadas} y se actualizarán {prueba.actualizadas}.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          El CSV trae las contraseñas sin cifrar: bórrelo (y vacíe la papelera) en cuanto termine.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={alCerrar}>Cancelar</Button>
        {!prueba
          ? <Button variant="contained" disabled={!archivo} onClick={() => void enviar(true)}>Revisar</Button>
          : <Button variant="contained" onClick={() => void enviar(false)}>Importar {prueba.creadas + prueba.actualizadas}</Button>}
      </DialogActions>
    </Dialog>
  )
}

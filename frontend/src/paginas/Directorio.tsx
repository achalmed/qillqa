/**
 * DIRECTORIO INSTITUCIONAL — la base de instituciones y personas que alimenta
 * al resto del sistema: destinatarios y copias de los documentos (con su
 * tratamiento, cargo y entidad), la mesa de partes del envío, las firmas de
 * respaldo de los proyectos de ley y el organigrama.
 *
 * Rediseño (Edison 2026-10-01: «no es solo una pantalla para consultar: es una
 * base estructural del sistema; debe estar bien organizada y ser fácil de
 * administrar, sin perder funciones ni afectar la información»):
 *   - arriba, el ESTADO DE LA BASE: entidades, dependencias, personas y cuántas
 *     fichas están por completar (con un toque se filtran);
 *   - instituciones: lista con filtros (entidades o todas las dependencias,
 *     tipo, por completar, inactivas) y, en escritorio, la FICHA al lado
 *     (componentes/DetalleInstitucion.tsx) con «lo que usa el sistema»;
 *   - personas: tarjetas con su contacto pulsable y lo que les falta;
 *   - formularios por secciones, con avisos de formato (RUC, correo, URL) y de
 *     POSIBLES DUPLICADOS antes de crear;
 *   - las reglas de completitud viven en `src/directorio.ts`.
 * Todo se carga una vez y se filtra aquí (búsqueda sin tildes, por palabras);
 * los datos se guardan por la misma API de siempre, con la ficha completa.
 *
 * CONTACTOS primero (2026-10-13, Edison: «como Google Contacts y mucho mejor
 * todavía»): `/directorio` abre la lista de personas al estilo de los Contactos
 * de Android (componentes/directorio/VistaContactos.tsx): favoritos, letras,
 * etiquetas, ficha con Llamar/WhatsApp/Correo/Mensaje, importar .vcf/.csv y
 * exportar .vcf. Las instituciones van en `?pestana=instituciones` (`?ver=ID`
 * abre una; `?q=` busca); `?pestana=personas` sigue llevando a los contactos.
 */
import { TablaDistritos } from '../componentes/Distritos'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import Typography from '@mui/material/Typography'
import { PALETA } from '../paleta'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Link from '@mui/material/Link'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import ButtonBase from '@mui/material/ButtonBase'
import Avatar from '@mui/material/Avatar'
import InputAdornment from '@mui/material/InputAdornment'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import LinearProgress from '@mui/material/LinearProgress'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddIcon from '@mui/icons-material/Add'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import MapOutlinedIcon from '@mui/icons-material/MapOutlined'
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import Autocomplete from '@mui/material/Autocomplete'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import DetalleInstitucion, { ETIQUETA_CATEGORIA, FichaInstitucion } from '../componentes/DetalleInstitucion'
import { DialogoOrganigrama } from '../componentes/Organigrama'
import Marco from '../componentes/Marco'
import BarraModulo from '../componentes/BarraModulo'
import { DialogoMesasFaltantes } from '../componentes/MesaDePartes'
import VistaContactos from '../componentes/directorio/VistaContactos'
import FormularioContacto from '../componentes/directorio/FormularioContacto'
import { etiquetasEnUso } from '../componentes/directorio/contactos'
import { api } from '../api'
import {
  INST_VACIA, NIVELES, ORDEN_TIPOS, PERS_VACIA, TIPO_INST,
  avisoCorreo, avisoRuc, avisoUrl, esEntidad, faltan, normal, parecidas,
  requisitosInstitucion, tipoUno, tipoVarios,
  type Institucion, type Persona,
} from '../directorio'
import { confirmar } from '../componentes/Dialogos'

// --------------------------- árbol de jerarquía ---------------------------
function NodoArbol({
  inst,
  porPadre,
  nivel,
  alAbrir,
  alOrganigrama,
  abiertos,
  alternar,
  visibles,
}: {
  inst: Institucion
  porPadre: Map<number, Institucion[]>
  nivel: number
  alAbrir: (id: number) => void
  alOrganigrama: (id: number) => void
  abiertos: Set<number>
  alternar: (id: number) => void
  // En búsqueda: solo se pintan los nodos que casan y sus ancestros.
  visibles: Set<number> | null
}) {
  const hijos = (porPadre.get(inst.id) ?? []).filter(
    (h) => !visibles || visibles.has(h.id),
  )
  const abierto = abiertos.has(inst.id)
  return (
    <>
      {/* Sangría más corta en el celular para que los niveles hondos quepan;
          el contenedor del árbol se desplaza a lo ancho si aun así no caben. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: { xs: nivel * 1.5, sm: nivel * 3 }, py: { xs: 0.5, sm: 0.25 } }}>
        {hijos.length > 0 ? (
          <IconButton size="small" onClick={() => alternar(inst.id)} sx={{ p: 0.25 }} aria-label={abierto ? 'Contraer' : 'Expandir'}>
            {abierto ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 28, textAlign: 'center', color: 'text.disabled' }}>·</Box>
        )}
        <Link
          component="button"
          underline="hover"
          color="inherit"
          onClick={() => alAbrir(inst.id)}
          sx={{ fontSize: 13.5, textAlign: 'left' }}
        >
          {inst.siglas ? <b>{inst.siglas} — </b> : null}
          {inst.nombre}
        </Link>
        {inst.categoria && (
          <Chip
            size="small"
            variant="outlined"
            color="secondary"
            label={ETIQUETA_CATEGORIA[inst.categoria] ?? inst.categoria}
            sx={{ height: 16, fontSize: 10.5 }}
          />
        )}
        {hijos.length > 0 && (
          <Chip size="small" label={hijos.length} sx={{ height: 16, fontSize: 10.5 }} />
        )}
        {hijos.length > 0 && (
          <Tooltip title="Ver organigrama gráfico">
            <IconButton size="small" onClick={() => alOrganigrama(inst.id)} sx={{ p: 0.25 }} aria-label="Ver organigrama">
              <AccountTreeIcon sx={{ fontSize: 15 }} color="primary" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {abierto &&
        hijos.map((h) => (
          <NodoArbol
            key={h.id}
            inst={h}
            porPadre={porPadre}
            nivel={nivel + 1}
            alAbrir={alAbrir}
            alOrganigrama={alOrganigrama}
            abiertos={abiertos}
            alternar={alternar}
            visibles={visibles}
          />
        ))}
    </>
  )
}

function Arbol({
  instituciones,
  q,
  alAbrir,
  alOrganigrama,
}: {
  instituciones: Institucion[]
  q: string
  alAbrir: (id: number) => void
  alOrganigrama: (id: number) => void
}) {
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())
  const ids = new Set(instituciones.map((i) => i.id))
  const porId = new Map<number, Institucion>(instituciones.map((i) => [i.id, i]))
  const porPadre = new Map<number, Institucion[]>()
  const raices: Institucion[] = []
  for (const i of instituciones) {
    if (i.parent_id !== null && ids.has(i.parent_id)) {
      const lista = porPadre.get(i.parent_id) ?? []
      lista.push(i)
      porPadre.set(i.parent_id, lista)
    } else {
      raices.push(i)
    }
  }
  // Hermanos en el ORDEN del organigrama oficial; alfabético como desempate.
  const cmp = (a: Institucion, b: Institucion) =>
    a.orden - b.orden || a.nombre.localeCompare(b.nombre)
  porPadre.forEach((lista) => lista.sort(cmp))

  // Búsqueda: nodos que casan + TODOS sus ancestros, con la ruta abierta.
  const t = q.trim().toLowerCase()
  let visibles: Set<number> | null = null
  let abiertosEfectivos = abiertos
  if (t) {
    visibles = new Set<number>()
    const abrir = new Set<number>()
    for (const i of instituciones) {
      if (
        i.nombre.toLowerCase().includes(t) ||
        (i.siglas || '').toLowerCase().includes(t)
      ) {
        let n: Institucion | undefined = i
        while (n && !visibles.has(n.id)) {
          visibles.add(n.id)
          const p: Institucion | undefined =
            n.parent_id !== null ? porId.get(n.parent_id) : undefined
          if (p) abrir.add(p.id)
          n = p
        }
      }
    }
    abiertosEfectivos = abrir
  }

  const alternar = (id: number) =>
    setAbiertos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  const expandirTodo = () =>
    setAbiertos(new Set(instituciones.filter((i) => porPadre.has(i.id)).map((i) => i.id)))
  const contraerTodo = () => setAbiertos(new Set())

  const grupos = ORDEN_TIPOS.map((tp) => ({
    tipo: tp,
    lista: raices
      .filter((r) => r.tipo === tp && (!visibles || visibles.has(r.id)))
      .sort(cmp),
  })).filter((g) => g.lista.length > 0)

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: 0 } }}>
          Estado peruano → institución → órganos → unidades. La búsqueda de
          arriba encuentra cualquier dependencia y abre su ruta. Clic en un
          nombre: detalle con ruta, autoridades, enlaces y sub-órganos.
        </Typography>
        <Button size="small" onClick={expandirTodo}>Expandir todo</Button>
        <Button size="small" onClick={contraerTodo}>Contraer todo</Button>
      </Box>
      {grupos.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nada coincide con la búsqueda.
        </Typography>
      )}
      {grupos.map((g) => (
        <Box key={g.tipo} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {tipoVarios(g.tipo)} ({g.lista.length})
          </Typography>
          {g.lista.map((r) => (
            <NodoArbol
              key={r.id}
              inst={r}
              porPadre={porPadre}
              nivel={0}
              alAbrir={alAbrir}
              alOrganigrama={alOrganigrama}
              abiertos={abiertosEfectivos}
              alternar={alternar}
              visibles={visibles}
            />
          ))}
        </Box>
      ))}
    </Paper>
  )
}


// ------------------------------ piezas -----------------------------------

/** Una cifra del estado de la base; pulsable cuando filtra. */
function Cifra({ icono, valor, texto, aviso, activo, alPulsar }: { icono: React.ReactNode; valor: number; texto: string; aviso?: boolean; activo?: boolean; alPulsar?: () => void }) {
  return (
    <ButtonBase
      onClick={alPulsar}
      disabled={!alPulsar}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.25, p: { xs: 1.25, sm: 1.5 }, borderRadius: 2, textAlign: 'left',
        bgcolor: activo ? PALETA.primarioSuave : 'background.paper', border: '1px solid', borderColor: activo ? 'primary.main' : 'divider',
        '&:hover': alPulsar ? { borderColor: 'primary.main' } : undefined,
      }}
    >
      <Box sx={{ color: aviso && valor ? 'warning.main' : 'primary.main', display: 'grid', '& svg': { fontSize: 22 } }}>{icono}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: { xs: 17, sm: 19 }, lineHeight: 1.15 }}>{valor.toLocaleString('es-PE')}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{texto}</Typography>
      </Box>
    </ButtonBase>
  )
}

/** Un filtro rápido con su número. */
function Filtro({ texto, n, activo, alPulsar, aviso }: { texto: string; n?: number; activo: boolean; alPulsar: () => void; aviso?: boolean }) {
  return (
    <Chip
      label={n !== undefined ? `${texto} · ${n.toLocaleString('es-PE')}` : texto}
      onClick={alPulsar}
      color={activo ? (aviso ? 'warning' : 'primary') : 'default'}
      variant={activo ? 'filled' : 'outlined'}
      icon={aviso ? <ErrorOutlineIcon /> : undefined}
      sx={{ flexShrink: 0, bgcolor: activo ? undefined : 'background.paper' }}
    />
  )
}

/** Buscar por palabras, sin tildes: todas las palabras en algún campo. */
const casa = (q: string, campos: (string | undefined | null)[]) => {
  const palabras = normal(q).split(' ').filter(Boolean)
  if (!palabras.length) return true
  const texto = normal(campos.filter(Boolean).join(' '))
  return palabras.every((p) => texto.includes(p))
}

const POR_PAGINA = 60

/** «Mostrar más» al pie de una lista larga (el directorio tiene miles). */
function MasFilas({ visibles, total, alMostrar }: { visibles: number; total: number; alMostrar: () => void }) {
  if (visibles >= total) return null
  return (
    <Button fullWidth onClick={alMostrar} sx={{ mt: 1 }}>
      Mostrar más ({visibles.toLocaleString('es-PE')} de {total.toLocaleString('es-PE')})
    </Button>
  )
}

/** Sin siglas, el tipo dice más que unas iniciales («GR» para los 25 gobiernos regionales). */
const ICONO_TIPO: Record<string, typeof ApartmentOutlinedIcon> = {
  poder: GavelOutlinedIcon, ministerio: AccountBalanceOutlinedIcon, region: MapOutlinedIcon,
  municipalidad: LocationCityOutlinedIcon, universidad: SchoolOutlinedIcon, empresa: BusinessOutlinedIcon,
}
function IconoTipo({ tipo }: { tipo: string }) {
  const I = ICONO_TIPO[tipo] ?? ApartmentOutlinedIcon
  return <I sx={{ fontSize: 21 }} />
}

function FilaInstitucion({ i, padre, faltantes, elegida, alElegir }: { i: Institucion; padre?: Institucion; faltantes: number; elegida: boolean; alElegir: () => void }) {
  return (
    <ButtonBase
      onClick={alElegir}
      aria-current={elegida}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', justifyContent: 'flex-start', textAlign: 'left', px: 1.5, py: 1.1,
        borderBottom: '1px solid', borderColor: 'divider', opacity: i.activo ? 1 : 0.55,
        bgcolor: elegida ? PALETA.primarioSuave : 'transparent',
        '&:hover': { bgcolor: elegida ? PALETA.veloMedio : 'action.hover' },
      }}
    >
      <Avatar variant="rounded" sx={{ width: 40, height: 40, fontSize: i.siglas && i.siglas.length > 4 ? 10.5 : 12.5, fontWeight: 700, bgcolor: esEntidad(i) ? PALETA.veloMedio : PALETA.superficieMedia, color: 'primary.main' }}>
        {i.siglas ? i.siglas.slice(0, 6) : <IconoTipo tipo={i.tipo} />}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.nombre}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.35 }} noWrap>
          {tipoUno(i.tipo)}
          {i.region ? ` · ${i.region}` : ''}
          {padre ? ` · de ${padre.siglas || padre.nombre}` : ''}
          {!i.activo ? ' · inactiva' : ''}
        </Typography>
      </Box>
      {faltantes > 0 ? (
        <Tooltip title={`Le faltan ${faltantes} dato(s) que usa el sistema`}>
          <Chip size="small" color="warning" variant="outlined" icon={<ErrorOutlineIcon />} label={faltantes} sx={{ height: 22, fontSize: 11.5 }} />
        </Tooltip>
      ) : (
        <ChevronRightIcon sx={{ color: 'text.disabled' }} />
      )}
    </ButtonBase>
  )
}

/** Un bloque de un formulario: título, para qué sirve y sus campos. */
function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography sx={{ fontWeight: 650, fontSize: 14 }}>{titulo}</Typography>
      {ayuda && <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>{ayuda}</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mt: ayuda ? 0 : 1 }}>{children}</Box>
    </Box>
  )
}

/** Aviso de posibles duplicados al crear. */
function Duplicados<T extends { id: number; nombre: string; siglas?: string }>({ lista, alAbrir }: { lista: T[]; alAbrir?: (x: T) => void }) {
  if (!lista.length) return null
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <b>¿Ya existe?</b> Hay {lista.length === 1 ? 'una ficha parecida' : 'fichas parecidas'}; mejor no repetirla.
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
        {lista.map((x) => (
          <li key={x.id}>
            {x.siglas ? `${x.siglas} · ` : ''}{x.nombre}
            {alAbrir && <Link component="button" onClick={() => alAbrir(x)} sx={{ ml: 1, fontSize: 'inherit' }}>Abrir esa</Link>}
          </li>
        ))}
      </Box>
    </Alert>
  )
}

type Pestana = 'contactos' | 'instituciones' | 'jerarquia' | 'distritos'

export default function Directorio() {
  const tema = useTheme()
  const celular = useMediaQuery(tema.breakpoints.down('sm'))
  const [mesasFaltantes, setMesasFaltantes] = useState(false)
  // Escritorio: la ficha va al lado de la lista; más angosto, en una ventana.
  const conPanel = useMediaQuery(tema.breakpoints.up('md'))
  // Todos los roles ven, buscan, crean y editan (Fase 2). Solo el administrador
  // importa en masa, desactiva y gestiona enlaces; esas acciones se ocultan al
  // resto (el backend igual las rechaza con 403). Pedido de Edison 2026-08-31.
  const esAdmin = localStorage.getItem('qillqa_rol') === 'administrador'
  // La pestaña vive en la dirección (`?pestana=instituciones|jerarquia|distritos`; sin ella,
  // los contactos; `personas`, el nombre de antes, también): la franja del Marco la cambia.
  const [consulta, setConsulta] = useSearchParams()
  const pq = consulta.get('pestana')
  const tab: Pestana = pq === 'instituciones' || pq === 'jerarquia' || pq === 'distritos' ? pq : 'contactos'

  // --- datos: todo una vez; se filtra aquí ---------------------------------
  const [instAll, setInstAll] = useState<Institucion[] | null>(null)
  const [persAll, setPersAll] = useState<Persona[] | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error' | 'warning'; texto: string } | null>(null)
  const [importando, setImportando] = useState(false)
  const [version, setVersion] = useState(0)
  const cargar = useCallback(() => {
    api<Institucion[]>('/api/directorio/instituciones?q=&inactivos=true&limite=5000').then(setInstAll).catch(() => setInstAll([]))
    api<Persona[]>('/api/directorio/personas?q=&inactivos=true&limite=5000').then(setPersAll).catch(() => setPersAll([]))
    setVersion((v) => v + 1)
  }, [])
  useEffect(cargar, [cargar])

  // Activas: árbol, selectores de «depende de» y de institución de la persona.
  const todas = useMemo(() => (instAll ?? []).filter((i) => i.activo), [instAll])
  const porId = useMemo(() => new Map((instAll ?? []).map((i) => [i.id, i])), [instAll])
  const autoridades = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of persAll ?? []) if (p.activo && p.institucion_id) m.set(p.institucion_id, (m.get(p.institucion_id) ?? 0) + 1)
    return m
  }, [persAll])
  // Lo que le falta a cada entidad (solo a las ENTIDADES: las dependencias
  // tramitan por la mesa de partes de su entidad).
  const faltaInst = useCallback((i: Institucion) => (esEntidad(i) ? faltan(requisitosInstitucion(i, autoridades.get(i.id) ?? 0)).length : 0), [autoridades])

  // --- filtros -----------------------------------------------------------
  const [q, setQ] = useState(() => consulta.get('q') ?? '')
  const [alcance, setAlcance] = useState<'entidades' | 'todas'>('entidades')
  const [tipo, setTipo] = useState('')
  const [porCompletar, setPorCompletar] = useState(false)
  const [inactivas, setInactivas] = useState(false)
  const [cuantas, setCuantas] = useState(POR_PAGINA)
  useEffect(() => setCuantas(POR_PAGINA), [q, alcance, tipo, porCompletar, inactivas, tab])

  const entidades = todas.filter(esEntidad)
  const entidadesIncompletas = entidades.filter((i) => faltaInst(i) > 0)
  const personasActivas = (persAll ?? []).filter((p) => p.activo)

  const listaInst = useMemo(() => {
    const t = q.trim()
    return (instAll ?? [])
      .filter((i) => (inactivas ? !i.activo : i.activo))
      // Al buscar se mira en todas las dependencias, no solo en las entidades.
      .filter((i) => alcance === 'todas' || t || esEntidad(i))
      .filter((i) => !tipo || i.tipo === tipo)
      .filter((i) => !porCompletar || faltaInst(i) > 0)
      .filter((i) => casa(t, [i.nombre, i.siglas, i.region, tipoUno(i.tipo), i.sector]))
      .sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'))
  }, [instAll, q, alcance, tipo, porCompletar, inactivas, faltaInst])
  const tiposConConteo = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of todas) if (alcance === 'todas' || esEntidad(i)) m.set(i.tipo, (m.get(i.tipo) ?? 0) + 1)
    return ORDEN_TIPOS.filter((t) => m.has(t)).map((t) => ({ tipo: t, n: m.get(t)! }))
  }, [todas, alcance])

  // --- selección y diálogos --------------------------------------------------
  const [sel, setSel] = useState<number | null>(null)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [organigramaId, setOrganigramaId] = useState<number | null>(null)
  const [edInst, setEdInst] = useState<Institucion | null>(null)
  // «Ver más» del formulario de institución: abierto si la ficha ya tiene algo en esos campos.
  const [instMas, setInstMas] = useState(false)
  useEffect(() => {
    if (edInst === null) return
    setInstMas(Boolean(edInst.nivel_gobierno || edInst.region || edInst.categoria || edInst.url_oficial || edInst.ruc || edInst.direccion || edInst.notas || !edInst.activo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edInst?.id, edInst === null])
  const [edPers, setEdPers] = useState<Persona | null>(null)
  // `?ver=ID` (desde la agenda, el mapa o un contacto): esa institución, al lado o en ventana.
  useEffect(() => {
    const ver = Number(consulta.get('ver'))
    if (!ver || tab !== 'instituciones' || !instAll) return
    if (conPanel) setSel(ver)
    else setDetalleId(ver)
    const c = new URLSearchParams(consulta)
    c.delete('ver')
    setConsulta(c, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta, tab, instAll, conPanel])
  // En escritorio, al entrar o al filtrar se elige la primera de la lista.
  useEffect(() => {
    if (!conPanel || tab !== 'instituciones') return
    if (!listaInst.length) return setSel(null)
    if (sel === null || !listaInst.some((i) => i.id === sel)) setSel(listaInst[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaInst, conPanel, tab])
  /** Abrir una institución: al lado en escritorio, en ventana si no. */
  const abrirInst = (id: number) => {
    if (conPanel && tab === 'instituciones') setSel(id)
    else setDetalleId(id)
  }

  // --- acciones ---------------------------------------------------------------
  const importar = async () => {
    setImportando(true)
    try {
      const r = await api<{ instituciones: number; actualizadas: number; personas: number; enlaces: number; avisos?: string[] }>('/api/directorio/importar', { method: 'POST' })
      const resumen = `Importación lista: +${r.instituciones} instituciones (${r.actualizadas} actualizadas), +${r.personas} personas, +${r.enlaces} enlaces.`
      setAviso(r.avisos?.length ? { tipo: 'warning', texto: `${resumen} Atención: ${r.avisos.join(' ')}` } : { tipo: 'success', texto: resumen })
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo importar.' })
    } finally {
      setImportando(false)
    }
  }
  const guardarInst = async () => {
    if (!edInst) return
    const nuevo = edInst.id === 0
    try {
      const r = await api<Institucion>(`/api/directorio/instituciones${nuevo ? '' : `/${edInst.id}`}`, { method: nuevo ? 'POST' : 'PUT', body: JSON.stringify(edInst) })
      setEdInst(null)
      setAviso({ tipo: 'success', texto: nuevo ? `«${edInst.nombre}» agregada al directorio.` : 'Institución guardada.' })
      cargar()
      if (nuevo && r?.id) abrirInst(r.id)
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' })
    }
  }
  const desactivar = async (cual: 'instituciones' | 'personas', id: number, nombre: string) => {
    if (!(await confirmar(`¿Desactivar «${nombre}»? Dejará de sugerirse en los documentos (no se borra; se puede reactivar al editarla).`, { aceptar: 'Desactivar', peligro: true }))) return
    try {
      await api(`/api/directorio/${cual}/${id}`, { method: 'DELETE' })
      setAviso({ tipo: 'success', texto: `«${nombre}» desactivada.` })
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo desactivar.' })
    }
  }

  const propsFicha = {
    todas,
    version,
    alEditar: (i: Institucion) => setEdInst({ ...i }),
    alNavegar: abrirInst,
    alOrganigrama: (i: Institucion) => setOrganigramaId(i.id),
    alAvisar: (t: 'success' | 'error', texto: string) => setAviso({ tipo: t, texto }),
    alNuevaPersona: (id: number) => setEdPers({ ...PERS_VACIA, institucion_id: id }),
    alEditarPersona: (p: Persona) => setEdPers({ ...(persAll ?? []).find((x) => x.id === p.id), ...p }),
    // Tocar una autoridad abre su ficha de contacto.
    alVerPersona: (p: Persona) => {
      setDetalleId(null)
      setConsulta(new URLSearchParams({ contacto: String(p.id) }))
    },
  }
  /** Tras guardar o marcar un favorito: la persona nueva o cambiada, en la lista cargada. */
  const actualizarPersona = (p: Persona) =>
    setPersAll((lista) => {
      const l = lista ?? []
      return l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [...l, p]
    })
  const elegida = sel !== null ? porId.get(sel) ?? null : null
  const instDup = edInst && edInst.id === 0 ? parecidas(instAll ?? [], edInst.nombre, edInst.siglas) : []
  const cargando = instAll === null || persAll === null

  // Lo que va en «⋮» de todas las pestañas (y de los contactos).
  const accionesDirectorio = [
    { etiqueta: 'Mesas de partes que faltan', icono: <InboxOutlinedIcon fontSize="small" />, alPulsar: () => setMesasFaltantes(true) },
    esAdmin && {
      etiqueta: importando ? 'Importando…' : 'Importar de marcadores',
      icono: <CloudDownloadIcon fontSize="small" />,
      alPulsar: () => void importar(),
      deshabilitada: importando,
    },
  ]

  const buscador = (
    <TextField
      fullWidth
      type="search"
      placeholder={
        tab === 'jerarquia' ? 'Buscar una institución, órgano u oficina en la jerarquía'
            : 'Buscar por nombre, siglas, región o tipo'
      }
      value={q}
      onChange={(e) => setQ(e.target.value)}
      sx={{ bgcolor: 'background.paper' }}
      InputProps={{
        startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
        endAdornment: q ? <IconButton size="small" onClick={() => setQ('')} aria-label="Limpiar la búsqueda"><CloseIcon fontSize="small" /></IconButton> : undefined,
      }}
    />
  )

  return (
    <Marco
      modulo="directorio"
      fondo={PALETA.fondo}
    >
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: { xs: 1.5, sm: 2.5 }, maxWidth: 1600, width: '100%', mx: 'auto' }}>
        {/* Distritos y aniversarios (2026-10-06): su propia vista, sin el buscador del directorio. */}
        {tab === 'distritos' ? <TablaDistritos qInicial={consulta.get('q') ?? ''} ordenInicial={consulta.get('orden') ?? ''} /> : tab === 'contactos' ? (
          <VistaContactos
            personas={persAll}
            porId={porId}
            todas={todas}
            esAdmin={esAdmin}
            masAcciones={accionesDirectorio}
            alRecargar={cargar}
            alActualizar={actualizarPersona}
            alAvisar={(tipo, texto) => setAviso({ tipo, texto })}
            alVerInstitucion={setDetalleId}
            alDesactivar={(p) => void desactivar('personas', p.id, p.nombre)}
          />
        ) : (<>
        {cargando && <LinearProgress sx={{ mb: 2 }} />}

        {/* El estado de la base: qué hay y qué falta (un toque filtra). */}
        {!cargando && tab === 'instituciones' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mb: 2 }}>
            <Cifra icono={<ApartmentOutlinedIcon />} valor={entidades.length} texto="entidades del Estado" />
            <Cifra icono={<AccountTreeOutlinedIcon />} valor={todas.length - entidades.length} texto="dependencias" />
            <Cifra icono={<BadgeOutlinedIcon />} valor={personasActivas.length} texto="contactos" alPulsar={() => setConsulta(new URLSearchParams())} />
            <Cifra
              icono={entidadesIncompletas.length ? <ErrorOutlineIcon /> : <CheckCircleIcon />}
              valor={entidadesIncompletas.length}
              texto="por completar"
              aviso
              activo={porCompletar}
              alPulsar={() => { setPorCompletar((v) => !v); setInactivas(false) }}
            />
          </Box>
        )}

        {/* Crear (la acción principal, en su sitio común), buscar y filtrar. */}
        <BarraModulo
          alActualizar={cargar}
          mb={1}
          principal={tab !== 'jerarquia' && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setEdInst({ ...INST_VACIA })}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Nueva institución
            </Button>
          )}
          mas={accionesDirectorio}
        >
          <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>{buscador}</Box>
        </BarraModulo>
        {tab === 'instituciones' && (
          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, alignItems: 'center', overflowX: 'auto', pb: 0.25, '&::-webkit-scrollbar': { display: 'none' } }}>
            <ToggleButtonGroup size="small" exclusive value={alcance} onChange={(_, v) => v && setAlcance(v)} sx={{ flexShrink: 0, bgcolor: 'background.paper', '& .MuiToggleButton-root': { textTransform: 'none', py: 0.4, px: 1.25 } }}>
              <ToggleButton value="entidades">Entidades</ToggleButton>
              <ToggleButton value="todas">Con dependencias</ToggleButton>
            </ToggleButtonGroup>
            <TextField select size="small" value={tipo} onChange={(e) => setTipo(e.target.value)} SelectProps={{ displayEmpty: true }} sx={{ minWidth: 170, flexShrink: 0, bgcolor: 'background.paper' }}>
              <MenuItem value="">Todos los tipos</MenuItem>
              {tiposConConteo.map((t) => <MenuItem key={t.tipo} value={t.tipo}>{tipoVarios(t.tipo)} · {t.n}</MenuItem>)}
            </TextField>
            <Filtro texto="Por completar" n={entidadesIncompletas.length} aviso activo={porCompletar} alPulsar={() => { setPorCompletar((v) => !v); setInactivas(false) }} />
            <Filtro texto="Inactivas" n={(instAll ?? []).filter((i) => !i.activo).length} activo={inactivas} alPulsar={() => { setInactivas((v) => !v); setPorCompletar(false) }} />
          </Box>
        )}
        {/* ------------------------- instituciones ------------------------- */}
        {tab === 'instituciones' && !cargando && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(340px, 440px) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.75 }}>
                {listaInst.length.toLocaleString('es-PE')} {listaInst.length === 1 ? 'resultado' : 'resultados'}
                {porCompletar ? ' · les falta algún dato que usa el sistema' : ''}
                {alcance === 'entidades' && !q.trim() && !inactivas ? ' · sus dependencias están dentro de cada ficha' : ''}
              </Typography>
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', maxHeight: { md: 'calc(100vh - 330px)' }, overflowY: { md: 'auto' } }}>
                {listaInst.slice(0, cuantas).map((i) => (
                  <FilaInstitucion
                    key={i.id}
                    i={i}
                    padre={i.parent_id !== null ? porId.get(i.parent_id) : undefined}
                    faltantes={faltaInst(i)}
                    elegida={conPanel && sel === i.id}
                    alElegir={() => abrirInst(i.id)}
                  />
                ))}
                {listaInst.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4, px: 2 }}>
                    {q.trim() || porCompletar || inactivas || tipo ? 'Ninguna institución coincide con la búsqueda o los filtros.' : 'Sin instituciones. Use «Nueva institución» o «Importar de marcadores».'}
                  </Typography>
                )}
                <MasFilas visibles={cuantas} total={listaInst.length} alMostrar={() => setCuantas((n) => n + POR_PAGINA)} />
              </Paper>
            </Box>
            {conPanel && (
              <Box sx={{ minWidth: 0, position: 'sticky', top: 12, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', pr: 0.5 }}>
                {elegida ? (
                  <>
                    <FichaInstitucion inst={elegida} {...propsFicha} />
                    {esAdmin && elegida.activo && (
                      <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => desactivar('instituciones', elegida.id, elegida.nombre)} sx={{ mt: 1 }}>
                        Desactivar esta institución
                      </Button>
                    )}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>Elija una institución para ver su ficha.</Typography>
                )}
              </Box>
            )}
          </Box>
        )}

        {tab === 'jerarquia' && !cargando && (
          <Arbol instituciones={todas} q={q} alAbrir={setDetalleId} alOrganigrama={setOrganigramaId} />
        )}
        </>)}
      </Box>

      {/* ----------------------- formulario institución ----------------------- */}
      {/* Como el de los contactos (2026-10-13): lo de siempre a la vista y «Ver más» para el resto. */}
      <Dialog open={edInst !== null} onClose={() => setEdInst(null)} maxWidth="sm" fullWidth fullScreen={celular}>
        <DialogTitle>{edInst?.id ? 'Editar institución' : 'Nueva institución'}</DialogTitle>
        <DialogContent dividers>
          {edInst && (
            <>
              <Duplicados lista={instDup} alAbrir={(x) => { setEdInst(null); abrirInst(x.id) }} />
              <Bloque titulo="Identificación">
                <TextField label="Nombre oficial" value={edInst.nombre} onChange={(e) => setEdInst({ ...edInst, nombre: e.target.value })} sx={{ gridColumn: '1 / -1' }} required autoFocus={!edInst.id && !celular} />
                <TextField label="Siglas" value={edInst.siglas} onChange={(e) => setEdInst({ ...edInst, siglas: e.target.value })} placeholder="MINEDU" />
                <TextField select label="Tipo" value={edInst.tipo} onChange={(e) => setEdInst({ ...edInst, tipo: e.target.value })}>
                  {ORDEN_TIPOS.map((t) => <MenuItem key={t} value={t}>{TIPO_INST[t].uno}</MenuItem>)}
                </TextField>
                <Autocomplete
                  sx={{ gridColumn: '1 / -1' }}
                  options={todas.filter((t) => t.id !== edInst.id)}
                  getOptionLabel={(i) => (i.siglas ? `${i.siglas} — ${i.nombre}` : i.nombre)}
                  renderOption={(props, i) => (
                    <li {...props} key={i.id}>
                      <Box>
                        <Typography sx={{ fontSize: 14 }}>{i.siglas ? <b>{i.siglas} · </b> : null}{i.nombre}</Typography>
                        <Typography variant="caption" color="text.secondary">{tipoUno(i.tipo)}{i.region ? ` · ${i.region}` : ''}</Typography>
                      </Box>
                    </li>
                  )}
                  value={todas.find((t) => t.id === edInst.parent_id) ?? null}
                  onChange={(_, v) => setEdInst({ ...edInst, parent_id: v?.id ?? null })}
                  renderInput={(params) => <TextField {...params} label="Depende de" placeholder="Vacío si es una entidad (ministerio, gobierno regional…)" helperText="Una dirección u oficina hereda la mesa de partes de su entidad y sale en su organigrama." />}
                />
              </Bloque>
              <Bloque titulo="Contacto">
                <TextField label="Correo institucional" type="email" value={edInst.email} onChange={(e) => setEdInst({ ...edInst, email: e.target.value })} error={Boolean(avisoCorreo(edInst.email))} helperText={avisoCorreo(edInst.email) || 'Envío por correo y constancias'} />
                <TextField label="Teléfono" type="tel" value={edInst.telefono} onChange={(e) => setEdInst({ ...edInst, telefono: e.target.value })} helperText=" " />
                <TextField label="Mesa de partes virtual (URL)" value={edInst.url_mesa_partes} onChange={(e) => setEdInst({ ...edInst, url_mesa_partes: e.target.value })} sx={{ gridColumn: '1 / -1' }} placeholder="https://…" error={Boolean(avisoUrl(edInst.url_mesa_partes))} helperText={avisoUrl(edInst.url_mesa_partes) || 'Envío por la vía virtual'} />
              </Bloque>
              {!instMas ? (
                <Button onClick={() => setInstMas(true)} sx={{ textTransform: 'none' }}>Ver más</Button>
              ) : (<>
              <Bloque titulo="Más datos">
                <TextField select label="Nivel de gobierno" value={edInst.nivel_gobierno} onChange={(e) => setEdInst({ ...edInst, nivel_gobierno: e.target.value })} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
                  <MenuItem value=""><em>Sin indicar</em></MenuItem>
                  {Object.entries(NIVELES).map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
                </TextField>
                <TextField label="Región" value={edInst.region} onChange={(e) => setEdInst({ ...edInst, region: e.target.value })} placeholder="Ayacucho" />
                <TextField select label="Categoría en el organigrama (ROF)" value={edInst.categoria} onChange={(e) => setEdInst({ ...edInst, categoria: e.target.value })} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ gridColumn: '1 / -1' }}>
                  <MenuItem value=""><em>Sin categoría</em></MenuItem>
                  {Object.entries(ETIQUETA_CATEGORIA).map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
                </TextField>
                <TextField label="Portal oficial (URL)" value={edInst.url_oficial} onChange={(e) => setEdInst({ ...edInst, url_oficial: e.target.value })} sx={{ gridColumn: '1 / -1' }} placeholder="https://www.gob.pe/…" error={Boolean(avisoUrl(edInst.url_oficial))} helperText={avisoUrl(edInst.url_oficial) || ' '} />
                <TextField label="RUC" inputMode="numeric" value={edInst.ruc} onChange={(e) => setEdInst({ ...edInst, ruc: e.target.value })} placeholder="20161749126" error={Boolean(avisoRuc(edInst.ruc))} helperText={avisoRuc(edInst.ruc) || 'Trámites administrativos'} />
                <TextField label="Dirección" value={edInst.direccion} onChange={(e) => setEdInst({ ...edInst, direccion: e.target.value })} helperText="Oficios en papel y cargo de recepción" />
                <TextField label="Notas" value={edInst.notas} onChange={(e) => setEdInst({ ...edInst, notas: e.target.value })} sx={{ gridColumn: '1 / -1' }} multiline minRows={2} />
                <FormControlLabel
                  sx={{ gridColumn: '1 / -1' }}
                  control={<Switch checked={edInst.activo} onChange={(e) => setEdInst({ ...edInst, activo: e.target.checked })} />}
                  label={edInst.activo ? 'Activa: se sugiere al redactar' : 'Inactiva: no se sugiere (no se borra)'}
                />
              </Bloque>
              </>)}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdInst(null)}>Cancelar</Button>
          <Button variant="contained" disableElevation onClick={guardarInst} disabled={!edInst?.nombre.trim()}>{edInst?.id ? 'Guardar' : 'Agregar institución'}</Button>
        </DialogActions>
      </Dialog>

      {/* Alta y edición de una autoridad desde la ficha de su institución: el mismo formulario de los contactos. */}
      <FormularioContacto
        inicial={edPers}
        todas={todas}
        personas={persAll ?? []}
        etiquetas={etiquetasEnUso(persAll ?? []).map((e) => e.nombre)}
        alCerrar={() => setEdPers(null)}
        alGuardado={(p, nuevo) => {
          setEdPers(null)
          actualizarPersona(p)
          setAviso({ tipo: 'success', texto: nuevo ? `«${p.nombre}» agregado al directorio.` : 'Contacto guardado.' })
          cargar()
        }}
      />

      <DetalleInstitucion
        inst={detalleId !== null ? porId.get(detalleId) ?? null : null}
        {...propsFicha}
        alNavegar={setDetalleId}
        alCerrar={() => setDetalleId(null)}
      />

      <DialogoOrganigrama
        raiz={organigramaId !== null ? todas.find((i) => i.id === organigramaId) ?? null : null}
        todas={todas}
        alCerrar={() => setOrganigramaId(null)}
        alAbrir={(id) => {
          setOrganigramaId(null)
          setDetalleId(id)
        }}
      />

      <Snackbar
        open={aviso !== null}
        autoHideDuration={6000}
        onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 76, sm: 24 } }}
      >
        <Alert severity={aviso?.tipo ?? 'success'} onClose={() => setAviso(null)}>
          {aviso?.texto}
        </Alert>
      </Snackbar>
      <DialogoMesasFaltantes abierto={mesasFaltantes} alCerrar={() => setMesasFaltantes(false)} />
    </Marco>
  )
}

/**
 * FICHA DE UNA INSTITUCIÓN del directorio: dónde está en el Estado (ruta),
 * qué datos usa el sistema y cuáles faltan, su contacto y trámite, sus
 * AUTORIDADES (personas vinculadas), sus DEPENDENCIAS, sus ENLACES y la
 * procedencia del organigrama oficial.
 *
 * Rediseño (Edison 2026-10-01: «el directorio es una base estructural del
 * sistema; más claro, fácil de entender y sencillo de manejar»):
 *   - `FichaInstitucion` es el contenido; en escritorio va a la derecha de la
 *     lista (sin ventana encima) y en el celular dentro de `DetalleInstitucion`,
 *     a pantalla completa;
 *   - arriba, «Lo que usa el sistema»: cada dato con su uso y si está;
 *   - las autoridades con su contacto pulsable y editables desde aquí, y
 *     «Agregar autoridad» con la institución ya puesta.
 * Crear o quitar enlaces sigue siendo solo del administrador (el backend
 * rechaza al resto con 403); verlos, de todos.
 */
import { useCallback, useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Link from '@mui/material/Link'
import Avatar from '@mui/material/Avatar'
import Collapse from '@mui/material/Collapse'
import LinearProgress from '@mui/material/LinearProgress'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import EditIcon from '@mui/icons-material/Edit'
import AddLinkIcon from '@mui/icons-material/AddLink'
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined'
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import LocalPhoneOutlinedIcon from '@mui/icons-material/LocalPhoneOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { api } from '../api'
import { NIVELES, iniciales, requisitosInstitucion, tipoUno, tratamientoLegible, type Institucion, type Persona } from '../directorio'
import { confirmar } from './Dialogos'
import { PALETA } from '../paleta'

/** Se conserva el nombre: lo importan el organigrama y otras piezas. */
export type InstitucionDet = Institucion

interface EnlaceInst {
  id: number
  tipo: string
  url: string
  etiqueta: string
}

export const ETIQUETA_ENLACE: Record<string, string> = {
  mesa_partes: 'Mesa de partes',
  oficial: 'Portal oficial',
  transparencia: 'Transparencia',
  funcionarios: 'Funcionarios',
  seguimiento: 'Seguimiento',
  datos: 'Datos',
  servicio: 'Servicio',
  otro: 'Otro',
}

// Clasificación del órgano según el ROF (organigrama oficial).
export const ETIQUETA_CATEGORIA: Record<string, string> = {
  alta_direccion: 'Alta Dirección',
  organo_control: 'Órgano de control',
  organo_defensa: 'Defensa jurídica',
  organo_linea: 'Órgano de línea',
  organo_apoyo: 'Órgano de apoyo',
  organo_asesoramiento: 'Órgano de asesoramiento',
  organo_resolutivo: 'Órgano resolutivo',
  organo_desconcentrado: 'Órgano desconcentrado',
  unidad_organica: 'Unidad orgánica',
  programa: 'Programa',
  proyecto: 'Proyecto especial',
  adscrito: 'Organismo adscrito',
  comision: 'Comisión / Consejo',
}

/** Un bloque de la ficha: título con su número y el contenido. */
function Seccion({ titulo, n, accion, children }: { titulo: string; n?: number; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: { xs: 1.5, sm: 2 }, mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontWeight: 650, fontSize: 14.5, flex: 1 }}>
          {titulo}
          {n !== undefined && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}> · {n}</Box>}
        </Typography>
        {accion}
      </Box>
      {children}
    </Box>
  )
}

const copiar = (texto: string, alAvisar?: (t: 'success' | 'error', x: string) => void) =>
  navigator.clipboard?.writeText(texto).then(() => alAvisar?.('success', `Copiado: ${texto}`)).catch(() => {})

export function FichaInstitucion({
  inst,
  todas,
  version = 0,
  alEditar,
  alNavegar,
  alOrganigrama,
  alAvisar,
  alNuevaPersona,
  alEditarPersona,
  alVerPersona,
  alCerrar,
}: {
  inst: Institucion
  /** Lista completa (para resolver padre e hijos sin más consultas). */
  todas: Institucion[]
  /** Cambia tras guardar una persona: la ficha vuelve a pedir sus autoridades. */
  version?: number
  alEditar: (i: Institucion) => void
  /** Cambia la ficha a otra institución (padre o dependencia). */
  alNavegar: (id: number) => void
  alOrganigrama?: (i: Institucion) => void
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
  alNuevaPersona?: (institucionId: number) => void
  alEditarPersona?: (p: Persona) => void
  /** Tocar el nombre de una autoridad abre su ficha de contacto (2026-10-13). */
  alVerPersona?: (p: Persona) => void
  alCerrar?: () => void
}) {
  const esAdmin = localStorage.getItem('sgdp_rol') === 'administrador'
  const [enlaces, setEnlaces] = useState<EnlaceInst[]>([])
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [nuevo, setNuevo] = useState({ tipo: 'otro', url: '', etiqueta: '' })
  const [conFormEnlace, setConFormEnlace] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => {
    api<EnlaceInst[]>(`/api/directorio/instituciones/${inst.id}/enlaces`).then(setEnlaces).catch(() => setEnlaces([]))
    api<Persona[]>(`/api/directorio/personas?institucion_id=${inst.id}`).then(setPersonas).catch(() => setPersonas([]))
  }, [inst.id])
  useEffect(() => {
    setNuevo({ tipo: 'otro', url: '', etiqueta: '' })
    setConFormEnlace(false)
    setPersonas(null)
    cargar()
  }, [cargar, version])

  const padre = todas.find((t) => t.id === inst.parent_id) ?? null
  const hijos = todas.filter((t) => t.parent_id === inst.id).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  const nietos = (id: number) => todas.filter((t) => t.parent_id === id).length
  // Ruta jerárquica completa (raíz → … → padre), para ubicar el órgano.
  const ruta: Institucion[] = []
  {
    let n: Institucion | undefined = padre ?? undefined
    const vistos = new Set<number>()
    while (n && !vistos.has(n.id)) {
      vistos.add(n.id)
      ruta.unshift(n)
      n = n.parent_id !== null ? todas.find((t) => t.id === n!.parent_id) : undefined
    }
  }
  const entidad = ruta[0] ?? null
  const requisitos = requisitosInstitucion(inst, personas ? personas.filter((p) => p.activo).length : null)
  const completos = requisitos.filter((r) => r.ok).length

  const agregarEnlace = async () => {
    if (!nuevo.url.trim()) return
    setGuardando(true)
    try {
      await api(`/api/directorio/instituciones/${inst.id}/enlaces`, { method: 'POST', body: JSON.stringify(nuevo) })
      setNuevo({ tipo: 'otro', url: '', etiqueta: '' })
      setConFormEnlace(false)
      cargar()
      alAvisar?.('success', 'Enlace agregado.')
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo agregar el enlace.')
    } finally {
      setGuardando(false)
    }
  }
  const eliminarEnlace = async (e: EnlaceInst) => {
    if (!(await confirmar(`¿Eliminar el enlace «${ETIQUETA_ENLACE[e.tipo] ?? e.tipo}» (${e.url})?`, { aceptar: 'Eliminar', peligro: true }))) return
    try {
      await api(`/api/directorio/enlaces/${e.id}`, { method: 'DELETE' })
      cargar()
    } catch (err) {
      alAvisar?.('error', err instanceof Error ? err.message : 'No se pudo eliminar.')
    }
  }

  /** Un dato de contacto: etiqueta, valor (enlace si es URL) y copiar. */
  const dato = (etiqueta: string, valor: string, tipo: 'texto' | 'url' | 'correo' | 'tel' = 'texto') => (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.5, minWidth: 0, borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 'none' } }}>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', width: { xs: 104, sm: 128 }, flexShrink: 0 }}>{etiqueta}</Typography>
      <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5, overflowWrap: 'anywhere' }}>
        {!valor ? (
          <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>
        ) : tipo === 'url' ? (
          <Link href={valor} target="_blank" rel="noopener">{valor.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} <OpenInNewIcon sx={{ fontSize: 12 }} /></Link>
        ) : tipo === 'correo' ? (
          <Link href={`mailto:${valor}`}>{valor}</Link>
        ) : tipo === 'tel' ? (
          <Link href={`tel:${valor.replace(/\s/g, '')}`}>{valor}</Link>
        ) : (
          valor
        )}
      </Box>
      {valor && tipo !== 'url' && (
        <Tooltip title="Copiar">
          <IconButton size="small" onClick={() => copiar(valor, alAvisar)} sx={{ p: 0.25, alignSelf: 'center' }} aria-label={`Copiar ${etiqueta}`}>
            <ContentCopyIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )

  return (
    <Box>
      {/* Cabecera: dónde está, qué es y las acciones. */}
      <Box sx={{ mb: 1.5 }}>
        {ruta.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.25, mb: 0.5 }}>
            {ruta.map((r) => (
              <Box key={r.id} sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <Link component="button" onClick={() => alNavegar(r.id)} sx={{ fontSize: 12.5 }}>{r.siglas || r.nombre}</Link>
                <ChevronRightIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
              </Box>
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Typography component="h2" sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 700, lineHeight: 1.3, flex: 1, overflowWrap: 'anywhere' }}>
            {inst.siglas && <Box component="span" sx={{ color: 'primary.main' }}>{inst.siglas} · </Box>}
            {inst.nombre}
          </Typography>
          {alCerrar && (
            <IconButton onClick={alCerrar} aria-label="Cerrar la ficha" sx={{ mt: -0.5 }}>
              <CloseIcon />
            </IconButton>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
          <Chip size="small" label={tipoUno(inst.tipo)} />
          {inst.categoria && <Chip size="small" variant="outlined" color="secondary" label={ETIQUETA_CATEGORIA[inst.categoria] ?? inst.categoria} />}
          {inst.nivel_gobierno && <Chip size="small" variant="outlined" label={`Nivel ${NIVELES[inst.nivel_gobierno]?.toLowerCase() ?? inst.nivel_gobierno}`} />}
          {inst.region && <Chip size="small" variant="outlined" label={inst.region} />}
          {!inst.activo && <Chip size="small" color="error" label="Inactiva: no se sugiere" />}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
          <Button size="small" variant="contained" startIcon={<EditIcon />} onClick={() => alEditar(inst)}>Editar datos</Button>
          {alNuevaPersona && <Button size="small" variant="outlined" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => alNuevaPersona(inst.id)}>Agregar autoridad</Button>}
          {alOrganigrama && hijos.length > 0 && <Button size="small" variant="outlined" startIcon={<AccountTreeIcon />} onClick={() => alOrganigrama(inst)}>Organigrama</Button>}
        </Box>
      </Box>

      {/* Lo que usa el sistema: cada dato con su para qué. */}
      {requisitos.length > 0 && (
        <Seccion
          titulo="Lo que usa el sistema"
          accion={<Typography variant="caption" sx={{ fontWeight: 700, color: completos === requisitos.length ? 'success.main' : 'warning.dark' }}>{completos} de {requisitos.length}</Typography>}
        >
          <LinearProgress variant="determinate" value={(100 * completos) / requisitos.length} color={completos === requisitos.length ? 'success' : 'warning'} sx={{ height: 5, borderRadius: 3, mb: 1 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}>
            {requisitos.map((r) => (
              <Box key={r.clave} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                {r.ok ? <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main', mt: 0.1 }} /> : <ErrorOutlineIcon sx={{ fontSize: 18, color: 'warning.main', mt: 0.1 }} />}
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: r.ok ? 'text.primary' : 'warning.dark' }}>{r.texto}{r.ok ? '' : ': falta'}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.35 }}>{r.uso}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
          {!inst.url_mesa_partes && entidad && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              Es una dependencia: sus documentos se tramitan por la mesa de partes de{' '}
              <Link component="button" onClick={() => alNavegar(entidad.id)} sx={{ fontSize: 'inherit' }}>{entidad.siglas || entidad.nombre}</Link>.
            </Typography>
          )}
        </Seccion>
      )}

      <Seccion titulo="Contacto y trámite">
        {dato('Mesa de partes', inst.url_mesa_partes, 'url')}
        {dato('Portal oficial', inst.url_oficial, 'url')}
        {dato('Correo', inst.email, 'correo')}
        {dato('Teléfono', inst.telefono, 'tel')}
        {dato('Dirección', inst.direccion)}
        {dato('RUC', inst.ruc)}
        {inst.notas && dato('Notas', inst.notas)}
      </Seccion>

      <Seccion
        titulo="Autoridades y funcionarios"
        n={personas?.length}
        accion={alNuevaPersona && <Button size="small" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => alNuevaPersona(inst.id)}>Agregar</Button>}
      >
        {personas === null && <LinearProgress sx={{ my: 1 }} />}
        {personas?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Sin personas vinculadas. Agregue a su titular: el sistema lo sugiere como destinatario al redactar.
          </Typography>
        )}
        {personas?.map((p) => (
          <Box key={p.id} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', py: 1, borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 'none', pt: 0.25 }, opacity: p.activo ? 1 : 0.5 }}>
            <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: PALETA.primarioSuave, color: 'primary.main' }}>{iniciales(p.nombre)}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                {p.tratamiento && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>{tratamientoLegible(p.tratamiento)} </Box>}
                {alVerPersona ? (
                  <Link component="button" color="inherit" underline="hover" onClick={() => alVerPersona(p)} sx={{ font: 'inherit', textAlign: 'left' }}>{p.nombre}</Link>
                ) : p.nombre}
              </Typography>
              {p.cargo && <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.35 }}>{p.cargo}{p.area ? ` · ${p.area}` : ''}</Typography>}
              <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', mt: 0.25, fontSize: 12.5 }}>
                {p.celular && <Link href={`tel:${p.celular.replace(/\s/g, '')}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}><PhoneIphoneIcon sx={{ fontSize: 14 }} />{p.celular}</Link>}
                {p.telefono && p.telefono !== p.celular && <Link href={`tel:${p.telefono.replace(/\s/g, '')}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}><LocalPhoneOutlinedIcon sx={{ fontSize: 14 }} />{p.telefono}</Link>}
                {p.anexo && <Box component="span" sx={{ color: 'text.secondary' }}>Anexo {p.anexo}</Box>}
                {(p.email || p.email_alterno) && <Link href={`mailto:${p.email || p.email_alterno}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, overflowWrap: 'anywhere' }}><MailOutlineIcon sx={{ fontSize: 14 }} />{p.email || p.email_alterno}</Link>}
              </Box>
              {p.oficina && <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>{p.oficina}</Typography>}
            </Box>
            {alEditarPersona && (
              <Tooltip title="Editar persona">
                <IconButton size="small" onClick={() => alEditarPersona(p)} aria-label={`Editar a ${p.nombre}`}><EditIcon fontSize="small" /></IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
      </Seccion>

      <Seccion titulo="Dependencias" n={hijos.length}>
        {hijos.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Sin dependencias. Para colgar aquí una dirección u oficina, edítela y elija esta institución en «Depende de».
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 320, overflowY: 'auto', mx: -0.5 }}>
            {hijos.map((h) => (
              <Box
                key={h.id}
                onClick={() => alNavegar(h.id)}
                role="button"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.5, py: 0.6, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <SubdirectoryArrowRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                <Typography sx={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{h.siglas ? <b>{h.siglas} · </b> : null}{h.nombre}</Typography>
                {h.categoria && <Chip size="small" variant="outlined" label={ETIQUETA_CATEGORIA[h.categoria] ?? h.categoria} sx={{ height: 19, fontSize: 10.5, display: { xs: 'none', sm: 'flex' } }} />}
                {nietos(h.id) > 0 && <Chip size="small" label={nietos(h.id)} sx={{ height: 19, fontSize: 10.5 }} />}
              </Box>
            ))}
          </Box>
        )}
      </Seccion>

      <Seccion
        titulo="Enlaces institucionales"
        n={enlaces.length}
        accion={esAdmin && !conFormEnlace && <Button size="small" startIcon={<AddLinkIcon />} onClick={() => setConFormEnlace(true)}>Agregar</Button>}
      >
        {enlaces.length === 0 && !conFormEnlace && <Typography variant="body2" color="text.secondary">Sin enlaces (transparencia, funcionarios, seguimiento de trámites…).</Typography>}
        {enlaces.map((e) => (
          <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4, minWidth: 0 }}>
            <Chip size="small" variant="outlined" label={ETIQUETA_ENLACE[e.tipo] ?? e.tipo} sx={{ width: { xs: 'auto', sm: 118 }, flexShrink: 0 }} />
            <Link href={e.url} target="_blank" rel="noopener" sx={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.etiqueta || e.url.replace(/^https?:\/\/(www\.)?/, '')} <OpenInNewIcon sx={{ fontSize: 12 }} />
            </Link>
            {esAdmin && (
              <Tooltip title="Eliminar enlace">
                <IconButton size="small" color="error" onClick={() => eliminarEnlace(e)}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
        <Collapse in={esAdmin && conFormEnlace} unmountOnExit>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField select size="small" label="Tipo" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} sx={{ width: { xs: '100%', sm: 150 } }}>
              {Object.entries(ETIQUETA_ENLACE).map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
            </TextField>
            <TextField size="small" label="URL" placeholder="https://…" value={nuevo.url} onChange={(e) => setNuevo({ ...nuevo, url: e.target.value })} sx={{ flex: 1 }} autoFocus />
            <TextField size="small" label="Etiqueta (opcional)" value={nuevo.etiqueta} onChange={(e) => setNuevo({ ...nuevo, etiqueta: e.target.value })} sx={{ width: { xs: '100%', sm: 160 } }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button size="small" onClick={() => setConFormEnlace(false)}>Cancelar</Button>
            <Button size="small" variant="contained" onClick={agregarEnlace} disabled={guardando || !nuevo.url.trim()}>Agregar enlace</Button>
          </Box>
        </Collapse>
      </Seccion>

      {/* Procedencia del organigrama (actualización periódica). */}
      {(inst.fuente || inst.url_fuente || inst.norma || inst.fecha_consulta) && (
        <Seccion titulo="Procedencia (organigrama oficial)">
          {inst.fuente && <Typography variant="body2">Fuente: {inst.fuente}</Typography>}
          {inst.norma && <Typography variant="body2">Norma: {inst.norma}</Typography>}
          {inst.fecha_consulta && <Typography variant="body2">Consultado: {inst.fecha_consulta}</Typography>}
          {inst.url_fuente && (
            <Link href={inst.url_fuente} target="_blank" rel="noopener" sx={{ fontSize: 13.5 }}>Ver documento oficial <OpenInNewIcon sx={{ fontSize: 12 }} /></Link>
          )}
        </Seccion>
      )}
      <Typography variant="caption" color="text.disabled">Origen del registro: {inst.origen || '—'}</Typography>
    </Box>
  )
}

/** La ficha en una ventana (celular y tableta: a pantalla completa en el celular). */
export default function DetalleInstitucion({
  inst,
  ...resto
}: Omit<React.ComponentProps<typeof FichaInstitucion>, 'inst' | 'alCerrar'> & { inst: Institucion | null; alCerrar: () => void }) {
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'))
  if (!inst) return null
  return (
    <Dialog open onClose={resto.alCerrar} maxWidth="md" fullWidth fullScreen={celular} PaperProps={{ sx: { bgcolor: PALETA.fondo } }}>
      <Box sx={{ p: { xs: 1.5, sm: 2.5 }, overflowY: 'auto' }}>
        <FichaInstitucion inst={inst} {...resto} />
      </Box>
    </Dialog>
  )
}

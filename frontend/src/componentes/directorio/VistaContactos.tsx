/**
 * CONTACTOS — la vista principal del Directorio (2026-10-13), «como Google Contacts y mucho mejor
 * todavía» (Edison, con capturas de los Contactos de Android). Fácil, nada abrumador:
 *
 *   · arriba, «Nuevo contacto», la búsqueda y «⋮» (importar, exportar, etiquetas);
 *   · una fila de etiquetas para filtrar: Todos, Favoritos y los grupos del equipo;
 *   · la lista: avatar redondo (foto o inicial de color), nombre grande y una línea discreta
 *     (cargo · institución), con «Favoritos» arriba y encabezados por letra;
 *   · la ficha (FichaContacto): en el celular a pantalla completa, con «atrás» que la cierra; en
 *     escritorio, al lado de la lista, a dos columnas.
 *
 * La dirección guarda lo abierto: `?contacto=ID` (la ficha) y `?nuevo=1` (el alta), así se llega
 * a un contacto desde la agenda, el mapa o un aviso. Todo se carga una vez (la página) y se filtra
 * aquí (contactos.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined'
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined'
import SearchIcon from '@mui/icons-material/Search'
import StarIcon from '@mui/icons-material/Star'
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined'
import { api, descargarArchivo } from '../../api'
import { PALETA } from '../../paleta'
import { PERS_VACIA, type Institucion, type Persona } from '../../directorio'
import BarraModulo, { type AccionSecundaria } from '../BarraModulo'
import AvatarContacto from './AvatarContacto'
import FichaContacto from './FichaContacto'
import FormularioContacto from './FormularioContacto'
import ImportarContactos from './ImportarContactos'
import { agrupar, etiquetasEnUso, filtrar, lineaSecundaria, plano } from './contactos'

const POR_PAGINA = 200

function FilaContacto({ p, inst, elegido, alElegir }: { p: Persona; inst?: Institucion; elegido: boolean; alElegir: () => void }) {
  const linea = lineaSecundaria(p, inst)
  return (
    <ButtonBase
      onClick={alElegir}
      aria-current={elegido || undefined}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.75, width: '100%', justifyContent: 'flex-start', textAlign: 'left',
        px: { xs: 1.5, sm: 2 }, py: 1, borderRadius: { md: 2 }, opacity: p.activo ? 1 : 0.55,
        bgcolor: elegido ? PALETA.guindaSuave : 'transparent', '&:hover': { bgcolor: elegido ? PALETA.guindaSuave : 'action.hover' },
      }}
    >
      <AvatarContacto id={p.id} nombre={p.nombre} foto={p.foto} usuarioId={p.usuario_id} tamano={44} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 16, lineHeight: 1.3, color: 'text.primary' }} noWrap>{p.nombre}</Typography>
        {linea && <Typography sx={{ fontSize: 13.5, lineHeight: 1.35, color: 'text.secondary' }} noWrap>{linea}</Typography>}
      </Box>
    </ButtonBase>
  )
}

function Encabezado({ titulo }: { titulo: string }) {
  const favoritos = titulo === 'Favoritos'
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: { xs: 1.5, sm: 2 }, pt: 1.75, pb: 0.5 }}>
      {favoritos && <StarIcon sx={{ fontSize: 16, color: PALETA.dorado }} />}
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: favoritos ? PALETA.dorado : PALETA.guinda, letterSpacing: 0.2 }}>{titulo}</Typography>
    </Box>
  )
}

/** Renombrar o quitar etiquetas (en todas las personas que la llevan). */
function DialogoEtiquetas({ abierto, etiquetas, alCerrar, alCambiar }: {
  abierto: boolean
  etiquetas: { nombre: string; n: number }[]
  alCerrar: () => void
  alCambiar: (texto: string) => void
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState('')
  const [error, setError] = useState('')
  const renombrar = async (de: string, a: string) => {
    setError('')
    try {
      const r = await api<{ personas: number }>('/api/directorio/etiquetas/renombrar', { method: 'POST', body: JSON.stringify({ de, a }) })
      setEditando(null)
      alCambiar(a ? `Etiqueta «${de}» renombrada a «${a}» (${r.personas}).` : `Etiqueta «${de}» quitada de ${r.personas} contacto(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la etiqueta.')
    }
  }
  return (
    <Dialog open={abierto} onClose={alCerrar} fullWidth maxWidth="xs">
      <DialogTitle>Etiquetas</DialogTitle>
      <DialogContent dividers sx={{ px: 0 }}>
        {etiquetas.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3 }}>
            Aún no hay etiquetas. Póngalas al editar un contacto («Ver más» → Etiquetas): Prensa, Comisión de Educación, Gobierno regional…
          </Typography>
        )}
        {etiquetas.map((e) => (
          <Box key={e.nombre} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5 }}>
            {editando === e.nombre ? (
              <>
                <TextField size="small" autoFocus value={nuevo} onChange={(x) => setNuevo(x.target.value)} sx={{ flex: 1 }} inputProps={{ maxLength: 40, 'aria-label': 'Nuevo nombre' }}
                  onKeyDown={(x) => { if (x.key === 'Enter' && nuevo.trim()) void renombrar(e.nombre, nuevo.trim()) }} />
                <Button size="small" onClick={() => void renombrar(e.nombre, nuevo.trim())} disabled={!nuevo.trim()}>Guardar</Button>
              </>
            ) : (
              <>
                <LabelOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                <Typography sx={{ flex: 1, minWidth: 0 }} noWrap>{e.nombre}</Typography>
                <Typography variant="caption" color="text.secondary">{e.n}</Typography>
                <Button size="small" onClick={() => { setEditando(e.nombre); setNuevo(e.nombre) }}>Renombrar</Button>
                <Tooltip title="Quitar la etiqueta de todos">
                  <IconButton size="small" onClick={() => void renombrar(e.nombre, '')} aria-label={`Quitar la etiqueta ${e.nombre}`}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        ))}
        {error && <Typography variant="caption" color="error" sx={{ px: 2 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions><Button onClick={alCerrar}>Cerrar</Button></DialogActions>
    </Dialog>
  )
}

export default function VistaContactos({
  personas,
  porId,
  todas,
  esAdmin,
  masAcciones,
  alRecargar,
  alActualizar,
  alAvisar,
  alVerInstitucion,
  alDesactivar,
}: {
  personas: Persona[] | null
  porId: Map<number, Institucion>
  /** Instituciones activas (selector del formulario). */
  todas: Institucion[]
  esAdmin: boolean
  /** Acciones del Directorio que van también en «⋮» (mesas que faltan, importar de marcadores). */
  masAcciones: (AccionSecundaria | false)[]
  alRecargar: () => void
  /** Reemplaza una persona en la lista cargada (tras guardar o marcar favorito). */
  alActualizar: (p: Persona) => void
  alAvisar: (tipo: 'success' | 'error' | 'warning', texto: string) => void
  alVerInstitucion: (id: number) => void
  alDesactivar: (p: Persona) => void
}) {
  const tema = useTheme()
  const ancha = useMediaQuery(tema.breakpoints.up('md'))
  const navegar = useNavigate()
  const [consulta, setConsulta] = useSearchParams()
  const invitado = localStorage.getItem('sgdp_rol') === 'invitado'
  const [q, setQ] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [soloFavoritos, setSoloFavoritos] = useState(false)
  const [inactivos, setInactivos] = useState(false)
  const [cuantos, setCuantos] = useState(POR_PAGINA)
  const [editar, setEditar] = useState<Persona | null>(null)
  const [importar, setImportar] = useState(false)
  const [gestionar, setGestionar] = useState(false)
  // ¿La ficha se abrió desde la lista en esta pantalla? Entonces «atrás» vuelve a la lista.
  const abiertaAqui = useRef(false)
  useEffect(() => setCuantos(POR_PAGINA), [q, etiqueta, soloFavoritos, inactivos])

  const idAbierto = Number(consulta.get('contacto')) || null
  const abierto = idAbierto ? (personas ?? []).find((p) => p.id === idAbierto) ?? null : null

  // `?nuevo=1` (desde el botón del módulo o Inicio): abre el alta y limpia la dirección.
  useEffect(() => {
    if (consulta.get('nuevo') === '1' && !invitado) {
      setEditar({ ...PERS_VACIA })
      const c = new URLSearchParams(consulta)
      c.delete('nuevo')
      setConsulta(c, { replace: true })
    }
  }, [consulta, setConsulta, invitado])

  const nombreInst = (id: number | null) => {
    const i = id ? porId.get(id) : undefined
    return i ? `${i.nombre} ${i.siglas}` : ''
  }
  const activos = useMemo(() => (personas ?? []).filter((p) => p.activo), [personas])
  const etiquetas = useMemo(() => etiquetasEnUso(personas ?? []), [personas])
  const nFavoritos = activos.filter((p) => p.favorito).length
  const nInactivos = (personas?.length ?? 0) - activos.length
  const lista = useMemo(
    () => filtrar((personas ?? []).filter((p) => (inactivos ? !p.activo : p.activo)), { q, etiqueta, soloFavoritos }, nombreInst),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personas, q, etiqueta, soloFavoritos, inactivos, porId],
  )
  // Favoritos arriba solo en la vista completa (sin búsqueda ni filtro), como Google.
  const grupos = useMemo(() => agrupar(lista, !q.trim() && !etiqueta && !soloFavoritos && !inactivos), [lista, q, etiqueta, soloFavoritos, inactivos])
  // Paginar por filas pintadas, no por grupos.
  let restantes = cuantos
  const gruposVisibles = grupos.map((g) => {
    const c = g.contactos.slice(0, Math.max(0, restantes))
    restantes -= c.length
    return { ...g, contactos: c }
  }).filter((g) => g.contactos.length)
  const pintadas = cuantos - Math.max(0, restantes)
  const totalFilas = grupos.reduce((s, g) => s + g.contactos.length, 0)

  const abrir = (p: Persona) => {
    const c = new URLSearchParams(consulta)
    c.set('contacto', String(p.id))
    abiertaAqui.current = !ancha
    setConsulta(c, { replace: ancha })
  }
  const cerrar = () => {
    if (abiertaAqui.current) {
      abiertaAqui.current = false
      navegar(-1)
      return
    }
    const c = new URLSearchParams(consulta)
    c.delete('contacto')
    setConsulta(c, { replace: true })
  }

  const favorito = async (p: Persona, valor: boolean) => {
    alActualizar({ ...p, favorito: valor })
    try {
      await api(`/api/directorio/personas/${p.id}/favorito`, { method: 'PUT', body: JSON.stringify({ favorito: valor }) })
    } catch (e) {
      alActualizar({ ...p, favorito: !valor })
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo guardar el favorito.')
    }
  }

  const exportar = async () => {
    const params = new URLSearchParams()
    if (etiqueta) params.set('etiqueta', etiqueta)
    if (soloFavoritos) params.set('favoritos', 'true')
    if (q.trim()) params.set('ids', lista.map((p) => p.id).join(','))
    try {
      await descargarArchivo(`/api/directorio/contactos/exportar?${params}`, `contactos${etiqueta ? `-${plano(etiqueta).replace(/[^a-z0-9ñ]+/g, '-')}` : ''}.vcf`)
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo exportar.')
    }
  }

  const ficha = abierto && (
    <FichaContacto
      p={abierto}
      inst={abierto.institucion_id ? porId.get(abierto.institucion_id) : undefined}
      esAdmin={esAdmin}
      alEditar={() => setEditar({ ...abierto })}
      alFavorito={(v) => void favorito(abierto, v)}
      alVerInstitucion={alVerInstitucion}
      alDesactivar={() => alDesactivar(abierto)}
      alEtiqueta={(e) => { setEtiqueta(e); setSoloFavoritos(false); if (!ancha) cerrar() }}
      alCerrar={ancha ? undefined : cerrar}
      alAvisar={alAvisar}
    />
  )

  const cargando = personas === null
  const filtrando = Boolean(q.trim() || etiqueta || soloFavoritos || inactivos)

  return (
    <Box>
      <BarraModulo
        mb={1}
        alActualizar={alRecargar}
        principal={!invitado && (
          <Button variant="contained" disableElevation startIcon={<PersonAddAltOutlinedIcon />} onClick={() => setEditar({ ...PERS_VACIA })} sx={{ whiteSpace: 'nowrap', borderRadius: 5, px: 2 }}>
            Nuevo contacto
          </Button>
        )}
        mas={[
          !invitado && { etiqueta: 'Importar contactos (.vcf, .csv)', icono: <UploadFileOutlinedIcon fontSize="small" />, alPulsar: () => setImportar(true) },
          !invitado && { etiqueta: etiqueta ? `Exportar «${etiqueta}» (.vcf)` : filtrando ? 'Exportar lo filtrado (.vcf)' : 'Exportar todos (.vcf)', icono: <FileDownloadOutlinedIcon fontSize="small" />, alPulsar: () => void exportar() },
          !invitado && { etiqueta: 'Etiquetas', icono: <LabelOutlinedIcon fontSize="small" />, alPulsar: () => setGestionar(true) },
          ...masAcciones,
        ]}
      >
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <TextField
            fullWidth
            type="search"
            size="small"
            placeholder="Buscar contactos"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 6, bgcolor: 'background.paper', height: 44 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: q ? <IconButton size="small" onClick={() => setQ('')} aria-label="Limpiar la búsqueda"><CloseIcon fontSize="small" /></IconButton> : undefined,
            }}
            inputProps={{ 'aria-label': 'Buscar contactos por nombre, cargo, institución, celular, correo o etiqueta' }}
          />
        </Box>
      </BarraModulo>

      {/* Filtros: Todos, Favoritos y las etiquetas (grupos), en una fila que se desliza. */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
        <Chip label="Todos" onClick={() => { setEtiqueta(''); setSoloFavoritos(false); setInactivos(false) }}
          color={!etiqueta && !soloFavoritos && !inactivos ? 'primary' : 'default'} variant={!etiqueta && !soloFavoritos && !inactivos ? 'filled' : 'outlined'}
          sx={{ flexShrink: 0, bgcolor: !etiqueta && !soloFavoritos && !inactivos ? undefined : 'background.paper' }} />
        {nFavoritos > 0 && (
          <Chip icon={<StarIcon sx={{ fontSize: 16 }} />} label={`Favoritos · ${nFavoritos}`} onClick={() => { setSoloFavoritos((v) => !v); setEtiqueta(''); setInactivos(false) }}
            color={soloFavoritos ? 'primary' : 'default'} variant={soloFavoritos ? 'filled' : 'outlined'} sx={{ flexShrink: 0, bgcolor: soloFavoritos ? undefined : 'background.paper' }} />
        )}
        {etiquetas.map((e) => {
          const activa = plano(etiqueta) === plano(e.nombre)
          return (
            <Chip key={e.nombre} icon={<LabelOutlinedIcon sx={{ fontSize: 16 }} />} label={`${e.nombre} · ${e.n}`}
              onClick={() => { setEtiqueta(activa ? '' : e.nombre); setSoloFavoritos(false); setInactivos(false) }}
              color={activa ? 'primary' : 'default'} variant={activa ? 'filled' : 'outlined'} sx={{ flexShrink: 0, bgcolor: activa ? undefined : 'background.paper' }} />
          )
        })}
        {nInactivos > 0 && (
          <Chip label={`Inactivos · ${nInactivos}`} onClick={() => { setInactivos((v) => !v); setEtiqueta(''); setSoloFavoritos(false) }}
            color={inactivos ? 'primary' : 'default'} variant={inactivos ? 'filled' : 'outlined'} sx={{ flexShrink: 0, bgcolor: inactivos ? undefined : 'background.paper' }} />
        )}
      </Box>

      {cargando && <LinearProgress sx={{ mb: 2 }} />}
      {!cargando && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(320px, 420px) minmax(0, 1fr)' }, gap: { md: 2.5 }, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0, mx: { xs: -1.5, sm: 0 } }}>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ px: { xs: 1.5, sm: 2 }, mb: 0.25 }}>
              {lista.length.toLocaleString('es-PE')} contacto{lista.length === 1 ? '' : 's'}
              {etiqueta ? ` con la etiqueta «${etiqueta}»` : ''}{soloFavoritos ? ' favoritos' : ''}{inactivos ? ' inactivos' : ''}
            </Typography>
            <Box sx={{ maxHeight: { md: 'calc(100dvh - 260px)' }, overflowY: { md: 'auto' }, pr: { md: 0.5 } }}>
              {gruposVisibles.map((g) => (
                <Box key={g.clave} component="section" aria-label={g.titulo}>
                  <Encabezado titulo={g.titulo} />
                  {g.contactos.map((p) => (
                    <FilaContacto key={`${g.clave}-${p.id}`} p={p} inst={p.institucion_id ? porId.get(p.institucion_id) : undefined}
                      elegido={ancha && abierto?.id === p.id} alElegir={() => abrir(p)} />
                  ))}
                </Box>
              ))}
              {lista.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {filtrando ? 'Nadie coincide con la búsqueda o el filtro.' : 'Aún no hay contactos.'}
                  </Typography>
                  {!filtrando && !invitado && (
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 1.5, flexWrap: 'wrap' }}>
                      <Button variant="outlined" onClick={() => setEditar({ ...PERS_VACIA })}>Nuevo contacto</Button>
                      <Button variant="outlined" onClick={() => setImportar(true)}>Importar contactos</Button>
                    </Box>
                  )}
                </Box>
              )}
              {pintadas < totalFilas && (
                <Button fullWidth onClick={() => setCuantos((n) => n + POR_PAGINA)} sx={{ mt: 1 }}>
                  Mostrar más ({pintadas.toLocaleString('es-PE')} de {totalFilas.toLocaleString('es-PE')})
                </Button>
              )}
            </Box>
          </Box>
          {ancha && (
            <Box sx={{ minWidth: 0, position: 'sticky', top: 12, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              {ficha || (
                <Box sx={{ p: 5, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Elija un contacto para ver su ficha.</Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* En el celular y la tableta, la ficha a pantalla completa. */}
      {!ancha && (
        <Dialog open={Boolean(abierto)} onClose={cerrar} fullScreen PaperProps={{ sx: { bgcolor: PALETA.fondo } }}>
          {ficha}
        </Dialog>
      )}

      <FormularioContacto
        inicial={editar}
        todas={todas}
        personas={personas ?? []}
        etiquetas={etiquetas.map((e) => e.nombre)}
        alCerrar={() => setEditar(null)}
        alAbrirOtra={(x) => { setEditar(null); abrir(x) }}
        alGuardado={(p, nuevo) => {
          setEditar(null)
          alActualizar(p)
          alAvisar('success', nuevo ? `«${p.nombre}» agregado a los contactos.` : 'Contacto guardado.')
          alRecargar()
          if (nuevo) abrir(p)
        }}
      />
      <ImportarContactos abierto={importar} alCerrar={() => setImportar(false)} alTerminar={(t) => { setImportar(false); alAvisar('success', t); alRecargar() }} />
      <DialogoEtiquetas abierto={gestionar} etiquetas={etiquetas} alCerrar={() => setGestionar(false)} alCambiar={(t) => { alAvisar('success', t); alRecargar() }} />
    </Box>
  )
}

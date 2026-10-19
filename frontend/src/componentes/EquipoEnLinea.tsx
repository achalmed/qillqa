/**
 * EQUIPO EN LÍNEA (Edison 2026-10-01: «una función similar a Messenger: poner
 * en línea a las personas que están trabajando en el sistema»).
 *
 * En la barra superior, junto a la campana: las iniciales de quienes están
 * trabajando AHORA, cada una con su punto de estado —verde en línea, ámbar
 * ausente—, y un clic abre la lista completa del equipo con qué documento
 * tiene abierto cada uno y cuándo se le vio por última vez. Sin colores
 * chillones: el punto señala, como en las etiquetas de estado.
 *
 * El mismo componente MANDA el latido de esta pestaña (cada 30 s y al
 * mostrarla u ocultarla; api/presencia.py) y recibe la lista en la misma
 * respuesta: no hay un segundo sondeo. En el editor recibe `documentoId` y,
 * además, avisa quién más tiene abierto ESE documento — el caso que termina
 * en «este documento fue guardado desde otro lugar».
 */
import { useCallback, useEffect, useState } from 'react'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import { PALETA } from '../paleta'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Popover from '@mui/material/Popover'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Switch from '@mui/material/Switch'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import {
  avisoActivo, campanilla, esAdministrador, fijarAviso, llegadas, notificarEscritorio,
  pedirPermisoEscritorio, textoLlegada, yaAnunciado,
} from '../avisoLlegadas'
import { abrirTarjeta, useFotoDe } from './perfil/fotos'
import { publicarCuenta, registrarApertura } from '../actividad'

export interface Persona {
  id: number
  nombre: string
  cargo: string
  rol: string
  yo: boolean
  estado: 'en_linea' | 'ausente' | 'desconectado'
  /** Apagó «mostrar mi estado» (solo llega al administrador y a ella misma). */
  oculto?: boolean
  ultima_actividad: string | null
  documento_id: number | null
  documento: string
  proyecto_id?: number | null
  proyecto?: string
  seccion?: string
  seccion_titulo?: string
}

/** Dónde trabaja esta pestaña dentro de un proyecto (para la presencia). */
export interface LugarProyecto {
  proyecto_id: number
  seccion?: string
}

// En línea en verde; ausente y desconectado en los grises de la marca (paleta.ts): no son avisos.
const COLOR = { en_linea: PALETA.exito, ausente: PALETA.apagado, desconectado: PALETA.bordeFuerte } as const
const ETIQUETA = { en_linea: 'En línea', ausente: 'Ausente', desconectado: 'Desconectado' } as const
const LATIDO_MS = 30_000

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const a = partes[0][0] ?? ''
  // Nombre + primer apellido («María Quispe Rojas» → MQ), no dos nombres.
  const b = partes.length >= 3 ? partes[partes.length - 2][0] : partes[1]?.[0] ?? ''
  return (a + b).toUpperCase()
}

/** «hace 3 min», «hace 2 h», «ayer», «el 28/09». */
export function haceCuanto(iso: string | null, ahora = Date.now()): string {
  if (!iso) return 'sin actividad registrada'
  const s = Math.max(0, (ahora - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  if (s < 2 * 86400) return 'ayer'
  return `el ${new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })}`
}

/** Latido de esta pestaña + lista del equipo. */
export function usePresencia(documentoId?: number, lugar?: LugarProyecto, activo = true): Persona[] {
  const [equipo, setEquipo] = useState<Persona[]>([])
  const latir = useCallback(() => {
    if (!activo || !localStorage.getItem('sgdp_token')) return
    api<Persona[]>('/api/presencia', {
      method: 'POST',
      body: JSON.stringify({
        documento_id: documentoId ?? null,
        visible: !document.hidden,
        proyecto_id: lugar?.proyecto_id ?? null,
        seccion: lugar?.seccion ?? '',
      }),
    })
      .then((lista) => {
        setEquipo(lista)
        // El rol puede haber cambiado desde el último inicio de sesión (lo
        // cambia el administrador): la pantalla lo adopta sin volver a entrar.
        const yo = lista.find((p) => p.yo)
        if (yo && yo.rol && localStorage.getItem('sgdp_rol') !== yo.rol) {
          localStorage.setItem('sgdp_rol', yo.rol)
        }
      })
      .catch(() => {})
  }, [documentoId, lugar?.proyecto_id, lugar?.seccion, activo])
  useEffect(() => {
    latir()
    const t = window.setInterval(latir, LATIDO_MS)
    document.addEventListener('visibilitychange', latir)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', latir)
    }
  }, [latir])
  return equipo
}

function Punto({ estado, borde }: { estado: Persona['estado']; borde: string }) {
  return (
    <Box
      component="span"
      sx={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        bgcolor: COLOR[estado],
        border: `1.5px solid ${borde}`,
        display: 'block',
      }}
    />
  )
}

function Inicial({ p, tam = 26, borde = PALETA.superficie }: { p: Persona; tam?: number; borde?: string }) {
  // La foto de perfil, si la tiene (2026-10-12); si no, las iniciales.
  const foto = useFotoDe(p.id)
  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      badgeContent={p.estado === 'desconectado' ? null : <Punto estado={p.estado} borde={borde} />}
    >
      <Avatar
        src={foto ?? undefined}
        sx={{
          width: tam,
          height: tam,
          fontSize: tam * 0.42,
          fontWeight: 600,
          bgcolor: PALETA.superficieMedia,
          color: p.estado === 'desconectado' ? PALETA.textoTenue : 'text.primary',
        }}
      >
        {iniciales(p.nombre)}
      </Avatar>
    </Badge>
  )
}

export default function EquipoEnLinea({
  documentoId,
  lugar,
  equipoExterno,
}: {
  documentoId?: number
  lugar?: LugarProyecto
  /** Si la página ya late (p. ej. el proyecto, que necesita la lista), se
   *  pasa aquí para no mandar dos latidos. */
  equipoExterno?: Persona[]
}) {
  const propio = usePresencia(documentoId, lugar, !equipoExterno)
  const equipo = equipoExterno ?? propio
  const navegar = useNavigate()
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const activos = equipo.filter((p) => p.estado !== 'desconectado' && !p.yo)
  const enLinea = equipo.filter((p) => p.estado === 'en_linea').length
  // El botón único del celular (src/actividad.ts): la cuenta y cómo abrir esta lista.
  useEffect(() => { publicarCuenta('equipo', enLinea) }, [enLinea])
  useEffect(() => { registrarApertura('equipo', (a) => setAncla(a)); return () => registrarApertura('equipo', null) }, [])
  const aqui = documentoId ? activos.filter((p) => p.documento_id === documentoId) : []
  const visibles = activos.slice(0, 4)

  // Aviso de llegadas: solo la cuenta administradora (avisoLlegadas.ts).
  const admin = esAdministrador()
  const [conAviso, setConAviso] = useState(avisoActivo)
  const [llegada, setLlegada] = useState('')
  useEffect(() => {
    if (!admin || equipo.length === 0) return
    const nuevos = llegadas(equipo)
    if (nuevos.length === 0 || !avisoActivo() || yaAnunciado(nuevos)) return
    const texto = textoLlegada(nuevos)
    campanilla()
    setLlegada(texto)
    notificarEscritorio(texto)
  }, [admin, equipo])

  return (
    <>
      {aqui.length > 0 && (
        <Tooltip
          title={`${aqui.map((p) => p.nombre).join(', ')} también ${aqui.length > 1 ? 'tienen' : 'tiene'} abierto este documento. Guarden por turnos para no pisarse.`}
        >
          <Chip
            size="small"
            label={`También aquí: ${aqui.map((p) => p.nombre.split(' ')[0]).join(', ')}`}
            sx={{ display: { xs: 'none', md: 'inline-flex' }, mr: 1, height: 22, fontSize: 12 }}
          />
        </Tooltip>
      )}
      <Tooltip title={`Equipo: ${enLinea} en línea. Clic para ver quién está trabajando.`}>
        <ButtonBase
          onClick={(e) => setAncla(e.currentTarget)}
          aria-label="Equipo en línea"
          sx={{ borderRadius: 14, px: 0.75, py: 0.25, mr: 0.5, gap: 0.75, '&:hover': { bgcolor: 'action.hover' } }}
        >
          {visibles.length > 0 ? (
            <Box sx={{ display: 'flex', '& > *:not(:first-of-type)': { ml: -0.75 }, '& > *:nth-of-type(n+3)': { display: { xs: 'none', sm: 'flex' } } }}>
              {visibles.map((p) => (
                <Inicial key={p.id} p={p} tam={24} borde={PALETA.superficie} />
              ))}
            </Box>
          ) : null}
          {/* En el celular, solo los rostros o un icono con el número: el texto no cabe. */}
          {visibles.length === 0 && (
            <Badge badgeContent={enLinea} color="success" sx={{ display: { xs: 'inline-flex', sm: 'none' }, '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16 } }}>
              <GroupsOutlinedIcon sx={{ fontSize: 22 }} />
            </Badge>
          )}
          <Typography component="span" sx={{ fontSize: 12.5, color: 'inherit', whiteSpace: 'nowrap', display: { xs: 'none', sm: 'inline' } }}>
            {activos.length > visibles.length ? `+${activos.length - visibles.length} · ` : ''}
            {enLinea} en línea
          </Typography>
        </ButtonBase>
      </Tooltip>
      <Popover
        open={ancla !== null}
        anchorEl={ancla}
        onClose={() => setAncla(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 320, maxWidth: 'calc(100vw - 24px)', maxHeight: '70vh', py: 1 } } }}
      >
        <Typography variant="subtitle2" sx={{ px: 2, pb: 0.5 }}>
          Equipo de la entidad
        </Typography>
        {admin && (
          <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pb: 0.5 }}>
            <Tooltip title="Solo en su cuenta: un tono suave cuando alguien entra a Qillqa. Nadie más lo oye ni lo ve.">
              <FormControlLabel
                sx={{ flex: 1, mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
                control={
                  <Switch
                    size="small"
                    checked={conAviso}
                    onChange={(e) => {
                      fijarAviso(e.target.checked)
                      setConAviso(e.target.checked)
                      if (e.target.checked) {
                        pedirPermisoEscritorio()
                        campanilla()
                      }
                    }}
                  />
                }
                label="Avisarme cuando alguien entre"
              />
            </Tooltip>
            <Button size="small" onClick={() => campanilla()} sx={{ minWidth: 0, fontSize: 12 }}>
              Probar
            </Button>
          </Box>
        )}
        {(['en_linea', 'ausente', 'desconectado'] as const).map((estado) => {
          const grupo = equipo.filter((p) => p.estado === estado)
          if (grupo.length === 0) return null
          return (
            <Box key={estado}>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="caption" sx={{ px: 2, color: COLOR[estado], fontWeight: 600 }}>
                {ETIQUETA[estado]} ({grupo.length})
              </Typography>
              {grupo.map((p) => (
                <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 0.6 }}>
                  {/* La foto y el nombre abren la tarjeta de contacto (2026-10-12). */}
                  <Box onClick={() => { setAncla(null); abrirTarjeta(p.id) }} sx={{ display: 'flex', cursor: 'pointer' }}>
                    <Inicial p={p} />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap onClick={() => { setAncla(null); abrirTarjeta(p.id) }} sx={{ fontWeight: p.yo ? 600 : 400, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                      {p.nombre}
                      {p.oculto && <Box component="span" title="Apagó «mostrar mi estado»: los demás la ven desconectada" sx={{ ml: 0.75, fontSize: 11, color: 'text.secondary' }}>oculta</Box>}
                      {p.yo ? ' (usted)' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {estado === 'desconectado'
                        ? `Visto ${haceCuanto(p.ultima_actividad)}`
                        : p.proyecto
                          ? `En ${p.proyecto}${p.seccion_titulo ? ` · ${p.seccion_titulo}` : ''}`
                          : p.documento
                            ? 'En '
                            : p.cargo || 'En la bandeja'}
                      {estado !== 'desconectado' && p.documento && (
                        <Box
                          component="span"
                          onClick={() => {
                            setAncla(null)
                            if (p.documento_id) navegar(`/documentos/${p.documento_id}`)
                          }}
                          sx={{ color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                        >
                          {p.documento}
                        </Box>
                      )}
                      {estado === 'ausente' && ` · ${haceCuanto(p.ultima_actividad)}`}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )
        })}
      </Popover>
      <Snackbar
        open={llegada !== ''}
        autoHideDuration={8000}
        onClose={() => setLlegada('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity="info" variant="filled" onClose={() => setLlegada('')} sx={{ bgcolor: PALETA.texto }}>
          {llegada}
        </Alert>
      </Snackbar>
    </>
  )
}

/**
 * UNA SEMANA DE REPRESENTACIÓN: el lugar donde se registra y se informa
 * (Edison 2026-10-02: «no se trata simplemente de mover el botón de un módulo a
 * otro; la Semana de Representación es el lugar donde se registra la
 * información y también donde se construye y genera su informe final»).
 *
 * El recorrido sigue el orden del trabajo real: datos de la semana y días →
 * actividades → pedidos → fotos → textos del informe → generar, aprobar y
 * registrar el ISR. Cada sección se monta una vez y se oculta (no se desmonta)
 * para no perder lo que se está escribiendo al cambiar de pestaña.
 */
import { useCallback, useEffect, useState } from 'react'
import { PALETA } from '../paleta'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import LinearProgress from '@mui/material/LinearProgress'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import DirectionsWalkOutlinedIcon from '@mui/icons-material/DirectionsWalkOutlined'
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import { api } from '../api'
import { Etiquetas, ProveedorSala, useSala } from '../componentes/Presencia'
import Marco, { type OpcionPagina } from '../componentes/Marco'
import DatosSemana from '../componentes/semana/DatosSemana'
import Actividades from '../componentes/semana/Actividades'
import Pedidos from '../componentes/semana/Pedidos'
import Fotos from '../componentes/semana/Fotos'
import TextosInforme from '../componentes/semana/TextosInforme'
import { OrigenCitas } from '../componentes/semana/AreaMarkdown'
import GenerarInforme from '../componentes/semana/GenerarInforme'
import { type Avisar, type SemanaDetalle, type Vocabularios, temaDe } from '../componentes/semana/modelo'
import { textoDeMensaje } from '../pegar'

const SECCIONES = ['datos', 'actividades', 'pedidos', 'fotos', 'textos', 'informe'] as const
type Seccion = (typeof SECCIONES)[number]

export default function SemanaSR() {
  const { id } = useParams()
  const [consulta, setConsulta] = useSearchParams()
  const seccion: Seccion = (SECCIONES as readonly string[]).includes(consulta.get('ver') ?? '') ? (consulta.get('ver') as Seccion) : 'textos'
  const [s, setS] = useState<SemanaDetalle | null>(null)
  const [voc, setVoc] = useState<Vocabularios | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error' | 'info'; texto: string } | null>(null)
  // El rol lo deja el login (navegacion.ts: esAdmin); el servidor vuelve a comprobarlo.
  const rol = localStorage.getItem('sgdp_rol') ?? ''
  const [vistas, setVistas] = useState<Set<Seccion>>(new Set([seccion]))
  // `?pegar=<id de mensaje>` (chat): el registro de la jornada se lee solo en Actividades.
  const [textoPegar, setTextoPegar] = useState('')
  // «Nueva semana» desde el registro pegado (InformesSR) llega con el texto en el estado de la navegación.
  const ubicacion = useLocation()
  const irA = useNavigate()
  useEffect(() => {
    const t = (ubicacion.state as { textoPegar?: string } | null)?.textoPegar
    if (!t) return
    setTextoPegar(t)
    // Se consume una vez: recargar la página no vuelve a abrir el pegado.
    irA(`${ubicacion.pathname}${ubicacion.search}`, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicacion.state])
  useEffect(() => {
    const mid = Number(consulta.get('pegar') ?? '')
    if (!mid) return
    const c = new URLSearchParams(consulta)
    c.delete('pegar')
    c.set('ver', 'actividades')
    setConsulta(c, { replace: true })
    textoDeMensaje(mid).then(setTextoPegar).catch(() => setAviso({ tipo: 'error', texto: 'No se pudo traer el mensaje del chat; pegue el texto a mano.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta])

  const recargar = useCallback(async () => {
    try {
      setS(await api<SemanaDetalle>(`/api/semanas/${id}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la semana.')
    }
  }, [id])
  useEffect(() => {
    void recargar()
    api<Vocabularios>('/api/semanas/vocabularios').then(setVoc).catch((e) => setError(e instanceof Error ? e.message : 'Sin vocabularios.'))
  }, [recargar])
  useEffect(() => setVistas((v) => new Set(v).add(seccion)), [seccion])
  const avisar: Avisar = useCallback((tipo, t) => setAviso({ tipo, texto: t }), [])

  const ir = (c: Seccion) => setConsulta({ ver: c }, { replace: true })
  const etiquetas: [Seccion, string, React.ReactNode, number?][] = [
    ['datos', 'Datos de la semana', <EventNoteOutlinedIcon key="d" />],
    ['actividades', 'Actividades', <DirectionsWalkOutlinedIcon key="a" />, s?.actividades.length],
    ['pedidos', 'Pedidos', <AssignmentOutlinedIcon key="p" />, s?.pedidos.filter((p) => p.datos.estado === 'registrado').length],
    ['fotos', 'Fotos', <PhotoLibraryOutlinedIcon key="f" />, s?.fotos.filter((f) => f.datos.estado === 'revisar').length],
    ['textos', 'Textos del informe', <ArticleOutlinedIcon key="t" />, s?.pendientes.length],
    ['informe', 'Generar informe', <PictureAsPdfOutlinedIcon key="i" />],
  ]
  const opciones: OpcionPagina[] = etiquetas.map(([clave, etiqueta, icono, contador]) => ({
    clave, etiqueta, icono, contador, activa: seccion === clave, alPulsar: () => ir(clave),
  }))
  // La rendición de cuentas de esta semana (2026-10-18): abre la suya o la crea con la semana.
  if (rol !== 'invitado') {
    opciones.push({ clave: 'rendicion', etiqueta: 'Rendición', icono: <ReceiptLongOutlinedIcon />, activa: false, alPulsar: () => irA(`/rendiciones?semana=${id}`) })
  }
  const tema = s ? temaDe(s) : ''
  // Sala de presencia: etiquetas con el nombre de quien escribe en cada campo.
  const sala = useSala(id ? `sala:sr:${id}` : null)

  return (
    <Marco modulo="representacion" titulo={s ? `${s.codigo} · ${tema}` : 'Semana'} volver="/informes" opciones={opciones} fondo={PALETA.fondo}>
      <ProveedorSala sala={sala}>
      {/* Las citas escritas en los textos son relaciones de ESTA semana (AreaMarkdown). */}
      <OrigenCitas.Provider value={id ? `sr:${id}` : null}>
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: { xs: 1.5, sm: 2.5 }, maxWidth: 1500, width: '100%', mx: 'auto' }}>
        {sala.presentes.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, fontSize: 13, color: 'text.secondary' }}>
            También en esta semana: <Etiquetas personas={sala.presentes} />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {(!s || !voc) && !error && <LinearProgress />}
        {s && voc && SECCIONES.filter((c) => vistas.has(c)).map((c) => {
          const props = { s, voc, recargar, avisar }
          return (
            <Box key={c} sx={{ display: c === seccion ? 'block' : 'none' }}>
              {c === 'datos' && <DatosSemana {...props} />}
              {c === 'actividades' && <Actividades {...props} textoPegar={textoPegar} alConsumirPegar={() => setTextoPegar('')} />}
              {c === 'pedidos' && <Pedidos {...props} />}
              {c === 'fotos' && <Fotos {...props} />}
              {c === 'textos' && <TextosInforme {...props} />}
              {c === 'informe' && <GenerarInforme {...props} puedeAprobar={rol === 'administrador' || rol === 'diputado'} />}
            </Box>
          )
        })}
      </Box>
      </OrigenCitas.Provider>
      </ProveedorSala>
      <Snackbar open={aviso !== null} autoHideDuration={5000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {aviso ? <Alert severity={aviso.tipo} onClose={() => setAviso(null)} variant="filled">{aviso.texto}</Alert> : undefined}
      </Snackbar>
    </Marco>
  )
}

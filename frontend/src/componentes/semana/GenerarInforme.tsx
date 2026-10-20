/**
 * Generar el informe DESDE lo registrado: el servidor valida, exporta los YAML
 * al expediente y lanza el generador del marco en segundo plano (tarda minutos);
 * aquí se sigue el avance y se lee el PDF. Aprobar fija la versión (1.0, 1.1…),
 * genera la versión limpia y la registra en la gestión documental como el ISR de
 * la semana (serie ISR), donde siguen la firma, el cargo y el STD.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ForwardToInboxOutlinedIcon from '@mui/icons-material/ForwardToInboxOutlined'
import { ErrorApi, api } from '../../api'
import VisorPdf from '../VisorPdf'
import { Bloque, Titulo } from '../Estilo'
import { type Generacion, type PropsSeccion, texto, archivosSemana } from './modelo'
import { confirmar } from '../Dialogos'

export default function GenerarInforme({ s, recargar, avisar, puedeAprobar }: PropsSeccion & { puedeAprobar: boolean }) {
  const navegar = useNavigate()
  const ancha = useMediaQuery(useTheme().breakpoints.up('md'))
  const [g, setG] = useState<Generacion | null>(s.generacion)
  const [errores, setErrores] = useState<string[]>([])
  const [aprobar, setAprobar] = useState(false)
  const [creandoOficio, setCreandoOficio] = useState(false)
  const oficioPresentacion = async () => {
    setCreandoOficio(true)
    try {
      const r = await api<{ documento_id: number; ya_existia: boolean; sin_pdf?: boolean }>(`/api/referencias/semanas/${s.id}/oficio-presentacion`, { method: 'POST' })
      avisar('success', r.ya_existia ? 'Ya existía; se abre.' : r.sin_pdf ? 'Oficio creado; falta PDF aprobado para adjuntar.' : 'Oficio creado con el informe adjunto.')
      navegar(`/documentos/${r.documento_id}`)
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo crear el oficio.')
    } finally {
      setCreandoOficio(false)
    }
  }
  const [version, setVersion] = useState('1.0')
  const [elegido, setElegido] = useState(s.pdfs[0]?.nombre ?? '')
  const [veces, setVeces] = useState(0)
  const [nuevaVersion, setNuevaVersion] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const enCurso = g?.estado === 'en_curso'
  useEffect(() => {
    if (!enCurso) return
    const desde = g?.inicio ? new Date(g.inicio).getTime() : Date.now()
    const t = setInterval(() => setSegundos(Math.max(0, Math.round((Date.now() - desde) / 1000))), 1000)
    return () => clearInterval(t)
  }, [enCurso, g?.inicio])

  // Mientras genera, se pregunta cada 4 s; al terminar se recarga la semana (PDF nuevo).
  useEffect(() => {
    if (!enCurso) return
    const t = setInterval(async () => {
      try {
        const r = await api<Generacion>(`/api/semanas/${s.id}/generacion`)
        setG(r)
        if (r.estado !== 'en_curso') {
          clearInterval(t)
          if (r.estado === 'listo') {
            avisar('success', r.isr ? `Informe aprobado y registrado como ${r.isr.codigo}.` : 'Informe generado.')
            if (r.pdfs?.[0]) setElegido(r.pdfs[0])
            setVeces((v) => v + 1)
          }
          await recargar()
        }
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    }, 4000)
    return () => clearInterval(t)
  }, [enCurso, s.id, avisar, recargar])

  const lanzar = async (cuerpo: object) => {
    setErrores([])
    try {
      await api(`/api/semanas/${s.id}/generar`, { method: 'POST', body: JSON.stringify(cuerpo) })
      setG({ estado: 'en_curso', inicio: new Date().toISOString() })
      setAprobar(false)
      setNuevaVersion(false)
    } catch (e) {
      const det = e instanceof ErrorApi ? (e.detalle as { errores?: string[] } | undefined) : undefined
      // Fijo en la sección (no un aviso que se va solo): suele decir qué hacer antes.
      setErrores(det?.errores ?? [e instanceof Error ? e.message : 'No se pudo generar.'])
      setAprobar(false)
    }
  }
  const registrarExistente = async (pdf: string) => {
    if (!(await confirmar(`Se registrará ${pdf} en la gestión documental como el ISR-${String(s.numero).padStart(2, '0')}, sin regenerarlo. ¿Continuar?`, { aceptar: 'Registrar' }))) return
    try {
      const r = await api<{ id: number; codigo: string }>(`/api/semanas/${s.id}/registrar-isr`, { method: 'POST', body: JSON.stringify({ pdf }) })
      avisar('success', `Registrado como ${r.codigo}.`)
      await recargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo registrar.')
    }
  }

  const estadoInf = texto(s.informe.estado)
  const versionActual = texto(s.informe.version) || '0.1'
  const aprobada = ['aprobado', 'hecho', 'publicado'].includes(estadoInf)
  const siguiente = (() => {
    const [a, b] = versionActual.split('.').map(Number)
    return Number.isFinite(a) && Number.isFinite(b) ? `${a}.${b + 1}` : '0.1'
  })()
  // Con qué versión saldrá el borrador: tras aprobar, nunca con la aprobada (el servidor
  // abre la siguiente); si no, la actual o, a pedido, la siguiente.
  const versionBorrador = aprobada || nuevaVersion ? siguiente : versionActual
  // 2026-10-06: sin `nombreBorrador`; el nombre del archivo ya no se muestra (lo dice el visor).
  // La versión aprobada a dos columnas; si solo se conserva la de una (ISR-01), esa.
  const aprobadosTodos = s.pdfs.filter((p) => p.estado === 'aprobado')
  const aprobados = aprobadosTodos.some((p) => !p.una_columna) ? aprobadosTodos.filter((p) => !p.una_columna) : aprobadosTodos
  const ruta = elegido ? `/api/informes-sr/${encodeURIComponent(s.carpeta)}/${encodeURIComponent(elegido)}` : ''

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(320px, 420px) minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
      <Box>
        <Titulo>Informe {`ISR-${String(s.numero).padStart(2, '0')}`}</Titulo>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
          <Chip size="small" label={`versión ${texto(s.informe.version) || '—'}`} />
          <Chip size="small" label={estadoInf || 'sin estado'} color={estadoInf === 'aprobado' ? 'success' : 'default'} />
          <Chip size="small" variant="outlined" label={`${s.actividades.length} actividades · ${s.pedidos.length} pedidos`} />
        </Box>
        {/* 2026-10-06: sin el texto «Al aprobarlo, el informe se registra…»; lo explica el diálogo de aprobar. */}
        {s.isr && (
          <Alert severity="success" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" startIcon={<DescriptionOutlinedIcon />} onClick={() => navegar(`/documentos/${s.isr!.id}`)}>Abrir</Button>}>
            Registrado como <b>{s.isr.codigo}</b> ({s.isr.estado.toLowerCase()}). Firma y entrega, allí.
          </Alert>
        )}
        {/* El oficio que lo presenta, ya redactado y con el informe adjunto y relacionado
            (2026-10-06): si ya existe, se abre ese. */}
        {(s.isr || aprobados.length > 0) && (
          <Button size="small" variant="outlined" startIcon={<ForwardToInboxOutlinedIcon />} disabled={creandoOficio} onClick={() => void oficioPresentacion()} sx={{ mb: 1.5 }}>
            Oficio de presentación
          </Button>
        )}

        <Box sx={{ display: 'grid', gap: 1 }}>
          <Button variant="contained" startIcon={<PlayArrowOutlinedIcon />} disabled={enCurso} onClick={() => lanzar({ edicion: 'publica', columnas: [2, 1], nueva_version: nuevaVersion })}>
            Generar borrador v{versionBorrador}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
            Incluye versión para celular.{!aprobada && versionBorrador === versionActual && s.pdfs.some((p) => p.version === versionActual) ? ` Reemplaza el borrador v${versionActual}.` : ''}
          </Typography>
          {!aprobada && (
            <FormControlLabel sx={{ mt: -1 }} control={<Checkbox size="small" checked={nuevaVersion} onChange={(e) => setNuevaVersion(e.target.checked)} />}
              label={<Typography variant="body2">Crear v{siguiente} (conserva v{versionActual})</Typography>} />
          )}
          <Button variant="outlined" disabled={enCurso} onClick={() => lanzar({ edicion: 'interna', columnas: [2] })}>
            Generar edición interna (fichas, matriz y anexos)
          </Button>
          {puedeAprobar && (
            <Button variant="outlined" color="success" startIcon={<VerifiedOutlinedIcon />} disabled={enCurso || s.pendientes.length > 0} onClick={() => setAprobar(true)}>
              Aprobar versión…
            </Button>
          )}
          {puedeAprobar && s.pendientes.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
              {s.pendientes.length === 1 ? 'Falta 1 texto' : `Faltan ${s.pendientes.length} textos`} para aprobar.{' '}
              <Button size="small" sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline', fontSize: 'inherit' }} onClick={() => navegar('?ver=textos')}>Ir a los textos</Button>
            </Typography>
          )}
          {!puedeAprobar && (
            <Typography variant="caption" color="text.secondary">Aprobar el informe corresponde al diputado o al administrador.</Typography>
          )}
          {puedeAprobar && !s.isr && aprobados.map((p) => (
            <Button key={p.nombre} size="small" onClick={() => registrarExistente(p.nombre)}>
              Registrar {p.nombre} sin regenerar
            </Button>
          ))}
        </Box>

        {enCurso && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">Generando… {segundos} s. Puede seguir en otras secciones.</Typography>
            <LinearProgress sx={{ mt: 1 }} />
          </Box>
        )}
        {errores.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>No se generó. Antes hace falta:</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{errores.map((e) => <li key={e}><Typography variant="body2">{e}</Typography></li>)}</Box>
          </Alert>
        )}
        {g?.estado === 'error' && (
          <Alert severity="error" sx={{ mt: 2, '& pre': { whiteSpace: 'pre-wrap', fontSize: 11.5, m: 0 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>El generador se detuvo:</Typography>
            <pre>{g.error}</pre>
          </Alert>
        )}
        {g?.estado === 'listo' && (g.avisos?.length ?? 0) > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Avisos del generador</Typography>
            {g.avisos!.slice(0, 12).map((a) => <Typography key={a} variant="caption" sx={{ display: 'block' }}>{a}</Typography>)}
          </Alert>
        )}

        <Bloque>
          <Titulo nivel="sub">Versiones para leer</Titulo>
          {/* 2026-10-06: «Aún no hay PDF» solo en angosto, donde no se ve el visor vacío. */}
          {!ancha && s.pdfs.length === 0 && <Typography variant="body2" color="text.secondary">Aún no hay PDF.</Typography>}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {s.pdfs.map((p) => (
              <Chip key={p.nombre} label={`v${p.version}${p.estado === 'aprobado' ? ' aprobada' : ` ${p.estado}`}${p.una_columna ? ' · celular' : ''}`} variant={p.estado === 'aprobado' ? 'filled' : 'outlined'} color={elegido === p.nombre ? 'primary' : 'default'} onClick={() => setElegido(p.nombre)} />
            ))}
          </Box>
        </Bloque>
      </Box>
      {(ancha || elegido) && (
        <Box sx={{ minWidth: 0, position: { md: 'sticky' }, top: 12 }}>
          <VisorPdf ruta={ruta} version={veces} nombre={elegido} alto={ancha ? 'calc(100vh - 200px)' : '70vh'}
            archivos={archivosSemana(s.carpeta, s.pdfs)} claveInicial={elegido}
            vacio={<Typography variant="body2" color="text.secondary">Genere el informe para leerlo aquí.</Typography>} />
        </Box>
      )}

      <Dialog open={aprobar} onClose={() => setAprobar(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Aprobar el informe</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {/* 2026-10-06: sin «Los textos deben estar completos.»; el botón no se habilita si faltan. */}
            Se generará la versión final y se registrará como ISR-{String(s.numero).padStart(2, '0')}.
          </Typography>
          <TextField label="Versión" value={version} onChange={(e) => setVersion(e.target.value)} helperText="1.0 la primera aprobada; 1.1, 1.2… las correcciones." fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAprobar(false)}>Cancelar</Button>
          <Button variant="contained" color="success" onClick={() => lanzar({ edicion: 'publica', columnas: [2, 1], aprobar: true, version })}>Aprobar y generar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

/**
 * VISOR de las fotos de la semana (2026-10-06): la foto grande y, al lado (debajo
 * en el celular), lo que el informe usa de ella —pie, actividad, estado, si va
 * en el informe, la franja del recorte en las verticales— y sus relaciones con
 * pedidos e instituciones. ←/→ pasan de foto (dentro de lo que se estaba viendo),
 * Esc cierra. Cada cambio se guarda solo (los textos, al salir del campo) por el
 * lote de una foto, que no pisa las demás claves.
 *
 * No reutiliza el visor de la Fototeca: aquel edita la ficha de la Fototeca
 * (título, personas, álbum…) y este, la fila de la semana que lee el generador.
 */
import { useEffect, useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined'
import { Link as EnlaceRuta } from 'react-router'
import { PALETA } from '../../paleta'
import { traerImagen } from '../fototeca/modelo'
import { type Datos, type SemanaDetalle, type Vocabularios, lista, texto } from './modelo'
import { type Lote, actividadesOrdenadas, rutaMiniatura, rutaVista } from './fotosSemana'

const ESTADOS: [string, string][] = [['publica', 'Pública'], ['reservada', 'Reservada'], ['revisar', 'Por revisar']]

function Imagen({ semanaId, codigo, datos }: { semanaId: number; codigo: string; datos: Datos }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let vivo = true
    setUrl('')
    // La miniatura (ya en memoria) mientras llega la vista de 1600 px.
    traerImagen(rutaMiniatura(semanaId, codigo)).then((u) => vivo && setUrl((x) => x || u)).catch(() => {})
    traerImagen(rutaVista(semanaId, codigo)).then((u) => vivo && setUrl(u)).catch(() => {})
    return () => {
      vivo = false
    }
  }, [semanaId, codigo])
  const ancho = Number(datos.ancho) || 0
  const alto = Number(datos.alto) || 0
  const vertical = datos.orientacion === 'vertical' && ancho && alto
  // Franja que conserva el recorte 3:2 de la galería (lib/fotos.py del generador).
  const franja = vertical ? Math.min(1, (2 / 3) * (ancho / alto)) : 1
  const arriba = { arriba: 0, abajo: 1 - franja }[texto(datos.recorte)] ?? (1 - franja) / 2
  if (!url) return <CircularProgress sx={{ color: '#fff' }} />
  return (
    <Box sx={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', aspectRatio: ancho && alto ? `${ancho} / ${alto}` : undefined, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={url} alt={texto(datos.pie) || codigo} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
      {vertical && franja < 1 && (
        <>
          <Box title="Fuera del recorte de la galería" sx={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${arriba * 100}%`, bgcolor: 'rgba(0,0,0,.5)', pointerEvents: 'none' }} />
          <Box title="Fuera del recorte de la galería" sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${(1 - arriba - franja) * 100}%`, bgcolor: 'rgba(0,0,0,.5)', pointerEvents: 'none' }} />
        </>
      )}
    </Box>
  )
}

interface Props {
  s: SemanaDetalle
  voc: Vocabularios
  /** Las fotos que se estaban viendo al abrir (←/→ recorre estas). */
  codigos: string[]
  indice: number | null
  alCambiarIndice: (i: number | null) => void
  cambiar: (codigos: string[], lote: Lote) => Promise<void>
  quitar: (codigo: string) => Promise<void>
}

export default function VisorFoto({ s, voc, codigos, indice, alCambiarIndice, cambiar, quitar }: Props) {
  const tema = useTheme()
  const angosta = useMediaQuery(tema.breakpoints.down('md'))
  const codigo = indice !== null ? codigos[indice] : null
  const fila = codigo ? s.fotos.find((f) => f.codigo === codigo) : undefined
  const d = fila?.datos ?? {}
  const [pie, setPie] = useState('')
  const [obs, setObs] = useState('')
  useEffect(() => {
    setPie(texto(d.pie))
    setObs(texto(d.observaciones))
  }, [codigo, d.pie, d.observaciones]) // eslint-disable-line react-hooks/exhaustive-deps

  const actividades = useMemo(() => actividadesOrdenadas(s), [s])
  const opcionesPedido = useMemo(() => s.pedidos.map((p) => p.codigo), [s.pedidos])
  const textoPedido = useMemo(() => Object.fromEntries(s.pedidos.map((p) => [p.codigo, texto(p.datos.pedido)])), [s.pedidos])
  const instituciones = useMemo(() => [...new Set(s.pedidos.flatMap((p) => lista(p.datos.entidades)))].sort(), [s.pedidos])
  // Los pedidos de la actividad de la foto se proponen primero.
  const deSuActividad = useMemo(() => new Set(s.pedidos.filter((p) => p.datos.actividad === d.actividad).map((p) => p.codigo)), [s.pedidos, d.actividad])
  const pedidosOrdenados = useMemo(() => [...opcionesPedido].sort((a, b) => Number(deSuActividad.has(b)) - Number(deSuActividad.has(a)) || a.localeCompare(b)), [opcionesPedido, deSuActividad])

  // ←/→ entre fotos (salvo escribiendo en un campo).
  useEffect(() => {
    if (indice === null) return
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable="true"], [role="combobox"]')) return
      if (e.key === 'ArrowLeft' && indice > 0) alCambiarIndice(indice - 1)
      if (e.key === 'ArrowRight' && indice < codigos.length - 1) alCambiarIndice(indice + 1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [indice, codigos.length, alCambiarIndice])

  if (indice === null || !codigo || !fila) return null
  const uno = (cambios: Datos) => cambiar([codigo], { cambios })
  const vertical = d.orientacion === 'vertical'
  const fototecaId = d.fototeca_id

  return (
    <Dialog open fullScreen={angosta} maxWidth={false} onClose={() => alCambiarIndice(null)}
      PaperProps={{ sx: { width: { md: '96vw' }, height: { md: '92vh' }, maxWidth: 1700, bgcolor: '#141110', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, overflow: { xs: 'auto', md: 'hidden' } } }}>
      <Box sx={{ position: 'relative', flex: { md: 1 }, minWidth: 0, minHeight: { xs: '52vh', md: 0 }, height: { xs: '52vh', md: 'auto' }, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 1, md: 2 } }}>
        <Imagen semanaId={s.id} codigo={codigo} datos={d} />
        <IconButton aria-label="Anterior" disabled={indice === 0} onClick={() => alCambiarIndice(indice - 1)}
          sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(0,0,0,.35)', '&:hover': { bgcolor: 'rgba(0,0,0,.55)' }, '&.Mui-disabled': { display: 'none' } }}>
          <ChevronLeftIcon />
        </IconButton>
        <IconButton aria-label="Siguiente" disabled={indice >= codigos.length - 1} onClick={() => alCambiarIndice(indice + 1)}
          sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(0,0,0,.35)', '&:hover': { bgcolor: 'rgba(0,0,0,.55)' }, '&.Mui-disabled': { display: 'none' } }}>
          <ChevronRightIcon />
        </IconButton>
        {/* 2026-10-06: sin el código; ya lo dice el título «Foto F-xxx» del panel. */}
        <Typography sx={{ position: 'absolute', left: 12, top: 10, color: 'rgba(255,255,255,.85)', fontSize: 13 }}>
          {indice + 1} de {codigos.length}
        </Typography>
        {angosta && (
          <IconButton aria-label="Cerrar" onClick={() => alCambiarIndice(null)} sx={{ position: 'absolute', right: 6, top: 4, color: '#fff' }}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      <Box sx={{ width: { md: 360 }, flexShrink: 0, bgcolor: 'background.paper', p: 2, overflowY: { md: 'auto' }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>Foto {codigo}</Typography>
          {!angosta && <IconButton aria-label="Cerrar" onClick={() => alCambiarIndice(null)}><CloseIcon /></IconButton>}
        </Box>
        <TextField label="Pie de foto" size="small" multiline maxRows={3} value={pie} onChange={(e) => setPie(e.target.value)}
          onBlur={() => pie !== texto(d.pie) && void uno({ pie })} helperText="Actividad y lugar, sin nombres de personas." />
        <TextField select size="small" label="Actividad" value={texto(d.actividad)} onChange={(e) => void uno({ actividad: e.target.value || null })}>
          <MenuItem value="">Sin actividad</MenuItem>
          {actividades.map((a) => <MenuItem key={a.codigo} value={a.codigo}>{a.codigo} · {texto(a.datos.titulo).slice(0, 60)}</MenuItem>)}
        </TextField>
        <Box>
          <Typography variant="caption" color="text.secondary">Estado</Typography>
          <ToggleButtonGroup exclusive fullWidth size="small" value={texto(d.estado)} onChange={(_, v) => v && void uno({ estado: v })}>
            {ESTADOS.map(([v, e]) => <ToggleButton key={v} value={v} sx={{ textTransform: 'none' }}>{e}</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        <FormControlLabel
          control={<Switch checked={d.estado === 'publica' && Boolean(d.seleccion)} disabled={d.estado === 'reservada'}
            onChange={(e) => void uno({ seleccion: e.target.checked })} />}
          // 2026-10-06: una sola etiqueta; el interruptor desactivado y el estado «reservada» ya lo dicen.
          label="Va en el informe"
        />
        {vertical && (
          <Box>
            <Typography variant="caption" color="text.secondary">Recorte 3:2 en la galería (franja que se conserva)</Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={texto(d.recorte) || 'centro'} onChange={(_, v) => v && void uno({ recorte: v })}>
              {['arriba', 'centro', 'abajo'].map((x) => <ToggleButton key={x} value={x} sx={{ textTransform: 'none' }}>{x}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
        )}
        <TextField select size="small" label="Tipo" value={texto(d.tipo)} onChange={(e) => void uno({ tipo: e.target.value })}>
          {voc.tipos_foto.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <Autocomplete multiple size="small" options={pedidosOrdenados} value={lista(d.pedidos)}
          onChange={(_, v) => void uno({ pedidos: v })}
          groupBy={(o) => (deSuActividad.has(o) ? 'De su actividad' : 'Otros pedidos')}
          getOptionLabel={(o) => `${o} · ${(textoPedido[o] ?? '').slice(0, 70)}`}
          renderTags={(v, props) => v.map((x, i) => <Chip size="small" label={x} title={textoPedido[x]} {...props({ index: i })} key={x} />)}
          renderInput={(p) => <TextField {...p} label="Pedidos que muestra" />} />
        <Autocomplete multiple freeSolo size="small" options={instituciones} value={lista(d.instituciones)}
          onChange={(_, v) => void uno({ instituciones: v.map((x) => x.trim()).filter(Boolean) })}
          renderTags={(v, props) => v.map((x, i) => <Chip size="small" label={x} {...props({ index: i })} key={x} />)}
          renderInput={(p) => <TextField {...p} label="Instituciones" helperText="Las de los pedidos de la semana, o escriba otra." />} />
        <TextField label="Observaciones internas" size="small" multiline minRows={2} value={obs} onChange={(e) => setObs(e.target.value)}
          onBlur={() => obs !== texto(d.observaciones) && void uno({ observaciones: obs || null })} helperText="Consentimiento, menores, dudas…" />
        <Typography variant="caption" color="text.secondary">
          {texto(d.origen)}{d.ancho ? ` · ${texto(d.ancho)}×${texto(d.alto)} px` : ''}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
          {fototecaId ? (
            <Button size="small" component={EnlaceRuta} to={`/fototeca?vinculo=semana:${s.id}`} startIcon={<PhotoLibraryOutlinedIcon />}>En la Fototeca</Button>
          ) : (
            <Button size="small" startIcon={<PhotoLibraryOutlinedIcon />} onClick={() => void cambiar([codigo], { fototeca: true })}>Pasar a la Fototeca</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button size="small" sx={{ color: PALETA.error }} startIcon={<DeleteOutlineIcon />} onClick={() => void quitar(codigo)}>Quitar</Button>
        </Box>
      </Box>
    </Dialog>
  )
}

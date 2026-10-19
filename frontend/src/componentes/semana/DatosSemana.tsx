/**
 * Datos de la semana (el expediente): tema, periodo, ámbito, equipo, oficios de
 * convocatoria y los DÍAS del recorrido, que ordenan las actividades y las
 * crónicas. El periodo se escribe una vez: el servidor lo copia al informe.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import { api } from '../../api'
import { Bloque, Titulo } from '../Estilo'
import { CamposFila, type Campo } from './DialogoFila'
import { type Datos, type Dia, type PropsSeccion, conMayuscula, diasDe, fechasEntre, lista, nombreDia, temaDe, texto } from './modelo'
import { PALETA } from '../../paleta'

/** «Nombre — rol» por línea ⇄ [{nombre, rol}]. */
const aLineas = (v: unknown) =>
  ((v as { nombre?: string; rol?: string }[] | undefined) ?? []).map((r) => (r.rol ? `${r.nombre ?? ''} — ${r.rol}` : r.nombre ?? ''))
const deLineas = (v: unknown) =>
  lista(v).map((l) => {
    const [nombre, ...rol] = l.split(/\s+[—-]\s+/)
    return { nombre: nombre.trim(), rol: rol.join(' — ').trim() }
  })

export default function DatosSemana({ s, voc, recargar, avisar }: PropsSeccion) {
  const exp = s.expediente
  const inicial = (): Datos => ({
    tema: texto(exp.tema) || temaDe(s),
    estado: s.estado,
    inicio: (exp.periodo as Datos | undefined)?.inicio ?? '',
    fin: (exp.periodo as Datos | undefined)?.fin ?? '',
    provincias: (exp.ambito as Datos | undefined)?.provincias ?? [],
    distritos: (exp.ambito as Datos | undefined)?.distritos ?? [],
    responsables: aLineas(exp.responsables),
    oficios: exp.oficios ?? [],
    otros_documentos: exp.otros_documentos ?? [],
    notas: exp.notas ?? [],
  })
  const [datos, setDatosBase] = useState<Datos>(inicial)
  const [dias, setDiasBase] = useState<Dia[]>(diasDe(s))
  const [guardando, setGuardando] = useState(false)
  // Lo escrito aquí y aún no guardado no se pisa cuando otra sección recarga la semana
  // (agregar una actividad, subir fotos…): antes se perdía sin aviso.
  const [sucio, setSucio] = useState(false)
  const setDatos = (d: Datos) => { setDatosBase(d); setSucio(true) }
  const setDias = (d: Dia[]) => { setDiasBase(d); setSucio(true) }
  useEffect(() => {
    if (!sucio) return
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sucio])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sucio) return
    setDatosBase(inicial())
    setDiasBase(diasDe(s))
  }, [s.expediente, s.resto])

  const campos: Campo[] = [
    { clave: 'tema', etiqueta: 'Tema de la semana', tipo: 'texto', ayuda: 'Como se leerá en la web: «Educación superior».' },
    { clave: 'inicio', etiqueta: 'Del', tipo: 'fecha', medio: true },
    { clave: 'fin', etiqueta: 'Al', tipo: 'fecha', medio: true },
    { clave: 'provincias', etiqueta: 'Provincias recorridas', tipo: 'chips' },
    { clave: 'distritos', etiqueta: 'Distritos', tipo: 'chips' },
    { clave: 'responsables', etiqueta: 'Equipo de la semana', tipo: 'lineas', ayuda: 'Uno por línea: «Nombre — rol».' },
    { clave: 'oficios', etiqueta: 'Oficios de convocatoria', tipo: 'chips', ayuda: 'Códigos de Qillqa: OF-0073 (Enter para añadir).' },
    { clave: 'otros_documentos', etiqueta: 'Otros documentos', tipo: 'chips', ayuda: 'Viáticos, bancada… (códigos).' },
    { clave: 'notas', etiqueta: 'Notas internas', tipo: 'lineas' },
    { clave: 'estado', etiqueta: 'Estado de la semana', tipo: 'opcion', medio: true,
      opciones: voc.estados_semana.map((e) => ({ valor: e, etiqueta: e })),
      ayuda: '«hecho» al aprobar; «archivado» al cerrar los pedidos.' },
  ]

  const armarDias = () => {
    const previos = Object.fromEntries(dias.map((d) => [d.fecha, d]))
    setDias(fechasEntre(texto(datos.inicio), texto(datos.fin)).map((f) => previos[f] ?? { fecha: f, nombre: nombreDia(f), ambito: '' }))
  }
  const guardar = async () => {
    setGuardando(true)
    try {
      await api(`/api/semanas/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          estado: datos.estado,
          expediente: {
            tema: datos.tema,
            periodo: { inicio: datos.inicio || null, fin: datos.fin || null },
            ambito: { provincias: lista(datos.provincias), distritos: lista(datos.distritos) },
            responsables: deLineas(datos.responsables),
            oficios: lista(datos.oficios),
            otros_documentos: lista(datos.otros_documentos),
            notas: lista(datos.notas),
          },
          resto: { actividades: { dias: dias.map((d) => ({ ...d, nombre: d.nombre || nombreDia(d.fecha) })) } },
        }),
      })
      setSucio(false)
      avisar('success', 'Datos de la semana guardados.')
      await recargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <CamposFila campos={campos} datos={datos} poner={(k, v) => {
        const nuevos = { ...datos, [k]: v }
        setDatos(nuevos)
        // Los días siguen al periodo solos (se conserva el ámbito ya escrito de cada fecha).
        if ((k === 'inicio' || k === 'fin') && nuevos.inicio && nuevos.fin) {
          const previos = Object.fromEntries(dias.map((d) => [d.fecha, d]))
          setDias(fechasEntre(texto(nuevos.inicio), texto(nuevos.fin)).map((f) => previos[f] ?? { fecha: f, nombre: nombreDia(f), ambito: '' }))
        }
      }} />
      <Bloque>
        <Titulo nivel="sub" accion={<Button size="small" startIcon={<AutoFixHighOutlinedIcon />} onClick={armarDias} disabled={!datos.inicio || !datos.fin}>Armar desde el periodo</Button>}>
          Días del recorrido
        </Titulo>
        <Typography variant="caption" color="text.secondary">Siguen al periodo. El ámbito va en el antetítulo de la crónica.</Typography>
        <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
          {dias.map((d, i) => (
            <Box key={d.fecha + i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 110px 1fr' }, gap: 1, alignItems: 'center' }}>
              <TextField size="small" type="date" value={d.fecha} InputLabelProps={{ shrink: true }}
                onChange={(e) => setDias(dias.map((x, j) => (j === i ? { ...x, fecha: e.target.value, nombre: nombreDia(e.target.value) } : x)))} />
              <Typography variant="body2">{conMayuscula(d.nombre || nombreDia(d.fecha))}</Typography>
              <TextField size="small" placeholder="Ámbito del día: distrito o ciudad (provincia)" value={d.ambito}
                onChange={(e) => setDias(dias.map((x, j) => (j === i ? { ...x, ambito: e.target.value } : x)))} />
            </Box>
          ))}
          {dias.length === 0 && <Typography variant="body2" color="text.secondary">Aún no hay días: use «Armar desde el periodo».</Typography>}
        </Box>
      </Bloque>
      <Box sx={{ position: 'sticky', bottom: { xs: 'calc(58px + env(safe-area-inset-bottom))', sm: 0 }, zIndex: 2, display: 'flex', alignItems: 'center', gap: 1, mt: 3, py: 1, bgcolor: PALETA.fondo, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color={sucio ? 'warning.dark' : 'text.secondary'} sx={{ mr: 'auto' }}>
          {sucio ? 'Cambios sin guardar' : 'Todo guardado'}
        </Typography>
        <Button variant="contained" onClick={guardar} disabled={guardando || !sucio}>{guardando ? 'Guardando…' : 'Guardar datos'}</Button>
      </Box>
    </Box>
  )
}

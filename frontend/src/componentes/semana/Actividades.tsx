/**
 * Actividades de la semana, por día: lo que el despacho hizo en territorio (A-NN).
 * Son las fichas de `actividades.yaml`; el informe las cuenta (horas, distritos,
 * sectores) y la crónica de cada día las narra.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import { api } from '../../api'
import { Titulo } from '../Estilo'
import DialogoFila, { type Campo } from './DialogoFila'
import DialogoPegarSemana from './DialogoPegarSemana'
import ElegirEntrada from '../ElegirEntrada'
import { type Datos, type PropsSeccion, conMayuscula, diasDe, etiquetaDe, fechaLarga, lista, texto } from './modelo'
import { confirmar } from '../Dialogos'

const VACIO: Datos = {}

interface Edicion {
  codigo: string | null
  datos: Datos
}

export default function Actividades({ s, voc, recargar, avisar, textoPegar = '', alConsumirPegar }: PropsSeccion & {
  /** Texto del chat (`?pegar=<id>`): abre «Pegar el registro» ya leído. */
  textoPegar?: string
  alConsumirPegar?: () => void
}) {
  const navegar = useNavigate()
  const [editando, setEditando] = useState<Edicion | null>(null)
  const [pegar, setPegar] = useState(false)
  // Entrada doble (fase 9.5): cada «Actividad» del día ofrece formulario o prompt.
  const [eleccion, setEleccion] = useState<{ ancla: HTMLElement; fecha: string } | null>(null)
  useEffect(() => { if (textoPegar) setPegar(true) }, [textoPegar])
  const dias = diasDe(s)
  // Días del recorrido + fechas que solo aparecen en alguna actividad.
  const fechas = useMemo(() => {
    const f = new Set(dias.map((d) => d.fecha))
    for (const a of s.actividades) if (a.datos.fecha) f.add(texto(a.datos.fecha))
    return [...f].sort()
  }, [dias, s.actividades])
  const pedidosDe = (codigo: string) => s.pedidos.filter((p) => p.datos.actividad === codigo).length

  const campos: Campo[] = [
    { clave: 'titulo', etiqueta: 'Título', tipo: 'texto', ayuda: 'Como se leerá en el informe: «Visita de trabajo al IES …»' },
    { clave: 'fecha', etiqueta: 'Día', tipo: 'opcion', opciones: fechas.map((f) => ({ valor: f, etiqueta: fechaLarga(f) })) },
    { clave: 'tipo', etiqueta: 'Tipo', tipo: 'opcion', medio: true, opciones: voc.tipos_actividad },
    { clave: 'sector', etiqueta: 'Sector', tipo: 'opcion', medio: true, opciones: voc.sectores },
    { clave: 'hora_inicio', etiqueta: 'Hora de inicio', tipo: 'hora', medio: true },
    { clave: 'hora_fin', etiqueta: 'Hora de fin', tipo: 'hora', medio: true, ayuda: 'Sin hora de fin no cuenta para las horas en territorio.' },
    { clave: 'lugar', etiqueta: 'Lugar', tipo: 'texto', ayuda: 'Institución o local, con su dirección si se conoce.' },
    { clave: 'localidad', etiqueta: 'Localidad', tipo: 'texto', medio: true },
    { clave: 'distrito', etiqueta: 'Distrito', tipo: 'texto', medio: true },
    { clave: 'provincia', etiqueta: 'Provincia', tipo: 'texto', medio: true },
    { clave: 'participantes', etiqueta: 'Participantes', tipo: 'lineas', ayuda: 'Una persona o grupo por línea: «Mg. …, Directora General».' },
    { clave: 'contexto', etiqueta: 'Contexto', tipo: 'area', ayuda: 'Antecedentes en una o dos frases.' },
    { clave: 'hallazgos', etiqueta: 'Hallazgos', tipo: 'lineas', ayuda: 'Un hallazgo o problemática por línea, tal como se expuso.' },
    { clave: 'documentos', etiqueta: 'Documentos de la visita', tipo: 'chips', ayuda: 'Oficios de convocatoria: OF-0073-2026-2027 (Enter para añadir).' },
    { clave: 'observaciones', etiqueta: 'Observaciones internas', tipo: 'area', ayuda: 'No sale en la edición pública.' },
  ]

  const nueva = (fecha: string) => {
    // Lo que suele repetirse de una visita a otra se propone desde la última registrada
    // (del mismo día si hay): tipo, sector y lugar. El orden del día lo pone la hora.
    const delDia = s.actividades.filter((a) => a.datos.fecha === fecha)
    const base = delDia.length ? delDia : s.actividades
    const previa = base[base.length - 1]?.datos ?? {}
    setEditando({
      codigo: null,
      datos: { fecha, tipo: previa.tipo ?? null, sector: previa.sector ?? null,
               localidad: delDia.length ? previa.localidad ?? null : null,
               distrito: delDia.length ? previa.distrito ?? null : null, provincia: previa.provincia ?? null,
               participantes: [], hallazgos: [], pedidos: [], documentos: [], fotos: [],
               hora_inicio: null, hora_fin: null, observaciones: null },
    })
  }
  const guardar = async (datos: Datos) => {
    if (editando?.codigo) {
      await api(`/api/semanas/${s.id}/actividades/${editando.codigo}`, { method: 'PUT', body: JSON.stringify({ datos }) })
    } else {
      await api(`/api/semanas/${s.id}/actividades`, { method: 'POST', body: JSON.stringify({ datos }) })
    }
    setEditando(null)
    await recargar()
  }
  const quitar = async () => {
    if (!editando?.codigo || !(await confirmar(`¿Quitar la actividad ${editando.codigo}?`, { aceptar: 'Quitar', peligro: true }))) return
    try {
      await api(`/api/semanas/${s.id}/actividades/${editando.codigo}`, { method: 'DELETE' })
      setEditando(null)
      await recargar()
    } catch (e) {
      avisar('error', e instanceof Error ? e.message : 'No se pudo quitar.')
    }
  }

  return (
    <Box>
      <ElegirEntrada
        ancla={eleccion?.ancla ?? null}
        alCerrar={() => setEleccion(null)}
        tipo="registro-representacion"
        alManual={() => eleccion && nueva(eleccion.fecha)}
        alPrompt={() => setPegar(true)}
      />
      <DialogoPegarSemana abierto={pegar} s={s} textoInicial={textoPegar || undefined} alCerrar={() => { setPegar(false); alConsumirPegar?.() }} recargar={recargar} />
      {fechas.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Primero arme los días del recorrido en «Datos de la semana».
        </Typography>
      )}
      {fechas.map((fecha, i) => {
        const dia = dias.find((d) => d.fecha === fecha)
        const del = s.actividades
          .filter((a) => a.datos.fecha === fecha)
          .sort((a, b) => Number(a.datos.orden_dia ?? 0) - Number(b.datos.orden_dia ?? 0))
        return (
          <Box key={fecha} sx={{ mb: 3 }}>
            <Titulo
              nivel="sub"
              accion={<Button size="small" startIcon={<AddIcon />} onClick={(e) => setEleccion({ ancla: e.currentTarget, fecha })}>Actividad</Button>}
            >
              Día {i + 1} · {conMayuscula(fechaLarga(fecha))}
              {dia?.ambito ? <Typography component="span" variant="caption" color="text.secondary"> · {dia.ambito}</Typography> : null}
            </Titulo>
            {del.length === 0 && <Typography variant="caption" color="text.disabled">Sin actividades registradas.</Typography>}
            <Box sx={{ display: 'grid', gap: 1 }}>
              {del.map((a) => {
                const n = pedidosDe(a.codigo)
                return (
                  <ButtonBase
                    key={a.codigo}
                    onClick={() => setEditando({ codigo: a.codigo, datos: a.datos })}
                    sx={{ display: 'block', textAlign: 'left', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', '&:hover': { borderColor: 'primary.light' } }}
                  >
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'primary.main' }}>{a.codigo}</Typography>
                      <Typography sx={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 200 }}>{texto(a.datos.titulo) || '(sin título)'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap', mt: 0.5, color: 'text.secondary' }}>
                      {a.datos.hora_inicio ? (
                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          <ScheduleOutlinedIcon sx={{ fontSize: 14 }} />
                          {texto(a.datos.hora_inicio)}{a.datos.hora_fin ? `–${texto(a.datos.hora_fin)}` : ''}
                        </Typography>
                      ) : null}
                      {a.datos.distrito ? (
                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          <PlaceOutlinedIcon sx={{ fontSize: 14 }} />
                          {texto(a.datos.distrito)}{a.datos.provincia ? ` (${texto(a.datos.provincia)})` : ''}
                        </Typography>
                      ) : null}
                      <Chip size="small" variant="outlined" label={etiquetaDe(voc.tipos_actividad, a.datos.tipo) || 'sin tipo'} sx={{ height: 20, fontSize: 11 }} />
                      <Chip size="small" variant="outlined" label={etiquetaDe(voc.sectores, a.datos.sector) || 'sin sector'} sx={{ height: 20, fontSize: 11 }} />
                      <Typography variant="caption">
                        {lista(a.datos.participantes).length} participantes · {lista(a.datos.hallazgos).length} hallazgos · {n} {n === 1 ? 'pedido' : 'pedidos'}
                      </Typography>
                    </Box>
                  </ButtonBase>
                )
              })}
            </Box>
          </Box>
        )
      })}
      <DialogoFila
        abierto={editando !== null}
        titulo={editando?.codigo ? `Actividad ${editando.codigo}` : 'Nueva actividad'}
        campos={campos}
        inicial={editando?.datos ?? VACIO}
        alCerrar={() => setEditando(null)}
        alGuardar={guardar}
        pie={editando?.codigo ? (
          <>
            <Button startIcon={<AddIcon />} onClick={() => navegar(`?ver=pedidos&nuevo=${editando.codigo}`)}>Pedido de esta actividad</Button>
            <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={quitar}>Quitar</Button>
          </>
        ) : null}
      />
    </Box>
  )
}

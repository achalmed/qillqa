/**
 * Revisión del documento antes de numerarlo (Edison 2026-09-05).
 *
 * Empezó revisando solo las copias (c.c.) y Edison lo amplió: «la verificación
 * debe ser con los datos más importantes, no solo con la con copia». Se
 * confirma, uno por uno, lo que obliga a rehacer el documento con OTRO número
 * si está mal —a quién va, asunto, fecha y cada copia—, y se muestran sin
 * marca los datos que se corrigen sin perder el número (referencia, anexo,
 * cargo). Si hubiera que marcar quince casillas, se marcarían quince casillas
 * sin leer ninguna: justo el hábito que hay que evitar.
 *
 * No es un «¿Está seguro?»: todo es editable aquí mismo —el texto de cada dato,
 * las copias, las sugeridas que faltan— porque es la única puerta a numerar y
 * tiene que poder resolverse sin volver al formulario.
 */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { esAnterior, fechaLarga, hoyIso } from '../fechas'

/** Un dato del documento a mirar antes de numerar. */
export interface PuntoVerificacion {
  id: string
  etiqueta: string
  /** Campo de `campos` que edita (para devolver el valor corregido). */
  clave: string
  valor: string
  vacio: boolean
  /** true = hay que marcarlo para poder numerar; false = solo informativo. */
  confirmar: boolean
  /** Lo que el directorio dice HOY, si difiere: se ofrece, nunca se aplica solo (2026-10-12). */
  directorio?: string
}

export interface Copia {
  tratamiento: string
  nombre: string
  cargo: string
  // Solo en las sugeridas: por qué el sistema la propone y si el directorio
  // ya dice otra cosa que lo guardado en la regla.
  motivo?: string
  cambio_en_directorio?: boolean
  cargo_anterior?: string
  /** En las que ya lleva: el cargo que el directorio le da HOY, si difiere (se ofrece). */
  cargo_directorio?: string
}

const TRATAMIENTOS = ['Señor:', 'Señora:', 'Señores:', 'Señorita:']
/** El tratamiento como lo muestra la lista, con o sin los dos puntos (2026-10-12: «Señor» sin ellos
 * quedaba fuera de las opciones y el selector avisaba «out-of-range value»). */
const tratamientoDeLista = (t: string | undefined): string =>
  TRATAMIENTOS.find((x) => x.toLowerCase() === `${(t || 'Señor').trim().replace(/:\s*$/, '')}:`.toLowerCase()) ?? 'Señor:'

/** Vuelve a armar el campo `con_copia`: una copia = tratamiento, nombre y
 *  cargo, cada uno en su línea (el formato que ya parsea el generador). */
export function aTextoCopias(copias: Copia[]): string {
  return copias
    .filter((c) => c.nombre.trim())
    .map((c) =>
      [tratamientoDeLista(c.tratamiento), c.nombre.trim(), c.cargo.trim()]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n')
}

/** «El directorio dice hoy: …  Usar»: el valor vigente se ofrece, la persona decide. */
function OfertaDirectorio({ valor, actual, alUsar }: { valor?: string; actual: string; alUsar: () => void }) {
  if (!valor || valor.trim() === actual.trim()) return null
  return (
    <Typography component="span" variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
      El directorio dice hoy: <b>{valor}</b>{' '}
      <Box component="span" role="button" sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }} onClick={alUsar}>
        Usar
      </Box>
    </Typography>
  )
}

export default function DialogoVerificacion({
  abierto,
  puntos,
  copias,
  sugeridas,
  noSeImprimen = false,
  ocupado = false,
  alCancelar,
  alConfirmar,
}: {
  abierto: boolean
  /** Datos del documento a revisar (destinatario, asunto, fecha, …). */
  puntos: PuntoVerificacion[]
  /** Las copias que el documento ya lleva. */
  copias: Copia[]
  /** El documento está ajustado para salir SIN c.c. (fmt_copia_mostrar='no').
   *  Se siguen revisando —quedan en el expediente y en la bandeja, y basta un
   *  clic para volver a imprimirlas— pero quien numera tiene que saber que en
   *  el papel no van a aparecer. */
  noSeImprimen?: boolean
  /** Las que el sistema propone y todavía no están. */
  sugeridas: Copia[]
  ocupado?: boolean
  alCancelar: () => void
  /** Devuelve los campos corregidos (incluido `con_copia`), ya confirmados. */
  alConfirmar: (campos: Record<string, string>) => void
}) {
  // En el celular, el diálogo ocupa la pantalla entera: es un formulario.
  const celular = useMediaQuery((t: Theme) => t.breakpoints.down('sm'))
  const [lista, setLista] = useState<Copia[]>([])
  const [revisadas, setRevisadas] = useState<boolean[]>([])
  // Valores de los datos del documento (editables aquí) y su marca de revisado.
  const [datos, setDatos] = useState<PuntoVerificacion[]>([])
  const [vistos, setVistos] = useState<Record<string, boolean>>({})

  // Cada vez que se abre, se parte de lo que el documento lleva HOY: si el
  // usuario canceló y editó el formulario, no debe reaparecer lo viejo.
  useEffect(() => {
    if (!abierto) return
    setLista(copias)
    setRevisadas(copias.map(() => false))
    setDatos(puntos)
    setVistos({})
  }, [abierto, copias, puntos])

  const editarDato = (id: string, valor: string) =>
    setDatos((d) => d.map((p) => (p.id === id ? { ...p, valor } : p)))

  const aConfirmar = datos.filter((p) => p.confirmar)
  const informativos = datos.filter((p) => !p.confirmar)
  const faltanDatos = aConfirmar.some((p) => !vistos[p.id])

  const marcar = (i: number, valor: boolean) =>
    setRevisadas((r) => r.map((v, j) => (j === i ? valor : v)))

  const quitar = (i: number) => {
    setLista((l) => l.filter((_, j) => j !== i))
    setRevisadas((r) => r.filter((_, j) => j !== i))
  }

  const editar = (i: number, campo: keyof Copia, valor: string) =>
    setLista((l) => l.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)))

  const agregar = (c: Copia) => {
    setLista((l) => [...l, { tratamiento: c.tratamiento || 'Señor:', nombre: c.nombre, cargo: c.cargo }])
    // Una copia recién agregada a conciencia ya está revisada.
    setRevisadas((r) => [...r, true])
  }

  // Las sugeridas que aún no están en la lista de trabajo.
  const clave = (c: Copia) => c.nombre.trim().toLowerCase()
  const pendientes = sugeridas.filter(
    (s) => !lista.some((c) => clave(c) === clave(s)),
  )

  // Copias que no se imprimen: no hay nada que confirmar en ellas (2026-10-10).
  const faltanRevisar = !noSeImprimen && lista.some((c, i) => c.nombre.trim() && !revisadas[i])
  const puedeConfirmar = !faltanRevisar && !faltanDatos && !ocupado

  /** Los campos corregidos que se devuelven al editor. */
  const camposFinales = (): Record<string, string> => {
    const salida: Record<string, string> = { con_copia: aTextoCopias(lista) }
    for (const p of datos) salida[p.clave] = p.valor
    return salida
  }

  return (
    <Dialog open={abierto} onClose={alCancelar} fullWidth maxWidth="sm" fullScreen={celular}>
      <DialogTitle sx={{ pb: 0.5 }}>Revise el documento antes de numerarlo</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          El número no se puede deshacer. Confirme (o corrija aquí) los datos que obligarían a rehacerlo.
        </Typography>

        {/* --- Datos del documento -------------------------------------- */}
        {aConfirmar.map((p) => (
          <Box
            key={p.id}
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
              mb: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: vistos[p.id] ? 'success.50' : 'action.hover',
            }}
          >
            <Tooltip title={`Confirmar ${p.etiqueta.toLowerCase()}`}>
              <Checkbox
                size="small"
                checked={Boolean(vistos[p.id])}
                onChange={(e) => setVistos((v) => ({ ...v, [p.id]: e.target.checked }))}
                sx={{ mt: 0.5 }}
              />
            </Tooltip>
            {p.clave === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(p.valor || hoyIso()) ? (
              // La fecha se revisa como fecha (no «2026-09-28»): cómo saldrá
              // impresa y, si quedó del día en que se creó el borrador, la de hoy a un clic.
              <TextField
                size="small"
                fullWidth
                type="date"
                InputLabelProps={{ shrink: true }}
                label={p.etiqueta}
                value={p.valor}
                onChange={(e) => editarDato(p.id, e.target.value)}
                helperText={
                  esAnterior(p.valor) ? (
                    <>
                      Saldría con fecha {fechaLarga(p.valor)}, anterior a hoy.{' '}
                      <Box component="span" role="button" sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }} onClick={() => editarDato(p.id, hoyIso())}>
                        Usar la de hoy
                      </Box>
                    </>
                  ) : p.valor ? `Saldrá: ${fechaLarga(p.valor)}` : 'Está en blanco: saldrá la de hoy.'
                }
                FormHelperTextProps={esAnterior(p.valor) ? { sx: { color: 'warning.main' } } : undefined}
              />
            ) : (
              <TextField
                size="small"
                fullWidth
                multiline
                maxRows={4}
                label={p.etiqueta}
                value={p.valor}
                error={p.vacio && !p.valor.trim()}
                helperText={
                  p.vacio && !p.valor.trim() ? 'Está en blanco. ¿Es correcto?'
                    : p.directorio && p.directorio.trim() !== p.valor.trim()
                      ? <OfertaDirectorio valor={p.directorio} actual={p.valor} alUsar={() => editarDato(p.id, p.directorio ?? p.valor)} />
                      : ' '
                }
                onChange={(e) => editarDato(p.id, e.target.value)}
              />
            )}
          </Box>
        ))}

        {informativos.length > 0 && (
          <Box sx={{ mb: 2, pl: 1 }}>
            {informativos.map((p) => (
              <Box key={p.id}>
                <Typography variant="caption" color="text.secondary" display="block">
                  <b>{p.etiqueta}:</b> {p.valor || '(vacío)'}
                </Typography>
                <OfertaDirectorio valor={p.directorio} actual={p.valor} alUsar={() => editarDato(p.id, p.directorio ?? p.valor)} />
              </Box>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Copias (c.c.)
          </Typography>
          {noSeImprimen && (
            <Chip size="small" variant="outlined" color="warning" label="No se imprimen" />
          )}
        </Stack>

        {noSeImprimen && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Sin copias en el PDF (quedan registradas). No hace falta confirmarlas.
          </Alert>
        )}

        {lista.length === 0 && !noSeImprimen && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Va <b>sin copias</b>. Si falta alguna, agréguela abajo.
          </Alert>
        )}

        {lista.map((c, i) => (
          <Box
            key={`${c.nombre}-${i}`}
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
              mb: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: revisadas[i] ? 'success.50' : 'action.hover',
            }}
          >
            <Tooltip title="Marcar esta copia como verificada">
              <Checkbox
                size="small"
                checked={Boolean(revisadas[i])}
                onChange={(e) => marcar(i, e.target.checked)}
                sx={{ mt: 0.5 }}
              />
            </Tooltip>
            <Stack spacing={0.75} sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  size="small"
                  value={tratamientoDeLista(c.tratamiento)}
                  onChange={(e) => editar(i, 'tratamiento', e.target.value)}
                  sx={{ width: 110 }}
                >
                  {TRATAMIENTOS.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  fullWidth
                  label="Nombre"
                  value={c.nombre}
                  onChange={(e) => editar(i, 'nombre', e.target.value)}
                />
              </Stack>
              <TextField
                size="small"
                fullWidth
                label="Cargo"
                value={c.cargo}
                onChange={(e) => editar(i, 'cargo', e.target.value)}
              />
              <OfertaDirectorio valor={c.cargo_directorio} actual={c.cargo} alUsar={() => editar(i, 'cargo', c.cargo_directorio ?? c.cargo)} />
            </Stack>
            <Tooltip title="Quitar esta copia">
              <IconButton size="small" color="error" onClick={() => quitar(i)} sx={{ mt: 0.5 }}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}

        {pendientes.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              Copias que el despacho suele incluir
            </Typography>
            {pendientes.map((s) => (
              <Box
                key={s.nombre}
                sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2">
                    <b>{s.nombre}</b>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {s.cargo}
                  </Typography>
                  {s.motivo && (
                    <Typography variant="caption" color="text.disabled" display="block">
                      {s.motivo}
                    </Typography>
                  )}
                  {s.cambio_en_directorio && (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={`El directorio cambió — antes: ${s.cargo_anterior}`}
                      sx={{ mt: 0.5, height: 22 }}
                    />
                  )}
                </Box>
                <Button size="small" startIcon={<AddIcon />} onClick={() => agregar(s)}>
                  Agregar
                </Button>
              </Box>
            ))}
          </>
        )}

        <Divider sx={{ my: 2 }} />
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => agregar({ tratamiento: 'Señor:', nombre: '', cargo: '' })}
        >
          Agregar otra copia
        </Button>

        {(faltanRevisar || faltanDatos) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {faltanDatos ? 'Marque cada dato.' : 'Marque cada copia.'}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={alCancelar}>Volver al documento</Button>
        <Button
          variant="contained"
          disabled={!puedeConfirmar}
          onClick={() => alConfirmar(camposFinales())}
        >
          Confirmar y numerar
        </Button>
      </DialogActions>
    </Dialog>
  )
}

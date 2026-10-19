// BUSCAR EN ZOTERO (2026-10-06): autocompletado de obras de Zotero, la autoridad de
// metadatos, referencias y citas (GET /api/zotero/buscar, solo lectura). Entrega la obra
// con su referencia y su cita ya formateadas POR ZOTERO (estilo APA, en español); la
// fuente queda enlazada por `zotero:<clave>`. Calibre queda para el archivo: si Zotero
// enlaza la obra a un libro de la biblioteca, se muestra `calibre:<id>` (dónde está).
// Con Zotero cerrado en el servidor, el backend lee una copia de su base y la cita la
// arma el respaldo de Qillqa (se avisa); sin nada, el campo lo dice y nada más se rompe.

import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import { api } from '../api'

/** Una obra de Zotero, como la devuelve /api/zotero (contrato en backend/app/servicios/zotero.py). */
export interface ObraZotero {
  zotero_key: string
  citekey: string
  titulo: string
  autores: string[]
  anio: string
  tipo: string
  contenedor: string
  editorial: string
  doi: string
  url: string
  etiquetas: string[]
  calibre_id: number | null
  cita: string
  cita_md: string
  cita_corta: string
  formateado_por: 'zotero' | 'sgdp-respaldo'
  origen: 'api' | 'sqlite'
}

export interface EstadoZotero {
  modo: 'api' | 'sqlite' | 'apagado'
  api: boolean
  bbt: boolean
  sqlite: boolean
  obras: number
  estilo: string
  motivo: string
}

/** Busca en Zotero (vacío si no hay servidor o Zotero). */
export async function buscarEnZotero(q: string, limite = 20): Promise<ObraZotero[]> {
  if (q.trim().replace(/^[@#]/, '').length < 2) return []
  try {
    return await api<ObraZotero[]>(`/api/zotero/buscar?q=${encodeURIComponent(q.trim())}&limite=${limite}`)
  } catch {
    return []
  }
}

export default function BuscarZotero({ alElegir, sx }: { alElegir: (o: ObraZotero) => void; sx?: object }) {
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState<ObraZotero[]>([])
  const [cargando, setCargando] = useState(false)
  const [estado, setEstado] = useState<EstadoZotero | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let vivo = true
    api<EstadoZotero>('/api/zotero/estado')
      .then((e) => { if (vivo) setEstado(e) })
      .catch(() => { if (vivo) setEstado(null) })
    return () => { vivo = false; if (temporizador.current) clearTimeout(temporizador.current) }
  }, [])

  const buscar = (q: string) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (q.trim().replace(/^[@#]/, '').length < 2) {
      setOpciones([])
      return
    }
    temporizador.current = setTimeout(async () => {
      setCargando(true)
      setOpciones(await buscarEnZotero(q))
      setCargando(false)
    }, 250)
  }

  const apagado = estado?.modo === 'apagado'
  const aviso = apagado
    ? (estado?.motivo || 'Zotero no está abierto en el servidor.')
    : estado?.modo === 'sqlite'
      ? 'Zotero está cerrado: se lee una copia de su base y la cita la arma Qillqa. Abra Zotero para que la formatee él.'
      : undefined
  return (
    <Autocomplete
      size="small"
      sx={sx}
      options={opciones}
      disabled={apagado}
      // El servidor ya filtró y ordenó: no re-filtrar aquí.
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.titulo}
      isOptionEqualToValue={(a, b) => a.zotero_key === b.zotero_key}
      inputValue={texto}
      value={null}
      onInputChange={(_, v, motivo) => {
        if (motivo === 'input') { setTexto(v); buscar(v) }
      }}
      onChange={(_, o) => {
        if (!o) return
        alElegir(o)
        setTexto('')
        setOpciones([])
      }}
      loading={cargando}
      noOptionsText={texto.trim().length < 2 ? 'Escriba título, autor o año; #etiqueta; @clave' : 'Nada en Zotero con eso'}
      loadingText="Buscando en Zotero…"
      renderOption={(props, o) => {
        const { key, ...resto } = props as typeof props & { key: string }
        return (
          <Box component="li" key={key} {...resto} sx={{ display: 'block !important' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{o.titulo}</Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {o.cita_corta}{o.contenedor ? ` · ${o.contenedor}` : ''}{o.citekey ? ` · @${o.citekey}` : ''}
              {o.calibre_id != null ? ` · archivo: calibre:${o.calibre_id}` : ''}
            </Typography>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Buscar en Zotero (referencias y citas)"
          placeholder="Título, autor o año · #etiqueta · @clave"
          helperText={aviso}
          InputProps={{
            ...params.InputProps,
            startAdornment: <MenuBookOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', mr: 0.5 }} />,
            endAdornment: (
              <>
                {cargando ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  )
}

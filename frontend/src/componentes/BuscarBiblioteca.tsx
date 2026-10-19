// BUSCAR EN LA BIBLIOTECA (Calibre, 2026-10-06): autocompletado que busca obras
// en la biblioteca del ecosistema (GET /api/biblioteca/buscar, solo lectura).
// ROL CORREGIDO (Edison, 2026-10-06): Calibre administra los ARCHIVOS (dónde está el
// libro); la referencia y la cita son de ZOTERO (componentes/BuscarZotero.tsx). Este
// buscador queda para ubicar un archivo (`calibre:<id>`), no para citar.
// Si la biblioteca no está en la máquina del servidor, el campo lo dice y nada
// más se rompe.

import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import { api } from '../api'

/** Un libro de la biblioteca Calibre, como lo devuelve /api/biblioteca. */
export interface LibroCalibre {
  calibre_id: number
  titulo: string
  autores: string[]
  anio: string
  editorial: string
  isbn: string
  doi: string
  serie: string
  etiquetas: string[]
  idioma: string
  cita_apa: string
  cita_apa_md: string
  cita_corta: string
}

export interface EstadoBiblioteca { configurado: boolean; disponible: boolean; libros: number; motivo: string }

/** Busca en la biblioteca (vacío si no hay servidor o biblioteca). */
export async function buscarEnBiblioteca(q: string, limite = 20): Promise<LibroCalibre[]> {
  if (q.trim().length < 2) return []
  try {
    return await api<LibroCalibre[]>(`/api/biblioteca/buscar?q=${encodeURIComponent(q.trim())}&limite=${limite}`)
  } catch {
    return []
  }
}

export default function BuscarBiblioteca({ alElegir, sx }: { alElegir: (l: LibroCalibre) => void; sx?: object }) {
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState<LibroCalibre[]>([])
  const [cargando, setCargando] = useState(false)
  const [estado, setEstado] = useState<EstadoBiblioteca | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let vivo = true
    api<EstadoBiblioteca>('/api/biblioteca/estado')
      .then((e) => { if (vivo) setEstado(e) })
      .catch(() => { if (vivo) setEstado(null) })
    return () => { vivo = false; if (temporizador.current) clearTimeout(temporizador.current) }
  }, [])

  const buscar = (q: string) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (q.trim().length < 2) {
      setOpciones([])
      return
    }
    temporizador.current = setTimeout(async () => {
      setCargando(true)
      setOpciones(await buscarEnBiblioteca(q))
      setCargando(false)
    }, 250)
  }

  const apagada = estado !== null && !estado.disponible
  return (
    <Autocomplete
      size="small"
      sx={sx}
      options={opciones}
      disabled={apagada}
      // El servidor ya filtró y ordenó: no re-filtrar aquí.
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.titulo}
      isOptionEqualToValue={(a, b) => a.calibre_id === b.calibre_id}
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
      noOptionsText={texto.trim().length < 2 ? 'Escriba título, autor, ISBN o DOI' : 'Nada en la biblioteca con eso'}
      loadingText="Buscando en la biblioteca…"
      renderOption={(props, o) => {
        const { key, ...resto } = props as typeof props & { key: string }
        return (
          <Box component="li" key={key} {...resto} sx={{ display: 'block !important' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{o.titulo}</Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {o.cita_corta}{o.editorial ? ` · ${o.editorial}` : ''}{o.serie ? ` · ${o.serie}` : ''} · calibre:{o.calibre_id}
            </Typography>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Buscar en la biblioteca (Calibre)"
          placeholder="Título, autor, ISBN o DOI"
          helperText={apagada ? (estado?.motivo || 'La biblioteca Calibre no está disponible en el servidor.') : undefined}
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

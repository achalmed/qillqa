/**
 * Herramientas de ESTRUCTURA del proyecto de ley en la barra de redacción:
 * insertar cada nivel del Manual con su número (y renumerar), y el editor
 * guiado del TÍTULO DE LA LEY (forma + lo que sigue). Ver estructuraLey.ts.
 */
import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import { FORMAS_TITULO, NIVELES_LEY, PARTES_ARTICULADO, PARTES_DISPOSICIONES, insertar, partirTitulo, renumerar } from '../estructuraLey'
import { PALETA } from '../paleta'

/** Menú «Estructura»: los niveles del Manual con su número y «Renumerar». */
export function MenuEstructura({ editor, clave, separador, alAvisar }: {
  editor: Editor | null; clave: string; separador?: string; alAvisar: (tipo: 'success' | 'info', t: string) => void
}) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null)
  const articulado = PARTES_ARTICULADO.includes(clave)
  const disposiciones = PARTES_DISPOSICIONES.includes(clave)
  if (!editor || (!articulado && !disposiciones)) return null
  const cerrar = () => setAncla(null)
  return (
    <>
      <Button size="small" startIcon={<AccountTreeOutlinedIcon />} endIcon={<ArrowDropDownIcon />} onClick={(e) => setAncla(e.currentTarget)}>
        Estructura
      </Button>
      <Menu anchorEl={ancla} open={Boolean(ancla)} onClose={cerrar}>
        <ListSubheader sx={{ lineHeight: '30px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Insertar con su número
        </ListSubheader>
        {articulado &&
          NIVELES_LEY.map((n) => (
            <MenuItem key={n.nivel} onClick={() => { cerrar(); insertar(editor, n.nivel, separador) }} sx={{ pl: 2 + n.profundidad * 1.25 }}>
              <ListItemText primary={n.texto} secondary={n.ejemplo} primaryTypographyProps={{ fontWeight: n.nivel === 'articulo' ? 700 : 500, fontSize: 14 }} secondaryTypographyProps={{ fontSize: 11.5 }} />
            </MenuItem>
          ))}
        {disposiciones && (
          <MenuItem onClick={() => { cerrar(); insertar(editor, 'disposicion', separador) }}>
            <ListItemText primary="Disposición" secondary="PRIMERA.- Epígrafe (ÚNICA si es una sola)" primaryTypographyProps={{ fontWeight: 700, fontSize: 14 }} secondaryTypographyProps={{ fontSize: 11.5 }} />
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            cerrar()
            const n = renumerar(editor)
            alAvisar(n ? 'success' : 'info', n ? `Numeración rehecha: ${n} cambio${n > 1 ? 's' : ''}. Guarde para conservarla.` : 'La numeración ya estaba en orden.')
          }}
        >
          <FormatListNumberedIcon fontSize="small" sx={{ mr: 1.5, color: 'text.secondary' }} />
          <ListItemText primary="Renumerar todo" secondary="Artículos seguidos; capítulos desde I en cada título" primaryTypographyProps={{ fontSize: 14 }} secondaryTypographyProps={{ fontSize: 11.5 }} />
        </MenuItem>
      </Menu>
    </>
  )
}

/**
 * El TÍTULO DE LA LEY, guiado (Edison 2026-10-01: «revisa cómo comienzan
 * realmente los títulos»): se elige la forma del Manual («Ley que modifica»,
 * «Ley de», «Ley Orgánica de»…) y se escribe solo lo que sigue. El resultado
 * se ve como saldrá (en mayúsculas en el PDF). Se guarda como el texto de la
 * parte; el PDF y el título del proyecto salen de aquí.
 */
export function EditorTitulo({ inicial, editable, alGuardar }: {
  inicial: string; editable: boolean; alGuardar: (titulo: string) => Promise<void>
}) {
  const partido = partirTitulo(inicial)
  const [prefijo, setPrefijo] = useState(partido.prefijo || 'Ley que')
  const [resto, setResto] = useState(partido.prefijo ? partido.resto : inicial)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    const x = partirTitulo(inicial)
    setPrefijo(x.prefijo || 'Ley que')
    setResto(x.prefijo ? x.resto : inicial)
  }, [inicial])
  const completo = `${prefijo} ${resto.trim()}`.trim()
  const cambiado = completo !== inicial.trim()
  const ayuda = FORMAS_TITULO.find((f) => f.prefijo === prefijo)?.ayuda
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
        Elija la forma del título y complete lo que sigue.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '240px 1fr' }, gap: 1.5, alignItems: 'start' }}>
        <TextField select label="Forma del título" value={prefijo} onChange={(e) => setPrefijo(e.target.value)} disabled={!editable} helperText={ayuda}>
          {FORMAS_TITULO.map((f) => <MenuItem key={f.prefijo} value={f.prefijo}>{f.prefijo}…</MenuItem>)}
        </TextField>
        <TextField
          label="Lo que sigue"
          value={resto}
          onChange={(e) => setResto(e.target.value)}
          disabled={!editable}
          multiline
          minRows={2}
          placeholder={prefijo === 'Ley que' ? 'crea el registro nacional de…' : prefijo.endsWith('de') ? 'fomento a la producción…' : 'la Ley 27972, Ley Orgánica de Municipalidades, respecto de…'}
        />
      </Box>
      <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: PALETA.superficieTenue, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">Así saldrá en el PDF</Typography>
        <Typography sx={{ fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', mt: 0.5, lineHeight: 1.4 }}>{completo || '—'}</Typography>
      </Box>
      {editable && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
          <Button
            variant="contained"
            disabled={!cambiado || resto.trim().length < 3 || guardando}
            onClick={async () => {
              setGuardando(true)
              try {
                await alGuardar(completo)
              } finally {
                setGuardando(false)
              }
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar título'}
          </Button>
        </Box>
      )}
    </Box>
  )
}

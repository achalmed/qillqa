/**
 * PANEL DE ESTRUCTURA del Formato Word (2026-10-19): las secciones del espacio (un documento cada
 * una, con su tipo, asunto, estado y si tiene cambios sin guardar) y las notas al pie de la sección
 * activa. Tocar una sección la trae a la vista; tocar una nota la selecciona en el texto y abre su
 * editor (el clic en el número de la nota ya lo hace: aquí se reutiliza ese mismo evento).
 * En el escritorio es la columna izquierda; en el celular, una hoja inferior.
 * Partes editables (2026-10-19): con `menuDe` cada fila lleva ⋮ (renombrar, subir, bajar, quitar) y
 * con `alMover` se arrastra para reordenar (en el escritorio; en el celular, subir y bajar desde ⋮).
 */
import { useState, type DragEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { PALETA } from '../../paleta'
import { COLOR_ESTADO } from '../../estados'
import { rotuloSeccion, tituloSeccion } from './modelo'
import { MenuAnidado } from './BarraWord'
import type { ItemMenu } from './menus'

export interface SeccionResumen {
  id: number
  tipoNombre: string
  /** Rótulo propio en vez de «Tipo n de N» (las partes de un proyecto: su grupo). */
  rotulo?: string
  campos: Record<string, string>
  estado: string
  numero: number | null
  sucio: boolean
  cargando?: boolean
  /** Se puede arrastrar para reordenar (partes de un proyecto que no fija la técnica legislativa). */
  arrastrable?: boolean
}

export interface NotaResumen { pos: number; texto: string }

export default function PanelEstructura({ secciones, activo, notas, alIr, alNota, alNuevo, compacto = false, sinNuevo = false, rotulo, textoNuevo = 'Añadir', menuDe, alMover }: {
  secciones: SeccionResumen[]
  activo: number | null
  /** Las notas al pie de la sección activa (en orden). */
  notas: NotaResumen[]
  alIr: (id: number) => void
  alNota: (pos: number) => void
  alNuevo: (ancla: HTMLElement) => void
  compacto?: boolean
  /** Sin «Añadir». */
  sinNuevo?: boolean
  /** El rótulo de la lista («Partes»); sin él, según `sinNuevo`. */
  rotulo?: string
  textoNuevo?: string
  /** Los items del ⋮ de cada sección (partes de un proyecto); sin esto, no hay ⋮. */
  menuDe?: (s: SeccionResumen) => ItemMenu[]
  /** Mover la sección arrastrada al lugar de la otra. */
  alMover?: (id: number, destino: number) => void
}) {
  const colorEstado = (estado: string) => COLOR_ESTADO[estado] ?? PALETA.textoTenue
  const [menu, setMenu] = useState<{ ancla: HTMLElement; s: SeccionResumen } | null>(null)
  const [arrastrando, setArrastrando] = useState<number | null>(null)
  const [sobre, setSobre] = useState<number | null>(null)
  const arrastre = Boolean(alMover) && !compacto
  const alSoltar = (e: DragEvent, destino: SeccionResumen) => {
    e.preventDefault()
    const id = arrastrando ?? Number(e.dataTransfer.getData('text/plain'))
    setArrastrando(null)
    setSobre(null)
    if (Number.isFinite(id) && id !== destino.id) alMover?.(id, destino.id)
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, pt: compacto ? 0.5 : 1.5, pb: 0.5 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>{rotulo ?? (sinNuevo ? 'Partes' : 'Documentos del espacio')}</Typography>
        {!sinNuevo && <Button size="small" startIcon={<AddIcon />} onClick={(e) => alNuevo(e.currentTarget)}>{textoNuevo}</Button>}
      </Box>
      <List dense disablePadding sx={{ overflowY: 'auto', flex: '0 1 auto', minHeight: 0 }}>
        {secciones.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>{rotulo ? 'Aún no hay partes.' : 'Aún no hay documentos: «Añadir» crea uno, trae un Word o pega un prompt.'}</Typography>
        )}
        {secciones.map((s, i) => {
          const items = menuDe?.(s) ?? []
          const movible = arrastre && s.arrastrable !== false
          return (
            <ListItemButton
              key={s.id}
              selected={s.id === activo}
              onClick={() => alIr(s.id)}
              draggable={movible}
              onDragStart={movible ? (e) => { setArrastrando(s.id); e.dataTransfer.setData('text/plain', String(s.id)); e.dataTransfer.effectAllowed = 'move' } : undefined}
              onDragEnd={movible ? () => { setArrastrando(null); setSobre(null) } : undefined}
              onDragOver={arrastre ? (e) => { if (arrastrando != null && arrastrando !== s.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (sobre !== s.id) setSobre(s.id) } } : undefined}
              onDragLeave={arrastre ? () => { if (sobre === s.id) setSobre(null) } : undefined}
              onDrop={arrastre ? (e) => alSoltar(e, s) : undefined}
              sx={{ alignItems: 'flex-start', py: 0.75, pr: items.length ? 0.5 : undefined, opacity: arrastrando === s.id ? 0.4 : 1, boxShadow: sobre === s.id ? `inset 0 2px 0 ${PALETA.primario}` : 'none', cursor: movible ? 'grab' : undefined }}
            >
              {movible && <DragIndicatorIcon sx={{ fontSize: 16, color: 'text.disabled', mt: 0.4, ml: -0.75, mr: 0.25, flexShrink: 0 }} />}
              <ListItemText
                primary={(
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>{s.rotulo ?? rotuloSeccion(s.tipoNombre, i, secciones.length)}</Typography>
                    {s.sucio && <Box component="span" title="Cambios sin guardar" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />}
                  </Box>
                )}
                secondary={(
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    <Typography component="span" variant="body2" sx={{ color: 'text.primary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}>
                      {s.cargando ? 'Cargando…' : tituloSeccion(s.campos)}
                    </Typography>
                    <Box component="span" sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Chip size="small" label={s.numero != null ? `N.º ${String(s.numero).padStart(4, '0')}` : (s.estado || 'Borrador').toLowerCase().replace(/_/g, ' ')} sx={{ height: 18, fontSize: 10.5, fontWeight: 600, color: colorEstado(s.estado), bgcolor: `${colorEstado(s.estado)}1A` }} />
                    </Box>
                  </Box>
                )}
                secondaryTypographyProps={{ component: 'div' }}
              />
              {items.length > 0 && (
                <IconButton size="small" aria-label={`Opciones de ${tituloSeccion(s.campos)}`} onClick={(e) => { e.stopPropagation(); setMenu({ ancla: e.currentTarget, s }) }} sx={{ mt: -0.25, flexShrink: 0 }}>
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              )}
            </ListItemButton>
          )
        })}
      </List>
      {menu && <MenuAnidado ancla={menu.ancla} items={menuDe?.(menu.s) ?? []} alCerrar={() => setMenu(null)} />}
      {notas.length > 0 && (
        <>
          <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6, px: 1.5, pt: 1 }}>Notas al pie</Typography>
          <List dense disablePadding sx={{ overflowY: 'auto', minHeight: 0 }}>
            {notas.map((n, i) => (
              <ListItemButton key={`${n.pos}-${i}`} onClick={() => alNota(n.pos)} sx={{ py: 0.5 }}>
                <ListItemText primary={<Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}><b>{i + 1}.</b> {n.texto || 'Sin texto'}</Typography>} />
              </ListItemButton>
            ))}
          </List>
        </>
      )}
    </Box>
  )
}

/**
 * La FILA DE ACCIONES de un módulo (2026-10-06, pedido de Edison: «que los botones estén siempre
 * en el mismo lugar, como el “me gusta” de Facebook»). Una sola regla para todos: la acción
 * principal va primero, a la izquierda, al ras del contenido (el mismo borde que el buscador y la
 * lista de abajo); los filtros siguen en la misma fila; las acciones secundarias, en «⋮» al final.
 * En el celular el «⋮» queda en la primera línea, junto a la principal, y los filtros bajan.
 */
import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import Tooltip from '@mui/material/Tooltip'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import BotonActualizar from './BotonActualizar'

export interface AccionSecundaria {
  etiqueta: string
  icono?: ReactNode
  alPulsar: () => void
  deshabilitada?: boolean
}

export default function BarraModulo({
  principal,
  children,
  mas = [],
  alActualizar,
  mb = 1.5,
}: {
  /** El botón de la acción principal («Nuevo documento», «Nueva tarea»…). */
  principal?: ReactNode
  /** Filtros, buscador o navegación que acompañan a la principal. */
  children?: ReactNode
  /** Acciones secundarias: van en «⋮». */
  mas?: (AccionSecundaria | false | null | undefined)[]
  /** Relee la información del módulo (2026-10-18): el botón «Actualizar» discreto, siempre junto al «⋮». */
  alActualizar?: () => void | Promise<unknown>
  mb?: number
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const secundarias = mas.filter(Boolean) as AccionSecundaria[]
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb }}>
      {principal && <Box sx={{ display: 'flex', flexShrink: 0 }}>{principal}</Box>}
      {(secundarias.length > 0 || alActualizar) && (
        <Box sx={{ order: { xs: 1, sm: 3 }, ml: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {alActualizar && <BotonActualizar alActualizar={alActualizar} tamano="medium" />}
          {secundarias.length > 0 && (
          <Tooltip title="Más acciones">
            <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label="Más acciones">
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
          )}
          {secundarias.length > 0 && (
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            {secundarias.map((a) => (
              <MenuItem key={a.etiqueta} disabled={a.deshabilitada} onClick={() => { setMenu(null); a.alPulsar() }}>
                {a.icono && <ListItemIcon>{a.icono}</ListItemIcon>}
                {a.etiqueta}
              </MenuItem>
            ))}
          </Menu>
          )}
        </Box>
      )}
      {children && <Box sx={{ display: 'contents', '& > *': { order: 2 } }}>{children}</Box>}
    </Box>
  )
}

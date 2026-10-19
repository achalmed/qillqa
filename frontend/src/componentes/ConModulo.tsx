/**
 * La ruta de un módulo que se puede apagar (2026-10-18). Encendido, muestra la página; apagado, el
 * mensaje que eligió quien administra, dentro del marco de siempre. El servidor también lo cierra
 * (403 `modulo_apagado`): esto evita llegar a una pantalla que no puede cargar nada.
 */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import Marco from './Marco'
import { useModulos } from './usarModulos'
import { mensajeModulo, moduloActivo } from '../modulos'
import { DESDE_MENU, esAdmin, modulo as moduloDe, type IdModulo } from '../navegacion'
import { PALETA } from '../paleta'

export function ModuloApagado({ id }: { id: IdModulo }) {
  const navegar = useNavigate()
  const m = moduloDe(id)
  const Icono = m.icono
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', px: 2, py: { xs: 4, sm: 8 } }}>
      <Paper variant="outlined" sx={{ maxWidth: 440, width: '100%', p: { xs: 2.5, sm: 3 }, textAlign: 'center', borderColor: PALETA.borde }}>
        <Icono sx={{ fontSize: 40, color: PALETA.apagado }} />
        <Typography component="h2" sx={{ fontWeight: 600, fontSize: 17, mt: 1 }}>{m.nombre}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{mensajeModulo(id)}</Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mt: 2 }}>
          <Button variant="contained" onClick={() => navegar('/', DESDE_MENU)}>Ir al inicio</Button>
          {esAdmin() && <Button onClick={() => navegar('/admin?seccion=modulos')}>Encender</Button>}
        </Box>
      </Paper>
    </Box>
  )
}

export default function ConModulo({ id, children }: { id: IdModulo; children: React.ReactElement }) {
  useModulos()
  if (moduloActivo(id)) return children
  return (
    <Marco modulo={id} opciones={[]}>
      <ModuloApagado id={id} />
    </Marco>
  )
}

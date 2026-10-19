/**
 * GUÍA DEL PROCESO: los pasos del trámite, en orden, de un vistazo.
 *
 * Pedido de Edison (2026-09-05): «que cuando alguien ingrese al sistema sepa
 * desde dónde comenzar y cuál es el siguiente paso». La misma numeración que
 * llevan los botones (ver BotonPaso.tsx), aquí puesta en fila para leer el
 * proceso completo:
 *
 *   1 Redactar → 2 Enviar a revisión → 3 Generar oficial → 4 Firmar →
 *   5 Enviar → 6 Cargo de recepción → 7 Registrar en el STD
 *
 * Dos usos:
 *   · En la BANDEJA, sin documento: la guía general, plegada, para el que
 *     entra por primera vez o no se acuerda del orden.
 *   · Dentro de un DOCUMENTO: la misma fila pero con su avance real — lo
 *     hecho atenuado y con check, y resaltado el paso que toca ahora.
 *
 * Los pasos los define el backend (`servicios/tramite.py::ETAPAS`), no este
 * archivo: cambiar el proceso es cambiar un solo lugar.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import { PALETA } from '../paleta'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RouteIcon from '@mui/icons-material/Route'
import { api } from '../api'
import type { Etapa } from '../flujo'
import { RutaPasos } from './Paso'

const CLAVE_PLEGADO = 'sgdp_guia_flujo_abierta'

/** Compatibilidad: la fila de pasos ES la ruta única (componentes/Paso.tsx). */
export function FilaPasos({ etapas }: { etapas: Etapa[]; compacto?: boolean }) {
  return <RutaPasos etapas={etapas} orientacion={false} />
}

/**
 * Guía general para la bandeja (sin documento). Se pliega y recuerda si el
 * usuario la dejó cerrada: sirve al que empieza y no estorba al que ya sabe.
 */
export default function GuiaFlujo() {
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [abierta, setAbierta] = useState(() => {
    try {
      // Plegada de entrada (Edison 2026-10-01: la bandeja debe ir directo a lo
      // que toca); se abre con un toque y se recuerda si la dejan abierta.
      return localStorage.getItem(CLAVE_PLEGADO) === 'si'
    } catch {
      return false
    }
  })

  useEffect(() => {
    api<Etapa[]>('/api/tipos/etapas')
      .then(setEtapas)
      .catch(() => setEtapas([]))
  }, [])

  const alternar = () => {
    setAbierta((v) => {
      try {
        localStorage.setItem(CLAVE_PLEGADO, v ? 'no' : 'si')
      } catch {
        /* modo privado: la preferencia es best-effort */
      }
      return !v
    })
  }

  if (etapas.length === 0) return null

  return (
    <Paper sx={{ px: 1.5, py: 0.75, mb: 1.5, bgcolor: PALETA.superficieTenue, borderRadius: 2.5 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <RouteIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          Ruta del documento
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={alternar} aria-label="Mostrar u ocultar la ruta">
          {abierta ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={abierta}>
        <Box sx={{ pt: 1, pb: 0.5, maxWidth: 900 }}>
          <RutaPasos etapas={etapas} orientacion={false} />
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            Cada botón lleva el número de su paso.
          </Typography>
        </Box>
      </Collapse>
    </Paper>
  )
}

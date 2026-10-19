/**
 * BOTÓN DEL MÓDULO — en el celular y la tableta (< 900 px) las secciones y acciones del módulo
 * dejan la franja de pestañas y pasan a un botón flotante abajo a la derecha, sobre la barra
 * inferior, el mismo del chat (2026-10-12, pedido de Edison).
 *
 * Forma (rediseño del mismo día, con la foto de WhatsApp de Edison: «botones que se ocultan; no
 * siempre se muestran; se ocultan solos al elegir una opción y vuelve a ser un solo botón; los
 * íconos con sombra pero pequeños; primero el nombre y luego el ícono»): al tocar el botón, las
 * opciones se despliegan HACIA ARRIBA como botoncitos redondos de 40 px con sombra, cada uno con
 * su nombre en una etiqueta a la izquierda; el botón grande pasa a «cerrar». Elegir una opción,
 * tocar fuera o pulsar Esc lo recoge. Secciones con ícono en tinta, acciones (crear, incorporar) con
 * ícono arena; la sección actual va rellena de tinta (2026-10-19). Lo pinta el Marco, una vez para todos los
 * módulos, con las opciones de `navegacion.ts`.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Fab from '@mui/material/Fab'
import Typography from '@mui/material/Typography'
import AppsIcon from '@mui/icons-material/Apps'
import CloseIcon from '@mui/icons-material/Close'
import { PALETA } from '../paleta'
import type { Modulo, Opcion } from '../navegacion'

/** Separación del botón al borde (la misma del «Nueva conversación» del chat). */
export const MARGEN_FLOTANTE = 16
/** Lo que el contenido deja libre al final para que el botón no tape la última fila. */
export const RESERVA_FLOTANTE = 80

const SOMBRA = PALETA.sombraFlotante

function Opcion1({ o, actual, alPulsar, orden, abierta }: { o: Opcion; actual: boolean; alPulsar: () => void; orden: number; abierta: boolean }) {
  const Icono = o.icono
  const colorIcono = actual ? PALETA.sobrePrimario : o.accion ? PALETA.dorado : PALETA.guinda
  return (
    <ButtonBase
      onClick={alPulsar}
      aria-current={actual ? 'page' : undefined}
      tabIndex={abierta ? 0 : -1}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.25, borderRadius: 3,
        // Entrada escalonada desde el botón: la más cercana primero.
        opacity: abierta ? 1 : 0, transform: abierta ? 'none' : 'translateY(12px) scale(0.9)',
        transition: `opacity 140ms ease ${abierta ? orden * 25 : 0}ms, transform 160ms ease ${abierta ? orden * 25 : 0}ms`,
        pointerEvents: abierta ? 'auto' : 'none',
      }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: 13.5, fontWeight: actual ? 700 : 500, color: actual ? 'primary.main' : 'text.primary',
          bgcolor: 'background.paper', px: 1.25, py: 0.5, borderRadius: 1.5, boxShadow: SOMBRA, whiteSpace: 'nowrap',
        }}
      >
        {o.etiqueta}
      </Typography>
      <Box
        component="span"
        sx={{
          width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: '0 0 auto',
          bgcolor: actual ? PALETA.guinda : 'background.paper', color: colorIcono, boxShadow: SOMBRA,
          '& svg': { fontSize: 20 },
        }}
      >
        <Icono />
      </Box>
    </ButtonBase>
  )
}

export default function BotonModulo({
  modulo,
  opciones,
  esActual,
  alIr,
  abajo,
}: {
  modulo: Modulo
  /** Las opciones que la cuenta puede usar (ya filtradas). */
  opciones: Opcion[]
  esActual: (o: Opcion) => boolean
  alIr: (o: Opcion) => void
  /** Distancia al borde inferior (más alta si hay barra inferior). */
  abajo: string
}) {
  const [abierta, setAbierta] = useState(false)
  // Arriba las acciones (crear, incorporar), abajo las secciones: la sección más usada queda junto al pulgar.
  const lista = [...opciones.filter((o) => o.accion), ...opciones.filter((o) => !o.accion)]
  const ir = (o: Opcion) => {
    setAbierta(false)
    alIr(o)
  }
  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierta])
  const z = (t: { zIndex: { appBar: number } }) => t.zIndex.appBar - 1
  return (
    <>
      {/* Velo: tocar fuera recoge las opciones. */}
      <Box
        onClick={() => setAbierta(false)}
        aria-hidden
        sx={{
          position: 'fixed', inset: 0, zIndex: z, bgcolor: `${PALETA.fondo}B8`,
          opacity: abierta ? 1 : 0, pointerEvents: abierta ? 'auto' : 'none', transition: 'opacity 140ms ease',
        }}
      />
      <Box
        role="menu"
        aria-label={`Secciones y acciones de ${modulo.nombre}`}
        aria-hidden={!abierta}
        sx={{
          position: 'fixed', right: MARGEN_FLOTANTE + 8, bottom: `calc(${abajo} + 68px)`, zIndex: z,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1.25,
          maxHeight: `calc(100dvh - ${abajo} - 140px)`, overflowY: 'auto', py: 0.5, pl: 1,
          // Recogido, la columna (invisible) no debe atrapar los toques: tapaba los botones del contenido
          // que quedaban detrás, a la derecha (ensayo de la rendición, 2026-10-18).
          pointerEvents: abierta ? 'auto' : 'none',
        }}
      >
        {lista.map((o, i) => (
          <Opcion1 key={o.ruta} o={o} actual={esActual(o)} alPulsar={() => ir(o)} orden={lista.length - 1 - i} abierta={abierta} />
        ))}
      </Box>
      <Fab
        color="primary"
        aria-label={abierta ? 'Cerrar las opciones' : `Opciones de ${modulo.nombre}`}
        aria-expanded={abierta}
        onClick={() => setAbierta((a) => !a)}
        sx={{ position: 'fixed', right: MARGEN_FLOTANTE, bottom: abajo, zIndex: z }}
      >
        <Box component="span" sx={{ display: 'grid', placeItems: 'center', transition: 'transform 160ms ease', transform: abierta ? 'rotate(90deg)' : 'none' }}>
          {abierta ? <CloseIcon /> : <AppsIcon />}
        </Box>
      </Fab>
    </>
  )
}

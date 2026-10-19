/**
 * UN SOLO LENGUAJE VISUAL para los pasos del trámite (Edison 2026-09-05:
 * «casi siete formas diferentes de numerar»; «sutil, elegante y funcional»,
 * inspirado en el diseño corporativo de IBM).
 *
 * Tres piezas, y ninguna otra en todo el sistema:
 *
 *   · `NumeroPaso`  — el círculo de un paso, con su estado. Es EL MISMO
 *                     dibujo en los botones de la barra, en la ruta del
 *                     trámite y en las secciones de archivos.
 *                       pendiente : borde gris, número gris
 *                       actual    : relleno color de la casa, número blanco
 *                       hecho     : borde color de la casa, check
 *                       opcional  : borde punteado
 *   · `SubNumero`   — el «1.2» de los campos y secciones del formulario: un
 *                     rótulo pequeño, en cifras tabulares, gris. Igual dentro
 *                     de la etiqueta de un campo que en el título de una
 *                     sección. `Rotulo` lo pega al texto.
 *   · `RutaPasos`   — el indicador de progreso lineal (estilo Carbon de IBM):
 *                     círculos unidos por una línea fina, etiqueta debajo, y
 *                     una sola frase de orientación: «Siguiente: …».
 *
 * Todo lo que sea número de paso en la pantalla pasa por aquí. Si algo se ve
 * distinto en dos sitios, el error está en el sitio, no en este archivo.
 */
import Box from '@mui/material/Box'
import { PALETA } from '../paleta'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import type { Etapa } from '../flujo'

// Paleta de los pasos: un gris neutro para lo pendiente y el color de la casa
// para lo actual y lo hecho. Nada más.
const GRIS = PALETA.apagado
const GRIS_LINEA = PALETA.borde
// Paso observado: el aviso de la paleta (dorado oscuro de la marca, paleta.ts), el mismo de
// «parcial»/«clave temporal» en Estilo.tsx. Sin naranja ni amarillo.
const AMBAR = PALETA.aviso

/** El círculo de un paso. `sobreOscuro` = va sobre la barra de color. */
export function NumeroPaso({
  paso,
  sobreOscuro = false,
  tamano = 20,
  siempreNumero = false,
}: {
  paso: Etapa
  sobreOscuro?: boolean
  tamano?: number
  /** El número aun con el paso hecho (sin check): donde otra marca ya dice el estado. */
  siempreNumero?: boolean
}) {
  const primario = sobreOscuro ? '#fff' : 'primary.main' // sobreOscuro: sobre una barra siempre oscura (visores)
  const observado = paso.estado === 'observado'
  const color = observado
    ? AMBAR
    : paso.actual || paso.hecho ? primario : sobreOscuro ? 'rgba(255,255,255,.7)' : GRIS
  return (
    <Box
      component="span"
      aria-label={`Paso ${paso.orden}`}
      sx={{
        width: tamano,
        height: tamano,
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        boxSizing: 'border-box',
        fontSize: Math.round(tamano * 0.55),
        fontWeight: 600,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        border: '1.5px',
        borderStyle: paso.opcional && !paso.hecho ? 'dashed' : 'solid',
        borderColor: color,
        bgcolor: observado ? AMBAR : paso.actual ? primario : 'transparent',
        color: observado ? PALETA.sobrePrimario : paso.actual ? (sobreOscuro ? 'primary.main' : 'primary.contrastText') : color,
        transition: 'all .15s',
      }}
    >
      {observado ? '!' : paso.hecho && !paso.actual && !siempreNumero ? <CheckIcon sx={{ fontSize: Math.round(tamano * 0.65) }} /> : paso.orden}
    </Box>
  )
}

/** «1.2» — sub-numeral de un campo o sección del paso 1 (Redactar). */
export function SubNumero({ n }: { n: string | number }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        mr: 0.75,
        fontSize: '0.78em',
        fontWeight: 600,
        letterSpacing: '0.02em',
        fontVariantNumeric: 'tabular-nums',
        color: GRIS,
        verticalAlign: 'baseline',
      }}
    >
      {n}
    </Box>
  )
}

/** Etiqueta con su sub-numeral delante: `<Rotulo n="1.2">Asunto</Rotulo>`.
 *  Sin `n` devuelve el texto tal cual. */
export function Rotulo({ n, children }: { n?: string | number; children: React.ReactNode }) {
  if (n === undefined || n === null || n === '') return <>{children}</>
  return (
    <>
      <SubNumero n={n} />
      {children}
    </>
  )
}

/**
 * Indicador de progreso lineal. Círculos unidos por una línea de 1 px (la
 * línea ya recorrida va en color de la casa), etiqueta corta debajo. Con
 * `orientacion` (por defecto) añade la frase «Siguiente: …» al pie.
 */
export function RutaPasos({
  etapas,
  orientacion = true,
  compacto = false,
}: {
  etapas: Etapa[]
  /** Muestra «Siguiente: …» debajo. */
  orientacion?: boolean
  /** Sin etiquetas (solo círculos y línea), para espacios estrechos. */
  compacto?: boolean
}) {
  const actual = etapas.find((e) => e.actual)
  const observada = etapas.find((e) => e.estado === 'observado')
  const completo = etapas.length > 0 && etapas.every((e) => e.hecho || e.opcional)
  return (
    <Box>
      {/* En el celular la ruta entera no cabe (8 pasos × 56 px): se desplaza
          dentro de su recuadro en vez de ensanchar la página. */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto' }}>
        {etapas.map((e, i) => {
          const siguiente = etapas[i + 1]
          // La línea que sale de un paso va «recorrida» si ese paso ya está
          // hecho (o es opcional y el siguiente ya empezó).
          const recorrida = e.hecho || (e.opcional && Boolean(siguiente?.hecho || siguiente?.actual))
          return (
            <Box
              key={e.clave}
              sx={{
                flex: i < etapas.length - 1 ? 1 : '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                minWidth: compacto ? 0 : 56,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Tooltip
                  title={`Paso ${e.orden} · ${e.titulo}${e.opcional ? ' (opcional)' : ''}. ${e.ayuda}`}
                >
                  <span>
                    <NumeroPaso paso={e} />
                  </span>
                </Tooltip>
                {i < etapas.length - 1 && (
                  <Box
                    sx={{
                      flex: 1,
                      height: '1px',
                      mx: 0.75,
                      bgcolor: recorrida ? 'primary.main' : GRIS_LINEA,
                      opacity: recorrida ? 0.55 : 1,
                    }}
                  />
                )}
              </Box>
              {!compacto && (
                <Typography
                  variant="caption"
                  sx={{
                    mt: 0.5,
                    pr: 1,
                    lineHeight: 1.2,
                    fontSize: 11,
                    color: e.actual ? 'primary.main' : e.hecho ? 'text.primary' : 'text.secondary',
                    fontWeight: e.actual ? 700 : 400,
                    opacity: e.hecho && !e.actual ? 0.75 : 1,
                  }}
                >
                  {e.titulo}
                  {e.opcional && (
                    <Box component="span" sx={{ display: 'block', fontSize: 10, color: GRIS }}>
                      opcional
                    </Box>
                  )}
                  {e.estado === 'observado' && (
                    <Box component="span" sx={{ display: 'block', fontSize: 10, color: AMBAR, fontWeight: 700 }}>
                      observado
                    </Box>
                  )}
                </Typography>
              )}
            </Box>
          )
        })}
      </Box>
      {orientacion && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: compacto ? 0.75 : 1 }}>
          <ArrowForwardIcon sx={{ fontSize: 14, color: observada ? AMBAR : completo ? 'success.main' : 'primary.main' }} />
          <Typography variant="caption" sx={{ color: observada ? AMBAR : completo ? 'success.main' : 'primary.main', fontWeight: 600 }}>
            {observada
              ? `Observado en «${observada.titulo}»: subsane y vuelva a enviar`
              : completo
                ? 'Trámite completo'
                : actual
                  ? `Siguiente: ${actual.titulo}`
                  : 'Sin paso pendiente'}
          </Typography>
          {actual && !completo && !observada && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', md: 'block' } }}>
              — {actual.ayuda}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  )
}

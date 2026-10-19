/**
 * GUÍA DEL DOCUMENTO en la redacción (Edison 2026-10-01: «hacer intuitiva la
 * gestión documental, la redacción y la bandeja»):
 *
 *   - `SiguientePaso`: arriba del formulario, lo que toca ahora, para qué y
 *     su botón. Sale de `tramite.etapas` (el mismo catálogo numerado de la
 *     barra, servicios/tramite.py), así que no inventa nada: si el documento
 *     volvió observado, lo dice; si el trámite terminó, también.
 *   - `IndiceSecciones`: el formulario es largo; un índice fijo (Seguimiento ·
 *     Datos · Cuerpo · Anexos · Archivos) salta a cada parte y marca en cuál
 *     se está.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import { etapaActual, type Etapa } from '../flujo'
import { PALETA } from '../paleta'

/** Lo que hace el botón de cada paso (los mismos de la barra superior). */
export interface AccionesPaso {
  // Sin guardar, vista previa ni generar en un documento FIRMADO en solo
  // lectura (bloqueoFirma.ts, 2026-10-06): el paso se explica sin botón.
  guardar?: () => void
  vistaPrevia?: () => void
  revision?: () => void
  generar?: () => void
  enviar?: () => void
  /** Ir a una sección del formulario (archivos: firmado y cargo; seguimiento: STD). */
  irA: (seccion: string) => void
  /** Abre el registro en el STD directamente (si no, lleva al seguimiento). */
  registrarStd?: () => void
}

/** Botón de cada `accion` del catálogo de etapas. */
function botonDe(accion: string, a: AccionesPaso): { texto: string; alPulsar?: () => void } {
  switch (accion) {
    case 'redactar': return { texto: 'Guardar', alPulsar: a.guardar }
    case 'previsualizar': return { texto: 'Ver la vista previa', alPulsar: a.vistaPrevia }
    case 'revision': return { texto: 'Enviar a revisión', alPulsar: a.revision }
    case 'generar': return { texto: 'Generar oficial', alPulsar: a.generar }
    case 'firmado': return { texto: 'Subir el firmado', alPulsar: () => a.irA('archivos') }
    case 'enviar': return { texto: 'Abrir la mesa de partes', alPulsar: a.enviar }
    case 'recepcion': return { texto: 'Subir el cargo', alPulsar: () => a.irA('archivos') }
    case 'std': return { texto: 'Registrar en el STD', alPulsar: a.registrarStd ?? (() => a.irA('seguimiento')) }
    default: return { texto: '' }
  }
}

// `sinBoton`: la pantalla ya tiene la acción del paso en su barra (el editor de
// documentos): la tarjeta solo explica, sin repetir el botón (2026-10-06).
export function SiguientePaso({ etapas, acciones, ocupado, sinBoton = false }: { etapas?: Etapa[]; acciones: AccionesPaso; ocupado: boolean; sinBoton?: boolean }) {
  if (!etapas?.length) return null
  const actual = etapaActual(etapas)
  const observada = etapas.find((e) => e.estado === 'observado')
  const completo = etapas.every((e) => e.hecho || e.opcional)
  const hechos = etapas.filter((e) => e.hecho && !e.opcional).length
  const total = etapas.filter((e) => !e.opcional).length

  if (completo || !actual) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.5, mb: 1.5, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
        <CheckCircleIcon sx={{ color: 'success.main' }} />
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Trámite completo: el documento recorrió todos sus pasos.</Typography>
      </Box>
    )
  }
  const enObservacion = Boolean(observada)
  // Observado: primero leer qué corregir (en el seguimiento, arriba).
  const boton = enObservacion ? { texto: 'Ver observaciones', alPulsar: () => acciones.irA('seguimiento') } : botonDe(actual.accion, acciones)
  return (
    <Box
      sx={{
        display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, p: 1.5, mb: 1.5, borderRadius: 2,
        // Mismo estilo que los avisos del tema: tarjeta clara con borde fino, sin franja lateral
        // (2026-10-19); el color va solo en el punto del paso.
        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, color: enObservacion ? PALETA.aviso : PALETA.primario, bgcolor: `${enObservacion ? PALETA.aviso : PALETA.primario}1A` }}>
          {enObservacion ? <ReportProblemOutlinedIcon sx={{ fontSize: 19 }} /> : actual.orden}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: enObservacion ? PALETA.aviso : 'text.secondary' }}>
            {enObservacion ? `Observado en «${observada!.titulo}»` : `Siguiente paso · ${hechos} de ${total} hechos`}
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 650, lineHeight: 1.3 }}>
            {enObservacion ? 'Corrija lo observado y vuelva a enviarlo' : actual.titulo}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.4 }}>
            {enObservacion ? 'Están en el seguimiento, junto a cada campo.' : actual.ayuda}
          </Typography>
        </Box>
      </Box>
      {boton.alPulsar && !(sinBoton && !enObservacion) && (
        <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={boton.alPulsar} disabled={ocupado} sx={{ flexShrink: 0, whiteSpace: 'nowrap', alignSelf: { xs: 'flex-end', sm: 'center' } }}>
          {boton.texto}
        </Button>
      )}
    </Box>
  )
}

export interface SeccionIndice {
  id: string
  texto: string
  /** Número pequeño (observaciones, archivos…); 0 no se muestra. */
  n?: number
}

/**
 * Índice del formulario. `contenedor` es lo que se desplaza: la columna en
 * escritorio, la ventana (null) en el celular. Cada sección lleva el id
 * `sec-<id>` y `scrollMarginTop` para no quedar bajo el índice.
 */
export function IndiceSecciones({ secciones, contenedor, fijo, vertical = false }: { secciones: SeccionIndice[]; contenedor: HTMLElement | null; fijo: boolean; vertical?: boolean }) {
  const [activa, setActiva] = useState(secciones[0]?.id ?? '')
  useEffect(() => {
    const blanco: HTMLElement | Window = contenedor ?? window
    const medir = () => {
      const tope = (contenedor?.getBoundingClientRect().top ?? 0) + 70
      let actual = secciones[0]?.id ?? ''
      for (const s of secciones) {
        const el = document.getElementById(`sec-${s.id}`)
        if (el && el.getBoundingClientRect().top <= tope) actual = s.id
      }
      setActiva(actual)
    }
    medir()
    blanco.addEventListener('scroll', medir, { passive: true })
    return () => blanco.removeEventListener('scroll', medir)
  }, [contenedor, secciones])

  const irA = (id: string) => {
    setActiva(id)
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  if (vertical) {
    // Carril VERTICAL a la izquierda del formulario (Edison 2026-10-10): las partes del
    // documento una bajo otra, con la activa marcada por una raya a la izquierda.
    return (
      <Box component="nav" aria-label="Partes del documento" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, position: 'sticky', top: 8 }}>
        {secciones.map((s) => {
          const sel = activa === s.id
          return (
            <Box
              key={s.id}
              component="button"
              type="button"
              onClick={() => irA(s.id)}
              sx={{
                textAlign: 'left', border: 0, bgcolor: 'transparent', cursor: 'pointer', px: 1.25, py: 0.6, fontSize: 13, fontFamily: 'inherit',
                borderRadius: 1, fontWeight: sel ? 700 : 500, color: sel ? 'primary.main' : 'text.secondary',
                boxShadow: sel ? 'inset 3px 0 0 currentColor' : 'inset 3px 0 0 transparent',
                '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              {s.n ? `${s.texto} · ${s.n}` : s.texto}
            </Box>
          )
        })}
      </Box>
    )
  }
  return (
    <Box
      component="nav"
      aria-label="Partes del documento"
      sx={{
        display: 'flex', overflowX: 'auto', mb: 1.5, borderBottom: '1px solid', borderColor: 'divider', '&::-webkit-scrollbar': { display: 'none' },
        ...(fijo ? { position: 'sticky', top: 0, zIndex: 4, bgcolor: 'background.default' } : {}),
      }}
    >
      {secciones.map((s) => {
        const sel = activa === s.id
        // Pestañas subrayadas, como las etapas de la bandeja (sin cajas).
        return (
          <Box
            key={s.id}
            component="button"
            type="button"
            onClick={() => irA(s.id)}
            sx={{
              flexShrink: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', px: 1.5, py: 0.9, fontSize: 13.5, fontFamily: 'inherit',
              fontWeight: sel ? 700 : 500, color: sel ? 'primary.main' : 'text.secondary',
              boxShadow: sel ? 'inset 0 -2px 0 currentColor' : 'none', '&:hover': { color: 'primary.main' },
            }}
          >
            {s.n ? `${s.texto} · ${s.n}` : s.texto}
          </Box>
        )
      })}
    </Box>
  )
}

/** Alto del índice fijo (la barra de formato del cuerpo se pega debajo). */
export const ALTO_INDICE = 38

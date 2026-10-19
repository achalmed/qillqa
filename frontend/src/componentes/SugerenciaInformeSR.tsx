/**
 * SugerenciaInformeSR — el oficio que presenta un informe de Semana de Representación
 * reconoce su informe (2026-10-06, Edison: «al crear el oficio que presenta el informe,
 * el sistema debe identificar el informe y adjuntarlo; si hay varios, mostrarlos»).
 *
 * Mira lo que hay en pantalla (asunto, referencia, sumilla) contra las semanas
 * (`GET /api/documentos/{id}/informe-sr`). Si la elección es inequívoca y el documento
 * aún NO tiene número (no hay firma que anular), lo asocia solo y lo dice con un
 * «Deshacer». Si no, pregunta: «¿Adjuntar el Informe SR-02 (setiembre de 2026)?», con
 * los otros candidatos a un clic. Adjuntar pasa por la puerta de los adjuntos: con el
 * documento firmado, rige el aviso de anulación de siempre (vigencia.ts).
 */
import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemText from '@mui/material/ListItemText'
import { api } from '../api'
import { conConfirmacion, MENSAJE_NO_GUARDADO, textoAnulacion, type Anulacion } from '../vigencia'
import { EVENTO_ADJUNTOS } from './Adjuntos'
import { avisarRelaciones } from './PopupReferencias'

interface Candidato {
  semana_id: number
  codigo: string
  tema: string
  periodo: string
  puntaje: number
  motivos: string[]
  tiene_pdf: boolean
  isr: string | null
}
interface Respuesta {
  aplica: boolean
  confiable: boolean
  asociados: { semana_id: number; adjunto_id: number | null; texto: string }[]
  candidatos: Candidato[]
}
interface Asociado {
  ok: boolean
  ya_estaba: boolean
  adjunto_id: number | null
  sin_pdf?: boolean
  etiqueta?: string
  firmado_invalidado?: boolean
  anulacion?: Anulacion | null
}

const nombre = (c: Candidato) => `Informe ${c.codigo}${c.periodo ? ` (${c.periodo})` : ''}`
const claveDescarte = (id: string) => `sgdp_isr_descartado_${id}`

export default function SugerenciaInformeSR({
  documentoId,
  tipo,
  numerado,
  campos,
  alAvisar,
  alCambiar,
}: {
  documentoId: string
  tipo: string
  numerado: boolean
  campos: Record<string, string>
  alAvisar: (tipo: 'success' | 'error' | 'info' | 'warning', texto: string) => void
  /** Tras asociar o deshacer (refrescar visor y estado). */
  alCambiar: () => void
}) {
  const [r, setR] = useState<Respuesta | null>(null)
  const [hecho, setHecho] = useState<{ c: Candidato; adjunto: number | null; auto: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [descartado, setDescartado] = useState(() => {
    try {
      return localStorage.getItem(claveDescarte(documentoId)) === '1'
    } catch {
      return false
    }
  })
  const intentoAuto = useRef(false)
  const aplicaATipo = ['oficio', 'oficio_multiple', 'memorando', 'carta'].includes(tipo)
  const { asunto = '', referencia = '', sumilla = '' } = campos

  useEffect(() => {
    if (!aplicaATipo || descartado) return
    const t = window.setTimeout(() => {
      const q = new URLSearchParams({ asunto, referencia, sumilla })
      api<Respuesta>(`/api/documentos/${documentoId}/informe-sr?${q}`)
        .then(setR)
        .catch(() => setR(null))
    }, 700)
    return () => window.clearTimeout(t)
  }, [documentoId, aplicaATipo, descartado, asunto, referencia, sumilla])

  const asociar = async (c: Candidato, auto: boolean) => {
    setOcupado(true)
    setMenu(null)
    try {
      const res = await conConfirmacion((confirmar) =>
        api<Asociado>(`/api/documentos/${documentoId}/informe-sr`, {
          method: 'POST',
          body: JSON.stringify({ semana_id: c.semana_id, confirmar_anulacion: confirmar }),
        }),
      )
      if (res === null) {
        alAvisar('warning', MENSAJE_NO_GUARDADO)
        return
      }
      setHecho({ c, adjunto: res.adjunto_id, auto })
      window.dispatchEvent(new Event(EVENTO_ADJUNTOS))
      avisarRelaciones(`doc:${documentoId}`)
      alCambiar()
      if (res.firmado_invalidado) alAvisar('warning', textoAnulacion(res.anulacion))
      else if (res.sin_pdf) alAvisar('info', `${nombre(c)} quedó relacionado; aún no tiene PDF aprobado para adjuntar.`)
      else if (!auto) alAvisar('success', `${nombre(c)} adjuntado y relacionado con este documento.`)
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo adjuntar el informe.')
    } finally {
      setOcupado(false)
    }
  }

  // Asociación automática: solo si es inequívoca, hay PDF y el documento no tiene número.
  useEffect(() => {
    if (!r || intentoAuto.current || descartado || numerado || hecho) return
    if (!r.aplica || !r.confiable || r.asociados.length || !r.candidatos[0]?.tiene_pdf) return
    intentoAuto.current = true
    void asociar(r.candidatos[0], true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, numerado, descartado, hecho])

  const descartar = () => {
    try {
      localStorage.setItem(claveDescarte(documentoId), '1')
    } catch {
      /* sin localStorage: se descarta solo en esta vista */
    }
    setDescartado(true)
  }

  const deshacer = async () => {
    if (!hecho) return
    setOcupado(true)
    try {
      if (hecho.adjunto) {
        const quitado = await conConfirmacion((confirmar) =>
          api(`/api/documentos/${documentoId}/adjuntos/${hecho.adjunto}?confirmar_anulacion=${confirmar}`, { method: 'DELETE' }),
        )
        if (quitado === null) return
      }
      await api(`/api/documentos/${documentoId}/informe-sr/${hecho.c.semana_id}`, { method: 'DELETE' })
      window.dispatchEvent(new Event(EVENTO_ADJUNTOS))
      avisarRelaciones(`doc:${documentoId}`)
      alCambiar()
      setHecho(null)
      descartar()
      alAvisar('info', 'Se quitó el informe. No se volverá a proponer en este documento.')
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo deshacer.')
    } finally {
      setOcupado(false)
    }
  }

  if (hecho) {
    return (
      <Alert
        severity="success"
        sx={{ mb: 1.5 }}
        onClose={() => setHecho(null)}
        action={
          <Button size="small" color="inherit" onClick={() => void deshacer()} disabled={ocupado}>
            Deshacer
          </Button>
        }
      >
        {hecho.auto ? 'Se reconoció que este documento presenta el ' : 'Quedó adjunto el '}
        <b>{nombre(hecho.c)}</b>
        {hecho.auto ? ': quedó adjunto y relacionado.' : ' y relacionado con este documento.'}
      </Alert>
    )
  }
  if (!r || !r.aplica || descartado || r.asociados.length || !r.candidatos.length) return null
  const [primero, ...otros] = r.candidatos
  return (
    <Alert
      severity="info"
      sx={{ mb: 1.5 }}
      action={
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button size="small" variant="contained" onClick={() => void asociar(primero, false)} disabled={ocupado}>
            Adjuntar
          </Button>
          {otros.length > 0 && (
            <Button size="small" onClick={(e) => setMenu(e.currentTarget)} disabled={ocupado}>
              Otro…
            </Button>
          )}
          <Button size="small" color="inherit" onClick={descartar} disabled={ocupado}>
            No
          </Button>
        </Box>
      }
    >
      ¿Este documento presenta el <b>{nombre(primero)}</b>
      {primero.tema ? <> sobre {primero.tema}</> : null}? {primero.tiene_pdf ? 'Adjúntelo con un clic: queda relacionado.' : 'Aún no tiene PDF aprobado; quedará relacionado.'}
      {primero.motivos.length > 0 && (
        <Box component="span" sx={{ display: 'block', fontSize: 12, opacity: 0.75 }}>Por qué: {primero.motivos.join(', ')}.</Box>
      )}
      <Menu open={menu !== null} anchorEl={menu} onClose={() => setMenu(null)}>
        {otros.map((c) => (
          <MenuItem key={c.semana_id} onClick={() => void asociar(c, false)}>
            <ListItemText primary={nombre(c)} secondary={c.tema} />
          </MenuItem>
        ))}
      </Menu>
    </Alert>
  )
}

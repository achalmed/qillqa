/**
 * PEGAR UN DOCUMENTO REDACTADO (2026-10-12): el bloque `documento-administrativo` que produce el skill
 * `documentos-administrativos` (oficio, memorando, solicitud, acta…) prellena el formulario del editor
 * y su cuerpo. Reusa `PegarResultado` contra `POST /api/pegar/interpretar` (sin cruces con la base);
 * el editor aplica lo aceptado en memoria y la persona guarda con el botón de siempre. Lo que viaja
 * como lista (destinatarios, referencias, adjuntos, copias) se vuelve «una por línea», que es como
 * el formulario lo guarda; el cuerpo en párrafos se vuelve HTML para TipTap.
 */
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import PegarResultado from './PegarResultado'
import type { PegadoAplicado, RespuestaPegado } from '../pegar'

const LISTAS = new Set(['destinatario_nombre', 'referencia', 'anexo', 'con_copia'])

/** Un valor del pegado como lo guarda el formulario (texto; listas una por línea). */
export const textoCampo = (v: unknown): string => (Array.isArray(v) ? v.map(String).join('\n') : v == null ? '' : String(v))

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** El cuerpo en párrafos (líneas en blanco entre ellos; listas con «-» o «1.») → HTML de TipTap. */
export function htmlDeCuerpo(texto: string): string {
  const bloques = (texto ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const html: string[] = []
  for (const b of bloques) {
    const lineas = b.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lineas.length > 1 && lineas.every((l) => /^[-•*]\s+/.test(l)))
      html.push(`<ul>${lineas.map((l) => `<li><p>${escapar(l.replace(/^[-•*]\s+/, ''))}</p></li>`).join('')}</ul>`)
    else if (lineas.length > 1 && lineas.every((l) => /^\d+[.)]\s+/.test(l)))
      html.push(`<ol>${lineas.map((l) => `<li><p>${escapar(l.replace(/^\d+[.)]\s+/, ''))}</p></li>`).join('')}</ol>`)
    else html.push(`<p>${lineas.map(escapar).join('<br>')}</p>`)
  }
  return html.join('')
}

export default function PegarDocumento({ abierto, tipo, campos, cuerpoTexto, alCerrar, alAplicar, textoInicial }: {
  abierto: boolean
  /** Texto que llega ya pegado (del chat, `?pegar=<id>`): se lee solo al abrir. */
  textoInicial?: string
  /** Tipo documental del documento abierto (oficio, memorando…): se avisa si el bloque dice otro. */
  tipo: string
  campos: Record<string, string>
  cuerpoTexto: string
  alCerrar: () => void
  /** Campos (ya como texto) y, si cambió, el HTML del cuerpo. */
  alAplicar: (campos: Record<string, string>, cuerpoHtml: string | null, aplicado: PegadoAplicado) => void
}) {
  return (
    <Dialog open={abierto} onClose={alCerrar} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>Pegar el documento redactado</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Pegue aquí la respuesta de la IA (el bloque que empieza por «tipo: documento-administrativo»). El número lo pone el sistema al generar.
        </Typography>
        <PegarResultado
          ruta="/api/pegar/interpretar"
          tipos={['documento-administrativo']}
          cuerpoExtra={{ tipos: ['documento-administrativo'] }}
          actual={{ ...campos, cuerpo: cuerpoTexto }}
          abiertoAlInicio
          textoInicial={textoInicial}
          etiquetaBoton="Pegar el resultado del prompt"
          alAplicar={(c, aplicado, r: RespuestaPegado) => {
            const salida: Record<string, string> = { ...campos }
            let cuerpoHtml: string | null = null
            for (const [k, v] of Object.entries(c)) {
              if (k === 'cuerpo') {
                if (aplicado.aceptadas.has('cuerpo')) cuerpoHtml = htmlDeCuerpo(String(v ?? ''))
              } else if (k === 'tipo') {
                /* el tipo documental no se cambia desde el pegado */
              } else if (LISTAS.has(k) || typeof v !== 'object') salida[k] = textoCampo(v)
            }
            alAplicar(salida, cuerpoHtml, aplicado)
            const dicho = String(r.campos.tipo ?? '')
            if (dicho && dicho !== tipo) console.info(`El bloque dice ${dicho}; este documento es ${tipo}.`)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

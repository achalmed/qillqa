/**
 * colab/ida_y_vuelta.ts — JSON → Yjs → JSON con el MISMO transformador y esquema
 * del servidor de colaboración (fase 5, criterio «ida y vuelta exacta»).
 *
 * Lee de stdin {"esquema": "parte" | "documento", "items": [{"id", "contenido"}]}
 * y escribe en stdout [{"id", "vuelta", "vuelta_editor", "normalizado", "error"}]:
 *   vuelta         lo que el servidor compartido devolvería tras convertir a Yjs
 *                  (es lo que queda como borrador vivo);
 *   vuelta_editor  ese mismo JSON tal como lo ve el editor al cargarlo;
 *   normalizado    el ORIGINAL tal como lo ve el editor al cargarlo.
 * La vara justa es vuelta_editor == normalizado: Yjs no guarda los atributos que
 * valen null (colwidth, el tipo de una lista) ni un `content` vacío, y
 * ProseMirror los repone con su valor por omisión al cargar.
 * Lo usa scripts/colab_ida_y_vuelta.py, que además compara el LaTeX.
 */
import { getSchema } from '@tiptap/core'
import { Node as NodoPM } from '@tiptap/pm/model'
import { TiptapTransformer } from '@hocuspocus/transformer'
import { extensionesDocumento, extensionesParte } from '../src/extensiones/esquema.ts'

const entrada = JSON.parse(await new Response(process.stdin as unknown as ReadableStream).text()) as {
  esquema: 'parte' | 'documento'
  items: { id: string; contenido: object }[]
}
const extensiones = entrada.esquema === 'documento' ? extensionesDocumento({ historial: false }) : extensionesParte({ historial: false })
const esquema = getSchema(extensiones)

const salida = entrada.items.map(({ id, contenido }) => {
  try {
    const normalizado = NodoPM.fromJSON(esquema, contenido).toJSON()
    const vuelta = TiptapTransformer.fromYdoc(TiptapTransformer.toYdoc(contenido, 'default', extensiones), 'default')
    const vuelta_editor = NodoPM.fromJSON(esquema, vuelta).toJSON()
    return { id, vuelta, vuelta_editor, normalizado, error: null }
  } catch (e) {
    return { id, vuelta: null, vuelta_editor: null, normalizado: null, error: String(e) }
  }
})
process.stdout.write(JSON.stringify(salida))

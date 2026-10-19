/**
 * colab/servidor.ts — servidor de EDICIÓN SIMULTÁNEA de Qillqa (fase 5, 2026-10-01).
 *
 * Hocuspocus une lo que escriben varias personas a la vez en una parte de un
 * proyecto (`pl:…`) o en un documento (`doc:…`, paso 5.6) (Yjs) y reparte cursores y selecciones. NO decide permisos ni
 * escribe en la base: pregunta a la API (`/api/colab/acceso`, con la sesión de
 * la persona) y le entrega el estado Yjs y el JSON derivado
 * (`/api/colab/estado`, con el secreto interno). Diseño y razones:
 * docs/plataforma/fase-5-edicion-simultanea.md; reglas: backend/app/servicios/colab.py.
 *
 * Vive dentro de `frontend/` a propósito: comparte node_modules con el editor,
 * así hay UNA sola copia de TipTap, ProseMirror y Yjs, y el esquema con que se
 * convierte Yjs → JSON es el mismo del navegador (extensiones/esquema.ts). Un
 * nodo que el servidor no conociera se perdería al convertir.
 *
 * Uso:    node colab/servidor.ts        (Node ≥ 22.18 ejecuta TypeScript sin compilar)
 * Entorno: JWT_SECRET (obligatoria: de ella sale el secreto interno),
 *          SGDP_API (por omisión http://127.0.0.1:8000), COLAB_PUERTO (8001).
 * Lo levantan iniciar.sh (producción) y scripts/instancia_prueba.sh (8011).
 */
import { createHmac } from 'node:crypto'
import { Server } from '@hocuspocus/server'
import { TiptapTransformer } from '@hocuspocus/transformer'
import * as Y from 'yjs'
import { extensionesDocumento, extensionesParte } from '../src/extensiones/esquema.ts'

const API = process.env.SGDP_API ?? 'http://127.0.0.1:8000'
const PUERTO = Number(process.env.COLAB_PUERTO ?? 8001)
const JWT_SECRET = process.env.JWT_SECRET ?? ''
if (!JWT_SECRET) {
  console.error('[colab] Falta JWT_SECRET en el entorno (iniciar.sh la toma del .env).')
  process.exit(1)
}
// Igual que servicios/colab.py::secreto_interno.
const SECRETO = createHmac('sha256', JWT_SECRET).update('sgdp-colab').digest('hex')
// Fragmento Yjs que usa @tiptap/extension-collaboration por omisión.
const CAMPO = 'default'
const EXTENSIONES_PARTE = extensionesParte({ historial: false })
const EXTENSIONES_DOCUMENTO = extensionesDocumento({ historial: false })
// Documentos: los datos del formulario (asunto, destinatario…) viajan en este
// mapa del mismo estado Yjs, clave → texto; el editor lo escribe y lo lee.
const MAPA_CAMPOS = 'campos'
const esDocumento = (nombre: string) => nombre.startsWith('doc:')
// Salas de presencia (2026-10-05): solo awareness (quién está y en qué campo);
// nada que cargar ni guardar.
const esSala = (nombre: string) => nombre.startsWith('sala:')
const extensionesDe = (nombre: string) => (esDocumento(nombre) ? EXTENSIONES_DOCUMENTO : EXTENSIONES_PARTE)

const hora = () => new Date().toISOString().slice(11, 19)
const registrar = (...x: unknown[]) => console.log(`[colab ${hora()}]`, ...x)

interface Contexto {
  usuario_id: number
  nombre: string
}

// Textos cuya generación ya no es la vigente: no se vuelven a guardar.
const descartados = new Set<string>()

async function guardar(
  instancia: { closeConnections: (nombre?: string) => void },
  nombre: string,
  documento: Y.Doc,
  contenido: object | null,
  usuarioId: number | null,
  campos: Record<string, unknown> | null = null,
): Promise<void> {
  const r = await fetch(`${API}/api/colab/estado`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Colab-Secreto': SECRETO },
    body: JSON.stringify({
      documento: nombre,
      estado: Buffer.from(Y.encodeStateAsUpdate(documento)).toString('base64'),
      contenido,
      campos,
      usuario_id: usuarioId,
    }),
  })
  if (r.status === 404) {
    // El documento se eliminó con el texto abierto (2026-10-12: un borrador eliminado tumbó el
    // servidor a las 14:32 y nadie más pudo guardar en compartido hasta reiniciarlo). No hay
    // dónde guardar: se descarta y se cierra a quien lo tenía abierto.
    descartados.add(nombre)
    registrar(`«${nombre}» ya no existe en la API; se descarta y se cierra.`)
    instancia.closeConnections(nombre)
    return
  }
  if (r.status === 409) {
    // Apagaron el modo, restauraron una versión o guardaron por turnos: este
    // texto quedó viejo. Se cierra a todos (ResetConnection) y cada editor
    // recarga la generación nueva; nada viejo vuelve a la base.
    descartados.add(nombre)
    registrar(`«${nombre}» quedó viejo (${(await r.text()).slice(0, 120)}); se cierra.`)
    instancia.closeConnections(nombre)
    return
  }
  if (!r.ok) {
    // El texto sigue en memoria y en cada navegador: se reintenta en el
    // próximo cambio. Se avisa fuerte porque es lo único que puede perder algo
    // (si además se cierran todas las pestañas).
    throw new Error(`la API no guardó «${nombre}»: ${r.status} ${(await r.text()).slice(0, 200)}`)
  }
}

const servidor = Server.configure({
  name: 'sgdp-colab',
  port: PUERTO,
  address: '127.0.0.1',
  // Guardar a los 10 s de calma, y como mucho cada 30 s escribiendo seguido.
  debounce: 10_000,
  maxDebounce: 30_000,
  quiet: true,

  async onAuthenticate({ token, documentName, connection }): Promise<Contexto> {
    const r = await fetch(`${API}/api/colab/acceso?documento=${encodeURIComponent(documentName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      registrar(`acceso negado a «${documentName}»: ${r.status}`)
      throw new Error('acceso negado')
    }
    const d = (await r.json()) as { usuario_id: number; nombre: string; lectura: boolean }
    // Invitados: ven el texto y los cursores, no escriben.
    if (d.lectura) connection.readOnly = true
    return { usuario_id: d.usuario_id, nombre: d.nombre }
  },

  async onLoadDocument({ document, documentName, instance }) {
    if (esSala(documentName)) return
    const r = await fetch(`${API}/api/colab/estado?documento=${encodeURIComponent(documentName)}`, {
      headers: { 'X-Colab-Secreto': SECRETO },
    })
    if (!r.ok) throw new Error(`no se pudo cargar «${documentName}»: ${r.status}`)
    const d = (await r.json()) as { estado: string | null; contenido: object; campos?: Record<string, unknown> }
    if (d.estado) {
      Y.applyUpdate(document, Buffer.from(d.estado, 'base64'))
      return
    }
    // Primera vez en compartido: el estado se construye desde el JSON vigente
    // y se guarda YA. Si no, una segunda carga lo construiría otra vez con
    // otra identidad y un navegador que guardó el primero lo duplicaría.
    const inicial = TiptapTransformer.toYdoc(d.contenido, CAMPO, extensionesDe(documentName))
    if (d.campos) {
      const mapa = inicial.getMap(MAPA_CAMPOS)
      for (const [clave, valor] of Object.entries(d.campos)) mapa.set(clave, typeof valor === 'string' ? valor : JSON.stringify(valor))
    }
    Y.applyUpdate(document, Y.encodeStateAsUpdate(inicial))
    await guardar(instance, documentName, document, null, null)
    registrar(`«${documentName}» construido desde la última versión.`)
  },

  async onStoreDocument({ document, documentName, context, instance }) {
    if (descartados.has(documentName) || esSala(documentName)) return
    const contenido = TiptapTransformer.fromYdoc(document, CAMPO)
    const campos = esDocumento(documentName) ? (document.getMap(MAPA_CAMPOS).toJSON() as Record<string, unknown>) : null
    await guardar(instance, documentName, document, contenido, (context as Contexto | undefined)?.usuario_id ?? null, campos)
  },

  async afterUnloadDocument({ documentName }) {
    descartados.delete(documentName)
  },
})

// Ningún error suelto apaga el servidor (2026-10-12): Hocuspocus vuelve a lanzar el error de un
// guardado fallido como promesa rechazada sin capturar, y Node termina el proceso. Se registra y
// se sigue: el texto queda en memoria y en cada navegador, y el próximo cambio reintenta.
process.on('unhandledRejection', (e) => registrar(`error sin capturar (el servidor sigue): ${e instanceof Error ? e.message : String(e)}`))
process.on('uncaughtException', (e) => registrar(`excepción sin capturar (el servidor sigue): ${e.message}`))

servidor.listen().then(() => registrar(`escuchando en 127.0.0.1:${PUERTO} · API ${API}`))

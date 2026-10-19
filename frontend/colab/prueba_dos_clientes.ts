/**
 * colab/prueba_dos_clientes.ts — prueba de punta a punta de la edición simultánea
 * (fase 5, pasos 5.2 y 5.4) con DOS clientes Yjs reales, sin navegador.
 *
 * Crea un proyecto de prueba, enciende el modo compartido en una parte y
 * comprueba: escritura a la vez sin pérdidas ni duplicados; un cliente que se
 * desconecta, escribe y vuelve; el borrador vivo en la API; «Guardar versión»;
 * que apagar con texto sin versionar se niega; y que restaurar una versión
 * cierra a los conectados y el texto nuevo NO se duplica con el viejo.
 *
 * Contra la INSTANCIA DE PRUEBA (scripts/instancia_prueba.sh), nunca producción:
 *   SGDP_USUARIO=prueba SGDP_CLAVE="$(cat ~/.local/state/sgdp-prueba/clave_admin)" \
 *     node frontend/colab/prueba_dos_clientes.ts
 * SGDP_BASE (http://127.0.0.1:8010) y COLAB_URL (ws://127.0.0.1:8011) la cambian.
 * Tarda ~2 min: el servidor guarda a los 10 s de calma (30 s como mucho).
 */
import { HocuspocusProvider } from '@hocuspocus/provider'
import { TiptapTransformer } from '@hocuspocus/transformer'
import * as Y from 'yjs'

const BASE = process.env.SGDP_BASE ?? 'http://127.0.0.1:8010'
const COLAB = process.env.COLAB_URL ?? 'ws://127.0.0.1:8011'
if (/:8000\b/.test(BASE)) {
  console.error('Esta prueba crea proyectos y escribe: no se corre contra producción (8000).')
  process.exit(2)
}
let token = ''
let fallas = 0
const ok = (cond: boolean, que: string) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${que}`)
  if (!cond) fallas++
}
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function api<T>(ruta: string, init: RequestInit = {}): Promise<{ estado: number; datos: T }> {
  const r = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  })
  return { estado: r.status, datos: (await r.json().catch(() => null)) as T }
}

interface Parte { clave: string; version: number; generacion: number; sin_versionar: boolean; borrador: object | null; contenido: object }
const parte = async (pid: number, clave: string) =>
  (await api<{ secciones: Parte[] }>(`/api/proyectos/${pid}`)).datos.secciones.find((s) => s.clave === clave)!

function cliente(nombre: string) {
  const doc = new Y.Doc()
  let cerradoPorReinicio = false
  let sincronizado: () => void = () => {}
  const listo = new Promise<void>((r) => (sincronizado = r))
  const p = new HocuspocusProvider({
    url: COLAB, name: nombre, document: doc, token,
    onSynced: () => sincronizado(),
    onClose: ({ event }) => {
      if (event.code === 4205) cerradoPorReinicio = true
    },
  })
  return { p, doc, listo, reiniciado: () => cerradoPorReinicio }
}

/** Añade un párrafo al final, como lo haría el editor. */
function escribir(doc: Y.Doc, texto: string) {
  const frag = doc.getXmlFragment('default')
  const parrafo = new Y.XmlElement('paragraph')
  const t = new Y.XmlText()
  t.insert(0, texto)
  parrafo.insert(0, [t])
  frag.insert(frag.length, [parrafo])
}
const textoDe = (json: unknown): string =>
  !json || typeof json !== 'object' ? '' : ((json as { text?: string }).text ?? '') + ((json as { content?: unknown[] }).content ?? []).map(textoDe).join('\n')
const veces = (todo: string, x: string) => todo.split(x).length - 1

async function esperar(cond: () => Promise<boolean>, segundos: number): Promise<boolean> {
  for (let i = 0; i < segundos; i++) {
    if (await cond()) return true
    await pausa(1000)
  }
  return false
}

// --- 0. Sesión y proyecto de prueba -----------------------------------------
const usuario = process.env.SGDP_USUARIO ?? 'prueba'
const login = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ usuario, clave: process.env.SGDP_CLAVE ?? '' }) })
if (login.estado !== 200) {
  console.error(`No se pudo entrar como «${usuario}» (${login.estado}). ¿SGDP_CLAVE?`)
  process.exit(2)
}
token = login.datos.token
const creado = await api<{ id: number }>('/api/proyectos', { method: 'POST', body: JSON.stringify({ titulo: `Prueba de edición simultánea ${new Date().toISOString()}` }) })
const pid = creado.datos.id
const clave = (await api<{ secciones: Parte[] }>(`/api/proyectos/${pid}`)).datos.secciones[0].clave
console.log(`Proyecto de prueba ${pid}, parte «${clave}».`)
ok((await api(`/api/proyectos/${pid}`, { method: 'PATCH', body: JSON.stringify({ colaboracion: true }) })).estado === 200, 'encender la edición simultánea')
let s = await parte(pid, clave)
const nombre = `pl:${pid}:${clave}:${s.generacion}`

// --- 1. Dos clientes escriben a la vez ---------------------------------------
const A = cliente(nombre)
const B = cliente(nombre)
await Promise.all([A.listo, B.listo])
escribir(A.doc, 'Párrafo de A')
escribir(B.doc, 'Párrafo de B')
await pausa(800)
const jA = TiptapTransformer.fromYdoc(A.doc, 'default')
const jB = TiptapTransformer.fromYdoc(B.doc, 'default')
ok(JSON.stringify(jA) === JSON.stringify(jB), 'los dos ven exactamente el mismo texto')
ok(veces(textoDe(jA), 'Párrafo de A') === 1 && veces(textoDe(jA), 'Párrafo de B') === 1, 'cada párrafo una sola vez (sin pérdidas ni duplicados)')

// --- 2. Uno se desconecta, escribe y vuelve ---------------------------------
B.p.disconnect()
escribir(B.doc, 'B sin conexión')
escribir(A.doc, 'A mientras tanto')
await pausa(500)
ok(!textoDe(TiptapTransformer.fromYdoc(A.doc, 'default')).includes('B sin conexión'), 'mientras B está desconectado, A no ve lo suyo')
await B.p.connect()
await pausa(1500)
const tA = textoDe(TiptapTransformer.fromYdoc(A.doc, 'default'))
ok(['Párrafo de A', 'Párrafo de B', 'B sin conexión', 'A mientras tanto'].every((x) => veces(tA, x) === 1), 'al volver, lo de B se une con lo de A, sin duplicar')
ok(JSON.stringify(TiptapTransformer.fromYdoc(A.doc, 'default')) === JSON.stringify(TiptapTransformer.fromYdoc(B.doc, 'default')), 'y los dos convergen al mismo texto')

// --- 3. Borrador vivo en la API ----------------------------------------------
ok(await esperar(async () => { s = await parte(pid, clave); return s.sin_versionar && textoDe(s.borrador).includes('A mientras tanto') }, 45), 'la API recibe el borrador vivo (sin crear versión)')
ok(s.version === 0, 'el borrador no creó versión')

// --- 4. Guardar versión -------------------------------------------------------
const guardado = await api<{ version: number }>(`/api/proyectos/${pid}/secciones/${clave}`, {
  method: 'PUT', body: JSON.stringify({ contenido: TiptapTransformer.fromYdoc(A.doc, 'default'), version_base: s.version, generacion: s.generacion, nota: 'prueba de dos clientes' }),
})
ok(guardado.estado === 200 && guardado.datos.version === 1, '«Guardar versión» crea la v1 sin candado')
s = await parte(pid, clave)
ok(!s.sin_versionar, 'tras guardar, no queda nada sin versionar')
const viejo = await api(`/api/proyectos/${pid}/secciones/${clave}`, { method: 'PUT', body: JSON.stringify({ contenido: {}, version_base: s.version, generacion: s.generacion - 1 }) })
ok(viejo.estado === 409, 'un editor en una generación vieja no puede guardar')

// --- 5. Apagar con texto sin versionar se niega -----------------------------
escribir(A.doc, 'Texto posterior a la v1')
ok(await esperar(async () => (await parte(pid, clave)).sin_versionar, 45), 'lo escrito después vuelve a ser borrador vivo')
const apagar = await api<{ detail: { codigo: string } }>(`/api/proyectos/${pid}`, { method: 'PATCH', body: JSON.stringify({ colaboracion: false }) })
ok(apagar.estado === 409 && apagar.datos.detail.codigo === 'borradores_sin_version', 'apagar con texto sin versionar se niega (no se pierde nada)')

// --- 6. Restaurar: cierra a los conectados y no duplica ----------------------
ok((await api(`/api/proyectos/${pid}/secciones/${clave}/versiones/1/restaurar`, { method: 'POST' })).estado === 200, 'restaurar la v1 en compartido')
s = await parte(pid, clave)
ok(s.generacion === Number(nombre.split(':')[3]) + 1, 'restaurar sube la generación')
escribir(A.doc, 'Escrito sobre el texto viejo')
ok(await esperar(async () => A.reiniciado() && B.reiniciado(), 45), 'el servidor cierra a los dos clientes del texto viejo (reinicio)')
A.p.destroy()
B.p.destroy()
const C = cliente(`pl:${pid}:${clave}:${s.generacion}`)
await C.listo
const tC = textoDe(TiptapTransformer.fromYdoc(C.doc, 'default'))
ok(veces(tC, 'Párrafo de A') === 1 && !tC.includes('Texto posterior a la v1') && !tC.includes('Escrito sobre el texto viejo'), 'la generación nueva es exactamente la v1 restaurada, sin duplicar ni arrastrar lo viejo')
const D = cliente(nombre)
const rechazado = await Promise.race([D.listo.then(() => false), pausa(4000).then(() => true)])
ok(rechazado, 'un cliente que intenta volver al texto viejo no entra')
D.p.destroy()

// --- 7. Limpieza --------------------------------------------------------------
C.p.destroy()
await pausa(500)
ok((await api(`/api/proyectos/${pid}`, { method: 'PATCH', body: JSON.stringify({ colaboracion: false }) })).estado === 200, 'apagar sin pendientes funciona')
console.log(fallas ? `\n${fallas} comprobación(es) FALLARON.` : '\nTodo bien.')
process.exit(fallas ? 1 : 0)

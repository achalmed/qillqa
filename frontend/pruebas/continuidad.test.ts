// Pruebas de la continuidad sin servidor (2026-10-18): la cola ampliada, «No enviados», «hacerlo
// al volver» y abrir desde la carpeta sincronizada. Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuerpoDe, destinoDe, filtrarEnEspera, textoLegible, type CambioPendiente } from '../src/sinconexion.ts'
import { accionesDe, agregarAccion, POR_QUE, rutaWebDe, type AccionAlVolver } from '../src/alvolver.ts'
import { construirMapa, entradaDe, versionDeRespuesta } from '../src/sync/carpetaLocal.ts'

const cambio = (p: Partial<CambioPendiente>): CambioPendiente => ({
  id: String(Math.random()), ruta: '/api/actuaciones', metodo: 'POST', cuerpo: '{}', rotulo: 'x', creado_en: 1, cuenta: 'ana', ...p,
})

test('en espera: solo las escrituras de esa ruta, de esa cuenta y que cumplen el filtro', () => {
  const cola = [
    cambio({ cuerpo: JSON.stringify({ entidad: 'doc:1', texto: 'llamó' }) }),
    cambio({ cuerpo: JSON.stringify({ entidad: 'doc:2', texto: 'otra' }) }),
    cambio({ cuerpo: JSON.stringify({ entidad: 'doc:1', texto: 'de otra cuenta' }), cuenta: 'luis' }),
    cambio({ ruta: '/api/documentos/1', metodo: 'PUT' }),
    cambio({ ruta: '/api/tareas/3/comentarios', cuerpo: JSON.stringify({ texto: 'listo' }) }),
  ]
  const deDoc1 = filtrarEnEspera(cola, '/api/actuaciones', 'ana', (c) => c.entidad === 'doc:1')
  assert.deepEqual(deDoc1.map((c) => cuerpoDe(c).texto), ['llamó'])
  assert.equal(filtrarEnEspera(cola, '/api/tareas/3/comentarios', 'ana').length, 1)
  assert.equal(filtrarEnEspera(cola, '/api/documentos/1', 'ana').length, 0) // un PUT no es «en espera»
  assert.deepEqual(cuerpoDe(cambio({ cuerpo: 'no es json' })), {})
})

test('al subir la cola: qué se hace con cada respuesta, sin perder nada', () => {
  assert.equal(destinoDe(200, 'POST'), 'subido')
  assert.equal(destinoDe(201, 'PUT'), 'subido')
  // Sesión vencida o clave temporal: el cambio se conserva (antes un 401 lo tiraba).
  assert.equal(destinoDe(401, 'POST'), 'detener')
  assert.equal(destinoDe(428, 'PUT'), 'detener')
  // Un guardado de documento rechazado se aparta para «Cargar mis cambios».
  assert.equal(destinoDe(409, 'PUT'), 'apartar')
  assert.equal(destinoDe(422, 'PUT'), 'apartar')
  assert.equal(destinoDe(404, 'PUT'), 'no_enviado')
  // Lo demás rechazado queda en «No enviados»; un 5xx espera.
  assert.equal(destinoDe(403, 'POST'), 'no_enviado')
  assert.equal(destinoDe(503, 'POST'), 'esperar')
})

test('el texto de lo no enviado se puede copiar', () => {
  assert.equal(textoLegible({ cuerpo: JSON.stringify({ texto: 'Llamar a la UGEL' }) }), 'Llamar a la UGEL')
  assert.equal(textoLegible({ cuerpo: JSON.stringify({ titulo: 'Revisar PL', descripcion: '' }) }), 'Revisar PL')
  assert.equal(textoLegible({ cuerpo: JSON.stringify({ campos: { asunto: 'Pedido', fecha: '' } }) }), 'asunto: Pedido')
})

test('hacerlo al volver: una acción por tipo, ruta y cuenta; cada cuenta ve lo suyo', () => {
  const a = (p: Partial<AccionAlVolver>): AccionAlVolver => ({ id: String(Math.random()), tipo: 'numerar', rotulo: 'Numerar', ruta: '/documentos/5?al_volver=numerar', cuenta: 'ana', creado_en: 1, ...p })
  let lista = agregarAccion([], a({ rotulo: 'primera' }))
  lista = agregarAccion(lista, a({ rotulo: 'segunda' }))
  assert.equal(lista.length, 1)
  assert.equal(lista[0].rotulo, 'segunda')
  lista = agregarAccion(lista, a({ tipo: 'estado', ruta: '/documentos/5' }))
  lista = agregarAccion(lista, a({ cuenta: 'luis' }))
  assert.equal(accionesDe(lista, 'ana').length, 2)
  assert.equal(accionesDe(lista, 'luis').length, 1)
  assert.ok(POR_QUE.numerar.includes('servidor'))
})

test('de la ruta de la API a la pantalla que retoma la acción', () => {
  assert.equal(rutaWebDe('/api/documentos/12/adjuntos'), '/documentos/12')
  assert.equal(rutaWebDe('/api/proyectos/3/firmado'), '/proyectos/3')
  assert.equal(rutaWebDe('/api/semanas/9/generar'), '/informes/9')
  assert.equal(rutaWebDe('/api/entradas/4/pdf'), '/recibidos?ver=4')
  assert.equal(rutaWebDe('/api/chat/archivos'), '')
})

test('carpeta sincronizada: la versión de la respuesta es la del manifiesto', () => {
  // archivos.py: Last-Modified = mtime; el manifiesto: «tamaño-mtime en segundos».
  assert.equal(versionDeRespuesta(48213, 'Sat, 18 Oct 2026 15:04:05 GMT'), `48213-${Date.UTC(2026, 9, 18, 15, 4, 5) / 1000}`)
  assert.equal(versionDeRespuesta(10, null), null)
  assert.equal(versionDeRespuesta(10, 'no es fecha'), null)
})

test('carpeta sincronizada: el mapa tiene solo lo que quedó en la carpeta y es de su cuenta', () => {
  const items = [
    { ruta: 'Oficios/OF-0012-2026/OF-0012-2026_Pedido.pdf', version: '100-1', url: '/api/documentos/12/pdf' },
    { ruta: 'Oficios/OF-0012-2026/adjuntos/cargo.pdf', version: '50-1', url: '/api/documentos/12/adjuntos/7' },
    { ruta: 'Recibidos/2026-10/1234567_Oficio.pdf', version: '80-1', url: '/api/entradas/4/pdf' },
  ]
  const archivos = construirMapa(items, new Set([items[0].ruta, items[2].ruta]))
  assert.deepEqual(Object.keys(archivos).sort(), ['/api/documentos/12/pdf', '/api/entradas/4/pdf'])
  const mapa = { cuenta: 'Ana', carpeta: 'Qillqa', hecho_en: 1, archivos }
  // Los parámetros que solo rompen la caché no cambian el archivo.
  assert.equal(entradaDe(mapa, '/api/documentos/12/pdf?v=9', 'ana')?.ruta, items[0].ruta)
  assert.equal(entradaDe(mapa, '/api/documentos/12/adjuntos/7', 'ana'), null)
  // Otra cuenta en el mismo equipo no abre lo que sincronizó otra.
  assert.equal(entradaDe(mapa, '/api/documentos/12/pdf', 'luis'), null)
  assert.equal(entradaDe(null, '/api/documentos/12/pdf', 'ana'), null)
})

// Pruebas del modo sin conexión y de la publicación segura (2026-10-13). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aPodar, almacenEnMemoria, archivoGuardable, cacheable, claveDe, configurar, guardar, guardarArchivo,
  limpiar, normalizarCuenta, recuperar, recuperarArchivo, rutaEstable, textoFranja,
} from '../src/cachelecturas.ts'
import { debeRecargar } from '../src/arranque.ts'
import { esDeLaCuenta } from '../src/sinconexion.ts'
import { trozos } from '../vite.publicacion.ts'

test('se guardan las lecturas de las pantallas, también el chat', () => {
  for (const r of ['/api/documentos', '/api/entradas', '/api/agenda/hoy', '/api/tareas?vista=mias', '/api/chat/canales',
    '/api/chat/canales/41/mensajes?limite=50', '/api/directorio/personas?q=', '/api/proyectos/3', '/api/semanas', '/api/notificaciones']) {
    assert.equal(cacheable(r), true, r)
  }
})

test('nunca: mesa de partes pública, tokens, sesiones, claves, presencia ni sondeos del chat', () => {
  for (const r of ['/api/publico/mesa/tramite/ABC', '/api/auth/login', '/api/agenda/token', '/api/colab/acceso?documento=x',
    '/api/contrasenas', '/api/contrasenas/3/accesos', '/api/prensa/sesion', '/api/presencia', '/api/health',
    '/api/chat/canales/41/mensajes?desde_id=9&limite=200', '/api/chat/canales/41/mensajes?antes_id=9', '/api/chat/buscar?q=hola',
    '/api/admin/solicitudes-clave', '/api/agenda.ics?token=x', '/api/documentos/3/pdf', '/api/fototeca', '/api/documentos/3/adjuntos/1']) {
    assert.equal(cacheable(r), false, r)
  }
  assert.equal(cacheable('/assets/index.js'), false)
})

test('archivos: PDF e imágenes del chat sí; lo público y los tokens no', () => {
  assert.equal(archivoGuardable('/api/documentos/116/pdf'), true)
  assert.equal(archivoGuardable('/api/chat/archivos/7'), true)
  assert.equal(archivoGuardable('/api/publico/mesa/x/pdf'), false)
  assert.equal(archivoGuardable('/api/entradas/por-confirmar/abc/token/pdf'), false)
})

test('la clave lleva la cuenta y no depende de los parámetros que rompen la caché', () => {
  assert.equal(normalizarCuenta('  Edison '), 'edison')
  assert.equal(rutaEstable('/api/documentos/1/pdf?v=3'), '/api/documentos/1/pdf')
  assert.equal(rutaEstable('/api/x?q=a&t=9&b=2'), '/api/x?q=a&b=2')
  assert.equal(claveDe('ana', '/api/x?_=1'), 'ana|/api/x')
  assert.notEqual(claveDe('ana', '/api/x'), claveDe('luis', '/api/x'))
})

test('podar: se va lo usado hace más tiempo, por cantidad y por bytes', () => {
  const json = Array.from({ length: 5 }, (_, i) => ({ clave: `j${i}`, cuenta: 'a', tipo: 'json' as const, tam: 1, usado_en: i }))
  assert.deepEqual(aPodar(json, { json: 3, archivos: 9, bytesArchivos: 9 }).sort(), ['j0', 'j1'])
  const arch = [
    { clave: 'viejo', cuenta: 'a', tipo: 'archivo' as const, tam: 60, usado_en: 1 },
    { clave: 'medio', cuenta: 'a', tipo: 'archivo' as const, tam: 30, usado_en: 2 },
    { clave: 'nuevo', cuenta: 'a', tipo: 'archivo' as const, tam: 50, usado_en: 3 },
  ]
  assert.deepEqual(aPodar(arch, { json: 9, archivos: 9, bytesArchivos: 100 }), ['viejo'])
  assert.deepEqual(aPodar(arch, { json: 9, archivos: 1, bytesArchivos: 1000 }).sort(), ['medio', 'viejo'])
})

test('franja: hora de hoy, o día y hora si es de otro día', () => {
  const ahora = new Date(2026, 9, 13, 18, 0).getTime()
  assert.equal(textoFranja(new Date(2026, 9, 13, 9, 5).getTime(), ahora), 'Sin conexión · mostrando lo guardado a las 09:05')
  assert.equal(textoFranja(new Date(2026, 9, 12, 21, 40).getTime(), ahora), 'Sin conexión · mostrando lo guardado el 12/10, 21:40')
  assert.equal(textoFranja(null, ahora), 'Sin conexión · mostrando lo guardado en este equipo')
})

test('lo de una cuenta no se ve con otra, y se borra al usar otra o al cerrar sesión', async () => {
  let cuenta = 'ana'
  configurar(almacenEnMemoria(), () => cuenta)
  await guardar('/api/documentos', [{ id: 1 }], 10)
  assert.deepEqual((await recuperar('/api/documentos'))?.datos, [{ id: 1 }])
  cuenta = 'luis'
  assert.equal(await recuperar('/api/documentos'), null)
  await guardar('/api/documentos', [{ id: 2 }], 10)
  assert.deepEqual((await recuperar('/api/documentos'))?.datos, [{ id: 2 }])
  cuenta = 'ana'
  assert.equal(await recuperar('/api/documentos'), null, 'al entrar luis se borró lo de ana')
  await guardar('/api/documentos', [{ id: 3 }], 10)
  cuenta = 'luis'
  assert.equal(await recuperar('/api/documentos'), null, 'y al volver ana, lo de luis')
  await guardar('/api/documentos', [{ id: 4 }], 10)
  await limpiar()
  assert.equal(await recuperar('/api/documentos'), null)
})

test('sin cuenta no se guarda nada; lo prohibido tampoco', async () => {
  configurar(almacenEnMemoria(), () => '')
  await guardar('/api/documentos', [1], 1)
  assert.equal(await recuperar('/api/documentos'), null)
  configurar(almacenEnMemoria(), () => 'ana')
  await guardar('/api/auth/yo', { token: 'x' }, 1)
  assert.equal(await recuperar('/api/auth/yo'), null)
  await guardar('/api/documentos', [1], 4 * 1024 * 1024)
  assert.equal(await recuperar('/api/documentos'), null, 'más de 3 MB no se guarda')
})

test('los PDF se guardan y se recuperan como Blob, con límite de tamaño', async () => {
  configurar(almacenEnMemoria(), () => 'ana')
  await guardarArchivo('/api/documentos/1/pdf?v=2', new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
  const r = await recuperarArchivo('/api/documentos/1/pdf')
  assert.equal(await r?.blob.text(), '%PDF-1.7')
  await guardarArchivo('/api/documentos/2/pdf', new Blob([new Uint8Array(31 * 1024 * 1024)]))
  assert.equal(await recuperarArchivo('/api/documentos/2/pdf'), null)
})

test('arranque: una sola recarga por ventana ante un trozo que falta', () => {
  assert.equal(debeRecargar(null, 1000), true)
  assert.equal(debeRecargar(1000, 20_000), false)
  assert.equal(debeRecargar(1000, 40_000), true)
  assert.equal(debeRecargar(Number.NaN, 5), true)
})

test('cola: un cambio solo se envía con la sesión de su cuenta', () => {
  assert.equal(esDeLaCuenta({ cuenta: 'ana' }, 'ana'), true)
  assert.equal(esDeLaCuenta({ cuenta: 'ana' }, 'luis'), false)
  assert.equal(esDeLaCuenta({}, 'luis'), true, 'los de antes, sin cuenta, se envían como antes')
})

test('trozos: bibliotecas pesadas aparte, los íconos juntos y el código propio por página', () => {
  assert.equal(trozos('/x/node_modules/pdfjs-dist/build/pdf.mjs'), 'pdf')
  assert.equal(trozos('/x/node_modules/@tiptap/core/dist/index.js'), 'editor')
  assert.equal(trozos('/x/node_modules/y-prosemirror/src/y.js'), 'editor')
  assert.equal(trozos('/x/node_modules/yjs/dist/yjs.mjs'), 'colab')
  assert.equal(trozos('/x/node_modules/@mui/material/Button/Button.js'), 'mui')
  assert.equal(trozos('/x/node_modules/react-dom/client.js'), 'react')
  assert.equal(trozos('/x/node_modules/@mui/icons-material/esm/Add.js'), 'iconos')
  assert.equal(trozos('/x/src/paginas/Bandeja.tsx'), undefined)
})

test('respaldo local tras subir el guardado (2026-10-18): se retira si es lo mismo; si trae más, toma la versión nueva', async () => {
  const { respaldoTrasSubir } = await import('../src/sinconexion.ts')
  const subido = JSON.stringify({ campos: { asunto: 'A' }, cuerpo: { type: 'doc' }, version_base: 3 })
  assert.equal(respaldoTrasSubir(null, subido, 4), null)
  assert.equal(respaldoTrasSubir(JSON.stringify({ campos: { asunto: 'A' }, cuerpo: { type: 'doc' }, base: 3 }), subido, 4), null)
  const masNuevo = JSON.stringify({ campos: { asunto: 'A y B' }, cuerpo: { type: 'doc' }, base: 3 })
  assert.deepEqual(JSON.parse(respaldoTrasSubir(masNuevo, subido, 4)!), { campos: { asunto: 'A y B' }, cuerpo: { type: 'doc' }, base: 4 })
  assert.equal(respaldoTrasSubir(masNuevo, subido, null), masNuevo)
  assert.equal(respaldoTrasSubir('{no es json', subido, 4), '{no es json')
})

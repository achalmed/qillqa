// Pruebas de descargas.ts (2026-10-18): el tipo que se declara en «Guardar como…» y el error de carpeta
// desaparecida. Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carpetaDesaparecida, tipoParaGuardar } from '../src/descargas.ts'

test('el tipo de «Guardar como» sigue a la extensión; sin extensión conocida no se declara', () => {
  assert.deepEqual(tipoParaGuardar('OF-0012-2026_Asunto.pdf'), { description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } })
  assert.deepEqual(tipoParaGuardar('sgdp-mesa-de-partes.zip'), { description: 'Archivo comprimido', accept: { 'application/zip': ['.zip'] } })
  assert.deepEqual(tipoParaGuardar('sgdp-mesa-de-partes.xpi')?.accept, { 'application/x-xpinstall': ['.xpi'] })
  assert.equal(tipoParaGuardar('pedidos.MD')?.description, 'Texto Markdown')
  assert.equal(tipoParaGuardar('sin-extension'), null)
  assert.equal(tipoParaGuardar(''), null)
})

test('solo el NotFoundError (y los de permiso o estado) del navegador cuentan como carpeta desaparecida', () => {
  assert.ok(carpetaDesaparecida(new DOMException('A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError')))
  assert.ok(carpetaDesaparecida(new DOMException('', 'NotAllowedError')))
  assert.ok(!carpetaDesaparecida(new DOMException('', 'AbortError')))
  assert.ok(!carpetaDesaparecida(new Error('otra cosa')))
})

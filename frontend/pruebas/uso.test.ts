// Estadísticas de uso (2026-10-19): lo puro de src/uso.ts. Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anonimizarRuta, aparatoDe, detalleDeError, MAX_DETALLE, moduloDeRuta } from '../src/uso.ts'

test('la ruta viaja sin ids, query ni fragmento', () => {
  assert.equal(anonimizarRuta('/documentos/132?q=secreto#x'), '/documentos/:id')
  assert.equal(anonimizarRuta('/proyectos/5/word'), '/proyectos/:id/word')
  assert.equal(anonimizarRuta('/chat/abcdef0123456789abcd'), '/chat/:id')
  assert.equal(anonimizarRuta(''), '/')
  assert.equal(moduloDeRuta('/documentos/132'), 'documentos')
  assert.equal(moduloDeRuta('/'), 'inicio')
  assert.equal(moduloDeRuta('/admin?seccion=uso'), 'admin')
})

test('aparato por ancho y detalle del error recortado', () => {
  assert.equal(aparatoDe(375), 'celular'); assert.equal(aparatoDe(768), 'tableta'); assert.equal(aparatoDe(1440), 'escritorio')
  const d = detalleDeError('TypeError: x', 'TypeError: x\n    at f (chunk.js:1:2)\n    at g (chunk.js:3:4)')
  assert.equal(d, 'TypeError: x\nat f (chunk.js:1:2)\nat g (chunk.js:3:4)')
  assert.equal(detalleDeError('solo mensaje'), 'solo mensaje')
  assert.equal(detalleDeError('m'.repeat(2000), 'p'.repeat(2000)).length, MAX_DETALLE)
})

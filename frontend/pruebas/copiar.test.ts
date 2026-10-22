// Pruebas de lo que copia y descarga un documento (src/copiar.ts); antes en visorRapido.test.ts, que se fue con Qillqasqa
// (2026-10-22). Correr desde frontend/: node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totalDeCabecera } from '../src/copiar.ts'

test('X-Total-Paginas: lo que dice la cabecera, o el último conocido si no viene (un 304 sin ella)', () => {
  assert.equal(totalDeCabecera('3'), 3)
  assert.equal(totalDeCabecera('3', 7), 3)
  assert.equal(totalDeCabecera(null, 7), 7)
  assert.equal(totalDeCabecera(undefined), 1)
  assert.equal(totalDeCabecera('', 4), 4)
  assert.equal(totalDeCabecera('0', 4), 4)
  assert.equal(totalDeCabecera('abc', 4), 4)
})

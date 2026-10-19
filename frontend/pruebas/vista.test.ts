// Pruebas de la vista elegida (2026-10-18, src/vista.ts). Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALTO_BARRA, marcoDe, yaEs } from '../src/vista.ts'

test('sin marco cuando la ventana ya es de ese aparato o la vista es automática', () => {
  assert.equal(marcoDe('auto', { ancho: 1440, alto: 900 }), null)
  assert.equal(marcoDe('celular', { ancho: 375, alto: 812 }), null)
  assert.equal(marcoDe('tableta', { ancho: 768, alto: 1024 }), null)
  assert.equal(marcoDe('escritorio', { ancho: 1440, alto: 900 }), null)
  assert.ok(yaEs('tableta', 600) && !yaEs('tableta', 900))
})

test('celular y tableta en una pantalla ancha: a tamaño real, con el alto que quepa', () => {
  assert.deepEqual(marcoDe('celular', { ancho: 1440, alto: 900 }), { ancho: 390, alto: 900 - ALTO_BARRA - 32 > 844 ? 844 : 900 - ALTO_BARRA - 32, escala: 1 })
  assert.deepEqual(marcoDe('celular', { ancho: 1440, alto: 1200 }), { ancho: 390, alto: 844, escala: 1 })
  assert.deepEqual(marcoDe('tableta', { ancho: 1440, alto: 900 }), { ancho: 820, alto: 824, escala: 1 })
})

test('escritorio en un celular: reducido a escala y a todo el alto', () => {
  const m = marcoDe('escritorio', { ancho: 375, alto: 812 })!
  assert.equal(m.ancho, 1366)
  assert.equal(m.escala, Math.round(((375 - 32) / 1366) * 1000) / 1000)
  assert.ok(m.alto > 812)
})

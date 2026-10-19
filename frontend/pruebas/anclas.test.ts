// Pruebas de los comentarios anclados, parte pura (2026-10-19, src/extensiones/anclas.ts). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anclasDe, citaDe } from '../src/extensiones/anclas.ts'

const con = (texto: string, id: number) => ({ type: 'text', text: texto, marks: [{ type: 'comentario', attrs: { id } }] })
const DOC = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Hola ' }, con('mundo', 7), con(' cruel', 7), { type: 'text', text: '.' }] },
  { type: 'paragraph', content: [con('Otro', 9), { type: 'text', text: ' tramo' }] },
] }

test('las anclas salen con sus posiciones y los tramos vecinos del mismo comentario se funden', () => {
  assert.deepEqual(anclasDe(DOC), [
    { id: 7, de: 6, a: 17, texto: 'mundo cruel' },
    { id: 9, de: 20, a: 24, texto: 'Otro' },
  ])
  assert.deepEqual(anclasDe(null), [])
  assert.equal(citaDe(anclasDe(DOC), 7), 'mundo cruel')
  assert.equal(citaDe(anclasDe(DOC), 99), '')
  assert.equal(citaDe([{ id: 1, de: 0, a: 1, texto: 'a'.repeat(120) }], 1, 20).length, 20)
})

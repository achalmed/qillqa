// Preferencias de la cuenta (2026-10-19): lógica pura de src/modalidad.ts. Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limpiar, modalidadAlAbrir } from '../src/modalidad.ts'

test('limpiar solo deja claves y valores conocidos', () => {
  assert.deepEqual(limpiar({ modalidad_proyectos: 'word', modalidad_documentos: 'otra', x: 1 }), { modalidad_proyectos: 'word', modalidad_documentos: '' })
  assert.deepEqual(limpiar(null), { modalidad_proyectos: '', modalidad_documentos: '' })
})

test('la URL manda sobre la preferencia; un ?ir= va al formulario; sin nada, la preferencia', () => {
  assert.equal(modalidadAlAbrir('word', new URLSearchParams('modalidad=formulario')), 'formulario')
  assert.equal(modalidadAlAbrir('', new URLSearchParams('modalidad=word')), 'word')
  assert.equal(modalidadAlAbrir('word', new URLSearchParams('ir=parte:fundamentos')), 'formulario')
  assert.equal(modalidadAlAbrir('word', new URLSearchParams('')), 'word')
  assert.equal(modalidadAlAbrir('', new URLSearchParams('')), '')
  assert.equal(modalidadAlAbrir('formulario', new URLSearchParams('modalidad=rara')), 'formulario')
})

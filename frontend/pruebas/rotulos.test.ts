// Pruebas de rotuloCorto (etiquetas de campos en el celular). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotuloCorto } from '../src/rotulos.ts'

test('lo que va entre paréntesis pasa a la nota', () => {
  assert.deepEqual(rotuloCorto('Iniciales de responsabilidad (p. ej. ABC/xyz)', true),
    { corto: 'Iniciales de responsabilidad', nota: 'Opcional · p. ej. ABC/xyz' })
  assert.deepEqual(rotuloCorto('Referencia (leyes, oficios previos…)'),
    { corto: 'Referencia', nota: 'Leyes, oficios previos…' })
})

test('opcional sin paréntesis deja solo «Opcional»', () => {
  assert.deepEqual(rotuloCorto('Institución o entidad del destinatario', true),
    { corto: 'Institución o entidad del destinatario', nota: 'Opcional' })
})

test('sin paréntesis ni opcional no cambia nada', () => {
  assert.deepEqual(rotuloCorto('Asunto'), { corto: 'Asunto', nota: '' })
})

test('un «(opcional)» escrito en la etiqueta no se repite', () => {
  assert.deepEqual(rotuloCorto('Cargo (opcional)', true), { corto: 'Cargo', nota: 'Opcional' })
})

test('una etiqueta que es solo paréntesis se conserva', () => {
  assert.equal(rotuloCorto('(c.c.)').corto, '(c.c.)')
})

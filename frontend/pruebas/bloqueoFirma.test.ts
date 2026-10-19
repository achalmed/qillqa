// Pruebas de bloqueoFirma (documento firmado = solo lectura). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firmaEnCurso } from '../src/bloqueoFirma.ts'

test('manda lo que dice el servidor cuando lo dice', () => {
  assert.equal(firmaEnCurso({ firma_en_curso: false, estado: 'FIRMADO' }), false)
  assert.equal(firmaEnCurso({ firma_en_curso: true, estado: 'BORRADOR' }), true)
})

test('sin el dato del servidor, los estados firmado y enviado bloquean', () => {
  for (const estado of ['FIRMADO', 'ENVIADO', 'OBSERVADO_ENVIADO']) {
    assert.equal(firmaEnCurso({ estado }), true, estado)
  }
})

test('sin el dato del servidor, firmado cargado, cargo o STD bloquean', () => {
  assert.equal(firmaEnCurso({ estado: 'APROBADO', tramite: { firmado: true } }), true)
  assert.equal(firmaEnCurso({ estado: 'ARCHIVADO', tramite: { recepciones: 1 } }), true)
  assert.equal(firmaEnCurso({ estado: 'APROBADO', tramite: { std: true } }), true)
})

test('un borrador o un aprobado sin firma se edita libre', () => {
  assert.equal(firmaEnCurso({ estado: 'BORRADOR' }), false)
  assert.equal(firmaEnCurso({ estado: 'APROBADO', tramite: { firmado: false, std: false, recepciones: 0 } }), false)
})

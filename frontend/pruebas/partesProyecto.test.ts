// Partes editables de un proyecto (2026-10-19): mover y arrastrar, lógica pura de
// src/partesProyecto.ts. Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moverA, puedeMover } from '../src/partesProyecto.ts'

const P = [
  { clave: 'titulo', titulo: 'Título', grupo: 'formula', obligatoria: true, fija: true },
  { clave: 'sustantiva', titulo: 'Sustantiva', grupo: 'formula', obligatoria: true, fija: true },
  { clave: 'anexo-2', titulo: 'Anexo', grupo: 'formula', obligatoria: false },
  { clave: 'dcf', titulo: 'Finales', grupo: 'formula', obligatoria: false, fija: true },
  { clave: 'fundamentos', titulo: 'Fundamentos', grupo: 'exposicion', obligatoria: false },
  { clave: 'efecto', titulo: 'Efecto', grupo: 'exposicion', obligatoria: false },
]

test('solo se mueve dentro del grupo, nunca una fija ni el título', () => {
  assert.ok(puedeMover(P, 'efecto', 'fundamentos'))
  assert.ok(puedeMover(P, 'anexo-2', 'dcf'))
  assert.ok(!puedeMover(P, 'dcf', 'anexo-2'))          // fija
  assert.ok(!puedeMover(P, 'titulo', 'sustantiva'))    // título
  assert.ok(!puedeMover(P, 'efecto', 'dcf'))           // otro grupo
  assert.ok(!puedeMover(P, 'efecto', 'efecto'))
})

test('moverA pone la parte en el lugar del destino', () => {
  assert.deepEqual(moverA(P, 'efecto', 'fundamentos').slice(4), ['efecto', 'fundamentos'])
  assert.deepEqual(moverA(P, 'anexo-2', 'dcf').slice(1, 4), ['sustantiva', 'dcf', 'anexo-2'])
  assert.deepEqual(moverA(P, 'anexo-2', 'sustantiva').slice(0, 3), ['titulo', 'anexo-2', 'sustantiva'])
  assert.deepEqual(moverA(P, 'x', 'dcf'), P.map((p) => p.clave))
})

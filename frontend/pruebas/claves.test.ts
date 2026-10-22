// Pruebas de la copia de las claves viejas del navegador (src/claves.ts; la misma regla corre en index.html).
// Correr desde frontend/: node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveNueva, migrarClaves } from '../src/claves.ts'

const almacen = (inicial: Record<string, string>) => {
  const m = new Map(Object.entries(inicial))
  return {
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    m,
  }
}

test('la sesión, las preferencias y lo pendiente pasan a su nombre nuevo', () => {
  const a = almacen({ sgdp_token: 't', sgdp_rol: 'asesor', 'sgdp-mediateca-agrupar': 'album', sgdp_rendicion_borrador_7: '{}', otra: 'x' })
  assert.equal(migrarClaves(a), 4)
  assert.equal(a.getItem('qillqa_token'), 't')
  assert.equal(a.getItem('qillqa_rol'), 'asesor')
  assert.equal(a.getItem('qillqa-mediateca-agrupar'), 'album')
  assert.equal(a.getItem('qillqa_rendicion_borrador_7'), '{}')
  assert.equal(a.getItem('sgdp_token'), 't')   // la vieja se queda hasta la fase 7
  assert.equal(a.getItem('otra'), 'x')
})

test('no pisa lo que ya se escribió con el nombre nuevo y se puede repetir', () => {
  const a = almacen({ sgdp_token: 'viejo', qillqa_token: 'nuevo' })
  assert.equal(migrarClaves(a), 0)
  assert.equal(a.getItem('qillqa_token'), 'nuevo')
  assert.equal(migrarClaves(a), 0)
})

test('solo las claves que empiezan con el nombre viejo', () => {
  assert.equal(claveNueva('sgdp_vista'), 'qillqa_vista')
  assert.equal(claveNueva('tiqsi_token'), null)
  assert.equal(claveNueva('mi_sgdp'), null)
})

// Pruebas de la parte pura de «pegar el resultado de un prompt» (src/pegado.ts). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aceptadasPorOmision, aplicarDiferencias, origenDePegado, textoValor, type Diferencia } from '../src/pegado.ts'

const difs: Diferencia[] = [
  { clave: 'asunto', etiqueta: 'Asunto', actual: null, propuesto: 'Solicito apoyo', estado: 'nuevo', aceptar: true },
  { clave: 'clase', etiqueta: 'Clase', actual: 'carta', propuesto: 'oficio', estado: 'distinto', aceptar: true },
  { clave: 'atencion', etiqueta: 'Atención', actual: 'conocimiento', propuesto: 'gestionar', estado: 'dudoso', aceptar: false },
]

test('por omisión se aceptan nuevo y distinto, nunca dudoso', () => {
  assert.deepEqual([...aceptadasPorOmision(difs)].sort(), ['asunto', 'clase'])
})

test('aplicar solo vuelca lo aceptado y conserva lo demás', () => {
  const actual = { asunto: '', clase: 'carta', atencion: 'conocimiento', nota: 'x' }
  const r = aplicarDiferencias(difs, actual, new Set(['asunto']))
  assert.deepEqual(r, { asunto: 'Solicito apoyo', clase: 'carta', atencion: 'conocimiento', nota: 'x' })
  assert.deepEqual(origenDePegado(new Set(['asunto', 'clase'])), { asunto: 'pegado', clase: 'pegado' })
})

test('los valores se muestran legibles', () => {
  assert.equal(textoValor(null), '—')
  assert.equal(textoValor(['a', 'b']), 'a · b')
  assert.equal(textoValor(true), 'sí')
  assert.equal(textoValor({ norma: 'Ley 27444', dias: 30, vacio: '' }), 'norma: Ley 27444 · dias: 30')
})

import { tipoDelBloque, valorDelBloque } from '../src/pegado.ts'

test('tipoDelBloque lee el tipo del bloque aunque venga con mensaje delante', () => {
  const texto = 'Equipo, les paso lo del prompt:\n\ntipo: agenda-actividades\nversion: 1\nactividades:\n  - titulo: Sesión'
  assert.equal(tipoDelBloque(texto), 'agenda-actividades')
  assert.equal(tipoDelBloque('sin bloque'), '')
})

test('valorDelBloque devuelve el valor plano de una clave de primer nivel', () => {
  const texto = 'tipo: documento-administrativo\ntipo_documental: "oficio"\nasunto: Solicito apoyo\ncuerpo: |\n  Hola'
  assert.equal(valorDelBloque(texto, 'tipo_documental'), 'oficio')
  assert.equal(valorDelBloque(texto, 'asunto'), 'Solicito apoyo')
  assert.equal(valorDelBloque(texto, 'documento'), '')
})

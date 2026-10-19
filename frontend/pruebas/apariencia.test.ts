// Pruebas de la apariencia (2026-10-19, src/apariencia.ts). Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APARIENCIAS, leerApariencia, modoActual, modoEfectivo, prefiereOscuro } from '../src/apariencia.ts'
import { PALETA, PALETA_CLARA, PALETA_OSCURA } from '../src/paleta.ts'

test('la automática sigue al aparato; clara y oscura mandan', () => {
  assert.equal(modoEfectivo('auto', false), 'claro')
  assert.equal(modoEfectivo('auto', true), 'oscuro')
  assert.equal(modoEfectivo('claro', true), 'claro')
  assert.equal(modoEfectivo('oscuro', false), 'oscuro')
  assert.deepEqual(APARIENCIAS.map((a) => a.id), ['claro', 'oscuro', 'auto'])
})

test('sin elección guardada: clara (Edison 2026-10-19), aunque el aparato prefiera oscuro', () => {
  assert.equal(leerApariencia(), 'claro')
  assert.equal(modoEfectivo(leerApariencia(), true), 'claro')
  assert.equal(prefiereOscuro(), false)
  assert.equal(modoActual(), 'claro')
  assert.equal(PALETA, PALETA_CLARA)
})

test('las dos paletas tienen exactamente los mismos roles', () => {
  assert.deepEqual(Object.keys(PALETA_OSCURA).sort(), Object.keys(PALETA_CLARA).sort())
  // Los roles que el código tiñe con un sufijo de alfa («${PALETA.exito}1A») deben ser hex de seis cifras en ambas.
  for (const p of [PALETA_CLARA, PALETA_OSCURA]) {
    for (const k of ['guinda', 'primario', 'acento', 'dorado', 'aviso', 'error', 'exito', 'info', 'texto', 'textoSecundario', 'textoTenue', 'apagado', 'borrador', 'enRevision', 'observado', 'aprobado', 'firmado', 'enviado', 'observadoPosterior', 'archivado'] as const) {
      assert.match(p[k], /^#[0-9A-Fa-f]{6}$/, k)
    }
  }
})

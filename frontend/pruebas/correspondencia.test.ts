// Pruebas de la correspondencia que comparten Estadísticas y el Mapa (2026-10-19, src/correspondencia.ts).
// Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RUTA_ESTADISTICAS, rutaEstado, rutaMapa, textoCorrespondencia, textoEspera, textoRespuesta } from '../src/correspondencia.ts'

test('cada cifra lleva a su lista o a su nodo del mapa', () => {
  assert.equal(rutaEstado('APROBADO'), '/documentos?estado=APROBADO')
  assert.equal(rutaMapa('inst:7'), '/mapa?foco=inst%3A7')
  assert.equal(rutaMapa(''), null)
  assert.equal(rutaMapa(undefined), null)
  assert.equal(RUTA_ESTADISTICAS, '/estadisticas#correspondencia')
})

test('la respuesta de un oficio se dice igual en las dos pantallas', () => {
  assert.equal(textoRespuesta({ respondido: true, dias: 10, espera: null }), 'Respondido en 10 días')
  assert.equal(textoRespuesta({ respondido: true, dias: 1, espera: null }), 'Respondido en 1 día')
  assert.equal(textoRespuesta({ respondido: true, dias: null, espera: null }), 'Respondido')
  assert.equal(textoRespuesta({ respondido: false, dias: null, espera: 39 }), 'Sin respuesta hace 39 días')
  assert.equal(textoRespuesta(undefined), '')
  assert.equal(textoEspera(39), 'hace 39 días')
  assert.equal(textoEspera(null), '')
})

test('la correspondencia de una institución, breve y completa', () => {
  assert.equal(
    textoCorrespondencia({ enviados: 22, respondidos: 3, sin_respuesta: 19, dias_promedio: 9 }),
    '22 oficios enviados · 3 con respuesta · respuesta en 9 días en promedio',
  )
  assert.equal(textoCorrespondencia({ enviados: 1, respondidos: 0, sin_respuesta: 1, dias_promedio: null }), '1 oficio enviado · ninguno con respuesta')
  assert.equal(textoCorrespondencia({ enviados: 0, respondidos: 0, sin_respuesta: 0, dias_promedio: null }), '')
})

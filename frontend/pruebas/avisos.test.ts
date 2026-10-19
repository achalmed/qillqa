// Pruebas de la campana de avisos (2026-10-19, src/avisos.ts). Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparAvisos, horaBreve, partirChat, partirRecordatorio } from '../src/avisos.ts'

const chat = (id: number, texto: string, leida = false, canal = 7) => ({ id, tipo: 'chat', texto, leida, destino: `chat:${canal}:${id}`, creado_en: null })

test('los mensajes seguidos de la misma persona en el mismo canal son UNA entrada', () => {
  const g = agruparAvisos([
    chat(5, 'María Quispe Rojas: HASTA EL MOMENTO, todo all right'),
    chat(4, 'María Quispe Rojas: JEJE'),
    chat(3, 'María Quispe Rojas: oky doky', true),
    { id: 2, tipo: 'recordatorio', texto: 'Recordatorio: 19/10 08:45 · Décima Segunda Sesión · Hemiciclo del Congreso', leida: true, destino: 'evento:9', creado_en: null },
    chat(1, 'María Quispe Rojas: ok', true, 8),
  ])
  assert.equal(g.length, 3)
  assert.equal(g[0].titulo, 'María Quispe Rojas')
  assert.equal(g[0].detalle, '3 mensajes · HASTA EL MOMENTO, todo all right')
  assert.equal(g[0].sinLeer, 2)
  assert.deepEqual(g[0].avisos.map((a) => a.id), [5, 4, 3])
  assert.equal(g[1].titulo, 'Décima Segunda Sesión')
  assert.equal(g[1].detalle, '19/10 08:45 · Hemiciclo del Congreso')
  assert.equal(g[2].titulo, 'María Quispe Rojas')
  assert.equal(g[2].detalle, 'ok')
})

test('el documento que ya dice el texto no se repite', () => {
  const g = agruparAvisos([{ id: 9, tipo: 'plazo', texto: 'Venció 14/10: Firmas de adhesión', leida: false, destino: 'tarea:3', creado_en: null, documento: 'Tarea: Firmas de adhesión' }])
  assert.equal(g[0].detalle, '')
})

test('partir un chat y un recordatorio', () => {
  assert.deepEqual(partirChat('Ana: hola: qué tal'), ['Ana', 'hola: qué tal'])
  assert.deepEqual(partirChat('sin nombre'), ['sin nombre', ''])
  assert.deepEqual(partirRecordatorio('Recordatorio: 19/10 todo el día · Feria'), ['Feria', '19/10 todo el día'])
  assert.equal(partirRecordatorio('Le observaron el oficio'), null)
})

test('la hora breve: hoy la hora, ayer «ayer», antes día/mes', () => {
  const ahora = new Date(2026, 9, 19, 10, 0)
  assert.match(horaBreve(new Date(2026, 9, 19, 9, 33).toISOString(), ahora), /9:33/)
  assert.equal(horaBreve(new Date(2026, 9, 18, 18, 42).toISOString(), ahora), 'ayer')
  assert.equal(horaBreve(new Date(2026, 9, 10, 8, 0).toISOString(), ahora), '10/10')
  assert.equal(horaBreve(null, ahora), '')
})

// Pruebas del mensaje para compartir el acceso de una cuenta (2026-10-18, src/acceso.ts).
// Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveTemporal, enlaceWhatsappCon, mensajeAcceso } from '../src/acceso.ts'

const base = { nombre: 'Edith Mota Palomino', usuario: 'emota', enlace: 'https://qillqa.ejemplo.pe', clave: 'qillqa-abcd-efgh', datosPendientes: true, conExtension: true }

test('saludo primero, luego los datos y los pasos numerados', () => {
  const m = mensajeAcceso(base)
  const lineas = m.split('\n')
  assert.equal(lineas[0], 'Hola, Edith. Ya tiene su cuenta en Qillqa de la entidad.')
  assert.ok(m.includes('🔗 https://qillqa.ejemplo.pe\n👤 Usuario: emota\n🔑 Contraseña temporal: qillqa-abcd-efgh'))
  assert.ok(m.includes('1. Al entrar, elija su propia contraseña.\n2. Confirme su celular, correo y cargo.\n3. En el celular'))
  assert.ok(m.includes('4. En la computadora'))
  assert.ok(lineas.length <= 11, 'breve')
})

test('sin clave temporal, sin datos pendientes y sin extensión: menos pasos', () => {
  const m = mensajeAcceso({ ...base, clave: '', datosPendientes: false, conExtension: false })
  assert.ok(!m.includes('Contraseña temporal'))
  assert.ok(m.includes('1. Entre con su contraseña de siempre.\n2. En el celular'))
  assert.ok(!m.includes('3.'))
})

test('contraseña temporal legible y enlace de WhatsApp con el texto', () => {
  let i = 0
  assert.equal(claveTemporal(() => i++ % 3), 'qillqa-abca-bcab')
  assert.match(claveTemporal(), /^qillqa-[a-z2-9]{4}-[a-z2-9]{4}$/)
  assert.equal(enlaceWhatsappCon('Hola', '987654321'), 'https://wa.me/51987654321?text=Hola')
})

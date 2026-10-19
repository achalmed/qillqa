// Pruebas de la lógica pura del perfil (2026-10-12). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  celularLegible, correoValido, dniValido, enlaceCorreo, enlaceLlamada, enlaceWhatsapp, errorDe, nombresParaEditar, normalizarCelular,
} from '../src/perfil.ts'

test('celular peruano: normaliza las formas comunes y rechaza lo que no es un celular', () => {
  for (const bueno of ['987654321', '987 654 321', '987-654-321', '+51 987 654 321', '51987654321']) {
    assert.equal(normalizarCelular(bueno), '987654321')
  }
  assert.equal(normalizarCelular(''), '')
  for (const malo of ['87654321', '887654321', '9876543210', '+1 987 654 321']) assert.equal(normalizarCelular(malo), null)
  assert.equal(celularLegible('987654321'), '987 654 321')
})

test('enlaces de contacto', () => {
  assert.equal(enlaceWhatsapp('987654321'), 'https://wa.me/51987654321')
  assert.equal(enlaceLlamada('987654321'), 'tel:+51987654321')
  assert.equal(enlaceCorreo('n@dominio.pe'), 'mailto:n@dominio.pe')
  assert.equal(enlaceWhatsapp(''), '')
})

test('DNI, correo y los textos de error (los mismos del servidor)', () => {
  assert.ok(dniValido('45678912') && !dniValido('4567891'))
  assert.ok(correoValido('nombre@dominio.pe') && !correoValido('nombre@dominio'))
  assert.equal(errorDe('dni', ''), '')
  assert.equal(errorDe('dni', '123'), 'El DNI tiene 8 dígitos.')
  assert.equal(errorDe('email', 'x@y'), 'El correo no es válido (ejemplo: nombre@dominio.pe).')
  assert.equal(errorDe('celular', '123'), 'El celular tiene 9 dígitos y empieza con 9 (ejemplo: 987 654 321).')
  assert.equal(errorDe('nombres', '  '), 'Escriba sus nombres.')
  assert.equal(errorDe('acerca', 'x'.repeat(140)), '')
  assert.equal(errorDe('acerca', 'x'.repeat(141)), '«Info»: 140 caracteres como mucho.')
})

test('una cuenta antigua sin nombres ni apellidos edita su nombre entero', () => {
  assert.deepEqual(nombresParaEditar({ nombres: '', apellidos: '', nombre: 'Nombre Apellido' }), { nombres: 'Nombre Apellido', apellidos: '' })
  assert.deepEqual(nombresParaEditar({ nombres: 'Nombre', apellidos: 'Apellido', nombre: 'x' }), { nombres: 'Nombre', apellidos: 'Apellido' })
})

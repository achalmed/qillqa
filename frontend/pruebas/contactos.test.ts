// Pruebas de la lista de contactos del directorio (2026-10-13). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agrupar, celularPeruano, colorDe, COLORES_AVATAR, enlaceLlamada, enlaceWhatsapp, etiquetasEnUso, filtrar, inicial, letraDe,
  lineaSecundaria, telefonoLegible, type ContactoLista,
} from '../src/componentes/directorio/contactos.ts'

const c = (id: number, nombre: string, extra: Partial<ContactoLista> = {}): ContactoLista => ({
  id, nombre, cargo: '', institucion_id: null, celular: '', telefono: '', email: '', email_alterno: '', activo: true, ...extra,
})

test('letras y orden del español: Á con la A, Ñ aparte, # al final', () => {
  assert.equal(letraDe('Álvaro Ruiz'), 'A')
  assert.equal(letraDe('Ñahui Quispe'), 'Ñ')
  assert.equal(letraDe('3er piso'), '#')
  assert.equal(inicial('ángel'), 'Á')
  const grupos = agrupar([c(1, 'Ñahui'), c(2, 'Nora'), c(3, 'Álvaro'), c(4, '#ayuda'), c(5, 'Oscar'), c(6, 'Beto', { favorito: true })])
  assert.deepEqual(grupos.map((g) => g.titulo), ['Favoritos', 'A', 'B', 'N', 'Ñ', 'O', '#'])
  assert.deepEqual(grupos[0].contactos.map((x) => x.id), [6])
  // El favorito también sale en su letra.
  assert.deepEqual(grupos[2].contactos.map((x) => x.id), [6])
  assert.deepEqual(agrupar([c(1, 'Beto', { favorito: true })], false).map((g) => g.titulo), ['B'])
})

test('búsqueda sin tildes, por palabras, por institución, por número y por etiqueta', () => {
  const lista = [
    c(1, 'José Pérez', { cargo: 'Gerente', institucion_id: 10, celular: '987654321', etiquetas: ['Prensa'] }),
    c(2, 'Ana Torres', { email: 'ana@correo.test', favorito: true }),
  ]
  const inst = (id: number | null) => (id === 10 ? 'Gobierno Regional de Prueba GRP' : '')
  assert.deepEqual(filtrar(lista, { q: 'jose gerente' }, inst).map((x) => x.id), [1])
  assert.deepEqual(filtrar(lista, { q: 'grp' }, inst).map((x) => x.id), [1])
  assert.deepEqual(filtrar(lista, { q: '654' }, inst).map((x) => x.id), [1])
  assert.deepEqual(filtrar(lista, { etiqueta: 'prensa' }).map((x) => x.id), [1])
  assert.deepEqual(filtrar(lista, { soloFavoritos: true }).map((x) => x.id), [2])
  assert.deepEqual(filtrar(lista, { q: 'nadie' }).map((x) => x.id), [])
})

test('enlaces de llamar y WhatsApp', () => {
  assert.equal(celularPeruano('+51 987 654 321'), '987654321')
  assert.equal(celularPeruano('066 312233'), '')
  assert.equal(telefonoLegible('987654321'), '987 654 321')
  assert.equal(enlaceLlamada('987654321'), 'tel:+51987654321')
  assert.equal(enlaceLlamada('(066) 31-2233'), 'tel:066312233')
  assert.equal(enlaceWhatsapp('987 654 321'), 'https://wa.me/51987654321')
  assert.equal(enlaceWhatsapp('+1 555 123 4567'), 'https://wa.me/15551234567')
  assert.equal(enlaceWhatsapp('066 312233'), '')
})

test('etiquetas en uso, color estable y línea secundaria', () => {
  const lista = [c(1, 'A', { etiquetas: ['Prensa', 'GORE'] }), c(2, 'B', { etiquetas: ['prensa'] }), c(3, 'C', { etiquetas: ['Prensa'], activo: false })]
  assert.deepEqual(etiquetasEnUso(lista), [{ nombre: 'GORE', n: 1 }, { nombre: 'Prensa', n: 2 }])
  assert.equal(colorDe(3), colorDe(3 + COLORES_AVATAR.length))
  assert.ok(!COLORES_AVATAR.some((x) => /^#(F|E)[0-9A-F]/i.test(x)), 'sin colores claros ni naranjas')
  assert.equal(lineaSecundaria(c(1, 'X', { cargo: 'Director' }), { nombre: 'Ministerio', siglas: 'MIN' }), 'Director · MIN')
  assert.equal(lineaSecundaria(c(1, 'X'), null), '')
})

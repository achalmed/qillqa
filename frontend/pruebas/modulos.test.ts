// Pruebas de los módulos encendidos y apagados (2026-10-18, src/modulos.ts) y de la lógica pura del
// paso de bienvenida (src/perfil.ts). Correr desde frontend/:  node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapaDe, mensajeModulo, moduloActivo, moduloApagadoDe, type EstadoModulo } from '../src/modulos.ts'
import { faltanEnBienvenida, problemaBienvenida } from '../src/perfil.ts'

const fila = (id: string, efectivo: boolean, mensaje = ''): EstadoModulo => ({
  id, nombre: id, que: '', publico: false, requiere: '', activo: efectivo, efectivo, mensaje, mensaje_por_omision: '',
})

test('módulos: lo que no está en el registro (el núcleo) siempre está encendido', () => {
  const mapa = mapaDe([fila('chat', false, 'Volvemos pronto.'), fila('tareas', true)])
  assert.equal(moduloActivo('chat', mapa), false)
  assert.equal(moduloActivo('tareas', mapa), true)
  assert.equal(moduloActivo('documentos', mapa), true)
  assert.equal(moduloActivo('chat', {}), true)
  assert.equal(mensajeModulo('chat', mapa), 'Volvemos pronto.')
  assert.equal(mensajeModulo('otro', mapa), 'Este módulo no está disponible por el momento.')
})

test('módulos: vale el estado EFECTIVO (la mesa virtual sin Mesa de Partes está apagada)', () => {
  const mesa = { ...fila('mesa_virtual', false), activo: true, requiere: 'recibidos' }
  assert.equal(moduloActivo('mesa_virtual', mapaDe([mesa, fila('recibidos', false)])), false)
})

test('módulos: reconoce el 403 de un módulo apagado y nada más', () => {
  assert.deepEqual(moduloApagadoDe({ codigo: 'modulo_apagado', modulo: 'chat', mensaje: 'x' }), { modulo: 'chat', mensaje: 'x' })
  assert.equal(moduloApagadoDe({ codigo: 'otro' }), null)
  assert.equal(moduloApagadoDe('Esta acción es solo para administradores.'), null)
  assert.equal(moduloApagadoDe(null), null)
})

test('bienvenida: lo que falta, en el orden del formulario, y el primer problema', () => {
  const lleno = { nombres: 'Ana', apellidos: 'Quispe', celular: '987 654 321', email: 'ana@dominio.pe', cargo: 'Asistente' }
  assert.deepEqual(faltanEnBienvenida(lleno), [])
  assert.equal(problemaBienvenida(lleno), '')
  assert.deepEqual(faltanEnBienvenida({ ...lleno, celular: ' ', email: '', cargo: '' }), ['celular', 'correo', 'cargo'])
  assert.equal(problemaBienvenida({ ...lleno, cargo: '' }), 'Falta: cargo.')
  assert.equal(problemaBienvenida({ ...lleno, celular: '12345' }), 'El celular tiene 9 dígitos y empieza con 9 (ejemplo: 987 654 321).')
  assert.equal(problemaBienvenida({ ...lleno, email: 'ana@dominio' }), 'El correo no es válido (ejemplo: nombre@dominio.pe).')
})

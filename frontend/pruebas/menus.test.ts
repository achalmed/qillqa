// Pruebas de los menús del Formato Word (2026-10-19, src/componentes/word/menus.ts). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEPARADOR, buscarEnMenus, contarAcciones, pasoTamano, type MenuDef } from '../src/componentes/word/menus.ts'

const nada = () => {}
const MENUS: MenuDef[] = [
  { clave: 'archivo', titulo: 'Archivo', items: [{ texto: 'Documento nuevo…', accion: nada }, SEPARADOR, { texto: 'Descargar', hijos: [{ texto: 'Word (.docx)', accion: nada }, { texto: 'Markdown (.md)', accion: nada }] }] },
  { clave: 'formato', titulo: 'Formato', items: [{ texto: 'Texto', hijos: [{ texto: 'Negrita', atajo: 'Ctrl+B', accion: nada }, { texto: 'Subíndice', accion: nada, deshabilitado: true }] }, { texto: 'Sin acción (rótulo)' }] },
]

test('buscarEnMenus encuentra por el camino, sin tildes, y omite deshabilitados, separadores y rótulos', () => {
  assert.deepEqual(buscarEnMenus(MENUS, 'negrita').map((r) => r.ruta), ['Formato › Texto › Negrita'])
  assert.deepEqual(buscarEnMenus(MENUS, 'DESCARGAR').map((r) => r.ruta), ['Archivo › Descargar › Word (.docx)', 'Archivo › Descargar › Markdown (.md)'])
  assert.equal(buscarEnMenus(MENUS, 'subindice').length, 0)
  assert.equal(buscarEnMenus(MENUS, 'rótulo').length, 0)
  assert.equal(buscarEnMenus(MENUS, '   ').length, 0)
  assert.equal(buscarEnMenus(MENUS, 'a', 2).length, 2)
})

test('contarAcciones cuenta solo lo ejecutable', () => {
  assert.equal(contarAcciones(MENUS), 5)
})

test('pasoTamano recorre los tamaños del PDF y se detiene en los bordes', () => {
  assert.equal(pasoTamano('11', 1), '11.5')
  assert.equal(pasoTamano('11', -1), '10.5')
  assert.equal(pasoTamano('', 1), '11.5')
  assert.equal(pasoTamano('12', 1), '12')
  assert.equal(pasoTamano('10', -1), '10')
  assert.equal(pasoTamano('raro', -1), '10.5')
})

// Pruebas del control de cambios, parte pura (2026-10-19, src/extensiones/cambios.ts). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoresDe, cambiosDe, contarCambios, describirFormato, etiquetaDe, filtrarPorAutor, fundirFormato, leerEstado } from '../src/extensiones/cambios.ts'

const ins = (texto: string, autor = 'Ana') => ({ type: 'text', text: texto, marks: [{ type: 'insercion', attrs: { autor, en: '2026-10-19T10:00:00Z' } }] })
const sup = (texto: string, autor = 'Ana') => ({ type: 'text', text: texto, marks: [{ type: 'supresion', attrs: { autor, en: '2026-10-19T10:01:00Z' } }] })
const fmt = (texto: string, despues: object, autor = 'Ana', antes: object = {}) => ({ type: 'text', text: texto, marks: [{ type: 'cambioFormato', attrs: { autor, en: '2026-10-19T10:02:00Z', antes: JSON.stringify(antes), despues: JSON.stringify(despues) } }] })
const DOC = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Hola ' }, ins('mundo'), ins(' nuevo'), { type: 'text', text: '.' }] },
  { type: 'paragraph', content: [sup('Adiós'), { type: 'footnote', attrs: { texto: 'n' } }, { type: 'text', text: ' fin' }, ins('!', 'Luis')] },
] }

test('lista los cambios con las posiciones de ProseMirror y funde los tramos vecinos del mismo autor', () => {
  const c = cambiosDe(DOC)
  // Párrafo 1 abre en 0 (+1): «Hola » ocupa 1..6; «mundo nuevo» va de 6 a 17.
  assert.deepEqual(c.map((x) => [x.tipo, x.autor, x.de, x.a, x.texto]), [
    ['insercion', 'Ana', 6, 17, 'mundo nuevo'],
    ['supresion', 'Ana', 20, 25, 'Adiós'],     // párrafo 2 abre en 19 (p1: 1 + 16 + 1 = 18, cierra → 19)
    ['insercion', 'Luis', 30, 31, '!'],        // nota (1) + « fin» (4) → 25 + 1 + 4 = 30
  ])
  assert.equal(contarCambios(DOC), 3)
  assert.deepEqual(autoresDe(c), ['Ana', 'Luis'])
  assert.deepEqual(cambiosDe(null), [])
  assert.deepEqual(cambiosDe({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sin cambios' }] }] }), [])
  assert.deepEqual(filtrarPorAutor(c, 'Luis').map((x) => x.texto), ['!'])
  assert.equal(filtrarPorAutor(c, null).length, 3)
})

test('una supresión sobre una inserción ajena cuenta como supresión', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'insercion', attrs: { autor: 'Ana' } }, { type: 'supresion', attrs: { autor: 'Luis' } }] }] }] }
  assert.deepEqual(cambiosDe(doc).map((c) => [c.tipo, c.autor]), [['supresion', 'Luis']])
})

test('un cambio de formato se lista aparte, con lo que cambia, y se funde con su vecino igual', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'a ' },
    fmt('bc', { bold: true }), fmt('d', { bold: true }),                     // vecinos iguales: un solo cambio
    fmt('e', { bold: true }, 'Luis'),                                        // otro autor: aparte
    { type: 'text', text: 'f', marks: [{ type: 'insercion', attrs: { autor: 'Ana' } }, { type: 'cambioFormato', attrs: { autor: 'Ana', despues: '{"italic":false,"colorTexto":"A6122E"}' } }] },
  ] }] }
  const c = cambiosDe(doc, { A6122E: 'Rojo' })
  assert.deepEqual(c.map((x) => [x.tipo, x.autor, x.de, x.a, x.texto, x.detalle]), [
    ['formato', 'Ana', 3, 6, 'bcd', 'negrita'],
    ['formato', 'Luis', 6, 7, 'e', 'negrita'],
    ['insercion', 'Ana', 7, 8, 'f', undefined],
    ['formato', 'Ana', 7, 8, 'f', 'sin cursiva, color Rojo'],
  ])
  assert.equal(etiquetaDe(c[0]), 'Formato: negrita')
  assert.equal(contarCambios(doc), 4)
})

test('un párrafo dividido o unido se lista como cambio de párrafo con el tramo del párrafo entero', () => {
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] },                                                   // 0..5
    { type: 'paragraph', attrs: { cambio: 'insercion', cambioAutor: 'Ana', cambioEn: '2026-10-19T11:00:00Z' }, content: [{ type: 'text', text: 'Dos' }, ins('!')] },   // 5..11
    { type: 'paragraph', attrs: { cambio: 'supresion', cambioAutor: 'Luis' }, content: [{ type: 'text', text: 'Tres' }] },  // 11..17
    { type: 'paragraph', attrs: { cambio: null }, content: [{ type: 'text', text: 'Cuatro' }] },
  ] }
  const c = cambiosDe(doc)
  assert.deepEqual(c.map((x) => [x.tipo, x.autor, x.de, x.a, x.texto, x.detalle]), [
    ['parrafo', 'Ana', 5, 11, 'Dos!', 'insercion'],
    ['insercion', 'Ana', 9, 10, '!', undefined],
    ['parrafo', 'Luis', 11, 17, 'Tres', 'supresion'],
  ])
  assert.equal(etiquetaDe(c[0]), 'Párrafo dividido')
  assert.equal(etiquetaDe(c[2]), 'Párrafos unidos')
  assert.deepEqual(autoresDe(c), ['Ana', 'Luis'])
})

test('fundir formato: sumar claves, el mismo botón apaga la sugerencia, volver a lo original la retira', () => {
  // Nada pendiente: poner negrita sobre texto normal.
  const a = fundirFormato(null, 'bold', false, true)
  assert.deepEqual(a, { antes: '{"bold":false}', despues: '{"bold":true}' })
  // Pedir lo que ya tiene (negrita sobre texto ya en negrita): no hay cambio.
  assert.equal(fundirFormato(null, 'bold', true, true), null)
  // Sumar cursiva a la negrita pendiente.
  const b = fundirFormato(a, 'italic', false, true)
  assert.deepEqual(leerEstado(b!.despues), { bold: true, italic: true })
  assert.deepEqual(leerEstado(b!.antes), { bold: false, italic: false })
  // Pedir negrita otra vez: la clave se retira y queda solo la cursiva.
  const c = fundirFormato(b, 'bold', false, true)
  assert.deepEqual(leerEstado(c!.despues), { italic: true })
  // Retirar también la cursiva: ya no hay marca.
  assert.equal(fundirFormato(c, 'italic', false, true), null)
  // Color: rojo pendiente y luego azul → azul; luego volver al original (sin color) → se retira.
  const d = fundirFormato(null, 'colorTexto', null, 'A6122E')
  const e = fundirFormato(d, 'colorTexto', null, '2F5DA8')
  assert.deepEqual(leerEstado(e!.despues), { colorTexto: '2F5DA8' })
  assert.equal(fundirFormato(e, 'colorTexto', null, null), null)
  // Alineación: justificado → centrado.
  assert.deepEqual(leerEstado(fundirFormato(null, 'textAlign', 'justify', 'center')!.despues), { textAlign: 'center' })
  // Un JSON roto en la marca cuenta como vacío.
  assert.deepEqual(leerEstado('{no'), {})
  assert.deepEqual(leerEstado(null), {})
})

test('describir formato en palabras', () => {
  assert.equal(describirFormato('{"bold":true,"italic":false,"underline":true,"resaltado":false}'), 'negrita, sin cursiva, subrayado, sin resaltado')
  assert.equal(describirFormato('{"colorTexto":"A6122E"}', { A6122E: 'Rojo' }), 'color Rojo')
  assert.equal(describirFormato('{"colorTexto":"ABCDEF"}'), 'color #ABCDEF')
  assert.equal(describirFormato('{"colorTexto":null,"textAlign":"center"}'), 'sin color, centrado')
  assert.equal(describirFormato(''), '')
})

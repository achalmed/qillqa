// Pruebas del autocompletado de referencias (parte pura). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agrupar, detectarConsulta, nodoDe, referenciasDe, type ResultadoReferencia } from '../src/extensiones/consultaReferencias.ts'

test('«Ley » abre la búsqueda y la consulta lleva la palabra', () => {
  const c = detectarConsulta('Conforme a la Ley ')
  assert.ok(c)
  assert.equal(c.consulta, 'Ley')
  assert.equal(c.inicio, 'Conforme a la '.length)
  assert.equal(c.disparador, 'palabra')
})

test('«Ley N° 2779» y «D.S. N° 004» se reconocen con su número', () => {
  assert.equal(detectarConsulta('según la Ley N° 2779')?.consulta, 'Ley N° 2779')
  assert.equal(detectarConsulta('el D.S. N° 004-2019')?.consulta, 'D.S. N° 004-2019')
  assert.equal(detectarConsulta('mediante Oficio 95')?.consulta, 'Oficio 95')
})

test('«ley» en minúscula o una palabra que solo empieza igual no abren nada', () => {
  assert.equal(detectarConsulta('conforme a ley '), null)
  assert.equal(detectarConsulta('las Leyendas '), null)
  assert.equal(detectarConsulta('Ley'), null)
})

test('tras un punto, o con más de cuatro palabras, se deja de buscar', () => {
  assert.equal(detectarConsulta('la Ley 27795. '), null)
  assert.equal(detectarConsulta('la Ley de presupuesto del sector público para el año'), null)
})

test('«@» busca cualquier cosa y reemplaza desde la arroba', () => {
  const c = detectarConsulta('reunión con @huam')
  assert.deepEqual(c, { inicio: 'reunión con '.length, consulta: '@huam', disparador: 'arroba' })
  assert.equal(detectarConsulta('@')?.consulta, '@')
  assert.equal(detectarConsulta('correo juan@dominio'), null)
})

test('nodoDe y referenciasDe sin repetir destinos', () => {
  assert.equal(nodoDe('documento', 12), 'doc:12')
  assert.equal(nodoDe('institucion', '4'), 'inst:4')
  assert.equal(nodoDe('otro', 1), null)
  const json = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Ver ' },
      { type: 'referencia', attrs: { tipo: 'norma', id: 'ley-27795', texto: 'Ley N° 27795' } },
      { type: 'referencia', attrs: { tipo: 'norma', id: 'ley-27795', texto: 'otra vez' } },
      { type: 'referencia', attrs: { tipo: 'persona', id: '7', texto: 'Ana' } },
    ] }],
  }
  assert.deepEqual(referenciasDe(json).map((r) => r.id), ['ley-27795', '7'])
})

test('agrupar conserva el orden del servidor y el índice global', () => {
  const r = (grupo: string, id: string) => ({ grupo, id }) as ResultadoReferencia
  const g = agrupar([r('Normas', 'a'), r('Documentos', 'b'), r('Normas', 'c')])
  assert.deepEqual(g.map((x) => [x.grupo, x.items.map((i) => i.i)]), [['Normas', [0, 2]], ['Documentos', [1]]])
})

test('«D.S. » abre la búsqueda aunque la palabra termine en punto', () => {
  assert.equal(detectarConsulta('según el D.S. ')?.consulta, 'D.S.')
  assert.equal(detectarConsulta('la Ley N.° ')?.consulta, 'Ley N.°')
})

// Pruebas de ordenarWord (texto pegado de Word). Correr desde frontend/:
//   node --test pruebas/*.test.ts
// Node 24 carga el .ts sin compilar (como el servidor de colaboración).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarTextoWord, pareceWordSinOrdenar, textoDe, type Nodo } from '../src/extensiones/ordenarWord.ts'

const p = (texto: string, attrs: Record<string, unknown> = { textAlign: 'justify' }): Nodo =>
  ({ type: 'paragraph', attrs, content: texto ? [{ type: 'text', text: texto }] : [] })
const doc = (...content: Nodo[]): Nodo => ({ type: 'doc', content })

test('las notas «[n]» del final pasan a ser notas al pie en su llamada', () => {
  const { doc: d, informe } = ordenarTextoWord(doc(
    p('El tramo Vilcas[1] y el puente[2] del corredor.'),
    { type: 'horizontalRule' },
    p('[1] Google Earth, vista satelital.'),
    p('[2]INEI. Evolución de la pobreza.'),
    p('continuación de la nota dos.'),
  ))
  assert.equal(informe.notas, 2)
  assert.equal(d.content!.length, 1)
  const hijos = d.content![0].content!
  assert.deepEqual(hijos.map((h) => h.type), ['text', 'footnote', 'text', 'footnote', 'text'])
  assert.equal(hijos[1].attrs!.texto, 'Google Earth, vista satelital.')
  assert.equal(hijos[3].attrs!.texto, 'INEI. Evolución de la pobreza. continuación de la nota dos.')
})

test('una llamada sin su nota se deja como está', () => {
  const { doc: d, informe } = ordenarTextoWord(doc(p('Ver el anexo [7] del informe.')))
  assert.equal(informe.notas, 0)
  assert.equal(textoDe(d), 'Ver el anexo [7] del informe.')
})

test('las listas escritas de Word se vuelven listas, sin su marca', () => {
  const { doc: d, informe } = ordenarTextoWord(doc(
    p('La ley tiene por finalidad:'),
    p('1.     Dotar de un marco legal.'),
    p(''),
    p('2.            Prevenir el uso desproporcionado.'),
    p('•       Ministerio de Transportes.'),
    p('•       Provías Nacional.'),
  ))
  assert.equal(informe.listas, 2)
  assert.deepEqual(d.content!.map((b) => b.type), ['paragraph', 'orderedList', 'bulletList'])
  assert.equal(d.content![1].attrs!.start, 1)
  assert.equal(textoDe(d.content![1].content![1]), 'Prevenir el uso desproporcionado.')
  assert.equal(textoDe(d.content![2].content![0]), 'Ministerio de Transportes.')
})

test('un «1. Texto» con un solo espacio no se toca (puede ser prosa)', () => {
  const { informe } = ordenarTextoWord(doc(p('1. Proyecto de Ley 10299/2024-CR.'), p('2. Otro.')))
  assert.equal(informe.listas, 0)
})

test('subtítulos numerados, vacíos, espacios de relleno y fuente del cuadro', () => {
  const tabla: Nodo = { type: 'table', attrs: { titulo: '', fuente: '' }, content: [] }
  const { doc: d, informe } = ordenarTextoWord(doc(
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'I.      Planteamiento del problema' }] },
    p(' '),
    p('II.1. Estado técnico de la vía'),
    p('II.2. Esto es un párrafo largo que termina en punto.'),
    tabla,
    p(''),
    p('Fuente: Elaboración propia.'),
  ))
  assert.equal(informe.subtitulos, 1)
  assert.equal(informe.fuentes, 1)
  assert.equal(textoDe(d.content![0]), 'I. Planteamiento del problema')
  assert.deepEqual(d.content!.map((b) => b.type), ['heading', 'heading', 'paragraph', 'table'])
  assert.equal(d.content![3].attrs!.fuente, 'Elaboración propia.')
})

test('rótulos de fotografía sin imagen se cuentan', () => {
  const { informe } = ordenarTextoWord(doc(p(''), p('FOTOGRAFÍA — N° 1'), p('Puente Incachaca.')))
  assert.equal(informe.fotosSinImagen, 1)
})

test('un texto ya ordenado no se ofrece ordenar', () => {
  assert.equal(pareceWordSinOrdenar(doc(p('Artículo 1.- Objeto'), p('La presente ley…'))), false)
})

// --- notas de Word sin anclas: número volado o en superíndice (2026-10-06) ---------------------

const sup = (texto: string): Nodo => ({ type: 'text', text: texto, marks: [{ type: 'superscript' }] })
const t = (texto: string): Nodo => ({ type: 'text', text: texto })
const pc = (...content: Nodo[]): Nodo => ({ type: 'paragraph', content })

test('las notas con el número en superíndice pasan a ser notas al pie', () => {
  const { doc: d, informe } = ordenarTextoWord(doc(
    pc(t('El corredor de Vilcas'), sup('1'), t(' y el puente'), sup('2'), t('.')),
    p('Segundo párrafo con 3 m de ancho.'),
    pc(sup('1'), t(' Google Earth, vista satelital.')),
    pc(sup('2'), t(' INEI. Evolución de la pobreza.')),
  ))
  assert.equal(informe.notas, 2)
  assert.equal(d.content!.length, 2)
  const hijos = d.content![0].content!
  assert.deepEqual(hijos.map((h) => h.type), ['text', 'footnote', 'text', 'footnote', 'text'])
  assert.equal(hijos[1].attrs!.texto, 'Google Earth, vista satelital.')
  assert.equal(textoDe(d.content![1]), 'Segundo párrafo con 3 m de ancho.')
})

test('las notas con número volado («¹») pasan a ser notas al pie, sin tocar un «m²»', () => {
  const { doc: d, informe } = ordenarTextoWord(doc(
    p('Área de 40 m² en Huanta¹ y Huamanga².'),
    p('Otro párrafo.'),
    p('¹ Municipalidad de Huanta.'),
    p('² Municipalidad de Huamanga.'),
  ))
  assert.equal(informe.notas, 2)
  const hijos = d.content![0].content!
  assert.equal(textoDe(d.content![0]), 'Área de 40 m² en Huanta y Huamanga.')
  assert.deepEqual(hijos.filter((h) => h.type === 'footnote').map((h) => h.attrs!.texto), ['Municipalidad de Huanta.', 'Municipalidad de Huamanga.'])
})

test('un párrafo que empieza con un número suelto no es una nota', () => {
  const { informe } = ordenarTextoWord(doc(p('El dato 5 del cuadro.'), p('5 regiones atendidas.'), p('Fin.')))
  assert.equal(informe.notas, 0)
})

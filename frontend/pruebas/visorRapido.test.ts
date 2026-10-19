// Pruebas del visor rápido de la bandeja (2026-10-19, src/visorRapido.ts). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  abreVisorRapido,
  anchoImagen,
  claveImagen,
  aPrecargar,
  archivoInicial,
  archivosDe,
  interpretarGesto,
  interpretarTecla,
  laminaTras,
  paginaTras,
  rutaImagen,
  secuencia,
  vecinos,
} from '../src/visorRapido.ts'
import { totalDeCabecera } from '../src/copiar.ts'

const docs = [
  { id: 1, estado: 'BORRADOR' },
  { id: 2, estado: 'ENVIADO' },
  { id: 3, estado: 'APROBADO' },
  { id: 4, estado: 'FIRMADO' },
  { id: 5, estado: 'OBSERVADO_ENVIADO' },
  { id: 6, estado: 'ARCHIVADO' },
]

test('el visor rápido abre lo de después de la firma; lo anterior sigue en el editor', () => {
  for (const e of ['FIRMADO', 'ENVIADO', 'OBSERVADO_ENVIADO', 'ARCHIVADO']) assert.ok(abreVisorRapido(e), e)
  // Desde el 2026-10-19 también lo que aún se trabaja: todo documento se ve primero en el visor.
  for (const e of ['BORRADOR', 'EN_REVISION', 'OBSERVADO', 'APROBADO', '']) assert.ok(abreVisorRapido(e), e)
})

test('la secuencia respeta el orden de la bandeja: desde el 2026-10-19, todos los documentos', () => {
  assert.deepEqual(secuencia(docs).map((d) => d.id), [1, 2, 3, 4, 5, 6])
})

test('vecinos: siguiente y anterior dentro de la secuencia, sin dar la vuelta', () => {
  assert.deepEqual(vecinos(docs, 4), { indice: 3, total: 6, anterior: docs[2], siguiente: docs[4] })
  assert.deepEqual(vecinos(docs, 1), { indice: 0, total: 6, anterior: null, siguiente: docs[1] })
  assert.deepEqual(vecinos(docs, 6), { indice: 5, total: 6, anterior: docs[4], siguiente: null })
  // Un id que ya no se lista.
  assert.deepEqual(vecinos(docs, 99), { indice: -1, total: 6, anterior: null, siguiente: null })
})

test('se precargan el siguiente y el anterior, en ese orden', () => {
  assert.deepEqual(aPrecargar(docs, 4).map((d) => d.id), [5, 3])
  assert.deepEqual(aPrecargar(docs, 1).map((d) => d.id), [2])
  assert.deepEqual(aPrecargar(docs, 6).map((d) => d.id), [5])
  assert.deepEqual(aPrecargar(docs, 99), [])
})

const adjuntos = [
  { id: 27, nombre: 'CR-OF-0042.pdf', tipo_mime: 'application/pdf', es_imagen: false, categoria: 'recepcion', etiqueta: '' },
  { id: 26, nombre: 'FIRM-OF-0042.pdf', tipo_mime: 'application/pdf', es_imagen: false, categoria: 'firmado', etiqueta: '' },
  { id: 30, nombre: 'cargo-foto.jpg', tipo_mime: 'image/jpeg', es_imagen: true, categoria: 'recepcion', etiqueta: '' },
  { id: 31, nombre: 'respuesta.pdf', tipo_mime: 'application/pdf', es_imagen: false, categoria: 'respuesta', etiqueta: '' },
  { id: 32, nombre: 'anexo.pdf', tipo_mime: 'application/pdf', es_imagen: false, categoria: '', etiqueta: 'Informe técnico' },
  { id: 33, nombre: 'hoja.xlsx', tipo_mime: 'application/vnd.ms-excel', es_imagen: false, categoria: '', etiqueta: '' },
  { id: 34, nombre: 'viejo.pdf', tipo_mime: 'application/pdf', es_imagen: false, categoria: 'recepcion_anulada', etiqueta: '', anulado: true },
]

test('archivos: firmado, documento, cargos, recibidos y adjuntos; solo PDF e imágenes', () => {
  const lista = archivosDe(89, adjuntos)
  assert.deepEqual(
    lista.map((a) => [a.clave, a.rotulo, a.esImagen]),
    [
      ['26', 'Firmado', false],
      ['documento', 'Documento', false],
      ['27', 'Cargo 1', false],
      ['30', 'Cargo 2', true],
      ['34', 'Cargo anulado', false],
      ['31', 'Recibido', false],
      ['32', 'Adjunto', false],
    ],
  )
  assert.equal(lista.find((a) => a.clave === '26')?.ruta, '/api/documentos/89/adjuntos/26')
  assert.equal(lista.find((a) => a.clave === 'documento')?.ruta, '/api/documentos/89/pdf')
  // Sin adjuntos: solo el PDF del sistema.
  assert.deepEqual(archivosDe(5, []).map((a) => a.clave), ['documento'])
  assert.equal(lista.find((a) => a.clave === '32')?.detalle, 'Informe técnico')
})

test('el archivo inicial es el firmado si lo hay; también antes de pedir los adjuntos', () => {
  const lista = archivosDe(89, adjuntos)
  assert.equal(archivoInicial(89, 26, lista).clave, '26')
  assert.equal(archivoInicial(89, null, lista).clave, '26') // el primero de la lista es el firmado
  assert.equal(archivoInicial(89, null, archivosDe(89, [])).clave, 'documento')
  // Sin la lista todavía, con lo que sabe la bandeja.
  assert.equal(archivoInicial(89, 26).clave, '26')
  assert.equal(archivoInicial(89, 26).ruta, '/api/documentos/89/adjuntos/26')
  assert.equal(archivoInicial(89, null).clave, 'documento')
})

test('la ruta de la imagen: el servidor rasteriza los PDF; una imagen va tal cual', () => {
  const lista = archivosDe(89, adjuntos)
  assert.equal(rutaImagen(89, lista[0], 1), '/api/documentos/89/imagen?pagina=1&archivo=26')
  assert.equal(rutaImagen(89, lista[1], 3), '/api/documentos/89/imagen?pagina=3&archivo=documento')
  assert.equal(rutaImagen(89, lista[3]), '/api/documentos/89/adjuntos/30')
  assert.equal(rutaImagen(89, lista[0], 0), '/api/documentos/89/imagen?pagina=1&archivo=26')
})

test('gesto: de lado cambia de documento, de arriba abajo cambia de página', () => {
  const zona = [375, 700] as const
  // Un deslizamiento largo y lento, hacia la izquierda: el siguiente.
  // Como TikTok (2026-10-19): de arriba abajo cambia de documento; de lado, de lámina.
  assert.equal(interpretarGesto(10, -150, 900, ...zona), 'siguiente')
  assert.equal(interpretarGesto(-5, 140, 900, ...zona), 'anterior')
  // Corto pero rápido también cuenta; corto y lento, no.
  assert.equal(interpretarGesto(0, -50, 200, ...zona), 'siguiente')
  assert.equal(interpretarGesto(0, -50, 900, ...zona), null)
  // Hacia arriba: la página siguiente; hacia abajo: la anterior.
  assert.equal(interpretarGesto(-150, 5, 600, ...zona), 'pagina_siguiente')
  assert.equal(interpretarGesto(60, 0, 200, ...zona), 'pagina_anterior')
  // En diagonal no se mueve nada.
  assert.equal(interpretarGesto(-100, 90, 200, ...zona), null)
  assert.equal(interpretarGesto(10, -12, 100, ...zona), null)
})

test('teclas del escritorio', () => {
  assert.equal(interpretarTecla('ArrowDown'), 'siguiente')
  assert.equal(interpretarTecla('ArrowUp'), 'anterior')
  assert.equal(interpretarTecla('ArrowRight'), 'pagina_siguiente')
  assert.equal(interpretarTecla('PageUp'), 'pagina_anterior')
  assert.equal(interpretarTecla('Escape'), 'cerrar')
  assert.equal(interpretarTecla('Enter'), 'abrir')
  assert.equal(interpretarTecla('a'), null)
})

test('la página tras un gesto queda entre 1 y el total', () => {
  assert.equal(paginaTras('pagina_siguiente', 1, 3), 2)
  assert.equal(paginaTras('pagina_siguiente', 3, 3), 3)
  assert.equal(paginaTras('pagina_anterior', 1, 3), 1)
  assert.equal(paginaTras('pagina_anterior', 2, 3), 1)
  assert.equal(paginaTras('siguiente', 2, 3), 2)
  assert.equal(paginaTras(null, 2, 3), 2)
})

test('la lámina siguiente pasa de página y, agotadas, al archivo siguiente; nunca sale del documento', () => {
  const archivos = [{ clave: '9' }, { clave: 'documento' }, { clave: '12' }]
  assert.deepEqual(laminaTras('pagina_siguiente', archivos, '9', 1, 3), { clave: '9', pagina: 2 })
  assert.deepEqual(laminaTras('pagina_siguiente', archivos, '9', 3, 3), { clave: 'documento', pagina: 1 })
  assert.deepEqual(laminaTras('pagina_siguiente', archivos, '12', 2, 2), { clave: '12', pagina: 2 })
  assert.deepEqual(laminaTras('pagina_anterior', archivos, 'documento', 1, 2), { clave: '9', pagina: 1 })
  assert.deepEqual(laminaTras('pagina_anterior', archivos, '9', 1, 3), { clave: '9', pagina: 1 })
  assert.deepEqual(laminaTras('siguiente', archivos, '9', 2, 3), { clave: '9', pagina: 2 })
})


test('el ancho de la imagen es el justo para la pantalla, en pasos de 128 px; la página entera, 0', () => {
  assert.equal(anchoImagen(375, 2), 768)
  assert.equal(anchoImagen(375, 3), 1152) // 1125 → 1152, aún por debajo de la página entera
  assert.equal(anchoImagen(360, 2), 768)
  assert.equal(anchoImagen(550, 1), 640)
  assert.equal(anchoImagen(700, 2), 0)
  assert.equal(anchoImagen(0, 0), 128)
  assert.notEqual(claveImagen(1, 'documento', 1, 768), claveImagen(1, 'documento', 1, 0))
})

test('la ruta de la imagen lleva el ancho solo cuando se pide reducida', () => {
  const doc = { clave: 'documento', rotulo: 'Documento', nombre: 'documento.pdf', esImagen: false, ruta: '/api/documentos/5/pdf' }
  assert.equal(rutaImagen(5, doc, 2, 768), '/api/documentos/5/imagen?pagina=2&archivo=documento&ancho=768')
  assert.equal(rutaImagen(5, doc, 2, 0), '/api/documentos/5/imagen?pagina=2&archivo=documento')
})

test('el visor pide JPEG; «Copiar imagen» sigue pidiendo PNG (sin formato en la ruta)', () => {
  const doc = { clave: 'documento', rotulo: 'Documento', nombre: 'documento.pdf', esImagen: false, ruta: '/api/documentos/5/pdf' }
  assert.equal(rutaImagen(5, doc, 2, 768, 'jpeg'), '/api/documentos/5/imagen?pagina=2&archivo=documento&ancho=768&formato=jpeg')
  assert.equal(rutaImagen(5, doc, 1, 0, 'jpeg'), '/api/documentos/5/imagen?pagina=1&archivo=documento&formato=jpeg')
  assert.equal(rutaImagen(5, doc, 2, 768, 'png'), '/api/documentos/5/imagen?pagina=2&archivo=documento&ancho=768')
  assert.equal(rutaImagen(5, doc, 2, 768), rutaImagen(5, doc, 2, 768, 'png'))
  const foto = { clave: '7', rotulo: 'Cargo', nombre: 'cargo.jpg', esImagen: true, ruta: '/api/documentos/5/adjuntos/7' }
  assert.equal(rutaImagen(5, foto, 1, 768, 'jpeg'), '/api/documentos/5/adjuntos/7')
})

test('X-Total-Paginas: lo que dice la cabecera, o el último conocido si no viene (un 304 sin ella)', () => {
  assert.equal(totalDeCabecera('3'), 3)
  assert.equal(totalDeCabecera('3', 7), 3)
  assert.equal(totalDeCabecera(null, 7), 7)
  assert.equal(totalDeCabecera(undefined), 1)
  assert.equal(totalDeCabecera('', 4), 4)
  assert.equal(totalDeCabecera('0', 4), 4)
  assert.equal(totalDeCabecera('abc', 4), 4)
})

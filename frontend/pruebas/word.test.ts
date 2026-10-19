// Pruebas del espacio «Formato Word» (2026-10-19, src/componentes/word/modelo.ts). Correr desde frontend/:
//   node --test pruebas/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conDocumento, disposicion, editableEnWord, escalaPara, fechaLarga, marcasRegla, margenCm, paginaPx, rotuloSeccion, sinDocumento, tituloSeccion } from '../src/componentes/word/modelo.ts'

const ESQUEMA = [
  { clave: 'lugar', etiqueta: 'Lugar', tipo: 'texto' }, { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
  { clave: 'destinatario_tratamiento', etiqueta: 'Tratamiento', tipo: 'oculto', opciones: ['Señor:', 'Señora:'] }, { clave: 'destinatario_nombre', etiqueta: 'Nombre', tipo: 'destinatarios' },
  { clave: 'destinatario_cargo', etiqueta: 'Cargo', tipo: 'oculto' }, { clave: 'asunto', etiqueta: 'Asunto', tipo: 'texto' },
  { clave: 'referencia', etiqueta: 'Referencia', tipo: 'referencias' }, { clave: 'anexo', etiqueta: 'Adj.', tipo: 'oculto', seccion: 'anexos' },
  { clave: 'con_copia', etiqueta: 'c.c.', tipo: 'copias' }, { clave: 'iniciales', etiqueta: 'Iniciales', tipo: 'texto' },
  { clave: 'fmt_margenes', etiqueta: 'Márgenes', tipo: 'select' }, { clave: 'anexos', etiqueta: 'Anexos', tipo: 'oculto' },
  { clave: 'periodo_informe', etiqueta: 'Periodo', tipo: 'texto' }, { clave: 'secreto', etiqueta: 'Secreto', tipo: 'oculto' },
] as const

test('márgenes y página: el del documento o el del marco; la regla marca lo que cae en el margen', () => {
  assert.equal(margenCm({ fmt_margenes: '2' }), 2)
  assert.equal(margenCm({ fmt_margenes: '2,54' }), 2.54)
  assert.equal(margenCm({}), 2.54)
  assert.equal(margenCm({ fmt_margenes: '9' }), 2.54)
  const p = paginaPx({ fmt_margenes: '2' }, 1)
  assert.equal(p.ancho, 794)
  assert.equal(p.margen, 76)
  assert.equal(paginaPx({}, 0.5).ancho, 397)
  assert.equal(escalaPara(2000), 1)
  assert.ok(escalaPara(343) < 0.5 && escalaPara(343) > 0.4)
  const marcas = marcasRegla({ fmt_margenes: '2' })
  assert.equal(marcas.length, 22)
  assert.ok(marcas[0].margen && marcas[1].margen && !marcas[2].margen && marcas[21].margen)
})

test('la disposición reparte los campos del esquema sin inventar ninguno', () => {
  const d = disposicion(ESQUEMA as unknown as Parameters<typeof disposicion>[0])
  assert.deepEqual(d.lugarFecha.map((c) => c.clave), ['lugar', 'fecha'])
  assert.deepEqual(d.encabezado.map((c) => c.clave), ['destinatario_tratamiento', 'destinatario_nombre', 'destinatario_cargo', 'asunto', 'referencia'])
  assert.deepEqual(d.cierre.map((c) => c.clave), ['anexo', 'con_copia', 'iniciales'])
  assert.deepEqual(d.otros.map((c) => c.clave), ['periodo_informe'])  // ni fmt_*, ni anexos, ni un oculto sin sitio en la hoja
  assert.deepEqual(disposicion(null).encabezado, [])
})

test('rótulos, títulos y qué se edita', () => {
  assert.equal(rotuloSeccion('Oficio', 1, 3), 'Oficio 2 de 3')
  assert.equal(tituloSeccion({ asunto: ' Pedido ' }), 'Pedido')
  assert.equal(tituloSeccion({ destinatario_nombre: 'Juan' }), 'Juan')
  assert.equal(tituloSeccion({}), 'Sin asunto')
  assert.ok(editableEnWord({ numero: null }))
  assert.ok(!editableEnWord({ numero: 12 }) && !editableEnWord({ numero: null, origen: 'framework' }) && !editableEnWord({ numero: null, firma_en_curso: true }))
  assert.equal(fechaLarga('2026-10-18'), '18 de octubre de 2026')
  assert.equal(fechaLarga('hoy'), 'hoy')
})

test('el espacio añade sin repetir y quita pasando el activo al vecino', () => {
  let e = { documentos: [] as number[], activo: null as number | null }
  e = conDocumento(e, 5); e = conDocumento(e, 7); e = conDocumento(e, 5)
  assert.deepEqual(e, { documentos: [5, 7], activo: 5 })
  assert.deepEqual(conDocumento(e, 0), e)
  assert.deepEqual(sinDocumento(e, 5), { documentos: [7], activo: 7 })
  assert.deepEqual(sinDocumento({ documentos: [1, 2, 3], activo: 3 }, 3), { documentos: [1, 2], activo: 2 })
  assert.deepEqual(sinDocumento({ documentos: [1, 2], activo: 1 }, 2), { documentos: [1], activo: 1 })
  assert.deepEqual(conDocumento({ documentos: [1, 2], activo: 1 }, 3, 2), { documentos: [2, 3], activo: 3 })
})

/**
 * Copiar el documento al portapapeles para pegarlo donde sea (Edison
 * 2026-09-08: «solo copia y pega, para no estar descargando, abriendo, etc.»).
 *
 * QUÉ SE COPIA Y POR QUÉ: una IMAGEN del documento, no el archivo PDF. El
 * portapapeles del navegador solo admite texto, HTML e imagen PNG —en el
 * Chromium de la entidad, `ClipboardItem.supports('application/pdf')` devuelve
 * `false`—, así que copiar el PDF como archivo no es posible desde una página
 * web, por mucho que se programe. La imagen sí se pega con Ctrl+V (o «pegar»
 * en el celular) en WhatsApp, Telegram, Word, un correo o una diapositiva, y
 * se ve el oficio con su membrete, su número y su firma.
 *
 * La imagen NO es una captura de pantalla: la genera el servidor rasterizando
 * el PDF de la carpeta a 150 ppp (`servicios/imagen.py`), en el momento de
 * copiar, así que siempre sale la versión vigente y con el texto nítido.
 *
 * Detalle que importa: el `ClipboardItem` se construye con la PROMESA del
 * blob, no con el blob ya descargado. Safari (iPhone/iPad) invalida la copia
 * si entre el clic y la escritura hay un `await` propio; pasándole la promesa,
 * el navegador la resuelve él mismo dentro del gesto y la copia vale en todos.
 */
/** ¿El navegador sabe poner imágenes en el portapapeles? */
export function puedeCopiarImagenes(): boolean {
  return (
    typeof navigator.clipboard?.write === 'function' &&
    typeof ClipboardItem === 'function' &&
    window.isSecureContext
  )
}

/**
 * Traduce los rechazos del navegador a algo accionable. El texto crudo
 * («Failed to execute 'write' on 'Clipboard'…») no le dice nada a quien está
 * en el despacho intentando mandar un oficio.
 */
function explicar(e: unknown): Error {
  const texto = e instanceof Error ? e.message : String(e)
  if (/not focused/i.test(texto)) {
    return new Error('Haga clic en la página y vuelva a pulsar Copiar.')
  }
  if (/permission|not allowed|NotAllowed/i.test(texto)) {
    return new Error(
      'El navegador bloqueó el portapapeles para este sitio. Permítalo desde el ' +
        'candado de la barra de direcciones (Portapapeles → Permitir), o use el ' +
        'botón de descargar.',
    )
  }
  return e instanceof Error ? e : new Error('No se pudo copiar.')
}

/** Total de páginas de lo último que se copió (lo dice el servidor). */
let ultimoTotal = 1
export const totalPaginasCopiado = (): number => ultimoTotal

/**
 * Una página del PDF como PNG, rasterizada por el servidor (`GET /api/documentos/{id}/imagen`), y
 * cuántas páginas tiene el archivo (cabecera `X-Total-Paginas`). Es la base de «Copiar como imagen»
 * y del visor rápido de la bandeja (2026-10-19), que la muestra en vez de copiarla.
 */
export async function traerPaginaComoImagen(ruta: string): Promise<{ blob: Blob; total: number }> {
  const token = localStorage.getItem('qillqa_token')
  // `no-cache` = guardar y revalidar: el navegador manda el ETag de la copia que tiene y el servidor
  // responde 304 sin rasterizar cuando el PDF no cambió (2026-10-19); `fetch` entrega entonces la copia
  // guardada como un 200 con las cabeceras del 304 (`X-Total-Paginas` viaja también ahí).
  const respuesta = await fetch(ruta, {
    cache: 'no-cache',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!respuesta.ok && respuesta.status !== 304) {
    const detalle = await respuesta.json().catch(() => null)
    throw new Error(
      (detalle as { detail?: string } | null)?.detail ?? 'No se pudo preparar la imagen.',
    )
  }
  ultimoTotal = totalDeCabecera(respuesta.headers.get('X-Total-Paginas'), ultimoTotal)
  return { blob: await respuesta.blob(), total: ultimoTotal }
}

/** El total de páginas que dice la cabecera `X-Total-Paginas`; si no viene (un 304 sin ella), el
 *  último conocido. Pura (`pruebas/visorRapido.test.ts`). */
export function totalDeCabecera(valor: string | null | undefined, anterior = 1): number {
  const n = Number(valor)
  return valor && Number.isFinite(n) && n >= 1 ? Math.floor(n) : Math.max(1, anterior)
}

const pngDelServidor = (ruta: string): Promise<Blob> => traerPaginaComoImagen(ruta).then((r) => r.blob)

/** Un archivo que YA es imagen (un cargo escaneado en JPG): al portapapeles
 *  solo va PNG, así que se reconvierte en el navegador con un canvas. */
async function pngDeImagen(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const lienzo = document.createElement('canvas')
  lienzo.width = bitmap.width
  lienzo.height = bitmap.height
  lienzo.getContext('2d')?.drawImage(bitmap, 0, 0)
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob(
      (b) => (b ? resolver(b) : rechazar(new Error('No se pudo convertir la imagen.'))),
      'image/png',
    ),
  )
}

/**
 * Copia al portapapeles la página `pagina` del PDF que hay en `rutaPdfImagen`
 * (endpoint /imagen del documento). Devuelve cuántas páginas tenía, para poder
 * decir «página 1 de 3».
 */
export async function copiarPaginaComoImagen(ruta: string): Promise<number> {
  if (!puedeCopiarImagenes()) {
    throw new Error('Este navegador no permite copiar imágenes; use el botón de descargar.')
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngDelServidor(ruta) }),
    ])
  } catch (e) {
    throw explicar(e)
  }
  return ultimoTotal
}

/** Copia un archivo que ya es imagen (escaneos JPG/PNG de cargos y anexos). */
export async function copiarArchivoImagen(ruta: string): Promise<number> {
  if (!puedeCopiarImagenes()) {
    throw new Error('Este navegador no permite copiar imágenes; use el botón de descargar.')
  }
  const traer = async () => {
    const token = localStorage.getItem('qillqa_token')
    const r = await fetch(ruta, {
      cache: 'no-cache',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!r.ok) throw new Error('No se pudo obtener el archivo.')
    return pngDeImagen(await r.blob())
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': traer() })])
  } catch (e) {
    throw explicar(e)
  }
  ultimoTotal = 1
  return 1
}

/**
 * Copia un texto CON formato (HTML) y su versión plana (2026-10-06: copiar el
 * cuerpo de un documento firmado para empezar uno nuevo). Pegado en otro
 * documento de Qillqa conserva párrafos, listas, tablas y notas al pie (el
 * editor reconoce `sup[data-footnote]`); en Word o un correo, el formato.
 * Sin portapapeles moderno (sitio sin HTTPS) se copia seleccionando una copia
 * oculta, como hace el navegador con Ctrl+C.
 */
export async function copiarTextoConFormato(html: string, texto: string): Promise<void> {
  if (typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem === 'function' && window.isSecureContext) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([texto], { type: 'text/plain' }),
        }),
      ])
      return
    } catch (e) {
      if (!/permission|not allowed|NotAllowed|focused/i.test(String(e))) throw explicar(e)
      // Permiso negado: se intenta a la antigua.
    }
  }
  const copia = document.createElement('div')
  copia.innerHTML = html
  Object.assign(copia.style, { position: 'fixed', left: '-10000px', top: '0', whiteSpace: 'pre-wrap' })
  document.body.appendChild(copia)
  const seleccion = window.getSelection()
  const rango = document.createRange()
  rango.selectNodeContents(copia)
  seleccion?.removeAllRanges()
  seleccion?.addRange(rango)
  const ok = document.execCommand('copy')
  seleccion?.removeAllRanges()
  copia.remove()
  if (!ok) throw new Error('No se pudo copiar. Seleccione el texto y pulse Ctrl+C.')
}

/**
 * Copia un texto llano (2026-10-18: «Copiar» de un mensaje del chat, para pegarlo en el grupo de
 * Telegram o WhatsApp). Primero seleccionando una copia oculta (como Ctrl+C), que es síncrono y vale
 * dentro del clic aunque el sitio no tenga HTTPS o el permiso del portapapeles esté negado; si el
 * navegador no lo admite, con el portapapeles moderno. En ese orden porque un intento fallido del
 * moderno gasta el gesto del clic y la copia oculta ya no se permite después.
 */
export async function copiarTexto(texto: string): Promise<void> {
  const copia = document.createElement('textarea')
  copia.value = texto
  copia.setAttribute('readonly', '')
  Object.assign(copia.style, { position: 'fixed', left: '-10000px', top: '0' })
  document.body.appendChild(copia)
  copia.select()
  copia.setSelectionRange(0, texto.length)  // iPhone: select() solo no basta
  let ok = false
  try {
    ok = document.execCommand('copy')
  } finally {
    copia.remove()
  }
  if (ok) return
  if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('No se pudo copiar. Mantenga pulsado el texto para copiarlo.')
  try {
    await navigator.clipboard.writeText(texto)
  } catch (e) {
    throw explicar(e)
  }
}

/**
 * Copia la página `pagina` de un PDF que ya está en el navegador (blob URL de apiPdf), dibujada
 * con pdf.js a ~150 ppp (2026-10-08: Semana de representación y Proyectos de ley copian igual
 * que los documentos, sin un endpoint propio en cada módulo). Devuelve el total de páginas.
 */
export async function copiarPdfLocalComoImagen(url: string, pagina = 1): Promise<number> {
  if (!puedeCopiarImagenes()) {
    throw new Error('Este navegador no permite copiar imágenes; use el botón de descargar.')
  }
  let total = 1
  const dibujar = async (): Promise<Blob> => {
    const { cargarPdfJs } = await import('./componentes/visorPdfjs')
    const mod = await cargarPdfJs()
    const datos = await (await fetch(url)).arrayBuffer()
    const doc = await mod.getDocument({ data: new Uint8Array(datos), isEvalSupported: false }).promise
    try {
      total = doc.numPages
      const hoja = await doc.getPage(Math.min(Math.max(1, pagina), total))
      const vp = hoja.getViewport({ scale: 150 / 72 })
      const lienzo = document.createElement('canvas')
      lienzo.width = Math.ceil(vp.width)
      lienzo.height = Math.ceil(vp.height)
      const ctx = lienzo.getContext('2d')
      if (!ctx) throw new Error('No se pudo preparar la imagen.')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, lienzo.width, lienzo.height)
      await hoja.render({ canvasContext: ctx, viewport: vp }).promise
      return await new Promise((resolver, rechazar) =>
        lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo preparar la imagen.'))), 'image/png'),
      )
    } finally {
      void doc.destroy()
    }
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': dibujar() })])
  } catch (e) {
    throw explicar(e)
  }
  ultimoTotal = total
  return total
}

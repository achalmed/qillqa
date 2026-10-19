/**
 * Qué cambió entre dos versiones de un texto del editor (2026-10-05, «como en
 * Google Docs»). Lo usan las versiones de los documentos y las de las partes
 * del proyecto de ley: el cuerpo TipTap se vuelve texto plano por párrafos y
 * se compara palabra por palabra.
 */

type Nodo = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Nodo[] }

/** Texto plano de un cuerpo TipTap: un párrafo por línea; las notas al pie
 * van entre corchetes en su sitio, las listas con su viñeta o número. */
export function textoDeCuerpo(cuerpo: unknown): string {
  const lineas: string[] = []
  const enLinea = (n: Nodo): string => {
    if (n.type === 'text') return n.text ?? ''
    if (n.type === 'footnote') return ` [nota: ${String(n.attrs?.texto ?? '')}]`
    if (n.type === 'referencia') return String(n.attrs?.texto ?? '')
    if (n.type === 'hardBreak') return ' '
    return (n.content ?? []).map(enLinea).join('')
  }
  const bloque = (n: Nodo, prefijo = ''): void => {
    switch (n.type) {
      case 'bulletList':
        n.content?.forEach((li) => li.content?.forEach((b, i) => bloque(b, i === 0 ? '• ' : '  ')))
        return
      case 'orderedList': {
        const inicio = Number(n.attrs?.start ?? 1)
        n.content?.forEach((li, k) => li.content?.forEach((b, i) => bloque(b, i === 0 ? `${inicio + k}. ` : '   ')))
        return
      }
      case 'table':
        n.content?.forEach((fila) => lineas.push((fila.content ?? []).map((c) => enLinea(c).trim()).join(' | ')))
        return
      case 'paragraph':
      case 'heading':
        lineas.push(prefijo + enLinea(n))
        return
      default:
        if (n.content) n.content.forEach((h) => bloque(h, prefijo))
        else if (n.type === 'saltoPagina') lineas.push('— salto de página —')
    }
  }
  bloque((cuerpo ?? {}) as Nodo)
  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export type Trozo = { tipo: 'igual' | 'agregado' | 'quitado'; texto: string }

/** Diferencias de Myers (O(ND)) entre dos listas de piezas. */
function myers(a: string[], b: string[]): Trozo[] {
  const n = a.length
  const m = b.length
  const max = n + m
  const v = new Int32Array(2 * max + 2)
  const rastro: Int32Array[] = []
  let fin = -1
  for (let d = 0; d <= max && fin < 0; d++) {
    rastro.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[max + k] = x
      if (x >= n && y >= m) {
        fin = d
        break
      }
    }
  }
  // Recorrido inverso: de (n, m) al origen, con el estado de cada paso.
  const trozos: Trozo[] = []
  let x = n
  let y = m
  for (let d = fin; d > 0; d--) {
    const vd = rastro[d]
    const k = x - y
    const previoK = k === -d || (k !== d && vd[max + k - 1] < vd[max + k + 1]) ? k + 1 : k - 1
    const previoX = vd[max + previoK]
    const previoY = previoX - previoK
    while (x > previoX && y > previoY) trozos.push({ tipo: 'igual', texto: a[--x] }), y--
    if (x === previoX) trozos.push({ tipo: 'agregado', texto: b[--y] })
    else trozos.push({ tipo: 'quitado', texto: a[--x] })
  }
  while (x > 0 && y > 0) trozos.push({ tipo: 'igual', texto: a[--x] }), y--
  return trozos.reverse()
}

/** Compara dos textos: primero por párrafos y, dentro de cada tramo de
 * párrafos cambiados, palabra por palabra (los espacios y saltos de línea
 * viajan pegados a la palabra para reconstruir el texto tal cual). Por
 * párrafos primero para que un texto largo —una parte entera del proyecto
 * de ley— no pague la comparación de todas sus palabras. */
export function compararTextos(antes: string, despues: string): Trozo[] {
  const lineas = (t: string) => (t ? t.split('\n').map((l, i, todas) => (i < todas.length - 1 ? `${l}\n` : l)) : [])
  const piezas = (t: string) => t.match(/\s*\S+|\s+/g) ?? []
  const unidos: Trozo[] = []
  const poner = (t: Trozo) => {
    const ultimo = unidos[unidos.length - 1]
    if (ultimo && ultimo.tipo === t.tipo) ultimo.texto += t.texto
    else if (t.texto) unidos.push({ ...t })
  }
  let quitado = ''
  let agregado = ''
  const vaciar = () => {
    if (quitado && agregado) myers(piezas(quitado), piezas(agregado)).forEach(poner)
    else poner({ tipo: quitado ? 'quitado' : 'agregado', texto: quitado || agregado })
    quitado = agregado = ''
  }
  for (const t of myers(lineas(antes), lineas(despues))) {
    if (t.tipo === 'quitado') quitado += t.texto
    else if (t.tipo === 'agregado') agregado += t.texto
    else {
      vaciar()
      poner(t)
    }
  }
  vaciar()
  return unidos
}

export type CambioCampo = { clave: string; antes: string; despues: string }

/** Campos del formulario que cambiaron (los del formato, `fmt_*`, aparte). */
export function camposCambiados(antes: Record<string, unknown> = {}, despues: Record<string, unknown> = {}): CambioCampo[] {
  const texto = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v))
  return [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
    .filter((c) => texto(antes[c]) !== texto(despues[c]))
    .sort((p, q) => Number(p.startsWith('fmt_')) - Number(q.startsWith('fmt_')) || p.localeCompare(q))
    .map((clave) => ({ clave, antes: texto(antes[clave]), despues: texto(despues[clave]) }))
}

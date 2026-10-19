/**
 * CONTROL DE CAMBIOS (2026-10-19; Edison: «modo sugerir: inserciones y supresiones por autor, aceptar o
 * rechazar»). Tres MARCAS en el esquema —`insercion` y `supresion` (`autor`, `en`) y, desde la segunda
 * parte, `cambioFormato` (`autor`, `en`, `antes`, `despues`)—, tres ATRIBUTOS de párrafo (`cambio`,
 * `cambioAutor`, `cambioEn`) y una extensión que, con el modo sugerir encendido:
 *
 *  - convierte lo que se escribe en texto marcado como inserción y lo que se borra en texto marcado
 *    como suprimido (el texto no se va: queda tachado hasta que alguien lo acepte). Borrar la propia
 *    inserción sí la quita;
 *  - FORMATO: poner o quitar negrita, cursiva, subrayado, color, resaltado o alineación no cambia el
 *    texto: `appendTransaction` deshace el paso de formato y deja la marca `cambioFormato` con lo que
 *    había (`antes`) y lo pedido (`despues`), ambos JSON por clave (`cambios.ts::fundirFormato`). Se
 *    ve con un borde punteado; aceptar aplica el formato, rechazar lo olvida. Así se sigue cualquier
 *    camino (botón, atajo, menú, pincel), no solo los comandos de la barra;
 *  - ESTRUCTURA: Intro divide el párrafo y el nuevo nace con `cambio='insercion'`; Retroceso al inicio
 *    (o Suprimir al final) y una selección que cruza párrafos no los unen: el párrafo de después queda
 *    con `cambio='supresion'` (unir sugerido). Aceptar une o conserva; rechazar, lo contrario. Dividir
 *    o unir el propio párrafo sugerido lo deshace de verdad. Solo párrafos de primer nivel (no listas
 *    ni tablas).
 *
 * Aceptar una inserción retira la marca; aceptar una supresión borra el texto; rechazar hace lo
 * contrario. `aceptarCambio(de, a, filtro)` admite autor y tipo, y `aceptarTodos(autor)` solo los de un
 * autor (el panel filtra por autor). Las marcas y atributos viajan con el documento (también por el
 * texto compartido de Yjs: lo que llega de otro no se vuelve a sugerir, `ySyncPluginKey`); el texto sale
 * al PDF como subrayado y tachado (`latex/serializador.py`) y al Word como `w:ins`/`w:del`
 * (`servicios/exportar_docx.py`); la marca de formato pendiente NO se imprime: el documento sale como
 * estaba. Entra en las dos listas de `esquema.ts`, así que el formulario, Proyectos de ley, el Formato
 * Word y el servidor de texto compartido conocen las marcas.
 */
import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceAroundStep, canJoin } from '@tiptap/pm/transform'
import type { EditorView } from '@tiptap/pm/view'
import type { Mark as MarcaPM, Node as NodoPM, Schema } from '@tiptap/pm/model'
import { MARCAS_SEGUIDAS, describirFormato, fundirFormato, leerEstado, type ClaveFormato, type FiltroCambio, type ValorFormato } from './cambios.ts'

const atributos = () => ({
  autor: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-autor') ?? '', renderHTML: (a: Record<string, unknown>) => ({ 'data-autor': a.autor }) },
  en: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-en') ?? '', renderHTML: (a: Record<string, unknown>) => ({ 'data-en': a.en }) },
})

export const Insercion = Mark.create({
  name: 'insercion',
  inclusive: true,
  addAttributes: atributos,
  parseHTML() { return [{ tag: 'ins[data-cambio]' }] },
  renderHTML({ HTMLAttributes }) { return ['ins', mergeAttributes(HTMLAttributes, { 'data-cambio': 'insercion', title: `Inserción de ${HTMLAttributes['data-autor'] ?? ''}` }), 0] },
})

export const Supresion = Mark.create({
  name: 'supresion',
  inclusive: false,
  addAttributes: atributos,
  parseHTML() { return [{ tag: 'del[data-cambio]' }] },
  renderHTML({ HTMLAttributes }) { return ['del', mergeAttributes(HTMLAttributes, { 'data-cambio': 'supresion', title: `Supresión de ${HTMLAttributes['data-autor'] ?? ''}` }), 0] },
})

/** Formato sugerido y aún no aplicado sobre un tramo: `antes` y `despues` son JSON por clave
 *  (`{"bold":true,"colorTexto":"A6122E","textAlign":"center"}`); el texto se ve como estaba, con borde punteado. */
export const CambioFormato = Mark.create({
  name: 'cambioFormato',
  inclusive: false,
  addAttributes() {
    return {
      ...atributos(),
      antes: { default: '{}', parseHTML: (el: HTMLElement) => el.getAttribute('data-antes') ?? '{}', renderHTML: (a: Record<string, unknown>) => ({ 'data-antes': a.antes }) },
      despues: { default: '{}', parseHTML: (el: HTMLElement) => el.getAttribute('data-despues') ?? '{}', renderHTML: (a: Record<string, unknown>) => ({ 'data-despues': a.despues }) },
    }
  },
  parseHTML() { return [{ tag: 'span[data-cambio-formato]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-cambio-formato': '', title: `Formato sugerido por ${HTMLAttributes['data-autor'] || 'alguien'}: ${describirFormato(HTMLAttributes['data-despues'])}` }), 0]
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    controlCambios: {
      /** Enciende o apaga el modo sugerir para este editor (con el nombre de quien escribe). */
      ponerSugerir: (activo: boolean, autor?: string) => ReturnType
      /** Acepta las sugerencias del tramo [de, a): la inserción queda, la supresión se borra, el formato se
       *  aplica, el párrafo dividido queda y el unido se une. `filtro` limita a un autor o a un tipo. */
      aceptarCambio: (de: number, a: number, filtro?: FiltroCambio) => ReturnType
      /** Rechaza las sugerencias del tramo [de, a): lo contrario de aceptar. */
      rechazarCambio: (de: number, a: number, filtro?: FiltroCambio) => ReturnType
      /** Todas las sugerencias del documento; con `autor`, solo las suyas. */
      aceptarTodos: (autor?: string) => ReturnType
      rechazarTodos: (autor?: string) => ReturnType
    }
  }
}

export interface AlmacenCambios { sugerir: boolean; autor: string }

const CLAVE = new PluginKey('controlCambios')
/** Clave de sessionStorage: el modo sugerir elegido en esta pestaña. */
export const CLAVE_SESION = 'sgdp_sugerir'
const ahora = () => new Date().toISOString()
const SIN_CAMBIO = { cambio: null, cambioAutor: null, cambioEn: null }

interface Tramo { de: number; a: number; marcas: readonly MarcaPM[]; insercion?: Record<string, unknown>; supresion?: Record<string, unknown>; formato?: Record<string, unknown> }

/** Tramos de texto de [de, a) con sus marcas: para aplicar cambios de atrás hacia adelante. */
function tramos(doc: NodoPM, de: number, a: number): Tramo[] {
  const salida: Tramo[] = []
  doc.nodesBetween(de, a, (n, pos) => {
    if (!n.isText) return true
    const ini = Math.max(pos, de)
    const fin = Math.min(pos + n.nodeSize, a)
    if (fin <= ini) return false
    const de_ = (nombre: string) => n.marks.find((m) => m.type.name === nombre)?.attrs
    salida.push({ de: ini, a: fin, marcas: n.marks, insercion: de_('insercion'), supresion: de_('supresion'), formato: de_('cambioFormato') })
    return false
  })
  return salida
}

/** Párrafos de primer nivel con un cambio de estructura pendiente, enteros dentro de [de, a]. */
function parrafosCambiados(doc: NodoPM, de: number, a: number): { pos: number; nodo: NodoPM }[] {
  const salida: { pos: number; nodo: NodoPM }[] = []
  doc.forEach((n, pos) => {
    if (n.type.name === 'paragraph' && n.attrs.cambio && pos >= de && pos + n.nodeSize <= a) salida.push({ pos, nodo: n })
  })
  return salida
}

/** El límite entre dos párrafos de primer nivel (la posición entre el cierre de uno y la apertura del
 *  otro), o null si lo que hay a los lados no son dos párrafos. */
function limiteEntreParrafos(doc: NodoPM, pos: number): number | null {
  if (pos <= 0 || pos >= doc.content.size) return null
  const $p = doc.resolve(pos)
  if ($p.depth !== 0) return null
  return $p.nodeBefore?.type.name === 'paragraph' && $p.nodeAfter?.type.name === 'paragraph' ? pos : null
}

/** Sugiere unir el párrafo que empieza en `limite` con el anterior; si ese párrafo era una división
 *  sugerida por el mismo autor, la deshace de verdad (los une). */
function sugerirUnion(tr: Transaction, limite: number, autor: string): void {
  const despues = tr.doc.resolve(limite).nodeAfter
  if (!despues) return
  if (despues.attrs.cambio === 'insercion' && despues.attrs.cambioAutor === autor) {
    if (canJoin(tr.doc, limite)) tr.join(limite)
    return
  }
  if (despues.attrs.cambio === 'supresion') return
  tr.setNodeMarkup(limite, undefined, { ...despues.attrs, cambio: 'supresion', cambioAutor: autor, cambioEn: ahora() })
}

/** Marca [de, a) como suprimido por `autor`; lo que ese mismo autor había insertado se borra de verdad.
 *  Los límites de párrafo que la selección cruza quedan como unión sugerida. Devuelve dónde quedó el
 *  punto `a` tras los borrados. */
function suprimir(tr: Transaction, schema: Schema, de: number, a: number, autor: string): number {
  const ops: { pos: number; aplicar: () => void }[] = tramos(tr.doc, de, a).map((t) => ({
    pos: t.de,
    aplicar: () => {
      if (t.insercion && t.insercion.autor === autor) tr.delete(t.de, t.a)
      else if (!t.supresion) tr.addMark(t.de, t.a, schema.marks.supresion.create({ autor, en: ahora() }))
    },
  }))
  tr.doc.forEach((_n, pos) => {
    if (pos > de && pos < a && limiteEntreParrafos(tr.doc, pos) !== null) ops.push({ pos, aplicar: () => sugerirUnion(tr, pos, autor) })
  })
  for (const op of ops.sort((x, y) => y.pos - x.pos)) op.aplicar()
  return tr.mapping.map(a, -1)
}

function insertar(view: EditorView, tr: Transaction, pos: number, texto: string, autor: string): void {
  const { schema } = view.state
  const base = (view.state.storedMarks ?? view.state.selection.$from.marks()).filter((m) => !['supresion', 'insercion', 'cambioFormato'].includes(m.type.name))
  tr.insert(pos, schema.text(texto, [...base, schema.marks.insercion.create({ autor, en: ahora() })]))
  tr.setSelection(TextSelection.create(tr.doc, pos + texto.length))
}

/** El valor de un formato en las marcas de un nodo de texto. */
function valorMarca(marcas: readonly MarcaPM[], clave: ClaveFormato): ValorFormato {
  const m = marcas.find((x) => x.type.name === clave)
  if (clave === 'colorTexto') return m ? String(m.attrs.color ?? '') : null
  return Boolean(m)
}

/** Deja en [de, a) de `tr.doc` la sugerencia «`clave` pasa de `original` a `nuevo`», fundida con la que
 *  cada tramo ya tenía; sin claves pendientes, la marca se quita. */
function sugerirFormato(tr: Transaction, schema: Schema, de: number, a: number, clave: ClaveFormato, original: ValorFormato, nuevo: ValorFormato, autor: string): void {
  const tipo = schema.marks.cambioFormato
  for (const t of tramos(tr.doc, de, a)) {
    const fundido = fundirFormato(t.formato ? { antes: t.formato.antes, despues: t.formato.despues } : null, clave, original, nuevo)
    tr.removeMark(t.de, t.a, tipo)
    if (fundido) tr.addMark(t.de, t.a, tipo.create({ autor, en: ahora(), ...fundido }))
  }
}

/** La alineación es del párrafo entero, pero la marca va por tramos (una negrita sugerida parte el
 *  párrafo en tres): resuelta en uno, se retira la clave `textAlign` de los demás tramos del párrafo. */
function olvidarAlineacion(tr: Transaction, schema: Schema, pos: number): void {
  const parrafo = tr.doc.nodeAt(pos)
  if (!parrafo) return
  for (const t of tramos(tr.doc, pos + 1, pos + 1 + parrafo.content.size)) {
    if (!t.formato || !('textAlign' in leerEstado(t.formato.despues))) continue
    const antes = leerEstado(t.formato.antes)
    const despues = leerEstado(t.formato.despues)
    delete antes.textAlign
    delete despues.textAlign
    tr.removeMark(t.de, t.a, schema.marks.cambioFormato)
    if (Object.keys(despues).length) tr.addMark(t.de, t.a, schema.marks.cambioFormato.create({ ...t.formato, antes: JSON.stringify(antes), despues: JSON.stringify(despues) }))
  }
}

/** Aplica de verdad lo que una marca de formato pedía (al aceptarla). */
function aplicarFormato(tr: Transaction, schema: Schema, t: Tramo): void {
  const despues = leerEstado(t.formato?.despues)
  for (const [clave, valor] of Object.entries(despues) as [ClaveFormato, ValorFormato][]) {
    if (clave === 'textAlign') {
      const $p = tr.doc.resolve(t.de)
      const pos = $p.before($p.depth)
      tr.setNodeMarkup(pos, undefined, { ...$p.parent.attrs, textAlign: valor })
      olvidarAlineacion(tr, schema, pos)
    } else if (clave === 'colorTexto') {
      tr.removeMark(t.de, t.a, schema.marks.colorTexto)
      if (valor) tr.addMark(t.de, t.a, schema.marks.colorTexto.create({ color: valor }))
    } else if (schema.marks[clave]) {
      if (valor) tr.addMark(t.de, t.a, schema.marks[clave].create())
      else tr.removeMark(t.de, t.a, schema.marks[clave])
    }
  }
}

/** Un paso de `setNodeMarkup` (ReplaceAroundStep que envuelve el contenido en un solo nodo vacío): devuelve el
 *  nodo nuevo si lo es. */
function nodoReescrito(paso: ReplaceAroundStep): NodoPM | null {
  const { slice } = paso
  if (paso.insert !== 1 || paso.gapFrom !== paso.from + 1 || paso.gapTo !== paso.to - 1) return null
  if (slice.openStart !== 0 || slice.openEnd !== 0 || slice.content.childCount !== 1) return null
  const n = slice.content.firstChild
  return n && n.content.size === 0 ? n : null
}

export const ControlCambios = Extension.create<Record<string, never>, AlmacenCambios>({
  name: 'controlCambios',

  addStorage() { return { sugerir: false, autor: '' } },

  // Estructura sugerida: el párrafo lleva si nació de una división (`insercion`) o si se pide unirlo
  // con el anterior (`supresion`), con autor y fecha. Solo en párrafos; el PDF y el Word lo ignoran.
  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        cambio: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-cambio-parrafo') || null, renderHTML: (a: Record<string, unknown>) => (a.cambio ? { 'data-cambio-parrafo': a.cambio } : {}) },
        cambioAutor: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-cambio-autor'), renderHTML: (a: Record<string, unknown>) => (a.cambio ? { 'data-cambio-autor': a.cambioAutor ?? '' } : {}) },
        cambioEn: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-cambio-en'), renderHTML: (a: Record<string, unknown>) => (a.cambio ? { 'data-cambio-en': a.cambioEn ?? '' } : {}) },
      },
    }]
  },

  // Lo elegido en esta pestaña («Sugerir» encendido) vale para cada editor que se abra en ella; el
  // servidor de texto compartido (Node) no tiene sessionStorage: ahí el modo queda apagado.
  onCreate() {
    try {
      this.storage.sugerir = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CLAVE_SESION) === 'si'
      this.storage.autor = (typeof localStorage !== 'undefined' && localStorage.getItem('sgdp_nombre')) || 'Yo'
    } catch { /* sin almacenamiento */ }
  },

  addCommands() {
    const aplicar = (modo: 'aceptar' | 'rechazar') => (de: number, a: number, filtro: FiltroCambio = {}) => ({ tr, state, dispatch }: { tr: Transaction; state: EditorState; dispatch?: unknown }) => {
      const pasa = (autor: unknown, tipo: string) => (filtro.autor === undefined || filtro.autor === autor) && (filtro.tipo === undefined || filtro.tipo === tipo)
      const ops: { pos: number; aplicar: () => void }[] = []
      for (const t of tramos(state.doc, de, a)) {
        const texto = t.supresion ? 'supresion' : t.insercion ? 'insercion' : null
        const conFormato = t.formato && pasa(t.formato.autor, 'formato')
        const conTexto = texto && pasa((t.supresion ?? t.insercion)?.autor, texto)
        if (!conFormato && !conTexto) continue
        ops.push({ pos: t.de, aplicar: () => {
          if (conFormato) {
            if (modo === 'aceptar') aplicarFormato(tr, state.schema, t)
            else if ('textAlign' in leerEstado(t.formato?.despues)) { const $p = tr.doc.resolve(t.de); olvidarAlineacion(tr, state.schema, $p.before($p.depth)) }
            tr.removeMark(t.de, t.a, state.schema.marks.cambioFormato)
          }
          if (!conTexto) return
          const borrar = (modo === 'aceptar' && t.supresion) || (modo === 'rechazar' && t.insercion && !t.supresion)
          if (borrar) tr.delete(t.de, t.a)
          else {
            if (t.supresion) tr.removeMark(t.de, t.a, state.schema.marks.supresion)
            if (t.insercion) tr.removeMark(t.de, t.a, state.schema.marks.insercion)
          }
        } })
      }
      for (const { pos, nodo } of parrafosCambiados(state.doc, de, a)) {
        if (!pasa(nodo.attrs.cambioAutor, 'parrafo')) continue
        const unir = (modo === 'aceptar') === (nodo.attrs.cambio === 'supresion')
        ops.push({ pos, aplicar: () => {
          if (unir && canJoin(tr.doc, pos)) tr.join(pos)
          else tr.setNodeMarkup(pos, undefined, { ...nodo.attrs, ...SIN_CAMBIO })
        } })
      }
      if (ops.length === 0) return false
      if (dispatch) {
        tr.setMeta(CLAVE, 'propio')
        for (const op of ops.sort((x, y) => y.pos - x.pos)) op.aplicar()
      }
      return true
    }
    return {
      ponerSugerir: (activo, autor = '') => ({ editor }) => {
        editor.storage.controlCambios.sugerir = activo
        if (autor) editor.storage.controlCambios.autor = autor
        try { sessionStorage.setItem(CLAVE_SESION, activo ? 'si' : 'no') } catch { /* sin almacenamiento */ }
        return true
      },
      aceptarCambio: aplicar('aceptar'),
      rechazarCambio: aplicar('rechazar'),
      aceptarTodos: (autor) => (props) => aplicar('aceptar')(0, props.state.doc.content.size, autor ? { autor } : {})(props),
      rechazarTodos: (autor) => (props) => aplicar('rechazar')(0, props.state.doc.content.size, autor ? { autor } : {})(props),
    }
  },

  addProseMirrorPlugins() {
    const almacen = this.storage

    /** Intro: divide el párrafo y el nuevo queda como división sugerida. */
    const dividir = (view: EditorView): boolean => {
      const { state } = view
      const { $from, from, to, empty } = state.selection
      if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') return false
      const tr = state.tr
      const pos = empty ? from : suprimir(tr, state.schema, from, to, almacen.autor)
      const padre = tr.doc.resolve(pos).parent
      tr.split(pos, 1, [{ type: padre.type, attrs: { ...padre.attrs, cambio: 'insercion', cambioAutor: almacen.autor, cambioEn: ahora() } }])
      tr.setSelection(TextSelection.create(tr.doc, pos + 2))
      view.dispatch(tr.scrollIntoView())
      return true
    }

    /** Retroceso al inicio del párrafo o Suprimir al final: unir queda como sugerencia. */
    const unirEnBorde = (view: EditorView, tecla: 'Backspace' | 'Delete'): boolean => {
      const { state } = view
      const { $from } = state.selection
      if ($from.depth !== 1) return false
      const enInicio = $from.parentOffset === 0
      const enFin = $from.parentOffset === $from.parent.content.size
      const limite = limiteEntreParrafos(state.doc, tecla === 'Backspace' ? (enInicio ? $from.before() : -1) : (enFin ? $from.after() : -1))
      if (limite === null) return false
      const tr = state.tr
      sugerirUnion(tr, limite, almacen.autor)
      tr.setSelection(TextSelection.create(tr.doc, Math.min(limite - 1, tr.doc.content.size)))
      view.dispatch(tr.scrollIntoView())
      return true
    }

    return [
      new Plugin({
        key: CLAVE,
        props: {
          handleTextInput(view, from, to, texto) {
            if (!almacen.sugerir) return false
            const tr = view.state.tr
            const pos = from < to ? suprimir(tr, view.state.schema, from, to, almacen.autor) : from
            insertar(view, tr, pos, texto, almacen.autor)
            view.dispatch(tr)
            return true
          },
          handleKeyDown(view, evento) {
            if (!almacen.sugerir || evento.ctrlKey || evento.metaKey || evento.altKey || evento.isComposing) return false
            if (evento.key === 'Enter') return evento.shiftKey ? false : dividir(view)
            if (evento.key !== 'Backspace' && evento.key !== 'Delete') return false
            const { state } = view
            const { $from, from, to, empty } = state.selection
            const tr = state.tr
            if (!empty) {
              suprimir(tr, state.schema, from, to, almacen.autor)
              tr.setSelection(TextSelection.create(tr.doc, Math.min(from, tr.doc.content.size)))
              view.dispatch(tr)
              return true
            }
            const de = evento.key === 'Backspace' ? from - 1 : from
            const a = de + 1
            if (de < $from.start() || a > $from.end()) return unirEnBorde(view, evento.key)   // el borde del bloque: unir párrafos queda como sugerencia
            const [t] = tramos(state.doc, de, a)
            if (!t) return false
            if (t.supresion && !(t.insercion && t.insercion.autor === almacen.autor)) {
              // Ya está suprimido: el cursor solo lo salta.
              tr.setSelection(TextSelection.create(tr.doc, evento.key === 'Backspace' ? de : a))
            } else {
              suprimir(tr, state.schema, de, a, almacen.autor)
              tr.setSelection(TextSelection.create(tr.doc, Math.min(de, tr.doc.content.size)))
            }
            view.dispatch(tr)
            return true
          },
          handlePaste(view, _evento, slice) {
            if (!almacen.sugerir) return false
            const texto = slice.content.textBetween(0, slice.content.size, '\n', ' ')
            if (!texto) return false
            const { from, to } = view.state.selection
            const tr = view.state.tr
            const pos = from < to ? suprimir(tr, view.state.schema, from, to, almacen.autor) : from
            insertar(view, tr, pos, texto, almacen.autor)
            view.dispatch(tr)
            return true
          },
        },

        // FORMATO SUGERIDO: después de cualquier transacción que ponga o quite una marca seguida (o la
        // alineación de un párrafo), se deshace ese paso y se deja la marca `cambioFormato`. Se saltan
        // las transacciones propias (aceptar/rechazar), las de deshacer, las de carga (`addToHistory`
        // apagado) y las que llegan del texto compartido (`y-sync`): lo de otros no se vuelve a sugerir.
        appendTransaction(transacciones, _viejo, nuevo) {
          if (!almacen.sugerir || !transacciones.some((t) => t.docChanged)) return null
          if (transacciones.some((t) => t.getMeta(CLAVE) || t.getMeta('history$') || t.getMeta('y-sync$') || t.getMeta('addToHistory') === false)) return null
          const { schema } = nuevo
          const mapa = new Mapping()
          const pasos: { paso: AddMarkStep | RemoveMarkStep | ReplaceAroundStep; docAntes: NodoPM; indice: number }[] = []
          for (const t of transacciones) {
            t.steps.forEach((paso, i) => {
              if (paso instanceof AddMarkStep || paso instanceof RemoveMarkStep || paso instanceof ReplaceAroundStep) pasos.push({ paso, docAntes: t.docs[i], indice: mapa.maps.length })
              mapa.appendMap(paso.getMap())
            })
          }
          if (pasos.length === 0) return null
          const tr = nuevo.tr
          for (const { paso, docAntes, indice } of pasos) {
            const despues = mapa.slice(indice + 1)
            if (paso instanceof AddMarkStep || paso instanceof RemoveMarkStep) {
              const clave = paso.mark.type.name as ClaveFormato
              if (!MARCAS_SEGUIDAS.includes(clave)) continue
              const nuevoValor: ValorFormato = paso instanceof AddMarkStep ? (clave === 'colorTexto' ? String(paso.mark.attrs.color ?? '') : true) : (clave === 'colorTexto' ? null : false)
              for (const t of tramos(docAntes, paso.from, paso.to)) {
                const de = despues.map(t.de, 1)
                const a = despues.map(t.a, -1)
                if (a <= de) continue
                // Se deshace el paso: fuera la marca nueva y, si había otra del mismo tipo (otro color), vuelve.
                tr.removeMark(de, a, paso.mark.type)
                const previa = t.marcas.find((m) => m.type === paso.mark.type)
                if (previa) tr.addMark(de, a, previa)
                sugerirFormato(tr, schema, de, a, clave, valorMarca(t.marcas, clave), nuevoValor, almacen.autor)
              }
            } else {
              const nuevoNodo = nodoReescrito(paso)
              const viejo = nuevoNodo && docAntes.nodeAt(paso.from)
              if (!nuevoNodo || !viejo || viejo.type !== nuevoNodo.type || !viejo.isTextblock) continue
              const antes = (viejo.attrs.textAlign as string | null) ?? 'justify'
              const pedido = (nuevoNodo.attrs.textAlign as string | null) ?? 'justify'
              if (antes === pedido) continue
              const pos = despues.map(paso.from, 1)
              const actual = tr.doc.nodeAt(pos)
              if (!actual || actual.type !== viejo.type || actual.textContent === '') continue   // sin texto no hay dónde dejar la marca: se aplica tal cual
              tr.setNodeMarkup(pos, undefined, { ...actual.attrs, textAlign: viejo.attrs.textAlign })
              sugerirFormato(tr, schema, pos + 1, pos + 1 + actual.content.size, 'textAlign', antes, pedido, almacen.autor)
            }
          }
          if (!tr.docChanged) return null
          tr.setMeta(CLAVE, 'propio')
          return tr
        },
      }),
    ]
  },
})

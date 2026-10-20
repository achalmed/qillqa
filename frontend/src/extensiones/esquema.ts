// esquema — la lista ÚNICA de extensiones que fija el esquema del texto.
//
// La importan el navegador (Proyecto, EditorDocumento) y el servidor de
// edición simultánea (colab/servidor.ts, fase 5). El servidor convierte el
// documento Yjs en el JSON del editor con estas mismas extensiones: una que
// falte allí hace que el transformador DESCARTE sus nodos (las notas al pie
// se perderían). Por eso no se repite la lista en ningún otro sitio.
//
// Los imports llevan la extensión `.ts`: Node 24 carga este archivo sin
// compilar (borra los tipos) y su resolución ESM no adivina extensiones.
import StarterKit from '@tiptap/starter-kit'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import TextAlign from '@tiptap/extension-text-align'
import { TableRow } from '@tiptap/extension-table'
import type { AnyExtension } from '@tiptap/core'
import { NotaAlPie } from './NotaAlPie.ts'
import { SangriaParrafo } from './SangriaParrafo.ts'
import { CabeceraAlineada, CeldaAlineada } from './TablaAlineada.ts'
import { SaltoPagina } from './SaltoPagina.ts'
import { Fotografia } from './Fotografia.ts'
import { PegadoNotas } from './PegadoNotas.ts'
import { TablaRotulada } from './TablaRotulada.ts'
import { BuscarReemplazar } from './BuscarReemplazar.ts'
import { Referencia } from './Referencia.ts'
import { CambioFormato, ControlCambios, Insercion, Supresion } from './ControlCambios.ts'
import { Resaltado } from './Resaltado.ts'
import { Comentario } from './Comentario.ts'
import { ColorTexto } from './ColorTexto.ts'

// Configuradas UNA vez: useEditor compara las extensiones por identidad y un
// `.configure()` dentro del render recrearía el editor en cada pintada.
//
// Tiptap 3 (2026-10-19): StarterKit trae ya el subrayado, el enlace y el nodo
// final. El subrayado se queda (antes iba aparte); el enlace solo en el cuerpo
// de un documento, como en la v2, para que el esquema de las partes no cambie;
// el nodo final (`trailingNode`) se apaga: con varios editores a la vez cada
// uno añadiría su propio párrafo vacío al final.
const kit = ({ historial, enlace }: { historial: boolean; enlace: boolean }) =>
  StarterKit.configure({
    trailingNode: false,
    link: enlace ? { openOnClick: false } : false,
    ...(historial ? {} : { undoRedo: false as const }),
  })
const KitParte = kit({ historial: true, enlace: false })
const KitParteSinHistorial = kit({ historial: false, enlace: false })
const KitDocumento = kit({ historial: true, enlace: true })
const KitDocumentoSinHistorial = kit({ historial: false, enlace: true })
const TablaDocumento = TablaRotulada.configure({ resizable: false })
// Alineación de párrafos y títulos (2026-10-01). El texto del documento es
// JUSTIFICADO: ese es el valor por omisión y el serializador no emite nada
// para él; centrar o alinear a la derecha sí se traduce (\\centering…).
const Alineacion = TextAlign.configure({
  types: ['paragraph', 'heading'],
  alignments: ['justify', 'left', 'center', 'right'],
  defaultAlignment: 'justify',
})

/** Partes de un proyecto. `historial: false` en modo compartido: el
 *  deshacer lo lleva Yjs (por persona), no el historial de ProseMirror. */
export function extensionesParte({ historial = true }: { historial?: boolean } = {}): AnyExtension[] {
  return [
    historial ? KitParte : KitParteSinHistorial,
    TablaRotulada,
    TableRow,
    CabeceraAlineada,
    CeldaAlineada,
    NotaAlPie,
    SangriaParrafo,
    Alineacion,
    SaltoPagina,
    Fotografia,
    PegadoNotas,
    // 2026-10-05: m², CO₂ y ordinales; buscar y reemplazar (sin nodos nuevos).
    Superscript,
    Subscript,
    BuscarReemplazar,
    // 2026-10-06: citas enlazadas (autocompletado «Ley…», «@…»); se vuelven relaciones.
    Referencia,
    // 2026-10-19: control de cambios (modo sugerir): marcas de inserción, supresión y formato sugerido
    // por autor, y los atributos de párrafo (división o unión sugerida) que ControlCambios añade.
    Insercion,
    Supresion,
    CambioFormato,
    ControlCambios,
    // 2026-10-19: resaltado de revisión (no sale al PDF).
    Resaltado,
    // 2026-10-19: comentarios anclados a un tramo (la marca lleva el id del comentario).
    Comentario,
    // 2026-10-19: color de texto (paleta de la identidad); sale al PDF y al Word.
    ColorTexto,
  ]
}

/** Cuerpo de un documento: lo mismo que una parte, más los enlaces (del kit). */
export function extensionesDocumento({ historial = true }: { historial?: boolean } = {}): AnyExtension[] {
  return [
    historial ? KitDocumento : KitDocumentoSinHistorial,
    TablaDocumento,
    TableRow,
    CabeceraAlineada,
    CeldaAlineada,
    NotaAlPie,
    SangriaParrafo,
    Alineacion,
    SaltoPagina,
    Fotografia,
    PegadoNotas,
    // 2026-10-05: m², CO₂ y ordinales; buscar y reemplazar (sin nodos nuevos).
    Superscript,
    Subscript,
    BuscarReemplazar,
    // 2026-10-06: citas enlazadas (autocompletado «Ley…», «@…»); se vuelven relaciones.
    Referencia,
    // 2026-10-19: control de cambios (modo sugerir): marcas de inserción, supresión y formato sugerido
    // por autor, y los atributos de párrafo (división o unión sugerida) que ControlCambios añade.
    Insercion,
    Supresion,
    CambioFormato,
    ControlCambios,
    // 2026-10-19: resaltado de revisión (no sale al PDF).
    Resaltado,
    // 2026-10-19: comentarios anclados a un tramo (la marca lleva el id del comentario).
    Comentario,
    // 2026-10-19: color de texto (paleta de la identidad); sale al PDF y al Word.
    ColorTexto,
  ]
}

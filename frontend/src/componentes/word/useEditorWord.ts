/**
 * EL EDITOR de una sección del Formato Word (2026-10-19), local o en edición simultánea: el mismo
 * arreglo que el formulario (`EditorDocumento`) y que la parte de un proyecto (`EditorParteCompartida`):
 * con un `nombreCompartido` (`doc:<id>:<generación>` o `pl:<pid>:<parte>:<generación>`) se conecta al
 * servidor de texto compartido (Yjs/Hocuspocus) y carga Collaboration + los cursores; sin él, el editor
 * local con su historial de deshacer. Un solo lugar para esa decisión en todos los módulos.
 */
import { useMemo, useRef } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import type { AnyExtension } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { colorDe, useProveedorCompartido, type EstadoConexion } from '../textoCompartido'
import { AutocompletarReferencias, type ControlReferencias } from '../../extensiones/AutocompletarReferencias'
import { leerOrtografia } from './menus'

export function useEditorWord({ extensiones, nombreCompartido, control, alRecargar, alFallar }: {
  /** `extensionesDocumento` o `extensionesParte`: se llaman con `{historial:false}` en compartido. */
  extensiones: (o?: { historial?: boolean }) => AnyExtension[]
  nombreCompartido: string | null
  /** El control del autocompletado de referencias («Ley…», «@…»), uno por sección; lo escucha `PopupReferencias`. */
  control?: ControlReferencias
  alRecargar: () => void
  alFallar: (motivo: string) => void
}): { editor: Editor | null; proveedor: HocuspocusProvider | null; estado: EstadoConexion; enVivo: boolean } {
  // Las llamadas de vuelta por ref: el proveedor no debe reconectarse porque cambie una closure.
  const recargarRef = useRef(alRecargar)
  recargarRef.current = alRecargar
  const fallarRef = useRef(alFallar)
  fallarRef.current = alFallar
  const { proveedor, estado } = useProveedorCompartido(nombreCompartido, {
    alRecargar: () => recargarRef.current(),
    alFallar: (m) => fallarRef.current(m),
  })
  const yo = localStorage.getItem('sgdp_nombre') ?? 'Yo'
  const lista = useMemo(
    () => {
      const base = proveedor
        ? [...extensiones({ historial: false }), Collaboration.configure({ document: proveedor.document }), CollaborationCaret.configure({ provider: proveedor, user: { name: yo, color: colorDe(yo) } })]
        : extensiones()
      return control ? [...base, AutocompletarReferencias.configure({ control })] : base
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proveedor, yo, control],
  )
  // El corrector del navegador en español (como el de Google Docs): subraya lo dudoso y ofrece corregir;
  // la barra lo apaga y lo prende (Herramientas › Ortografía) y se recuerda.
  const editor = useEditor({ extensions: lista, shouldRerenderOnTransaction: false, editorProps: { attributes: { spellcheck: leerOrtografia() ? 'true' : 'false', lang: 'es' } } }, [lista])
  return { editor, proveedor, estado, enVivo: proveedor !== null }
}

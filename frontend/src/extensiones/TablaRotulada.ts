// TablaRotulada — la tabla del editor con TÍTULO y FUENTE (2026-10-05: los
// cuadros del costo-beneficio y de la exposición de motivos llevan «CUADRO —
// N° n», su título y la fuente, como la fotografía). Los dos van en atributos
// de la tabla: el serializador los compone en el PDF y el editor los muestra
// encima y debajo (estiloContenido de BarraFormato), sin nodos nuevos.
//
// Imports con `.ts`: lo carga también el servidor de edición simultánea.
import { Table } from '@tiptap/extension-table'

const texto = (nombre: string) => ({
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${nombre}`) ?? '',
  renderHTML: (attrs: Record<string, unknown>) => (attrs[nombre] ? { [`data-${nombre}`]: String(attrs[nombre]) } : {}),
})

export const TablaRotulada = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      titulo: texto('titulo'),
      fuente: texto('fuente'),
    }
  },
})

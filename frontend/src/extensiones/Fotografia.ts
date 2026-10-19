// Fotografia — nodo TipTap para una fotografía dentro del texto (2026-10-05).
//
// Bloque ATÓMICO: la imagen la guarda el servidor (`POST /api/proyectos/{id}/imagenes`)
// y el nodo solo lleva su nombre (`archivo`), la dirección para verla (`src`), el
// título, la fuente y el ancho. El serializador (backend/app/latex/serializador.py,
// `fotografia`) lo compone como \fotografia{…}: rótulo «FOTOGRAFÍA — N° n» numerado
// por la clase, título debajo y la fuente en nota al pie.
import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fotografia: {
      insertarFotografia: (attrs: { archivo: string; src: string; titulo: string; fuente: string; ancho?: number }) => ReturnType
    }
  }
}

const atributo = (nombre: string, defecto: string | number) => ({
  default: defecto,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${nombre}`) ?? defecto,
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${nombre}`]: attrs[nombre] }),
})

/** La imagen se pide con el token de la sesión (la API no sirve archivos sin él). */
function cargarImagen(img: HTMLImageElement, src: string) {
  const token = localStorage.getItem('sgdp_token')
  fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then((b) => { img.src = URL.createObjectURL(b) })
    .catch(() => { img.alt = 'No se pudo cargar la fotografía' })
}

export const Fotografia = Node.create({
  name: 'fotografia',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      archivo: atributo('archivo', ''),
      src: atributo('src', ''),
      titulo: atributo('titulo', ''),
      fuente: atributo('fuente', ''),
      ancho: atributo('ancho', 0.8),
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-fotografia]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-fotografia': '' })]
  },

  addCommands() {
    return {
      insertarFotografia: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs: { ancho: 0.8, ...attrs } }),
    }
  },

  addNodeView() {
    return ({ node }) => {
      const figura = document.createElement('figure')
      figura.setAttribute('data-fotografia', '')
      figura.contentEditable = 'false'
      figura.style.cssText = 'margin:12px auto;text-align:center;cursor:grab'
      const img = document.createElement('img')
      img.style.cssText = `max-width:${Math.round(Number(node.attrs.ancho || 0.8) * 100)}%;max-height:360px;display:block;margin:0 auto`
      img.alt = node.attrs.titulo || 'Fotografía'
      if (node.attrs.src) cargarImagen(img, node.attrs.src as string)
      const rotulo = document.createElement('figcaption')
      rotulo.style.cssText = 'color:#990000;font-size:13px;margin-top:4px'
      const fuente = node.attrs.fuente ? ` — Fuente: ${node.attrs.fuente}` : ''
      rotulo.innerHTML = '<b>FOTOGRAFÍA — N° (se numera en el PDF)</b><br>'
      const titulo = document.createElement('i')
      titulo.textContent = `${node.attrs.titulo || '(sin título)'}${fuente}`
      rotulo.appendChild(titulo)
      figura.append(img, rotulo)
      return { dom: figura }
    }
  },
})

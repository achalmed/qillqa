/**
 * textoCompartido — la conexión de un editor con el servidor de EDICIÓN
 * SIMULTÁNEA (frontend/colab/servidor.ts, por /colab). La usan las partes del
 * proyecto de ley (`pl:<proyecto>:<parte>:<gen>`, EditorParteCompartida) y los
 * documentos (`doc:<id>:<gen>`, EditorDocumento; paso 5.6, 2026-10-05).
 *
 * Un proveedor (y un Y.Doc) por nombre: otro nombre = otro texto. Si el
 * servidor descarta el texto (generación vieja, modo apagado) se pide
 * `alRecargar` —traer el nombre vigente— y el estado viejo se suelta entero:
 * unirlo con el nuevo duplicaría el texto (backend/app/servicios/colab.py).
 * Si no sincroniza al abrir, `alFallar` devuelve la página al modo por turnos.
 */
import { useEffect, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

export type EstadoConexion = 'conectando' | 'en_vivo' | 'reconectando'

// Cierre «Reset Connection» de Hocuspocus: el servidor descartó este texto
// (generación vieja). Hay que soltarlo entero, no reconectar.
const CIERRE_REINICIO = 4205
// Sin sincronizar en este plazo al abrir = sin servidor: modo por turnos.
const ESPERA_MS = 8000

// Tonos apagados (2026-10-19): el cursor de cada persona se distingue sin colores vivos.
const COLORES = ['#5E5E63', '#6A7A94', '#6F8A72', '#B5484D', '#9A7A3C', '#7D6A60', '#5E7A7B', '#7A6A8C']
/** Color estable del cursor de una persona (el mismo en todas las pantallas). */
export const colorDe = (nombre: string) => COLORES[[...nombre].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORES.length]

const urlColab = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/colab`

/** Conecta con el texto `nombre` (null = sin modo compartido). */
export function useProveedorCompartido(
  nombre: string | null,
  { alRecargar, alFallar }: { alRecargar: () => void; alFallar: (motivo: string) => void },
): { proveedor: HocuspocusProvider | null; estado: EstadoConexion } {
  const [proveedor, setProveedor] = useState<HocuspocusProvider | null>(null)
  const [estado, setEstado] = useState<EstadoConexion>('conectando')
  const sincronizado = useRef(false)
  // Las callbacks del padre cambian en cada render; el proveedor no debe.
  const padre = useRef({ alRecargar, alFallar })
  padre.current = { alRecargar, alFallar }

  useEffect(() => {
    if (!nombre) return
    sincronizado.current = false
    setEstado('conectando')
    const doc = new Y.Doc()
    const p = new HocuspocusProvider({
      url: urlColab(),
      name: nombre,
      document: doc,
      // La misma sesión de Qillqa: el servidor se la presenta a la API.
      token: localStorage.getItem('sgdp_token') ?? '',
      onSynced: () => {
        sincronizado.current = true
        setEstado('en_vivo')
      },
      onStatus: ({ status }) => {
        if (status === 'connected') {
          if (sincronizado.current) setEstado('en_vivo')
        } else if (sincronizado.current) {
          // Ya se estaba escribiendo: Yjs guarda lo de aquí y lo une al volver.
          setEstado('reconectando')
        }
      },
      onAuthenticationFailed: () => {
        // Generación vieja o modo apagado: recargar trae el nombre vigente (el
        // padre monta otro editor). Si no cambia nada, vence la espera.
        padre.current.alRecargar()
      },
      onClose: ({ event }) => {
        if (event.code === CIERRE_REINICIO) {
          p.destroy()
          doc.destroy()
          padre.current.alRecargar()
        }
      },
    })
    setProveedor(p)
    const espera = window.setTimeout(() => {
      if (!sincronizado.current) padre.current.alFallar('el servidor de edición simultánea no respondió')
    }, ESPERA_MS)
    return () => {
      window.clearTimeout(espera)
      p.destroy()
      doc.destroy()
      setProveedor(null)
    }
  }, [nombre])

  return { proveedor: nombre ? proveedor : null, estado }
}

/** Quién más está en el texto (con su color de cursor), por awareness de Yjs. */
export function useOtrosEnTexto(proveedor: HocuspocusProvider | null): { name: string; color: string }[] {
  const [otros, setOtros] = useState<{ name: string; color: string }[]>([])
  useEffect(() => {
    const aw = proveedor?.awareness
    if (!aw) {
      setOtros([])
      return
    }
    // El awareness avisa en cada movimiento de cursor ajeno: se repinta solo si
    // cambió quién está (cliente, nombre o color), no por cada tecla.
    let firma: string | null = null
    const ver = () => {
      const lista: { name: string; color: string }[] = []
      const claves: string[] = []
      aw.getStates().forEach((st, id) => {
        const u = (st as { user?: { name: string; color: string } }).user
        if (id !== aw.clientID && u?.name) {
          lista.push(u)
          claves.push(`${id}\u0001${u.name}\u0001${u.color}`)
        }
      })
      const nueva = claves.sort().join('\u0002')
      if (nueva === firma) return
      firma = nueva
      setOtros(lista)
    }
    ver()
    aw.on('change', ver)
    return () => aw.off('change', ver)
  }, [proveedor])
  return otros
}

/** Estilos de los cursores de las demás personas, con su nombre encima. */
export const estiloCursores = {
  '& .collaboration-carets__caret': { position: 'relative', mx: '-1px', borderLeft: '1px solid', borderRight: '1px solid', wordBreak: 'normal', pointerEvents: 'none' },
  '& .collaboration-carets__label': { position: 'absolute', top: '-1.35em', left: '-1px', fontSize: 11, fontWeight: 600, lineHeight: 'normal', whiteSpace: 'nowrap', color: '#fff', px: '4px', py: '1px', borderRadius: '3px 3px 3px 0', userSelect: 'none' },
} as const

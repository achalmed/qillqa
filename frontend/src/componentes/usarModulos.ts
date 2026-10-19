/**
 * El estado de los módulos desde el servidor (2026-10-18; src/modulos.ts guarda lo último). Se pide
 * una vez por carga de página —lo pide el Marco— y cada vez que Administración cambia uno; un 403
 * `modulo_apagado` de cualquier pantalla también lo pone al día (api.ts).
 */
import { useEffect, useState } from 'react'
import { api } from '../api'
import { alCambiarModulos, recordarModulos, type EstadoModulo } from '../modulos'

let pedido: Promise<EstadoModulo[] | null> | null = null

export function refrescarModulos(forzar = false): Promise<EstadoModulo[] | null> {
  if (!pedido || forzar) {
    pedido = api<EstadoModulo[]>('/api/modulos')
      .then((lista) => {
        recordarModulos(lista)
        return lista
      })
      .catch(() => {
        pedido = null
        return null
      })
  }
  return pedido
}

/** Vuelve a pintar el componente cuando cambia un módulo; la primera vez, lo pide al servidor. */
export function useModulos(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    void refrescarModulos()
    return alCambiarModulos(() => setVersion((v) => v + 1))
  }, [])
  return version
}

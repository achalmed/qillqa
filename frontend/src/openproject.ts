/**
 * OpenProject desde la web de Qillqa (2026-10-02): si la integración está encendida
 * y con qué dirección se abre. Se pide una vez por pestaña.
 */
import { api } from './api'

export interface ConfigOP { activa: boolean; url: string }

let pedido: Promise<ConfigOP> | null = null

export function configOP(): Promise<ConfigOP> {
  if (!pedido) pedido = api<ConfigOP>('/api/openproject/config').catch(() => ({ activa: false, url: '' }))
  return pedido
}

/** Abre un paquete de trabajo en pestaña nueva. */
export async function abrirPaquete(id: number | string): Promise<void> {
  const c = await configOP()
  if (c.url) window.open(`${c.url}/work_packages/${id}`, '_blank', 'noopener')
}

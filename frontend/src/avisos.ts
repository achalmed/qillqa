/**
 * CAMPANA DE AVISOS: la lógica pura (2026-10-19; Edison: «la notificación está muy abrumadora»).
 * El servidor manda un aviso por mensaje de chat («María …: oky doky», «…: JEJE», «…: ok»), y la
 * campana los listaba uno a uno con el nombre repetido y la fecha larga. Aquí se agrupan los
 * mensajes seguidos de la misma persona en el mismo canal en UNA entrada («Roxana · 3 mensajes ·
 * el último»), un recordatorio se parte en título y cuándo, y la hora se acorta («9:33 a. m.»,
 * «ayer», «18/10»). Puro; pruebas en `pruebas/avisos.test.ts`.
 */

export interface AvisoBase {
  id: number
  tipo: string
  texto: string
  leida: boolean
  destino?: string
  creado_en: string | null
  documento?: string
}

export interface GrupoAvisos<A extends AvisoBase = AvisoBase> {
  /** El aviso que se abre (el más reciente del grupo). */
  cabeza: A
  /** Todos los del grupo, del más reciente al más viejo. */
  avisos: A[]
  /** Quién o qué: la persona del chat, el título del evento, o el texto entero. */
  titulo: string
  /** La segunda línea: el último mensaje, el cuándo del recordatorio, el documento. */
  detalle: string
  sinLeer: number
}

/** El canal de un aviso de chat (`chat:<canal>:<mensaje>`), o '' si no es de chat. */
export const canalDe = (destino?: string): string => {
  if (!destino?.startsWith('chat:')) return ''
  return destino.split(':')[1] ?? ''
}

/** «Nombre: texto» → [Nombre, texto]; sin dos puntos, [texto, '']. */
export function partirChat(texto: string): [string, string] {
  const i = texto.indexOf(': ')
  return i > 0 && i < 60 ? [texto.slice(0, i), texto.slice(i + 2)] : [texto, '']
}

/** «Recordatorio: 19/10 08:45 · Título · Lugar» → [Título, '19/10 08:45 · Lugar']. */
export function partirRecordatorio(texto: string): [string, string] | null {
  const m = /^Recordatorio:\s*(\S+\s+[^·]+?)\s*·\s*(.+)$/.exec(texto)
  if (!m) return null
  const partes = m[2].split(' · ')
  const titulo = partes.shift() ?? m[2]
  return [titulo, [m[1].trim(), ...partes].join(' · ')]
}

/** Agrupa los avisos (ya ordenados del más reciente al más viejo). */
export function agruparAvisos<A extends AvisoBase>(avisos: readonly A[]): GrupoAvisos<A>[] {
  const grupos: GrupoAvisos<A>[] = []
  for (const a of avisos) {
    const canal = canalDe(a.destino)
    const [quien, ultimo] = a.tipo === 'chat' ? partirChat(a.texto) : ['', '']
    const previo = grupos[grupos.length - 1]
    if (a.tipo === 'chat' && canal && previo && previo.cabeza.tipo === 'chat' && canalDe(previo.cabeza.destino) === canal && previo.titulo === quien) {
      previo.avisos.push(a)
      previo.sinLeer += a.leida ? 0 : 1
      previo.detalle = `${previo.avisos.length} mensajes · ${partirChat(previo.cabeza.texto)[1]}`
      continue
    }
    let titulo = a.texto
    let detalle = a.documento ?? ''
    if (a.tipo === 'chat' && quien) {
      titulo = quien
      detalle = ultimo
    } else {
      const r = partirRecordatorio(a.texto)
      if (r) [titulo, detalle] = r
    }
    // El documento o la tarea que ya dice el texto no se repite debajo («Venció 14/10: Firmas…» / «Tarea: Firmas…»).
    const nucleo = detalle.replace(/^(Tarea|Documento|Evento|Proyecto):\s*/, '')
    if (nucleo && titulo.includes(nucleo)) detalle = ''
    grupos.push({ cabeza: a, avisos: [a], titulo, detalle, sinLeer: a.leida ? 0 : 1 })
  }
  return grupos
}

/** La hora breve: hoy, la hora; ayer, «ayer»; antes, día/mes. */
export function horaBreve(iso: string | null, ahora = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mismoDia = (x: Date, y: Date) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  if (mismoDia(d, ahora)) return d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })
  const ayer = new Date(ahora); ayer.setDate(ahora.getDate() - 1)
  if (mismoDia(d, ayer)) return 'ayer'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
}

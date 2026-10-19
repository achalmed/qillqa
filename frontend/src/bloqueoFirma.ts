/**
 * Documento FIRMADO = solo lectura en el editor (Edison 2026-10-06).
 *
 * Un documento con la firma en curso mostraba el editor abierto: el aviso
 * «hay cambios en el formulario… pulse Guardar o Vista previa» aparecía con
 * cualquier toque (Ordenar texto de Word, un ajuste de formato) e invitaba a
 * guardar, y guardar un cambio de lo impreso ANULA la firma
 * (backend/app/servicios/vigencia.py). Lo ya firmado, enviado o en trámite
 * no se reescribe: el editor lo abre bloqueado y solo un «Editar de todos
 * modos» explícito lo desbloquea (el servidor sigue preguntando al guardar).
 *
 * La regla es la de `vigencia.ciclo_activo`: firmado cargado, cargo de
 * recepción, registro en el STD o estado firmado/enviado. El servidor la
 * manda resuelta en `firma_en_curso`; si no viene (API anterior al
 * 2026-10-06), se deduce de lo que el detalle ya trae.
 *
 * Puro (sin navegador): lo prueba pruebas/bloqueoFirma.test.ts.
 */

export const ESTADOS_CON_FIRMA = new Set(['FIRMADO', 'ENVIADO', 'OBSERVADO_ENVIADO'])

export interface DatosFirma {
  firma_en_curso?: boolean
  estado: string
  tramite?: { firmado?: boolean; std?: boolean; recepciones?: number } | null
}

/** ¿Un cambio de lo impreso anularía una firma? */
export function firmaEnCurso(doc: DatosFirma): boolean {
  if (typeof doc.firma_en_curso === 'boolean') return doc.firma_en_curso
  const t = doc.tramite
  return (
    ESTADOS_CON_FIRMA.has(doc.estado) ||
    Boolean(t?.firmado) ||
    Boolean(t?.std) ||
    (t?.recepciones ?? 0) > 0
  )
}

export const PREGUNTA_DESBLOQUEO =
  'Si guarda un cambio, la firma se anula y hay que volver a firmar el documento.'

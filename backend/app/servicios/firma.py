"""Anulación de la firma (la ejecuta la regla de servicios/vigencia.py).

Regla (pedido de Edison 2026-09-01, ampliada 2026-10-06): si un documento YA
firmado cambia en lo que se imprime, la firma anterior deja de corresponder y
el sistema la ANULA solo. Qué cuenta como «lo que se imprime» y cuándo se
llama lo decide `vigencia.aplicar`; aquí solo se ejecuta la anulación:

  1. El/los firmado(s) pasan a ``adjuntos/anulados/`` (no se borran: es
     recuperable, como el ``gio trash`` de los Word) y se borra su registro.
  2. Los cargos de recepción de esa versión pasan a «recepcion_anulada»: se
     conservan y se ven como historia, pero ya no cuentan. Antes sobrevivían y,
     al subir el nuevo firmado, el documento saltaba a ENVIADO al instante con
     los cargos de la versión anulada.
  3. El registro en el STD, que era de la versión anulada, se retira (queda
     en la bitácora y en la nota del STD).
  4. El expediente firmado se aparta a ``expediente/anulados/``.
  5. El documento vuelve a «pendiente de firma» = APROBADO si estaba
     FIRMADO / ENVIADO / OBSERVADO_ENVIADO. El NÚMERO no cambia.

Los archivos se mueven con `vigencia.mover`: si la transacción no llega al
commit, vuelven a su lugar.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Adjunto, Documento, Usuario
from app.servicios import bitacora, vigencia
from app.servicios.adjuntos import _dir_adjuntos, ruta_en_disco

# Estados que implican una firma ya aplicada. Al invalidarla se vuelve a
# «pendiente de firma» = APROBADO (numerado, sin firmar).
_ESTADOS_FIRMADO = vigencia.ESTADOS_FIRMADO


async def _firmados(sesion: AsyncSession, documento_id: int) -> list[Adjunto]:
    return list(
        (
            await sesion.execute(
                select(Adjunto).where(
                    Adjunto.documento_id == documento_id,
                    Adjunto.categoria == "firmado",
                )
            )
        ).scalars().all()
    )


async def anular_firma(
    sesion: AsyncSession, doc: Documento, usuario: Usuario, motivo: str
) -> dict | None:
    """Anula el ciclo de firma en curso, sea cual sea el motivo. No hace
    commit (lo hace el llamador). Devuelve qué se anuló —firmados, cargos que
    dejan de contar, registro STD, expediente retirado— o None si no había
    nada que anular."""
    firmados = await _firmados(sesion, doc.id)
    cargos = await vigencia.cargos_vigentes(sesion, doc)
    habia_std = bool(doc.std_registrado)
    if not firmados and not cargos and not habia_std and doc.estado not in _ESTADOS_FIRMADO:
        return None

    dir_adj = _dir_adjuntos(doc)
    for adj in firmados:
        ruta = ruta_en_disco(doc, adj)
        if ruta is not None and dir_adj is not None:
            vigencia.mover(sesion, ruta, dir_adj / vigencia.CARPETA_ANULADOS / ruta.name)
        await sesion.delete(adj)

    for c in cargos:
        c.categoria = vigencia.CARGO_ANULADO

    std = ""
    if habia_std:
        std = doc.std_numero or "sin número"
        previo = f"Registro STD de la versión anulada: {std}" + (f" ({doc.std_fecha})" if doc.std_fecha else "")
        doc.std_nota = f"{previo}. {doc.std_nota}".strip() if doc.std_nota else previo
        doc.std_registrado = False
        doc.std_numero = ""
        doc.std_fecha = ""
        doc.std_registrado_por = None

    expediente = vigencia.retirar_expediente(sesion, doc)

    anterior = doc.estado
    if doc.estado in _ESTADOS_FIRMADO:
        doc.estado = "APROBADO"
    salto = f" ({anterior} → APROBADO)" if anterior != doc.estado else ""
    partes = []
    if firmados:
        partes.append(f"{len(firmados)} archivo(s) firmado(s) movido(s) a adjuntos/anulados/")
    if cargos:
        partes.append(
            "cargos que ya no cuentan (de la versión anulada): "
            + ", ".join(c.etiqueta or c.nombre_original for c in cargos)
        )
    if habia_std:
        partes.append(f"registro en el STD retirado ({std})")
    if expediente:
        partes.append(f"expediente firmado retirado a expediente/anulados/ ({expediente})")
    bitacora.registrar(
        sesion,
        doc.id,
        usuario,
        "firma_invalidada",
        f"Firma anulada por {motivo}{salto}"
        + (f"; {'; '.join(partes)}" if partes else "")
        + ". Debe volver a firmarse. El número no cambia.",
    )
    return {
        "motivo": motivo,
        "firmados": len(firmados),
        "cargos": [c.etiqueta or c.nombre_original for c in cargos],
        "std": std,
        "expediente": expediente or "",
        "estado_anterior": anterior,
    }

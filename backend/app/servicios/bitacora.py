"""Rastro de auditoría del documento: eventos (quién hizo qué) y
versiones (instantáneas inmutables del contenido). Nada se sobrescribe
ni se borra."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Documento, Evento, Usuario, VersionDocumento


def registrar(
    sesion: AsyncSession,
    doc_id: int,
    usuario: Usuario,
    accion: str,
    detalle: str = "",
) -> None:
    """Anota un evento en la bitácora (append-only)."""
    sesion.add(
        Evento(
            documento_id=doc_id,
            usuario_id=usuario.id,
            accion=accion,
            detalle=detalle,
        )
    )


NOTA_AUTOMATICO = "Guardado automático"
# El guardado automático (2026-10-08) corre a los pocos segundos de dejar de
# escribir: una versión por guardado llenaría el historial. Dentro de esta
# ventana se guarda el documento sin sumar versión ni evento; ninguna versión
# se sobrescribe.
VENTANA_AUTOMATICO_S = 180


async def automatico_reciente(sesion: AsyncSession, doc_id: int, usuario: Usuario) -> bool:
    """¿Esta persona dejó una versión automática del documento hace menos de
    `VENTANA_AUTOMATICO_S`?"""
    ultimo = (
        await sesion.execute(
            select(func.max(VersionDocumento.creado_en)).where(
                VersionDocumento.documento_id == doc_id,
                VersionDocumento.creado_por == usuario.id,
                VersionDocumento.nota == NOTA_AUTOMATICO,
            )
        )
    ).scalar()
    if ultimo is None:
        return False
    ahora = (await sesion.execute(select(func.now()))).scalar()
    return (ahora - ultimo).total_seconds() < VENTANA_AUTOMATICO_S


async def versionar(
    sesion: AsyncSession, doc: Documento, usuario: Usuario, nota: str
) -> None:
    """Guarda una instantánea del contenido actual. Se llama en cada
    guardado/generación: nunca se sobrescribe una versión anterior."""
    ultimo = (
        await sesion.execute(
            select(func.max(VersionDocumento.numero_version)).where(
                VersionDocumento.documento_id == doc.id
            )
        )
    ).scalar()
    sesion.add(
        VersionDocumento(
            documento_id=doc.id,
            numero_version=(ultimo or 0) + 1,
            campos=dict(doc.campos),
            cuerpo=dict(doc.cuerpo),
            nota=nota,
            creado_por=usuario.id,
        )
    )

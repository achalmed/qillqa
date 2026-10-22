"""Campana de avisos: lo que el sistema tiene que decirle a cada persona."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from tiqsi.modulo import opcional

from app.db import obtener_sesion
from app.modelos import Notificacion, Usuario
from app.seguridad import usuario_actual
from app.servicios import notificaciones as svc

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])


@router.get("")
async def listar(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Mis avisos: los no leídos primero, luego los últimos leídos."""
    filas = (
        (
            await sesion.execute(
                select(Notificacion)
                .where(Notificacion.usuario_id == usuario.id)
                .order_by(Notificacion.leida, Notificacion.creado_en.desc())
                .limit(40)
            )
        )
        .scalars()
        .all()
    )
    ids = {n.documento_id for n in filas if n.documento_id}
    numeros: dict[int, str] = {}
    if ids:
        # El número es de Gestión documental: por «documentos.v1» (Qillqasqa Q3b, 2026-10-21).
        documentos = opcional("documentos.v1")
        numeros = {i: d["mostrado"] for i, d in (await documentos.descripciones(ids)).items()} if documentos else {}
    # El texto del aviso es historia (lo que pasó, como pasó); lo vinculado (`destino`) se nombra
    # con su valor VIGENTE en la línea de abajo (servicios/etiquetas.py, 2026-10-12).
    from app.servicios import etiquetas

    vigentes = await etiquetas.etiquetas_de(sesion, {n.destino for n in filas if n.destino and not n.documento_id})
    return {
        "pendientes": await svc.pendientes(sesion, usuario.id),
        "avisos": [
            {
                "id": n.id,
                "tipo": n.tipo,
                "texto": n.texto,
                "leida": n.leida,
                "documento_id": n.documento_id,
                "proyecto_id": n.proyecto_id,
                "destino": n.destino,
                "documento": numeros.get(n.documento_id or 0, "") or vigentes.get(n.destino or "", ""),
                "creado_en": n.creado_en.isoformat() if n.creado_en else None,
            }
            for n in filas
        ],
    }


@router.post("/{aviso_id}/leer")
async def leer(
    aviso_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    n = await sesion.get(Notificacion, aviso_id)
    if n is None or n.usuario_id != usuario.id:
        raise HTTPException(404, "El aviso no existe.")
    n.leida = True
    await sesion.commit()
    return {"ok": True, "pendientes": await svc.pendientes(sesion, usuario.id)}


@router.post("/leer-todas")
async def leer_todas(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    await sesion.execute(
        update(Notificacion)
        .where(Notificacion.usuario_id == usuario.id, Notificacion.leida.is_(False))
        .values(leida=True)
    )
    await sesion.commit()
    return {"ok": True, "pendientes": 0}

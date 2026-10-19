"""Avisos a todos con una acción (2026-10-05): ver el vigente, publicar y retirar."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import anuncios as svc

router = APIRouter(prefix="/api/anuncios", tags=["anuncios"])


class DatosAnuncio(BaseModel):
    texto: str
    accion: str = "entendido"
    horas: int = 24


@router.get("/vigente")
async def ver_vigente(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    return {"anuncio": svc.a_dict(await svc.vigente(sesion))}


@router.post("")
async def publicar(
    datos: DatosAnuncio,
    admin: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    try:
        a = await svc.publicar(sesion, datos.texto, datos.accion, admin.id, datos.horas)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return {"anuncio": svc.a_dict(a)}


@router.post("/retirar")
async def retirar(
    admin: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    return {"retirados": await svc.retirar(sesion)}

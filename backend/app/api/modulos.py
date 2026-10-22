"""Encender y apagar MÓDULOS (2026-10-18; servicios/modulos.py, docs/arquitectura.md §33).

- `GET /api/modulos`        — el catálogo con su estado (todo el equipo: la web arma el menú con esto).
- `PUT /api/modulos/{id}`   — encender, apagar o cambiar el mensaje (solo administración).

Es del núcleo: el guardián de módulos no la bloquea nunca, así que un módulo apagado se vuelve a
encender desde aquí.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import modulos
from app.servicios.eventos_bandeja import anotar_bitacora

router = APIRouter(prefix="/api/modulos", tags=["módulos"])


class CambioModulo(BaseModel):
    activo: bool | None = None
    mensaje: str | None = Field(default=None, max_length=modulos.MAX_MENSAJE + 100)


@router.get("")
async def listar(_: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> list[dict]:
    return modulos.vista(await modulos.estado(sesion))


@router.put("/{mid}")
async def cambiar(mid: str, datos: CambioModulo, usuario: Usuario = Depends(solo_administrador),
                  sesion: AsyncSession = Depends(obtener_sesion)) -> list[dict]:
    if mid not in modulos.POR_ID:
        raise HTTPException(404, "Ese módulo no existe o no se puede apagar.")
    antes = await modulos.estado(sesion)
    est = await modulos.guardar(sesion, mid, datos.activo, datos.mensaje)
    nombre = modulos.POR_ID[mid]["nombre"]
    if antes[mid]["activo"] != est[mid]["activo"]:
        await anotar_bitacora(sesion, usuario, "ajustes", f"Módulo «{nombre}» {'encendido' if est[mid]['activo'] else 'apagado'}")
    if antes[mid]["mensaje"] != est[mid]["mensaje"]:
        await anotar_bitacora(sesion, usuario, "ajustes", f"Mensaje de «{nombre}» apagado: «{est[mid]['mensaje']}»")
    await sesion.commit()
    modulos.invalidar()
    return modulos.vista(est)

"""Estadísticas de uso (2026-10-19): recibir lotes de la web y servir el panel de Administración → Uso.

`POST /api/uso` acepta la sesión por cabecera (fetch) o dentro del cuerpo (`sesion`), porque
`navigator.sendBeacon` no manda cabeceras; nunca pide permiso por registro. Las consultas son solo
del administrador. Qué se guarda y qué no: servicios/uso.py y docs/decisiones.md.
"""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.db import obtener_sesion
from app.modelos import Usuario
from app.seguridad import solo_administrador
from app.servicios import presencia as svc_presencia
from app.servicios import uso as svc

router = APIRouter(prefix="/api/uso", tags=["uso"])


class Lote(BaseModel):
    sesion: str = Field(default="", max_length=2000)
    eventos: list[dict] = Field(default_factory=list, max_length=svc.MAX_LOTE)


async def _usuario_del_lote(peticion: Request, lote: Lote, sesion: AsyncSession) -> Usuario | None:
    cabecera = peticion.headers.get("authorization", "")
    token = cabecera[7:] if cabecera.lower().startswith("bearer ") else lote.sesion
    if not token:
        return None
    try:
        carga = jwt.decode(token, config.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    u = (await sesion.execute(select(Usuario).where(Usuario.id == int(carga["sub"])))).scalar_one_or_none()
    return u if u and u.activo else None


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def recibir(
    peticion: Request,
    lote: Lote,
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Un lote de hechos de una pestaña. Sin sesión válida se descarta en silencio (204): la
    telemetría nunca interrumpe ni delata nada."""
    usuario = await _usuario_del_lote(peticion, lote, sesion)
    if usuario is not None and lote.eventos:
        await svc.guardar_lote(sesion, usuario.id, lote.eventos)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/resumen")
async def resumen(
    dias: int = 7,
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if dias not in (1, 7, 30, 90):
        raise HTTPException(422, "dias: 1, 7, 30 o 90.")
    return await svc.resumen(sesion, dias)


@router.get("/cuentas")
async def cuentas(
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Supervisión: cada cuenta activa con su estado de presencia REAL (aunque la persona lo haya
    apagado para los demás) y lo último que hizo según la tabla de uso."""
    usuarios = (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True)).order_by(Usuario.nombre_completo))).scalars().all()
    por = await svc.por_cuenta(sesion)
    filas = []
    for u in usuarios:
        latido = svc_presencia.latido_de(u.id)
        filas.append({
            "id": u.id,
            "nombre": u.nombre_completo,
            "rol": u.rol,
            "estado": svc_presencia.estado_de(latido),
            "muestra_presencia": u.mostrar_presencia,
            "ultima_actividad": (latido.ultimo if latido else u.ultima_actividad).isoformat() if (latido or u.ultima_actividad) else None,
            **(por.get(u.id) or {"ultimo_momento": None, "ultimo_modulo": "", "aparato": "", "version": "", "vistas_hoy": 0, "errores_hoy": 0}),
        })
    filas.sort(key=lambda f: (svc_presencia.ORDEN_ESTADO[f["estado"]], f["nombre"].lower()))
    return filas

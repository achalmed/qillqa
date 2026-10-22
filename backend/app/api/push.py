"""backend/app/api/push.py — avisos push en el celular (Web Push, 2026-10-13; servicios/push.py).

- `GET  /api/push/clave`: la clave pública VAPID con que el navegador se suscribe.
- `POST /api/push/suscripciones`: guarda la suscripción de ESTE dispositivo para la cuenta (si el
  mismo navegador ya estaba suscrito con otra cuenta, pasa a esta: un dispositivo, una persona).
- `DELETE /api/push/suscripciones`: la quita («Desactivar» en Mi perfil).
- `GET  /api/push/suscripciones`: cuántos dispositivos tiene la persona.
- `POST /api/push/probar`: un aviso de prueba a sus dispositivos (y cuántos lo aceptaron).
- `POST /api/push/recibido`: el acuse del service worker (sin sesión, con la firma que viaja en el
  aviso): el mensaje llegó al dispositivo, segundo ✓ para quien lo escribió.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Usuario
from app.modelos_push import SuscripcionPush
from app.seguridad import usuario_actual
from app.servicios import push as svc

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/clave")
async def clave(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    publica, _ = await svc.claves(sesion)
    return {"publica": publica, "disponible": svc.disponible()}


class Claves(BaseModel):
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class Suscripcion(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000, pattern=r"^https?://")
    keys: Claves
    dispositivo: str = Field("", max_length=200)


@router.post("/suscripciones")
async def suscribir(datos: Suscripcion, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    fila = (await sesion.execute(select(SuscripcionPush).where(SuscripcionPush.endpoint == datos.endpoint))).scalar_one_or_none()
    if fila is None:
        fila = SuscripcionPush(endpoint=datos.endpoint)
        sesion.add(fila)
    fila.usuario_id, fila.p256dh, fila.auth = usuario.id, datos.keys.p256dh, datos.keys.auth
    fila.dispositivo, fila.fallos = datos.dispositivo.strip()[:200], 0
    await sesion.commit()
    return {"ok": True, "id": fila.id}


class Baja(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)


@router.delete("/suscripciones")
async def dar_de_baja(datos: Baja, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    r = await sesion.execute(delete(SuscripcionPush).where(SuscripcionPush.endpoint == datos.endpoint, SuscripcionPush.usuario_id == usuario.id))
    await sesion.commit()
    return {"ok": True, "quitadas": r.rowcount or 0}


@router.get("/suscripciones")
async def mis_dispositivos(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    n = (await sesion.execute(select(func.count(SuscripcionPush.id)).where(SuscripcionPush.usuario_id == usuario.id))).scalar_one()
    return {"dispositivos": int(n), "disponible": svc.disponible()}


@router.post("/probar")
async def probar(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Un aviso de prueba a todos los dispositivos de la persona (aunque tenga Qillqa a la vista)."""
    if not svc.disponible():
        raise HTTPException(503, "El servidor no tiene instalado el envío de avisos (pywebpush).")
    enviados = await svc.enviar({usuario.id}, svc.carga("Qillqa", "Así le llegarán los avisos de Qillqa.", "/perfil", "qillqa-prueba", clase="prueba"))
    return {"enviados": enviados}


class Acuse(BaseModel):
    u: int
    c: int
    m: int
    f: str = Field(min_length=8, max_length=64)


@router.post("/recibido")
async def recibido(datos: Acuse) -> dict:
    """Sin sesión (el service worker no la tiene): vale la firma que Qillqa puso en el aviso. El ✓✓ lo pone el chat,
    por su contrato (Rimay R2)."""
    from tiqsi.modulo import opcional

    if not svc.acuse_valido(datos.u, datos.c, datos.m, datos.f):
        raise HTTPException(403, "Acuse sin firma válida.")
    conversaciones = opcional("conversaciones.v1")
    if conversaciones is not None:
        await conversaciones.acuse(datos.u, datos.c, datos.m)
    return {"ok": True}

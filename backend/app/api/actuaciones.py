"""API de las actuaciones del seguimiento (2026-10-12; servicios/actuaciones.py): listar las de una
entidad (`doc:N` o `entrada:M`), añadir una a mano, confirmar una que vino de un pegado y
retirarla. El pegado de seguimiento que las crea en lote vive en `api/seguimiento.py`
(`POST /api/documentos/{id}/pegar-seguimiento` y `/aplicar-seguimiento`).
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Actuacion, Documento, Entrada, Usuario
from app.seguridad import usuario_actual
from app.servicios import actuaciones as svc
from app.servicios import bitacora
from app.servicios import eventos_sistema

router = APIRouter(prefix="/api/actuaciones", tags=["actuaciones"])
_ENTIDAD = re.compile(r"^(doc|entrada):\d{1,9}$")


def _puede_escribir(u: Usuario) -> None:
    if u.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")


async def _existe(sesion: AsyncSession, entidad: str) -> None:
    if not _ENTIDAD.match(entidad or ""):
        raise HTTPException(422, "La entidad debe ser doc:N o entrada:M.")
    tipo, num = entidad.split(":")
    modelo = Documento if tipo == "doc" else Entrada
    if await sesion.get(modelo, int(num)) is None:
        raise HTTPException(404, "La entidad no existe.")


@router.get("")
async def listar(entidad: str = Query(..., max_length=80), _: Usuario = Depends(usuario_actual),
                 sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    await _existe(sesion, entidad)
    return {"actuaciones": await svc.listar(sesion, entidad), "clases": [{"v": c, "t": svc.ETIQUETA_CLASE[c]} for c in svc.CLASES]}


class Nueva(BaseModel):
    entidad: str = Field(max_length=80)
    fecha: str = Field(min_length=10, max_length=10)
    clase: str = "nota"
    texto: str = Field(min_length=1, max_length=4000)
    fuente: str = Field("", max_length=200)


@router.post("")
async def crear(datos: Nueva, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    _puede_escribir(usuario)
    await _existe(sesion, datos.entidad)
    if datos.clase not in svc.CLASES:
        raise HTTPException(422, f"Clase desconocida; use una de: {', '.join(svc.CLASES)}.")
    a = svc.crear(sesion, entidad=datos.entidad, fecha=datos.fecha, clase=datos.clase, texto=datos.texto,
                  fuente=datos.fuente, origen="persona", usuario=usuario)
    if datos.entidad.startswith("doc:"):
        bitacora.registrar(sesion, int(datos.entidad[4:]), usuario, "actuacion", f"{svc.ETIQUETA_CLASE[a.clase]} ({a.fecha}): {a.texto[:160]}")
    await sesion.flush()
    await eventos_sistema.emitir_seguro(sesion, "documento.actuacion", datos.entidad,
                                        {"numero": datos.entidad, "clase": a.clase, "texto": a.texto[:200], "fecha": a.fecha, "fuente": a.fuente, "responsable_id": None},
                                        clave=f"{datos.entidad}:actuacion:{a.id}", usuario=usuario)
    await sesion.commit()
    await sesion.refresh(a)
    return svc.como_dict(a, {usuario.id: usuario.nombre_completo})


async def _una(sesion: AsyncSession, aid: int) -> Actuacion:
    a = await sesion.get(Actuacion, aid)
    if a is None or a.retirada_en is not None:
        raise HTTPException(404, "La actuación no existe.")
    return a


@router.post("/{aid}/confirmar")
async def confirmar(aid: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Una actuación de origen 'pegado' pasa a contar: la confirma una persona."""
    _puede_escribir(usuario)
    a = await _una(sesion, aid)
    svc.confirmar(a, usuario)
    if a.entidad.startswith("doc:"):
        bitacora.registrar(sesion, int(a.entidad[4:]), usuario, "actuacion", f"Confirmó: {svc.ETIQUETA_CLASE.get(a.clase, a.clase)} ({a.fecha}): {a.texto[:140]}")
    await sesion.commit()
    return svc.como_dict(a, {usuario.id: usuario.nombre_completo})


@router.delete("/{aid}")
async def retirar(aid: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Aparta la actuación (nada se borra). Quien la creó o el administrador."""
    _puede_escribir(usuario)
    a = await _una(sesion, aid)
    if a.creado_por != usuario.id and usuario.rol != "administrador":
        raise HTTPException(403, "Solo quien la registró o el administrador puede retirarla.")
    svc.retirar(a)
    if a.entidad.startswith("doc:"):
        bitacora.registrar(sesion, int(a.entidad[4:]), usuario, "actuacion", f"Retiró: {svc.ETIQUETA_CLASE.get(a.clase, a.clase)} ({a.fecha}): {a.texto[:140]}")
    await sesion.commit()
    return {"ok": True}

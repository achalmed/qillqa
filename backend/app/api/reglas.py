"""backend/app/api/reglas.py — API de las reglas de los eventos del sistema (2026-10-12, fase 7;
servicios/eventos_sistema.py). Todo el equipo puede ver qué automatismos rigen (lo automático se
muestra); crear, cambiar, apagar o borrar una regla es del administrador. `GET /eventos` da el
vocabulario (qué eventos hay y qué campos traen) para el formulario; `GET /historial` lista los
eventos emitidos sobre una entidad y qué hizo cada regla.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import EventoSistema, ReglaEvento, Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import eventos_sistema as svc

router = APIRouter(prefix="/api/reglas", tags=["reglas"])


def _dict(r: ReglaEvento) -> dict:
    return {
        "id": r.id, "evento": r.evento, "nombre": r.nombre, "condicion": r.condicion or {}, "accion": r.accion,
        "destino": r.destino, "texto": r.texto, "activa": r.activa, "de_fabrica": r.de_fabrica,
        "que": svc.VOCABULARIO.get(r.evento, {}).get("que", r.evento),
    }


@router.get("")
async def listar(_: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    filas = (await sesion.execute(select(ReglaEvento).order_by(ReglaEvento.evento, ReglaEvento.id))).scalars().all()
    return {"reglas": [_dict(r) for r in filas]}


@router.get("/eventos")
async def eventos(_: Usuario = Depends(usuario_actual)) -> dict:
    return {
        "eventos": [{"nombre": k, **v} for k, v in svc.VOCABULARIO.items()],
        "acciones": list(svc.ACCIONES),
        "destinos": [*svc.DESTINOS_FIJOS, *(f"rol:{r}" for r in svc.ROLES)],
    }


class ReglaEntrada(BaseModel):
    evento: str = Field(max_length=60)
    nombre: str = Field("", max_length=160)
    condicion: dict = {}
    accion: str = "notificar"
    destino: str = Field("responsable", max_length=120)
    texto: str = Field("", max_length=2000)
    activa: bool = True


def _validar(d: ReglaEntrada) -> None:
    if d.evento not in svc.VOCABULARIO:
        raise HTTPException(422, f"Evento desconocido; los que hay: {', '.join(svc.VOCABULARIO)}.")
    if d.accion not in svc.ACCIONES:
        raise HTTPException(422, f"Acción desconocida; use una de: {', '.join(svc.ACCIONES)}.")
    if not svc.destino_valido(d.destino):
        raise HTTPException(422, "Destino no válido: responsable, autor, equipo, administradores, rol:<rol>, usuario:<id> o canal:<id>.")
    campos = set(svc.VOCABULARIO[d.evento]["campos"])
    raras = [c for c in d.condicion if c not in campos]
    if raras:
        raise HTTPException(422, f"La condición usa campos que el evento no trae: {', '.join(raras)}.")


@router.post("")
async def crear(datos: ReglaEntrada, usuario: Usuario = Depends(solo_administrador), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    _validar(datos)
    r = ReglaEvento(**datos.model_dump(), creado_por=usuario.id)
    sesion.add(r)
    await sesion.commit()
    await sesion.refresh(r)
    return _dict(r)


class ReglaCambio(BaseModel):
    nombre: str | None = Field(None, max_length=160)
    condicion: dict | None = None
    accion: str | None = None
    destino: str | None = Field(None, max_length=120)
    texto: str | None = Field(None, max_length=2000)
    activa: bool | None = None


@router.patch("/{rid}")
async def cambiar(rid: int, datos: ReglaCambio, _: Usuario = Depends(solo_administrador), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    r = await sesion.get(ReglaEvento, rid)
    if r is None:
        raise HTTPException(404, "La regla no existe.")
    cambios = datos.model_dump(exclude_unset=True)
    prueba = ReglaEntrada(evento=r.evento, nombre=cambios.get("nombre", r.nombre), condicion=cambios.get("condicion", r.condicion) or {},
                          accion=cambios.get("accion", r.accion), destino=cambios.get("destino", r.destino), texto=cambios.get("texto", r.texto),
                          activa=cambios.get("activa", r.activa))
    _validar(prueba)
    for k, v in cambios.items():
        setattr(r, k, v)
    await sesion.commit()
    return _dict(r)


@router.delete("/{rid}")
async def borrar(rid: int, _: Usuario = Depends(solo_administrador), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    r = await sesion.get(ReglaEvento, rid)
    if r is None:
        raise HTTPException(404, "La regla no existe.")
    await sesion.delete(r)
    await sesion.commit()
    return {"ok": True}


@router.get("/historial")
async def historial(entidad: str = Query("", max_length=80), limite: int = Query(50, ge=1, le=500),
                    _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Los eventos emitidos (sobre una entidad, o los últimos) y qué hizo cada regla con ellos."""
    q = select(EventoSistema).order_by(EventoSistema.id.desc()).limit(limite)
    if entidad:
        q = q.where(EventoSistema.entidad == entidad)
    filas = (await sesion.execute(q)).scalars().all()
    return {"eventos": [
        {"id": e.id, "nombre": e.nombre, "que": svc.VOCABULARIO.get(e.nombre, {}).get("que", e.nombre), "entidad": e.entidad,
         "datos": e.datos, "acciones": e.acciones, "creado_en": e.creado_en.isoformat() if e.creado_en else None}
        for e in filas
    ]}

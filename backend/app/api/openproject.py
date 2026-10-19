"""OpenProject desde Qillqa (2026-10-02): estado de la integración, «Sincronizar ahora»,
las tareas que OpenProject le asigna a cada persona, la agenda de la entidad y el enlace
de un documento o proyecto a su reflejo. La sincronización misma vive en
servicios/openproject_sync.py y corre sola."""

from __future__ import annotations

import asyncio
import time
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.db import obtener_sesion
from app.modelos import OpEnlace, Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import openproject as op
from app.servicios import openproject_mapa as mapa
from app.servicios import openproject_sync as sync

router = APIRouter(prefix="/api/openproject", tags=["openproject"])

# Tipos que forman la AGENDA (los del modelo de `openproject/`).
TIPOS_AGENDA = ("Reunión", "Actividad de agenda", "Hito", "Compromiso")
_cache: dict[str, tuple[float, object]] = {}


async def _con_cache(clave: str, segundos: float, fn):
    """Lecturas de OpenProject guardadas unos segundos: Inicio no lo consulta en cada vistazo."""
    ahora = time.monotonic()
    if clave in _cache and ahora - _cache[clave][0] < segundos:
        return _cache[clave][1]
    valor = await asyncio.to_thread(fn)
    _cache[clave] = (ahora, valor)
    return valor


def _sin_conexion(e: op.ErrorOP):
    raise HTTPException(503, f"OpenProject no está disponible: {e}")


@router.get("/config")
async def configuracion(usuario: Usuario = Depends(usuario_actual)) -> dict:
    return {"activa": op.activa(), "url": op.url_publica()}


async def _op_usuario(sesion: AsyncSession, usuario: Usuario) -> int | None:
    cat = await asyncio.to_thread(op.cliente().catalogo)
    return mapa.usuarios_op([{"id": usuario.id, "email": usuario.email, "nombre_usuario": usuario.nombre_usuario}], cat["usuarios"]).get(usuario.id)


@router.get("/mis-tareas")
async def mis_tareas(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Lo que OpenProject le asigna y está abierto, SIN los reflejos de Qillqa (esos ya
    salen en «Mis tareas» del propio Qillqa: no se muestran dos veces)."""
    if not op.activa():
        return {"activa": False, "vinculado": False, "tareas": []}
    try:
        op_id = await _op_usuario(sesion, usuario)
        if op_id is None:
            return {"activa": True, "vinculado": False, "tareas": []}
        cli = op.cliente()
        paquetes = await _con_cache(f"mias:{op_id}", 60, lambda: cli.paquetes(
            {"assignee": {"operator": "=", "values": [str(op_id)]}}, {"status": {"operator": "o", "values": []}},
            orden=[["dueDate", "asc"]], tope=100))
        clave_cf = cli.clave_campo(mapa.CAMPO_CLAVE)
        tareas = [op.resumen_paquete(w) for w in paquetes if not (clave_cf and str(w.get(clave_cf) or "").startswith("sgdp:"))]
        return {"activa": True, "vinculado": True, "tareas": tareas}
    except op.ErrorOP as e:
        _sin_conexion(e)


@router.get("/agenda")
async def agenda(dias: int = 14, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Reuniones, actividades, hitos y compromisos abiertos de hoy a `dias` días, de todo el
    despacho; `mio` marca lo que es de esta persona."""
    if not op.activa():
        return {"activa": False, "eventos": []}
    dias = max(1, min(dias, 60))
    desde, hasta = date.today().isoformat(), (date.today() + timedelta(days=dias)).isoformat()
    try:
        cli = op.cliente()
        cat = await asyncio.to_thread(cli.catalogo)
        tipos = [str(cat["tipos"][t]) for t in TIPOS_AGENDA if t in cat["tipos"]]
        if not tipos:
            return {"activa": True, "eventos": []}

        def leer():
            vistos: dict[int, dict] = {}
            for campo in ("startDate", "dueDate"):
                for w in cli.paquetes(
                    {"type": {"operator": "=", "values": tipos}}, {"status": {"operator": "o", "values": []}},
                    {campo: {"operator": "<>d", "values": [desde, hasta]}}, orden=[[campo, "asc"]], tope=200,
                ):
                    vistos[w["id"]] = w
            return list(vistos.values())

        paquetes = await _con_cache(f"agenda:{dias}", 60, leer)
        op_id = await _op_usuario(sesion, usuario)
        eventos = []
        for w in paquetes:
            r = op.resumen_paquete(w)
            href = (w.get("_links", {}).get("assignee") or {}).get("href") or ""
            r["mio"] = bool(op_id) and href.endswith(f"/{op_id}")
            eventos.append(r)
        eventos.sort(key=lambda r: (r["inicio"] or r["fin"] or "9999", r["asunto"]))
        return {"activa": True, "eventos": eventos}
    except op.ErrorOP as e:
        _sin_conexion(e)


@router.get("/enlace")
async def enlace(clave: str, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Dirección del reflejo en OpenProject de `sgdp:doc:12`, `sgdp:pl:3`…"""
    e = (await sesion.execute(select(OpEnlace).where(OpEnlace.clave == clave))).scalar_one_or_none()
    return {"activa": op.activa(), "url": op.url_wp(e.wp_id) if e and e.wp_id and op.activa() else ""}


@router.get("/estado")
async def estado(usuario: Usuario = Depends(solo_administrador), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Para el administrador: si está encendida, si responde, qué se refleja, qué falló
    y qué personas de Qillqa tienen cuenta en OpenProject."""
    salida: dict = {
        "activa": op.activa(), "url": op.url_publica(), "version": "", "conexion": "", "ultima": None,
        "enlaces": {}, "errores": [], "usuarios": [],
    }
    filas = (await sesion.execute(select(OpEnlace.clave, OpEnlace.wp_id, OpEnlace.error))).all()
    por_tipo: dict[str, dict] = {}
    for clave, wp_id, error in filas:
        t = clave.rsplit(":", 1)[0]
        d = por_tipo.setdefault(t, {"total": 0, "reflejados": 0, "con_error": 0})
        d["total"] += 1
        d["reflejados"] += 1 if wp_id else 0
        d["con_error"] += 1 if error else 0
    salida["enlaces"] = por_tipo
    salida["errores"] = [
        {"clave": c, "error": e, "url": op.url_wp(w)}
        for c, w, e in (await sesion.execute(
            select(OpEnlace.clave, OpEnlace.wp_id, OpEnlace.error).where(OpEnlace.error != "").order_by(OpEnlace.clave).limit(30)
        )).all()
    ]
    u = sync.ULTIMA
    salida["ultima"] = {"en": u["en"].isoformat() if u["en"] else None, "resumen": u["resumen"], "error": u["error"]}
    if not op.activa():
        return salida
    try:
        cli = op.cliente()
        salida["version"] = await asyncio.to_thread(cli.version)
        cat = await asyncio.to_thread(cli.catalogo, True)
        salida["conexion"] = "ok"
        sgdp = (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True)).order_by(Usuario.nombre_completo))).scalars().all()
        enlazados = mapa.usuarios_op([{"id": x.id, "email": x.email, "nombre_usuario": x.nombre_usuario} for x in sgdp], cat["usuarios"])
        por_id = {x["id"]: x for x in cat["usuarios"]}
        salida["usuarios"] = [
            {"id": x.id, "nombre": x.nombre_completo, "usuario": x.nombre_usuario, "email": x.email,
             "op": (por_id.get(enlazados[x.id]) or {}).get("login", "") if x.id in enlazados else ""}
            for x in sgdp
        ]
        # Proyectos de OpenProject que la integración necesita y la instancia no tiene.
        salida["faltan_en_op"] = [
            x for x in (config.openproject_proyecto_documentos, config.openproject_proyecto_recibidos, config.openproject_proyecto_legislativo)
            if x not in cat["proyectos"]
        ]
    except op.ErrorOP as e:
        salida["conexion"] = str(e)
    return salida


@router.post("/sincronizar")
async def sincronizar(usuario: Usuario = Depends(solo_administrador)) -> dict:
    if not op.activa():
        raise HTTPException(409, "La integración está apagada: falta OPENPROJECT_URL u OPENPROJECT_TOKEN en el .env.")
    resumen = await sync.ciclo(refrescar=True)
    _cache.clear()
    return resumen


@router.get("/resumen")
async def resumen(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Cuántos elementos de Qillqa están reflejados (para Inicio)."""
    total, reflejados = (await sesion.execute(select(func.count(OpEnlace.id), func.count(OpEnlace.wp_id)))).one()
    return {"activa": op.activa(), "total": total, "reflejados": reflejados}

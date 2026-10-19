"""TERRITORIO (2026-10-06): distritos con su norma y fecha de creación, y los
aniversarios que se acercan (para el saludo de la entidad y la planificación
de la semana de representación). Solo lee; el dato está en
servicios/territorio.py y app/catalogos/."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.modelos import Usuario
from app.seguridad import usuario_actual
from app.servicios import territorio

router = APIRouter(prefix="/api/territorio", tags=["territorio"])


@router.get("/distritos")
async def listar(
    provincia: str = "",
    q: str = "",
    _: Usuario = Depends(usuario_actual),
) -> list[dict]:
    """Los distritos (de una provincia, o los que contienen `q`), con los días que
    faltan para su aniversario por ley de creación."""
    hoy = date.today()
    salida = []
    for d in territorio.distritos():
        if provincia and d["provincia"].lower() != provincia.lower():
            continue
        if q and q.lower() not in f"{d['distrito']} {d['provincia']} {d['norma']}".lower():
            continue
        faltan = None
        if d["mes"] and d["dia"]:
            faltan = (territorio.proximo_aniversario(d["mes"], d["dia"], hoy) - hoy).days
        salida.append({**d, "faltan": faltan})
    return salida


@router.get("/aniversarios")
async def aniversarios(
    dias: int = Query(30, ge=0, le=366),
    _: Usuario = Depends(usuario_actual),
) -> list[dict]:
    """Los distritos que cumplen años de creación en los próximos `dias` días."""
    return territorio.aniversarios(territorio.distritos(), date.today(), dias)

"""MAPA DE RELACIONES (2026-10-05): `GET /api/grafo` devuelve los nodos y las
aristas del mapa (página /mapa de la web). Solo lee; las reglas de qué se une
con qué y cuándo una relación es fiable o inferida están en servicios/grafo.py."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Usuario
from app.seguridad import usuario_actual
from app.servicios import grafo
from app.servicios.lectura import hoy_local as hoy_lima
from tiqsi.modulo import opcional

router = APIRouter(prefix="/api/grafo", tags=["grafo"])


def ve_autoria(usuario) -> bool:
    """El equipo (quién hizo cada cosa) lo ven todos los roles de trabajo; el invitado no. La misma regla que
    `flujo.ve_autoria` de Gestión documental (tests/test_fronteras.py lo exige)."""
    return getattr(usuario, "rol", usuario) != "invitado"


@router.get("")
async def mapa(
    foco: str = "",
    saltos: int = Query(1, ge=1, le=2),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Todo el mapa, o con `foco` (p. ej. `doc:278`) solo su vecindad a 1 o 2
    saltos, para la ventanita de una página. Los documentos ocultos, solo para
    el administrador (como en la bandeja); el equipo, para quien ve la autoría.
    Con `foco`, además, los archivos de sus documentos (firmado, cargos,
    adjuntos, expediente), que se abren desde el mapa local."""
    completo = await grafo.construir(
        sesion, ver_ocultos=usuario.rol == "administrador", ver_autoria=ve_autoria(usuario)
    )
    # Las rendiciones de cuentas que la cuenta puede ver (2026-10-18): por «rendiciones.v1» (Yupay, fase 10.2b);
    # sin Rendición, el mapa no las tiene.
    rendiciones = opcional("rendiciones.v1")
    if rendiciones is not None:
        completo = grafo.unir_rendiciones(completo, await rendiciones.visibles(usuario))
    # La correspondencia en las fichas (la misma que Estadísticas; servicios/grafo.correspondencia).
    completo = grafo.anotar_correspondencia(completo, date.fromisoformat(hoy_lima()))
    if not foco:
        return completo
    sub = await grafo.con_archivos(sesion, grafo.vecindad(completo, foco, saltos), foco)
    if foco.startswith("rend:") and foco[5:].isdigit() and rendiciones is not None:
        s = await rendiciones.sustentos(int(foco[5:]))
        if s is not None:
            sub = grafo.agregar_sustentos(sub, int(foco[5:]), s["comprobantes"], s["anexos"], s["pdf"])
    return sub

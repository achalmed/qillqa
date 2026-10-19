"""MAPA DE RELACIONES (2026-10-05): `GET /api/grafo` devuelve los nodos y las
aristas del mapa (página /mapa de la web). Solo lee; las reglas de qué se une
con qué y cuándo una relación es fiable o inferida están en servicios/grafo.py."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.flujo import ve_autoria
from app.modelos import Usuario
from app.seguridad import usuario_actual
from app.servicios import grafo
from app.servicios.entradas import hoy_lima
from app.api.rendiciones import rendiciones_visibles, sustentos_de_rendicion

router = APIRouter(prefix="/api/grafo", tags=["grafo"])


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
    # Las rendiciones de cuentas que la cuenta puede ver (2026-10-18; api/rendiciones.py).
    completo = grafo.unir_rendiciones(completo, await rendiciones_visibles(sesion, usuario))
    # La correspondencia en las fichas (la misma que Estadísticas; servicios/grafo.correspondencia).
    completo = grafo.anotar_correspondencia(completo, date.fromisoformat(hoy_lima()))
    if not foco:
        return completo
    sub = await grafo.con_archivos(sesion, grafo.vecindad(completo, foco, saltos), foco)
    if foco.startswith("rend:") and foco[5:].isdigit():
        sub = await sustentos_de_rendicion(sesion, sub, int(foco[5:]))
    return sub

"""«Acerca de Qillqa»: la versión del servidor y de los programas que lo sostienen (2026-10-19).

Solo con sesión: los números de versión no son secretos, pero tampoco se ofrecen a quien no entró.
La lógica vive en `servicios/acerca.py`.
"""

import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.db import engine
from app.seguridad import usuario_actual
from app.servicios import acerca

router = APIRouter(tags=["sistema"])


@router.get("/api/sistema/acerca")
async def acerca_del_servidor(_=Depends(usuario_actual)) -> dict:
    """La ficha del servidor: versión, commit, arranque y componentes con su versión."""
    try:
        async with engine.connect() as conexion:
            postgres = (await conexion.execute(text("SHOW server_version"))).scalar()
    except Exception:
        postgres = None
    # La primera vez se consultan los programas (segundos): fuera del bucle de eventos.
    await asyncio.to_thread(acerca.componentes_locales)
    return acerca.ficha(str(postgres).split(" ")[0] if postgres else None)

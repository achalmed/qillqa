"""Estado del sistema: el "latido" que consulta la interfaz web."""

from fastapi import APIRouter
from sqlalchemy import text

from app.db import engine

router = APIRouter(tags=["sistema"])


@router.get("/api/health")
async def estado_del_sistema() -> dict[str, str]:
    """Devuelve el estado de la API y de la base de datos."""
    try:
        async with engine.connect() as conexion:
            await conexion.execute(text("SELECT 1"))
        base_de_datos = "ok"
    except Exception:
        base_de_datos = "error"
    return {"api": "ok", "base_de_datos": base_de_datos}

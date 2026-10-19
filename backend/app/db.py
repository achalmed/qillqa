"""Conexion a PostgreSQL (motor asincrono de SQLAlchemy).

El motor es unico por proceso; las sesiones se crean por peticion via
la dependencia `obtener_sesion` (se usara desde la Fase 1).
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import config

engine = create_async_engine(config.database_url, pool_pre_ping=True)

SesionAsincrona = async_sessionmaker(engine, expire_on_commit=False)


async def obtener_sesion() -> AsyncGenerator[AsyncSession, None]:
    """Dependencia de FastAPI: una sesion por peticion, siempre cerrada."""
    async with SesionAsincrona() as sesion:
        yield sesion

"""Conexion a PostgreSQL (motor asincrono de SQLAlchemy).

El motor es unico por proceso; las sesiones se crean por peticion via
la dependencia `obtener_sesion`.

La Mediateca (2026-10-19) tiene SU PROPIA base en el mismo servidor (`config.url_mediateca`):
su motor, su sesión (`obtener_sesion_mediateca`) y su esquema (`preparar_mediateca`, al arrancar).
Una petición que cruza las dos (subir fotos a una semana) abre una sesión de cada una y confirma
primero la de la Mediateca: una foto guardada sin su fila en la semana se vuelve a vincular; al
revés quedaría una fila apuntando a nada.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import config
# La base de la Mediateca es de la Mediateca (fase 10.2b): aquí solo se reexporta y se crea si falta.
from rikchay.db import SesionMediateca, obtener_sesion_mediateca  # noqa: F401
from rikchay.db import motor as motor_mediateca

engine = create_async_engine(config.database_url, pool_pre_ping=True)

SesionAsincrona = async_sessionmaker(engine, expire_on_commit=False)




async def obtener_sesion() -> AsyncGenerator[AsyncSession, None]:
    """Dependencia de FastAPI: una sesion por peticion, siempre cerrada."""
    async with SesionAsincrona() as sesion:
        yield sesion


async def preparar_mediateca() -> None:
    """La base de la Mediateca y sus tablas, si faltan (idempotente): lo hace la propia Mediateca
    (rikchay.db, en su repositorio), también cuando corre sola."""
    from rikchay import db as fototeca_db

    await fototeca_db.crear_base_si_falta()
    await fototeca_db.crear_tablas()

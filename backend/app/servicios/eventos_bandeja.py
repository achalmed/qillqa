"""Los eventos del sistema de Qillqa como bandeja de salida durable de Tiqsi (fase 10.2b, 2026-10-20).

`emitir` (servicios/eventos_sistema.py) ya guarda cada hecho en `eventos_sistema` dentro de la transacción del
módulo y aplica las reglas en el acto; esta bandeja hace que, además, llegue al bus de Tiqsi, donde lo escuchan
los módulos aislados (los que mañana vivan en su propio repositorio), aunque la API se reinicie entre medio.
El evento viaja con su nombre («recibido.registrado»), sus datos, la entidad y quién lo emitió; su id en el bus
es «qillqa:<id>», estable para no repetir. Lo emitido antes de esta bandeja se marcó repartido al migrar.

Además, Qillqa tiene una bandeja de SALIDA para lo que manda a los módulos aislados después de su commit
(`qillqa_bandeja`, la crea create_all): los mensajes del sistema que compone para el chat («conversaciones.publicar» y
«conversaciones.actualizar»; servicios/avisos_chat.py, Rimay R1). Se reparte como «qillqa-salida:<id>».
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from tiqsi.bandeja import Pendiente
from tiqsi.bandeja_sql import BandejaSQL, guardar, tabla_bandeja

from app.db import SesionAsincrona
from app.modelos import Base, EventoSistema

SALIDA = tabla_bandeja(Base.metadata, "qillqa_bandeja")


async def salida(sesion, tipo: str, datos: dict) -> None:
    """Lo que Qillqa manda a un módulo aislado, en la transacción de `sesion` (sin commit): sale tras el commit."""
    await guardar(sesion, SALIDA, tipo, datos, origen="qillqa")


async def anotar_bitacora(sesion, usuario, accion: str, detalle: str = "") -> None:
    """Una anotación de la plataforma en la bitácora (el directorio, los módulos, los datos del primer ingreso). La
    bitácora es de Gestión documental (Qillqasqa Q4b, 2026-10-21): llega por «bitacora.nueva» tras el commit, como las de
    la Mesa de Partes, con la hora del cambio."""
    await salida(sesion, "bitacora.nueva", {"documento_id": None, "usuario_id": getattr(usuario, "id", usuario),
                                            "accion": accion[:40], "detalle": detalle,
                                            "fecha": datetime.now(timezone.utc).isoformat()})


def bandeja_de_salida() -> BandejaSQL:
    return BandejaSQL(SesionAsincrona, SALIDA)


class BandejaEventosSistema:
    def __init__(self, max_intentos: int = 8) -> None:
        self.max_intentos = max_intentos

    async def pendientes(self, limite: int) -> list[Pendiente]:
        async with SesionAsincrona() as sesion:
            filas = (await sesion.execute(
                select(EventoSistema)
                .where(EventoSistema.repartido_en.is_(None), EventoSistema.intentos_reparto < self.max_intentos)
                .order_by(EventoSistema.id).limit(limite)
            )).scalars().all()
        return [Pendiente(e.id, e.nombre, {**(e.datos or {}), "entidad": e.entidad, "emitido_por": e.emitido_por},
                          "qillqa", e.intentos_reparto) for e in filas]

    async def entregado(self, ident: int) -> None:
        async with SesionAsincrona() as sesion:
            await sesion.execute(update(EventoSistema).where(EventoSistema.id == ident)
                                 .values(repartido_en=datetime.now(timezone.utc), error_reparto=""))
            await sesion.commit()

    async def fallo(self, ident: int, error: str) -> None:
        async with SesionAsincrona() as sesion:
            await sesion.execute(update(EventoSistema).where(EventoSistema.id == ident)
                                 .values(intentos_reparto=EventoSistema.intentos_reparto + 1, error_reparto=error[:1000]))
            await sesion.commit()

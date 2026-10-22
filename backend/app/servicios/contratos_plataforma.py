"""Lo que Qillqa (su núcleo y Gestión documental) ofrece a los módulos aislados por el contrato de Tiqsi (fase 10.2b
de docs/plataforma/propuesta-repositorios.md, 2026-10-20). Cada operación abre su propia sesión: quien la usa no ve
las tablas de Qillqa ni necesita su base.

- «pegado.v1» (núcleo): leer lo pegado (`interpretar`, `formatos`), una fecha escrita de cualquier forma
  razonable (`fecha`), lo propuesto frente a lo actual (`comparar`) y dejar su constancia (`constancia`, → su id).
- «avisos.v1» (núcleo): lo avisado recientemente en la campana (`destinos_recientes`); los avisos nuevos llegan por el bus
  («aviso.nuevo», servicios/notificaciones.py).
- «calendario.v1» (núcleo): los días hábiles del Perú (`dias_habiles`) y sus feriados y fechas cívicas (`entre`).
- «personas.v1» (Directorio): las personas activas (`activas`), sus nombres (`nombres`) y si una existe (`existe`).
- «documentos.v1» ya no vive aquí: la ofrece Gestión documental (servicios/documentos_contrato.py; Qillqasqa Q3).
- «recibidos.v1» ya no vive aquí: la ofrece la Mesa de Partes (servicios/punku_contrato.py; Punku P2).

La superficie de cada capacidad (lista explícita de funciones) es `tiqsi.Superficie` desde Qillqasqa Q3 (2026-10-21);
se reexporta para quienes la importan de aquí.
"""
from __future__ import annotations

from datetime import date

from tiqsi import Superficie  # noqa: F401


# --- pegado.v1 ------------------------------------------------------------------------------------------------


def _interpretar(texto: str, tipos: tuple[str, ...] | None = None):
    from app.servicios import pegado

    return pegado.interpretar(texto, tipos)


def _formatos() -> list[dict]:
    from app.servicios import pegado

    return pegado.formatos()


async def _constancia(usuario_id: int | None, tipo: str, texto: str, aplicados: dict, entidad: str, *, version: int = 1,
                     fuente: str = "yaml", propuestos: dict | None = None, rechazados: list | None = None) -> int:
    """Lo pegado y lo que se hizo con ello, en el registro de pegados (como lo guardaba cada módulo). → su id."""
    from app.db import SesionAsincrona
    from app.modelos import Pegado

    async with SesionAsincrona() as sesion:
        fila = Pegado(usuario_id=usuario_id, tipo=tipo, version=version, fuente=fuente, texto=texto,
                      campos_propuestos=dict(propuestos or {}), campos_aplicados=dict(aplicados or {}),
                      rechazados=list(rechazados or []), entidad=entidad)
        sesion.add(fila)
        await sesion.commit()
        return fila.id


def _opcion(valor, campo):
    """La opción canónica de un campo de opciones del esquema (lo que dice `pegado.validar.opcion`), o None."""
    from app.servicios.pegado.validar import opcion

    return opcion(valor, campo)


def _fecha(v) -> str:
    from app.servicios.pegado.validar import fecha

    return fecha(v)


def _comparar(*args, **kwargs):
    from app.servicios import pegado

    return pegado.comparar(*args, **kwargs)


def _respuesta(lectura, actual: dict | None = None, etiquetas_extra: dict | None = None, dudosos: set[str] | None = None) -> dict:
    """La forma común de todas las respuestas de pegado (`api/pegar.respuesta_lectura`): la lectura, los campos, los
    anexos, lo informativo y la tabla de diferencias."""
    from app.api.pegar import respuesta_lectura

    return respuesta_lectura(lectura, actual, etiquetas_extra, dudosos)


PEGADO_V1 = Superficie("pegado.v1", {"interpretar": lambda: _interpretar, "formatos": lambda: _formatos,
                                     "constancia": lambda: _constancia, "opcion": lambda: _opcion, "respuesta": lambda: _respuesta,
                                     "fecha": lambda: _fecha, "comparar": lambda: _comparar})


# --- modulos.v1: el registro de módulos encendibles de la plataforma (Punku P1a) ---------------------------------


async def _estado_modulo(mid: str) -> dict:
    """{activo, mensaje} de un módulo encendible (con sus dependencias: la mesa virtual necesita Recibidos)."""
    from app.db import SesionAsincrona
    from app.servicios import modulos

    async with SesionAsincrona() as sesion:
        est = await modulos.estado(sesion)
    return {"activo": modulos.efectivo(est).get(mid, True), "mensaje": (est.get(mid) or {}).get("mensaje", "")}


MODULOS_V1 = Superficie("modulos.v1", {"estado": lambda: _estado_modulo})


# --- avisos.v1 -------------------------------------------------------------------------------------------------


def _destinos_recientes():
    from app.servicios import notificaciones

    return notificaciones.destinos_recientes


AVISOS_V1 = Superficie("avisos.v1", {"destinos_recientes": _destinos_recientes})


# --- push.v1: el aviso al celular es de la plataforma (Rimay R2) --------------------------------------------------


def _push(nombre: str):
    def _f():
        from app.servicios import push

        return getattr(push, nombre)
    return _f


PUSH_V1 = Superficie("push.v1", {n: _push(n) for n in ("sin_la_app_a_la_vista", "programar", "carga", "firma_acuse")})


# --- calendario.v1 --------------------------------------------------------------------------------------------


def _dias_habiles(desde: date, dias: int) -> date:
    from app.servicios import feriados

    return feriados.dias_habiles(desde, dias)


def _entre(desde: date, hasta: date) -> list[dict]:
    from app.servicios import feriados

    return feriados.entre(desde, hasta)


CALENDARIO_V1 = Superficie("calendario.v1", {"dias_habiles": lambda: _dias_habiles, "entre": lambda: _entre})


# --- personas.v1 ------------------------------------------------------------------------------------------------


async def _activas() -> list[dict]:
    """Las personas activas del directorio: {id, nombre, cargo}."""
    from sqlalchemy import select

    from app.db import SesionAsincrona
    from app.modelos import Persona

    async with SesionAsincrona() as sesion:
        filas = (await sesion.execute(select(Persona).where(Persona.activo.is_(True)))).scalars().all()
        return [{"id": p.id, "nombre": p.nombre, "cargo": p.cargo or ""} for p in filas]


async def _nombres(ids) -> dict[int, str]:
    from sqlalchemy import select

    from app.db import SesionAsincrona
    from app.modelos import Persona

    ids = {int(i) for i in ids or () if i}
    if not ids:
        return {}
    async with SesionAsincrona() as sesion:
        return {p.id: p.nombre for p in (await sesion.execute(select(Persona).where(Persona.id.in_(ids)))).scalars().all()}


async def _existe(persona_id: int) -> bool:
    from app.db import SesionAsincrona
    from app.modelos import Persona

    async with SesionAsincrona() as sesion:
        return await sesion.get(Persona, int(persona_id)) is not None


PERSONAS_V1 = Superficie("personas.v1", {"activas": lambda: _activas, "nombres": lambda: _nombres, "existe": lambda: _existe})



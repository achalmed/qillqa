"""ESTADÍSTICAS DE USO (2026-10-19, Edison: «telemetría propia, sin servicios externos, sin pedir
permiso por registro, sin contenido, con retención acotada»).

La web manda LOTES de hechos (`POST /api/uso`, por `navigator.sendBeacon` al ocultarse la pestaña y
cada medio minuto): vistas de módulos con su duración, errores de JavaScript con mensaje y pila
recortados, y el arranque de cada pestaña; cada hecho con el aparato (ancho, alto, celular/tableta/
escritorio) y la versión de la web. Aquí, la lógica pura: qué se acepta y cómo se limpia (`limpiar`),
y las consultas del panel de Administración → Uso (módulos más usados, errores recientes, aparatos,
versiones, por cuenta). Lo que NUNCA entra: textos de documentos, asuntos, nombres de terceros,
mensajes del chat ni búsquedas; una ruta se guarda con los ids reemplazados por «:id» y sin query
(`anonimizar_ruta`). Retención: `RETENCION_DIAS` (la purga corre al recibir un lote, como mucho una
vez por hora). Pruebas: tests/test_uso.py.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Uso, Usuario

RETENCION_DIAS = 90
ACCIONES = ("vista", "error", "arranque")
APARATOS = ("celular", "tableta", "escritorio")
MAX_LOTE = 100
MAX_DETALLE = 700
MAX_RUTA = 120
# Cortes del tema de la web (theme.ts): < 600 celular, < 900 tableta.
_NUMERO = re.compile(r"/\d+(?=/|$)")
_HEX = re.compile(r"/[0-9a-f]{16,}(?=/|$)")


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def anonimizar_ruta(ruta: str) -> str:
    """«/documentos/132?x=1#y» → «/documentos/:id»: sin ids, sin query ni fragmento. Pura."""
    r = (ruta or "").split("?", 1)[0].split("#", 1)[0].strip() or "/"
    r = _HEX.sub("/:id", _NUMERO.sub("/:id", r))
    return r[:MAX_RUTA]


def aparato_de(ancho: int) -> str:
    return "celular" if ancho < 600 else "tableta" if ancho < 900 else "escritorio"


def limpiar(evento: dict, momento: datetime | None = None) -> dict | None:
    """Un hecho tal como lo guarda la tabla, o None si no vale. Solo campos conocidos; el detalle
    solo en los errores. Pura."""
    if not isinstance(evento, dict):
        return None
    accion = evento.get("accion")
    if accion not in ACCIONES:
        return None
    try:
        ancho = max(0, min(20000, int(evento.get("ancho") or 0)))
        alto = max(0, min(20000, int(evento.get("alto") or 0)))
    except (TypeError, ValueError):
        ancho = alto = 0
    duracion = evento.get("duracion_ms")
    try:
        duracion = max(0, min(24 * 3600 * 1000, int(duracion))) if duracion is not None else None
    except (TypeError, ValueError):
        duracion = None
    cuando = momento or ahora()
    t = evento.get("momento")
    if isinstance(t, (int, float)) and 0 < t < 4_102_444_800_000:
        candidato = datetime.fromtimestamp(t / 1000, tz=timezone.utc)
        # Un reloj del cliente muy desviado no se acepta: se queda el del servidor.
        if abs((candidato - cuando).total_seconds()) < 36 * 3600:
            cuando = candidato
    detalle = str(evento.get("detalle") or "")[:MAX_DETALLE] if accion == "error" else ""
    aparato = evento.get("aparato")
    return {
        "momento": cuando,
        "accion": accion,
        "modulo": str(evento.get("modulo") or "")[:30],
        "ruta": anonimizar_ruta(str(evento.get("ruta") or "")),
        "duracion_ms": duracion,
        "aparato": aparato if aparato in APARATOS else aparato_de(ancho),
        "ancho": ancho,
        "alto": alto,
        "version": str(evento.get("version") or "")[:24],
        "detalle": detalle,
    }


def limpiar_lote(eventos: list) -> list[dict]:
    salida = []
    for e in (eventos or [])[:MAX_LOTE]:
        limpio = limpiar(e)
        if limpio:
            salida.append(limpio)
    return salida


_ultima_purga: datetime | None = None


async def guardar_lote(sesion: AsyncSession, usuario_id: int, eventos: list) -> int:
    """Guarda el lote y, como mucho una vez por hora, purga lo que pasó la retención."""
    global _ultima_purga
    filas = limpiar_lote(eventos)
    for f in filas:
        sesion.add(Uso(usuario_id=usuario_id, **f))
    momento = ahora()
    if _ultima_purga is None or momento - _ultima_purga > timedelta(hours=1):
        _ultima_purga = momento
        await sesion.execute(delete(Uso).where(Uso.momento < momento - timedelta(days=RETENCION_DIAS)))
    await sesion.commit()
    return len(filas)


def _desde(dias: int) -> datetime:
    return ahora() - timedelta(days=max(1, min(RETENCION_DIAS, dias)))


async def resumen(sesion: AsyncSession, dias: int = 7) -> dict:
    """Lo básico del panel: módulos más usados, aparatos, versiones, errores recientes y vistas por día."""
    desde = _desde(dias)
    vistas = select(Uso).where(Uso.momento >= desde, Uso.accion == "vista").subquery()
    modulos = (await sesion.execute(
        select(vistas.c.modulo, func.count(), func.count(func.distinct(vistas.c.usuario_id)), func.avg(vistas.c.duracion_ms))
        .group_by(vistas.c.modulo).order_by(func.count().desc())
    )).all()
    aparatos = (await sesion.execute(
        select(vistas.c.aparato, func.count(), func.count(func.distinct(vistas.c.usuario_id)))
        .group_by(vistas.c.aparato).order_by(func.count().desc())
    )).all()
    anchos = (await sesion.execute(
        select(vistas.c.ancho, func.count()).where(vistas.c.ancho > 0).group_by(vistas.c.ancho).order_by(func.count().desc()).limit(12)
    )).all()
    versiones = (await sesion.execute(
        select(Uso.version, func.max(Uso.momento), func.count(func.distinct(Uso.usuario_id)))
        .where(Uso.momento >= desde, Uso.version != "").group_by(Uso.version).order_by(func.max(Uso.momento).desc()).limit(8)
    )).all()
    dia = func.date_trunc("day", vistas.c.momento).label("dia")
    dias_filas = (await sesion.execute(
        select(dia, func.count(), func.count(func.distinct(vistas.c.usuario_id))).group_by(dia).order_by(dia)
    )).all()
    nombres = dict((await sesion.execute(select(Usuario.id, Usuario.nombre_completo))).all())
    errores = (await sesion.execute(
        select(Uso).where(Uso.momento >= desde, Uso.accion == "error").order_by(Uso.momento.desc()).limit(50)
    )).scalars().all()
    total_errores = (await sesion.execute(select(func.count()).select_from(Uso).where(Uso.momento >= desde, Uso.accion == "error"))).scalar_one()
    return {
        "dias": dias,
        "modulos": [{"modulo": m or "(sin módulo)", "vistas": n, "personas": p, "duracion_media_s": round((d or 0) / 1000)} for m, n, p, d in modulos],
        "aparatos": [{"aparato": a or "?", "vistas": n, "personas": p} for a, n, p in aparatos],
        "anchos": [{"ancho": a, "vistas": n} for a, n in anchos],
        "versiones": [{"version": v, "ultimo": u.isoformat(), "personas": p} for v, u, p in versiones],
        "por_dia": [{"dia": d.date().isoformat(), "vistas": n, "personas": p} for d, n, p in dias_filas],
        "errores_total": total_errores,
        "errores": [
            {"momento": e.momento.isoformat(), "usuario": nombres.get(e.usuario_id or 0, ""), "modulo": e.modulo, "ruta": e.ruta,
             "aparato": e.aparato, "version": e.version, "detalle": e.detalle}
            for e in errores
        ],
    }


async def por_cuenta(sesion: AsyncSession) -> dict[int, dict]:
    """Lo último de cada cuenta (para la supervisión del administrador): último hecho, último módulo,
    aparato y versión, vistas y errores de hoy."""
    hoy = ahora().replace(hour=0, minute=0, second=0, microsecond=0)
    ultimos = (await sesion.execute(
        select(Uso.usuario_id, func.max(Uso.momento)).where(Uso.usuario_id.is_not(None)).group_by(Uso.usuario_id)
    )).all()
    salida: dict[int, dict] = {}
    for uid, momento in ultimos:
        fila = (await sesion.execute(
            select(Uso).where(Uso.usuario_id == uid, Uso.momento == momento).limit(1)
        )).scalars().first()
        vistas_hoy = (await sesion.execute(select(func.count()).select_from(Uso).where(Uso.usuario_id == uid, Uso.accion == "vista", Uso.momento >= hoy))).scalar_one()
        errores_hoy = (await sesion.execute(select(func.count()).select_from(Uso).where(Uso.usuario_id == uid, Uso.accion == "error", Uso.momento >= hoy))).scalar_one()
        ultima_vista = (await sesion.execute(
            select(Uso.modulo).where(Uso.usuario_id == uid, Uso.accion == "vista").order_by(Uso.momento.desc()).limit(1)
        )).scalar_one_or_none()
        salida[uid] = {
            "ultimo_momento": momento.isoformat(),
            "ultimo_modulo": ultima_vista or "",
            "aparato": fila.aparato if fila else "",
            "version": fila.version if fila else "",
            "vistas_hoy": vistas_hoy,
            "errores_hoy": errores_hoy,
        }
    return salida

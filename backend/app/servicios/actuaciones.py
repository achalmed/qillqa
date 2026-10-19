"""Actuaciones del seguimiento (2026-10-12; `docs/plataforma/propuesta-automatizacion.md` §3.6):
lo que pasa entre los hitos fijos del trámite de un documento propio (`doc:N`) o en la
atención de un recibido (`entrada:M`): una llamada, una reiteración, un compromiso de la
entidad, una respuesta, una derivación. Tabla `actuaciones` (`backend/app/modelos.py`).

`origen` dice quién la trajo: 'persona' (escrita a mano), 'pegado' (del resultado de un
prompt; no cuenta hasta que alguien la confirma) o 'sistema'. Nada se borra: `retirada_en`.
Las reglas puras (deduplicar, ordenar) se prueban en `backend/tests/test_actuaciones.py`.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Actuacion, Usuario
from app.servicios.entradas import normalizar, similitud

CLASES = ("envio", "reiteracion", "llamada", "reunion", "respuesta", "compromiso", "derivacion", "nota")
ETIQUETA_CLASE = {
    "envio": "Envío", "reiteracion": "Reiteración", "llamada": "Llamada", "reunion": "Reunión",
    "respuesta": "Respuesta", "compromiso": "Compromiso", "derivacion": "Derivación", "nota": "Nota",
}
ORIGENES = ("persona", "pegado", "sistema")


def parecida(a: dict, b: dict) -> bool:
    """Dos actuaciones son la misma si coinciden en fecha y clase y su texto se parece
    (Jaccard ≥ 0,4: ya coinciden fecha y clase) o uno contiene al otro. Pura."""
    if (a.get("fecha") or "") != (b.get("fecha") or "") or (a.get("clase") or "nota") != (b.get("clase") or "nota"):
        return False
    ta, tb = normalizar(a.get("texto") or ""), normalizar(b.get("texto") or "")
    if not ta or not tb:
        return ta == tb
    return ta in tb or tb in ta or similitud(ta, tb) >= 0.4


def deduplicar(propuestas: list[dict], existentes: list[dict]) -> list[dict]:
    """Cada propuesta con `estado`: 'nuevo' o 'igual' (ya está registrada) y, si lo está,
    `existente_id`. Entre las propuestas mismas también se quita lo repetido. Pura."""
    salida: list[dict] = []
    vistas: list[dict] = []
    for p in propuestas:
        igual = next((e for e in existentes if parecida(p, e)), None)
        if igual is None and any(parecida(p, v) for v in vistas):
            continue
        vistas.append(p)
        salida.append({**p, "estado": "igual" if igual else "nuevo", "existente_id": igual.get("id") if igual else None})
    return salida


def como_dict(a: Actuacion, nombres: dict[int, str] | None = None) -> dict:
    nombres = nombres or {}
    return {
        "id": a.id, "entidad": a.entidad, "fecha": a.fecha, "clase": a.clase, "clase_texto": ETIQUETA_CLASE.get(a.clase, a.clase),
        "texto": a.texto, "fuente": a.fuente, "origen": a.origen,
        "confirmada": a.confirmada_por is not None or a.origen != "pegado",
        "confirmada_por": nombres.get(a.confirmada_por or 0, ""), "creado_por": nombres.get(a.creado_por or 0, ""),
        "creado_en": a.creado_en.isoformat() if a.creado_en else None, "pegado_id": a.pegado_id,
    }


async def listar(sesion: AsyncSession, entidad: str) -> list[dict]:
    filas = (await sesion.execute(
        select(Actuacion).where(Actuacion.entidad == entidad, Actuacion.retirada_en.is_(None))
        .order_by(Actuacion.fecha.desc(), Actuacion.id.desc())
    )).scalars().all()
    ids = {a.creado_por for a in filas} | {a.confirmada_por for a in filas}
    ids.discard(None)
    nombres = {u.id: u.nombre_completo for u in (await sesion.execute(select(Usuario).where(Usuario.id.in_(ids)))).scalars()} if ids else {}
    return [como_dict(a, nombres) for a in filas]


def crear(sesion: AsyncSession, *, entidad: str, fecha: str, clase: str, texto: str, fuente: str = "",
          origen: str = "persona", usuario: Usuario | None = None, pegado_id: int | None = None) -> Actuacion:
    """Añade la actuación (sin commit). Una de origen 'persona' nace confirmada por quien la escribe."""
    a = Actuacion(
        entidad=entidad, fecha=(fecha or "")[:10], clase=clase if clase in CLASES else "nota", texto=(texto or "").strip(),
        fuente=(fuente or "").strip()[:200], origen=origen if origen in ORIGENES else "persona",
        creado_por=usuario.id if usuario else None, pegado_id=pegado_id,
    )
    if origen == "persona" and usuario:
        a.confirmada_por, a.confirmada_en = usuario.id, datetime.now(timezone.utc)
    sesion.add(a)
    return a


def confirmar(a: Actuacion, usuario: Usuario) -> None:
    a.confirmada_por, a.confirmada_en = usuario.id, datetime.now(timezone.utc)


def retirar(a: Actuacion) -> None:
    a.retirada_en = datetime.now(timezone.utc)

"""Avisos a todos que piden una acción (2026-10-05).

Un aviso vigente a la vez: publicar uno retira el anterior; vence solo (24 h por
omisión). Lo usan la API (`app/api/anuncios.py`) y la terminal (`python -m
app.anuncio`), que lo manda tras un despliegue sin pasar por la web.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Anuncio

ACCIONES = ("recargar", "entendido")
LARGO_MAXIMO = 300


def normalizar(texto: str, accion: str) -> tuple[str, str]:
    """Texto en una línea, sin espacios de sobra; acción del vocabulario cerrado."""
    limpio = " ".join((texto or "").split())
    if not limpio:
        raise ValueError("El aviso necesita un texto.")
    if len(limpio) > LARGO_MAXIMO:
        raise ValueError(f"El aviso es breve: como mucho {LARGO_MAXIMO} caracteres.")
    if accion not in ACCIONES:
        raise ValueError(f"Acción desconocida: {accion} (use {' o '.join(ACCIONES)}).")
    return limpio, accion


async def publicar(sesion: AsyncSession, texto: str, accion: str, autor_id: int | None, horas: int = 24) -> Anuncio:
    texto, accion = normalizar(texto, accion)
    await sesion.execute(update(Anuncio).where(Anuncio.activo.is_(True)).values(activo=False))
    anuncio = Anuncio(texto=texto, accion=accion, autor_id=autor_id,
                      vence_en=datetime.now(timezone.utc) + timedelta(hours=max(1, min(horas, 168))))
    sesion.add(anuncio)
    await sesion.commit()
    await sesion.refresh(anuncio)
    return anuncio


async def vigente(sesion: AsyncSession) -> Anuncio | None:
    ahora = datetime.now(timezone.utc)
    r = await sesion.execute(
        select(Anuncio).where(Anuncio.activo.is_(True), Anuncio.vence_en > ahora).order_by(Anuncio.id.desc()).limit(1)
    )
    return r.scalar_one_or_none()


async def retirar(sesion: AsyncSession) -> int:
    r = await sesion.execute(update(Anuncio).where(Anuncio.activo.is_(True)).values(activo=False))
    await sesion.commit()
    return r.rowcount or 0


def a_dict(a: Anuncio | None) -> dict | None:
    if a is None:
        return None
    return {"id": a.id, "texto": a.texto, "accion": a.accion, "creado_en": a.creado_en.isoformat() if a.creado_en else None}

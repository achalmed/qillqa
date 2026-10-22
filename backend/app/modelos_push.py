"""backend/app/modelos_push.py — los dispositivos que reciben avisos push (2026-10-13). Son de la PLATAFORMA (fase
10.2b, Rimay R2, 2026-10-20): sirven a la campana y al chat, así que viven aquí y no en `modelos_chat.py`. La misma
tabla `suscripciones_push` de siempre (la crea `create_all`).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos import Base


class SuscripcionPush(Base):
    """Un dispositivo de una persona que recibe avisos push (Web Push, RFC 8030/8291/8292).
    `endpoint` es la dirección que dio el servicio de push del navegador (FCM en Android/Chrome,
    Mozilla, Apple); `p256dh` y `auth`, las claves con que se cifra cada aviso para ese
    dispositivo. Sirve al chat y a la campana."""
    __tablename__ = "suscripciones_push"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200), default="")
    auth: Mapped[str] = mapped_column(String(100), default="")
    dispositivo: Mapped[str] = mapped_column(String(200), default="")       # «Chrome en Android», para reconocerla
    fallos: Mapped[int] = mapped_column(Integer, default=0)
    creada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultimo_envio_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

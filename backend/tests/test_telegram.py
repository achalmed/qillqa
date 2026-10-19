"""backend/tests/test_telegram.py — puente de Telegram (servicios/telegram.py), parte pura: qué va a
Recibidos y qué a la Fototeca según el adjunto, y que sin token el puente está apagado.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_telegram.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import telegram as tg  # noqa: E402


def test_clasificar_adjuntos():
    assert tg.clasificar("oficio-123.pdf", False) == "recibido"
    assert tg.clasificar("carta.docx", False) == "recibido"
    assert tg.clasificar("foto-oficio.jpg", False) == "recibido"      # una imagen enviada como archivo es un documento
    assert tg.clasificar("telegram-5.jpg", True) == "foto"             # una foto del grupo va a la Fototeca
    assert tg.clasificar("visita.mp4", False) == "foto"
    assert tg.clasificar("datos.xlsx", False) == ""


def test_sin_token_apagado():
    assert not tg.activo()

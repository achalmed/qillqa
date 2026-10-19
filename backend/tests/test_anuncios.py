"""backend/tests/test_anuncios.py — avisos a todos (2026-10-05): texto breve y acción cerrada."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import pytest  # noqa: E402

from app.servicios import anuncios as svc  # noqa: E402


def test_normalizar_texto_y_accion():
    assert svc.normalizar("  Llegó   una\nactualización ", "recargar") == ("Llegó una actualización", "recargar")
    with pytest.raises(ValueError):
        svc.normalizar("   ", "recargar")
    with pytest.raises(ValueError):
        svc.normalizar("x" * 301, "entendido")
    with pytest.raises(ValueError):
        svc.normalizar("Hola", "borrar_todo")

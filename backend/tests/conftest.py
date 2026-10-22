"""backend/tests/conftest.py — guardas comunes de las pruebas (2026-10-19).

Ninguna prueba escribe en la Mediateca real: su raíz (MEDIATECA_DIR, por omisión ~/Pictures/mediateca)
se redirige a una carpeta temporal en cada prueba. Una prueba que necesite otra la fija ella misma.
"""
import pytest


@pytest.fixture(autouse=True)
def _mediateca_temporal(tmp_path_factory, monkeypatch):
    from app.config import config
    from rikchay.config import config as config_mediateca

    carpeta = str(tmp_path_factory.mktemp("mediateca"))
    monkeypatch.setattr(config, "mediateca_dir", carpeta)              # la de Qillqa (scripts de migración)
    monkeypatch.setattr(config_mediateca, "mediateca_dir", carpeta)    # la propia de la Mediateca (fase 10.2b)


@pytest.fixture(autouse=True)
def _anfitrion_activo():
    """Los módulos piden capacidades al anfitrión del proceso (fase 10.2b: la Mediateca por «medios.v1»):
    cada prueba corre con el de Qillqa activo, como la API (una prueba que crea otro anfitrión —la Mediateca
    sola— lo activa; la siguiente vuelve al de Qillqa)."""
    import os

    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
    os.environ.setdefault("JWT_SECRET", "prueba")
    from app import plataforma

    plataforma.anfitrion.activar()

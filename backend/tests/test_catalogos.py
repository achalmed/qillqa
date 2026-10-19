"""backend/tests/test_catalogos.py — catálogos legislativos y lectura del perfil de la entidad (ficha automática, 2026-10-01).

Pruebas puras (sin base de datos). Uso: cd backend && .venv/bin/python -m pytest -q
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.config import config  # noqa: E402
from app.servicios import catalogos_legislativos as cat  # noqa: E402


def test_catalogo_de_la_camara():
    assert len(cat.COMISIONES) == 16 and len(set(cat.COMISIONES)) == 16
    assert all(c.startswith("Comisión de ") for c in cat.COMISIONES)
    assert cat.CAMARAS[0] == "Cámara de Diputados"


def test_perfil_se_lee_del_tex_y_sin_perfil_queda_vacio(tmp_path, monkeypatch):
    (tmp_path / "perfil-despacho.tex").write_text(
        "\\setmeta{autor}{Ana Mar\\'ia P\\'erez}\n\\setmeta{cargo}{Diputada de la Rep\\'ublica}\n\\setmeta{direccion}{Jr.~Uno N.º~1}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config, "mdd_perfil", str(tmp_path))
    cat.perfil.cache_clear()
    pf = cat.perfil()
    assert pf["autor"] == "Ana María Pérez"
    assert pf["cargo"] == "Diputada de la República"
    assert pf["direccion"] == "Jr. Uno N.º 1"
    monkeypatch.setattr(config, "mdd_perfil", "")
    cat.perfil.cache_clear()
    assert cat.perfil() == {}

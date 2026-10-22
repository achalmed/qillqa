"""backend/tests/test_acerca.py — la ficha «Acerca de Qillqa» (servicios/acerca.py), 2026-10-19. Sin base de datos.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_acerca.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import acerca  # noqa: E402

PATRONES = {nombre: patron for nombre, _, patron in acerca.PROGRAMAS}


def test_lualatex_con_su_tex_live():
    salida = "This is LuaHBTeX, Version 1.22.0 (TeX Live 2025/Debian)\nDevelopment id: 7678\n"
    assert acerca.version_de_salida(salida, PATRONES["LuaLaTeX"]) == "1.22.0 (TeX Live 2025)"


def test_biber_libreoffice_y_poppler():
    assert acerca.version_de_salida("biber version: 2.21\n", PATRONES["Biber"]) == "2.21"
    assert acerca.version_de_salida("LibreOffice 24.8.4 (X86_64)\n", PATRONES["LibreOffice"]) == "24.8.4"
    assert acerca.version_de_salida("pdftoppm version 25.03.0\nCopyright 2005-2025\n", PATRONES["Poppler"]) == "25.03.0"


def test_un_programa_ausente_no_rompe_la_ficha():
    assert acerca.version_de_salida(None, PATRONES["Biber"]) is None
    assert acerca.version_de_salida("algo que no se entiende", PATRONES["Biber"]) is None
    assert acerca._orden(["programa-que-no-existe-qillqa"]) is None


def test_la_ficha_pone_postgres_tras_python():
    f = acerca.ficha("16.4")
    nombres = [c["nombre"] for c in f["componentes"]]
    assert nombres[:2] == ["Python", "PostgreSQL"]
    assert f["componentes"][1]["version"] == "16.4"
    assert {"FastAPI", "SQLAlchemy", "LuaLaTeX", "Biber"} <= set(nombres)
    assert f["version"] == acerca.VERSION
    assert f["arranque"]

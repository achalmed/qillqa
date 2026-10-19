"""backend/tests/test_asunto.py — el asunto de cada tipo para bandeja, búsqueda y revisión.

Revisión de usabilidad 2026-10-01: la solicitud guarda su asunto en
`sumilla_solicito` y el acta no tiene; leer solo `asunto` las mostraba «(sin
asunto)» y la revisión antes de numerar las daba «en blanco».
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_asunto.py
"""
import os
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import verificacion  # noqa: E402
from app.tipos import asunto_de, destinatario_de  # noqa: E402


def test_asunto_de_cada_tipo():
    assert asunto_de("oficio", {"asunto": "Pedido de información"}) == "Pedido de información"
    assert asunto_de("solicitud", {"sumilla_solicito": "SOLICITO: licencia"}) == "SOLICITO: licencia"
    assert asunto_de("acta", {"clase_sesion": "Ordinaria", "organo": "Comisión de Transportes"}) == "Sesión Ordinaria Comisión de Transportes"
    assert asunto_de("acta", {}) == ""
    assert destinatario_de({"destinatario_cargo": "Señor Presidente"}) == "Señor Presidente"


def test_revision_antes_de_numerar_usa_las_claves_del_tipo():
    sol = SimpleNamespace(tipo="solicitud")
    puntos = {p["id"]: p for p in verificacion.puntos(sol, {"sumilla_solicito": "SOLICITO: licencia", "destinatario_cargo": "Señor Presidente", "fecha": "2026-10-01"})}
    assert puntos["asunto"]["clave"] == "sumilla_solicito" and not puntos["asunto"]["vacio"]
    assert puntos["destinatario"]["clave"] == "destinatario_cargo" and not puntos["destinatario"]["vacio"]
    # El cargo ya se confirma como destinatario: no se repite como informativo.
    assert sum(1 for p in puntos.values() if p["clave"] == "destinatario_cargo") == 1
    acta = SimpleNamespace(tipo="acta")
    ids = [p["id"] for p in verificacion.puntos(acta, {"fecha": "2026-10-01"})]
    assert "asunto" not in ids and "destinatario" not in ids and "fecha" in ids


def test_gana_la_clave_propia_del_tipo():
    assert asunto_de("solicitud", {"asunto": "sobrante", "sumilla_solicito": "SOLICITO: licencia"}) == "SOLICITO: licencia"

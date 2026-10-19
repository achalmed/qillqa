"""backend/tests/test_adj_denominacion.py — la línea «Adj.» cita cada adjunto por su
denominación documental, no por el nombre de archivo (Edison 2026-10-19, OF-0160):
servicios/nombres.leer y servicios/adjuntos.denominar_adjuntos.

Pruebas puras (sin base de datos); las siglas salen de la configuración, por eso no se
comparan. Uso: cd backend && .venv/bin/python -m pytest -q tests/test_adj_denominacion.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios.adjuntos import denominar_adjuntos, es_cargo  # noqa: E402
from app.servicios.nombres import leer  # noqa: E402


def test_leer_la_convencion_de_nombres():
    assert leer("FIRM-OF-0152-2026-2027_Asunto-breve") == ("FIRM", "OF", 152, "2026-2027")
    assert leer("OF-0157-2026-2027_Asunto.pdf") == ("", "OF", 157, "2026-2027")
    assert leer("CR-OM-0014-2026-2027 Director") == ("CR", "OM", 14, "2026-2027")
    # El prefijo que antepone el sistema al subir el archivo como adjunto de otro documento.
    assert leer("ADJ-OF-SN-2026-2027_FIRM-OF-0153-2026-2027-Situacion.pdf") == ("FIRM", "OF", 153, "2026-2027")
    assert leer("Informe técnico") is None
    assert leer("cargo") is None


def test_es_cargo():
    assert all(es_cargo(x) for x in ("cargo", "Cargo-2", "cargo 3", "Constancia de recepción", "CARGO"))
    assert not es_cargo("Cargo del funcionario")


def test_oficios_y_cargos_en_una_linea_cada_uno():
    nombres = [
        "FIRM-OF-0152-2026-2027_Informacion-documentada-y-plan-de-culminacion", "cargo",
        "FIRM-OF-0153-2026-2027_Situacion-presupuestal", "cargo-2",
        "OF-0157-2026-2027_Intervencion-de-la-Comision",
    ]
    salida = denominar_adjuntos(nombres)
    assert len(salida) == 3
    assert salida[0].startswith("Copia del Oficio N°0152-2026-2027")
    assert salida[0].endswith(", con su cargo de recepción")
    assert salida[1].startswith("Copia del Oficio N°0153-2026-2027")
    assert salida[2].startswith("Copia del Oficio N°0157-2026-2027") and "cargo" not in salida[2]
    assert not any("_" in s or "FIRM" in s for s in salida)


def test_genero_y_derivados():
    carta, cr, resp = denominar_adjuntos([
        "FIRM-CARTA-0003-2026-2027_Boleto", "CR-OM-0014-2026-2027_Director", "RESP-OF-0057-2026-2027_Entidad"])
    assert carta.startswith("Copia de la Carta N°0003-2026-2027")
    assert cr.startswith("Cargo de recepción del Oficio Múltiple N°0014-2026-2027")
    assert resp.startswith("Respuesta al Oficio N°0057-2026-2027")


def test_lo_escrito_por_una_persona_no_cambia():
    assert denominar_adjuntos(["Informe técnico", "Relación de dirigentes"]) == ["Informe técnico", "Relación de dirigentes"]
    assert denominar_adjuntos(["cargo"]) == ["Cargo de recepción"]
    # Una serie que no es un tipo propio se deja como está.
    assert denominar_adjuntos(["XYZ-0001-2026-2027_Algo"]) == ["XYZ-0001-2026-2027_Algo"]

"""Validación del PDF firmado (servicios/validar_firmado.py, 2026-10-08). Pruebas puras."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.servicios.validar_firmado import (  # noqa: E402
    codigo_del_nombre,
    coincidencia,
    es_pdf,
    motivos,
    nombre_valido,
    tiene_firma_digital,
)

GENERADO = "OF-0127-2026-2027_Ambiente-reunion.pdf"


def test_es_pdf():
    assert es_pdf(b"%PDF-1.7\n...")
    assert not es_pdf(b"\x89PNG\r\n")


def test_firma_digital():
    firmado = b"%PDF-1.7 << /Type /Sig /Filter /Adobe.PPKLite /ByteRange [0 100 200 300] /Contents <00> >>"
    assert tiene_firma_digital(firmado)
    assert not tiene_firma_digital(b"%PDF-1.7 << /Type /Page >>")


def test_nombre_del_firmador():
    assert codigo_del_nombre(GENERADO) == "OF-0127-2026-2027"
    assert nombre_valido("OF-0127-2026-2027_Ambiente-reunion[R].pdf", GENERADO) == ""
    assert nombre_valido("FIRM-OF-0127-2026-2027_Ambiente.pdf", GENERADO) == ""
    assert "[R]" in nombre_valido("OF-0127-2026-2027_Ambiente-reunion.pdf", GENERADO)
    assert "OF-0127" in nombre_valido("OF-0126-2026-2027_Otro[R].pdf", GENERADO)


def test_coincidencia():
    assert coincidencia(["uno", "dos", "tres"], ["uno", "dos", "tres", "sello"]) == 1.0
    assert coincidencia(["uno", "dos"], ["uno"]) == 0.5
    assert coincidencia([], ["x"]) == 1.0


def test_una_imagen_no_es_firmado():
    assert motivos(b"\x89PNG", "foto[R].png", None)[0].startswith("No es un PDF")


def test_proyecto_sin_exigir_nombre():
    firmado = b"%PDF-1.7 /Type /Sig /ByteRange [0 1 2 3]"
    assert motivos(firmado, "cualquier-nombre.pdf", None, exigir_nombre=False) == []

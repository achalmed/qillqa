"""Manifiesto de sincronización: los PDF de los RECIBIDOS van a «Recibidos/<AAAA-MM>/» (2026-10-18)."""
from app.servicios.sync import ruta_recibido


def test_recibido_en_su_mes():
    assert ruta_recibido("recibidos/entradas/2026-10/1234567_Oficio.pdf", "1234567_Oficio.pdf") == "Recibidos/2026-10/1234567_Oficio.pdf"


def test_recibido_sin_mes():
    assert ruta_recibido("recibidos/entradas/x.pdf", "x.pdf") == "Recibidos/x.pdf"

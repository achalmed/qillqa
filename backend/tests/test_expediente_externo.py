"""N.º de expediente de la entidad, leído del cargo de recepción."""
from app.servicios.expediente_externo import detectar


def test_formas_comunes():
    assert detectar("Se registró con Expediente N° 2026-0012345 el día") == "2026-0012345"
    assert detectar("EXP. N.° 12345-2026") == "12345-2026"
    assert detectar("Número de registro: 000123456") == "000123456"
    assert detectar("Hoja de Ruta: HR-2026-00045") == "HR-2026-00045"
    assert detectar("CUT N° 123456-2026") == "123456-2026"


def test_no_confunde_fechas_ni_anios():
    assert detectar("Registro: 08/10/2026") == ""
    assert detectar("Trámite 2026") == ""
    assert detectar("Constancia de recepción sin número") == ""

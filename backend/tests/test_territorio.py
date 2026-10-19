"""Distritos y aniversarios (servicios/territorio.py)."""
from datetime import date

from app.servicios import territorio


def test_lee_las_fechas_de_creacion():
    assert territorio.leer_fecha("23 de noviembre de 1964") == (1964, 11, 23)
    assert territorio.leer_fecha("6 de setiembre de 1920") == (1920, 9, 6)
    assert territorio.leer_fecha("25 de abril (aniversario de la fundación española de la ciudad, 1540)") == (1540, 4, 25)
    assert territorio.leer_fecha("26 de abril de 2013 (fecha de la norma; publicada en El Peruano el 28 abr 2013)") == (2013, 4, 26)
    assert territorio.leer_fecha("Época de la Independencia (sin fecha jurídica)") is None


def test_el_csv_de_ayacucho_esta_completo():
    ds = [d for d in territorio.distritos() if d["departamento"] == "Ayacucho"]
    assert len(ds) == 123
    assert len({d["provincia"] for d in ds}) == 11
    assert sum(1 for d in ds if d["mes"]) >= 80


def test_proximos_aniversarios_en_orden_y_con_anios():
    ds = [
        {"provincia": "P", "distrito": "A", "anio": 1964, "mes": 11, "dia": 23},
        {"provincia": "P", "distrito": "B", "anio": 1920, "mes": 10, "dia": 8},
        {"provincia": "P", "distrito": "C", "anio": None, "mes": None, "dia": None},
    ]
    r = territorio.aniversarios(ds, date(2026, 10, 6), 60)
    assert [x["distrito"] for x in r] == ["B", "A"]
    assert r[0]["faltan"] == 2 and r[0]["anios"] == 106
    # Pasado este año: el del año siguiente.
    assert territorio.proximo_aniversario(1, 5, date(2026, 10, 6)) == date(2027, 1, 5)
    assert territorio.proximo_aniversario(2, 29, date(2026, 10, 6)) == date(2027, 2, 28)

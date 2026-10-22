"""backend/tests/test_feriados.py — los feriados de Qillqa (servicios/feriados.py: los de gob.pe, la Pascua y las fechas
cívicas), que Tareas y Agenda pide por «calendario.v1». Estaban en test_agenda.py hasta que Minka salió a su
repositorio (2026-10-22).
"""
from datetime import date as _date

from app.servicios import feriados as fer


def test_feriados_2026_de_gob_pe():
    f = [x for x in fer.del_anio(2026) if x["tipo"] == "feriado"]
    assert len(f) == 16
    fechas = {x["fecha"] for x in f}
    for d in ("2026-01-01", "2026-04-02", "2026-04-03", "2026-05-01", "2026-06-07", "2026-06-29", "2026-07-23",
              "2026-07-28", "2026-07-29", "2026-08-06", "2026-08-30", "2026-10-08", "2026-11-01", "2026-12-08",
              "2026-12-09", "2026-12-25"):
        assert d in fechas
    nl = [x["fecha"] for x in fer.del_anio(2026) if x["tipo"] == "no_laborable"]
    assert nl == ["2026-01-02", "2026-07-27"]


def test_pascua_y_civicas():
    assert fer.pascua(2026) == _date(2026, 4, 5) and fer.pascua(2027) == _date(2027, 3, 28)
    c = {x["nombre"]: x["fecha"] for x in fer.del_anio(2026) if x["tipo"] == "civica"}
    assert c["Día de la Madre"] == "2026-05-10" and c["Día del Padre"] == "2026-06-21"


def test_feriados_entre_dos_anios():
    r = fer.entre(_date(2026, 12, 20), _date(2027, 1, 5))
    assert [x["fecha"] for x in r] == ["2026-12-25", "2027-01-01"]

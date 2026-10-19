"""backend/tests/test_actuaciones.py — reglas puras de las actuaciones del seguimiento
(servicios/actuaciones.py): cuándo dos actuaciones son la misma y cómo se deduplican
las que trae un pegado frente a las ya registradas. Sin base de datos.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_actuaciones.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import actuaciones as a  # noqa: E402


def test_parecida_misma_fecha_clase_y_texto_parecido():
    x = {"fecha": "2026-09-20", "clase": "llamada", "texto": "Se consultó el estado; está en planeamiento"}
    assert a.parecida(x, {"fecha": "2026-09-20", "clase": "llamada", "texto": "Consulta del estado: en Planeamiento"})
    assert a.parecida(x, {"fecha": "2026-09-20", "clase": "llamada", "texto": "está en planeamiento"})
    assert not a.parecida(x, {"fecha": "2026-09-21", "clase": "llamada", "texto": x["texto"]})
    assert not a.parecida(x, {"fecha": "2026-09-20", "clase": "reiteracion", "texto": x["texto"]})
    assert not a.parecida(x, {"fecha": "2026-09-20", "clase": "llamada", "texto": "Reunión con el alcalde"})


def test_deduplicar_marca_igual_y_quita_repetidas_entre_si():
    existentes = [{"id": 7, "fecha": "2026-09-01", "clase": "envio", "texto": "Ingresó por mesa de partes virtual"}]
    propuestas = [
        {"fecha": "2026-09-01", "clase": "envio", "texto": "Ingreso por mesa de partes virtual"},
        {"fecha": "2026-09-20", "clase": "llamada", "texto": "Se consultó el estado"},
        {"fecha": "2026-09-20", "clase": "llamada", "texto": "Se consultó el estado del trámite"},
    ]
    r = a.deduplicar(propuestas, existentes)
    assert [x["estado"] for x in r] == ["igual", "nuevo"] and r[0]["existente_id"] == 7

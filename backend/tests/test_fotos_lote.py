"""backend/tests/test_fotos_lote.py — cambios en lote y orden de las fotos de una semana
(2026-10-06): reglas puras de api/semanas_sr.py (aplicar_lote, nuevo_orden)."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.api.semanas_sr import aplicar_lote, nuevo_orden  # noqa: E402

BASE = {"id": "F-001", "origen": "A-01/x.jpg", "actividad": "A-01", "estado": "revisar",
        "seleccion": False, "pie": "", "tipo": "actividad"}


def test_elegir_para_el_informe_hace_publica_la_por_revisar():
    d = aplicar_lote(BASE, {"seleccion": True})
    assert d["seleccion"] is True and d["estado"] == "publica"


def test_reservada_sale_del_informe():
    d = aplicar_lote({**BASE, "estado": "publica", "seleccion": True}, {"estado": "reservada"})
    assert d["estado"] == "reservada" and d["seleccion"] is False


def test_claves_ajenas_no_entran_y_las_demas_se_conservan():
    d = aplicar_lote(BASE, {"origen": "otro.jpg", "id": "F-999", "tipo": "reunion"})
    assert d["origen"] == "A-01/x.jpg" and d["id"] == "F-001" and d["tipo"] == "reunion"


def test_relaciones_limpias_y_ordenadas():
    d = aplicar_lote(BASE, {"pedidos": ["P-003", " P-001 ", "", "P-003"], "instituciones": ["UGEL La Mar"]})
    assert d["pedidos"] == ["P-001", "P-003"] and d["instituciones"] == ["UGEL La Mar"]


def test_pie_de_actividad_solo_llena_vacios():
    assert aplicar_lote(BASE, {}, "Visita, Huanta")["pie"] == "Visita, Huanta"
    assert aplicar_lote({**BASE, "pie": "Propio"}, {}, "Visita, Huanta")["pie"] == "Propio"


def test_nuevo_orden_pone_delante_y_conserva_el_resto():
    actuales = ["F-001", "F-002", "F-003", "F-004", "F-005"]
    assert nuevo_orden(actuales, ["F-004", "F-002", "F-004", "F-999"]) == ["F-004", "F-002", "F-001", "F-003", "F-005"]


def test_sumar_relaciones_conserva_las_previas():
    d = aplicar_lote({**BASE, "pedidos": ["P-002"]}, {}, None, {"pedidos": ["P-001", "P-002"]})
    assert d["pedidos"] == ["P-001", "P-002"]

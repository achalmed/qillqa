"""Partes editables de un proyecto (servicios/proyectos_partes.py): lógica pura."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import proyectos_partes as pp  # noqa: E402

TIPO = "proyecto_de_ley"


def test_clave_nueva_es_slug_unico_y_nunca_de_la_plantilla():
    assert pp.slug("Objetivos y sectores comprendidos") == "objetivos-y-sectores-comprendi"
    assert pp.slug("¿Análisis? ¡Ambiental!") == "analisis-ambiental"
    assert pp.slug("   ") == "parte"
    reservadas = set(pp.plantilla_de(TIPO))
    assert pp.clave_nueva("Fundamentos", set(), reservadas) == "fundamentos-2"
    assert pp.clave_nueva("Anexo", {"anexo"}, reservadas) == "anexo-2"
    assert pp.clave_nueva("Anexo", {"anexo", "anexo-2"}, reservadas) == "anexo-3"
    assert len(pp.clave_nueva("x" * 40, {"x" * 30}, set())) <= pp.LARGO_CLAVE


def test_disponibles_y_fijas():
    todas = set(pp.plantilla_de(TIPO))
    assert pp.disponibles(TIPO, todas) == []
    d = pp.disponibles(TIPO, todas - {"dct", "conclusion"})
    assert [x["clave"] for x in d] == ["dct", "conclusion"]
    assert pp.es_fija(TIPO, "dcf", "formula") and pp.es_fija(TIPO, "titulo", "formula")
    assert not pp.es_fija(TIPO, "fundamentos", "exposicion") and not pp.es_fija(TIPO, "anexo-2", "formula")


def test_normalizar_orden_respeta_grupos_y_la_formula_legal():
    partes = [("titulo", "formula"), ("sustantiva", "formula"), ("dcf", "formula"), ("fundamentos", "exposicion"), ("antecedentes", "exposicion"), ("comparativo", "final")]
    # La exposición se reordena libremente.
    assert pp.normalizar_orden(TIPO, partes, ["titulo", "sustantiva", "dcf", "antecedentes", "fundamentos", "comparativo"]) == ["titulo", "sustantiva", "dcf", "antecedentes", "fundamentos", "comparativo"]
    # Los grupos no se cruzan: una parte de la exposición pedida antes de la fórmula vuelve a su grupo.
    assert pp.normalizar_orden(TIPO, partes, ["antecedentes", "titulo", "sustantiva", "dcf", "fundamentos", "comparativo"]) == ["titulo", "sustantiva", "dcf", "antecedentes", "fundamentos", "comparativo"]
    # Las fijas de la fórmula no cambian de orden entre sí.
    assert pp.normalizar_orden(TIPO, partes, ["titulo", "dcf", "sustantiva", "fundamentos", "antecedentes", "comparativo"]) is None
    # Una parte nueva de la fórmula sí se mueve entre las fijas.
    con_anexo = partes + [("anexo-2", "formula")]
    assert pp.normalizar_orden(TIPO, con_anexo, ["titulo", "sustantiva", "anexo-2", "dcf", "fundamentos", "antecedentes", "comparativo"])[:4] == ["titulo", "sustantiva", "anexo-2", "dcf"]
    # Un pedido que no es permutación exacta se rechaza.
    assert pp.normalizar_orden(TIPO, partes, ["titulo", "sustantiva"]) is None
    assert pp.normalizar_orden(TIPO, partes, ["titulo", "sustantiva", "dcf", "fundamentos", "antecedentes", "comparativo", "otra"]) is None


def test_insertar_coloca_la_parte_en_su_grupo():
    partes = [("titulo", "formula"), ("sustantiva", "formula"), ("fundamentos", "exposicion"), ("comparativo", "final")]
    assert pp.insertar(partes, "nueva", "exposicion") == ["titulo", "sustantiva", "fundamentos", "nueva", "comparativo"]
    assert pp.insertar(partes, "nueva", "exposicion", despues_de="titulo") == ["titulo", "sustantiva", "fundamentos", "nueva", "comparativo"]
    assert pp.insertar(partes, "nueva", "formula", despues_de="titulo") == ["titulo", "nueva", "sustantiva", "fundamentos", "comparativo"]
    assert pp.insertar([("titulo", "formula"), ("comparativo", "final")], "nueva", "exposicion") == ["titulo", "nueva", "comparativo"]
    assert pp.insertar([], "nueva", "final") == ["nueva"]

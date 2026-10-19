"""backend/tests/test_nota_numero_pegado.py — la nota al pie no repite su número pegado de Word (2026-10-14)."""
from app.latex.serializador import cuerpo_a_latex, sin_numero_pegado


def test_quita_el_numero_repetido_de_su_nota():
    assert sin_numero_pegado("1 1 1 Debe tenerse presente", 1) == "Debe tenerse presente"
    assert sin_numero_pegado("2. Según el artículo", 2) == "Según el artículo"


def test_no_toca_una_cifra_que_no_es_su_numero():
    assert sin_numero_pegado("15 días hábiles", 1) == "15 días hábiles"
    assert sin_numero_pegado("1990 fue el año", 1) == "1990 fue el año"


def _nota(texto):
    return {"type": "footnote", "attrs": {"texto": texto}}


def test_cuerpo_numera_las_notas_en_orden():
    doc = {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": "Uno"}, _nota("1 1 Primera")]},
        {"type": "paragraph", "content": [{"type": "text", "text": "Dos"}, _nota("2 Segunda"), _nota("1 Tercera")]},
    ]}
    tex = cuerpo_a_latex(doc)
    assert "\\footnote{Primera}" in tex
    assert "\\footnote{Segunda}" in tex
    assert "\\footnote{1 Tercera}" in tex  # la tercera no se llama «1»: queda tal cual

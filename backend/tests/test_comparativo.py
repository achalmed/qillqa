"""backend/tests/test_comparativo.py — cuadro comparativo derivado de las modificatorias (paso 3.3, 2026-10-01)."""

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")
os.environ.setdefault("JWT_SECRET", "x" * 32)

from app.latex import proyecto_ley as pl  # noqa: E402
from app.servicios import comparativo as c  # noqa: E402


def h(t):
    return {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": t}]}


def p(t):
    return {"type": "paragraph", "content": [{"type": "text", "text": t}]}


def cita(*bloques):
    return {"type": "blockquote", "content": list(bloques)}


DCM = [
    h("PRIMERA.- Incorporación del artículo 359-D al Código Penal, Decreto Legislativo 635"),
    p("Se incorpora el artículo 359-D al Código Penal, en los siguientes términos:"),
    cita(h("“Artículo 359-D.- Manipulación digital coordinada"), p("El que organiza una red…"), p("La pena será…”")),
    h("SEGUNDA. – Modificación del literal a) al artículo 1 de la Ley N.º 30424"),
    p("Se modifica el literal a) del artículo 1 de la Ley 30424, en los siguientes términos:"),
    cita(h("“Artículo 1. Objeto de la Ley"), p("(...)"), p("a. 199, 226, 228, 359-D, 384 y 400 del Código Penal.")),
]


def _filas(doc):
    return doc["content"][0]["content"]


def test_rotulos_y_tipo_de_cambio():
    citas = c.citas_de(DCM)
    assert [c.rotulo(e, q) for e, q in citas] == ["Código Penal · Artículo 359-D", "Ley 30424 · Artículo 1"]
    assert [c.es_incorporacion(e) for e, _ in citas] == [True, False]
    # Incorporar PÁRRAFOS a un artículo existente no es un artículo nuevo.
    assert not c.es_incorporacion("QUINTA. - Incorporación de un cuarto párrafo al artículo 132 del Código Penal")


def test_armado_una_fila_por_parrafo_y_vigente_por_llenar():
    doc = c.armar(DCM)
    filas = _filas(doc)
    # Encabezado + (rótulo + 3 filas) × 2.
    assert len(filas) == 1 + 4 + 4
    assert [x["type"] for x in filas[0]["content"]] == ["tableHeader", "tableHeader"]
    assert c._plano(filas[2]["content"][0]) == c.NO_EXISTE  # artículo nuevo
    assert c._plano(filas[6]["content"][0]) == c.PEGAR  # artículo modificado
    assert c.pendientes(doc) == 1


def test_lo_pegado_se_conserva_y_lo_anadido_va_en_negrita():
    doc = c.armar(DCM)
    filas = _filas(doc)
    filas[6]["content"][0]["content"] = [p("Artículo 1. Objeto de la Ley")]
    filas[8]["content"][0]["content"] = [p("a. 199, 226, 228, 384 y 400 del Código Penal.")]
    otra = c.armar(DCM, doc)  # se vuelve a armar (p. ej. tras corregir una cita)
    f = _filas(otra)
    assert c._plano(f[8]["content"][0]) == "a. 199, 226, 228, 384 y 400 del Código Penal."
    negritas = [x["text"].strip() for x in f[8]["content"][1]["content"][0]["content"] if x.get("marks")]
    assert negritas == ["359-D,"]
    assert c.pendientes(otra) == 0


def test_generador_avisa_lo_pendiente_y_pone_el_cuadro_tras_la_fecha():
    partes = [
        {"clave": "dcm", "titulo": "Modificatorias", "contenido": {"type": "doc", "content": DCM}},
        {"clave": "comparativo", "titulo": "Cuadro comparativo", "contenido": c.armar(DCM)},
    ]
    tex, avisos = pl.maestro({"codigo": "PL-1", "titulo": "LEY X", "datos": {}}, partes)
    assert "\\esquemacondicion{modificatoria}" in tex
    assert any("falta pegar el texto vigente de 1 artículo" in a for a in avisos)
    assert not any("no tiene cuadro comparativo" in a for a in avisos)
    assert tex.index("\\meta{lugar}") < tex.index("\\componente{comparativo}") < tex.index("\\begin{longtable}")

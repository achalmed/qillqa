"""backend/tests/test_serializador_herramientas.py — herramientas de redacción tipo Word (2026-10-05):
tachado, superíndice y subíndice, celdas combinadas en vertical, cuadro con título y fuente, y los
paquetes que el .tex generado carga solo cuando se usan. Pruebas puras del serializador.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.latex import serializador as s  # noqa: E402


def _t(texto, *marcas):
    nodo = {"type": "text", "text": texto}
    if marcas:
        nodo["marks"] = [{"type": m} for m in marcas]
    return nodo


def _celda(texto, **attrs):
    return {"type": "tableCell", "attrs": attrs, "content": [{"type": "paragraph", "content": [_t(texto)]}]}


def test_marcas_nuevas():
    p = s._parrafo({"type": "paragraph", "content": [_t("se deroga", "strike"), _t(" m"), _t("2", "superscript"), _t(" CO"), _t("2", "subscript")]})
    assert r"\sout{se deroga}" in p and r"\textsuperscript{2}" in p and r"\textsubscript{2}" in p


def test_rowspan_deja_celda_vacia_en_la_fila_siguiente():
    tabla = {"type": "table", "content": [
        {"type": "tableRow", "content": [_celda("A", rowspan=2), _celda("b1"), _celda("c1")]},
        {"type": "tableRow", "content": [_celda("b2"), _celda("c2")]},
        {"type": "tableRow", "content": [_celda("a3"), _celda("b3"), _celda("c3")]},
    ]}
    filas = [linea for linea in s._tabla(tabla).splitlines() if linea.endswith(r"\\")]
    assert filas[0].startswith(r"\multirow{2}{=}{A} & b1 & c1")
    assert filas[1].startswith(" & b2 & c2")
    assert filas[2].startswith("a3 & b3 & c3")


def test_cuadro_con_titulo_y_fuente():
    tabla = {"type": "table", "attrs": {"titulo": "Pérdidas  por distrito", "fuente": "INEI, 2026"},
             "content": [{"type": "tableRow", "content": [_celda("x")]}]}
    tex = s._tabla(tabla)
    assert r"\refstepcounter{cuadrosgdp}" in tex and "Pérdidas por distrito" in tex and "Fuente: INEI, 2026" in tex
    # Sin título ni fuente, la tabla es la de siempre.
    assert "cuadrosgdp" not in s._tabla({"type": "table", "content": [{"type": "tableRow", "content": [_celda("x")]}]})


def test_con_paquetes_solo_lo_que_se_usa_y_una_vez():
    base = "\\documentclass{oficio}\n\\begin{document}\nHola\n\\end{document}"
    assert s.con_paquetes(base) == base
    con = base.replace("Hola", r"\sout{x} \multirow{2}{=}{y} \refstepcounter{cuadrosgdp}")
    salida = s.con_paquetes(con)
    for paquete in (r"\usepackage[normalem]{ulem}", r"\usepackage{multirow}", r"\newcounter{cuadrosgdp}"):
        assert salida.count(paquete) == 1
    assert salida.index(r"\usepackage{multirow}") < salida.index(r"\begin{document}")
    assert s.con_paquetes(salida) == salida


def test_enlace_no_web_conserva_el_texto_sin_abortar():
    """2026-10-12: el ancla «#_ftn1» de una nota pegada de Word (y cualquier enlace que no sea
    web ni correo) dejaba el borrador sin vista previa; ahora se conserva el texto sin enlace."""
    from app.latex.serializador import cuerpo_a_latex

    doc = {"type": "doc", "content": [{"type": "paragraph", "content": [
        {"type": "text", "text": "Ver nota", "marks": [{"type": "link", "attrs": {"href": "#_ftn1"}}]},
        {"type": "text", "text": " y "},
        {"type": "text", "text": "otro", "marks": [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}, {"type": "bold"}]},
        {"type": "text", "text": " y web", "marks": [{"type": "link", "attrs": {"href": "https://ejemplo.pe/a"}}]},
    ]}]}
    latex = cuerpo_a_latex(doc, "oficio")
    assert "Ver nota" in latex and "\\href" in latex and "ejemplo.pe" in latex
    assert "_ftn1" not in latex and "javascript" not in latex
    assert "\\textbf{otro}" in latex


def test_color_de_texto_solo_hex_valido():
    # Color de texto (2026-10-19): la paleta del editor sale con \textcolor; un valor raro se ignora.
    nodo = {"type": "text", "text": "urgente", "marks": [{"type": "colorTexto", "attrs": {"color": "a6122e"}}]}
    assert s._texto(nodo) == r"\textcolor[HTML]{A6122E}{urgente}"
    raro = {"type": "text", "text": "x", "marks": [{"type": "colorTexto", "attrs": {"color": "red}\\input{a"}}]}
    assert s._texto(raro) == "x"


def test_formato_sugerido_y_parrafo_sugerido_no_se_imprimen():
    # Control de cambios, segunda parte (2026-10-19): la marca `cambioFormato` (negrita pedida y aún no
    # aceptada) y los atributos de párrafo `cambio` (división o unión sugerida) no cambian el PDF: el
    # documento sale como estaba; solo la inserción y la supresión de texto se ven.
    nodo = {"type": "text", "text": "pendiente", "marks": [{"type": "cambioFormato", "attrs": {"autor": "Ana", "en": "", "antes": '{"bold":false}', "despues": '{"bold":true,"textAlign":"center"}'}}]}
    assert s._texto(nodo) == "pendiente"
    p = s._parrafo({"type": "paragraph", "attrs": {"textAlign": "justify", "cambio": "supresion", "cambioAutor": "Ana", "cambioEn": "2026-10-19T10:00:00Z"}, "content": [nodo, _t(" y ", "insercion")]})
    assert p.strip() == r"pendiente\uline{ y }"

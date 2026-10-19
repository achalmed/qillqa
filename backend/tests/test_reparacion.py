"""backend/tests/test_reparacion.py — la escalera de reparaciones automáticas de la compilación
(app/latex/reparacion.py): clasificación del error, cada paso y su efecto. Sin LaTeX.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_reparacion.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.latex import reparacion as r  # noqa: E402

CUERPO = {"type": "doc", "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Hola 😀 mundo​"}, {"type": "footnote", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Ley 27444"}]}]}]},
    {"type": "table", "content": [
        {"type": "tableRow", "content": [{"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Col A"}]}]}, {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Col B"}]}]}]},
        {"type": "tableRow", "content": [{"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1"}]}]}, {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "2"}]}]}]},
    ]},
    {"type": "fotografia", "attrs": {"id": 3}},
    {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "punto", "marks": [{"type": "bold"}]}]}]}]},
]}


def test_clasificar_pone_primero_el_paso_probable():
    assert r.clasificar("! LaTeX Error: File `foto.png' not found.")[0] == "anexos"
    assert r.clasificar("! Illegal unit of measure (pt inserted).")[0] == "formato"
    assert r.clasificar("! Misplaced alignment tab character &.")[0] == "cuerpo"
    assert r.clasificar("algo raro") == list(r.PASOS)
    assert sorted(r.clasificar("! Missing number")) == sorted(r.PASOS)


def test_formato_quita_solo_lo_invalido():
    c, quitados = r.reparar_formato({"fmt_tamano": "10.5", "fmt_margen": "2,5 cm", "fmt_fuente": "Libertinus", "fmt_malo": "{\\huge}", "asunto": "x"})
    assert quitados == ["fmt_malo"] and c["fmt_tamano"] == "10.5" and c["fmt_margen"] == "2,5 cm" and c["asunto"] == "x"


def test_texto_quita_emoji_e_invisibles_y_conserva_simbolos():
    c, cu = r.reparar_texto({"asunto": "Pedido ✓ urgente 🔥", "fmt_x": "a"}, CUERPO)
    assert c["asunto"] == "Pedido ✓ urgente " and cu["content"][0]["content"][0]["text"] == "Hola  mundo"
    assert CUERPO["content"][0]["content"][0]["text"].startswith("Hola 😀")   # no muta el original


def test_cuerpo_tablas_a_parrafos_notas_en_linea_sin_imagenes():
    cu = r.reparar_cuerpo(CUERPO)
    tipos = [n["type"] for n in cu["content"]]
    assert "table" not in tipos and "fotografia" not in tipos and tipos.count("paragraph") == 3
    textos = [r._texto_de(n) for n in cu["content"]]
    assert "Col A · Col B" in textos and "1 · 2" in textos
    assert any("(nota: Ley 27444)" in t for t in textos)
    assert cu["content"][-1]["type"] == "bulletList"   # las listas se conservan


def test_plano_y_util():
    pl = r.reparar_plano(CUERPO)
    assert all(n["type"] == "paragraph" for n in pl["content"]) and len(pl["content"]) >= 3
    assert not r.util("anexos", {}, CUERPO, [])          # sin anexos, no vale la pena
    assert r.util("anexos", {}, CUERPO, ["a.png"])
    assert not r.util("formato", {"fmt_tamano": "10"}, CUERPO, [])


class _R:
    def __init__(self, exito, mensaje="", log=""):
        self.exito, self.mensaje, self.log, self.ruta_pdf = exito, mensaje, log, None


def _correr(intento, permitir=True, anexos=None):
    import asyncio

    return asyncio.run(r.con_reparaciones(intento, {"fmt_x": "{mal}", "asunto": "a"}, CUERPO, anexos or [], permitir))


def test_escalera_repara_al_primer_paso_que_sirve():
    vistos = []

    async def intento(c, cu, a):
        vistos.append((dict(c), [n["type"] for n in cu["content"]], list(a)))
        ok = "table" not in [n["type"] for n in cu["content"]]   # solo compila sin tablas
        return _R(ok, "" if ok else "! Misplaced alignment tab character &.", "! Misplaced alignment tab character &."), ""

    res, c, cu, a, reps, original, final = _correr(intento)
    assert res.exito and [x["paso"] for x in reps] == ["cuerpo"] and reps[0]["pierde"]
    assert "Misplaced" in original and final == ""


def test_sin_perdida_no_aplica_pasos_que_pierden_y_explica():
    async def intento(c, cu, a):
        return _R(False, "! Misplaced alignment tab character &.", "! Misplaced alignment tab character &."), ""

    res, c, cu, a, reps, original, final = _correr(intento, permitir=False)
    assert res is None and all(not x["pierde"] for x in reps) and "tabla" in final


def test_nodo_no_soportado_tambien_se_repara():
    llamadas = []

    async def intento(c, cu, a):
        llamadas.append(1)
        if len(llamadas) == 1:
            return None, "El enlace no es válido"
        return _R(True), ""

    res, *_resto, reps, original, final = _correr(intento)
    assert res.exito and len(reps) == 1 and original == "El enlace no es válido"


def test_explicar_en_palabras():
    assert "imagen anexa" in r.explicar("! LaTeX Error: File `x.png' not found.")
    assert r.explicar("nada conocido") == ""

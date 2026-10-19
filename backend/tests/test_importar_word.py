"""backend/tests/test_importar_word.py — cargar un proyecto de ley desde Word (2026-10-05).

Pruebas puras del lector (scripts/importar_proyecto_ley.py vía servicios/importar_word.py): una
exposición con su propio esquema no se pierde, las llamadas de nota de Word quedan como notas en
su lugar y la foto toma su título y su fuente.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import importar_word as word  # noqa: E402

imp = word.lector()


def h(t):
    return {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": t}]}


def test_exposicion_con_esquema_propio_va_a_fundamentos():
    lineas = ["FÓRMULA LEGAL", "LEY DE PRUEBA", "Artículo 1.- Objeto", "Texto.", "EXPOSICIÓN DE MOTIVOS",
              "I. SITUACIÓN DEL VALLE", "El valle produce.", "II. EFECTO DE LA VIGENCIA DE LA NORMA", "No modifica."]
    t = imp.partes(lineas)
    assert t["fundamentos"][0] == "I. SITUACIÓN DEL VALLE" and "El valle produce." in t["fundamentos"]
    assert t["efecto"][0].startswith("II. EFECTO")


def test_titulo_propio_de_la_parte():
    assert word.titulo_propio([h("I. SITUACIÓN DEL VALLE")]) == "Situación del valle"
    assert word.titulo_propio([h("I. FUNDAMENTOS DE LA PROPUESTA")]) == ""
    assert word.titulo_propio([{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}]) == ""


def test_llamadas_de_nota_de_word_en_su_lugar():
    nodo = {"type": "paragraph", "content": [{"type": "text", "text": "Crece⟦2⟧ y sigue⟦9⟧."}]}
    r = imp._con_notas_word(nodo, {2: "Fuente A.", 9: ""})
    tipos = [x["type"] for x in r["content"]]
    assert tipos == ["text", "footnote", "text", "text"]
    assert r["content"][1]["attrs"]["texto"] == "Fuente A."
    assert "⟦" not in "".join(x.get("text", "") for x in r["content"])


def test_foto_con_titulo_y_fuente():
    imp.reiniciar()
    imp.FOTOS[1] = {"datos": b"x", "ext": "jpg"}
    pars = imp.parrafos_docx(["§FOTO 1§", "FOTOGRAFÍA — N° 3", "Cultivo de palta⟦5⟧", "Sigue el texto."], set())
    assert pars[0] == ("foto", "1") and pars[1] == ("p", "Sigue el texto.")
    nodo = imp._fotos({"type": "fotografia", "attrs": {"foto": 1}}, {5: "Google Maps, 2026."})
    assert nodo["attrs"]["titulo"] == "Cultivo de palta" and nodo["attrs"]["fuente"] == "Google Maps, 2026."
    c = imp.asignar_fotos({"fundamentos": [nodo]}, lambda datos, ext: ("a" * 32 + ".jpg", "/api/x"))
    assert c["fundamentos"][0]["attrs"]["archivo"] == "a" * 32 + ".jpg" and "foto" not in c["fundamentos"][0]["attrs"]

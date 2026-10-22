"""backend/tests/test_linea_base.py — nada de lo que Qillqa hace hoy se pierde sin que se vea (fase 0 de
docs/plataforma/propuesta-repositorios.md, 2026-10-20). Compara la foto de tests/linea_base/funciones.json
con la aplicación de ahora: rutas de la API y su acceso, pantallas de la web, menú y módulos encendibles.

Si algo se retira a propósito: `cd backend && .venv/bin/python -m tests.linea_base --aplicar` y el diff del
JSON va en el mismo commit, explicado. Sin base de datos.
"""
import copy

from tests import linea_base as lb


def test_nada_se_pierde():
    antes = lb.leer()
    if (lb.FRONTEND / "node_modules").is_dir():
        ahora = lb.foto()
    else:   # sin `npm install` (un clon nuevo, el árbol de la demo): la web de los módulos enlazados no se puede leer;
        # se compara lo del backend y la web y el menú se toman de la foto guardada
        ahora = {**antes, "api": lb.foto_api(), "precedencia": lb.foto_precedencia(), "modulos": lb.foto_modulos()}
    faltas = lb.perdidas(antes, ahora)
    assert not faltas, "Se pierde lo que hacía el sistema:\n" + "\n".join(faltas)


def test_la_foto_ve_lo_esencial():
    f = lb.leer()
    rutas = {(r["metodo"], r["ruta"]): r for r in f["api"]}
    assert rutas[("POST", "/api/auth/login")]["acceso"] == "publico"
    assert rutas[("GET", "/api/documentos/{documento_id}")]["acceso"] == "sesion"
    assert any(r["acceso"] == "administracion" for r in f["api"])
    assert {m["id"] for m in f["menu"]} >= {"documentos", "recibidos", "chat", "tareas", "fototeca", "rendicion"}
    web = {w["ruta"]: w for w in f["web"]}
    assert web["/admin"]["solo_admin"] and web["/chat"]["modulo"] == "chat"
    assert {m["id"] for m in f["modulos"]} >= {"recibidos", "chat", "fototeca"}


def test_detecta_cada_clase_de_perdida():
    antes = lb.leer()
    ahora = copy.deepcopy(antes)
    login = next(r for r in ahora["api"] if r["ruta"] == "/api/auth/login")
    ahora["api"].remove(login)
    doc = next(r for r in ahora["api"] if r["ruta"] == "/api/documentos/{documento_id}" and r["metodo"] == "GET")
    doc["acceso"] = "publico"
    con_consulta = next(r for r in ahora["api"] if r["consulta"])
    con_consulta["consulta"] = {}
    ahora["web"] = [w for w in ahora["web"] if w["ruta"] != "/chat"]
    ahora["menu"] = [m for m in ahora["menu"] if m["id"] != "tareas"]
    ahora["modulos"] = [m for m in ahora["modulos"] if m["id"] != "chat"]
    faltas = "\n".join(lb.perdidas(antes, ahora))
    assert "POST /api/auth/login: la ruta ya no existe" in faltas
    assert "el acceso pasó de «sesion» a «publico»" in faltas
    assert "ya no acepta el parámetro" in faltas
    assert "web /chat: la pantalla ya no existe" in faltas
    assert "menú «tareas»: el módulo ya no está" in faltas
    assert "módulo «chat»: ya no se puede encender ni apagar" in faltas


def test_lo_nuevo_no_cuenta_como_perdida():
    antes = lb.leer()
    ahora = copy.deepcopy(antes)
    ahora["api"].append({"metodo": "GET", "ruta": "/api/nueva", "acceso": "sesion",
                         "parametros_ruta": [], "consulta": {"q": False}, "cuerpo": {}})
    primera = next(r for r in ahora["api"] if r["metodo"] == "POST" and r["cuerpo"])
    primera["cuerpo"] = {**primera["cuerpo"], "campo_nuevo_opcional": False}
    assert lb.perdidas(antes, ahora) == []

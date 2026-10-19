"""backend/tests/test_mesas_partes.py — la mesa de partes del destinatario (servicios/mesas_partes.py):
destinatarios del texto del documento, reconocimiento de su institución (persona, institución nombrada,
cargo de autoridad) y la mesa propia o la de la entidad superior. Datos INVENTADOS.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_mesas_partes.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import mesas_partes as mp  # noqa: E402


def _dir() -> mp.Directorio:
    d = mp.Directorio()
    for i, nombre, siglas, padre, mesa in (
        (1, "Gobierno Regional de Ejemplo", "GORE", None, "https://mesa.gore.example/"),
        (2, "Gerencia Regional de Infraestructura", "", 1, ""),
        (3, "Municipalidad Distrital de Villa Ejemplo", "", None, ""),
        (4, "Ministerio de Pruebas y Ensayos", "MPE", None, ""),
        (5, "Autoridad Nacional de Ensayos", "ANE", None, ""),
        (6, "Dirección Regional de Educación de Ejemplo", "DRE", 1, "https://mesa.dre.example/"),
        (7, "Autoridad Nacional del Ensayo", "ANE2", None, "https://mesa.ane.example/"),
        (8, "Administración Local de Agua Río Ejemplo", "", 7, ""),
    ):
        d.instituciones[i] = {"id": i, "nombre": nombre, "siglas": siglas, "parent_id": padre, "url_mesa_partes": mesa,
                              "url_oficial": "", "email": "", "telefono": ""}
    d.personas.append({"id": 9, "nombre": "Juana Pérez Quispe", "cargo": "Gerente", "institucion_id": 2,
                       "email": "", "celular": "", "telefono": ""})
    d.mesas_por_enlace[4] = "https://facilita.example/t/1"
    return d


def test_destinos_de_uno_y_varios():
    assert mp.destinos_de({"destinatario_nombre": "Juana Pérez Quispe", "destinatario_cargo": "Gerente"}) == [
        {"nombre": "Juana Pérez Quispe", "cargo": "Gerente", "institucion": ""}]
    varios = mp.destinos_de({"destinatario_nombre": "Ana Ruiz — Alcaldesa\nLuis Paz — Director"})
    assert [x["cargo"] for x in varios] == ["Alcaldesa", "Director"]
    assert mp.destinos_de({}) == []


def test_persona_del_directorio_y_mesa_de_la_entidad_superior():
    r = mp.resolver({"destinatario_nombre": "Juana Pérez Quispe", "destinatario_cargo": "Gerente"}, _dir())[0]
    assert r["institucion"]["id"] == 2 and r["como"] == "persona del directorio"
    assert r["mesa_partes"] == "https://mesa.gore.example/" and r["mesa_de"] == "Gobierno Regional de Ejemplo"


def test_institucion_nombrada_y_mesa_por_enlace():
    r = mp.resolver({"destinatario_nombre": "Pedro Gil", "destinatario_cargo": "Jefe de la Autoridad Nacional de Ensayos (ANE)"}, _dir())[0]
    assert r["institucion"]["id"] == 5 and r["mesa_partes"] == ""
    r = mp.resolver({"destinatario_nombre": "Rosa Luna", "destinatario_institucion": "Ministerio de Pruebas y Ensayos"}, _dir())[0]
    assert r["mesa_partes"] == "https://facilita.example/t/1" and r["mesa_de"] == ""


def test_cargo_de_autoridad():
    r = mp.resolver({"destinatario_nombre": "Carlos Soto", "destinatario_cargo": "Alcalde Distrital de Villa Ejemplo"}, _dir())[0]
    assert r["institucion"]["id"] == 3 and r["como"] == "cargo de autoridad"


def test_sin_reconocer():
    r = mp.resolver({"destinatario_nombre": "Presidentes de las APAFA de la región"}, _dir())[0]
    assert r["institucion"] is None and r["mesa_partes"] == ""


def test_director_regional():
    r = mp.resolver({"destinatario_nombre": "Director Regional de Educación de Ejemplo"}, _dir())[0]
    assert r["institucion"]["id"] == 6 and r["mesa_partes"] == "https://mesa.dre.example/" and r["mesa_de"] == ""


def test_administrador_local_de_agua_usa_la_mesa_de_su_autoridad():
    r = mp.resolver({"destinatario_nombre": "Pedro Gil", "destinatario_cargo": "Administrador Local de Agua Río Ejemplo ",
                     "destinatario_institucion": "ADMINISTRACIÓN LOCAL DE AGUA (ALA)"}, _dir())[0]
    assert r["institucion"]["id"] == 8 and r["mesa_partes"] == "https://mesa.ane.example/"
    assert r["mesa_de"] == "Autoridad Nacional del Ensayo"

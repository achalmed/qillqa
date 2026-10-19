"""Módulo Contraseñas (api/contrasenas.py, 2026-10-08): dominio, mismo sitio e importación."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.contrasenas import host_de, leer_csv, mismo_sitio  # noqa: E402


def test_host_de():
    assert host_de("https://www.Mesa.gob.pe/ingreso?x=1") == "mesa.gob.pe"
    assert host_de("mesa.gob.pe") == "mesa.gob.pe"
    assert host_de("") == ""


def test_mismo_sitio():
    assert mismo_sitio("https://mesa.gob.pe/a", "https://sso.mesa.gob.pe/login")
    assert mismo_sitio("https://www.mesa.gob.pe", "mesa.gob.pe")
    assert not mismo_sitio("https://mesa.gob.pe", "https://otramesa.gob.pe")
    assert not mismo_sitio("", "mesa.gob.pe")


def test_csv_de_google():
    texto = "﻿name,url,username,password,note\nMINEDU,https://mesa.minedu.gob.pe,usuario1,s3creta,dato\n,,,, \n"
    filas = leer_csv(texto)
    assert filas == [{"nombre": "MINEDU", "url": "https://mesa.minedu.gob.pe", "usuario": "usuario1", "clave": "s3creta", "notas": "dato", "categoria": ""}]


def test_csv_de_keepassxc():
    texto = '"Group","Title","Username","Password","URL","Notes"\n"Root/Mesas","GORE","u1","p1","https://gore.gob.pe",""\n"Root","X","u2","p2","https://x.pe",""\n'
    filas = leer_csv(texto)
    assert filas[0]["categoria"] == "Root/Mesas" and filas[0]["usuario"] == "u1"
    assert filas[1]["categoria"] == ""  # la raíz no es categoría


def test_csv_que_no_es_de_contrasenas():
    with pytest.raises(ValueError):
        leer_csv("a,b\n1,2\n")


from app.api.contrasenas import tipo_de  # noqa: E402


def test_tipo_de_ingreso():
    assert tipo_de("12345678") == "DNI"
    assert tipo_de("usuario@entidad.gob.pe") == "Correo"
    assert tipo_de("20131370998") == "RUC"
    assert tipo_de("usuario1") == "Usuario"

"""backend/tests/test_seguro_de_arranque.py — Tareas y Agenda (Minka), Rendición (Yupay) y Qillqasqa (Q5a) no arrancan sobre
su base propia vacía si la documental aún tiene sus datos (fase 10.2b, 2026-10-21; tiqsi.sql.sin_separar), como el chat, la Mesa de Partes
y el editor de piezas. Sin base: el seguro de Tiqsi se reemplaza por uno que contesta lo que la prueba pide.
"""
import asyncio

import pytest
import tiqsi.sql

from yupay import config as rendicion_config, db as rendicion_db

from minka import config as minka_config
from minka import db as minka_db
from qillqasqa import config as qillqasqa_config
from qillqasqa import db as qillqasqa_db

CASOS = [(minka_db, minka_config, "minka_database_url", ("tareas", "agenda_eventos")),
         (rendicion_db, rendicion_config, "rendicion_database_url", ("rendiciones",)),
         (qillqasqa_db, qillqasqa_config, "qillqasqa_database_url", ("documentos", "proyectos", "semanas_sr"))]


@pytest.mark.parametrize("db, cfg, var, tablas", CASOS)
def test_no_arranca_sobre_su_base_vacia_si_la_documental_tiene_sus_datos(monkeypatch, db, cfg, var, tablas):
    pedidos = []

    async def sin_separar(propia, origen, que):
        pedidos.append((propia, origen, tuple(que)))
        return True

    async def nada(_url):
        return False

    monkeypatch.setattr(tiqsi.sql, "sin_separar", sin_separar)
    monkeypatch.setattr(tiqsi.sql, "crear_base_si_falta", nada)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:c@h/qillqa")
    monkeypatch.setattr(cfg.config, "database_url", "postgresql+asyncpg://u:c@h/qillqa")
    monkeypatch.setattr(cfg.config, var, "postgresql+asyncpg://u:c@h/propia")
    with pytest.raises(db.SinSeparar):
        asyncio.run(db.preparar())
    assert pedidos == [("postgresql+asyncpg://u:c@h/propia", "postgresql+asyncpg://u:c@h/qillqa", tablas)]


@pytest.mark.parametrize("db, cfg, var, tablas", CASOS)
def test_sin_base_propia_o_sola_no_hay_seguro(monkeypatch, db, cfg, var, tablas):
    monkeypatch.setattr(cfg.config, var, "")
    assert asyncio.run(db._sin_separar()) is False
    monkeypatch.setattr(cfg.config, var, "postgresql+asyncpg://u:c@h/propia")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert asyncio.run(db._sin_separar()) is False

"""backend/tests/test_rimay_config.py — el chat arranca SOLO, con el anfitrión mínimo de Tiqsi, sin Qillqa ni la base
documental (proyecto Rimay R3; fase 10.2b, 2026-10-20; app/rimay_sola.py). Sin base de datos: lo que la necesita se
prueba en vivo contra una vacía (qillqa/scripts/verde.sh sola-rimay).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
SECRETO = "k" * 40


def _entorno_limpio(tmp_path) -> dict:
    return {"HOME": os.environ.get("HOME", "/tmp"), "PATH": os.environ.get("PATH", ""),
            "RIMAY_DATABASE_URL": "postgresql+asyncpg://nadie:nada@127.0.0.1:1/rimay_prueba",
            "RIMAY_DIR": str(tmp_path / "rimay"), "JWT_SECRET": SECRETO}


def test_la_configuracion_del_chat_dice_lo_mismo_que_la_de_qillqa(monkeypatch):
    """Los archivos del chat viven bajo la misma raíz documental que dice app.config (sin RIMAY_DIR)."""
    from app import config as qillqa
    from rimay import config as propia

    monkeypatch.setattr(propia.config, "rimay_dir", "")
    for valores in ({"mdd_documentos": "/tmp/despacho/documentos", "mdd_ruta": "/m"}, {"mdd_documentos": "", "mdd_ruta": "/tmp/marco"}):
        for clave, valor in valores.items():
            monkeypatch.setattr(qillqa.config, clave, valor)
            monkeypatch.setattr(propia.config, clave, valor)
        assert propia.raiz() == qillqa.raiz_documentos()
    monkeypatch.setattr(propia.config, "rimay_dir", "/tmp/rimay")
    assert str(propia.raiz()) == "/tmp/rimay"
    for campo in ("zona_horaria", "nombre_bancada", "nombre_grupo_parlamentario", "nombre_programa_radio", "telegram_token",
                  "telegram_chat", "telegram_usuario"):
        assert getattr(propia.ConfigRimay(), campo) == getattr(type(qillqa.config)(), campo), campo   # mismos valores por omisión

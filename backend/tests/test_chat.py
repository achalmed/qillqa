"""backend/tests/test_chat.py — reglas puras del chat (servicios/chat.py): menciones, clave del
directo, entidades válidas, permisos por clase de canal y texto de un mensaje automático.
Sin base de datos. Uso: cd backend && .venv/bin/python -m pytest -q tests/test_chat.py
"""
import os
from types import SimpleNamespace as NS

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from rimay import chat
from app.servicios import avisos_chat, registro_chat  # noqa: E402


def test_texto_automatico_con_plantilla_o_con_datos():
    datos = {"numero": "OF-0012-2026", "asunto": "Pedido de informe", "estado": "ENVIADO"}
    assert avisos_chat.texto_automatico("Un documento cambió de estado", datos, "Enviado {numero}: {asunto}") == "Enviado OF-0012-2026: Pedido de informe"
    assert avisos_chat.texto_automatico("Un documento cambió de estado", datos) == "Un documento cambió de estado: OF-0012-2026 · Pedido de informe · ENVIADO"
    assert avisos_chat.texto_automatico("Algo pasó", {}) == "Algo pasó"


def test_slug_de_comision_y_respuesta_reconocida():
    assert chat.slug("Comisión de Educación, Cultura y Deporte") == "educacion-cultura-y-deporte"
    assert chat.slug("Comisión de Salud") == "salud"
    from app.servicios import pegado

    le = pegado.interpretar("tipo: agenda-actividades\nversion: 1\nactividades:\n  - titulo: Sesión de la comisión\n    inicio: 2026-11-03 10:00\n")
    texto, acciones = registro_chat.respuesta_reconocido(le, 42, con_pdf=False)
    assert "Actividades de agenda" in texto and "1 actividad" in texto
    assert acciones[0]["accion"] == "registrar" and acciones[0]["mensaje_id"] == 42
    assert acciones[1]["ruta"] == "/agenda?pegar=42"
    le2 = pegado.interpretar("tipo: documento-recibido\nversion: 1\nasunto: Prueba\n")
    texto2, acciones2 = registro_chat.respuesta_reconocido(le2, 7, con_pdf=False)
    assert "Adjunte el PDF" in texto2 and all(a.get("accion") != "registrar" for a in acciones2)
    assert registro_chat.reconocer("hola, ¿cómo va el oficio?") is None

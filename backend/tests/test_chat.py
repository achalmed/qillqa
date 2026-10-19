"""backend/tests/test_chat.py — reglas puras del chat (servicios/chat.py): menciones, clave del
directo, entidades válidas, permisos por clase de canal y texto de un mensaje automático.
Sin base de datos. Uso: cd backend && .venv/bin/python -m pytest -q tests/test_chat.py
"""
import os
from types import SimpleNamespace as NS

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import chat  # noqa: E402


def test_menciones_clave_directo_y_entidades():
    assert chat.menciones("Hola @ana y @luis.perez, mira @nadie", {"ana", "luis.perez"}) == ["ana", "luis.perez"]
    assert chat.clave_directo(7, 2) == chat.clave_directo(2, 7) == "u:2-u:7"
    assert chat.entidad_valida("doc:95") and chat.entidad_valida("comision:educacion") and chat.entidad_valida("entrada:12")
    assert not chat.entidad_valida("doc") and not chat.entidad_valida("x:1") and not chat.entidad_valida("")


def test_permisos_por_clase_de_canal():
    admin, asesor, invitado = NS(rol="administrador"), NS(rol="asesor"), NS(rol="invitado")
    tema = NS(clase="tema", visibilidad="equipo", archivado=False)
    grupo = NS(clase="grupo", visibilidad="privado", archivado=False)
    archivado = NS(clase="tema", visibilidad="equipo", archivado=True)
    assert chat.puede_leer(tema, asesor, False) and chat.puede_escribir(tema, asesor, False)
    assert not chat.puede_leer(tema, invitado, True)
    assert not chat.puede_leer(grupo, asesor, False) and chat.puede_leer(grupo, asesor, True)
    assert chat.puede_leer(archivado, admin, False) and not chat.puede_escribir(archivado, admin, False)
    assert not chat.puede_leer(archivado, asesor, False)


def test_texto_automatico_con_plantilla_o_con_datos():
    datos = {"numero": "OF-0012-2026", "asunto": "Pedido de informe", "estado": "ENVIADO"}
    assert chat.texto_automatico("Un documento cambió de estado", datos, "Enviado {numero}: {asunto}") == "Enviado OF-0012-2026: Pedido de informe"
    assert chat.texto_automatico("Un documento cambió de estado", datos) == "Un documento cambió de estado: OF-0012-2026 · Pedido de informe · ENVIADO"
    assert chat.texto_automatico("Algo pasó", {}) == "Algo pasó"


def test_slug_de_comision_y_respuesta_reconocida():
    assert chat.slug("Comisión de Educación, Cultura y Deporte") == "educacion-cultura-y-deporte"
    assert chat.slug("Comisión de Salud") == "salud"
    from app.servicios import pegado

    le = pegado.interpretar("tipo: agenda-actividades\nversion: 1\nactividades:\n  - titulo: Sesión de la comisión\n    inicio: 2026-11-03 10:00\n")
    texto, acciones = chat.respuesta_reconocido(le, 42, con_pdf=False)
    assert "Actividades de agenda" in texto and "1 actividad" in texto
    assert acciones[0]["accion"] == "registrar" and acciones[0]["mensaje_id"] == 42
    assert acciones[1]["ruta"] == "/agenda?pegar=42"
    le2 = pegado.interpretar("tipo: documento-recibido\nversion: 1\nasunto: Prueba\n")
    texto2, acciones2 = chat.respuesta_reconocido(le2, 7, con_pdf=False)
    assert "Adjunte el PDF" in texto2 and all(a.get("accion") != "registrar" for a in acciones2)
    assert chat.reconocer("hola, ¿cómo va el oficio?") is None

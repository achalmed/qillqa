"""backend/tests/test_chat_encuestas.py — reglas puras de lo que el chat suma en la fase 9.6
(servicios/chat.py): encuestas (opciones, votar o quitar el voto, resumen con porcentaje y
anonimato, cierre por hora), notas de voz (cómo se reconocen y con qué tipo se sirven), la
vista previa de la lista de chats, el anuncio de una tarea o actividad creada desde el chat y
que el chat reconozca TODOS los formatos de `esquemas/pegado/*.yml`.
Sin base de datos. Uso: cd backend && .venv/bin/python -m pytest -q tests/test_chat_encuestas.py
"""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import registro_chat  # noqa: E402


def _encuesta(**k):
    base = dict(id=7, mensaje_id=70, pregunta="¿Qué día?", opciones=["Lunes", "Martes", "Miércoles"], multiple=False,
                anonima=False, cierra_en=None, cerrada=False, creado_por=1)
    base.update(k)
    return NS(**base)


def test_imagen_del_chat_no_exige_mesa_de_partes():
    # 2026-10-18: una captura o foto es conversación → Mediateca; un PDF o Word, documento → Mesa de Partes.
    assert registro_chat.ofrecer_archivo("captura.png")[0]["accion"] == "archivo_a_mediateca"
    assert registro_chat.ofrecer_archivo("IMG_2031.jpg")[0]["accion"] == "archivo_a_mediateca"
    assert registro_chat.ofrecer_archivo("oficio.pdf")[0]["accion"] == "archivo_a_recibidos"
    assert registro_chat.ofrecer_archivo("carta.docx")[0]["accion"] == "archivo_a_recibidos"
    assert registro_chat.ofrecer_archivo("video.mp4")[0]["accion"] == "archivo_a_mediateca"
    assert registro_chat.ofrecer_archivo("datos.xlsx") == []
    # Con el bloque `documento-recibido` en el mensaje, la foto ES el documento escaneado.
    assert registro_chat.ofrecer_archivo("escaneo.jpg", con_bloque_recibido=True)[0]["accion"] == "archivo_a_recibidos"
    assert registro_chat.ofrecer_archivo("oficio.pdf", con_bloque_recibido=True)[0]["accion"] == "archivo_a_recibidos"
    assert registro_chat.trae_bloque_recibido("hola") is False
    assert registro_chat.trae_bloque_recibido("```yaml\ntipo: documento-recibido\nversion: 1\nasunto: Prueba\n```") is True


def test_el_chat_reconoce_todos_los_formatos_de_pegado():
    """Cada `esquemas/pegado/<tipo>.yml` tiene su módulo en RUTA_MODULO (para «Abrir y revisar»)
    y en la tabla de la web (`componentes/chat/mensajes.ts::FORMATOS_PEGADO`, el aviso antes de enviar)."""
    raiz = Path(__file__).resolve().parents[1] / "app" / "esquemas" / "pegado"
    tipos = {p.stem for p in raiz.glob("*.yml")}
    assert tipos, "no hay esquemas"
    faltan = tipos - set(registro_chat.RUTA_MODULO)
    assert not faltan, f"RUTA_MODULO no cubre: {sorted(faltan)}"
    # La web del chat es de Rimay: Qillqa la tiene por su paquete enlazado (@qillqa/rimay, frontend/node_modules); sin
    # `npm install` (un clon nuevo, el árbol de la demo) no hay qué leer.
    modulos = Path(__file__).resolve().parents[2] / "frontend" / "node_modules"
    if not modulos.is_dir():
        pytest.skip("sin frontend/node_modules: la tabla de la web vive en @qillqa/rimay")
    web = (modulos / "@qillqa" / "rimay" / "src" / "componentes" / "chat" / "mensajes.ts").read_text(encoding="utf-8")
    faltan_web = {t for t in tipos if f"'{t}'" not in web}
    assert not faltan_web, f"FORMATOS_PEGADO de la web no cubre: {sorted(faltan_web)}"


def test_plan_de_tareas_se_registra_revisando_en_el_chat():
    """El plan de tareas se reconoce con su resumen y ofrece UNA acción: «Registrar en Tareas», que
    abre «Pegar tareas» en el mismo chat (casar responsables y plazos antes de crear)."""
    t = ("Para la semana:\n\ntipo: plan-de-tareas\nversion: 1\ntareas:\n  - titulo: Remitir el oficio a la comisión\n"
         "    responsable: Ana\n    vence: 2026-10-20\n  - titulo: Llamar al asesor\n")
    le = registro_chat.reconocer(t)
    assert le is not None and le.valido
    texto, acciones = registro_chat.respuesta_reconocido(le, 5, con_pdf=False)
    assert texto == "Reconocí un formato «Plan de tareas»: 2 tarea(s): Remitir el oficio a la comisión; Llamar al asesor."
    assert acciones == [{"texto": "Registrar en Tareas", "accion": "pegar_tareas", "mensaje_id": 5}]
    assert "plan-de-tareas" not in registro_chat.REGISTRABLES  # no se crea a ciegas desde el servidor

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

from app.servicios import chat  # noqa: E402


def test_opciones_limpias_sin_repetidas_y_entre_dos_y_diez():
    assert chat.limpiar_opciones(["  Lunes ", "martes", "Lunes", "", "lunes"]) == ["Lunes", "martes"]
    with pytest.raises(ValueError):
        chat.limpiar_opciones(["Sí", "sí", " "])
    with pytest.raises(ValueError):
        chat.limpiar_opciones([f"Opción {i}" for i in range(11)])
    assert len(chat.limpiar_opciones([f"Opción {i}" for i in range(10)])) == 10


def test_votar_cambiar_y_quitar_en_respuesta_unica():
    assert chat.aplicar_voto(set(), 1, False, 3) == {1}
    assert chat.aplicar_voto({1}, 2, False, 3) == {2}        # tocar otra cambia el voto
    assert chat.aplicar_voto({2}, 2, False, 3) == set()      # tocar la mía la quita
    with pytest.raises(ValueError):
        chat.aplicar_voto(set(), 3, False, 3)
    with pytest.raises(ValueError):
        chat.aplicar_voto(set(), -1, False, 3)


def test_votar_varias_respuestas_suma_y_alterna():
    assert chat.aplicar_voto({0}, 2, True, 3) == {0, 2}
    assert chat.aplicar_voto({0, 2}, 0, True, 3) == {2}


def _encuesta(**k):
    base = dict(id=7, mensaje_id=70, pregunta="¿Qué día?", opciones=["Lunes", "Martes", "Miércoles"], multiple=False,
                anonima=False, cierra_en=None, cerrada=False, creado_por=1)
    base.update(k)
    return NS(**base)


def test_resumen_con_porcentaje_sobre_quienes_votaron_y_la_mia():
    votos = [(1, 0), (2, 0), (3, 1), (3, 2)]  # 3 personas; la 3 votó dos (encuesta de varias)
    r = chat.resumen_encuesta(_encuesta(multiple=True), votos, {1: "Ana", 2: "Luis", 3: "Eva"}, yo=3)
    assert r["votantes"] == 3
    assert [o["votos"] for o in r["opciones"]] == [2, 1, 1]
    assert [o["porcentaje"] for o in r["opciones"]] == [67, 33, 33]
    assert [o["mia"] for o in r["opciones"]] == [False, True, True]
    assert [v["nombre"] for v in r["opciones"][0]["votantes"]] == ["Ana", "Luis"]


def test_resumen_anonimo_no_dice_quien_y_sin_votos_da_cero():
    r = chat.resumen_encuesta(_encuesta(anonima=True), [(1, 0), (2, 1)], {1: "Ana", 2: "Luis"}, yo=1)
    assert all(o["votantes"] == [] for o in r["opciones"]) and r["opciones"][0]["mia"]
    vacia = chat.resumen_encuesta(_encuesta(), [], {}, yo=None)
    assert vacia["votantes"] == 0 and all(o["porcentaje"] == 0 and not o["mia"] for o in vacia["opciones"])


def test_cierre_a_mano_o_al_pasar_la_hora():
    ahora = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
    assert chat.encuesta_cerrada(True, None, ahora)
    assert not chat.encuesta_cerrada(False, None, ahora)
    assert chat.encuesta_cerrada(False, ahora - timedelta(minutes=1), ahora)
    assert not chat.encuesta_cerrada(False, ahora + timedelta(hours=1), ahora)
    r = chat.resumen_encuesta(_encuesta(cierra_en=ahora - timedelta(seconds=1)), [], {}, None, ahora)
    assert r["cerrada"] is True


def test_nota_de_voz_y_su_tipo():
    assert chat.es_nota_de_voz("nota-de-voz-20261012-101500.webm") and chat.es_nota_de_voz("Nota-de-voz-1.m4a")
    assert not chat.es_nota_de_voz("reunion.webm") and not chat.es_nota_de_voz("nota-de-voz.pdf")
    assert chat.tipo_de_archivo("nota-de-voz-1.webm") == "audio/webm"
    assert chat.tipo_de_archivo("reunion.webm") == "video/webm"   # un video webm sigue siendo video
    assert chat.tipo_de_archivo("nota-de-voz-1.m4a") == "audio/mp4"
    assert chat.tipo_de_archivo("audio.opus") == "audio/ogg"
    assert chat.tipo_de_archivo("x.desconocido") == "application/octet-stream"
    # Una nota de voz no ofrece «Guardar en la Mediateca» (un .webm cualquiera, sí: es un video).
    assert chat.acciones_de_archivo(NS(id=1, nombre="nota-de-voz-1.webm")) == []


def test_imagen_del_chat_no_exige_mesa_de_partes():
    # 2026-10-18: una captura o foto es conversación → Mediateca; un PDF o Word, documento → Mesa de Partes.
    assert chat.acciones_de_archivo(NS(id=1, nombre="captura.png"))[0]["accion"] == "archivo_a_mediateca"
    assert chat.acciones_de_archivo(NS(id=1, nombre="IMG_2031.jpg"))[0]["accion"] == "archivo_a_mediateca"
    assert chat.acciones_de_archivo(NS(id=1, nombre="oficio.pdf"))[0]["accion"] == "archivo_a_recibidos"
    assert chat.acciones_de_archivo(NS(id=1, nombre="carta.docx"))[0]["accion"] == "archivo_a_recibidos"
    assert chat.acciones_de_archivo(NS(id=1, nombre="video.mp4"))[0]["accion"] == "archivo_a_mediateca"
    assert chat.acciones_de_archivo(NS(id=1, nombre="datos.xlsx")) == []
    # Con el bloque `documento-recibido` en el mensaje, la foto ES el documento escaneado.
    assert chat.acciones_de_archivo(NS(id=1, nombre="escaneo.jpg"), con_bloque_recibido=True)[0]["accion"] == "archivo_a_recibidos"
    assert chat.acciones_de_archivo(NS(id=1, nombre="oficio.pdf"), con_bloque_recibido=True)[0]["accion"] == "archivo_a_recibidos"
    assert chat.trae_bloque_recibido("hola") is False
    assert chat.trae_bloque_recibido("```yaml\ntipo: documento-recibido\nversion: 1\nasunto: Prueba\n```") is True


def test_vista_previa_de_la_lista():
    assert chat.vista_previa("¿Qué día?", encuesta=True) == "Encuesta: ¿Qué día?"
    assert chat.vista_previa("", "nota-de-voz-1.webm") == "Nota de voz"
    assert chat.vista_previa("", "oficio.pdf") == "oficio.pdf"
    assert chat.vista_previa("Hola", "oficio.pdf") == "Hola"


def test_anuncio_de_tarea_y_de_actividad():
    assert chat.texto_anuncio("tarea", "Revisar el oficio", "lun 14/10", "Ana") == "Tarea creada: Revisar el oficio · vence lun 14/10 · Ana"
    assert chat.texto_anuncio("tarea", "Llamar") == "Tarea creada: Llamar"
    assert chat.texto_anuncio("evento", "Comisión", "mar 15/10 10:00", lugar="Sala 2") == "Actividad agendada: Comisión · mar 15/10 10:00 · Sala 2"
    lima = chat.cuando_legible(datetime(2026, 10, 14, 15, 30, tzinfo=timezone.utc))  # 10:30 en Lima
    assert lima == "mié 14/10 10:30"
    assert chat.cuando_legible(datetime(2026, 10, 14, 15, 30, tzinfo=timezone.utc), con_hora=False) == "mié 14/10"
    assert chat.cuando_legible(None) == ""


def test_el_chat_reconoce_todos_los_formatos_de_pegado():
    """Cada `esquemas/pegado/<tipo>.yml` tiene su módulo en RUTA_MODULO (para «Abrir y revisar»)
    y en la tabla de la web (`componentes/chat/mensajes.ts::FORMATOS_PEGADO`, el aviso antes de enviar)."""
    raiz = Path(__file__).resolve().parents[1] / "app" / "esquemas" / "pegado"
    tipos = {p.stem for p in raiz.glob("*.yml")}
    assert tipos, "no hay esquemas"
    faltan = tipos - set(chat.RUTA_MODULO)
    assert not faltan, f"RUTA_MODULO no cubre: {sorted(faltan)}"
    web = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "componentes" / "chat" / "mensajes.ts").read_text(encoding="utf-8")
    faltan_web = {t for t in tipos if f"'{t}'" not in web}
    assert not faltan_web, f"FORMATOS_PEGADO de la web no cubre: {sorted(faltan_web)}"


def test_plan_de_tareas_se_registra_revisando_en_el_chat():
    """El plan de tareas se reconoce con su resumen y ofrece UNA acción: «Registrar en Tareas», que
    abre «Pegar tareas» en el mismo chat (casar responsables y plazos antes de crear)."""
    t = ("Para la semana:\n\ntipo: plan-de-tareas\nversion: 1\ntareas:\n  - titulo: Remitir el oficio a la comisión\n"
         "    responsable: Ana\n    vence: 2026-10-20\n  - titulo: Llamar al asesor\n")
    le = chat.reconocer(t)
    assert le is not None and le.valido
    texto, acciones = chat.respuesta_reconocido(le, 5, con_pdf=False)
    assert texto == "Reconocí un formato «Plan de tareas»: 2 tarea(s): Remitir el oficio a la comisión; Llamar al asesor."
    assert acciones == [{"texto": "Registrar en Tareas", "accion": "pegar_tareas", "mensaje_id": 5}]
    assert "plan-de-tareas" not in chat.REGISTRABLES  # no se crea a ciegas desde el servidor

"""backend/tests/test_redaccion_chat.py — los mensajes del sistema escritos como los del equipo en
Telegram (servicios/redaccion_chat.py): estado del expediente, comunicado de lo recibido, agenda,
documento, programación del día y la regla que decide si se usan. Sin base de datos.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_redaccion_chat.py
"""
import os
from datetime import date, datetime
from types import SimpleNamespace as NS
from zoneinfo import ZoneInfo

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from rimay import chat
from app.servicios import avisos_chat, redaccion_chat as r  # noqa: E402

LIMA = ZoneInfo("America/Lima")


def test_estado_del_expediente_como_la_captura():
    texto = r.seguimiento({
        "expediente_entidad": "2026-00306144", "destino": "MEF", "numero": "OFICIO N°0018-2026-2027-ABC-CD/CRP",
        "asunto": "Pedido de información sobre el incumplimiento del plazo", "estado_propuesto": "sin_respuesta",
        "ubicacion": "Dirección de Política Fiscal en Pensiones", "responsable_entidad": "", "ultima_fecha": "2026-09-08",
        "plazo_legal": {}, "pendientes": ["que la Dirección evalúe y elabore la respuesta al pedido de informe"],
    }, date(2026, 9, 8))
    lineas = texto.splitlines()
    assert lineas[0] == "📄 Expediente N° 2026-00306144 (MEF)"
    assert lineas[1] == "📑 *OFICIO N°0018-2026-2027-ABC-CD/CRP*"
    assert lineas[2] == '📝 Asunto: "Pedido de información sobre el incumplimiento del plazo"'
    assert lineas[3] == "🔵 Estado: RECIBIDO (pendiente de atención)"
    assert "👤 Responsable: no indicado" in texto
    assert "📅 Recibido: 08/09/2026 · ⏱️ 0 días sin movimiento" in texto
    assert "⚖️ Plazo legal: no indicado" in texto
    assert "📌 Qué falta: que la Dirección evalúe" in texto
    assert "✅ ¿Terminado?: NO — acaba de llegar" in texto
    assert lineas[-1].startswith("🔎 En resumen: el documento ya está en Dirección de Política Fiscal en Pensiones")
    assert "\n\n\n" not in texto


def test_estado_del_expediente_fuera_de_plazo_y_respondido():
    base = {"numero": "OF-1", "estado_propuesto": "en_tramite", "ultima_fecha": "2026-09-22",
            "plazo_legal": {"norma": "TUO de la Ley 27806", "articulo": "11, literal b", "dias": 10, "vence": "2026-10-06"}}
    vencido = r.seguimiento(base, date(2026, 10, 10))
    assert "🔴 Estado: EN TRÁMITE (fuera de plazo)" in vencido
    assert "⚖️ Plazo legal: 10 días hábiles (TUO de la Ley 27806, art. 11, literal b) → vence 06/10/2026 · FUERA DE PLAZO (vencido)" in vencido
    assert "toca reiterar" in vencido
    assert "📄 *ESTADO DEL DOCUMENTO*" in vencido  # sin expediente de la entidad
    hecho = r.seguimiento({**base, "estado_propuesto": "respondido", "resumen": "ya contestaron."}, date(2026, 10, 10))
    assert "🟢 Estado: RESPONDIDO (finalizado)" in hecho and "· cumplido" in hecho
    assert "✅ ¿Terminado?: SÍ — la entidad respondió" in hecho and hecho.endswith("🔎 En resumen: ya contestaron.")


def test_comunicado_de_lo_recibido():
    d = {"documento": "OFICIO N.° 0234-2026-GRA/GR", "remitente": "Gobierno Regional de Ayacucho", "remitente_cargo": "Gerencia General",
         "fecha_documento": "2026-08-12", "fecha_recepcion": "2026-08-14", "via": "std", "std_numero": "0004521",
         "asunto": "«Solicita opinión técnica»", "resumen": "Pide opinión sobre el proyecto. Adjunta informe técnico.",
         "atencion": "responder", "plazo": "2026-08-22", "responsable": "Ana Quispe"}
    t = r.recibido(d, date(2026, 8, 14))
    assert t.startswith("📌 *NUEVO DOCUMENTO RECIBIDO*\n\n📄 *OFICIO N.° 0234-2026-GRA/GR*")
    assert "🏛️ Remitente: Gobierno Regional de Ayacucho — Gerencia General" in t
    assert "📥 Recibido: 14/08/2026 (STD)" in t and "🔖 Registro STD: N.° 0004521" in t
    assert '📝 ASUNTO:\n"Solicita opinión técnica"' in t
    assert "🔍 CONTENIDO:\n- Pide opinión sobre el proyecto.\n- Adjunta informe técnico." in t
    assert "⏳ PLAZO: 22/08/2026 (8 días)" in t and "🚦 PRIORIDAD: 🟡 MEDIA" in t
    assert "🚦 PRIORIDAD: 🔴 ALTA" in r.recibido(d, date(2026, 8, 20))
    assert "PLAZO VENCIDO (2 días)" in r.recibido(d, date(2026, 8, 24), "vencida")
    info = r.recibido({**d, "atencion": "conocimiento", "plazo": ""}, date(2026, 8, 14))
    assert "✅ ACCIÓN REQUERIDA: Ninguna — solo conocimiento." in info and "🟢 INFORMATIVO" in info and "⏳" not in info
    # Lo que no consta no se escribe.
    corto = r.recibido({"asunto": "Invita", "clase": "invitacion"}, date(2026, 8, 14))
    assert "Remitente" not in corto and "NO INDICA" not in corto and "📄 *INVITACION*" in corto
    resp = r.recibido({**d, "respuesta": "OFICIO N°0300"}, date(2026, 8, 20), "respondida")
    assert "📤 Respondido con: *OFICIO N°0300*" in resp and "PRIORIDAD" not in resp


def test_agenda_y_recordatorio():
    inicio = datetime(2026, 9, 3, 10, 0, tzinfo=LIMA)
    d = {"titulo": "Décima Sesión Ordinaria de la Comisión de Educación", "tipo": "comision", "inicio": inicio,
         "fin": datetime(2026, 9, 3, 12, 0, tzinfo=LIMA), "lugar": "Sala Grau", "modalidad": "presencial",
         "participantes": ["Ana", "Luis"], "descripcion": "Agenda: predictamen sobre infraestructura educativa rural."}
    t = r.agenda(d, datetime(2026, 9, 1, 8, 0, tzinfo=LIMA))
    assert t.startswith("🗓️ *AGENDA — NUEVA ACTIVIDAD*\n\n📌 *Décima Sesión Ordinaria")
    assert "📅 Fecha: Jueves 03/09/2026" in t and "🕒 Hora: 10:00 h – 12:00 h" in t and "📍 Lugar: Sala Grau" in t
    assert "💻 Modalidad: Presencial" in t and "👤 Participa: Ana, Luis" in t and "🔍 DETALLE:" in t
    assert "🚦 PRIORIDAD: 🔴 ALTA" in t
    assert "🟡 MEDIA" in r.agenda(d, datetime(2026, 8, 20, 8, 0, tzinfo=LIMA))
    pleno = r.agenda({**d, "tipo": "pleno", "modalidad": "virtual", "enlace": "https://ejemplo", "lugar": ""}, datetime(2026, 8, 20, tzinfo=LIMA))
    assert pleno.startswith("🏛️ *PLENO — NUEVA SESIÓN*") and "💻 Modalidad: Virtual · https://ejemplo" in pleno
    rec = r.agenda(d, datetime(2026, 9, 3, 9, 30, tzinfo=LIMA), recordatorio=True)
    assert rec.startswith("⏰ *SE ACERCA*") and rec.endswith("⏱️ Empieza en 30 min") and "PRIORIDAD" not in rec


def test_documento_programacion_y_firma():
    t = r.documento({"numero": "OFICIO N°0142-2026-2027", "asunto": "Traslada pedido", "destinatario": "Juan Pérez", "institucion": "MINSA"}, "FIRMADO")
    assert t.startswith("✍️ *DOCUMENTO FIRMADO — LISTO PARA ENVIAR*\n\n📑 *OFICIO N°0142-2026-2027*")
    assert "👤 Para: Juan Pérez — MINSA" in t and t.endswith("📌 Qué sigue: enviarlo y guardar el cargo de recepción.")
    p = r.programacion({"fecha": "2026-10-19", "n": 2, "actividades": [{"hora": "08:30", "titulo": "Pleno", "lugar": "Hemiciclo"},
                                                                       {"hora": "Todo el día", "titulo": "Semana", "lugar": ""}]})
    assert "📅 Lunes 19/10/2026 · 2 actividades" in p and "🕘 *08:30* · Pleno\n      📍 Hemiciclo" in p
    viejo = r.programacion({"fecha": "2026-10-19", "n": 1, "resumen": "09:00 Reunión · Sala"})
    assert "🕘 *09:00* · Reunión · Sala" in viejo
    assert r.firma_de("entrada.registrada") == "Mesa de Partes" and r.firma_de("documento.seguimiento") == "Seguimiento"
    assert r.firma_de("documento.estado") == "Documentos" and r.firma_de("evento.recordatorio") == "Agenda"
    from qillqasqa.servicios.actuaciones import fecha_movimiento   # de Gestión documental desde Qillqasqa Q4a

    assert fecha_movimiento([{"fecha": "2026-09-01", "clase": "envio"}, {"fecha": "2026-09-05", "clase": "derivacion"},
                             {"fecha": "2026-09-09", "clase": "llamada"}]) == "2026-09-05"


def test_la_regla_cambiada_por_quien_administra_manda():
    assert avisos_chat.usa_redaccion(NS(texto="", de_fabrica=""))
    assert avisos_chat.usa_redaccion(NS(texto="Nuevo recibido de {remitente}: «{asunto}» · {atencion} · plazo {plazo}", de_fabrica="canal-recibidos"))
    assert not avisos_chat.usa_redaccion(NS(texto="Llegó: {asunto}", de_fabrica="canal-recibidos"))
    assert not avisos_chat.usa_redaccion(NS(texto="Algo: {asunto}", de_fabrica=""))


def test_temas_propios_con_nombre_del_entorno():
    claves = {t["clave"] for t in chat.temas_propios()}
    assert claves == {"bancada", "grupo-parlamentario", "radio", "denuncias"}
    assert all(c in chat.CATEGORIA_FABRICA for c in claves)
    assert not claves & {c["clave"] for c in chat.FABRICA}


def test_lista_y_avisos_sin_asteriscos_ni_saltos():
    assert chat.texto_llano("📌 *NUEVO DOCUMENTO RECIBIDO*\n\n📄 *OF-1*") == "📌 NUEVO DOCUMENTO RECIBIDO · 📄 OF-1"
    assert chat.vista_previa("2 * 3 = 6") == "2 * 3 = 6"


def test_tarea_creada_y_regla_del_mensaje():
    t = r.tarea({"titulo": "Revisar el oficio", "responsable": "Ana", "vence": datetime(2026, 10, 20, 10, 0, tzinfo=LIMA), "con_hora": True,
                 "prioridad": "alta", "descripcion": "Cotejar con el cargo."}, date(2026, 10, 18), "creada")
    assert t.startswith("📋 *TAREA CREADA*\n\n📌 *Revisar el oficio*")
    assert "⏳ Vence: Martes 20/10/2026 a las 10:00 h (2 días)" in t and "🚦 Prioridad: 🔴 ALTA" in t and t.endswith("- Cotejar con el cargo.")
    assert "Prioridad" not in r.tarea({"titulo": "X", "prioridad": "normal"}, date(2026, 10, 18), "creada")
    assert avisos_chat.regla_del_mensaje(["3:notificar→2", "21:publicar→canal:33:mensaje:812"], 812) == 21
    assert avisos_chat.regla_del_mensaje(["21:publicar→canal:33:mensaje:812"], 813) is None

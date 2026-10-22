"""backend/app/servicios/redaccion_chat.py — lo que el sistema publica en el chat, escrito como lo
escribía una persona del equipo en Telegram (2026-10-18; Edison, con la captura de un «Estado de
expediente»: «que parezca enviado por un humano, ordenado, para que todos entendamos rápido de qué
trata el documento, qué agenda es»).

Rescata los formatos de los prompts que el despacho usaba para Telegram antes del contrato de pegado
(repo de prompts, commit e1d11d0: `prompt-estado-expediente-telegram.md` y
`Prompt_Maestro_Comunicado_Documentos_STD.md`): COMUNICADO (lo que llega a Mesa de Partes), AGENDA
(una actividad) y ESTADO DEL EXPEDIENTE (el seguimiento de un documento propio); los demás avisos
(numerado, firmado, enviado, tareas, prensa…) siguen el mismo estilo. Una línea por dato con su
emoji, el número en *negrita* (la de WhatsApp y Telegram), el asunto literal entre comillas, el
semáforo de prioridad y, donde ayuda, una línea final en lenguaje simple. Lo que no consta no se
escribe: en el chat no hay «NO INDICA».

Dos capas: las funciones puras (`recibido`, `agenda`, `seguimiento`, `documento`…) arman el texto
desde un dict y la fecha de hoy (pruebas en `tests/test_redaccion_chat.py`); `componer` lee la
entidad VIGENTE de la base (el recibido, el evento, el documento) y elige la función. El mismo texto
sirve para el chat y para el puente de Telegram (`eventos_sistema._aplicar`).
"""
from __future__ import annotations

import re
from datetime import date, datetime

DIAS = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")

# Quién «firma» cada aviso en el chat (el nombre sobre la burbuja), por la familia del evento.
FIRMAS = {
    "entrada": "Mesa de Partes", "documento.actuacion": "Seguimiento", "documento.seguimiento": "Seguimiento",
    "documento": "Documentos", "evento": "Agenda", "agenda": "Agenda", "tarea": "Tareas", "prensa": "Prensa",
    "sr": "Semana de representación", "pl": "Proyectos de ley",
}

VIAS = {"std": "STD", "correo": "correo institucional", "mesa_partes": "mesa de partes", "mano": "entregado en mano",
        "mesa_virtual": "mesa de partes virtual"}
ACCION = {"responder": "Responder por escrito.", "agendar": "Agendar la actividad.", "emitir_opinion": "Emitir opinión.",
          "interceder": "Interceder ante la entidad.", "conocimiento": "Ninguna — solo conocimiento."}
# Estado del trámite (seguimiento): semáforo, rótulo y aclaración (la guía del prompt de Telegram).
ESTADO_TRAMITE = {
    "en_tramite": ("🟡", "EN TRÁMITE", "avanzando"),
    "sin_respuesta": ("🔵", "RECIBIDO", "pendiente de atención"),
    "respondido": ("🟢", "RESPONDIDO", "finalizado"),
    "respondido_parcial": ("🟡", "RESPONDIDO EN PARTE", "falta completar"),
    "vencido": ("🔴", "VENCIDO", "fuera de plazo"),
    "archivado": ("⚪", "ARCHIVADO", "finalizado"),
    "desconocido": ("🔵", "POR CONFIRMAR", "sin datos de la entidad"),
}
CABECERA_DOCUMENTO = {
    "numerado": ("🔢", "DOCUMENTO NUMERADO", "firmarlo y enviarlo."),
    "EN_REVISION": ("👀", "DOCUMENTO EN REVISIÓN", "revisarlo y aprobarlo u observarlo."),
    "OBSERVADO": ("⚠️", "DOCUMENTO OBSERVADO", "levantar las observaciones."),
    "APROBADO": ("👍", "DOCUMENTO APROBADO", "firmarlo."),
    "FIRMADO": ("✍️", "DOCUMENTO FIRMADO — LISTO PARA ENVIAR", "enviarlo y guardar el cargo de recepción."),
    "ENVIADO": ("📤", "DOCUMENTO ENVIADO", "hacer el seguimiento hasta la respuesta."),
    "ARCHIVADO": ("🗄️", "DOCUMENTO ARCHIVADO", ""),
}
CLASE_ACTUACION = {"envio": "ENVÍO", "reiteracion": "REITERACIÓN", "llamada": "LLAMADA", "reunion": "REUNIÓN", "respuesta": "RESPUESTA",
                   "compromiso": "COMPROMISO", "derivacion": "DERIVACIÓN", "nota": "NOTA"}


# --- piezas ----------------------------------------------------------------------------------


def firma_de(nombre: str) -> str:
    return FIRMAS.get(nombre) or FIRMAS.get(nombre.split(".", 1)[0], "Sistema")


def _t(d: dict, k: str) -> str:
    v = d.get(k)
    return "" if v is None else str(v).strip()


def _fecha(valor) -> date | None:
    if isinstance(valor, datetime):
        return _local(valor).date()
    if isinstance(valor, date):
        return valor
    texto = str(valor or "").strip()
    try:
        return _local(datetime.fromisoformat(texto.replace("Z", "+00:00"))).date() if "T" in texto else date.fromisoformat(texto[:10])
    except ValueError:
        return None


def _local(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    from zoneinfo import ZoneInfo

    from app.config import config

    return dt.astimezone(ZoneInfo(config.zona_horaria or "America/Lima"))


def _hora(valor) -> datetime | None:
    if isinstance(valor, datetime):
        return _local(valor)
    try:
        return _local(datetime.fromisoformat(str(valor or "").replace("Z", "+00:00")))
    except ValueError:
        return None


def ddmm(valor) -> str:
    """«03/09/2026»; lo que no es fecha, tal cual."""
    f = _fecha(valor)
    return f"{f:%d/%m/%Y}" if f else str(valor or "").strip()


def dia_largo(valor) -> str:
    """«Jueves 03/09/2026»."""
    f = _fecha(valor)
    return f"{DIAS[f.weekday()]} {f:%d/%m/%Y}" if f else str(valor or "").strip()


def dias(n: int) -> str:
    return f"{n} día" if abs(n) == 1 else f"{n} días"


def faltan(fecha, hoy: date) -> str:
    """«(8 días)», «(vence hoy)», «(mañana)», «(vencido hace 3 días)»."""
    f = _fecha(fecha)
    if f is None:
        return ""
    n = (f - hoy).days
    if n < 0:
        return f"(vencido hace {dias(-n)})"
    return "(vence hoy)" if n == 0 else "(mañana)" if n == 1 else f"({dias(n)})"


def literal(asunto: str) -> str:
    """El asunto entre comillas, sin duplicarlas si ya venía citado."""
    a = re.sub(r"\s+", " ", asunto or "").strip().strip('"“”«»').strip()
    return f"\"{a}\"" if a else ""


def vinetas(texto: str, maximo: int = 4) -> list[str]:
    """Un resumen en hasta `maximo` viñetas: por línea o, si viene en un párrafo, por oración."""
    t = (texto or "").strip()
    if not t:
        return []
    partes = [p.strip(" -•·\t") for p in t.splitlines() if p.strip(" -•·\t")]
    if len(partes) == 1:
        partes = [p.strip() for p in re.split(r"(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÑ])", partes[0]) if p.strip()]
    return [f"- {p}" for p in partes[:maximo]]


def prioridad(dias_restantes: int | None, accion: bool, agenda: bool = False) -> str:
    """Semáforo del prompt de comunicados: vencido o ≤ 3 días = ALTA; con acción = MEDIA; sin acción =
    INFORMATIVO (no existe en agenda)."""
    if dias_restantes is not None and dias_restantes < 0:
        return "🔴 ALTA — ACTIVIDAD YA REALIZADA" if agenda else f"🔴 ALTA — PLAZO VENCIDO ({dias(-dias_restantes)})"
    if dias_restantes is not None and dias_restantes <= 3 and (accion or agenda):
        return "🔴 ALTA"
    if accion or agenda:
        return "🟡 MEDIA"
    return "🟢 INFORMATIVO"


def armar(*bloques: list[str] | str) -> str:
    """Une los bloques con una línea en blanco entre ellos; cada bloque es una línea o una lista de
    líneas, y lo vacío se cae (no quedan líneas en blanco dobles)."""
    salida = []
    for b in bloques:
        lineas = [b] if isinstance(b, str) else list(b)
        lineas = [x for x in lineas if x and x.strip()]
        if lineas:
            salida.append("\n".join(lineas))
    return "\n\n".join(salida)


def _si(etiqueta: str, valor: str) -> str:
    return f"{etiqueta}{valor}" if valor else ""


# --- formatos ----------------------------------------------------------------------------------


def recibido(d: dict, hoy: date, que: str = "registrada") -> str:
    """COMUNICADO: lo que llega a Mesa de Partes (también la subsanación, la asignación, el vencimiento
    y la respuesta del mismo recibido)."""
    cabecera = {
        "registrada": "📌 *NUEVO DOCUMENTO RECIBIDO*", "subsanada": "📌 *SUBSANACIÓN RECIBIDA*", "asignada": "👤 *RECIBIDO ASIGNADO*",
        "vencida": "⏰ *VENCIÓ EL PLAZO SIN RESPUESTA*", "respondida": "✅ *RECIBIDO RESPONDIDO*",
    }.get(que, "📌 *DOCUMENTO RECIBIDO*")
    documento = _t(d, "documento") or _t(d, "clase").replace("_", " ").upper()
    remitente = " — ".join(x for x in (_t(d, "remitente"), _t(d, "remitente_cargo")) if x)
    via = VIAS.get(_t(d, "via"), "")
    recibido_el = ddmm(d.get("fecha_recepcion")) + (f" ({via})" if via and d.get("fecha_recepcion") else "")
    datos = [
        _si("📄 ", f"*{documento}*" if documento else ""),
        _si("🏛️ Remitente: ", remitente),
        _si("📅 Fecha del documento: ", ddmm(d.get("fecha_documento"))),
        _si("📥 Recibido: ", recibido_el.strip()),
        _si("🔖 Registro STD: N.° ", _t(d, "std_numero")),
        _si("🗂️ Expediente: ", _t(d, "expediente")),
    ]
    asunto = ["📝 ASUNTO:", literal(_t(d, "asunto"))] if _t(d, "asunto") else []
    contenido = vinetas(_t(d, "resumen"))
    contenido = ["🔍 CONTENIDO:", *contenido] if contenido and que in ("registrada", "subsanada") else []
    if que == "respondida":
        cierre = [_si("📤 Respondido con: ", f"*{_t(d, 'respuesta')}*" if _t(d, "respuesta") else ""), _si("👤 Responsable: ", _t(d, "responsable"))]
        return armar(cabecera, datos, asunto, cierre)
    atencion = _t(d, "atencion")
    con_accion = atencion not in ("", "conocimiento")
    plazo = _fecha(d.get("plazo"))
    restantes = (plazo - hoy).days if plazo else None
    cierre = [
        _si("✅ ACCIÓN REQUERIDA: ", ACCION.get(atencion, atencion.replace("_", " ").capitalize() + "." if atencion else "")),
        _si("👤 Responsable: ", _t(d, "responsable")),
        f"⏳ PLAZO: {ddmm(plazo)} {faltan(plazo, hoy)}".strip() if plazo else ("⏳ PLAZO: sin plazo explícito" if con_accion else ""),
        f"🚦 PRIORIDAD: {prioridad(restantes, con_accion)}",
    ]
    if d.get("fuera_de_plazo"):
        cierre.insert(0, "⚠️ Llegó fuera del plazo de subsanación.")
    return armar(cabecera, datos, asunto, contenido, cierre)



def _zona():
    """La hora de aquí (ZONA_HORARIA de la plataforma)."""
    from zoneinfo import ZoneInfo

    from app.config import config

    try:
        return ZoneInfo(config.zona_horaria)
    except Exception:  # noqa: BLE001
        return ZoneInfo("UTC")

def agenda(d: dict, ahora: datetime, recordatorio: bool = False) -> str:
    """AGENDA: una actividad, con el cuándo y el dónde primero (es lo que el grupo busca)."""
    from tiqsi.modulo import opcional

    agenda_v1 = opcional("agenda.v1")   # los catálogos de Tareas y Agenda (fase 10.2b)
    TIPOS = agenda_v1.tipos() if agenda_v1 is not None else {}
    MODALIDADES = agenda_v1.modalidades() if agenda_v1 is not None else {}

    inicio, fin = _hora(d.get("inicio")), _hora(d.get("fin"))
    hoy = _local(ahora).date() if ahora.tzinfo else ahora.date()
    todo = bool(d.get("todo_el_dia")) or inicio is None
    if todo:
        hora = "Todo el día"
    else:
        hora = f"{inicio:%H:%M} h" + (f" – {fin:%H:%M} h" if fin and fin.date() == inicio.date() and fin > inicio else "")
    tipo = _t(d, "tipo")
    if recordatorio:
        cabecera = "⏰ *SE ACERCA*"
    elif tipo == "pleno":
        cabecera = "🏛️ *PLENO — NUEVA SESIÓN*"
    else:
        cabecera = "🗓️ *AGENDA — NUEVA ACTIVIDAD*"
    modalidad = MODALIDADES.get(_t(d, "modalidad"), _t(d, "modalidad").capitalize())
    if modalidad and _t(d, "enlace") and _t(d, "modalidad") != "presencial":
        modalidad += f" · {_t(d, 'enlace')}"
    participantes = ", ".join(str(p) for p in (d.get("participantes") or []) if p)
    datos = [
        f"📌 *{_t(d, 'titulo')}*",
        _si("🏷️ ", TIPOS.get(tipo, "") if tipo not in ("", "otro") else ""),
        _si("📅 Fecha: ", dia_largo(inicio or d.get("inicio"))),
        f"🕒 Hora: {hora}",
        _si("📍 Lugar: ", _t(d, "lugar")),
        _si("💻 Modalidad: ", modalidad if _t(d, "modalidad") != "presencial" or _t(d, "lugar") else ""),
        _si("👤 Participa: ", participantes),
        _si("🙋 Responsable: ", _t(d, "responsable")),
    ]
    detalle = vinetas(_t(d, "descripcion"))
    detalle = ["🔍 DETALLE:", *detalle] if detalle and not recordatorio else []
    if recordatorio:
        cierre = [_cuando(inicio, ahora) if inicio and not todo else ""]
    else:
        restantes = ((inicio.date() if inicio else _fecha(d.get("inicio")) or hoy) - hoy).days
        cierre = [f"🚦 PRIORIDAD: {prioridad(restantes, True, agenda=True)}"]
    if _t(d, "estado") in ("suspendido", "cancelado"):
        cierre.insert(0, f"⚠️ {_t(d, 'estado').upper()}")
    return armar(cabecera, datos, detalle, cierre)


def _cuando(inicio: datetime, ahora: datetime) -> str:
    """«⏱️ Empieza en 30 min», «⏱️ Empieza en 2 h», «⏱️ Empieza mañana a las 09:00 h»."""
    ahora = _local(ahora) if ahora.tzinfo else ahora
    minutos = int(((inicio if ahora.tzinfo else inicio.replace(tzinfo=None)) - ahora).total_seconds() // 60)
    if minutos < 0:
        return "⏱️ Ya empezó"
    if minutos < 60:
        return f"⏱️ Empieza en {minutos} min"
    if inicio.date() == ahora.date():
        return f"⏱️ Empieza en {minutos // 60} h" + (f" {minutos % 60} min" if minutos % 60 else "")
    return f"⏱️ Empieza el {dia_largo(inicio).split(' ')[0].lower()} a las {inicio:%H:%M} h"


def seguimiento(d: dict, hoy: date) -> str:
    """ESTADO DEL EXPEDIENTE: dónde está un documento propio, quién lo tiene, desde cuándo, el plazo
    legal, qué falta, si terminó y una línea en lenguaje simple (el formato de la captura)."""
    estado = _t(d, "estado_propuesto") or "desconocido"
    semaforo, rotulo, aclaracion = ESTADO_TRAMITE.get(estado, ESTADO_TRAMITE["desconocido"])
    terminado = estado in ("respondido", "archivado")
    plazo = d.get("plazo_legal") or {}
    vence = _fecha(plazo.get("vence")) if isinstance(plazo, dict) else None
    fuera = bool(vence and vence < hoy and not terminado)
    if fuera and semaforo != "🔴":
        semaforo, aclaracion = "🔴", "fuera de plazo"
    ultima = _fecha(d.get("ultima_fecha"))
    quieto = (hoy - ultima).days if ultima else None
    ubicacion = _t(d, "ubicacion")

    expediente = _t(d, "expediente_entidad")
    destino = _t(d, "destino")
    titulo = f"📄 Expediente N° {expediente}" + (f" ({destino})" if destino else "") if expediente else "📄 *ESTADO DEL DOCUMENTO*" + (f" ({destino})" if destino else "")
    cabeza = [
        titulo,
        _si("📑 ", f"*{_t(d, 'numero')}*" if _t(d, "numero") else ""),
        _si("📝 Asunto: ", literal(_t(d, "asunto"))),
        f"{semaforo} Estado: {rotulo} ({aclaracion})",
    ]
    if isinstance(plazo, dict) and plazo.get("dias"):
        norma = ", ".join(x for x in (str(plazo.get("norma") or ""), f"art. {plazo['articulo']}" if plazo.get("articulo") else "") if x)
        marca = "no indicado" if not vence else ("FUERA DE PLAZO (vencido)" if fuera else ("cumplido" if terminado else "DENTRO DE PLAZO"))
        plazo_txt = f"{dias(int(plazo['dias']))} hábiles" + (f" ({norma})" if norma else "") + (f" → vence {ddmm(vence)} · {marca}" if vence else "")
    else:
        plazo_txt = "no indicado"
    lugar = [
        f"📍 Ubicación: {ubicacion or 'no indicada'}",
        f"👤 Responsable: {_t(d, 'responsable_entidad') or 'no indicado'}",
        f"📅 Recibido: {ddmm(ultima)} · ⏱️ {dias(quieto)} sin movimiento" if ultima else "",
        f"⚖️ Plazo legal: {plazo_txt}",
    ]
    pendientes = [str(p).strip() for p in (d.get("pendientes") or []) if str(p).strip()]
    if terminado:
        fin = "SÍ — la entidad respondió" if estado == "respondido" else "SÍ — quedó archivado"
    elif estado == "respondido_parcial":
        fin = "NO — la respuesta es parcial"
    elif quieto == 0 and ubicacion:
        fin = "NO — acaba de llegar a la unidad que debe atenderlo"
    elif ubicacion:
        fin = "NO — sigue en la unidad, sin respuesta emitida"
    else:
        fin = "NO — sin respuesta todavía"
    resumen = _t(d, "resumen") or _resumen_simple(estado, fuera, ubicacion, quieto)
    falta = [
        f"📌 Qué falta: {pendientes[0]}" if pendientes else "",
        *[f"   • {p}" for p in pendientes[1:3]],
        f"✅ ¿Terminado?: {fin}",
    ]
    return armar(cabeza, lugar, falta, f"🔎 En resumen: {resumen}")


def _resumen_simple(estado: str, fuera: bool, ubicacion: str, quieto: int | None) -> str:
    if estado == "respondido":
        return "la entidad ya respondió; queda cotejar que conteste todo lo pedido."
    if estado == "archivado":
        return "el trámite se cerró en la entidad."
    if fuera or estado == "vencido":
        return "venció el plazo y no hay respuesta: toca reiterar."
    if ubicacion and quieto == 0:
        return f"el documento ya está en {ubicacion}, que debe preparar la respuesta; llegó hoy."
    if ubicacion and quieto:
        return f"el documento está en {ubicacion} hace {dias(quieto)}, a la espera de respuesta."
    return "seguimos a la espera de noticias de la entidad."


def documento(d: dict, que: str) -> str:
    """Un documento propio: numerado, en revisión, observado, firmado, enviado…"""
    emoji, rotulo, sigue = CABECERA_DOCUMENTO.get(que, ("🔄", f"DOCUMENTO {que.replace('_', ' ')}".upper(), ""))
    institucion = _t(d, "institucion") if _t(d, "institucion") not in _t(d, "destinatario") else ""
    para = " — ".join(x for x in (_t(d, "destinatario"), institucion) if x)
    datos = [
        _si("📑 ", f"*{_t(d, 'numero')}*" if _t(d, "numero") else ""),
        _si("📝 Asunto: ", literal(_t(d, "asunto"))),
        _si("👤 Para: ", para),
        _si("🗂️ Expediente en la entidad: ", _t(d, "expediente_entidad") if que == "ENVIADO" else ""),
        _si("🙋 Responsable: ", _t(d, "responsable")),
    ]
    return armar(f"{emoji} *{rotulo}*", datos, _si("📌 Qué sigue: ", sigue))


def actuacion(d: dict) -> str:
    """Una actuación anotada a mano en el seguimiento (una llamada, una reiteración, una reunión)."""
    clase = CLASE_ACTUACION.get(_t(d, "clase"), _t(d, "clase").upper())
    return armar(
        f"🧭 *SEGUIMIENTO — {clase}*" if clase else "🧭 *SEGUIMIENTO*",
        [_si("📑 ", f"*{_t(d, 'numero')}*" if _t(d, "numero") else ""), _si("📝 Asunto: ", literal(_t(d, "asunto")))],
        [_si("📅 ", ddmm(d.get("fecha"))), _si("💬 ", _t(d, "texto")), _si("🔖 Fuente: ", _t(d, "fuente"))],
    )


def programacion(d: dict) -> str:
    """La programación del día: la fecha y una entrada por actividad (hora en negrita, lugar debajo)."""
    n = int(d.get("n") or 0)
    filas: list[str] = []
    for a in d.get("actividades") or []:
        filas.append(f"🕘 *{a.get('hora') or 'Todo el día'}* · {a.get('titulo') or ''}".rstrip(" ·"))
        if a.get("lugar"):
            filas.append(f"      📍 {a['lugar']}")
    if not filas:  # un evento viejo, solo con el resumen de una línea por actividad
        for ln in str(d.get("resumen") or "").splitlines():
            m = re.match(r"^(\d{1,2}:\d{2}|Todo el día)\s+(.*)$", ln.strip())
            filas.append(f"🕘 *{m.group(1)}* · {m.group(2)}" if m else f"▫️ {ln.strip()}")
    return armar("🗓️ *PROGRAMACIÓN DEL DÍA*", f"📅 {dia_largo(d.get('fecha'))}" + (f" · {n} actividad{'es' if n != 1 else ''}" if n else ""), filas)


def tarea(d: dict, hoy: date, que: str = "asignada") -> str:
    """Una tarea creada en el chat, asignada o vencida."""
    vence = _fecha(d.get("vence"))
    hora = _hora(d.get("vence")) if d.get("con_hora") else None
    cuando = f"{dia_largo(vence)}" + (f" a las {hora:%H:%M} h" if hora else "") if vence else ""
    prioridad_txt = {"alta": "🔴 ALTA", "urgente": "🔴 URGENTE", "baja": "🟢 BAJA"}.get(_t(d, "prioridad"), "")
    return armar(
        {"vencida": "⏰ *VENCIÓ UNA TAREA*", "creada": "📋 *TAREA CREADA*"}.get(que, "📋 *TAREA ASIGNADA*"),
        [f"📌 *{_t(d, 'titulo')}*", _si("🙋 Responsable: ", _t(d, "responsable")),
         f"⏳ Vence: {cuando} {faltan(vence, hoy)}".strip() if vence else "", _si("🚦 Prioridad: ", prioridad_txt)],
        vinetas(_t(d, "descripcion"), 3),
    )


def prensa(d: dict) -> str:
    clase = _t(d, "clase")
    noticia = clase.startswith("noticia")
    return armar(
        "📰 *NOTICIA*" if noticia else "📰 *PIEZA DE PRENSA*",
        [f"📌 *{_t(d, 'titular')}*", _si("🏷️ ", clase.replace("_", " ").capitalize()), _si("🗞️ Fuente: ", _t(d, "fuente")),
         _si("💡 Sugerido: ", _t(d, "accion_sugerida"))],
    )


def representacion(d: dict, que: str) -> str:
    if que == "sr.pedido_derivado":
        return armar("🤝 *SEMANA DE REPRESENTACIÓN — PEDIDO DERIVADO*",
                     [_si("📌 Pedido ", f"{_t(d, 'codigo')}: {_t(d, 'pedido')}".strip(": ")), _si("📑 Oficio: ", f"*{_t(d, 'numero')}*" if _t(d, "numero") else "")])
    return armar("🤝 *SEMANA DE REPRESENTACIÓN — ACTIVIDAD*",
                 [f"📌 *{_t(d, 'titulo')}*", _si("📍 ", _t(d, "distrito")), _si("📅 ", dia_largo(d.get("fecha")) if d.get("fecha") else "")])


def proyecto(d: dict) -> str:
    return armar("⚖️ *PROYECTO DE LEY*", [f"📌 *{_t(d, 'proyecto')}*", _si("🧩 Parte: ", _t(d, "parte")), _si("🔄 Estado: ", _t(d, "estado").lower())])


# --- con la base -----------------------------------------------------------------------------------


def _id(entidad: str, prefijo: str) -> int | None:
    m = re.match(rf"^{prefijo}:(\d+)$", entidad or "")
    return int(m.group(1)) if m else None


async def _nombre(sesion, usuario_id) -> str:
    from app.modelos import Usuario

    if not usuario_id:
        return ""
    u = await sesion.get(Usuario, int(usuario_id))
    return (u.nombre_completo or u.nombre_usuario) if u else ""


async def _datos_documento(sesion, doc_id: int | None) -> dict:
    """Lo vigente del documento, por «documentos.v1» (Gestión documental; Qillqasqa Q4a): se compone después del commit
    de quien lo cambió (sus hechos llegan por su bandeja), así que lo guardado ya es lo vigente."""
    from tiqsi.modulo import opcional

    documentos = opcional("documentos.v1") if doc_id else None
    d = (await documentos.descripciones([doc_id])).get(int(doc_id)) if documentos is not None else None
    if d is None:
        return {}
    return {"numero": d["mostrado"], "asunto": d["asunto"], "destinatario": d["destinatario"], "institucion": d["institucion"],
            "expediente_entidad": d["expediente_entidad"], "responsable": await _nombre(sesion, d["responsable_id"])}


async def componer(sesion, nombre: str, entidad: str, datos: dict | None, ahora: datetime | None = None) -> str:
    """El texto «humano» del evento, con la entidad vigente; "" si el evento no tiene formato propio
    (quien llama usa entonces la plantilla de la regla)."""
    d = dict(datos or {})
    ahora = (ahora or datetime.now(_zona())).astimezone(_zona())
    hoy = ahora.date()
    familia = nombre.split(".", 1)[0]
    if familia == "entrada":
        from tiqsi.modulo import opcional

        # Lo recibido es de la Mesa de Partes: por «recibidos.v1» (Punku P2).
        eid, recibidos = _id(entidad, "entrada"), opcional("recibidos.v1")
        e = (await recibidos.fichas([eid])).get(eid) if eid and recibidos is not None else None
        if e is not None:
            d.update({k: e[k] for k in ("documento", "clase", "remitente", "remitente_cargo", "fecha_documento", "fecha_recepcion",
                                        "via", "std_numero", "resumen", "atencion", "plazo")})
            d.update({"asunto": e["asunto"] or e["documento"], "responsable": await _nombre(sesion, e["responsable_id"])})
            if e["respuesta_documento_id"]:
                d["respuesta"] = (await _datos_documento(sesion, e["respuesta_documento_id"])).get("numero", "")
        return recibido(d, hoy, nombre.split(".", 1)[1])
    if nombre in ("documento.numerado", "documento.estado"):
        d.update({k: v for k, v in (await _datos_documento(sesion, _id(entidad, "doc"))).items() if v})
        return documento(d, "numerado" if nombre == "documento.numerado" else _t(d, "estado").upper())
    if nombre == "documento.actuacion":
        doc = await _datos_documento(sesion, _id(entidad, "doc"))
        d.update({"numero": doc.get("numero") or ("" if str(d.get("numero", "")).startswith(("doc:", "entrada:")) else d.get("numero")), "asunto": doc.get("asunto", "")})
        return actuacion(d)
    if nombre == "documento.seguimiento":
        doc = await _datos_documento(sesion, _id(entidad, "doc"))
        d.setdefault("destino", doc.get("institucion") or doc.get("destinatario") or "")
        d["numero"] = d.get("numero") or doc.get("numero", "")
        d["asunto"] = d.get("asunto") or doc.get("asunto", "")
        return seguimiento(d, hoy)
    if nombre in ("evento.creado", "evento.recordatorio"):
        from tiqsi.modulo import opcional

        evid = _id(entidad, "evento")
        agenda_v1 = opcional("agenda.v1")   # el evento, de Tareas y Agenda por su contrato (fase 10.2b)
        e = await agenda_v1.evento(evid) if evid and agenda_v1 is not None else None
        if e is not None:
            participantes = []
            for p in e["participantes"]:
                participantes.append(p["nombre"] or await _nombre(sesion, p["usuario_id"]))
            d.update({"titulo": e["titulo"], "tipo": e["tipo"], "inicio": e["inicio"], "fin": e["fin"], "todo_el_dia": e["todo_el_dia"],
                      "lugar": e["lugar"], "modalidad": e["modalidad"], "enlace": e["enlace"], "descripcion": e["descripcion"],
                      "estado": e["estado"], "participantes": [x for x in participantes if x],
                      "responsable": await _nombre(sesion, e["responsable_id"])})
        return agenda(d, ahora, recordatorio=nombre == "evento.recordatorio")
    if nombre == "agenda.programacion_diaria":
        return programacion(d)
    if nombre in ("tarea.asignada", "tarea.vencida"):
        d["responsable"] = await _nombre(sesion, d.get("responsable_id"))
        return tarea(d, hoy, "vencida" if nombre == "tarea.vencida" else "asignada")
    if nombre == "prensa.pieza_registrada":
        return prensa(d)
    if nombre in ("sr.pedido_derivado", "sr.actividad_registrada"):
        return representacion(d, nombre)
    if nombre == "pl.parte_estado":
        return proyecto(d)
    return ""


async def anuncio(sesion, entidad: str, ahora: datetime | None = None) -> str:
    """Lo que alguien creó desde el chat y deja anunciado (`POST /canales/{id}/anunciar`): la tarea
    («TAREA CREADA») o la actividad (el formato de la agenda), con lo que está en la base."""
    from tiqsi.modulo import opcional

    ahora = (ahora or datetime.now(_zona())).astimezone(_zona())
    tid = _id(entidad, "tarea")
    if tid:
        tareas_v1 = opcional("tareas.v1")   # la tarea, de Tareas y Agenda por su contrato (fase 10.2b)
        t = await tareas_v1.tarea(tid) if tareas_v1 is not None else None
        if t is None:
            return ""
        return tarea({"titulo": t["titulo"], "responsable": await _nombre(sesion, t["responsable_id"]), "vence": t["vence_en"],
                      "con_hora": t["con_hora"], "prioridad": t["prioridad"],
                      "descripcion": t["descripcion"] if t["origen"] not in ("regla", "pegado") else ""}, ahora.date(), "creada")
    if _id(entidad, "evento"):
        return await componer(sesion, "evento.creado", entidad, {}, ahora)
    return ""


def firma_de_entidad(entidad: str) -> str:
    return "Tareas" if entidad.startswith("tarea:") else "Agenda"

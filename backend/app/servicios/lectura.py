"""Lo que Qillqa lee de un documento por su texto (fase 10.2b, Punku P2, 2026-10-20): normalizar y comparar textos, la
fecha, el asunto y la referencia rotulados, y el remitente cruzado con el directorio (institución por su nombre o
sus siglas, persona por su firma), y el mensaje de recepción con rótulos (📌/🗓️, `leer_resumen`). Lo usan la
importación de un Word, la mesa de partes del destinatario, las actuaciones, el seguimiento, la Semana de
representación, las reglas y el pegado.

Nació en la Mesa de Partes (`servicios/entradas.py`), que lo sigue usando para lo que recibe; desde que ella es un
proyecto aparte (Punku), cada uno tiene su copia y tests/test_fronteras.py comprueba que las dos lean IGUAL.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime


def hoy_local() -> str:
    """AAAA-MM-DD de hoy en la zona de la entidad (ZONA_HORARIA); la del servidor si la zona no se conoce."""
    from zoneinfo import ZoneInfo

    from app.config import config

    try:
        return datetime.now(ZoneInfo(config.zona_horaria)).date().isoformat()
    except Exception:  # zona desconocida: la del servidor
        return date.today().isoformat()


def normalizar(texto: str) -> str:
    """minúsculas, sin tildes ni signos, espacios simples."""
    t = unicodedata.normalize("NFKD", (texto or "").replace("º", "°")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


def _espacios(texto: str) -> str:
    return re.sub(r"\s+", " ", texto or "").strip()


MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "setiembre": 9, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


_RE_FECHA_LARGA = re.compile(
    r"\b(\d{1,2})\s*(?:de\s+)?(" + "|".join(MESES) + r")\s+(?:de[l]?\s+)?(\d{4})\b", re.I
)


_RE_FECHA_CORTA = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b")


_RE_FECHA_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


def _fecha_valida(a: int, m: int, d: int) -> str:
    try:
        f = date(a, m, d)
    except ValueError:
        return ""
    return f.isoformat() if 2000 <= a <= 2100 else ""


def extraer_fecha(texto: str) -> str:
    """Fecha del documento (AAAA-MM-DD): la escrita «3 de octubre de 2026» (la del
    encabezado, «Lima, 3 de octubre de 2026») antes que la numérica «03/10/2026», que
    suele ser un sello de recepción. Solo se mira el principio del documento."""
    cabeza = unicodedata.normalize("NFC", (texto or "")[:4000])
    for m in _RE_FECHA_LARGA.finditer(cabeza):
        f = _fecha_valida(int(m.group(3)), MESES[m.group(2).lower()], int(m.group(1)))
        if f:
            return f
    for m in _RE_FECHA_CORTA.finditer(cabeza):
        f = _fecha_valida(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        if f:
            return f
    for m in _RE_FECHA_ISO.finditer(cabeza):
        f = _fecha_valida(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if f:
            return f
    return ""


# Rótulos que cortan un campo de varias líneas (el asunto acaba donde empieza la referencia).
_RE_ROTULO = re.compile(
    r"^\s*(asunto|referencia|ref\b|ref\.|se[nñ]or|se[nñ]ora|se[nñ]ores|de\s*:|para\s*:|fecha\s*:|anexo|adj|"
    r"presente|me\s+dirijo|tengo\s+el\s+agrado|es\s+grato|por\s+medio|mediante\s+el\s+presente|de\s+mi\s+consideraci)",
    re.I,
)


def _campo_rotulado(texto: str, rotulo: str, maximo: int = 600) -> str:
    """El valor de un rótulo «ASUNTO : …» y sus líneas de continuación (hasta una línea
    en blanco, otro rótulo o tres líneas)."""
    lineas = (texto or "").splitlines()
    # El rótulo puede no abrir la línea: pdftotext pega «Presente.- ASUNTO: …» en una sola
    # («Presente.ASUNTO: Solicito…»); se admite tras un signo de cierre (auditoría 2026-10-10, RC-01).
    patron = re.compile(rf"^(?:\s*|.*?[.\-–:;]\s*)(?:{rotulo})\s*[:.\-–]?\s*(.*)$", re.I)
    for i, linea in enumerate(lineas):
        m = patron.match(linea)
        if not m:
            continue
        partes = [m.group(1).strip()]
        for sig in lineas[i + 1:i + 4]:
            if not sig.strip() or _RE_ROTULO.match(sig):
                break
            partes.append(sig.strip())
        valor = _espacios(" ".join(p for p in partes if p)).strip(" :.-–")
        if valor:
            return valor[:maximo]
    return ""


def extraer_asunto(texto: str) -> str:
    return _campo_rotulado(texto, r"asunto")


def extraer_referencia(texto: str) -> str:
    return _campo_rotulado(texto, r"referencia|ref\.?", maximo=400)


_CLASES_DOC = (
    ("oficio", r"oficio(?:\s+m[uú]ltiple|\s+circular)?"),
    ("carta", r"carta(?:\s+notarial|\s+m[uú]ltiple)?"),
    ("informe", r"informe(?:\s+t[eé]cnico|\s+legal)?"),
    ("solicitud", r"solicitud"),
    ("invitacion", r"invitaci[oó]n"),
    ("citacion", r"citaci[oó]n"),
    ("otro", r"memorando(?:\s+m[uú]ltiple)?|memor[aá]ndum|resoluci[oó]n(?:\s+\w+)?|acuerdo\s+de\s+concejo|esquela"),
)


_RE_DOCUMENTO = re.compile(
    r"^\s*(" + "|".join(p for _, p in _CLASES_DOC) + r")\s*(?:N\s*[.°º]*\s*|Nro\.?\s*|n[uú]mero\s*)?[:\s]*"
    r"(\d[\w\-./° ]{0,70})",
    re.I,
)


def extraer_documento(texto: str) -> tuple[str, str]:
    """(«Oficio N° 0456-2026-UGEL-H/D», «oficio»): la primera línea del encabezado que
    nombra un tipo documental con su número. ('', '') si no hay."""
    for linea in (texto or "").splitlines()[:40]:
        m = _RE_DOCUMENTO.match(linea)
        if not m:
            continue
        tipo = _espacios(m.group(1))
        numero = _espacios(m.group(2)).rstrip(" .-")
        clase = next((c for c, p in _CLASES_DOC if re.fullmatch(p, tipo, re.I)), "otro")
        return f"{tipo[:1].upper()}{tipo[1:].lower()} N° {numero}"[:300], clase
    return "", ""


def clase_de(texto: str, documento_clase: str = "") -> str:
    """oficio | carta | solicitud | invitacion | citacion | informe | otro."""
    n = normalizar((texto or "")[:3000])
    if re.search(r"\b(citacion|cita a (la )?sesion|convoca a (la )?sesion)\b", n):
        return "citacion"
    if re.search(r"\b(invitacion|invitarle|invitarlo|invitarla|invitamos|le invita|cordialmente invita)\b", n):
        return "invitacion"
    if documento_clase:
        return documento_clase
    if re.search(r"\bsolicito\b|\bsolicitud\b", n):
        return "solicitud"
    return "otro"


# Remitentes que no están en el directorio: la línea del membrete que nombra una organización.
_RE_ORGANIZACION = re.compile(
    r"\b(SINDICATO|FEDERACI[OÓ]N|CONFEDERACI[OÓ]N|ASOCIACI[OÓ]N|MUNICIPALIDAD|GOBIERNO\s+REGIONAL|UNIVERSIDAD|"
    r"COLEGIO|FRENTE|COMUNIDAD|DIRECCI[OÓ]N|UGEL|MINISTERIO|INSTITUTO|C[AÁ]MARA|CENTRAL|COMIT[EÉ]|RONDAS?|"
    r"COOPERATIVA|GREMIO|JUNTA|CONSEJO|ORGANIZACI[OÓ]N|PARROQUIA|RED\s+DE)\b",
    re.I,
)


@dataclass
class Remitente:
    texto: str = ""
    persona_id: int | None = None
    institucion_id: int | None = None
    cargo: str = ""
    motivo: str = ""


def _con_bordes(t: str) -> str:
    return f" {t} "


def cruzar_remitente(
    texto: str,
    instituciones: list[tuple[int, str, str]],
    personas: list[tuple[int, str, int | None, str]],
) -> Remitente:
    """Remitente del documento cruzado con el directorio. Se mira el MEMBRETE (primeras
    líneas) y la FIRMA (últimas): una persona del directorio cuyo nombre completo
    aparece allí (gana la de nombre más largo) y una institución cuyo nombre (o siglas
    de 4 letras o más) aparece en el membrete. Sin coincidencia, la línea del membrete
    que nombra una organización, como texto libre.

    `instituciones`: (id, nombre, siglas); `personas`: (id, nombre, institucion_id, cargo)."""
    lineas = [ln for ln in (texto or "").splitlines() if ln.strip()]
    cabeza = "\n".join(lineas[:25])
    firma = "\n".join(lineas[-25:])
    zona = _con_bordes(normalizar(cabeza + "\n" + firma))
    zona_cabeza = _con_bordes(normalizar(cabeza))
    r = Remitente()

    mejor_p: tuple[int, int, str, int | None, str] | None = None
    for pid, nombre, inst_id, cargo in personas:
        n = normalizar(nombre)
        if len(n.split()) < 3:
            continue  # «Juan Pérez» aparece en cualquier parte: hacen falta nombre y dos apellidos
        if _con_bordes(n) in zona and (mejor_p is None or len(n) > mejor_p[0]):
            mejor_p = (len(n), pid, nombre, inst_id, cargo)
    mejor_i: tuple[int, int, str] | None = None
    for iid, nombre, siglas in instituciones:
        n = normalizar(nombre)
        if len(n) >= 12 and len(n.split()) >= 2 and _con_bordes(n) in zona_cabeza:
            if mejor_i is None or len(n) > mejor_i[0]:
                mejor_i = (len(n), iid, nombre)
    if mejor_i is None:
        for iid, nombre, siglas in instituciones:
            s = normalizar(siglas)
            if len(s) >= 4 and " " not in s and _con_bordes(s) in zona_cabeza:
                if mejor_i is None or len(s) > mejor_i[0]:
                    mejor_i = (len(s), iid, nombre)

    if mejor_p is not None:
        _, r.persona_id, r.texto, inst_id, r.cargo = mejor_p
        r.institucion_id = mejor_i[1] if mejor_i else inst_id
        r.motivo = "persona del directorio en el membrete o la firma"
        return r
    if mejor_i is not None:
        r.institucion_id, r.texto = mejor_i[1], mejor_i[2]
        r.motivo = "institución del directorio en el membrete"
        return r
    for linea in lineas[:12]:
        if _RE_ORGANIZACION.search(linea) and not _RE_DOCUMENTO.match(linea) and len(linea.strip()) <= 160:
            r.texto = _espacios(linea).strip(" «»\"'")
            r.motivo = "membrete (no está en el directorio)"
            return r
    return r


def similitud(a: str, b: str) -> float:
    """Jaccard de palabras significativas (≥ 4 letras): 1 = mismo asunto."""
    pa = {p for p in normalizar(a).split() if len(p) >= 4}
    pb = {p for p in normalizar(b).split() if len(p) >= 4}
    if not pa or not pb:
        return 0.0
    return len(pa & pb) / len(pa | pb)


_RE_ADORNO = re.compile(r"^[^\w«\"“”(¡¿\-]+")


_ROTULOS_RESUMEN = (
    "fecha del documento", "registro std", "dirigido a", "remitente", "convoca", "recibido", "participa",
    "asunto", "contenido", "detalle", "informaci[oó]n solicitada", "norma o dispositivo",
    "acci[oó]n requerida", "acci[oó]n previa", "plazo", "prioridad", "confirmaci[oó]n",
    "fecha", "hora", "lugar", "modalidad", "documento",
)


_RE_ROTULO_RESUMEN = re.compile(r"^(" + "|".join(_ROTULOS_RESUMEN) + r")\s*:\s*(.*)$", re.I)


_LISTAS_RESUMEN = ("contenido", "detalle", "informacion solicitada")


_RE_FECHA_DMA = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")


_RE_HORA = re.compile(r"\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:h\b|hrs?\b|horas\b)?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?", re.I)


def _valor(v: str) -> str:
    """El valor de un campo sin comillas; «NO INDICA» es vacío."""
    v = _espacios(v or "").strip(" \"'«»“”")
    return "" if normalizar(v).startswith("no indica") else v


def _fecha_dma(v: str) -> str:
    m = _RE_FECHA_DMA.search(v or "")
    return _fecha_valida(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else ""


def _hora(v: str) -> str:
    """«15:00 h» → «15:00»; «6:30 p. m.» → «18:30». Vacío si no consta."""
    v = _valor(v)
    m = _RE_HORA.search(v) if v else None
    if not m:
        return ""
    h, mi = int(m.group(1)), int(m.group(2) or 0)
    sufijo = (m.group(3) or "").replace(" ", "").replace(".", "").lower()
    if sufijo == "pm" and h < 12:
        h += 12
    elif sufijo == "am" and h == 12:
        h = 0
    return f"{h:02d}:{mi:02d}" if h < 24 and mi < 60 else ""


def _registro_std(v: str) -> str:
    """«N.° 0002420835» → «2420835»; un número que no es del STD (una proposición, un
    código raro) queda vacío."""
    m = re.match(r"^(?:N\s*[.°º]*\s*)?0*(\d{4,})\b", _valor(v), re.I)
    return m.group(1)[:20] if m else ""


def _via_de(v: str) -> str:
    n = normalizar(v)
    if "correo" in n:
        return "correo"
    if "mesa de partes" in n:
        return "mesa_partes"
    if "std" in n or "tramite" in n:
        return "std"
    return "otro" if n else ""


def _atencion_de_accion(accion: str) -> str:
    """La acción requerida del resumen («Gestionar ante el MEF…») como tipo de atención."""
    n = normalizar(accion)
    if not n or n.startswith("ninguna"):
        return "conocimiento"
    if re.search(r"\b(agend\w*|reunion|audiencia|cita|asistir|asistencia|coordinar fecha|participar)\b", n):
        return "agendar"
    if re.search(r"\b(interced\w*|gestionar|articular|intermedia\w*|buenos oficios)\b", n):
        return "interceder"
    if re.search(r"\b(opinion|pronunci\w*|posicion)\b", n):
        return "emitir_opinion"
    return "responder"


def _tipo_evento(titulo: str, convoca: str) -> str:
    n = normalizar(f"{titulo} {convoca}")
    if "pleno" in n:
        return "pleno"
    if "comision" in n and "sesion" in n:
        return "comision"
    return "externa"


def leer_resumen(texto: str) -> dict:
    """El mensaje del prompt de recepción → {tipo, ficha, evento, avisos}. `ficha` trae
    solo los campos que el mensaje dice (lo demás queda como estaba); `evento`, en una
    AGENDA con fecha, los datos para la Agenda; `tipo`: 'comunicado' | 'agenda' | ''."""
    tipo = ""
    campos: dict[str, str] = {}
    listas: dict[str, list[str]] = {}
    actual = ""
    documento_suelto = titulo = ""
    for bruta in (texto or "").splitlines():
        linea = _RE_ADORNO.sub("", bruta.strip()).strip()
        if not linea:
            continue
        n = normalizar(linea)
        if n.startswith("enrutamiento") or "no copiar al grupo" in n or n.startswith("———"):
            continue
        if n.startswith("nuevo documento recibido"):
            tipo, actual = "comunicado", ""
            continue
        if n.startswith("agenda") and "nueva actividad" in n:
            tipo, actual = "agenda", ""
            continue
        m = _RE_ROTULO_RESUMEN.match(linea)
        if m:
            actual = normalizar(m.group(1))
            campos[actual] = m.group(2).strip()
            if actual in _LISTAS_RESUMEN and campos[actual]:
                listas.setdefault(actual, []).append(campos[actual])
            continue
        if actual in _LISTAS_RESUMEN:
            listas.setdefault(actual, []).append(linea.lstrip("-• ").strip())
        elif actual == "asunto":
            campos["asunto"] = f"{campos['asunto']} {linea}".strip()
        elif not actual and bruta.lstrip().startswith("📄") and not documento_suelto:
            documento_suelto = linea
        elif not actual and bruta.lstrip().startswith("📌") and not titulo:
            titulo = linea
    if not tipo and campos:
        tipo = "agenda" if {"convoca", "hora", "lugar"} & set(campos) else "comunicado"
    avisos: list[str] = []
    if not campos:
        return {"tipo": "", "ficha": {}, "evento": None,
                "avisos": ["No se reconoció el formato del resumen del grupo (📄 Remitente, 📅 Fecha, 📝 Asunto…)."]}

    documento = _valor(campos.get("documento", "") or documento_suelto)
    remitente = _valor(campos.get("remitente", "") or campos.get("convoca", ""))
    cargo = ""
    for sep in (" — ", " – ", " - "):
        if sep in remitente:
            remitente, cargo = (x.strip() for x in remitente.split(sep, 1))
            break
    asunto = _valor(campos.get("asunto", ""))
    lineas = [x for c in ("contenido", "detalle") for x in listas.get(c, []) if _valor(x)]
    if listas.get("informacion solicitada"):
        lineas.append("Información solicitada: " + "; ".join(_valor(x) for x in listas["informacion solicitada"] if _valor(x)))
    if _valor(campos.get("norma o dispositivo", "")):
        lineas.append("Norma: " + _valor(campos["norma o dispositivo"]))
    accion = _valor(campos.get("accion requerida", ""))
    previa = _valor(campos.get("accion previa", ""))
    if accion and not normalizar(accion).startswith("ninguna"):
        lineas.append("Acción requerida: " + accion)
    if previa and not normalizar(previa).startswith("ninguna"):
        lineas.append("Acción previa: " + previa)

    ficha: dict = {}
    if documento:
        ficha["documento"] = documento[:300]
    if remitente:
        ficha["remitente"], ficha["remitente_cargo"] = remitente[:300], cargo[:300]
    if asunto:
        ficha["asunto"] = asunto
    if lineas:
        ficha["resumen"] = "\n".join(f"- {x}" for x in lineas)
    for clave, campo in (("fecha_documento", "fecha del documento"), ("fecha_recepcion", "recibido")):
        f = _fecha_dma(campos.get(campo, ""))
        if f:
            ficha[clave] = f
    if _via_de(campos.get("recibido", "")):
        ficha["via"] = _via_de(campos["recibido"])
    if _registro_std(campos.get("registro std", "")):
        ficha["std_numero"] = _registro_std(campos["registro std"])

    evento = None
    if tipo == "agenda":
        ficha["clase"] = "citacion" if "citaci" in normalizar(f"{documento} {asunto}") else "invitacion"
        ficha["atencion"] = "agendar"
        confirmacion = _fecha_dma(campos.get("confirmacion", ""))
        if confirmacion:
            ficha["plazo"] = confirmacion
        fecha = _fecha_dma(campos.get("fecha", ""))
        if not fecha:
            avisos.append("La actividad no tiene fecha: no se propone el evento de la Agenda.")
        else:
            hora = _hora(campos.get("hora", ""))
            nombre = _valor(titulo) or asunto or documento or "Actividad"
            modalidad = normalizar(_valor(campos.get("modalidad", "")))
            descripcion = [f"Convoca: {_valor(campos.get('convoca', ''))}"] if _valor(campos.get("convoca", "")) else []
            descripcion += [f"- {x}" for x in listas.get("detalle", []) if _valor(x)]
            if previa and not normalizar(previa).startswith("ninguna"):
                descripcion.append(f"Acción previa: {previa}")
            evento = {
                "titulo": nombre[:300],
                "tipo": _tipo_evento(nombre, _valor(campos.get("convoca", ""))),
                "inicio": f"{fecha}T{hora or '00:00'}:00",
                "todo_el_dia": not hora,
                "lugar": _valor(campos.get("lugar", ""))[:300],
                "modalidad": "virtual" if modalidad.startswith("virtual") else "mixta" if modalidad.startswith("mixta") else "presencial",
                "descripcion": "\n".join(descripcion),
            }
            if not hora:
                avisos.append("La hora no consta: el evento queda como de todo el día.")
    else:
        if accion or "accion requerida" in campos:
            ficha["atencion"] = _atencion_de_accion(accion)
        plazo = _fecha_dma(campos.get("plazo", ""))
        if plazo:
            ficha["plazo"] = plazo
        doc_clase = extraer_documento(documento)[1] if documento else ""
        if documento or asunto:
            ficha["clase"] = clase_de(f"{documento}\n{asunto}", doc_clase)
    return {"tipo": tipo, "ficha": ficha, "evento": evento, "avisos": avisos}


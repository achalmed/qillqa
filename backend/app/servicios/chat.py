"""backend/app/servicios/chat.py — reglas y base del CHAT institucional (2026-10-12, fase 8;
`docs/plataforma/propuesta-automatizacion.md` §5; tablas en `modelos_chat.py`).

Permisos (los del sistema, sin uno nuevo): un canal `tema` de visibilidad `equipo` lo lee y
escribe todo el equipo (los módulos no se asignan por rol); `grupo` y `directo` solo sus
miembros; `invitado` no entra al chat. El administrador crea, archiva y administra los temas.
Las reglas puras (menciones, nombre del directo, texto de un mensaje automático) se prueban en
`backend/tests/test_chat.py`.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Usuario
from app.modelos_chat import Canal, CanalMiembro, Mensaje, MensajeArchivo, MensajeReaccion
from app.servicios import difusor
from app.servicios import notificaciones

log = logging.getLogger("sgdp.chat")

CLASES = ("directo", "grupo", "tema")
VISIBILIDADES = ("equipo", "privado")
_MENCION = re.compile(r"(?<![\w.])@([a-z0-9][a-z0-9._-]{1,48})", re.IGNORECASE)
_ENTIDAD = re.compile(r"^(doc|entrada|pl|sr|tarea|evento|persona|inst|foto|pedido|comision):[\w-]{1,40}$")

# Canales de fábrica: temas del equipo, sembrados una vez (clave en `ajustes.chat_canales_fabrica`).
FABRICA = [
    {"clave": "general", "nombre": "General", "descripcion": "Lo que es de todos: avisos de la entidad, coordinación del día."},
    {"clave": "recibidos", "nombre": "Mesa de Partes", "descripcion": "Lo que llega a Mesa de Partes: cada documento nuevo, su responsable y su plazo (lo publica el sistema)."},
    {"clave": "documentos", "nombre": "Documentos", "descripcion": "Oficios numerados, firmados y enviados (lo publica el sistema)."},
    {"clave": "agenda", "nombre": "Agenda", "descripcion": "Eventos agendados y recordatorios (lo publica el sistema)."},
    {"clave": "proyectos", "nombre": "Proyectos de ley", "descripcion": "Partes aprobadas, fases hechas."},
    {"clave": "representacion", "nombre": "Semana de representación", "descripcion": "Actividades, pedidos y oficios de la Semana."},
    {"clave": "prensa", "nombre": "Prensa", "descripcion": "Piezas, publicaciones y materiales."},
    {"clave": "comisiones", "nombre": "Comisiones", "descripcion": "Un canal por comisión: citaciones, agendas, dictámenes y acuerdos."},
]
# Temas nuevos (2026-10-13, «temáticas de Telegram»): los GENÉRICOS que el despacho usaba en Telegram y
# que el sistema puede llenar solo (reglas de `eventos_sistema.FABRICA`) o que ordenan la conversación.
# Lo propio de la entidad (su bancada, su grupo parlamentario, su programa) va en `temas_propios`, con
# el nombre del .env. Se siembran una vez, por clave, como los de arriba.
FABRICA += [
    {"clave": "documentos-listos", "nombre": "Documentos listos", "descripcion": "Lo firmado, listo para enviar (lo publica el sistema)."},
    {"clave": "documentos-enviados", "nombre": "Documentos enviados", "descripcion": "Lo que salió de la entidad (lo publica el sistema)."},
    {"clave": "seguimiento", "nombre": "Seguimiento de documentos", "descripcion": "Actuaciones del seguimiento y respuestas a lo enviado (lo publica el sistema)."},
    {"clave": "borradores", "nombre": "Borradores y revisión", "descripcion": "Lo que pasa a revisión u observado (lo publica el sistema) y los borradores que se comentan entre todos."},
    {"clave": "programacion", "nombre": "Programación del día", "descripcion": "Cada mañana, las actividades del día (lo publica el sistema)."},
    {"clave": "reuniones", "nombre": "Reuniones y acuerdos", "descripcion": "Documentos, actas y acuerdos después de cada reunión."},
    {"clave": "pleno", "nombre": "Pleno", "descripcion": "Sesiones del Pleno: agenda, citaciones y votaciones (lo agendado como Pleno lo publica el sistema)."},
    {"clave": "noticias", "nombre": "Noticias", "descripcion": "Noticias locales, nacionales e internacionales (las piezas de Prensa de esa clase las publica el sistema)."},
    {"clave": "fotos", "nombre": "Fotos y videos", "descripcion": "Fotos y videos de las actividades; desde aquí se guardan en la Mediateca."},
    {"clave": "atencion", "nombre": "Atención ciudadana", "descripcion": "Pedidos de la ciudadanía y acceso a la información pública."},
]
# Temas PROPIOS de la entidad (2026-10-18, Edison: «crear los temas propios de la entidad: la bancada, el
# grupo parlamentario, el programa de radio y Denuncias»). El lugar es genérico; el NOMBRE con que el
# despacho los llama llega del .env (NOMBRE_BANCADA, NOMBRE_GRUPO_PARLAMENTARIO, NOMBRE_PROGRAMA_RADIO):
# nada de la entidad en el código (D13). Se siembran una vez, por clave; después se renombran en la web.


def temas_propios() -> list[dict]:
    from app.config import config

    return [
        {"clave": "bancada", "nombre": config.nombre_bancada or "Bancada",
         "descripcion": "La bancada: acuerdos, posiciones, votaciones y comunicados que se coordinan."},
        {"clave": "grupo-parlamentario", "nombre": config.nombre_grupo_parlamentario or "Grupo parlamentario",
         "descripcion": "El grupo parlamentario: convocatorias, agenda, vocerías y decisiones del grupo."},
        {"clave": "radio", "nombre": config.nombre_programa_radio or "Programa de radio",
         "descripcion": "El programa de radio: temas de la semana, invitados, guion y transmisión."},
        {"clave": "denuncias", "nombre": "Denuncias",
         "descripcion": "Denuncias de la ciudadanía: cada caso, sus pruebas y lo que se hace (fiscalización, oficios)."},
    ]
# Sección de la lista de cada tema de fábrica (`canales.categoria`). Lo que crea quien administra elige
# la suya; un tema sin sección va a «Otros temas». `mesa-de-partes` por si el canal cambia de clave.
CATEGORIAS = ("Equipo", "Documentos", "Agenda", "Legislativo", "Prensa y medios", "Representación")
CATEGORIA_FABRICA = {
    "general": "Equipo", "atencion": "Representación", "representacion": "Representación",
    "recibidos": "Documentos", "mesa-de-partes": "Documentos", "documentos": "Documentos", "documentos-listos": "Documentos",
    "documentos-enviados": "Documentos", "seguimiento": "Documentos", "borradores": "Documentos",
    "agenda": "Agenda", "programacion": "Agenda", "reuniones": "Agenda",
    "proyectos": "Legislativo", "pleno": "Legislativo", "comisiones": "Legislativo",
    "prensa": "Prensa y medios", "noticias": "Prensa y medios", "fotos": "Prensa y medios",
    "bancada": "Legislativo", "grupo-parlamentario": "Legislativo", "radio": "Prensa y medios", "denuncias": "Representación",
}
EMOJIS = ("👍", "❤️", "👏", "✅", "👀", "😂", "🙏", "⚠️")


def slug(texto: str) -> str:
    """«Comisión de Educación, Cultura y Deporte» → `educacion-cultura-y-deporte`."""
    from app.servicios.entradas import normalizar

    n = re.sub(r"^comision de ", "", normalizar(texto)).strip()
    return re.sub(r"[^a-z0-9ñ]+", "-", n).strip("-")[:60]


# --- puras -----------------------------------------------------------------------------------


def menciones(texto: str, usuarios_validos: set[str]) -> list[str]:
    vistos: list[str] = []
    for m in _MENCION.finditer(texto or ""):
        u = m.group(1).lower().rstrip(".")
        if u in usuarios_validos and u not in vistos:
            vistos.append(u)
    return vistos


# El chat de uno mismo (2026-10-19, Edison: «un chat personal donde guarde información, como en
# Telegram o WhatsApp»): un directo cuyas dos puntas son la misma persona.
NOTAS_PROPIAS = "Mis notas"


def clave_directo(a: int, b: int) -> str:
    x, y = sorted((int(a), int(b)))
    return f"u:{x}-u:{y}"


def entidad_valida(entidad: str) -> bool:
    return bool(_ENTIDAD.match(entidad or ""))


def puede_leer(canal: Canal, usuario: Usuario, es_miembro: bool) -> bool:
    if usuario.rol == "invitado" or canal.archivado and not es_miembro and usuario.rol != "administrador":
        return False
    if canal.clase == "tema" and canal.visibilidad == "equipo":
        return True
    return es_miembro or (canal.clase == "tema" and usuario.rol == "administrador")


def puede_escribir(canal: Canal, usuario: Usuario, es_miembro: bool) -> bool:
    return puede_leer(canal, usuario, es_miembro) and not canal.archivado


def texto_automatico(que: str, datos: dict, plantilla: str = "") -> str:
    """El cuerpo de un mensaje que publica una regla: la plantilla rellenada o «qué pasó» con
    los datos más útiles en una línea."""
    from app.servicios.eventos_sistema import plantilla as rellenar

    cuerpo = rellenar(plantilla, datos) if plantilla else ""
    if cuerpo:
        return cuerpo
    partes = [str(datos[k]) for k in ("numero", "asunto", "titulo", "remitente", "estado", "plazo") if datos.get(k)]
    return f"{que}: " + " · ".join(partes) if partes else que


# Tarjeta de un mensaje del sistema (2026-10-13; Edison: «ordenado, fácil de entender; cuando está todo
# junto es abrumador»). Una línea de QUÉ pasó (ícono + «Numerado»), el número o nombre en negrita
# (`titulo`), el asunto (`detalle`, la web lo corta a dos líneas con «ver más») y los datos sueltos
# (`meta`: plazo, lugar, quién). La acción es una sola (la del mensaje). El número va solo en el título:
# ni el texto ni un chip lo repiten.
_ESTADO_TARJETA = {"FIRMADO": ("Firmado", "firmado"), "ENVIADO": ("Enviado", "enviado"), "EN_REVISION": ("En revisión", "revision"),
                   "OBSERVADO": ("Observado", "observado"), "APROBADO": ("Aprobado", "aprobado"), "ARCHIVADO": ("Archivado", "estado")}
_ATENCION = {"responder": "por responder", "conocimiento": "para conocimiento", "agendar": "por agendar"}


def _fecha_legible(valor) -> str:
    """«lun 14/10 10:30» de un ISO (o «lun 14/10» si es solo fecha); lo que no es fecha, tal cual."""
    if not valor:
        return ""
    texto = str(valor)
    try:
        if len(texto) == 10:
            from datetime import date

            d = date.fromisoformat(texto)
            return f"{_DIAS[d.weekday()]} {d:%d/%m}"
        return cuando_legible(datetime.fromisoformat(texto.replace("Z", "+00:00")))
    except ValueError:
        return texto


def tarjeta_de(nombre: str, datos: dict | None, texto: str = "") -> dict:
    """La tarjeta de lo que publica el sistema. Con el evento (`nombre`, `datos`) se arma campo por
    campo; sin evento (un anuncio «Tarea creada: … · vence …») se lee del texto. {} = sin tarjeta
    (se muestra el texto llano)."""
    d = dict(datos or {})
    t = lambda k: str(d.get(k) or "").strip()  # noqa: E731
    meta = lambda *xs: [x for x in xs if x]  # noqa: E731
    if nombre == "documento.numerado":
        return {"que": "Numerado", "icono": "numerado", "titulo": t("numero"), "detalle": t("asunto"), "meta": []}
    if nombre == "documento.estado":
        que, icono = _ESTADO_TARJETA.get(t("estado").upper(), (f"Pasó a {t('estado').lower().replace('_', ' ')}", "estado"))
        return {"que": que, "icono": icono, "titulo": t("numero"), "detalle": t("asunto"), "meta": []}
    if nombre == "documento.actuacion":
        return {"que": "Seguimiento", "icono": "seguimiento", "titulo": t("numero"), "detalle": t("texto"),
                "meta": meta(t("clase").replace("_", " ").capitalize(), _fecha_legible(d.get("fecha")))}
    if nombre == "documento.seguimiento":
        return {"que": "Estado del trámite", "icono": "seguimiento", "titulo": t("numero"), "detalle": t("ubicacion"),
                "meta": meta(t("estado_propuesto").replace("_", " "), t("expediente_entidad"))}
    if nombre in ("entrada.registrada", "entrada.subsanada", "entrada.respondida", "entrada.asignada", "entrada.vencida"):
        que = {"entrada.registrada": "Llegó", "entrada.subsanada": "Subsanación", "entrada.respondida": "Respondido",
               "entrada.asignada": "Asignado", "entrada.vencida": "Venció el plazo"}[nombre]
        titulo = t("remitente") or t("expediente") or t("std_numero")
        return {"que": que, "icono": "vencido" if nombre == "entrada.vencida" else "recibido", "titulo": titulo, "detalle": t("asunto"),
                "meta": meta(_ATENCION.get(t("atencion"), t("atencion")), f"plazo {_fecha_legible(d.get('plazo'))}" if d.get("plazo") else "",
                             t("expediente") if titulo != t("expediente") else "", t("documento"))}
    if nombre in ("evento.creado", "evento.recordatorio"):
        return {"que": "Agendado" if nombre == "evento.creado" else "Se acerca", "icono": "agenda" if nombre == "evento.creado" else "recordatorio",
                "titulo": t("titulo"), "detalle": "", "meta": meta(_fecha_legible(d.get("inicio")), t("lugar"))}
    if nombre == "agenda.programacion_diaria":
        return {"que": "Programación del día", "icono": "programacion", "titulo": _fecha_legible(d.get("fecha")) or t("fecha"),
                "detalle": str(d.get("resumen") or ""), "meta": meta(f"{d.get('n')} actividad(es)" if d.get("n") else "")}
    if nombre == "sr.pedido_derivado":
        return {"que": "Pedido derivado", "icono": "enviado", "titulo": t("codigo"), "detalle": t("pedido"), "meta": meta(t("numero"))}
    if nombre == "sr.actividad_registrada":
        return {"que": "Actividad de la Semana", "icono": "agenda", "titulo": t("titulo"), "detalle": "", "meta": meta(t("distrito"), _fecha_legible(d.get("fecha")))}
    if nombre == "prensa.pieza_registrada":
        return {"que": "Pieza de prensa", "icono": "prensa", "titulo": t("titular"), "detalle": "",
                "meta": meta(t("clase").replace("_", " ").capitalize(), t("fuente"), f"sugerido: {t('accion_sugerida')}" if t("accion_sugerida") else "")}
    if nombre == "pl.parte_estado":
        return {"que": "Proyecto de ley", "icono": "proyecto", "titulo": t("proyecto"), "detalle": t("parte"), "meta": meta(t("estado").lower())}
    if nombre in ("tarea.asignada", "tarea.vencida"):
        return {"que": "Tarea asignada" if nombre == "tarea.asignada" else "Venció una tarea", "icono": "tarea", "titulo": t("titulo"), "detalle": "",
                "meta": meta(f"vence {_fecha_legible(d.get('vence'))}" if d.get("vence") else "")}
    if nombre:
        from app.servicios.eventos_sistema import VOCABULARIO

        que = VOCABULARIO.get(nombre, {}).get("que", "")
        titulo = t("numero") or t("titulo") or t("asunto")
        if que and titulo:
            return {"que": que, "icono": "evento", "titulo": titulo, "detalle": t("asunto") if titulo != t("asunto") else "", "meta": []}
    # Sin evento: los anuncios del chat («Tarea creada: Revisar · vence lun 14/10 · Ana»).
    for prefijo, que, icono in (("Tarea creada: ", "Tarea creada", "tarea"), ("Actividad agendada: ", "Actividad agendada", "agenda")):
        if (texto or "").startswith(prefijo):
            partes = texto[len(prefijo):].split(" · ")
            return {"que": que, "icono": icono, "titulo": partes[0].strip(), "detalle": "", "meta": [x.strip() for x in partes[1:] if x.strip()]}
    return {}


# --- canales ---------------------------------------------------------------------------------


async def miembro_de(sesion: AsyncSession, canal_id: int, usuario_id: int) -> CanalMiembro | None:
    return (await sesion.execute(select(CanalMiembro).where(CanalMiembro.canal_id == canal_id, CanalMiembro.usuario_id == usuario_id))).scalar_one_or_none()


async def unir(sesion: AsyncSession, canal: Canal, usuario_id: int, papel: str = "miembro") -> CanalMiembro:
    m = await miembro_de(sesion, canal.id, usuario_id)
    if m is None:
        m = CanalMiembro(canal_id=canal.id, usuario_id=usuario_id, papel=papel)
        sesion.add(m)
        await sesion.flush()
    return m


async def canal_directo(sesion: AsyncSession, a: int, b: int) -> Canal:
    """El canal directo entre dos personas; se crea la primera vez (idempotente por `clave`)."""
    clave = clave_directo(a, b)
    # Candado por clave hasta el fin de la transacción (2026-10-12): dos pedidos a la vez (dos pestañas, o el
    # efecto de `?directo=` que React dispara dos veces en desarrollo) creaban dos directos con la misma clave.
    await sesion.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"chat:{clave}"})
    # Si ya hay duplicados de antes, manda el más antiguo (scalar_one_or_none fallaría con dos).
    c = (await sesion.execute(
        select(Canal).where(Canal.clase == "directo", Canal.clave == clave).order_by(Canal.id).limit(1)
    )).scalar_one_or_none()
    if c is None:
        c = Canal(clase="directo", nombre="", visibilidad="privado", clave=clave, creado_por=a)
        sesion.add(c)
        await sesion.flush()
        await unir(sesion, c, a)
        await unir(sesion, c, b)
    return c


async def canal_por_clave(sesion: AsyncSession, clave: str) -> Canal | None:
    return (await sesion.execute(select(Canal).where(Canal.clase == "tema", Canal.clave == clave))).scalar_one_or_none()


async def canal_de_entidad(sesion: AsyncSession, entidad: str, nombre: str, usuario_id: int | None, padre_clave: str = "") -> Canal:
    """El canal temático de una entidad (`pl:3`, `sr:2`, `comision:educacion`); se crea al primer uso."""
    c = (await sesion.execute(select(Canal).where(Canal.clase == "tema", Canal.entidad == entidad))).scalar_one_or_none()
    if c is None:
        padre = await canal_por_clave(sesion, padre_clave) if padre_clave else None
        c = Canal(clase="tema", nombre=nombre[:120], entidad=entidad, visibilidad="equipo", padre_id=padre.id if padre else None, creado_por=usuario_id)
        sesion.add(c)
        await sesion.flush()
    return c


async def sembrar_fabrica(sesion: AsyncSession) -> int:
    from app.modelos import Ajuste

    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": "chat_canales_fabrica"})
    hechas = set((fila.valor or {}).get("claves", [])) if fila else set()
    nuevos = 0
    recien: set[str] = set()
    for c in FABRICA + temas_propios():
        if c["clave"] in hechas:
            continue
        sesion.add(Canal(clase="tema", visibilidad="equipo", categoria=CATEGORIA_FABRICA.get(c["clave"], ""), **c))
        hechas.add(c["clave"])
        recien.add(c["clave"])
        nuevos += 1
    # Secciones (2026-10-13): los temas de fábrica ya sembrados toman la suya si aún no tienen.
    for clave, cat in CATEGORIA_FABRICA.items():
        await sesion.execute(update(Canal).where(Canal.clase == "tema", Canal.clave == clave, Canal.categoria == "").values(categoria=cat))
    await _ordenar_reglas_viejas(sesion, recien)
    if "denuncias" in recien:
        await sesion.execute(update(Canal).where(Canal.clase == "tema", Canal.clave == "atencion",
                                                 Canal.descripcion == "Pedidos de la ciudadanía, denuncias y acceso a la información pública.")
                             .values(descripcion="Pedidos de la ciudadanía y acceso a la información pública (las denuncias, en su tema)."))
    # Un canal por comisión (2026-10-12, fase 9.2), bajo el tema «Comisiones»; el catálogo es el de Qillqa.
    from app.servicios.catalogos_legislativos import COMISIONES

    if "comisiones" in hechas:
        await sesion.flush()
        padre = await canal_por_clave(sesion, "comisiones")
        for nombre in COMISIONES:
            clave = f"comision:{slug(nombre)}"
            if clave in hechas:
                continue
            sesion.add(Canal(clase="tema", visibilidad="equipo", nombre=nombre.replace("Comisión de ", ""), entidad=clave,
                             clave=clave, padre_id=padre.id if padre else None, descripcion=nombre))
            hechas.add(clave)
            nuevos += 1
    if nuevos:
        if fila:
            fila.valor = {"claves": sorted(hechas)}
        else:
            sesion.add(Ajuste(despacho_id=1, clave="chat_canales_fabrica", valor={"claves": sorted(hechas)}))
        log.info("Canales de fábrica sembrados: %s", nuevos)
    await sesion.commit()
    return nuevos


async def _ordenar_reglas_viejas(sesion: AsyncSession, recien: set[str]) -> None:
    """Una sola vez, al sembrar los temas nuevos (2026-10-13): lo que ahora tiene su propio tema deja
    de repetirse en el general. Solo si la regla sigue como vino de fábrica (si alguien la cambió,
    se respeta). Lo firmado y enviado → «Documentos listos» y «Documentos enviados» (Documentos queda
    con lo numerado); las noticias → «Noticias» (Prensa queda con lo propio)."""
    from app.modelos import ReglaEvento

    if "documentos-listos" in recien or "documentos-enviados" in recien:
        r = (await sesion.execute(select(ReglaEvento).where(ReglaEvento.de_fabrica == "canal-documentos-estado"))).scalar_one_or_none()
        if r and r.activa and r.destino == "canal:documentos" and sorted((r.condicion or {}).get("estado") or []) == ["ENVIADO", "FIRMADO"]:
            r.activa = False
            log.info("Regla «%s» apagada: lo firmado y enviado va a sus temas propios.", r.nombre)
        await sesion.execute(update(Canal).where(Canal.clase == "tema", Canal.clave == "documentos",
                                                 Canal.descripcion == "Oficios numerados, firmados y enviados (lo publica el sistema).")
                             .values(descripcion="Cada documento numerado (lo publica el sistema); lo firmado y lo enviado, en sus temas."))
    if "noticias" in recien:
        r = (await sesion.execute(select(ReglaEvento).where(ReglaEvento.de_fabrica == "canal-prensa"))).scalar_one_or_none()
        if r and r.activa and not (r.condicion or {}):
            r.condicion = {"clase": ["nota_de_prensa", "comunicado", "entrevista", "agenda_de_medios"]}
            log.info("Regla «%s»: las noticias van al tema Noticias.", r.nombre)


async def canales_de(sesion: AsyncSession, usuario: Usuario) -> list[dict]:
    """Los canales que la persona ve, con no leídos y el último mensaje: los temas del equipo
    (aunque no se haya unido) y los grupos y directos de los que es miembro."""
    if usuario.rol == "invitado":
        return []
    miembros = {m.canal_id: m for m in (await sesion.execute(select(CanalMiembro).where(CanalMiembro.usuario_id == usuario.id))).scalars()}
    q = select(Canal).where(Canal.archivado.is_(False), or_(
        (Canal.clase == "tema") & (Canal.visibilidad == "equipo"), Canal.id.in_(list(miembros) or [0]),
    ))
    canales = (await sesion.execute(q)).scalars().all()
    ids = [c.id for c in canales]
    # No leídos: mensajes con id > ultimo_leido_id del miembro (0 si no se ha unido), sin los propios.
    no_leidos: dict[int, int] = {}
    ultimos: dict[int, Mensaje] = {}
    if ids:
        filas = (await sesion.execute(
            select(Mensaje.canal_id, func.count(Mensaje.id)).where(Mensaje.canal_id.in_(ids), Mensaje.eliminado_en.is_(None), Mensaje.padre_id.is_(None),
                                                                 or_(Mensaje.autor_id != usuario.id, Mensaje.autor_id.is_(None)))
            .group_by(Mensaje.canal_id)
        )).all()
        for cid, total in filas:
            leido = miembros[cid].ultimo_leido_id if cid in miembros else 0
            if leido:
                n = (await sesion.execute(select(func.count(Mensaje.id)).where(Mensaje.canal_id == cid, Mensaje.id > leido, Mensaje.eliminado_en.is_(None),
                                                                                   or_(Mensaje.autor_id != usuario.id, Mensaje.autor_id.is_(None))))).scalar_one()
            else:
                n = total
            no_leidos[cid] = int(n)
        sub = select(Mensaje.canal_id, func.max(Mensaje.id).label("mid")).where(Mensaje.canal_id.in_(ids), Mensaje.eliminado_en.is_(None)).group_by(Mensaje.canal_id).subquery()
        for m in (await sesion.execute(select(Mensaje).join(sub, Mensaje.id == sub.c.mid))).scalars():
            ultimos[m.canal_id] = m
    # Nombre del directo: la otra persona.
    otros: dict[int, str] = {}
    directos = [c for c in canales if c.clase == "directo"]
    if directos:
        filas = (await sesion.execute(
            select(CanalMiembro.canal_id, Usuario.nombre_completo, Usuario.nombre_usuario).join(Usuario, Usuario.id == CanalMiembro.usuario_id)
            .where(CanalMiembro.canal_id.in_([c.id for c in directos]), CanalMiembro.usuario_id != usuario.id)
        )).all()
        for cid, nombre, cuenta in filas:
            otros[cid] = nombre or cuenta
    autores = await nombres_usuarios(sesion, {m.autor_id for m in ultimos.values() if m.autor_id})
    # La vista previa de un mensaje sin texto (un adjunto, una nota de voz) o de una encuesta.
    from app.modelos_chat import Encuesta

    primeros: dict[int, MensajeArchivo] = {}
    con_encuesta: set[int] = set()
    if ultimos:
        mids = [m.id for m in ultimos.values()]
        sin_texto = [m.id for m in ultimos.values() if not (m.texto or "").strip()]
        if sin_texto:
            for a in (await sesion.execute(select(MensajeArchivo).where(MensajeArchivo.mensaje_id.in_(sin_texto)).order_by(MensajeArchivo.id))).scalars():
                primeros.setdefault(a.mensaje_id, a)
        con_encuesta = set((await sesion.execute(select(Encuesta.mensaje_id).where(Encuesta.mensaje_id.in_(mids)))).scalars().all())
    salida = []
    ahora = datetime.now(timezone.utc)
    from app.servicios import etiquetas

    vigentes = await etiquetas.etiquetas_de(sesion, {c.entidad for c in canales if c.entidad})
    for c in canales:
        u = ultimos.get(c.id)
        mi = miembros.get(c.id)
        silenciado = bool(mi and mi.silenciado_hasta and mi.silenciado_hasta > ahora)
        salida.append({
            **canal_dict(c), "nombre": otros.get(c.id, c.nombre or NOTAS_PROPIAS) if c.clase == "directo" else c.nombre,
            "miembro": c.id in miembros, "papel": miembros[c.id].papel if c.id in miembros else "",
            "silenciado": silenciado, "silenciado_hasta": mi.silenciado_hasta.isoformat() if silenciado else None,
            "no_leidos": no_leidos.get(c.id, 0), "entidad_etiqueta": vigentes.get(c.entidad, ""),
            "ultimo": {"id": u.id, "autor_id": u.autor_id, "texto": vista_previa(u.texto, primeros[u.id].nombre if u.id in primeros else "", u.id in con_encuesta)[:120], "autor": autores.get(u.autor_id or 0, "Sistema") if u.autor_id else ((u.tarjeta or {}).get("firma") or "Sistema"), "creado_en": u.creado_en.isoformat()} if u else None,
        })
    salida.sort(key=lambda x: (x["ultimo"]["creado_en"] if x["ultimo"] else ""), reverse=True)
    return salida


_NEGRITA = re.compile(r"(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])")


def texto_llano(texto: str) -> str:
    """El texto en una línea, sin los asteriscos de la *negrita* (lista de chats y avisos push): los
    saltos de un mensaje escrito como en Telegram pasan a « · »."""
    t = _NEGRITA.sub(r"\1\2", texto or "")
    return " · ".join(x.strip() for x in t.splitlines() if x.strip())


def vista_previa(texto: str, archivo: str = "", encuesta: bool = False) -> str:
    """La línea de la lista de chats: «Encuesta: ¿Qué día?», «Nota de voz», el nombre del
    archivo si el mensaje solo trae un adjunto, o el texto."""
    if encuesta:
        return f"Encuesta: {texto}"
    if (texto or "").strip():
        return texto_llano(texto)
    if archivo:
        return "Nota de voz" if es_nota_de_voz(archivo) else archivo
    return ""


def canal_dict(c: Canal) -> dict:
    return {"id": c.id, "clase": c.clase, "nombre": c.nombre, "descripcion": c.descripcion, "entidad": c.entidad, "padre_id": c.padre_id,
            "visibilidad": c.visibilidad, "clave": c.clave, "archivado": c.archivado, "creado_por": c.creado_por,
            "categoria": c.categoria or CATEGORIA_FABRICA.get(c.clave, "")}


async def nombres_usuarios(sesion: AsyncSession, ids: set[int]) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: (u.nombre_completo or u.nombre_usuario) for u in (await sesion.execute(select(Usuario).where(Usuario.id.in_(ids)))).scalars()}


async def miembros_de(sesion: AsyncSession, canal: Canal) -> list[dict]:
    filas = (await sesion.execute(
        select(CanalMiembro, Usuario).join(Usuario, Usuario.id == CanalMiembro.usuario_id).where(CanalMiembro.canal_id == canal.id)
    )).all()
    return [{"usuario_id": u.id, "nombre": u.nombre_completo or u.nombre_usuario, "cuenta": u.nombre_usuario, "papel": m.papel, "ultimo_leido_id": m.ultimo_leido_id,
             "ultimo_recibido_id": max(m.ultimo_recibido_id or 0, m.ultimo_leido_id or 0)} for m, u in filas]


async def lectores_de(sesion: AsyncSession, canal: Canal) -> set[int]:
    """A quién se le difunde lo que pasa en el canal: el equipo entero en un tema abierto; los
    miembros en los demás."""
    if canal.clase == "tema" and canal.visibilidad == "equipo":
        return set((await sesion.execute(select(Usuario.id).where(Usuario.activo.is_(True), Usuario.rol != "invitado"))).scalars().all())
    return set((await sesion.execute(select(CanalMiembro.usuario_id).where(CanalMiembro.canal_id == canal.id))).scalars().all())


# --- mensajes --------------------------------------------------------------------------------


def mensaje_dict(m: Mensaje, autores: dict[int, str], archivos: list[dict] | None = None) -> dict:
    return {
        "id": m.id, "canal_id": m.canal_id, "autor_id": m.autor_id, "autor": autores.get(m.autor_id or 0, "Sistema") if m.autor_id else "Sistema",
        "padre_id": m.padre_id, "responde_a_id": m.responde_a_id, "texto": "" if m.eliminado_en else m.texto, "menciones": m.menciones or [], "entidad": m.entidad,
        "evento_sistema_id": m.evento_sistema_id, "acciones": m.acciones or [], "respuestas": m.respuestas,
        "editado_en": m.editado_en.isoformat() if m.editado_en else None, "eliminado": m.eliminado_en is not None,
        "creado_en": m.creado_en.isoformat() if m.creado_en else None, "archivos": archivos or [],
        "tarjeta": (m.tarjeta or {}) if not m.eliminado_en else {},
    }


async def archivos_de(sesion: AsyncSession, ids: list[int]) -> dict[int, list[dict]]:
    if not ids:
        return {}
    salida: dict[int, list[dict]] = {}
    for a in (await sesion.execute(select(MensajeArchivo).where(MensajeArchivo.mensaje_id.in_(ids)))).scalars():
        salida.setdefault(a.mensaje_id, []).append({"id": a.id, "referencia": a.referencia, "archivo": a.archivo, "nombre": a.nombre, "bytes": a.bytes, "duracion_ms": a.duracion_ms})
    return salida


async def publicar(sesion: AsyncSession, canal: Canal, *, autor: Usuario | None, texto: str, padre_id: int | None = None,
                   entidad: str = "", evento_sistema_id: int | None = None, acciones: list[dict] | None = None,
                   archivos: list[dict] | None = None, difundir: bool = True, tarjeta: dict | None = None,
                   responde_a_id: int | None = None) -> Mensaje:
    """Escribe el mensaje, resuelve menciones (aviso en la campana), cuenta la respuesta en el
    padre, actualiza el canal y lo difunde en vivo a quien lo lee. Sin commit. Al difundir, lo
    marca como recibido por quien tiene el socket abierto (el segundo ✓) y avisa (`avisar`)."""
    cuentas = {u.nombre_usuario.lower(): u for u in (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True)))).scalars() if u.nombre_usuario}
    mencionados = menciones(texto, set(cuentas))
    m = Mensaje(canal_id=canal.id, autor_id=autor.id if autor else None, padre_id=padre_id, responde_a_id=responde_a_id, texto=(texto or "").strip(),
                menciones=mencionados, entidad=entidad if entidad_valida(entidad) else "", evento_sistema_id=evento_sistema_id,
                acciones=acciones or [], tarjeta=tarjeta or {})
    sesion.add(m)
    await sesion.flush()
    for a in archivos or []:
        sesion.add(MensajeArchivo(mensaje_id=m.id, referencia=a.get("referencia", ""), archivo=a.get("archivo", ""),
                                  nombre=a.get("nombre", "")[:300], bytes=int(a.get("bytes") or 0), sha256=a.get("sha256", ""),
                                  duracion_ms=int(a["duracion_ms"]) if a.get("duracion_ms") else None))
    if padre_id:
        await sesion.execute(update(Mensaje).where(Mensaje.id == padre_id).values(respuestas=Mensaje.respuestas + 1))
    canal.ultimo_mensaje_en = datetime.now(timezone.utc)
    if autor:
        mi = await unir(sesion, canal, autor.id) if canal.clase == "tema" else await miembro_de(sesion, canal.id, autor.id)
        if mi:
            mi.ultimo_leido_id = m.id
    quien = autor.nombre_completo if autor else "El sistema"
    for cuenta in mencionados:
        u = cuentas[cuenta]
        if not autor or u.id != autor.id:
            notificaciones.crear(sesion, u.id, f"{quien} le mencionó en {canal.nombre or 'un chat'}: {m.texto[:140]}", "mencion",
                                 evitar=autor.id if autor else None, destino=f"chat:{canal.id}:{m.id}")
    # En un directo, la otra persona recibe un aviso en la campana (no está mirando el chat), salvo que lo silenciara.
    if canal.clase == "directo" and autor:
        ahora = datetime.now(timezone.utc)
        for mb in (await sesion.execute(select(CanalMiembro).where(CanalMiembro.canal_id == canal.id))).scalars():
            if mb.usuario_id != autor.id and not (mb.silenciado_hasta and mb.silenciado_hasta > ahora):
                notificaciones.crear(sesion, mb.usuario_id, f"{quien}: {m.texto[:140]}", "chat", evitar=autor.id, destino=f"chat:{canal.id}:{m.id}")
    autores = await nombres_usuarios(sesion, {m.autor_id} if m.autor_id else set())
    if difundir:  # sin difundir: quien llama completa el mensaje (una encuesta) y lo difunde él
        carga = {"tipo": "mensaje", "canal_id": canal.id, "mensaje": mensaje_dict(m, autores, [dict(a) for a in archivos or []])}
        lectores = await lectores_de(sesion, canal)
        difusor.publicar(lectores, carga)
        await avisar(sesion, canal, m, lectores, {cuentas[c].id for c in mencionados}, quien if autor else (tarjeta or {}).get("firma", ""),
                     (archivos or [{}])[0].get("nombre", "") if archivos else "")
    return m


async def avisar(sesion: AsyncSession, canal: Canal, m: Mensaje, lectores: set[int], mencionados: set[int], autor: str,
                 archivo: str = "", encuesta: bool = False) -> None:
    """Tras difundir un mensaje (2026-10-13): (1) quien tiene el socket abierto ya lo recibió en
    un dispositivo: segundo ✓ (`lecturas`); (2) a quien corresponde avisar (`push.destinatarios_chat`)
    y no tiene esa conversación a la vista: `{tipo: 'alerta'}` por el socket (la web suena con el
    sonido de Qillqa) y, si no tiene Qillqa a la vista en ningún lado, el aviso push."""
    from app.servicios import push

    filas = (await sesion.execute(select(CanalMiembro).where(CanalMiembro.canal_id == canal.id))).scalars().all()
    ahora = datetime.now(timezone.utc)
    conectados = difusor.conectados()
    cambios = []
    for mb in filas:
        if mb.usuario_id != m.autor_id and mb.usuario_id in conectados and (mb.ultimo_recibido_id or 0) < m.id:
            mb.ultimo_recibido_id = m.id
            cambios.append(lectura_dict(mb))
    if cambios:
        difusor.publicar({mb.usuario_id for mb in filas} | ({m.autor_id} if m.autor_id else set()),
                         {"tipo": "lecturas", "canal_id": canal.id, "cambios": cambios})
    miembros = {mb.usuario_id: bool(mb.silenciado_hasta and mb.silenciado_hasta > ahora) for mb in filas}
    # En un tema, «miembros» son quienes ya lo abrieron o escribieron en él (`unir`).
    destino = push.destinatarios_chat(clase=canal.clase, autor_id=m.autor_id, miembros=miembros, mencionados=mencionados, lectores=lectores)
    destino = {u for u in destino if not difusor.viendo(u, canal.id)}
    if not destino:
        return
    for grupo, mencion in ((destino - mencionados, False), (destino & mencionados, True)):
        if grupo:
            difusor.publicar(grupo, {"tipo": "alerta", "canal_id": canal.id, "mensaje_id": m.id, "mencion": mencion})
    lejos = push.sin_la_app_a_la_vista(destino)
    if not lejos:
        return
    titulo = autor if canal.clase == "directo" and autor else (canal.nombre or "Chat de Qillqa")
    cuerpo = push.cuerpo_chat(canal.clase, autor or "Sistema", texto_llano(m.texto), archivo, es_nota_de_voz(archivo), encuesta)
    url = f"/chat?canal={canal.id}&mensaje={m.id}"
    for uid in lejos:
        datos = push.carga(titulo, cuerpo, url, f"chat-{canal.id}", clase="chat",
                           acuse={"u": uid, "c": canal.id, "m": m.id, "f": push.firma_acuse(uid, canal.id, m.id)})
        push.programar({uid}, datos, retraso=0.8)


def lectura_dict(mb: CanalMiembro) -> dict:
    return {"usuario_id": mb.usuario_id, "ultimo_leido_id": mb.ultimo_leido_id or 0,
            "ultimo_recibido_id": max(mb.ultimo_recibido_id or 0, mb.ultimo_leido_id or 0)}


async def difundir_lecturas(sesion: AsyncSession, canal_id: int, cambios: list[dict]) -> None:
    """Cuenta a los integrantes del canal hasta dónde llegó y leyó alguien (✓✓ y «Leído por»)."""
    if not cambios:
        return
    ids = set((await sesion.execute(select(CanalMiembro.usuario_id).where(CanalMiembro.canal_id == canal_id))).scalars().all())
    difusor.publicar(ids, {"tipo": "lecturas", "canal_id": canal_id, "cambios": cambios})


async def marcar_recibidos(sesion: AsyncSession, usuario_id: int, hasta: dict[int, int]) -> dict[int, dict]:
    """La persona tiene en un dispositivo hasta `hasta[canal]` (abrió la lista de chats, el contador
    o le llegó el aviso push): sube `ultimo_recibido_id` donde es menor. Sin commit. → {canal: lectura}."""
    if not hasta:
        return {}
    filas = (await sesion.execute(select(CanalMiembro).where(CanalMiembro.usuario_id == usuario_id, CanalMiembro.canal_id.in_(list(hasta))))).scalars().all()
    cambios: dict[int, dict] = {}
    for mb in filas:
        tope = int(hasta.get(mb.canal_id) or 0)
        if tope > max(mb.ultimo_recibido_id or 0, mb.ultimo_leido_id or 0):
            mb.ultimo_recibido_id = tope
            cambios[mb.canal_id] = lectura_dict(mb)
    return cambios


async def marcar_leido(sesion: AsyncSession, canal: Canal, usuario: Usuario, mensaje_id: int) -> dict | None:
    """Sube hasta dónde leyó (y, con ello, hasta dónde recibió). → la lectura nueva, o None si no cambió."""
    mi = await unir(sesion, canal, usuario.id) if canal.clase == "tema" else await miembro_de(sesion, canal.id, usuario.id)
    if mi and mensaje_id > (mi.ultimo_leido_id or 0):
        mi.ultimo_leido_id = mensaje_id
        mi.ultimo_recibido_id = max(mi.ultimo_recibido_id or 0, mensaje_id)
        return lectura_dict(mi)
    return None


async def buscar(sesion: AsyncSession, usuario: Usuario, q: str, limite: int = 30) -> list[dict]:
    """Búsqueda de texto completo en español sobre los canales que la persona ve."""
    visibles = [c["id"] for c in await canales_de(sesion, usuario)]
    if not visibles or not q.strip():
        return []
    filas = (await sesion.execute(
        select(Mensaje).where(Mensaje.canal_id.in_(visibles), Mensaje.eliminado_en.is_(None),
                              text("to_tsvector('spanish', mensajes.texto) @@ plainto_tsquery('spanish', :q)")).params(q=q)
        .order_by(Mensaje.id.desc()).limit(limite)
    )).scalars().all()
    autores = await nombres_usuarios(sesion, {m.autor_id for m in filas if m.autor_id})
    return [mensaje_dict(m, autores) for m in filas]


async def total_no_leidos(sesion: AsyncSession, usuario: Usuario) -> int:
    """Para el contador junto a la campana: los canales silenciados no suman."""
    return sum(c["no_leidos"] for c in await canales_de(sesion, usuario) if not c.get("silenciado"))


# --- gancho de las reglas (fase 7 → 8) -----------------------------------------------------------


def usa_redaccion(regla) -> bool:
    """¿El mensaje se escribe con el formato del equipo (`redaccion_chat`)? Sí, si la regla no tiene
    texto o conserva el de fábrica; no, si quien administra lo cambió (su plantilla manda)."""
    from app.servicios.eventos_sistema import FABRICA as REGLAS

    texto = (regla.texto or "").strip()
    if not texto:
        return True
    de_fabrica = next((r for r in REGLAS if r["de_fabrica"] == (regla.de_fabrica or "")), None)
    return bool(de_fabrica and de_fabrica["texto"].strip() == texto)


async def publicar_por_regla(sesion: AsyncSession, regla, evento) -> str:
    """Acción `publicar` de una regla: el canal es `canal:<id>` o `canal:<clave>` (general,
    recibidos, documentos…). El mensaje lleva el texto de la plantilla (o qué pasó y sus datos),
    la entidad del evento y la acción de abrirla."""
    from app.servicios.eventos_sistema import VOCABULARIO

    destino = (regla.destino or "")[6:] if (regla.destino or "").startswith("canal:") else ""
    canal = None
    if destino.isdigit():
        canal = (await sesion.execute(select(Canal).where(Canal.id == int(destino)))).scalar_one_or_none()
    elif destino:
        canal = await canal_por_clave(sesion, destino)
    if canal is None or canal.archivado:
        return "publicar→(canal no existe)"
    from app.servicios import redaccion_chat

    que = VOCABULARIO.get(evento.nombre, {}).get("que", evento.nombre)
    # Escrito como lo escribía el equipo en Telegram (2026-10-18; `redaccion_chat.py`), salvo que quien
    # administra haya cambiado el texto de la regla: entonces manda su plantilla.
    humano = await redaccion_chat.componer(sesion, evento.nombre, evento.entidad, evento.datos) if usa_redaccion(regla) else ""
    cuerpo = humano or texto_automatico(que, evento.datos, regla.texto)
    acciones = [{"texto": "Abrir", "entidad": evento.entidad}] if evento.entidad else []
    if not acciones and (evento.datos or {}).get("ruta"):  # un resumen sin entidad (la programación del día)
        acciones = [{"texto": "Abrir", "ruta": str(evento.datos["ruta"])}]
    tarjeta = tarjeta_de(evento.nombre, evento.datos, cuerpo)
    if humano:
        tarjeta = {**tarjeta, "estilo": "mensaje", "firma": redaccion_chat.firma_de(evento.nombre)}
    m = await publicar(sesion, canal, autor=None, texto=cuerpo, entidad=evento.entidad, evento_sistema_id=evento.id, acciones=acciones,
                       tarjeta=tarjeta)
    return f"publicar→canal:{canal.id}:mensaje:{m.id}"


def regla_del_mensaje(acciones: list[str] | None, mensaje_id: int) -> int | None:
    """La regla que publicó un mensaje, leída de `eventos_sistema.acciones`
    («21:publicar→canal:33:mensaje:812»)."""
    for x in acciones or []:
        m = re.match(r"^(\d+):publicar→canal:\d+:mensaje:(\d+)$", str(x))
        if m and int(m.group(2)) == mensaje_id:
            return int(m.group(1))
    return None


async def redactar_avisos_viejos(sesion: AsyncSession) -> int:
    """UNA VEZ (2026-10-18; ajuste `chat_avisos_redactados`): lo que el sistema publicó antes con la
    tarjeta corta pasa al formato del equipo (`redaccion_chat`), con la entidad de hoy y la fecha de
    entonces (los «8 días» del plazo se cuentan desde el día del aviso). Se respeta la regla con texto
    propio y lo que no tiene evento ni es un anuncio de tarea o actividad (las contestaciones del chat
    a un bloque pegado). Commit propio. → cuántos mensajes cambió."""
    from app.modelos import Ajuste, EventoSistema, ReglaEvento
    from app.servicios import redaccion_chat

    if await sesion.get(Ajuste, {"despacho_id": 1, "clave": "chat_avisos_redactados"}):
        return 0
    filas = (await sesion.execute(select(Mensaje).where(Mensaje.autor_id.is_(None), Mensaje.eliminado_en.is_(None)).order_by(Mensaje.id))).scalars().all()
    ids = {m.evento_sistema_id for m in filas if m.evento_sistema_id}
    eventos = {e.id: e for e in (await sesion.execute(select(EventoSistema).where(EventoSistema.id.in_(ids)))).scalars()} if ids else {}
    reglas = {r.id: r for r in (await sesion.execute(select(ReglaEvento))).scalars()}
    cambiados = 0
    for m in filas:
        e = eventos.get(m.evento_sistema_id or 0)
        if (m.tarjeta or {}).get("estilo") == "mensaje":
            if e is not None:  # ya escrito así: solo se pone al día su ícono (el del seguimiento nació sin el suyo)
                m.tarjeta = {**tarjeta_de(e.nombre, e.datos, m.texto), "estilo": "mensaje", "firma": m.tarjeta.get("firma") or redaccion_chat.firma_de(e.nombre)}
            continue
        texto, firma, tarjeta = "", "", {}
        if e is not None:
            regla = reglas.get(regla_del_mensaje(e.acciones, m.id) or 0)
            if regla is not None and not usa_redaccion(regla):
                continue
            texto = await redaccion_chat.componer(sesion, e.nombre, e.entidad, e.datos, m.creado_en)
            firma, tarjeta = redaccion_chat.firma_de(e.nombre), tarjeta_de(e.nombre, e.datos, m.texto)
        elif re.match(r"^(tarea|evento):\d+$", m.entidad or "") and (m.texto or "").startswith(("Tarea creada: ", "Actividad agendada: ")):
            texto = await redaccion_chat.anuncio(sesion, m.entidad, m.creado_en)
            firma, tarjeta = redaccion_chat.firma_de_entidad(m.entidad), tarjeta_de("", {}, m.texto)
        if texto:
            m.texto = texto
            m.tarjeta = {**(m.tarjeta or tarjeta), "estilo": "mensaje", "firma": firma}
            cambiados += 1
    sesion.add(Ajuste(despacho_id=1, clave="chat_avisos_redactados", valor={"mensajes": cambiados, "fecha": datetime.now(timezone.utc).isoformat()}))
    await sesion.commit()
    log.info("Avisos del chat reescritos con el formato del equipo: %s", cambiados)
    return cambiados


async def refrescar_mensajes_de(sesion: AsyncSession, entidad: str) -> int:
    """La entidad cambió (otra hora, otro nombre, otro asunto, otro responsable): los mensajes que el
    sistema escribió sobre ella se RECOMPONEN con lo vigente (2026-10-18, Edison: «los mensajes
    automáticos se actualizan cuando cambia el registro vinculado, sin duplicar mensajes»).

    Un mensaje por hecho, siempre el mismo: se reescriben `texto` y `tarjeta` desde su evento
    (`redaccion_chat.componer`, con la fecha de entonces) o desde su anuncio (`redaccion_chat.anuncio`),
    con las mismas reglas que la reescritura de arranque; `tarjeta.actualizado_en` dice que el sistema lo
    puso al día (no es «editado»: nadie lo editó). Lo cambiado se difunde como `mensaje_editado`, que la
    web ya funde en vivo. Sin commit (va dentro de la transacción de quien cambió la entidad); nunca hace
    fallar a quien llama. → cuántos mensajes cambió."""
    from app.modelos import EventoSistema, ReglaEvento
    from app.servicios import redaccion_chat

    if not re.match(r"^[a-z]+:\d+$", entidad or ""):
        return 0
    try:
        filas = (await sesion.execute(select(Mensaje).where(
            Mensaje.entidad == entidad, Mensaje.autor_id.is_(None), Mensaje.eliminado_en.is_(None)).order_by(Mensaje.id))).scalars().all()
        filas = [m for m in filas if (m.tarjeta or {}).get("estilo") == "mensaje"]
        if not filas:
            return 0
        ids = {m.evento_sistema_id for m in filas if m.evento_sistema_id}
        eventos = {e.id: e for e in (await sesion.execute(select(EventoSistema).where(EventoSistema.id.in_(ids)))).scalars()} if ids else {}
        reglas: dict[int, ReglaEvento] | None = None
        cambiados = 0
        canales: dict[int, list[Mensaje]] = {}
        for m in filas:
            e = eventos.get(m.evento_sistema_id or 0)
            texto = ""
            if e is not None:
                if reglas is None:
                    reglas = {r.id: r for r in (await sesion.execute(select(ReglaEvento))).scalars()}
                regla = reglas.get(regla_del_mensaje(e.acciones, m.id) or 0)
                if regla is not None and not usa_redaccion(regla):
                    continue
                texto = await redaccion_chat.componer(sesion, e.nombre, e.entidad, e.datos, m.creado_en)
                tarjeta = tarjeta_de(e.nombre, e.datos, texto or m.texto)
            elif re.match(r"^(tarea|evento):\d+$", m.entidad or ""):
                texto = await redaccion_chat.anuncio(sesion, m.entidad, m.creado_en)
                tarjeta = tarjeta_de("", {}, texto or m.texto)
            else:
                continue
            if not texto or texto == m.texto:
                continue
            m.texto = texto
            m.tarjeta = {**(m.tarjeta or {}), **{k: v for k, v in tarjeta.items() if k in ("que", "icono", "titulo", "detalle", "meta")},
                         "estilo": "mensaje", "actualizado_en": datetime.now(timezone.utc).isoformat()}
            canales.setdefault(m.canal_id, []).append(m)
            cambiados += 1
        for cid, ms in canales.items():
            c = await sesion.get(Canal, cid)
            if c is None:
                continue
            lectores = await lectores_de(sesion, c)
            archivos = await archivos_de(sesion, [m.id for m in ms])
            for m in ms:
                difusor.publicar(lectores, {"tipo": "mensaje_editado", "canal_id": cid, "mensaje": mensaje_dict(m, {}, archivos.get(m.id))})
        return cambiados
    except Exception:  # noqa: BLE001 — un aviso desactualizado no puede tumbar el cambio de la entidad
        log.exception("No se pudieron refrescar los mensajes de %s", entidad)
        return 0


# --- adjuntos subidos desde el chat (2026-10-12, fase 9.1) -------------------------------------------

MAX_ADJUNTO = 50 * 1024 * 1024


def ruta_archivo(relativa: str):
    """Ruta absoluta de un archivo subido al chat (relativa a la raíz documental, carpeta `chat/`)."""
    from pathlib import Path

    from app.config import raiz_documentos

    if not relativa:
        return None
    raiz = raiz_documentos().resolve()
    ruta = (raiz / relativa).resolve()
    return ruta if raiz in ruta.parents and ruta.is_file() else None


def guardar_archivo(origen, nombre: str) -> tuple[str, str, int]:
    """Mueve el archivo subido a `chat/AAAA-MM/<sha8>_<nombre>` bajo la raíz documental.
    → (ruta relativa, sha256, bytes)."""
    import hashlib
    import re as _re
    import shutil
    from datetime import date
    from pathlib import Path

    from app.config import raiz_documentos

    h = hashlib.sha256()
    with Path(origen).open("rb") as fh:
        for trozo in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(trozo)
    sha = h.hexdigest()
    limpio = _re.sub(r"[^\w.\-() ]+", "_", Path(nombre).name)[:150] or "archivo"
    carpeta = raiz_documentos() / "chat" / date.today().strftime("%Y-%m")
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / f"{sha[:8]}_{limpio}"
    if not destino.exists():
        shutil.move(str(origen), str(destino))
    else:
        Path(origen).unlink(missing_ok=True)
    return str(destino.relative_to(raiz_documentos())), sha, destino.stat().st_size


def acciones_de_archivo(archivo: MensajeArchivo, con_bloque_recibido: bool = False) -> list[dict]:
    """Qué ofrece el sistema con un archivo subido: registrarlo en Recibidos (documento) o en la
    Mediateca (foto o video).

    Una IMAGEN del chat es conversación (2026-10-18, Edison: «al enviar una imagen el chat dice que debe
    registrarse en Mesa de Partes»): una captura o una foto no exige registro; se ofrece guardarla en la
    Mediateca, como cualquier foto. Solo cuenta como documento recibido cuando el mensaje trae el bloque
    `documento-recibido` (`con_bloque_recibido`): ahí la foto ES el documento escaneado. Un PDF o un
    Word siempre son documento."""
    from app.servicios.ingreso import clasificar

    if es_nota_de_voz(archivo.nombre):  # una nota de voz se queda en el chat (no es un video de la Mediateca)
        return []
    clase = clasificar(archivo.nombre, como_foto=not con_bloque_recibido)
    if clase == "" and not con_bloque_recibido:
        clase = clasificar(archivo.nombre, como_foto=False)   # .pdf, .docx…: documento aunque la imagen no lo sea
        if clase == "foto":
            clase = ""
    if clase == "recibido":
        return [{"texto": "Registrar en Mesa de Partes", "accion": "archivo_a_recibidos", "archivo_id": archivo.id}]
    if clase == "foto":
        return [{"texto": "Guardar en la Mediateca", "accion": "archivo_a_mediateca", "archivo_id": archivo.id}]
    return []


def trae_bloque_recibido(texto: str | None) -> bool:
    """¿El texto del mensaje trae un bloque `documento-recibido` válido? (sus imágenes son el documento)."""
    le = reconocer(texto or "")
    return bool(le is not None and le.valido and le.tipo == "documento-recibido")


# --- el chat reconoce un resultado de prompt pegado (2026-10-12, fase 9.3) ----------------------

RUTA_MODULO = {
    "documento-recibido": ("Mesa de Partes", "/recibidos?subir=1&pegar={mid}"),
    "agenda-actividades": ("Agenda", "/agenda?pegar={mid}"),
    "seguimiento-documento": ("Seguimiento", "/documentos?pegar={mid}"),
    "registro-representacion": ("Semana de representación", "/informes?pegar={mid}"),
    "proyecto-de-ley": ("Proyectos de ley", "/proyectos?pegar={mid}"),
    "documento-administrativo": ("Nuevo documento", "/documentos?nuevo=1&pegar={mid}"),
    "pieza-de-prensa": ("Prensa", "/prensa?ver=piezas&pegar={mid}"),
    "plan-de-tareas": ("Tareas", "/tareas?pegar={mid}"),
    # Rendición de cuentas (2026-10-18): los comprobantes leídos de las fotos van a la rendición abierta.
    "comprobantes-gasto": ("Rendición de cuentas", "/rendiciones?pegar={mid}"),
}
# Lo que el chat puede registrar solo (sin abrir el módulo), con un toque en «Registrar».
REGISTRABLES = ("agenda-actividades", "pieza-de-prensa", "seguimiento-documento", "documento-recibido")
# Lo que se registra revisándolo en un diálogo DENTRO del chat (fase 9.6): el plan de tareas pide casar
# responsables y plazos antes de crear, así que «Registrar en Tareas» abre «Pegar tareas» con el texto
# del mensaje (`componentes/tareas/DialogoPegarTareas.tsx`) en vez de crear a ciegas.
EN_EL_CHAT = {"plan-de-tareas": "pegar_tareas"}


def reconocer(texto: str):
    """La Lectura si el texto trae un bloque `tipo: …` válido; None si no hay bloque. Un bloque
    con errores devuelve la Lectura con `errores` (para decirlo en el chat)."""
    from app.servicios import pegado

    bloque, _ = pegado.extraer_bloque(texto)
    if not bloque:
        return None
    return pegado.interpretar(texto)


def respuesta_reconocido(lectura, mensaje_id: int, con_pdf: bool) -> tuple[str, list[dict]]:
    """Texto y acciones del mensaje del sistema que contesta a un bloque pegado."""
    if not lectura.valido:
        return ("No pude leer el bloque: " + (lectura.errores[0] if lectura.errores else "formato desconocido"), [])
    modulo, ruta = RUTA_MODULO.get(lectura.tipo, (lectura.esquema.titulo if lectura.esquema else lectura.tipo, ""))
    v = lectura.valores
    resumen = ""
    if lectura.tipo == "agenda-actividades":
        n = len(v.get("actividades") or [])
        resumen = f"{n} actividad(es): " + "; ".join(str(a.get("titulo") or "")[:50] for a in (v.get("actividades") or [])[:3])
    elif lectura.tipo == "registro-representacion":
        resumen = f"{len(v.get('actividades') or [])} actividad(es) y {len(v.get('pedidos') or [])} pedido(s)"
    elif lectura.tipo == "plan-de-tareas":
        tareas = v.get("tareas") or []
        resumen = f"{len(tareas)} tarea(s): " + "; ".join(str(t.get("titulo") or "")[:50] for t in tareas[:3]) if tareas else ""
    else:
        resumen = str(v.get("titular") or v.get("asunto") or v.get("titulo") or v.get("documento") or "")[:90]
    texto = f"Reconocí un formato «{lectura.esquema.titulo if lectura.esquema else lectura.tipo}»" + (f": {resumen}." if resumen else ".")
    acciones: list[dict] = []
    if lectura.tipo in EN_EL_CHAT:
        # Una sola acción: revisar y registrar en el mismo chat (no además «Abrir en … y revisar»).
        return texto, [{"texto": f"Registrar en {modulo}", "accion": EN_EL_CHAT[lectura.tipo], "mensaje_id": mensaje_id}]
    if lectura.tipo in REGISTRABLES and (lectura.tipo != "documento-recibido" or con_pdf):
        acciones.append({"texto": f"Registrar en {modulo}", "accion": "registrar", "mensaje_id": mensaje_id})
    elif lectura.tipo == "documento-recibido":
        texto += " Adjunte el PDF o la foto del documento en este mismo mensaje para registrarlo desde aquí."
    if ruta:
        acciones.append({"texto": f"Abrir en {modulo} y revisar", "ruta": ruta.format(mid=mensaje_id)})
    return texto, acciones


async def registrar_desde_mensaje(sesion: AsyncSession, mensaje: Mensaje, usuario: Usuario) -> tuple[str, str]:
    """Registra en el módulo lo que el bloque del mensaje trae (los tipos REGISTRABLES). → (texto
    para el chat, entidad creada). Lanza ValueError con el motivo si no se puede. Hace commit."""
    from app.modelos import Pegado
    from app.servicios import eventos_sistema

    le = reconocer(mensaje.texto)
    if le is None or not le.valido:
        raise ValueError("El mensaje no trae un bloque válido.")
    if le.tipo not in REGISTRABLES:
        raise ValueError("Ese formato se registra desde su módulo («Abrir y revisar»).")
    pegado = Pegado(usuario_id=usuario.id, tipo=le.tipo, version=le.version or 1, fuente=le.fuente, texto=mensaje.texto,
                    campos_propuestos=le.valores, campos_aplicados={}, rechazados=[], entidad="")
    sesion.add(pegado)
    await sesion.flush()
    v = le.valores
    texto, entidad = "", ""
    if le.tipo == "agenda-actividades":
        from app.api.agenda import EventoEntrada, _aplicar, _validar
        from app.modelos_tareas import EventoAgenda
        from app.servicios import tareas as svc_tareas

        creados, existentes = [], []
        for a in v.get("actividades") or []:
            inicio = a["inicio"] if "T" in a["inicio"] else f"{a['inicio']}T00:00:00"
            todo = bool(a.get("todo_el_dia")) or "T" not in a["inicio"]
            ya = await svc_tareas.evento_parecido(sesion, a.get("titulo") or "", inicio, todo)
            if ya:
                existentes.append(ya["titulo"])
                continue
            from datetime import datetime as _dt

            from app.servicios.agenda_reglas import estado_de_pegado

            datos = EventoEntrada(titulo=a["titulo"][:300], descripcion=a.get("descripcion") or "", tipo=a.get("tipo") or "otro", inicio=_dt.fromisoformat(inicio),
                                  estado=estado_de_pegado(a.get("confirmacion")),
                                  fin=_dt.fromisoformat(a["fin"]) if a.get("fin") and "T" in a["fin"] else None, todo_el_dia=todo,
                                  lugar=(a.get("lugar") or "")[:300], modalidad=a.get("modalidad") or "presencial", enlace=a.get("enlace") or "",
                                  recordatorio_minutos=a.get("recordatorio"))
            _validar(datos)
            e = EventoAgenda(creado_por=usuario.id, actualizado_por=usuario.id, excepciones=[], origen="chat")
            _aplicar(e, datos)
            sesion.add(e)
            await sesion.flush()
            creados.append(e)
            # Como al agendar desde la Agenda: el tema «Agenda» lo cuenta (2026-10-18; antes lo agendado desde el chat no
            # salía), y solo si está confirmado: lo que espera confirmación va a «Por confirmar».
            await svc_tareas.anunciar_evento(sesion, e, usuario)
        entidad = f"evento:{creados[0].id}" if creados else ""
        pendientes = sum(1 for e in creados if e.estado == "propuesto")
        texto = (f"Agendé {len(creados)} actividad(es)" if creados else "No agendé nada") + (f" ({pendientes} por confirmar)" if pendientes else "") \
            + (f"; {len(existentes)} ya estaba(n): {', '.join(existentes)[:120]}" if existentes else "") + "."
        pegado.campos_aplicados = {"eventos": [e.id for e in creados]}
    elif le.tipo == "pieza-de-prensa":
        from app.api.prensa import crear_pieza_desde

        campos = {k: val for k, val in v.items() if k not in ("observaciones", "documento")}
        pieza = await crear_pieza_desde(sesion, campos, usuario, origen="chat", pegado_id=pegado.id)
        entidad = f"pieza:{pieza.id}"
        texto = f"Registré la pieza de prensa «{pieza.titular[:80]}» ({pieza.clase.replace('_', ' ')})."
        pegado.campos_aplicados = campos
        await eventos_sistema.emitir_seguro(sesion, "prensa.pieza_registrada", entidad, {"titular": pieza.titular, "clase": pieza.clase, "fuente": pieza.fuente, "accion_sugerida": pieza.accion_sugerida, "responsable_id": None}, usuario=usuario)
    elif le.tipo == "seguimiento-documento":
        import re as _re

        from app.api.seguimiento import ActuacionPegada, AplicarSeguimiento, aplicar_seguimiento, pegar_seguimiento, PegarSeguimiento
        from app.modelos import Documento

        cifras = _re.findall(r"\d{3,}", v.get("documento") or "")
        doc = None
        if cifras:
            doc = (await sesion.execute(select(Documento).where(Documento.numero == int(cifras[0].lstrip("0") or 0)).order_by(Documento.id.desc()))).scalars().first()
        if doc is None:
            raise ValueError(f"No encuentro el documento «{v.get('documento')}»: ábralo y pegue el seguimiento allí.")
        vista = await pegar_seguimiento(doc.id, PegarSeguimiento(texto=mensaje.texto), usuario, sesion)
        cuerpo = AplicarSeguimiento(
            expediente_entidad=vista["propuesto"]["expediente_entidad"] or None, plazo_legal=vista["propuesto"]["plazo_legal"] or None,
            actuaciones=[ActuacionPegada(fecha=a["fecha"], clase=a["clase"], texto=a["texto"], fuente=a.get("fuente") or "") for a in vista["actuaciones"] if a["estado"] == "nuevo"],
            vincular_entradas=[r["entrada"]["id"] for r in vista["respuestas"] if r["estado"] == "hallada"], tarea=vista["tarea"], pegado=None,
            situacion=vista["propuesto"],
        )
        hecho = await aplicar_seguimiento(doc.id, cuerpo, usuario, sesion)
        entidad = f"doc:{doc.id}"
        texto = f"Seguimiento de {vista['numero']}: {hecho['actuaciones']} actuación(es) por confirmar, {hecho['vinculadas']} respuesta(s) vinculada(s)" + (", tarea de revisión creada" if hecho.get("tarea_id") else "") + "."
        pegado.campos_aplicados = cuerpo.model_dump(exclude={"pegado"})
    elif le.tipo == "documento-recibido":
        from app.servicios import ingreso

        archivos = (await sesion.execute(select(MensajeArchivo).where(MensajeArchivo.mensaje_id == mensaje.id))).scalars().all()
        pdf = next((a for a in archivos if ingreso.clasificar(a.nombre) == "recibido" and a.archivo), None)
        if pdf is None:
            raise ValueError("Adjunte el PDF o la foto del documento en el mensaje para registrarlo desde aquí.")
        ruta = ruta_archivo(pdf.archivo)
        if ruta is None:
            raise ValueError("El archivo del mensaje ya no está en el archivo documental.")
        import shutil
        import tempfile
        from pathlib import Path as _Path

        from app.servicios import pegado as svc_pegado
        from app.servicios.pegado.asignar import con_anexos

        copia = _Path(tempfile.mkdtemp(prefix="sgdp-chat-")) / pdf.nombre
        shutil.copy(ruta, copia)
        campos, anexos, _ = svc_pegado.asignar(le)
        campos = con_anexos(campos, anexos)
        eid, texto = await ingreso.a_recibidos(sesion, copia, pdf.nombre, usuario, f"Llegó por el chat ({usuario.nombre_completo}).", campos)
        if eid is None:
            raise ValueError(texto)
        entidad = f"entrada:{eid}"
        pegado.campos_aplicados = campos
    pegado.entidad = entidad
    await sesion.commit()
    return texto, entidad


async def reaccionar(sesion: AsyncSession, mensaje: Mensaje, usuario: Usuario, emoji: str) -> list[dict]:
    """Alterna la reacción de la persona; devuelve el resumen [{emoji, n, mia}] del mensaje."""
    fila = (await sesion.execute(select(MensajeReaccion).where(MensajeReaccion.mensaje_id == mensaje.id, MensajeReaccion.usuario_id == usuario.id, MensajeReaccion.emoji == emoji))).scalar_one_or_none()
    if fila:
        await sesion.delete(fila)
    else:
        sesion.add(MensajeReaccion(mensaje_id=mensaje.id, usuario_id=usuario.id, emoji=emoji))
    await sesion.flush()
    return (await reacciones_de(sesion, [mensaje.id], usuario.id)).get(mensaje.id, [])


async def reacciones_de(sesion: AsyncSession, ids: list[int], usuario_id: int) -> dict[int, list[dict]]:
    """{mensaje_id: [{emoji, n, mia}]} para los mensajes dados."""
    if not ids:
        return {}
    filas = (await sesion.execute(select(MensajeReaccion).where(MensajeReaccion.mensaje_id.in_(ids)).order_by(MensajeReaccion.id))).scalars().all()
    por: dict[int, dict[str, dict]] = {}
    for r in filas:
        d = por.setdefault(r.mensaje_id, {}).setdefault(r.emoji, {"emoji": r.emoji, "n": 0, "mia": False})
        d["n"] += 1
        if r.usuario_id == usuario_id:
            d["mia"] = True
    return {mid: list(v.values()) for mid, v in por.items()}


# --- encuestas (2026-10-12, fase 9.6) ---------------------------------------------------------------

MIN_OPCIONES, MAX_OPCIONES = 2, 10


def limpiar_opciones(opciones: list[str]) -> list[str]:
    """Las opciones sin blancos ni repetidas (sin distinguir mayúsculas), en su orden. Lanza
    ValueError si quedan menos de 2 o más de 10."""
    vistas: set[str] = set()
    salida: list[str] = []
    for o in opciones or []:
        t = " ".join(str(o or "").split())[:120]
        if t and t.lower() not in vistas:
            vistas.add(t.lower())
            salida.append(t)
    if len(salida) < MIN_OPCIONES:
        raise ValueError("Una encuesta necesita al menos dos opciones distintas.")
    if len(salida) > MAX_OPCIONES:
        raise ValueError("Una encuesta admite hasta diez opciones.")
    return salida


def aplicar_voto(actuales: set[int], opcion: int, multiple: bool, n_opciones: int) -> set[int]:
    """Lo que la persona queda votando tras tocar `opcion`: tocar lo ya votado lo quita; en una
    de respuesta única, tocar otra la reemplaza; en una de varias, se suman. Lanza ValueError si
    la opción no existe."""
    if not 0 <= opcion < n_opciones:
        raise ValueError("Esa opción no existe en la encuesta.")
    if opcion in actuales:
        return set(actuales) - {opcion}
    return (set(actuales) | {opcion}) if multiple else {opcion}


def encuesta_cerrada(cerrada: bool, cierra_en: datetime | None, ahora: datetime | None = None) -> bool:
    return bool(cerrada) or bool(cierra_en and cierra_en <= (ahora or datetime.now(timezone.utc)))


def resumen_encuesta(e, votos: list[tuple[int, int]], nombres: dict[int, str], yo: int | None, ahora: datetime | None = None) -> dict:
    """Lo que la web pinta de una encuesta: por opción, cuántos votos, el porcentaje (sobre
    quienes votaron), si es la mía y, si no es anónima, quiénes. `votos` = [(usuario_id, opcion)]."""
    opciones = list(e.opciones or [])
    votantes = {u for u, _ in votos}
    total = len(votantes)
    filas = []
    for i, texto in enumerate(opciones):
        quienes = [u for u, o in votos if o == i]
        filas.append({
            "texto": texto, "votos": len(quienes), "porcentaje": round(100 * len(quienes) / total) if total else 0,
            "mia": yo is not None and yo in quienes,
            "votantes": [] if e.anonima else [{"id": u, "nombre": nombres.get(u, "")} for u in quienes],
        })
    return {
        "id": e.id, "mensaje_id": e.mensaje_id, "pregunta": e.pregunta, "multiple": bool(e.multiple), "anonima": bool(e.anonima),
        "cierra_en": e.cierra_en.isoformat() if e.cierra_en else None, "cerrada": encuesta_cerrada(e.cerrada, e.cierra_en, ahora),
        "creado_por": e.creado_por, "votantes": total, "opciones": filas,
    }


async def encuestas_de(sesion: AsyncSession, mensaje_ids: list[int], yo: int | None) -> dict[int, dict]:
    """{mensaje_id: resumen} de las encuestas de esos mensajes (vistas por `yo`)."""
    from app.modelos_chat import Encuesta, EncuestaVoto

    if not mensaje_ids:
        return {}
    encuestas = (await sesion.execute(select(Encuesta).where(Encuesta.mensaje_id.in_(mensaje_ids)))).scalars().all()
    if not encuestas:
        return {}
    votos: dict[int, list[tuple[int, int]]] = {}
    for v in (await sesion.execute(select(EncuestaVoto).where(EncuestaVoto.encuesta_id.in_([e.id for e in encuestas])).order_by(EncuestaVoto.id))).scalars():
        votos.setdefault(v.encuesta_id, []).append((v.usuario_id, v.opcion))
    publicas = {u for e in encuestas if not e.anonima for u, _ in votos.get(e.id, [])}
    nombres = await nombres_usuarios(sesion, publicas)
    return {e.mensaje_id: resumen_encuesta(e, votos.get(e.id, []), nombres, yo) for e in encuestas}


async def difundir_encuesta(sesion: AsyncSession, canal: Canal, mensaje_id: int) -> None:
    """Los resultados al día a cada pestaña conectada que lee el canal, cada una con SU «mía»
    (por eso se publica persona por persona, no un solo dict para todos)."""
    for uid in (await lectores_de(sesion, canal)) & difusor.conectados():
        r = (await encuestas_de(sesion, [mensaje_id], uid)).get(mensaje_id)
        if r:
            difusor.publicar({uid}, {"tipo": "encuesta", "canal_id": canal.id, "mensaje_id": mensaje_id, "encuesta": r})


# --- notas de voz (2026-10-12, fase 9.6) ------------------------------------------------------------

EXT_AUDIO = {".webm", ".weba", ".ogg", ".oga", ".opus", ".m4a", ".mp4", ".aac", ".mp3", ".wav", ".flac", ".amr", ".3gp"}


def es_nota_de_voz(nombre: str) -> bool:
    """Lo que graba el micrófono del chat se llama `nota-de-voz-AAAAMMDD-HHMMSS.<webm|m4a|ogg>`."""
    from pathlib import Path

    p = Path(nombre or "")
    return p.name.lower().startswith("nota-de-voz") and p.suffix.lower() in EXT_AUDIO


def tipo_de_archivo(nombre: str) -> str:
    """El Content-Type con que se sirve un adjunto: una nota de voz `.webm` es audio, no video."""
    import mimetypes
    from pathlib import Path

    ext = Path(nombre or "").suffix.lower()
    if es_nota_de_voz(nombre) and ext == ".webm":
        return "audio/webm"
    return {".weba": "audio/webm", ".opus": "audio/ogg", ".oga": "audio/ogg", ".m4a": "audio/mp4", ".amr": "audio/amr"}.get(ext) \
        or mimetypes.guess_type(nombre or "")[0] or "application/octet-stream"


def arreglar_nota_de_voz(ruta) -> int | None:
    """MediaRecorder escribe un webm sin duración ni índice (Chrome no puede adelantarlo y muestra
    «Infinity»): si hay ffmpeg, se reempaqueta sin recodificar (`-c copy`), que escribe ambos, y
    se mide la duración con ffprobe. Mejor esfuerzo: sin ffmpeg o si falla, el archivo queda como
    llegó. → duración en ms, o None."""
    import shutil
    import subprocess
    from pathlib import Path

    ruta = Path(ruta)
    if not shutil.which("ffprobe"):
        return None
    try:
        if ruta.suffix.lower() == ".webm" and shutil.which("ffmpeg"):
            tmp = ruta.with_name(ruta.stem + ".remux.webm")
            r = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(ruta), "-c", "copy", str(tmp)], capture_output=True, timeout=60)
            if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
                tmp.replace(ruta)
            else:
                tmp.unlink(missing_ok=True)
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(ruta)], capture_output=True, text=True, timeout=30)
        segundos = float((r.stdout or "").strip() or "nan")
        return int(segundos * 1000) if segundos == segundos and segundos > 0 else None
    except (OSError, ValueError, subprocess.SubprocessError):
        log.warning("No se pudo arreglar la nota de voz %s", ruta.name)
        return None


# --- tareas y actividades creadas desde el chat (2026-10-12, fase 9.6) --------------------------------

_DIAS = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")


def cuando_legible(fecha: datetime | None, con_hora: bool = True) -> str:
    """«lun 14/10 10:30» en la hora de la entidad; sin hora, «lun 14/10»."""
    if fecha is None:
        return ""
    from zoneinfo import ZoneInfo

    from app.config import config

    local = fecha.astimezone(ZoneInfo(config.zona_horaria or "America/Lima")) if fecha.tzinfo else fecha
    base = f"{_DIAS[local.weekday()]} {local:%d/%m}"
    return f"{base} {local:%H:%M}" if con_hora else base


def texto_anuncio(clase: str, titulo: str, cuando: str = "", responsable: str = "", lugar: str = "") -> str:
    """El mensaje del sistema cuando alguien crea una tarea o agenda una actividad desde el chat:
    «Tarea creada: Revisar el oficio · vence lun 14/10 · Ana»."""
    if clase == "tarea":
        partes = [f"Tarea creada: {titulo}"] + ([f"vence {cuando}"] if cuando else []) + ([responsable] if responsable else [])
    else:
        partes = [f"Actividad agendada: {titulo}"] + ([cuando] if cuando else []) + ([lugar] if lugar else [])
    return " · ".join(partes)

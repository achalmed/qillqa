"""backend/app/servicios/avisos_chat.py — LO QUE QILLQA DICE EN EL CHAT (fase 10.2b, Rimay R1, 2026-10-20).

El chat (proyecto Rimay) guarda, difunde y muestra los mensajes; QUÉ dice el sistema cuando pasa algo es de Qillqa,
porque habla de sus documentos, recibidos, proyectos y semanas: la tarjeta de cada evento, el texto «como lo
escribía el equipo» (`redaccion_chat.py`), la recomposición cuando cambia lo vinculado y la reescritura única de los
avisos viejos. Todo llega al chat por su contrato, «conversaciones.v1»:

- una regla `publicar` compone el mensaje en la transacción del evento y lo deja en la bandeja de salida de Qillqa
  (`eventos_bandeja.salida`, «conversaciones.publicar»); tras el commit el repartidor se lo entrega al chat, que lo
  publica en su sesión (a lo sumo ~2 s después; Edison lo aceptó el 2026-10-20);
- lo vinculado cambió: se recomponen sus mensajes y se envían como «conversaciones.actualizar», también tras el
  commit (si quien cambió la entidad deshace, el mensaje no cambia);
- lo que el chat pide para escribir (el anuncio de una tarea o una actividad, la tarjeta de un aviso viejo) Qillqa
  lo ofrece como «redaccion.v1».

Las reglas puras (tarjetas, texto automático, la regla de un mensaje) se prueban en tests/test_chat_avisos.py,
test_chat.py y test_redaccion_chat.py.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tiqsi.modulo import opcional

from app.servicios.contratos_plataforma import Superficie
from app.servicios.eventos_bandeja import salida

log = logging.getLogger("qillqa.chat")

_DIAS = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")


def cuando_legible(fecha: datetime | None, con_hora: bool = True) -> str:
    """«lun 14/10 10:30» en la hora de la entidad; sin hora, «lun 14/10» (la misma regla que el chat)."""
    if fecha is None:
        return ""
    from zoneinfo import ZoneInfo

    from app.config import config

    local = fecha.astimezone(ZoneInfo(config.zona_horaria or "America/Lima")) if fecha.tzinfo else fecha
    base = f"{_DIAS[local.weekday()]} {local:%d/%m}"
    return f"{base} {local:%H:%M}" if con_hora else base


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


def usa_redaccion(regla) -> bool:
    """¿El mensaje se escribe con el formato del equipo (`redaccion_chat`)? Sí, si la regla no tiene
    texto o conserva el de fábrica; no, si quien administra lo cambió (su plantilla manda)."""
    from app.servicios.eventos_sistema import FABRICA as REGLAS

    texto = (regla.texto or "").strip()
    if not texto:
        return True
    de_fabrica = next((r for r in REGLAS if r["de_fabrica"] == (regla.de_fabrica or "")), None)
    return bool(de_fabrica and de_fabrica["texto"].strip() == texto)



# --- la regla «publicar» ---------------------------------------------------------------------------------------


_PUBLICADO = re.compile(r"^(\d+):publicar→canal:(\d+)(?::mensaje:(\d+))?$")


def regla_del_mensaje(acciones: list[str] | None, mensaje_id: int, canal_id: int | None = None) -> int | None:
    """La regla que publicó un mensaje, leída de `eventos_sistema.acciones`. Hasta Rimay R1 la acción decía el
    mensaje («21:publicar→canal:33:mensaje:812»); desde R1 el chat lo escribe después del commit y la acción dice
    solo el canal («21:publicar→canal:33»): entonces se reconoce por el canal del mensaje."""
    for x in acciones or []:
        m = _PUBLICADO.match(str(x))
        if not m:
            continue
        if m.group(3) is not None:
            if int(m.group(3)) == mensaje_id:
                return int(m.group(1))
        elif canal_id is not None and int(m.group(2)) == canal_id:
            return int(m.group(1))
    return None


def _destino(regla) -> str:
    return (regla.destino or "")[6:] if (regla.destino or "").startswith("canal:") else ""


async def publicar_por_regla(sesion: AsyncSession, regla, evento) -> str:
    """Acción `publicar` de una regla: el canal es `canal:<id>` o `canal:<clave>` (general, recibidos, documentos…).
    El mensaje lleva el texto de la plantilla (o qué pasó y sus datos), la entidad del evento y la acción de abrirla.
    Se compone aquí y sale por la bandeja: el chat lo publica tras el commit."""
    from app.servicios import redaccion_chat
    from app.servicios.eventos_sistema import VOCABULARIO

    conversaciones = opcional("conversaciones.v1")
    if conversaciones is None:
        return "publicar→(sin chat)"
    destino = _destino(regla)
    canal = await conversaciones.canal(destino) if destino else None
    if canal is None or canal["archivado"]:
        return "publicar→(canal no existe)"
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
    await salida(sesion, "conversaciones.publicar", {"canal_id": canal["id"], "texto": cuerpo, "entidad": evento.entidad or "",
                                                     "evento_sistema_id": evento.id, "acciones": acciones, "tarjeta": tarjeta})
    return f"publicar→canal:{canal['id']}"


# --- lo vinculado cambió: sus mensajes, al día -----------------------------------------------------------------


async def _recomponer(sesion: AsyncSession, filas: list[dict], arranque: bool = False) -> list[dict]:
    """Los cambios {id, texto, tarjeta} de los mensajes del sistema `filas` (fichas de «conversaciones.v1»), escritos
    otra vez con lo vigente: desde su evento (`redaccion_chat.componer`, con la fecha de entonces) o desde su anuncio
    (`redaccion_chat.anuncio`). Se respeta la regla con texto propio. `arranque`: la reescritura única de los avisos
    de antes del 2026-10-18 (sin `actualizado_en` y poniendo al día también el ícono de lo ya escrito así)."""
    from app.modelos import EventoSistema, ReglaEvento
    from app.servicios import redaccion_chat

    ids = {m["evento_sistema_id"] for m in filas if m["evento_sistema_id"]}
    eventos = {e.id: e for e in (await sesion.execute(select(EventoSistema).where(EventoSistema.id.in_(ids)))).scalars()} if ids else {}
    reglas: dict[int, ReglaEvento] | None = None
    cambios: list[dict] = []
    for m in filas:
        e = eventos.get(m["evento_sistema_id"] or 0)
        anterior = dict(m["tarjeta"] or {})
        creado = datetime.fromisoformat(m["creado_en"]) if m.get("creado_en") else None
        if arranque and anterior.get("estilo") == "mensaje":
            if e is not None:  # ya escrito así: solo se pone al día su ícono (el del seguimiento nació sin el suyo)
                cambios.append({"id": m["id"], "texto": m["texto"], "tarjeta": {
                    **tarjeta_de(e.nombre, e.datos, m["texto"]), "estilo": "mensaje",
                    "firma": anterior.get("firma") or redaccion_chat.firma_de(e.nombre)}})
            continue
        texto, firma, tarjeta = "", "", {}
        if e is not None:
            if reglas is None:
                reglas = {r.id: r for r in (await sesion.execute(select(ReglaEvento))).scalars()}
            regla = reglas.get(regla_del_mensaje(e.acciones, m["id"], m["canal_id"]) or 0)
            if regla is not None and not usa_redaccion(regla):
                continue
            texto = await redaccion_chat.componer(sesion, e.nombre, e.entidad, e.datos, creado)
            firma = redaccion_chat.firma_de(e.nombre)
            tarjeta = tarjeta_de(e.nombre, e.datos, (m["texto"] if arranque else texto or m["texto"]))
        elif re.match(r"^(tarea|evento):\d+$", m["entidad"] or "") and (
                not arranque or (m["texto"] or "").startswith(("Tarea creada: ", "Actividad agendada: "))):
            texto = await redaccion_chat.anuncio(sesion, m["entidad"], creado)
            firma = redaccion_chat.firma_de_entidad(m["entidad"])
            tarjeta = tarjeta_de("", {}, m["texto"] if arranque else texto or m["texto"])
        else:
            continue
        if arranque:
            if texto:
                cambios.append({"id": m["id"], "texto": texto, "tarjeta": {**(anterior or tarjeta), "estilo": "mensaje", "firma": firma},
                                "reescrito": True})
            continue
        if not texto or texto == m["texto"]:
            continue
        cambios.append({"id": m["id"], "texto": texto, "tarjeta": {
            **anterior, **{k: v for k, v in tarjeta.items() if k in ("que", "icono", "titulo", "detalle", "meta")},
            "estilo": "mensaje", "actualizado_en": datetime.now(timezone.utc).isoformat()}})
    return cambios


async def refrescar_mensajes_de(sesion: AsyncSession, entidad: str) -> int:
    """La entidad cambió (otra hora, otro nombre, otro asunto, otro responsable): los mensajes que el sistema
    escribió sobre ella se RECOMPONEN con lo vigente (2026-10-18, Edison: «los mensajes automáticos se actualizan
    cuando cambia el registro vinculado, sin duplicar mensajes»). Un mensaje por hecho, siempre el mismo;
    `tarjeta.actualizado_en` dice que el sistema lo puso al día (no es «editado»). Se compone en la transacción de
    quien cambió la entidad y sale por la bandeja: el chat lo aplica tras el commit y lo difunde en vivo. Nunca hace
    fallar a quien llama. → cuántos mensajes cambiarán."""
    if not re.match(r"^[a-z]+:\d+$", entidad or ""):
        return 0
    conversaciones = opcional("conversaciones.v1")
    if conversaciones is None:
        return 0
    try:
        filas = [m for m in await conversaciones.del_sistema(entidad) if (m["tarjeta"] or {}).get("estilo") == "mensaje"]
        if not filas:
            return 0
        cambios = await _recomponer(sesion, filas)
        if cambios:
            async with sesion.begin_nested():
                await salida(sesion, "conversaciones.actualizar", {"cambios": cambios})
        return len(cambios)
    except Exception:  # noqa: BLE001 — un aviso desactualizado no puede tumbar el cambio de la entidad
        log.exception("No se pudieron refrescar los mensajes de %s", entidad)
        return 0


async def redactar_avisos_viejos(sesion: AsyncSession) -> int:
    """UNA VEZ (2026-10-18; ajuste `chat_avisos_redactados`): lo que el sistema publicó antes con la tarjeta corta
    pasa al formato del equipo (`redaccion_chat`), con la entidad de hoy y la fecha de entonces (los «8 días» del
    plazo se cuentan desde el día del aviso). Se respeta la regla con texto propio y lo que no tiene evento ni es un
    anuncio de tarea o actividad. Lo aplica el chat en el acto, sin difundir (es al arrancar). Commit propio.
    → cuántos mensajes cambió."""
    from app.modelos import Ajuste

    if await sesion.get(Ajuste, {"despacho_id": 1, "clave": "chat_avisos_redactados"}):
        return 0
    conversaciones = opcional("conversaciones.v1")
    if conversaciones is None:
        return 0
    cambios = await _recomponer(sesion, await conversaciones.del_sistema(None), arranque=True)
    reescritos = sum(1 for c in cambios if c.pop("reescrito", False))
    if cambios:
        await conversaciones.actualizar(cambios, difundir=False)
    sesion.add(Ajuste(despacho_id=1, clave="chat_avisos_redactados", valor={"mensajes": reescritos, "fecha": datetime.now(timezone.utc).isoformat()}))
    await sesion.commit()
    log.info("Avisos del chat reescritos con el formato del equipo: %s", reescritos)
    return reescritos


# --- el chat sembró temas nuevos: las reglas de fábrica que se ordenan ------------------------------------------


async def al_sembrar_temas(evento) -> None:
    """Una sola vez, cuando el chat siembra sus temas nuevos («conversaciones.temas_nuevos», 2026-10-13): lo que ahora
    tiene su propio tema deja de repetirse en el general. Solo si la regla sigue como vino de fábrica (si alguien la
    cambió, se respeta). Lo firmado y enviado → «Documentos listos» y «Documentos enviados» (Documentos queda con lo
    numerado); las noticias → «Noticias» (Prensa queda con lo propio)."""
    from app.db import SesionAsincrona
    from app.modelos import ReglaEvento

    recien = set((evento.datos or {}).get("claves") or [])
    async with SesionAsincrona() as sesion:
        if "documentos-listos" in recien or "documentos-enviados" in recien:
            r = (await sesion.execute(select(ReglaEvento).where(ReglaEvento.de_fabrica == "canal-documentos-estado"))).scalar_one_or_none()
            if r and r.activa and r.destino == "canal:documentos" and sorted((r.condicion or {}).get("estado") or []) == ["ENVIADO", "FIRMADO"]:
                r.activa = False
                log.info("Regla «%s» apagada: lo firmado y enviado va a sus temas propios.", r.nombre)
        if "noticias" in recien:
            r = (await sesion.execute(select(ReglaEvento).where(ReglaEvento.de_fabrica == "canal-prensa"))).scalar_one_or_none()
            if r and r.activa and not (r.condicion or {}):
                r.condicion = {"clase": ["nota_de_prensa", "comunicado", "entrevista", "agenda_de_medios"]}
                log.info("Regla «%s»: las noticias van al tema Noticias.", r.nombre)
        await sesion.commit()


# --- «redaccion.v1»: lo que el chat pide para escribir ---------------------------------------------------------


async def _anuncio(entidad: str) -> dict | None:
    """El anuncio de una tarea o una actividad creada desde el chat, escrito como el equipo: {texto, firma}, o None."""
    from app.db import SesionAsincrona
    from app.servicios import redaccion_chat

    async with SesionAsincrona() as sesion:
        texto = await redaccion_chat.anuncio(sesion, entidad)
    return {"texto": texto, "firma": redaccion_chat.firma_de_entidad(entidad)} if texto else None


async def _tarjetas_viejas(mensajes: list[dict]) -> dict[int, dict]:
    """La tarjeta de lo que el sistema publicó antes del 2026-10-13 (sin `tarjeta` guardada), armada desde su evento
    o su texto: `mensajes` = [{id, evento_sistema_id, texto}] → {id: tarjeta} (sin las vacías)."""
    from app.db import SesionAsincrona
    from app.modelos import EventoSistema

    ids = {m["evento_sistema_id"] for m in mensajes if m.get("evento_sistema_id")}
    eventos = {}
    if ids:
        async with SesionAsincrona() as sesion:
            eventos = {e.id: (e.nombre, dict(e.datos or {})) for e in (await sesion.execute(
                select(EventoSistema).where(EventoSistema.id.in_(ids)))).scalars()}
    salida_: dict[int, dict] = {}
    for m in mensajes:
        nombre, datos = eventos.get(m.get("evento_sistema_id") or 0, ("", {}))
        t = tarjeta_de(nombre, datos, m.get("texto") or "")
        if t:
            salida_[m["id"]] = t
    return salida_


REDACCION_V1 = Superficie("redaccion.v1", {"anuncio": lambda: _anuncio, "tarjetas_viejas": lambda: _tarjetas_viejas})

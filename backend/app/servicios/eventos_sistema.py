"""backend/app/servicios/eventos_sistema.py — los eventos del sistema y sus reglas (2026-10-12, fase 7;
`docs/plataforma/propuesta-automatizacion.md` §4).

Un módulo que hace algo relevante llama a `emitir(sesion, nombre, entidad, datos, clave, usuario)`
dentro de su transacción (sin commit: el módulo lo da). `emitir` guarda el hecho en
`eventos_sistema` con una `clave` única (idempotencia: si ya existe, no hace nada) y aplica las
reglas activas de `reglas_evento` para ese nombre: `notificar` (campana), `tarea` (crea una
tarea) o `publicar` (un canal del chat; se engancha en la fase 8 por `GANCHOS["publicar"]`).
Las notificaciones que cada módulo ya daba a mano siguen igual: las reglas añaden lo
configurable, no reemplazan lo que funciona (se migrarán una a una).

Sin bus externo: en proceso, como la presencia (KISS). Reglas puras (plantilla, condición,
destinatarios) probadas en `backend/tests/test_eventos_sistema.py`.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Ajuste, EventoSistema, ReglaEvento, Usuario

log = logging.getLogger("sgdp.eventos")

# Vocabulario: nombre → (qué es, campos que viajan en `datos` y sirven en la plantilla y la condición).
VOCABULARIO: dict[str, dict] = {
    "entrada.registrada": {"que": "Se registró un documento recibido", "campos": ["asunto", "remitente", "clase", "atencion", "plazo", "responsable_id", "std_numero", "via", "expediente"]},
    # Mesa de partes virtual (2026-10-12): el remitente subió lo que subsana una observación.
    "entrada.subsanada": {"que": "Llegó una subsanación por la mesa de partes virtual", "campos": ["asunto", "remitente", "responsable_id", "expediente", "fuera_de_plazo"]},
    "entrada.asignada": {"que": "Se asignó un recibido a alguien", "campos": ["asunto", "responsable_id", "atencion", "plazo"]},
    "entrada.vencida": {"que": "Venció el plazo de un recibido sin respuesta", "campos": ["asunto", "responsable_id", "plazo"]},
    "entrada.respondida": {"que": "Un recibido quedó respondido", "campos": ["asunto", "responsable_id", "documento"]},
    "documento.numerado": {"que": "Un documento recibió su número oficial", "campos": ["numero", "tipo", "asunto", "responsable_id", "autor_id"]},
    "documento.estado": {"que": "Un documento cambió de estado", "campos": ["numero", "tipo", "asunto", "estado", "estado_anterior", "responsable_id", "autor_id"]},
    "documento.actuacion": {"que": "Se anotó una actuación del seguimiento", "campos": ["numero", "clase", "texto", "fecha", "fuente", "responsable_id"]},
    # Estado del expediente (2026-10-18): al aplicar el pegado de seguimiento, dónde está el documento y qué falta.
    "documento.seguimiento": {"que": "Se actualizó el estado del trámite de un documento", "campos": ["numero", "asunto", "expediente_entidad", "estado_propuesto", "ubicacion", "responsable_entidad", "ultima_fecha", "plazo_legal", "pendientes", "resumen"]},
    "evento.creado": {"que": "Se agendó un evento", "campos": ["titulo", "tipo", "inicio", "lugar", "responsable_id"]},
    "evento.recordatorio": {"que": "Llegó la hora de avisar un evento", "campos": ["titulo", "tipo", "inicio", "lugar", "responsable_id"]},
    # Programación del día (2026-10-13): cada mañana, las actividades de hoy (servicios/programacion.py).
    "agenda.programacion_diaria": {"que": "La programación de actividades del día", "campos": ["fecha", "n", "resumen", "ruta"]},
    "tarea.asignada": {"que": "Se asignó una tarea", "campos": ["titulo", "responsable_id", "vence"]},
    "tarea.vencida": {"que": "Venció una tarea", "campos": ["titulo", "responsable_id", "vence"]},
    "sr.actividad_registrada": {"que": "Se registró una actividad de la Semana de representación", "campos": ["semana", "codigo", "titulo", "fecha", "distrito"]},
    "sr.pedido_derivado": {"que": "Un pedido de la Semana se derivó con oficio", "campos": ["semana", "codigo", "pedido", "numero"]},
    "pl.parte_estado": {"que": "Una parte de un proyecto de ley cambió de estado", "campos": ["proyecto", "parte", "estado", "responsable_id"]},
    "pegado.aplicado": {"que": "Se aplicó el resultado de un prompt", "campos": ["tipo", "entidad", "usuario_id"]},
    "prensa.pieza_registrada": {"que": "Se registró una pieza de prensa", "campos": ["titular", "clase", "fuente", "accion_sugerida", "responsable_id"]},
    "chat.reconocido": {"que": "El chat reconoció un resultado de prompt y lo registró", "campos": ["tipo", "entidad", "canal", "usuario_id"]},
}
ACCIONES = ("notificar", "tarea", "publicar", "telegram")
# Eventos tras los cuales se recomponen las copias vinculadas a la entidad (servicios/etiquetas.propagar).
PROPAGAN = {"documento.numerado", "documento.estado"}
DESTINOS_FIJOS = ("responsable", "autor", "equipo", "administradores")
ROLES = ("administrador", "secretaria", "asesor", "diputado", "prensa")

# Gancho de la fase 8: `publicar(sesion, regla, evento) -> str` (descripción de lo hecho).
GANCHOS: dict[str, Callable[..., Awaitable[str]]] = {}

# Reglas de fábrica: se siembran una vez (`ajustes.reglas_evento_fabrica`); si alguien las borra o
# apaga, se respeta. Nada de la entidad: solo roles y campos.
FABRICA: list[dict] = [
    {"de_fabrica": "entrada-registrada-admin", "evento": "entrada.registrada", "nombre": "Avisar a quien administra de cada recibido nuevo",
     "condicion": {}, "accion": "notificar", "destino": "administradores", "texto": "Nuevo recibido: «{asunto}» de {remitente} ({atencion}).", "activa": False},
    {"de_fabrica": "entrada-vencida-admin", "evento": "entrada.vencida", "nombre": "Avisar a quien administra de un recibido vencido",
     "condicion": {}, "accion": "notificar", "destino": "administradores", "texto": "Venció sin respuesta: «{asunto}» (plazo {plazo}).", "activa": True},
    {"de_fabrica": "documento-numerado-equipo", "evento": "documento.numerado", "nombre": "Avisar al equipo de cada documento numerado",
     "condicion": {}, "accion": "notificar", "destino": "equipo", "texto": "Se numeró {numero}: «{asunto}».", "activa": False},
    {"de_fabrica": "entrada-agendar-tarea", "evento": "entrada.registrada", "nombre": "Crear la tarea de responder un recibido que lo pide",
     "condicion": {"atencion": "responder"}, "accion": "tarea", "destino": "responsable", "texto": "Responder: {asunto}", "activa": False},
    # Canales temáticos del chat (2026-10-12, fase 9): lo que pasa en cada módulo se cuenta en su canal.
    {"de_fabrica": "canal-recibidos", "evento": "entrada.registrada", "nombre": "Contar en el canal Mesa de Partes cada recibido nuevo",
     "condicion": {}, "accion": "publicar", "destino": "canal:recibidos", "texto": "Nuevo recibido de {remitente}: «{asunto}» · {atencion} · plazo {plazo}", "activa": True},
    {"de_fabrica": "canal-recibidos-subsanado", "evento": "entrada.subsanada", "nombre": "Contar en el canal Mesa de Partes cada subsanación de la mesa virtual",
     "condicion": {}, "accion": "publicar", "destino": "canal:recibidos", "texto": "Subsanación recibida ({expediente}) de {remitente}: «{asunto}»", "activa": True},
    {"de_fabrica": "canal-recibidos-respondido", "evento": "entrada.respondida", "nombre": "Contar en el canal Mesa de Partes lo respondido",
     "condicion": {}, "accion": "publicar", "destino": "canal:recibidos", "texto": "Respondido: «{asunto}»", "activa": True},
    {"de_fabrica": "canal-documentos", "evento": "documento.numerado", "nombre": "Contar en el canal Documentos cada documento numerado",
     "condicion": {}, "accion": "publicar", "destino": "canal:documentos", "texto": "Numerado {numero}: «{asunto}»", "activa": True},
    {"de_fabrica": "canal-documentos-estado", "evento": "documento.estado", "nombre": "Contar en el canal Documentos lo firmado y enviado",
     "condicion": {"estado": ["FIRMADO", "ENVIADO"]}, "accion": "publicar", "destino": "canal:documentos", "texto": "{numero} pasó a {estado}: «{asunto}»", "activa": True},
    {"de_fabrica": "canal-agenda", "evento": "evento.creado", "nombre": "Contar en el canal Agenda cada evento agendado",
     "condicion": {}, "accion": "publicar", "destino": "canal:agenda", "texto": "Agendado: {titulo} · {inicio} · {lugar}", "activa": True},
    {"de_fabrica": "canal-agenda-recordatorio", "evento": "evento.recordatorio", "nombre": "Recordar en el canal Agenda lo que se acerca",
     "condicion": {}, "accion": "publicar", "destino": "canal:agenda", "texto": "Se acerca: {titulo} · {inicio} · {lugar}", "activa": True},
    {"de_fabrica": "canal-representacion", "evento": "sr.pedido_derivado", "nombre": "Contar en el canal Semana cada pedido derivado",
     "condicion": {}, "accion": "publicar", "destino": "canal:representacion", "texto": "Pedido {codigo} derivado con oficio: {pedido}", "activa": True},
    {"de_fabrica": "canal-prensa", "evento": "prensa.pieza_registrada", "nombre": "Contar en el canal Prensa cada pieza registrada",
     "condicion": {}, "accion": "publicar", "destino": "canal:prensa", "texto": "Pieza ({clase}): {titular} · {fuente} · sugerido: {accion_sugerida}", "activa": True},
]


# Temas nuevos del chat (2026-10-13, «temáticas de Telegram»; `servicios/chat.py::FABRICA`): cada uno se
# llena solo con lo que le toca. Al sembrarlos, la regla vieja que contaba lo firmado y enviado en
# «Documentos» se apaga y la de Prensa deja las noticias a su tema (`chat._ordenar_reglas_viejas`).
FABRICA += [
    {"de_fabrica": "canal-documentos-listos", "evento": "documento.estado", "nombre": "Contar en «Documentos listos» cada documento firmado",
     "condicion": {"estado": "FIRMADO"}, "accion": "publicar", "destino": "canal:documentos-listos", "texto": "Firmado {numero}: «{asunto}»", "activa": True},
    {"de_fabrica": "canal-documentos-enviados", "evento": "documento.estado", "nombre": "Contar en «Documentos enviados» cada documento enviado",
     "condicion": {"estado": "ENVIADO"}, "accion": "publicar", "destino": "canal:documentos-enviados", "texto": "Enviado {numero}: «{asunto}»", "activa": True},
    {"de_fabrica": "canal-borradores", "evento": "documento.estado", "nombre": "Contar en «Borradores y revisión» lo que pasa a revisión u observado",
     "condicion": {"estado": ["EN_REVISION", "OBSERVADO"]}, "accion": "publicar", "destino": "canal:borradores", "texto": "{numero} pasó a {estado}: «{asunto}»", "activa": True},
    {"de_fabrica": "canal-seguimiento", "evento": "documento.actuacion", "nombre": "Contar en «Seguimiento de documentos» cada actuación anotada",
     "condicion": {}, "accion": "publicar", "destino": "canal:seguimiento", "texto": "Seguimiento de {numero}: {texto} · {fecha}", "activa": True},
    {"de_fabrica": "canal-pleno", "evento": "evento.creado", "nombre": "Contar en «Pleno» cada sesión del Pleno agendada",
     "condicion": {"tipo": "pleno"}, "accion": "publicar", "destino": "canal:pleno", "texto": "Pleno: {titulo} · {inicio} · {lugar}", "activa": True},
    {"de_fabrica": "canal-noticias", "evento": "prensa.pieza_registrada", "nombre": "Contar en «Noticias» cada noticia registrada en Prensa",
     "condicion": {"clase": ["noticia_local", "noticia_nacional", "noticia_internacional"]}, "accion": "publicar", "destino": "canal:noticias",
     "texto": "Noticia: {titular} · {fuente}", "activa": True},
    {"de_fabrica": "canal-seguimiento-estado", "evento": "documento.seguimiento", "nombre": "Contar en «Seguimiento de documentos» el estado del trámite al pegar el seguimiento",
     "condicion": {}, "accion": "publicar", "destino": "canal:seguimiento", "texto": "Estado de {numero}: {estado_propuesto} · {ubicacion}", "activa": True},
    {"de_fabrica": "canal-programacion", "evento": "agenda.programacion_diaria", "nombre": "Publicar cada mañana la programación del día",
     "condicion": {}, "accion": "publicar", "destino": "canal:programacion", "texto": "Programación del día ({n}): {resumen}", "activa": True},
]


# --- puras ---------------------------------------------------------------------------------


def plantilla(texto: str, datos: dict) -> str:
    """«Nuevo recibido de {remitente}: «{asunto}» · plazo {plazo}» con los campos del evento. Los
    tramos separados por « · » cuyo campo venga vacío se quitan enteros (no queda «· plazo »); en el
    primer tramo un campo vacío deja « de :» limpio («Nuevo recibido: «…»»)."""
    def valor(m: re.Match) -> str:
        v = datos.get(m.group(1))
        return "" if v is None else str(v)

    tramos = []
    for i, tramo in enumerate((texto or "").split(" · ")):
        campos = re.findall(r"\{([a-z_]+)\}", tramo)
        if i > 0 and campos and all(datos.get(c) in (None, "", [], {}) for c in campos):
            continue
        s = re.sub(r"\{([a-z_]+)\}", valor, tramo)
        s = re.sub(r"\s+(de|del|por|para|en)\s*:", ":", s)       # «de :» → «:»
        s = re.sub(r"\s+(de|del|por|para|en)\s*$", "", s)        # «… de» colgando al final
        s = re.sub(r"«\s*»", "", s).replace("()", "")
        s = re.sub(r"\s+([.,;:])", r"\1", s)                     # «Alguien .» → «Alguien.»
        s = re.sub(r"\s{2,}", " ", s).strip()
        if s:
            tramos.append(s)
    return " · ".join(tramos).strip(" ·")


def cumple(condicion: dict | None, datos: dict) -> bool:
    """La condición es un mapa {campo: valor | [valores]}; vacía = siempre. Se compara sin
    tildes ni mayúsculas."""
    from app.servicios.entradas import normalizar

    for campo, esperado in (condicion or {}).items():
        actual = normalizar(str(datos.get(campo) if datos.get(campo) is not None else ""))
        opciones = esperado if isinstance(esperado, list) else [esperado]
        if actual not in {normalizar(str(o)) for o in opciones}:
            return False
    return True


def clave_de(nombre: str, entidad: str, sufijo: str = "") -> str:
    """`entrada:12:registrada` o `documento:95:estado:ENVIADO`."""
    base = f"{entidad}:{nombre.split('.', 1)[1] if '.' in nombre else nombre}"
    return (base + (f":{sufijo}" if sufijo else ""))[:160]


def destino_valido(destino: str) -> bool:
    d = (destino or "").strip()
    return d in DESTINOS_FIJOS or (d.startswith("rol:") and d[4:] in ROLES) or bool(re.match(r"^usuario:\d{1,9}$", d)) or d.startswith("canal:")


# --- destinatarios y acciones ----------------------------------------------------------------


async def destinatarios(sesion: AsyncSession, destino: str, datos: dict, emitido_por: int | None) -> set[int]:
    d = (destino or "").strip()
    ids: set[int] = set()
    if d == "responsable":
        if datos.get("responsable_id"):
            ids.add(int(datos["responsable_id"]))
    elif d == "autor":
        if datos.get("autor_id") or emitido_por:
            ids.add(int(datos.get("autor_id") or emitido_por))
    elif d == "equipo":
        ids |= set((await sesion.execute(select(Usuario.id).where(Usuario.activo.is_(True), Usuario.rol != "invitado"))).scalars().all())
    elif d == "administradores":
        ids |= set((await sesion.execute(select(Usuario.id).where(Usuario.activo.is_(True), Usuario.rol == "administrador"))).scalars().all())
    elif d.startswith("rol:"):
        ids |= set((await sesion.execute(select(Usuario.id).where(Usuario.activo.is_(True), Usuario.rol == d[4:]))).scalars().all())
    elif d.startswith("usuario:"):
        ids.add(int(d[8:]))
    return ids


async def _aplicar(sesion: AsyncSession, regla: ReglaEvento, ev: EventoSistema) -> str:
    from app.servicios import notificaciones

    texto = plantilla(regla.texto, ev.datos) or VOCABULARIO.get(ev.nombre, {}).get("que", ev.nombre)
    if regla.accion == "notificar":
        ids = await destinatarios(sesion, regla.destino, ev.datos, ev.emitido_por)
        for uid in ids:
            notificaciones.crear(sesion, uid, texto[:400], "regla", destino=ev.entidad, evitar=ev.emitido_por)
        return f"notificar→{len(ids)}"
    # Un módulo apagado en Administración (2026-10-18) no recibe nada de las reglas.
    from app.servicios import modulos

    if regla.accion in ("tarea", "publicar"):
        mid = "tareas" if regla.accion == "tarea" else "chat"
        if not await modulos.activo(sesion, mid):
            return f"{regla.accion}→(módulo apagado)"
    if regla.accion == "tarea":
        from app.modelos_tareas import Tarea
        from app.servicios import tareas as svc_tareas
        from app.servicios import tareas_reglas as reglas

        ids = await destinatarios(sesion, regla.destino, ev.datos, ev.emitido_por)
        responsable = next(iter(ids), None) or ev.emitido_por
        vence, con_hora = (reglas.plazo(str(ev.datos["plazo"])[:10], None, svc_tareas.zona()) if ev.datos.get("plazo") else (None, False))
        t = Tarea(titulo=texto[:300], descripcion=f"Creada por la regla «{regla.nombre}».", estado="por_hacer", prioridad="normal",
                  responsable_id=responsable, vence_en=vence, con_hora=con_hora, origen="regla",
                  externo_id=f"regla:{regla.id}:{ev.clave}"[:300], creado_por=ev.emitido_por, etiquetas=[], checklist=[])
        sesion.add(t)
        await sesion.flush()
        if ev.entidad:
            await svc_tareas.poner_vinculos(sesion, f"tarea:{t.id}", [ev.entidad], ev.emitido_por)
        return f"tarea→{t.id}"
    if regla.accion == "telegram":
        from app.servicios import redaccion_chat, telegram
        from app.servicios.chat import usa_redaccion

        if not telegram.activo():
            return "telegram→(sin token)"
        if usa_redaccion(regla):  # el mismo mensaje que el chat, como se pegaba en el grupo
            texto = await redaccion_chat.componer(sesion, ev.nombre, ev.entidad, ev.datos) or texto
        ok = await telegram.enviar(texto)
        return "telegram→enviado" if ok else "telegram→falló"
    if regla.accion == "publicar":
        gancho = GANCHOS.get("publicar")
        if gancho is None:
            return "publicar→(sin chat todavía)"
        return await gancho(sesion, regla, ev)
    return "ninguna"


def datos_documento(doc, usuario) -> dict:
    """Los campos que viajan con los eventos de un documento (el cambio manual de estado en
    api/documentos.py y los automáticos de servicios/envio.py: un solo lugar)."""
    from app.servicios.numeracion import numero_mostrado
    from app.tipos import asunto_de

    return {"numero": numero_mostrado(doc) or "", "tipo": doc.tipo, "asunto": asunto_de(doc.tipo, doc.campos) or "",
            "responsable_id": doc.responsable_id, "autor_id": getattr(doc, "creado_por", None) or (usuario.id if usuario else None)}


async def emitir(sesion: AsyncSession, nombre: str, entidad: str, datos: dict | None = None,
                 clave: str | None = None, usuario: Usuario | None = None, usuario_id: int | None = None) -> EventoSistema | None:
    """Registra el evento y aplica sus reglas. Sin commit. Devuelve None si la clave ya existía
    (idempotencia) o si el nombre no está en el vocabulario (se anota y no rompe al módulo)."""
    if nombre not in VOCABULARIO:
        log.warning("Evento desconocido «%s» (%s): no se emite.", nombre, entidad)
        return None
    clave = clave or clave_de(nombre, entidad)
    existe = (await sesion.execute(select(EventoSistema.id).where(EventoSistema.clave == clave))).first()
    if existe:
        return None
    ev = EventoSistema(nombre=nombre, entidad=entidad or "", datos=dict(datos or {}), clave=clave,
                       emitido_por=usuario.id if usuario else usuario_id, acciones=[])
    sesion.add(ev)
    await sesion.flush()
    reglas = (await sesion.execute(
        select(ReglaEvento).where(ReglaEvento.evento == nombre, ReglaEvento.activa.is_(True)).order_by(ReglaEvento.id)
    )).scalars().all()
    hechas: list[str] = []
    for r in reglas:
        if not cumple(r.condicion, ev.datos):
            continue
        try:
            hechas.append(f"{r.id}:{await _aplicar(sesion, r, ev)}")
        except Exception as e:  # noqa: BLE001  una regla rota no tumba al módulo
            log.exception("Regla %s sobre %s falló", r.id, clave)
            hechas.append(f"{r.id}:error:{type(e).__name__}")
    ev.acciones = hechas
    ev.procesado_en = datetime.now(timezone.utc)
    return ev


async def emitir_seguro(sesion: AsyncSession, nombre: str, entidad: str, datos: dict | None = None,
                        clave: str | None = None, usuario: Usuario | None = None, usuario_id: int | None = None) -> None:
    """`emitir` en un punto de guardado propio: un fallo se anota y nunca impide la operación del módulo."""
    try:
        async with sesion.begin_nested():
            await emitir(sesion, nombre, entidad, datos, clave, usuario, usuario_id)
    except Exception:  # noqa: BLE001
        log.exception("No se pudo emitir %s para %s", nombre, entidad)
    # Lo vinculado se actualiza con la entidad (2026-10-12, «como en Excel»): las copias que el
    # sistema guarda fuera de lo oficial (el título de un evento detectado) toman el valor vigente.
    if nombre in PROPAGAN:
        from app.servicios import etiquetas

        await etiquetas.propagar(sesion, entidad)


async def sembrar_fabrica(sesion: AsyncSession) -> int:
    """Crea las reglas de fábrica que aún no se sembraron (marca por clave en `ajustes`)."""
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": "reglas_evento_fabrica"})
    sembradas = set((fila.valor or {}).get("claves", [])) if fila else set()
    nuevas = 0
    for r in FABRICA:
        if r["de_fabrica"] in sembradas:
            continue
        sesion.add(ReglaEvento(**r))
        sembradas.add(r["de_fabrica"])
        nuevas += 1
    if nuevas:
        if fila:
            fila.valor = {"claves": sorted(sembradas)}
        else:
            sesion.add(Ajuste(despacho_id=1, clave="reglas_evento_fabrica", valor={"claves": sorted(sembradas)}))
        await sesion.commit()
        log.info("Reglas de fábrica sembradas: %s", nuevas)
    return nuevas

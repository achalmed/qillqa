"""Tareas y Agenda en la base (2026-10-06): vínculos (tabla `relaciones`), nombres legibles
de lo vinculado, serialización y recordatorios de plazo. Las reglas puras están en
servicios/tareas_reglas.py y servicios/agenda_reglas.py.

Vínculo = fila de `relaciones` con origen `tarea:N` o `evento:N`, tipo `vinculo`, fuente
`manual` (las manuales nunca las toca la sincronización de citas de servicios/relaciones.py).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.modelos import Notificacion, Persona, Relacion, Usuario
from app.modelos_tareas import EventoAgenda, EventoParticipante, ListaTareas, Tarea
from app.servicios import notificaciones as avisos
from app.servicios import tareas_reglas as reglas

log = logging.getLogger("sgdp.tareas")

TIPO_VINCULO = "vinculo"


def zona() -> ZoneInfo:
    try:
        return ZoneInfo(config.zona_horaria)
    except Exception:
        return ZoneInfo("UTC")


# --- vínculos ------------------------------------------------------------------------------


async def vinculos_de(sesion: AsyncSession, origenes: list[str]) -> dict[str, list[str]]:
    if not origenes:
        return {}
    filas = (await sesion.execute(
        select(Relacion.origen, Relacion.destino).where(Relacion.origen.in_(origenes), Relacion.tipo == TIPO_VINCULO)
        .order_by(Relacion.id)
    )).all()
    salida: dict[str, list[str]] = {o: [] for o in origenes}
    for o, d in filas:
        salida.setdefault(o, []).append(d)
    return salida


async def poner_vinculos(sesion: AsyncSession, origen: str, destinos: list[str], usuario_id: int | None) -> None:
    """Deja los vínculos manuales de `origen` IGUAL a `destinos` (no hace commit)."""
    queridos = [d.strip() for d in destinos if reglas.vinculo_valido(d) and d.strip() != origen]
    queridos = list(dict.fromkeys(queridos))[:30]
    actuales = (await sesion.execute(
        select(Relacion).where(Relacion.origen == origen, Relacion.tipo == TIPO_VINCULO)
    )).scalars().all()
    for r in actuales:
        if r.destino not in queridos:
            await sesion.delete(r)
    tienen = {r.destino for r in actuales}
    for d in queridos:
        if d not in tienen:
            sesion.add(Relacion(origen=origen, destino=d, tipo=TIPO_VINCULO, contexto="", fuente="manual",
                                automatica=False, texto="", datos={}, creado_por=usuario_id))


async def quitar_vinculos(sesion: AsyncSession, origen: str) -> None:
    await sesion.execute(delete(Relacion).where(Relacion.origen == origen))
    await sesion.execute(delete(Relacion).where(Relacion.destino == origen, Relacion.tipo == TIPO_VINCULO))


async def origenes_con(sesion: AsyncSession, destino: str, prefijo: str) -> list[int]:
    """Ids de las tareas (prefijo 'tarea') o eventos ('evento') vinculados a `destino`."""
    filas = (await sesion.execute(
        select(Relacion.origen).where(Relacion.destino == destino, Relacion.tipo == TIPO_VINCULO,
                                      Relacion.origen.like(f"{prefijo}:%"))
    )).scalars().all()
    salida = []
    for o in filas:
        try:
            salida.append(int(o.split(":", 1)[1]))
        except (IndexError, ValueError):
            continue
    return salida


async def etiquetas_de(sesion: AsyncSession, destinos: set[str]) -> dict[str, str]:
    """Nombre legible y vigente de cada destino: el resolvedor central (servicios/etiquetas.py)."""
    from app.servicios import etiquetas

    return await etiquetas.etiquetas_de(sesion, destinos)


# --- usuarios ------------------------------------------------------------------------------


async def usuarios_activos(sesion: AsyncSession) -> list[dict]:
    filas = (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True)).order_by(Usuario.nombre_completo))).scalars().all()
    return [{"id": u.id, "usuario": u.nombre_usuario, "nombre": u.nombre_completo, "rol": u.rol, "cargo": u.cargo} for u in filas]


async def nombres_usuarios(sesion: AsyncSession, ids: set[int]) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: u.nombre_completo for u in (await sesion.execute(select(Usuario).where(Usuario.id.in_(ids)))).scalars().all()}


# --- serialización -------------------------------------------------------------------------


def _iso(dt: datetime | None) -> str | None:
    """ISO con la hora de la entidad (no la de Greenwich): lo que se lee es lo que se ve."""
    return dt.astimezone(zona()).isoformat() if dt else None


async def serializar_tareas(sesion: AsyncSession, tareas: list[Tarea]) -> list[dict]:
    tz = zona()
    ahora = reglas.ahora_utc()
    vinc = await vinculos_de(sesion, [f"tarea:{t.id}" for t in tareas])
    todos = {d for lista in vinc.values() for d in lista} | {t.entregable for t in tareas if reglas.vinculo_valido(t.entregable)}
    nombres_v = await etiquetas_de(sesion, todos)
    nombres_u = await nombres_usuarios(sesion, {t.responsable_id for t in tareas} | {t.creado_por for t in tareas})
    listas = {}
    ids_listas = {t.lista_id for t in tareas if t.lista_id}
    if ids_listas:
        listas = {lst.id: lst for lst in (await sesion.execute(select(ListaTareas).where(ListaTareas.id.in_(ids_listas)))).scalars().all()}
    salida = []
    for t in tareas:
        lst = listas.get(t.lista_id) if t.lista_id else None
        salida.append({
            "id": t.id,
            "titulo": t.titulo,
            "descripcion": t.descripcion,
            "estado": t.estado,
            "prioridad": t.prioridad,
            "importante": bool(t.importante),
            "cuadrante": reglas.cuadrante(t.vence_en, t.prioridad, bool(t.importante), ahora),
            "responsable_id": t.responsable_id,
            "responsable": nombres_u.get(t.responsable_id or 0, ""),
            "vence_en": _iso(t.vence_en),
            "vence_fecha": t.vence_en.astimezone(tz).date().isoformat() if t.vence_en else None,
            "vence_hora": t.vence_en.astimezone(tz).strftime("%H:%M") if t.vence_en and t.con_hora else None,
            "con_hora": t.con_hora,
            "vencida": reglas.vencida(t.vence_en, t.con_hora, t.estado, ahora, tz),
            "lista_id": t.lista_id,
            "lista": lst.nombre if lst else "",
            "lista_color": lst.color if lst else "",
            "orden": t.orden,
            "etiquetas": t.etiquetas or [],
            "checklist": t.checklist or [],
            "plantilla": t.plantilla,
            "clase": reglas.clase_tarea(t.titulo, t.origen, t.clase or "", vinc.get(f"tarea:{t.id}", [])),
            "clase_elegida": t.clase or "",
            "entregable": t.entregable,
            "entregable_texto": nombres_v.get(t.entregable, t.entregable),
            "vinculos": [{"id": d, "texto": nombres_v.get(d, d)} for d in vinc.get(f"tarea:{t.id}", [])],
            "origen": t.origen,
            "version": t.version,
            "creado_por": t.creado_por,
            "creado_por_nombre": nombres_u.get(t.creado_por or 0, ""),
            "creado_en": _iso(t.creado_en),
            "actualizado_en": _iso(t.actualizado_en),
            "cerrada_en": _iso(t.cerrada_en),
        })
    return salida


async def participantes_de(sesion: AsyncSession, ids: list[int]) -> dict[int, list[dict]]:
    if not ids:
        return {}
    filas = (await sesion.execute(select(EventoParticipante).where(EventoParticipante.evento_id.in_(ids)).order_by(EventoParticipante.id))).scalars().all()
    nombres_u = await nombres_usuarios(sesion, {p.usuario_id for p in filas if p.usuario_id})
    ids_p = {p.persona_id for p in filas if p.persona_id}
    personas = {}
    if ids_p:
        personas = {p.id: p.nombre for p in (await sesion.execute(select(Persona).where(Persona.id.in_(ids_p)))).scalars().all()}
    salida: dict[int, list[dict]] = {i: [] for i in ids}
    for p in filas:
        nombre = nombres_u.get(p.usuario_id or 0) or personas.get(p.persona_id or 0) or p.nombre
        salida.setdefault(p.evento_id, []).append({
            "id": p.id, "usuario_id": p.usuario_id, "persona_id": p.persona_id, "nombre": nombre or "(sin nombre)",
            "rol": p.rol, "confirmado": p.confirmado,
            "clave": f"u:{p.usuario_id}" if p.usuario_id else f"p:{p.persona_id}" if p.persona_id else f"n:{(p.nombre or '').strip().lower()}",
        })
    return salida


async def serializar_eventos(sesion: AsyncSession, eventos: list[EventoAgenda]) -> dict[int, dict]:
    ids = [e.id for e in eventos]
    part = await participantes_de(sesion, ids)
    vinc = await vinculos_de(sesion, [f"evento:{i}" for i in ids])
    nombres_v = await etiquetas_de(sesion, {d for lista in vinc.values() for d in lista})
    nombres_u = await nombres_usuarios(sesion, {e.responsable_id for e in eventos} | {e.creado_por for e in eventos}
                                       | {e.actualizado_por for e in eventos})
    return {
        e.id: {
            "id": e.id,
            "titulo": e.titulo,
            "descripcion": e.descripcion,
            "tipo": e.tipo,
            "estado": e.estado,
            "inicio": _iso(e.inicio),
            "fin": _iso(e.fin),
            "todo_el_dia": e.todo_el_dia,
            "lugar": e.lugar,
            "modalidad": e.modalidad,
            "enlace": e.enlace,
            "recurrencia": e.recurrencia,
            "excepciones": e.excepciones or [],
            "responsable_id": e.responsable_id,
            "responsable": nombres_u.get(e.responsable_id or 0, ""),
            "participantes": part.get(e.id, []),
            "vinculos": [{"id": d, "texto": nombres_v.get(d, d)} for d in vinc.get(f"evento:{e.id}", [])],
            "origen": e.origen,
            "version": e.version,
            "creado_por": e.creado_por,
            # Autoría (2026-10-18): la ficha la dice en una línea tenue, nunca la grilla.
            "creado_por_nombre": nombres_u.get(e.creado_por or 0, ""),
            "creado_en": _iso(e.creado_en),
            "actualizado_por": e.actualizado_por,
            "actualizado_por_nombre": nombres_u.get(e.actualizado_por or 0, ""),
            "actualizado_en": _iso(e.actualizado_en),
            "recordatorio_minutos": e.recordatorio_minutos,
        }
        for e in eventos
    }


# --- avisos y recordatorios ----------------------------------------------------------------


def avisar_asignacion(sesion: AsyncSession, t: Tarea, quien: Usuario) -> None:
    avisos.crear(sesion, t.responsable_id, f"Nueva tarea para usted: {t.titulo[:200]}", "tarea",
                 evitar=quien.id, destino=f"tarea:{t.id}")


async def emitir_asignacion(sesion: AsyncSession, t: Tarea, quien: Usuario) -> None:
    from app.servicios import eventos_sistema

    await eventos_sistema.emitir_seguro(sesion, "tarea.asignada", f"tarea:{t.id}",
                                        {"titulo": t.titulo, "responsable_id": t.responsable_id, "vence": t.vence_en.isoformat() if t.vence_en else ""},
                                        clave=f"tarea:{t.id}:asignada:{t.responsable_id}", usuario=quien)


async def recordatorios(sesion: AsyncSession) -> int:
    """Aviso en la campana del responsable de cada tarea abierta que vence en las próximas
    24 horas o ya venció, una vez al día por tarea (tipo `plazo`). Hace commit."""
    ahora = reglas.ahora_utc()
    tareas = (await sesion.execute(
        select(Tarea).where(Tarea.estado.in_(reglas.ABIERTOS), Tarea.responsable_id.is_not(None),
                            Tarea.vence_en.is_not(None), Tarea.vence_en <= ahora + timedelta(hours=24))
    )).scalars().all()
    if not tareas:
        return 0
    recientes = set((await sesion.execute(
        select(Notificacion.destino).where(Notificacion.tipo == "plazo", Notificacion.creado_en >= ahora - timedelta(hours=20))
    )).scalars().all())
    tz = zona()
    n = 0
    for t in tareas:
        destino = f"tarea:{t.id}"
        if destino in recientes:
            continue
        local = t.vence_en.astimezone(tz)
        cuando = local.strftime("%d/%m %H:%M") if t.con_hora else local.strftime("%d/%m")
        estado = "Venció" if reglas.vencida(t.vence_en, t.con_hora, t.estado, ahora, tz) else "Vence"
        avisos.crear(sesion, t.responsable_id, f"{estado} {cuando}: {t.titulo[:200]}", "plazo", destino=destino)
        n += 1
    if n:
        await sesion.commit()
    return n


# Minutos antes del inicio con que se avisa un evento si no fija los suyos (2026-10-12).
MINUTOS_RECORDATORIO = {"pleno": 120, "comision": 120, "semana_representacion": 180, "medio": 60, "externa": 90, "despacho": 30, "otro": 60}
# Un evento de todo el día se avisa la víspera a esta hora local.
HORA_AVISO_TODO_EL_DIA = 18


def momento_de_aviso(inicio: datetime, todo_el_dia: bool, tipo: str, minutos: int | None, tz) -> datetime | None:
    """Cuándo toca avisar un evento: `inicio - minutos` (los del evento o los del tipo); la
    víspera a las 18:00 si es de todo el día; None si `minutos == 0`. Pura."""
    if minutos == 0:
        return None
    if todo_el_dia:
        dia = inicio.astimezone(tz).date() - timedelta(days=1)
        return datetime.combine(dia, datetime.min.time(), tz).replace(hour=HORA_AVISO_TODO_EL_DIA)
    return inicio - timedelta(minutes=minutos if minutos is not None else MINUTOS_RECORDATORIO.get(tipo, 60))


async def recordatorios_eventos(sesion: AsyncSession) -> int:
    """Aviso en la campana del responsable y de los participantes del equipo cuando llega el
    momento de aviso de un evento activo (una vez por evento: `recordatorio_avisado_en`).
    Solo eventos únicos (una serie se repite cada semana: su aviso queda para después). Hace commit."""
    ahora = reglas.ahora_utc()
    tz = zona()
    eventos = (await sesion.execute(
        select(EventoAgenda).where(
            # Solo lo confirmado: una solicitud por confirmar no se recuerda (2026-10-18).
            EventoAgenda.estado == "confirmado", EventoAgenda.recordatorio_avisado_en.is_(None),
            EventoAgenda.recurrencia.is_(None), EventoAgenda.inicio >= ahora - timedelta(hours=1),
            EventoAgenda.inicio <= ahora + timedelta(days=2),
        )
    )).scalars().all()
    n = 0
    for e in eventos:
        cuando = momento_de_aviso(e.inicio, e.todo_el_dia, e.tipo, e.recordatorio_minutos, tz)
        if cuando is None or cuando > ahora:
            continue
        local = e.inicio.astimezone(tz)
        hora = "todo el día" if e.todo_el_dia else local.strftime("%H:%M")
        texto = f"Recordatorio: {local.strftime('%d/%m')} {hora} · {e.titulo[:160]}" + (f" · {e.lugar[:60]}" if e.lugar else "")
        destinatarios = {e.responsable_id} if e.responsable_id else set()
        destinatarios |= set((await sesion.execute(
            select(EventoParticipante.usuario_id).where(EventoParticipante.evento_id == e.id, EventoParticipante.usuario_id.is_not(None))
        )).scalars().all())
        if not destinatarios and e.creado_por:
            destinatarios = {e.creado_por}
        for uid in destinatarios:
            avisos.crear(sesion, uid, texto, "agenda", destino=f"evento:{e.id}")
        e.recordatorio_avisado_en = ahora
        from app.servicios import eventos_sistema

        await eventos_sistema.emitir_seguro(sesion, "evento.recordatorio", f"evento:{e.id}",
                                            {"titulo": e.titulo, "tipo": e.tipo, "inicio": e.inicio.isoformat(), "lugar": e.lugar, "responsable_id": e.responsable_id},
                                            clave=f"evento:{e.id}:recordatorio:{e.inicio.isoformat()}")
        n += 1
    if n:
        await sesion.commit()
    return n


async def bucle(intervalo: int = 900) -> None:
    """Recordatorios de plazo cada `intervalo` segundos (lo lanza main.py). Un fallo no
    detiene la API: se anota y se reintenta en la vuelta siguiente."""
    from app.db import SesionAsincrona

    await asyncio.sleep(30)
    while True:
        try:
            async with SesionAsincrona() as sesion:
                from app.servicios import agenda_detectada, tareas_automaticas

                await tareas_automaticas.sincronizar(sesion, forzar=True)
                # Lo detectado en los documentos, vinculado y sin duplicados (2026-10-12): al
                # arrancar (primera vuelta) y en cada vuelta; idempotente.
                try:
                    await agenda_detectada.reconciliar(sesion)
                except Exception as e:  # noqa: BLE001
                    await sesion.rollback()
                    log.warning("Reconciliar la agenda detectada: %s", e)
                n = await recordatorios(sesion)
                if n:
                    log.info("Recordatorios de plazo enviados: %s", n)
                m = await recordatorios_eventos(sesion)
                if m:
                    log.info("Recordatorios de eventos enviados: %s", m)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("Recordatorios de tareas: %s", e)
        await asyncio.sleep(intervalo)


async def evento_parecido(sesion: AsyncSession, titulo: str, inicio_iso: str, todo_el_dia: bool) -> dict | None:
    """El evento de la Agenda que ya es esta actividad (mismo día y título parecido: Jaccard
    ≥ 0,6, +0,25 a la misma hora): la misma citación llega dos veces, o la actividad se
    agendó antes de llegar el oficio. Así se vincula en vez de duplicarse. Lo usan Recibidos
    y el pegado de la Agenda (2026-10-11)."""
    from datetime import date as _date, time as _time

    tz = zona()
    try:
        dia = _date.fromisoformat((inicio_iso or "")[:10])
    except ValueError:
        return None
    ini = datetime.combine(dia, _time.min, tz)
    filas = (await sesion.execute(select(EventoAgenda).where(
        EventoAgenda.inicio >= ini, EventoAgenda.inicio < ini + timedelta(days=1),
        EventoAgenda.estado != "cancelado"))).scalars().all()
    mejor, puntaje = None, 0.0
    hora = inicio_iso[11:16] if len(inicio_iso) >= 16 else ""
    for e in filas:
        misma_hora = bool(hora and not todo_el_dia and not e.todo_el_dia and e.inicio.astimezone(tz).strftime("%H:%M") == hora)
        p = reglas.parecido(titulo, e.titulo, misma_hora)
        if p >= reglas.UMBRAL_PARECIDO and p > puntaje:
            mejor, puntaje = e, p
    if mejor is None:
        return None
    from app.servicios.agenda_reglas import ESTADOS

    return {"id": mejor.id, "titulo": mejor.titulo, "inicio": mejor.inicio.astimezone(tz).isoformat(), "parecido": round(puntaje, 2),
            "estado": mejor.estado, "estado_nombre": ESTADOS.get(mejor.estado, mejor.estado)}


async def tarea_parecida(sesion: AsyncSession, titulo: str, fecha: str | None = None, excluir_id: int | None = None) -> dict | None:
    """La tarea que ya es esta (2026-10-18, «avisar si ya existe algo parecido»): entre las abiertas
    y las cerradas de los últimos 30 días, la de título más parecido (`reglas.parecido` ≥ 0,6; +0,25
    si vence el mismo día). La usan el alta rápida, la ficha, el pegado del prompt y el chat."""
    if not (titulo or "").strip():
        return None
    tz = zona()
    desde = reglas.ahora_utc() - timedelta(days=30)
    consulta = select(Tarea).where((Tarea.estado.in_(reglas.ABIERTOS)) | (Tarea.cerrada_en >= desde))
    if excluir_id:
        consulta = consulta.where(Tarea.id != excluir_id)
    filas = (await sesion.execute(consulta.order_by(Tarea.id.desc()).limit(3000))).scalars().all()
    dia = (fecha or "")[:10]
    mejor, puntaje = None, 0.0
    for t in filas:
        mismo = bool(dia and t.vence_en and t.vence_en.astimezone(tz).date().isoformat() == dia)
        p = reglas.parecido(titulo, t.titulo, mismo)
        if p >= reglas.UMBRAL_PARECIDO and p > puntaje:
            mejor, puntaje = t, p
    if mejor is None:
        return None
    return {"id": mejor.id, "titulo": mejor.titulo, "estado": mejor.estado, "estado_nombre": reglas.ETIQUETA_ESTADO.get(mejor.estado, mejor.estado),
            "vence_fecha": mejor.vence_en.astimezone(tz).date().isoformat() if mejor.vence_en else None,
            "responsable": (await nombres_usuarios(sesion, {mejor.responsable_id})).get(mejor.responsable_id or 0, ""),
            "parecido": round(puntaje, 2)}


async def anunciar_evento(sesion: AsyncSession, e: EventoAgenda, usuario: Usuario | None) -> None:
    """`evento.creado` (el tema «Agenda» del chat lo cuenta como «Agendado») solo cuando el evento
    está CONFIRMADO: una solicitud por confirmar se anuncia al confirmarla (2026-10-18). La clave
    del evento del sistema es la del evento de la agenda: confirmar dos veces no lo repite."""
    from app.servicios import agenda_reglas, eventos_sistema

    if not agenda_reglas.anunciable(e.estado):
        return
    await eventos_sistema.emitir_seguro(sesion, "evento.creado", f"evento:{e.id}",
                                        {"titulo": e.titulo, "tipo": e.tipo, "inicio": e.inicio.isoformat(), "lugar": e.lugar,
                                         "responsable_id": e.responsable_id}, usuario=usuario)

"""Sincronización Qillqa ⇄ OpenProject (2026-10-02).

Corre sola dentro de la API (main.py), cada `OPENPROJECT_INTERVALO` segundos, y a
pedido del administrador («Sincronizar ahora»). Tres pasos por vuelta:

1. REFLEJAR (Qillqa → OpenProject). Arma desde la base cómo debe verse cada
   documento y cada proyecto de ley (servicios/openproject_mapa.py) y escribe
   SOLO lo que cambió desde la última vez (huella). Un paquete que ya existía con
   la misma clave —p. ej. los que creó el puente manual de `openproject/`— se adopta,
   no se duplica. Como mucho `TOPE_ESCRITURAS` por vuelta: la primera vez con
   cien documentos se completa en pocas vueltas sin saturar OpenProject.
2. DEVOLVER (OpenProject → Qillqa). Si en OpenProject alguien cierra o reabre una
   fase o una tarea de un proyecto de ley, Qillqa lo toma y lo deja en la
   bitácora del proyecto. Es lo único que vuelve: el resto lo manda Qillqa.
3. AVISAR. Lo que se asigna en OpenProject a alguien del equipo (y no es un
   reflejo de Qillqa) llega a su campana de Qillqa una vez.

Nunca borra en OpenProject. Si un reflejo se borra allá, se vuelve a crear.
Un fallo de OpenProject no afecta a Qillqa: se anota en el enlace y se reintenta.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from tiqsi.modulo import opcional

from app.config import config
from app.db import SesionAsincrona
from app.modelos import OpAsignacionVista, OpEnlace, Usuario
from app.servicios import notificaciones as avisos
from app.servicios import openproject as op
from app.servicios import openproject_mapa as mapa

log = logging.getLogger("qillqa.openproject")

TOPE_ESCRITURAS = 40
# La última vuelta, para el panel del administrador.
ULTIMA: dict = {"en": None, "resumen": {}, "error": ""}


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


# --- Lectura de Qillqa -----------------------------------------------------------


async def items_qillqa(sesion=None) -> list[mapa.Item]:
    """Todo lo que Qillqa refleja, con los padres antes que los hijos. Los documentos y los proyectos de ley son de
    Qillqasqa: por «documentos.v1» y «proyectos.v1» (Q3e, 2026-10-21); sin uno de ellos, no se refleja."""
    base = config.qillqa_url_publica
    items: list[mapa.Item] = []
    documentos = opcional("documentos.v1")
    for d in await documentos.para_openproject() if documentos is not None else ():
        it = mapa.item_documento(
            d, base_qillqa=base, proyecto_documentos=config.openproject_proyecto_documentos,
            proyecto_recibidos=config.openproject_proyecto_recibidos,
        )
        if it:
            items.append(it)
    proyectos = opcional("proyectos.v1")
    for pl in await proyectos.para_openproject() if proyectos is not None else ():
        items += mapa.items_proyecto(pl["proyecto"], pl["fases"], pl["tareas"], base_qillqa=base,
                                     proyecto_legislativo=config.openproject_proyecto_legislativo)
    return items


async def mapa_usuarios(sesion, cat: dict) -> dict[int, int]:
    filas = (await sesion.execute(select(Usuario.id, Usuario.email, Usuario.nombre_usuario).where(Usuario.activo.is_(True)))).all()
    return mapa.usuarios_op([{"id": i, "email": e, "nombre_usuario": n} for i, e, n in filas], cat["usuarios"])


# --- Escritura en OpenProject (síncrona: corre en un hilo) ----------------------


def _href(coleccion: str, ident) -> dict:
    return {"href": f"/api/v3/{coleccion}/{ident}"}


def cuerpo_paquete(cli: op.Cliente, cat: dict, it: mapa.Item, op_responsable: int | None, padre_wp: int | None, crear: bool) -> dict:
    """El JSON que espera OpenProject. Al actualizar no toca proyecto ni descripción."""
    pid = cat["proyectos"].get(it.proyecto)
    tid = cat["tipos"].get(it.tipo)
    if pid is None:
        raise op.ErrorOP(f"el proyecto «{it.proyecto}» no existe en OpenProject")
    if tid is None:
        raise op.ErrorOP(f"el tipo «{it.tipo}» no existe en OpenProject")
    campos = cli.esquema(pid, tid)
    enlaces: dict = {
        "type": _href("types", tid),
        "assignee": _href("users", op_responsable) if op_responsable else {"href": None},
    }
    if it.estado in cat["estados"]:
        enlaces["status"] = _href("statuses", cat["estados"][it.estado])
    if padre_wp:
        enlaces["parent"] = _href("work_packages", padre_wp)
    cuerpo: dict = {"subject": it.asunto, "startDate": it.inicio or None, "dueDate": it.fin or None}
    for nombre, valor in {**it.textos, mapa.CAMPO_CLAVE: it.clave}.items():
        if nombre in campos:
            cuerpo[campos[nombre]["clave"]] = valor
    for nombre, valor in it.listas.items():
        defin = campos.get(nombre)
        if defin and defin["opciones"].get(valor):
            enlaces[defin["clave"]] = {"href": defin["opciones"][valor]}
    if crear:
        enlaces["project"] = _href("projects", pid)
        if cat.get("prioridad_defecto"):
            enlaces["priority"] = _href("priorities", cat["prioridad_defecto"])
        cuerpo["description"] = {"format": "markdown", "raw": it.descripcion}
    cuerpo["_links"] = enlaces
    return cuerpo


def escribir(cli: op.Cliente, cat: dict, it: mapa.Item, op_responsable: int | None, padre_wp: int | None, wp_id: int | None) -> tuple[int, bool, str]:
    """Crea o actualiza el reflejo. Devuelve (id, cerrado en OP, nota). Si el flujo de
    OpenProject no admite el estado, escribe lo demás y lo anota."""
    if wp_id is None:
        pid, tid = cat["proyectos"].get(it.proyecto), cat["tipos"].get(it.tipo)
        clave_cf = cli.esquema(pid, tid).get(mapa.CAMPO_CLAVE, {}).get("clave") if pid and tid else None
        existente = (cli.buscar_por_clave(clave_cf, it.clave) or cli.buscar_por_clave(clave_cf, mapa.clave_vieja(it.clave))) if clave_cf else None
        if existente:
            wp_id = existente["id"]  # adoptado (p. ej. del puente manual de openproject/)
    cuerpo = cuerpo_paquete(cli, cat, it, op_responsable, padre_wp, crear=wp_id is None)
    nota = ""
    try:
        r = cli.actualizar(wp_id, cuerpo) if wp_id else cli.crear(cuerpo)
    except op.ErrorOP as e:
        if e.codigo != 422 or "status" not in cuerpo["_links"]:
            raise
        cuerpo["_links"].pop("status")
        r = cli.actualizar(wp_id, cuerpo) if wp_id else cli.crear(cuerpo)
        nota = f"OpenProject no admitió el estado «{it.estado}» para {it.tipo}: {e}"
    estado_href = (r.get("_links", {}).get("status") or {}).get("href", "")
    estado_id = int(estado_href.rsplit("/", 1)[-1]) if estado_href.rsplit("/", 1)[-1].isdigit() else None
    return int(r["id"]), estado_id in cat["cerrados"], nota


# --- Una vuelta ------------------------------------------------------------------


_CANDADO = asyncio.Lock()


async def ciclo(refrescar: bool = False) -> dict:
    """Una vuelta a la vez (la automática y «Sincronizar ahora» no se cruzan).
    `refrescar`: vuelve a leer proyectos, usuarios y campos de OpenProject ya."""
    if not op.activa():
        return {"activa": False}
    async with _CANDADO:
        if refrescar:
            await asyncio.to_thread(op.cliente().catalogo, True)
        return await _ciclo()


async def _ciclo() -> dict:
    """Devolver, reflejar y avisar. Devuelve un resumen (también queda en ULTIMA)."""
    cli = op.cliente()
    resumen = {"activa": True, "escritos": 0, "pendientes": 0, "errores": 0, "devueltos": 0, "avisos": 0}
    try:
        cat = await asyncio.to_thread(cli.catalogo)
        async with SesionAsincrona() as s:
            enlaces = {e.clave: e for e in (await s.execute(select(OpEnlace))).scalars()}
            # Primero lo cerrado o reabierto ALLÁ: si se reflejara antes, Qillqa
            # pisaría en la misma vuelta lo que alguien acaba de hacer en OpenProject.
            resumen["devueltos"] = await _devolver(s, cli, cat, enlaces)
            await s.commit()
            items = await items_qillqa(s)
            usuarios = await mapa_usuarios(s, cat)
            for it in items:
                e = enlaces.get(it.clave)
                if e is None:
                    e = OpEnlace(clave=it.clave, huella="", error="", intentos=0)
                    s.add(e)
                    enlaces[it.clave] = e
                op_resp = usuarios.get(it.responsable_id) if it.responsable_id else None
                huella = it.huella(op_resp)
                if e.wp_id and e.huella == huella:
                    continue
                if resumen["escritos"] >= TOPE_ESCRITURAS:
                    resumen["pendientes"] += 1
                    continue
                padre = enlaces.get(it.padre)
                if it.padre and not (padre and padre.wp_id):
                    resumen["pendientes"] += 1  # el padre aún no existe allá: en la próxima vuelta
                    continue
                try:
                    wp_id, cerrado, nota = await asyncio.to_thread(escribir, cli, cat, it, op_resp, padre.wp_id if padre else None, e.wp_id)
                    e.wp_id, e.huella, e.error, e.intentos = wp_id, huella, nota, 0
                    e.op_cerrado, e.sincronizado_en = cerrado, _ahora()
                except op.ErrorOP as x:
                    if x.codigo == 404 and e.wp_id:
                        e.wp_id = None  # lo borraron allá: se vuelve a crear
                    e.error, e.intentos = str(x)[:500], (e.intentos or 0) + 1
                    resumen["errores"] += 1
                resumen["escritos"] += 1
            await s.commit()
            resumen["avisos"] = await _avisar(s, cli, cat, usuarios)
            await s.commit()
        ULTIMA.update(en=_ahora(), resumen=resumen, error="")
    except op.ErrorOP as x:
        ULTIMA.update(en=_ahora(), resumen=resumen, error=str(x))
        resumen["error"] = str(x)
    return resumen


async def _devolver(s, cli: op.Cliente, cat: dict, enlaces: dict[str, OpEnlace]) -> int:
    """Fases y tareas de PL cerradas o reabiertas EN OpenProject → Qillqa."""
    vigilados = {e.wp_id: e for e in enlaces.values() if e.wp_id and e.clave.startswith(("qillqa:pl-fase:", "qillqa:pl-tarea:"))}
    cambios = 0
    ids = list(vigilados)
    for i in range(0, len(ids), 100):
        lote = await asyncio.to_thread(
            cli.paquetes, {"id": {"operator": "=", "values": [str(x) for x in ids[i:i + 100]]}}, {"status": {"operator": "*", "values": []}}
        )
        for wp in lote:
            e = vigilados.get(wp["id"])
            href = (wp.get("_links", {}).get("status") or {}).get("href", "")
            cerrado = href.rsplit("/", 1)[-1].isdigit() and int(href.rsplit("/", 1)[-1]) in cat["cerrados"]
            if e is None or e.op_cerrado is None or cerrado == e.op_cerrado:
                if e is not None:
                    e.op_cerrado = cerrado
                continue
            e.op_cerrado = cerrado
            # La fase o la tarea es de Proyectos de ley: la cambia él, por «proyectos.v1» (Q3e), con su bitácora.
            proyectos = opcional("proyectos.v1")
            if proyectos is None:
                continue
            clave = e.clave
            cambio = await proyectos.cambiar_desde_openproject(
                "tarea" if clave.startswith("qillqa:pl-tarea:") else "fase", int(clave.rsplit(":", 1)[1]),
                lambda estado, clave=clave, cerrado=cerrado: mapa.cierre_desde_op(clave, cerrado, estado))
            if not cambio:
                continue
            e.huella = ""  # se vuelve a escribir con el estado que quedó
            cambios += 1
    return cambios


async def _avisar(s, cli: op.Cliente, cat: dict, usuarios: dict[int, int]) -> int:
    """Asignaciones nuevas en OpenProject (que no son reflejos) → campana de Qillqa."""
    if not usuarios:
        return 0
    inverso = {o: sg for sg, o in usuarios.items()}
    paquetes = await asyncio.to_thread(
        cli.paquetes,
        {"assignee": {"operator": "=", "values": [str(o) for o in inverso]}},
        {"status": {"operator": "o", "values": []}},
        orden=[["updatedAt", "desc"]],
    )
    clave_cf = cli.clave_campo(mapa.CAMPO_CLAVE)
    vistas = {(v.wp_id, v.op_usuario_id) for v in (await s.execute(select(OpAsignacionVista))).scalars()}
    # La primera vez solo se toma nota de lo que ya estaba asignado (no se avisa lo
    # de antes); la marca (0, 0) dice que esa primera vez ya pasó.
    primera = (0, 0) not in vistas
    if primera:
        s.add(OpAsignacionVista(wp_id=0, op_usuario_id=0))
    nuevos = 0
    for wp in paquetes:
        if clave_cf and mapa.es_propia(wp.get(clave_cf)):
            continue  # reflejo de Qillqa: ya lo avisó Qillqa
        href = (wp.get("_links", {}).get("assignee") or {}).get("href") or ""
        op_usuario = int(href.rsplit("/", 1)[-1]) if href.rsplit("/", 1)[-1].isdigit() else None
        if op_usuario is None or (wp["id"], op_usuario) in vistas:
            continue
        s.add(OpAsignacionVista(wp_id=wp["id"], op_usuario_id=op_usuario))
        vistas.add((wp["id"], op_usuario))
        if primera:
            continue  # la primera vez solo se toma nota: no se avisa lo de antes
        r = op.resumen_paquete(wp)
        avisos.crear(s, inverso.get(op_usuario), f"OpenProject: le asignaron «{r['asunto']}» ({r['proyecto']})", tipo="openproject", destino=f"op:{wp['id']}")
        nuevos += 1
    return nuevos


async def bucle() -> None:
    """La vuelta periódica (main.py la lanza al arrancar). Nunca tumba la API."""
    while True:
        if op.activa():
            try:
                await ciclo()
            except Exception as x:  # noqa: BLE001 — un fallo inesperado no detiene el bucle
                log.exception("Sincronización con OpenProject")
                ULTIMA.update(en=_ahora(), error=f"{type(x).__name__}: {x}")
        await asyncio.sleep(max(10, config.openproject_intervalo))

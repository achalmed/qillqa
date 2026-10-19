"""Panel de estadísticas del sistema documental.

Un solo endpoint de LECTURA que agrega todo lo que el panel pinta: totales,
por estado/tipo/mes, top de instituciones y destinatarios (con el MISMO
criterio de derivación que la columna «Institución destino» de la bandeja),
conteos de adjuntos y actividad reciente. El volumen es chico (decenas de
documentos), así que se agrega en Python sobre una sola consulta — igual que
hace la bandeja — en vez de SQL complejo sobre JSONB.

Vinculado al MAPA DE RELACIONES (Edison 2026-10-19: «que estadísticas y el módulo de
relaciones trabajen de manera colaborativa»): la correspondencia (respondidos, días de
respuesta, oficios sin respuesta) se calcula sobre el mismo grafo del mapa
(`servicios/grafo.correspondencia`), y cada institución o destinatario trae el `foco` de su
nodo para abrirse en el mapa (`/mapa?foco=inst:N`).
"""

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.documentos import _instituciones
from app.db import obtener_sesion
from app.flujo import ve_autoria
from app.modelos import Adjunto, Documento, Evento, Usuario
from app.seguridad import usuario_actual
from app.servicios import grafo
from app.servicios.entradas import hoy_lima
from app.tipos import tipo_config

router = APIRouter(prefix="/api/estadisticas", tags=["estadisticas"])

# «En trámite» = todo lo que no está ni enviado ni archivado (incluye el
# observado posterior: es un pendiente activo aunque ya se haya enviado).
_FINALES = {"ENVIADO", "ARCHIVADO"}


def _destinatarios(doc: Documento) -> list[str]:
    """Mismo criterio que la bandeja: líneas de destinatario_nombre, tomando
    el nombre antes de « — »."""
    return [
        l.split(" — ", 1)[0].strip()
        for l in ((doc.campos or {}).get("destinatario_nombre") or "").splitlines()
        if l.strip()
    ]


@router.get("")
async def estadisticas(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    docs = (await sesion.execute(select(Documento))).scalars().all()

    # ----- totales y por estado ------------------------------------------
    por_estado = Counter(d.estado for d in docs)
    enviados = por_estado.get("ENVIADO", 0)
    archivados = por_estado.get("ARCHIVADO", 0)
    en_tramite = sum(n for e, n in por_estado.items() if e not in _FINALES)

    # ----- por tipo (con nombre legible y avance de envío) ---------------
    por_tipo: dict[str, dict] = {}
    for d in docs:
        fila = por_tipo.setdefault(
            d.tipo,
            {"tipo": d.tipo, "nombre": tipo_config(d.tipo)["nombre"], "total": 0,
             "numerados": 0, "enviados": 0},
        )
        fila["total"] += 1
        if d.numero is not None:
            fila["numerados"] += 1
        if d.estado == "ENVIADO":
            fila["enviados"] += 1

    # ----- por mes (creados; últimos 12 meses con hueco en 0) ------------
    ahora = datetime.now(timezone.utc)
    meses = []
    a, m = ahora.year, ahora.month
    for _ in range(12):
        meses.append(f"{a:04d}-{m:02d}")
        m -= 1
        if m == 0:
            a, m = a - 1, 12
    meses.reverse()
    creados = Counter(d.creado_en.strftime("%Y-%m") for d in docs if d.creado_en)
    por_mes = [{"mes": mes, "total": creados.get(mes, 0)} for mes in meses]

    # ----- top instituciones y destinatarios -----------------------------
    inst = Counter()
    dest = Counter()
    from app.servicios import instituciones_destino as svc_inst

    idx_inst = await svc_inst.indice(sesion)
    for d in docs:
        for i in set(_instituciones(d, idx_inst)):
            inst[i] += 1
        for x in set(_destinatarios(d)):
            dest[x] += 1
    # El mismo grafo del mapa: cada fila sabe qué nodo abrir y la correspondencia sale de él.
    mapa = await grafo.construir(sesion, ver_ocultos=usuario.rol == "administrador", ver_autoria=ve_autoria(usuario))
    foco_inst, foco_pers = grafo.foco_por_nombre(mapa)
    top_inst = [
        {"nombre": n, "total": t, "foco": foco_inst.get(svc_inst.plano(svc_inst.normalizar(n)[0]), "")}
        for n, t in inst.most_common(12)
    ]
    top_dest = [
        {"nombre": n, "total": t, "foco": foco_pers.get(grafo.nombre_de_persona(n), "")}
        for n, t in dest.most_common(12)
    ]
    corresp = grafo.correspondencia(mapa, date.fromisoformat(hoy_lima()))
    for interno in ("por_nodo", "por_doc"):
        corresp.pop(interno)

    # ----- adjuntos por categoría ----------------------------------------
    # Firmados: DOCUMENTOS con su firmado (no archivos), comparable con «Firmado» y
    # «Enviado» de por estado (2026-10-19: «Firmados subidos 160» frente a «Firmado 9»).
    filas_adj = (
        await sesion.execute(
            select(Adjunto.categoria, func.count(), func.count(func.distinct(Adjunto.documento_id)))
            .group_by(Adjunto.categoria)
        )
    ).all()
    adj = {"anexos": 0, "firmados": 0, "constancias": 0}
    for categoria, n, docs_con in filas_adj:
        if categoria == "firmado":
            adj["firmados"] = docs_con
        elif categoria == "recepcion":
            adj["constancias"] = n
        else:
            adj["anexos"] += n  # categoría vacía/None = adjuntos genéricos

    # ----- actividad (eventos por día, últimos 30) -----------------------
    desde = ahora - timedelta(days=30)
    filas_ev = (
        await sesion.execute(
            select(func.date(Evento.fecha), func.count())
            .where(Evento.fecha >= desde)
            .group_by(func.date(Evento.fecha))
            .order_by(func.date(Evento.fecha))
        )
    ).all()
    actividad = [{"dia": str(dia), "eventos": n} for dia, n in filas_ev]
    total_eventos = (
        await sesion.execute(select(func.count()).select_from(Evento))
    ).scalar()

    return {
        "totales": {
            "documentos": len(docs),
            "en_tramite": en_tramite,
            "enviados": enviados,
            "archivados": archivados,
            "numerados": sum(1 for d in docs if d.numero is not None),
            "borradores": sum(1 for d in docs if d.numero is None),
            **adj,
            "eventos": total_eventos,
        },
        "por_estado": dict(por_estado),
        "por_tipo": sorted(por_tipo.values(), key=lambda f: -f["total"]),
        "por_mes": por_mes,
        "top_instituciones": top_inst,
        "top_destinatarios": top_dest,
        "actividad": actividad,
        "correspondencia": corresp,
    }

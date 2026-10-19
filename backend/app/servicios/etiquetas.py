"""El resolvedor central de etiquetas de entidad (2026-10-12, Edison: «todo está vinculado y nada
está suelto; cuando actualice algo, se actualiza lo vinculado»).

Una entidad se nombra por su clave `tipo:id` (`doc:12`, `entrada:7`, `pl:3`, `sr:2`, `persona:5`,
`inst:4` o `institucion:4`, `usuario:1`, `tarea:9`, `evento:8`, `pedido:6`, `foto:3`, `rend:2`). Lo que no es
un documento oficial se muestra con el valor VIGENTE de lo vinculado: quien guarda la clave la
resuelve aquí al leer (`etiquetas_de`), en vez de guardar una copia del número, el asunto o el nombre.

El contenido de un documento oficial (numerado, firmado, enviado) y lo ya impreso NO pasan por
aquí: son historia oficial y no cambian porque cambie el directorio (`docs/arquitectura.md` §27).

Lo puro (partir la clave, armar la etiqueta) se prueba en tests/test_etiquetas.py.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Sinónimos de prefijo que circulan en el sistema → el canónico.
ALIAS = {"institucion": "inst", "documento": "doc", "proyecto": "pl", "semana": "sr", "recibido": "entrada",
         "rendicion": "rend"}


def partir(clave: str) -> tuple[str, int] | None:
    """`doc:12` → ('doc', 12); `institucion:4` → ('inst', 4); lo que no es clave → None. Pura."""
    try:
        tipo, n = (clave or "").strip().split(":", 1)
        return ALIAS.get(tipo, tipo), int(n)
    except ValueError:
        return None


def etiqueta_documento(numero: str, asunto: str = "", largo: int = 80) -> str:
    """«Oficio N° 0012-… — Asunto» (el asunto recortado). Pura."""
    asunto = (asunto or "").strip()
    return f"{numero} — {asunto[:largo]}" if asunto else numero


def numero_de(doc) -> str:
    """El número vigente: el oficial si lo tiene (o el impreso de un heredado); «borrador» si no."""
    from app.servicios.numeracion import numero_mostrado
    from app.tipos import tipo_config

    if doc.numero is not None or doc.origen != "sgdp":
        return numero_mostrado(doc)
    return f"{tipo_config(doc.tipo).get('nombre') or 'Documento'} (borrador)"


def etiqueta_persona(nombre: str, cargo: str = "") -> str:
    return (nombre or "") + (f" ({cargo[:50]})" if cargo else "")


def etiqueta_institucion(nombre: str, siglas: str = "") -> str:
    return f"{siglas} — {nombre}" if siglas else (nombre or "")


def remitente_vigente(texto: str, cargo: str, persona: tuple[str, str] | None = None,
                      institucion: str | None = None) -> tuple[str, str]:
    """Remitente de un recibido con el valor VIGENTE del directorio: vinculado a una persona, su
    nombre y su cargo de hoy; solo a una institución, su nombre de hoy; sin vínculo, lo registrado.
    `persona` = (nombre, cargo). Pura."""
    if persona and persona[0]:
        return persona[0], persona[1] or cargo or ""
    if institucion:
        return institucion, cargo or ""
    return texto or "", cargo or ""


async def etiquetas_de(sesion: AsyncSession, destinos: set[str] | list[str]) -> dict[str, str]:
    """Nombre legible y VIGENTE de cada clave (`doc:12` → «Oficio N° 0012-… — Asunto»). La salida
    usa la clave tal como llegó (`institucion:4` y `inst:4` se resuelven igual). Lo que ya no
    existe no aparece: quien llama decide qué mostrar (normalmente la clave)."""
    from app.modelos import Documento, Entrada, Institucion, PedidoSR, Persona, Proyecto, SemanaSR, Usuario
    from app.modelos_tareas import EventoAgenda, Tarea
    from app.tipos import asunto_de

    por_tipo: dict[str, dict[int, list[str]]] = {}
    for d in destinos or ():
        p = partir(d)
        if p:
            por_tipo.setdefault(p[0], {}).setdefault(p[1], []).append(d)
    salida: dict[str, str] = {}

    def poner(tipo: str, ident: int, texto: str) -> None:
        for original in por_tipo.get(tipo, {}).get(ident, []):
            salida[original] = texto

    async def filas(modelo, tipo: str):
        ids = por_tipo.get(tipo)
        if not ids:
            return []
        return (await sesion.execute(select(modelo).where(modelo.id.in_(list(ids))))).scalars().all()

    for d in await filas(Documento, "doc"):
        poner("doc", d.id, etiqueta_documento(numero_de(d), asunto_de(d.tipo, d.campos) or ""))
    for p in await filas(Proyecto, "pl"):
        poner("pl", p.id, f"{p.codigo} — {p.titulo[:80]}" if p.codigo else p.titulo[:100])
    for s in await filas(SemanaSR, "sr"):
        poner("sr", s.id, f"Semana de representación {s.codigo}")
    for p in await filas(Persona, "persona"):
        poner("persona", p.id, etiqueta_persona(p.nombre, p.cargo or ""))
    for i in await filas(Institucion, "inst"):
        poner("inst", i.id, etiqueta_institucion(i.nombre, i.siglas or ""))
    for u in await filas(Usuario, "usuario"):
        poner("usuario", u.id, etiqueta_persona(u.nombre_completo, u.cargo or ""))
    for pe in await filas(PedidoSR, "pedido"):
        poner("pedido", pe.id, f"Pedido {pe.codigo}")
    if por_tipo.get("foto"):
        from app.modelos import Foto

        for f in await filas(Foto, "foto"):
            poner("foto", f.id, f.titulo or f.nombre_original or f"Foto {f.id}")
    for en in await filas(Entrada, "entrada"):
        nombre = en.documento or en.nombre_original or f"Recibido {en.id}"
        poner("entrada", en.id, f"Recibido: {nombre}" + (f" — {en.asunto[:80]}" if en.asunto else ""))
    for t in await filas(Tarea, "tarea"):
        poner("tarea", t.id, f"Tarea: {t.titulo[:90]}")
    for e in await filas(EventoAgenda, "evento"):
        poner("evento", e.id, f"Evento: {e.titulo[:90]}")
    if por_tipo.get("rend"):
        # Rendición de cuentas (2026-10-18): el comisionado y la semana, vigentes.
        from app.modelos_rendicion import Rendicion

        for r in await filas(Rendicion, "rend"):
            u = await sesion.get(Usuario, r.usuario_id)
            s = await sesion.get(SemanaSR, r.semana_id) if r.semana_id else None
            poner("rend", r.id, f"Rendición R-{r.id:03d} — {(u.nombre_completo if u else '')}" + (f" ({s.codigo})" if s else ""))
    return salida


async def etiqueta_de(sesion: AsyncSession, clave: str, defecto: str | None = None) -> str:
    """Una sola clave; si ya no existe (o no es de las que se resuelven), `defecto` o la clave."""
    if not clave:
        return defecto or ""
    return (await etiquetas_de(sesion, {clave})).get(clave, clave if defecto is None else defecto)


async def cortas_de(sesion: AsyncSession, destinos: set[str] | list[str]) -> dict[str, str]:
    """El código corto y VIGENTE de cada clave, para chips y vínculos breves: `doc:12` → «OF-0012»
    (o «Oficio (borrador)»), `pl:3` → su código, `sr:2` → «SR-02». Lo demás, como `etiquetas_de`."""
    from app.modelos import Documento, Proyecto, SemanaSR
    from app.tipos import tipo_config

    salida: dict[str, str] = {}
    resto: set[str] = set()
    por: dict[str, dict[int, list[str]]] = {}
    for d in destinos or ():
        p = partir(d)
        if p and p[0] in ("doc", "pl", "sr"):
            por.setdefault(p[0], {}).setdefault(p[1], []).append(d)
        elif p:
            resto.add(d)
    for modelo, tipo in ((Documento, "doc"), (Proyecto, "pl"), (SemanaSR, "sr")):
        ids = por.get(tipo)
        if not ids:
            continue
        for fila in (await sesion.execute(select(modelo).where(modelo.id.in_(list(ids))))).scalars().all():
            if tipo == "doc":
                serie = tipo_config(fila.tipo).get("serie") or fila.serie
                texto = f"{serie}-{fila.numero:04d}" if fila.numero is not None else numero_de(fila)
            elif tipo == "pl":
                texto = fila.codigo or fila.titulo[:60]
            else:
                texto = fila.codigo
            for original in ids[fila.id]:
                salida[original] = texto
    if resto:
        salida.update(await etiquetas_de(sesion, resto))
    return salida


# --- al cambiar: lo que guarda una copia se recompone ------------------------------------------


async def propagar(sesion: AsyncSession, entidad: str) -> int:
    """La entidad cambió (se numeró, cambió de estado, de asunto, de nombre): recompone las copias
    que el sistema guarda de ella fuera de los documentos oficiales. Hoy, de un documento: el título
    de sus eventos detectados y de sus tareas automáticas. Sin commit; nunca hace fallar a quien llama. Devuelve cuántas filas
    cambió."""
    import logging

    p = partir(entidad)
    if not p:
        return 0
    cambios = 0
    try:
        async with sesion.begin_nested():
            if p[0] == "doc":
                from app.modelos import Documento
                from app.servicios import agenda_detectada

                from app.servicios import tareas_automaticas

                doc = await sesion.get(Documento, p[1])
                if doc is None:
                    return 0
                cambios = (await agenda_detectada.recomponer_de_documento(sesion, doc)
                           + await tareas_automaticas.recomponer_de_documento(sesion, doc.id))
    except Exception:  # noqa: BLE001 — lo vinculado se repone en la reconciliación
        logging.getLogger("sgdp.etiquetas").exception("No se pudo propagar el cambio de %s", entidad)
    # Los mensajes del chat que presentan la entidad se ponen al día (2026-10-18, §27 y §25): para toda
    # entidad (`doc:`, `evento:`, `tarea:`, `entrada:`…), por su propio camino seguro.
    from app.servicios import chat as svc_chat

    cambios += await svc_chat.refrescar_mensajes_de(sesion, f"{p[0]}:{p[1]}")
    return cambios

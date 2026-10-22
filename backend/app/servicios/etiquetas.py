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
from tiqsi.modulo import opcional

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


async def _documentos(ids) -> dict[int, dict]:
    """La descripción de cada documento, por «documentos.v1» (sin Gestión documental, ninguna)."""
    documentos = opcional("documentos.v1") if ids else None
    return await documentos.descripciones(list(ids)) if documentos is not None else {}


async def _proyectos(ids) -> dict[int, dict]:
    proyectos = opcional("proyectos.v1") if ids else None
    return await proyectos.etiquetas(list(ids)) if proyectos is not None else {}


async def _semanas(que: str, ids) -> dict[int, str]:
    semanas = opcional("semanas.v1") if ids else None
    return await getattr(semanas, que)(list(ids)) if semanas is not None else {}


async def etiquetas_de(sesion: AsyncSession, destinos: set[str] | list[str]) -> dict[str, str]:
    """Nombre legible y VIGENTE de cada clave (`doc:12` → «Oficio N° 0012-… — Asunto»). La salida
    usa la clave tal como llegó (`institucion:4` y `inst:4` se resuelven igual). Lo que ya no
    existe no aparece: quien llama decide qué mostrar (normalmente la clave)."""
    from app.modelos import Institucion, Persona, Usuario

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

    # Los documentos, los proyectos, las semanas y sus pedidos son de Qillqasqa: por su contrato (Q3b, 2026-10-21).
    for d in (await _documentos(por_tipo.get("doc"))).values():
        poner("doc", d["id"], etiqueta_documento(d["vigente"], d["asunto"]))
    for pid, p in (await _proyectos(por_tipo.get("pl"))).items():
        poner("pl", pid, f"{p['codigo']} — {p['titulo'][:80]}" if p["codigo"] else p["titulo"][:100])
    for sid, codigo in (await _semanas("etiquetas", por_tipo.get("sr"))).items():
        poner("sr", sid, f"Semana de representación {codigo}")
    for p in await filas(Persona, "persona"):
        poner("persona", p.id, etiqueta_persona(p.nombre, p.cargo or ""))
    for i in await filas(Institucion, "inst"):
        poner("inst", i.id, etiqueta_institucion(i.nombre, i.siglas or ""))
    for u in await filas(Usuario, "usuario"):
        poner("usuario", u.id, etiqueta_persona(u.nombre_completo, u.cargo or ""))
    for pid, codigo in (await _semanas("pedidos", por_tipo.get("pedido"))).items():
        poner("pedido", pid, f"Pedido {codigo}")
    if por_tipo.get("foto"):
        # La Mediateca rotula sus fotos por referencia («fototeca:foto:<id>», fase 10.2b del contrato de
        # Tiqsi): nada se importa de ella; sin la Mediateca, la foto queda sin rótulo, como una que no existe.
        from tiqsi.modulo import resolver

        for fid in por_tipo["foto"]:
            r = await resolver(f"fototeca:foto:{fid}")
            if r is not None:
                poner("foto", fid, r["titulo"])
    # Lo recibido es de la Mesa de Partes: por «recibidos.v1» (Punku P2).
    if por_tipo.get("entrada"):
        recibidos = opcional("recibidos.v1")
        for en in (await recibidos.fichas(list(por_tipo["entrada"]))).values() if recibidos is not None else ():
            nombre = en["documento"] or en["nombre_original"] or f"Recibido {en['id']}"
            poner("entrada", en["id"], f"Recibido: {nombre}" + (f" — {en['asunto'][:80]}" if en["asunto"] else ""))
    # Las tareas y los eventos son de Tareas y Agenda (fase 10.2b): por referencia («tareas:tarea:<id>»).
    if por_tipo.get("tarea") or por_tipo.get("evento"):
        from tiqsi.modulo import resolver

        for tipo in ("tarea", "evento"):
            for ident in por_tipo.get(tipo) or ():
                r = await resolver(f"tareas:{tipo}:{ident}")
                if r is not None:
                    poner(tipo, ident, r["titulo"])
    if por_tipo.get("rend"):
        # Rendición de cuentas (2026-10-18): el comisionado y la semana, vigentes. Por referencia
        # («rendicion:rendicion:<id>», fase 10.2b): Rendición es un módulo aislado (Yupay); sin él, queda sin rótulo.
        from tiqsi.modulo import resolver

        for rid in por_tipo["rend"]:
            r = await resolver(f"rendicion:rendicion:{rid}")
            if r is not None:
                poner("rend", rid, r["titulo"])
    return salida


async def etiqueta_de(sesion: AsyncSession, clave: str, defecto: str | None = None) -> str:
    """Una sola clave; si ya no existe (o no es de las que se resuelven), `defecto` o la clave."""
    if not clave:
        return defecto or ""
    return (await etiquetas_de(sesion, {clave})).get(clave, clave if defecto is None else defecto)


async def cortas_de(sesion: AsyncSession, destinos: set[str] | list[str]) -> dict[str, str]:
    """El código corto y VIGENTE de cada clave, para chips y vínculos breves: `doc:12` → «OF-0012»
    (o «Oficio (borrador)»), `pl:3` → su código, `sr:2` → «SR-02». Lo demás, como `etiquetas_de`."""
    salida: dict[str, str] = {}
    resto: set[str] = set()
    por: dict[str, dict[int, list[str]]] = {}
    for d in destinos or ():
        p = partir(d)
        if p and p[0] in ("doc", "pl", "sr"):
            por.setdefault(p[0], {}).setdefault(p[1], []).append(d)
        elif p:
            resto.add(d)
    textos = {("doc", i): d["corta"] for i, d in (await _documentos(por.get("doc"))).items()}
    textos |= {("pl", i): p["codigo"] or p["titulo"][:60] for i, p in (await _proyectos(por.get("pl"))).items()}
    textos |= {("sr", i): codigo for i, codigo in (await _semanas("etiquetas", por.get("sr"))).items()}
    for (tipo, ident), texto in textos.items():
        for original in por[tipo][ident]:
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
                # Las copias de Tareas y Agenda (eventos detectados, tareas automáticas) las pone al día ella misma al
                # recibir «documento.numerado» o «documento.estado» por el bus (fase 10.2b).
                pass
    except Exception:  # noqa: BLE001 — lo vinculado se repone en la reconciliación
        logging.getLogger("qillqa.etiquetas").exception("No se pudo propagar el cambio de %s", entidad)
    # Los mensajes del chat que presentan la entidad se ponen al día (2026-10-18, §27 y §25): para toda
    # entidad (`doc:`, `evento:`, `tarea:`, `entrada:`…), por su propio camino seguro.
    from app.servicios import avisos_chat

    cambios += await avisos_chat.refrescar_mensajes_de(sesion, f"{p[0]}:{p[1]}")
    return cambios

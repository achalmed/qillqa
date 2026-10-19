"""El espacio del Formato Word de cada cuenta (2026-10-19): qué documentos tiene abiertos.

Se guarda en `ajustes` bajo `espacio_word:<usuario_id>` (`{"documentos": [...], "activo": n}`). El
espacio recuerda ids; un documento puede borrarse después (desde la bandeja, por otra persona, por
el administrador) y el id seguir ahí: la web pedía ese documento, recibía 404 («El documento no
existe») y la sección quedaba en «Cargando…» para siempre, incluso al añadir uno nuevo (Edison,
2026-10-19). Dos remedios, los dos aquí: al LEER el espacio se descartan los ids que ya no existen
(y se persiste la lista limpia), y al ELIMINAR un documento se retira de todos los espacios.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Ajuste, Documento

PREFIJO = "espacio_word"
TOPE = 60


def clave_de(usuario_id: int) -> str:
    return f"{PREFIJO}:{usuario_id}"


def normalizar(documentos: list, activo: int | None, existentes: set[int] | None = None) -> dict:
    """La forma canónica del espacio: ids enteros positivos, sin repetir, hasta el tope, solo los que
    existen (si se pasa `existentes`); el activo sigue siendo válido o pasa al primero. Pura."""
    ids: list[int] = []
    for x in documentos:
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in ids or (existentes is not None and n not in existentes):
            continue
        ids.append(n)
    ids = ids[:TOPE]
    act = activo if isinstance(activo, int) and activo in ids else (ids[0] if ids else None)
    return {"documentos": ids, "activo": act}


def sin_documento(valor: dict, documento_id: int) -> dict:
    """El espacio sin `documento_id` (el activo pasa al vecino, como en la web). Pura."""
    docs = [int(x) for x in (valor or {}).get("documentos") or [] if int(x) != documento_id]
    activo = (valor or {}).get("activo")
    if activo == documento_id:
        viejos = [int(x) for x in (valor or {}).get("documentos") or []]
        i = viejos.index(documento_id) if documento_id in viejos else 0
        activo = docs[min(i, len(docs) - 1)] if docs else None
    return normalizar(docs, activo)


async def leer(sesion: AsyncSession, usuario_id: int) -> dict:
    """El espacio de la cuenta, ya sin los documentos que dejaron de existir (se persiste si cambió)."""
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": clave_de(usuario_id)})
    if fila is None or not fila.valor:
        return {"documentos": [], "activo": None}
    crudo = normalizar(fila.valor.get("documentos") or [], fila.valor.get("activo"))
    if not crudo["documentos"]:
        return crudo
    existentes = set(
        (await sesion.execute(select(Documento.id).where(Documento.id.in_(crudo["documentos"])))).scalars().all()
    )
    limpio = normalizar(crudo["documentos"], crudo["activo"], existentes)
    if limpio != dict(fila.valor):
        fila.valor = limpio
        await sesion.commit()
    return limpio


async def guardar(sesion: AsyncSession, usuario_id: int, documentos: list, activo: int | None) -> dict:
    valor = normalizar(documentos, activo)
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": clave_de(usuario_id)})
    if fila is None:
        sesion.add(Ajuste(despacho_id=1, clave=clave_de(usuario_id), valor=valor))
    else:
        fila.valor = valor
    await sesion.commit()
    return valor


async def quitar_de_todos(sesion: AsyncSession, documento_id: int) -> None:
    """Retira el documento del espacio de todas las cuentas (al eliminarlo). No hace commit: va en
    la transacción de la eliminación."""
    filas = (await sesion.execute(select(Ajuste).where(Ajuste.clave.like(f"{PREFIJO}:%")))).scalars().all()
    for fila in filas:
        docs = [int(x) for x in (fila.valor or {}).get("documentos") or []]
        if documento_id in docs:
            fila.valor = sin_documento(fila.valor, documento_id)

"""Descarte de borradores vacíos.

Abrir «Nuevo documento» y no escribir nada NO debe dejar basura: un
borrador que nunca recibió número, sigue en BORRADOR y no tiene datos ni
cuerpo se considera descartable y se elimina al listar la bandeja.
"""

import shutil

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Adjunto, Documento, Evento, VersionDocumento
from app.servicios.carpetas import carpeta

_CAMPOS_CONTENIDO = ("asunto", "destinatario_nombre", "para", "de", "referencia")


def _cuerpo_tiene_texto(cuerpo: dict) -> bool:
    """True si el cuerpo TipTap contiene algún texto real."""
    pila = [cuerpo]
    while pila:
        n = pila.pop()
        if isinstance(n, dict):
            if n.get("type") == "text" and (n.get("text") or "").strip():
                return True
            pila.extend(n.get("content", []) or [])
    return False


def es_vacio(doc: Documento) -> bool:
    if doc.origen != "sgdp" or doc.numero is not None or doc.estado != "BORRADOR":
        return False
    c = doc.campos or {}
    con_datos = any((c.get(k) or "").strip() for k in _CAMPOS_CONTENIDO)
    return not con_datos and not _cuerpo_tiene_texto(doc.cuerpo or {})


async def purgar_vacios(
    sesion: AsyncSession, docs: list[Documento]
) -> list[Documento]:
    """Elimina los borradores vacíos de la lista y devuelve los vivos."""
    vivos, borrar = [], []
    for d in docs:
        (borrar if es_vacio(d) else vivos).append(d)
    for d in borrar:
        dir_doc = carpeta(d)
        if dir_doc and dir_doc.exists():
            shutil.rmtree(dir_doc, ignore_errors=True)
        # Borrar primero las filas hijas (el borrador ya tiene el evento
        # "creado") para no violar la llave foránea.
        for tabla in (VersionDocumento, Evento, Adjunto):
            await sesion.execute(delete(tabla).where(tabla.documento_id == d.id))
        await sesion.delete(d)
    if borrar:
        await sesion.commit()
    return vivos

"""backend/app/servicios/ingreso.py — un archivo que llega por un puente (el chat de Qillqa, el grupo de
Telegram) entra al sistema por las puertas de siempre (2026-10-12): un PDF, Word o imagen de un
documento → Recibidos con la misma ficha automática de `POST /api/entradas/subir`; una foto o video
→ la Fototeca, en el álbum del puente («Grupo de Telegram», «Chat de la entidad»: ninguna foto suelta).
Lo usan `servicios/telegram.py` y `servicios/chat.py`. Sin commit salvo donde se indica.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

DOCUMENTOS = {".pdf", ".docx", ".doc", ".odt", ".rtf"}
IMAGENES_DOC = {".jpg", ".jpeg", ".png", ".webp"}
FOTOS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff", ".mp4", ".mov", ".webm"}


def clasificar(nombre: str, como_foto: bool = False) -> str:
    """'recibido' (documento, o imagen enviada como archivo), 'foto' (foto o video) o ''."""
    suf = Path(nombre or "").suffix.lower()
    if como_foto:
        return "foto" if suf in FOTOS or not suf else ""
    if suf in DOCUMENTOS or suf in IMAGENES_DOC:
        return "recibido"
    if suf in FOTOS:
        return "foto"
    return ""


async def a_recibidos(sesion, ruta: Path, nombre: str, usuario, nota: str, campos: dict | None = None) -> tuple[int | None, str]:
    """El archivo entra por la ficha automática; `campos` (de un pegado) pisan lo que la ficha
    leyó. → (id de la entrada o None, texto para la persona). Hace commit."""
    from app.api.entradas import Confirmar, FichaEntrada, _analizar_uno, _contexto, _registrar

    directorio, existentes, previas, hoy = await _contexto(sesion)
    a = await _analizar_uno(sesion, nombre, ruta, directorio, existentes, previas, hoy)
    if a.get("error"):
        return None, f"No se pudo leer {nombre}: {a['error']}"
    f = {k: v for k, v in a["ficha"].items() if k in FichaEntrada.model_fields}
    extra = {k: v for k, v in (campos or {}).items() if k in FichaEntrada.model_fields and v not in (None, "", [])}
    origen = {**{k: "documento" for k, v in f.items() if v}, **{k: "pegado" for k in extra}}
    item = Confirmar(token=a["token"], nombre=a["nombre"], **{**f, "via": "otro", **extra, "nota": "\n".join(x for x in (extra.get("nota", ""), nota) if x), "origen_campos": origen})
    e, dup = await _registrar(sesion, item, usuario, existentes)
    if e is None:
        return None, f"{nombre}: ya estaba registrado ({(dup or {}).get('motivo', 'duplicado')})."
    await sesion.commit()
    return e.id, f"Registrado en Mesa de Partes (n.º {e.id}): «{(e.asunto or e.documento or nombre)[:80]}»."


async def album_de(sesion, nombre: str, descripcion: str, usuario_id: int) -> int:
    from app.modelos import AlbumFoto

    existente = (await sesion.execute(select(AlbumFoto).where(AlbumFoto.nombre == nombre))).scalars().first()
    if existente:
        return existente.id
    a = AlbumFoto(nombre=nombre, descripcion=descripcion, creado_por=usuario_id)
    sesion.add(a)
    await sesion.flush()
    return a.id


async def a_fototeca(sesion, ruta: Path, nombre: str, usuario, album_nombre: str, album_descripcion: str) -> tuple[int | None, str]:
    """→ (id de la foto o None, texto para la persona). Hace commit."""
    from app.servicios import fototeca as ft

    if not ft.admitido(nombre):
        return None, f"{nombre}: no es una foto ni un video admitido."
    album = await album_de(sesion, album_nombre, album_descripcion, usuario.id)
    try:
        foto, nueva = await ft.registrar(sesion, ruta, nombre, usuario.id, mover=True, datos={"album_id": album})
    except ft.ErrorFototeca as e:
        return None, f"{nombre}: {e}"
    await sesion.commit()
    if nueva:
        return foto.id, f"Guardada en la Mediateca (álbum «{album_nombre}», n.º {foto.id})."
    return foto.id, f"{nombre}: ya estaba en la Mediateca (n.º {foto.id})."

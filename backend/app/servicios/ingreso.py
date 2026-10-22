"""backend/app/servicios/ingreso.py — un archivo que llega por un puente (el chat de Qillqa, el grupo de
Telegram) entra al sistema por las puertas de siempre (2026-10-12): un PDF, Word o imagen de un
documento → Recibidos con la misma ficha automática de `POST /api/entradas/subir`; una foto o video
→ la Fototeca, en el álbum del puente («Grupo de Telegram», «Chat de la entidad»: ninguna foto suelta).
Lo usan `servicios/telegram.py` y `servicios/chat.py`. Sin commit salvo donde se indica.
"""
from __future__ import annotations

from pathlib import Path


from tiqsi.modulo import Perezosa

# La Mediateca por el contrato (fase 10.2b): «medios.v2» (2026-10-21, sin sus modelos), pedida al anfitrión al usarla;
# nada se importa de ella.
ft = Perezosa("medios.v2")

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
    leyó. → (id de la entrada o None, texto para la persona). Lo registra la Mesa de Partes, con su sesión y su
    commit («recibidos.v1».registrar_archivo, Punku P2); `sesion`, la documental del llamador, no se toca."""
    from tiqsi.modulo import opcional

    recibidos = opcional("recibidos.v1")
    if recibidos is None:
        return None, f"{nombre}: la Mesa de Partes no está disponible."
    return await recibidos.registrar_archivo(ruta, nombre, usuario.id, nota, campos)


async def a_fototeca(sesion, ruta: Path, nombre: str, usuario, album_nombre: str, album_descripcion: str) -> tuple[int | None, str]:
    """→ (id de la foto o None, texto para la persona). La Mediateca la guarda en el álbum, con su sesión y su commit
    («medios.v2», 2026-10-21); `sesion`, la documental del llamador, no se toca."""
    if not ft.admitido(nombre):
        return None, f"{nombre}: no es una foto ni un video admitido."
    album = await ft.album(album_nombre, album_descripcion, usuario.id)
    try:
        foto, nueva = await ft.registrar_archivo(ruta, nombre, usuario.id, mover=True, datos={"album_id": album})
    except ft.ErrorFototeca as e:
        return None, f"{nombre}: {e}"
    if nueva:
        return foto["id"], f"Guardada en la Mediateca (álbum «{album_nombre}», n.º {foto['id']})."
    return foto["id"], f"{nombre}: ya estaba en la Mediateca (n.º {foto['id']})."

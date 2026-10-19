"""Ubicación en disco de cada documento.

Cada documento vive en el árbol del framework, en la SUBCARPETA de su
tipo (documentos/oficios, documentos/memorandos, documentos/informes,
documentos/solicitudes, documentos/actas). La plataforma no copia nada:
referencia y compila en el lugar. Aquí se resuelve, crea y renombra esa
carpeta.

Mudanza del proyecto (Edison 2026-09-07): ``ruta_original`` guarda una
ruta ABSOLUTA. Cuando la carpeta del proyecto cambió de nombre
(``09_trabajo`` → ``09 trabajo``) los 75 documentos apuntaban a una ruta
que ya no existía: el PDF daba 404 y, peor, ``firma.invalidar_si_cambia``
recreaba con ``mkdir(parents=True)`` un árbol fantasma en la ruta vieja,
con lo que ``asegurar_carpeta`` intentaba renombrarla sobre la carpeta
real (ya ocupada) y la vista previa moría con «Directory not empty».
Desde entonces ``carpeta()`` RE-ANCLA sobre ``config.mdd_ruta`` toda ruta
guardada que ya no exista, y ``asegurar_carpeta`` nunca renombra sobre un
destino que ya existe (fusiona o descarta el rastro vacío).
"""

import shutil
from pathlib import Path

from app.config import config, raiz_documentos
from app.latex.generador import nombre_carpeta
from app.modelos import Documento
from app.tipos import tipo_config


def _raiz_tipo(doc: Documento) -> Path:
    """Raíz en disco según el TIPO del documento: documentos/<subcarpeta>.
    La subcarpeta la declara el registro de tipos (por defecto 'oficios',
    que comparten el oficio y el oficio múltiple)."""
    sub = tipo_config(doc.tipo).get("carpeta", "oficios")
    return raiz_documentos() / sub


def reanclar(ruta: Path) -> Path:
    """Si ``ruta`` ya no existe (el proyecto se mudó), la vuelve a anclar
    sobre la raíz del archivo documental a partir del ÚLTIMO segmento ``documentos``
    (…/documentos/<tipo>/<carpeta>). Si tampoco existe ahí, devuelve la
    original sin tocar (será una carpeta nueva por crear)."""
    if ruta.exists():
        return ruta
    partes = ruta.parts
    if "documentos" not in partes:
        return ruta
    i = len(partes) - 1 - partes[::-1].index("documentos")
    candidata = raiz_documentos().joinpath(*partes[i + 1:])
    return candidata if candidata.exists() else ruta


def carpeta(doc: Documento) -> Path | None:
    """Carpeta real del documento; None si el borrador nunca se compiló.
    Corrige en el propio documento una ruta guardada que quedó vieja (se
    persiste con el siguiente commit del llamador)."""
    if not doc.ruta_original:
        return None
    ruta = reanclar(Path(doc.ruta_original))
    if str(ruta) != doc.ruta_original:
        doc.ruta_original = str(ruta)
    return ruta


def _tiene_archivos(ruta: Path) -> bool:
    return any(p.is_file() for p in ruta.rglob("*"))


def _fusionar(origen: Path, destino: Path) -> None:
    """Mueve a ``destino`` los archivos de ``origen`` que allí no existan
    (los repetidos se conservan en el destino) y borra de ``origen`` lo
    que quede vacío. Nunca pisa un archivo del destino."""
    for archivo in sorted(p for p in origen.rglob("*") if p.is_file()):
        meta = destino / archivo.relative_to(origen)
        if meta.exists():
            continue
        meta.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(archivo), str(meta))
    if not _tiene_archivos(origen):
        shutil.rmtree(origen, ignore_errors=True)


async def asegurar_carpeta(doc: Documento) -> Path:
    """Devuelve la carpeta del documento; la crea o la renombra a su
    nombre oficial (convención del framework) si hace falta. Persiste la
    ruta en el propio documento."""
    deseada = _raiz_tipo(doc) / nombre_carpeta(
        doc.serie,
        doc.numero,
        doc.campos.get("fecha"),
        doc.campos.get("sumilla") or doc.campos.get("asunto") or "",
        doc.id,
    )
    actual = carpeta(doc)
    if actual is not None and actual.exists() and actual != deseada:
        # p. ej. el borrador ya numerado (renombrar a su nombre oficial) o
        # una carpeta que quedó en la subcarpeta equivocada (mover al tipo).
        deseada.parent.mkdir(parents=True, exist_ok=True)
        if not deseada.exists():
            actual.rename(deseada)
        elif not _tiene_archivos(actual):
            # Rastro vacío (p. ej. un mkdir sobre una ruta vieja): se descarta.
            shutil.rmtree(actual, ignore_errors=True)
        else:
            _fusionar(actual, deseada)
    deseada.mkdir(parents=True, exist_ok=True)
    doc.ruta_original = str(deseada)
    return deseada

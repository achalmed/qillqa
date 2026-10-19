"""Manifiesto de sincronización a dispositivos autorizados.

Lista QUÉ archivos DOCUMENTALES puede copiar un dispositivo a una carpeta
local: el PDF oficial de cada documento + sus adjuntos (firmado, constancias
de recepción, anexos y adjuntos genéricos). Para cada archivo da su RUTA
RELATIVA con la carpeta que elige el usuario como RAÍZ directa
(`<Clasificación en español>/<carpeta>/…`, p. ej. `Oficios/OF-0002-…/`), su
tamaño y una VERSIÓN (tamaño+fecha-mod) que permite descarga incremental.

NUNCA incluye `.tex`, `metadata.tex`, `expediente/`, código ni dependencias:
solo emite el PDF concreto de cada documento y los adjuntos REGISTRADOS en la
BD (no escanea la carpeta), así el ruido queda fuera por construcción.

No hay ACL por documento (cualquier usuario autenticado ve todos): el router
pasa por `usuario_actual`, de modo que hereda cualquier regla de visibilidad
que se agregue en el futuro.
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config, raiz_documentos
from app.modelos import Adjunto, Documento, Entrada, Usuario
from app.servicios.carpetas import carpeta
from app.servicios.entradas import ruta_de as ruta_de_entrada


def _version(ruta: Path) -> str:
    """Clave de versión barata (sin leer el archivo): tamaño-mtime."""
    st = ruta.stat()
    return f"{st.st_size}-{int(st.st_mtime)}"


# Rótulo en español de cada CLASIFICACIÓN documental. Se indexa por la
# SUBCARPETA de tipo en disco (que agrupa, p. ej., oficio + oficio múltiple en
# «oficios»), no por el nombre de tipo. Es el primer nivel bajo la carpeta que
# elige el usuario al sincronizar. Un slug no listado cae en «Otros documentos».
ETIQUETA_CLASIFICACION = {
    "oficios": "Oficios",
    "cartas": "Cartas",
    "memorandos": "Memorándums",
    "informes": "Informes",
    "solicitudes": "Solicitudes",
    "actas": "Actas",
    "agendas": "Agendas",
    "bancada": "Bancada",
}


def _rel(dir_doc: Path) -> str:
    """Ruta del documento relativa a la carpeta que ELIGE el usuario, en POSIX:
    «<Clasificación>/<carpeta del documento>» (p. ej. «Oficios/OF-0002-…»).

    Antes colgaba de un nivel «documentos/<tipo>» extra bajo la raíz elegida
    (quedaba Qillqa/documentos/oficios/…); Edison pidió (2026-09-01) que la
    carpeta elegida sea la raíz DIRECTA de las clasificaciones y que estas
    vayan rotuladas en español. Si el documento vive fuera de
    `mdd_ruta/documentos`, se ancla en «Otros documentos/<carpeta>»."""
    raiz = raiz_documentos()
    try:
        partes = dir_doc.relative_to(raiz).parts
    except ValueError:
        return (Path("Otros documentos") / dir_doc.name).as_posix()
    if not partes:
        return dir_doc.name
    etiqueta = ETIQUETA_CLASIFICACION.get(partes[0], "Otros documentos")
    return Path(etiqueta, *partes[1:]).as_posix()


def _pdf_oficial(doc: Documento, dir_doc: Path) -> Path | None:
    """El PDF del documento (nunca el `.tex`): `pdf_archivo` si existe en
    disco; si no, el `*.pdf` más reciente en la raíz de la carpeta."""
    if doc.pdf_archivo:
        p = dir_doc / doc.pdf_archivo
        if p.is_file():
            return p
    pdfs = sorted(dir_doc.glob("*.pdf"), key=lambda p: p.stat().st_mtime)
    return pdfs[-1] if pdfs else None


async def manifiesto(sesion: AsyncSession, usuario: Usuario) -> list[dict]:
    """Archivos sincronizables (un item por PDF y por adjunto). Alcance:
    todos los documentos que tienen un PDF compilado en disco; los OCULTOS
    por el administrador no se sincronizan a los demás roles."""
    docs = (await sesion.execute(select(Documento))).scalars().all()
    if usuario.rol != "administrador":
        docs = [d for d in docs if not d.oculto]
    # Adjuntos de TODOS los documentos en una sola consulta (sin N+1).
    filas = (await sesion.execute(select(Adjunto).order_by(Adjunto.id))).scalars().all()
    por_doc: dict[int, list[Adjunto]] = {}
    for a in filas:
        por_doc.setdefault(a.documento_id, []).append(a)

    items: list[dict] = []
    for doc in docs:
        dir_doc = carpeta(doc)
        if dir_doc is None or not dir_doc.is_dir():
            continue
        pdf = _pdf_oficial(doc, dir_doc)
        if pdf is None:
            continue  # alcance: solo documentos con PDF
        base = _rel(dir_doc)
        items.append(
            {
                "ruta": f"{base}/{pdf.name}",
                "tamano": pdf.stat().st_size,
                "version": _version(pdf),
                "url": f"/api/documentos/{doc.id}/pdf",
            }
        )
        # Adjuntos: se escriben con su NOMBRE ORIGINAL (convención del
        # despacho) dentro de `adjuntos/`. Se de-duplica el nombre si dos
        # adjuntos coincidieran, para no sobrescribir en el disco del cliente.
        usados: set[str] = set()
        for a in por_doc.get(doc.id, []):
            fis = dir_doc / "adjuntos" / a.nombre_archivo
            if not fis.is_file():
                continue
            nombre = a.nombre_original or a.nombre_archivo
            if nombre.lower() in usados:
                raiz, ext = os.path.splitext(nombre)
                nombre = f"{raiz} ({a.id}){ext}"
            usados.add(nombre.lower())
            items.append(
                {
                    "ruta": f"{base}/adjuntos/{nombre}",
                    "tamano": fis.stat().st_size,
                    "version": _version(fis),
                    "url": f"/api/documentos/{doc.id}/adjuntos/{a.id}",
                }
            )
    items.extend(await _recibidos(sesion))
    return items


def ruta_recibido(archivo: str, nombre: str) -> str:
    """Ruta en la carpeta del PDF de un RECIBIDO (2026-10-18): «Recibidos/<AAAA-MM>/<nombre>»,
    con el mes de su carpeta en el archivo documental (`recibidos/entradas/AAAA-MM/…`)."""
    partes = [p for p in Path(archivo).parts[:-1] if p not in ("recibidos", "entradas")]
    return Path("Recibidos", *partes, nombre).as_posix()


async def _recibidos(sesion: AsyncSession) -> list[dict]:
    """Los PDF de los documentos RECIBIDOS (2026-10-18, Edison: «el modo sin conexión debe abrir
    directamente esos archivos desde los módulos: bandeja, editor, mesa de partes, recibidos»).
    La descarga es la del módulo, `/api/entradas/{id}/pdf`, que ya valida la sesión."""
    items: list[dict] = []
    for e in (await sesion.execute(select(Entrada).order_by(Entrada.id))).scalars().all():
        fis = ruta_de_entrada(e.archivo)
        if fis is None:
            continue
        items.append(
            {
                "ruta": ruta_recibido(e.archivo, fis.name),
                "tamano": fis.stat().st_size,
                "version": _version(fis),
                "url": f"/api/entradas/{e.id}/pdf",
            }
        )
    return items

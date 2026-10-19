"""Utilidades sobre archivos PDF.

contar_paginas: número de páginas de un PDF, para AUTOCOMPLETAR los
folios del documento al compilar (el usuario puede corregirlos a mano
desde la bandeja; ver PUT /api/documentos/{id}/folios).

principal: QUÉ archivo es «el PDF del documento». Vive aquí, en un solo sitio,
porque lo consultan la descarga, el visor y la copia como imagen: si cada uno
lo resolviera a su manera, acabarían repartiendo archivos distintos.
"""

import re
import subprocess
from pathlib import Path

from app.modelos import Documento


def principal(doc: Documento) -> Path | None:
    """El PDF oficial del documento: el que registra `pdf_archivo` y, como
    respaldo para documentos importados que no lo tengan, el PDF más reciente
    de su carpeta."""
    from app.servicios.carpetas import carpeta

    dir_doc = carpeta(doc)
    if dir_doc is None or not dir_doc.is_dir():
        return None
    if doc.pdf_archivo:
        ruta = dir_doc / doc.pdf_archivo
        if ruta.is_file():
            return ruta
    pdfs = sorted(dir_doc.glob("*.pdf"), key=lambda p: p.stat().st_mtime)
    return pdfs[-1] if pdfs else None


def contar_paginas(ruta: Path | None) -> int | None:
    """Páginas del PDF o None si no se pudo determinar.

    Primero `pdfinfo` (poppler, presente en el host donde corre la API);
    si no está, un rastreo binario de "/Type /Page" como aproximación
    (falla en PDFs con object streams comprimidos: devuelve None antes
    que un número incorrecto)."""
    if ruta is None or not ruta.is_file():
        return None
    try:
        salida = subprocess.run(
            ["pdfinfo", str(ruta)], capture_output=True, text=True, timeout=20
        )
        m = re.search(r"^Pages:\s+(\d+)", salida.stdout, re.MULTILINE)
        if m:
            return int(m.group(1))
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        crudo = ruta.read_bytes()
        # /Count del árbol de páginas raíz (si está sin comprimir).
        conteos = re.findall(rb"/Type\s*/Pages[^>]*?/Count\s+(\d+)", crudo)
        if conteos:
            return max(int(c) for c in conteos)
    except OSError:
        pass
    return None

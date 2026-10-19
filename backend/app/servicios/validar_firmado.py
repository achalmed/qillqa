"""¿Este PDF es de verdad el documento firmado? (Edison 2026-10-08: «no se debe permitir subir
cualquier PDF a la sección de documentos firmados… validar que correspondan realmente al
documento generado y firmado»).

Cuatro comprobaciones, todas sin dependencias nuevas (bytes del PDF + poppler):

1. Es un PDF (empieza por ``%PDF-``), no una foto ni un Word.
2. El nombre es el del firmador: Firma Perú / ReFirma devuelven ``<nombre>[R].pdf``; y el
   nombre lleva el código del documento (``OF-0127-2026-2027``), que es como Qillqa lo
   descarga. Un ``FIRM-…`` (el nombre que Qillqa ya le dio) también vale.
3. Trae una firma digital incrustada (diccionario ``/Sig`` con ``/ByteRange``: PAdES). No se
   verifica la cadena de certificados, solo que la firma exista.
4. Corresponde al PDF generado: mismas páginas y el texto del generado presente en el firmado
   (la firma añade un sello visible, así que se mide cuánto del generado aparece, no al revés).

Si algo falla, el endpoint rechaza con los motivos; el administrador puede forzarlo (un
escaneo firmado a mano, por ejemplo) y queda en la bitácora.
"""

import re
import subprocess
import tempfile
from pathlib import Path

from app.servicios.pdf import contar_paginas

# Proporción mínima de las palabras del PDF generado que deben aparecer en el firmado.
COINCIDENCIA_MINIMA = 0.85
_RE_R = re.compile(r"\[\s*R\s*\]$", re.I)
_RE_FIRMA = re.compile(rb"/ByteRange\s*\[")
_RE_SIG = re.compile(rb"/Type\s*/Sig\b|/FT\s*/Sig\b|/SubFilter\s*/(?:ETSI|adbe)", re.I)


def es_pdf(contenido: bytes) -> bool:
    return contenido[:1024].lstrip().startswith(b"%PDF-")


def tiene_firma_digital(contenido: bytes) -> bool:
    return bool(_RE_FIRMA.search(contenido) and _RE_SIG.search(contenido))


def codigo_del_nombre(nombre_generado: str) -> str:
    """«OF-0127-2026-2027_Asunto.pdf» → «OF-0127-2026-2027» (lo que va antes del asunto)."""
    return Path(nombre_generado).stem.split("_", 1)[0]


def nombre_valido(nombre: str, nombre_generado: str | None) -> str:
    """'' si el nombre es el de un firmado de ESTE documento; si no, el motivo."""
    stem = Path(nombre or "").stem.strip()
    if stem.upper().startswith("FIRM-"):
        return ""
    if not _RE_R.search(stem):
        return "El nombre no termina en «[R]»: no es el archivo que devuelve el firmador."
    codigo = codigo_del_nombre(nombre_generado) if nombre_generado else ""
    if codigo and not stem.upper().startswith(codigo.upper()):
        return f"El nombre no corresponde a este documento: debería empezar por «{codigo}»."
    return ""


def _palabras(ruta: Path) -> list[str]:
    try:
        salida = subprocess.run(["pdftotext", str(ruta), "-"], capture_output=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return []
    texto = salida.stdout.decode("utf-8", "replace").lower() if salida.returncode == 0 else ""
    return re.findall(r"\w{3,}", texto)


def coincidencia(generado: list[str], firmado: list[str]) -> float:
    """Qué parte de las palabras del generado aparece en el firmado (multiconjunto). Pura."""
    if not generado:
        return 1.0
    disponibles: dict[str, int] = {}
    for p in firmado:
        disponibles[p] = disponibles.get(p, 0) + 1
    halladas = 0
    for p in generado:
        if disponibles.get(p, 0) > 0:
            disponibles[p] -= 1
            halladas += 1
    return halladas / len(generado)


def motivos(contenido: bytes, nombre: str, generado: Path | None, exigir_nombre: bool = True) -> list[str]:
    """Lo que impide aceptar el archivo como firmado ([] = válido). `exigir_nombre=False` para
    los proyectos de ley, que no se descargan con el nombre del documento."""
    if not es_pdf(contenido):
        return ["No es un PDF: el firmado se sube en PDF, tal como lo devuelve el firmador."]
    salida: list[str] = []
    if not tiene_firma_digital(contenido):
        salida.append("El PDF no tiene firma digital.")
    if generado is not None and generado.exists():
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "firmado.pdf"
            ruta.write_bytes(contenido)
            pg, pf = contar_paginas(generado), contar_paginas(ruta)
            if pg and pf and pg != pf:
                salida.append(f"Tiene {pf} página(s) y el documento generado {pg}.")
            parte = coincidencia(_palabras(generado), _palabras(ruta))
            if parte < COINCIDENCIA_MINIMA:
                salida.append(
                    f"El texto no coincide con el documento generado (solo {parte:.0%} igual): "
                    "¿es la última versión?"
                )
    # El NOMBRE solo decide cuando el contenido no se pudo cotejar (2026-10-10, Edison: «al
    # volver a subir un firmado descargado desde otra computadora debe reconocerlo aunque el
    # nombre sea un código»): si el PDF tiene firma y es el mismo texto, el nombre da igual.
    motivo = nombre_valido(nombre, generado.name if generado else None) if exigir_nombre else ""
    if motivo and (salida or generado is None or not generado.exists()):
        salida.insert(0, motivo)
    return salida

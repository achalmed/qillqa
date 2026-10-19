"""N.º de expediente que la entidad destinataria dio a un documento (Edison 2026-10-08:
«identificar el número de expediente para hacer seguimiento al documento y agregarlo al
sistema de forma automática»).

Cada mesa de partes lo llama distinto —expediente, registro, hoja de ruta, CUT, trámite— y lo
imprime en el cargo o la constancia de recepción que devuelve. Aquí se lee de ese texto
(`pdftotext` del cargo) y se guarda en `documentos.expediente_entidad`; quien sigue el trámite
lo ve y lo corrige a mano si hiciera falta.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

# «Expediente N.° 2026-0012345», «EXP. N° 12345-2026», «N.° de registro: 000123», «Hoja de
# ruta: HR-2026-00045», «CUT N° 123456-2026», «Trámite N.° …», «Código de seguimiento: AB12CD».
_ROTULO = (
    r"(?:n(?:[.°º]+|ro\.?|úmero)\s*(?:de\s+)?)?"
    r"(?:expediente|exp\.?|registro|reg\.?|hoja\s+de\s+ruta|h\.?\s*r\.?|c\.?u\.?t\.?|tr[aá]mite|"
    r"documento\s+de\s+tr[aá]mite|c[oó]digo\s+de\s+(?:seguimiento|consulta|tr[aá]mite)|"
    r"n[uú]mero\s+de\s+(?:expediente|registro|tr[aá]mite))"
)
_NUMERO = r"([A-Z]{0,6}[-\s]?\d[\dA-Z]*(?:[-/.]\d[\dA-Z]*){0,3})"
_PATRON = re.compile(
    _ROTULO + r"\s*(?:n(?:[.°º]+|ro\.?)\s*)?[:#]?\s*" + _NUMERO,
    re.I,
)


def detectar(texto: str) -> str:
    """El primer número de expediente que aparece en el texto del cargo, o ''."""
    for m in _PATRON.finditer(texto or ""):
        numero = re.sub(r"\s+", "", m.group(1)).strip(".-/")
        # Un año suelto, una fecha o un número de una cifra no son expedientes.
        if len(re.sub(r"\D", "", numero)) < 4 or re.fullmatch(r"(19|20)\d{2}", numero):
            continue
        if re.fullmatch(r"\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}", numero):
            continue
        return numero[:120]
    return ""


def de_archivo(ruta: Path) -> str:
    """Lee el número de un PDF (con capa de texto). Una imagen o un escaneo sin texto no dan
    nada: queda para escribirlo a mano."""
    if ruta.suffix.lower() != ".pdf" or not ruta.exists():
        return ""
    try:
        texto = subprocess.run(
            ["pdftotext", "-layout", "-l", "3", str(ruta), "-"],
            capture_output=True, text=True, timeout=20, check=False,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return ""
    return detectar(texto)

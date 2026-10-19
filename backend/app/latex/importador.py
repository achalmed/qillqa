"""Importa al inventario de Qillqa los documentos ya generados con el
Marco Documental, SIN alterarlos.

Cada documento se copia verbatim (metadata.tex + oficio.tex + PDF +
anexos) al area de trabajo de Qillqa y se registra con origen
'framework': aparece en el historial, se puede buscar, cambiar de
estado, archivar, ver y descargar — pero su formato y contenido siguen
siendo exactamente los originales. El editor visual no los reescribe.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

# --- Extraccion de datos (solo para el inventario y la busqueda) -----

_MAP_SERIE_TIPO = {"OF": "oficio", "OM": "oficio_multiple"}


def _leer_setmeta(texto: str, clave: str) -> str | None:
    """Devuelve el valor de \\setmeta{clave}{valor} (respeta llaves)."""
    ancla = rf"\setmeta{{{clave}}}"
    i = texto.find(ancla)
    if i == -1:
        return None
    return _grupo_llaves(texto, i + len(ancla))


def _grupo_llaves(texto: str, desde: int) -> str | None:
    """Lee el primer grupo {...} a partir de `desde`, con anidamiento."""
    i = desde
    while i < len(texto) and texto[i] != "{":
        if not texto[i].isspace() and texto[i] != "%":
            # entre el comando y su argumento solo se toleran espacios
            # y comentarios de fin de linea
            if texto[i] == "%":
                i = texto.find("\n", i) + 1
                continue
            return None
        i += 1
    if i >= len(texto):
        return None
    profundidad = 0
    inicio = i
    while i < len(texto):
        if texto[i] == "{":
            profundidad += 1
        elif texto[i] == "}":
            profundidad -= 1
            if profundidad == 0:
                return texto[inicio + 1 : i]
        i += 1
    return None


def _grupos_consecutivos(texto: str, comando: str, cuantos: int) -> list[str]:
    """Lee `cuantos` grupos {..} seguidos tras `comando` (tolera %\\n)."""
    i = texto.find(comando)
    if i == -1:
        return []
    i += len(comando)
    grupos: list[str] = []
    for _ in range(cuantos):
        # saltar espacios y comentarios de continuacion
        while i < len(texto) and (texto[i].isspace() or texto[i] == "%"):
            if texto[i] == "%":
                i = texto.find("\n", i)
                if i == -1:
                    return grupos
            i += 1
        if i >= len(texto) or texto[i] != "{":
            break
        grupo = _grupo_llaves(texto, i)
        if grupo is None:
            break
        grupos.append(grupo)
        # avanzar tras el grupo cerrado
        profundidad = 0
        while i < len(texto):
            if texto[i] == "{":
                profundidad += 1
            elif texto[i] == "}":
                profundidad -= 1
                if profundidad == 0:
                    i += 1
                    break
            i += 1
    return grupos


def latex_a_texto(fragmento: str | None) -> str:
    """Aplana marcas LaTeX comunes a texto plano legible (inventario)."""
    if not fragmento:
        return ""
    t = fragmento
    for macro in ("textbf", "textit", "emph", "underline"):
        t = re.sub(rf"\\{macro}\{{(.*?)\}}", r"\1", t)
    reemplazos = {
        "``": "“", "''": "”", "\\\\": " ", "~": " ",
        r"\&": "&", r"\%": "%", r"\#": "#", r"\_": "_", r"\$": "$",
    }
    for a, b in reemplazos.items():
        t = t.replace(a, b)
    t = re.sub(r"\\[a-zA-Z]+", "", t)   # cualquier macro suelta restante
    t = t.replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", t).strip()


# --- Descripcion de un documento importable --------------------------

@dataclass
class DocumentoImportado:
    serie: str
    numero: int | None
    periodo: str
    tipo: str
    campos: dict = field(default_factory=dict)
    ruta_original: str = ""
    pdf_archivo: str | None = None


_PATRON_CARPETA = re.compile(r"^(OF|OM)-(\d{4}|SN)-(\d{8})-")


def _elegir_pdf(carpeta: Path) -> str | None:
    """PDF institucional vigente: excluye intermedios, anexos y variantes
    [R] (revisiones anteriores); ante varios, el mas reciente."""
    candidatos = [
        p for p in carpeta.glob("*.pdf")
        if p.name != "oficio.pdf"
        and not p.name.lower().startswith("adjunto")
        and "[" not in p.name
    ]
    if not candidatos:
        # sin institucional: aceptar el intermedio si es lo unico
        candidatos = [p for p in carpeta.glob("*.pdf")
                      if not p.name.lower().startswith("adjunto")]
    if not candidatos:
        return None
    return max(candidatos, key=lambda p: p.stat().st_mtime).name


def analizar_carpeta(carpeta: Path) -> DocumentoImportado | None:
    m = _PATRON_CARPETA.match(carpeta.name)
    if not m:
        return None
    serie, numero_txt, _ = m.groups()
    maestro = carpeta / "oficio.tex"
    metadata = carpeta / "metadata.tex"
    if not maestro.is_file() or not metadata.is_file():
        return None

    meta = metadata.read_text(encoding="utf-8")
    cuerpo = maestro.read_text(encoding="utf-8")

    dest = _grupos_consecutivos(cuerpo, r"\destinatario", 3)
    numero = None if numero_txt == "SN" else int(numero_txt)

    campos = {
        "numero_completo_original": (_leer_setmeta(meta, "numerocompleto") or "").strip(),
        "asunto": latex_a_texto(
            (_grupos_consecutivos(cuerpo, r"\asunto", 1) or [""])[0]
        ),
        "destinatario_tratamiento": latex_a_texto(dest[0]) if len(dest) > 0 else "",
        "destinatario_nombre": latex_a_texto(dest[1]) if len(dest) > 1 else "",
        "destinatario_cargo": latex_a_texto(dest[2]) if len(dest) > 2 else "",
        "sumilla": (_leer_setmeta(meta, "sumilla") or "").strip(),
        "lugar": (_leer_setmeta(meta, "lugar") or "").strip(),
        "fecha": (_leer_setmeta(meta, "fecha") or "").strip(),
    }
    return DocumentoImportado(
        serie=serie,
        numero=numero,
        periodo=(_leer_setmeta(meta, "anio") or "2026-2027").strip(),
        tipo=_MAP_SERIE_TIPO.get(serie, "oficio"),
        campos=campos,
        ruta_original=str(carpeta),
        pdf_archivo=_elegir_pdf(carpeta),
    )


def enumerar(raiz_documentos: Path) -> list[DocumentoImportado]:
    docs: list[DocumentoImportado] = []
    for sub in sorted(raiz_documentos.glob("*/*")):
        if sub.is_dir():
            analizado = analizar_carpeta(sub)
            if analizado:
                docs.append(analizado)
    return docs

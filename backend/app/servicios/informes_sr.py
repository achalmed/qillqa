"""INFORMES DE REPRESENTACIÓN (ISR) en Inicio (paso 4.3 de la hoja de ruta).

El generador vive en el marco (marco_documental/generadores/informe-sr) y deja
cada semana en una carpeta `AAAA-MM_SR-NN_slug/` de la entidad, con su registro
`expediente.yaml` y sus PDF en `salida/`. Aquí solo se LEEN: Qillqa no genera
ni mueve nada de esas carpetas.

Solo se ofrece la edición PÚBLICA: la `-interna` (pautas y notas del equipo)
no sale por la web. De cada semana se muestra la versión más alta, a dos
columnas, y también la de una columna (`-1col`) para leer en el teléfono.

Nombres (config.py del generador): ISR-01_2026-08_v1.3.pdf,
ISR-02_2026-09_v0.2-borrador.pdf, …-1col.pdf, …-interna.pdf.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

RE_SEMANA = re.compile(r"^(\d{4})-(\d{2})_SR-(\d{2})_(.+)$")
RE_PDF = re.compile(r"^(ISR-\d{2})_(\d{4})-(\d{2})_v(\d+)\.(\d+)(-[a-z]+)?(-1col)?(-interna)?\.pdf$")
ESTADOS = {"": "aprobado", "-borrador": "borrador", "-revision": "en revisión"}


def _version(m: re.Match) -> tuple[int, int]:
    return int(m.group(4)), int(m.group(5))


def semana(carpeta: Path) -> dict | None:
    """Ficha de una semana: id, título, periodo, estado y sus PDF públicos."""
    m = RE_SEMANA.match(carpeta.name)
    if not m or not carpeta.is_dir():
        return None
    registro: dict = {}
    exp = carpeta / "expediente.yaml"
    if exp.is_file():
        try:
            registro = yaml.safe_load(exp.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            registro = {}
    pdfs = []
    salida = carpeta / "salida"
    for f in sorted(salida.glob("*.pdf")) if salida.is_dir() else []:
        p = RE_PDF.match(f.name)
        if not p or p.group(8):  # la edición interna no sale por la web
            continue
        pdfs.append({
            "nombre": f.name,
            "version": f"{p.group(4)}.{p.group(5)}",
            "estado": ESTADOS.get(p.group(6) or "", (p.group(6) or "").lstrip("-")),
            "una_columna": bool(p.group(7)),
            "orden": _version(p),
            "tamano": f.stat().st_size,
        })
    # La que se lee es la APROBADA más reciente; un borrador posterior (1.1 tras aprobar
    # la 1.0) es trabajo en curso y va aparte, en `borrador` (2026-10-02: antes la lista
    # mostraba el borrador como «el informe» de una semana ya aprobada).
    aprobadas = [x["orden"] for x in pdfs if x["estado"] == "aprobado"]
    vigente = max(aprobadas, default=None) or max((x["orden"] for x in pdfs), default=None)
    ultima = max((x["orden"] for x in pdfs), default=None)
    periodo = registro.get("periodo") or {}
    return {
        "carpeta": carpeta.name,
        "id": registro.get("id") or f"SR-{m.group(3)}",
        "informe": registro.get("informe") or f"ISR-{m.group(3)}",
        # El tema escrito como corresponde (con tildes) si el expediente lo
        # trae; si no, el de la carpeta («educacion-superior»).
        "tema": str(registro.get("tema") or m.group(4).replace("-", " ")),
        "anio": int(m.group(1)),
        "mes": int(m.group(2)),
        "inicio": str(periodo.get("inicio") or ""),
        "fin": str(periodo.get("fin") or ""),
        "estado": str(registro.get("estado") or ""),
        "provincias": list((registro.get("ambito") or {}).get("provincias") or []),
        "distritos": list((registro.get("ambito") or {}).get("distritos") or []),
        "pedidos": (registro.get("pedidos") or {}).get("total"),
        # En qué va cada pedido: registrados → derivados → respondidos → cerrados.
        "pedidos_estado": {
            k: int(v) for k, v in (registro.get("pedidos") or {}).items()
            if k in ("registrados", "derivados", "respondidos", "cerrados") and isinstance(v, int)
        },
        # Solo la versión vigente (dos columnas y una columna).
        "pdfs": [
            {k: v for k, v in x.items() if k != "orden"}
            for x in sorted(pdfs, key=lambda x: x["una_columna"])
            if x["orden"] == vigente
        ],
        "borrador": [
            {k: v for k, v in x.items() if k != "orden"}
            for x in sorted(pdfs, key=lambda x: x["una_columna"])
            if ultima != vigente and x["orden"] == ultima
        ],
    }


def listar(raiz: Path) -> list[dict]:
    """Las semanas, de la más reciente a la más antigua."""
    if not raiz.is_dir():
        return []
    fichas = [s for c in raiz.iterdir() if (s := semana(c))]
    return sorted(fichas, key=lambda s: s["carpeta"], reverse=True)


def archivo(raiz: Path, carpeta: str, nombre: str) -> Path | None:
    """El PDF pedido, solo si es un PDF PÚBLICO de una semana válida y queda
    dentro de la raíz (ni `..`, ni rutas absolutas, ni la edición interna)."""
    if not RE_SEMANA.match(carpeta) or "/" in carpeta or "\\" in carpeta:
        return None
    p = RE_PDF.match(nombre)
    if not p or p.group(8) or "/" in nombre or "\\" in nombre:
        return None
    ruta = (raiz / carpeta / "salida" / nombre).resolve()
    if not ruta.is_file() or raiz.resolve() not in ruta.parents:
        return None
    return ruta

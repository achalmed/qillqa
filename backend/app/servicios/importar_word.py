"""Cargar un proyecto de ley desde Word en la web (2026-10-05).

El asesor trabaja el texto en Word (más herramientas de edición) y lo sube al proyecto. La
lectura del .docx es la de `scripts/importar_proyecto_ley.py` (`analizar_docx`: partes por sus
rótulos, notas al pie en su lugar, fotos con su título y fuente), cargado aquí como módulo para
no tener dos lectores. Este módulo resume lo leído para confirmarlo antes de aplicarlo.
"""
from __future__ import annotations

import importlib.util
import re
import threading
from pathlib import Path
from types import ModuleType

from app.servicios import proyectos as reglas

_RUTA = Path(__file__).resolve().parents[3] / "scripts" / "importar_proyecto_ley.py"
_MODULO: ModuleType | None = None
# El lector guarda tablas y fotos en el módulo: una lectura a la vez.
_CANDADO = threading.Lock()

# Rótulos de la plantilla: si la parte empieza con uno de estos, conserva su nombre.
_ESTANDAR = re.compile(r"^(FUNDAMENTOS|ANTECEDENTES|EFECTO DE LA VIGENCIA|AN[AÁ]LISIS (DEL? )?COSTO|INCIDENCIA AMBIENTAL|"
                       r"RELACI[OÓ]N CON LA AGENDA|CONCLUSI[OÓ]N)", re.IGNORECASE)
_SECCION = re.compile(r"^[IVX]+\.\s+(.+)$")


def lector() -> ModuleType:
    global _MODULO
    if _MODULO is None:
        spec = importlib.util.spec_from_file_location("importar_proyecto_ley", _RUTA)
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        _MODULO = modulo
    return _MODULO


def analizar(ruta: Path) -> tuple[dict[str, list[dict]], dict[int, dict]]:
    """(partes leídas del Word, fotos {n: {datos, ext, titulo}}); corre en un hilo."""
    with _CANDADO:
        m = lector()
        contenido = m.analizar_docx(ruta)
        return contenido, {n: dict(f) for n, f in m.FOTOS.items()}


def _texto(nodo: dict) -> str:
    if nodo.get("type") == "text":
        return nodo.get("text", "")
    return "".join(_texto(h) for h in nodo.get("content") or [])


def titulo_propio(nodos: list[dict]) -> str:
    """Nombre que el Word le da a la parte, si no es el de la plantilla: «I. SITUACIÓN DEL
    VALLE» → «Situación del valle». Vacío si la parte usa el rótulo estándar o no tiene."""
    if not nodos or nodos[0].get("type") != "heading":
        return ""
    m = _SECCION.match(" ".join(_texto(nodos[0]).split()))
    if not m or _ESTANDAR.match(m.group(1)):
        return ""
    t = m.group(1).strip().rstrip(".:")
    return (t[:1].upper() + t[1:].lower()) if t.isupper() else t


def contar(nodos: list[dict], tipo: str) -> int:
    return sum((1 if n.get("type") == tipo else 0) + contar(n.get("content") or [], tipo) for n in nodos)


def resumen(clave: str, nodos: list[dict]) -> dict:
    doc = {"type": "doc", "content": nodos}
    return {
        "clave": clave,
        "palabras": len(reglas.texto_plano(doc).split()),
        "notas": contar(nodos, "footnote"),
        "fotos": contar(nodos, "fotografia"),
        "tablas": contar(nodos, "table"),
        "titulo_propio": titulo_propio(nodos),
    }

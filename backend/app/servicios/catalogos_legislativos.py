"""CATÁLOGOS LEGISLATIVOS: lo que en la ficha de un proyecto se ELIGE, no se escribe (2026-10-01).

Datos PÚBLICOS de la Cámara de Diputados (no de la entidad; D13): sus comisiones ordinarias y sus
grupos parlamentarios, con la fuente y la fecha de cada lista. Cambian por periodo anual de
sesiones: se actualizan aquí, con su fuente. Los datos del TITULAR (autor, cargo, lugar) no viven
en el código: se leen del perfil de la entidad (MDD_PERFIL, `perfil()`).
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from app.config import config

# Comisiones ordinarias, periodo anual de sesiones 2026-2027 (16). Fuente: Comunicaciones del
# Congreso, «Pleno de la Cámara de Diputados aprueba número de integrantes de comisiones
# ordinarias», 2026-08-05.
COMISIONES = [
    "Comisión de Constitución, Reglamento y Relaciones Exteriores",
    "Comisión de Modernización de la Gestión del Estado y Contraloría",
    "Comisión de Economía, Banca, Finanzas e Inteligencia Financiera",
    "Comisión de Educación, Cultura y Deporte",
    "Comisión de Justicia y Derechos Humanos",
    "Comisión de Inclusión Social, Familia, Mujer y Pueblos Andinos, Amazónicos y Afroperuanos",
    "Comisión de Infraestructura, Vivienda y Transportes",
    "Comisión de Defensa Nacional y Orden Interno",
    "Comisión de Desarrollo Agrario",
    "Comisión de Defensa del Consumidor y Regulación de los Servicios Públicos",
    "Comisión de Energía y Minas",
    "Comisión de Producción, Comercio Exterior y Turismo",
    "Comisión de Medio Ambiente y Sostenibilidad",
    "Comisión de Salud",
    "Comisión de Trabajo y Seguridad Social",
    "Comisión de Ciencia, Innovación Tecnológica y Sociedad Digital",
]
FUENTE_COMISIONES = "Comunicaciones del Congreso, 2026-08-05 (periodo 2026-2027)"

# Grupos parlamentarios de la Cámara de Diputados 2026-2031 (fuerzas con escaños; prensa de
# 2026-06/08 sobre la conformación y el reparto de presidencias de comisión).
GRUPOS = [
    "Grupo Parlamentario Fuerza Popular",
    "Grupo Parlamentario Juntos Por el Perú",
    "Grupo Parlamentario Buen Gobierno",
    "Grupo Parlamentario Renovación Popular",
    "Grupo Parlamentario Cívico Obras",
    "Grupo Parlamentario Ahora Nación",
]
CAMARAS = ["Cámara de Diputados", "Cámara de Senadores"]

_META = re.compile(r"\\setmeta\{(\w+)\}\{((?:[^{}]|\{[^{}]*\})*)\}")


def _limpiar_tex(v: str) -> str:
    # Acentos escritos a lo LaTeX (\'a, \~n, \"u) -> la letra con su tilde.
    marcas = {"'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303"}
    v = re.sub(r"\\(['`^\"~])\{?\\?(\w)\}?", lambda m: unicodedata.normalize("NFC", m.group(2) + marcas[m.group(1)]), v)
    v = v.replace("~", " ").replace("\\,", " ")
    v = re.sub(r"\\[a-zA-Z]+\s*", "", v)
    return " ".join(v.replace("{", "").replace("}", "").split())


@lru_cache(maxsize=1)
def perfil() -> dict[str, str]:
    """Metadatos del perfil de la entidad (`\\setmeta{clave}{valor}` de perfil-despacho.tex):
    autor, cargo, lugar… Vacío si MDD_PERFIL no está o no se puede leer."""
    if not config.mdd_perfil:
        return {}
    ruta = Path(config.mdd_perfil) / "perfil-despacho.tex"
    try:
        texto = ruta.read_text(encoding="utf-8")
    except OSError:
        return {}
    return {k: _limpiar_tex(v) for k, v in _META.findall(texto)}

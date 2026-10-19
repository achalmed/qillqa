"""Institución destino con UN SOLO formato (Edison 2026-10-08: «desorden en la columna institución
destino: unos son siglas, otros nombres en pura mayúscula, otros en minúscula; ordenar eso de
forma automática, todo con el mismo formato de ahora en adelante»).

El texto sale de los campos del documento (`api/documentos.py::_instituciones`), escrito a mano
en cada oficio: a veces la institución, a veces el cargo («Ministro del Interior», «Alcalde de la
Municipalidad…»), a veces en mayúsculas sostenidas. Aquí se lleva siempre a lo mismo:

1. la institución, no el cargo (el cargo se quita o se vuelve institución: Ministro → Ministerio);
2. con el nombre del DIRECTORIO cuando se reconoce (por siglas o por nombre): manda el directorio;
3. en tipo oración de nombre propio (no MAYÚSCULAS), y las siglas aparte.

No toca los documentos: es solo cómo se muestra (y se agrupa) en la bandeja y en estadísticas.
"""
from __future__ import annotations

import re
import time
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Institucion

# Palabras que van en minúscula dentro de un nombre propio (salvo al inicio).
_MENORES = {
    "a", "al", "ante", "con", "de", "del", "e", "el", "en", "la", "las", "lo", "los", "o",
    "para", "por", "sin", "u", "y",
}
_ROMANOS = re.compile(r"^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$", re.I)
_SIGLAS_FINAL = re.compile(r"\s*[(（]\s*([^()]{2,40}?)\s*[)）]\s*$")

# Cargo al inicio → cómo se llama la institución que encabeza (o nada: se quita el cargo).
_CARGO_A_INSTITUCION = [
    (re.compile(r"^ministr[oa]\s+(de|del)\s+", re.I), r"Ministerio \1 "),
    (re.compile(r"^gobernador(a)?\s+regional\s+de\s+", re.I), "Gobierno Regional de "),
    (re.compile(r"^president[ea]\s+del\s+consejo\s+de\s+ministros\b", re.I), "Presidencia del Consejo de Ministros"),
]
_CARGOS = (
    r"(?:sub)?director(?:a)?(?:\s+(?:general|regional|ejecutiv[oa]|de\s+gesti[oó]n\s+pedag[oó]gica))?",
    r"jef[ea](?:\s+(?:zonal|regional|nacional))?",
    r"rector(?:a)?", r"vicerrector(?:a)?", r"decan[oa]", r"alcalde(?:sa)?", r"teniente\s+alcalde",
    r"president[ea](?:\s+de\s+la\s+comisi[oó]n\s+organizadora)?", r"vicepresident[ea]",
    r"secretari[oa]\s+general", r"subsecretari[oa]\s+general", r"gerente(?:\s+general|\s+regional)?",
    r"coordinador(?:a)?", r"superintendente", r"administrador(?:a)?", r"oficial\s+mayor",
    r"procurador(?:a)?", r"comandante\s+general", r"prefect[oa](?:\s+regional)?", r"defensor(?:a)?",
    r"titular", r"responsable", r"encargad[oa]", r"especialista",
)
_CARGO_DE = re.compile(r"^(?:" + "|".join(_CARGOS) + r")\s+(?:de|del)\s+(?:la\s+|el\s+|los\s+|las\s+)?", re.I)


def plano(texto: str) -> str:
    """Clave de comparación: sin tildes, sin comillas, en minúscula y con espacios simples."""
    t = unicodedata.normalize("NFD", texto or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[«»“”\"'‘’]", "", t)
    return re.sub(r"\s+", " ", t).strip().lower()


def _mayusculas_sostenidas(texto: str) -> bool:
    letras = [c for c in texto if c.isalpha()]
    return len(letras) >= 6 and sum(c.isupper() for c in letras) / len(letras) > 0.85


def nombre_propio(texto: str) -> str:
    """«AUTORIDAD NACIONAL DEL AGUA» → «Autoridad Nacional del Agua». Solo cambia lo que está en
    mayúsculas sostenidas: un nombre ya bien escrito (con sus siglas internas) se respeta."""
    if not _mayusculas_sostenidas(texto):
        return texto[:1].upper() + texto[1:]
    partes = re.split(r"(\s+|[-–—/«»“”\"(])", texto.lower())
    salida: list[str] = []
    primera = True
    for p in partes:
        if not p or not p.strip() or re.fullmatch(r"[-–—/«»“”\"(]", p):
            salida.append(p)
            if p and p.strip():
                primera = True  # tras « o ( se empieza de nuevo
            continue
        if _ROMANOS.match(p) and len(p) <= 5 and p not in {"di", "mi", "cd", "dc", "lid"}:
            salida.append(p.upper())
        elif not primera and p in _MENORES:
            salida.append(p)
        elif p in ("n°", "nº"):
            salida.append("N.°")
        else:
            salida.append(p[:1].upper() + p[1:])
        primera = False
    return "".join(salida)


def sin_cargo(texto: str) -> str:
    """El cargo del destinatario se vuelve su institución: «Alcalde de la Municipalidad Distrital
    de Vilcanchos» → «Municipalidad Distrital de Vilcanchos»; «Ministro del Interior» →
    «Ministerio del Interior». Lo que no empieza por un cargo conocido queda igual."""
    t = texto.strip()
    for patron, reemplazo in _CARGO_A_INSTITUCION:
        if patron.search(t):
            return patron.sub(reemplazo, t, count=1).strip()
    m = _CARGO_DE.match(t)
    if m and len(t) - m.end() >= 4:
        resto = t[m.end():].strip()
        return resto[:1].upper() + resto[1:]
    return t


class Indice:
    """Instituciones del directorio por siglas y por nombre plano."""

    def __init__(self, filas: list[tuple[str, str]]):
        self.por_siglas: dict[str, tuple[str, str]] = {}
        self.por_nombre: dict[str, tuple[str, str]] = {}
        for nombre, siglas in filas:
            par = (nombre_propio((nombre or "").strip()), (siglas or "").strip())
            if par[1]:
                self.por_siglas.setdefault(plano(par[1]), par)
            if par[0]:
                self.por_nombre.setdefault(plano(par[0]), par)


_CACHE: tuple[float, Indice] | None = None
_VIGENCIA_S = 120


async def indice(sesion: AsyncSession) -> Indice:
    """Una consulta cada 2 minutos como mucho: la bandeja lo pide en cada carga."""
    global _CACHE
    if _CACHE and time.monotonic() - _CACHE[0] < _VIGENCIA_S:
        return _CACHE[1]
    filas = (await sesion.execute(select(Institucion.nombre, Institucion.siglas))).all()
    _CACHE = (time.monotonic(), Indice([(n, s) for n, s in filas]))
    return _CACHE[1]


def normalizar(texto: str, idx: Indice | None = None) -> tuple[str, str]:
    """(nombre, siglas) de una institución destino, siempre con el mismo formato."""
    t = re.sub(r"\s+", " ", (texto or "").replace("--", "—")).strip(" ,;.-")
    if not t:
        return "", ""
    siglas = ""
    m = _SIGLAS_FINAL.search(t)
    if m and (not re.search(r"\s", m.group(1).strip()) or m.group(1).isupper()):
        siglas = m.group(1).strip()
        t = t[: m.start()].strip()
    # Solo siglas («ANA», «ANIN»): el directorio sabe el nombre.
    if idx and not siglas and re.fullmatch(r"[A-ZÁÉÍÓÚÑ0-9\-]{2,12}", t):
        par = idx.por_siglas.get(plano(t))
        if par:
            return par[0], par[1]
    t = sin_cargo(nombre_propio(t))
    if idx:
        par = idx.por_nombre.get(plano(t)) or (idx.por_siglas.get(plano(siglas)) if siglas else None)
        if par and (not siglas or not par[1] or plano(par[1]) == plano(siglas) or plano(par[0]) == plano(t)):
            return par[0], par[1] or siglas
    return t, siglas


def mostrar(texto: str, idx: Indice | None = None) -> str:
    """La forma única para la bandeja: «Nombre (SIGLAS)» o «Nombre»."""
    nombre, siglas = normalizar(texto, idx)
    return f"{nombre} ({siglas})" if siglas and nombre and plano(siglas) != plano(nombre) else nombre

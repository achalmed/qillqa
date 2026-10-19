"""BIBLIOTECA (2026-10-06): la biblioteca Calibre del ecosistema, en SOLO LECTURA.

ROLES CORREGIDOS (Edison, 2026-10-06; `docs/decisiones.md` §Biblioteca y citas): Calibre
organiza y administra los ARCHIVOS (dónde está cada libro, documento o artículo); ZOTERO es la
autoridad de metadatos, referencias y citas (servicios/zotero.py). Este módulo busca en
`metadata.db` por título, autor, serie, etiquetas, editorial o identificador (ISBN, DOI,
`calibre:N`) para UBICAR un archivo y resolver las fuentes `calibre:N` de antes; ya no da el
texto de las citas del editor. Su formateador APA 7 queda solo para esas fuentes antiguas, y
`servicios/zotero.py` reutiliza su normalización y su puntuación de búsqueda.

Reglas:
- La base se abre con `mode=ro` y NUNCA se escribe (escribir es de `scripts-biblioteca`,
  por su puerta única). Si no está (Docker, otra máquina) o está bloqueada, la función
  queda apagada: `estado()` lo dice y `buscar()` devuelve [].
- La ruta: `CALIBRE_DB` (config) o la del workspace (`core/env.py`), igual que las fuentes
  enlazadas (`servicios/fuentes.py`).
- Se carga la biblioteca entera en memoria (unos miles de libros, un instante) y se recarga
  solo cuando cambia el `mtime` de la base o de su `-wal`.

La conversión de autores y la referencia APA 7 ESPEJAN `core/py-common/biblioteca.py`
(`es_corporativo`, `partir_autor`, `autor_apa`, `apa`), la única del ecosistema; se copia
y no se importa porque Qillqa corre también en Docker, sin el workspace. La prueba
`tests/test_biblioteca.py` compara ambas cuando el workspace está a mano. Diferencias
deliberadas: el título va sin marcas de cursiva en `cita_apa` (con `*…*` en `cita_apa_md`)
y, si el libro tiene DOI, se añade `https://doi.org/…` como manda APA 7.
"""

from __future__ import annotations

import re
import sqlite3
import threading
import unicodedata
from pathlib import Path

from app.config import config

LIMITE_DEFECTO = 20
LIMITE_MAXIMO = 50


# ---------------------------------------------------------------- normalización
def norm(s: str | None) -> str:
    """Minúsculas sin tildes; todo lo que no es letra o cifra, un espacio."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_isbn(s: str | None) -> str:
    return re.sub(r"[^0-9xX]", "", s or "").upper()


RE_DOI = re.compile(r"10\.[0-9]{4,9}/\S+", re.I)
RE_CALIBRE = re.compile(r"^\s*calibre:(\d+)\s*$", re.I)


# ---------------------------------------------------------------- APA 7 (espejo de core/py-common/biblioteca.py)
_PARTICULAS = {"de", "del", "la", "las", "los", "van", "von", "der", "da",
               "dos", "di", "du", "le", "mac", "mc", "san", "santa"}
_RE_INICIALES = re.compile(r"(?:[A-ZÁÉÍÓÚÑ]\.?[\s-]?)+")
_INSTITUCION = {
    "banco", "instituto", "ministerio", "universidad", "organizacion", "fondo",
    "centro", "consejo", "asociacion", "congreso", "defensoria", "contraloria",
    "corte", "tribunal", "comision", "naciones", "unidas", "superintendencia",
    "direccion", "secretaria", "agencia", "oficina", "camara", "colegio",
    "federacion", "confederacion", "sociedad", "fundacion", "observatorio",
    "presidencia", "gobierno", "republica", "poder", "corporacion", "empresa",
    "gobernacion", "departamento", "facultad", "escuela",
    "bank", "institute", "ministry", "university", "organization", "organisation",
    "fund", "council", "association", "agency", "office", "commission",
    "foundation", "society", "department", "settlements", "nations",
}


def es_corporativo(nombre: str | None) -> bool:
    """¿Institución y no persona? Criterio conservador del ecosistema: sigla, palabra de
    institución o sigla entre sus palabras; ante la duda, persona."""
    a = (nombre or "").replace("|", ",").strip()
    if not a:
        return False
    if "," in a:
        antes = a.split(",", 1)[0].strip()
        return (antes.isalpha() and antes.isupper() and len(antes) >= 2) or \
            any(norm(x) in _INSTITUCION for x in antes.split())
    partes = a.split()
    if len(partes) == 1:
        return a.isupper() and len(a) >= 2
    if any(norm(x) in _INSTITUCION for x in partes):
        return True
    siglas = (re.sub(r"[()]", "", x) for x in partes)
    return not a.isupper() and any(len(s) >= 3 and s.isupper() and s.isalpha() for s in siglas)


def _inicial(nombre: str) -> str:
    return "-".join(f"{s[0].upper()}." for s in nombre.split("-") if s[:1].isalpha())


def partir_autor(nombre: str | None) -> tuple[str, str] | None:
    """(apellidos, nombres) de una persona; None si es corporativo o un solo nombre.
    La biblioteca guarda «Nombre, Apellidos» (Calibre: «Nombre| Apellidos») o «Nombre Apellido»."""
    a = (nombre or "").replace("|", ",").strip()
    if not a or es_corporativo(a):
        return None
    if "," in a:
        antes, despues = [x.strip() for x in a.split(",", 1)]
        if not despues:
            return None
        if _RE_INICIALES.fullmatch(despues):
            apellido, nombres = antes, despues
        else:
            apellido, nombres = despues, antes
    else:
        partes = a.split()
        if len(partes) == 1:
            return None
        i = len(partes) - 1
        while i > 1 and partes[i - 1].lower() in _PARTICULAS:
            i -= 1
        apellido, nombres = " ".join(partes[i:]), " ".join(partes[:i])
    if apellido[:1].islower():
        apellido = apellido[0].upper() + apellido[1:]
    return apellido, nombres


def autor_apa(nombre: str | None) -> str:
    """«Jeffrey M.| Wooldridge» → «Wooldridge, J. M.»; un corporativo, entero."""
    a = (nombre or "").replace("|", ",").strip()
    if not a:
        return "Autor desconocido"
    p = partir_autor(a)
    if p is None:
        return a.split(",", 1)[0].strip() if "," in a and not a.split(",", 1)[1].strip() else a
    apellido, nombres = p
    iniciales = " ".join(i for i in (_inicial(x) for x in nombres.split()) if i)
    return f"{apellido}, {iniciales}".strip(", ")


def autor_corto(nombre: str | None) -> str:
    """Lo que va en la cita parentética: el apellido, o el corporativo entero."""
    a = (nombre or "").replace("|", ",").strip()
    if not a:
        return "Autor desconocido"
    p = partir_autor(a)
    return p[0] if p else autor_apa(a)


def anio_de(pubdate: str | None) -> str:
    """Año de publicación; «s. f.» si Calibre no lo sabe (nunca se inventa una fecha)."""
    anio = (pubdate or "")[:4]
    return "s. f." if not anio.isdigit() or anio in ("0101", "0000", "1970") else anio


def _firma(autores: list[str]) -> str:
    lista = [autor_apa(a) for a in autores] or ["Autor desconocido"]
    if len(lista) == 1:
        return lista[0]
    if len(lista) == 2:
        return f"{lista[0]} y {lista[1]}"
    if len(lista) <= 20:
        return ", ".join(lista[:-1]) + f" y {lista[-1]}"
    return ", ".join(lista[:19]) + ", … " + lista[-1]          # APA 7: 19, elipsis, el último


def cita_apa(d: dict, cursiva: bool = False) -> str:
    """Referencia APA 7: Autores (año). Título. Editorial. https://doi.org/…
    La editorial no se repite cuando es el mismo autor (informe institucional)."""
    firma = _firma(d.get("autores") or [])
    titulo = d.get("titulo") or ""
    ref = f"{firma} ({d.get('anio') or 's. f.'}). {f'*{titulo}*' if cursiva else titulo}."
    editorial = d.get("editorial") or ""
    if editorial and norm(editorial) != norm(firma):
        ref += f" {editorial}."
    if d.get("doi"):
        ref += f" https://doi.org/{d['doi']}"
    return ref


def cita_corta(d: dict) -> str:
    """Cita parentética APA 7 sin paréntesis: «Cotler, 1978», «Romer y Romer, 2010», «Acemoglu et al., 2005»."""
    autores = d.get("autores") or []
    anio = d.get("anio") or "s. f."
    if not autores:
        return f"{d.get('titulo') or 'Sin título'}, {anio}"
    if len(autores) == 1:
        quien = autor_corto(autores[0])
    elif len(autores) == 2:
        quien = f"{autor_corto(autores[0])} y {autor_corto(autores[1])}"
    else:
        quien = f"{autor_corto(autores[0])} et al."
    return f"{quien}, {anio}"


# ---------------------------------------------------------------- la base
def _workspace_db() -> Path | None:
    from app.servicios.fuentes import _workspace   # mismo resolutor que las fuentes enlazadas
    env = _workspace()
    return Path(env.CALIBRE_DB) if env else None


def ruta_base() -> Path | None:
    """metadata.db configurada (`CALIBRE_DB`) o la del workspace; None si no hay ninguna."""
    if config.calibre_db:
        return Path(config.calibre_db)
    return _workspace_db()


def _huella(base: Path) -> tuple:
    wal = base.with_name(base.name + "-wal")
    return (base.stat().st_mtime_ns, wal.stat().st_mtime_ns if wal.exists() else 0)


def _abrir(base: Path) -> sqlite3.Connection:
    # as_uri() escapa espacios, «#» y «?»; mode=ro: ni una escritura, ni crear la base.
    return sqlite3.connect(f"{base.resolve().as_uri()}?mode=ro", uri=True, timeout=2)


def cargar(base: Path) -> dict[int, dict]:
    """Todos los libros de una metadata.db, ya con sus citas. Lanza sqlite3.Error si no se puede leer."""
    con = _abrir(base)
    try:
        libros: dict[int, dict] = {}
        for bid, titulo, pubdate in con.execute("SELECT id, title, pubdate FROM books"):
            libros[bid] = {"calibre_id": bid, "titulo": titulo or "", "autores": [], "anio": anio_de(pubdate),
                           "editorial": "", "isbn": "", "doi": "", "serie": "", "etiquetas": [], "idioma": ""}

        def unir(sql: str):
            for bid, valor in con.execute(sql):
                if bid in libros and valor:
                    yield libros[bid], valor

        for d, v in unir("SELECT l.book, a.name FROM books_authors_link l JOIN authors a ON a.id = l.author ORDER BY l.id"):
            d["autores"].append(v.replace("|", ","))
        for d, v in unir("SELECT l.book, p.name FROM books_publishers_link l JOIN publishers p ON p.id = l.publisher"):
            d["editorial"] = v
        for d, v in unir("SELECT l.book, s.name FROM books_series_link l JOIN series s ON s.id = l.series"):
            d["serie"] = v
        for d, v in unir("SELECT l.book, t.name FROM books_tags_link l JOIN tags t ON t.id = l.tag ORDER BY t.name"):
            d["etiquetas"].append(v)
        for d, v in unir("SELECT l.book, lc.lang_code FROM books_languages_link l "
                         "JOIN languages lc ON lc.id = l.lang_code ORDER BY l.item_order"):
            d["idioma"] = d["idioma"] or v
        for bid, tipo, val in con.execute("SELECT book, type, val FROM identifiers WHERE type IN ('isbn', 'doi')"):
            if bid in libros and val:
                libros[bid][tipo] = val.strip().lower() if tipo == "doi" else val.strip()
    finally:
        con.close()
    for d in libros.values():
        d["cita_apa"] = cita_apa(d)
        d["cita_apa_md"] = cita_apa(d, cursiva=True)
        d["cita_corta"] = cita_corta(d)
        d["_titulo"] = norm(d["titulo"])
        d["_autores"] = norm(" ".join(d["autores"]))
        d["_resto"] = norm(" ".join([d["serie"], d["editorial"], *d["etiquetas"]]))
    return libros


class _Cache:
    def __init__(self) -> None:
        self.cerrojo = threading.Lock()
        self.base: Path | None = None
        self.huella: tuple | None = None
        self.libros: dict[int, dict] = {}
        self.motivo = ""

    def obtener(self) -> dict[int, dict]:
        base = ruta_base()
        with self.cerrojo:
            if base is None or not base.is_file():
                self.base, self.huella, self.libros = base, None, {}
                self.motivo = "No hay biblioteca Calibre configurada (CALIBRE_DB)." if base is None \
                    else "La biblioteca Calibre no está en esta máquina."
                return self.libros
            try:
                huella = _huella(base)
                if base != self.base or huella != self.huella:
                    self.libros = cargar(base)
                    self.base, self.huella, self.motivo = base, huella, ""
            except (OSError, sqlite3.Error) as e:
                # Base bloqueada o a medio escribir: se sigue con lo último leído, si lo hay.
                self.motivo = f"No se pudo leer la biblioteca Calibre ({e.__class__.__name__})."
                if base != self.base:
                    self.libros = {}
            return self.libros


_cache = _Cache()


def _publico(d: dict) -> dict:
    return {k: v for k, v in d.items() if not k.startswith("_")}


def estado() -> dict:
    libros = _cache.obtener()
    return {"configurado": ruta_base() is not None, "disponible": bool(libros),
            "libros": len(libros), "motivo": _cache.motivo}


def obtener(calibre_id: int) -> dict | None:
    d = _cache.obtener().get(int(calibre_id))
    return _publico(d) if d else None


def puntuar(d: dict, consulta: str, fichas: list[str]) -> int:
    """0 si el libro no responde a la consulta; si responde, cuanto más, mejor.
    Toda ficha de la consulta debe aparecer (como inicio de palabra o dentro) en título,
    autores, serie, editorial o etiquetas; pesa más el título, luego el autor."""
    if not fichas:
        return 0
    titulo, autores, resto = d["_titulo"], d["_autores"], d["_resto"]
    todo = f" {titulo} {autores} {resto} "
    puntos = 0
    for f in fichas:
        if f not in todo:
            return 0
        if f" {f}" in f" {titulo}":
            puntos += 4
        elif f in titulo:
            puntos += 2
        elif f" {f}" in f" {autores}":
            puntos += 3
        elif f in autores:
            puntos += 1
        else:
            puntos += 1
    if titulo.startswith(consulta):
        puntos += 6
    elif consulta in titulo:
        puntos += 3
    return puntos


def buscar_en(libros: dict[int, dict], q: str, limite: int = LIMITE_DEFECTO) -> list[dict]:
    """Búsqueda pura sobre una colección ya cargada (la prueban los tests)."""
    q = (q or "").strip()
    limite = max(1, min(int(limite or LIMITE_DEFECTO), LIMITE_MAXIMO))
    if not q or not libros:
        return []
    if (m := RE_CALIBRE.match(q)) or q.isdigit() and len(q) < 7:
        d = libros.get(int(m.group(1) if m else q))
        exactos = [d] if d else []
        if m:
            return [_publico(x) for x in exactos]
    else:
        exactos = []
    # Identificadores: DOI e ISBN se comparan normalizados y van primero.
    if (doi := RE_DOI.search(q)):
        clave = doi.group(0).rstrip(".,;").lower()
        exactos += [d for d in libros.values() if d["doi"] and d["doi"] == clave]
    isbn = norm_isbn(q)
    if len(isbn) in (10, 13) and re.fullmatch(r"[0-9xX\-\s]+", q):
        exactos += [d for d in libros.values() if d["isbn"] and norm_isbn(d["isbn"]) == isbn]
    consulta = norm(q)
    fichas = [f for f in consulta.split() if f]
    puntuados = sorted(
        ((p, d) for d in libros.values() if (p := puntuar(d, consulta, fichas))),
        key=lambda x: (-x[0], len(x[1]["titulo"]), x[1]["calibre_id"]),
    )
    vistos: set[int] = set()
    salida: list[dict] = []
    for d in [*exactos, *(d for _, d in puntuados)]:
        if d["calibre_id"] in vistos:
            continue
        vistos.add(d["calibre_id"])
        salida.append(_publico(d))
        if len(salida) >= limite:
            break
    return salida


def buscar(q: str, limite: int = LIMITE_DEFECTO) -> list[dict]:
    """Libros de la biblioteca que responden a `q` (vacío si la biblioteca no está)."""
    return buscar_en(_cache.obtener(), q, limite)

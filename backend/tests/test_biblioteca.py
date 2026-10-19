"""backend/tests/test_biblioteca.py — biblioteca Calibre en solo lectura (2026-10-06):
referencia APA 7, cita corta, normalización y búsqueda, sobre una metadata.db mínima."""
import importlib.util
import os
import sqlite3
from pathlib import Path

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import biblioteca as b  # noqa: E402

ESQUEMA = """
CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, pubdate TEXT);
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER);
CREATE TABLE publishers (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE books_publishers_link (id INTEGER PRIMARY KEY, book INTEGER, publisher INTEGER);
CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE books_series_link (id INTEGER PRIMARY KEY, book INTEGER, series INTEGER);
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE books_tags_link (id INTEGER PRIMARY KEY, book INTEGER, tag INTEGER);
CREATE TABLE languages (id INTEGER PRIMARY KEY, lang_code TEXT);
CREATE TABLE books_languages_link (id INTEGER PRIMARY KEY, book INTEGER, lang_code INTEGER, item_order INTEGER);
CREATE TABLE identifiers (id INTEGER PRIMARY KEY, book INTEGER, type TEXT, val TEXT);

INSERT INTO books VALUES (1, 'Introducción a la econometría', '2010-06-01 00:00:00+00:00'),
                         (2, 'Clases, Estado y Nación en el Perú', '1978-01-01'),
                         (3, 'Memoria anual', '0101-01-01 00:00:00+00:00'),
                         (4, 'The science of monetary policy', '1999-12-01'),
                         (5, 'Economía política', '2001-01-01');
INSERT INTO authors VALUES (1, 'Jeffrey M.| Wooldridge'), (2, 'Julio Cotler'),
                           (3, 'Banco Central de Reserva del Perú'), (4, 'Richard| Clarida'),
                           (5, 'Jordi| Galí'), (6, 'Mark| Gertler'), (7, 'Hernando de Soto');
INSERT INTO books_authors_link (book, author) VALUES (1, 1), (2, 2), (3, 3), (4, 4), (4, 5), (4, 6), (5, 7), (5, 2);
INSERT INTO publishers VALUES (1, 'Cengage'), (2, 'Banco Central de Reserva del Perú'), (3, 'IEP');
INSERT INTO books_publishers_link (book, publisher) VALUES (1, 1), (3, 2), (2, 3);
INSERT INTO series VALUES (1, 'Perú Problema');
INSERT INTO books_series_link (book, series) VALUES (2, 1);
INSERT INTO tags VALUES (1, 'Sociología'), (2, 'Econometría');
INSERT INTO books_tags_link (book, tag) VALUES (2, 1), (1, 2);
INSERT INTO languages VALUES (1, 'spa'), (2, 'eng');
INSERT INTO books_languages_link (book, lang_code, item_order) VALUES (1, 1, 0), (4, 2, 0);
INSERT INTO identifiers (book, type, val) VALUES (1, 'isbn', '978-607-481-312-8'), (4, 'doi', '10.3386/W7147'),
                                                 (4, 'url', 'https://example.org');
"""


@pytest.fixture()
def libros(tmp_path):
    base = tmp_path / "biblioteca con espacio#1" / "metadata.db"
    base.parent.mkdir()
    c = sqlite3.connect(base)
    c.executescript(ESQUEMA)
    c.commit()
    c.close()
    return b.cargar(base)


def test_normalizacion():
    assert b.norm("  Economía   POLÍTICA, ¿del Perú? ") == "economia politica del peru"
    assert b.norm_isbn("978-607-481-312-8") == "9786074813128"
    assert b.anio_de("0101-01-01") == "s. f." and b.anio_de("") == "s. f." and b.anio_de("2010-06-01") == "2010"


def test_autores_apa():
    assert b.autor_apa("Jeffrey M.| Wooldridge") == "Wooldridge, J. M."
    assert b.autor_apa("Julio Cotler") == "Cotler, J."
    assert b.autor_apa("Hernando de Soto") == "De Soto, H."
    assert b.autor_apa("Jean-Luc| Godard") == "Godard, J.-L."
    assert b.autor_apa("Banco Central de Reserva del Perú") == "Banco Central de Reserva del Perú"
    assert b.autor_apa("INEI") == "INEI"
    assert b.autor_corto("Hernando de Soto") == "De Soto"


def test_citas(libros):
    assert libros[1]["cita_apa"] == "Wooldridge, J. M. (2010). Introducción a la econometría. Cengage."
    assert libros[1]["cita_apa_md"] == "Wooldridge, J. M. (2010). *Introducción a la econometría*. Cengage."
    assert libros[1]["cita_corta"] == "Wooldridge, 2010"
    # Autor corporativo que es también la editorial: no se repite; sin año, «s. f.».
    assert libros[3]["cita_apa"] == "Banco Central de Reserva del Perú (s. f.). Memoria anual."
    assert libros[3]["cita_corta"] == "Banco Central de Reserva del Perú, s. f."
    # Tres autores: APA 7 «et al.» en la cita corta; el DOI como URL al final.
    assert libros[4]["cita_apa"] == ("Clarida, R., Galí, J. y Gertler, M. (1999). The science of monetary policy. "
                                     "https://doi.org/10.3386/w7147")
    assert libros[4]["cita_corta"] == "Clarida et al., 1999"
    assert libros[5]["cita_corta"] == "De Soto y Cotler, 2001"
    assert libros[1]["idioma"] == "spa" and libros[2]["serie"] == "Perú Problema" and libros[2]["etiquetas"] == ["Sociología"]


def test_busqueda(libros):
    ids = lambda q, **k: [x["calibre_id"] for x in b.buscar_en(libros, q, **k)]  # noqa: E731
    assert ids("econometria") == [1]                     # sin tildes ni mayúsculas
    assert ids("WOOLDRIDGE intro") == [1]                # autor + título, prefijos
    assert sorted(ids("cotler")) == [2, 5]               # por el autor, sea el primero o no
    assert ids("peru problema") == [2]                   # por la serie
    assert ids("sociologia") == [2]                      # por la etiqueta
    assert ids("9786074813128") == [1] and ids("978-607-481-312-8") == [1]
    assert ids("https://doi.org/10.3386/w7147") == [4]
    assert ids("calibre:3") == [3] and ids("calibre:999") == []
    assert ids("") == [] and ids("zzzz") == []
    assert len(ids("e", limite=2)) == 2
    claves = set(b.buscar_en(libros, "econometria")[0])
    assert {"calibre_id", "titulo", "autores", "anio", "editorial", "isbn", "doi", "cita_apa", "cita_corta"} <= claves
    assert not any(k.startswith("_") for k in claves)


def test_solo_lectura_y_ausente(tmp_path, monkeypatch):
    base = tmp_path / "metadata.db"
    sqlite3.connect(base).executescript(ESQUEMA)
    con = b._abrir(base)
    with pytest.raises(sqlite3.OperationalError):
        con.execute("DELETE FROM books")
    con.close()
    # Sin base: apagado, sin error.
    monkeypatch.setattr(b, "ruta_base", lambda: tmp_path / "no-existe.db")
    assert b.estado()["disponible"] is False and b.buscar("x") == []
    assert not (tmp_path / "no-existe.db").exists()      # mode=ro no la crea
    monkeypatch.setattr(b, "ruta_base", lambda: base)
    assert b.estado()["libros"] == 5 and b.obtener(2)["titulo"].startswith("Clases")


def _core_biblioteca():
    d = Path(__file__).resolve()
    while d != d.parent and not (d / "core" / "py-common" / "biblioteca.py").exists():
        d = d.parent
    ruta = d / "core" / "py-common" / "biblioteca.py"
    if not ruta.exists():
        return None
    spec = importlib.util.spec_from_file_location("core_biblioteca", ruta)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.mark.parametrize("nombre", [
    "Jeffrey M.| Wooldridge", "Julio Cotler", "Hernando de Soto", "Jean-Luc| Godard", "INEI",
    "Banco Central de Reserva del Perú", "Superintendencia de Banca, Seguros y AFP", "Wasserman| L.",
    "Transparencia Internacional", "PROMPERÚ (adscrito a MINCETUR)", "JUAN PÉREZ", "Juan Carlos de la Cruz",
])
def test_espejo_de_core(nombre):
    """El espejo coincide con core/py-common/biblioteca.py (si el workspace está a mano)."""
    core = _core_biblioteca()
    if core is None:
        pytest.skip("sin workspace: core/py-common/biblioteca.py no está")
    assert b.autor_apa(nombre) == core.autor_apa(nombre)
    d = {"autores": [nombre, "Julio Cotler"], "titulo": "Un título", "pubdate": "2001-01-01", "editorial": "IEP"}
    assert b.cita_apa({**d, "anio": "2001"}, cursiva=True) == core.apa(d)

"""backend/tests/test_fuentes.py — fuentes enlazadas por clave estable (paso 4.6, 2026-10-01)."""
import os
import sqlite3

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import fuentes as f  # noqa: E402


def _bases(tmp_path):
    cal = tmp_path / "metadata.db"
    c = sqlite3.connect(cal)
    c.executescript(
        "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, pubdate TEXT);"
        "CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);"
        "CREATE TABLE books_authors_link (book INTEGER, author INTEGER);"
        "INSERT INTO books VALUES (7, 'Manual de Técnica Legislativa', '2021-01-01');"
        "INSERT INTO authors VALUES (1, 'Congreso de la República');"
        "INSERT INTO books_authors_link VALUES (7, 1);"
    )
    c.commit()
    c.close()
    dfw = tmp_path / "catalogo.sqlite"
    c = sqlite3.connect(dfw)
    c.executescript(
        "CREATE TABLE resultados (estudio TEXT, version TEXT, fecha TEXT, titulo TEXT, n_indicadores INTEGER);"
        "INSERT INTO resultados VALUES ('contexto-macro-peru', 'v1', '2026-09-08', 'Contexto macroeconómico', 5);"
    )
    c.commit()
    c.close()
    return {"calibre": cal, "datafw": dfw}


def test_claves_reconocidas():
    for clave in ("calibre:10086", "datafw:contexto-macro-peru@v1", "datafw:x@v2#pbi", "sgdp:doc:272", "zotero:ABCD1234"):
        assert f.es_clave(clave), clave
    for texto in ("Ley 30424", "calibre:", "datafw:x", "sgdp:doc:abc", "calibre:1; DROP"):
        assert not f.es_clave(texto), texto
    assert f.documento_id("sgdp:doc:272") == 272 and f.documento_id("calibre:1") is None


def test_resuelve_biblioteca_y_datos(tmp_path):
    b = _bases(tmp_path)
    r = f.resolver("calibre:7", b)
    assert r == {"origen": "Biblioteca", "titulo": "Manual de Técnica Legislativa", "detalle": "Congreso de la República, 2021"}
    r = f.resolver("datafw:contexto-macro-peru@v1#pbi", b)
    assert r["titulo"] == "Contexto macroeconómico" and "indicador pbi" in r["detalle"]
    assert f.resolver("calibre:8", b) is None  # no existe: se verá la clave
    # Sin la base a mano (otra máquina, Docker), la fuente sigue valiendo.
    assert f.resolver("calibre:7", {"calibre": None, "datafw": None}) is None


def test_ruta_con_espacio_y_almohadilla(tmp_path):
    carpeta = tmp_path / "datafw #1"
    carpeta.mkdir()
    b = _bases(carpeta)
    assert f.resolver("calibre:7", b)["titulo"] == "Manual de Técnica Legislativa"

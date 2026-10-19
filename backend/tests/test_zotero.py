"""backend/tests/test_zotero.py — Zotero como autoridad de referencias y citas (2026-10-06):
lectura de las respuestas de la API local (fixtures), respaldo sobre una base mínima con el
esquema de zotero.sqlite, búsqueda y enlace con el archivo de Calibre. Sin red ni Zotero."""
import os
import sqlite3

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import referencias as ref  # noqa: E402
from app.servicios import zotero as z  # noqa: E402

# Una obra como la devuelve GET /api/users/0/items/top?include=data,bib,citation&style=apa&locale=es-ES
OBRA_API = {
    "key": "HC3ZLHEB",
    "version": 120,
    "library": {"type": "user", "id": 0},
    "links": {"attachment": {"href": "http://localhost:23119/api/users/0/items/ATT00001", "attachmentType": "application/pdf"}},
    "meta": {"creatorSummary": "Cotler y Grompone", "parsedDate": "2000", "numChildren": 1},
    "data": {
        "key": "HC3ZLHEB", "itemType": "book", "title": "El fujimorismo: ascenso y caída de un régimen autoritario",
        "creators": [{"creatorType": "author", "firstName": "Julio", "lastName": "Cotler"},
                     {"creatorType": "author", "firstName": "Romeo", "lastName": "Grompone"}],
        "date": "2000", "publisher": "IEP", "place": "Lima", "DOI": "", "url": "",
        "citationKey": "cotlerFujimorismoAscensoCaida2000",
        "tags": [{"tag": "política"}, {"tag": "Perú", "type": 1}],
    },
    "bib": '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;">\n'
           '  <div class="csl-entry">Cotler, J., &amp; Grompone, R. (2000). <i>El fujimorismo: ascenso y caída '
           'de un régimen autoritario</i>. IEP.</div>\n</div>',
    "citation": "<span>(Cotler &amp; Grompone, 2000)</span>",
}


def test_html_de_citeproc_a_texto_y_markdown():
    assert z.html_a_texto(OBRA_API["bib"]) == ("Cotler, J., & Grompone, R. (2000). El fujimorismo: ascenso y caída "
                                               "de un régimen autoritario. IEP.")
    assert "*El fujimorismo: ascenso y caída de un régimen autoritario*" in z.html_a_texto(OBRA_API["bib"], cursiva=True)
    assert z.html_a_texto(OBRA_API["citation"]) == "(Cotler & Grompone, 2000)"


def test_obra_de_la_api_local_usa_el_formato_de_zotero_y_el_archivo_de_calibre():
    rutas = {"ATT00001": "attachments:Julio Cotler/El fujimorismo (9932)/El fujimorismo - Julio Cotler.pdf"}
    d = z.publico(z.desde_api(OBRA_API, rutas))
    assert d["zotero_key"] == "HC3ZLHEB"
    assert d["citekey"] == "cotlerFujimorismoAscensoCaida2000"
    assert d["autores"] == ["Cotler, Julio", "Grompone, Romeo"]
    assert d["anio"] == "2000" and d["tipo"] == "book" and d["editorial"] == "IEP"
    assert d["etiquetas"] == ["política", "Perú"]
    assert d["calibre_id"] == 9932
    assert d["cita"].startswith("Cotler, J., & Grompone, R. (2000).")
    assert d["cita_corta"] == "(Cotler & Grompone, 2000)"
    assert d["formateado_por"] == "zotero" and d["origen"] == "api"
    assert not any(k.startswith("_") for k in d)


def test_sin_bib_la_cita_es_del_respaldo_y_va_marcada():
    obra = {k: v for k, v in OBRA_API.items() if k not in ("bib", "citation", "links")}
    d = z.desde_api(obra)
    assert d["formateado_por"] == "sgdp-respaldo"
    assert d["cita"] == "Cotler, J. y Grompone, R. (2000). El fujimorismo: ascenso y caída de un régimen autoritario. IEP."
    assert d["cita_corta"] == "(Cotler y Grompone, 2000)"
    assert d["calibre_id"] is None


def test_piezas_puras():
    assert z.calibre_de_ruta("attachments:A/B (12)/c.pdf") == 12
    assert z.calibre_de_ruta("/home/x/biblioteca/A/B (12)/c.pdf") == 12
    assert z.calibre_de_ruta("storage:archivo.pdf") is None
    assert z.anio_de("2010-06-01 2010-06-01") == "2010"
    assert z.anio_de("0101-01-01 0101-01-01") == "s. f."
    assert z.interpretar("#economía Cotler") == ("Cotler", ["economía"], False)
    assert z.interpretar("@cotler2000") == ("cotler2000", [], True)


# --- respaldo: base mínima con el esquema de zotero.sqlite -------------------------------

ESQUEMA = """
CREATE TABLE libraries (libraryID INTEGER PRIMARY KEY, type TEXT);
CREATE TABLE itemTypes (itemTypeID INTEGER PRIMARY KEY, typeName TEXT);
CREATE TABLE items (itemID INTEGER PRIMARY KEY, itemTypeID INT, libraryID INT, key TEXT);
CREATE TABLE deletedItems (itemID INTEGER PRIMARY KEY, dateDeleted TEXT);
CREATE TABLE fields (fieldID INTEGER PRIMARY KEY, fieldName TEXT);
CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value TEXT);
CREATE TABLE itemData (itemID INT, fieldID INT, valueID INT);
CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT, fieldMode INT);
CREATE TABLE creatorTypes (creatorTypeID INTEGER PRIMARY KEY, creatorType TEXT);
CREATE TABLE itemCreators (itemID INT, creatorID INT, creatorTypeID INT, orderIndex INT);
CREATE TABLE tags (tagID INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE itemTags (itemID INT, tagID INT, type INT);
CREATE TABLE itemAttachments (itemID INTEGER PRIMARY KEY, parentItemID INT, linkMode INT, path TEXT);

INSERT INTO libraries VALUES (1, 'user'), (2, 'group');
INSERT INTO itemTypes VALUES (1, 'book'), (2, 'attachment'), (3, 'note'), (4, 'statute'), (5, 'journalArticle');
INSERT INTO items VALUES (1, 1, 1, 'AAAA1111'), (2, 2, 1, 'ATT00001'), (3, 3, 1, 'NOTA0001'),
                         (4, 4, 1, 'LEY00001'), (5, 1, 1, 'BORRADO1'), (6, 1, 2, 'GRUPO001'), (7, 5, 1, 'ART00001');
INSERT INTO deletedItems VALUES (5, '2026-01-01');
INSERT INTO fields VALUES (1, 'title'), (2, 'date'), (3, 'publisher'), (4, 'citationKey'), (5, 'nameOfAct'),
                          (6, 'dateEnacted'), (7, 'publicLawNumber'), (8, 'publicationTitle'), (9, 'DOI');
INSERT INTO itemDataValues VALUES (1, 'Introducción a la econometría'), (2, '2010-06-01 2010-06-01'), (3, 'Cengage'),
    (4, 'wooldridgeIntroduccionEconometria2010'), (5, 'Ley de Demarcación y Organización Territorial'),
    (6, '2002-07-24 2002-07-24'), (7, '27795'), (8, 'Borrado'), (9, 'Otra'),
    (10, 'Monetary policy rules'), (11, '1999'), (12, 'Journal of Economic Literature'), (13, '10.1257/JEL.37.4.1661');
INSERT INTO itemData VALUES (1, 1, 1), (1, 2, 2), (1, 3, 3), (1, 4, 4), (4, 5, 5), (4, 6, 6), (4, 7, 7),
    (5, 1, 8), (6, 1, 9), (7, 1, 10), (7, 2, 11), (7, 8, 12), (7, 9, 13);
INSERT INTO creators VALUES (1, 'Jeffrey M.', 'Wooldridge', 0), (2, '', 'Congreso de la República', 1),
    (3, 'Richard', 'Clarida', 0), (4, 'Jordi', 'Galí', 0), (5, 'Mark', 'Gertler', 0);
INSERT INTO creatorTypes VALUES (1, 'author'), (2, 'editor');
INSERT INTO itemCreators VALUES (1, 1, 1, 0), (4, 2, 1, 0), (7, 3, 1, 0), (7, 4, 1, 1), (7, 5, 1, 2);
INSERT INTO tags VALUES (1, 'econometría'), (2, 'territorio');
INSERT INTO itemTags VALUES (1, 1, 0), (4, 2, 0);
INSERT INTO itemAttachments VALUES (2, 1, 2, 'attachments:Jeffrey M. Wooldridge/Introduccion (1204)/Intro.pdf');
"""


def _base(tmp_path):
    ruta = tmp_path / "zotero.sqlite"
    con = sqlite3.connect(ruta)
    con.executescript(ESQUEMA)
    con.commit()
    con.close()
    return ruta


def test_respaldo_lee_solo_obras_vivas_de_la_biblioteca_personal(tmp_path):
    obras = z.cargar_copia(_base(tmp_path))
    assert set(obras) == {"AAAA1111", "LEY00001", "ART00001"}   # sin adjuntos, notas, borradas ni grupos
    libro = obras["AAAA1111"]
    assert libro["citekey"] == "wooldridgeIntroduccionEconometria2010"
    assert libro["calibre_id"] == 1204
    assert libro["etiquetas"] == ["econometría"]
    assert libro["cita"] == "Wooldridge, J. M. (2010). Introducción a la econometría. Cengage."
    assert libro["cita_corta"] == "(Wooldridge, 2010)"
    assert libro["formateado_por"] == "sgdp-respaldo" and libro["origen"] == "sqlite"
    ley = obras["LEY00001"]
    assert ley["titulo"].startswith("Ley de Demarcación") and ley["anio"] == "2002"
    assert ley["cita_corta"] == "(Congreso de la República, 2002)"
    art = obras["ART00001"]
    assert art["cita_corta"] == "(Clarida et al., 1999)"
    assert art["cita"] == ("Clarida, R., Galí, J. y Gertler, M. (1999). Monetary policy rules. "
                           "Journal of Economic Literature. https://doi.org/10.1257/jel.37.4.1661")
    # La copia se borró: en la carpeta solo queda la base original.
    assert sorted(p.name for p in tmp_path.iterdir()) == ["zotero.sqlite"]


def test_busqueda_del_respaldo(tmp_path):
    obras = z.cargar_copia(_base(tmp_path))
    claves = lambda q: [d["zotero_key"] for d in z.buscar_en(obras, q)]  # noqa: E731
    assert claves("econometria") == ["AAAA1111"]
    assert claves("wooldridge 2010") == ["AAAA1111"]
    assert claves("27795") == ["LEY00001"]
    assert claves("#territorio") == ["LEY00001"]
    assert claves("@wooldridgeIntro") == ["AAAA1111"]
    assert claves("ART00001") == ["ART00001"]
    assert claves("nada que ver") == []
    assert all(not k.startswith("_") for d in z.buscar_en(obras, "monetary") for k in d)


def test_nodo_zotero_en_las_referencias():
    assert ref.nodo_de("zotero", "HC3ZLHEB") == "zotero:HC3ZLHEB"
    assert ref.nodo_de("zotero", "12") is None
    assert ref.nodo_de("libro", 10086) == "libro:10086"           # las citas antiguas siguen valiendo
    assert ref.TIPO_RELACION["zotero"] == "cita"
    assert ref.interpretar("obra cotler")[0] == ("zotero",)

"""backend/tests/test_fototeca.py — la Fototeca (2026-10-06): EXIF, geometría de los
ajustes no destructivos, filtros de la lista y el alta de un original (sin base)."""
import math
import os
from datetime import date

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from sqlalchemy.dialects import postgresql  # noqa: E402

from app.config import config  # noqa: E402
from app.servicios import fototeca as ft  # noqa: E402


# --- Ajustes ---------------------------------------------------------------------------------


def test_ajustes_neutros_se_descartan():
    assert ft.normalizar_ajustes({"rotar": 0, "brillo": 1, "recorte": [0, 0, 1, 1], "voltear": False}) == {}
    assert ft.clave_ajustes({}) == "0"
    assert ft.clave_ajustes({"brillo": 1.0}) == "0"


def test_ajustes_se_acotan():
    a = ft.normalizar_ajustes({"rotar": 450, "enderezar": 99, "brillo": 7, "contraste": "x",
                               "recorte": [0.8, -0.2, 0.5, 2], "voltear": 1})
    assert a["rotar"] == 90
    assert a["enderezar"] == 45
    assert a["brillo"] == 2
    assert "contraste" not in a
    assert a["voltear"] is True
    # El recorte no sale de la foto: x + ancho ≤ 1, y + alto ≤ 1.
    x, y, w, h = a["recorte"]
    assert (x, y) == (0.8, 0.0) and math.isclose(x + w, 1.0) and math.isclose(h, 1.0)


def test_rotacion_invalida_y_recorte_minusculo():
    assert ft.normalizar_ajustes({"rotar": 45, "recorte": [0.1, 0.1, 0.001, 0.5]}) == {}


def test_clave_cambia_con_los_ajustes():
    assert ft.clave_ajustes({"rotar": 90}) != ft.clave_ajustes({"rotar": 180})
    assert ft.clave_ajustes({"brillo": 1.2, "rotar": 90}) == ft.clave_ajustes({"rotar": 90, "brillo": 1.2})


# --- Geometría ---------------------------------------------------------------------------------


def test_escala_enderezar():
    assert ft.escala_enderezar(3000, 2000, 0) == 1.0
    e = ft.escala_enderezar(3000, 2000, 5)
    assert 0.85 < e < 1.0
    # Simétrica: enderezar a la izquierda pierde lo mismo que a la derecha.
    assert math.isclose(e, ft.escala_enderezar(3000, 2000, -5))
    # Un cuadrado girado 45° conserva 1/√2 del lado.
    assert math.isclose(ft.escala_enderezar(100, 100, 45), 1 / math.sqrt(2), rel_tol=1e-9)


def test_encuadre_y_proporcion():
    assert ft.encuadre(3000, 2000, {"rotar": 90}) == (2000, 3000)
    w, h = ft.encuadre(3000, 2000, {"recorte": [0, 0, 0.5, 0.5]})
    assert (w, h) == (1500, 1000)
    # Enderezar conserva la proporción.
    assert math.isclose(ft.proporcion(3000, 2000, {"enderezar": 7}), 1.5, rel_tol=1e-3)
    assert ft.proporcion(3000, 2000, {"rotar": 270}) == round(2000 / 3000, 4)


def test_caja_recorte_dentro_de_la_imagen():
    assert ft.caja_recorte(1000, 500, [0.1, 0.2, 0.5, 0.6]) == (100, 100, 600, 400)
    izq, arr, der, aba = ft.caja_recorte(10, 10, [0.99, 0.99, 0.01, 0.01])
    assert 0 <= izq < der <= 10 and 0 <= arr < aba <= 10


def test_caja_proporcion_centrada():
    # 3:2 desde un 4:3 horizontal: recorta arriba y abajo.
    assert ft.caja_proporcion(4000, 3000, 1.5) == (0, 166, 4000, 166 + 2667)
    # 9:16 desde un horizontal: franja central.
    izq, arr, der, aba = ft.caja_proporcion(1920, 1080, 9 / 16)
    assert (arr, aba) == (0, 1080) and math.isclose((der - izq) / 1080, 9 / 16, rel_tol=0.01)
    assert izq == (1920 - (der - izq)) // 2


# --- EXIF --------------------------------------------------------------------------------------


def test_fecha_exif():
    f = ft.fecha_exif("2026:09:14 10:32:05")
    assert (f.year, f.month, f.day, f.hour, f.minute) == (2026, 9, 14, 10, 32)
    assert f.tzinfo is not None
    con_desfase = ft.fecha_exif("2026:09:14 10:32:05", "-05:00")
    assert con_desfase.utcoffset().total_seconds() == -5 * 3600
    assert ft.fecha_exif("0000:00:00 00:00:00") is None
    assert ft.fecha_exif("1970:01:01 00:00:00") is None
    assert ft.fecha_exif("") is None
    assert ft.fecha_exif("ayer") is None


def test_gps_decimal():
    assert ft.gps_decimal(((12, 1), (3, 1), (3050, 100)), "S") == round(-(12 + 3 / 60 + 30.5 / 3600), 7)
    assert ft.gps_decimal((77.0, 2.0, 0.0), "W") == round(-(77 + 2 / 60), 7)
    assert ft.gps_decimal((1, 2), "N") is None


# --- Listas, vínculos y filtros -----------------------------------------------------------------


def test_normalizar_lista():
    assert ft.normalizar_lista([" Huanta ", "huanta", "", "Pleno  del  Congreso", None]) == ["Huanta", "Pleno del Congreso"]


def test_vinculos():
    assert ft.parsear_vinculo("semana:3") == ("semana", 3)
    assert ft.parsear_vinculo("proyecto") == ("proyecto", None)
    assert ft.parsear_vinculo("otra:3") is None
    assert ft.parsear_vinculo("semana:x") is None
    v = ft.con_vinculo([], {"tipo": "semana", "id": 2, "codigo": "F-001", "etiqueta": "SR-02"})
    v = ft.con_vinculo(v, {"tipo": "semana", "id": 2, "codigo": "F-004", "etiqueta": None})
    assert v == [{"tipo": "semana", "id": 2, "codigo": "F-004", "etiqueta": "SR-02"}]
    assert len(ft.con_vinculo(v, {"tipo": "proyecto", "id": 2})) == 2


def test_leer_filtros_ignora_lo_invalido():
    f = ft.leer_filtros(album="ninguno", estado="borrada", desde="2026-13-01", hasta="2026-10-06",
                        mes="2026-9", vinculo="semana:4")
    assert f.album == 0 and f.estado == "" and f.desde is None and f.hasta == date(2026, 10, 6)
    assert f.mes == "" and f.vinculo == ("semana", 4)
    assert ft.leer_filtros(album="12").album == 12


def _sql(f: ft.Filtros) -> str:
    """El SQL y sus parámetros (JSONB no admite valores literales al compilar)."""
    partes = []
    for c in ft.condiciones(f):
        compilado = c.compile(dialect=postgresql.dialect())
        partes.append(f"{compilado} {compilado.params!r}")
    return " ".join(partes)


def test_condiciones():
    base = _sql(ft.Filtros())
    assert "eliminada_en IS NULL" in base
    assert "eliminada_en IS NOT NULL" in _sql(ft.Filtros(papelera=True))
    texto = _sql(ft.Filtros(q="Visita HUÁNUCO"))
    # Cada palabra, sin tildes y en minúsculas, debe aparecer en el texto de la foto.
    assert "%visita%" in texto and "%huanuco%" in texto and "translate" in texto
    assert "album_id IS NULL" in _sql(ft.Filtros(album=0))
    assert "@>" in _sql(ft.Filtros(etiqueta="Pleno"))
    assert "@>" in _sql(ft.Filtros(vinculo=("semana", 3)))
    assert "to_char" in _sql(ft.Filtros(mes="2026-09"))
    # Los comodines de LIKE escritos por la persona no se interpretan.
    assert "%100%" in _sql(ft.Filtros(q="100%"))


# --- Alta y derivados con Pillow (sin base) ------------------------------------------------------


@pytest.fixture
def fototeca_tmp(tmp_path, monkeypatch):
    pytest.importorskip("PIL")
    monkeypatch.setattr(config, "fototeca_dir", str(tmp_path / "fototeca"))
    return tmp_path


def _foto_con_exif(ruta, tamano=(600, 400), orientacion=6):
    from PIL import Image
    from PIL.ExifTags import IFD

    img = Image.new("RGB", tamano, (120, 30, 40))
    exif = Image.Exif()
    exif[271] = "Canon"
    exif[272] = "Canon EOS R6"
    exif[274] = orientacion  # 6 = girar 90° horario al mostrar
    exif.get_ifd(IFD.Exif)[36867] = "2026:09:14 10:32:05"
    exif.get_ifd(IFD.GPSInfo).update({1: "S", 2: (12.0, 3.0, 30.5), 3: "W", 4: (75.0, 12.0, 0.0)})
    img.save(ruta, "JPEG", exif=exif)


def test_leer_archivo_y_derivados(fototeca_tmp):
    ruta = fototeca_tmp / "IMG_0001.JPG"
    _foto_con_exif(ruta)
    leido = ft.leer_archivo(ruta)
    # Medidas ya giradas por la orientación EXIF.
    assert (leido.ancho, leido.alto) == (400, 600)
    assert leido.extension == ".jpg" and leido.camara == "Canon EOS R6"
    assert leido.tomada_en.year == 2026 and leido.lat < 0 and leido.lon < 0
    rel = ft.guardar_original(ruta, leido, mover=False)
    assert rel.startswith(f"originales/{leido.sha256[:2]}/") and ruta.is_file()

    mini = ft.derivado(rel, leido.sha256, {"rotar": 90}, "miniatura")
    from PIL import Image

    with Image.open(mini) as m:
        assert m.size == (400, 267)  # 600×400 tras girar, reducida a 400 de lado mayor
    # Exportar a 1:1 recorta al centro y no agranda.
    cuad = ft.exportar(rel, leido.sha256, {}, "cuadrada")
    with Image.open(cuad) as c:
        assert c.size == (400, 400)
    # El original no cambió.
    assert ft.huella(ft.ruta_original(rel))[0] == leido.sha256


def test_aplicar_ajustes_geometria(fototeca_tmp):
    from PIL import Image

    img = Image.new("RGB", (300, 200), (200, 200, 200))
    salida = ft.aplicar_ajustes(img, {"rotar": 90, "recorte": [0, 0, 0.5, 0.5]})
    assert salida.size == (100, 150)
    w, h = ft.encuadre(300, 200, {"enderezar": 10})
    girada = ft.aplicar_ajustes(img, {"enderezar": 10})
    assert abs(girada.width - w) <= 2 and abs(girada.height - h) <= 2

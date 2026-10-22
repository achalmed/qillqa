"""backend/tests/test_estudio_mediateca.py — el puente de los editores con la Mediateca (antes test_prensa.py, 2026-10-06; E5,
2026-10-21: el proxy /estudio/ y su cookie se retiraron): la ruta segura, los nombres en el banco, los listados, las piezas
y la caché, sin base ni servidor."""
import base64
import json
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import pytest  # noqa: E402

from ruray import mediateca as pr  # noqa: E402
from ruray.comun import ruta_segura  # noqa: E402


# --- Ruta segura -----------------------------------------------------------------------------


@pytest.mark.parametrize("ruta", ["media.html", "editor.html", "", "api/health", "banco/fototeca/ft-1-0.jpg",
                                  "banco/sub carpeta/foto%20a.jpg", "redes/instagram/2026-10-06-pieza.png"])
def test_rutas_validas(ruta):
    assert ruta_segura(ruta) is not None


@pytest.mark.parametrize("ruta", ["../servidor/config.py", "banco/../../etc/passwd", "banco/%2e%2e/x",
                                  "banco/%252e%252e/x".replace("%25", "%"), "/etc/passwd", "banco\\..\\x",
                                  "a//b", "banco/./x", "x\x00y", "%2fetc/passwd"])
def test_rutas_que_salen_se_rechazan(ruta):
    assert ruta_segura(ruta) is None


# --- Puente con la Fototeca --------------------------------------------------------------------


def test_nombre_del_derivado_va_y_vuelve():
    assert pr.nombre_derivado(12, "0") == "ft-12-0.jpg"
    assert pr.leer_nombre("ft-12-abc123def456.jpg") == (12, "abc123def456")
    for malo in ("ft-12.jpg", "ft-x-0.jpg", "ft-1-0.png", "../ft-1-0.jpg", "ft-1-0.jpg/x", "foto.jpg"):
        assert pr.leer_nombre(malo) is None


def test_foto_de_url():
    assert pr.foto_de_url("/estudio/banco/fototeca/ft-9-0.jpg") == 9
    assert pr.foto_de_url("/banco/fototeca/ft-9-0.jpg?v=1") == 9
    assert pr.foto_de_url("/estudio/banco/subidas-editor/ft-9-0.jpg") is None
    assert pr.foto_de_url("") is None


def _foto(**k):
    return {**dict(id=5, titulo="", nombre_original="IMG_0001.JPG", album="", version="0"), **k}


def test_item_de_la_fototeca_para_el_editor():
    it = pr.item_foto(_foto(titulo="Visita a Huanta", album="Prensa"), "/api/fotos")
    assert it["url"] == "/api/fotos/banco/fototeca/ft-5-0.jpg"
    assert it["name"].startswith("Fototeca / Prensa / Visita a Huanta")
    assert it["carpeta"] == "Fototeca"
    assert pr.item_foto(_foto(), "/api/fotos")["name"] == "Fototeca / Sin álbum / IMG_0001 (n.º 5)"


def test_fusionar_pone_la_fototeca_primero_y_quita_copias():
    fototeca = [{"url": "/estudio/banco/fototeca/ft-5-0.jpg"}]
    banco = [{"url": "/estudio/banco/fototeca/ft-5-viejo.jpg"}, {"url": "/estudio/banco/a.jpg"}]
    assert pr.fusionar(banco, fototeca) == fototeca + [{"url": "/estudio/banco/a.jpg"}]
    media = pr.fusionar({"imagenes": banco, "videos": [{"url": "v.mp4"}]}, fototeca)
    assert media["imagenes"] == fototeca + [{"url": "/estudio/banco/a.jpg"}] and media["videos"] == [{"url": "v.mp4"}]
    assert pr.fusionar({"ok": False}, fototeca) == {"ok": False}


def test_dataurl_de_una_pieza():
    datos = b"\x89PNG\r\n\x1a\nresto"
    img, ext = pr.decodificar_dataurl("data:image/png;base64," + base64.b64encode(datos).decode())
    assert (img, ext) == (datos, ".png")
    assert pr.decodificar_dataurl("data:image/jpeg;base64,AAAA")[1] == ".jpg"
    for malo in ("", "sin coma", "data:text/html;base64,PGgxPg==", "data:image/png;base64,"):
        with pytest.raises(pr.ErrorPrensa):
            pr.decodificar_dataurl(malo)


def test_materializar_es_idempotente(tmp_path, monkeypatch):
    from rikchay import fototeca as ft

    llamadas = []
    origen = tmp_path / "derivado.jpg"
    origen.write_bytes(b"jpg")

    def exportar(archivo, sha, ajustes, preset, formato):
        llamadas.append(preset)
        return origen

    monkeypatch.setattr(ft, "exportar", exportar)
    banco = tmp_path / "banco"
    a = pr.materializar(banco, 3, "originales/ab/x.jpg", "ab" * 32, {})
    b = pr.materializar(banco, 3, "originales/ab/x.jpg", "ab" * 32, {})
    assert a == b == banco / "fototeca" / "ft-3-0.jpg" and a.read_bytes() == b"jpg"
    assert llamadas == [pr.PRESET]
    assert not [p for p in (banco / "fototeca").iterdir() if p.name.startswith(".")]


def test_roles_de_prensa_en_las_cuentas():
    from app.api.admin import ROLES_VALIDOS
    from app.servicios import cuentas

    assert "prensa" in ROLES_VALIDOS
    assert cuentas.rol_de("Prensa", False) == "prensa"
    assert cuentas.rol_de("prensa", True) == "administrador"


def test_datos_de_una_pieza_del_editor():
    assert pr.datos_pieza({"titulo": "  Fiscalización en territorio · 6/10/2026 ",
                           "origenes": ["/estudio/banco/subidas-editor/x.png", "/estudio/banco/fototeca/ft-21-0.jpg"]}) \
        == ("Fiscalización en territorio · 6/10/2026", 21)
    assert pr.datos_pieza({"fotos": [True, 0, 7]}) == ("Pieza de prensa", 7)
    assert pr.datos_pieza({}) == ("Pieza de prensa", None)


# --- Lo de Prensa, solo en la Mediateca (2026-10-20) -------------------------------------------


def test_formato_de_una_pieza_por_su_proporcion():
    assert pr.formato_pieza(1080, 1080) == "post" and pr.formato_pieza(1080, 1350) == "post"
    assert pr.formato_pieza(1080, 1920) == "historia"
    assert pr.formato_pieza(1200, 628) == "portada" and pr.formato_pieza(820, 312) == "portada"
    assert pr.formato_pieza(1920, 1080) == "portada"
    assert pr.formato_pieza(1080, 1920, "video") == "video" and pr.formato_pieza(0, 0) == "post"
    assert set(pr.ETIQUETA_FORMATO) == set(pr.FORMATOS)


def test_red_de_un_canal_del_estudio():
    assert pr.red_de("facebook") == "facebook" and pr.red_de("Facebook") == "facebook"
    assert pr.red_de("estados") == "estados" and pr.REDES["estados"] == "Estados de WhatsApp"
    assert pr.red_de("") == "" and pr.red_de("myspace") == "" and pr.red_de("../x") == "x"


def test_el_nombre_escrito_pasa_a_titulo_y_el_archivo_solo_lleva_fecha():
    assert pr.titulo_de_nombre("2026-08-08-convocatoria-8ago-post.png") == "Convocatoria 8ago post"
    assert pr.titulo_de_nombre("Saludo_día_del_maestro.mp4") == "Saludo día del maestro"
    assert pr.titulo_de_nombre("") == "" and pr.titulo_de_nombre("2026-10-20.png") == ""
    assert pr.nombre_por_hora(datetime(2026, 10, 20, 10, 30, 15), ".mp4") == "103015.mp4"
    assert pr.nombre_por_hora(datetime(2026, 10, 20, 9, 5, 1), "mp4") == "090501.mp4"


def test_metadatos_de_una_pieza():
    m = pr.metadatos_pieza(canal="facebook", medio="foto", ancho=1080, alto=1920, titulo="Convocatoria",
                           foto_origen=12, pieza={"id": 4, "titular": "Visita a la UGEL"})
    assert m["ambito"] == "prensa" and m["categoria"] == "historia"
    assert m["etiquetas"] == ["Pieza de prensa", "Historia", "Facebook"]
    assert m["titulo"] == "Convocatoria"
    assert m["descripcion"] == ("Pieza hecha en el estudio de Prensa para Facebook, con la foto n.º 12 de la Mediateca. "
                                "Para la pieza de prensa «Visita a la UGEL».")
    # Sin nombre escrito, el título es el de la pieza de prensa; sin ella, el formato.
    assert pr.metadatos_pieza(canal="", medio="foto", ancho=1, alto=1, pieza={"id": 4, "titular": "Visita"})["titulo"] == "Visita"
    sola = pr.metadatos_pieza(canal="", medio="video", ancho=1920, alto=1080)
    assert sola["titulo"] == "Video" and sola["etiquetas"] == ["Pieza de prensa", "Video"]
    assert sola["descripcion"] == "Video hecho en el estudio de Prensa."


def test_usos_de_una_pieza():
    assert pr.usos_pieza("facebook", {"id": 4, "titular": "x"}) == ["red:facebook", "pieza:4"]
    assert pr.usos_pieza("", None) == [] and pr.usos_pieza("nada", {"id": "4"}) == []


def test_un_video_anotado_recuerda_su_foto_de_origen_y_su_pieza():
    t = pr.TrabajosDeVideo()
    t.anotar("v1", 3, {"canal": "tiktok", "nombre": "Saludo.mp4", "origen": "/estudio/banco/fototeca/ft-21-0.jpg"},
             proyecto=False, pieza={"id": 5, "titular": "x"})
    t.anotar("v2", 3, {"origen": "/estudio/banco/fototeca/ft-21-0.jpg"}, proyecto=True)
    uno, dos = t.tomar("v1"), t.tomar("v2")
    assert uno["origen"] == 21 and uno["pieza"] == {"id": 5, "titular": "x"} and uno["titulo"] == "Saludo.mp4"
    assert dos["origen"] is None and dos["pieza"] is None


def test_la_descarga_desde_la_mediateca_solo_acepta_nombres_por_fecha():
    assert pr.ruta_mediateca("mediateca/2026/20261020_103015.png") == "2026/20261020_103015.png"
    assert pr.ruta_mediateca("mediateca/2026/20261020_103015_2.mp4") == "2026/20261020_103015_2.mp4"
    assert pr.ruta_mediateca("mediateca/marca/logo/x.png") is None
    assert pr.ruta_mediateca("mediateca/cache/prensa/salida/a.png") is None
    assert pr.ruta_mediateca("mediateca/2026/../secreto.png") is None
    assert pr.ruta_mediateca("banco/2026/20261020_103015.png") is None
    assert pr.url_mediateca("2026/20261020_103015.png", "/api/fotos") == "/api/fotos/mediateca/2026/20261020_103015.png"


def test_la_cache_de_prensa_vence_sola(tmp_path):
    base = tmp_path / "cache" / "prensa"
    vieja = base / "salida" / "redes" / "facebook" / "2026-10-01-101010.mp4"
    nueva = base / "salida" / "redes" / "facebook" / "2026-10-20-101010.mp4"
    mejorada = base / "trabajo" / "mejoradas" / "mej_ab.jpg"
    reciente = base / "trabajo" / "tmp" / "miniaturas" / "x.jpg"
    ajena = tmp_path / "cache" / "miniatura" / "ab.jpg"   # la caché de la Mediateca no es de Prensa
    for f in (vieja, nueva, mejorada, reciente, ajena):
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(b"x")
    ahora = 2_000_000_000.0
    os.utime(vieja, (ahora - 3 * 86400, ahora - 3 * 86400))
    os.utime(nueva, (ahora - 3600, ahora - 3600))
    os.utime(mejorada, (ahora - 15 * 86400, ahora - 15 * 86400))
    os.utime(reciente, (ahora - 3 * 86400, ahora - 3 * 86400))
    os.utime(ajena, (ahora - 90 * 86400, ahora - 90 * 86400))
    v = pr.vencidos(tmp_path, ahora)
    assert [p.name for p in v["salida"]] == [vieja.name] and [p.name for p in v["trabajo"]] == [mejorada.name]
    assert pr.vencidos(tmp_path / "no-existe", ahora) == {"salida": [], "trabajo": []}


def test_el_canal_de_lo_que_quedo_en_la_salida(tmp_path):
    salida = tmp_path / "cache" / "prensa" / "salida"
    assert pr.canal_de_salida(tmp_path, salida / "redes" / "facebook" / "a.mp4") == "facebook"
    assert pr.canal_de_salida(tmp_path, salida / "transmisiones" / "a.mp4") == "transmisiones"
    assert pr.canal_de_salida(tmp_path, salida / "redes" / "a.mp4") == ""
    assert pr.canal_de_salida(tmp_path, tmp_path / "otra" / "a.mp4") == ""


def test_medios_v2_no_tiene_modelos_ni_funciones_con_sesion():
    """«medios.v2» (2026-10-21): quien la usa pide operaciones; la Mediateca abre su sesión."""
    from rikchay.contrato import V1, V2

    for nombre in ("Foto", "AlbumFoto", "Uso", "Version", "registrar", "version_editada", "con_vinculo"):
        with pytest.raises(AttributeError):
            getattr(V2, nombre)
    for nombre in ("registrar_archivo", "fotos_vigentes", "llevar_a", "vincular", "huella_de_archivo", "album",
                   "fotos_para_editor", "ingresar", "derivado", "ruta_original", "estado_hacia_semana"):
        assert callable(getattr(V2, nombre)), nombre
    assert V1.Foto is not None   # la v1 sigue ofrecida, sin uso, hasta extraer la Mediateca

"""backend/tests/test_prensa.py — Prensa (2026-10-06): la cookie del estudio, la ruta segura del
proxy /estudio/ y el puente con la Fototeca (nombres, listados, piezas), sin base ni estudio."""
import base64
import json
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import jwt  # noqa: E402
import pytest  # noqa: E402

from app.config import config  # noqa: E402
from app.servicios import prensa as pr  # noqa: E402


# --- Cookie del estudio ----------------------------------------------------------------------


def test_cookie_firmada_se_lee():
    valor, vence = pr.firmar_sesion(7, "prensa")
    carga = pr.leer_sesion(valor)
    assert carga["sub"] == "7" and carga["rol"] == "prensa"
    assert vence - datetime.now(timezone.utc) <= timedelta(minutes=pr.MINUTOS_SESION)


def test_cookie_vencida_o_alterada_no_sirve():
    viejo, _ = pr.firmar_sesion(7, "prensa", ahora=datetime.now(timezone.utc) - timedelta(days=1))
    assert pr.leer_sesion(viejo) is None
    valor, _ = pr.firmar_sesion(7, "prensa")
    assert pr.leer_sesion(valor[:-2] + ("AA" if not valor.endswith("AA") else "BB")) is None
    assert pr.leer_sesion("") is None and pr.leer_sesion(None) is None


def test_cookie_firmada_con_otro_secreto_no_sirve():
    otro = jwt.encode({"sub": "1", "rol": "prensa", "aud": pr.AUDIENCIA,
                       "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, "otro-secreto", algorithm="HS256")
    assert pr.leer_sesion(otro) is None


def test_token_de_la_web_no_es_cookie_del_estudio():
    """El token de la API no lleva audiencia: no abre el estudio (ni al revés)."""
    web = jwt.encode({"sub": "1", "rol": "administrador", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                     config.jwt_secret, algorithm="HS256")
    assert pr.leer_sesion(web) is None


def test_todo_el_equipo_entra_salvo_invitado():
    # Los módulos no se asignan por rol (2026-10-06); el invitado solo consulta.
    valor, _ = pr.firmar_sesion(3, "secretaria")
    assert pr.leer_sesion(valor) is not None
    valor, _ = pr.firmar_sesion(4, "invitado")
    assert pr.leer_sesion(valor) is None
    for rol in ("prensa", "diputado", "administrador"):
        assert pr.leer_sesion(pr.firmar_sesion(1, rol)[0]) is not None


# --- Ruta segura -----------------------------------------------------------------------------


@pytest.mark.parametrize("ruta", ["media.html", "editor.html", "", "api/health", "banco/fototeca/ft-1-0.jpg",
                                  "banco/sub carpeta/foto%20a.jpg", "redes/instagram/2026-10-06-pieza.png"])
def test_rutas_validas(ruta):
    assert pr.ruta_segura(ruta) is not None


@pytest.mark.parametrize("ruta", ["../servidor/config.py", "banco/../../etc/passwd", "banco/%2e%2e/x",
                                  "banco/%252e%252e/x".replace("%25", "%"), "/etc/passwd", "banco\\..\\x",
                                  "a//b", "banco/./x", "x\x00y", "%2fetc/passwd"])
def test_rutas_que_salen_se_rechazan(ruta):
    assert pr.ruta_segura(ruta) is None


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
    base = dict(id=5, titulo="", nombre_original="IMG_0001.JPG", ajustes={})
    return SimpleNamespace(**{**base, **k})


def test_item_de_la_fototeca_para_el_estudio():
    it = pr.item_foto(_foto(titulo="Visita a Huanta"), "Prensa")
    assert it["url"] == "/estudio/banco/fototeca/ft-5-0.jpg"
    assert it["name"].startswith("Fototeca / Prensa / Visita a Huanta")
    assert it["carpeta"] == "Fototeca"
    assert pr.item_foto(_foto())["name"] == "Fototeca / Sin álbum / IMG_0001 (n.º 5)"


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


def test_banco_del_estudio_sale_del_perfil(tmp_path, monkeypatch):
    perfil = tmp_path / "perfil.json"
    perfil.write_text(json.dumps({"rutas": {"banco": str(tmp_path / "banco")}}), encoding="utf-8")
    monkeypatch.setattr(config, "estudio_banco", "")
    monkeypatch.setattr(config, "identidad_perfil", str(perfil))
    assert pr.banco_estudio() == tmp_path / "banco"
    monkeypatch.setattr(config, "estudio_banco", str(tmp_path / "otro"))
    assert pr.banco_estudio() == tmp_path / "otro"
    monkeypatch.setattr(config, "estudio_banco", "")
    monkeypatch.setattr(config, "identidad_perfil", "")
    assert pr.banco_estudio() is None


def test_materializar_es_idempotente(tmp_path, monkeypatch):
    from app.servicios import fototeca as ft

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
    assert pr.nombre_pieza("Fiscalización en territorio · 6/10/2026", ".png") == "fiscalizacion-en-territorio-6-10-2026.png"
    assert pr.nombre_pieza("¡¡!!", ".jpg") == "pieza.jpg"

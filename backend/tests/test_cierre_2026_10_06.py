"""backend/tests/test_cierre_2026_10_06.py — cierre de los pendientes del 2026-10-06
(vigencia y automatización; docs/decisiones.md §Pendientes). Pruebas sin PostgreSQL:

  · eliminar un documento o un proyecto limpia sus filas de `relaciones` (plan);
  · eliminar un heredado no deja adjuntos huérfanos en `adjuntos/`;
  · el indicador del expediente en lote (regla sin manifiesto) y la huella con filas ya leídas;
  · el formato predeterminado del tipo se copia al crear: no cambia lo ya creado;
  · videos en la Fototeca (ffprobe, póster, filtros, enlace firmado) y su llegada desde Prensa;
  · `enviar_archivo` con Range (solo para videos).

Uso: cd backend && .venv/bin/python -m pytest -q tests/test_cierre_2026_10_06.py
"""
import asyncio
import json
import os
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import pytest  # noqa: E402

from rikchay.config import config  # noqa: E402  (la configuración propia de la Mediateca, fase 10.2b)
from qillqasqa.servicios import eliminacion  # noqa: E402
from rikchay import fototeca as ft  # noqa: E402
from ruray import mediateca as pr  # noqa: E402
from qillqasqa.servicios import vigencia as v  # noqa: E402

RAIZ_APP = Path(__file__).resolve().parents[1] / "app"
# Gestión documental y Proyectos de ley, en su repositorio desde el 2026-10-22 (Qillqasqa): su código se lee del paquete.
RAIZ_QILLQASQA = Path(__import__("qillqasqa").__file__).resolve().parent


# --- 1. Relaciones de lo que se elimina ------------------------------------------------------


def test_plan_limpieza_relaciones():
    filas = [
        (1, "doc:5", "norma:ley-27795", "editor"),   # lo que citaba su texto
        (2, "doc:5", "sr:2", "auto"),                # lo que el sistema le asoció
        (3, "doc:9", "doc:5", "editor"),             # otro documento lo cita en su texto
        (4, "doc:9", "doc:5", "auto"),               # asociación automática hacia él
        (5, "pl:3", "doc:5", "manual"),              # relación manual de otro
        (6, "sr:2", "doc:5", "texto"),               # cita en un texto plano de la semana
        (7, "doc:9", "doc:50", "editor"),            # otra cosa: no se toca
    ]
    borrar, marcar = eliminacion.plan_limpieza(filas, "doc:5")
    assert sorted(borrar) == [1, 2, 4]
    assert sorted(marcar) == [3, 5, 6]


def test_plan_limpieza_proyecto():
    filas = [(1, "pl:3", "norma:x", "editor"), (2, "doc:4", "pl:3", "editor"), (3, "doc:4", "pl:30", "editor")]
    assert eliminacion.plan_limpieza(filas, "pl:3") == ([1], [2])


def test_el_mapa_no_dibuja_lo_marcado():
    fuente = (RAIZ_APP / "servicios" / "grafo.py").read_text(encoding="utf-8")
    assert 'datos.get("destino_eliminado")' in fuente
    # Y la limpieza la llaman las dos puertas: eliminar un documento y retirar un proyecto.
    assert "limpiar_relaciones(sesion, f\"doc:{doc_id}\"" in (RAIZ_QILLQASQA / "servicios" / "eliminacion.py").read_text(encoding="utf-8")
    assert "limpiar_relaciones(sesion, f\"pl:{p.id}\"" in (RAIZ_QILLQASQA / "api" / "proyectos.py").read_text(encoding="utf-8")


# --- 5. Heredado eliminado: nada queda huérfano en adjuntos/ -----------------------------------


def test_heredado_eliminado_aparta_los_demas_adjuntos(tmp_path):
    doc = tmp_path / "OF-0012"
    adj = doc / "adjuntos"
    (adj / "anulados").mkdir(parents=True)
    (doc / "expediente").mkdir()
    (doc / "expediente" / "EXP-OF-0012.pdf").write_bytes(b"%PDF")
    (doc / "oficio.tex").write_text("\\documentclass{x}")
    for nombre in ("FIRM-OF-0012-2026-2027_Asunto.pdf", "CR-OF-0012-2026-2027_Ugel.pdf",
                   "ADJ-OF-0012-2026-2027_Informe.pdf", "foto-local.jpg"):
        (adj / nombre).write_bytes(b"x")
    (adj / "anulados" / "FIRM-OF-0012-2026-2027_Viejo.pdf").write_bytes(b"x")
    filas = [SimpleNamespace(nombre_archivo="ADJ-OF-0012-2026-2027_Informe.pdf", etiqueta="Informe técnico",
                             nombre_original="informe.pdf", categoria="")]

    r = eliminacion._devolver_al_original(doc, filas, "OF-0012-2026-2027")

    # Lo reconocible vuelve a la raíz; el expediente se rehace; adjuntos/ desaparece.
    assert sorted(r["devueltos"]) == ["CR-OF-0012-2026-2027_Ugel.pdf", "FIRM-OF-0012-2026-2027_Asunto.pdf"]
    assert (doc / "FIRM-OF-0012-2026-2027_Asunto.pdf").is_file()
    assert not (doc / "expediente").exists() and not adj.exists()
    # Lo demás, apartado con su ficha; nada se borra.
    apartado = doc / eliminacion.CARPETA_DESVINCULADOS / r["carpeta"]
    assert (apartado / "ADJ-OF-0012-2026-2027_Informe.pdf").is_file()
    assert (apartado / "anulados" / "FIRM-OF-0012-2026-2027_Viejo.pdf").is_file()
    ficha = json.loads((apartado / "adjuntos.json").read_text(encoding="utf-8"))
    por_archivo = {x["archivo"]: x for x in ficha["archivos"]}
    assert por_archivo["ADJ-OF-0012-2026-2027_Informe.pdf"]["etiqueta"] == "Informe técnico"
    assert por_archivo["anulados/FIRM-OF-0012-2026-2027_Viejo.pdf"]["categoria"] == "anulado"
    assert ficha["documento"] == "OF-0012-2026-2027"
    assert (doc / "oficio.tex").is_file()


def test_heredado_sin_otros_adjuntos_no_crea_apartado(tmp_path):
    doc = tmp_path / "OF-0013"
    (doc / "adjuntos").mkdir(parents=True)
    (doc / "adjuntos" / "FIRM-OF-0013.pdf").write_bytes(b"x")
    r = eliminacion._devolver_al_original(doc, [], "")
    assert r["carpeta"] is None and not (doc / eliminacion.CARPETA_DESVINCULADOS).exists()
    assert not (doc / "adjuntos").exists()


# --- 3. Expediente en lote ---------------------------------------------------------------------


def _adj(i, categoria="", etiqueta="", nombre=None, es_anexo=False, sha=None):
    return SimpleNamespace(id=i, categoria=categoria, etiqueta=etiqueta, nombre_original=nombre or f"a{i}.pdf",
                           nombre_archivo=nombre or f"a{i}.pdf", es_anexo=es_anexo, sha256=sha, documento_id=1)


def test_expediente_sin_manifiesto_por_nombre_y_fecha(tmp_path):
    pdf = tmp_path / "EXP-OF-1.pdf"
    pdf.write_bytes(b"%PDF")
    viejo = pdf.stat().st_mtime - 100
    os.utime(pdf, (viejo, viejo))
    dir_adj = tmp_path / "adjuntos"
    dir_adj.mkdir()
    (dir_adj / "a1.pdf").write_bytes(b"x")
    filas = [_adj(1)]
    assert v.vigencia_sin_manifiesto(pdf, False, False, filas, dir_adj) == ["se subió un archivo después de armarlo"]
    assert v.vigencia_sin_manifiesto(pdf, True, False, [], dir_adj) == ["la firma fue anulada o se quitó el documento firmado"]
    os.utime(pdf, None)
    assert v.vigencia_sin_manifiesto(pdf, False, False, filas, dir_adj) == []


def test_huella_con_filas_igual_que_sin_ellas():
    """La bandeja calcula con los adjuntos ya leídos: misma huella que el cálculo de siempre."""
    doc = SimpleNamespace(id=1, origen="qillqa", tipo="oficio", numero=7, periodo="2026-2027",
                          campos={"asunto": "A", "anexo": "Lo indicado"}, cuerpo={"type": "doc"})
    filas = [_adj(2, etiqueta="Informe"), _adj(1, etiqueta="Acta"), _adj(3, categoria="firmado"),
             _adj(4, categoria="recepcion")]
    esperada = v.huella_contenido(tipo="oficio", numero=7, periodo="2026-2027", campos=doc.campos,
                                  cuerpo=doc.cuerpo, adjuntos=["Lo indicado", "Acta", "Informe"], imagenes=[])
    assert asyncio.run(v.huella_impresa(None, doc, filas)) == esperada


def test_endpoint_en_lote_fuera_de_documentos():
    """`/api/documentos/expedientes` lo tomaría la ruta /{documento_id}: va en su propio prefijo."""
    from app.main import app

    rutas = {r.path for r in app.routes}
    assert "/api/expedientes/vigencia" in rutas


# --- 4. Formato predeterminado: se copia al crear ----------------------------------------------


def test_predeterminado_solo_al_crear():
    """El predeterminado del tipo (`ajustes`) se copia a los campos al CREAR; ningún otro
    camino (compilar, generar, la huella) lo consulta. Cambiarlo no toca lo ya creado:
    ni su PDF ni su huella, firmado o no."""
    usos = []
    for raiz in (RAIZ_APP, RAIZ_QILLQASQA):
        for ruta in raiz.rglob("*.py"):
            if "formato_defecto(" in ruta.read_text(encoding="utf-8"):
                usos.append(ruta.relative_to(raiz).as_posix())
    assert sorted(usos) == ["api/ajustes.py", "api/documentos.py"]
    documentos = (RAIZ_QILLQASQA / "api" / "documentos.py").read_text(encoding="utf-8")
    assert documentos.count("formato_defecto(") == 1
    generador = (RAIZ_QILLQASQA / "latex" / "generador.py").read_text(encoding="utf-8")
    assert "formato_defecto" not in generador and "fmt_defecto" not in generador


def test_el_formato_cuenta_en_la_huella():
    base = dict(tipo="oficio", numero=1, periodo="2026-2027", cuerpo={}, adjuntos=[], imagenes=[])
    a = v.huella_contenido(campos={"asunto": "x"}, **base)
    b = v.huella_contenido(campos={"asunto": "x", "fmt_interlineado": "1.15"}, **base)
    assert a != b


# --- 6. Videos en la Fototeca -----------------------------------------------------------------


def test_extensiones_y_filtro_medio():
    assert ft.es_video("clip.MOV") and ft.es_video("originales/ab/abc.mp4") and not ft.es_video("foto.jpg")
    assert ft.admitido("x.webm") and ft.admitido("x.heic") and not ft.admitido("x.pdf")
    assert ft.leer_filtros(medio="video").medio == "video"
    assert ft.leer_filtros(medio="otro").medio == ""


def test_datos_ffprobe_del_celular():
    info = {
        "streams": [
            {"codec_type": "video", "codec_name": "hevc", "width": 1920, "height": 1080, "avg_frame_rate": "30000/1001",
             "side_data_list": [{"rotation": -90}]},
            {"codec_type": "audio", "codec_name": "aac"},
        ],
        "format": {"duration": "12.512", "tags": {
            "com.apple.quicktime.creationdate": "2026-09-14T10:32:05-0500",
            "com.apple.quicktime.make": "Apple", "com.apple.quicktime.model": "iPhone 13",
            "com.apple.quicktime.location.ISO6709": "-13.1588-074.2232+2761.000/",
        }},
    }
    d = ft.datos_ffprobe(info)
    assert (d["ancho"], d["alto"]) == (1080, 1920)  # girado
    assert d["duracion"] == 12.512
    assert d["fecha"].isoformat() == "2026-09-14T10:32:05-05:00"
    assert d["camara"] == "Apple iPhone 13"
    assert (d["lat"], d["lon"]) == (-13.1588, -74.2232)
    assert d["ficha"]["cuadros"] == "29.97 fps" and d["ficha"]["audio"] == "aac"


def test_datos_ffprobe_sin_video_falla():
    with pytest.raises(ft.ErrorFototeca):
        ft.datos_ffprobe({"streams": [{"codec_type": "audio"}], "format": {}})


def test_fechas_y_ubicacion_de_video():
    assert ft.fecha_video("2026-09-14T15:32:05.000000Z").utcoffset() == timedelta(0)
    assert ft.fecha_video("1970-01-01T00:00:00Z") is None
    assert ft.iso6709("+00.0000+000.0000/") is None
    assert ft.momento_poster(None) == 0 and ft.momento_poster(4) == 0.4 and ft.momento_poster(60) == 1.0


def test_un_video_no_se_exporta_ni_se_edita():
    with pytest.raises(ft.ErrorFototeca):
        ft.exportar("originales/ab/abc.mp4", "abc", {}, "original")
    with pytest.raises(ft.ErrorFototeca):
        ft.sugerir_ajustes("originales/ab/abc.mp4", "abc")


@pytest.fixture
def video_tmp(tmp_path, monkeypatch):
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        pytest.skip("sin ffmpeg")
    pytest.importorskip("PIL")
    monkeypatch.setattr(config, "mediateca_dir", str(tmp_path / "fototeca"))
    ruta = tmp_path / "clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=2",
                    "-pix_fmt", "yuv420p", str(ruta)], check=True, timeout=60)
    return ruta


def test_video_leer_poster_y_miniatura(video_tmp):
    leido = ft.leer_video(video_tmp)
    assert leido.medio == "video" and leido.extension == ".mp4"
    assert (leido.ancho, leido.alto) == (320, 180) and 1.5 < leido.duracion < 2.5
    rel = ft.guardar_original(video_tmp, leido, mover=False)
    assert rel.endswith(".mp4")
    p = ft.poster(rel, leido.sha256)
    assert p.is_file() and p.suffix == ".jpg"
    mini = ft.derivado(rel, leido.sha256, {"rotar": 90}, "miniatura")  # los ajustes no aplican a un video
    from PIL import Image

    with Image.open(mini) as m:
        assert m.size == (320, 180)


def test_enlace_firmado_del_video(monkeypatch):
    from rikchay import api as api_ft
    from tullpu.api import EDITOR
    from ruray import comun as estudio_comun

    firma = api_ft.firmar_video(12)
    assert api_ft.leer_firma_video(firma) == 12
    assert api_ft.leer_firma_video(firma + "x") is None
    vencida = api_ft.firmar_video(12, datetime.now(timezone.utc) - timedelta(hours=api_ft.HORAS_ENLACE + 1))
    assert api_ft.leer_firma_video(vencida) is None
    # La cookie de un editor (otra audiencia; E5: la del estudio aparte se retiró) no abre videos.
    monkeypatch.setattr(estudio_comun.config, "jwt_secret", "s" * 48)
    assert api_ft.leer_firma_video(estudio_comun.firmar_sesion(EDITOR, 12, "prensa")[0]) is None


def test_videos_de_prensa_a_la_fototeca():
    assert pr.metadatos_pieza(canal="Facebook", medio="video", ancho=1080, alto=1920)["descripcion"] \
        == "Video hecho en el estudio de Prensa para Facebook."
    t = pr.TrabajosDeVideo()
    t.anotar("ab12", 3, {"canal": "facebook", "nombre": "Saludo.mp4"}, proyecto=False)
    assert "ab12" in t
    datos = t.tomar("ab12")
    assert datos["usuario_id"] == 3 and datos["titulo"] == "Saludo.mp4"
    assert t.tomar("ab12") is None  # una sola vez
    t.anotar("viejo", 1, {}, False, ahora=datetime.now(timezone.utc) - timedelta(hours=pr.HORAS_TRABAJO + 1))
    t.anotar("nuevo", 1, {}, False)
    assert "viejo" not in t and "nuevo" in t


# --- Range (solo videos) -----------------------------------------------------------------------


def test_rango_pedido():
    from app.api.archivos import rango_pedido

    assert rango_pedido("bytes=0-", 1000) == (0, 999)
    assert rango_pedido("bytes=100-199", 1000) == (100, 199)
    assert rango_pedido("bytes=900-5000", 1000) == (900, 999)
    assert rango_pedido("bytes=-100", 1000) == (900, 999)
    assert rango_pedido("bytes=2000-", 1000) == (1000, 999)
    assert rango_pedido("bytes=5-1", 1000) is None
    assert rango_pedido("bytes=0-1,5-9", 1000) is None
    assert rango_pedido(None, 1000) is None


def test_enviar_archivo_con_rango(tmp_path):
    from starlette.requests import Request

    from app.api.archivos import enviar_archivo

    ruta = tmp_path / "v.mp4"
    ruta.write_bytes(bytes(range(256)) * 4)

    def pedir(rango):
        return Request({"type": "http", "method": "GET", "path": "/", "headers": [(b"range", rango.encode())]})

    r = enviar_archivo(ruta, "v.mp4", "video/mp4", pedir("bytes=10-19"), rangos=True)
    assert r.status_code == 206 and r.headers["content-range"] == "bytes 10-19/1024"
    assert r.headers["content-length"] == "10" and r.headers["accept-ranges"] == "bytes"
    cuerpo = b"".join(asyncio.run(_juntar(r.body_iterator)))
    assert cuerpo == bytes(range(10, 20))
    assert enviar_archivo(ruta, "v.mp4", "video/mp4", pedir("bytes=5000-"), rangos=True).status_code == 416
    # Sin `rangos` (los PDF) se manda entero, como siempre.
    entero = enviar_archivo(ruta, "v.pdf", "application/pdf", pedir("bytes=10-19"))
    assert entero.status_code == 200


async def _juntar(iterador):
    partes = []
    async for x in iterador:
        partes.append(x)
    return partes

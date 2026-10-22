"""backend/tests/test_qillqasqa.py — Qillqasqa (Gestión documental, Proyectos de ley y Semana de representación) con sus
propios puertos (fase 10.2b, Q2, 2026-10-21): su configuración dice lo mismo que la de Qillqa y su sesión es suya.
Pruebas puras (sin base de datos).
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app import config as qillqa  # noqa: E402
from qillqasqa import config as propia  # noqa: E402

CAMPOS = ("database_url", "jwt_secret", "mdd_ruta", "mdd_documentos", "mdd_perfil", "tiempo_max_compilacion", "periodo",
          "siglas", "siglas_bancada", "nombre_bancada", "lugar", "isr_raiz", "isr_python", "imagenes_cache_dir",
          "imagenes_cache_mb", "imagenes_cache_dias", "xdg_cache_home", "zona_horaria")


def test_lee_las_mismas_variables_con_los_mismos_valores_por_omision():
    """Las mismas variables de entorno y los mismos valores por omisión: si no, el mismo .env daría otro despacho."""
    suyos, de_qillqa = type(propia.config).model_fields, type(qillqa.config).model_fields
    for campo in CAMPOS:
        assert suyos[campo].default == de_qillqa[campo].default, campo
    # Lo que no está en la lista no se leyó de Qillqa por descuido: o está en CAMPOS o es suyo.
    assert set(suyos) - set(CAMPOS) == {"qillqasqa_database_url"}


def test_resuelve_las_carpetas_como_qillqa(tmp_path, monkeypatch):
    """El archivo documental, los informes de la semana y el caché de imágenes, en las mismas carpetas que Qillqa."""
    casos = (
        {"mdd_ruta": str(tmp_path / "marco"), "mdd_documentos": "", "isr_raiz": ""},
        {"mdd_ruta": "/m", "mdd_documentos": str(tmp_path / "despacho" / "documentos"), "isr_raiz": ""},
        {"mdd_ruta": "/m", "mdd_documentos": "", "isr_raiz": str(tmp_path / "isr")},
        {"imagenes_cache_mb": 0}, {"imagenes_cache_mb": 5, "imagenes_cache_dir": str(tmp_path / "c")},
        {"imagenes_cache_mb": 5, "imagenes_cache_dir": "", "xdg_cache_home": str(tmp_path / "xdg")},
    )
    for valores in casos:
        for clave, valor in valores.items():
            monkeypatch.setattr(qillqa.config, clave, valor)
            monkeypatch.setattr(propia.config, clave, valor)
        assert propia.raiz_documentos() == qillqa.raiz_documentos()
        assert propia.raiz_informes_sr() == qillqa.raiz_informes_sr()
        assert propia.raiz_cache_imagenes() == qillqa.raiz_cache_imagenes()


def test_su_base_es_la_documental_mientras_no_se_separe(monkeypatch):
    monkeypatch.setattr(propia.config, "qillqasqa_database_url", "")
    assert propia.url_base() == propia.config.database_url
    monkeypatch.setattr(propia.config, "qillqasqa_database_url", "postgresql+asyncpg://u:c@h/qillqasqa")
    assert propia.url_base() == "postgresql+asyncpg://u:c@h/qillqasqa"


def test_su_api_pide_la_persona_por_tiqsi_y_la_sesion_por_la_suya():
    """Las rutas de Qillqasqa dependen de los marcadores de Tiqsi (el anfitrión los conecta) y de su propia sesión."""
    from fastapi.routing import APIRoute
    from tiqsi import puertos

    from qillqasqa.api import documentos, proyectos, semanas_sr
    from qillqasqa.db import obtener_sesion_qillqasqa

    def dependencias(router):
        salida = set()
        for ruta in router.routes:
            if isinstance(ruta, APIRoute):
                pila = list(ruta.dependant.dependencies)
                while pila:
                    d = pila.pop()
                    salida.add(d.call)
                    pila += d.dependencies
        return salida

    for router in (documentos.router, proyectos.router, semanas_sr.router):
        llamadas = dependencias(router)
        assert puertos.usuario_actual in llamadas and obtener_sesion_qillqasqa in llamadas
        assert not {d for d in llamadas if getattr(d, "__module__", "") in ("app.seguridad", "app.db")}

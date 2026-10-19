"""backend/tests/test_rutas.py — el archivo documental se resuelve por MDD_DOCUMENTOS y el re-anclaje sobrevive a una mudanza.

Pruebas puras (sin base de datos): raiz_documentos(), carpetas.reanclar() y la siembra de
contadores por serie sobre un árbol temporal. Uso: cd backend && .venv/bin/python -m pytest -q
"""
import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app import config as cfg  # noqa: E402
from app.servicios import carpetas  # noqa: E402
from app import semillas  # noqa: E402
from app.tipos import TIPOS  # noqa: E402


def test_raiz_documentos_prefiere_mdd_documentos(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg.config, "mdd_ruta", str(tmp_path / "marco"))
    monkeypatch.setattr(cfg.config, "mdd_documentos", "")
    assert cfg.raiz_documentos() == tmp_path / "marco" / "documentos"
    monkeypatch.setattr(cfg.config, "mdd_documentos", str(tmp_path / "despacho" / "documentos"))
    assert cfg.raiz_documentos() == tmp_path / "despacho" / "documentos"


def test_reanclar_sobrevive_a_la_mudanza(tmp_path, monkeypatch):
    nueva = tmp_path / "despacho" / "documentos" / "oficios" / "OF-0001-20260101-x"
    nueva.mkdir(parents=True)
    monkeypatch.setattr(cfg.config, "mdd_documentos", str(tmp_path / "despacho" / "documentos"))
    vieja = Path("/ruta/que/ya/no/existe/marco/documentos/oficios/OF-0001-20260101-x")
    assert carpetas.reanclar(vieja) == nueva
    assert carpetas.reanclar(nueva) == nueva
    sin_documentos = Path("/otra/cosa/OF-0001")
    assert carpetas.reanclar(sin_documentos) == sin_documentos


def test_siembra_lee_todas_las_series(tmp_path, monkeypatch):
    raiz = tmp_path / "documentos"
    for sub, nombre in (("oficios", "OF-0088-20260914-a"), ("oficios", "OM-0016-20260907-b"),
                        ("cartas", "CARTA-0002-20260830-c"), ("bancada", "OMB-0001-20260823-d"),
                        ("memorandos", "MEM-0001-20260818-e")):
        (raiz / sub / nombre).mkdir(parents=True)
    monkeypatch.setattr(cfg.config, "mdd_documentos", str(raiz))
    maximos = semillas._maximos_en_framework()
    assert maximos["OF"] == 88 and maximos["OM"] == 16 and maximos["CARTA"] == 2
    assert maximos["OMB"] == 1 and maximos["MEM"] == 1 and maximos["INF"] == 0
    assert set(maximos) == {t["serie"] for t in TIPOS.values()}
    # Series propias de la entidad (M10 D5): existen, siembran en 0 y sus carpetas están declaradas.
    assert maximos["ISR"] == 0 and maximos["REC"] == 0
    assert TIPOS["informe_sr"]["carpeta"] == "isr" and TIPOS["recibido"]["carpeta"] == "recibidos"


def test_tipos_externos_no_se_compilan():
    """ISR y REC se producen fuera de Qillqa: el registro los marca y compilar() los rechaza."""
    from app.tipos import es_externo, lista_tipos
    assert es_externo("informe_sr") and es_externo("recibido") and not es_externo("oficio")
    externos = {t["codigo"] for t in lista_tipos() if t["externo"]}
    assert externos == {"informe_sr", "recibido"}

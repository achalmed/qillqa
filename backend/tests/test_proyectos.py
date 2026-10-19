"""backend/tests/test_proyectos.py — reglas del módulo de proyectos (piloto 2026-10-01).

Pruebas puras: candado de parte, menciones, avance, código correlativo y que las
plantillas sean coherentes (claves únicas, dependencias que existen, fuentes en
cada requisito). Uso: cd backend && .venv/bin/python -m pytest -q
"""
import os
from datetime import date, datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import proyectos as r  # noqa: E402
from app.servicios.proyectos_plantillas import PLANTILLAS  # noqa: E402

T = datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc)


def test_candado_de_parte():
    assert r.puede_tomar(1, None, None, T)
    assert r.puede_tomar(1, 1, T, T + timedelta(seconds=10))
    assert not r.puede_tomar(2, 1, T, T + timedelta(seconds=30))
    assert r.puede_tomar(2, 1, T, T + timedelta(minutes=3))  # caducó


def test_menciones():
    validos = {"rmamani", "ltorres"}
    assert r.menciones("@RMamani revisa y @ltorres. Gracias @nadie", validos) == ["rmamani", "ltorres"]
    assert r.menciones("correo@rmamani.pe", validos) == []


def test_avance_y_codigo():
    a = r.avance(["hecha", "en_curso", "omitida"], [("aprobada", True), ("borrador", True), ("borrador", False)], ["hecha", "por_hacer"])
    assert a == {"fases_hechas": 1, "fases_total": 2, "partes_aprobadas": 1, "partes_total": 2, "tareas_abiertas": 1}
    assert r.codigo_siguiente("PL", 2026, ["PL-2026-001", "PL-2026-007", "PL-2025-010"]) == "PL-2026-008"
    assert r.codigo_siguiente("PL", 2027, []) == "PL-2027-001"


def test_plantillas_coherentes():
    for tipo, p in PLANTILLAS.items():
        claves = [f["clave"] for f in p["fases"]]
        assert len(claves) == len(set(claves)), tipo
        for f in p["fases"]:
            assert all(d in claves for d in f.get("depende_de", [])), f["clave"]
            assert all(req[1] for req in f.get("requisitos", [])), f["clave"]
        secciones = [s[0] for s in p["secciones"]]
        assert len(secciones) == len(set(secciones))
        assert all(s[2] in p["grupos"] for s in p["secciones"])


def test_naturaleza_de_los_requisitos():
    assert r.naturaleza_de("Reglamento de la Cámara de Diputados, art. 106 b") == "oficial"
    assert r.naturaleza_de("Const. art. 109") == "oficial"
    assert r.naturaleza_de("buena práctica (MTL 2021, cap. X)") == "buena_practica"
    assert r.naturaleza_de("flujo de la entidad") == "despacho"
    for p in PLANTILLAS.values():
        for f in p["fases"]:
            for req in f.get("requisitos", []):
                nat = req[2] if len(req) > 2 else r.naturaleza_de(req[1])
                assert nat in r.NATURALEZAS


# --- Guardado automático y fecha del proyecto (revisión de usabilidad 2026-10-01)


def test_autoguardado_se_une_con_el_anterior_automatico_de_la_misma_persona():
    t0 = T
    assert r.unir_autoguardado(r.NOTA_AUTO, 7, 4, t0, 7, 4, t0 + timedelta(minutes=5))
    # Otra persona, una versión con nota, una ya superada o una vieja: versión nueva.
    assert not r.unir_autoguardado(r.NOTA_AUTO, 8, 4, t0, 7, 4, t0)
    assert not r.unir_autoguardado("Revisé el art. 2", 7, 4, t0, 7, 4, t0)
    assert not r.unir_autoguardado(r.NOTA_AUTO, 7, 3, t0, 7, 4, t0)
    assert not r.unir_autoguardado(r.NOTA_AUTO, 7, 4, t0, 7, 4, t0 + timedelta(hours=1))
    assert not r.unir_autoguardado(r.NOTA_AUTO, 7, 4, None, 7, 4, t0)


def test_fecha_del_proyecto_se_fija_sola_sin_pisar_la_puesta_a_mano():
    assert r.fecha_fija("", date(2026, 10, 1)) == "2026-10-01"
    assert r.fecha_fija("2026-09-18", date(2026, 10, 1)) == "2026-09-18"
    assert r.fecha_fija("", None) == ""

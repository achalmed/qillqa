"""backend/tests/test_plataforma.py — Qillqa como anfitrión de módulos con el contrato de Tiqsi (fase 10.2,
2026-10-20; app/plataforma.py). Que ningún router de app/api quede sin montar ni se monte dos veces, que
cada módulo encendible tenga su manifiesto con los mismos prefijos, y que cada uno sepa a qué proyecto va.
Sin base de datos.
"""
import importlib
import os
import pkgutil

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from fastapi import APIRouter  # noqa: E402

import app.api as paquete_api  # noqa: E402
from app import plataforma  # noqa: E402
from app.servicios import modulos as svc_modulos  # noqa: E402

PROYECTOS = {"qillqa", "qillqasqa", "punku", "rimay", "minka", "yupay", "rikchay", "qhawana", "wayra", "tullpu", "kuyuy", "awana"}


def _routers_de_app_api() -> dict[int, str]:
    salida = {}
    for info in pkgutil.iter_modules(paquete_api.__path__):
        mod = importlib.import_module(f"app.api.{info.name}")
        for nombre, valor in vars(mod).items():
            if isinstance(valor, APIRouter) and getattr(valor, "routes", None) and nombre.startswith("router"):
                salida[id(valor)] = f"app/api/{info.name}.py::{nombre}"
    return salida


def test_cada_router_se_monta_una_sola_vez():
    montados = [id(r) for m in plataforma.MODULOS for r in m.routers]
    assert len(montados) == len(set(montados)), "un router aparece en dos manifiestos"
    faltan = set(_routers_de_app_api()) - set(montados)
    assert not faltan, "routers sin montar: " + ", ".join(sorted(_routers_de_app_api()[f] for f in faltan))


def test_cada_modulo_encendible_tiene_su_manifiesto_con_sus_prefijos():
    por_id = {m.id: m for m in plataforma.MODULOS}
    for mid, fila in svc_modulos.POR_ID.items():
        if mid == "mesa_virtual":          # parte de la Mesa de Partes: sin API propia en el registro
            continue
        assert mid in por_id, f"el módulo encendible «{mid}» no tiene manifiesto"
        assert set(por_id[mid].prefijos) == set(fila.get("rutas", ())), mid


def test_el_anfitrion_registra_todo_y_sabe_a_donde_va_cada_modulo():
    a = plataforma.crear_anfitrion()
    assert [m.id for m in a.modulos] == [m.id for m in plataforma.MODULOS]
    assert {"identidad.v1", "archivos.v1", "sesion.v1"} <= set(a.capacidades.ofrecidas())
    assert set(plataforma.PROYECTO) == {m.id for m in plataforma.MODULOS}
    assert set(plataforma.PROYECTO.values()) <= PROYECTOS
    assert plataforma.PROYECTO["chat"] == "rimay" and plataforma.PROYECTO["proyectos"] == "qillqasqa"
    tareas = {m.id: [t.__name__ for t in m.tareas] for m in a.modulos if m.tareas}
    assert tareas == {"tareas": ["_recordatorios", "_programacion"], "chat": ["_telegram"], "openproject": ["_openproject"]}


def test_reparte_las_bandejas_durables_de_qillqa_y_de_los_modulos():
    """Fase 10.2b: cada bandeja en su base (una transacción no cruza bases): la de Qillqa son los eventos del sistema;
    la de la Mediateca, su tabla `tiqsi_bandeja`; la de Tareas y Agenda, `minka_bandeja`. Las crea el `create_all` de
    cada módulo, no el de la base documental."""
    from app.modelos import Base
    from rikchay.modelos import BaseMediateca
    from minka.modelos import BaseMinka
    from app.servicios.eventos_bandeja import BandejaEventosSistema
    from tiqsi.bandeja_sql import BandejaSQL

    anf = plataforma.crear_anfitrion()
    assert set(anf.bandejas) == {"qillqa", "qillqa-salida", "fototeca", "tareas", "chat", "recibidos", "piezas", "documentos"}
    assert isinstance(anf.bandejas["qillqa"], BandejaEventosSistema)
    # Lo que Qillqa manda a los módulos aislados tras su commit (Rimay R1): su tabla, en la base documental.
    assert isinstance(anf.bandejas["qillqa-salida"], BandejaSQL) and "qillqa_bandeja" in Base.metadata.tables
    # La del chat (Rimay R2), en su base desde R3 (BaseRimay).
    from rimay.modelos import BaseRimay

    assert isinstance(anf.bandejas["chat"], BandejaSQL) and "rimay_bandeja" in BaseRimay.metadata.tables
    assert "rimay_bandeja" not in Base.metadata.tables and "mensajes" not in Base.metadata.tables
    # La del editor de piezas (Awana E4b): «prensa.pieza_registrada», y las piezas ya no son de Qillqa.
    from awana.modelos import BaseAwana

    assert isinstance(anf.bandejas["piezas"], BandejaSQL) and "awana_bandeja" in BaseAwana.metadata.tables
    assert "prensa_piezas" not in Base.metadata.tables and "prensa_piezas" in BaseAwana.metadata.tables
    assert isinstance(anf.bandejas["fototeca"], BandejaSQL) and isinstance(anf.bandejas["tareas"], BandejaSQL)
    assert "minka_bandeja" in BaseMinka.metadata.tables and "minka_bandeja" not in Base.metadata.tables
    assert "tiqsi_bandeja" in BaseMediateca.metadata.tables and "tiqsi_bandeja" not in Base.metadata.tables
    assert {"repartido_en", "intentos_reparto", "error_reparto"} <= set(Base.metadata.tables["eventos_sistema"].c.keys())
    # La de Qillqasqa (Q4a): lo que cuentan y avisan Gestión documental, Proyectos de ley y la Semana; su tabla, aparte.
    from qillqasqa.modelos import BaseQillqasqa

    assert isinstance(anf.bandejas["documentos"], BandejaSQL) and "qillqasqa_bandeja" in BaseQillqasqa.metadata.tables
    assert "qillqasqa_bandeja" not in Base.metadata.tables

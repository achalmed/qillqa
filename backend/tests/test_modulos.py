"""backend/tests/test_modulos.py — encender y apagar módulos (servicios/modulos.py) y el paso de
datos al primer ingreso (servicios/perfil.py), 2026-10-18. Sin base de datos.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_modulos.py
"""
import asyncio
import json
import os
from datetime import datetime, timezone
from types import SimpleNamespace as NS

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import modulos, perfil  # noqa: E402

# --- módulos ----------------------------------------------------------------------------------------


def test_de_fabrica_todo_encendido_salvo_la_mesa_virtual():
    est = modulos.normalizar({})
    assert set(est) == set(modulos.POR_ID)
    assert est["mesa_virtual"]["activo"] is False
    assert all(e["activo"] for mid, e in est.items() if mid != "mesa_virtual")
    # Cada uno con su mensaje; el de la mesa virtual, el neutro (nunca dice por qué ni quién).
    assert est["chat"]["mensaje"] == "Chat no está disponible por el momento."
    assert est["mesa_virtual"]["mensaje"] == modulos.MENSAJE_MESA_VIRTUAL
    assert "no está disponible por el momento" in modulos.MENSAJE_MESA_VIRTUAL
    for prohibido in ("autoriz", "diputad", "titular", "congresista"):
        assert prohibido not in modulos.MENSAJE_MESA_VIRTUAL.lower()


def test_normalizar_guarda_lo_conocido_y_limpia_el_mensaje():
    est = modulos.normalizar({
        "chat": {"activo": False, "mensaje": "  Volvemos   pronto.  "},
        "mesa_virtual": {"activo": True, "mensaje": ""},
        "inventado": {"activo": False},
        "prensa": "no es un dict",
        "tareas": {"mensaje": "x" * 900},
    })
    assert "inventado" not in est
    assert est["chat"] == {"activo": False, "mensaje": "Volvemos pronto."}
    # Vacío vuelve al de fábrica.
    assert est["mesa_virtual"] == {"activo": True, "mensaje": modulos.MENSAJE_MESA_VIRTUAL}
    assert est["prensa"]["activo"] is True
    assert len(est["tareas"]["mensaje"]) == modulos.MAX_MENSAJE


def test_la_mesa_virtual_depende_de_recibidos():
    est = modulos.normalizar({"mesa_virtual": {"activo": True}})
    assert modulos.efectivo(est)["mesa_virtual"] is True
    est["recibidos"]["activo"] = False
    ef = modulos.efectivo(est)
    assert ef["recibidos"] is False and ef["mesa_virtual"] is False
    fila = next(m for m in modulos.vista(est) if m["id"] == "mesa_virtual")
    assert fila["activo"] is True and fila["efectivo"] is False and fila["requiere"] == "recibidos"


def test_modulo_de_ruta():
    assert modulos.modulo_de_ruta("/api/chat/canales") == "chat"
    assert modulos.modulo_de_ruta("/api/chat") == "chat"
    assert modulos.modulo_de_ruta("/api/agenda.ics") == "tareas"
    assert modulos.modulo_de_ruta("/api/agenda/eventos") == "tareas"
    assert modulos.modulo_de_ruta("/estudio/index.html") == "prensa"
    assert modulos.modulo_de_ruta("/api/mesa-virtual/config") == "recibidos"
    # El núcleo nunca se apaga: documentos, directorio, perfil, la propia API de módulos, la pública.
    for ruta in ("/api/documentos/1", "/api/directorio/personas", "/api/cuenta/perfil", "/api/modulos",
                 "/api/modulos/chat", "/api/publico/mesa/enviar", "/api/admin/usuarios", "/api/chatear"):
        assert modulos.modulo_de_ruta(ruta) is None, ruta


def test_cada_prefijo_corresponde_a_rutas_reales():
    from app.main import app

    rutas = [getattr(r, "path", "") for r in app.routes]
    for m in modulos.CATALOGO:
        for prefijo in m["rutas"]:
            assert any(modulos.modulo_de_ruta(r) == m["id"] and r.startswith(prefijo) for r in rutas), prefijo


def test_guardian_responde_403_con_el_mensaje():
    async def probar():
        recibido = []

        async def app_interna(scope, receive, send):
            recibido.append(scope["path"])

        guardian = modulos.GuardianModulos(app_interna)
        modulos._cache[modulos.CLAVE_AJUSTE] = (10**12, {"chat": {"activo": False, "mensaje": "Pausa."}})
        try:
            enviados = []

            async def send(m):
                enviados.append(m)

            await guardian({"type": "http", "path": "/api/chat/canales"}, None, send)
            await guardian({"type": "http", "path": "/api/documentos"}, None, send)
            await guardian({"type": "http", "path": "/api/tareas"}, None, send)
        finally:
            modulos.invalidar()
        assert recibido == ["/api/documentos", "/api/tareas"]
        assert enviados[0]["status"] == 403
        cuerpo = json.loads(enviados[1]["body"])
        assert cuerpo["detail"] == {"codigo": "modulo_apagado", "modulo": "chat", "mensaje": "Pausa."}

    # La caché se usa antes de abrir sesión: con el instante «futuro» no toca la base.
    import time

    original = time.monotonic
    time.monotonic = lambda: 10**12
    try:
        asyncio.run(probar())
    finally:
        time.monotonic = original


# --- datos al primer ingreso --------------------------------------------------------------------------


def _u(**k):
    base = dict(nombres="Ana", apellidos="Quispe", telefono="987654321", email="aquispe@x.pe", cargo="Asistente",
                rol="secretaria", datos_completos_en=None)
    base.update(k)
    return NS(**base)


def test_primer_ingreso_de_fabrica_excluye_al_titular_por_cargo():
    cfg = perfil.normalizar_primer_ingreso({})
    assert cfg == {"activo": True, "excluir_cargos": ["Diputado"]}
    assert perfil.pide_bienvenida(_u(), cfg)
    # El titular no lo pasa, aunque además administre el sistema (rol administrador).
    assert not perfil.pide_bienvenida(_u(cargo="Diputado", rol="diputado"), cfg)
    assert not perfil.pide_bienvenida(_u(cargo="diputado", rol="administrador"), cfg)
    # Cuenta antigua sin cargo: vale el cargo de su rol.
    assert not perfil.pide_bienvenida(_u(cargo="", rol="diputado"), cfg)
    # Ya confirmó, o el paso está apagado: no.
    assert not perfil.pide_bienvenida(_u(datos_completos_en=datetime.now(timezone.utc)), cfg)
    assert not perfil.pide_bienvenida(_u(), {**cfg, "activo": False})


def test_primer_ingreso_normaliza_los_cargos_exceptuados():
    cfg = perfil.normalizar_primer_ingreso({"activo": False, "excluir_cargos": ["prensa", "Prensa", "inventado", ""]})
    assert cfg == {"activo": False, "excluir_cargos": ["Prensa"]}
    assert perfil.normalizar_primer_ingreso({"excluir_cargos": []})["excluir_cargos"] == []


def test_datos_faltantes_en_el_orden_del_formulario():
    assert perfil.datos_faltantes(_u()) == []
    assert perfil.datos_faltantes(_u(telefono="", email=" ", cargo="")) == ["celular", "correo", "cargo"]

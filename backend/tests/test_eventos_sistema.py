"""backend/tests/test_eventos_sistema.py — reglas puras de los eventos del sistema
(servicios/eventos_sistema.py): plantilla con campos, condición, clave de idempotencia,
destinos válidos y las reglas de fábrica contra el vocabulario. Sin base de datos.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_eventos_sistema.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import eventos_sistema as ev  # noqa: E402


def test_plantilla_rellena_campos_y_deja_vacio_lo_ausente():
    assert ev.plantilla("Nuevo recibido: «{asunto}» de {remitente} ({atencion}).", {"asunto": "Pedido", "remitente": "Alguien"}) == "Nuevo recibido: «Pedido» de Alguien."
    assert ev.plantilla("", {"asunto": "x"}) == ""
    # Tramos « · » con campo vacío se quitan; «de :» se limpia.
    assert ev.plantilla("Nuevo recibido de {remitente}: «{asunto}» · {atencion} · plazo {plazo}", {"asunto": "Carta", "atencion": "agendar"}) == "Nuevo recibido: «Carta» · agendar"
    assert ev.plantilla("Agendado: {titulo} · {inicio} · {lugar}", {"titulo": "Sesión", "inicio": "2026-11-04T09:30", "lugar": ""}) == "Agendado: Sesión · 2026-11-04T09:30"


def test_condicion_vacia_siempre_y_por_valor_o_lista_sin_tildes():
    assert ev.cumple({}, {"atencion": "responder"})
    assert ev.cumple(None, {})
    assert ev.cumple({"atencion": "Responder"}, {"atencion": "responder"})
    assert ev.cumple({"estado": ["FIRMADO", "ENVIADO"]}, {"estado": "enviado"})
    assert not ev.cumple({"atencion": "responder"}, {"atencion": "agendar"})
    assert not ev.cumple({"atencion": "responder"}, {})


def test_clave_y_destinos():
    assert ev.clave_de("entrada.registrada", "entrada:12") == "entrada:12:registrada"
    assert ev.clave_de("documento.estado", "doc:95", "ENVIADO") == "doc:95:estado:ENVIADO"
    for d in ("responsable", "autor", "equipo", "administradores", "rol:asesor", "usuario:3", "canal:7"):
        assert ev.destino_valido(d), d
    for d in ("", "rol:nadie", "usuario:x", "todos"):
        assert not ev.destino_valido(d), d


def test_reglas_de_fabrica_coherentes_con_el_vocabulario():
    claves = [r["de_fabrica"] for r in ev.FABRICA]
    assert len(claves) == len(set(claves))
    for r in ev.FABRICA:
        assert r["evento"] in ev.VOCABULARIO
        assert r["accion"] in ev.ACCIONES and ev.destino_valido(r["destino"])
        campos = set(ev.VOCABULARIO[r["evento"]]["campos"])
        assert set(r["condicion"]) <= campos
        # Cada {campo} de la plantilla existe en el evento.
        import re
        assert set(re.findall(r"\{([a-z_]+)\}", r["texto"])) <= campos

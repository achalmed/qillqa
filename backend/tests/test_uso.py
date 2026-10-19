"""Estadísticas de uso (servicios/uso.py): lógica pura, sin base de datos."""
import os
from datetime import datetime, timezone

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import uso  # noqa: E402


def test_anonimizar_ruta_quita_ids_query_y_fragmento():
    assert uso.anonimizar_ruta("/documentos/132?x=1#y") == "/documentos/:id"
    assert uso.anonimizar_ruta("/proyectos/5/word") == "/proyectos/:id/word"
    assert uso.anonimizar_ruta("/proyectos/5/imagenes/0123456789abcdef0123456789abcdef.jpg") == "/proyectos/:id/imagenes/0123456789abcdef0123456789abcdef.jpg"
    assert uso.anonimizar_ruta("/chat/abcdef0123456789abcd") == "/chat/:id"
    assert uso.anonimizar_ruta("") == "/"
    assert len(uso.anonimizar_ruta("/" + "x" * 500)) == uso.MAX_RUTA


def test_limpiar_solo_acepta_lo_conocido_y_el_detalle_solo_en_errores():
    ahora = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)
    v = uso.limpiar({"accion": "vista", "modulo": "documentos", "ruta": "/documentos/9?q=secreto", "duracion_ms": 1234.7, "ancho": 390, "alto": 844, "version": "20261019", "detalle": "NUNCA", "asunto": "no"}, ahora)
    assert v == {"momento": ahora, "accion": "vista", "modulo": "documentos", "ruta": "/documentos/:id", "duracion_ms": 1234, "aparato": "celular", "ancho": 390, "alto": 844, "version": "20261019", "detalle": ""}
    e = uso.limpiar({"accion": "error", "detalle": "TypeError: x\n    at f (chunk.js:1:2)" * 100, "ancho": 1440}, ahora)
    assert e["aparato"] == "escritorio" and len(e["detalle"]) == uso.MAX_DETALLE and e["duracion_ms"] is None
    assert uso.limpiar({"accion": "clic"}, ahora) is None
    assert uso.limpiar("x", ahora) is None
    # El momento del cliente se acepta si es verosímil; si no, manda el del servidor.
    cerca = uso.limpiar({"accion": "arranque", "momento": ahora.timestamp() * 1000 - 5000}, ahora)
    assert (ahora - cerca["momento"]).total_seconds() == 5
    lejos = uso.limpiar({"accion": "arranque", "momento": 1_000_000_000_000}, ahora)
    assert lejos["momento"] == ahora
    assert uso.limpiar({"accion": "vista", "aparato": "tableta", "ancho": 1440}, ahora)["aparato"] == "tableta"


def test_limpiar_lote_corta_al_maximo():
    lote = [{"accion": "vista"}] * (uso.MAX_LOTE + 50) + [{"accion": "mala"}]
    assert len(uso.limpiar_lote(lote)) == uso.MAX_LOTE

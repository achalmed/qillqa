"""backend/tests/test_minka_eventos.py — lo que Tareas y Agenda cuenta y avisa sale por su bandeja de salida (fase 10.2b,
2026-10-20; servicios/minka_eventos.py) y Qillqa lo recibe del bus (eventos_sistema.desde_bus, notificaciones.desde_bus).
Sin base de datos."""
import asyncio

from tiqsi.eventos import Evento

from minka.modelos import SalidaMinka
from minka import eventos as minka_eventos
from app.servicios import eventos_sistema


class Sesion:
    def __init__(self):
        self.filas = []

    def add(self, fila):
        self.filas.append(fila)


def test_emitir_anota_el_hecho_con_su_sobre_en_la_transaccion():
    s = Sesion()
    minka_eventos.emitir(s, "tarea.asignada", "tarea:7", {"titulo": "X"}, clave="tarea:7:asignada:3", usuario_id=3)
    [f] = s.filas
    assert isinstance(f, SalidaMinka) and f.tipo == "tarea.asignada" and f.origen == "tareas"
    assert f.datos == {"entidad": "tarea:7", "datos": {"titulo": "X"}, "clave": "tarea:7:asignada:3", "usuario_id": 3}


def test_avisar_no_avisa_a_quien_lo_hizo_ni_a_nadie():
    s = Sesion()
    minka_eventos.avisar(s, 5, "Hola", "tarea", evitar=5, destino="tarea:1")
    minka_eventos.avisar(s, None, "Hola", "tarea")
    minka_eventos.avisar(s, 6, "Nueva tarea para usted: X" * 40, "tarea", evitar=5, destino="tarea:1")
    [f] = s.filas
    assert f.tipo == "aviso.nuevo" and f.datos["usuario_id"] == 6 and len(f.datos["texto"]) == 500


def test_qillqa_no_vuelve_a_procesar_lo_que_ella_misma_reparte():
    """Lo que viene de la bandeja de Qillqa (origen «qillqa») ya pasó por sus reglas: se ignora sin tocar la base."""
    asyncio.run(eventos_sistema.desde_bus(Evento("tarea.asignada", {"entidad": "tarea:1"}, "qillqa", id="qillqa:1")))


def test_reapuntar_lee_dentro_del_sobre(monkeypatch):
    """«referencias.reapuntar» llega con el sobre de `emitir`: Qillqa lee los viejos y el nuevo DENTRO de «datos»."""
    from app import plataforma

    s = Sesion()
    minka_eventos.emitir(s, "referencias.reapuntar", "evento:2", {"viejos": ["evento:1"], "nuevo": "evento:2"})
    [f] = s.filas
    vistos = []

    class SesionFalsa:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def execute(self, sentencia):
            vistos.append(str(sentencia.compile(compile_kwargs={"literal_binds": True})))

        async def commit(self):
            vistos.append("commit")

    import app.db

    monkeypatch.setattr(app.db, "SesionAsincrona", SesionFalsa)
    asyncio.run(plataforma._al_reapuntar(Evento(f.tipo, f.datos, f.origen, id="tareas:1")))
    assert len(vistos) == 2 and "notificaciones" in vistos[0] and "evento:1" in vistos[0] and "evento:2" in vistos[0] and vistos[-1] == "commit"
    # Los mensajes del chat los reapunta el chat (Rimay R1), con el mismo sobre.
    from rimay import contrato as rimay_contrato

    vistos.clear()
    monkeypatch.setattr(rimay_contrato, "SesionRimay", SesionFalsa)
    asyncio.run(rimay_contrato.al_reapuntar(Evento(f.tipo, f.datos, f.origen, id="tareas:1")))
    assert len(vistos) == 2 and "mensajes" in vistos[0] and "evento:1" in vistos[0] and "evento:2" in vistos[0] and vistos[-1] == "commit"

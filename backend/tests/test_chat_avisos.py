"""Chat (2026-10-13): tarjetas ordenadas de lo que publica el sistema, la programación del día, lo
que mira cada pestaña (para no avisar lo que ya se tiene delante) y los temas nuevos de fábrica."""
import asyncio

from app.servicios import chat, difusor, eventos_sistema, programacion


def test_tarjeta_numerado_sin_repetir_el_numero():
    t = chat.tarjeta_de("documento.numerado", {"numero": "Oficio N°0142-2026", "asunto": "Traslada y solicita información"})
    assert t == {"que": "Numerado", "icono": "numerado", "titulo": "Oficio N°0142-2026", "detalle": "Traslada y solicita información", "meta": []}


def test_tarjeta_estado_firmado_enviado_y_otro():
    assert chat.tarjeta_de("documento.estado", {"numero": "N1", "estado": "FIRMADO", "asunto": "A"})["que"] == "Firmado"
    assert chat.tarjeta_de("documento.estado", {"numero": "N1", "estado": "ENVIADO", "asunto": "A"})["icono"] == "enviado"
    assert chat.tarjeta_de("documento.estado", {"numero": "N1", "estado": "OBSERVADO_ENVIADO"})["que"] == "Pasó a observado enviado"


def test_tarjeta_recibido_con_meta_legible():
    t = chat.tarjeta_de("entrada.registrada", {"remitente": "Ministerio X", "asunto": "Invita", "atencion": "responder", "plazo": "2026-10-14"})
    assert t["que"] == "Llegó" and t["titulo"] == "Ministerio X" and t["detalle"] == "Invita"
    assert t["meta"] == ["por responder", "plazo mié 14/10"]


def test_tarjeta_evento_y_programacion():
    t = chat.tarjeta_de("evento.creado", {"titulo": "Sesión", "inicio": "2026-10-14T10:30:00-05:00", "lugar": "Hemiciclo"})
    assert t["que"] == "Agendado" and t["meta"] == ["mié 14/10 10:30", "Hemiciclo"]
    p = chat.tarjeta_de("agenda.programacion_diaria", {"fecha": "2026-10-13", "n": 2, "resumen": "08:00 A\n10:00 B"})
    assert p["titulo"] == "mar 13/10" and p["detalle"] == "08:00 A\n10:00 B" and p["meta"] == ["2 actividad(es)"]


def test_tarjeta_de_anuncios_y_sin_tarjeta():
    t = chat.tarjeta_de("", {}, "Tarea creada: Revisar el oficio · vence lun 14/10 · Ana")
    assert t == {"que": "Tarea creada", "icono": "tarea", "titulo": "Revisar el oficio", "detalle": "", "meta": ["vence lun 14/10", "Ana"]}
    assert chat.tarjeta_de("", {}, "Reconocí un formato «Agenda»: 2 actividad(es).") == {}


def test_toda_regla_de_fabrica_publica_en_un_canal_de_fabrica():
    claves = {c["clave"] for c in chat.FABRICA}
    for r in eventos_sistema.FABRICA:
        if r["accion"] == "publicar":
            assert r["destino"][6:] in claves, r["de_fabrica"]
            assert r["evento"] in eventos_sistema.VOCABULARIO, r["evento"]
    # Sin nada propio de la entidad: solo genéricos, cada uno con su sección.
    assert all(chat.CATEGORIA_FABRICA.get(c["clave"]) for c in chat.FABRICA), "un tema de fábrica sin sección"
    assert set(chat.CATEGORIA_FABRICA.values()) <= set(chat.CATEGORIAS)
    assert len(claves) == len(chat.FABRICA)


def test_programacion_resumen():
    ocs = [
        {"titulo": "Pleno", "inicio": "2026-10-13T10:00:00-05:00", "lugar": "Hemiciclo", "estado": "confirmado", "todo_el_dia": False},
        {"titulo": "Semana", "inicio": "2026-10-13T00:00:00-05:00", "estado": "confirmado", "todo_el_dia": True},
        {"titulo": "Cancelada", "inicio": "2026-10-13T08:00:00-05:00", "estado": "cancelado", "todo_el_dia": False},
    ]
    n, texto = programacion.resumen(ocs)
    assert n == 2
    assert texto == "Todo el día Semana\n10:00 Pleno · Hemiciclo"
    assert programacion.resumen([]) == (0, "")


def test_lo_que_mira_cada_pestana():
    async def caso():
        a = difusor.suscribir(901)
        b = difusor.suscribir(901)
        try:
            assert not difusor.a_la_vista(901)       # hasta que la web diga qué mira, no cuenta como a la vista
            difusor.poner_mirando(a, 5, False)
            difusor.poner_mirando(b, None, False)
            assert not difusor.a_la_vista(901) and not difusor.viendo(901, 5)
            difusor.poner_mirando(a, 5, True)
            assert difusor.a_la_vista(901) and difusor.viendo(901, 5) and not difusor.viendo(901, 6)
        finally:
            difusor.cancelar(901, a)
            difusor.cancelar(901, b)
        assert not difusor.a_la_vista(901)

    asyncio.run(caso())

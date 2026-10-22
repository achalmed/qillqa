"""backend/tests/test_rimay.py — el chat detrás de su contrato (proyecto Rimay R1; fase 10.2b, 2026-10-20): lo que el
sistema dice en el chat lo compone Qillqa (servicios/avisos_chat.py) y sale por su bandeja de salida; el chat lo
publica o lo pone al día tras el commit (servicios/rimay_contrato.py). Sin base de datos.
"""
import asyncio
import os
from types import SimpleNamespace as NS

os.environ.setdefault("JWT_SECRET", "x" * 40)

from rimay import chat
from app.servicios import avisos_chat  # noqa: E402


def test_la_regla_del_mensaje_se_reconoce_por_el_canal_desde_r1():
    acciones = ["3:notificar→2", "21:publicar→canal:33", "22:publicar→canal:40:mensaje:900"]
    assert avisos_chat.regla_del_mensaje(acciones, 812, canal_id=33) == 21     # desde R1: la acción dice solo el canal
    assert avisos_chat.regla_del_mensaje(acciones, 812, canal_id=34) is None
    assert avisos_chat.regla_del_mensaje(acciones, 900, canal_id=40) == 22     # las de antes, por el mensaje
    assert avisos_chat.regla_del_mensaje(acciones, 812) is None                # sin canal no se adivina


def test_la_tarjeta_del_anuncio_es_la_misma_en_el_chat_y_en_qillqa():
    for texto in ("Tarea creada: Revisar el oficio · vence lun 14/10 · Ana", "Tarea creada: Llamar",
                  "Actividad agendada: Comisión · mar 15/10 10:00 · Sala 2", "Reconocí un formato «Agenda».", ""):
        assert chat.tarjeta_anuncio(texto) == avisos_chat.tarjeta_de("", {}, texto), texto


class _Conversaciones:
    def __init__(self, canales=None, mensajes=None):
        self.canales, self.mensajes = canales or {}, mensajes or []

    async def canal(self, destino):
        return self.canales.get(destino)

    async def del_sistema(self, entidad):
        return [m for m in self.mensajes if entidad is None or m["entidad"] == entidad]


class _Anidada:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _Sesion:
    def begin_nested(self):
        return _Anidada()


def _con(monkeypatch, conversaciones):
    salidas = []

    async def salida(sesion, tipo, datos):
        salidas.append((tipo, datos))

    monkeypatch.setattr(avisos_chat, "opcional", lambda nombre: conversaciones if nombre == "conversaciones.v1" else None)
    monkeypatch.setattr(avisos_chat, "salida", salida)
    return salidas


def test_publicar_compone_en_qillqa_y_sale_por_la_bandeja(monkeypatch):
    salidas = _con(monkeypatch, _Conversaciones({"documentos": {"id": 33, "nombre": "Documentos", "archivado": False}}))
    regla = NS(destino="canal:documentos", texto="Numerado {numero}", de_fabrica="")   # texto propio: manda la plantilla
    ev = NS(id=501, nombre="documento.numerado", entidad="doc:12", datos={"numero": "OF-0012", "asunto": "Pedido"})
    hecho = asyncio.run(avisos_chat.publicar_por_regla(None, regla, ev))
    assert hecho == "publicar→canal:33"
    [(tipo, datos)] = salidas
    assert tipo == "conversaciones.publicar"
    assert datos == {"canal_id": 33, "texto": "Numerado OF-0012", "entidad": "doc:12", "evento_sistema_id": 501,
                     "acciones": [{"texto": "Abrir", "entidad": "doc:12"}],
                     "tarjeta": {"que": "Numerado", "icono": "numerado", "titulo": "OF-0012", "detalle": "Pedido", "meta": []}}


def test_publicar_sin_canal_o_sin_chat_no_deja_nada(monkeypatch):
    salidas = _con(monkeypatch, _Conversaciones({"documentos": {"id": 33, "nombre": "D", "archivado": True}}))
    ev = NS(id=1, nombre="documento.numerado", entidad="doc:1", datos={})
    assert asyncio.run(avisos_chat.publicar_por_regla(None, NS(destino="canal:documentos", texto="x", de_fabrica=""), ev)) == "publicar→(canal no existe)"
    assert asyncio.run(avisos_chat.publicar_por_regla(None, NS(destino="canal:nada", texto="x", de_fabrica=""), ev)) == "publicar→(canal no existe)"
    monkeypatch.setattr(avisos_chat, "opcional", lambda nombre: None)
    assert asyncio.run(avisos_chat.publicar_por_regla(None, NS(destino="canal:documentos", texto="x", de_fabrica=""), ev)) == "publicar→(sin chat)"
    assert salidas == []


def test_recomponer_lo_vinculado_sale_por_la_bandeja_y_solo_lo_que_cambia(monkeypatch):
    from app.servicios import redaccion_chat

    mensajes = [
        {"id": 7, "canal_id": 3, "evento_sistema_id": None, "entidad": "tarea:5", "texto": "📋 viejo", "creado_en": "2026-10-18T10:00:00+00:00",
         "tarjeta": {"estilo": "mensaje", "firma": "Tareas", "que": "Tarea creada", "icono": "tarea", "titulo": "X", "detalle": "", "meta": []}},
        {"id": 8, "canal_id": 3, "evento_sistema_id": None, "entidad": "tarea:5", "texto": "📋 igual", "creado_en": "2026-10-18T10:00:00+00:00",
         "tarjeta": {"estilo": "mensaje"}},
        {"id": 9, "canal_id": 3, "evento_sistema_id": None, "entidad": "tarea:5", "texto": "corto", "creado_en": None, "tarjeta": {}},  # sin estilo: no
    ]
    salidas = _con(monkeypatch, _Conversaciones(mensajes=mensajes))
    textos = iter(["📋 nuevo", "📋 igual"])

    async def anuncio(sesion, entidad, cuando=None):
        return next(textos)

    monkeypatch.setattr(redaccion_chat, "anuncio", anuncio)
    assert asyncio.run(avisos_chat.refrescar_mensajes_de(_Sesion(), "tarea:5")) == 1
    [(tipo, datos)] = salidas
    assert tipo == "conversaciones.actualizar"
    [c] = datos["cambios"]
    assert c["id"] == 7 and c["texto"] == "📋 nuevo"
    assert c["tarjeta"]["firma"] == "Tareas" and c["tarjeta"]["estilo"] == "mensaje" and "actualizado_en" in c["tarjeta"]
    assert asyncio.run(avisos_chat.refrescar_mensajes_de(_Sesion(), "nada")) == 0


def test_lo_que_se_ofrece_con_un_archivo_lo_decide_qillqa(monkeypatch):
    """R1b: el chat pone el id del archivo; qué ofrecer lo dice «registro.v1». La nota de voz se queda en el chat, y
    sin Qillqa el chat no ofrece nada."""
    from app.servicios import registro_chat

    monkeypatch.setattr(chat, "registro", lambda: registro_chat.REGISTRO_V1)
    assert chat.acciones_de_archivo(NS(id=4, nombre="oficio.pdf")) == [
        {"texto": "Registrar en Mesa de Partes", "accion": "archivo_a_recibidos", "archivo_id": 4}]
    assert chat.acciones_de_archivo(NS(id=5, nombre="foto.jpg")) == [
        {"texto": "Guardar en la Mediateca", "accion": "archivo_a_mediateca", "archivo_id": 5}]
    assert chat.acciones_de_archivo(NS(id=6, nombre="nota-de-voz-1.webm")) == []
    assert chat.bloque_recibido("```yaml\ntipo: documento-recibido\nversion: 1\nasunto: Prueba\n```") is True
    monkeypatch.setattr(chat, "registro", lambda: None)
    assert chat.acciones_de_archivo(NS(id=4, nombre="oficio.pdf")) == [] and chat.bloque_recibido("tipo: documento-recibido") is False


def test_el_registro_de_qillqa_solo_ofrece_lo_suyo():
    import pytest

    from app.servicios import registro_chat

    r = registro_chat.REGISTRO_V1
    assert sorted(dir(r)) == ["archivo", "bloque_recibido", "clasificar", "de_telegram", "ofrecer_archivo", "reconocer_mensaje", "registrar"]
    assert r.reconocer_mensaje("hola", 1, False) is None
    contestacion = r.reconocer_mensaje("tipo: plan-de-tareas\nversion: 1\ntareas:\n  - titulo: Llamar\n", 9, False)
    assert contestacion["acciones"] == [{"texto": "Registrar en Tareas", "accion": "pegar_tareas", "mensaje_id": 9}]
    with pytest.raises(AttributeError):
        r.reconocer   # la Lectura del pegado es de Qillqa: el chat recibe la contestación hecha
    with pytest.raises(ValueError):
        asyncio.run(r.registrar("hola", [], 1, 1, "General"))   # sin bloque: no hay nada que registrar


def test_el_slug_del_chat_es_el_de_siempre():
    """R1b: `chat.slug` lleva su copia de `entradas.normalizar` (Mesa de Partes): las claves de los canales por comisión
    («comision:<slug>») no pueden cambiar."""
    import re

    from qillqasqa.servicios.catalogos_legislativos import COMISIONES
    from punku.entradas import normalizar

    for nombre in [*COMISIONES, "Nº 3 — Ñandú", ""]:
        assert chat.slug(nombre) == re.sub(r"[^a-z0-9ñ]+", "-", re.sub(r"^comision de ", "", normalizar(nombre)).strip()).strip("-")[:60]



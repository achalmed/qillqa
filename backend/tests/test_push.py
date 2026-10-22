"""Avisos push (2026-10-13, servicios/push.py): reglas puras de a quién se avisa, el texto, la ruta
que abre, la firma del acuse y — sin red — que el aviso cifrado con nuestras claves lo descifra el
dispositivo y que la firma VAPID es válida."""
import base64
import json

import pytest

from rimay import chat
from app.servicios import push


def test_destinatarios_directo_y_grupo_sin_silenciados_ni_autor():
    miembros = {1: False, 2: False, 3: True}
    assert chat.destinatarios_chat(clase="directo", autor_id=1, miembros={1: False, 2: False}, mencionados=set(), lectores={1, 2}) == {2}
    assert chat.destinatarios_chat(clase="grupo", autor_id=1, miembros=miembros, mencionados=set(), lectores={1, 2, 3}) == {2}


def test_destinatarios_tema_solo_personas_y_miembros():
    miembros = {1: False, 2: False}
    lectores = {1, 2, 3, 4}
    # Lo escribe una persona: avisa a quienes ya están en el tema (no a todo el equipo).
    assert chat.destinatarios_chat(clase="tema", autor_id=1, miembros=miembros, mencionados=set(), lectores=lectores) == {2}
    # Lo publica el sistema (numerado, agenda): no suena en el bolsillo de nadie.
    assert chat.destinatarios_chat(clase="tema", autor_id=None, miembros=miembros, mencionados=set(), lectores=lectores) == set()


def test_mencion_atraviesa_el_silencio_pero_no_el_acceso():
    miembros = {1: False, 2: True}
    assert chat.destinatarios_chat(clase="grupo", autor_id=1, miembros=miembros, mencionados={2}, lectores={1, 2}) == {2}
    # Mencionar a alguien que no puede leer el canal no le avisa.
    assert chat.destinatarios_chat(clase="grupo", autor_id=1, miembros=miembros, mencionados={9}, lectores={1, 2}) == set()
    # Mencionarse a sí mismo tampoco.
    assert chat.destinatarios_chat(clase="tema", autor_id=1, miembros={}, mencionados={1}, lectores={1, 2}) == set()


def test_cuerpo_del_aviso():
    assert chat.cuerpo_chat("directo", "Ana", "Ya está el oficio") == "Ya está el oficio"
    assert chat.cuerpo_chat("grupo", "Ana", "Ya está") == "Ana: Ya está"
    assert chat.cuerpo_chat("grupo", "Ana", "", "nota-de-voz-20261013-101500.webm", es_voz=True) == "Ana: Nota de voz"
    assert chat.cuerpo_chat("directo", "Ana", "", "acta.pdf") == "Archivo: acta.pdf"
    assert chat.cuerpo_chat("tema", "Ana", "¿Qué día?", encuesta=True) == "Ana: Encuesta: ¿Qué día?"
    assert len(chat.cuerpo_chat("directo", "Ana", "x" * 500)) == 180


def test_ruta_que_abre_el_aviso():
    assert push.ruta_aviso(None, None, "chat:5:99") == "/chat?canal=5&mensaje=99"
    assert push.ruta_aviso(12, None, "") == "/documentos/12"
    assert push.ruta_aviso(None, None, "entrada:7") == "/recibidos?ver=7"
    assert push.ruta_aviso(None, None, "tarea:3") == "/tareas?abrir=3"
    assert push.ruta_aviso(None, None, "evento:4") == "/agenda?abrir=4"
    assert push.ruta_aviso(None, 2, "parte:5") == "/proyectos/2?ir=parte%3A5"
    assert push.ruta_aviso(None, None, "doc:95") == "/documentos/95"
    assert push.ruta_aviso(None, None, "") == "/"


def test_firma_del_acuse():
    f = push.firma_acuse(3, 5, 99)
    assert len(f) == 32 and push.acuse_valido(3, 5, 99, f)
    assert not push.acuse_valido(3, 5, 100, f)
    assert not push.acuse_valido(4, 5, 99, f)
    assert not push.acuse_valido(3, 5, 99, "")


def test_carga_lleva_el_aspecto_del_qillqa():
    c = push.carga("Ana", "Hola", "/chat?canal=1", "chat-1", clase="chat", acuse={"u": 1})
    assert c["vibrar"] == push.VIBRACION and c["icono"].endswith(".png") and c["insignia"].endswith(".png")
    assert c["tag"] == "chat-1" and c["url"] == "/chat?canal=1" and c["acuse"] == {"u": 1}
    assert push.carga("", "x", "", "t")["titulo"] == "Qillqa"


def test_claves_vapid_validas_y_aviso_que_el_dispositivo_descifra():
    pytest.importorskip("pywebpush")
    import os

    import http_ece
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from py_vapid import Vapid02
    from pywebpush import WebPusher

    publica, pem = push.generar_claves()
    assert len(base64.urlsafe_b64decode(publica + "==")) == 65   # punto P-256 sin comprimir
    # La firma VAPID (RFC 8292) con nuestra privada se verifica con nuestra pública.
    v = Vapid02.from_pem(pem.encode())
    cab = v.sign({"sub": "mailto:qillqa@example.com", "aud": "https://fcm.googleapis.com"})
    assert cab["Authorization"].startswith("vapid t=") and publica in cab["Authorization"]
    # El dispositivo: su par ECDH y su secreto `auth`, como los da PushManager.subscribe().
    disp = ec.generate_private_key(ec.SECP256R1())
    p256dh = push.b64url(disp.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    auth = os.urandom(16)
    sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": p256dh, "auth": push.b64url(auth)}}
    datos = push.carga("Ana", "Ya está el oficio", "/chat?canal=1&mensaje=2", "chat-1", clase="chat")
    cifrado = WebPusher(sub).encode(json.dumps(datos).encode(), content_encoding="aes128gcm")
    claro = http_ece.decrypt(cifrado["body"], private_key=disp, auth_secret=auth, version="aes128gcm")
    assert json.loads(claro)["cuerpo"] == "Ya está el oficio"

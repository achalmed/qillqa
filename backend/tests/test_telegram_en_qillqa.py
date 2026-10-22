"""backend/tests/test_telegram_en_qillqa.py — el puente de Telegram del chat (Rimay, en su repositorio desde el 2026-10-22)
clasifica lo que llega con «registro.v1», que ofrece Qillqa: un documento va a Recibidos y una foto a la Mediateca.
"""
from rimay import telegram as tg


def test_clasificar_adjuntos():
    assert tg.clasificar("oficio-123.pdf", False) == "recibido"
    assert tg.clasificar("carta.docx", False) == "recibido"
    assert tg.clasificar("foto-oficio.jpg", False) == "recibido"      # una imagen enviada como archivo es un documento
    assert tg.clasificar("telegram-5.jpg", True) == "foto"             # una foto del grupo va a la Fototeca
    assert tg.clasificar("visita.mp4", False) == "foto"
    assert tg.clasificar("datos.xlsx", False) == ""

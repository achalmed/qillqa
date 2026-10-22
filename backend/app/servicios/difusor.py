"""backend/app/servicios/difusor.py — la difusión en vivo de Qillqa es la de Tiqsi (`tiqsi.en_vivo`, fase 10.2b, Rimay
R2, 2026-10-20): el canal en vivo es de la plataforma y lo comparten el chat, la campana y la presencia. Este módulo
solo lo reexporta para quienes lo importan con su nombre de siempre.
"""
from tiqsi.en_vivo import (  # noqa: F401
    TAM_COLA, a_la_vista, cancelar, conectados, poner_mirando, publicar, suscribir, viendo,
)

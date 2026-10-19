"""Bóveda de las claves de las mesas de partes (2026-10-08, Edison: «que el usuario no esté
buscando las contraseñas y usuarios de las mesas de partes»).

Cifrado simétrico autenticado con Fernet (AES-128-CBC + HMAC-SHA256, de `cryptography`). La
clave sale de SGDP_BOVEDA_CLAVE (una clave Fernet: `python -c "from cryptography.fernet import
Fernet; print(Fernet.generate_key().decode())"`); si no está, se deriva de JWT_SECRET con HKDF,
así funciona sin configurar nada, pero entonces cambiar JWT_SECRET deja ilegibles las claves
guardadas. La base de datos y sus respaldos solo ven texto cifrado.
"""

import base64
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import config


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    propia = (config.sgdp_boveda_clave or "").strip()
    if propia:
        return Fernet(propia.encode())
    derivada = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"sgdp-boveda", info=b"mesas-de-partes").derive(
        config.jwt_secret.encode()
    )
    return Fernet(base64.urlsafe_b64encode(derivada))


def cifrar(texto: str) -> str:
    return _fernet().encrypt(texto.encode()).decode() if texto else ""


def descifrar(cifrado: str) -> str:
    """'' si no hay clave; ValueError si el texto no se puede descifrar (clave cambiada)."""
    if not cifrado:
        return ""
    try:
        return _fernet().decrypt(cifrado.encode()).decode()
    except InvalidToken as error:
        raise ValueError("No se pudo descifrar la clave: ¿cambió SGDP_BOVEDA_CLAVE o JWT_SECRET?") from error

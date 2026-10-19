"""Autenticacion de Qillqa: hash de claves (stdlib) y sesiones JWT.

Sin dependencias de hashing externas: PBKDF2-SHA256 de hashlib con sal
aleatoria por usuario. Las cuentas las crea el administrador (no hay
autoregistro).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.db import obtener_sesion
from app.modelos import Usuario

_ITERACIONES = 200_000
_esquema_bearer = HTTPBearer(auto_error=False)

# Largo mínimo de una contraseña. Ocho no es un número mágico: es el punto a
# partir del cual una clave deja de caer en el primer intento de un ataque de
# diccionario. Rige tanto para la que elige cada persona como para la temporal
# que pone el administrador (Edison 2026-09-05).
LARGO_MINIMO_CLAVE = 8

# Claves que NO se aceptan aunque tengan el largo: son las primeras que alguien
# probaría en un sistema del Estado peruano con enlace público.
_CLAVES_PROHIBIDAS = {
    "12345678", "123456789", "1234567890", "contrasena", "contraseña",
    "password", "qwertyui", "abcd1234", "despacho", "congreso",
}


def clave_inicial(nombre_usuario: str, dni: str = "") -> str:
    """La contraseña con la que se estrena una cuenta: el DNI de la persona
    (regla de Edison 2026-09-05) o, si la cuenta no tiene DNI, el mismo nombre
    de usuario. Es deliberadamente adivinable —para que el administrador no
    tenga que inventar ni comunicar nada— y por eso NUNCA sirve para trabajar:
    entra una vez y el sistema exige cambiarla."""
    dni = (dni or "").strip()
    return dni if dni else nombre_usuario.strip().lower()


def validar_clave(
    clave: str, usuario: str = "", temporal: bool = False, dni: str = ""
) -> None:
    """Rechaza las contraseñas que no sirven. Lanza HTTPException con el motivo
    en castellano llano: el mensaje lo lee quien la está eligiendo.

    `temporal=True` afloja las reglas para la clave de un solo uso que entrega
    el administrador: puede ser corta y puede ser igual al usuario (de hecho,
    por omisión ES el usuario). No es una excepción peligrosa porque esa clave
    no deja hacer NADA: `usuario_actual` bloquea la API hasta cambiarla.
    """
    clave = clave.strip()
    if temporal:
        if len(clave) < 3:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "La contraseña temporal debe tener al menos 3 caracteres.",
            )
        return
    if len(clave) < LARGO_MINIMO_CLAVE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"La contraseña debe tener al menos {LARGO_MINIMO_CLAVE} caracteres.",
        )
    if clave.lower() in _CLAVES_PROHIBIDAS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Esa contraseña es de las primeras que alguien probaría. Elija otra.",
        )
    if dni and clave == dni.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "La contraseña no puede ser su DNI: esa fue solo la clave de entrada.",
        )
    if usuario and clave.lower() == usuario.strip().lower():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "La contraseña no puede ser igual al nombre de usuario.",
        )


def _normalizar(clave: str) -> str:
    """Los espacios de los BORDES no cuentan, ni al guardar ni al verificar.

    No es cosmetica: la clave viaja por WhatsApp y se PEGA, y el teclado del
    celular agrega un espacio despues de la ultima palabra. Antes esto se
    hacia solo al GUARDARLA (auth.py) y no al verificarla, y esa asimetria
    dejaba a la persona fuera de su propia cuenta: cambiaba su clave, seguia
    trabajando con la sesion abierta, y al volver el sistema comparaba
    «MiClave » contra el hash de «MiClave» y respondia «contraseña
    incorrecta» —con el DNI ya invalidado, porque el cambio SI se habia
    guardado— (bug reportado por Edison 2026-09-09).

    La regla vive aqui, en la primitiva, y no en cada llamador: mientras
    estuvo en el llamador, el camino de lectura se olvido de aplicarla.
    Los espacios INTERIORES se respetan: una frase de paso los necesita.
    """
    return clave.strip()


def hashear_clave(clave: str) -> str:
    sal = secrets.token_bytes(16)
    resumen = hashlib.pbkdf2_hmac(
        "sha256", _normalizar(clave).encode(), sal, _ITERACIONES
    )
    return f"{sal.hex()}:{resumen.hex()}"


def verificar_clave(clave: str, guardado: str) -> bool:
    try:
        sal_hex, resumen_hex = guardado.split(":")
    except ValueError:
        return False
    resumen = hashlib.pbkdf2_hmac(
        "sha256", _normalizar(clave).encode(), bytes.fromhex(sal_hex), _ITERACIONES
    )
    return secrets.compare_digest(resumen.hex(), resumen_hex)


def crear_token(usuario: Usuario) -> str:
    ahora = datetime.now(timezone.utc)
    carga = {
        "sub": str(usuario.id),
        "nombre": usuario.nombre_completo,
        "rol": usuario.rol,
        "iat": ahora,
        "exp": ahora + timedelta(hours=config.horas_sesion),
    }
    return jwt.encode(carga, config.jwt_secret, algorithm="HS256")


async def usuario_autenticado(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_esquema_bearer),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Usuario:
    """Dependencia: exige un JWT válido y devuelve el usuario activo.

    NO comprueba si la clave es temporal: la usa solo el cambio de contraseña,
    que tiene que funcionar justamente cuando el resto está bloqueado. Todo lo
    demás usa `usuario_actual`."""
    no_autorizado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión inválida o vencida. Vuelva a iniciar sesión.",
    )
    if credenciales is None:
        raise no_autorizado
    try:
        carga = jwt.decode(
            credenciales.credentials, config.jwt_secret, algorithms=["HS256"]
        )
    except jwt.InvalidTokenError:
        raise no_autorizado
    usuario = (
        await sesion.execute(
            select(Usuario).where(Usuario.id == int(carga["sub"]))
        )
    ).scalar_one_or_none()
    if usuario is None or not usuario.activo:
        raise no_autorizado
    return usuario


async def usuario_con_clave_propia(
    usuario: Usuario = Depends(usuario_autenticado),
) -> Usuario:
    """Sesión válida Y contraseña ya elegida, aunque falten los datos del primer ingreso: la usa
    el propio perfil (`api/perfil.py`), que es justo donde se completan.

    Mientras la cuenta tenga una clave TEMPORAL (la que puso el administrador y
    viajó por un mensaje), esto responde 428 y el sistema no deja hacer nada
    más que cambiarla. La guarda vive en el servidor y no en la pantalla a
    propósito: ocultar el botón no impide llamar a la API con la clave que se
    filtró. `codigo` permite al frontend distinguir este caso de otros 428.
    """
    if usuario.debe_cambiar_clave:
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail={
                "codigo": "clave_temporal",
                "mensaje": (
                    "Su contraseña es temporal: elija una propia antes de "
                    "continuar."
                ),
            },
        )
    return usuario


async def usuario_actual(
    usuario: Usuario = Depends(usuario_con_clave_propia),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Usuario:
    """Dependencia normal de la API: sesión válida, contraseña ya elegida y, si al entrar por
    primera vez se le piden sus datos (servicios/perfil.py::pide_bienvenida), ya confirmados.
    Si no, 428 `datos_pendientes` y la web lleva al paso de bienvenida (2026-10-18)."""
    if usuario.datos_completos_en is None:
        from app.servicios import modulos, perfil

        cfg = perfil.normalizar_primer_ingreso(await modulos.ajuste_cacheado(sesion, perfil.CLAVE_PRIMER_INGRESO))
        if perfil.pide_bienvenida(usuario, cfg):
            raise HTTPException(
                status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                detail={"codigo": "datos_pendientes", "mensaje": "Complete sus datos para empezar."},
            )
    return usuario


async def solo_administrador(
    usuario: Usuario = Depends(usuario_actual),
) -> Usuario:
    """Dependencia: exige que el usuario autenticado sea administrador.

    Se apoya en `usuario_actual` (JWT válido + cuenta activa) y encima
    verifica el rol. La usan los endpoints del panel de administración.
    """
    if usuario.rol != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta acción es solo para administradores.",
        )
    return usuario

"""Inicio de sesión (usuario y clave -> token JWT) y cambio de contraseña.

El cambio de contraseña vive aquí y no en el panel de administración porque es
del USUARIO, no del administrador: cada persona elige la suya. El panel solo
puede RESTABLECERLA, y al hacerlo la deja marcada como temporal.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.servicios import modulos, perfil
from app.servicios.cuentas import DOMINIO
from app.modelos import SolicitudClave, Usuario
from app.seguridad import (
    crear_token,
    hashear_clave,
    usuario_autenticado,
    validar_clave,
    verificar_clave,
)

router = APIRouter(prefix="/api/auth", tags=["autenticación"])


class Credenciales(BaseModel):
    usuario: str
    clave: str


class CambioClavePropia(BaseModel):
    clave_actual: str
    clave_nueva: str = Field(max_length=200)


class OlvideClave(BaseModel):
    usuario: str = Field(max_length=50)
    nota: str = Field(default="", max_length=500)


@router.post("/login")
async def iniciar_sesion(
    credenciales: Credenciales,
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    # Se entra con el usuario, con el correo institucional completo o con su
    # parte local (rquispe@entidad.gob.pe o rquispe): así una cuenta antigua cuyo
    # usuario no coincide con el correo sigue entrando de las dos formas.
    ingresado = credenciales.usuario.strip().lower()
    local = ingresado.split("@", 1)[0]
    usuario = (
        await sesion.execute(
            select(Usuario).where(
                or_(
                    Usuario.nombre_usuario == ingresado,
                    func.lower(Usuario.email) == ingresado,
                    func.lower(Usuario.email) == f"{local}@{DOMINIO}",
                )
            ).order_by(Usuario.id)
        )
    ).scalars().first()
    if (
        usuario is None
        or not usuario.activo
        or not verificar_clave(credenciales.clave, usuario.clave_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos.",
        )
    return {
        "token": crear_token(usuario),
        "usuario": {
            "nombre": usuario.nombre_completo,
            "rol": usuario.rol,
            # Clave TEMPORAL (la puso el administrador): la interfaz manda
            # directo a la pantalla de cambio y el servidor bloquea el resto.
            "debe_cambiar_clave": usuario.debe_cambiar_clave,
            # Después de la contraseña, el paso de bienvenida (2026-10-18): sus datos.
            "debe_completar_datos": await _pide_datos(sesion, usuario),
        },
    }


async def _pide_datos(sesion: AsyncSession, usuario: Usuario) -> bool:
    cfg = perfil.normalizar_primer_ingreso(await modulos.ajuste_cacheado(sesion, perfil.CLAVE_PRIMER_INGRESO))
    return perfil.pide_bienvenida(usuario, cfg)


@router.post("/clave")
async def cambiar_clave_propia(
    datos: CambioClavePropia,
    usuario: Usuario = Depends(usuario_autenticado),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Cada persona cambia SU contraseña, dando la actual.

    Depende de `usuario_autenticado` y no de `usuario_actual` a propósito:
    tiene que funcionar justamente cuando la clave es temporal y el resto de la
    API está bloqueada. Exigir la clave actual evita que quien deje la sesión
    abierta en una computadora ajena le cambie la contraseña al dueño.
    """
    if not verificar_clave(datos.clave_actual, usuario.clave_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "La contraseña actual no es correcta."
        )
    if verificar_clave(datos.clave_nueva, usuario.clave_hash):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "La contraseña nueva no puede ser la misma que la anterior.",
        )
    validar_clave(datos.clave_nueva, usuario.nombre_usuario, dni=usuario.dni or "")
    # Sin .strip() aqui a proposito: la normalizacion de los bordes vive
    # DENTRO de hashear_clave/verificar_clave (seguridad.py::_normalizar), que
    # es lo unico que garantiza que guardar y verificar usen el mismo criterio.
    usuario.clave_hash = hashear_clave(datos.clave_nueva)
    usuario.debe_cambiar_clave = False
    await sesion.commit()
    # Token nuevo: el anterior se emitió cuando la cuenta aún estaba bloqueada.
    return {"ok": True, "token": crear_token(usuario), "debe_completar_datos": await _pide_datos(sesion, usuario)}


@router.post("/olvide")
async def olvide_mi_clave(
    datos: OlvideClave,
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """«¿Olvidaste tu contraseña?» — deja un aviso para el administrador.

    No hay recuperación por correo porque el sistema no guarda correos de los
    usuarios ni tiene servidor de envío: inventar un flujo de enlaces mágicos
    sería más frágil que el que ya existe, donde el administrador está en el
    mismo despacho. Lo que hace es registrar la solicitud; el administrador la
    ve en su panel y restablece la cuenta a su clave inicial con un clic.

    Responde SIEMPRE lo mismo, exista o no la cuenta: si contestara distinto,
    cualquiera podría averiguar qué usuarios hay probando nombres.
    """
    nombre = datos.usuario.strip().lower()
    if nombre:
        usuario = (
            await sesion.execute(
                select(Usuario).where(Usuario.nombre_usuario == nombre)
            )
        ).scalar_one_or_none()
        sesion.add(
            SolicitudClave(
                nombre_usuario=nombre[:50],
                usuario_id=usuario.id if usuario else None,
                nota=datos.nota.strip(),
            )
        )
        await sesion.commit()
    return {
        "ok": True,
        "mensaje": (
            "Aviso enviado. El administrador de la entidad restablecerá su "
            "contraseña y se lo comunicará."
        ),
    }

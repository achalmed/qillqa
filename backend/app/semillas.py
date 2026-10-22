"""Datos iniciales: la cuenta administradora.

Los contadores de numeración los siembra Gestión documental al preparar su base (servicios/qillqasqa_db.py, desde
Qillqasqa Q5a), leyendo las carpetas reales del archivo documental.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.modelos import Usuario
from app.seguridad import hashear_clave


async def _asegurar_usuario(
    sesion: AsyncSession, usuario: str, nombre: str, clave: str, rol: str,
    debe_cambiar_clave: bool = False,
) -> None:
    """Crea la cuenta si no existe (idempotente)."""
    existe = (
        await sesion.execute(
            select(Usuario.id).where(Usuario.nombre_usuario == usuario)
        )
    ).first()
    if not existe:
        sesion.add(
            Usuario(
                nombre_usuario=usuario,
                nombre_completo=nombre,
                clave_hash=hashear_clave(clave),
                rol=rol,
                debe_cambiar_clave=debe_cambiar_clave,
            )
        )


async def sembrar(sesion: AsyncSession) -> None:
    # Cuenta administradora inicial (DOC7, 2026-09-20): usuario y clave por entorno
    # (config.admin_usuario / admin_clave); sin clave, la inicial es el propio usuario y el
    # sistema obliga a cambiarla al primer ingreso. Idempotente: en una base que ya tiene
    # su administrador no cambia nada. Las cuentas del equipo se crean desde Administración;
    # ya no se siembra la cuenta compartida «usuario».
    await _asegurar_usuario(
        sesion, config.admin_usuario, "Administrador del sistema",
        config.admin_clave or config.admin_usuario, "administrador",
        debe_cambiar_clave=not config.admin_clave,
    )
    # La antigua cuenta admin/admin queda como DUEÑA HISTÓRICA de los
    # documentos importados (no se puede borrar por la llave foránea),
    # pero se DESACTIVA: nadie debe entrar con admin/admin.
    viejo = (
        await sesion.execute(
            select(Usuario).where(Usuario.nombre_usuario == "admin")
        )
    ).scalar_one_or_none()
    if viejo is not None and viejo.activo:
        viejo.activo = False

    # La copia de rigor (regla de Edison, 2026-09-05) ya no se siembra: la persona y su regla viven en
    # la base y se administran en Administración → Reglas de copia (D13: ningún nombre de la entidad en
    # el código). Una instalación nueva arranca sin reglas de copia.

    await sesion.commit()

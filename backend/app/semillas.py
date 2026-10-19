"""Datos iniciales: usuario admin y contadores de numeracion.

Los contadores se SIEMBRAN una sola vez leyendo las carpetas reales del
Marco Documental (SERIE-NNNN-fecha-descripcion), para que Qillqa
continue la numeracion oficial existente en vez de empezar de cero.
Despues de sembrados, la base de datos es la unica fuente de verdad.
"""

import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config, raiz_documentos
from app.tipos import TIPOS
from app.modelos import Contador, Usuario
from app.seguridad import hashear_clave

# Series reales del registro de tipos (OF, OM, OMB, OB, CARTA, MEM, INF, SOL, ACT…):
# antes solo cuatro literales, y un clon limpio sembraba las demás en cero.
SERIES = sorted({t["serie"] for t in TIPOS.values()}, key=len, reverse=True)
_PATRON_CARPETA = re.compile(r"^(" + "|".join(re.escape(s) for s in SERIES) + r")-(\d{4})-")


def _maximos_en_framework() -> dict[str, int]:
    """Escanea documentos/ del framework y devuelve el mayor numero por serie."""
    maximos = {s: 0 for s in SERIES}
    raiz = raiz_documentos()
    if not raiz.is_dir():
        return maximos
    for carpeta in raiz.glob("*/*/"):
        m = _PATRON_CARPETA.match(carpeta.name)
        if m:
            serie, numero = m.group(1), int(m.group(2))
            maximos[serie] = max(maximos[serie], numero)
    return maximos


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

    # Contadores: continuar la numeracion real del framework
    hay_contadores = (await sesion.execute(select(Contador.serie))).first()
    if not hay_contadores:
        for serie, maximo in _maximos_en_framework().items():
            sesion.add(
                Contador(
                    despacho_id=1,
                    serie=serie,
                    periodo=config.periodo,
                    ultimo=maximo,
                )
            )
    await sesion.commit()

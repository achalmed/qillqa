"""Panel de administración: gestión de las cuentas de usuario.

Solo para el rol 'administrador' (dependencia `solo_administrador`).
Reglas de diseño:
  - NO hay borrado físico de cuentas: las llaves foráneas de
    documentos/eventos lo impiden y la trazabilidad lo desaconseja. Una
    cuenta se DESACTIVA (activo=false) — deja de poder entrar pero
    conserva su historial.
  - El hash de la clave NUNCA se expone (solo la vista pública `_vista`).
  - Guardas anti-autobloqueo: nadie se desactiva ni se quita el rol de
    administrador a sí mismo, y el sistema no puede quedarse sin ningún
    administrador activo.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import SolicitudClave, Usuario
from app.seguridad import (
    LARGO_MINIMO_CLAVE,
    clave_inicial,
    hashear_clave,
    solo_administrador,
    usuario_actual,
    validar_clave,
)
from app.servicios import bitacora, cuentas, modulos, perfil

router = APIRouter(prefix="/api/admin", tags=["administración"])

# Roles válidos (espejo del comentario en modelos.Usuario). Centralizar
# aquí evita aceptar roles arbitrarios desde el formulario.
ROLES_VALIDOS = ("administrador", "secretaria", "asesor", "diputado", "prensa", "invitado")
# El mínimo lo fija seguridad.py, para que valga igual aquí y en el cambio
# que hace cada persona (antes aquí eran 4 caracteres: se quedaba corto).
_CLAVE_MIN = LARGO_MINIMO_CLAVE


class NuevoUsuario(BaseModel):
    """Alta de una cuenta a partir de los DATOS DE LA PERSONA (Edison
    2026-09-05): el correo institucional y el usuario se generan solos y la
    clave inicial es el DNI. Los tres se pueden forzar a mano si hiciera falta
    (una cuenta especial, un correo que no sigue la regla)."""
    nombres: str = Field(min_length=1, max_length=80)
    apellidos: str = Field(min_length=1, max_length=80)
    dni: str = Field(default="", max_length=15)
    # El CARGO es lo único que se elige (lista `cuentas.CARGOS`); los permisos
    # salen de él. `administrador` es el permiso extra de administrar el
    # sistema. `rol` se acepta solo por compatibilidad (si no viene cargo).
    cargo: str = Field(default="", max_length=120)
    administrador: bool = False
    rol: str = ""
    # Vacíos = generados: correo «<inicial><apellido>@entidad.gob.pe» y
    # usuario = parte local del correo.
    email: str = Field(default="", max_length=120)
    nombre_usuario: str = Field(default="", max_length=50)
    # Vacía = la clave INICIAL: el DNI (o el usuario si no hay DNI). Es de un
    # solo uso: la persona la cambia obligatoriamente al entrar.
    clave: str = Field(default="", max_length=200)


class CambioUsuario(BaseModel):
    """Campos editables de una cuenta. El nombre de usuario TAMBIÉN se puede
    cambiar a mano (Edison 2026-09-05): el historial cuelga del id, no del
    nombre, así que renombrar no rompe nada; solo hay que avisar a la persona
    con qué entra ahora."""
    nombre_usuario: str | None = Field(default=None, max_length=50)
    nombres: str | None = Field(default=None, max_length=80)
    apellidos: str | None = Field(default=None, max_length=80)
    dni: str | None = Field(default=None, max_length=15)
    email: str | None = Field(default=None, max_length=120)
    cargo: str | None = Field(default=None, max_length=120)
    # Perfil (2026-10-12): celular e «Info», con las mismas reglas que en Mi perfil.
    celular: str | None = Field(default=None, max_length=40)
    acerca: str | None = Field(default=None, max_length=400)
    administrador: bool | None = None
    nombre_completo: str | None = Field(default=None, max_length=120)
    rol: str | None = None
    activo: bool | None = None
    # Paso de bienvenida (2026-10-18): True vuelve a pedirle sus datos al entrar; False lo da por hecho.
    pedir_datos: bool | None = None


class PrimerIngreso(BaseModel):
    activo: bool = True
    excluir_cargos: list[str] = Field(default_factory=list, max_length=20)


class CambioClave(BaseModel):
    # Vacía = restablecer a la clave inicial (el DNI o, sin DNI, el usuario).
    clave: str = Field(default="", max_length=200)


async def _cfg_ingreso(sesion: AsyncSession) -> dict:
    return perfil.normalizar_primer_ingreso(await modulos.ajuste_cacheado(sesion, perfil.CLAVE_PRIMER_INGRESO))


def _vista(u: Usuario, cfg_ingreso: dict | None = None) -> dict:
    """Representación pública de una cuenta — jamás incluye clave_hash."""
    return {
        # Paso de bienvenida (2026-10-18): si al entrar se le pedirán sus datos y si está exceptuada.
        "datos_completos_en": u.datos_completos_en.isoformat() if u.datos_completos_en else None,
        "datos_pendientes": perfil.pide_bienvenida(u, cfg_ingreso) if cfg_ingreso else False,
        "datos_exceptuado": perfil.exceptuado(u, cfg_ingreso) if cfg_ingreso else False,
        "id": u.id,
        "nombre_usuario": u.nombre_usuario,
        "nombre_completo": u.nombre_completo,
        "nombres": u.nombres or "",
        "apellidos": u.apellidos or "",
        "dni": u.dni or "",
        "email": u.email or "",
        "cargo": u.cargo or cuentas.CARGO_POR_ROL.get(u.rol, ""),
        "celular": u.telefono or "",
        "acerca": u.acerca or "",
        "foto": perfil.version_foto(u.foto or ""),
        "rol": u.rol,
        "administrador": u.rol == "administrador",
        "activo": u.activo,
        # La cuenta aún usa la clave temporal que puso el administrador: el
        # panel lo marca para saber quién todavía no entró a elegir la suya.
        "debe_cambiar_clave": u.debe_cambiar_clave,
        "creado_en": u.creado_en.isoformat() if u.creado_en else None,
    }


def _validar_rol(rol: str) -> None:
    if rol not in ROLES_VALIDOS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Rol inválido. Use uno de: {', '.join(ROLES_VALIDOS)}.",
        )


async def _obtener(sesion: AsyncSession, usuario_id: int) -> Usuario:
    u = (
        await sesion.execute(select(Usuario).where(Usuario.id == usuario_id))
    ).scalar_one_or_none()
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La cuenta no existe.")
    return u


async def _otros_admins_activos(sesion: AsyncSession, excluir_id: int) -> int:
    """Cuántos administradores activos hay APARTE de `excluir_id`."""
    return (
        await sesion.execute(
            select(func.count())
            .select_from(Usuario)
            .where(
                Usuario.rol == "administrador",
                Usuario.activo.is_(True),
                Usuario.id != excluir_id,
            )
        )
    ).scalar_one()


@router.get("/equipo")
async def listar_equipo(
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Cuentas ACTIVAS de la entidad, para el selector de responsable
    («encargar el documento a…»). La ve cualquier usuario: asignar trabajo no
    es una acción de administración, y solo expone nombre y rol — nunca el
    hash de la clave ni el estado de la cuenta."""
    filas = (
        (
            await sesion.execute(
                select(Usuario)
                .where(Usuario.activo.is_(True))
                .order_by(Usuario.nombre_completo)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": u.id,
            "nombre_completo": u.nombre_completo,
            "rol": u.rol,
            "cargo": u.cargo or cuentas.CARGO_POR_ROL.get(u.rol, ""),
        }
        for u in filas
    ]


@router.get("/usuarios")
async def listar_usuarios(
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    filas = (
        (await sesion.execute(select(Usuario).order_by(Usuario.creado_en)))
        .scalars()
        .all()
    )
    cfg = await _cfg_ingreso(sesion)
    return [_vista(u, cfg) for u in filas]


async def _usuario_libre(sesion: AsyncSession, base: str) -> str:
    """`base` si nadie lo usa; si no, base2, base3… (nunca choca)."""
    candidato, n = base, 1
    while True:
        existe = (
            await sesion.execute(select(Usuario.id).where(Usuario.nombre_usuario == candidato))
        ).first()
        if not existe:
            return candidato
        n += 1
        candidato = f"{base}{n}"


def _validar_dni(dni: str) -> str:
    dni = (dni or "").strip()
    if dni and not cuentas.dni_valido(dni):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El DNI debe tener 8 dígitos.")
    return dni


@router.get("/usuarios/previsualizar")
async def previsualizar_cuenta(
    nombres: str = "",
    apellidos: str = "",
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Qué correo y qué usuario se generarían con estos nombres (para que el
    formulario los muestre antes de crear)."""
    email = cuentas.correo_institucional(nombres, apellidos)
    base = cuentas.usuario_de_correo(email)
    return {
        "email": email,
        "nombre_usuario": await _usuario_libre(sesion, base) if base else "",
    }


@router.post("/usuarios", status_code=status.HTTP_201_CREATED)
async def crear_usuario(
    datos: NuevoUsuario,
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if datos.cargo.strip():
        cargo = cuentas.normalizar_cargo(datos.cargo)
        if not cargo:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Cargo no válido. Use uno de: {', '.join(cuentas.CARGOS)}.",
            )
        rol = cuentas.rol_de(cargo, datos.administrador)
    else:
        # Compatibilidad: sin cargo, se acepta el rol de siempre.
        _validar_rol(datos.rol)
        rol = datos.rol
        cargo = cuentas.CARGO_POR_ROL.get(rol, "")
    nombres = " ".join(datos.nombres.split())
    apellidos = " ".join(datos.apellidos.split())
    dni = _validar_dni(datos.dni)
    # Correo: el indicado o el generado con la regla de la entidad.
    email = datos.email.strip().lower() or cuentas.correo_institucional(nombres, apellidos)
    if not email:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No se pudo generar el correo: indique nombres y apellidos (o escriba el correo).",
        )
    # Usuario: el indicado (normalizado) o la parte local del correo; si ya
    # existe, se numera (jperez2) en vez de fallar.
    base = datos.nombre_usuario.strip().lower() or cuentas.usuario_de_correo(email)
    if len(base) < 3:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "El usuario debe tener al menos 3 caracteres.",
        )
    nombre_usuario = await _usuario_libre(sesion, base)
    otro_correo = (
        await sesion.execute(select(Usuario.id).where(func.lower(Usuario.email) == email))
    ).first()
    if otro_correo:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo.")
    clave = datos.clave.strip() or clave_inicial(nombre_usuario, dni)
    validar_clave(clave, nombre_usuario, temporal=True)
    u = Usuario(
        nombre_usuario=nombre_usuario,
        nombre_completo=cuentas.nombre_completo(nombres, apellidos),
        nombres=nombres,
        apellidos=apellidos,
        dni=dni,
        email=email,
        cargo=cargo,
        clave_hash=hashear_clave(clave),
        rol=rol,
        # La clave inicial (el DNI) es de UN solo uso: la persona elige la suya
        # en el primer acceso y hasta entonces el sistema no la deja avanzar.
        debe_cambiar_clave=True,
    )
    sesion.add(u)
    await sesion.flush()
    await cuentas.sincronizar_persona(sesion, u)
    await sesion.commit()
    await sesion.refresh(u)
    # `clave_entregada` es lo que el administrador le dice a la persona. Se
    # devuelve una sola vez, al crearla: después ya no se puede leer.
    return {**_vista(u, await _cfg_ingreso(sesion)), "clave_entregada": clave}


@router.patch("/usuarios/{usuario_id}")
async def actualizar_usuario(
    usuario_id: int,
    cambios: CambioUsuario,
    admin: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    u = await _obtener(sesion, usuario_id)

    # --- Nombre de usuario (login) ---
    if cambios.nombre_usuario is not None:
        nuevo = cambios.nombre_usuario.strip().lower()
        if nuevo and nuevo != u.nombre_usuario:
            if len(nuevo) < 3:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "El usuario debe tener al menos 3 caracteres.",
                )
            ocupado = (
                await sesion.execute(
                    select(Usuario.id).where(Usuario.nombre_usuario == nuevo, Usuario.id != u.id)
                )
            ).first()
            if ocupado:
                raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese usuario.")
            u.nombre_usuario = nuevo

    # --- Datos de la persona ---
    if cambios.nombres is not None:
        u.nombres = " ".join(cambios.nombres.split())
    if cambios.apellidos is not None:
        u.apellidos = " ".join(cambios.apellidos.split())
    if cambios.nombres is not None or cambios.apellidos is not None:
        completo = cuentas.nombre_completo(u.nombres or "", u.apellidos or "")
        if completo:
            u.nombre_completo = completo
    if cambios.nombre_completo is not None and cambios.nombre_completo.strip():
        u.nombre_completo = cambios.nombre_completo.strip()
    if cambios.dni is not None:
        u.dni = _validar_dni(cambios.dni)
    if cambios.cargo is not None:
        cargo = cuentas.normalizar_cargo(cambios.cargo)
        if not cargo:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Cargo no válido. Use uno de: {', '.join(cuentas.CARGOS)}.",
            )
        u.cargo = cargo
    # El rol se deriva del cargo + la casilla de administrador; el chequeo de
    # más abajo (no dejar el sistema sin administrador) se aplica igual.
    if cambios.cargo is not None or cambios.administrador is not None:
        es_admin = (
            cambios.administrador
            if cambios.administrador is not None
            else u.rol == "administrador"
        )
        cambios.rol = cuentas.rol_de(u.cargo or "", es_admin)
    if cambios.email is not None:
        email = cambios.email.strip().lower()
        if email and email != (u.email or "").lower():
            otro = (
                await sesion.execute(
                    select(Usuario.id).where(func.lower(Usuario.email) == email, Usuario.id != u.id)
                )
            ).first()
            if otro:
                raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo.")
        u.email = email
    try:
        if cambios.celular is not None:
            u.telefono = perfil.normalizar_celular(cambios.celular)
        if cambios.acerca is not None:
            u.acerca = perfil.validar_acerca(cambios.acerca)
    except perfil.DatoInvalido as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))

    # --- Cambio de rol ---
    if cambios.rol is not None and cambios.rol != u.rol:
        _validar_rol(cambios.rol)
        quita_admin = u.rol == "administrador" and cambios.rol != "administrador"
        if quita_admin and u.id == admin.id:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "No puede quitarse a usted mismo el rol de administrador.",
            )
        if (
            quita_admin
            and u.activo
            and await _otros_admins_activos(sesion, u.id) == 0
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "No puede quitar el rol al único administrador activo del sistema.",
            )
        u.rol = cambios.rol

    # --- Activar / desactivar ---
    if cambios.activo is not None and cambios.activo != u.activo:
        if not cambios.activo:  # se está desactivando
            if u.id == admin.id:
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "No puede desactivar su propia cuenta."
                )
            if (
                u.rol == "administrador"
                and await _otros_admins_activos(sesion, u.id) == 0
            ):
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "No puede desactivar al único administrador activo del sistema.",
                )
        u.activo = cambios.activo

    if cambios.pedir_datos is not None:
        u.datos_completos_en = None if cambios.pedir_datos else (u.datos_completos_en or datetime.now(timezone.utc))

    # La ficha del directorio sigue a la cuenta (nombre, cargo, correo, activo).
    await cuentas.sincronizar_persona(sesion, u)
    await sesion.commit()
    await sesion.refresh(u)
    return _vista(u, await _cfg_ingreso(sesion))


# --- Compartir el acceso (2026-10-18) ---------------------------------------------------------------
# El enlace con el que se entra a Qillqa, para el mensaje de bienvenida que se pega en el chat
# (componentes/admin/CompartirAcceso.tsx). Del `.env` (SGDP_URL_PUBLICA); vacío, la web usa el suyo.
@router.get("/enlace")
async def enlace_del_sistema(_: Usuario = Depends(solo_administrador)) -> dict:
    from app.config import config

    return {"enlace": (config.sgdp_url_publica or "").rstrip("/")}


# --- Datos al primer ingreso (2026-10-18) ------------------------------------------------------------
# Si se usa el paso de bienvenida y qué cargos no lo pasan (de fábrica, «Diputado»). En `ajustes`.
@router.get("/primer-ingreso")
async def ver_primer_ingreso(_: Usuario = Depends(solo_administrador), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    return {**await _cfg_ingreso(sesion), "cargos": list(cuentas.CARGOS), "datos": list(perfil.DATOS_PEDIDOS.values())}


@router.put("/primer-ingreso")
async def guardar_primer_ingreso(datos: PrimerIngreso, admin: Usuario = Depends(solo_administrador),
                                 sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    from app.modelos import Ajuste

    limpio = perfil.normalizar_primer_ingreso(datos.model_dump())
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": perfil.CLAVE_PRIMER_INGRESO})
    if fila is None:
        sesion.add(Ajuste(despacho_id=1, clave=perfil.CLAVE_PRIMER_INGRESO, valor=limpio))
    else:
        fila.valor = limpio
    bitacora.registrar(sesion, None, admin, "ajustes",
                       f"Datos al primer ingreso: {'en uso' if limpio['activo'] else 'apagado'}; sin pedirlos a {', '.join(limpio['excluir_cargos']) or 'nadie'}")
    await sesion.commit()
    modulos.invalidar()
    return {**limpio, "cargos": list(cuentas.CARGOS), "datos": list(perfil.DATOS_PEDIDOS.values())}


@router.post("/usuarios/{usuario_id}/clave")
async def restablecer_clave(
    usuario_id: int,
    datos: CambioClave,
    admin: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    u = await _obtener(sesion, usuario_id)
    clave = datos.clave.strip() or clave_inicial(u.nombre_usuario, u.dni or "")
    validar_clave(clave, u.nombre_usuario, temporal=True)
    u.clave_hash = hashear_clave(clave)
    # Restablecer = entregar una clave temporal: la persona tendrá que elegir
    # la suya en cuanto entre, y hasta entonces el sistema no la deja avanzar.
    u.debe_cambiar_clave = True
    # Si había pedido ayuda desde «¿Olvidaste tu contraseña?», queda atendido:
    # el aviso desaparece del panel sin que nadie tenga que acordarse.
    abiertas = (
        await sesion.execute(
            select(SolicitudClave).where(
                SolicitudClave.usuario_id == u.id,
                SolicitudClave.atendida.is_(False),
            )
        )
    ).scalars().all()
    for s in abiertas:
        s.atendida = True
        s.atendida_por = admin.id
        s.atendida_en = datetime.now(timezone.utc)
    await sesion.commit()
    return {
        "ok": True,
        "nombre_usuario": u.nombre_usuario,
        "debe_cambiar_clave": True,
        "clave_entregada": clave,
        "solicitudes_atendidas": len(abiertas),
    }


@router.get("/solicitudes-clave")
async def listar_solicitudes_clave(
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Quién pidió ayuda desde «¿Olvidaste tu contraseña?» y sigue esperando.

    Se muestran también las de nombres que no existen: que alguien insista con
    un usuario equivocado es información útil (suele ser que no recuerda su
    propio usuario, no que esté probando cuentas).
    """
    filas = (
        (
            await sesion.execute(
                select(SolicitudClave)
                .where(SolicitudClave.atendida.is_(False))
                .order_by(SolicitudClave.creado_en.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": s.id,
            "nombre_usuario": s.nombre_usuario,
            "usuario_id": s.usuario_id,
            "existe": s.usuario_id is not None,
            "nota": s.nota,
            "creado_en": s.creado_en.isoformat() if s.creado_en else None,
        }
        for s in filas
    ]


@router.post("/solicitudes-clave/{solicitud_id}/descartar")
async def descartar_solicitud_clave(
    solicitud_id: int,
    admin: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Cierra el aviso sin restablecer nada (la persona se acordó, o el nombre
    no corresponde a ninguna cuenta)."""
    s = await sesion.get(SolicitudClave, solicitud_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La solicitud no existe.")
    s.atendida = True
    s.atendida_por = admin.id
    s.atendida_en = datetime.now(timezone.utc)
    await sesion.commit()
    return {"ok": True}

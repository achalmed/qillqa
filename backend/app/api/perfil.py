"""backend/app/api/perfil.py — el PERFIL de cada persona y su tarjeta de contacto (2026-10-12).

  · `GET|PUT /api/cuenta/perfil`: la propia persona ve y edita nombres, apellidos, DNI, correo,
    celular, cargo (solo entre los de su rol) e «Info». El rol se muestra; lo cambia solo un
    administrador, desde el panel de siempre (`api/admin.py`). La contraseña tampoco va aquí:
    sigue en `POST /api/auth/clave`.
  · `POST /api/cuenta/bienvenida` (2026-10-18): el paso de bienvenida del primer ingreso; guarda
    como el PUT y, si ya no falta nada (`servicios/perfil.py::datos_faltantes`), lo da por cerrado
    (`datos_completos_en`). Mi perfil, la foto y la bienvenida usan `usuario_con_clave_propia`: son
    justo lo que hay que poder usar mientras los datos están pendientes.
  · `POST|DELETE /api/cuenta/foto`: sube (recortada a 512 px, JPEG) o quita la foto.
  · `GET /api/usuarios/{id}/perfil`: la tarjeta para el equipo, con «visto hace…» de la
    presencia; qué datos lleva lo decide `servicios/perfil.py::tarjeta` (el DNI, solo la propia
    persona o quien administra; un invitado ve la tarjeta sin correo ni celular).
  · `GET /api/usuarios/{id}/foto`: la imagen, por `enviar_archivo` (ETag/304).
  · `GET /api/usuarios/fotos`: `{id: versión}` de quien tiene foto, para los avatares del chat.

Las fotos viven en `chat/perfiles/` de la raíz documental (`config.raiz_documentos`, la misma
que usa el chat para lo que se adjunta).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import raiz_documentos
from app.db import obtener_sesion
from app.modelos import Usuario
from app.seguridad import usuario_actual, usuario_con_clave_propia
from app.servicios import cuentas, modulos
from app.servicios import perfil as svc
from app.servicios import presencia
from app.api.archivos import enviar_archivo

router = APIRouter(prefix="/api", tags=["perfil"])


class PerfilPropio(BaseModel):
    """Lo que la persona cambia de sí misma. Lo que no viaja (None) no se toca: cada fila del
    perfil guarda solo su dato."""
    nombres: str | None = Field(default=None, max_length=200)
    apellidos: str | None = Field(default=None, max_length=200)
    dni: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=200)
    celular: str | None = Field(default=None, max_length=40)
    cargo: str | None = Field(default=None, max_length=120)
    acerca: str | None = Field(default=None, max_length=400)


def _presencia(u: Usuario) -> tuple[str, object]:
    latido = presencia.latido_de(u.id)
    return presencia.estado_de(latido), (latido.ultimo if latido else u.ultima_actividad)


def _mi_perfil(u: Usuario, bienvenida: bool = False) -> dict:
    estado, visto = _presencia(u)
    return {
        **svc.tarjeta(u, u, estado, visto),
        "cargos": svc.cargos_permitidos(u.rol),
        "max_acerca": svc.MAX_ACERCA,
        # El paso de bienvenida: si toca y qué falta todavía.
        "bienvenida": bienvenida,
        "faltan": svc.datos_faltantes(u),
    }


async def _pide_bienvenida(sesion: AsyncSession, u: Usuario) -> bool:
    cfg = svc.normalizar_primer_ingreso(await modulos.ajuste_cacheado(sesion, svc.CLAVE_PRIMER_INGRESO))
    return svc.pide_bienvenida(u, cfg)


def _invalido(e: svc.DatoInvalido) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))


@router.get("/cuenta/perfil")
async def ver_mi_perfil(usuario: Usuario = Depends(usuario_con_clave_propia),
                        sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    return _mi_perfil(usuario, await _pide_bienvenida(sesion, usuario))


@router.put("/cuenta/perfil")
async def guardar_mi_perfil(
    datos: PerfilPropio,
    usuario: Usuario = Depends(usuario_con_clave_propia),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    await _aplicar(datos, usuario, sesion)
    await sesion.commit()
    await sesion.refresh(usuario)
    return _mi_perfil(usuario, await _pide_bienvenida(sesion, usuario))


@router.post("/cuenta/bienvenida")
async def cerrar_bienvenida(
    datos: PerfilPropio,
    usuario: Usuario = Depends(usuario_con_clave_propia),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Guarda los datos del paso de bienvenida y, completos, lo cierra. Lo mismo que Mi perfil: la
    ficha del directorio se pone al día con la cuenta."""
    await _aplicar(datos, usuario, sesion)
    faltan = svc.datos_faltantes(usuario)
    if faltan:
        await sesion.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Falta: {', '.join(faltan)}.")
    if usuario.datos_completos_en is None:
        usuario.datos_completos_en = datetime.now(timezone.utc)
    await sesion.commit()
    await sesion.refresh(usuario)
    return _mi_perfil(usuario, False)


async def _aplicar(datos: PerfilPropio, u: Usuario, sesion: AsyncSession) -> None:
    """Lo que la persona cambia de sí misma (sin commit). Lo que no viaja (None) no se toca."""
    try:
        if datos.nombres is not None:
            u.nombres = svc.limpiar_nombre(datos.nombres, "nombres")
        if datos.apellidos is not None:
            u.apellidos = svc.limpiar_nombre(datos.apellidos, "apellidos")
        if datos.dni is not None:
            u.dni = svc.validar_dni(datos.dni)
        if datos.celular is not None:
            u.telefono = svc.normalizar_celular(datos.celular)
        if datos.acerca is not None:
            u.acerca = svc.validar_acerca(datos.acerca)
        if datos.cargo is not None:
            cargo = svc.validar_cargo(datos.cargo, u.rol)
            if cargo:
                u.cargo = cargo
        if datos.email is not None:
            email = svc.validar_correo(datos.email)
            if email and email != (u.email or "").lower():
                otro = (await sesion.execute(
                    select(Usuario.id).where(func.lower(Usuario.email) == email, Usuario.id != u.id)
                )).first()
                if otro:
                    raise HTTPException(status.HTTP_409_CONFLICT, "Ese correo ya es de otra cuenta.")
            u.email = email
    except svc.DatoInvalido as e:
        raise _invalido(e)
    # `nombre_completo` sigue siendo «nombres apellidos» (bitácora, bandeja, chat).
    if datos.nombres is not None or datos.apellidos is not None:
        completo = cuentas.nombre_completo(u.nombres or "", u.apellidos or "")
        if completo:
            u.nombre_completo = completo
    # La ficha del directorio sigue a la cuenta (nombre, cargo, correo, celular).
    await cuentas.sincronizar_persona(sesion, u)


@router.post("/cuenta/foto")
async def subir_mi_foto(
    archivo: UploadFile = File(...),
    usuario: Usuario = Depends(usuario_con_clave_propia),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    contenido = await archivo.read(svc.MAX_FOTO_BYTES + 1)
    if len(contenido) > svc.MAX_FOTO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "La foto pesa más de 15 MB.")
    try:
        jpeg = svc.recortar_foto(contenido)
    except svc.DatoInvalido as e:
        raise _invalido(e)
    raiz = raiz_documentos()
    relativa = svc.nombre_foto(usuario.id, jpeg)
    destino = raiz / relativa
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(jpeg)
    anterior = svc.ruta_foto(raiz, usuario.foto or "")
    usuario.foto = str(relativa)
    await sesion.commit()
    if anterior is not None and anterior != destino.resolve():
        anterior.unlink(missing_ok=True)
    await sesion.refresh(usuario)
    return _mi_perfil(usuario)


@router.delete("/cuenta/foto")
async def quitar_mi_foto(
    usuario: Usuario = Depends(usuario_con_clave_propia),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    anterior = svc.ruta_foto(raiz_documentos(), usuario.foto or "")
    usuario.foto = ""
    await sesion.commit()
    if anterior is not None:
        anterior.unlink(missing_ok=True)
    await sesion.refresh(usuario)
    return _mi_perfil(usuario)


@router.get("/usuarios/fotos")
async def fotos_del_equipo(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Quién tiene foto y en qué versión: los avatares la piden solo si figura aquí."""
    filas = (await sesion.execute(select(Usuario.id, Usuario.foto).where(Usuario.foto != ""))).all()
    return {"fotos": {str(i): svc.version_foto(f) for i, f in filas if f}}


@router.get("/usuarios/{usuario_id}/perfil")
async def tarjeta_de(
    usuario_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    otro = await sesion.get(Usuario, usuario_id)
    if otro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esa cuenta no existe.")
    estado, visto = _presencia(otro)
    return svc.tarjeta(otro, usuario, estado, visto)


@router.get("/usuarios/{usuario_id}/foto")
async def foto_de(
    usuario_id: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    otro = await sesion.get(Usuario, usuario_id)
    ruta = svc.ruta_foto(raiz_documentos(), otro.foto or "") if otro else None
    if ruta is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sin foto.")
    return enviar_archivo(ruta, f"foto-{usuario_id}.jpg", "image/jpeg", peticion)

"""Copias (c.c.) sugeridas: consulta para el editor y mantenimiento de reglas.

Ver `servicios/copias.py` para el porqué. Aquí solo están las rutas: consultar
las sugerencias de un tipo de documento (cualquier usuario, es parte de
redactar) y administrar las reglas (solo administrador, porque una regla afecta
a todos los documentos que se escriban de ahí en adelante).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Persona, ReglaCopia, Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import copias as svc

router = APIRouter(prefix="/api/copias", tags=["copias"])


class DatosRegla(BaseModel):
    # Vacío = la copia va en TODOS los tipos de documento.
    tipos: str = Field(default="", max_length=300)
    persona_id: int | None = None
    tratamiento: str = Field(default="Señor:", max_length=40)
    nombre: str = Field(default="", max_length=200)
    cargo: str = Field(default="", max_length=300)
    motivo: str = Field(default="", max_length=1000)
    orden: int = 0
    activa: bool = True


def _vista(r: ReglaCopia) -> dict:
    return {
        "id": r.id,
        "tipos": r.tipos,
        "persona_id": r.persona_id,
        "tratamiento": r.tratamiento,
        "nombre": r.nombre,
        "cargo": r.cargo,
        "motivo": r.motivo,
        "orden": r.orden,
        "activa": r.activa,
    }


@router.get("/sugeridas")
async def listar_sugeridas(
    tipo: str = "",
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Copias que corresponden a un tipo de documento, con el cargo VIGENTE del
    directorio y el aviso de si ese cargo cambió desde que se creó la regla."""
    return await svc.sugeridas(sesion, tipo)


@router.get("/reglas")
async def listar_reglas(
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Todas las reglas, activas o no (el listado lo ve cualquiera; editarlas,
    solo el administrador)."""
    filas = (
        (
            await sesion.execute(
                select(ReglaCopia).order_by(ReglaCopia.orden, ReglaCopia.id)
            )
        )
        .scalars()
        .all()
    )
    return [_vista(r) for r in filas]


async def _persona_o_error(sesion: AsyncSession, persona_id: int | None) -> Persona | None:
    if persona_id is None:
        return None
    p = await sesion.get(Persona, persona_id)
    if p is None:
        raise HTTPException(422, "La persona indicada no está en el directorio.")
    return p


@router.post("/reglas", status_code=status.HTTP_201_CREATED)
async def crear_regla(
    datos: DatosRegla,
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    persona = await _persona_o_error(sesion, datos.persona_id)
    # Al ligarla al directorio se guarda la FOTO del dato actual: es contra
    # ella que después se detecta que el cargo cambió.
    r = ReglaCopia(
        tipos=datos.tipos.strip(),
        persona_id=datos.persona_id,
        tratamiento=datos.tratamiento.strip() or "Señor:",
        nombre=(datos.nombre or (persona.nombre if persona else "")).strip(),
        cargo=(datos.cargo or (persona.cargo if persona else "")).strip(),
        motivo=datos.motivo.strip(),
        orden=datos.orden,
        activa=datos.activa,
    )
    if not r.nombre:
        raise HTTPException(422, "Indique a quién va la copia.")
    sesion.add(r)
    await sesion.commit()
    await sesion.refresh(r)
    return _vista(r)


@router.put("/reglas/{regla_id}")
async def actualizar_regla(
    regla_id: int,
    datos: DatosRegla,
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    r = await sesion.get(ReglaCopia, regla_id)
    if r is None:
        raise HTTPException(404, "La regla no existe.")
    await _persona_o_error(sesion, datos.persona_id)
    r.tipos = datos.tipos.strip()
    r.persona_id = datos.persona_id
    r.tratamiento = datos.tratamiento.strip() or "Señor:"
    r.nombre = datos.nombre.strip()
    r.cargo = datos.cargo.strip()
    r.motivo = datos.motivo.strip()
    r.orden = datos.orden
    r.activa = datos.activa
    await sesion.commit()
    await sesion.refresh(r)
    return _vista(r)


@router.post("/reglas/{regla_id}/sincronizar")
async def sincronizar_regla(
    regla_id: int,
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Acepta el dato que hoy tiene el directorio: la regla toma el nombre y el
    cargo vigentes y deja de avisar que cambiaron.

    Es un acto DELIBERADO y no una actualización silenciosa: que un cargo haya
    cambiado puede significar que la copia ya no corresponde, y eso lo decide
    una persona.
    """
    r = await sesion.get(ReglaCopia, regla_id)
    if r is None:
        raise HTTPException(404, "La regla no existe.")
    persona = await _persona_o_error(sesion, r.persona_id)
    if persona is None:
        raise HTTPException(409, "Esta copia no está ligada al directorio.")
    r.nombre = persona.nombre
    r.cargo = persona.cargo
    await sesion.commit()
    await sesion.refresh(r)
    return _vista(r)


@router.delete("/reglas/{regla_id}")
async def eliminar_regla(
    regla_id: int,
    _: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    r = await sesion.get(ReglaCopia, regla_id)
    if r is None:
        raise HTTPException(404, "La regla no existe.")
    await sesion.delete(r)
    await sesion.commit()
    return {"ok": True}

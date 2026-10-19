"""Tipos documentales disponibles (para el selector y los formularios
configurables del frontend) y la ruta numerada del proceso."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.db import obtener_sesion
from app.seguridad import usuario_actual
from app.servicios.tramite import ETAPAS
from app.tipos import TIPOS, lista_tipos

router = APIRouter(prefix="/api/tipos", tags=["tipos"])


@router.get("")
async def listar_tipos(_=Depends(usuario_actual)) -> list[dict]:
    return lista_tipos()


@router.get("/etapas")
async def listar_etapas(_=Depends(usuario_actual)) -> list[dict]:
    """La ruta del proceso documental SIN documento: los siete pasos en orden,
    con su explicación. Es la guía que la bandeja muestra al entrar («¿por
    dónde empiezo?»); dentro de un documento, cada paso viaja ya con su avance
    en `tramite.etapas`."""
    return [{**e, "opcional": bool(e.get("opcional")), "orden": i + 1,
             "hecho": False, "actual": False}
            for i, e in enumerate(ETAPAS)]


@router.get("/{codigo}/siguiente-numero")
async def siguiente_numero(
    codigo: str,
    _=Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """El último número emitido de la serie del tipo y el que toca a
    continuación. Lo usa el diálogo de incorporación (Edison 2026-09-11) para
    que quien numeró a mano vea qué número espera el sistema y, si el suyo no
    coincide, entienda por qué se rechaza. Es informativo: la reserva real la
    hace `numeracion.asignar_declarado` bajo lock."""
    if codigo not in TIPOS:
        raise HTTPException(404, f"Tipo de documento desconocido: {codigo}")
    cfg = TIPOS[codigo]
    ultimo = (
        await sesion.execute(
            text(
                "SELECT ultimo FROM contadores WHERE despacho_id = 1 "
                "AND serie = :serie AND periodo = :periodo"
            ),
            {"serie": cfg["serie"], "periodo": config.periodo},
        )
    ).scalar_one_or_none() or 0
    return {
        "tipo": codigo,
        "serie": cfg["serie"],
        "periodo": config.periodo,
        "ultimo": ultimo,
        "siguiente": ultimo + 1,
    }

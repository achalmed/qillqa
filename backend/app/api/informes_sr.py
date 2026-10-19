"""Informes de representación (ISR) para Inicio: solo lectura, solo la
edición pública (servicios/informes_sr.py)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from app.api.archivos import enviar_archivo
from app.config import raiz_informes_sr
from app.modelos import Usuario
from app.seguridad import usuario_actual
from app.servicios import informes_sr

router = APIRouter(prefix="/api/informes-sr", tags=["informes-sr"])


@router.get("")
async def listar(_: Usuario = Depends(usuario_actual)) -> list[dict]:
    return informes_sr.listar(raiz_informes_sr())


@router.get("/{carpeta}/{nombre}")
async def ver(carpeta: str, nombre: str, peticion: Request, _: Usuario = Depends(usuario_actual)) -> Response:
    ruta = informes_sr.archivo(raiz_informes_sr(), carpeta, nombre)
    if ruta is None:
        raise HTTPException(404, "Informe no encontrado.")
    return enviar_archivo(ruta, nombre, peticion=peticion)

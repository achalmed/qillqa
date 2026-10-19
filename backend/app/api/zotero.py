"""ZOTERO (2026-10-06): buscar obras en Zotero y traer su referencia y su cita, formateadas por Zotero.

Zotero es la autoridad de metadatos, referencias y citas; Calibre, la de los archivos
(`docs/decisiones.md` §Biblioteca y citas). Solo lee (servicios/zotero.py): la API local de
Zotero 7 si está abierto en el servidor; si no, una copia de zotero.sqlite. Rutas síncronas a
propósito: FastAPI las corre en su grupo de hilos y la primera carga de la copia no detiene al
resto de la API.

- `GET /api/zotero/estado`  {modo: api|sqlite|apagado, api, bbt, sqlite, obras, estilo, motivo}
- `GET /api/zotero/buscar?q=`  título, creador, año; `#etiqueta`; `@clave_de_cita`; clave de 8 caracteres
- `GET /api/zotero/{key}`   una obra (contrato en servicios/zotero.py)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.modelos import Usuario
from app.seguridad import usuario_actual
from app.servicios import zotero

router = APIRouter(prefix="/api/zotero", tags=["zotero"])


@router.get("/estado")
def estado(_: Usuario = Depends(usuario_actual)) -> dict:
    return zotero.estado()


@router.get("/buscar")
def buscar(
    q: str = Query("", max_length=300),
    limite: int = Query(zotero.LIMITE_DEFECTO, ge=1, le=zotero.LIMITE_MAXIMO),
    _: Usuario = Depends(usuario_actual),
) -> list[dict]:
    return zotero.buscar(q, limite)


@router.get("/{key}")
def obra(key: str, _: Usuario = Depends(usuario_actual)) -> dict:
    d = zotero.obtener(key)
    if not d:
        raise HTTPException(404, "Esa obra no está en Zotero (o Zotero no está a mano en el servidor).")
    return d

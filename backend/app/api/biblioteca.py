"""BIBLIOTECA (2026-10-06): buscar ARCHIVOS en la biblioteca Calibre (dónde está cada obra).

Solo lee (servicios/biblioteca.py abre metadata.db con `mode=ro`). Desde la corrección de
roles (Edison, 2026-10-06) las referencias y las citas vienen de Zotero (api/zotero.py); esto
queda para ubicar un archivo y para las fuentes `calibre:N` de antes. Contrato de cada libro: `calibre_id`, `titulo`, `autores` (lista), `anio`,
`editorial`, `isbn`, `doi`, `serie`, `etiquetas`, `idioma`, `cita_apa`, `cita_apa_md`,
`cita_corta`. Las rutas son síncronas a propósito: FastAPI las corre en su grupo de hilos y
la primera carga de la biblioteca no detiene al resto de la API.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.modelos import Usuario
from app.seguridad import usuario_actual
from app.servicios import biblioteca

router = APIRouter(prefix="/api/biblioteca", tags=["biblioteca"])


@router.get("/estado")
def estado(_: Usuario = Depends(usuario_actual)) -> dict:
    """¿Hay biblioteca? {configurado, disponible, libros, motivo}."""
    return biblioteca.estado()


@router.get("/buscar")
def buscar(
    q: str = Query("", max_length=300),
    limite: int = Query(biblioteca.LIMITE_DEFECTO, ge=1, le=biblioteca.LIMITE_MAXIMO),
    _: Usuario = Depends(usuario_actual),
) -> list[dict]:
    """Libros por título, autor, serie, etiquetas, editorial, ISBN, DOI o `calibre:N`."""
    return biblioteca.buscar(q, limite)


@router.get("/{calibre_id}")
def libro(calibre_id: int, _: Usuario = Depends(usuario_actual)) -> dict:
    d = biblioteca.obtener(calibre_id)
    if not d:
        raise HTTPException(404, "Ese libro no está en la biblioteca Calibre (o la biblioteca no está a mano).")
    return d

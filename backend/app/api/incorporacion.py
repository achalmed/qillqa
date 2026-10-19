"""Router de INCORPORACIÓN: documentos elaborados fuera del sistema.

Solo HTTP y permisos; la lógica vive en servicios/incorporacion.py (y la
regla del número, en servicios/numeracion.py::asignar_declarado). Router
aparte de api/documentos.py por la misma razón que seguimiento.py: no
engordarlo. Sus rutas son POST/PUT, así que no chocan con el
`GET /{documento_id}` del router de documentos; el «siguiente número» va en
api/tipos.py porque es un dato de la SERIE, no de un documento.
"""

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Documento, Usuario
from app.seguridad import usuario_actual
from app.servicios import incorporacion
from app.servicios.numeracion import numero_mostrado

router = APIRouter(prefix="/api/documentos", tags=["incorporacion"])


def _campos_de(texto: str) -> dict:
    try:
        campos = json.loads(texto or "{}")
    except json.JSONDecodeError:
        raise HTTPException(422, "Los datos del documento no son un JSON válido.")
    if not isinstance(campos, dict):
        raise HTTPException(422, "Los datos del documento deben ser un objeto.")
    return campos


@router.post("/incorporar")
async def incorporar(
    tipo: str = Form(...),
    numero: int = Form(..., ge=1),
    campos: str = Form("{}"),
    motivo: str = Form(""),
    archivo: UploadFile | None = File(None),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Incorpora un documento hecho en Word (u otro editor) con su número YA
    impreso, o declara un número como no utilizado si no viene archivo.

    Multipart: `tipo`, `numero`, `campos` (JSON con los mismos datos que el
    formulario del editor), `archivo` (PDF; opcional) y `motivo` (obligatorio
    solo sin archivo). Cualquier rol: es el mismo permiso que /generar, y en
    la práctica lo hace la secretaría que numeró a mano."""
    if tipo == "informe_sr":
        # El ISR es el producto de la semana: se numera y se registra desde el módulo
        # Semana de representación (api/semanas_sr.py), que conoce su número y su PDF
        # aprobado (Edison 2026-10-02: «mantener en Gestión Documental únicamente la
        # gestión, el seguimiento y la trazabilidad»).
        raise HTTPException(
            409, "El Informe de Semana de Representación se registra desde el módulo "
                 "Semana de representación (botón «Registrar en la gestión documental»).")
    contenido: bytes | None = None
    nombre_origen = ""
    if archivo is not None and archivo.filename:
        contenido = await archivo.read()
        nombre_origen = archivo.filename
        incorporacion.validar_pdf(contenido, nombre_origen)
    doc = await incorporacion.incorporar(
        sesion, usuario, tipo, numero, _campos_de(campos), contenido,
        nombre_origen=nombre_origen, motivo=motivo,
    )
    return {
        "id": doc.id,
        "numero": doc.numero,
        "numero_completo": numero_mostrado(doc),
        "estado": doc.estado,
        "folios": doc.folios,
    }


@router.put("/{documento_id}/archivo-manual")
async def reemplazar_archivo(
    documento_id: int,
    archivo: UploadFile = File(...),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Reemplaza el PDF de un documento manual (corrección hecha en Word). Si
    ya estaba firmado, la firma se anula y hay que volver a firmar."""
    doc = await sesion.get(Documento, documento_id, with_for_update=True)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    if doc.tipo == "informe_sr":
        raise HTTPException(409, "El PDF del ISR se reemplaza al aprobar una versión nueva en su "
                                 "Semana de representación, no a mano.")
    contenido = await archivo.read()
    incorporacion.validar_pdf(contenido, archivo.filename or "archivo")
    return await incorporacion.reemplazar_pdf(
        sesion, doc, usuario, contenido, nombre_origen=archivo.filename or ""
    )

"""COLAB: la API del servidor de edición simultánea (fase 5, 2026-10-01).

Tres puertas, todas para `frontend/colab/servidor.ts` (Hocuspocus), para las
partes de un proyecto (`pl:…`) y los documentos (`doc:…`, paso 5.6):

- `GET  /api/colab/acceso`  con la sesión de la PERSONA: ¿puede entrar a este
  texto y con qué permiso? Valida la JWT igual que cualquier endpoint (cuenta
  activa, clave no temporal), así el servidor de colaboración no decide nada.
- `GET  /api/colab/estado`  interno: el estado Yjs guardado, o el JSON vigente
  para construirlo la primera vez.
- `PUT  /api/colab/estado`  interno: guarda el estado Yjs y el borrador vivo.

Las internas exigen `X-Colab-Secreto` (servicios/colab.py, derivado de
JWT_SECRET). Reglas y razones en servicios/colab.py.
"""

from __future__ import annotations

import base64
import binascii
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.db import obtener_sesion
from app.modelos import ColabEstado, Documento, Proyecto, ProyectoSeccion, Usuario
from app.seguridad import usuario_actual
from app.servicios import colab as reglas
from app.servicios import proyectos as reglas_proyecto

router = APIRouter(prefix="/api/colab", tags=["colab"])


def _interno(x_colab_secreto: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_colab_secreto, reglas.secreto_interno(config.jwt_secret)):
        raise HTTPException(403, "Solo para el servidor de colaboración.")


async def _texto(sesion: AsyncSession, documento: str) -> ProyectoSeccion | Documento:
    """La parte del proyecto o el documento de un nombre compartido, si el modo
    está encendido y la generación es la vigente (409 si no: el cliente recarga)."""
    nombre = reglas.leer_nombre(documento)
    if isinstance(nombre, reglas.NombreDocumento):
        return await _documento(sesion, nombre)
    return (await _parte(sesion, documento))[1]


async def _documento(sesion: AsyncSession, nombre: reglas.NombreDocumento) -> Documento:
    doc = await sesion.get(Documento, nombre.documento_id)
    if doc is None:
        raise HTTPException(404, "Documento no encontrado.")
    if not reglas.documento_en_vivo(doc):
        raise HTTPException(409, {"codigo": "colab_apagada", "mensaje": "La edición simultánea no rige en este documento."})
    if nombre.generacion != doc.colab_gen:
        raise HTTPException(409, {"codigo": "generacion_vieja", "mensaje": "El texto se reemplazó; recárguelo.", "generacion": doc.colab_gen})
    return doc


async def _parte(sesion: AsyncSession, documento: str) -> tuple[Proyecto, ProyectoSeccion]:
    """El proyecto y la parte de un nombre compartido, si el modo está
    encendido y la generación es la vigente (409 si no: el cliente recarga)."""
    nombre = reglas.leer_nombre(documento)
    if not isinstance(nombre, reglas.NombreColab):
        raise HTTPException(404, "Texto compartido desconocido.")
    p = await sesion.get(Proyecto, nombre.proyecto_id)
    s = (
        await sesion.execute(
            select(ProyectoSeccion).where(
                ProyectoSeccion.proyecto_id == nombre.proyecto_id, ProyectoSeccion.clave == nombre.clave
            )
        )
    ).scalar_one_or_none()
    if p is None or s is None:
        raise HTTPException(404, "Parte no encontrada.")
    if not p.colaboracion:
        raise HTTPException(409, {"codigo": "colab_apagada", "mensaje": "La edición simultánea está apagada en este proyecto."})
    if nombre.generacion != s.colab_gen:
        raise HTTPException(409, {"codigo": "generacion_vieja", "mensaje": "El texto se reemplazó; recárguelo.", "generacion": s.colab_gen})
    return p, s


@router.get("/acceso")
async def acceso(
    documento: str,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Lo pregunta el servidor de colaboración con la sesión de la persona.
    Invitado: entra, pero solo lee (como en todo el sistema)."""
    if reglas.es_sala(documento):
        # Sala de presencia (2026-10-05): solo dice quién está y en qué campo;
        # no guarda nada, así que basta una sesión válida.
        return {"usuario_id": usuario.id, "nombre": usuario.nombre_completo, "lectura": False}
    texto = await _texto(sesion, documento)
    # Un documento oculto no existe para quien no administra (como en su GET).
    if isinstance(texto, Documento) and texto.oculto and usuario.rol != "administrador":
        raise HTTPException(404, "Documento no encontrado.")
    return {"usuario_id": usuario.id, "nombre": usuario.nombre_completo, "lectura": usuario.rol == "invitado"}


@router.get("/estado", dependencies=[Depends(_interno)])
async def leer_estado(documento: str, sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    s = await _texto(sesion, documento)
    fila = await sesion.get(ColabEstado, documento)
    if isinstance(s, Documento):
        # Cuerpo y datos del formulario: el borrador vivo si lo hay, si no lo guardado.
        vivo = s.borrador or {}
        return {
            "estado": base64.b64encode(fila.estado).decode() if fila else None,
            "contenido": vivo.get("cuerpo") or s.cuerpo or {"type": "doc", "content": []},
            "campos": vivo.get("campos") or s.campos or {},
        }
    return {
        "estado": base64.b64encode(fila.estado).decode() if fila else None,
        # Sin estado Yjs, se construye desde lo vigente: el borrador vivo si lo
        # hay (no debería sin estado, pero nunca se pierde) o la última versión.
        "contenido": s.borrador if s.borrador is not None else (s.contenido or {"type": "doc", "content": []}),
    }


class EstadoColab(BaseModel):
    documento: str
    estado: str  # bytes Yjs en base64
    # JSON derivado; None cuando solo se guarda el estado recién construido.
    contenido: dict | None = None
    # Solo documentos: los datos del formulario del mapa `campos` de Yjs.
    campos: dict | None = None
    usuario_id: int | None = None


@router.put("/estado", dependencies=[Depends(_interno)])
async def guardar_estado(datos: EstadoColab, sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    s = await _texto(sesion, datos.documento)
    try:
        estado = base64.b64decode(datos.estado, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "Estado Yjs ilegible.")
    autor = datos.usuario_id if datos.usuario_id and await sesion.get(Usuario, datos.usuario_id) else None
    await sesion.execute(
        insert(ColabEstado)
        .values(documento=datos.documento, estado=estado, actualizado_por=autor)
        .on_conflict_do_update(
            index_elements=[ColabEstado.documento],
            set_={"estado": estado, "actualizado_por": autor, "actualizado_en": reglas_proyecto.ahora()},
        )
    )
    if datos.contenido is not None and isinstance(s, Documento):
        # Borrador vivo del documento: cuerpo y datos, sin versión ni bitácora.
        s.borrador = {"cuerpo": datos.contenido, "campos": datos.campos if datos.campos is not None else (s.campos or {})}
        s.borrador_en = reglas_proyecto.ahora()
        s.borrador_por = autor
    elif datos.contenido is not None:
        # Borrador vivo: lo que hay escrito, sin versión ni bitácora (la
        # bitácora la deja «Guardar»).
        s.borrador = datos.contenido
        s.borrador_en = reglas_proyecto.ahora()
        s.borrador_por = autor
    await sesion.commit()
    return {"ok": True}

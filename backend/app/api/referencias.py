"""REFERENCIAS Y ASOCIACIONES AUTOMÁTICAS (2026-10-06).

- `GET  /api/referencias/buscar?q=&contexto=` lo citable mientras se escribe (editor de
  documentos, partes del proyecto de ley, textos del informe SR).
- `GET  /api/referencias?origen=doc:12` las relaciones genéricas de algo.
- `POST /api/referencias/texto` registra la cita insertada en un área de texto plano (los
  textos del informe SR); se depura sola al guardar la semana si el texto ya no aparece.
- `GET  /api/documentos/{id}/informe-sr` ¿este oficio presenta un informe SR? candidatos.
- `POST /api/documentos/{id}/informe-sr` asocia el informe elegido (relación + adjunto).
- `DELETE /api/documentos/{id}/informe-sr/{semana_id}` deshace la asociación.
- `POST /api/referencias/semanas/{id}/oficio-presentacion` crea el oficio que presenta el
  informe de la semana, ya redactado y con el informe asociado (bajo /api/referencias:
  `POST /api/semanas/{id}/{lista}` de semanas_sr.py tomaría «oficio-presentacion» por lista).

Las reglas están en servicios/referencias.py (puras) y servicios/relaciones.py (base).
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Documento, Relacion, SemanaSR, Usuario
from app.seguridad import usuario_actual
from app.servicios import bitacora
from app.servicios import referencias as ref
from app.servicios import relaciones

router = APIRouter(prefix="/api/referencias", tags=["referencias"])
router_asociaciones = APIRouter(prefix="/api", tags=["referencias"])


@router.get("/buscar")
async def buscar(
    q: str = Query("", max_length=120),
    contexto: str = Query("", max_length=40),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Normas, documentos, proyectos, semanas, pedidos, personas, instituciones y libros
    que coinciden con lo escrito («Ley 2779», «Oficio 95», «@huamanga»), en grupos."""
    if not q.strip().lstrip("@").strip() and not q.startswith("@"):
        return []
    return await relaciones.buscar(sesion, q, contexto, ver_ocultos=usuario.rol == "administrador")


@router.get("")
async def listar(
    origen: str = Query(..., max_length=80),
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    return await relaciones.de_origen(sesion, origen)


class CitaEnTexto(BaseModel):
    origen: str = Field(max_length=80)          # p. ej. sr:2
    contexto: str = Field(default="", max_length=80)  # p. ej. informe:resumen
    tipo: str = Field(max_length=20)            # norma, documento, persona…
    id: str = Field(max_length=80)
    texto: str = Field(default="", max_length=500)
    nota: str = Field(default="", max_length=1000)


@router.post("/texto")
async def registrar_en_texto(
    datos: CitaEnTexto,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if usuario.rol == "invitado":
        raise HTTPException(403, "Su cuenta es de solo lectura.")
    destino = ref.nodo_de(datos.tipo, datos.id)
    if destino is None or not datos.origen.startswith("sr:"):
        raise HTTPException(422, "Referencia no válida.")
    fila = await relaciones.registrar(
        sesion, origen=datos.origen, destino=destino, tipo=ref.TIPO_RELACION.get(datos.tipo, "menciona"),
        contexto=datos.contexto, fuente="texto", texto=datos.texto,
        datos={"cita": datos.nota} if datos.nota else None, usuario_id=usuario.id,
    )
    await sesion.commit()
    return {"id": fila.id, "destino": destino}


# --- el informe SR y su oficio de presentación --------------------------------------------


async def _documento(sesion: AsyncSession, documento_id: int, usuario: Usuario) -> Documento:
    doc = await sesion.get(Documento, documento_id)
    if doc is None or (doc.oculto and usuario.rol != "administrador"):
        raise HTTPException(404, "El documento no existe.")
    return doc


@router_asociaciones.get("/documentos/{documento_id}/informe-sr")
async def candidatos_informe(
    documento_id: int,
    asunto: str | None = Query(None, max_length=2000),
    referencia: str | None = Query(None, max_length=2000),
    sumilla: str | None = Query(None, max_length=500),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Si el documento parece el oficio que presenta un informe de semana de
    representación, los informes candidatos (el más probable primero) y si la elección es
    tan clara que puede hacerse sola (`confiable`)."""
    doc = await _documento(sesion, documento_id, usuario)
    vivos = {"asunto": asunto, "referencia": referencia, "sumilla": sumilla}
    return await relaciones.candidatos_de_documento(sesion, doc, vivos)


class AsociarInforme(BaseModel):
    semana_id: int
    confirmar_anulacion: bool | None = None


@router_asociaciones.post("/documentos/{documento_id}/informe-sr")
async def asociar_informe(
    documento_id: int,
    datos: AsociarInforme,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Asocia el informe de la semana: relación + su PDF como adjunto (por la puerta de los
    adjuntos: si el documento ya estaba firmado, rige el aviso de anulación)."""
    if usuario.rol == "invitado":
        raise HTTPException(403, "Su cuenta es de solo lectura.")
    doc = await _documento(sesion, documento_id, usuario)
    return await relaciones.adjuntar_informe(sesion, doc, datos.semana_id, usuario, datos.confirmar_anulacion)


@router_asociaciones.delete("/documentos/{documento_id}/informe-sr/{semana_id}")
async def quitar_informe(
    documento_id: int,
    semana_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if usuario.rol == "invitado":
        raise HTTPException(403, "Su cuenta es de solo lectura.")
    await _documento(sesion, documento_id, usuario)
    n = await relaciones.quitar_informe(sesion, documento_id, semana_id)
    await sesion.commit()
    return {"ok": True, "quitadas": n}


@router.post("/semanas/{semana_id}/oficio-presentacion")
async def oficio_presentacion(
    semana_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """El oficio BORRADOR que presenta el informe de la semana: asunto, referencia y cuerpo
    redactados con las fórmulas de la casa, el destinatario del ISR si lo tiene, y el
    informe asociado (relación + PDF adjunto). Sin número: se revisa y se genera en el
    editor como cualquier oficio."""
    from app.api.documentos import NuevoDocumento, crear as crear_documento

    if usuario.rol == "invitado":
        raise HTTPException(403, "Su cuenta es de solo lectura.")
    semana = await sesion.get(SemanaSR, semana_id)
    if semana is None:
        raise HTTPException(404, "La semana no existe.")
    # Si ya hay un oficio de presentación de esta semana, se abre ese (no se duplica).
    previos = (await sesion.execute(
        select(Relacion).where(Relacion.destino == f"sr:{semana_id}",
                                          Relacion.tipo == "presenta_informe",
                                          Relacion.origen.like("doc:%"))
    )).scalars().all()
    for r in previos:
        existente = await sesion.get(Documento, int(r.origen.split(":")[1]))
        if existente is not None:
            return {"documento_id": existente.id, "ya_existia": True}
    exp = semana.expediente or {}
    periodo = exp.get("periodo") or {}
    inicio, fin = str(periodo.get("inicio") or ""), str(periodo.get("fin") or "")
    cuando = ref.periodo_texto(inicio, fin)
    isr = await sesion.get(Documento, semana.documento_id) if semana.documento_id else None
    nuevo = await crear_documento(NuevoDocumento(tipo="oficio"), usuario=usuario, sesion=sesion)
    doc = (await sesion.execute(select(Documento).where(Documento.id == nuevo["id"]))).scalar_one()
    from app.servicios.numeracion import numero_mostrado

    nombre_informe = (numero_mostrado(isr) if isr is not None and isr.numero is not None
                      else f"Informe de Semana de Representación N° {semana.numero:02d}")
    del_periodo = f", correspondiente a la semana de representación de {cuando}" if cuando else ""
    campos = {
        **doc.campos,
        "asunto": f"Presento el informe de la Semana de Representación N° {semana.numero:02d}" + (f" ({cuando})" if cuando else ""),
        "referencia": nombre_informe,
        "sumilla": f"Presenta ISR-{semana.numero:02d}",
    }
    if isr is not None:
        for clave in ("destinatario_nombre", "destinatario_cargo", "destinatario_institucion", "destinatario_tratamiento"):
            valor = (isr.campos or {}).get(clave)
            if valor:
                campos[clave] = valor
    parrafos = [
        "Es grato dirigirme a usted para saludarlo cordialmente y, en ejercicio de la función de "
        f"representación, remitir el {nombre_informe}{del_periodo}, en el que se da cuenta de las "
        "actividades realizadas, los pedidos recogidos de la población y las acciones de seguimiento.",
        "Sin otro particular, hago propicia la oportunidad para expresarle las muestras de mi "
        "especial consideración.",
    ]
    doc.campos = campos
    doc.cuerpo = {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in parrafos
    ]}
    bitacora.registrar(sesion, doc.id, usuario, "creado",
                       f"Creado para presentar el informe de la {semana.codigo}")
    await sesion.commit()
    asociado = await relaciones.adjuntar_informe(sesion, doc, semana_id, usuario, None)
    return {"documento_id": doc.id, "ya_existia": False, "sin_pdf": asociado.get("sin_pdf", False),
            "fecha": date.today().isoformat()}

"""Router de sincronización: el manifiesto de archivos que un dispositivo
autorizado debe copiar a su carpeta local. La DESCARGA de cada archivo
reutiliza los endpoints existentes (`/api/documentos/{id}/pdf` y
`/api/documentos/{id}/adjuntos/{adj_id}`), que ya validan sesión y permisos.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Usuario
from app.seguridad import usuario_actual
from app.servicios import sync as svc

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/manifest")
async def manifest(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Lista de archivos documentales (PDF + adjuntos) que el dispositivo del
    usuario debe tener localmente, con ruta relativa y versión para bajar solo
    lo nuevo o modificado. No incluye `.tex`, código ni archivos internos."""
    archivos = await svc.manifiesto(sesion, usuario)
    return {
        "archivos": archivos,
        "total_archivos": len(archivos),
        "total_bytes": sum(a["tamano"] for a in archivos),
    }


# --- Firmados que vuelven en el USB (2026-10-10) ------------------------------------------------
# Edison: «el USB se conecta a la laptop del firmador; el firmado queda junto al original con el
# sufijo [R]; al volver a conectar el USB y pulsar sincronizar, el sistema los absorbe como si se
# hubieran subido a mano, sin duplicar; si no identifica el documento, queda pendiente».
# El cliente (sync/sincronizador.ts::importarFirmados) recorre la carpeta buscando «…[R].pdf» y
# manda cada uno aquí con su ruta relativa; al incorporarlo, lo aparta a `.sgdp-importados/`.
import re as _re
from pathlib import Path as _Path

from fastapi import File, Form, UploadFile
from sqlalchemy import select

from app.api.adjuntos import _exigir_firmado_valido
from app.modelos import Adjunto, Documento
from app.servicios import adjuntos as svc_adjuntos
from app.servicios import bitacora, envio, vigencia
from app.servicios.carpetas import carpeta as carpeta_de

_RE_R = _re.compile(r"\s*\[\s*R\s*\]\s*$", _re.I)


async def _documento_de(sesion: AsyncSession, nombre: str, ruta: str) -> Documento | None:
    """El documento al que pertenece un «…[R].pdf»: por el código del nombre (OF-0127-2026-2027)
    o, si no, por la carpeta del USB donde estaba. Solo si la identificación es única."""
    stem = _RE_R.sub("", _Path(nombre).stem.strip())
    codigo = stem.split("_", 1)[0].strip()
    candidatos: list[Documento] = []
    if _re.fullmatch(r"[A-Z]{2,5}-\d{3,5}-\d{4}(?:-\d{4})?", codigo, _re.I):
        docs = (await sesion.execute(select(Documento).where(Documento.pdf_archivo.ilike(f"{codigo}%")))).scalars().all()
        candidatos = list(docs)
    if not candidatos:
        partes = [p for p in ruta.split("/") if p]
        carpeta_usb = partes[-2] if len(partes) >= 2 else ""
        if carpeta_usb:
            docs = (await sesion.execute(select(Documento).where(Documento.oculto.is_(False)))).scalars().all()
            candidatos = [d for d in docs if (c := carpeta_de(d)) is not None and c.name == carpeta_usb]
    return candidatos[0] if len(candidatos) == 1 else None


@router.post("/firmado")
async def incorporar_firmado(
    archivo: UploadFile = File(...),
    ruta: str = Form(""),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Incorpora un «…[R].pdf» hallado en la carpeta sincronizada como FIRMADO de su documento.
    Idempotente: el mismo archivo (sha256) no se registra dos veces. Respuestas:
    incorporado · ya_estaba · pendiente (con `motivos`, y el archivo se queda donde está)."""
    if usuario.rol == "invitado":
        return {"estado": "pendiente", "motivos": ["Su rol no permite subir firmados."]}
    contenido = await archivo.read()
    await archivo.seek(0)
    nombre = archivo.filename or _Path(ruta).name
    doc = await _documento_de(sesion, nombre, ruta)
    if doc is None:
        return {"estado": "pendiente", "motivos": ["No se pudo saber de qué documento es (ni por el nombre ni por la carpeta)."]}
    huella = vigencia.sha256_bytes(contenido)
    repetido = (await sesion.execute(
        select(Adjunto.id).where(Adjunto.documento_id == doc.id, Adjunto.sha256 == huella)
    )).first()
    if repetido:
        return {"estado": "ya_estaba", "documento": doc.id, "numero": doc.pdf_archivo or ""}
    try:
        await _exigir_firmado_valido(sesion, doc, archivo, None, usuario)
    except Exception as e:  # noqa: BLE001 — 422 con los motivos
        det = getattr(e, "detail", None)
        motivos = det.get("motivos", [str(det)]) if isinstance(det, dict) else [str(det or e)]
        return {"estado": "pendiente", "documento": doc.id, "motivos": motivos}
    adj = await svc_adjuntos.guardar(sesion, doc, archivo, usuario, categoria="firmado")
    bitacora.registrar(sesion, doc.id, usuario, "adjunto", f"Firmado incorporado desde la carpeta sincronizada «{nombre}»")
    await vigencia.sellar_firmado(sesion, doc, adj)
    await envio.marcar_firmado(sesion, doc, usuario)
    enviado = await envio.verificar(sesion, doc, usuario)
    await sesion.commit()
    return {"estado": "incorporado", "documento": doc.id, "nombre": adj.nombre_original, "envio_automatico": enviado}

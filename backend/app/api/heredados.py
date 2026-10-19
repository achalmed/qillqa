"""Router del archivo heredado: importar los documentos ya hechos con el
Marco Documental y recompilar su .tex ORIGINAL (formato intacto).

Los heredados se referencian EN SU LUGAR dentro de documentos/oficios;
la plataforma no copia nada."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config, raiz_documentos
from app.db import obtener_sesion
from app.latex.compilador import ejecutar_build
from app.latex.importador import enumerar, _elegir_pdf
from app.latex.lector import (
    extraer_formato,
    motivos_no_convertible,
    tex_a_tiptap,
)
from app.modelos import Documento, Usuario
from app.seguridad import usuario_actual
from app.servicios import bitacora, envio, vigencia
from app.servicios.carpetas import carpeta
from app.servicios.pdf import contar_paginas
from app.tipos import tipo_config

router = APIRouter(prefix="/api/documentos", tags=["heredados"])


def _maestro_tex(dir_doc) -> "Path | None":
    """El .tex maestro del documento (no metadata.tex)."""
    if dir_doc is None:
        return None
    for tex in sorted(dir_doc.glob("*.tex")):
        if tex.name != "metadata.tex":
            return tex
    return None


@router.post("/{documento_id}/convertir")
async def convertir_editable(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Convierte un heredado en documento EDITABLE de la plataforma:
    lee su .tex original, traduce el cuerpo a TipTap y lo marca como
    'sgdp'. Conserva su número y sus datos. A partir de aquí se edita y
    regenera como cualquier documento nativo.

    Aviso: el formato muy personalizado (tablas con estilo propio,
    sellos especiales) puede simplificarse al volver a generarse."""
    doc = await sesion.get(Documento, documento_id, with_for_update=True)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    if doc.origen == "manual":
        raise HTTPException(
            409,
            "Este documento se elaboró fuera del sistema y se incorporó con su "
            "PDF: no tiene un original LaTeX que convertir. Para corregirlo, "
            "edítelo en Word y reemplace el PDF.",
        )
    if doc.origen != "framework":
        raise HTTPException(409, "El documento ya es editable en la plataforma.")
    dir_doc = carpeta(doc)
    maestro = _maestro_tex(dir_doc)
    if maestro is None or not maestro.is_file():
        raise HTTPException(404, "No se encontró el .tex original del documento.")

    clase = tipo_config(doc.tipo)["clase"]
    tex = maestro.read_text(encoding="utf-8")
    # No degradar en silencio: si el .tex trae personalización que el modelo
    # aún no expresa (anexos escaneados, copia a mano), rechazar la conversión
    # y dejarlo como documento del archivo.
    motivos = motivos_no_convertible(tex)
    if motivos:
        raise HTTPException(
            409,
            "Este documento no se puede convertir a editable sin perder su "
            "formato: " + "; ".join(motivos) + ". Se conserva como documento "
            "del archivo (vista, descarga y recompilación del original).",
        )
    doc.cuerpo = tex_a_tiptap(tex, clase)
    # Conservar el formato del original (interlineado, tamaño, sello…) como
    # campos fmt_*, para que al regenerarlo salga con el mismo estilo.
    formato = extraer_formato(tex)
    doc.campos = {**(doc.campos or {}), **formato}
    doc.origen = "sgdp"
    await bitacora.versionar(
        sesion, doc, usuario, "Convertido a editable (importado del archivo)"
    )
    bitacora.registrar(
        sesion, doc.id, usuario, "convertido",
        "Convertido a documento editable de la plataforma",
    )
    await sesion.commit()
    # El contenido y los ajustes de formato se conservan, pero un documento
    # muy afinado a mano (tablas, compactación fina) puede reordenarse al
    # regenerarse: conviene revisarlo con «Vista previa» antes de generar.
    return {
        "ok": True,
        "formato": formato,
        "aviso": (
            "El contenido y el formato se conservaron. Si el original tenía "
            "tablas o un ajuste fino a mano, revise el resultado con «Vista "
            "previa» antes de generar: el PDF podría reordenarse."
        ),
    }


@router.post("/{documento_id}/recompilar")
async def recompilar(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Recompila un heredado desde su .tex ORIGINAL (sin serializador):
    el PDF sale idéntico al formato de la entidad."""
    doc = await sesion.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    if doc.origen == "manual":
        raise HTTPException(
            409,
            "Este documento se elaboró fuera del sistema: su PDF no se "
            "recompila. Si lo corrigió en Word, use «Reemplazar PDF».",
        )
    if doc.origen != "framework":
        raise HTTPException(
            409, "Use «Vista previa» o «Generar» para documentos de la plataforma."
        )
    dir_doc = carpeta(doc)
    maestro = dir_doc / "oficio.tex" if dir_doc else None
    if maestro is None or not maestro.is_file():
        raise HTTPException(404, "No se encontró el documento original.")
    # Vigencia (2026-10-06): lo impreso de un heredado son sus .tex. Si se
    # editaron a mano después de subir el firmado, recompilar anula la firma;
    # si no cambiaron, la firma sigue (servicios/vigencia.py).
    antes = await vigencia.huella_impresa(sesion, doc)
    resultado = await ejecutar_build(maestro)
    if not resultado.exito:
        raise HTTPException(500, resultado.mensaje)
    doc.pdf_archivo = _elegir_pdf(dir_doc) or doc.pdf_archivo
    # Folios automáticos también para heredados (páginas del PDF vigente).
    if doc.pdf_archivo:
        paginas = contar_paginas(dir_doc / doc.pdf_archivo)
        if paginas is not None:
            doc.folios = paginas
    bitacora.registrar(
        sesion, doc.id, usuario, "recompilado", "PDF regenerado del original"
    )
    vig = await vigencia.aplicar(sesion, doc, usuario, antes, "modificación del original LaTeX")
    await sesion.commit()
    return {"ok": True, "estado": doc.estado, **vig.respuesta()}


@router.post("/reconocer-archivos")
async def reconocer_archivos(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Barrido de MANTENIMIENTO sobre todos los documentos con carpeta:

    1. Registra como adjuntos los archivos que ya siguen la convención
       de la entidad («…[R].pdf» = firmado; «CONSTANCIA_DE_RECEPCION …» =
       recepción), moviéndolos a adjuntos/.
    2. Autocompleta los folios que falten contando páginas del PDF.

    Idempotente: correrlo dos veces no duplica nada."""
    if usuario.rol != "administrador":
        raise HTTPException(403, "Solo el administrador puede ejecutar el barrido.")
    docs = (
        (await sesion.execute(select(Documento).where(Documento.ruta_original.is_not(None))))
        .scalars().all()
    )
    from app.servicios import adjuntos as svc_adjuntos

    reconocidos: list[str] = []
    folios_puestos = 0
    enviados_auto = 0
    for doc in docs:
        nuevos = await svc_adjuntos.reconocer_en_carpeta(sesion, doc, usuario.id)
        for n in nuevos:
            bitacora.registrar(
                sesion, doc.id, usuario, "adjunto",
                f"Reconocido del disco: «{n}»",
            )
        reconocidos.extend(nuevos)
        if doc.folios is None and doc.pdf_archivo:
            dir_doc = carpeta(doc)
            paginas = contar_paginas(dir_doc / doc.pdf_archivo) if dir_doc else None
            if paginas is not None:
                doc.folios = paginas
                folios_puestos += 1
        # Solo los documentos que RECIBIERON archivos en este barrido pueden
        # cumplir recién las condiciones → firmado y envío automáticos (no toca los demás).
        if nuevos:
            previo = doc.estado
            await envio.al_dia(sesion, doc, usuario, "se reconoció el firmado en su carpeta")
            await envio.verificar(sesion, doc, usuario)
            if doc.estado == "ENVIADO" and previo != "ENVIADO":
                enviados_auto += 1
    await sesion.commit()
    return {
        "reconocidos": len(reconocidos),
        "archivos": reconocidos,
        "folios_autocompletados": folios_puestos,
        "enviados_automaticamente": enviados_auto,
    }


@router.post("/firmados/poner-al-dia")
async def poner_firmados_al_dia(
    aplicar: bool = False,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """MANTENIMIENTO (2026-10-19): los APROBADO que ya tienen su firmado vigente pasan a
    FIRMADO, como si el firmado se subiera hoy (`envio.poner_al_dia`). Simula por defecto:
    `?aplicar=true` los pasa. No publica en el chat (son estados viejos); sí concilia los
    recibidos y deja la bitácora. Solo el administrador."""
    if usuario.rol != "administrador":
        raise HTTPException(403, "Solo el administrador puede poner al día los firmados.")
    filas = await envio.poner_al_dia(sesion, usuario, aplicar)
    if aplicar:
        await sesion.commit()
    else:
        await sesion.rollback()
    return {
        "aplicado": aplicar,
        "pasan": sum(1 for f in filas if f["pasa"]),
        "documentos": filas,
    }


@router.post("/importar")
async def importar_archivo(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Importa al historial los documentos ya generados con el Marco
    Documental, verbatim. Idempotente (por nombre de carpeta) y NO
    consume números del contador."""
    if usuario.rol != "administrador":
        raise HTTPException(403, "Solo el administrador puede importar el archivo.")
    raiz = raiz_documentos()
    candidatos = enumerar(raiz)

    filas = (
        await sesion.execute(
            select(Documento.ruta_original).where(Documento.origen == "framework")
        )
    ).scalars().all()
    ya_importados = {Path(r).name for r in filas if r}

    creados, omitidos = 0, 0
    for d in candidatos:
        nombre = Path(d.ruta_original).name
        if nombre in ya_importados:
            omitidos += 1
            continue
        doc = Documento(
            despacho_id=1,
            periodo=d.periodo,
            tipo=d.tipo,
            serie=d.serie,
            numero=d.numero,
            estado="APROBADO",
            origen="framework",
            ruta_original=d.ruta_original,
            pdf_archivo=d.pdf_archivo,
            campos=d.campos,
            cuerpo={"type": "doc", "content": []},
            creado_por=usuario.id,
        )
        # Cada alta en su savepoint: un choque con el UniqueConstraint
        # omite ESE documento sin tumbar el lote.
        try:
            async with sesion.begin_nested():
                sesion.add(doc)
                await sesion.flush()
        except IntegrityError:
            omitidos += 1
            continue
        bitacora.registrar(
            sesion, doc.id, usuario, "importado",
            f"Importado del archivo de la entidad: {nombre}",
        )
        ya_importados.add(nombre)
        creados += 1

    # Poner al día los contadores. Un documento importado (p. ej. un OM
    # creado a mano con nuevo.sh) NO consume número, pero el contador debe
    # quedar al menos en el máximo real de su serie; si no, un /generar
    # posterior intentaría un número ya usado y colisionaría (bug 2026-08-14:
    # OM-0011 importado dejó el contador OM en 10). GREATEST nunca retrocede.
    maximos: dict[tuple[str, str], int] = {}
    for d in candidatos:
        if d.numero is not None:
            clave = (d.serie, d.periodo)
            maximos[clave] = max(maximos.get(clave, 0), d.numero)
    for (serie, periodo), maximo in maximos.items():
        await sesion.execute(
            text(
                "INSERT INTO contadores (despacho_id, serie, periodo, ultimo) "
                "VALUES (:d, :s, :p, :n) "
                "ON CONFLICT (despacho_id, serie, periodo) "
                "DO UPDATE SET ultimo = GREATEST(contadores.ultimo, :n)"
            ),
            {"d": 1, "s": serie, "p": periodo, "n": maximo},
        )
    await sesion.commit()
    return {"creados": creados, "omitidos": omitidos, "total": len(candidatos)}

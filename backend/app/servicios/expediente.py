"""Expediente del documento: fusiona en UN solo PDF el documento firmado
(o su PDF si aún no hay firma) seguido de los documentos adjuntos.

Se genera A DEMANDA (se regenera en cada llamada) dentro de
<carpeta>/expediente/ — un subdirectorio, para que no lo borre el glob de
compilación (`carpeta.glob('*.pdf')`, que limpia la raíz antes de compilar).
Los adjuntos NO-PDF se omiten (no hay conversor instalado) y se informan.
"""

import asyncio
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Adjunto, Documento
from app.servicios.adjuntos import (
    _dir_adjuntos,
    numero_corto,
)
from app.servicios import nombres
from app.servicios.carpetas import carpeta


async def _firmado(sesion: AsyncSession, doc: Documento) -> Adjunto | None:
    """El documento firmado más reciente (categoría 'firmado'), si existe."""
    return (
        await sesion.execute(
            select(Adjunto)
            .where(Adjunto.documento_id == doc.id, Adjunto.categoria == "firmado")
            .order_by(Adjunto.id.desc())
        )
    ).scalars().first()


def _expedientes_en(carpeta_exp: Path) -> list[Path]:
    """Los expedientes de una carpeta, con el nombre NUEVO («EXP-…») o con el
    anterior («EXPEDIENTE …»): los documentos ya generados no se quedan
    huérfanos por un cambio de convención."""
    if not carpeta_exp.is_dir():
        return []
    return sorted(
        p for p in carpeta_exp.glob("*.pdf")
        if p.name.startswith("EXP-") or p.name.startswith("EXPEDIENTE ")
    )


def ruta_expediente(doc: Documento, con_firma: bool | None = None) -> Path | None:
    """Ruta donde vive/vivirá el expediente combinado del documento. El
    «/» de «S/N» (borradores) se sanea para no crear subrutas."""
    base = carpeta(doc)
    if base is None:
        return None
    # El nombre dice si el documento principal es el FIRMADO (versión oficial
    # válida) o el PDF sin firma (Edison 2026-09-05: «debe quedar claramente
    # identificado cuál es la versión oficial»); la forma la fija la
    # convención única del sistema (servicios/nombres.py).
    nombre = nombres.expediente(doc, bool(con_firma))
    return base / "expediente" / nombre


async def generar(sesion: AsyncSession, doc: Documento, elegidas: list[int] | None = None) -> tuple[Path, list[str], bool]:
    """Fusiona base (firmado o PDF del documento) + las piezas PDF en un solo
    PDF. Devuelve (ruta, omitidos, con_firma). Lanza 409 si no hay PDF base.
    `elegidas`: los ids de las piezas que eligió quien arma (adjuntos, cargos
    de recepción, respuestas; 2026-10-18); sin ella, los adjuntos generales.

    Junto al PDF queda su MANIFIESTO (``EXP-….json``): la base y la lista de
    piezas con su SHA-256. Con él, `vigencia.estado_expediente` dice si sigue
    al día y por qué no (se quitó, se agregó o cambió el PDF de un adjunto, la
    firma se anuló…), en lugar de adivinarlo por la fecha de los archivos."""
    from app.servicios import vigencia

    base = carpeta(doc)
    if base is None or not base.is_dir():
        raise HTTPException(409, "El documento aún no tiene carpeta ni PDF.")

    filas = await vigencia._filas(sesion, doc)
    seleccion = vigencia.seleccion_de(elegidas, filas) if elegidas is not None else None
    composicion = await vigencia.composicion_actual(sesion, doc, filas, seleccion)
    firmado = await _firmado(sesion, doc)
    if firmado is not None:
        pdf_base = _dir_adjuntos(doc) / firmado.nombre_archivo
        con_firma = True
    else:
        pdf_base = (base / doc.pdf_archivo) if doc.pdf_archivo else None
        con_firma = False
    if pdf_base is None or not pdf_base.is_file():
        raise HTTPException(
            409,
            "No hay PDF del documento para armar el expediente: compílelo "
            "(Vista previa/Generar) o suba el documento firmado.",
        )

    dir_adj = _dir_adjuntos(doc)
    por_id = {a.id: a for a in filas}
    partes: list[Path] = [pdf_base] + [
        dir_adj / por_id[p["id"]].nombre_archivo for p in composicion["piezas"]
    ]
    # No-PDF (Word/Excel/imagen): pdfunite no los fusiona; se informan.
    omitidos = composicion["omitidos"]

    salida = ruta_expediente(doc, con_firma)
    salida.parent.mkdir(parents=True, exist_ok=True)
    temporal = salida.with_name(f".armando-{salida.name}")
    # pdfunite in1.pdf in2.pdf ... salida.pdf — primero a un temporal: si falla,
    # el expediente anterior sigue donde estaba.
    proc = await asyncio.create_subprocess_exec(
        "pdfunite",
        *[str(p) for p in partes],
        str(temporal),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    salida_bytes, _ = await proc.communicate()
    if proc.returncode != 0 or not temporal.is_file():
        temporal.unlink(missing_ok=True)
        detalle = salida_bytes.decode("utf-8", errors="replace")[:300]
        raise HTTPException(500, f"No se pudo fusionar el expediente. {detalle}")
    # Solo queda UN expediente por documento: si antes se generó sin firma y
    # ahora ya hay firmado, el viejo se retira para que no se confundan.
    for viejo in _expedientes_en(salida.parent):
        viejo.unlink()
        viejo.with_suffix(".json").unlink(missing_ok=True)
    temporal.replace(salida)
    vigencia.escribir_manifiesto(sesion, salida, composicion)
    return salida, omitidos, con_firma


def con_firma_por_nombre(nombre: str) -> bool:
    """¿El expediente lleva el FIRMADO? Lo dice su nombre: «…_firmado.pdf»
    (convención de nombres.py) o «(firmado)» (nombres anteriores). Antes solo
    se miraba la forma antigua y un expediente firmado nuevo figuraba «SIN
    FIRMA» y «desactualizado» para siempre (2026-10-01)."""
    return nombre.endswith("_firmado.pdf") or "(firmado)" in nombre


def existente(doc: Documento) -> Path | None:
    """El expediente ya generado (hay UNO por documento), o None."""
    base = ruta_expediente(doc)
    if base is None or not base.parent.is_dir():
        return None
    return next(iter(_expedientes_en(base.parent)), None)


async def estado(sesion: AsyncSession, doc: Documento) -> dict:
    """Qué expediente hay y si sigue al día (Edison 2026-09-07: «debería ser
    fácil de ubicar dentro del sistema»). Lo decide servicios/vigencia.py, que
    compara el manifiesto del expediente con lo que hay ahora y devuelve los
    motivos de que esté desactualizado."""
    from app.servicios import vigencia

    return await vigencia.estado_expediente(sesion, doc)

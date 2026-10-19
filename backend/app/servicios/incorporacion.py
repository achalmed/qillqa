"""Documentos ELABORADOS FUERA DEL SISTEMA (origen 'manual').

Pedido de Edison (2026-09-11): mientras el sistema estuvo caído, el despacho
numeró y redactó a mano —en Word— los oficios 0066 a 0070, y el 0065 quedó
sin usar. Hace falta una puerta para meter esos documentos al flujo SIN
pasar por el editor ni por LaTeX: el PDF que hicieron ES el documento, y lo
que sigue —firmarlo, cargar el cargo de recepción, registrarlo en el STD,
vincular respuestas, sincronizarlo— debe funcionar igual que para uno
generado aquí.

Tres orígenes, tres relaciones con el PDF:

    sgdp       el editor guarda campos+cuerpo y REGENERA .tex y PDF
    framework  el .tex a mano es la fuente; el PDF se recompila de ahí
    manual     el PDF subido es la fuente; NO hay .tex ni recompilación

Por eso un documento manual rechaza todo lo que compila (guardar el cuerpo,
vista previa, generar, recompilar, convertir) y en cambio admite: corregir
sus DATOS (metadatos de bandeja: destinatario, asunto, fecha… — el PDF no
cambia), REEMPLAZAR el PDF (antes de firmar; si ya había firma, se anula
como cuando se edita un documento de la plataforma) y todo el trámite.

El NÚMERO no lo asigna el sistema: viene impreso en el papel y el sistema lo
RECONOCE, solo si es el siguiente de la serie (`numeracion.asignar_declarado`,
invariante 6). Un número que se saltó se declara SIN PDF: queda reservado y
archivado como «número no utilizado», que es lo que en un libro de registro
físico se anota como ANULADO; así el correlativo sigue sin huecos y el
siguiente número que se declare (o genere) es el correcto.

Los archivos van en la MISMA carpeta y con la MISMA convención de nombres que
cualquier otro documento (servicios/carpetas.py, servicios/nombres.py):
visor, descarga, copia, expediente y sincronización no distinguen el origen.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.latex.redaccion import normalizar_campos
from app.modelos import Documento, Usuario
from app.servicios import bitacora, copias as svc_copias, nombres, vigencia
from app.servicios.adjuntos import MAX_BYTES
from app.servicios.carpetas import asegurar_carpeta, carpeta
from app.servicios.comun import CUERPO_VACIO
from app.servicios.numeracion import NumeroNoConsecutivo, asignar_declarado
from app.servicios.pdf import contar_paginas
from app.tipos import TIPOS

ORIGEN = "manual"

# Dónde queda el PDF que se reemplaza. Nunca se borra: si el reemplazo fue un
# error, el anterior sigue ahí (misma filosofía que adjuntos/anulados/).
CARPETA_ANTERIORES = "anteriores"


def es_manual(doc: Documento) -> bool:
    return doc.origen == ORIGEN


def validar_pdf(contenido: bytes, nombre: str) -> None:
    """Solo PDF de verdad (por la firma «%PDF-», no por la extensión: un .docx
    renombrado a .pdf se abriría en blanco en el visor) y dentro del límite
    de los adjuntos."""
    if not contenido:
        raise HTTPException(422, "El archivo está vacío.")
    if len(contenido) > MAX_BYTES:
        raise HTTPException(413, "El archivo supera el límite de 50 MB.")
    if not contenido.startswith(b"%PDF-"):
        raise HTTPException(
            422,
            f"«{nombre}» no es un PDF. Exporte el documento a PDF desde Word "
            "(Archivo → Guardar como → PDF) y vuelva a intentarlo.",
        )


def _campos_limpios(tipo: str, campos: dict) -> dict:
    """La misma normalización de redacción y el mismo orden de copias que
    aplican guardar/generar (api/documentos.py), para que la bandeja y la
    verificación traten igual a un documento manual."""
    cfg = TIPOS[tipo]
    limpios = normalizar_campos(campos) if cfg.get("normalizar", True) else dict(campos)
    limpios.setdefault("lugar", config.lugar)
    if limpios.get("con_copia"):
        limpios["con_copia"] = svc_copias.ordenar_copias(limpios["con_copia"])
    return limpios


async def _escribir_pdf(doc: Documento, contenido: bytes) -> None:
    """Deja el PDF en la carpeta del documento con el nombre de la convención
    y pone al día `pdf_archivo` y los folios."""
    dir_doc = await asegurar_carpeta(doc)
    nombre = nombres.documento(doc)
    (dir_doc / nombre).write_bytes(contenido)
    doc.pdf_archivo = nombre
    paginas = contar_paginas(dir_doc / nombre)
    if paginas is not None:
        doc.folios = paginas


async def incorporar(
    sesion: AsyncSession,
    usuario: Usuario,
    tipo: str,
    numero: int,
    campos: dict,
    contenido_pdf: bytes | None,
    nombre_origen: str = "",
    motivo: str = "",
) -> Documento:
    """Da de alta un documento con su número ya impreso.

    Con PDF: queda APROBADO (numerado, pendiente de firma), como un documento
    recién generado. Sin PDF: es un número que NO se utilizó; queda reservado
    y ARCHIVADO con el motivo, para que el correlativo no tenga huecos. Todo
    en una transacción: número, fila y archivo, o nada."""
    if tipo not in TIPOS:
        # tipo_config() cae a 'oficio' con un código desconocido; aquí un
        # error de tipo NO puede convertirse en silencio en otro tipo.
        raise HTTPException(422, f"Tipo de documento desconocido: {tipo}")
    cfg = TIPOS[tipo]
    if contenido_pdf is None and not motivo.strip():
        raise HTTPException(
            422,
            "Para declarar un número como no utilizado indique el motivo "
            "(quedará en la bitácora).",
        )
    campos = _campos_limpios(tipo, campos)
    if contenido_pdf is None:
        campos.setdefault(
            "asunto",
            f"Número no utilizado — {motivo.strip()}",
        )
        campos.setdefault("sumilla", "Numero no utilizado")
    doc = Documento(
        despacho_id=1,
        periodo=config.periodo,
        tipo=cfg["codigo"],
        serie=cfg["serie"],
        numero=numero,
        estado="APROBADO" if contenido_pdf is not None else "ARCHIVADO",
        origen=ORIGEN,
        campos=campos,
        cuerpo=dict(CUERPO_VACIO),
        creado_por=usuario.id,
    )
    # Primero el contador (bloquea la serie y valida la secuencia) y después
    # la fila: si el número ya existe, el UniqueConstraint lo rechaza y el
    # rollback suelta el lock sin haber movido el contador.
    try:
        await asignar_declarado(sesion, doc, numero)
    except NumeroNoConsecutivo as error:
        await sesion.rollback()
        raise HTTPException(409, str(error))
    sesion.add(doc)
    try:
        await sesion.flush()
    except IntegrityError:
        await sesion.rollback()
        raise HTTPException(
            409,
            f"El número {numero:04d} de la serie {cfg['serie']} ya existe en "
            "el sistema.",
        )
    etiqueta = f"{cfg['serie']}-{numero:04d}"
    if contenido_pdf is not None:
        await _escribir_pdf(doc, contenido_pdf)
        bitacora.registrar(
            sesion, doc.id, usuario, "incorporado",
            f"Incorporado con su número impreso {etiqueta} desde "
            f"«{nombre_origen or 'archivo'}» ({doc.folios or '?'} pág.): "
            "documento elaborado fuera del sistema (Word u otro editor). "
            "Su contenido no se edita en la plataforma.",
        )
        bitacora.registrar(
            sesion, doc.id, usuario, "numerado",
            f"Número oficial reconocido: {numero:04d} (ya impreso en el documento)",
        )
    else:
        bitacora.registrar(
            sesion, doc.id, usuario, "numero_anulado",
            f"Número {etiqueta} declarado NO UTILIZADO y archivado: "
            f"{motivo.strip()}",
        )
    await bitacora.versionar(
        sesion, doc, usuario,
        f"Incorporado N°{numero:04d}" if contenido_pdf is not None
        else f"Número anulado N°{numero:04d}",
    )
    await sesion.commit()
    return doc


async def reemplazar_pdf(
    sesion: AsyncSession,
    doc: Documento,
    usuario: Usuario,
    contenido_pdf: bytes,
    nombre_origen: str = "",
) -> dict:
    """Cambia el PDF de un documento manual (una corrección hecha en Word).
    El anterior se aparta a `anteriores/` con marca de tiempo —recuperable— y,
    si el documento ya estaba firmado, la firma se anula igual que cuando se
    edita el contenido de un documento de la plataforma: el papel firmado ya
    no corresponde. El número no cambia."""
    if not es_manual(doc):
        raise HTTPException(
            409, "Solo se reemplaza el PDF de un documento elaborado fuera del sistema."
        )
    if doc.numero is None:
        raise HTTPException(409, "El documento no tiene número.")
    # Vigencia (2026-10-06): lo impreso de un documento manual ES su PDF. Si
    # el nuevo es idéntico (mismo SHA-256), la firma sigue; si cambia, se anula
    # con todo su ciclo (cargos, STD, expediente firmado; servicios/vigencia.py).
    antes = await vigencia.huella_impresa(sesion, doc)
    dir_doc = carpeta(doc)
    if dir_doc is not None and doc.pdf_archivo and (dir_doc / doc.pdf_archivo).is_file():
        anteriores = dir_doc / CARPETA_ANTERIORES
        anteriores.mkdir(parents=True, exist_ok=True)
        marca = datetime.now().strftime("%Y%m%d-%H%M%S")
        viejo = dir_doc / doc.pdf_archivo
        vigencia.mover(sesion, viejo, anteriores / f"{viejo.stem}_{marca}{viejo.suffix}")
    await _escribir_pdf(doc, contenido_pdf)
    vig = await vigencia.aplicar(sesion, doc, usuario, antes, "reemplazo del PDF del documento")
    firmado_invalidado = vig.firma_anulada
    bitacora.registrar(
        sesion, doc.id, usuario, "pdf_reemplazado",
        f"PDF reemplazado desde «{nombre_origen or 'archivo'}» "
        f"({doc.folios or '?'} pág.); el anterior quedó en "
        f"{CARPETA_ANTERIORES}/.",
    )
    await sesion.commit()
    return {"ok": True, "estado": doc.estado, "firmado_invalidado": firmado_invalidado, "anulacion": vig.detalle or None}


async def actualizar_datos(
    sesion: AsyncSession, doc: Documento, usuario: Usuario, campos: dict
) -> None:
    """Corrige los DATOS de un documento manual (lo que ve la bandeja y usa el
    seguimiento). No toca el PDF ni la firma: son metadatos transcritos del
    papel, y corregir una transcripción no cambia lo firmado. Si cambian la
    fecha o la sumilla, la carpeta y el nombre del PDF siguen a la
    convención, como en un documento de la plataforma."""
    if not es_manual(doc):
        raise HTTPException(409, "Solo aplica a documentos elaborados fuera del sistema.")
    doc.campos = _campos_limpios(doc.tipo, campos)
    if doc.pdf_archivo:
        dir_doc = await asegurar_carpeta(doc)  # renombra la carpeta si hace falta
        actual = dir_doc / doc.pdf_archivo
        deseado = dir_doc / nombres.documento(doc)
        if actual.is_file() and actual != deseado and not deseado.exists():
            actual.replace(deseado)
            doc.pdf_archivo = deseado.name
    await bitacora.versionar(sesion, doc, usuario, "Datos corregidos")
    bitacora.registrar(sesion, doc.id, usuario, "editado", "Datos del documento corregidos")
    await sesion.commit()

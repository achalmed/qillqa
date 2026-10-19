"""Router de adjuntos: subir, listar, descargar y eliminar archivos de
un documento. Solo orquesta HTTP; el almacenamiento vive en
app/servicios/adjuntos.py."""

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.archivos import CACHE_ARCHIVOS, coincide_etag, enviar_archivo
from app.config import config, raiz_cache_imagenes
from app.db import obtener_sesion
from app.modelos import Adjunto, Documento, Usuario
from app.seguridad import usuario_actual
from app.servicios import adjuntos as svc
from app.servicios import bitacora, envio, expediente as svc_expediente
from app.servicios import vigencia
from app.servicios import validar_firmado
from app.servicios import expediente_externo
from app.servicios.carpetas import carpeta as carpeta_de
from app.servicios import imagen as svc_imagen
from app.servicios import pdf as svc_pdf
from app.servicios.pdf import contar_paginas

router = APIRouter(prefix="/api/documentos", tags=["adjuntos"])
# Fuera de /api/documentos: ahí «/expedientes» lo tomaría la ruta /{documento_id}.
router_lote = APIRouter(prefix="/api/expedientes", tags=["adjuntos"])


async def _doc(documento_id: int, sesion: AsyncSession) -> Documento:
    doc = await sesion.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    return doc


@router.get("/{documento_id}/adjuntos")
async def listar(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    await _doc(documento_id, sesion)
    filas = (
        await sesion.execute(
            select(Adjunto)
            .where(Adjunto.documento_id == documento_id)
            .order_by(Adjunto.subido_en.desc())
        )
    ).scalars().all()
    return [svc.resumen(a) for a in filas]


def _confirmacion(valor: str | None) -> bool | None:
    """«confirmar_anulacion» de un formulario: None si no vino (cliente que no
    conoce el aviso previo), True/False si vino."""
    if valor is None or valor == "":
        return None
    return valor.strip().lower() in ("1", "true", "si", "sí")


async def _exigir_firmado_valido(
    sesion: AsyncSession, doc: Documento, archivo: UploadFile, forzar: str | None, usuario: Usuario
) -> None:
    """Solo entra como firmado el PDF firmado de ESTE documento (servicios/validar_firmado.py).
    Si no cumple: 422 `firmado_invalido` con los motivos; el administrador puede forzarlo y
    queda en la bitácora."""
    contenido = await archivo.read()
    await archivo.seek(0)
    base = carpeta_de(doc)
    generado = base / doc.pdf_archivo if base and doc.pdf_archivo else None
    motivos = validar_firmado.motivos(contenido, archivo.filename or "", generado)
    if not motivos:
        return
    admin = usuario.rol == "administrador"
    if admin and _confirmacion(forzar):
        bitacora.registrar(
            sesion, doc.id, usuario, "firmado_forzado",
            "Firmado aceptado sin validar por el administrador: " + " ".join(motivos),
        )
        return
    raise HTTPException(
        422,
        {
            "codigo": "firmado_invalido",
            "mensaje": "No se aceptó como firmado: " + " ".join(motivos),
            "motivos": motivos,
            "puede_forzar": admin,
        },
    )


@router.post("/{documento_id}/adjuntos")
async def subir(
    documento_id: int,
    archivo: UploadFile,
    categoria: str = Form(""),
    etiqueta: str = Form(""),
    confirmar_anulacion: str | None = Form(None),
    forzar: str | None = Form(None),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    doc = await _doc(documento_id, sesion)
    if categoria == "firmado":
        await _exigir_firmado_valido(sesion, doc, archivo, forzar, usuario)
    antes = await vigencia.huella_impresa(sesion, doc)
    adj = await svc.guardar(
        sesion, doc, archivo, usuario, categoria=categoria, etiqueta=etiqueta
    )
    nombres = {"firmado": "documento firmado", "recepcion": "constancia de recepción"}
    detalle = f"Adjuntó {nombres.get(adj.categoria, 'el archivo')} «{adj.nombre_original}»"
    bitacora.registrar(sesion, doc.id, usuario, "adjunto", detalle)
    resultado = vigencia.Resultado()
    if adj.categoria == "":
        # Un adjunto nuevo agrega su nombre a la línea «Adj.»: si el documento
        # ya estaba firmado, lo firmado no lo menciona (vigencia.py).
        resultado = await vigencia.aplicar(
            sesion, doc, usuario, antes, f"se agregó el adjunto «{adj.etiqueta or adj.nombre_original}»",
            _confirmacion(confirmar_anulacion),
        )
    # Envío automático: si con este firmado/constancia se completan las
    # condiciones (firmado + recepciones completas) y el estado lo permite, el
    # documento pasa solo a ENVIADO. Complementa el cambio manual de /estado.
    envio_automatico = False
    if adj.categoria == "firmado":
        # El firmado certifica lo impreso AHORA: queda anotado para saber,
        # después, si un cambio lo deja sin valor.
        await vigencia.sellar_firmado(sesion, doc, adj)
        await envio.marcar_firmado(sesion, doc, usuario)
    if adj.categoria in ("firmado", "recepcion"):
        envio_automatico = await envio.verificar(sesion, doc, usuario)
    # El cargo trae el n.º de expediente que le dio la entidad: queda para el seguimiento.
    expediente = ""
    if adj.categoria == "recepcion" and not doc.expediente_entidad:
        ruta = svc.ruta_en_disco(doc, adj)
        expediente = expediente_externo.de_archivo(ruta) if ruta else ""
        if expediente:
            doc.expediente_entidad = expediente
            bitacora.registrar(
                sesion, doc.id, usuario, "expediente_externo",
                f"Leído del cargo de recepción: {expediente}",
            )
    await sesion.commit()
    return {
        **svc.resumen(adj),
        "documento_estado": doc.estado,
        "envio_automatico": envio_automatico,
        "expediente_entidad": expediente,
        **resultado.respuesta(),
    }


@router.put("/{documento_id}/adjuntos/{adjunto_id}/archivo")
async def reemplazar_archivo(
    documento_id: int,
    adjunto_id: int,
    archivo: UploadFile,
    confirmar_anulacion: str | None = Form(None),
    forzar: str | None = Form(None),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Reemplaza el ARCHIVO de un adjunto (otra versión del mismo informe, un
    escaneo mejor del firmado o del cargo) conservando su id, su nombre y su
    categoría. El anterior queda en ``adjuntos/anteriores/``.

    Vigencia (Edison 2026-10-06): reemplazar el PDF de un adjunto NO anula la
    firma —su nombre en la línea «Adj.» no cambia—, pero deja el expediente
    desactualizado. Una imagen incrustada como página sí es parte de lo
    impreso: reemplazarla anula la firma."""
    doc = await _doc(documento_id, sesion)
    adj = await svc.cargar(documento_id, adjunto_id, sesion)
    if adj.categoria == vigencia.CARGO_ANULADO:
        raise HTTPException(409, "Ese cargo es de una versión anulada: suba el cargo nuevo como constancia.")
    if adj.categoria == "firmado":
        await _exigir_firmado_valido(sesion, doc, archivo, forzar, usuario)
    antes = await vigencia.huella_impresa(sesion, doc)
    anterior = await svc.reemplazar_archivo(sesion, doc, adj, archivo)
    nombre = adj.etiqueta or adj.nombre_original
    bitacora.registrar(
        sesion, doc.id, usuario, "adjunto_reemplazado",
        f"Reemplazó el archivo de «{nombre}»"
        + (f"; el anterior quedó en adjuntos/{vigencia.CARPETA_ANTERIORES}/{anterior}" if anterior else ""),
    )
    resultado = await vigencia.aplicar(
        sesion, doc, usuario, antes, f"se reemplazó la imagen incrustada «{nombre}»",
        _confirmacion(confirmar_anulacion),
    )
    await sesion.commit()
    return {**svc.resumen(adj), "documento_estado": doc.estado, **resultado.respuesta()}


@router.get("/{documento_id}/vigencia")
async def ver_vigencia(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """¿La firma corresponde a lo impreso? ¿El expediente está al día y, si
    no, por qué? (servicios/vigencia.py). También dice qué se perdería si se
    anulara la firma ahora."""
    doc = await _doc(documento_id, sesion)
    respuesta = {
        "firma": await vigencia.estado_firma(sesion, doc),
        "expediente": await vigencia.estado_expediente(sesion, doc),
        "consecuencias_anulacion": await vigencia.consecuencias(sesion, doc),
    }
    await sesion.commit()  # las huellas calculadas por primera vez quedan guardadas
    return respuesta


class PiezasExpediente(BaseModel):
    # Los ids de las piezas elegidas (adjuntos, cargos de recepción, respuestas); sin ella, los adjuntos.
    piezas: list[int] | None = None


@router.post("/{documento_id}/expediente")
async def generar_expediente(
    documento_id: int,
    datos: PiezasExpediente | None = None,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Fusiona A DEMANDA el documento firmado (o su PDF) + las piezas PDF
    elegidas en un solo expediente. Devuelve el nombre, páginas y lo NO-PDF
    omitido. Se descarga con el GET de abajo."""
    doc = await _doc(documento_id, sesion)
    salida, omitidos, con_firma = await svc_expediente.generar(sesion, doc, datos.piezas if datos else None)
    bitacora.registrar(
        sesion, doc.id, usuario, "expediente",
        f"Generó el expediente ({'firmado' if con_firma else 'sin firma'})"
        + (f"; omitidos (no PDF): {', '.join(omitidos)}" if omitidos else ""),
    )
    await sesion.commit()
    return {
        "ok": True,
        "nombre": salida.name,
        "paginas": contar_paginas(salida),
        "con_firma": con_firma,
        "omitidos": omitidos,
    }


@router.get("/{documento_id}/expediente/estado")
async def estado_expediente(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """¿Hay expediente generado, con qué base y sigue al día? Alimenta el
    selector del visor y la pieza «Expediente» del panel de archivos."""
    doc = await _doc(documento_id, sesion)
    respuesta = await svc_expediente.estado(sesion, doc)
    await sesion.commit()  # las huellas calculadas por primera vez quedan guardadas
    return respuesta


@router.get("/{documento_id}/expediente")
async def descargar_expediente(
    documento_id: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    doc = await _doc(documento_id, sesion)
    # Hay UN solo expediente por documento; se busca con el mismo criterio que
    # su estado (nombre nuevo «EXP-…» o anterior «EXPEDIENTE …»). Antes aquí
    # solo se buscaba el anterior y el expediente nuevo daba 404 (2026-10-01).
    salida = svc_expediente.existente(doc)
    if salida is None or not salida.is_file():
        raise HTTPException(404, "Genere el expediente primero.")
    return enviar_archivo(salida, salida.name, peticion=peticion)


@router.get("/{documento_id}/imagen")
async def imagen_de_pagina(
    documento_id: int,
    peticion: Request,
    pagina: int = 1,
    archivo: str = "documento",
    # Miniatura (2026-10-19, la tira del visor rápido): la página reducida a este ancho en píxeles.
    ancho: int = 0,
    # «png» (por omisión: el portapapeles solo admite PNG) o «jpeg» (el visor rápido: la mitad de peso).
    formato: str = "png",
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Una página del PDF como imagen, para COPIARLA al portapapeles desde la web
    (Edison 2026-09-08: «solo copia y pega, para no estar descargando») y para
    VERLA en el visor rápido de la bandeja (2026-10-19).

    `archivo` dice cuál de los PDF del documento se rasteriza: «documento» (el
    oficial), «expediente» o el id de un adjunto —firmado, cargo, recibido…—,
    los mismos que ofrece el selector del visor.

    Siempre sale la versión vigente del PDF de la carpeta, pero sin rasterizarla
    de más: el ETag se calcula ANTES de llamar a pdftocairo con la fecha y el
    tamaño del PDF (`servicios/imagen.py::clave_de`); si el navegador manda ese
    mismo ETag recibe 304 y nada se genera, y si el PDF se recompiló la clave
    cambia. Con `Cache-Control: private, no-cache` el navegador guarda la imagen
    pero pregunta siempre, así que nunca ve una página vieja. La misma clave
    nombra la copia en el caché en disco (`config.raiz_cache_imagenes`), que
    ahorra la rasterización a la segunda persona que abre el oficio.

    La cuenta de páginas viaja en `X-Total-Paginas` (también en el 304) para que
    la web pueda ofrecer las demás sin pedir otra cosa.
    """
    doc = await _doc(documento_id, sesion)
    if archivo == "expediente":
        ruta = svc_expediente.existente(doc)
    elif archivo.isdigit():
        adj = await svc.cargar(documento_id, int(archivo), sesion)
        ruta = svc.ruta_en_disco(doc, adj)
    else:
        ruta = svc_pdf.principal(doc)
    if ruta is None or not ruta.is_file():
        raise HTTPException(404, "No se encontró el archivo para convertir a imagen.")
    if ruta.suffix.lower() != ".pdf":
        raise HTTPException(422, "Solo se puede copiar como imagen un archivo PDF.")

    total = svc_imagen.paginas(ruta)
    if pagina < 1 or (total and pagina > total):
        raise HTTPException(422, f"El documento tiene {total} página(s).")
    formato = svc_imagen.formato_valido(formato)
    clave = svc_imagen.clave_de(ruta, pagina, ancho or None, formato)
    etag = f'"{clave}"'
    cabeceras = {
        "Cache-Control": CACHE_ARCHIVOS,
        "ETag": etag,
        "X-Total-Paginas": str(total or 1),
        # El navegador lee la cabecera solo si se le permite (CORS mismo
        # origen no la expone por omisión en respuestas opacas).
        "Access-Control-Expose-Headers": "X-Total-Paginas, ETag",
    }
    if coincide_etag(peticion.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=cabeceras)
    cache = raiz_cache_imagenes()
    datos = svc_imagen.leer_cache(cache, clave, formato)
    if datos is None:
        try:
            datos = svc_imagen.imagen_de_pagina(ruta, pagina, ancho or None, formato)
        except svc_imagen.ErrorImagen as e:
            raise HTTPException(500, str(e)) from e
        svc_imagen.guardar_cache(cache, clave, formato, datos)
        svc_imagen.podar_si_toca(cache, config.imagenes_cache_mb, config.imagenes_cache_dias)
    return Response(content=datos, media_type=svc_imagen.FORMATOS[formato], headers=cabeceras)


@router.get("/{documento_id}/adjuntos/{adjunto_id}")
async def descargar(
    documento_id: int,
    adjunto_id: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    doc = await _doc(documento_id, sesion)
    adj = await svc.cargar(documento_id, adjunto_id, sesion)
    ruta = svc.ruta_en_disco(doc, adj)
    if ruta is None or not ruta.is_file():
        raise HTTPException(404, "No se encontró el archivo adjunto.")
    return enviar_archivo(
        ruta,
        adj.nombre_original,
        adj.tipo_mime or "application/octet-stream",
        peticion=peticion,
    )


class CambioAdjunto(BaseModel):
    # Cada campo es opcional: el PATCH cambia solo lo que trae.
    es_anexo: bool | None = None
    # El nombre del adjunto (sale en la línea «Adj.») o el destinatario de un cargo.
    etiqueta: str | None = None
    # None = cliente sin aviso previo; False = responder 409 `anula_firma` si el
    # cambio anularía la firma; True = confirmado.
    confirmar_anulacion: bool | None = None


@router.patch("/{documento_id}/adjuntos/{adjunto_id}")
async def cambiar_adjunto(
    documento_id: int,
    adjunto_id: int,
    cambio: CambioAdjunto,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Marca/desmarca una imagen para incrustarla como página del PDF y/o
    cambia el nombre del adjunto. Las dos cosas son parte de lo impreso (la
    página y la línea «Adj.»): si el documento ya estaba firmado, la regla de
    vigencia anula la firma (servicios/vigencia.py)."""
    doc = await _doc(documento_id, sesion)
    adj = await svc.cargar(documento_id, adjunto_id, sesion)
    antes = await vigencia.huella_impresa(sesion, doc)
    motivos = []
    if cambio.es_anexo is not None and cambio.es_anexo != adj.es_anexo:
        adj = await svc.marcar_anexo(sesion, adj, cambio.es_anexo)
        bitacora.registrar(
            sesion, adj.documento_id, usuario, "anexo",
            f"{'Marcó' if cambio.es_anexo else 'Quitó'} «{adj.nombre_original}» "
            f"como página de anexo",
        )
        motivos.append(f"{'se incrustó' if cambio.es_anexo else 'se quitó'} la imagen «{adj.etiqueta or adj.nombre_original}»")
    if cambio.etiqueta is not None and " ".join(cambio.etiqueta.split()) != (adj.etiqueta or ""):
        previo = adj.etiqueta or adj.nombre_original
        svc.renombrar(sesion, doc, adj, cambio.etiqueta)
        bitacora.registrar(
            sesion, doc.id, usuario, "adjunto_renombrado",
            f"Cambió el nombre «{previo}» → «{adj.etiqueta}»",
        )
        motivos.append(f"cambió el nombre del adjunto «{previo}» a «{adj.etiqueta}»")
    resultado = vigencia.Resultado()
    if motivos:
        resultado = await vigencia.aplicar(
            sesion, doc, usuario, antes, "; ".join(motivos), cambio.confirmar_anulacion
        )
    await sesion.commit()
    return {**svc.resumen(adj), "documento_estado": doc.estado, **resultado.respuesta()}


@router.delete("/{documento_id}/adjuntos/{adjunto_id}")
async def eliminar(
    documento_id: int,
    adjunto_id: int,
    confirmar_anulacion: bool | None = None,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Quita un adjunto. El archivo no se borra: pasa a ``adjuntos/anulados/``
    (recuperable) y, si la transacción no llega al commit, vuelve a su lugar.

    Vigencia: quitar un adjunto cambia la línea «Adj.» (anula la firma si ya
    estaba firmado) y deja el expediente desactualizado; quitar el FIRMADO
    retira el expediente firmado y devuelve FIRMADO → APROBADO."""
    doc = await _doc(documento_id, sesion)
    adj = await svc.cargar(documento_id, adjunto_id, sesion)
    antes = await vigencia.huella_impresa(sesion, doc)
    ruta = svc.ruta_en_disco(doc, adj)
    if ruta and ruta.is_file():
        vigencia.mover(sesion, ruta, ruta.parent / vigencia.CARPETA_ANULADOS / ruta.name)
    nombre = adj.nombre_original
    categoria = adj.categoria or ""
    era_firmado = categoria == "firmado"
    await sesion.delete(adj)
    await sesion.flush()
    bitacora.registrar(
        sesion, doc.id, usuario, "adjunto_eliminado", f"Eliminó «{nombre}»"
    )
    resultado = vigencia.Resultado()
    expediente_retirado = ""
    if categoria == "":
        resultado = await vigencia.aplicar(
            sesion, doc, usuario, antes, f"se quitó el adjunto «{adj.etiqueta or nombre}»",
            confirmar_anulacion,
        )
    if era_firmado and await vigencia.firmado_vigente(sesion, doc) is None:
        # Sin firmado, el expediente firmado ya no corresponde a nada.
        expediente_retirado = vigencia.retirar_expediente(sesion, doc) or ""
        if expediente_retirado:
            bitacora.registrar(
                sesion, doc.id, usuario, "expediente",
                f"Expediente firmado retirado a expediente/anulados/ ({expediente_retirado}): se quitó el firmado",
            )
        await envio.desmarcar_firmado(sesion, doc, usuario)
    await sesion.commit()
    return {"ok": True, "documento_estado": doc.estado, "expediente_retirado": expediente_retirado, **resultado.respuesta()}


@router_lote.get("/vigencia")
async def vigencia_en_lote(
    ids: str = "",
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """El indicador del expediente de varios documentos a la vez (la bandeja, vista
    «Seguimiento»): `?ids=1,2,3` (hasta 1000) → {"12": {vigencia, motivos, con_firma}}.
    vigente | desactualizado | sin_armar; un borrador sin número no figura. Cálculo
    ligero (servicios/vigencia.expedientes_en_lote): una consulta para todos."""
    numeros = [int(x) for x in ids.split(",") if x.strip().isdigit()][:1000]
    if not numeros:
        return {}
    docs = (await sesion.execute(select(Documento).where(Documento.id.in_(numeros)))).scalars().all()
    docs = [d for d in docs if not d.oculto or usuario.rol == "administrador"]
    estados = await vigencia.expedientes_en_lote(sesion, docs)
    await sesion.commit()  # los SHA-256 calculados por primera vez quedan guardados
    return {str(k): v for k, v in estados.items()}

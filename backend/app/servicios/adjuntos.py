"""Almacenamiento y validación de archivos adjuntos.

Cada adjunto se guarda en la carpeta del propio documento, bajo
adjuntos/, con nombre saneado y prefijado por id (sin colisiones ni
path traversal). Extensiones y tamaño se validan antes de escribir.
"""

import re
import unicodedata
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Adjunto, Documento, Usuario
from app.servicios import nombres
from app.servicios.carpetas import asegurar_carpeta, carpeta

EXTENSIONES = {
    ".pdf", ".docx", ".xlsx", ".ods", ".odt",
    ".jpg", ".jpeg", ".png", ".zip", ".csv",
}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB (Edison 2026-09-05; antes 20)


def slug_archivo(nombre: str) -> str:
    base = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-._")
    if not base:
        return "archivo"
    # Al recortar nombres largos hay que PRESERVAR la extensión conocida: si se
    # corta a ciegas (base[:80]) un adjunto de descripción larga pierde el
    # «.pdf» y queda FUERA de la fusión del expediente (expediente.py) y del
    # conteo de folios (contar_paginas), que filtran por endswith(".pdf") — el
    # archivo se descarta en silencio. Se recorta el CUERPO y se re-añade la
    # extensión. Bug detectado con OF-0057 (pedido de Edison 2026-09-01).
    ext = Path(base).suffix.lower()
    if ext in EXTENSIONES and len(base) > 80:
        cuerpo = base[: -len(ext)].strip("-._")
        return (cuerpo[: 80 - len(ext)].strip("-._") or "archivo") + ext
    return base[:80]


_EXT_IMAGEN = {".png", ".jpg", ".jpeg"}


def es_imagen(a: Adjunto) -> bool:
    """Solo las imágenes pueden incrustarse como página del PDF."""
    return (a.tipo_mime or "").startswith("image/") or (
        Path(a.nombre_original).suffix.lower() in _EXT_IMAGEN
    )


CATEGORIAS = {"", "firmado", "recepcion", "respuesta"}


def resumen(a: Adjunto) -> dict:
    return {
        "id": a.id,
        "nombre": a.nombre_original,
        "tamano": a.tamano,
        "tipo_mime": a.tipo_mime,
        "subido_en": a.subido_en.isoformat(),
        "es_anexo": a.es_anexo,
        "es_imagen": es_imagen(a),
        "categoria": a.categoria,
        "etiqueta": a.etiqueta,
        # Cargo de una versión cuya firma se anuló: se ve, pero ya no cuenta
        # (servicios/vigencia.py).
        "anulado": a.categoria == "recepcion_anulada",
    }


def numero_corto(doc: Documento) -> str:
    """«OFICIO N°0024-2026-2027» — la forma corta que usan los nombres de
    archivo de la entidad (sin siglas). Para borradores, «S/N»."""
    from app.tipos import tipo_config

    tipodoc = tipo_config(doc.tipo)["tipodoc"].upper()
    parte = f"N°{doc.numero:04d}" if doc.numero else "S/N"
    return f"{tipodoc} {parte}-{doc.periodo}"


def nombre_convencion(doc: Documento, categoria: str, etiqueta: str, ext: str) -> str:
    """Nombre OFICIAL del archivo, delegado en la convención ÚNICA del sistema
    (servicios/nombres.py, Edison 2026-09-08):

      firmado   -> «FIRM-OF-0060-2026-2027_Asunto.pdf»
      recepcion -> «CR-OM-0014-2026-2027_Director-de-la-UGEL-Huanta.pdf»
      respuesta -> «RESP-OF-0057-2026-2027_MINEDU.pdf»
      adjunto   -> «ADJ-OF-0060-2026-2027_Relacion-de-dirigentes.pdf»

    Antes cada categoría armaba su propio nombre aquí («CONSTANCIA_DE_RECEPCION
    OFICIO N°…», «…[R].pdf»), largos y sin un patrón común. El archivo se
    renombra AL SUBIR, venga como venga.
    """
    return nombres.derivado(doc, categoria, etiqueta, ext)


async def por_categoria(
    sesion: AsyncSession, documento_ids: list[int]
) -> dict[int, dict]:
    """Para la bandeja, en UNA consulta (sin N+1) por documento:
    {"firmado": adj_id | None, "recepciones": [{"id", "etiqueta"}, ...]}."""
    from sqlalchemy import select

    if not documento_ids:
        return {}
    filas = (
        await sesion.execute(
            select(Adjunto)
            .where(
                Adjunto.documento_id.in_(documento_ids),
                Adjunto.categoria.in_(["firmado", "recepcion"]),
            )
            .order_by(Adjunto.id)
        )
    ).scalars().all()
    mapa: dict[int, dict] = {}
    for a in filas:
        entrada = mapa.setdefault(a.documento_id, {"firmado": None, "recepciones": []})
        if a.categoria == "firmado":
            entrada["firmado"] = a.id  # el último gana (más reciente)
        else:
            entrada["recepciones"].append({"id": a.id, "etiqueta": a.etiqueta})
    return mapa


async def conteo_anexos(
    sesion: AsyncSession, documento_ids: list[int]
) -> dict[int, int]:
    """Cuántos ANEXOS (adjuntos de categoría vacía) tiene cada documento — NO
    cuenta el firmado ni las constancias de recepción. Para la columna «Anexos»
    de la bandeja (una sola consulta, sin N+1)."""
    from sqlalchemy import func, or_, select

    if not documento_ids:
        return {}
    filas = await sesion.execute(
        select(Adjunto.documento_id, func.count())
        .where(
            Adjunto.documento_id.in_(documento_ids),
            or_(Adjunto.categoria == "", Adjunto.categoria.is_(None)),
        )
        .group_by(Adjunto.documento_id)
    )
    return {doc_id: total for doc_id, total in filas.all()}


async def marcar_anexo(
    sesion: AsyncSession, adj: Adjunto, valor: bool
) -> Adjunto:
    """Marca/desmarca un adjunto como página de anexo del PDF. Solo las
    imágenes pueden incrustarse."""
    if valor and not es_imagen(adj):
        raise HTTPException(
            422, "Solo las imágenes se pueden incrustar como página del PDF."
        )
    adj.es_anexo = valor
    # Sin commit: el llamador evalúa antes la vigencia de la firma (una imagen
    # incrustada es parte de lo impreso) y confirma todo junto.
    await sesion.flush()
    return adj


async def anexos_de(sesion: AsyncSession, documento_id: int) -> list[str]:
    """Nombres de archivo de los adjuntos marcados como anexo (en orden),
    para que el generador los incruste como páginas finales."""
    from sqlalchemy import select

    filas = (
        await sesion.execute(
            select(Adjunto)
            .where(Adjunto.documento_id == documento_id, Adjunto.es_anexo.is_(True))
            .order_by(Adjunto.id)
        )
    ).scalars().all()
    return [a.nombre_archivo for a in filas]


async def documentos_adjuntos(sesion: AsyncSession, doc: Documento) -> list[Adjunto]:
    """Adjuntos GENÉRICOS (otros documentos que acompañan al oficio): los
    de categoría vacía que NO están marcados para incrustarse como imagen
    (esos son páginas del propio PDF). En orden de subida. Son los que van
    en la RELACIÓN y se fusionan en el expediente."""
    from sqlalchemy import or_, select

    return list(
        (
            await sesion.execute(
                select(Adjunto)
                .where(
                    Adjunto.documento_id == doc.id,
                    or_(Adjunto.categoria == "", Adjunto.categoria.is_(None)),
                    Adjunto.es_anexo.is_(False),
                )
                .order_by(Adjunto.id)
            )
        ).scalars().all()
    )


async def relacion_adjuntos(sesion: AsyncSession, doc: Documento) -> list[dict]:
    """Para la RELACIÓN DE DOCUMENTOS ADJUNTOS del PDF: cada adjunto con su
    descripción (etiqueta o nombre) y sus folios (páginas si es PDF)."""
    from app.servicios.pdf import contar_paginas

    dir_adj = _dir_adjuntos(doc)
    salida: list[dict] = []
    for a in await documentos_adjuntos(sesion, doc):
        desc = (a.etiqueta or "").strip() or Path(a.nombre_original).stem
        folios = None
        if dir_adj and a.nombre_archivo.lower().endswith(".pdf"):
            ruta = dir_adj / a.nombre_archivo
            if ruta.is_file():
                folios = contar_paginas(ruta)
        salida.append({"descripcion": desc, "folios": folios})
    return salida


def _dir_adjuntos(doc: Documento) -> Path | None:
    base = carpeta(doc)
    return (base / "adjuntos") if base else None


def _etiqueta_de(stem: str) -> str:
    """De quién es el archivo, en las dos convenciones: lo que sigue a « - »
    (nombres antiguos) o al último «_» (nombres nuevos: «CR-OM-0014-2026-2027_
    Director-de-la-UGEL-Huanta»), con los guiones vueltos a espacios."""
    if " - " in stem:
        return stem.split(" - ", 1)[1].strip()
    if "_" in stem:
        return stem.split("_", 1)[1].replace("-", " ").strip()
    return ""


async def reconocer_en_carpeta(
    sesion: AsyncSession, doc: Documento, usuario_id: int
) -> list[str]:
    """RECONOCE archivos ya existentes en la carpeta del documento que
    siguen la convención de la entidad y los registra como adjuntos:

      NUEVA (2026-09-08)          ANTERIOR
      «FIRM-…»                    «…[R].pdf»                 -> firmado
      «CR-…»                      «CONSTANCIA_DE_RECEPCION …»-> recepción
      «RESP-…»                                               -> recibido

    Se aceptan las dos: en las carpetas hay archivos escaneados y renombrados
    a mano desde antes del cambio de convención, y dejar de reconocerlos los
    volvería invisibles para el seguimiento (el conteo de cargos es lo que da
    por enviado un documento).

    Los archivos se MUEVEN a adjuntos/ (dentro de la misma carpeta del
    documento) conservando su nombre. Idempotente: lo ya registrado (por
    nombre_original) se omite. Devuelve los nombres registrados."""
    import shutil

    from sqlalchemy import select

    base = carpeta(doc)
    if base is None or not base.is_dir():
        return []
    existentes = {
        n for (n,) in (
            await sesion.execute(
                select(Adjunto.nombre_original).where(
                    Adjunto.documento_id == doc.id
                )
            )
        ).all()
    }
    registrados: list[str] = []
    for ruta in sorted(base.iterdir()):
        if not ruta.is_file() or ruta.suffix.lower() not in EXTENSIONES:
            continue
        nombre = ruta.name
        stem = ruta.stem
        arriba = nombre.upper()
        if stem.endswith("[R]") or arriba.startswith("FIRM-"):
            categoria, etiqueta = "firmado", ""
        elif arriba.startswith("CONSTANCIA_DE_RECEPCION") or arriba.startswith("CR-"):
            categoria = "recepcion"
            etiqueta = _etiqueta_de(stem)
        elif arriba.startswith("RESP-"):
            categoria, etiqueta = "respuesta", _etiqueta_de(stem)
        else:
            continue
        if nombre in existentes:
            continue
        dir_adj = base / "adjuntos"
        dir_adj.mkdir(parents=True, exist_ok=True)
        destino = dir_adj / nombre
        shutil.move(str(ruta), str(destino))
        from app.servicios.vigencia import sha256_archivo

        adj = Adjunto(
            documento_id=doc.id,
            nombre_original=nombre,
            nombre_archivo=nombre,
            sha256=sha256_archivo(destino),
            tamano=destino.stat().st_size,
            tipo_mime="application/pdf" if ruta.suffix.lower() == ".pdf" else "",
            categoria=categoria,
            etiqueta=etiqueta,
            subido_por=usuario_id,
        )
        sesion.add(adj)
        registrados.append(nombre)
    return registrados


async def _leer_subida(archivo: UploadFile) -> tuple[str, bytes]:
    """Extensión validada y contenido (con el tope de tamaño)."""
    ext = Path(archivo.filename or "").suffix.lower()
    if ext not in EXTENSIONES:
        raise HTTPException(
            422,
            "Tipo de archivo no permitido. Se aceptan: "
            + ", ".join(sorted(e[1:] for e in EXTENSIONES)) + ".",
        )
    # Rechazo temprano por tamaño (Starlette expone .size sin leer todo).
    if archivo.size is not None and archivo.size > MAX_BYTES:
        raise HTTPException(413, "El archivo supera el límite de 50 MB.")
    contenido = await archivo.read()
    if len(contenido) > MAX_BYTES:
        raise HTTPException(413, "El archivo supera el límite de 50 MB.")
    return ext, contenido


async def guardar(
    sesion: AsyncSession, doc: Documento, archivo: UploadFile, usuario: Usuario,
    categoria: str = "", etiqueta: str = "",
) -> Adjunto:
    from app.servicios import vigencia

    ext, contenido = await _leer_subida(archivo)

    # Usar la carpeta EXISTENTE (heredado o web ya compilado); solo
    # crearla si es un borrador web que nunca se compiló. Adjuntar NUNCA
    # renombra la carpeta de un heredado.
    if carpeta(doc) is None:
        await asegurar_carpeta(doc)
        await sesion.commit()
    dir_adjuntos = _dir_adjuntos(doc)
    dir_adjuntos.mkdir(parents=True, exist_ok=True)

    categoria = categoria if categoria in CATEGORIAS else ""
    etiqueta = etiqueta.strip()[:160]
    if not etiqueta and categoria == "":
        # Un adjunto sin nombre imprimía «ADJ-OF-0060-2026-2027_Asunto» en la
        # línea «Adj.» (el nombre de convención): se toma el del archivo.
        etiqueta = " ".join(Path(archivo.filename or "").stem.replace("_", " ").split())[:160]
    # Convención de nombres de la entidad: firmado -> «…[R].pdf»;
    # recepción -> «CONSTANCIA_DE_RECEPCION …». Se renombra AL SUBIR,
    # sin importar cómo venga el archivo.
    nombre_oficial = nombre_convencion(doc, categoria, etiqueta, ext) or (
        archivo.filename or "archivo"
    )
    adj = Adjunto(
        documento_id=doc.id,
        nombre_original=nombre_oficial,
        nombre_archivo="",  # se fija tras conocer el id
        tamano=len(contenido),
        tipo_mime=archivo.content_type or "",
        categoria=categoria,
        etiqueta=etiqueta,
        sha256=vigencia.sha256_bytes(contenido),
        subido_por=usuario.id,
    )
    sesion.add(adj)
    await sesion.flush()
    # En disco va el MISMO nombre amigable (Edison 2026-09-08: el id interno
    # «0173-» empujaba lo importante y no le dice nada a quien recibe el
    # archivo). La unicidad, que antes daba el id, ahora la resuelve un sufijo
    # «-2» solo cuando de verdad hay dos archivos con el mismo nombre.
    adj.nombre_archivo = nombres.unico_en(dir_adjuntos, slug_archivo(nombre_oficial))
    (dir_adjuntos / adj.nombre_archivo).write_bytes(contenido)
    # Si la transacción no se confirma (p. ej. el usuario no aceptó anular la
    # firma), el archivo no queda huérfano en la carpeta.
    vigencia.creado(sesion, dir_adjuntos / adj.nombre_archivo)
    return adj


async def reemplazar_archivo(
    sesion: AsyncSession, doc: Documento, adj: Adjunto, archivo: UploadFile
) -> str:
    """Cambia el ARCHIVO de un adjunto conservando su id, su nombre (etiqueta)
    y su categoría: una versión corregida del mismo informe, un escaneo más
    legible del firmado. El anterior se aparta a ``adjuntos/anteriores/`` con
    marca de tiempo (recuperable). No hace commit: el llamador evalúa la
    vigencia (servicios/vigencia.py) antes. Devuelve el nombre del anterior."""
    from app.servicios import vigencia

    ext, contenido = await _leer_subida(archivo)
    dir_adjuntos = _dir_adjuntos(doc)
    if dir_adjuntos is None:
        raise HTTPException(409, "El documento no tiene carpeta.")
    dir_adjuntos.mkdir(parents=True, exist_ok=True)
    viejo = dir_adjuntos / adj.nombre_archivo
    apartado = vigencia.mover(
        sesion, viejo, dir_adjuntos / vigencia.CARPETA_ANTERIORES / viejo.name
    )
    if Path(adj.nombre_archivo).suffix.lower() != ext:
        # Otra extensión (un .docx corregido que ahora llega en PDF): el nombre
        # se rehace con la convención, conservando la etiqueta.
        oficial = nombre_convencion(doc, adj.categoria or "", adj.etiqueta, ext)
        adj.nombre_original = oficial
        adj.nombre_archivo = nombres.unico_en(dir_adjuntos, slug_archivo(oficial))
    destino = dir_adjuntos / adj.nombre_archivo
    destino.write_bytes(contenido)
    vigencia.creado(sesion, destino)
    adj.tamano = len(contenido)
    adj.tipo_mime = archivo.content_type or adj.tipo_mime
    adj.sha256 = vigencia.sha256_bytes(contenido)
    if adj.es_anexo and not es_imagen(adj):
        adj.es_anexo = False
    return apartado.name if apartado else ""


def renombrar(sesion: AsyncSession, doc: Documento, adj: Adjunto, etiqueta: str) -> None:
    """Cambia el NOMBRE (etiqueta) de un adjunto o el destinatario de un cargo
    y, con él, el archivo en disco (convención de servicios/nombres.py). No hace
    commit: el nombre de un adjunto sale en la línea «Adj.» del documento, así
    que el llamador evalúa antes la vigencia de la firma."""
    from app.servicios import vigencia

    etiqueta = " ".join((etiqueta or "").split())[:160]
    if not etiqueta and (adj.categoria or "") == "":
        raise HTTPException(422, "El adjunto necesita un nombre: es lo que sale en la línea «Adj.».")
    adj.etiqueta = etiqueta
    dir_adjuntos = _dir_adjuntos(doc)
    if dir_adjuntos is None or adj.categoria == "firmado":
        return
    ext = Path(adj.nombre_archivo).suffix.lower()
    oficial = nombre_convencion(doc, adj.categoria or "", etiqueta, ext)
    viejo = dir_adjuntos / adj.nombre_archivo
    nuevo = slug_archivo(oficial)
    if nuevo == adj.nombre_archivo or not viejo.is_file():
        adj.nombre_original = oficial
        return
    nuevo = nombres.unico_en(dir_adjuntos, nuevo)
    vigencia.mover(sesion, viejo, dir_adjuntos / nuevo)
    adj.nombre_original = oficial
    adj.nombre_archivo = nuevo


async def cargar(
    documento_id: int, adjunto_id: int, sesion: AsyncSession
) -> Adjunto:
    from sqlalchemy import select

    adj = (
        await sesion.execute(
            select(Adjunto).where(
                Adjunto.id == adjunto_id,
                Adjunto.documento_id == documento_id,
            )
        )
    ).scalar_one_or_none()
    if adj is None:
        raise HTTPException(404, "El adjunto no existe.")
    return adj


def ruta_en_disco(doc: Documento, adj: Adjunto) -> Path | None:
    dir_adjuntos = _dir_adjuntos(doc)
    return (dir_adjuntos / adj.nombre_archivo) if dir_adjuntos else None


async def nombres_adjuntos(sesion: AsyncSession, documento_id: int) -> list[str]:
    """Nombres (sin extensión) de los DOCUMENTOS ADJUNTOS —categoría vacía—,
    en orden de carga. Con ellos se arma sola la línea «Adj.» del pie del
    documento (Edison 2026-09-05: «la línea Adj. en realidad es el nombre del
    archivo adjunto»)."""
    from pathlib import Path

    from sqlalchemy import or_, select

    filas = (
        await sesion.execute(
            select(Adjunto)
            .where(
                Adjunto.documento_id == documento_id,
                or_(Adjunto.categoria == "", Adjunto.categoria.is_(None)),
            )
            .order_by(Adjunto.id)
        )
    ).scalars().all()
    # La etiqueta es la descripción que escribió la persona («Informe
    # técnico»); el nombre en disco lleva un id y guiones (0158-Informe-tecnico)
    # y no sirve para imprimir.
    return [
        (a.etiqueta or "").strip() or Path(a.nombre_original or a.nombre_archivo).stem
        for a in filas
    ]


def nombres_manuales(campos: dict) -> list[str]:
    """Adjuntos SIN archivo escritos en el formulario (un documento físico, «Lo
    indicado (05 folios)»…). Viven en `campos.anexo` separados por «; »: el
    mismo campo que antes era la línea «Adj.» a mano, así los documentos
    antiguos aparecen como una entrada manual y se pueden editar o quitar."""
    crudo = (campos or {}).get("anexo") or ""
    return [n.strip() for n in crudo.split(";") if n.strip()]


def combinar_adjuntos(manuales: list[str], archivos: list[str]) -> list[str]:
    """Nombres de la línea «Adj.»: los escritos sin archivo y luego los
    archivos cargados, SIN repetir. Un nombre escrito al que después se le
    cargó su PDF desde la vista previa (Edison 2026-10-01) ya vive como
    archivo con esa misma etiqueta: el nombre suelto se omite aunque el
    formulario todavía no se haya guardado."""
    clave = lambda t: " ".join(t.lower().split())  # noqa: E731
    con_archivo = {clave(a) for a in archivos}
    return [m for m in manuales if clave(m) not in con_archivo] + list(archivos)


def linea_adj(nombres: list[str]) -> str:
    """«Relación de dirigentes; Informe técnico» — texto de la línea «Adj.» a
    partir de los nombres de los adjuntos (manuales + archivos). El generador
    lo parte por «; » y lo compone en LISTA numerada (generador.items_adjunto);
    ya no lleva el sufijo «(N documentos)»: la numeración dice cuántos son
    (2026-10-01)."""
    return "; ".join(n.strip() for n in nombres if n and n.strip())

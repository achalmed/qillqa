"""Envío de archivos de la entidad (PDF, adjuntos, expediente) al navegador.

Existe por un fallo real (Edison 2026-09-08, OM-0016): se corrigió la hora de
una reunión, el PDF de la carpeta quedó bien y el VISOR siguió mostrando la
versión anterior durante más de una hora.

El servidor no tenía la culpa —`FileResponse` lee el archivo del disco en cada
petición, no hay copia ni índice intermedio—, pero la respuesta no decía nada
sobre su caducidad. Cuando falta `Cache-Control`, HTTP autoriza al navegador a
INVENTARSE cuánto tiempo sigue fresca la respuesta: la heurística habitual es
~10 % del tiempo transcurrido desde `Last-Modified`. Un PDF generado ayer se
da por bueno durante más de una hora, y el navegador ni siquiera pregunta
(peticiones con `transferSize: 0`). De ahí que el síntoma pareciera aleatorio
—en un documento recién creado no pasa— y que recargar la página no lo
arreglara: no hay petición que revalidar.

`no-cache` NO significa «no guardes»: significa «guarda, pero pregunta SIEMPRE
antes de usarlo». Con el `ETag` que `FileResponse` ya envía, comprobar cuesta
un 304 de unos bytes cuando el archivo no cambió, y trae el archivo nuevo en
cuanto cambió. El PDF de la carpeta vuelve a ser la única fuente de verdad
también para el navegador.

`private` es lo otro que faltaba: estos archivos son documentos autenticados y
el sistema se publica por un túnel (Cloudflare/Tailscale Funnel), que es una
caché COMPARTIDA de por medio. Sin `private`, un intermediario podría guardar
el oficio de un usuario y entregárselo a otro.

Y la revalidación se responde aquí: `FileResponse` de Starlette MANDA un ETag
pero nunca lo COMPARA, así que sin esto cada apertura del visor volvería a
bajar el PDF entero por el túnel. Con el 304, preguntar cuesta unos bytes y
solo se transfiere el archivo cuando de verdad cambió.
"""

import hashlib
from email.utils import formatdate
from pathlib import Path

import re

from fastapi import Request
from fastapi.responses import FileResponse, Response, StreamingResponse

# Guardar sí, reutilizar sin preguntar no.
CACHE_ARCHIVOS = "private, no-cache, must-revalidate"


def _version(ruta: Path) -> tuple[str, str]:
    """(ETag, Last-Modified) del archivo TAL COMO ESTÁ AHORA en el disco.

    Se calcula de la fecha de modificación (en nanosegundos) y el tamaño, que
    es lo mismo que usa el manifiesto de sincronización: recompilar un
    documento siempre reescribe el PDF, así que el ETag cambia y el navegador
    se ve obligado a traerlo. Nunca cachear este valor: leer el disco en cada
    petición es lo que mantiene el archivo de la carpeta como única fuente."""
    st = ruta.stat()
    firma = hashlib.md5(f"{st.st_mtime_ns}-{st.st_size}".encode()).hexdigest()
    return f'"{firma}"', formatdate(st.st_mtime, usegmt=True)


def coincide_etag(if_none_match: str | None, etag: str) -> bool:
    """¿El `If-None-Match` que mandó el navegador nombra a `etag`? La cabecera puede traer varios
    validadores separados por coma, o `*`. La usan `enviar_archivo` y la imagen de página
    (`adjuntos.py::imagen_de_pagina`), que calcula su ETag sin archivo de por medio. Pura."""
    enviados = [t.strip() for t in (if_none_match or "").split(",") if t.strip()]
    return etag in enviados or "*" in enviados


def rango_pedido(cabecera: str | None, tamano: int) -> tuple[int, int] | None:
    """(inicio, fin inclusive) de un «Range: bytes=…» de un solo tramo, o None si no se
    pidió o no se entiende (se manda el archivo entero). («bytes=0-», «bytes=100-199»,
    «bytes=-500» = los últimos 500.) Un inicio más allá del final da (tamano, tamano-1):
    el llamador responde 416."""
    m = re.fullmatch(r"\s*bytes=(\d*)-(\d*)\s*", cabecera or "")
    if not m or (not m.group(1) and not m.group(2)) or tamano <= 0:
        return None
    if not m.group(1):
        largo = int(m.group(2))
        return (max(0, tamano - largo), tamano - 1) if largo else None
    inicio = int(m.group(1))
    fin = min(int(m.group(2)), tamano - 1) if m.group(2) else tamano - 1
    if inicio >= tamano:
        return tamano, tamano - 1
    return (inicio, fin) if fin >= inicio else None


def _tramo(ruta: Path, inicio: int, fin: int):
    with ruta.open("rb") as fh:
        fh.seek(inicio)
        resta = fin - inicio + 1
        while resta > 0:
            trozo = fh.read(min(1024 * 1024, resta))
            if not trozo:
                break
            resta -= len(trozo)
            yield trozo


def enviar_archivo(
    ruta: Path,
    nombre: str,
    media_type: str = "application/pdf",
    peticion: Request | None = None,
    rangos: bool = False,
) -> Response:
    """Un archivo de la entidad, con la política de caché de arriba. Usarla en
    TODA respuesta de archivo: el visor, la descarga y la sincronización a la
    carpeta local comparten estos mismos endpoints, así que una copia vieja no
    solo se ve en pantalla — también se copia al USB.

    Con `peticion`, un cliente que ya tenga la versión vigente recibe 304 y no
    vuelve a descargarla.

    `rangos=True` (los videos de la Fototeca, 2026-10-06): anuncia `Accept-Ranges` y
    contesta un `Range` de un tramo con 206, para que el reproductor del navegador
    pueda adelantar sin bajar el video entero. Los PDF no lo usan: el visor pediría
    trozos y cambiaría su manera de cargar."""
    etag, modificado = _version(ruta)
    cabeceras = {
        "Cache-Control": CACHE_ARCHIVOS,
        "ETag": etag,
        "Last-Modified": modificado,
    }
    if rangos:
        cabeceras["Accept-Ranges"] = "bytes"
    if peticion is not None:
        if coincide_etag(peticion.headers.get("if-none-match"), etag):
            return Response(status_code=304, headers=cabeceras)
        if rangos and peticion.headers.get("range"):
            if_range = peticion.headers.get("if-range")
            tamano = ruta.stat().st_size
            tramo = rango_pedido(peticion.headers.get("range"), tamano) if not if_range or if_range == etag else None
            if tramo is not None:
                inicio, fin = tramo
                if inicio >= tamano:
                    return Response(status_code=416, headers={**cabeceras, "Content-Range": f"bytes */{tamano}"})
                return StreamingResponse(_tramo(ruta, inicio, fin), status_code=206, media_type=media_type, headers={
                    **cabeceras, "Content-Range": f"bytes {inicio}-{fin}/{tamano}", "Content-Length": str(fin - inicio + 1),
                })
    return FileResponse(
        ruta, media_type=media_type, filename=nombre, headers=cabeceras
    )

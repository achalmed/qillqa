"""Una página del PDF, convertida a imagen PNG.

Existe para que en la web se pueda COPIAR el documento y pegarlo en WhatsApp,
Telegram, Word o un correo, sin descargar nada (Edison 2026-09-08: «solo copia
y pega, para no estar descargando, abriendo, etc.»).

Por qué una imagen y no el PDF: el portapapeles del navegador solo admite
texto, HTML e imagen PNG —`ClipboardItem.supports('application/pdf')` es
`false` en el Chromium de la entidad—, así que copiar el archivo PDF no es
posible desde una página web. La imagen sí se pega en cualquier chat y se ve el
oficio completo.

No es una captura de pantalla: se rasteriza el PDF de la carpeta con
`pdftocairo` a 150 ppp, así que sale con el texto nítido, el membrete y el
sello, y siempre de la versión vigente del archivo — el mismo criterio de
fuente única que el visor y la descarga.

Se usa `pdftocairo` y no `pdftoppm` (los dos son de poppler-utils, ya instalado
para compilar) por una razón práctica: `pdftoppm` de esta versión NO escribe el
PNG a la salida estándar —devuelve vacío y sin error—, mientras que
`pdftocairo` sí, y además rasteriza el texto con mejor calidad.

Desde el 2026-10-19 la misma imagen es la puerta de entrada diaria a los documentos (el visor
rápido de la bandeja), y Edison pidió que fuera «lo más liviano posible». Tres cosas lo logran
sin que deje de servirse SIEMPRE la versión vigente del PDF:

- Un **ETag** (`clave_pagina`) calculado ANTES de rasterizar con lo que determina la imagen: la
  ruta, la fecha y el tamaño del PDF —lo mismo que usa `api/archivos.py` para el archivo— más la
  página, el ancho, la resolución y el formato. Si el navegador ya la tiene, el endpoint responde
  304 sin llamar a pdftocairo; si el PDF se recompiló, la fecha cambia y la imagen se vuelve a
  generar.
- Un **caché en disco** (`leer_cache`/`guardar_cache`) con esa misma clave como nombre de archivo,
  fuera del repo y del archivo documental (`config.raiz_cache_imagenes`): la segunda persona que
  abre el mismo oficio, o la misma persona desde otro navegador, no espera a pdftocairo. Es
  desechable (borrar la carpeta solo cuesta volver a rasterizar) y acotado: `podar` borra lo más
  viejo que IMAGENES_CACHE_DIAS y lo que sobra por encima de IMAGENES_CACHE_MB.
- Salida **JPEG** opcional (`formato="jpeg"`, calidad 82): media página de texto pesa menos de la
  mitad que en PNG y en pantalla no se distingue. PNG sigue siendo el valor por omisión porque
  «Copiar como imagen» necesita PNG en el portapapeles (`frontend/src/copiar.ts`).
"""

import hashlib
import os
import subprocess
import time
from pathlib import Path

# 150 ppp: una A4 sale en ~1240x1754 px (nítida al pegarla y al imprimirla
# desde un chat) sin llegar al peso de 300 ppp, que tarda en subir por el
# enlace de la entidad.
RESOLUCION = 150
ESPERA = 25  # segundos; un oficio tarda décimas, pero un expediente pesa más


# Calidad JPEG: a 82 un oficio a 768 px pesa 68 KB (PNG: 109 KB) sin halos visibles en el texto;
# `optimize` recalcula las tablas de Huffman (−8 % sin perder nada). Medido el 2026-10-19 en la
# instancia de prueba; las cifras están en docs/decisiones.md.
OPCIONES_JPEG = "quality=82,optimize=y"
FORMATOS = {"png": "image/png", "jpeg": "image/jpeg"}
# Cada cuánto se poda el caché como mucho (segundos): la poda lista la carpeta entera.
INTERVALO_PODA = 300


class ErrorImagen(RuntimeError):
    pass


def formato_valido(formato: str | None) -> str:
    """«png» o «jpeg» (también se acepta «jpg»); cualquier otra cosa es PNG, el valor por omisión."""
    f = (formato or "png").strip().lower()
    if f == "jpg":
        f = "jpeg"
    return f if f in FORMATOS else "png"


def paginas(pdf: Path) -> int:
    """Cuántas páginas tiene el PDF (0 si no se puede leer)."""
    try:
        salida = subprocess.run(
            ["pdfinfo", str(pdf)], capture_output=True, text=True, timeout=ESPERA
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return 0
    for linea in salida.splitlines():
        if linea.startswith("Pages:"):
            try:
                return int(linea.split(":", 1)[1])
            except ValueError:
                return 0
    return 0


def resolucion_para(ancho: int | None) -> int:
    """La resolución (ppp) que deja una A4 en `ancho` píxeles; sin ancho (o fuera de 40–1240), la
    de siempre. Las miniaturas del visor rápido (2026-10-19) piden 160 px: ~19 ppp, veinte veces
    más ligero que la página entera. Pura."""
    if not ancho or ancho < 40 or ancho >= 1240:
        return RESOLUCION
    return max(12, round(RESOLUCION * ancho / 1240))


def clave_pagina(
    ruta: str, mtime_ns: int, tamano: int, pagina: int, ancho: int | None, formato: str = "png"
) -> str:
    """La firma de una imagen de página: 32 hex de todo lo que la determina (ruta, fecha y tamaño
    del PDF, página, resolución efectiva y formato). Es el ETag del endpoint (entre comillas) y
    el nombre del archivo en el caché. Pura: la fecha y el tamaño se le pasan, para probarla sin
    disco. El ancho entra por la resolución que produce (dos anchos con la misma resolución son
    la misma imagen)."""
    f = formato_valido(formato)
    texto = f"{ruta}|{mtime_ns}|{tamano}|{pagina}|{resolucion_para(ancho)}|{f}"
    return hashlib.md5(texto.encode()).hexdigest()


def clave_de(pdf: Path, pagina: int, ancho: int | None, formato: str = "png") -> str:
    """`clave_pagina` leyendo del disco la fecha y el tamaño TAL COMO ESTÁN AHORA (nunca se
    cachea este valor: así un PDF recompilado cambia de clave)."""
    st = pdf.stat()
    return clave_pagina(str(pdf), st.st_mtime_ns, st.st_size, pagina, ancho, formato)


# ----------------------------------------------------------------------------- caché en disco


def ruta_cache(carpeta: Path, clave: str, formato: str = "png") -> Path:
    return carpeta / f"{clave}.{formato_valido(formato)}"


def leer_cache(carpeta: Path | None, clave: str, formato: str = "png") -> bytes | None:
    """La imagen guardada con esa clave, o None. Un acierto le renueva la fecha al archivo, para
    que `podar` desaloje lo que no se usa y no lo que se generó hace tiempo."""
    if carpeta is None:
        return None
    archivo = ruta_cache(carpeta, clave, formato)
    try:
        datos = archivo.read_bytes()
    except OSError:
        return None
    if not datos:
        return None
    try:
        os.utime(archivo, None)
    except OSError:
        pass
    return datos


def guardar_cache(carpeta: Path | None, clave: str, formato: str, datos: bytes) -> None:
    """Guarda la imagen de forma atómica (archivo temporal y `os.replace`): otra petición que
    lea a la vez nunca ve un archivo a medias. Un fallo del disco no rompe la respuesta."""
    if carpeta is None or not datos:
        return
    try:
        carpeta.mkdir(parents=True, exist_ok=True)
        destino = ruta_cache(carpeta, clave, formato)
        temporal = destino.with_name(f"{destino.name}.{os.getpid()}.tmp")
        temporal.write_bytes(datos)
        os.replace(temporal, destino)
    except OSError:
        return


def a_borrar(
    entradas: list[tuple[str, int, float]], tope_bytes: int, edad_max_s: float, ahora: float
) -> list[str]:
    """Qué nombres borrar de un caché descrito como (nombre, tamaño, fecha de último uso): primero
    todo lo más viejo que `edad_max_s`; después, de lo que queda, lo menos usado hasta que la suma
    quepa en `tope_bytes`. Pura; la usa `podar`."""
    fuera: list[str] = []
    vivas: list[tuple[str, int, float]] = []
    for nombre, tamano, fecha in entradas:
        if edad_max_s > 0 and ahora - fecha > edad_max_s:
            fuera.append(nombre)
        else:
            vivas.append((nombre, tamano, fecha))
    total = sum(t for _, t, _ in vivas)
    if tope_bytes > 0 and total > tope_bytes:
        for nombre, tamano, _ in sorted(vivas, key=lambda e: e[2]):
            if total <= tope_bytes:
                break
            fuera.append(nombre)
            total -= tamano
    return fuera


def podar(carpeta: Path | None, tope_mb: int, dias: int, ahora: float | None = None) -> int:
    """Borra del caché lo más viejo que `dias` y lo que sobra por encima de `tope_mb` (lo menos
    usado primero). Devuelve cuántos archivos se fueron. Los `.tmp` de más de una hora son restos
    de un proceso interrumpido y también se van."""
    if carpeta is None or not carpeta.is_dir():
        return 0
    ahora = time.time() if ahora is None else ahora
    entradas: list[tuple[str, int, float]] = []
    borrados = 0
    for archivo in carpeta.iterdir():
        try:
            st = archivo.stat()
        except OSError:
            continue
        if archivo.suffix == ".tmp":
            if ahora - st.st_mtime > 3600:
                archivo.unlink(missing_ok=True)
                borrados += 1
            continue
        if archivo.is_file():
            entradas.append((archivo.name, st.st_size, st.st_mtime))
    for nombre in a_borrar(entradas, tope_mb * 1024 * 1024, dias * 86400, ahora):
        try:
            (carpeta / nombre).unlink(missing_ok=True)
            borrados += 1
        except OSError:
            pass
    return borrados


_ultima_poda = 0.0


def podar_si_toca(carpeta: Path | None, tope_mb: int, dias: int) -> None:
    """`podar`, pero como mucho una vez cada INTERVALO_PODA segundos por proceso: se llama tras cada
    imagen nueva y listar la carpeta en cada una sería pagar la poda en la petición."""
    global _ultima_poda
    ahora = time.time()
    if ahora - _ultima_poda < INTERVALO_PODA:
        return
    _ultima_poda = ahora
    podar(carpeta, tope_mb, dias, ahora)


# ----------------------------------------------------------------------------- rasterizar


def png_de_pagina(pdf: Path, pagina: int = 1, ancho: int | None = None) -> bytes:
    """La página como PNG (el nombre histórico; «Copiar como imagen» sigue entrando por aquí)."""
    return imagen_de_pagina(pdf, pagina, ancho, "png")


def imagen_de_pagina(pdf: Path, pagina: int = 1, ancho: int | None = None, formato: str = "png") -> bytes:
    """La página `pagina` (1..N) del PDF como PNG o JPEG (reducida a `ancho` px si se pide).
    `pdftocairo` escribe a la salida estándar con `-` como destino, así que no se deja ningún
    archivo temporal que después haya que limpiar."""
    f = formato_valido(formato)
    salida = ["-jpeg", "-jpegopt", OPCIONES_JPEG] if f == "jpeg" else ["-png"]
    try:
        proceso = subprocess.run(
            [
                "pdftocairo", *salida, "-r", str(resolucion_para(ancho)),
                "-f", str(pagina), "-l", str(pagina), "-singlefile",
                str(pdf), "-",
            ],
            capture_output=True,
            timeout=ESPERA,
        )
    except FileNotFoundError as e:  # poppler no instalado
        raise ErrorImagen("Falta «pdftocairo» (poppler-utils) en el servidor.") from e
    except subprocess.SubprocessError as e:
        raise ErrorImagen("La conversión del PDF a imagen tardó demasiado.") from e
    if proceso.returncode != 0 or not proceso.stdout:
        detalle = (proceso.stderr or b"").decode(errors="replace").strip()[:200]
        raise ErrorImagen(f"No se pudo convertir la página a imagen. {detalle}".strip())
    return proceso.stdout

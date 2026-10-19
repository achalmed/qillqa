"""Prensa: el estudio de Identidad Visual dentro de Qillqa (2026-10-06; api/prensa.py).

El estudio (editor de piezas y editor de fotos y videos) es un servidor propio del repo
`identidad-visual`, sin cuentas, que escucha solo en 127.0.0.1. La API lo publica bajo
/estudio/ con tres piezas que viven aquí, sin base de datos (se prueban solas):

  · la SESIÓN del estudio: una cookie firmada con JWT_SECRET (HttpOnly, SameSite=Strict,
    Path=/estudio, de vida corta) que la web pide con su token. El marco (iframe) no puede
    mandar el encabezado Authorization; la cookie sí viaja con cada recurso del estudio;
  · la RUTA segura: lo que se reenvía al estudio no puede salir de su raíz (nada de «..»);
  · el PUENTE con la Fototeca, que es la ÚNICA biblioteca de fotos: el estudio ve las fotos
    de la Fototeca como archivos de su banco (`<banco>/fototeca/ft-<id>-<versión>.jpg`, el
    derivado con sus ajustes), y lo que el estudio exporta o recibe vuelve a la Fototeca.
    Los VIDEOS que exporta (editor de medios y editor de video: trabajos en segundo plano)
    también: al consultar el trabajo ya listo, Qillqa baja el archivo de su canal y lo
    registra (`trabajos de video` abajo; api/prensa.py).
"""

from __future__ import annotations

import base64
import binascii
import json
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

import jwt

from app.config import config

PREFIJO = "/estudio"
COOKIE = "sgdp_estudio"
# Vida de la sesión del estudio: la página la renueva mientras está abierta.
MINUTOS_SESION = 120
AUDIENCIA = "estudio"
# Quién entra al estudio: todo el equipo (los módulos no se asignan por rol, 2026-10-06);
# la cuenta de invitado solo consulta y el estudio es para hacer piezas.
ROLES = ("administrador", "secretaria", "asesor", "diputado", "prensa")

SUBCARPETA = "fototeca"
# Tamaño del derivado que recibe el estudio (servicios/fototeca.PRESETS): el original con sus ajustes.
PRESET = "original"
ALBUM_PIEZAS = "Piezas de prensa"
ALBUM_PRENSA = "Prensa"
ETIQUETA_PIEZA = "Pieza de prensa"
ETIQUETA_SUBIDA = "Prensa"

# Topes del cuerpo que el proxy acepta (el estudio aplica los suyos).
MAX_JSON = 80 * 1024 * 1024
MAX_SUBIDA = 2048 * 1024 * 1024

_NOMBRE_RE = re.compile(r"^ft-(\d{1,10})-([0-9a-f]{1,12})\.jpg$")
_EXT_IMAGEN = {".jpg", ".jpeg", ".png", ".webp"}


class ErrorPrensa(RuntimeError):
    pass


# --- Sesión del estudio -----------------------------------------------------------------------


def firmar_sesion(usuario_id: int, rol: str, ahora: datetime | None = None) -> tuple[str, datetime]:
    """Valor de la cookie del estudio y su vencimiento."""
    ahora = ahora or datetime.now(timezone.utc)
    vence = ahora + timedelta(minutes=MINUTOS_SESION)
    carga = {"sub": str(usuario_id), "rol": rol, "aud": AUDIENCIA, "iat": ahora, "exp": vence}
    return jwt.encode(carga, config.jwt_secret, algorithm="HS256"), vence


def leer_sesion(valor: str | None) -> dict | None:
    """La carga de una cookie válida ({sub, rol}) o None (falta, vencida, alterada o de otro uso).

    La audiencia es obligatoria: el token de la web (sin `aud`) no sirve como cookie, ni la
    cookie como token de la API."""
    if not valor:
        return None
    try:
        carga = jwt.decode(valor, config.jwt_secret, algorithms=["HS256"], audience=AUDIENCIA,
                           options={"require": ["exp", "sub", "aud"]})
    except jwt.InvalidTokenError:
        return None
    if carga.get("rol") not in ROLES:
        return None
    return carga


# --- Rutas ----------------------------------------------------------------------------------


def ruta_segura(ruta: str) -> str | None:
    """La ruta pedida bajo /estudio/, limpia, o None si intenta salir de la raíz del estudio.

    Se decodifica de nuevo (un «%2e%2e» que llegó doble-codificado es «..» para el estudio),
    y se rechazan barras invertidas, NUL, segmentos «..» y rutas absolutas."""
    if ruta is None:
        return None
    r = unquote(ruta)
    if "\x00" in r or "\\" in r or r.startswith("/"):
        return None
    partes = [p for p in r.split("/")]
    if any(p in ("..", ".") for p in partes):
        return None
    if any(p == "" for p in partes[:-1]):   # «a//b»: el estudio la normalizaría distinto
        return None
    return r


def url_publica(nombre: str) -> str:
    """URL con la que el navegador pide (por el proxy) una foto de la Fototeca en el banco."""
    return f"{PREFIJO}/banco/{SUBCARPETA}/{nombre}"


# --- Banco del estudio ----------------------------------------------------------------------


def banco_estudio() -> Path | None:
    """Carpeta del banco de fotos del estudio: ESTUDIO_BANCO o `rutas.banco` del perfil."""
    if config.estudio_banco:
        return Path(config.estudio_banco)
    if config.identidad_perfil:
        try:
            datos = json.loads(Path(config.identidad_perfil).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        banco = (datos.get("rutas") or {}).get("banco")
        if banco:
            return Path(banco)
    return None


def nombre_derivado(foto_id: int, version: str) -> str:
    return f"ft-{int(foto_id)}-{version}.jpg"


def leer_nombre(nombre: str) -> tuple[int, str] | None:
    """«ft-12-0.jpg» → (12, '0'); cualquier otro nombre → None."""
    m = _NOMBRE_RE.match(nombre or "")
    return (int(m.group(1)), m.group(2)) if m else None


def foto_de_url(url: str) -> int | None:
    """El id de la Fototeca de una URL del banco del estudio (con o sin /estudio delante)."""
    url = unquote((url or "").split("?", 1)[0])
    marca = f"/banco/{SUBCARPETA}/"
    if marca not in url:
        return None
    leido = leer_nombre(url.rsplit("/", 1)[-1])
    return leido[0] if leido else None


def materializar(banco: Path, foto_id: int, archivo: str, sha: str, ajustes: dict | None) -> Path:
    """Deja en `<banco>/fototeca/` el derivado de la foto (con sus ajustes) y devuelve su ruta.

    Idempotente: el nombre lleva la versión de los ajustes; si ya está, no se rehace. Corre en
    un hilo (Pillow)."""
    from app.servicios import fototeca as ft

    nombre = nombre_derivado(foto_id, ft.clave_ajustes(ajustes))
    destino = banco / SUBCARPETA / nombre
    if destino.is_file():
        return destino
    origen = ft.exportar(archivo, sha, ajustes, PRESET, "jpg")
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(f".{nombre}.{uuid.uuid4().hex[:8]}.tmp")
    shutil.copyfile(origen, tmp)
    tmp.replace(destino)
    return destino


# --- Listados del estudio con la Fototeca -----------------------------------------------------


def item_foto(foto, album: str = "") -> dict:
    """Una foto de la Fototeca como la lista el estudio ({name, url, credito, carpeta})."""
    from app.servicios import fototeca as ft

    titulo = foto.titulo or Path(foto.nombre_original or f"foto-{foto.id}").stem
    return {
        "name": " / ".join(p for p in ("Fototeca", album or "Sin álbum", f"{titulo} (n.º {foto.id})") if p),
        "url": url_publica(nombre_derivado(foto.id, ft.clave_ajustes(foto.ajustes))),
        "credito": "",
        "carpeta": "Fototeca",
    }


def _sin_copias(items: list) -> list:
    """Quita del listado del estudio las copias de la Fototeca que ya están en su banco: el
    selector las ofrece desde la Fototeca, con la versión vigente de sus ajustes."""
    marca = f"/banco/{SUBCARPETA}/"
    return [i for i in items if not (isinstance(i, dict) and marca in str(i.get("url", "")))]


def fusionar(listado, fotos: list[dict]):
    """Junta el listado del estudio (/api/imagenes: lista; /api/media: {imagenes, videos}) con
    las fotos de la Fototeca, que van primero."""
    if isinstance(listado, list):
        return fotos + _sin_copias(listado)
    if isinstance(listado, dict) and isinstance(listado.get("imagenes"), list):
        return {**listado, "imagenes": fotos + _sin_copias(listado["imagenes"])}
    return listado


# --- Lo que vuelve del estudio ----------------------------------------------------------------


def decodificar_dataurl(data_url: str) -> tuple[bytes, str]:
    """(bytes, extensión) de un «data:image/png;base64,…». Falla si no es una imagen."""
    if not isinstance(data_url, str) or "," not in data_url:
        raise ErrorPrensa("No es una imagen en dataURL.")
    cabecera, b64 = data_url.split(",", 1)
    tipo = cabecera[5:].split(";", 1)[0].lower() if cabecera.startswith("data:") else ""
    ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp"}.get(tipo)
    if ext is None:
        raise ErrorPrensa(f"Formato no admitido: {tipo or 'desconocido'}.")
    try:
        datos = base64.b64decode(b64, validate=False)
    except (binascii.Error, ValueError):
        raise ErrorPrensa("La imagen no se pudo leer.")
    if not datos:
        raise ErrorPrensa("La imagen está vacía.")
    return datos, ext


def es_imagen(nombre: str) -> bool:
    return Path(nombre or "").suffix.lower() in _EXT_IMAGEN


def descripcion_pieza(canal: str, foto_origen: int | None) -> str:
    texto = "Pieza hecha en el estudio de Prensa"
    if canal:
        texto += f" para {canal}"
    if foto_origen:
        texto += f", con la foto n.º {foto_origen} de la Fototeca"
    return texto + "."


def datos_pieza(pedido: dict) -> tuple[str, int | None]:
    """(título, foto de origen) de «Guardar en la Fototeca» del editor de piezas.

    El título es el nombre de la edición (plantilla y fecha); la foto de origen, la primera
    que se reconozca: por la URL del banco (`/banco/fototeca/ft-N-…`) o por el «n.º N» que el
    selector pone en el nombre de la capa."""
    titulo = " ".join(str(pedido.get("titulo") or "").split())[:200] or "Pieza de prensa"
    for url in pedido.get("origenes") or []:
        foto = foto_de_url(str(url))
        if foto:
            return titulo, foto
    for n in pedido.get("fotos") or []:
        if isinstance(n, int) and not isinstance(n, bool) and n > 0:
            return titulo, n
    return titulo, None


def nombre_pieza(titulo: str, ext: str) -> str:
    """Nombre de archivo de una pieza: el título en minúsculas, sin tildes ni signos."""
    import unicodedata

    base = unicodedata.normalize("NFKD", titulo).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:80] or "pieza"
    return f"{base}{ext}"


# --- Videos exportados por el estudio (2026-10-06) ------------------------------------------

# Las dos exportaciones de video del estudio: devuelven {trabajo} y el archivo aparece en
# GET /api/trabajo?id=… cuando está listo ({estado: 'listo', url, archivo}).
EXPORTAR_VIDEO = ("api/exportar-video", "api/exportar-proyecto-video")
# Un trabajo que nadie consultó en este tiempo se olvida (la pieza queda en su canal).
HORAS_TRABAJO = 12


def ruta_de_url(url: str) -> str | None:
    """La ruta dentro del estudio de una URL que él mismo emitió con el prefijo del proxy
    («/estudio/redes/facebook/2026-10-06-x.mp4» → «redes/facebook/2026-10-06-x.mp4»), o
    None si no es una ruta segura del estudio."""
    u = unquote((url or "").split("?", 1)[0].split("#", 1)[0])
    if u.startswith(PREFIJO + "/"):
        u = u[len(PREFIJO) + 1:]
    elif u.startswith("/"):
        u = u[1:]
    return ruta_segura(u) if u else None


def es_video(nombre: str) -> bool:
    from app.servicios import fototeca as ft

    return ft.es_video(nombre)


def descripcion_video(canal: str, proyecto: bool) -> str:
    texto = "Video hecho en el " + ("editor de video" if proyecto else "editor de medios") + " de Prensa"
    return texto + (f" para {canal}" if canal else "") + "."


class TrabajosDeVideo:
    """Los trabajos de video pedidos por el proxy, a la espera de quedar listos: trabajo →
    {usuario_id, canal, titulo, proyecto, desde}. Vive en memoria de la API (un reinicio
    los olvida: la pieza sigue en su canal y se puede subir a mano)."""

    def __init__(self) -> None:
        self._pend: dict[str, dict] = {}

    def anotar(self, trabajo: str, usuario_id: int, pedido: dict, proyecto: bool,
               ahora: datetime | None = None) -> None:
        ahora = ahora or datetime.now(timezone.utc)
        self._olvidar_viejos(ahora)
        titulo = " ".join(str(pedido.get("nombre") or "").split())[:200]
        self._pend[str(trabajo)] = {"usuario_id": usuario_id, "canal": str(pedido.get("canal") or ""),
                                    "titulo": titulo, "proyecto": proyecto, "desde": ahora}

    def tomar(self, trabajo: str) -> dict | None:
        """Lo pendiente de un trabajo, una sola vez (dos consultas simultáneas no lo registran dos veces)."""
        return self._pend.pop(str(trabajo), None)

    def devolver(self, trabajo: str, datos: dict) -> None:
        self._pend[str(trabajo)] = datos

    def _olvidar_viejos(self, ahora: datetime) -> None:
        limite = ahora - timedelta(hours=HORAS_TRABAJO)
        for k in [k for k, v in self._pend.items() if v["desde"] < limite]:
            self._pend.pop(k, None)

    def __contains__(self, trabajo: str) -> bool:
        return str(trabajo) in self._pend

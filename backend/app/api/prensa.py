"""Prensa: sesión del estudio, proxy /estudio/ y puente con la Fototeca (2026-10-06).

El estudio de Identidad Visual (editor de piezas y de fotos y videos) corre aparte, sin
cuentas, en ESTUDIO_URL (127.0.0.1:8099). La web lo muestra en un marco bajo /estudio/,
que pasa por el MISMO puerto de la web (el enlace público solo publica ese): la web lo
reenvía aquí (proxy de Vite) y aquí se comprueba la cookie del estudio y se reenvía al
servidor del estudio, con `X-Forwarded-Prefix: /estudio` para que sus URL lleven el prefijo.

La Fototeca es la ÚNICA biblioteca de fotos (servicios/prensa.py):
  · el selector del estudio (/api/media, /api/imagenes) recibe las fotos de la Fototeca
    (públicas y del álbum «Prensa») además de su banco;
  · una foto de la Fototeca se materializa en `<banco>/fototeca/` al pedirla (con sus
    ajustes), y su miniatura sale directamente de la Fototeca;
  · lo que el estudio exporta (/api/exportar-foto) entra a la Fototeca en el álbum «Piezas
    de prensa», y las fotos que se suben al estudio, también (por revisar);
  · los VIDEOS que exporta (/api/exportar-video, /api/exportar-proyecto-video) son
    trabajos en segundo plano: el proxy anota el trabajo y, cuando /api/trabajo lo da por
    listo, baja el video de su canal y lo registra en el mismo álbum (2026-10-06).
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from urllib.parse import quote, unquote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.api.archivos import enviar_archivo
from app.config import config
from app.db import obtener_sesion
from app.modelos import AlbumFoto, Foto, Usuario
from app.seguridad import usuario_actual
from app.servicios import fototeca as ft
from app.servicios import prensa as pr

log = logging.getLogger("sgdp.prensa")

router = APIRouter(prefix="/api/prensa", tags=["prensa"])
router_estudio = APIRouter(tags=["prensa"])

# Cabeceras que viajan al estudio y las que vuelven. Nunca Cookie, Authorization ni Origin:
# el estudio no tiene cuentas y la autorización ya se hizo aquí.
_HACIA = ("content-type", "range", "if-range", "x-nombre", "accept")
_DESDE = ("content-type", "content-length", "content-range", "accept-ranges", "cache-control",
          "content-disposition", "etag", "last-modified")

_cliente: httpx.AsyncClient | None = None
# Trabajos de video pedidos por el proxy, a la espera de registrarse en la Fototeca.
_videos = pr.TrabajosDeVideo()


def cliente() -> httpx.AsyncClient:
    global _cliente
    if _cliente is None:
        _cliente = httpx.AsyncClient(timeout=httpx.Timeout(connect=3.0, read=600.0, write=600.0, pool=10.0))
    return _cliente


def _puede_entrar(u: Usuario) -> None:
    if u.rol not in pr.ROLES:
        raise HTTPException(403, "La cuenta de invitado solo puede consultar: el estudio de Prensa es para hacer piezas.")


# --- Sesión -------------------------------------------------------------------------------


async def estudio_arriba() -> bool:
    try:
        r = await cliente().get(config.estudio_url.rstrip("/") + "/api/health", timeout=2.0)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


@router.post("/sesion")
async def abrir_sesion(peticion: Request, usuario: Usuario = Depends(usuario_actual)) -> Response:
    """Cookie del estudio para el marco. La página la renueva mientras sigue abierta."""
    _puede_entrar(usuario)
    valor, vence = pr.firmar_sesion(usuario.id, usuario.rol)
    # Secure solo si el navegador llegó por https (enlace público): en la red local la web va por http.
    seguro = peticion.headers.get("x-forwarded-proto", peticion.url.scheme).split(",")[0].strip() == "https"
    r = JSONResponse({"ok": True, "estudio": await estudio_arriba(), "vence": vence.isoformat(),
                      "banco": pr.banco_estudio() is not None})
    r.set_cookie(pr.COOKIE, valor, max_age=pr.MINUTOS_SESION * 60, path=pr.PREFIJO, httponly=True,
                 samesite="strict", secure=seguro)
    r.headers["Cache-Control"] = "no-store"
    return r


@router.delete("/sesion")
async def cerrar_sesion() -> Response:
    """Borra la cookie del estudio (al cerrar sesión en la web). Sin token: solo borra."""
    r = JSONResponse({"ok": True})
    r.delete_cookie(pr.COOKIE, path=pr.PREFIJO, httponly=True, samesite="strict")
    return r


# --- Puente con la Fototeca -----------------------------------------------------------------


async def _materializar(sesion: AsyncSession, foto_id: int) -> tuple[Foto, str]:
    banco = pr.banco_estudio()
    if banco is None:
        raise HTTPException(503, "Falta el banco del estudio: defina IDENTIDAD_PERFIL (o ESTUDIO_BANCO) en el .env de Qillqa.")
    foto = await sesion.get(Foto, foto_id)
    if foto is None or foto.eliminada_en is not None:
        raise HTTPException(404, "Foto no encontrada.")
    if foto.medio == "video":
        raise HTTPException(422, "Es un video: el estudio recibe fotos de la Fototeca.")
    try:
        ruta = await asyncio.to_thread(pr.materializar, banco, foto.id, foto.archivo, foto.sha256, foto.ajustes)
    except ft.ErrorFototeca as e:
        raise HTTPException(422, str(e))
    except FileNotFoundError:
        raise HTTPException(404, "El original no está en la Fototeca.")
    except OSError as e:
        raise HTTPException(503, f"No se pudo escribir en el banco del estudio: {e.strerror or e}.")
    return foto, ruta.name


@router.post("/traer/{foto_id}")
async def traer(foto_id: int, usuario: Usuario = Depends(usuario_actual),
                sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """«Usar en Prensa»: la foto (con sus ajustes) queda en el banco del estudio; devuelve su URL."""
    _puede_entrar(usuario)
    foto, nombre = await _materializar(sesion, foto_id)
    return {"ok": True, "url": pr.url_publica(nombre), "nombre": foto.titulo or foto.nombre_original}


async def _fotos_para_estudio(sesion: AsyncSession) -> list[dict]:
    albumes = {a.id: a.nombre for a in (await sesion.execute(select(AlbumFoto))).scalars().all()}
    prensa = [i for i, n in albumes.items() if n.strip().lower() == pr.ALBUM_PRENSA.lower()]
    cond = Foto.estado == "publica"
    if prensa:
        cond = or_(cond, Foto.album_id.in_(prensa))
    fotos = (await sesion.execute(
        select(Foto).where(Foto.eliminada_en.is_(None), Foto.medio == "foto", cond)
        .order_by(Foto.tomada_en.desc(), Foto.id.desc()).limit(config.estudio_limite_fotos)
    )).scalars().all()
    return [pr.item_foto(f, albumes.get(f.album_id, "")) for f in fotos]


async def _album(sesion: AsyncSession, nombre: str, usuario_id: int | None) -> int:
    a = (await sesion.execute(select(AlbumFoto).where(AlbumFoto.nombre == nombre))).scalars().first()
    if a is None:
        a = AlbumFoto(nombre=nombre, descripcion="Lo que se hace y se sube en el estudio de Prensa.",
                      fecha="", creado_por=usuario_id)
        sesion.add(a)
        await sesion.flush()
    return a.id


async def _ingresar(sesion: AsyncSession, datos: bytes, ext: str, nombre: str, usuario_id: int | None,
                    *, pieza: bool, descripcion: str = "", titulo: str = "") -> dict | None:
    """Registra en la Fototeca una imagen que pasó por el estudio. Un fallo aquí no rompe
    la respuesta del estudio (la pieza ya quedó en su carpeta); se registra en el log."""
    tmp = ft.carpeta_temporal() / f"{uuid.uuid4().hex}{ext}"
    try:
        await asyncio.to_thread(tmp.write_bytes, datos)
    except OSError as e:
        tmp.unlink(missing_ok=True)
        log.warning("No se pudo registrar en la Fototeca lo que vino del estudio (%s): %s", nombre, e)
        return None
    return await _ingresar_ruta(sesion, tmp, nombre, usuario_id, pieza=pieza, descripcion=descripcion, titulo=titulo)


async def _ingresar_ruta(sesion: AsyncSession, tmp, nombre: str, usuario_id: int | None,
                         *, pieza: bool, descripcion: str = "", titulo: str = "") -> dict | None:
    """Lo mismo, con el archivo ya en la carpeta temporal de la Fototeca (se mueve o se borra)."""
    try:
        # Ya estaba (una pieza sin cambios es la misma foto): no se le cambia álbum ni pie.
        sha, _ = await asyncio.to_thread(ft.huella, tmp)
        ya = (await sesion.execute(select(Foto.id).where(Foto.sha256 == sha))).scalar_one_or_none()
        if ya is not None:
            tmp.unlink(missing_ok=True)
            return {"id": ya, "nueva": False}
        extra = {"etiquetas": [pr.ETIQUETA_PIEZA if pieza else pr.ETIQUETA_SUBIDA], "descripcion": descripcion,
                 "titulo": titulo}
        if pieza:
            extra["album_id"] = await _album(sesion, pr.ALBUM_PIEZAS, usuario_id)
        foto, nueva = await ft.registrar(sesion, tmp, nombre, usuario_id, mover=True, datos=extra)
        await sesion.commit()
        return {"id": foto.id, "nueva": nueva}
    except Exception as e:  # noqa: BLE001 — la pieza ya está en el estudio; aquí solo se avisa
        await sesion.rollback()
        tmp.unlink(missing_ok=True)
        log.warning("No se pudo registrar en la Fototeca lo que vino del estudio (%s): %s", nombre, e)
        return None


async def _bajar_video(url: str) -> tuple | None:
    """Baja del estudio (por su canal) el video que dejó un trabajo listo, a la carpeta
    temporal de la Fototeca. (ruta temporal, nombre) o None."""
    ruta = pr.ruta_de_url(url)
    if ruta is None or not pr.es_video(ruta):
        return None
    nombre = ruta.rsplit("/", 1)[-1]
    tmp = ft.carpeta_temporal() / f"{uuid.uuid4().hex}{'.' + nombre.rsplit('.', 1)[-1].lower()}"
    total = 0
    try:
        async with cliente().stream("GET", config.estudio_url.rstrip("/") + "/" + quote(ruta, safe="/")) as r:
            if r.status_code != 200:
                return None
            with tmp.open("wb") as fh:
                async for trozo in r.aiter_bytes(1024 * 1024):
                    total += len(trozo)
                    if total > ft.MAX_VIDEO:
                        raise ValueError("el video supera el tope de la Fototeca")
                    fh.write(trozo)
    except (httpx.HTTPError, OSError, ValueError) as e:
        tmp.unlink(missing_ok=True)
        log.warning("No se pudo bajar del estudio el video %s: %s", nombre, e)
        return None
    return tmp, nombre


async def _registrar_video_listo(sesion: AsyncSession, trabajo: str, datos: dict) -> dict | None:
    """Si el trabajo listo lo pidió este proxy, el video entra a la Fototeca (una vez)."""
    pendiente = _videos.tomar(trabajo)
    if pendiente is None:
        return None
    bajado = await _bajar_video(str(datos.get("url") or ""))
    if bajado is None:
        return None
    tmp, nombre = bajado
    titulo = pendiente["titulo"].rsplit(".", 1)[0] if pendiente["titulo"] else ""
    return await _ingresar_ruta(sesion, tmp, nombre, pendiente["usuario_id"], pieza=True, titulo=titulo,
                                descripcion=pr.descripcion_video(pendiente["canal"], pendiente["proyecto"]))


# --- Proxy /estudio/ ------------------------------------------------------------------------


def _sin_sesion(peticion: Request) -> Response:
    if "text/html" in peticion.headers.get("accept", ""):
        return HTMLResponse(_pagina("Abra el estudio desde el módulo Prensa del sistema.",
                                    "La sesión del estudio venció o no se abrió desde Qillqa."), status_code=401)
    return JSONResponse({"ok": False, "error": "Sesión del estudio vencida: recargue Prensa."}, status_code=401)


def _caido(peticion: Request) -> Response:
    texto = "El servidor del estudio no está encendido."
    detalle = "Se enciende con ./iniciar.sh (IDENTIDAD_VISUAL_DIR e IDENTIDAD_PERFIL en el .env)."
    if "text/html" in peticion.headers.get("accept", ""):
        return HTMLResponse(_pagina(texto, detalle), status_code=503)
    return JSONResponse({"ok": False, "error": texto}, status_code=503)


def _pagina(titulo: str, detalle: str) -> str:
    return ("<!doctype html><meta charset=utf-8><title>Prensa</title>"
            "<body style=\"font:15px system-ui,sans-serif;color:#2b2522;background:#f7f5f2;padding:32px\">"
            f"<p style=\"font-weight:600\">{titulo}</p><p>{detalle}</p></body>")


def _cabeceras_hacia(peticion: Request) -> dict:
    c = {k: v for k, v in peticion.headers.items() if k.lower() in _HACIA}
    c["X-Forwarded-Prefix"] = pr.PREFIJO
    return c


def _cabeceras_desde(r: httpx.Response) -> dict:
    c = {k: v for k, v in r.headers.items() if k.lower() in _DESDE}
    # El estudio solo se deja enmarcar por el propio sistema.
    c["X-Frame-Options"] = "SAMEORIGIN"
    c["Content-Security-Policy"] = "frame-ancestors 'self'"
    return c


def _url(ruta: str, peticion: Request) -> str:
    u = config.estudio_url.rstrip("/") + "/" + quote(ruta, safe="/")
    return u + (f"?{peticion.url.query}" if peticion.url.query else "")


async def _leer_cuerpo(peticion: Request, maximo: int) -> bytes:
    largo = peticion.headers.get("content-length")
    if largo and largo.isdigit() and int(largo) > maximo:
        raise HTTPException(413, f"El cuerpo supera {maximo >> 20} MB.")
    partes, total = [], 0
    async for trozo in peticion.stream():
        total += len(trozo)
        if total > maximo:
            raise HTTPException(413, f"El cuerpo supera {maximo >> 20} MB.")
        partes.append(trozo)
    return b"".join(partes)


async def _pedir(peticion: Request, ruta: str, cuerpo: bytes | None = None) -> httpx.Response:
    """Reenvía y devuelve la respuesta COMPLETA (para lo que se lee o se modifica aquí)."""
    return await cliente().request(peticion.method, _url(ruta, peticion), headers=_cabeceras_hacia(peticion),
                                   content=cuerpo)


async def _transmitir(peticion: Request, ruta: str) -> Response:
    """Reenvía en flujo, en los dos sentidos (videos con Range, subidas grandes)."""
    cabeceras = _cabeceras_hacia(peticion)
    contenido = None
    if peticion.method in ("POST", "PUT", "PATCH"):
        largo = peticion.headers.get("content-length")
        if largo and largo.isdigit():
            if int(largo) > pr.MAX_SUBIDA:
                raise HTTPException(413, f"El archivo supera {pr.MAX_SUBIDA >> 20} MB.")
            cabeceras["Content-Length"] = largo
            contenido = peticion.stream()
        else:   # sin largo declarado: el estudio no admite «chunked»; se junta aquí
            contenido = await _leer_cuerpo(peticion, pr.MAX_JSON)
    req = cliente().build_request(peticion.method, _url(ruta, peticion), headers=cabeceras, content=contenido)
    r = await cliente().send(req, stream=True)
    return StreamingResponse(r.aiter_raw(), status_code=r.status_code, headers=_cabeceras_desde(r),
                             background=BackgroundTask(r.aclose))


def _json_de(r: httpx.Response):
    try:
        return r.json()
    except ValueError:
        return None


def _respuesta(r: httpx.Response, datos=None) -> Response:
    if datos is None:
        return Response(r.content, status_code=r.status_code, headers=_cabeceras_desde(r))
    cab = {k: v for k, v in _cabeceras_desde(r).items() if k.lower() not in ("content-length", "content-type")}
    return JSONResponse(datos, status_code=r.status_code, headers=cab)


@router_estudio.api_route("/estudio/{ruta:path}", methods=["GET", "HEAD", "POST", "PUT", "DELETE"],
                          include_in_schema=False)
async def estudio(ruta: str, peticion: Request, sesion: AsyncSession = Depends(obtener_sesion)) -> Response:
    carga = pr.leer_sesion(peticion.cookies.get(pr.COOKIE))
    if carga is None:
        return _sin_sesion(peticion)
    limpia = pr.ruta_segura(ruta)
    if limpia is None:
        return JSONResponse({"ok": False, "error": "Ruta no válida."}, status_code=404)
    usuario_id = int(carga["sub"])
    metodo = peticion.method
    try:
        # Una foto de la Fototeca: su miniatura sale de la Fototeca; el archivo, del banco
        # (se materializa la primera vez y el estudio lo sirve con Range).
        if metodo == "GET" and limpia.startswith(f"miniatura/{pr.SUBCARPETA}/"):
            leido = pr.leer_nombre(limpia.rsplit("/", 1)[-1])
            foto = await sesion.get(Foto, leido[0]) if leido else None
            if foto is None or foto.eliminada_en is not None:
                return JSONResponse({"ok": False, "error": "Foto no encontrada."}, status_code=404)
            try:
                mini = await asyncio.to_thread(ft.derivado, foto.archivo, foto.sha256, foto.ajustes, "miniatura")
            except (ft.ErrorFototeca, FileNotFoundError):
                return JSONResponse({"ok": False, "error": "Sin miniatura."}, status_code=404)
            return enviar_archivo(mini, f"miniatura-{foto.id}.jpg", media_type="image/jpeg", peticion=peticion)
        if metodo == "GET" and limpia.startswith(f"banco/{pr.SUBCARPETA}/"):
            leido = pr.leer_nombre(limpia.rsplit("/", 1)[-1])
            banco = pr.banco_estudio()
            if leido and banco is not None and not (banco / pr.SUBCARPETA / limpia.rsplit("/", 1)[-1]).is_file():
                try:
                    await _materializar(sesion, leido[0])
                except HTTPException as e:
                    return JSONResponse({"ok": False, "error": e.detail}, status_code=e.status_code)
            return await _transmitir(peticion, limpia)

        # El estudio sabe que corre con Fototeca: el editor de piezas ofrece «Guardar en la Fototeca».
        if metodo == "GET" and limpia == "api/health":
            r = await _pedir(peticion, limpia)
            datos = _json_de(r)
            if r.status_code == 200 and isinstance(datos, dict):
                datos["fototeca"] = True
            return _respuesta(r, datos)

        # «Guardar en la Fototeca» del editor de piezas: lo atiende Qillqa, no el estudio
        # (las piezas de editor.html se descargan en el navegador; esta es su puerta a la Fototeca).
        if metodo == "POST" and limpia == "api/fototeca-pieza":
            if peticion.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
                return JSONResponse({"ok": False, "error": "Se espera application/json"}, status_code=415)
            try:
                pedido = json.loads(await _leer_cuerpo(peticion, pr.MAX_JSON))
                img, ext = pr.decodificar_dataurl(pedido.get("dataURL", ""))
            except (ValueError, AttributeError, pr.ErrorPrensa) as e:
                return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
            titulo, origen = pr.datos_pieza(pedido)
            res = await _ingresar(sesion, img, ext, pr.nombre_pieza(titulo, ext), usuario_id, pieza=True,
                                  descripcion=pr.descripcion_pieza("", origen), titulo=titulo)
            if res is None:
                return JSONResponse({"ok": False, "error": "No se pudo registrar en la Fototeca."}, status_code=500)
            return JSONResponse({"ok": True, **res})

        # El selector del estudio: su banco + las fotos de la Fototeca.
        if metodo == "GET" and limpia in ("api/media", "api/imagenes"):
            r = await _pedir(peticion, limpia)
            datos = _json_de(r)
            if r.status_code == 200 and datos is not None:
                datos = pr.fusionar(datos, await _fotos_para_estudio(sesion))
            return _respuesta(r, datos)

        # «Guardar en la Fototeca» del editor de video (identidad-visual, servidor/README.md
        # §Fototeca). El video ya entra solo cuando su trabajo queda listo; este botón es la
        # puerta explícita (y el reintento si aquello falló): por la huella, nunca duplica.
        if metodo == "POST" and limpia == "api/fototeca-video":
            try:
                pedido = json.loads(await _leer_cuerpo(peticion, pr.MAX_JSON))
                url = str(pedido.get("url") or "")
            except (ValueError, AttributeError) as e:
                return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
            bajado = await _bajar_video(url)
            if bajado is None:
                return JSONResponse({"ok": False, "error": "No se encontró ese video en el estudio."}, status_code=400)
            tmp, nombre = bajado
            titulo = str(pedido.get("titulo") or "").rsplit(".", 1)[0][:200]
            res = await _ingresar_ruta(sesion, tmp, nombre, usuario_id, pieza=True, titulo=titulo,
                                       descripcion=pr.descripcion_video(str(pedido.get("canal") or ""), True))
            if res is None:
                return JSONResponse({"ok": False, "error": "No se pudo registrar en la Fototeca."}, status_code=500)
            return JSONResponse({"ok": True, "numero": res["id"], **res})

        # Un video exportado: el estudio lo hace en segundo plano; se anota su trabajo y,
        # cuando /api/trabajo lo da por listo, entra a la Fototeca.
        if metodo == "POST" and limpia in pr.EXPORTAR_VIDEO:
            cuerpo = await _leer_cuerpo(peticion, pr.MAX_JSON)
            r = await _pedir(peticion, limpia, cuerpo)
            datos = _json_de(r)
            if r.status_code == 200 and isinstance(datos, dict) and datos.get("ok") and datos.get("trabajo"):
                try:
                    pedido = json.loads(cuerpo)
                except ValueError:
                    pedido = {}
                _videos.anotar(str(datos["trabajo"]), usuario_id, pedido if isinstance(pedido, dict) else {},
                               proyecto=limpia == "api/exportar-proyecto-video")
            return _respuesta(r, datos)
        if metodo == "GET" and limpia == "api/trabajo" and peticion.query_params.get("id") in _videos:
            r = await _pedir(peticion, limpia)
            datos = _json_de(r)
            if r.status_code == 200 and isinstance(datos, dict) and datos.get("estado") == "listo" and datos.get("url"):
                datos["fototeca"] = await _registrar_video_listo(sesion, peticion.query_params["id"], datos)
            elif r.status_code == 200 and isinstance(datos, dict) and datos.get("estado") == "error":
                _videos.tomar(peticion.query_params["id"])
            return _respuesta(r, datos)

        # Una pieza exportada: al estudio (su canal) y a la Fototeca.
        if metodo == "POST" and limpia == "api/exportar-foto":
            cuerpo = await _leer_cuerpo(peticion, pr.MAX_JSON)
            r = await _pedir(peticion, limpia, cuerpo)
            datos = _json_de(r)
            if r.status_code == 200 and isinstance(datos, dict) and datos.get("ok"):
                try:
                    pedido = json.loads(cuerpo)
                    img, ext = pr.decodificar_dataurl(pedido.get("dataURL", ""))
                    nombre = datos.get("archivo") or pedido.get("nombre") or f"pieza{ext}"
                    canal = str(pedido.get("canal") or "")
                    origen = pr.foto_de_url(str(pedido.get("origen") or ""))
                    datos["fototeca"] = await _ingresar(sesion, img, ext, nombre, usuario_id, pieza=True,
                                                        descripcion=pr.descripcion_pieza(canal, origen))
                except (ValueError, pr.ErrorPrensa) as e:
                    log.warning("Pieza del estudio sin registrar en la Fototeca: %s", e)
            return _respuesta(r, datos)

        # Una imagen subida al estudio (desde el editor de piezas o el de medios): también a la Fototeca.
        if metodo == "POST" and limpia == "api/imagenes":
            cuerpo = await _leer_cuerpo(peticion, pr.MAX_JSON)
            r = await _pedir(peticion, limpia, cuerpo)
            datos = _json_de(r)
            if r.status_code == 200 and isinstance(datos, dict) and datos.get("ok"):
                try:
                    pedido = json.loads(cuerpo)
                    img, ext = pr.decodificar_dataurl(pedido.get("dataURL", ""))
                    datos["fototeca"] = await _ingresar(sesion, img, ext, str(pedido.get("filename") or f"imagen{ext}"),
                                                        usuario_id, pieza=False)
                except (ValueError, pr.ErrorPrensa) as e:
                    log.warning("Imagen subida al estudio sin registrar en la Fototeca: %s", e)
            return _respuesta(r, datos)
        if metodo == "POST" and limpia == "api/subir":
            nombre = unquote(peticion.headers.get("x-nombre", ""))
            if pr.es_imagen(nombre):
                cuerpo = await _leer_cuerpo(peticion, ft.MAX_FOTO)
                r = await _pedir(peticion, limpia, cuerpo)
                datos = _json_de(r)
                if r.status_code == 200 and isinstance(datos, dict) and datos.get("ok"):
                    ext = "." + nombre.rsplit(".", 1)[-1].lower()
                    datos["fototeca"] = await _ingresar(sesion, cuerpo, ext, nombre, usuario_id, pieza=False)
                return _respuesta(r, datos)

        return await _transmitir(peticion, limpia)
    except (httpx.ConnectError, httpx.ConnectTimeout):
        return _caido(peticion)
    except httpx.HTTPError as e:
        log.warning("El estudio no respondió bien a %s %s: %s", metodo, limpia, e)
        return JSONResponse({"ok": False, "error": "El estudio no respondió."}, status_code=502)



# --- Piezas de prensa (2026-10-12, fase 9.4; modelos.PiezaPrensa) ---------------------------------
# Noticias procesadas con el prompt de prensa, notas y comunicados: registro con estado y responsable;
# llegan pegadas (`POST /piezas/pegar`, vista previa) o a mano; se listan y cambian aquí.

from pydantic import BaseModel as _BaseModel, Field as _Field  # noqa: E402
from sqlalchemy import select as _select  # noqa: E402

from app.modelos import PiezaPrensa  # noqa: E402

router_piezas = APIRouter(prefix="/api/prensa/piezas", tags=["prensa"])
CLASES_PIEZA = ("noticia_local", "noticia_nacional", "noticia_internacional", "nota_de_prensa", "comunicado", "entrevista", "agenda_de_medios")
ESTADOS_PIEZA = ("registrada", "en_trabajo", "publicada", "archivada")
ETIQUETA_CLASE = {"noticia_local": "Noticia local", "noticia_nacional": "Noticia nacional", "noticia_internacional": "Noticia internacional",
                  "nota_de_prensa": "Nota de prensa", "comunicado": "Comunicado", "entrevista": "Entrevista", "agenda_de_medios": "Agenda de medios"}


def pieza_dict(p: PiezaPrensa, nombres: dict[int, str] | None = None) -> dict:
    nombres = nombres or {}
    return {"id": p.id, "clase": p.clase, "clase_texto": ETIQUETA_CLASE.get(p.clase, p.clase), "titular": p.titular, "bajada": p.bajada, "cuerpo": p.cuerpo,
            "fuente": p.fuente, "enlace": p.enlace, "fecha": p.fecha, "ambito": p.ambito, "temas": p.temas or [], "relevancia": p.relevancia,
            "accion_sugerida": p.accion_sugerida, "cita": p.cita, "estado": p.estado, "responsable_id": p.responsable_id,
            "responsable": nombres.get(p.responsable_id or 0, ""), "publicado_en": p.publicado_en or [], "origen": p.origen,
            "creado_en": p.creado_en.isoformat() if p.creado_en else None}


def _sin_invitado(u: Usuario) -> None:
    if u.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")


@router_piezas.get("")
async def listar_piezas(estado: str = "", clase: str = "", q: str = "", limite: int = 100,
                        _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    qs = _select(PiezaPrensa).order_by(PiezaPrensa.id.desc()).limit(min(limite, 500))
    if estado:
        qs = qs.where(PiezaPrensa.estado == estado)
    if clase:
        qs = qs.where(PiezaPrensa.clase == clase)
    if q.strip():
        qs = qs.where(PiezaPrensa.titular.ilike(f"%{q.strip()}%") | PiezaPrensa.cuerpo.ilike(f"%{q.strip()}%"))
    filas = (await sesion.execute(qs)).scalars().all()
    ids = {p.responsable_id for p in filas if p.responsable_id}
    nombres = {u.id: u.nombre_completo for u in (await sesion.execute(_select(Usuario).where(Usuario.id.in_(ids)))).scalars()} if ids else {}
    return {"piezas": [pieza_dict(p, nombres) for p in filas], "clases": [{"v": c, "t": ETIQUETA_CLASE[c]} for c in CLASES_PIEZA], "estados": list(ESTADOS_PIEZA)}


class PiezaEntrada(_BaseModel):
    clase: str = "noticia_local"
    titular: str = _Field(min_length=1, max_length=300)
    bajada: str = ""
    cuerpo: str = ""
    fuente: str = _Field("", max_length=300)
    enlace: str = ""
    fecha: str = _Field("", max_length=10)
    ambito: str = _Field("", max_length=200)
    temas: list[str] = []
    relevancia: str = ""
    accion_sugerida: str = _Field("", max_length=30)
    cita: str = ""
    estado: str = "registrada"
    responsable_id: int | None = None
    pegado: dict | None = None


def _validar_pieza(d: PiezaEntrada) -> None:
    if d.clase not in CLASES_PIEZA:
        raise HTTPException(422, f"Clase desconocida; use una de: {', '.join(CLASES_PIEZA)}.")
    if d.estado not in ESTADOS_PIEZA:
        raise HTTPException(422, f"Estado desconocido; use uno de: {', '.join(ESTADOS_PIEZA)}.")


async def crear_pieza_desde(sesion: AsyncSession, datos: dict, usuario: Usuario, origen: str = "pegado", pegado_id: int | None = None) -> PiezaPrensa:
    """Crea la pieza desde los campos de un pegado (chat o módulo). Sin commit."""
    campos = {k: v for k, v in datos.items() if k in PiezaEntrada.model_fields and k not in ("pegado",)}
    d = PiezaEntrada(**{**campos, "titular": str(campos.get("titular") or "")[:300] or "(sin titular)"})
    _validar_pieza(d)
    p = PiezaPrensa(**d.model_dump(exclude={"pegado"}), origen=origen, pegado_id=pegado_id, creado_por=usuario.id)
    sesion.add(p)
    await sesion.flush()
    return p


@router_piezas.post("")
async def crear_pieza(datos: PiezaEntrada, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    _sin_invitado(usuario)
    _validar_pieza(datos)
    from app.modelos import Pegado
    from app.servicios import eventos_sistema

    pegado = None
    if datos.pegado and datos.pegado.get("texto"):
        pegado = Pegado(usuario_id=usuario.id, tipo="pieza-de-prensa", version=int(datos.pegado.get("version") or 1), fuente=str(datos.pegado.get("fuente") or "yaml"),
                        texto=str(datos.pegado["texto"]), campos_propuestos=datos.pegado.get("campos_propuestos") or {}, campos_aplicados=datos.model_dump(exclude={"pegado"}),
                        rechazados=list(datos.pegado.get("rechazados") or []))
        sesion.add(pegado)
        await sesion.flush()
    p = PiezaPrensa(**datos.model_dump(exclude={"pegado"}), origen="pegado" if pegado else "persona", pegado_id=pegado.id if pegado else None, creado_por=usuario.id)
    sesion.add(p)
    await sesion.flush()
    if pegado:
        pegado.entidad = f"pieza:{p.id}"
    await eventos_sistema.emitir_seguro(sesion, "prensa.pieza_registrada", f"pieza:{p.id}",
                                        {"titular": p.titular, "clase": p.clase, "fuente": p.fuente, "accion_sugerida": p.accion_sugerida, "responsable_id": p.responsable_id}, usuario=usuario)
    await sesion.commit()
    return pieza_dict(p, {usuario.id: usuario.nombre_completo})


class PiezaCambio(_BaseModel):
    clase: str | None = None
    titular: str | None = _Field(None, max_length=300)
    bajada: str | None = None
    cuerpo: str | None = None
    fuente: str | None = None
    enlace: str | None = None
    fecha: str | None = None
    ambito: str | None = None
    temas: list[str] | None = None
    relevancia: str | None = None
    accion_sugerida: str | None = None
    cita: str | None = None
    estado: str | None = None
    responsable_id: int | None = None
    publicado_en: list[dict] | None = None


@router_piezas.patch("/{pid}")
async def cambiar_pieza(pid: int, datos: PiezaCambio, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    _sin_invitado(usuario)
    p = await sesion.get(PiezaPrensa, pid)
    if p is None:
        raise HTTPException(404, "La pieza no existe.")
    cambios = datos.model_dump(exclude_unset=True)
    if "clase" in cambios and cambios["clase"] not in CLASES_PIEZA:
        raise HTTPException(422, "Clase desconocida.")
    if "estado" in cambios and cambios["estado"] not in ESTADOS_PIEZA:
        raise HTTPException(422, "Estado desconocido.")
    for k, v in cambios.items():
        setattr(p, k, v)
    await sesion.commit()
    return pieza_dict(p)


class PegarPieza(_BaseModel):
    texto: str = _Field(min_length=1, max_length=60000)
    actual: dict = {}


@router_piezas.post("/pegar")
async def pegar_pieza(datos: PegarPieza, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Vista previa del bloque `pieza-de-prensa` (sin escribir); el guardado es `POST /api/prensa/piezas`."""
    from app.api.pegar import respuesta_lectura
    from app.servicios import pegado as svc_pegado

    _sin_invitado(usuario)
    le = svc_pegado.interpretar(datos.texto, ("pieza-de-prensa",))
    if not le.valido:
        raise HTTPException(422, {"codigo": "pegado_invalido", "errores": le.errores, "avisos": le.avisos,
                                  "formatos": [f for f in svc_pegado.formatos() if f["tipo"] == "pieza-de-prensa"]})
    r = respuesta_lectura(le, datos.actual)
    parecidas = (await sesion.execute(_select(PiezaPrensa).where(PiezaPrensa.titular.ilike(f"%{(le.valores.get('titular') or '')[:60]}%")).limit(3))).scalars().all()
    r["propuestas"] = {"parecidas": [{"id": x.id, "titular": x.titular, "estado": x.estado} for x in parecidas]}
    return r

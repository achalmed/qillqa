"""backend/app/servicios/telegram.py — puente con el grupo de Telegram de la entidad durante la
transición al chat propio (2026-10-12, fase 8.7; pendiente del 2026-10-06 «bot de Telegram»).

Dos sentidos, ambos opcionales por `.env` (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT`, `TELEGRAM_USUARIO`):

- **Salida**: `enviar(texto)` manda un mensaje al grupo con el Bot API (lo usa la acción
  `telegram` de una regla de `reglas_evento`: «cada recibido nuevo, al grupo»).
- **Entrada**: `bucle()` lee el grupo con `getUpdates` (long polling) y lo que circula entra al
  sistema por las puertas de siempre: un PDF, Word o imagen de documento → Recibidos (la misma
  ficha automática de `POST /api/entradas/subir`); una foto o video → la Fototeca, en el álbum
  «Grupo de Telegram» (ninguna foto suelta). Registra a nombre de la cuenta `TELEGRAM_USUARIO`
  (o del primer administrador activo). El Bot API solo baja archivos de hasta 20 MB. El puntero
  de lectura vive en `ajustes.telegram_offset`: un reinicio no reprocesa lo ya leído.

Nada de la entidad aquí: el token y el chat vienen del `.env`.
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path

import httpx
from sqlalchemy import select

from app.config import config

log = logging.getLogger("sgdp.telegram")
MAX_BYTES = 20 * 1024 * 1024


def activo() -> bool:
    return bool(config.telegram_token)


def _api(metodo: str) -> str:
    return f"https://api.telegram.org/bot{config.telegram_token}/{metodo}"


def clasificar(nombre: str, como_foto: bool) -> str:
    from app.servicios.ingreso import clasificar as _c

    return _c(nombre, como_foto)


async def enviar(texto: str, chat: str | None = None, responder_a: int | None = None) -> bool:
    """Un mensaje al grupo (o a `chat`). Falso si no hay token o Telegram no respondió."""
    if not activo() or not (chat or config.telegram_chat):
        return False
    datos = {"chat_id": chat or config.telegram_chat, "text": texto[:4000], "disable_web_page_preview": True}
    if responder_a:
        datos["reply_to_message_id"] = responder_a
    try:
        async with httpx.AsyncClient(timeout=15) as cliente:
            r = await cliente.post(_api("sendMessage"), data=datos)
            return r.status_code == 200
    except httpx.HTTPError as e:
        log.warning("Telegram no respondió: %s", e)
        return False


async def _descargar(cliente: httpx.AsyncClient, file_id: str, nombre: str) -> Path | None:
    r = await cliente.get(_api("getFile"), params={"file_id": file_id})
    datos = r.json() if r.status_code == 200 else {}
    ruta = (datos.get("result") or {}).get("file_path")
    tam = int((datos.get("result") or {}).get("file_size") or 0)
    if not ruta or tam > MAX_BYTES:
        return None
    destino = Path(tempfile.mkdtemp(prefix="sgdp-telegram-")) / Path(nombre).name
    async with cliente.stream("GET", f"https://api.telegram.org/file/bot{config.telegram_token}/{ruta}") as resp:
        if resp.status_code != 200:
            return None
        with destino.open("wb") as fh:
            async for trozo in resp.aiter_bytes():
                fh.write(trozo)
    return destino


async def _usuario_bot(sesion):
    from app.modelos import Usuario

    if config.telegram_usuario:
        u = (await sesion.execute(select(Usuario).where(Usuario.nombre_usuario == config.telegram_usuario, Usuario.activo.is_(True)))).scalar_one_or_none()
        if u:
            return u
    return (await sesion.execute(select(Usuario).where(Usuario.rol == "administrador", Usuario.activo.is_(True)).order_by(Usuario.id))).scalars().first()


async def _a_recibidos(sesion, ruta: Path, nombre: str, usuario, remitente: str) -> str:
    from app.servicios import ingreso

    return (await ingreso.a_recibidos(sesion, ruta, nombre, usuario, f"Llegó por el grupo de Telegram ({remitente})."))[1]


async def _a_fototeca(sesion, ruta: Path, nombre: str, usuario) -> str:
    from app.servicios import ingreso

    return (await ingreso.a_fototeca(sesion, ruta, nombre, usuario, "Grupo de Telegram",
                                     "Fotos y videos que el equipo compartió en el grupo (puente automático)."))[1]


async def _procesar(sesion, mensaje: dict, cliente: httpx.AsyncClient) -> None:
    chat_id = str((mensaje.get("chat") or {}).get("id", ""))
    if config.telegram_chat and chat_id != str(config.telegram_chat):
        return
    quien = mensaje.get("from") or {}
    remitente = " ".join(x for x in (quien.get("first_name"), quien.get("last_name")) if x) or quien.get("username") or "alguien"
    adjuntos: list[tuple[str, str, bool]] = []   # (file_id, nombre, como_foto)
    if mensaje.get("document"):
        d = mensaje["document"]
        adjuntos.append((d["file_id"], d.get("file_name") or f"documento-{d['file_id'][:8]}.pdf", False))
    if mensaje.get("photo"):
        mayor = max(mensaje["photo"], key=lambda p: p.get("file_size") or 0)
        adjuntos.append((mayor["file_id"], f"telegram-{mensaje.get('message_id')}.jpg", True))
    if mensaje.get("video"):
        v = mensaje["video"]
        adjuntos.append((v["file_id"], v.get("file_name") or f"telegram-{mensaje.get('message_id')}.mp4", True))
    if not adjuntos:
        return
    usuario = await _usuario_bot(sesion)
    if usuario is None:
        log.warning("Telegram: no hay cuenta con que registrar (TELEGRAM_USUARIO o un administrador).")
        return
    respuestas = []
    for file_id, nombre, como_foto in adjuntos:
        clase = clasificar(nombre, como_foto)
        if not clase:
            continue
        ruta = await _descargar(cliente, file_id, nombre)
        if ruta is None:
            respuestas.append(f"{nombre}: no se pudo bajar (¿pesa más de 20 MB?).")
            continue
        try:
            respuestas.append(await (_a_recibidos(sesion, ruta, nombre, usuario, remitente) if clase == "recibido" else _a_fototeca(sesion, ruta, nombre, usuario)))
        except Exception as e:  # noqa: BLE001
            log.exception("Telegram: no se pudo registrar %s", nombre)
            await sesion.rollback()
            respuestas.append(f"{nombre}: no se pudo registrar ({type(e).__name__}).")
    if respuestas:
        await enviar("Qillqa: " + " ".join(respuestas), chat_id, responder_a=mensaje.get("message_id"))


async def _leer_offset(sesion) -> int:
    from app.modelos import Ajuste

    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": "telegram_offset"})
    return int((fila.valor or {}).get("offset", 0)) if fila else 0


async def _guardar_offset(sesion, offset: int) -> None:
    from app.modelos import Ajuste

    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": "telegram_offset"})
    if fila:
        fila.valor = {"offset": offset}
    else:
        sesion.add(Ajuste(despacho_id=1, clave="telegram_offset", valor={"offset": offset}))
    await sesion.commit()


async def bucle(espera: int = 20) -> None:
    """Long polling del Bot API (lo lanza main.py si hay token). Un fallo no detiene la API."""
    from app.db import SesionAsincrona

    if not activo():
        return
    await asyncio.sleep(15)
    log.info("Puente de Telegram activo (entrada: documentos → Recibidos, fotos → Fototeca).")
    while True:
        try:
            async with SesionAsincrona() as sesion:
                offset = await _leer_offset(sesion)
                async with httpx.AsyncClient(timeout=espera + 10) as cliente:
                    r = await cliente.get(_api("getUpdates"), params={"offset": offset, "timeout": espera, "allowed_updates": '["message"]'})
                    actualizaciones = (r.json() or {}).get("result", []) if r.status_code == 200 else []
                    for u in actualizaciones:
                        if u.get("message"):
                            await _procesar(sesion, u["message"], cliente)
                        offset = max(offset, int(u["update_id"]) + 1)
                if actualizaciones:
                    await _guardar_offset(sesion, offset)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("Puente de Telegram: %s", e)
            await asyncio.sleep(30)

"""backend/app/servicios/push.py — avisos PUSH en el celular y en la computadora (Web Push, 2026-10-13;
decisión 8.8 de `docs/plataforma/hoja-de-ruta.md`, aprobada por Edison).

Cómo funciona: el navegador de cada dispositivo se suscribe con la clave PÚBLICA VAPID de Qillqa y
entrega un `endpoint` (un buzón en el servicio de push de su fabricante: FCM para Chrome y Android,
Mozilla, Apple) y dos claves (`p256dh`, `auth`). Para avisar, Qillqa cifra el aviso para ese
dispositivo (RFC 8291) y lo firma con su clave PRIVADA VAPID (RFC 8292); el service worker
(`frontend/public/sw.js`, sección «Avisos push») lo muestra y, al tocarlo, abre la conversación.

- **Claves VAPID**: del entorno (`VAPID_PUBLICA` y `VAPID_PRIVADA`) o, si faltan, el sistema las
  genera la primera vez (curva P-256) y las guarda en `ajustes.webpush_vapid`, la privada cifrada
  con la bóveda (`servicios/boveda.py`). Nunca en el repo. Cambiarlas obliga a reactivar los avisos
  en cada dispositivo (las suscripciones viejas quedan huérfanas y caducan solas).
- **Baja automática**: si el servicio responde 404 o 410 la suscripción caducó y se borra; tras 5
  fallos seguidos de otro tipo, también.
- **Sin bloquear**: se envía en segundo plano (`programar`), en un hilo (`pywebpush` es síncrono),
  con su propia sesión de base de datos; un fallo se anota y nunca toca al módulo que avisó.
- **Quién recibe qué** (reglas puras, `destinatarios_chat`, probadas en `tests/test_push.py`): ver
  la docstring de esa función.
- **Acuse de recibo**: el aviso lleva una firma HMAC (`firma_acuse`) con la que el service worker,
  que no tiene la sesión, confirma la llegada (`POST /api/push/recibido`): ese es el segundo ✓.

Límite honesto (Android): el SONIDO de una notificación lo decide el sistema operativo (canal de
notificaciones de Chrome); la Web no puede poner un sonido propio por aviso. Lo propio de Qillqa
es la vibración (`VIBRACION`), el ícono, la insignia, la etiqueta (`tag`) que agrupa por
conversación y el título. Dentro de la aplicación abierta sí suena el sonido de Qillqa
(`frontend/src/componentes/chat/sonidos.ts`).
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config

log = logging.getLogger("qillqa.push")

AJUSTE = "webpush_vapid"
# Patrón de vibración propio de Qillqa (ms: vibra, pausa, vibra…): dos toques cortos y uno largo,
# distinto del zumbido único de WhatsApp o Telegram.
VIBRACION = [90, 60, 90, 60, 220]
ICONO = "/notificaciones/icono-192.png"
INSIGNIA = "/notificaciones/insignia-96.png"
MAX_FALLOS = 5
TTL = 24 * 3600          # un aviso que no llega en un día ya no sirve
_tareas: set[asyncio.Task] = set()
_claves: tuple[str, str] | None = None
_aviso_sin_libreria = False


# --- puras -----------------------------------------------------------------------------------


def b64url(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def generar_claves() -> tuple[str, str]:
    """Un par VAPID nuevo: (pública en base64url sin relleno, como la pide `PushManager.subscribe`;
    privada en PEM PKCS8)."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    privada = ec.generate_private_key(ec.SECP256R1())
    publica = privada.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    pem = privada.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    return b64url(publica), pem


def firma_acuse(usuario_id: int, canal_id: int, mensaje_id: int) -> str:
    """HMAC corto con el secreto de la sesión: prueba que el acuse lo pide el aviso que mandó Qillqa."""
    clave = hashlib.sha256(b"qillqa-push-acuse:" + config.jwt_secret.encode()).digest()
    return hmac.new(clave, f"{usuario_id}:{canal_id}:{mensaje_id}".encode(), hashlib.sha256).hexdigest()[:32]


def acuse_valido(usuario_id: int, canal_id: int, mensaje_id: int, firma: str) -> bool:
    return hmac.compare_digest(firma_acuse(usuario_id, canal_id, mensaje_id), (firma or "")[:32])


def ruta_aviso(documento_id: int | None, proyecto_id: int | None, destino: str) -> str:
    """La misma regla que `CampanaNotificaciones.tsx::rutaAviso`: adónde lleva tocar el aviso."""
    d = destino or ""
    if d.startswith("entrada:"):
        return f"/recibidos?ver={d[8:]}"
    if documento_id:
        return f"/documentos/{documento_id}"
    if proyecto_id:
        from urllib.parse import quote

        return f"/proyectos/{proyecto_id}" + (f"?ir={quote(d)}" if d else "")
    if d.startswith("tarea:"):
        return f"/tareas?abrir={d[6:]}"
    if d.startswith("evento:"):
        return f"/agenda?abrir={d[7:]}"
    if d.startswith("doc:") and d[4:].isdigit():
        return f"/documentos/{d[4:]}"
    if d.startswith("chat:"):
        partes = d.split(":")
        if len(partes) >= 2 and partes[1].isdigit():
            return f"/chat?canal={partes[1]}" + (f"&mensaje={partes[2]}" if len(partes) > 2 and partes[2].isdigit() else "")
    return "/"


def recortar(texto: str, maximo: int = 180) -> str:
    t = " ".join((texto or "").split())
    return t if len(t) <= maximo else t[: maximo - 1] + "…"


def carga(titulo: str, cuerpo: str, url: str, tag: str, *, clase: str = "aviso", acuse: dict | None = None) -> dict:
    """Lo que viaja cifrado al service worker. El aspecto (vibración, ícono, insignia) va aquí y
    no en el worker para poder cambiarlo sin publicar la web."""
    return {
        "titulo": recortar(titulo, 80) or "Qillqa", "cuerpo": recortar(cuerpo), "url": url or "/", "tag": tag, "clase": clase,
        "vibrar": VIBRACION, "icono": ICONO, "insignia": INSIGNIA, "acuse": acuse or None,
        "enviado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


# --- claves VAPID ------------------------------------------------------------------------------


async def claves(sesion: AsyncSession) -> tuple[str, str]:
    """(pública, privada PEM). Del entorno si están; si no, de `ajustes` (se generan la primera vez)."""
    global _claves
    if _claves:
        return _claves
    pub, priv = (config.vapid_publica or "").strip(), (config.vapid_privada or "").strip()
    if pub and priv:
        _claves = (pub, priv.replace("\\n", "\n"))
        return _claves
    from app.modelos import Ajuste
    from app.servicios import boveda

    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": AJUSTE})
    if fila and (fila.valor or {}).get("publica") and (fila.valor or {}).get("privada"):
        try:
            _claves = (fila.valor["publica"], boveda.descifrar(fila.valor["privada"]))
            return _claves
        except ValueError:
            log.warning("La clave VAPID guardada no se puede descifrar (¿cambió JWT_SECRET o QILLQA_BOVEDA_CLAVE?): se genera otra.")
    pub, pem = generar_claves()
    valor = {"publica": pub, "privada": boveda.cifrar(pem), "creada_en": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if fila:
        fila.valor = valor
    else:
        sesion.add(Ajuste(despacho_id=1, clave=AJUSTE, valor=valor))
    await sesion.commit()
    log.info("Claves VAPID generadas y guardadas (cifradas) en ajustes.%s", AJUSTE)
    _claves = (pub, pem)
    return _claves


def contacto() -> str:
    """El `sub` del JWT VAPID: un mailto o la dirección pública de Qillqa (los servicios de push lo
    exigen para poder escribir si algo va mal)."""
    c = (config.vapid_contacto or "").strip()
    if c:
        return c if c.startswith(("mailto:", "https://")) else f"mailto:{c}"
    if (config.qillqa_url_publica or "").startswith("https://"):
        return config.qillqa_url_publica.rstrip("/")
    return "mailto:qillqa@example.com"


def disponible() -> bool:
    try:
        import pywebpush  # noqa: F401
    except ImportError:
        return False
    return True


# --- envío -------------------------------------------------------------------------------------


_vapid: dict[str, object] = {}


def _firmante(privada_pem: str):
    """El objeto VAPID de pywebpush/py_vapid para la clave PEM (se crea una vez)."""
    if privada_pem not in _vapid:
        from py_vapid import Vapid02

        _vapid.clear()
        _vapid[privada_pem] = Vapid02.from_pem(privada_pem.encode())
    return _vapid[privada_pem]


def _enviar_uno(sub: dict, datos: str, privada: str) -> int:
    """Un aviso a un dispositivo (en un hilo). → código HTTP del servicio de push (0 si no hubo respuesta)."""
    from pywebpush import WebPushException, webpush

    try:
        r = webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
            data=datos, vapid_private_key=_firmante(privada), vapid_claims={"sub": contacto()}, ttl=TTL, timeout=10,
            headers={"Urgency": "high"},
        )
        return int(getattr(r, "status_code", 0) or 0)
    except WebPushException as e:
        return int(getattr(e.response, "status_code", 0) or 0) if e.response is not None else 0
    except Exception as e:  # noqa: BLE001  red caída, DNS, certificado
        log.warning("Push a %s…: %s", sub["endpoint"][:40], e)
        return 0


async def enviar(usuario_ids: set[int] | list[int], datos: dict) -> int:
    """Envía `datos` a cada dispositivo suscrito de esas personas; borra lo caducado. → enviados."""
    global _aviso_sin_libreria
    from app.db import SesionAsincrona
    from app.modelos_push import SuscripcionPush

    ids = {int(u) for u in usuario_ids if u}
    if not ids:
        return 0
    if not disponible():
        if not _aviso_sin_libreria:
            log.warning("pywebpush no está instalado: no se envían avisos push (pip install -r requirements.txt).")
            _aviso_sin_libreria = True
        return 0
    enviados = 0
    async with SesionAsincrona() as sesion:
        subs = (await sesion.execute(select(SuscripcionPush).where(SuscripcionPush.usuario_id.in_(ids)))).scalars().all()
        if not subs:
            return 0
        _, privada = await claves(sesion)
        cuerpo = json.dumps(datos, ensure_ascii=False)
        resultados = await asyncio.gather(*[
            asyncio.to_thread(_enviar_uno, {"endpoint": s.endpoint, "p256dh": s.p256dh, "auth": s.auth}, cuerpo, privada) for s in subs
        ])
        ahora = datetime.now(timezone.utc)
        caducadas: list[int] = []
        for s, codigo in zip(subs, resultados):
            if 200 <= codigo < 300:
                enviados += 1
                s.fallos, s.ultimo_envio_en = 0, ahora
            elif codigo in (404, 410):
                caducadas.append(s.id)
            else:
                s.fallos = (s.fallos or 0) + 1
                if s.fallos >= MAX_FALLOS:
                    caducadas.append(s.id)
                log.info("Push a la suscripción %s respondió %s (fallo %s)", s.id, codigo, s.fallos)
        if caducadas:
            await sesion.execute(delete(SuscripcionPush).where(SuscripcionPush.id.in_(caducadas)))
            log.info("Suscripciones push caducadas, dadas de baja: %s", len(caducadas))
        await sesion.commit()
    return enviados


def programar(usuario_ids: set[int] | list[int], datos: dict, retraso: float = 0.0) -> None:
    """`enviar` en segundo plano, sin esperar (quien avisa sigue con su transacción). `retraso`
    deja que esa transacción se confirme antes de que el aviso llegue y alguien lo toque."""
    ids = {int(u) for u in usuario_ids if u}
    if not ids:
        return
    try:
        bucle = asyncio.get_running_loop()
    except RuntimeError:
        return

    async def _correr() -> None:
        try:
            if retraso:
                await asyncio.sleep(retraso)
            await enviar(ids, datos)
        except Exception:  # noqa: BLE001  nunca por un aviso
            log.exception("Fallo al enviar avisos push")

    t = bucle.create_task(_correr())
    _tareas.add(t)
    t.add_done_callback(_tareas.discard)


def sin_la_app_a_la_vista(usuario_ids: set[int]) -> set[int]:
    """De esas personas, las que NO tienen Qillqa a la vista (a ellas va el push)."""
    from app.servicios import difusor

    return {u for u in usuario_ids if not difusor.a_la_vista(u)}

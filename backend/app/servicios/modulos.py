"""MÓDULOS que se encienden y apagan desde Administración (2026-10-18; docs/arquitectura.md §33).

El pedido (Edison 2026-10-18): «en Administración se activan y desactivan los módulos», y que el
cambio se aplique de verdad, no solo en el menú. Un solo lugar de verdad, la tabla `ajustes`
(clave `modulos`): `{id: {"activo": bool, "mensaje": str}}`. Lo leen:

- el guardián de rutas (`GuardianModulos`, montado en main.py): la API de un módulo apagado responde
  403 `modulo_apagado` con su mensaje (403 y no 503: la web toma 502-504 por «sin servidor»);
- la página pública de la mesa de partes virtual (api/mesa_publica.py), que en lugar del formulario
  muestra el mensaje y no recibe trámites nuevos;
- las reglas de eventos (servicios/eventos_sistema.py): no publican en un chat apagado ni crean
  tareas con Tareas apagado;
- la web (`GET /api/modulos`): saca del menú lo apagado y en su ruta muestra el mensaje.

Lo que es el núcleo (Gestión documental, Directorio, Inicio, Administración, Mi perfil) no se
apaga. La Mesa de partes virtual depende de la Mesa de Partes (sus trámites son recibidos): con
Recibidos apagado, la virtual también lo está.

Partes PURAS (tests/test_modulos.py): el catálogo, `normalizar`, `efectivo`, `modulo_de_ruta` y
`apagado` (el detalle del 403). Después, la lectura con caché y el guardián.
"""

from __future__ import annotations

import json
import time

CLAVE_AJUSTE = "modulos"

# El mensaje de la mesa virtual apagada lo leen el equipo y el público: neutro y amable, sin decir
# por qué está apagada ni quién lo decidió (Edison 2026-10-18). Se edita en Administración.
MENSAJE_MESA_VIRTUAL = (
    "La mesa de partes virtual no está disponible por el momento. Puede presentar sus documentos "
    "por la mesa de partes del Congreso de la República. Gracias por su comprensión."
)

# id (el mismo de frontend/src/navegacion.ts), nombre, qué es, prefijos de su API y de qué otro
# módulo depende. `activo` es el valor de fábrica.
CATALOGO: list[dict] = [
    {"id": "recibidos", "nombre": "Mesa de Partes", "que": "Lo que llega a la entidad: ficha, responsable, plazo y respuesta.",
     "rutas": ["/api/entradas", "/api/mesa-virtual"], "activo": True},
    # De fábrica APAGADA (Edison 2026-10-18: «la mesa de partes virtual debe quedar desactivada»).
    {"id": "mesa_virtual", "nombre": "Mesa de partes virtual", "que": "La página pública para presentar documentos sin cuenta.",
     "rutas": [], "requiere": "recibidos", "publico": True, "activo": False, "mensaje": MENSAJE_MESA_VIRTUAL},
    {"id": "tareas", "nombre": "Tareas y Agenda", "que": "Encargos con plazo y la agenda de la entidad.",
     "rutas": ["/api/tareas", "/api/agenda"], "activo": True},
    {"id": "chat", "nombre": "Chat", "que": "Conversaciones del equipo y avisos automáticos en sus canales.",
     "rutas": ["/api/chat"], "activo": True},
    {"id": "proyectos", "nombre": "Proyectos de ley", "que": "Proyectos por fases con redacción en colaboración.",
     "rutas": ["/api/proyectos"], "activo": True},
    {"id": "representacion", "nombre": "Semana de representación", "que": "Cada semana con sus actividades, pedidos e informe.",
     "rutas": ["/api/semanas", "/api/informes-sr"], "activo": True},
    {"id": "rendicion", "nombre": "Rendición de cuentas", "que": "Viáticos de cada comisión y sus anexos.",
     "rutas": ["/api/rendiciones"], "activo": True},
    {"id": "fototeca", "nombre": "Mediateca", "que": "Fotos y videos de la entidad; la usan la Semana y Prensa.",
     "rutas": ["/api/fototeca"], "activo": True},
    {"id": "prensa", "nombre": "Prensa", "que": "Piezas de prensa y el estudio de diseño.",
     "rutas": ["/api/prensa", "/estudio"], "activo": True},
    {"id": "mapa", "nombre": "Mapa de relaciones", "que": "Cómo se conectan documentos, proyectos y personas.",
     "rutas": ["/api/grafo"], "activo": True},
    {"id": "observatorio", "nombre": "Observatorio de datos", "que": "Indicadores de fuentes oficiales.",
     "rutas": [], "activo": True},
    {"id": "contrasenas", "nombre": "Contraseñas", "que": "Claves cifradas de las mesas de partes.",
     "rutas": ["/api/contrasenas"], "activo": True},
]
POR_ID = {m["id"]: m for m in CATALOGO}
MAX_MENSAJE = 400


def mensaje_por_omision(mid: str) -> str:
    m = POR_ID[mid]
    return m.get("mensaje") or f"{m['nombre']} no está disponible por el momento."


def normalizar(datos: dict | None) -> dict:
    """El estado guardado (o enviado), completo para todo el catálogo. Lo desconocido se ignora;
    un mensaje vacío vuelve al de fábrica."""
    d = datos if isinstance(datos, dict) else {}
    salida = {}
    for m in CATALOGO:
        x = d.get(m["id"]) if isinstance(d.get(m["id"]), dict) else {}
        mensaje = " ".join(str(x.get("mensaje") or "").split())[:MAX_MENSAJE]
        salida[m["id"]] = {
            "activo": bool(x["activo"]) if "activo" in x else m["activo"],
            "mensaje": mensaje or mensaje_por_omision(m["id"]),
        }
    return salida


def efectivo(estado: dict) -> dict:
    """{id: activo} aplicando las dependencias (la mesa virtual necesita Recibidos)."""
    salida = {mid: bool(e["activo"]) for mid, e in estado.items()}
    for m in CATALOGO:
        if m.get("requiere") and not salida.get(m["requiere"], True):
            salida[m["id"]] = False
    return salida


def modulo_de_ruta(ruta: str) -> str | None:
    """El módulo dueño de una ruta de la API, o None si es del núcleo."""
    for m in CATALOGO:
        for prefijo in m["rutas"]:
            if ruta == prefijo or ruta.startswith(prefijo + "/") or ruta.startswith(prefijo + "."):
                return m["id"]
    return None


def apagado(mid: str, estado: dict) -> dict:
    """El detalle de la respuesta 403 de un módulo apagado."""
    return {"codigo": "modulo_apagado", "modulo": mid, "mensaje": estado.get(mid, {}).get("mensaje") or mensaje_por_omision(mid)}


def vista(estado: dict) -> list[dict]:
    """Lo que ve la web: el catálogo con su estado guardado y el efectivo."""
    ef = efectivo(estado)
    return [
        {"id": m["id"], "nombre": m["nombre"], "que": m["que"], "publico": bool(m.get("publico")),
         "requiere": m.get("requiere", ""), "activo": estado[m["id"]]["activo"], "efectivo": ef[m["id"]],
         "mensaje": estado[m["id"]]["mensaje"], "mensaje_por_omision": mensaje_por_omision(m["id"])}
        for m in CATALOGO
    ]


# --- lectura con caché (la consulta cada petición del guardián) ------------------------------------

_TTL = 10.0
_cache: dict[str, tuple[float, dict]] = {}


def invalidar() -> None:
    _cache.clear()


async def ajuste_cacheado(sesion, clave: str) -> dict:
    """El valor de un ajuste, leído como mucho cada 10 s (un solo proceso: quien lo guarda invalida)."""
    from app.modelos import Ajuste

    ahora = time.monotonic()
    hit = _cache.get(clave)
    if hit and ahora - hit[0] < _TTL:
        return hit[1]
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": clave})
    valor = dict(fila.valor or {}) if fila else {}
    _cache[clave] = (ahora, valor)
    return valor


async def estado(sesion) -> dict:
    return normalizar(await ajuste_cacheado(sesion, CLAVE_AJUSTE))


async def activo(sesion, mid: str) -> bool:
    return efectivo(await estado(sesion)).get(mid, True)


async def guardar(sesion, mid: str, activo_: bool | None, mensaje: str | None) -> dict:
    """Cambia un módulo (sin commit). Devuelve el estado completo."""
    from app.modelos import Ajuste

    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": CLAVE_AJUSTE})
    actual = normalizar(fila.valor if fila else {})
    if activo_ is not None:
        actual[mid]["activo"] = bool(activo_)
    if mensaje is not None:
        actual[mid]["mensaje"] = mensaje
    limpio = normalizar(actual)
    if fila is None:
        sesion.add(Ajuste(despacho_id=1, clave=CLAVE_AJUSTE, valor=limpio))
    else:
        fila.valor = limpio
    invalidar()
    return limpio


class GuardianModulos:
    """Middleware ASGI: la API de un módulo apagado no responde (403 `modulo_apagado`). Va antes de
    la autenticación a propósito: apagado es apagado para todos, también para quien administra; se
    vuelve a encender desde Administración, cuya API (`/api/modulos`) es del núcleo."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        mid = modulo_de_ruta(scope.get("path", ""))
        if mid is None:
            return await self.app(scope, receive, send)
        from app.db import SesionAsincrona

        try:
            async with SesionAsincrona() as s:
                est = await estado(s)
        except Exception:  # noqa: BLE001  — sin base, que responda la ruta (y falle ella)
            return await self.app(scope, receive, send)
        if efectivo(est).get(mid, True):
            return await self.app(scope, receive, send)
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 4403})
            return
        cuerpo = json.dumps({"detail": apagado(mid, est)}, ensure_ascii=False).encode()
        await send({"type": "http.response.start", "status": 403,
                    "headers": [(b"content-type", b"application/json; charset=utf-8"), (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": cuerpo})

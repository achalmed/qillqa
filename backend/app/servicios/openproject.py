"""Cliente de la API v3 de OpenProject (2026-10-02). Solo biblioteca estándar.

Lo usan la sincronización (servicios/openproject_sync.py) y la API de Qillqa
(api/openproject.py). Todo es síncrono (urllib); quien lo llama desde FastAPI lo
corre con `asyncio.to_thread` para no frenar la API.

Los ids de proyectos, tipos, estados, prioridades, usuarios y campos se resuelven
POR NOMBRE contra la propia instancia (y se guardan unos minutos): no depende de
`op_ids.json` ni se rompe si alguien vuelve a sembrar OpenProject.

Escribe siempre con `notify=false`: el reflejo de un cambio de Qillqa no debe
mandar correos de OpenProject (el aviso ya lo dio Qillqa).
"""

from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from app.config import config


class ErrorOP(Exception):
    def __init__(self, mensaje: str, codigo: int = 0):
        super().__init__(mensaje)
        self.codigo = codigo


def activa() -> bool:
    """La integración está encendida si hay dirección Y token."""
    return bool(config.openproject_url and config.openproject_token)


def url_publica() -> str:
    return (config.openproject_url_publica or config.openproject_url).rstrip("/")


def url_wp(wp_id: int | None) -> str:
    return f"{url_publica()}/work_packages/{wp_id}" if wp_id and url_publica() else ""


def _filtros(*f: dict) -> str:
    return json.dumps(list(f))


class Cliente:
    def __init__(self, url: str | None = None, token: str | None = None, tiempo: float = 20):
        self.url = (url or config.openproject_url).rstrip("/")
        self.token = token if token is not None else config.openproject_token
        self.tiempo = tiempo
        self._catalogo: dict | None = None
        self._catalogo_en = 0.0
        self._esquemas: dict[tuple[int, int], dict] = {}

    # --- HTTP -------------------------------------------------------------

    def pedir(self, metodo: str, ruta: str, cuerpo: dict | None = None) -> dict:
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        peticion = urllib.request.Request(
            self.url + ruta, data=datos, method=metodo,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/hal+json",
                "Authorization": "Basic " + base64.b64encode(f"apikey:{self.token}".encode()).decode(),
            },
        )
        try:
            with urllib.request.urlopen(peticion, timeout=self.tiempo) as r:
                texto = r.read().decode() or "{}"
                return json.loads(texto)
        except urllib.error.HTTPError as e:
            cuerpo_error = e.read().decode(errors="replace")
            try:
                mensaje = json.loads(cuerpo_error).get("message") or cuerpo_error
            except ValueError:
                mensaje = cuerpo_error
            raise ErrorOP(f"{e.code}: {str(mensaje)[:300]}", e.code) from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise ErrorOP(f"OpenProject no responde ({e})") from None

    def lista(self, ruta: str, **parametros) -> list[dict]:
        """Todos los elementos de una colección (recorre las páginas)."""
        salida: list[dict] = []
        parametros.setdefault("pageSize", 200)
        pagina = 1
        while True:
            q = urllib.parse.urlencode({**parametros, "offset": pagina})
            r = self.pedir("GET", f"{ruta}?{q}")
            elementos = r.get("_embedded", {}).get("elements", [])
            salida += elementos
            if len(salida) >= int(r.get("total", 0)) or not elementos:
                return salida
            pagina += 1

    # --- Catálogo (por nombre) ---------------------------------------------

    def catalogo(self, refrescar: bool = False) -> dict:
        """Proyectos, tipos, estados, prioridades y usuarios por nombre; se renueva cada
        2 minutos (una cuenta nueva en OpenProject se vincula sola enseguida)."""
        if self._catalogo and not refrescar and time.monotonic() - self._catalogo_en < 120:
            return self._catalogo
        estados = self.lista("/api/v3/statuses")
        prioridades = self.lista("/api/v3/priorities")
        self._catalogo = {
            "proyectos": {p["identifier"]: p["id"] for p in self.lista("/api/v3/projects")},
            "tipos": {t["name"]: t["id"] for t in self.lista("/api/v3/types")},
            "estados": {s["name"]: s["id"] for s in estados},
            "cerrados": {s["id"] for s in estados if s.get("isClosed")},
            "prioridades": {p["name"]: p["id"] for p in prioridades},
            "prioridad_defecto": next((p["id"] for p in prioridades if p.get("isDefault")), None),
            "usuarios": [
                {"id": u["id"], "login": u.get("login", ""), "email": u.get("email", ""), "nombre": u.get("name", ""), "estado": u.get("status", "")}
                for u in self.lista("/api/v3/users")
            ],
        }
        self._catalogo_en = time.monotonic()
        self._esquemas.clear()
        return self._catalogo

    def esquema(self, proyecto_id: int, tipo_id: int) -> dict:
        """Campos personalizados de un proyecto y tipo, por nombre:
        {nombre: {"clave": "customField12", "opciones": {valor: href}}}."""
        k = (proyecto_id, tipo_id)
        if k not in self._esquemas:
            # El formulario de alta trae las opciones de las listas; el esquema
            # suelto (GET …/schemas/P-T) no las incluye en OpenProject 17.
            r = self.pedir("POST", "/api/v3/work_packages/form", {"_links": {
                "project": {"href": f"/api/v3/projects/{proyecto_id}"}, "type": {"href": f"/api/v3/types/{tipo_id}"}}})
            r = r.get("_embedded", {}).get("schema", {})
            campos = {}
            for clave, defin in r.items():
                if not clave.startswith("customField") or not isinstance(defin, dict):
                    continue
                opciones = {
                    v.get("title"): v.get("href")
                    for v in (defin.get("_links", {}).get("allowedValues") or [])
                    if isinstance(v, dict)
                }
                campos[defin.get("name", clave)] = {"clave": clave, "opciones": opciones}
            self._esquemas[k] = campos
        return self._esquemas[k]

    def clave_campo(self, nombre: str) -> str | None:
        """customFieldN de un campo por nombre (el primero de cualquier esquema conocido)."""
        for campos in self._esquemas.values():
            if nombre in campos:
                return campos[nombre]["clave"]
        return None

    # --- Paquetes de trabajo ------------------------------------------------

    def buscar_por_clave(self, campo: str, valor: str) -> dict | None:
        r = self.pedir("GET", "/api/v3/work_packages?" + urllib.parse.urlencode({
            "filters": _filtros({campo: {"operator": "=", "values": [valor]}}, {"status": {"operator": "*", "values": []}}),
            "pageSize": 2,
        }))
        elementos = r.get("_embedded", {}).get("elements", [])
        return elementos[0] if elementos else None

    def paquete(self, wp_id: int) -> dict:
        return self.pedir("GET", f"/api/v3/work_packages/{wp_id}")

    def crear(self, cuerpo: dict) -> dict:
        return self.pedir("POST", "/api/v3/work_packages?notify=false", cuerpo)

    def actualizar(self, wp_id: int, cuerpo: dict) -> dict:
        """PATCH con el lockVersion vigente; si otro lo cambió entretanto (409), reintenta una vez."""
        for intento in range(2):
            actual = self.paquete(wp_id)
            try:
                return self.pedir("PATCH", f"/api/v3/work_packages/{wp_id}?notify=false", {**cuerpo, "lockVersion": actual["lockVersion"]})
            except ErrorOP as e:
                if e.codigo != 409 or intento:
                    raise
        raise ErrorOP("conflicto de versión")

    def paquetes(self, *filtros: dict, orden: list | None = None, tope: int = 200) -> list[dict]:
        parametros = {"filters": _filtros(*filtros), "pageSize": min(tope, 200)}
        if orden:
            parametros["sortBy"] = json.dumps(orden)
        r = self.pedir("GET", "/api/v3/work_packages?" + urllib.parse.urlencode(parametros))
        return r.get("_embedded", {}).get("elements", [])

    def version(self) -> str:
        r = self.pedir("GET", "/api/v3")
        return str(r.get("coreVersion") or r.get("instanceName") or "")


def resumen_paquete(wp: dict) -> dict:
    """Lo que Qillqa muestra de un paquete de trabajo."""
    enlaces = wp.get("_links", {})

    def titulo(k: str) -> str:
        return (enlaces.get(k) or {}).get("title") or ""

    return {
        "id": wp.get("id"),
        "asunto": wp.get("subject", ""),
        "proyecto": titulo("project"),
        "tipo": titulo("type"),
        "estado": titulo("status"),
        "responsable": titulo("assignee"),
        "inicio": wp.get("startDate") or wp.get("date") or "",
        "fin": wp.get("dueDate") or wp.get("date") or "",
        "url": url_wp(wp.get("id")),
    }


# Un cliente por proceso: guarda el catálogo entre revisiones.
_cliente: Cliente | None = None


def cliente() -> Cliente:
    global _cliente
    if _cliente is None or _cliente.url != config.openproject_url.rstrip("/"):
        _cliente = Cliente()
    return _cliente

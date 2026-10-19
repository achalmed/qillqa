#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# bridges/op_api.py — openproject_despacho: motor mínimo de la API v3 de OpenProject para los puentes (upsert idempotente de work packages); solo librería estándar.
"""
Resuelve ids desde `op_ids.json` (lo regenera `./sembrar.sh --ids`): proyectos, tipos,
estados, prioridades, campos personalizados y sus opciones de lista.

Dónde está el despliegue (mismo criterio que config.sh): `OPENPROJECT_OPERACIONES` o
`$DESPACHO_DIR/operaciones/openproject` (DESPACHO_DIR de core/env.py del workspace; ola 8); allí viven `.env` (OPENPROJECT_URL, OPENPROJECT_TOKEN) y
`op_ids.json` (o `OPENPROJECT_IDS`). `cargar_entorno()` lee ese `.env` sin dependencias.
"""
import json, base64, os, urllib.request, urllib.error, urllib.parse
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _despacho_operaciones():
    """`$DESPACHO_DIR/operaciones/openproject` con DESPACHO_DIR de core/env.py (se sube hasta la raíz del workspace)."""
    d = RAIZ
    while d != d.parent and not (d / "core" / "env.py").exists():
        d = d.parent
    if not (d / "core" / "env.py").exists():
        return None
    import importlib.util
    spec = importlib.util.spec_from_file_location("core_env", d / "core" / "env.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return Path(m.DESPACHO_DIR) / "operaciones" / "openproject"


def operaciones():
    """Carpeta de operaciones del despliegue (o None si no hay)."""
    for cand in (os.environ.get("OPENPROJECT_OPERACIONES"), _despacho_operaciones()):
        if cand and Path(cand).is_dir():
            return Path(cand).resolve()
    return None


def cargar_entorno():
    """Carga las variables del .env de operaciones en os.environ (sin pisar las ya definidas)."""
    ops = operaciones()
    env = ops / ".env" if ops else None
    if not env or not env.exists():
        return ops
    for linea in env.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
            valor = valor[1:-1]
        os.environ.setdefault(clave.strip(), valor)
    return ops


def ruta_ids():
    ops = operaciones()
    return Path(os.environ.get("OPENPROJECT_IDS") or ((ops or Path(__file__).parent) / "op_ids.json"))


class OpenProject:
    def __init__(self, url, token, ids_path=None):
        self.url = url.rstrip("/")
        self.token = token
        p = Path(ids_path) if ids_path else ruta_ids()
        if not p.exists():
            raise SystemExit(f"❌ Falta {p}. Genérelo con ./sembrar.sh --ids (ver README).")
        self.ids = json.loads(p.read_text(encoding="utf-8"))

    # ---- HTTP ----
    def _req(self, method, path, body=None):
        url = self.url + path
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Basic " + base64.b64encode(f"apikey:{self.token}".encode()).decode(),
        }
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                return json.loads(r.read().decode()), None
        except urllib.error.HTTPError as e:
            return None, f"{e.code} {e.read().decode()[:300]}"

    # ---- helpers de ids ----
    def _href(self, kind, name):
        table = {"project": "projects", "type": "types",
                 "status": "statuses", "priority": "priorities"}[kind]
        _id = self.ids[kind].get(name)
        return {"href": f"/api/v3/{table}/{_id}"} if _id else None

    def _cf_key(self, cf_name):
        _id = self.ids["cf"].get(cf_name)
        return f"customField{_id}" if _id else None

    def _cf_option_href(self, cf_name, value):
        opt = self.ids.get("cf_options", {}).get(cf_name, {}).get(value)
        return {"href": f"/api/v3/custom_options/{opt}"} if opt else None

    # ---- buscar por campo de texto (clave de enlace) ----
    def find_by_cf(self, cf_name, value):
        key = self._cf_key(cf_name)
        if not key:
            return None
        filters = json.dumps([{key: {"operator": "=", "values": [value]}}])
        q = urllib.parse.urlencode({"filters": filters, "pageSize": 2})
        res, err = self._req("GET", f"/api/v3/work_packages?{q}")
        if err or not res:
            return None
        els = res.get("_embedded", {}).get("elements", [])
        if not els:
            return None
        return {"id": els[0]["id"], "lockVersion": els[0]["lockVersion"]}

    # ---- construir payload ----
    def _payload(self, subject, type_name, status_name, priority_name,
                 project_ident=None, text_cfs=None, list_cfs=None, due_date=None):
        links = {"type": self._href("type", type_name),
                 "status": self._href("status", status_name),
                 "priority": self._href("priority", priority_name)}
        if project_ident:
            links["project"] = self._href("project", project_ident)
        for cf_name, value in (list_cfs or {}).items():
            href = self._cf_option_href(cf_name, value)
            key = self._cf_key(cf_name)
            if href and key:
                links[key] = href
        body = {"subject": subject[:255], "_links": {k: v for k, v in links.items() if v}}
        for cf_name, value in (text_cfs or {}).items():
            key = self._cf_key(cf_name)
            if key and value:
                body[key] = str(value)
        if due_date:
            body["dueDate"] = due_date
        return body

    # ---- upsert idempotente ----
    def upsert(self, match_cf, match_value, subject, type_name, status_name,
               priority_name, project_ident, text_cfs=None, list_cfs=None, due_date=None):
        existing = self.find_by_cf(match_cf, match_value)
        payload = self._payload(subject, type_name, status_name, priority_name,
                                project_ident=None if existing else project_ident,
                                text_cfs=text_cfs, list_cfs=list_cfs, due_date=due_date)
        if existing:
            payload["lockVersion"] = existing["lockVersion"]
            res, err = self._req("PATCH", f"/api/v3/work_packages/{existing['id']}", payload)
            return ("actualizado", existing["id"], err)
        else:
            res, err = self._req("POST", "/api/v3/work_packages", payload)
            new_id = res.get("id") if res else None
            return ("creado", new_id, err)

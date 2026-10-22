"""backend/tests/recorrido.py — el recorrido de punta a punta contra una instancia viva (fase 0 de
docs/plataforma/propuesta-repositorios.md, 2026-10-20): lo que la foto de tests/linea_base.py no puede ver
sin servidor. Se corre antes y después de cada paso de la separación en proyectos; si algo que antes
respondía ahora falla, el paso no se publica.

Dos partes:

- **barrido**: toda consulta GET de la foto (tests/linea_base/funciones.json) que no pide datos de
  entrada, y las que piden un id, con el primero que da su lista; ninguna puede responder 5xx;
- **flujos**: lo que no puede romperse, de punta a punta (tests/recorrido_flujos.py).

Solo contra la instancia aislada (scripts/instancia_prueba.sh: API 8010, base `qillqa_prueba`), nunca contra
producción: escribe datos de prueba. La clave se lee del archivo de la instancia y no se muestra.

    cd backend && .venv/bin/python -m tests.recorrido                 # barrido y flujos
    cd backend && .venv/bin/python -m tests.recorrido --solo barrido
    cd backend && .venv/bin/python -m tests.recorrido --solo flujos --flujos documentos,chat
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

API = os.environ.get("RECORRIDO_API", "http://127.0.0.1:8010")
ESTADO = Path(os.environ.get("RECORRIDO_ESTADO") or Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "qillqa-prueba")
USUARIO = os.environ.get("RECORRIDO_USUARIO", "prueba")
FOTO = Path(__file__).resolve().parent / "linea_base" / "funciones.json"

# Lo que el barrido no llama: flujos de bytes largos, websockets, el proxy del estudio y descargas que
# arman paquetes grandes. Se cubren en los flujos o no hacen falta para saber si el módulo vive.
OMITIR = re.compile(r"(/video$|/ws$|^/estudio|/descargar-todo|/zip$|\.zip$|/exportar-lote)")


class Fallo(Exception):
    pass


def clave_de(usuario: str) -> str:
    """La clave de la cuenta de la instancia («prueba» → clave_admin; otra → clave_<usuario>), leída del archivo."""
    return (ESTADO / f"clave_{'admin' if usuario == 'prueba' else usuario}").read_text().strip()


def cliente() -> httpx.Client:
    if ":8000" in API:
        raise SystemExit("El recorrido escribe datos de prueba: nunca contra la API de producción (8000).")
    clave = clave_de(USUARIO)
    c = httpx.Client(base_url=API, timeout=120)
    r = c.post("/api/auth/login", json={"usuario": USUARIO, "clave": clave})
    if r.status_code != 200:
        raise SystemExit(f"No pude entrar como «{USUARIO}» en {API}: {r.status_code}")
    c.headers["Authorization"] = f"Bearer {r.json()['token']}"
    # Una cuenta nueva (la «verde», en una copia de producción con el primer ingreso encendido) debe
    # completar sus datos antes de trabajar: se completan con datos neutros de verificación.
    paso = c.get("/api/modulos")
    if paso.status_code == 428 and (paso.json().get("detail") or {}).get("codigo") == "datos_pendientes":
        r = c.post("/api/cuenta/bienvenida", json={"nombres": "Cuenta", "apellidos": "de verificación",
                                                   "celular": "900000000", "email": "verificacion@ejemplo.pe",
                                                   "cargo": "Asistente"})
        if r.status_code != 200:
            raise SystemExit(f"No pude completar el primer ingreso de «{USUARIO}»: {r.status_code} {r.text[:200]}")
    return c


def _primer_id(datos) -> int | str | None:
    """El primer «id» de una respuesta de lista (lista suelta o dentro de una clave)."""
    if isinstance(datos, dict):
        for v in datos.values():
            if isinstance(v, list) and v:
                datos = v
                break
    if isinstance(datos, list) and datos and isinstance(datos[0], dict):
        return datos[0].get("id")
    return None


def barrido(c: httpx.Client) -> tuple[list[str], dict]:
    rutas = [r for r in json.loads(FOTO.read_text(encoding="utf-8"))["api"] if r["metodo"] == "GET"]
    fallos, cuenta, ids = [], {"llamadas": 0, "omitidas": 0, "4xx": 0}, {}
    sin_parametros = [r for r in rutas if not r["parametros_ruta"]]
    con_uno = [r for r in rutas if len(r["parametros_ruta"]) == 1]

    def llamar(ruta: str) -> httpx.Response | None:
        try:
            resp = c.get(ruta)
        except httpx.HTTPError as e:
            fallos.append(f"GET {ruta}: sin respuesta ({type(e).__name__})")
            return None
        cuenta["llamadas"] += 1
        if resp.status_code >= 500:
            fallos.append(f"GET {ruta}: {resp.status_code}")
        elif resp.status_code >= 400:
            cuenta["4xx"] += 1
        return resp

    for r in sin_parametros:
        if OMITIR.search(r["ruta"]) or any(r["consulta"].values()):
            cuenta["omitidas"] += 1
            continue
        resp = llamar(r["ruta"])
        if resp is not None and resp.status_code == 200 and "json" in resp.headers.get("content-type", ""):
            ident = _primer_id(resp.json())
            if ident is not None:
                ids[r["ruta"]] = ident

    for r in con_uno:
        base = r["ruta"].split("/{", 1)[0]
        if OMITIR.search(r["ruta"]) or any(r["consulta"].values()) or base not in ids:
            cuenta["omitidas"] += 1
            continue
        ruta = re.sub(r"\{[^}]+\}", str(ids[base]), r["ruta"], count=1)
        llamar(ruta)
    return fallos, cuenta


def main(argv: list[str]) -> int:
    solo = argv[argv.index("--solo") + 1] if "--solo" in argv else ""
    c = cliente()
    errores: list[str] = []
    if solo in ("", "barrido"):
        t = time.monotonic()
        fallos, cuenta = barrido(c)
        print(f"Barrido: {cuenta['llamadas']} consultas ({cuenta['4xx']} con 4xx esperables, "
              f"{cuenta['omitidas']} omitidas) en {time.monotonic() - t:.0f} s; {len(fallos)} fallos.")
        errores += fallos
    if solo in ("", "flujos"):
        from tests import recorrido_flujos

        cuales = set(argv[argv.index("--flujos") + 1].split(",")) if "--flujos" in argv else None
        print("Flujos:")
        errores += recorrido_flujos.correr(c, cuales)
    for e in errores:
        print(f"  FALLA  {e}")
    print("Recorrido en verde." if not errores else f"Recorrido con {len(errores)} fallos.")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    raise SystemExit(main(sys.argv[1:]))

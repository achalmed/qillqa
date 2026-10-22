"""backend/tests/linea_base.py — la foto de lo que hace Qillqa hoy, para que nada se pierda al separar
los módulos en proyectos propios (fase 0 de docs/plataforma/propuesta-repositorios.md, 2026-10-20).

Retrata tres cosas y las guarda en tests/linea_base/funciones.json:

- la API: cada ruta con su método, sus parámetros de dirección y de consulta, los campos de su cuerpo y
  su acceso (público, con sesión, solo administración…), leída de la aplicación real (app.main);
- la web: cada ruta de frontend/src/App.tsx con lo que la guarda (sesión, módulo), y cada módulo de
  frontend/src/navegacion.ts con su ruta, sus opciones y quién lo ve;
- el registro de módulos encendibles (backend/app/servicios/modulos.py): id, prefijos de API y de qué
  depende.

La prueba (tests/test_linea_base.py) exige que lo de la foto siga existiendo igual: puede aparecer algo
nuevo, pero nada desaparece ni cambia de acceso sin que se vea. Cuando un cambio es a propósito
(retirar una ruta, endurecer un acceso), se rehace la foto y el diff del JSON lo deja a la vista:

    cd backend && .venv/bin/python -m tests.linea_base            # muestra lo que cambió
    cd backend && .venv/bin/python -m tests.linea_base --aplicar   # rehace la foto

Sin base de datos: importar la aplicación no conecta.
"""
from __future__ import annotations

import json
import os
import re
import sys
import typing
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

BACKEND = Path(__file__).resolve().parents[1]
FRONTEND = BACKEND.parent / "frontend"
FOTO = Path(__file__).resolve().parent / "linea_base" / "funciones.json"

# Dependencias que deciden quién entra, de la más fuerte a la más débil.
ACCESOS = [
    ("solo_administrador", "administracion"),
    ("usuario_actual", "sesion"),
    ("usuario_con_clave_propia", "sesion"),
    ("usuario_autenticado", "sesion_clave_temporal"),
    ("_interno", "interno"),
]


# --- la API -----------------------------------------------------------------------------------------
def _dependencias(dependant, nombres: set[str]) -> set[str]:
    for sub in dependant.dependencies:
        if sub.call is not None:
            nombres.add(getattr(sub.call, "__name__", type(sub.call).__name__))
        _dependencias(sub, nombres)
    return nombres


def _acceso(nombres: set[str]) -> str:
    for dep, acceso in ACCESOS:
        if dep in nombres:
            return acceso
    return "publico"


def _campos_cuerpo(ruta) -> dict[str, bool]:
    """Campos del cuerpo JSON (nombre → obligatorio). Un cuerpo de formulario o de archivo, igual."""
    campos: dict[str, bool] = {}
    for p in ruta.dependant.body_params:
        anotacion = p.field_info.annotation
        # Un cuerpo opcional (`datos: Modelo | None = None`) también tiene campos que no deben perderse.
        modelos = [a for a in (anotacion, *typing.get_args(anotacion)) if hasattr(a, "model_fields")]
        modelo = modelos[0].model_fields if modelos else None
        if modelo and len(ruta.dependant.body_params) == 1 and not getattr(p.field_info, "embed", False):
            for nombre, campo in modelo.items():
                campos[campo.alias or nombre] = campo.is_required()
        else:
            campos[p.alias] = p.field_info.is_required()
    return campos


def foto_api() -> list[dict]:
    from fastapi.routing import APIRoute, APIWebSocketRoute

    from app.main import app

    rutas = []
    for r in app.routes:
        if isinstance(r, APIRoute):
            d = r.dependant
            for metodo in sorted(r.methods - {"HEAD"}):
                rutas.append({
                    "metodo": metodo,
                    "ruta": r.path,
                    "acceso": _acceso(_dependencias(d, set())),
                    "parametros_ruta": sorted(p.alias for p in d.path_params),
                    "consulta": {p.alias: p.field_info.is_required() for p in d.query_params},
                    "cuerpo": _campos_cuerpo(r),
                })
        elif isinstance(r, APIWebSocketRoute):
            rutas.append({"metodo": "WS", "ruta": r.path, "acceso": _acceso(_dependencias(r.dependant, set())),
                          "parametros_ruta": [], "consulta": {}, "cuerpo": {}})
    return sorted(rutas, key=lambda x: (x["ruta"], x["metodo"]))


# --- la web -----------------------------------------------------------------------------------------
def _manifiestos_web() -> dict[str, str]:
    """NOMBRE → el objeto de `export const NOMBRE = definirModuloWeb({…})` en src/ y en los paquetes enlazados
    (node_modules/@qillqa/*/src: Rikchay desde el 2026-10-21): los manifiestos web de los módulos aislados (Tiqsi
    web, fase 10.2b), de donde Qillqa saca su ruta y su entrada en el menú."""
    salida: dict[str, str] = {}
    enlazados = sorted(p for d in sorted((FRONTEND / "node_modules" / "@qillqa").glob("*/src")) for p in d.rglob("*.ts*"))
    for p in sorted((FRONTEND / "src").rglob("*.ts*")) + enlazados:
        texto = p.read_text(encoding="utf-8")
        for m in re.finditer(r"export const (\w+) = definirModuloWeb\(\{", texto):
            inicio, nivel = m.end() - 1, 0
            for j in range(inicio, len(texto)):
                nivel += {"{": 1, "}": -1}.get(texto[j], 0)
                if nivel == 0:
                    salida[m.group(1)] = texto[inicio:j + 1]
                    break
    return salida


def foto_rutas_web() -> list[dict]:
    texto = (FRONTEND / "src" / "App.tsx").read_text(encoding="utf-8")
    texto = texto[texto.index("<Routes"):texto.index("</Routes>")]
    rutas = []
    for trozo in texto.split("<Route")[1:]:
        ruta = re.search(r'path="([^"]+)"', trozo)
        if not ruta:
            continue
        modulo = re.search(r'<ConModulo\s+id="([^"]+)"', trozo)
        destino = re.search(r'<Navigate\s+to="([^"]+)"', trozo)
        rutas.append({
            "ruta": ruta.group(1),
            "sesion": "<ConSesion" in trozo or "<SoloAdmin" in trozo,
            "solo_admin": "<SoloAdmin" in trozo,
            "modulo": modulo.group(1) if modulo else "",
            "redirige_a": destino.group(1) if destino else "",
        })
    # Las de los módulos por manifiesto (App.tsx: MODULOS_WEB → PANTALLAS_WEB.map), siempre con sesión y su interruptor.
    completo = (FRONTEND / "src" / "App.tsx").read_text(encoding="utf-8")
    lista = re.search(r"const MODULOS_WEB = \[([^\]]*)\]", completo)
    if lista:
        assert re.search(r"PANTALLAS_WEB\.map\([\s\S]*?<ConSesion><ConModulo id=\{modulo\.id", texto), \
            "App.tsx monta los módulos por manifiesto sin <ConSesion><ConModulo>: la foto no sabría qué los guarda"
        manifiestos = _manifiestos_web()
        for nombre in re.findall(r"\w+", lista.group(1)):
            m = manifiestos[nombre]
            # La principal y las de su lista `pantallas` (el detalle «/rendiciones/:id»), con los mismos guardias.
            otras = re.search(r"\bpantallas:\s*\[([\s\S]*?)\]\s*,?\s*\}$", m)
            for ruta in [_cadena("ruta", m)] + (re.findall(r"\bruta:\s*'([^']*)'", otras.group(1)) if otras else []):
                rutas.append({"ruta": ruta, "sesion": True, "solo_admin": False, "modulo": _cadena("id", m), "redirige_a": ""})
            # Sus pantallas PÚBLICAS (`publicas`: la mesa de partes virtual de Punku), sin sesión ni interruptor.
            publicas = re.search(r"\bpublicas:\s*\[([\s\S]*?)\]", m)
            for ruta in re.findall(r"\bruta:\s*'([^']*)'", publicas.group(1)) if publicas else []:
                assert re.search(r"PUBLICAS_WEB\.map\(\(\{ ruta, Pantalla \}\) => <Route key=\{ruta\} path=\{ruta\} element=\{<Pantalla />\} />", texto), \
                    "App.tsx no monta las pantallas públicas de los módulos tal cual: la foto no sabría qué las guarda"
                rutas.append({"ruta": ruta, "sesion": False, "solo_admin": False, "modulo": "", "redirige_a": ""})
    return sorted(rutas, key=lambda x: x["ruta"])


def _cadena(campo: str, texto: str) -> str:
    m = re.search(rf"\b{campo}:\s*'([^']*)'", texto)
    return m.group(1) if m else ""


def foto_menu() -> list[dict]:
    """Cada módulo de MODULOS (navegacion.ts): bloques de primer nivel del arreglo, leídos como texto
    (el archivo importa íconos de MUI y no corre en node sin el empaquetador)."""
    texto = (FRONTEND / "src" / "navegacion.ts").read_text(encoding="utf-8")
    inicio = texto.index("export const MODULOS")
    texto = texto[texto.index("[", texto.index("=", inicio)) + 1:]
    bloques, nivel, actual, region = [], 0, "", ""
    for c in texto:
        if nivel == 0 and c == "]":
            break
        region += c
        if c == "{":
            nivel += 1
        if nivel > 0:
            actual += c
        if c == "}":
            nivel -= 1
            if nivel == 0:
                bloques.append(actual)
                actual = ""
    manifiestos = _manifiestos_web()
    bloques += [manifiestos[n] for n in re.findall(r"desdeManifiesto\((\w+)\)", region)]
    menu = []
    for b in bloques:
        opciones_txt = b[b.index("opciones:"):] if "opciones:" in b else ""
        # En un manifiesto web, tras las opciones vienen `cargar` y sus `pantallas` (rutas, no opciones del menú).
        opciones_txt = opciones_txt.split("cargar:")[0]
        cabecera = b[: b.index("opciones:")] if opciones_txt else b
        roles = re.search(r"\broles:\s*\[([^\]]*)\]", cabecera)
        menu.append({
            "id": _cadena("id", cabecera),
            "ruta": _cadena("ruta", cabecera),
            "solo_admin": bool(re.search(r"\bsoloAdmin:\s*true", cabecera)),
            "roles": sorted(re.findall(r"'([^']+)'", roles.group(1))) if roles else [],
            "oculto": bool(re.search(r"\boculto:\s*true", cabecera)),
            "opciones": sorted(
                ({"ruta": _cadena("ruta", o), "solo_admin": bool(re.search(r"\bsoloAdmin:\s*true", o))}
                 for o in re.findall(r"\{[^{}]*\bruta:[^{}]*\}", opciones_txt)),
                key=lambda x: x["ruta"],
            ),
        })
    return sorted(menu, key=lambda x: x["id"])


# --- el registro de módulos ---------------------------------------------------------------------------
def foto_modulos() -> list[dict]:
    from app.servicios import modulos

    return sorted(
        ({"id": m["id"], "rutas": sorted(m.get("rutas", [])), "requiere": m.get("requiere", ""),
          "publico": bool(m.get("publico"))} for m in modulos.CATALOGO),
        key=lambda x: x["id"],
    )


def _muestra(plantilla: str) -> str:
    """Una dirección concreta para una plantilla de ruta: «/api/x/{id}/y» → «/api/x/1/y»."""
    return re.sub(r"\{[^}:]+:path\}", "a/b", re.sub(r"\{[^}:]+(?::(?!path)[^}]+)?\}", "1", plantilla))


def foto_precedencia() -> list[dict]:
    """Qué ruta ATIENDE cada dirección (fase 10.2, 2026-10-20). Con dos rutas que pueden atender la misma
    dirección gana la que se montó antes: al montar los módulos por el contrato (Tiqsi), el orden puede
    cambiar sin que cambie ninguna ruta. Para cada ruta, una dirección de muestra y la primera ruta que
    la atiende con ese método."""
    from fastapi.routing import APIRoute, APIWebSocketRoute
    from starlette.routing import Match

    from app.main import app

    salida = []
    for r in app.routes:
        if not isinstance(r, (APIRoute, APIWebSocketRoute)):
            continue
        es_ws = isinstance(r, APIWebSocketRoute)
        for metodo in (["WS"] if es_ws else sorted(r.methods - {"HEAD"})):
            muestra = _muestra(r.path)
            alcance = {"type": "websocket" if es_ws else "http", "path": muestra, "root_path": "",
                       "method": "GET" if es_ws else metodo, "headers": [], "query_string": b""}
            quien = next((x.path for x in app.routes if hasattr(x, "matches") and x.matches(alcance)[0] == Match.FULL), "")
            salida.append({"metodo": metodo, "muestra": muestra, "atiende": quien})
    return sorted(salida, key=lambda x: (x["muestra"], x["metodo"]))


def foto() -> dict:
    return {
        "_": "GENERADO por backend/tests/linea_base.py; no editar. Lo que Qillqa hace hoy (fase 0 de "
             "docs/plataforma/propuesta-repositorios.md): la prueba test_linea_base.py exige que siga existiendo.",
        "api": foto_api(),
        "precedencia": foto_precedencia(),
        "web": foto_rutas_web(),
        "menu": foto_menu(),
        "modulos": foto_modulos(),
    }


# --- la comparación -----------------------------------------------------------------------------------
def _sin_perder(nombre: str, antes: dict[str, bool], ahora: dict[str, bool], donde: str) -> list[str]:
    """Campos con obligatorio: ninguno desaparece y ninguno opcional se vuelve obligatorio."""
    faltas = [f"{donde}: ya no acepta el {nombre} «{k}»" for k in antes if k not in ahora]
    faltas += [f"{donde}: el {nombre} «{k}» ahora es obligatorio" for k in ahora
               if ahora[k] and not antes.get(k, False)]
    return faltas


def perdidas(antes: dict, ahora: dict) -> list[str]:
    """Lo que estaba en la foto y ya no está igual. Lo nuevo no cuenta."""
    faltas: list[str] = []

    actual = {(r["metodo"], r["ruta"]): r for r in ahora["api"]}
    for r in antes["api"]:
        clave = (r["metodo"], r["ruta"])
        donde = f"{r['metodo']} {r['ruta']}"
        n = actual.get(clave)
        if n is None:
            faltas.append(f"{donde}: la ruta ya no existe")
            continue
        if n["acceso"] != r["acceso"]:
            faltas.append(f"{donde}: el acceso pasó de «{r['acceso']}» a «{n['acceso']}»")
        if n["parametros_ruta"] != r["parametros_ruta"]:
            faltas.append(f"{donde}: cambiaron los parámetros de la dirección")
        faltas += _sin_perder("parámetro", r["consulta"], n["consulta"], donde)
        faltas += _sin_perder("campo", r["cuerpo"], n["cuerpo"], donde)

    atiende = {(p["metodo"], p["muestra"]): p["atiende"] for p in ahora.get("precedencia", [])}
    for p in antes.get("precedencia", []):
        clave = (p["metodo"], p["muestra"])
        if clave in atiende and atiende[clave] != p["atiende"]:
            faltas.append(f"{p['metodo']} {p['muestra']}: ahora la atiende {atiende[clave]} (antes {p['atiende']})")

    web = {r["ruta"]: r for r in ahora["web"]}
    for r in antes["web"]:
        n = web.get(r["ruta"])
        if n is None:
            faltas.append(f"web {r['ruta']}: la pantalla ya no existe")
        elif n != r:
            faltas.append(f"web {r['ruta']}: cambió lo que la guarda ({r} → {n})")

    menu = {m["id"]: m for m in ahora["menu"]}
    for m in antes["menu"]:
        n = menu.get(m["id"])
        if n is None:
            faltas.append(f"menú «{m['id']}»: el módulo ya no está")
            continue
        for campo in ("ruta", "solo_admin", "roles", "oculto"):
            if n[campo] != m[campo]:
                faltas.append(f"menú «{m['id']}»: cambió {campo} ({m[campo]} → {n[campo]})")
        opciones = {o["ruta"]: o for o in n["opciones"]}
        for o in m["opciones"]:
            if o["ruta"] not in opciones:
                faltas.append(f"menú «{m['id']}»: ya no ofrece {o['ruta']}")
            elif opciones[o["ruta"]] != o:
                faltas.append(f"menú «{m['id']}»: cambió quién ve {o['ruta']}")

    registro = {m["id"]: m for m in ahora["modulos"]}
    for m in antes["modulos"]:
        n = registro.get(m["id"])
        if n is None:
            faltas.append(f"módulo «{m['id']}»: ya no se puede encender ni apagar")
        else:
            faltas += [f"módulo «{m['id']}»: el apagado ya no cubre {p}" for p in m["rutas"] if p not in n["rutas"]]
            if n["requiere"] != m["requiere"] or n["publico"] != m["publico"]:
                faltas.append(f"módulo «{m['id']}»: cambió de qué depende o si es público")
    return faltas


def leer() -> dict:
    return json.loads(FOTO.read_text(encoding="utf-8"))


def escribir(datos: dict) -> None:
    """Una línea por ruta, pantalla o módulo: el diff de un cambio se lee de un vistazo."""
    def linea(x) -> str:
        return json.dumps(x, ensure_ascii=False, separators=(", ", ": "))

    partes = ["{", f' "_": {linea(datos["_"])},']
    claves = [k for k in datos if k != "_"]
    for i, clave in enumerate(claves):
        filas = ",\n".join(f"  {linea(x)}" for x in datos[clave])
        partes.append(f' "{clave}": [\n{filas}\n ]' + ("," if i < len(claves) - 1 else ""))
    partes.append("}")
    FOTO.parent.mkdir(parents=True, exist_ok=True)
    FOTO.write_text("\n".join(partes) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    ahora = foto()
    if not FOTO.exists():
        print("No hay foto todavía; con --aplicar se crea.")
        if "--aplicar" in argv:
            escribir(ahora)
            print(f"Escrita: {FOTO.relative_to(BACKEND)}")
        return 0
    antes = leer()
    faltas = perdidas(antes, ahora)
    nuevas = {(r["metodo"], r["ruta"]) for r in ahora["api"]} - {(r["metodo"], r["ruta"]) for r in antes["api"]}
    print(f"API: {len(antes['api'])} rutas en la foto, {len(ahora['api'])} hoy ({len(nuevas)} nuevas).")
    print(f"Web: {len(ahora['web'])} pantallas · menú: {len(ahora['menu'])} módulos · registro: {len(ahora['modulos'])}.")
    for f in faltas:
        print(f"  PIERDE  {f}")
    for metodo, ruta in sorted(nuevas, key=lambda x: (x[1], x[0])):
        print(f"  NUEVA   {metodo} {ruta}")
    if "--aplicar" in argv:
        escribir(ahora)
        print(f"Foto rehecha: {FOTO.relative_to(BACKEND)} (revisar el diff antes del commit).")
    elif faltas:
        print("Si es a propósito, rehacer la foto con --aplicar y explicarlo en el commit.")
    return 1 if faltas and "--aplicar" not in argv else 0


if __name__ == "__main__":
    sys.path.insert(0, str(BACKEND))
    raise SystemExit(main(sys.argv[1:]))

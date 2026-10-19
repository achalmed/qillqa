"""scripts/colab_ida_y_vuelta.py — prueba de ida y vuelta de la edición simultánea (fase 5, paso 5.3).

Toma de la base (solo LECTURA) todo el texto TipTap que existe —las partes de los proyectos con
cada versión guardada y el cuerpo de cada documento nacido en el SGDP— y lo pasa por el mismo
transformador del servidor de colaboración (frontend/colab/ida_y_vuelta.ts): JSON → Yjs → JSON.
Criterios del diseño (docs/plataforma/fase-5-edicion-simultanea.md §6):

  1. el documento de vuelta es idéntico al original tal como los ve el editor al cargarlos
     (Yjs no guarda atributos que valen null; ProseMirror los repone con su valor por omisión);
  2. el LaTeX del JSON de vuelta es idéntico al del JSON guardado (serializador real).

Uso (desde la raíz de sgdp):
  backend/.venv/bin/python scripts/colab_ida_y_vuelta.py               # base del .env
  backend/.venv/bin/python scripts/colab_ida_y_vuelta.py --base sgdp_prueba
Sale con 0 si todo pasa y con 1 si algo difiere (lo lista).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "solo-lectura")

from app.latex.serializador import cuerpo_a_latex  # noqa: E402
from app.servicios.colab import estable  # noqa: E402


def _env() -> dict[str, str]:
    datos = {}
    for linea in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.lstrip().startswith("#"):
            k, v = linea.split("=", 1)
            datos[k.strip()] = v.strip().strip('"').strip("'")
    return datos


def _consulta(base: str, usuario: str, sql: str) -> list[dict]:
    salida = subprocess.run(
        ["docker", "compose", "exec", "-T", "db", "psql", "-U", usuario, "-d", base, "-At", "-c", sql],
        cwd=RAIZ, capture_output=True, text=True, check=True,
    ).stdout.strip()
    return json.loads(salida) if salida else []


def _ida_y_vuelta(esquema: str, items: list[dict]) -> list[dict]:
    r = subprocess.run(
        ["node", "colab/ida_y_vuelta.ts"], cwd=RAIZ / "frontend",
        input=json.dumps({"esquema": esquema, "items": items}), capture_output=True, text=True, check=True,
    )
    return json.loads(r.stdout)


def main() -> int:
    env = _env()
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default=env.get("POSTGRES_DB", "sgdp"))
    args = ap.parse_args()
    usuario = env.get("POSTGRES_USER", "sgdp")

    corpus = {
        "parte": _consulta(args.base, usuario, """
            SELECT coalesce(json_agg(x), '[]') FROM (
              SELECT 'pl' || s.proyecto_id || ':' || s.clave || ':vigente' AS id, s.contenido
                FROM proyecto_secciones s WHERE s.contenido ? 'type'
              UNION ALL
              SELECT 'pl' || s.proyecto_id || ':' || s.clave || ':v' || v.version, v.contenido
                FROM proyecto_seccion_versiones v JOIN proyecto_secciones s ON s.id = v.seccion_id
               WHERE v.contenido ? 'type') x"""),
        "documento": _consulta(args.base, usuario, """
            SELECT coalesce(json_agg(x), '[]') FROM (
              SELECT 'doc' || id || ':' || tipo AS id, cuerpo AS contenido
                FROM documentos WHERE cuerpo ? 'type') x"""),
    }
    fallas: list[str] = []
    cuenta: Counter = Counter()
    for esquema, items in corpus.items():
        if not items:
            continue
        originales = {x["id"]: x["contenido"] for x in items}
        for r in _ida_y_vuelta(esquema, items):
            cuenta[esquema] += 1
            if r["error"]:
                fallas.append(f"{r['id']}: el editor no puede cargarlo ({r['error'][:120]})")
                continue
            if estable(r["vuelta_editor"]) != estable(r["normalizado"]):
                fallas.append(f"{r['id']}: el documento de vuelta difiere del original en el editor")
            elif estable(r["vuelta"]) == estable(originales[r["id"]]):
                cuenta[esquema + ":idéntico al guardado"] += 1
            if cuerpo_a_latex(r["vuelta"]) != cuerpo_a_latex(originales[r["id"]]):
                fallas.append(f"{r['id']}: el LaTeX de vuelta difiere del guardado")

    print(f"Base «{args.base}»: {cuenta['parte']} textos de partes (con versiones), {cuenta['documento']} cuerpos de documentos.")
    print(f"  JSON idéntico byte a byte al guardado: {cuenta['parte:idéntico al guardado']} partes, "
          f"{cuenta['documento:idéntico al guardado']} documentos (el resto difiere solo en atributos por omisión, que el editor repone).")
    if fallas:
        print(f"FALLAN {len(fallas)}:")
        for f in fallas:
            print("  -", f)
        return 1
    print("Ida y vuelta exacta: el mismo documento en el editor y el mismo LaTeX en todos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

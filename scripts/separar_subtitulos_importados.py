#!/usr/bin/env python3
"""scripts/separar_subtitulos_importados.py — separa los subtítulos que la importación de un proyecto de ley fundió con la primera frase de su párrafo.

Hallado en la revisión del PDF de PL-2026-001 (2026-10-01): en siete apartados de la exposición
(I.4, I.9, I.9.2, I.9.3, I.9.4, I.13, I.15) el subtítulo se tragó el comienzo del párrafo
siguiente («I.13. Responsabilidad de personas jurídicas… Las operaciones sofisticadas de
manipulación digital suelen ejecutarse a través de»), y el párrafo quedó empezando a media frase.
La referencia es el PDF PRESENTADO: un subtítulo solo se corta donde termina el suyo en el original,
y lo sobrante vuelve al comienzo del párrafo que sigue. Cada parte corregida se guarda como una
VERSIÓN nueva con nota (la historia no se reescribe), por la API, como la web.

Uso (simula por omisión; --aplicar guarda):
  QILLQA_API=http://127.0.0.1:8000 QILLQA_USUARIO=… QILLQA_CLAVE=… \\
    python3 scripts/separar_subtitulos_importados.py <id del proyecto> <PDF presentado> [--aplicar]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

RE_SUBTITULO = re.compile(r"^\s*([IVX]+(?:\.\d+)+\.?\s+\S.*?)\s*$")
MIN_PALABRAS_SOBRANTES = 6  # «… restricción de» + «contenido» no es una frase tragada


def subtitulos_del_original(pdf: Path) -> list[str]:
    texto = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    return [" ".join(m.group(1).split()) for linea in texto.splitlines() if (m := RE_SUBTITULO.match(linea))]


def plano(nodo: dict) -> str:
    if nodo.get("type") == "text":
        return nodo.get("text", "")
    return "".join(plano(h) for h in nodo.get("content", []) or [])


def corregir(contenido: dict, originales: list[str]) -> tuple[dict, list[str]]:
    """(contenido corregido, lista de cambios). Puro: no toca la red."""
    nodos = list(contenido.get("content", []) or [])
    cambios: list[str] = []
    i = 0
    while i < len(nodos):
        n = nodos[i]
        if n.get("type") == "heading":
            texto = " ".join(plano(n).split())
            suyo = max((o for o in originales if texto.startswith(o) and len(texto) > len(o)), key=len, default="")
            sobra = texto[len(suyo):].strip()
            if suyo and len(sobra.split()) >= MIN_PALABRAS_SOBRANTES:
                nodos[i] = {**n, "content": [{"type": "text", "text": suyo}]}
                siguiente = nodos[i + 1] if i + 1 < len(nodos) else None
                if siguiente and siguiente.get("type") == "paragraph":
                    hijos = list(siguiente.get("content", []) or [])
                    nodos[i + 1] = {**siguiente, "content": [{"type": "text", "text": sobra + " "}, *hijos]}
                else:
                    nodos.insert(i + 1, {"type": "paragraph", "content": [{"type": "text", "text": sobra}]})
                cambios.append(f"«{suyo}»  ←  devuelve al párrafo: «{sobra[:70]}…»")
        i += 1
    return {**contenido, "content": nodos}, cambios


class Api:
    def __init__(self, base: str, usuario: str, clave: str):
        self.base = base.rstrip("/")
        self.token = ""
        self.token = self.pedir("/api/auth/login", {"usuario": usuario, "clave": clave}, "POST")["token"]

    def pedir(self, ruta: str, cuerpo: dict | None = None, metodo: str = "GET") -> dict:
        r = urllib.request.Request(
            self.base + ruta, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
            headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {self.token}"} if self.token else {})},
        )
        try:
            with urllib.request.urlopen(r, timeout=60) as x:
                return json.loads(x.read() or b"{}")
        except urllib.error.HTTPError as e:
            sys.exit(f"La API respondió {e.code} en {ruta}: {e.read().decode()[:300]}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("proyecto", type=int)
    ap.add_argument("pdf", type=Path, help="el PDF presentado (la referencia de los subtítulos)")
    ap.add_argument("--aplicar", action="store_true", help="guardar (sin esto, solo muestra qué cambiaría)")
    a = ap.parse_args()
    originales = subtitulos_del_original(a.pdf)
    api = Api(os.environ.get("QILLQA_API", "http://127.0.0.1:8000"), os.environ["QILLQA_USUARIO"], os.environ["QILLQA_CLAVE"])
    p = api.pedir(f"/api/proyectos/{a.proyecto}")
    total = 0
    for s in p["secciones"]:
        nuevo, cambios = corregir(s.get("contenido") or {}, originales)
        if not cambios:
            continue
        total += len(cambios)
        print(f"\n{s['titulo']} (v{s['version']}):")
        for c in cambios:
            print("  ", c)
        if a.aplicar:
            cuerpo = {"contenido": nuevo, "version_base": s["version"], "nota": "Corrección de importación: subtítulos separados de su primera frase (como en el PDF presentado)"}
            if p.get("colaboracion"):
                cuerpo["generacion"] = s["generacion"]
            r = api.pedir(f"/api/proyectos/{a.proyecto}/secciones/{s['clave']}", cuerpo, "PUT")
            print(f"   → guardada como v{r['version']}")
    print(f"\n{total} subtítulo(s) {'corregido(s)' if a.aplicar else 'por corregir (simulación; --aplicar guarda)'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

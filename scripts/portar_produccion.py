#!/usr/bin/env python3
"""scripts/portar_produccion.py — que nada de producción se pierda en la migración, hasta el corte (fase 10.6).

Producción sigue recibiendo arreglos mientras la plataforma se arma en el verde (`docs/plataforma/propuesta-repositorios.md`
§7.2, «cada arreglo se anota para llevarlo también a la versión nueva»). Este guion lista los commits de
`produccion/main` (el remoto de solo lectura de esta copia) que aún no están en el verde y, por cada archivo que
cambian, dice a qué repositorio y a qué ruta se movió: lo que se quedó en Qillqa (con sus renombres internos) y lo que
salió a un proyecto hermano según la tabla «De Qillqa a X: dónde quedó cada archivo» del README de cada uno.

Un commit está portado si ya está en la historia del verde (una fusión de `produccion/main`) o si algún commit del
verde o de un proyecto hermano lleva la línea `Porta: produccion <hash>` (de 7 caracteres o más) en su mensaje.

Uso (simula por defecto: no escribe en ningún repo):
  python3 scripts/portar_produccion.py                    trae `produccion` y lista lo que falta portar, con el reparto
  python3 scripts/portar_produccion.py <hash>             el reparto de ese commit y el ensayo de su parche en cada repo
  python3 scripts/portar_produccion.py <hash> --aplicar   aplica el parche (con las rutas traducidas) en la copia de
                                                    trabajo de cada repo, sin commit; lo que no entra queda en .rej
  --sin-traer                                       no hace `git fetch produccion`
Si nada salió de Qillqa, `git merge produccion/main` sigue siendo lo más simple (y deja la historia); los commits que
tocan archivos movidos se portan con `<hash> --aplicar` y un commit por repo con `Porta: produccion <hash>`.
Producción con cambios SIN commit (alguien trabajando): se avisa y no se toca; se portan cuando se confirmen.
Salida: 0 nada pendiente · 1 hay commits por portar o un parche no entra · 2 error de uso o de entorno.
"""
from __future__ import annotations

import argparse
import fnmatch
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ESPACIO = RAIZ.parent                      # los proyectos hermanos viven junto al verde
REMOTO = "produccion"
RAMA = f"{REMOTO}/main"
RAICES = ("backend/", "frontend/", "marco_documental/", "estudio/", "docs/", "scripts/", "sistema/")
TITULO_TABLA = re.compile(r"^## De (.+) a (.+): dónde quedó cada archivo")
# La marca se llamó «Porta: sgdp <hash>» hasta el 2026-10-22 (los commits ya marcados se reconocen igual).
PORTA = re.compile(r"^Porta: (?:produccion|sgdp) ([0-9a-f]{7,40})\b", re.M)
TOKEN = re.compile(r"[A-Za-z0-9_.*/-]+(?:\.[A-Za-z0-9]+|/)")


def git(repo: Path, *args: str, ok: bool = False) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if r.returncode != 0 and not ok:
        raise SystemExit(f"git {' '.join(args)} en {repo.name}: {r.stderr.strip()}")
    return r.stdout


# --- las tablas «De Qillqa a X» --------------------------------------------------------------------------------


@dataclass
class Fila:
    origen: str                  # repo de donde salió (qillqa, ruray…)
    izquierda: list[str]         # rutas completas (archivo, carpeta con / o comodín)
    derecha: list[str]           # rutas en el repo destino
    misma_ruta: bool = False


@dataclass
class Repo:
    nombre: str
    ruta: Path
    filas: list[Fila] = field(default_factory=list)
    _archivos: set[str] | None = None

    @property
    def archivos(self) -> set[str]:
        if self._archivos is None:
            self._archivos = set(git(self.ruta, "ls-files").splitlines())
        return self._archivos

    def existe(self, ruta: str) -> bool:
        return ruta in self.archivos or any(a.startswith(ruta.rstrip("/") + "/") for a in self.archivos)


def _completar(tokens: list[str], conocidas: set[str]) -> list[str]:
    """`backend/app/api/a.py, b.py, servicios/c.py` → rutas completas: cada token sin raíz se prueba contra la
    carpeta del anterior y sus antepasadas, y gana la primera que existió alguna vez."""
    salida: list[str] = []
    for t in tokens:
        if t.startswith(RAICES) or not salida:
            salida.append(t)
            continue
        base = salida[-1].rstrip("/").rsplit("/", 1)[0] if "/" in salida[-1].rstrip("/") else ""
        candidatas = []
        while True:
            candidatas.append(f"{base}/{t}" if base else t)
            if not base:
                break
            base = base.rsplit("/", 1)[0] if "/" in base else ""
        elegida = next((c for c in candidatas if any(fnmatch.fnmatch(k, c) or k.startswith(c.rstrip("/") + "/")
                                                   or k == c for k in conocidas)), candidatas[0])
        salida.append(elegida)
    return salida


def leer_tabla(readme: Path, conocidas: set[str]) -> list[Fila]:
    filas, dentro = [], False
    for linea in readme.read_text(encoding="utf-8").splitlines():
        if TITULO_TABLA.match(linea):
            dentro = True
            continue
        if dentro and linea.startswith("## "):
            break
        if not dentro or not linea.startswith("|") or set(linea) <= set("|-: "):
            continue
        celdas = [c.strip() for c in linea.strip("|").split("|")]
        if len(celdas) < 2 or "`" not in celdas[1]:
            continue                              # la cabecera
        izq, der = celdas[0], celdas[1]
        origen = "qillqa"
        m = re.match(r"^(\w+):\s*", izq)
        if m:
            origen, izq = m.group(1).lower(), izq[m.end():]
        izq = re.sub(r"\([^)]*\)", "", izq)
        misma = bool(re.search(r"\(mism[ao] (ruta|estructura)\)", der))
        derecha = re.findall(r"`([^`]+)`", re.sub(r"\([^)]*\)", "", der))   # lo del paréntesis es una nota
        filas.append(Fila(origen, _completar(TOKEN.findall(izq), conocidas), derecha, misma_ruta=misma))
    return filas


def repos_hermanos() -> dict[str, Repo]:
    repos = {"qillqa": Repo("qillqa", RAIZ)}
    conocidas = set(git(RAIZ, "log", "--all", "--name-only", "--format=").splitlines())
    for readme in sorted(ESPACIO.glob("*/README.md")):
        texto = readme.read_text(encoding="utf-8", errors="replace")
        if not any(TITULO_TABLA.match(l) for l in texto.splitlines()) or not (readme.parent / ".git").exists():
            continue
        if readme.parent.resolve() == RAIZ:
            continue
        r = Repo(readme.parent.name, readme.parent)
        # lo que vino de un hermano (Ruray: estudio/…) se completa contra los archivos de ese hermano
        r.filas = leer_tabla(readme, conocidas | set(git(readme.parent, "log", "--all", "--name-only",
                                                           "--format=").splitlines()))
        repos[r.nombre] = r
    for r in list(repos.values()):                # lo de Ruray, completado contra Ruray
        for f in r.filas:
            if f.origen != "qillqa" and f.origen in repos:
                f.izquierda = _completar(f.izquierda, repos[f.origen].archivos)
    return repos


def _destino(fila: Fila, ruta: str) -> str | None:
    """Dónde quedó `ruta` según una fila, o None si la fila no la nombra."""
    for i, izq in enumerate(fila.izquierda):
        resto = None
        if izq.endswith("/") and ruta.startswith(izq):
            resto = ruta[len(izq):]
        elif ruta == izq or fnmatch.fnmatch(ruta, izq):
            resto = ""
        if resto is None:
            continue
        if len(fila.derecha) == len(fila.izquierda) and len(fila.derecha) > 1:
            der = fila.derecha[i]
            if "/" not in der.rstrip("/"):        # `rikchay/config.py`, `db.py` → rikchay/db.py
                previa = next(d for d in reversed(fila.derecha[:i + 1]) if "/" in d.rstrip("/"))
                der = previa.rsplit("/", 1)[0] + "/" + der
        else:
            der = fila.derecha[min(i, len(fila.derecha) - 1)]
        if not der.endswith("/"):
            return der + resto if izq.endswith("/") else der
        if fila.misma_ruta:                       # `web/src/` (misma ruta): lo que sigue a «src/» en el original
            ancla = der.rstrip("/").rsplit("/", 1)[-1] + "/"
            if ancla in ruta:
                return der + ruta.split(ancla, 1)[1]
            base = fila.izquierda[0] if fila.izquierda[0].endswith("/") else fila.izquierda[0].rsplit("/", 1)[0] + "/"
            return der + (ruta[len(base):] if ruta.startswith(base) else ruta.rsplit("/", 1)[-1])
        return der + (resto if izq.endswith("/") else ruta.rsplit("/", 1)[-1])
    return None


def renombres_del_verde() -> dict[str, str]:
    """Los renombres que el verde hizo dentro de sí mismo (en orden), para seguir un archivo de producción."""
    salida = git(RAIZ, "log", "--reverse", "-M", "--diff-filter=R", "--name-status", "--format=", f"{RAMA}..HEAD")
    mapa: dict[str, str] = {}
    for linea in salida.splitlines():
        partes = linea.split("\t")
        if len(partes) == 3 and partes[0].startswith("R"):
            viejo, nuevo = partes[1], partes[2]
            for k, v in list(mapa.items()):
                if v == viejo:
                    mapa[k] = nuevo
            mapa.setdefault(viejo, nuevo)
    return mapa


def ubicar(ruta: str, repos: dict[str, Repo], renombres: dict[str, str]) -> tuple[str, str, str]:
    """(repo, ruta, cómo se supo) para un archivo de producción."""
    actual = ("qillqa", renombres.get(ruta, ruta))
    for _ in range(4):                            # Qillqa → Ruray → Tullpu, como mucho
        nombre, r = actual
        if repos[nombre].existe(r):
            return nombre, r, "tabla" if nombre != "qillqa" else ("renombrado" if r != ruta else "igual")
        candidatos = [(dest.nombre, d) for dest in repos.values() for f in dest.filas if f.origen == nombre
                      for d in [_destino(f, r)] if d]
        if not candidatos:
            break
        # Gana la fila que lleva a un archivo que existe (una fila amplia de un repo no le quita la suya a otro).
        actual = next((c for c in candidatos if repos[c[0]].existe(c[1])), candidatos[0])
    if actual != ("qillqa", ruta):
        return actual[0], actual[1], "según la tabla, pero allí no existe: revisar"
    base = ruta.rsplit("/", 1)[-1]               # último recurso: el mismo nombre en un solo lugar
    hallados = [(n, a) for n, rp in repos.items() for a in rp.archivos if a.rsplit("/", 1)[-1] == base]
    if len(hallados) == 1:
        return hallados[0][0], hallados[0][1], "por nombre: revisar"
    return "?", ruta, "sin destino conocido (¿archivo nuevo o retirado?)"


# --- lo portado ------------------------------------------------------------------------------------------------


def portados(repos: dict[str, Repo]) -> set[str]:
    marcas: set[str] = set()
    for r in repos.values():
        marcas |= set(PORTA.findall(git(r.ruta, "log", "--all", "--format=%B", ok=True)))
    return marcas


def pendientes(marcas: set[str]) -> list[tuple[str, str]]:
    filas = git(RAIZ, "log", "--reverse", "--no-merges", "--format=%H %s", f"HEAD..{RAMA}").splitlines()
    salida = []
    for f in filas:
        h, asunto = f.split(" ", 1)
        if not any(h.startswith(m) for m in marcas):
            salida.append((h, asunto))
    return salida


def archivos_del_commit(h: str) -> list[str]:
    return [l for l in git(RAIZ, "show", "--format=", "--name-only", h).splitlines() if l]


def sin_commit_en_produccion() -> list[str]:
    url = git(RAIZ, "remote", "get-url", REMOTO).strip()
    ruta = Path(url)
    if not ruta.is_dir():
        return []
    return [l[3:] for l in git(ruta, "status", "--porcelain").splitlines()]


# --- el parche, con las rutas traducidas ---------------------------------------------------------------------------


def parche_por_repo(h: str, repos: dict[str, Repo], renombres: dict[str, str]) -> dict[str, str]:
    reparto: dict[str, list[tuple[str, str]]] = {}
    for a in archivos_del_commit(h):
        nombre, destino, _ = ubicar(a, repos, renombres)
        if nombre != "?":
            reparto.setdefault(nombre, []).append((a, destino))
    salida = {}
    for nombre, pares in reparto.items():
        texto = git(RAIZ, "show", "--format=", "--binary", h, "--", *[a for a, _ in pares])
        for viejo, nuevo in pares:
            texto = re.sub(rf"(^diff --git a/){re.escape(viejo)}( b/){re.escape(viejo)}$",
                           rf"\g<1>{nuevo}\g<2>{nuevo}", texto, flags=re.M)
            texto = re.sub(rf"^(--- a/|\+\+\+ b/){re.escape(viejo)}$", rf"\g<1>{nuevo}", texto, flags=re.M)
        salida[nombre] = texto
    return salida


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("commit", nargs="?")
    ap.add_argument("--aplicar", action="store_true")
    ap.add_argument("--sin-traer", action="store_true")
    a = ap.parse_args()
    if a.aplicar and not a.commit:
        print("--aplicar va con un commit: se porta uno por vez.", file=sys.stderr)
        return 2
    if not a.sin_traer:
        git(RAIZ, "fetch", "--quiet", "--no-prune", "--no-prune-tags", REMOTO)
    repos = repos_hermanos()
    renombres = renombres_del_verde()

    sucios = sin_commit_en_produccion()
    if sucios:
        print(f"⚠ Producción tiene {len(sucios)} archivo(s) sin commit (alguien trabaja): no se tocan; "
              "se portan cuando se confirmen.")
        for s in sucios:
            print(f"    {s}")

    if not a.commit:
        lista = pendientes(portados(repos))
        if not lista:
            print(f"Nada por portar: el verde tiene todo {RAMA}.")
            return 0
        print(f"{len(lista)} commit(s) de producción por portar (del más viejo al más nuevo):")
        for h, asunto in lista:
            print(f"\n{h[:7]}  {asunto}")
            for f in archivos_del_commit(h):
                nombre, destino, como = ubicar(f, repos, renombres)
                flecha = f"{nombre}:{destino}" if destino != f or nombre != "qillqa" else "qillqa (igual)"
                print(f"    {f}\n        → {flecha}" + (f"   [{como}]" if como not in ("igual", "tabla") else ""))
        print("\nSi todo cae en «qillqa (igual)»: git merge produccion/main (con «Porta: produccion <hash>» en el mensaje).\n"
              "Si no: scripts/portar_produccion.py <hash> para ensayarlo y --aplicar para llevarlo a cada repo.")
        return 1

    h = git(RAIZ, "rev-parse", "--verify", f"{a.commit}^{{commit}}").strip()
    print(f"{h[:7]}  {git(RAIZ, 'log', '-1', '--format=%s', h).strip()}")
    falla = False
    for nombre, texto in parche_por_repo(h, repos, renombres).items():
        repo = repos[nombre].ruta
        ensayo = subprocess.run(["git", "-C", str(repo), "apply", "--check", "-"], input=texto, text=True,
                                capture_output=True)
        estado = "entra limpio" if ensayo.returncode == 0 else "NO entra limpio:\n      " + ensayo.stderr.strip().replace("\n", "\n      ")
        print(f"  {nombre}: {estado}")
        if a.aplicar:
            r = subprocess.run(["git", "-C", str(repo), "apply", "--reject", "--whitespace=nowarn", "-"],
                               input=texto, text=True, capture_output=True)
            print(f"    aplicado en la copia de trabajo de {nombre}" if r.returncode == 0 else
                  f"    aplicado a medias en {nombre}: resolver los .rej\n      {r.stderr.strip()}")
            falla |= r.returncode != 0
        else:
            falla |= ensayo.returncode != 0
    if a.aplicar:
        print(f"\nRevisar, probar y hacer un commit por repo con la línea «Porta: produccion {h[:7]}».")
    else:
        print("\n(simulación: nada escrito; --aplicar lo lleva a las copias de trabajo)")
    return 1 if falla else 0


if __name__ == "__main__":
    sys.exit(main())

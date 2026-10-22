"""La ficha «Acerca de Qillqa» del lado del servidor (2026-10-19).

Edison: «su ventanita de versión, como la que tienen los programas: la versión, el enlace de GitHub
del demo y de su página, las versiones de los programas usados, el autor». Los datos fijos del
proyecto (nombre, autor, enlaces, licencia) los pone la web, que los necesita aun sin servidor;
aquí solo se arma lo que la web no puede saber: con qué versión del código arrancó la API y qué
programas tiene la computadora que la corre.

Todo se averigua UNA vez (al importar el módulo y en la primera consulta): `lualatex --version` o
`soffice --version` tardan, y lo instalado no cambia sin reiniciar. Un programa ausente o que no
responde sale como `None`; la ficha nunca falla por él.
"""

from __future__ import annotations

import platform
import re
import subprocess
from datetime import datetime, timezone
from functools import lru_cache
from importlib import metadata
from pathlib import Path

VERSION = "0.2.0"

# Raíz del repositorio (backend/app/servicios/acerca.py → tres niveles arriba de app/).
RAIZ = Path(__file__).resolve().parents[3]

# Paquetes de Python que se muestran, con su nombre en la ficha.
PAQUETES = (
    ("FastAPI", "fastapi"),
    ("Uvicorn", "uvicorn"),
    ("SQLAlchemy", "sqlalchemy"),
    ("asyncpg", "asyncpg"),
    ("Pydantic", "pydantic"),
    ("Pillow", "pillow"),
)

# Programas externos: (nombre, orden, expresión que saca la versión de su salida).
PROGRAMAS = (
    ("LuaLaTeX", ["lualatex", "--version"], r"Version\s+([\d.]+)(?:.*?\(TeX Live (\d{4}))?"),
    ("Biber", ["biber", "--version"], r"biber version:\s*([\d.]+)"),
    ("LibreOffice", ["soffice", "--version"], r"LibreOffice\s+([\d.]+)"),
    ("Poppler", ["pdftoppm", "-v"], r"pdftoppm version\s+([\d.]+)"),
)


def _orden(args: list[str], cwd: Path | None = None, espera: float = 8.0) -> str | None:
    """Salida (stdout + stderr) de una orden, o None si no existe, falla o tarda."""
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=espera, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    return (r.stdout or "") + (r.stderr or "")


def version_de_salida(salida: str | None, patron: str) -> str | None:
    """La versión que `patron` encuentra en la salida; con un segundo grupo (TeX Live), entre paréntesis."""
    if not salida:
        return None
    m = re.search(patron, salida, re.S)
    if not m:
        return None
    grupos = [g for g in m.groups() if g]
    if len(grupos) > 1:
        return f"{grupos[0]} (TeX Live {grupos[1]})"
    return grupos[0]


def _codigo() -> dict[str, str | None]:
    """El commit con que arrancó la API (sin .git, como en Docker, ambos None)."""
    salida = _orden(["git", "log", "-1", "--format=%h%n%cI"], cwd=RAIZ, espera=3.0)
    if not salida:
        return {"commit": None, "fecha": None}
    commit, _, fecha = salida.strip().partition("\n")
    return {"commit": commit or None, "fecha": fecha or None}


# Al importar = al arrancar la API: así la ficha dice el código que de verdad corre, aunque luego
# haya commits nuevos sin reiniciar (comparar con el de la web delata una API sin reiniciar).
CODIGO = _codigo()
ARRANQUE = datetime.now(timezone.utc).isoformat(timespec="seconds")


@lru_cache(maxsize=1)
def componentes_locales() -> tuple[tuple[str, str | None], ...]:
    """Python, sus paquetes y los programas externos, con su versión (None si falta)."""
    filas: list[tuple[str, str | None]] = [("Python", platform.python_version())]
    for nombre, paquete in PAQUETES:
        try:
            filas.append((nombre, metadata.version(paquete)))
        except metadata.PackageNotFoundError:
            filas.append((nombre, None))
    for nombre, args, patron in PROGRAMAS:
        filas.append((nombre, version_de_salida(_orden(args), patron)))
    return tuple(filas)


def ficha(postgres: str | None) -> dict:
    """La ficha completa del servidor, con la versión de PostgreSQL que consultó el endpoint."""
    componentes = [{"nombre": n, "version": v} for n, v in componentes_locales()]
    componentes.insert(1, {"nombre": "PostgreSQL", "version": postgres})
    return {
        "version": VERSION,
        "commit": CODIGO["commit"],
        "fecha_commit": CODIGO["fecha"],
        "arranque": ARRANQUE,
        "sistema": f"{platform.system()} {platform.release()}",
        "componentes": componentes,
    }

"""El generador del Informe de Semana de Representación, lanzado desde la web (2026-10-02).

No se reimplementa nada: se lanza el MISMO `representacion/generar.sh` de la entidad,
que carga el `.env` de la entidad (MDD_RUTA, MDD_PERFIL, ISR_TOKENS…) y llama a
`marco_documental/generadores/informe-sr/main.py`; así la web y la terminal generan
igual. El generador necesita jinja2, matplotlib y Pillow, que la API no instala: su
`python3` es el de ISR_PYTHON (se antepone su carpeta al PATH; el arranque automático
no trae el PATH de la sesión). Sin `generar.sh` (otra instalación), se llama a
`main.py` directamente con MDD_RUTA e ISR_RAIZ. Compila con `build.sh`, como manda el marco.

Una semana se genera de a una: dos pulsaciones seguidas de «Generar» escribirían
la misma carpeta `editables/` a la vez.
"""

from __future__ import annotations

import asyncio
import os
import re
import shutil
from pathlib import Path

from app.config import config

ESPERA = 900  # segundos: el ISR-01 con 27 fotos tarda unos tres minutos en frío
_CANDADOS: dict[str, asyncio.Lock] = {}
RE_PDF = re.compile(r"^== PDF: (.+?\.pdf)", re.M)
DEPENDENCIAS = "import jinja2, matplotlib, PIL, yaml"


class ErrorGenerador(RuntimeError):
    pass


def candado(carpeta: str) -> asyncio.Lock:
    return _CANDADOS.setdefault(carpeta, asyncio.Lock())


def principal() -> Path:
    return Path(config.mdd_ruta) / "generadores" / "informe-sr" / "main.py"


def _interprete() -> str:
    return shutil.which(config.isr_python) or config.isr_python


def _orden(raiz: Path, argumentos: list[str]) -> list[str]:
    """Por `generar.sh` de la entidad si está (carga su .env); si no, `main.py` directo."""
    envoltorio = raiz / "generar.sh"
    if envoltorio.is_file():
        return ["bash", str(envoltorio), *argumentos]
    return [_interprete(), str(principal()), *argumentos]


async def _ejecutar(orden: list[str], raiz: Path, espera: int = ESPERA) -> tuple[int, str]:
    entorno = dict(os.environ, MDD_RUTA=config.mdd_ruta, ISR_RAIZ=str(raiz), PYTHONUNBUFFERED="1")
    carpeta_python = str(Path(_interprete()).parent)
    if Path(carpeta_python).is_dir():
        entorno["PATH"] = f"{carpeta_python}{os.pathsep}{entorno.get('PATH', '')}"
    try:
        proceso = await asyncio.create_subprocess_exec(
            *orden, cwd=str(raiz), env=entorno,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
    except FileNotFoundError:
        raise ErrorGenerador(
            f"No se encuentra el intérprete «{config.isr_python}». Defina ISR_PYTHON en el .env "
            "con un python que tenga jinja2, matplotlib y Pillow (el mismo de generar.sh)."
        )
    try:
        salida, _ = await asyncio.wait_for(proceso.communicate(), timeout=espera)
    except asyncio.TimeoutError:
        proceso.kill()
        raise ErrorGenerador(f"El generador no terminó en {espera // 60} minutos.")
    return proceso.returncode, salida.decode("utf-8", "replace")


async def comprobar() -> None:
    """Falla con un mensaje claro si el intérprete no tiene las dependencias del generador
    (el arranque automático no trae el PATH de la sesión: suele ser el python del sistema)."""
    codigo, salida = await _ejecutar([_interprete(), "-c", DEPENDENCIAS], Path(config.mdd_ruta), espera=60)
    if codigo != 0:
        falta = salida.strip().splitlines()[-1] if salida.strip() else "dependencias"
        raise ErrorGenerador(
            f"El intérprete «{config.isr_python}» no puede correr el generador ({falta}). "
            "Defina ISR_PYTHON en el .env con un python que tenga jinja2, matplotlib y Pillow."
        )


async def nuevo(raiz: Path, anio: int, mes: int, numero: int, slug: str) -> None:
    """`main.py --nuevo`: copia `_plantilla/` de la entidad a la carpeta de la semana."""
    codigo, salida = await _ejecutar(
        _orden(raiz, ["--nuevo", f"{anio:04d}-{mes:02d}", f"{numero:02d}", slug]), raiz, espera=60
    )
    if codigo != 0:
        raise ErrorGenerador(salida.strip()[-800:] or "No se pudo crear la carpeta de la semana.")


async def generar(raiz: Path, carpeta: str, edicion: str = "publica", columnas: int = 2) -> dict:
    """Genera el PDF de la semana (ya exportada a su carpeta) y devuelve el registro."""
    await comprobar()
    argumentos = [carpeta, "--edicion", edicion, "--columnas", str(columnas)]
    codigo, salida = await _ejecutar(_orden(raiz, argumentos), raiz)
    pdf = RE_PDF.search(salida)
    if codigo != 0 or not pdf:
        raise ErrorGenerador(explicar(salida))
    avisos = [l.strip() for l in salida.splitlines() if "AVISO" in l or "aviso" in l.lower()]
    return {"pdf": Path(pdf.group(1).strip()).name, "registro": salida[-6000:], "avisos": avisos}


SECCIONES = {"portada": "portada", "creditos": "créditos", "presentacion": "presentación",
             "resumen": "resumen", "marco": "marco", "cronica": "crónicas", "balance": "balance",
             "seguimiento": "compromisos y seguimiento", "conclusiones": "conclusiones",
             "contraportada": "contraportada", "dias": "fichas por día", "matriz": "matriz",
             "analisis": "análisis", "anexos": "anexos", "metodologia": "metodología", "ambito": "ámbito"}
RE_FALLO_TEX = re.compile(r"parte_\d+_([a-z]+)\.tex:(\d+): (.+)")


def explicar(salida: str) -> str:
    """Qué falló, dicho para quien redacta: la sección del informe donde LuaLaTeX se detuvo
    (o el error de datos del generador) y, debajo, las últimas líneas del registro."""
    ultimas = "\n".join(salida.strip().splitlines()[-20:])
    fallo = RE_FALLO_TEX.search(salida)
    if fallo:
        seccion = SECCIONES.get(fallo.group(1), fallo.group(1))
        return (f"El PDF no se pudo componer en la sección «{seccion}» ({fallo.group(3).strip()}). "
                "Suele ser un carácter especial en un texto de esa sección o una lista vacía.\n\n"
                f"Registro técnico:\n{ultimas}")
    for linea in salida.splitlines():
        if linea.startswith("ERROR:") or "Datos inválidos" in linea:
            return f"{linea.replace('ERROR:', '').strip()}\n\nRegistro técnico:\n{ultimas}"
    return ultimas or "El generador terminó sin producir el PDF."

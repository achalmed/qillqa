"""lib/compilar.py — Compilación con el build.sh del MDD y archivo del PDF final.

Nunca se invoca lualatex a mano: build.sh exporta TEXINPUTS y las fuentes
vendorizadas del framework. El PDF compilado en editables/ se copia a
salida/ con la nomenclatura institucional (ISR-NN_AAAA-MM_vX.Y[-estado][-interna][-1col].pdf).
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import config


def compilar(maestro: Path) -> Path:
    """Compila el maestro con build.sh; devuelve la ruta del PDF."""
    if not config.BUILD_SH.exists():
        raise FileNotFoundError(f"No se encuentra el compilador del MDD: {config.BUILD_SH}")
    cmd = ["bash", str(config.BUILD_SH), str(maestro)]
    print(f"  [compilar] {' '.join(cmd[1:])}")
    res = subprocess.run(cmd, cwd=str(config.MDD), capture_output=True, text=True)
    if res.returncode != 0:
        log = maestro.with_suffix(".log")
        print(res.stdout[-2000:])
        raise RuntimeError(f"Falló la compilación. Revisa {log}\n{_errores(log)}")
    pdf = maestro.with_suffix(".pdf")
    if not pdf.exists():
        raise RuntimeError(f"build.sh terminó sin producir {pdf}")
    return pdf


def _errores(log: Path, n=12) -> str:
    """Extrae las líneas de error del log (formato archivo:línea: de -file-line-error)."""
    if not log.exists():
        return ""
    lineas = log.read_text(encoding="utf-8", errors="replace").splitlines()
    salida = []
    for i, l in enumerate(lineas):
        if (".tex:" in l or ".cls:" in l or ".sty:" in l) and ": " in l and l.split(":")[0].endswith((".tex", ".cls", ".sty")):
            salida.extend(lineas[i:i + 6])
            if len(salida) > n * 6:
                break
    return "\n".join(salida[: n * 6])


def nombre_salida(inf: dict, columnas: int = 2, edicion: str | None = None) -> str:
    """Nombre del PDF en salida/. `edicion` es la efectiva (la de --edicion o la de informe.yaml):
    la interna lleva sufijo propio para no sobrescribir el PDF de la pública con la misma versión."""
    sufijo = config.SUFIJO_ESTADO.get(inf.get("estado", "borrador"), "")
    edicion = edicion or inf.get("edicion") or "publica"
    return config.NOMBRE_PDF.format(codigo=inf["codigo"], anio=inf["anio"], mes=int(inf["mes"]),
                                    version=inf["version"], sufijo=sufijo,
                                    edicion=config.SUFIJO_EDICION[edicion],
                                    variante=config.SUFIJO_COLUMNAS.get(columnas, ""))


def archivar(pdf: Path, carpeta_informe: Path, inf: dict, columnas: int = 2, edicion: str | None = None) -> Path:
    destino = carpeta_informe / config.SUB_SALIDA / nombre_salida(inf, columnas, edicion)
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pdf, destino)
    return destino


def paginas(pdf: Path) -> int | None:
    try:
        out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
        for l in out.splitlines():
            if l.startswith("Pages:"):
                return int(l.split()[1])
    except FileNotFoundError:
        pass
    return None

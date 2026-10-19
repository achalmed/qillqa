"""Compilador: invoca scripts/build.sh del framework sobre una carpeta
de trabajo y devuelve el PDF resultante.

Un solo compilado a la vez (semaforo): LuaLaTeX es pesado y a esta
escala una cola simple es suficiente y predecible.
"""

import asyncio
import shutil
from dataclasses import dataclass
from pathlib import Path

from app.config import config
from app.latex.generador import (
    encabezado_descriptivo,
    generar_maestro,
    generar_metadata,
)

_SEMAFORO = asyncio.Semaphore(1)


@dataclass
class ResultadoCompilacion:
    exito: bool
    ruta_pdf: Path | None
    mensaje: str
    log: str = ""


def _mensaje_amigable(salida: str) -> str:
    """Extrae del log de LaTeX algo util para una secretaria."""
    errores = [
        linea for linea in salida.splitlines() if linea.startswith("!")
    ]
    if errores:
        return (
            "El documento no pudo generarse. Detalle técnico: "
            + " / ".join(errores[:3])
        )
    return (
        "El documento no pudo generarse. Revise el contenido e intente "
        "de nuevo; si persiste, contacte al administrador."
    )


async def ejecutar_build(maestro: Path) -> ResultadoCompilacion:
    """Invoca scripts/build.sh sobre un maestro .tex ya existente.

    No genera ni toca los .tex: solo compila. Lo usan tanto la
    generacion desde la plataforma como la recompilacion de documentos
    heredados (que conservan su .tex original verbatim)."""
    trabajo = maestro.parent
    script = Path(config.mdd_ruta) / "scripts" / "build.sh"
    async with _SEMAFORO:
        proceso = await asyncio.create_subprocess_exec(
            str(script),
            str(maestro),
            cwd=config.mdd_ruta,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            salida_bytes, _ = await asyncio.wait_for(
                proceso.communicate(), timeout=config.tiempo_max_compilacion
            )
        except TimeoutError:
            proceso.kill()
            await proceso.wait()
            return ResultadoCompilacion(
                False, None, "La compilación tardó demasiado y fue cancelada."
            )

    salida = salida_bytes.decode("utf-8", errors="replace")
    pdfs = sorted(trabajo.glob("*.pdf"), key=lambda p: p.stat().st_mtime)
    if proceso.returncode == 0 and pdfs:
        return ResultadoCompilacion(True, pdfs[-1], "PDF generado.", salida)
    # El detalle del error vive en el .log de LaTeX, no siempre en la salida del script: se le
    # añaden sus líneas de error para que la reparación automática lo reconozca (2026-10-12).
    registro = maestro.with_suffix(".log")
    if registro.exists():
        lineas = registro.read_text(encoding="utf-8", errors="replace").splitlines()
        errores = [ln for i, ln in enumerate(lineas) if ln.startswith("!") or " Error: " in ln or "not found" in ln
                   or (i > 0 and lineas[i - 1].rstrip().endswith(("Error: File `", "not")))]
        if errores:
            salida += "\n--- errores del .log ---\n" + "\n".join(errores[:20])
    return ResultadoCompilacion(False, None, _mensaje_amigable(salida), salida)


async def compilar_en_carpeta(
    carpeta: Path,
    clase: str,
    tipodoc: str,
    campos: dict,
    cuerpo_json: dict,
    numero: int | None,
    anexos: list[str] | None = None,
    relacion: list[dict] | None = None,
    tipo_cfg: dict | None = None,
) -> ResultadoCompilacion:
    """Documentos de la plataforma: genera metadata.tex + <clase>.tex en
    la CARPETA REAL del documento (dentro de documentos/oficios del
    framework) y compila ahí. No se copia a ningún lado: el documento
    web vive en el mismo árbol que los hechos a mano."""
    carpeta.mkdir(parents=True, exist_ok=True)
    maestro = carpeta / f"{clase}.tex"
    # Ruta relativa al framework para el comando de compilación del encabezado.
    try:
        ruta_rel = str(Path(carpeta).relative_to(config.mdd_ruta) / f"{clase}.tex")
    except ValueError:
        ruta_rel = f"{Path(carpeta).name}/{clase}.tex"
    encabezado = encabezado_descriptivo(clase, tipodoc, numero, campos, ruta_rel)
    # Los .tex se generan EN MEMORIA primero (2026-10-12): si el contenido no se puede
    # componer (NodoNoSoportado), nada de la carpeta se toca y la vista previa anterior sigue.
    metadata = generar_metadata(campos, numero, tipodoc, tipo_cfg)
    tex = generar_maestro(clase, campos, cuerpo_json, anexos, encabezado, relacion)

    # El PDF anterior se APARTA (no se borra) mientras se compila: si LaTeX falla, vuelve a su
    # sitio y el visor sigue mostrando la última versión buena. Antes se borraba al empezar y un
    # fallo dejaba el borrador sin vista previa («el documento no existe»; 2026-10-12).
    apartados = carpeta / ".pdf-anterior"
    previos = list(carpeta.glob("*.pdf"))
    if previos:
        apartados.mkdir(exist_ok=True)
        for pdf_viejo in previos:
            pdf_viejo.replace(apartados / pdf_viejo.name)
    (carpeta / "metadata.tex").write_text(metadata, encoding="utf-8")
    maestro.write_text(tex, encoding="utf-8")
    resultado = await ejecutar_build(maestro)
    if apartados.exists():
        if resultado.exito:
            shutil.rmtree(apartados, ignore_errors=True)
        else:
            for pdf_viejo in apartados.glob("*.pdf"):
                if not (carpeta / pdf_viejo.name).exists():
                    pdf_viejo.replace(carpeta / pdf_viejo.name)
            shutil.rmtree(apartados, ignore_errors=True)
    return resultado

"""backend/tests/test_nombre_viejo.py — el nombre viejo («sgdp») ya no está en la plataforma (fase 10.4 de
docs/plataforma/propuesta-repositorios.md, §8.9, 2026-10-22). Revisa Qillqa y sus repositorios hermanos (los que estén
junto a él) y solo admite la lista de abajo, que se ACHICA: cada entrada dice por qué sigue. Lo histórico (historial,
CHANGELOG, decisiones, la propuesta y la hoja de ruta) no se revisa: cuenta lo que pasó.
"""
import fnmatch
import re
import subprocess
from pathlib import Path

import pytest

QILLQA = Path(__file__).resolve().parents[2]
HERMANOS = ("qillqasqa", "rikchay", "wayra", "ruray", "tullpu", "kuyuy", "awana", "qhawana", "yupay", "minka", "rimay", "punku")
HISTORIA = ("CHANGELOG.md", "*/historial/*", "docs/historial/*", "package-lock.json", "docs/decisiones.md", "*/docs/decisiones.md",
            "docs/plataforma/propuesta-repositorios.md", "docs/plataforma/hoja-de-ruta.md", "scripts/mediateca/*")
EXPORTADOR = "la carpeta de operaciones de la entidad conserva su nombre viejo hasta que él la renombre"

# archivo → (cuántas menciones, por qué)
PERMITIDO = {
    # Lo que nombra a producción hasta el corte (10.6): cosas que existen y corren.
    "qillqa/scripts/verde.sh": (5, "el contenedor, la carpeta, la función de entorno y la base de producción, que el verde solo lee"),
    "qillqa/scripts/portar_produccion.py": (2, "reconoce la marca vieja «Porta: sgdp <hash>» de los commits ya portados"),
    "qillqa/entorno.sh": (3, "lectura doble de SGDP_OPERACIONES y la carpeta de operaciones de la entidad"),
    # Lecturas dobles mientras dure la transición (se retiran en la fase 7, el punto de no retorno).
    "qillqa/backend/app/config.py": (5, "el .env de producción trae SGDP_BOVEDA_CLAVE y SGDP_URL_PUBLICA; la base vieja «sgdp» deriva su Mediateca"),
    "rikchay/rikchay/config.py": (2, "la base vieja «sgdp» deriva su Mediateca"),
    "qillqa/backend/app/main.py": (1, "migra las claves del reflejo en OpenProject"),
    "qillqa/backend/app/servicios/openproject_mapa.py": (3, "OpenProject aún guarda claves «sgdp:…» hasta que se reescriben"),
    "qillqa/openproject/bridges/op_api.py": (1, "el puente manual adopta la clave vieja"),
    "qillqa/openproject/bridges/sync_documentos.py": (1, "el puente manual adopta la clave vieja"),
    "qillqasqa/qillqasqa/db.py": (2, "migra origen='sgdp' y las claves «sgdp:doc:N» de las fuentes"),
    "minka/minka/db.py": (2, "migra origen='sgdp' de tareas y eventos"),
    "minka/minka/api_agenda.py": (3, "reconoce los UID `evento-N@sgdp` del calendario exportado antes"),
    "qillqasqa/qillqasqa/api/semanas_sr.py": (1, "quita la clave vieja de un expediente importado antes"),
    "qillqa/frontend/index.html": (6, "copia las claves viejas del navegador y marca la página para la extensión instalada"),
    "qillqa/frontend/src/claves.ts": (3, "la misma copia, con su prueba"),
    "qillqa/frontend/pruebas/claves.test.ts": (8, "la prueba de esa copia"),
    "qillqa/frontend/public/sw.js": (7, "borra los cachés viejos y atiende a una pestaña abierta antes"),
    "qillqa/frontend/src/api.ts": (3, "habla con un service worker viejo aún activo"),
    "rimay/web/src/componentes/chat/ContadorChat.tsx": (2, "atiende al service worker viejo"),
    "qillqa/frontend/src/mesaExtension.ts": (2, "reconoce la extensión instalada antes"),
    "qillqasqa/web/src/sync/sincronizador.ts": (3, "lee el índice viejo y no vuelve a mandar lo ya importado"),
    "rikchay/web/src/componentes/fototeca/copiaLocal.ts": (1, "lee el índice viejo de la copia local"),
    # Valores FIJOS: cambiarlos rompería algo que ya tiene la gente.
    "punku/punku/mesa_virtual.py": (1, "la sal de las fichas y los enlaces de seguimiento de los ciudadanos"),
    "qillqasqa/qillqasqa/servicios/vigencia.py": (4, "el esquema de la huella guardada en cada documento firmado"),
    "qillqasqa/tests/test_vigencia.py": (4, "la prueba de ese esquema"),
    "qillqasqa/qillqasqa/api/mesa.py": (2, "el id de la extensión en Firefox"),
    # Los exportadores de demo buscan la carpeta de operaciones de la entidad (y los nombres de su .env).
    "qillqa/scripts/exportar_demo.py": (3, EXPORTADOR + "; los nombres viejos de su .env"),
    "qillqasqa/scripts/exportar_demo.py": (3, EXPORTADOR + "; los nombres viejos de su .env"),
    **{f"{r}/scripts/exportar_demo.py": (1, EXPORTADOR) for r in HERMANOS if r != "qillqasqa"},
}


def _repos() -> list[Path]:
    return [QILLQA] + [QILLQA.parent / r for r in HERMANOS if (QILLQA.parent / r / ".git").exists()]


def _menciones() -> dict[str, int]:
    salida = {}
    for repo in _repos():
        lista = subprocess.run(["git", "-C", str(repo), "ls-files", "--cached", "--others", "--exclude-standard"],
                               capture_output=True, text=True).stdout.split("\n")
        for f in filter(None, lista):
            if any(fnmatch.fnmatch(f, h) for h in HISTORIA) or (repo == QILLQA and f == "backend/tests/test_nombre_viejo.py"):
                continue
            p = repo / f
            if p.is_symlink() or not p.is_file():
                continue
            try:
                n = len(re.findall("sgdp", p.read_text(encoding="utf-8"), re.I))
            except UnicodeDecodeError:
                continue
            if n:
                salida[f"{repo.name}/{f}"] = n
    return salida


def test_el_nombre_viejo_no_vuelve():
    if not (QILLQA / ".git").exists():
        pytest.skip("sin git (el árbol de la demo)")
    faltas = [f"{f}: {n} (permitido {PERMITIDO.get(f, (0,))[0]})" for f, n in sorted(_menciones().items())
              if n > PERMITIDO.get(f, (0,))[0]]
    assert not faltas, "Vuelve el nombre viejo (escribir «qillqa», o justificarlo en PERMITIDO):\n" + "\n".join(faltas)


def test_la_lista_solo_se_achica():
    if not (QILLQA / ".git").exists():
        pytest.skip("sin git (el árbol de la demo)")
    hay = _menciones()
    presentes = {r.name for r in _repos()}
    sobran = [f"{f}: permitido {n}, hay {hay.get(f, 0)}" for f, (n, _) in sorted(PERMITIDO.items())
              if f.split("/", 1)[0] in presentes and hay.get(f, 0) < n]
    assert not sobran, "Bajó: achicar PERMITIDO:\n" + "\n".join(sobran)

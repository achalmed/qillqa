"""backend/tests/test_pegado_prompts.py — el contrato con el repo `prompts`: el bloque YAML del
`## Ejemplo` (o del «7 Formato de salida») de cada prompt que alimenta a Qillqa se interpreta sin
errores con el esquema de su `tipo` (servicios/pegado). Si el repo de prompts no está en el
espacio de trabajo (otra máquina), la prueba se omite.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_pegado_prompts.py
"""
import os
import re
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import pytest  # noqa: E402

from app.servicios import pegado  # noqa: E402

# La carpeta de prompts la resuelve core/env (PROMPTS_DIR); sin ella, la hermana del repo. La carpeta
# del dominio legislativo se localiza por su nombre terminado en «legislativo» (su número puede cambiar).
PROMPTS = Path(os.environ.get("PROMPTS_DIR") or Path(__file__).resolve().parents[3] / "prompts")
LEGISLATIVO = next(iter(sorted(PROMPTS.glob("*legislativo"))), PROMPTS / "legislativo")
SKILL = PROMPTS / "skills" / "documentos-administrativos" / "references"
CASOS = [
    (LEGISLATIVO / "prompt_13_registro_de_recibido.md", "documento-recibido"),
    (LEGISLATIVO / "prompt_14_agenda_de_actividades.md", "agenda-actividades"),
    (LEGISLATIVO / "prompt_15_seguimiento_de_tramite.md", "seguimiento-documento"),
    (LEGISLATIVO / "prompt_11_representacion_y_demandas.md", "registro-representacion"),
    (LEGISLATIVO / "prompt_08_proyecto_de_ley.md", "proyecto-de-ley"),
    (LEGISLATIVO / "prompt_16_pieza_de_prensa.md", "pieza-de-prensa"),
    (SKILL / "oficio.md", "documento-administrativo"),
]
_CERCA = re.compile(r"```(?:yaml|yml)[ \t]*\n(.*?)\n```", re.S)


def _bloques(texto: str, tipo: str) -> list[str]:
    """Los bloques yaml del archivo cuyo `tipo:` es el buscado y que no son plantillas con <marcadores>."""
    salida = []
    for b in _CERCA.findall(texto):
        if re.search(r"^tipo:\s*" + re.escape(tipo) + r"\s*$", b, re.M) and "<" not in b.split("\n", 2)[0]:
            salida.append(b)
    return salida


@pytest.mark.parametrize("archivo, tipo", CASOS, ids=[c[0].name for c in CASOS])
def test_el_ejemplo_del_prompt_se_interpreta(archivo, tipo):
    ruta = archivo.name
    if not archivo.exists():
        pytest.skip(f"sin el repo de prompts: {archivo}")
    bloques = _bloques(archivo.read_text(encoding="utf-8"), tipo)
    assert bloques, f"{ruta}: ningún bloque yaml con tipo: {tipo}"
    # Un bloque con marcadores «<…>» es la plantilla del formato: se interpreta igual (null y texto),
    # pero solo los que no son plantilla deben pasar sin errores.
    ejemplos = [b for b in bloques if "<" not in b or "<example>" in b]
    for b in (ejemplos or bloques):
        le = pegado.interpretar(b, (tipo,))
        assert le.tipo == tipo, (ruta, le.errores)
        if ejemplos:
            assert le.valido, (ruta, le.errores)

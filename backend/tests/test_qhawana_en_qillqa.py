"""backend/tests/test_qhawana_en_qillqa.py — lo del lado de Qillqa del Observatorio de datos (Qhawana, en su repositorio desde
el 2026-10-22; sus pruebas, en ../qhawana/tests): el tema que Qillqa le pasa (scripts/observatorio.py) trae todos los roles
que el tema de Qhawana usa.
"""
import importlib.util
import json
import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
HOST = RAIZ / "scripts" / "observatorio.py"
# La demo pública no lleva scripts/observatorio.py (está atado al espacio de trabajo del autor: demo/excluir.txt).
con_host = pytest.mark.skipif(not HOST.is_file(), reason="sin scripts/observatorio.py (la demo no lo trae)")


def _host():
    spec = importlib.util.spec_from_file_location("observatorio_host", HOST)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _roles() -> set[str]:
    """Las claves de paleta que el tema usa (las de `_variables`, `integracion` y los roles de los chips)."""
    from qhawana import tema as qhawana_tema

    fuente = Path(qhawana_tema.__file__).read_text(encoding="utf-8")
    return set(re.findall(r"p\[['\"](\w+)['\"]\]", fuente)) | set(qhawana_tema.ROLES.values())


@con_host
def test_el_tema_del_anfitrion_trae_todos_los_roles():
    t = _host().tema_del_anfitrion()
    faltan = {modo: sorted(_roles() - set(t[modo])) for modo in ("clara", "oscura")}
    assert faltan == {"clara": [], "oscura": []}
    assert t["letra"] and t["apariencia"] == "qillqa_apariencia"


@con_host
def test_el_generador_lee_el_tema_del_anfitrion(tmp_path):
    from qhawana.generar import texto_tema

    archivo = tmp_path / "tema.json"
    archivo.write_text(json.dumps(_host().tema_del_anfitrion()), encoding="utf-8")
    texto = texto_tema(archivo)
    assert "qillqa_apariencia" in texto and "Se consulta dentro del sistema de gestión documental." in texto
    archivo.write_text(json.dumps({"clara": {}}), encoding="utf-8")
    with pytest.raises(SystemExit):
        texto_tema(archivo)

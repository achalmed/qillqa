"""backend/tests/test_awana_en_qillqa.py — lo del lado de Qillqa del editor de piezas (Awana, en su repositorio desde el
2026-10-21; sus pruebas, en ../awana/tests): las piezas de prensa ya no son de Qillqa, que las ofrece por el manifiesto de
Awana («piezas.v1» y el resolutor «pieza»), y su pegado acepta la entidad «pieza:N».
"""


def test_qillqa_ya_no_las_tiene():
    import importlib.util

    from app import modelos
    from qillqasqa.servicios import resolutores_documentales

    # Ni el modelo ni el proxy del estudio aparte (api/prensa.py, retirado en E5) quedan en Qillqa.
    assert not hasattr(modelos, "PiezaPrensa") and importlib.util.find_spec("app.api.prensa") is None
    assert not hasattr(resolutores_documentales, "resolver_pieza")
    from app.plataforma import MODULOS

    awana = next(m for m in MODULOS if m.id == "piezas")
    assert "piezas.v1" in awana.ofrece and "pieza" in awana.resolutores


def test_la_constancia_del_pegado_acepta_una_pieza():
    """La web de Awana deja la constancia de su pegado con la entidad «pieza:N» (antes la guardaba el backend de Prensa)."""
    from app.api.pegar import _entidad_valida

    assert _entidad_valida("pieza:12") and _entidad_valida("entrada:3")
    assert not _entidad_valida("pieza:") and not _entidad_valida("pieza:x") and not _entidad_valida("otra:1")

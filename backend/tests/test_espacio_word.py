"""El espacio del Formato Word (servicios/espacio_word.py): lógica pura, sin base de datos."""

from app.servicios.espacio_word import TOPE, normalizar, sin_documento


def test_normalizar_limpia_y_descarta_lo_que_no_existe():
    assert normalizar([3, "3", 0, -1, "x", 5], 5) == {"documentos": [3, 5], "activo": 5}
    # El activo que no está pasa al primero; sin documentos, ninguno.
    assert normalizar([3, 5], 9) == {"documentos": [3, 5], "activo": 3}
    assert normalizar([], 9) == {"documentos": [], "activo": None}
    # Los ids de documentos borrados se descartan (el caso de Edison: 348, 349, 350 ya no existían).
    assert normalizar([348, 349, 350, 351], 348, existentes={351}) == {"documentos": [351], "activo": 351}
    assert normalizar([348, 349], 348, existentes=set()) == {"documentos": [], "activo": None}
    assert len(normalizar(list(range(1, 200)), 1)["documentos"]) == TOPE


def test_sin_documento_pasa_el_activo_al_vecino():
    assert sin_documento({"documentos": [1, 2, 3], "activo": 3}, 3) == {"documentos": [1, 2], "activo": 2}
    assert sin_documento({"documentos": [1, 2, 3], "activo": 1}, 1) == {"documentos": [2, 3], "activo": 2}
    assert sin_documento({"documentos": [1, 2], "activo": 1}, 2) == {"documentos": [1], "activo": 1}
    assert sin_documento({"documentos": [7], "activo": 7}, 7) == {"documentos": [], "activo": None}
    assert sin_documento({}, 7) == {"documentos": [], "activo": None}

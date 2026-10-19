"""Institución destino con un solo formato (servicios/instituciones_destino.py)."""
from app.servicios.instituciones_destino import Indice, mostrar, nombre_propio, sin_cargo

IDX = Indice([
    ("Autoridad Nacional del Agua", "ANA"),
    ("MINISTERIO DEL INTERIOR", "MININTER"),
    ("Municipalidad Distrital de Chaclacayo", ""),
])


def test_mayusculas_a_nombre_propio():
    assert nombre_propio("MINISTERIO DE VIVIENDA, CONSTRUCCIÓN Y SANEAMIENTO") == "Ministerio de Vivienda, Construcción y Saneamiento"
    assert nombre_propio("ZONA REGISTRAL N° XIV") == "Zona Registral N.° XIV"
    # Lo bien escrito no se toca (siglas internas incluidas).
    assert nombre_propio("Unidad de Gestión Educativa Local La Mar") == "Unidad de Gestión Educativa Local La Mar"


def test_cargo_se_vuelve_institucion():
    assert sin_cargo("Ministro del Interior") == "Ministerio del Interior"
    assert sin_cargo("Gobernador Regional de Ayacucho") == "Gobierno Regional de Ayacucho"
    assert sin_cargo("Alcalde de la Municipalidad Distrital de Vilcanchos") == "Municipalidad Distrital de Vilcanchos"
    assert sin_cargo("Junta Directiva") == "Junta Directiva"


def test_manda_el_directorio():
    assert mostrar("ANA", IDX) == "Autoridad Nacional del Agua (ANA)"
    assert mostrar("AUTORIDAD NACIONAL DEL AGUA (ANA)", IDX) == "Autoridad Nacional del Agua (ANA)"
    assert mostrar("Ministro del Interior", IDX) == "Ministerio del Interior (MININTER)"
    assert mostrar("MUNICIPALIDAD DISTRITAL DE CHACLACAYO", IDX) == "Municipalidad Distrital de Chaclacayo"
    assert mostrar("Jefe del Instituto Nacional de Defensa Civil (INDECI)", IDX) == "Instituto Nacional de Defensa Civil (INDECI)"

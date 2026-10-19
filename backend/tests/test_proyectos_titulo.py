"""Título de la ley sin el rótulo pegado de Word (servicios/proyectos.py::titulo_ley)."""
from app.servicios.proyectos import titulo_ley


def test_quita_el_rotulo_duplicado():
    assert titulo_ley("Ley que PROPOSICIÓN LEGISLATIVA QUE DECLARA DE INTERÉS NACIONAL") == "Ley que declara de interés nacional"
    assert titulo_ley("Ley que PROPOSICIÓN LEGISLTATIVA QUE GARANTIZA") == "Ley que garantiza"
    assert titulo_ley("PROPOSICIÓN LEGISLATIVA QUE DECLARA A HUANTA") == "Ley que declara a Huanta"
    assert titulo_ley("Proyecto de Ley que modifica la Ley 27795") == "Ley que modifica la Ley 27795"


def test_deja_los_titulos_correctos():
    for t in ("Ley que reconoce el derecho", "Ley de fomento", "Ley Orgánica de Municipalidades", "Ley que   crea  algo"):
        assert titulo_ley(t) == " ".join(t.split())


def test_uniforma_las_mayusculas():
    """Todo en mayúsculas, en minúsculas o Capitalizado → forma del Manual, con sus nombres propios."""
    assert titulo_ley("LEY QUE DECLARA A LA PROVINCIA DE HUANTA, DEPARTAMENTO DE AYACUCHO, CUNA DE LA GRATUIDAD") == (
        "Ley que declara a la provincia de Huanta, departamento de Ayacucho, cuna de la gratuidad")
    assert titulo_ley("Ley que MODIFICA LA LEY N° 27795, LEY DE DEMARCACIÓN Y ORGANIZACIÓN TERRITORIAL, PARA OPTIMIZAR") == (
        "Ley que modifica la Ley N° 27795, Ley de Demarcación y Organización Territorial, para optimizar")
    assert titulo_ley("ley que crea el hospital de vilcas huaman en el peru") == "Ley que crea el hospital de Vilcas Huamán en el Perú"
    assert titulo_ley("Ley Que Declara De Interés Nacional La II Etapa Del Hospital") == "Ley que declara de interés nacional la II etapa del hospital"
    assert titulo_ley("Ley que DECLARA de prueba el corredor") == "Ley que declara de prueba el corredor"
    assert titulo_ley("Ley que fortalece el SINAGERD en Ayacucho") == "Ley que fortalece el SINAGERD en Ayacucho"
    # Lo ya escrito en forma normal (con sus mayúsculas puestas a mano) no se toca.
    t = "Ley que declara el Día de los Mártires de la Educación en Huanta"
    assert titulo_ley(t) == t

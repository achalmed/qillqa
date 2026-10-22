"""Referencias del editor y asociaciones automáticas (servicios/referencias.py, 2026-10-06):
extracción de los nodos `referencia`, plan de sincronización, puntuación de la búsqueda,
normas y reconocimiento del oficio que presenta un informe SR. Pruebas puras (sin BD)."""

import pytest

from qillqasqa.latex.serializador import cuerpo_a_latex
from qillqasqa.servicios import referencias as ref


def _doc(*inline):
    return {"type": "doc", "content": [{"type": "paragraph", "content": list(inline)}]}


def _ref(tipo, ident, texto, nota=""):
    return {"type": "referencia", "attrs": {"tipo": tipo, "id": ident, "texto": texto, "nota": nota}}


# --- extracción ---------------------------------------------------------------------------


def test_extraer_nodos_validos_sin_repetir():
    contenido = _doc(
        {"type": "text", "text": "Conforme a la "},
        _ref("norma", "ley-27795", "Ley N° 27795, Ley de Demarcación y Organización Territorial"),
        {"type": "text", "text": " y al "},
        _ref("documento", 12, "Oficio N° 0095-2026-2027"),
        _ref("norma", "ley-27795", "otra vez la misma"),
        _ref("persona", "abc", "id no numérico: se ignora"),
        _ref("desconocido", 1, "tipo inválido: se ignora"),
    )
    r = ref.extraer(contenido)
    assert [x["destino"] for x in r] == ["norma:ley-27795", "doc:12"]
    assert r[0]["texto"].startswith("Ley N° 27795")


def test_extraer_dentro_de_listas_y_tablas():
    contenido = {"type": "doc", "content": [{"type": "bulletList", "content": [{"type": "listItem", "content": [
        _doc(_ref("libro", 10086, "Bobbio (1985)"))["content"][0]]}]}]}
    assert [x["destino"] for x in ref.extraer(contenido)] == ["libro:10086"]


def test_nodo_de():
    assert ref.nodo_de("documento", 3) == "doc:3"
    assert ref.nodo_de("institucion", "7") == "inst:7"
    assert ref.nodo_de("norma", "ds-004-2019-jus") == "norma:ds-004-2019-jus"
    assert ref.nodo_de("norma", "con espacio") is None
    assert ref.nodo_de("persona", "x1") is None
    assert ref.nodo_de("otro", 1) is None


# --- plan de sincronización ---------------------------------------------------------------


def test_plan_agrega_y_quita_solo_lo_del_editor():
    deseadas = ref.extraer(_doc(_ref("norma", "ley-27972", "Ley N° 27972"), _ref("persona", 5, "Ana")))
    existentes = [("norma:ley-27795", "referencia_normativa"), ("persona:5", "menciona")]
    agregar, quitar = ref.plan(existentes, deseadas)
    assert [d["destino"] for d in agregar] == ["norma:ley-27972"]
    assert quitar == {("norma:ley-27795", "referencia_normativa")}


def test_plan_sin_cambios_es_vacio():
    deseadas = ref.extraer(_doc(_ref("documento", 9, "Oficio")))
    assert ref.plan([("doc:9", "cita")], deseadas) == ([], set())


def test_tipo_de_relacion_por_destino():
    agregar, _ = ref.plan([], ref.extraer(_doc(_ref("norma", "ley-1", "L"), _ref("libro", 2, "B"), _ref("persona", 3, "P"))))
    assert {d["destino"]: ref.TIPO_RELACION[d["tipo"]] for d in agregar} == {
        "norma:ley-1": "referencia_normativa", "libro:2": "cita", "persona:3": "menciona"}


def test_presentes_en_texto():
    rels = [("persona:1", "Óscar de Jesús"), ("norma:ley-27795", "Ley N° 27795"), ("doc:3", "")]
    assert ref.presentes_en_texto(rels, "Se reunió con OSCAR DE JESUS en Huanta.") == {"persona:1"}


# --- serializador -------------------------------------------------------------------------


def test_serializador_emite_solo_el_texto_y_la_nota_del_libro():
    tex = cuerpo_a_latex(_doc(
        {"type": "text", "text": "Según la "},
        _ref("norma", "ley-27795", "Ley N° 27795, Ley de Demarcación & Organización"),
        {"type": "text", "text": " y "},
        _ref("libro", 10, "Bobbio (1985)", nota="Bobbio, N. (1985). Estado, gobierno y sociedad. FCE."),
    ))
    assert "Ley N° 27795, Ley de Demarcación \\& Organización" in tex
    assert "Bobbio (1985)\\footnote{Bobbio, N. (1985). Estado, gobierno y sociedad. FCE.}" in tex
    assert "referencia" not in tex


# --- normas y búsqueda --------------------------------------------------------------------


def test_clave_norma():
    assert ref.clave_norma("la Ley N° 27795, Ley de Demarcación") == "ley-27795"
    assert ref.clave_norma("Ley N.° 15232") == "ley-15232"
    assert ref.clave_norma("D.S. N° 004-2019-JUS") == "ds-004-2019-jus"
    assert ref.clave_norma("Decreto Supremo 021-2019-JUS") == "ds-021-2019-jus"
    assert ref.clave_norma("sin norma") is None


def test_catalogo_de_normas_incluye_las_de_los_distritos():
    claves = {n["clave"]: n for n in ref.normas_catalogo()}
    assert "ley-27795" in claves
    assert ref.texto_norma(claves["ley-27795"]) == "Ley N° 27795, Ley de Demarcación y Organización Territorial"
    assert "ley-15232" in claves and "Acocro" in claves["ley-15232"]["titulo"]


def test_interpretar_disparadores():
    assert ref.interpretar("Ley N° 2779") == (("norma", "proyecto"), ["ley", "2779"])
    assert ref.interpretar("Oficio 95")[0] == ("documento",)
    assert ref.interpretar("@huamanga") == ((), ["huamanga"])
    assert ref.interpretar("Informe SR-02")[1] == ["informe", "sr", "2"]


def test_puntuar_prefiere_numero_exacto_y_exige_todas_las_palabras():
    exacto = ref.puntuar(["27795"], "Ley 27795 Ley de Demarcación")
    prefijo = ref.puntuar(["2779"], "Ley 27795 Ley de Demarcación")
    assert exacto > prefijo > 0
    assert ref.puntuar(["27795", "municipalidades"], "Ley 27795 Ley de Demarcación") == 0
    # Los ceros a la izquierda no importan: «Oficio 95» encuentra «Oficio N° 0095-…».
    assert ref.puntuar(["95"], "Oficio N° 0095-2026-2027-ABC-CD/CRP") >= 30
    # Sin tildes ni mayúsculas.
    assert ref.puntuar(["demarcacion"], "LEY DE DEMARCACIÓN") > 0


def test_numeros_pegados_y_sin_falsos_positivos():
    assert ref.normalizar("Oficio N°0009-2026") == "oficio n 9 2026"
    assert ref.puntuar(["9"], "Oficio N°0009-2026-2027") > ref.puntuar(["9"], "Oficio N°0039-2026-2027") == 0


def test_puntuar_titulo_antes_que_detalle():
    assert ref.puntuar(["huanta"], "Municipalidad de Huanta") > ref.puntuar(["huanta"], "Alcalde", "Municipalidad de Huanta")


# --- el oficio que presenta un informe SR -------------------------------------------------

SEMANAS = [
    {"id": 1, "numero": 1, "codigo": "SR-01", "tema": "agua y saneamiento", "inicio": "2026-08-17", "fin": "2026-08-21"},
    {"id": 2, "numero": 2, "codigo": "SR-02", "tema": "educación superior", "inicio": "2026-09-14", "fin": "2026-09-18"},
]


def test_parece_presentacion():
    assert ref.parece_presentacion_informe({"asunto": "Remito informe de la semana de representación"})
    assert ref.parece_presentacion_informe({"referencia": "ISR-02-2026-2027"})
    assert ref.parece_presentacion_informe({"asunto": "Solicito información"}, "Remito el informe de la Semana de Representación de setiembre.")
    assert not ref.parece_presentacion_informe({"asunto": "Pedido de información sobre la semana de representación"})
    assert not ref.parece_presentacion_informe({"asunto": "Solicito atención al pedido"}, "durante la Semana de Representación se me planteó")


def test_candidato_por_codigo_es_confiable():
    c = ref.candidatos_informe({"asunto": "Presento el informe SR-02"}, "", SEMANAS)
    assert [x.id for x in c] == [2]
    assert ref.es_confiable(c)


def test_candidato_por_mes_y_tema():
    c = ref.candidatos_informe({"asunto": "Remito informe de la semana de representación de setiembre de 2026 sobre educación superior"}, "", SEMANAS)
    assert c[0].id == 2 and c[0].puntaje >= 60 and ref.es_confiable(c)


def test_sin_senal_propone_todas_las_recientes_primero_sin_asociar():
    c = ref.candidatos_informe({"asunto": "Remito el informe de la semana de representación"}, "", SEMANAS)
    assert [x.id for x in c] == [2, 1]
    assert not ref.es_confiable(c)


def test_semana_de_representacion_numero():
    c = ref.candidatos_informe({"asunto": "Informe de la Semana de Representación N° 1"}, "", SEMANAS)
    assert c[0].id == 1 and ref.es_confiable(c)


def test_periodo_texto():
    assert ref.periodo_texto("2026-09-14", "2026-09-18") == "setiembre de 2026"
    assert ref.periodo_texto("", "") == ""


# --- orden de la lista del autocompletado -------------------------------------------------


def _r(tipo, puntaje, i=0):
    return {"tipo": tipo, "id": str(i), "puntaje": puntaje}


def test_ordenar_disparador_manda_sobre_el_puntaje():
    res = [_r("documento", 90, 1), _r("norma", 40, 2), _r("norma", 60, 3), _r("persona", 80, 4)]
    salida = ref.ordenar_resultados(res, ("norma",), "")
    assert [r["id"] for r in salida] == ["3", "2", "1", "4"]


def test_ordenar_contexto_y_tope_por_grupo():
    # En una parte del proyecto se citan obras de Zotero (antes, libros de Calibre).
    res = [_r("documento", 50, i) for i in range(10)] + [_r("zotero", 45, 99)]
    salida = ref.ordenar_resultados(res, (), "parte", por_grupo=3)
    assert salida[0]["tipo"] == "zotero"
    assert sum(r["tipo"] == "documento" for r in salida) == 3


def test_ordenar_grupos_juntos():
    res = [_r("persona", 90, 1), _r("institucion", 80, 2), _r("persona", 70, 3)]
    assert [r["id"] for r in ref.ordenar_resultados(res, (), "")] == ["1", "3", "2"]


def test_unica_semana_del_mes_es_confiable():
    c = ref.candidatos_informe({"asunto": "Remito el informe de la semana de representación de agosto"}, "", SEMANAS)
    assert [x.id for x in c] == [1] and ref.es_confiable(c)


# --- la cita en la Referencia y en «Adj.» (Edison, 2026-10-18) ---------------------------------

@pytest.mark.parametrize("texto, esperado", [
    ("Oficio Múltiple Nº 007-2026-ENTIDAD-X/P, de 15 de octubre de 2026, y anexos (31 páginas del archivo remitido).",
     "Oficio Múltiple Nº 007-2026-ENTIDAD-X/P"),
    ("OFICIO N° 265-2026-GRA/DG (21 de setiembre de 2026)", "OFICIO N° 265-2026-GRA/DG"),
    ("Carta N.°000105-2026-MTPE1/20 de fecha 12 de octubre del 2026.", "Carta N.°000105-2026-MTPE1/20"),
    ("Resolución Gerencial Regional N° 450-2026-GRA/GGR(11/08/2026)", "Resolución Gerencial Regional N° 450-2026-GRA/GGR"),
    ("Expediente N.° MPD2026-EXT-0754771 (12/08/2026)", "Expediente N.° MPD2026-EXT-0754771"),
    ("Informe técnico (05 folios)", "Informe técnico"),
    # Sin cambios: ya está bien, o la fecha es lo único que identifica al documento.
    ("Oficio N° 108-19492-8-2026-2027-DGP-CD.", "Oficio N° 108-19492-8-2026-2027-DGP-CD."),
    ("Memorial s/n de fecha 18 de setiembre de 2026", "Memorial s/n de fecha 18 de setiembre de 2026"),
    ("Ley N° 31814, del Congreso", "Ley N° 31814, del Congreso"),
    ("", ""),
])
def test_cita_documento_solo_denominacion_y_numero(texto, esperado):
    from app.servicios.pegado.validar import cita_documento

    assert cita_documento(texto) == esperado

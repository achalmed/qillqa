"""backend/tests/test_proyecto_ley.py — generador LaTeX del proyecto de ley (piloto 2026-10-01).

Pruebas puras: artículos y disposiciones a sus macros, título repetido omitido, orden
oficial de las disposiciones, singular/plural del bloque y avisos de técnica legislativa.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.latex import proyecto_ley as pl  # noqa: E402


def h(t):
    return {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": t}]}


def p(t):
    return {"type": "paragraph", "content": [{"type": "text", "text": t}]}


def sec(clave, titulo, nodos, obligatoria=True):
    return {"clave": clave, "titulo": titulo, "obligatoria": obligatoria, "contenido": {"type": "doc", "content": nodos}}


def test_articulos_disposiciones_y_titulo_repetido():
    tex = pl.parte_a_latex("sustantiva", "Parte sustantiva", [h("Artículo 1.- Objeto de la ley"), p("Texto.")])
    assert "\\articulo{1}{Objeto de la ley}" in tex
    tex = pl.parte_a_latex("dcf", "Disposiciones complementarias finales", [h("DISPOSICIONES COMPLEMENTARIAS FINALES"), h("PRIMERA. - Vigencia"), p("Rige.")])
    assert "\\disposicion{Primera}{Vigencia}" in tex and "DISPOSICIONES" not in tex
    tex = pl.parte_a_latex("efecto", "Efecto de la vigencia de la norma", [h("II. EFECTO DE LA VIGENCIA DE LA NORMA SOBRE LA LEGISLACIÓN"), h("II.1. Detalle"), p("x")])
    assert tex.count("apartadolegislativo") == 1 and "\\apartadolegislativo[II.1.]{Detalle}" in tex


def test_orden_oficial_singular_y_avisos():
    proyecto = {"codigo": "PL-2026-001", "titulo": "Ley que prueba", "datos": {"autor": "Nombre Apellido, Diputado", "grupo": "Grupo X", "adherentes": "A\nB"}}
    partes = [
        sec("titulo", "Título", [p("Ley que prueba")]),
        sec("sustantiva", "Parte sustantiva", [h("Artículo 1.- Objeto"), p("x")]),
        sec("dcm", "Modificatorias", [h("PRIMERA. - Modifica"), p("x")]),
        sec("dcf", "Finales", [h("PRIMERA. - Vigencia"), p("x"), h("SEGUNDA. - Otra"), p("y")]),
        sec("fundamentos", "Fundamentos", [p("f")]),
        sec("efecto", "Efecto", [p("e")]),
        sec("costo-beneficio", "Costo", [p("c")]),
    ]
    tex, avisos = pl.maestro(proyecto, partes)
    assert tex.index("\\componente{dcf}") < tex.index("\\componente{dcm}")  # finales antes que modificatorias
    assert "\\bloquedisposicion{modificatoria}" in tex and "\\bloquedisposiciones{finales}" in tex
    assert tex.count("\\firmadigital") == 3
    assert any("cuadro comparativo" in a for a in avisos)
    # Desde el 2026-10-05 la exposición es opcional parte por parte: sin antecedentes no hay aviso,
    # pero el PDF se compone igual (el esquema del marco queda «en avance»).
    assert not any("antecedentes" in a.lower() for a in avisos)
    assert "\\proyectoenavance" in tex
    _, avisos = pl.maestro(proyecto, partes[:4])
    assert any("exposición de motivos está vacía" in a for a in avisos)


def test_importador_no_toma_incisos_por_notas():
    import importlib.util
    from pathlib import Path

    ruta = Path(__file__).resolve().parents[2] / "scripts" / "importar_proyecto_ley.py"
    spec = importlib.util.spec_from_file_location("importador", ruta)
    imp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(imp)
    assert imp.RE_NOTA.match("1 Congreso de la República, Manual").group(2).startswith("Congreso")
    assert imp.RE_NOTA.match("37")  # número solo; el texto sigue en la línea siguiente
    assert imp.RE_NOTA.match("1. El agente es candidato") is None
    assert imp.RE_NOTA.match("2) Se utilizan fondos") is None
    # Se mira lo que va ANTES de la llamada: «I.» de «I.1», «5.» de «5.1».
    assert imp.RE_NUMERAL.search("I.") and imp.RE_NUMERAL.search(" 5.") and not imp.RE_NUMERAL.search("les.")
    # Un inciso «1. Texto» abre su propio párrafo.
    assert imp.RE_ITEM.match("1. El agente es candidato")


def test_raya_en_disposiciones():
    tex = pl.parte_a_latex("dcm", "Modificatorias", [h("SEGUNDA. – Modificación del literal a)"), p("x")])
    assert "\\disposicion{Segunda}{Modificación del literal a)}" in tex


def _importador():
    import importlib.util
    from pathlib import Path

    ruta = Path(__file__).resolve().parents[2] / "scripts" / "importar_proyecto_ley.py"
    spec = importlib.util.spec_from_file_location("importador", ruta)
    imp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(imp)
    return imp


def test_texto_citado_se_agrupa_y_cierra_aun_sin_comilla():
    imp = _importador()
    lineas = [
        "SEGUNDA. – Modificación del literal a) al artículo 1 de la Ley 30424, Ley que regula la",
        "responsabilidad administrativa de las personas jurídicas",
        "Se modifica el literal a) del artículo 1 de la Ley 30424, en los siguientes términos:",
        "“Artículo 1. Objeto de la Ley",
        "(...)",
        "a. 199, 226, 228 y 400 del Código Penal.",
        "TERCERA. - Incorporación del artículo 34-A a la Ley 28094",
        "Se incorpora el artículo 34-A, con el siguiente texto:",
        "“Artículo 34-A.- Transparencia de servicios políticos digitales",
        "34-A.1. Las organizaciones políticas declaran.”",
        "“Artículo 138.- Ejercicio privado de la acción penal",
        "(…)",
        "En el supuesto previsto, la acción penal es pública.”",
        "Cuando la misma red sea empleada, se aplican las reglas del concurso.",
    ]
    nodos = imp.citas(imp.con_notas(imp.parrafos(lineas), {}, set(), buscar=False))
    tipos = [n["type"] for n in nodos]
    # Lo que sigue a la comilla de cierre vuelve al texto del proyecto.
    assert tipos == ["heading", "paragraph", "blockquote", "heading", "paragraph", "blockquote", "blockquote", "paragraph"]
    # El rótulo partido en dos líneas se une.
    assert imp._texto(nodos[0]).endswith("Ley que regula la responsabilidad administrativa de las personas jurídicas")
    # Sin comilla de cierre, la cita termina en la disposición siguiente.
    assert [imp._texto(b) for b in nodos[2]["content"]] == [
        "“Artículo 1. Objeto de la Ley", "(...)", "a. 199, 226, 228 y 400 del Código Penal."
    ]
    # «34-A.1.» es un numeral propio, no la continuación del epígrafe.
    assert imp._texto(nodos[5]["content"][1]).startswith("34-A.1.")
    # Una comilla en la exposición («“bots”») no abre cita: no sigue a «:».
    assert imp.citas([p("El problema no está en los"), p("“bots” como tecnología.")])[1]["type"] == "paragraph"


def test_texto_citado_sangrado_y_sin_articulo_propio():
    cita = {"type": "blockquote", "content": [h("“Artículo 359-D.- Manipulación digital"), p("El que, con la finalidad…”")]}
    tex = pl.parte_a_latex("dcm", "Modificatorias", [h("PRIMERA.- Incorporación del artículo 359-D"), p("Se incorpora, en los siguientes términos:"), cita])
    assert "\\begin{textocitado}" in tex and "\\end{textocitado}" in tex
    assert "\\rubrocitado{“Artículo 359-D.- Manipulación digital}" in tex
    assert "\\articulo{359-D}" not in tex


def test_fecha_final_importada_no_se_repite():
    tex = pl.parte_a_latex("conclusion", "Conclusión", [p("La democracia…"), p("Lima, 15 de septiembre de 2026")])
    assert "15 de septiembre" not in tex and "La democracia" in tex
    # Una fecha DENTRO del texto no se toca.
    assert "Lima, 2 de mayo de 2025" in pl.parte_a_latex("fundamentos", "F", [p("Lima, 2 de mayo de 2025"), p("Sigue el análisis.")])


def test_tablas_del_importador():
    imp = _importador()
    # La fila partida por el salto de página vuelve a ser una sola.
    filas = [["Norma", "Efecto", "Resultado"], ["Código Penal", "Se incorporan párrafos", "Agrava la difamación"]]
    imp._continuar(filas, [["", "", "y protege el honor."], ["Ley 26859", "Se incorpora el 192-A.", "Habilita al JEE."]])
    assert filas[1][2] == "Agrava la difamación y protege el honor." and len(filas) == 3
    t = imp.nodo_tabla(filas)
    assert [c["type"] for c in t["content"][0]["content"]] == ["tableHeader"] * 3
    assert t["content"][2]["content"][0]["content"][0]["content"][0]["text"] == "Ley 26859"
    # La marca del texto se vuelve una tabla en su lugar.
    imp.TABLAS[9] = filas
    pars = imp.parrafos(["Texto antes del cuadro:", "§TABLA 9§", "Texto después."])
    assert [x[0] for x in pars] == ["p", "tabla", "p"]
    assert imp.con_notas(pars, {}, set(), buscar=False)[1]["type"] == "table"


def _p(texto: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": texto}]}


def _h(texto: str) -> dict:
    return {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": texto}]}


def test_incisos_con_sangria_completa_y_numerales_al_margen():
    # Revisión 2026-10-01: «a) …» y «1. …» son incisos (marca al margen, líneas
    # alineadas con el texto); «5.1. …» es un numeral y va como párrafo.
    tex = pl.parte_a_latex("sustantiva", "Parte sustantiva", [
        _p("a) Red coordinada inauténtica: pluralidad organizada."),
        _p("1. El agente es candidato."),
        _p("iv) idoneidad objetiva."),
        _p("5.1. La falsedad, por sí sola, no configura delito."),
    ])
    assert "\\itemlegislativo{a)}{Red coordinada inauténtica: pluralidad organizada.}" in tex
    assert "\\itemlegislativo{1.}{El agente es candidato.}" in tex
    assert "\\itemlegislativo{iv)}{idoneidad objetiva.}" in tex
    assert "\\itemlegislativo{5" not in tex and "5.1. La falsedad" in tex


def test_numeracion_de_la_exposicion_sale_del_texto():
    # Como el proyecto presentado: los antecedentes son I.17 (dentro de I), y
    # efecto/costo-beneficio/ambiental llevan II, III y IV aunque sean la 3.ª,
    # 4.ª y 5.ª parte. El título va en mayúsculas y minúsculas.
    cab, _, n = pl.cabecera_exposicion("Fundamentos de la propuesta", [_h("I.1. Técnica"), _p("x")], 0)
    assert n == 1 and "\\seccionlegislativa[I]{Fundamentos de la propuesta}" in cab
    cab, resto, n = pl.cabecera_exposicion("Antecedentes legislativos", [_h("I.17. Antecedentes legislativos y derecho comparado"), _p("x")], 1)
    assert n == 1 and "\\apartadolegislativo[I.17.]{Antecedentes legislativos y derecho comparado}" in cab and len(resto) == 1
    cab, _, n = pl.cabecera_exposicion("Efecto de la vigencia", [_p("x")], 1)
    assert n == 2 and "[II]" in cab
    cab, _, n = pl.cabecera_exposicion("Análisis costo-beneficio", [_h("III.1. Costos"), _p("x")], 2)
    assert n == 3 and "[III]" in cab
    cab, resto, n = pl.cabecera_exposicion("Incidencia ambiental", [_h("IV. INCIDENCIA AMBIENTAL"), _p("x")], 3)
    assert n == 4 and "{Incidencia ambiental}" in cab and "INCIDENCIA" not in cab and len(resto) == 1


# --- Título de la ley y niveles del Manual (2026-10-01) ----------------------

def _doc(*textos):
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": t}]} for t in textos]}


def test_el_titulo_sale_de_la_parte_y_si_no_del_proyecto():
    por = {"titulo": {"clave": "titulo", "titulo": "Título de la ley", "contenido": _doc("Ley que crea el registro", "de protestas")}}
    assert pl.titulo_de_la_ley({"titulo": "titulo 1"}, por) == "Ley que crea el registro de protestas"
    assert pl.titulo_de_la_ley({"titulo": "Ley de fomento"}, {"titulo": {"contenido": _doc()}}) == "Ley de fomento"


def test_proposicion_para_cada_forma_de_titulo():
    assert pl.texto_proposicion("Ley que modifica la Ley 27972") == "que modifica la Ley 27972"
    assert pl.texto_proposicion("Ley Orgánica del Poder Judicial") == "de Ley Orgánica del Poder Judicial"
    assert pl.texto_proposicion("Ley de fomento a la producción cinematográfica") == "de Ley de fomento a la producción cinematográfica"


def test_niveles_de_agrupacion_del_manual():
    for texto, rotulo in [("LIBRO PRIMERO", "LIBRO PRIMERO"), ("SECCIÓN SEGUNDA", "SECCIÓN SEGUNDA"), ("TÍTULO II", "TÍTULO II"),
                          ("CAPÍTULO IV", "CAPÍTULO IV"), ("SUBCAPÍTULO 2", "SUBCAPÍTULO 2")]:
        m = pl.RE_DIVISION.match(texto)
        assert m and f"{m.group(1).upper()} {m.group(2).upper()}" == rotulo


def test_aviso_de_textos_por_completar():
    _, avisos = pl.maestro(
        {"titulo": "Ley que crea", "datos": {}},
        [{"clave": "sustantiva", "titulo": "Parte sustantiva", "contenido": _doc("Artículo 1.- [Epígrafe]")}],
    )
    assert any("por completar" in a and "Parte sustantiva" in a for a in avisos)


def test_salto_de_linea_al_inicio_no_aborta():
    """2026-10-05: un párrafo que es solo un salto de línea (Mayús+Intro en un renglón vacío)
    se componía «\\\\{}» al empezar el párrafo y LaTeX abortaba la vista previa con «There's no
    line here to end». Los saltos al inicio de un párrafo se omiten; el resto se conserva."""
    br = {"type": "hardBreak"}
    solo = {"type": "paragraph", "content": [br]}
    inicio = {"type": "paragraph", "content": [br, br, {"type": "text", "text": "Texto"}, br, {"type": "text", "text": "sigue"}]}
    tex = pl.parte_a_latex("fundamentos", "Fundamentos", [p("Antes."), solo, inicio])
    assert "\\\\{}" not in tex.split("Texto")[0]
    assert "Texto\\\\{}\nsigue" in tex


def test_fotografia_con_rotulo_y_fuente():
    """2026-10-05: el asesor necesita fotografías en la exposición de motivos, con su
    rótulo numerado («FOTOGRAFÍA — N° n»), título y fuente en nota al pie."""
    foto = {"type": "fotografia", "attrs": {"archivo": "0123456789abcdef0123456789abcdef.jpg", "ancho": 0.7,
                                            "titulo": "Cultivo de palta en el valle", "fuente": "Google Maps, 2026."}}
    tex = pl.parte_a_latex("fundamentos", "Fundamentos", [p("Texto."), foto])
    assert "\\fotografia{imagenes/0123456789abcdef0123456789abcdef.jpg}{0.70}{Cultivo de palta en el valle}{Google Maps, 2026.}" in tex
    assert pl.fotografias([sec("fundamentos", "F", [foto])]) == {"0123456789abcdef0123456789abcdef.jpg"}
    # Nunca una ruta: un nombre que no es el del servidor no se compone.
    malo = {"type": "fotografia", "attrs": {"archivo": "../../etc/passwd"}}
    assert "fotografia" not in pl.parte_a_latex("fundamentos", "Fundamentos", [malo])


def test_partes_editables_orden_del_panel_y_partes_nuevas():
    """2026-10-19: la exposición sale en el orden del panel; una parte nueva va sin marcador del
    esquema; la fórmula legal conserva el orden de la técnica legislativa y avisa."""
    proyecto = {"codigo": "PL-2026-002", "titulo": "Ley que prueba", "datos": {"autor": "Nombre Apellido"}}
    def g(clave, titulo, nodos, grupo):
        return {**sec(clave, titulo, nodos, False), "grupo": grupo}
    partes = [
        sec("titulo", "Título", [p("Ley que prueba")]),
        sec("sustantiva", "Parte sustantiva", [h("Artículo 1.- Objeto"), p("x")]),
        g("anexo-formula-2", "Anexo de la fórmula", [h("Artículo 2.- Anexo"), p("y")], "formula"),
        sec("dcm", "Modificatorias", [h("PRIMERA. - Modifica"), p("x")]),
        sec("dcf", "Finales", [h("PRIMERA. - Vigencia"), p("x")]),
        sec("fundamentos", "Fundamentos", [p("f")]),
        g("objetivos-y-sectores", "Objetivos y sectores comprendidos", [p("o")], "exposicion"),
        sec("efecto", "Efecto", [p("e")]),
        sec("costo-beneficio", "Costo", [p("c")]),
        g("anexo-estadistico", "Anexo estadístico", [p("tabla")], "final"),
    ]
    tex, avisos = pl.maestro(proyecto, partes)
    # Fórmula: la parte nueva va tras la sustantiva, con sus artículos y sin marcador; dcf antes que dcm, con aviso.
    assert "\\articulo{2}{Anexo}" in tex and "\\componente{anexo-formula-2}" not in tex
    assert tex.index("\\articulo{2}{Anexo}") < tex.index("\\componente{dcf}") < tex.index("\\componente{dcm}")
    assert any("orden de la técnica legislativa" in a for a in avisos)
    # Exposición: I fundamentos, II la nueva (cabecera directa, sin marcador), III efecto, IV costo.
    assert "\\seccionlegislativa[I]{Fundamentos}" in tex and "\\componente{fundamentos}" in tex
    assert "{\\seccionlegislativa[II]{Objetivos y sectores comprendidos}}" in tex and "\\componente{objetivos-y-sectores}" not in tex
    assert "\\cabeceraexplicita{\\seccionlegislativa[III]{Efecto}}" in tex and "\\seccionlegislativa[IV]{Costo}" in tex
    # Complemento nuevo: hoja propia con rótulo, tras la fecha.
    assert "\\rotulolegislativo{Anexo estad" in tex and tex.index("\\rotulolegislativo{Anexo estad") > tex.index("\\meta{lugar}")
    # Sin antecedentes y con partes: en avance (esquema no exige lo que falta).
    assert "\\proyectoenavance" in tex


def test_exposicion_reordenada_no_rompe_los_marcadores_del_esquema():
    proyecto = {"codigo": "PL-2026-003", "titulo": "Ley que prueba", "datos": {}}
    partes = [
        sec("titulo", "Título", [p("Ley que prueba")]),
        sec("sustantiva", "Parte sustantiva", [h("Artículo 1.- Objeto"), p("x")]),
        sec("efecto", "Efecto", [p("e")]),
        sec("fundamentos", "Fundamentos", [p("f")]),
        sec("antecedentes", "Antecedentes", [p("a")]),
        sec("costo-beneficio", "Costo", [p("c")]),
    ]
    tex, _ = pl.maestro(proyecto, partes)
    # El panel pone «efecto» primero: sale como I con su marcador; «fundamentos» (anterior en el
    # esquema) se imprime como II sin marcador; «antecedentes» igual; «costo-beneficio» sí lo lleva.
    assert tex.index("\\seccionlegislativa[I]{Efecto}") < tex.index("\\seccionlegislativa[II]{Fundamentos}") < tex.index("[III]{Antecedentes}") < tex.index("[IV]{Costo}")
    assert "\\componente{efecto}" in tex and "\\componente{fundamentos}" not in tex and "\\componente{antecedentes}" not in tex and "\\componente{costo-beneficio}" in tex
    assert "\\proyectoenavance" in tex
    # Las claves se contemplan en orden: ningún marcador va hacia atrás.
    marcas = [m for m in ("efecto", "costo-beneficio") if f"\\componente{{{m}}}" in tex]
    assert marcas == ["efecto", "costo-beneficio"]

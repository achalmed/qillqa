"""backend/tests/test_importar_word_documentos.py — «Documentos desde un Word» (2026-10-18): partir un
Word en varios oficios por su encabezado y leer los campos por patrones. Pruebas puras (sin base ni
Word real; los textos son INVENTADOS). Uso: cd backend && .venv/bin/python -m pytest -q tests/test_importar_word_documentos.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import importar_word_documentos as w  # noqa: E402
from app.servicios import notas_normativas as nn  # noqa: E402

OFICIO_1 = [
    "OFICIO N.° ___-2026-DESP/XY",
    "Lima, 3 de octubre de 2026",
    "Señor:",
    "JUAN PRUEBA FICTICIO",
    "Alcalde de la Municipalidad Distrital de Villa Ejemplo",
    "Presente.-",
    "ASUNTO: Solicito información sobre el proyecto de agua potable⟦1⟧",
    "REFERENCIA: Oficio N.° 0045-2026-MDVE/A",
    "Es grato dirigirme a usted para saludarlo y solicitarle remitir la información del proyecto.",
    "Agradeceré su atención en el plazo de ley.",
    "Atentamente,",
    "c.c.: Presidencia de la Cámara",
    "Comisión de Vivienda",
    "EAC/jp",
]
OFICIO_2 = [
    "CARTA N.° ___-2026-DESP/XY",
    "Lima, 4 de octubre de 2026",
    "Señora:",
    "ROSA EJEMPLO QUISPE",
    "Directora Ejecutiva",
    "Fundación de Prueba",
    "Presente.-",
    "ASUNTO: Invitación a la mesa de trabajo",
    "Tengo el agrado de invitarla a la mesa de trabajo del 20 de octubre.",
    "Cordialmente,",
    "Adj.: programa de la mesa",
]


def test_partir_por_encabezados():
    trozos = w.partir(OFICIO_1 + OFICIO_2)
    assert len(trozos) == 2 and trozos[0][0].startswith("OFICIO") and trozos[1][0].startswith("CARTA")
    # Sin encabezados, todo es un documento; un encabezado al inicio no abre uno vacío.
    assert len(w.partir(OFICIO_1[1:])) == 1
    assert len(w.partir(["", "OFICIO N.° 1-2026", "texto"])) == 1


def test_leer_campos_del_oficio():
    tipo, campos, cuerpo, avisos = w.leer_campos(OFICIO_1)
    assert tipo == "oficio"
    assert campos["lugar"] == "Lima" and campos["fecha"] == "2026-10-03"
    assert campos["destinatario_tratamiento"] == "Señor:" and campos["destinatario_nombre"] == "JUAN PRUEBA FICTICIO"
    assert campos["destinatario_cargo"].startswith("Alcalde")
    assert campos["asunto"] == "Solicito información sobre el proyecto de agua potable"   # sin la marca de nota
    assert campos["referencia"] == "Oficio N.° 0045-2026-MDVE/A"
    assert [w._sin_notas(p) for p in cuerpo] == ["Es grato dirigirme a usted para saludarlo y solicitarle remitir la información del proyecto.", "Agradeceré su atención en el plazo de ley."]
    assert campos["con_copia"] == "Presidencia de la Cámara\nComisión de Vivienda" and campos["iniciales"] == "EAC/jp"
    assert avisos == []


def test_leer_campos_de_la_carta_y_avisos():
    tipo, campos, cuerpo, avisos = w.leer_campos(OFICIO_2)
    assert tipo == "carta" and campos["destinatario_tratamiento"] == "Señora:"
    assert campos["destinatario_institucion"] == "Fundación de Prueba" and campos["anexo"] == "programa de la mesa"
    assert len(cuerpo) == 1 and avisos == []
    tipo, campos, cuerpo, avisos = w.leer_campos(["MEMORANDO N.° 5-2026", "Texto suelto sin nada más"])
    assert tipo == "memorando" and "destinatario" in avisos[0] and "ASUNTO" in avisos[1]


def test_nota_normativa_se_ofrece_solo_donde_corresponde():
    cuerpo = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Solicito remitir la información del proyecto."}]}]}
    si = nn.sugerir("oficio", {"asunto": "Pedido de información"}, cuerpo, verificar=lambda cid: cid == 10090)
    assert len(si) == 1 and si[0]["clave"] == "pedido_informacion_art159" and si[0]["ya_presente"] is False
    assert "artículo 159, literal e), segundo párrafo" in si[0]["texto"] and si[0]["fuente"]["calibre_id"] == 10090
    # Otro tipo, o un oficio que no pide información: nada. Sin la fuente en la biblioteca: nada.
    assert nn.sugerir("memorando", {"asunto": "Pedido de información"}, cuerpo, verificar=lambda _: True) == []
    assert nn.sugerir("oficio", {"asunto": "Invitación"}, {"type": "doc", "content": []}, verificar=lambda _: True) == []
    assert nn.sugerir("oficio", {"asunto": "Pedido de información"}, cuerpo, verificar=lambda _: False) == []
    # Ya puesta: se informa, no se ofrece otra vez.
    con_nota = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Solicito información"}, {"type": "footnote", "attrs": {"texto": "… la Mesa Directiva procede a la reiteración del pedido …"}}]}]}
    assert nn.sugerir("oficio", {}, con_nota, verificar=lambda _: True)[0]["ya_presente"] is True


def test_los_tipos_de_la_nota_son_un_ajuste():
    cuerpo = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Reiteramos el pedido de informe sobre la obra."}]}]}
    # De fábrica: solo los oficios (Edison, 2026-10-19); una carta o un memorando no la llevan. El ajuste manda.
    assert nn.sugerir("oficio_multiple", {}, cuerpo, verificar=lambda _: True)
    assert nn.sugerir("carta", {}, cuerpo, verificar=lambda _: True) == []
    assert nn.sugerir("memorando", {}, cuerpo, verificar=lambda _: True) == []
    assert nn.sugerir("memorando", {}, cuerpo, verificar=lambda _: True, tipos={"pedido_informacion_art159": ["memorando"]})
    assert nn.sugerir("oficio", {}, cuerpo, verificar=lambda _: True, tipos={"pedido_informacion_art159": ["memorando"]}) == []
    cat = nn.catalogo({"pedido_informacion_art159": ["oficio"]})
    assert cat[0]["tipos"] == ["oficio"] and cat[0]["tipos_defecto"] == ["oficio", "oficio_multiple", "oficio_bancada", "oficio_multiple_bancada"]

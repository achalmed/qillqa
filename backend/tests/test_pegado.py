"""backend/tests/test_pegado.py — el mecanismo común de «pegar el resultado de un prompt»
(servicios/pegado): esquemas del contrato, lector del bloque YAML y del mensaje con
rótulos, validación (tipos, vocabularios, obligatorios, null), asignación a los campos
del formulario y diferencias campo a campo.

Pruebas puras (sin base de datos). Los textos son INVENTADOS.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_pegado.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import pytest  # noqa: E402

from app.servicios import pegado  # noqa: E402
from app.servicios.pegado import validar as v  # noqa: E402
from app.servicios.pegado.asignar import con_anexos  # noqa: E402
from app.servicios.pegado.comparar import aplicar, etiquetas_de  # noqa: E402
from tests.test_entradas import AGENDA, COMUNICADO  # noqa: E402

RECIBIDO = """Aquí va el resultado del prompt:

```yaml
tipo: documento-recibido
version: 1
documento: "Oficio N.º 0234-2026-MDVE/A"
clase: Oficio
via: Correo institucional
remitente: Juan Prueba Ficticio
remitente_cargo: Alcalde
remitente_institucion: Municipalidad Distrital de Villa Ejemplo
fecha_documento: 12/08/2026
fecha_recepcion: 2026-08-14
std_numero: "0004521"
dirigido_a: Despacho congresal
asunto: Solicito interceder ante el MEF para el proyecto de agua potable de Los Pinos
referencia: null
resumen: |
  Proyecto CUI 1234567 por un millón de soles.
  Gestiones previas sin respuesta.
atencion: gestionar
plazo: 22/08/2026
prioridad: urgente
origen: externo
accion_requerida: Gestionar ante el MEF la priorización del proyecto
norma: NO INDICA
agenda: null
observaciones:
  - La fecha de recepción se tomó del correo.
```

📌 NUEVO DOCUMENTO RECIBIDO
📄 Oficio N.º 0234-2026-MDVE/A
"""


def test_los_esquemas_cargan_y_resuelven_bloques():
    es = pegado.cargar()
    assert {"documento-recibido", "agenda-actividades", "seguimiento-documento", "registro-representacion",
            "proyecto-de-ley", "documento-administrativo"} <= set(es)
    agenda = es["agenda-actividades"]
    assert "titulo" in agenda.bloque("actividad")
    # Un esquema de otro archivo: documento-recibido → agenda-actividades/actividad.
    assert es["documento-recibido"].campos["agenda"]["esquema"] == "agenda-actividades/actividad"
    assert "inicio" in es["documento-recibido"].bloque("agenda-actividades/actividad")
    assert any(f["tipo"] == "documento-recibido" for f in pegado.formatos())


def test_extraer_bloque_con_cerca_sin_cerca_y_sin_bloque():
    b, resto = pegado.extraer_bloque(RECIBIDO)
    assert b.startswith("tipo: documento-recibido") and "observaciones" in b
    assert resto.startswith("Aquí va") and "NUEVO DOCUMENTO RECIBIDO" in resto and "```" not in resto
    sin_cerca = "tipo: agenda-actividades\nversion: 1\nactividades:\n  - titulo: Sesión\n    inicio: 2026-10-20 10:00\n\nMensaje para el grupo"
    b2, resto2 = pegado.extraer_bloque(sin_cerca)
    assert b2.endswith("inicio: 2026-10-20 10:00") and resto2 == "Mensaje para el grupo"
    assert pegado.extraer_bloque("hola") == ("", "hola")


def test_recibido_yaml_se_valida_y_normaliza():
    le = pegado.interpretar(RECIBIDO, ("documento-recibido",))
    assert le.valido and le.fuente == "yaml" and le.tipo == "documento-recibido"
    val = le.valores
    assert val["clase"] == "oficio" and val["via"] == "correo"           # vocabulario y sinónimo
    assert val["atencion"] == "interceder"                                 # sinónimo «gestionar»
    assert val["prioridad"] == "alta"                                      # sinónimo «urgente»
    assert val["fecha_documento"] == "2026-08-12" and val["fecha_recepcion"] == "2026-08-14"
    assert val["plazo"] == "2026-08-22" and val["std_numero"] == "0004521"
    assert "referencia" not in val and "norma" not in val and "agenda" not in val   # null / NO INDICA
    assert val["observaciones"] == ["La fecha de recepción se tomó del correo."]
    assert "Proyecto CUI 1234567" in val["resumen"]
    assert le.resto.startswith("Aquí va") and le.texto == RECIBIDO


def test_asignar_reparte_destinos_anexos_e_informativos():
    le = pegado.interpretar(RECIBIDO)
    campos, anexos, info = pegado.asignar(le)
    assert campos["asunto"].startswith("Solicito interceder") and campos["clase"] == "oficio"
    assert "remitente_institucion" not in campos and "prioridad" not in campos    # destino null
    assert anexos["nota"] == ["Dirigido a: Despacho congresal", "Prioridad: alta", "Origen: externo",
                              "Acción requerida: Gestionar ante el MEF la priorización del proyecto"]
    assert info["observaciones"] == ["La fecha de recepción se tomó del correo."]
    final = con_anexos(campos, anexos, {"nota": "Prioridad: alta"})
    assert final["nota"].startswith("Prioridad: alta\nDirigido a:") and final["nota"].count("Prioridad") == 1


def test_comparar_estados_y_aplicar():
    le = pegado.interpretar(RECIBIDO)
    campos, _, _ = pegado.asignar(le)
    actual = {"asunto": "", "clase": "carta", "std_numero": "0004521", "via": ""}
    dif = pegado.comparar(campos, actual, etiquetas_de(le.esquema), dudosos={"atencion"})
    por = {d["clave"]: d for d in dif}
    assert por["asunto"]["estado"] == "nuevo" and por["asunto"]["aceptar"]
    assert por["clase"]["estado"] == "distinto" and por["clase"]["actual"] == "carta"
    assert "std_numero" not in por                                        # igual: no se lista
    assert por["atencion"]["estado"] == "dudoso" and not por["atencion"]["aceptar"]
    assert por["asunto"]["etiqueta"] == "Asunto" and por["remitente_cargo"]["etiqueta"] == "Cargo del remitente"
    aplicado = aplicar(dif, actual)
    assert aplicado["clase"] == "oficio" and aplicado["atencion"] if "atencion" in aplicado else True
    assert aplicado["std_numero"] == "0004521" and "atencion" not in aplicado


def test_errores_claros_formato_desconocido_yaml_roto_y_tipo_no_admitido():
    nada = pegado.interpretar("Les comparto el oficio que llegó hoy.")
    assert not nada.valido and "tipo: …" in nada.errores[0] and "documento-recibido" in nada.errores[0]
    roto = pegado.interpretar("tipo: documento-recibido\nasunto: a · origen: b\n  :mal")
    assert not roto.valido and "YAML" in roto.errores[0]
    otro = pegado.interpretar("tipo: agenda-actividades\nversion: 1\nactividades: []", ("documento-recibido",))
    assert not otro.valido and "no acepta" in otro.errores[0]
    inexistente = pegado.interpretar("tipo: factura\nversion: 1")
    assert not inexistente.valido and "no existe" in inexistente.errores[0]
    sin_obligatorio = pegado.interpretar("tipo: documento-recibido\nversion: 1\nremitente: Alguien")
    assert not sin_obligatorio.valido and "Asunto" in sin_obligatorio.errores[0]


def test_dudas_claves_desconocidas_y_version():
    le = pegado.interpretar("tipo: documento-recibido\nversion: 3\nasunto: Prueba\nclase: telegrama\ncolor: rojo")
    assert le.valido  # las dudas no son errores
    assert "clase" in le.dudas and le.dudas["clase"]["valor"] == "telegrama" and "oficio" in le.dudas["clase"]["opciones"]
    assert any("desconocida «color»" in a for a in le.avisos) and any("version 3" in a for a in le.avisos)
    assert "clase" not in le.valores


def test_mensaje_con_rotulos_sigue_valiendo_como_documento_recibido():
    le = pegado.interpretar(COMUNICADO, ("documento-recibido",))
    assert le.valido and le.fuente == "rotulos"
    assert le.valores["asunto"].startswith("Solicito interceder") and le.valores["atencion"] == "interceder"
    ag = pegado.interpretar(AGENDA)
    assert ag.valido and ag.valores["agenda"]["titulo"].startswith("Décima Sesión") and ag.valores["agenda"]["inicio"] == "2026-09-03T18:30:00"
    # En un formulario que no admite recibidos, el mensaje con rótulos no se reconoce.
    assert not pegado.interpretar(COMUNICADO, ("agenda-actividades",)).valido


AGENDA_YAML = """tipo: agenda-actividades
version: 1
actividades:
  - titulo: Sesión ordinaria de la Comisión de Educación
    tipo: sesión de comisión
    inicio: 2026-09-03 18:30
    fin: 2026-09-03 20:00
    lugar: Sala Grau
    modalidad: híbrida
    participa:
      - Diputado titular
    documento: Oficio N.º 1120-2026-CR/CEA
    recordatorio: 60
  - titulo: Ceremonia por el aniversario del distrito
    inicio: 15/09/2026
    todo_el_dia: sí
    tipo: invitación
  - titulo: Sin fecha
    inicio: cuando se pueda
observaciones: []
"""


def test_agenda_lista_de_bloques_con_tipos_sinonimos_y_error_por_fila():
    le = pegado.interpretar(AGENDA_YAML, ("agenda-actividades",))
    assert not le.valido  # la tercera actividad no tiene fecha legible
    assert any("actividades[3]" in e or "Inicio" in e for e in le.errores)
    a1, a2 = le.valores["actividades"][0], le.valores["actividades"][1]
    assert a1["tipo"] == "comision" and a1["modalidad"] == "mixta" and a1["inicio"] == "2026-09-03T18:30:00"
    assert a1["fin"] == "2026-09-03T20:00:00" and a1["recordatorio"] == 60 and a1["participa"] == ["Diputado titular"]
    assert a2["tipo"] == "externa" and a2["inicio"] == "2026-09-15" and a2["todo_el_dia"] is True
    le2 = pegado.interpretar(AGENDA_YAML.replace("  - titulo: Sin fecha\n    inicio: cuando se pueda\n", ""))
    assert le2.valido and len(le2.valores["actividades"]) == 2


SEGUIMIENTO = """tipo: seguimiento-documento
version: 1
documento: OF-0123-2026-2027
expediente_entidad: HT-2026-004512
estado_propuesto: en trámite
ubicacion: Oficina de Planeamiento
plazo_legal:
  norma: TUO de la Ley 27444
  articulo: "35"
  dias: 30
  desde: 2026-09-01
  vence: 2026-10-13
actuaciones:
  - fecha: 2026-09-01
    clase: presentación
    texto: Ingresó por mesa de partes virtual
    fuente: cargo
  - fecha: 2026-09-20
    clase: llamada telefónica
    texto: Se consultó el estado; está en la oficina de planeamiento
respuestas:
  - fecha: 2026-10-01
    documento: Oficio N.º 555-2026-ENTIDAD
    std_numero: "0009988"
    completa: no
pendientes:
  - Reiterar si no responde al 13 de octubre
proxima_revision: 2026-10-14
"""


def test_seguimiento_bloques_anidados_y_vocabularios():
    le = pegado.interpretar(SEGUIMIENTO, ("seguimiento-documento",))
    assert le.valido
    assert le.valores["estado_propuesto"] == "en_tramite"
    assert le.valores["plazo_legal"] == {"norma": "TUO de la Ley 27444", "articulo": "35", "dias": 30, "desde": "2026-09-01", "vence": "2026-10-13"}
    act = le.valores["actuaciones"]
    assert [a["clase"] for a in act] == ["envio", "llamada"]
    assert le.valores["respuestas"][0]["completa"] is False and le.valores["respuestas"][0]["std_numero"] == "0009988"
    campos, anexos, info = pegado.asignar(le)
    assert campos["expediente_entidad"] == "HT-2026-004512" and campos["actuaciones"] == act and campos["plazo_legal"]["dias"] == 30
    assert anexos["std_nota"] == ["Dónde está: Oficina de Planeamiento"]
    assert info["estado_propuesto"] == "en_tramite" and info["proxima_revision"] == "2026-10-14" and info["respuestas"]


@pytest.mark.parametrize("entrada, salida", [
    ("2026-10-11", "2026-10-11"), ("11/10/2026", "2026-10-11"), ("3 de octubre de 2026", "2026-10-03"),
    ("2026-10-11 15:30", "2026-10-11"), ("hoy", ""), ("2026-13-01", ""),
])
def test_fechas_en_todas_sus_formas(entrada, salida):
    assert v.fecha(entrada) == salida


def test_fecha_hora_y_hora():
    assert v.fecha_hora("2026-10-11 15:30") == ("2026-10-11", "15:30")
    assert v.fecha_hora("2026-10-11T09:05:00") == ("2026-10-11", "09:05")
    assert v.fecha_hora("11/10/2026 6:30 p. m.") == ("2026-10-11", "18:30")
    assert v.fecha_hora("11/10/2026") == ("2026-10-11", "")
    assert v.hora("9:00") == "09:00" and v.hora("6:30 pm") == "18:30" and v.hora("nunca") == ""
    assert v.lista("a; b\n- c") == ["a", "b", "c"] and v.lista(None) == [] and v.booleano("Sí") is True


def test_referencia_y_adjuntos_sin_fecha_anexos_ni_paginas():
    # Edison, 2026-10-18: la IA escribió la Referencia y el «Adj.» con fecha, «y anexos» y páginas.
    texto = """```yaml
tipo: documento-administrativo
version: 1
tipo_documental: oficio
asunto: "Solicita evaluar acciones de control"
referencia:
  - "Oficio Múltiple Nº 007-2026-ENTIDAD-X/P, de 15 de octubre de 2026, y anexos (31 páginas del archivo remitido)."
cuerpo: |
  Es grato dirigirme a usted.
anexo:
  - "Oficio Múltiple Nº 007-2026-ENTIDAD-X/P, de 15 de octubre de 2026, y anexos (31 páginas del archivo remitido)."
```"""
    le = pegado.interpretar(texto, ("documento-administrativo",))
    assert le.valido, le.errores
    campos, _, _ = pegado.asignar(le)
    assert campos["referencia"] == ["Oficio Múltiple Nº 007-2026-ENTIDAD-X/P"]
    assert campos["anexo"] == ["Oficio Múltiple Nº 007-2026-ENTIDAD-X/P"]
    assert any("solo la denominación y el número" in a for a in le.avisos)


RECIBIDO_V2 = """```yaml
tipo: documento-recibido
version: 2
documento: "Oficio N.º 0301-2026-FTR/P"
clase: oficio
categoria: pronunciamiento
categoria_confianza: baja
categoria_alternativas: [comunicacion, seguimiento]
relacion: continuacion
expediente: "EXP-2026-0045"
reunion: "Mesa de trabajo con transportistas (2026-10-10)"
via: std
remitente: "Pedro Prueba"
remitente_cargo: Presidente
remitente_institucion: "Federación de Transportistas de Prueba"
fecha_documento: 2026-10-15
fecha_recepcion: 2026-10-16
std_numero: "0005120"
dirigido_a: Despacho
asunto: Posición del gremio tras la mesa de trabajo
referencia: null
resumen: Reitera los acuerdos de la mesa.
atencion: conocimiento
plazo: null
prioridad: media
origen: externo
accion_requerida: null
norma: null
agenda: null
observaciones: []
```
"""


def test_recibido_v2_trae_categoria_confianza_alternativas_y_cruces():
    le = pegado.interpretar(RECIBIDO_V2, ("documento-recibido",))
    assert le.valido and le.version == 2
    val = le.valores
    assert val["categoria"] == "pronunciamiento" and val["categoria_confianza"] == "baja"
    assert val["categoria_alternativas"] == ["comunicacion", "seguimiento"]
    assert val["relacion"] == "continuacion" and val["expediente"] == "EXP-2026-0045"
    assert val["reunion"].startswith("Mesa de trabajo")
    campos, anexos, informativos = pegado.asignar(le)
    assert campos["categoria"] == "pronunciamiento"          # va a la ficha
    assert "categoria_confianza" not in campos and "expediente" not in campos   # solo cruces e informativos
    assert any("continuacion" in str(v) for v in anexos.values())  # la relación se anexa a la nota
    # Un sinónimo de categoría se normaliza; uno desconocido es una duda con las opciones del vocabulario.
    le2 = pegado.interpretar(RECIBIDO_V2.replace("categoria: pronunciamiento", "categoria: respuesta de gremio"), ("documento-recibido",))
    assert le2.valores["categoria"] == "pronunciamiento"
    le3 = pegado.interpretar(RECIBIDO_V2.replace("categoria: pronunciamiento", "categoria: cosa rara"), ("documento-recibido",))
    assert "categoria" in le3.dudas and set(le3.dudas["categoria"]["opciones"]) == {"comunicacion", "respuesta", "invitacion", "seguimiento", "pronunciamiento", "anexo"}

"""backend/tests/test_semanas_sr.py — la semana de representación dentro del sistema (2026-10-02):
ida y vuelta exacta entre los YAML del expediente y la estructura que guarda la base."""
import os
from pathlib import Path

import yaml

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import semanas_sr as sr  # noqa: E402

MARCO = Path(__file__).resolve().parents[2] / "marco_documental"

INFORME = """codigo: ISR-03
numero: 3
anio: 2026
mes: 10
version: "0.1"
estado: borrador
fecha_inicio: 2026-10-19
fecha_fin: 2026-10-23
presentacion: |
  Texto con «comillas» de la entidad, que no es un marcador.
resumen: |
  «Tres párrafos: ámbito y agenda.»
dias:
  - fecha: 2026-10-19
    kicker: "Día 1"
    relato: "Crónica."
"""
ACTIVIDADES = """dias:
  - {fecha: 2026-10-19, nombre: lunes, ambito: "Distrito A"}
actividades:
  - id: A-01
    fecha: 2026-10-19
    tipo: visita_ie
    sector: educacion
    hora_inicio: "08:00"
    hora_fin: null
    pedidos: [P-001]
"""
PEDIDOS = """pedidos:
  - id: P-001
    actividad: A-01
    fecha: 2026-10-19
    prioridad_propuesta: alta
    estado: registrado
    entidades: [Entidad A]
"""
FOTOS = """_meta:
  banco: /tmp/banco
portada: null
fotos:
  - {id: F-001, origen: a/1.jpg, actividad: A-01, estado: publica, seleccion: true, pie: Pie}
"""


def _expediente(raiz: Path, nombre="2026-10_SR-03_prueba") -> Path:
    c = raiz / nombre
    (c / "datos").mkdir(parents=True)
    for archivo, texto in (("informe", INFORME), ("actividades", ACTIVIDADES), ("pedidos", PEDIDOS), ("fotos", FOTOS)):
        (c / "datos" / f"{archivo}.yaml").write_text(texto, encoding="utf-8")
    (c / "expediente.yaml").write_text(
        "id: SR-03\nestado: activo\nperiodo: {inicio: 2026-10-19, fin: 2026-10-23}\n", encoding="utf-8")
    return c


def test_ida_y_vuelta_exacta(tmp_path):
    origen = _expediente(tmp_path / "a")
    e = sr.leer(origen)
    # La base solo ve JSON: fechas como texto ISO; las horas siguen siendo texto.
    assert e["actividades"][0]["fecha"] == "2026-10-19" and e["actividades"][0]["hora_inicio"] == "08:00"
    assert e["resto"]["actividades"]["dias"][0]["fecha"] == "2026-10-19"
    destino = tmp_path / "b" / origen.name
    sr.escribir(destino, e)
    for relativa in ("expediente.yaml", "datos/informe.yaml", "datos/actividades.yaml",
                     "datos/pedidos.yaml", "datos/fotos.yaml"):
        assert yaml.safe_load((origen / relativa).read_text()) == yaml.safe_load((destino / relativa).read_text())
    assert "GENERADO por Qillqa" in (destino / "datos/pedidos.yaml").read_text().splitlines()[0]
    assert not list(destino.rglob("*.tmp"))


def test_carpeta_no_valida(tmp_path):
    (tmp_path / "otra").mkdir()
    try:
        sr.leer(tmp_path / "otra")
    except sr.ErrorSemana:
        return
    raise AssertionError("debía rechazar una carpeta que no es AAAA-MM_SR-NN_slug")


def test_vaciar_y_pendientes(tmp_path):
    e = sr.vaciar(sr.leer(_expediente(tmp_path)))
    assert e["actividades"] == e["pedidos"] == e["fotos"] == []
    assert e["informe"]["dias"] == [] and e["resto"]["actividades"]["dias"] == []
    plantilla = {"resumen": "«Tres párrafos: ámbito y agenda.»\n", "presentacion": "«Carta.»\n", "dias": []}
    # Sigue igual a la plantilla → pendiente; la presentación ya se escribió (aunque lleve «»).
    assert sr.pendientes(e["informe"], plantilla) == ["resumen"]


def test_codigos_resumen_y_carpeta():
    assert sr.siguiente_codigo("pedidos", ["P-001", "P-009"]) == "P-010"
    assert sr.siguiente_codigo("actividades", []) == "A-01"
    assert sr.siguiente_codigo("fotos", ["F-129", "x"]) == "F-130"
    assert sr.resumen_pedidos([{"estado": "registrado"}, {"estado": "derivado"}, {"estado": "derivado"}]) == {
        "total": 3, "registrados": 1, "derivados": 2, "respondidos": 0, "cerrados": 0}
    assert sr.carpeta_de(2026, 10, 3, "Huanta y La Mar") == "2026-10_SR-03_huanta-y-la-mar"


def test_validar_con_los_vocabularios_del_generador(tmp_path):
    cfg = sr.config_generador(str(MARCO))
    e = sr.leer(_expediente(tmp_path))
    assert sr.validar(e, cfg) == []
    e["pedidos"][0]["actividad"] = "A-99"
    e["actividades"][0]["sector"] = "otro"
    errores = sr.validar(e, cfg)
    assert any("P-001" in x for x in errores) and any("sector" in x for x in errores)
    voc = sr.vocabularios(str(MARCO))
    assert "educacion" in {s["valor"] for s in voc["sectores"]} and voc["prioridades"][0] == "urgente"


def test_textos_automaticos_y_su_mantenimiento():
    auto = sr.textos_automaticos(2, "2026-09-21", ["Víctor Fajardo", "Cangallo", "Huanta"], "2026-09-25", "Región X")
    assert auto["titulo_documento"] == "Informe de Semana de Representación N.º 02 · Septiembre de 2026"
    assert auto["periodo_texto"] == "21 al 25 de septiembre de 2026"
    assert auto["ambito_texto"] == "Provincias de Víctor Fajardo, Cangallo y Huanta · Región X"
    assert sr.texto_periodo("2026-09-29", "2026-10-03") == "29 de septiembre al 3 de octubre de 2026"
    assert sr.region_de("Provincias de «…» · Región X") == "Región X" and sr.region_de("sin región") == ""
    # Se reescribe solo lo vacío, lo de plantilla o lo que el sistema escribió antes.
    assert sr.es_automatico("", []) and sr.es_automatico("«…»", [])
    assert sr.es_automatico("A", ["A"]) and not sr.es_automatico("Escrito a mano", ["A"])


def test_dias_de_conserva_el_ambito():
    dias = sr.dias_de("2026-10-19", "2026-10-21", [{"fecha": "2026-10-20", "nombre": "martes", "ambito": "Huanta"}])
    assert [d["fecha"] for d in dias] == ["2026-10-19", "2026-10-20", "2026-10-21"]
    assert dias[0]["nombre"] == "lunes" and dias[1]["ambito"] == "Huanta"


def test_pendientes_solo_de_la_edicion_publica():
    plantilla = {"resumen": "«Tres párrafos.»", "metodologia": "«Fuentes.»", "portada_codigo": "«descripción»"}
    informe = dict(plantilla)
    assert sr.pendientes(informe, plantilla) == ["resumen", "portada_codigo"]  # metodología es solo interna
    informe["foto_portada"] = "F-001"
    assert sr.pendientes(informe, plantilla) == ["resumen"]  # con foto, el texto de reserva no se imprime


def test_error_del_generador_dicho_para_quien_redacta():
    from app.servicios.generador_sr import explicar
    msg = explicar("...\n./parte_09_seguimiento.tex:9: LaTeX Error: Something's wrong--perhaps a missing \\item.\n")
    assert msg.startswith("El PDF no se pudo componer en la sección «compromisos y seguimiento»")
    assert "Registro técnico" in explicar("ERROR: Datos inválidos:\n  - P-001: elija la actividad")

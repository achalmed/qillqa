"""backend/tests/test_yupay_en_qillqa.py — lo del lado de Qillqa de Rendición de cuentas (Yupay, en su repositorio desde el
2026-10-22; sus pruebas, en ../yupay/tests): el marco de Yupay escapa igual que el marco documental de Qillqa, el pegado
de Qillqa interpreta su esquema (app/esquemas/pegado/comprobantes-gasto.yml) y el Mapa une las rendiciones que llegan
por «rendiciones.v1».
"""
import pytest
from yupay.marco import escape

from qillqasqa.latex import serializador
from app.servicios import grafo

MUESTRAS = ["", "Pérez & Cía. 50% #1 a_b {x} ~^\\", "S/ 1,600.00 — «viáticos»", "\u00a0nbsp\u200b cero\ufeff",
            "→ ≤ ≥ ✓ \uf0b0 \uf0b7", "dos\nlíneas\r\n\n\ny más", "emoji 😀 fuera", "e\u0301 compuesta"]


@pytest.mark.parametrize("texto", MUESTRAS)
def test_escapa_igual_que_el_marco_documental(texto):
    assert escape.escapar(texto) == serializador.escapar(texto)
    assert escape.escapar_linea(texto) == serializador.escapar_linea(texto)


def test_pegado_comprobantes_gasto():
    from app.servicios import pegado

    texto = """```yaml
tipo: comprobantes-gasto
version: 1
comprobantes:
  - fecha: 24/08/2026
    tipo: Boleta de venta electrónica
    serie: EB01
    numero: "0001"
    ruc: "20000000001"
    proveedor: Proveedor SAC
    concepto: hotel
    importe: S/ 140.00
    legible: true
  - fecha: 2026-08-25
    tipo: ticket de máquina registradora
    numero: 33
    concepto: refrigerio
    importe: "12,50"
movilidad:
  - fecha: 2026-08-24
    hora: "07:30"
    desde: Hospedaje
    hasta: Plaza de Armas
    monto: 8
observaciones: []
```"""
    le = pegado.interpretar(texto, ("comprobantes-gasto",))
    assert le.valido, le.errores
    c = le.valores["comprobantes"]
    assert c[0]["concepto"] == "hospedaje" and c[0]["importe"] == 140.0 and c[0]["fecha"] == "2026-08-24"
    assert c[1]["tipo"] == "ticket" and c[1]["concepto"] == "otros_alimentacion" and c[1]["importe"] == 12.5
    assert le.valores["movilidad"][0]["monto"] == 8.0 and le.valores["movilidad"][0]["hora"] == "07:30"
    malo = pegado.interpretar(texto.replace("importe: S/ 140.00", "importe: ilegible"), ("comprobantes-gasto",))
    assert not malo.valido


def test_grafo_une_la_rendicion_con_su_semana_memorando_comisionado_y_comision():
    base = {"nodos": [{"id": "sr:1", "tipo": "semana", "grado": 0}, {"id": "doc:7", "tipo": "documento", "grado": 0}], "aristas": []}
    rends = [{"id": 1, "codigo": "R-001", "comisionado": "Ana Pérez", "corto": "Ana", "usuario_id": 4, "semana_id": 1,
              "documento_id": 7, "comision_id": 2, "estado": "Borrador", "titulo": "SR-01 · tema"},
             {"id": 2, "codigo": "R-002", "comisionado": "Luis Rojas", "corto": "Luis", "usuario_id": 5, "semana_id": 1,
              "documento_id": 9, "comision_id": 2, "estado": "Borrador", "titulo": "SR-01 · tema"}]
    g = grafo.unir_rendiciones(base, rends)
    pares = {(a["source"], a["target"], a["tipo"]) for a in g["aristas"]}
    assert ("rend:1", "sr:1", "rendicion_semana") in pares and ("rend:1", "doc:7", "rendicion_memorando") in pares
    assert ("usuario:4", "rend:1", "comisionado") in pares and ("rend:1", "rend:2", "comision") in pares
    assert not any(t == "doc:9" for _s, t, _x in pares)   # el memorando que no está en el mapa (oculto) no se inventa
    local = grafo.vecindad(g, "rend:1")
    local = grafo.agregar_sustentos(local, 1, 12, [{"id": 3, "descripcion": "Boleto aéreo", "archivo": "anexos/boleto_x.pdf"}], "RV.pdf")
    ids = {n["id"] for n in local["nodos"]}
    assert {"comprobantes:1", "anexo_rendicion:3", "anexos_pdf:1", "rend:2", "sr:1", "usuario:4"} <= ids
    comprobantes = next(n for n in local["nodos"] if n["id"] == "comprobantes:1")
    assert comprobantes["ruta"] == "/rendiciones/1?ver=comprobantes" and comprobantes["etiqueta"] == "12 comprobantes"

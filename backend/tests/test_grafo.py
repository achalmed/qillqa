"""backend/tests/test_grafo.py — coincidencias de texto del mapa de relaciones (servicios/grafo.py).

Pruebas puras (sin base de datos). Uso: cd backend && .venv/bin/python -m pytest -q
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import grafo  # noqa: E402


def test_nombre_de_persona_sin_grados_ni_cargo():
    assert grafo.nombre_de_persona("Óscar  de Jesús Ramos Ortega") == "oscar de jesus ramos ortega"
    assert grafo.nombre_de_persona("Juan Pérez — Ministro de Trabajo") == "juan perez"
    assert grafo.nombre_de_persona("General de Brigada EP Luis Enrique Vásquez Guerrero") == "luis enrique vasquez guerrero"
    assert grafo.nombre_de_persona("Brigadier General CBP Juan Carlos Morales Carpio") == "juan carlos morales carpio"
    assert grafo.nombre_de_persona("Dr. Ana Quispe, Rectora") == "ana quispe"


def test_clave_numero_iguala_las_formas_de_escribir_el_numero():
    a = grafo.clave_numero("Oficio N°0095-2026-2027-ABC-CD/CRP")
    assert a == grafo.clave_numero("OFICIO N° 0095-2026-2027-ABC-CD/CRP")
    assert a == grafo.clave_numero("Oficio Nº0095-2026-2027-ABC-CD/CRP")
    assert a in grafo.clave_numero("Oficio N.° 0095-2026-2027-ABC-CD/CRP; Ley N° 29664")


def test_grafo_descarta_aristas_sueltas_y_directorio_sin_relaciones():
    g = grafo.Grafo()
    g.nodo("doc:1", tipo="documento")
    g.nodo("persona:1", tipo="persona")
    g.nodo("persona:2", tipo="persona")
    g.arista("doc:1", "persona:1", "destinatario", False)
    g.arista("doc:1", "persona:9", "destinatario", False)  # nodo inexistente
    g.arista("doc:1", "doc:1", "referencia", False)  # a sí mismo
    salida = g.salida()
    assert {n["id"] for n in salida["nodos"]} == {"doc:1", "persona:1"}
    assert len(salida["aristas"]) == 1 and salida["aristas"][0]["fiable"] is False


def test_vecindad_a_uno_y_dos_saltos_sin_copias():
    datos = {
        "nodos": [{"id": i} for i in ("a", "b", "c", "d", "ofi")],
        "aristas": [
            {"source": "a", "target": "b", "tipo": "destinatario"},
            {"source": "b", "target": "c", "tipo": "trabaja_en"},
            {"source": "c", "target": "d", "tipo": "trabaja_en"},
            {"source": "a", "target": "ofi", "tipo": "copia"},
        ],
    }
    uno = grafo.vecindad(datos, "a", 1)
    assert {n["id"] for n in uno["nodos"]} == {"a", "b"}
    dos = grafo.vecindad(datos, "a", 2)
    assert {n["id"] for n in dos["nodos"]} == {"a", "b", "c"}
    assert all(a["tipo"] != "copia" for a in dos["aristas"])


def _adjunto(id, documento_id, categoria="", relacion_id=None, nombre="archivo.pdf", etiqueta=""):
    from datetime import datetime, timezone
    from types import SimpleNamespace

    return SimpleNamespace(
        id=id, documento_id=documento_id, categoria=categoria, relacion_id=relacion_id,
        nombre_original=nombre, etiqueta=etiqueta, subido_en=datetime(2026, 10, 6, tzinfo=timezone.utc),
    )


def test_archivos_del_foco_y_de_sus_vecinos_con_su_ruta_de_descarga():
    sub = {
        "nodos": [{"id": i, "grado": 1} for i in ("doc:1", "doc:2", "ext:7", "doc:3")],
        "aristas": [
            {"source": "doc:1", "target": "doc:2", "tipo": "responde"},
            {"source": "doc:1", "target": "ext:7", "tipo": "respondido"},
            {"source": "doc:2", "target": "doc:3", "tipo": "referencia"},
        ],
    }
    adjuntos = [
        _adjunto(10, 1, "firmado", nombre="FIRM-OF-0001.pdf"),
        _adjunto(11, 1, "recepcion", etiqueta="UGEL Huanta"),
        _adjunto(12, 1, "respuesta", relacion_id=7),
        _adjunto(13, 2, ""),
        _adjunto(14, 3, "firmado"),  # a dos saltos: no entra
    ]
    salida = grafo.agregar_archivos(sub, adjuntos, "doc:1", expediente="EXP-OF-0001.pdf")
    archivos = {n["id"]: n for n in salida["nodos"] if n.get("tipo") == "archivo"}
    assert set(archivos) == {"archivo:10", "archivo:11", "archivo:12", "archivo:13", "expediente:1"}
    assert archivos["archivo:10"]["archivo"] == "/api/documentos/1/adjuntos/10"
    assert archivos["archivo:10"]["subtipo"] == "Documento firmado"
    assert archivos["archivo:11"]["etiqueta"] == "UGEL Huanta"
    assert archivos["expediente:1"]["archivo"] == "/api/documentos/1/expediente"
    origen = {a["target"]: (a["source"], a["tipo"]) for a in salida["aristas"]}
    assert origen["archivo:12"] == ("ext:7", "respuesta")  # cuelga de su respuesta externa
    assert origen["archivo:13"] == ("doc:2", "adjunto")
    assert origen["archivo:11"] == ("doc:1", "recepcion")
    assert all(a["fiable"] for a in salida["aristas"] if a["target"] in archivos)


def test_resolucion_de_miniatura():
    from qillqasqa.servicios import imagen

    assert imagen.resolucion_para(None) == imagen.RESOLUCION
    assert imagen.resolucion_para(160) == round(imagen.RESOLUCION * 160 / 1240)
    assert imagen.resolucion_para(20) == imagen.RESOLUCION and imagen.resolucion_para(5000) == imagen.RESOLUCION


# --- correspondencia: Estadísticas y el Mapa leen lo mismo (2026-10-19) -------------

def _mapa_corresp():
    nodos = [
        {"id": "doc:1", "tipo": "documento", "estado": "ENVIADO", "fecha": "2026-09-01", "etiqueta": "OF-0001", "titulo": "Pedido"},
        {"id": "doc:2", "tipo": "documento", "estado": "ENVIADO", "fecha": "2026-09-10", "etiqueta": "OF-0002", "titulo": "Otro"},
        {"id": "doc:3", "tipo": "documento", "estado": "APROBADO", "fecha": "2026-09-12", "etiqueta": "OF-0003", "titulo": "Sin enviar"},
        {"id": "doc:4", "tipo": "documento", "estado": "FIRMADO", "fecha": "2026-09-20", "etiqueta": "OF-0004", "titulo": "Nuestra respuesta"},
        {"id": "ext:9", "tipo": "externo", "fecha": "2026-09-11", "etiqueta": "Oficio 55-MINEDU"},
        {"id": "entrada:5", "tipo": "entrada", "fecha": "2026-09-30", "etiqueta": "Carta 3"},
        {"id": "inst:7", "tipo": "institucion", "etiqueta": "MINEDU", "titulo": "Ministerio de Educación"},
        {"id": "persona:8", "tipo": "persona", "etiqueta": "Dr. Juan Pérez Soto"},
    ]
    aristas = [
        {"source": "doc:1", "target": "ext:9", "tipo": "respondido"},       # respondido en 10 días
        {"source": "doc:1", "target": "inst:7", "tipo": "destinatario"},
        {"source": "doc:1", "target": "persona:8", "tipo": "destinatario"},
        {"source": "doc:2", "target": "inst:7", "tipo": "destinatario"},     # sin respuesta
        {"source": "doc:4", "target": "entrada:5", "tipo": "responde"},     # NUESTRO oficio responde: no cuenta
        {"source": "doc:3", "target": "inst:7", "tipo": "destinatario"},     # no enviado: no cuenta
    ]
    return {"nodos": nodos, "aristas": aristas}


def test_correspondencia_cuenta_respuestas_y_dias():
    from datetime import date

    c = grafo.correspondencia(_mapa_corresp(), date(2026, 10, 19))
    assert (c["enviados"], c["respondidos"], c["sin_respuesta"], c["dias_promedio"]) == (2, 1, 1, 10)
    (minedu,) = c["por_institucion"]
    assert minedu == {"foco": "inst:7", "nombre": "Ministerio de Educación", "enviados": 2, "respondidos": 1,
                      "sin_respuesta": 1, "dias_promedio": 10}
    (pendiente,) = c["pendientes"]
    assert pendiente["foco"] == "doc:2" and pendiente["espera"] == 39 and pendiente["destino"] == "MINEDU"
    assert c["por_nodo"]["persona:8"]["respondidos"] == 1


def test_un_recibido_que_contesta_es_respuesta():
    from datetime import date

    m = _mapa_corresp()
    m["aristas"].append({"source": "entrada:5", "target": "doc:2", "tipo": "responde"})
    c = grafo.correspondencia(m, date(2026, 10, 19))
    assert c["respondidos"] == 2 and c["pendientes"] == []
    assert c["por_doc"]["doc:2"] == {"respondido": True, "dias": 20, "espera": None}


def test_anotar_correspondencia_en_las_fichas_del_mapa():
    from datetime import date

    m = grafo.anotar_correspondencia(_mapa_corresp(), date(2026, 10, 19))
    por_id = {n["id"]: n for n in m["nodos"]}
    assert por_id["inst:7"]["correspondencia"]["enviados"] == 2
    assert por_id["doc:2"]["respuesta"]["espera"] == 39
    assert "respuesta" not in por_id["doc:3"] and "correspondencia" not in por_id["ext:9"]


def test_foco_por_nombre_une_estadisticas_con_el_mapa():
    from qillqasqa.api.estadisticas import foco_por_nombre
    from qillqasqa.servicios import instituciones_destino as svc_inst

    inst, pers = foco_por_nombre(_mapa_corresp(), grafo.nombre_de_persona)
    assert inst[svc_inst.plano(svc_inst.normalizar("Ministerio de Educación (MINEDU)")[0])] == "inst:7"
    assert pers[grafo.nombre_de_persona("Juan Pérez Soto")] == "persona:8"

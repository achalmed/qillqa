"""backend/tests/test_vigencia.py — vigencia de la firma y del expediente (2026-10-06).

Pruebas puras (sin PostgreSQL): la tabla de decisión «evento → firma / expediente»
de servicios/vigencia.py, la estabilidad de la huella impresa (nombre escrito ↔ archivo
con el mismo texto no anula; cambiar la etiqueta sí; reemplazar el PDF de un adjunto
solo desactualiza el expediente…), los motivos del expediente, la huella de los
proyectos de ley y que los archivos movidos vuelvan a su lugar si la transacción no
llega al commit. Uso: cd backend && .venv/bin/python -m pytest -q tests/test_vigencia.py
"""
import copy
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import pytest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.servicios import vigencia as v  # noqa: E402
from app.servicios.adjuntos import combinar_adjuntos, nombres_manuales  # noqa: E402

# ---------------------------------------------------------------------------
# Un modelo mínimo del documento, con las MISMAS funciones que usa el servicio.
# ---------------------------------------------------------------------------

BASE = {
    "tipo": "oficio",
    "numero": 61,
    "periodo": "2026-2027",
    "estado": "APROBADO",
    "campos": {"asunto": "Uso del auditorio", "fecha": "2026-10-06", "anexo": "Lo indicado (05 folios)"},
    "cuerpo": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hola"}]}]},
    # Adjuntos de categoría vacía, en orden de id.
    "adjuntos": [
        {"id": 10, "etiqueta": "Informe técnico", "sha256": "a" * 64, "pdf": True, "es_anexo": False},
        {"id": 11, "etiqueta": "Foto del local", "sha256": "b" * 64, "pdf": False, "es_anexo": True},
    ],
    "firmado": None,     # {"id", "sha256", "huella"}
    "cargos": 0,
    "std": False,
}


def linea(doc: dict) -> list[str]:
    # nombres_adjuntos: etiqueta (o el nombre) de TODOS los de categoría vacía, por id.
    archivos = [a["etiqueta"] for a in sorted(doc["adjuntos"], key=lambda a: a["id"])]
    return combinar_adjuntos(nombres_manuales(doc["campos"]), archivos)


def huella(doc: dict) -> str:
    imagenes = [a["sha256"] for a in sorted(doc["adjuntos"], key=lambda a: a["id"]) if a["es_anexo"]]
    return v.huella_contenido(
        tipo=doc["tipo"], numero=doc["numero"], periodo=doc["periodo"], campos=doc["campos"],
        cuerpo=doc["cuerpo"], adjuntos=linea(doc), imagenes=imagenes,
    )


def composicion(doc: dict) -> dict:
    if doc["firmado"]:
        base = {"tipo": "firmado", "id": doc["firmado"]["id"], "sha256": doc["firmado"]["sha256"]}
    else:
        base = {"tipo": "documento", "huella": huella(doc)}
    piezas = [
        {"id": a["id"], "etiqueta": a["etiqueta"], "sha256": a["sha256"]}
        for a in sorted(doc["adjuntos"], key=lambda a: a["id"])
        if a["pdf"] and not a["es_anexo"]
    ]
    return {"base": base, "piezas": piezas}


def ciclo(doc: dict) -> bool:
    return bool(doc["firmado"] or doc["cargos"] or doc["std"] or doc["estado"] in v.ESTADOS_FIRMADO)


def firmar(doc: dict) -> dict:
    """Sube el firmado (sellado con lo impreso) y arma el expediente."""
    doc = copy.deepcopy(doc)
    doc["firmado"] = {"id": 50, "sha256": "f" * 64, "huella": huella(doc)}
    doc["estado"] = "FIRMADO"
    doc["cargos"] = 1
    doc["manifiesto"] = composicion(doc)
    return doc


def evaluar(doc: dict, cambio) -> tuple[bool, list[str], dict]:
    """Aplica `cambio` y devuelve (firma anulada, motivos del expediente, doc)."""
    antes = huella(doc)
    nuevo = copy.deepcopy(doc)
    cambio(nuevo)
    referencia = v.referencia_firma(nuevo["firmado"]["huella"] if nuevo["firmado"] else None, antes)
    anula = v.decidir_anulacion(ciclo_activo=ciclo(nuevo), referencia=referencia, actual=huella(nuevo))
    if anula:
        # Lo que hace firma.anular_firma: firmado fuera, cargos y STD dejan de contar,
        # expediente firmado retirado, estado a APROBADO.
        nuevo["firmado"] = None
        nuevo["cargos"] = 0
        nuevo["std"] = False
        nuevo["estado"] = "APROBADO"
        nuevo.pop("manifiesto", None)
    motivos = v.motivos_expediente(nuevo["manifiesto"], composicion(nuevo)) if "manifiesto" in nuevo else ["retirado"]
    return anula, motivos, nuevo


# ---------------------------------------------------------------------------
# Eventos
# ---------------------------------------------------------------------------

def cambiar_cuerpo(d):
    d["cuerpo"]["content"][0]["content"][0]["text"] = "Hola de nuevo"


def cambiar_formato(d):
    d["campos"]["fmt_interlineado"] = "1.3"


def nombre_a_archivo(d):
    # «Lo indicado (05 folios)» pasa de escrito a archivo con la MISMA etiqueta.
    d["adjuntos"].append({"id": 12, "etiqueta": "Lo indicado (05 folios)", "sha256": "c" * 64, "pdf": True, "es_anexo": False})
    d["campos"]["anexo"] = ""


def solo_subir_archivo_del_nombre(d):
    # El archivo sube y el formulario aún no se guardó (campos.anexo sigue igual).
    d["adjuntos"].append({"id": 12, "etiqueta": "Lo indicado (05 folios)", "sha256": "c" * 64, "pdf": True, "es_anexo": False})


def reemplazar_pdf_adjunto(d):
    d["adjuntos"][0]["sha256"] = "d" * 64


def renombrar_adjunto(d):
    d["adjuntos"][0]["etiqueta"] = "Informe técnico final"


def quitar_adjunto(d):
    d["adjuntos"] = [a for a in d["adjuntos"] if a["id"] != 10]


def agregar_adjunto(d):
    d["adjuntos"].append({"id": 13, "etiqueta": "Plano", "sha256": "e" * 64, "pdf": True, "es_anexo": False})


def reemplazar_imagen_incrustada(d):
    d["adjuntos"][1]["sha256"] = "9" * 64


def desmarcar_imagen(d):
    d["adjuntos"][1]["es_anexo"] = False


def quitar_firmado(d):
    d["firmado"] = None
    d["estado"] = "APROBADO"


def reescanear_firmado(d):
    d["firmado"]["sha256"] = "8" * 64


def vacio_que_no_estaba(d):
    d["campos"]["anexo_cuerpo"] = ""


@pytest.mark.parametrize(
    ("evento", "anula", "motivo"),
    [
        (cambiar_cuerpo, True, None),
        (cambiar_formato, True, None),
        (nombre_a_archivo, False, "se agregó «Lo indicado (05 folios)»"),
        (solo_subir_archivo_del_nombre, False, "se agregó «Lo indicado (05 folios)»"),
        (reemplazar_pdf_adjunto, False, "cambió el PDF de «Informe técnico»"),
        (renombrar_adjunto, True, None),
        (quitar_adjunto, True, None),
        (agregar_adjunto, True, None),
        (reemplazar_imagen_incrustada, True, None),
        (desmarcar_imagen, True, None),
        (quitar_firmado, False, "la firma fue anulada o se quitó el documento firmado"),
        (reescanear_firmado, False, "cambió el PDF del documento firmado"),
        (vacio_que_no_estaba, False, None),
    ],
)
def test_tabla_de_decision(evento, anula, motivo):
    firmado = firmar(BASE)
    anulada, motivos, despues = evaluar(firmado, evento)
    assert anulada is anula
    if anula:
        # Firma anulada: el expediente firmado se retira y los cargos ya no cuentan.
        assert motivos == ["retirado"]
        assert despues["cargos"] == 0 and despues["estado"] == "APROBADO"
    elif motivo is None:
        assert motivos == []
    else:
        assert motivo in motivos
        assert despues["firmado"] is not None or evento is quitar_firmado


def test_reemplazar_pdf_de_adjunto_conserva_la_firma_y_desactualiza_el_expediente():
    firmado = firmar(BASE)
    anulada, motivos, despues = evaluar(firmado, reemplazar_pdf_adjunto)
    assert not anulada
    assert despues["firmado"]["id"] == 50 and despues["cargos"] == 1
    assert motivos == ["cambió el PDF de «Informe técnico»"]


def test_sin_firma_nada_se_anula_pero_el_expediente_sin_firma_se_desactualiza():
    doc = copy.deepcopy(BASE)
    doc["manifiesto"] = composicion(doc)
    anulada, motivos, _ = evaluar(doc, cambiar_cuerpo)
    assert not anulada
    assert motivos == ["el documento cambió"]


def test_firmado_marcado_a_mano_sin_archivo_vuelve_a_aprobado():
    # Hallazgo 2: FIRMADO por /estado sin subir el firmado; luego se edita.
    doc = copy.deepcopy(BASE)
    doc["estado"] = "FIRMADO"
    doc["manifiesto"] = composicion(doc)
    anulada, _, despues = evaluar(doc, cambiar_cuerpo)
    assert anulada and despues["estado"] == "APROBADO"


def test_volver_a_firmar_no_recupera_los_cargos_de_la_version_anulada():
    firmado = firmar(BASE)
    firmado["std"] = True
    anulada, _, despues = evaluar(firmado, cambiar_cuerpo)
    assert anulada and despues["cargos"] == 0 and not despues["std"]
    # Se vuelve a firmar: el envío automático ve 0 cargos (no salta a ENVIADO).
    otra = firmar(despues)
    assert otra["firmado"]["huella"] == huella(despues)


# ---------------------------------------------------------------------------
# Estabilidad de la huella
# ---------------------------------------------------------------------------

def test_huella_estable_y_sensible():
    h = huella(BASE)
    assert h == huella(copy.deepcopy(BASE))
    assert h.startswith("v1:sgdp:")
    reordenado = copy.deepcopy(BASE)
    reordenado["campos"] = dict(reversed(list(BASE["campos"].items())))
    assert huella(reordenado) == h  # el orden de las claves no importa
    otro = copy.deepcopy(BASE)
    otro["campos"]["_interno"] = "x"
    assert huella(otro) == h  # las claves internas no se imprimen
    otro["numero"] = 62
    assert huella(otro) != h


def test_campos_impresos_reemplaza_la_lista_cruda_por_los_adjuntos():
    assert v.campos_impresos({"anexo": "A; B", "asunto": "X", "vacio": ""}, ["B", "A "]) == {"anexo": ["A", "B"], "asunto": "X"}
    assert v.campos_impresos({"anexo": "A"}, []) == {}


def test_referencia_y_esquemas():
    actual = huella(BASE)
    assert v.esquema(actual) == "v1:sgdp"
    # Firmado antiguo (sin huella) o de otro esquema: manda la huella previa al cambio.
    assert v.referencia_firma(None, actual) == actual
    assert v.referencia_firma("v1:tex:abc", actual) == actual
    assert v.referencia_firma("v1:sgdp:otra", actual) == "v1:sgdp:otra"
    assert not v.decidir_anulacion(ciclo_activo=False, referencia="x", actual="y")
    assert not v.decidir_anulacion(ciclo_activo=True, referencia=None, actual="y")
    assert v.decidir_anulacion(ciclo_activo=True, referencia="x", actual="y")


def test_huella_de_archivos():
    assert v.huella_archivos("manual", [None]) is None
    assert v.huella_archivos("manual", ["a"]) == v.huella_archivos("manual", ["a"])
    assert v.huella_archivos("manual", ["a"]) != v.huella_archivos("manual", ["b"])
    assert v.esquema(v.huella_archivos("tex", ["a"])) == "v1:tex"


# ---------------------------------------------------------------------------
# Expediente
# ---------------------------------------------------------------------------

def test_motivos_del_expediente():
    antes = {"base": {"tipo": "documento", "huella": "h1"}, "piezas": [{"id": 1, "etiqueta": "A", "sha256": "1"}]}
    assert v.motivos_expediente(antes, copy.deepcopy(antes)) == []
    ahora = {"base": {"tipo": "firmado", "id": 9, "sha256": "f"}, "piezas": []}
    m = v.motivos_expediente(antes, ahora)
    assert "ya se subió el documento firmado (el expediente se armó sin firma)" in m
    assert "se quitó «A»" in m
    ren = copy.deepcopy(antes)
    ren["piezas"][0]["etiqueta"] = "B"
    assert v.motivos_expediente(antes, ren) == ["«A» ahora se llama «B»"]
    firmado = {"base": {"tipo": "firmado", "id": 9, "sha256": "f"}, "piezas": []}
    otro = {"base": {"tipo": "firmado", "id": 10, "sha256": "g"}, "piezas": []}
    assert v.motivos_expediente(firmado, otro) == ["se cargó otro documento firmado"]
    assert v.huella_expediente(antes) == v.huella_expediente(copy.deepcopy(antes))
    assert v.huella_expediente(antes) != v.huella_expediente(ren)


# ---------------------------------------------------------------------------
# Proyectos de ley
# ---------------------------------------------------------------------------

def test_huella_de_proyecto_solo_por_contenido():
    partes = [("titulo", {"t": "Ley X"}), ("exposicion", {"t": "Motivos"})]
    h = v.huella_proyecto("Ley X", {"a": 1}, partes)
    assert h == v.huella_proyecto("Ley X", {"a": 1}, list(partes))
    assert h != v.huella_proyecto("Ley X", {"a": 1}, [("titulo", {"t": "Ley X"}), ("exposicion", {"t": "Otros"})])
    assert h != v.huella_proyecto("Ley Y", {"a": 1}, partes)


# ---------------------------------------------------------------------------
# Archivos que vuelven a su lugar sin commit (hallazgo 5)
# ---------------------------------------------------------------------------

@pytest.fixture()
def motor():
    return create_engine("sqlite://")


def test_movimiento_se_deshace_sin_commit(tmp_path, motor):
    origen = tmp_path / "adjuntos" / "FIRM-OF-0001.pdf"
    origen.parent.mkdir()
    origen.write_bytes(b"%PDF-firmado")
    nuevo = tmp_path / "adjuntos" / "ADJ-nuevo.pdf"
    with Session(motor) as s:
        s.connection()  # abre la transacción
        destino = v.mover(s, origen, origen.parent / "anulados" / origen.name)
        nuevo.write_bytes(b"x")
        v.creado(s, nuevo)
        assert destino.is_file() and not origen.exists()
        s.rollback()
    assert origen.is_file() and not destino.exists()
    assert not nuevo.exists()


def test_movimiento_se_deshace_al_cerrar_sin_commit(tmp_path, motor):
    origen = tmp_path / "a.pdf"
    origen.write_bytes(b"1")
    with Session(motor) as s:
        s.connection()
        v.mover(s, origen, tmp_path / "anulados" / "a.pdf")
    assert origen.is_file()


def test_movimiento_queda_con_commit(tmp_path, motor):
    origen = tmp_path / "a.pdf"
    origen.write_bytes(b"1")
    with Session(motor) as s:
        s.connection()
        destino = v.mover(s, origen, tmp_path / "anulados" / "a.pdf")
        s.commit()
    assert destino.is_file() and not origen.exists()


def test_mover_no_pisa(tmp_path, motor):
    (tmp_path / "anulados").mkdir()
    (tmp_path / "anulados" / "a.pdf").write_bytes(b"viejo")
    origen = tmp_path / "a.pdf"
    origen.write_bytes(b"nuevo")
    with Session(motor) as s:
        s.connection()
        destino = v.mover(s, origen, tmp_path / "anulados" / "a.pdf")
        s.commit()
    assert destino.name != "a.pdf"
    assert (tmp_path / "anulados" / "a.pdf").read_bytes() == b"viejo"


# --- qué piezas entran en el expediente (2026-10-18) ---------------------------------------------------

def _pieza(i, categoria="", es_anexo=False):
    from types import SimpleNamespace

    return SimpleNamespace(id=i, categoria=categoria, es_anexo=es_anexo)


def test_expediente_de_fabrica_solo_los_adjuntos_generales():
    filas = [_pieza(1), _pieza(2, "firmado"), _pieza(3, "recepcion"), _pieza(4, es_anexo=True), _pieza(5)]
    assert [a.id for a in v.piezas_elegidas(filas, None)] == [1, 5]


def test_expediente_con_el_cargo_y_sin_un_adjunto_en_su_orden():
    filas = [_pieza(9, "respuesta"), _pieza(1), _pieza(7, "recepcion"), _pieza(3, "recepcion"), _pieza(5),
             _pieza(8, "recepcion_anulada")]
    sel = v.seleccion_de([7, 1, 9, 8, 3], filas)
    assert sel == {"excluidos": [5], "extras": [3, 7, 9]}
    # Adjuntos, después los cargos y al final las respuestas, cada grupo por orden de carga.
    assert [a.id for a in v.piezas_elegidas(filas, sel)] == [1, 3, 7, 9]
    # Un adjunto nuevo entra solo (y la vigencia avisa «se agregó»); un cargo nuevo, no.
    filas += [_pieza(10), _pieza(11, "recepcion")]
    assert [a.id for a in v.piezas_elegidas(filas, sel)] == [1, 10, 3, 7, 9]
    assert v.normalizar_seleccion({"excluidos": ["2", "x"], "extras": None}) == {"excluidos": [2], "extras": []}

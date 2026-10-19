"""backend/tests/test_colab.py — reglas de la edición simultánea (fase 5): nombres con generación, secreto interno y borrador vivo.

Pruebas puras (sin base de datos) de app/servicios/colab.py. Uso: cd backend && .venv/bin/python -m pytest -q
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import colab  # noqa: E402


def test_nombre_ida_y_vuelta():
    nombre = colab.nombre_parte(7, "fundamentos", 3)
    assert nombre == "pl:7:fundamentos:3"
    leido = colab.leer_nombre(nombre)
    assert leido == colab.NombreColab(7, "fundamentos", 3)


def test_clave_con_guion_se_lee():
    # La parte «Análisis costo-beneficio» (proyectos_plantillas.py).
    assert colab.leer_nombre("pl:1:costo-beneficio:2") == colab.NombreColab(1, "costo-beneficio", 2)


def test_nombres_invalidos_no_se_leen():
    # Sin generación, con prefijo de documento (5.6), con clave rara o inyectada.
    for malo in ("pl:7:fundamentos", "doc:12", "pl:x:fundamentos:1", "pl:7:Fund-amentos:1", "pl:7:a%:1", "pl:7:a:1:2", ""):
        assert colab.leer_nombre(malo) is None, malo


def test_secreto_interno_es_estable_y_depende_de_la_clave():
    assert colab.secreto_interno("a") == colab.secreto_interno("a")
    assert colab.secreto_interno("a") != colab.secreto_interno("b")
    # Nunca es la propia JWT_SECRET.
    assert colab.secreto_interno("a") != "a"


def test_sin_versionar_ignora_el_orden_de_claves():
    # JSONB devuelve las claves en otro orden: no es un cambio.
    guardado = {"type": "doc", "content": [{"type": "paragraph", "attrs": {"sangria": 0, "sangriaTipo": "completa"}}]}
    vivo = {"content": [{"attrs": {"sangriaTipo": "completa", "sangria": 0}, "type": "paragraph"}], "type": "doc"}
    assert not colab.sin_versionar(vivo, guardado)
    assert not colab.sin_versionar(None, guardado)
    vivo["content"][0]["content"] = [{"type": "text", "text": "nuevo"}]
    assert colab.sin_versionar(vivo, guardado)


# --- Documentos en compartido (paso 5.6, 2026-10-05) ---------------------

def test_nombre_de_documento_ida_y_vuelta():
    nombre = colab.nombre_documento(278, 2)
    assert nombre == "doc:278:2"
    assert colab.leer_nombre(nombre) == colab.NombreDocumento(278, 2)
    for malo in ("doc:278", "doc:x:1", "doc:1:x", "doc:1:2:3", "doc::1"):
        assert colab.leer_nombre(malo) is None, malo


def _doc(**cambios):
    from app.modelos import Documento

    datos = {"origen": "sgdp", "estado": "BORRADOR", "oculto": False, "colaboracion": True, "cuerpo": {}, "campos": {}, "borrador": None}
    datos.update(cambios)
    return Documento(**datos)


def test_compartible_hasta_numerado_sin_firmar():
    for estado in ("BORRADOR", "EN_REVISION", "OBSERVADO", "APROBADO"):
        assert colab.documento_compartible(_doc(estado=estado)), estado
    # Firmado, enviado o archivado: editarlo anularía la firma.
    for estado in ("FIRMADO", "ENVIADO", "OBSERVADO_ENVIADO", "ARCHIVADO"):
        assert not colab.documento_compartible(_doc(estado=estado)), estado
    # Solo lo nacido en el sistema y visible.
    assert not colab.documento_compartible(_doc(origen="framework"))
    assert not colab.documento_compartible(_doc(origen="manual"))
    assert not colab.documento_compartible(_doc(oculto=True))


def test_en_vivo_exige_interruptor_y_estado():
    assert colab.documento_en_vivo(_doc())
    assert not colab.documento_en_vivo(_doc(colaboracion=False))
    assert not colab.documento_en_vivo(_doc(estado="FIRMADO"))


def test_documento_sin_versionar_mira_solo_el_cuerpo():
    texto = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "a"}]}]}
    assert not colab.documento_sin_versionar(_doc(cuerpo=texto))
    assert not colab.documento_sin_versionar(_doc(cuerpo=texto, borrador={"cuerpo": texto, "campos": {"asunto": "OTRO"}}))
    otro = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "b"}]}]}
    assert colab.documento_sin_versionar(_doc(cuerpo=texto, borrador={"cuerpo": otro, "campos": {}}))


def test_salas_de_presencia():
    for bueno in ("sala:sr:3", "sala:pl:12", "sala:doc:278"):
        assert colab.es_sala(bueno), bueno
    for malo in ("sala:sr", "sala:x:1", "sala:doc:1:2", "doc:1:2", "sala:doc:abc", ""):
        assert not colab.es_sala(malo), malo

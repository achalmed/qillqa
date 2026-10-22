"""backend/tests/test_firmado_automatico.py — el paso automático a FIRMADO
(servicios/envio.py, 2026-10-19): un APROBADO con su firmado vigente pasa solo a FIRMADO
y lo anuncia como el cambio manual (evento `documento.estado` + conciliación de recibidos);
la puesta al día de lo viejo concilia sin publicar; el cambio manual sigue en la matriz.
Sin base de datos: la sesión y los servicios vecinos se sustituyen.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_firmado_automatico.py
"""
import asyncio
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

import pytest  # noqa: E402

from qillqasqa import flujo  # noqa: E402
from app.modelos import Usuario  # noqa: E402
from qillqasqa.modelos import Documento
from qillqasqa.servicios import conciliacion_recibidos, envio
from qillqasqa import eventos as qillqasqa_eventos
from qillqasqa.servicios import vigencia  # noqa: E402


class _Sesion:
    """Lo único que tocan estas reglas de la sesión: `add` (la bitácora)."""

    def __init__(self):
        self.agregados = []

    def add(self, obj):
        self.agregados.append(obj)


@pytest.fixture
def anuncios(monkeypatch):
    """Registra lo que se emite y lo que se concilia, en vez de hacerlo."""
    hechos = {"eventos": [], "conciliados": []}

    async def emitir(sesion, nombre, entidad, datos=None, clave=None, usuario=None, usuario_id=None):
        hechos["eventos"].append((nombre, entidad, datos, clave))

    async def conciliar(sesion, doc, usuario_id=None):
        hechos["conciliados"].append((doc.id, doc.estado))

    monkeypatch.setattr(qillqasqa_eventos, "emitir", emitir)   # su bandeja (Qillqasqa Q4a)
    monkeypatch.setattr(conciliacion_recibidos, "conciliar_seguro", conciliar)
    return hechos


def _doc(estado="APROBADO", oculto=False):
    return Documento(id=7, estado=estado, oculto=oculto, tipo="oficio", numero=112, periodo="2026-2027",
                     serie="OF", campos={"asunto": "Respuesta complementaria"}, version_contenido=3, creado_por=2)


def _usuario():
    return Usuario(id=2, rol="administrador", nombre_completo="Administración")


def test_motivo_pendiente_solo_aprobado_visible_con_firmado_vigente():
    assert envio.motivo_pendiente("APROBADO", False, "vigente")
    # Un firmado desactualizado ya no certifica lo impreso: ese sí espera otra firma.
    assert envio.motivo_pendiente("APROBADO", False, "desactualizada") is None
    assert envio.motivo_pendiente("APROBADO", False, "sin_firma") is None
    assert envio.motivo_pendiente("APROBADO", True, "vigente") is None
    for otro in ("BORRADOR", "EN_REVISION", "OBSERVADO", "FIRMADO", "ENVIADO", "ARCHIVADO"):
        assert envio.motivo_pendiente(otro, False, "vigente") is None, otro


def test_marcar_firmado_anuncia_como_el_cambio_manual(anuncios):
    doc, sesion = _doc(), _Sesion()
    assert asyncio.run(envio.marcar_firmado(sesion, doc, _usuario()))
    assert doc.estado == "FIRMADO"
    assert [e.accion for e in sesion.agregados] == ["firmado_automatico"]
    assert "se cargó el documento firmado" in sesion.agregados[0].detalle
    (nombre, entidad, datos, clave), = anuncios["eventos"]
    assert (nombre, entidad) == ("documento.estado", "doc:7")
    assert datos["estado"] == "FIRMADO" and datos["estado_anterior"] == "APROBADO"
    assert clave == "doc:7:estado:FIRMADO:3"
    # Firmado, el oficio da por respondidos los recibidos que responde.
    assert anuncios["conciliados"] == [(7, "FIRMADO")]


def test_marcar_firmado_no_toca_otros_estados(anuncios):
    for estado in ("BORRADOR", "EN_REVISION", "FIRMADO", "ENVIADO", "ARCHIVADO"):
        doc, sesion = _doc(estado), _Sesion()
        assert not asyncio.run(envio.marcar_firmado(sesion, doc, _usuario()))
        assert doc.estado == estado and not sesion.agregados
    assert anuncios == {"eventos": [], "conciliados": []}


def test_puesta_al_dia_concilia_sin_publicar(anuncios):
    doc, sesion = _doc(), _Sesion()
    asyncio.run(envio.marcar_firmado(sesion, doc, _usuario(), "puesta al día", avisar=False))
    assert doc.estado == "FIRMADO"
    assert anuncios["eventos"] == []
    assert anuncios["conciliados"] == [(7, "FIRMADO")]


def test_al_dia_respeta_la_vigencia(anuncios, monkeypatch):
    async def sin_envio(sesion, doc):
        return False

    monkeypatch.setattr(envio, "condiciones_cumplidas", sin_envio)
    for firma, esperado in (("vigente", "FIRMADO"), ("desactualizada", "APROBADO"), ("sin_firma", "APROBADO")):
        async def estado_firma(sesion, doc, _f=firma):
            return {"estado": _f}

        monkeypatch.setattr(vigencia, "estado_firma", estado_firma)
        doc = _doc()
        cambio = asyncio.run(envio.al_dia(_Sesion(), doc, _usuario(), "reactivado con su documento firmado"))
        assert doc.estado == esperado and cambio == (esperado == "FIRMADO"), firma


def test_al_dia_sigue_a_enviado_si_ya_estaba_todo(anuncios, monkeypatch):
    async def estado_firma(sesion, doc):
        return {"estado": "vigente"}

    async def todo_listo(sesion, doc):
        return True

    async def indice(sesion):
        return {}

    monkeypatch.setattr(vigencia, "estado_firma", estado_firma)
    monkeypatch.setattr(envio, "condiciones_cumplidas", todo_listo)
    monkeypatch.setattr(envio.svc_ambito, "indice_congreso", indice)
    doc, sesion = _doc(), _Sesion()
    assert asyncio.run(envio.al_dia(sesion, doc, _usuario()))
    assert doc.estado == "ENVIADO"
    assert [e.accion for e in sesion.agregados] == ["firmado_automatico", "envio_automatico"]
    assert [d["estado"] for _, _, d, _ in anuncios["eventos"]] == ["FIRMADO", "ENVIADO"]


def test_el_cambio_manual_sigue_disponible():
    """La regla automática complementa, no reemplaza: el titular y el administrador
    pueden seguir pasando a FIRMADO a mano, y secretaría a ENVIADO."""
    assert flujo.transicion_permitida("APROBADO", "FIRMADO", "administrador")
    assert flujo.transicion_permitida("APROBADO", "FIRMADO", "diputado")
    assert flujo.transicion_permitida("FIRMADO", "ENVIADO", "secretaria")
    assert flujo.transicion_permitida("ARCHIVADO", "APROBADO", "administrador")


def test_datos_del_evento_en_un_solo_lugar():
    from qillqasqa.api import documentos
    from qillqasqa.servicios import documentos_contrato

    assert documentos._datos_evento_doc is documentos_contrato.datos_evento
    datos = documentos_contrato.datos_evento(_doc(), _usuario())
    assert datos["tipo"] == "oficio" and datos["autor_id"] == 2 and "numero" in datos

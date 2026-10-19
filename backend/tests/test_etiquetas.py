"""Lo vinculado se muestra vigente (servicios/etiquetas.py y sus usos, 2026-10-12). Pruebas puras."""

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.servicios import cuentas, verificacion  # noqa: E402
from app.servicios.etiquetas import etiqueta_documento, etiqueta_institucion, etiqueta_persona, partir, remitente_vigente  # noqa: E402
from app.servicios.tareas_automaticas import recomponer_titulo_tarea  # noqa: E402


def test_partir_y_alias():
    assert partir("doc:12") == ("doc", 12)
    assert partir("institucion:4") == ("inst", 4) == partir("inst:4")
    assert partir("documento:7") == ("doc", 7) and partir("semana:2") == ("sr", 2) and partir("proyecto:3") == ("pl", 3)
    assert partir("comision:educacion") is None and partir("") is None and partir("doc") is None


def test_etiquetas_simples():
    assert etiqueta_documento("Oficio N°0128", "Visita") == "Oficio N°0128 — Visita"
    assert etiqueta_documento("Oficio N°0128", "") == "Oficio N°0128"
    assert etiqueta_persona("Ana Ruiz", "Gerente") == "Ana Ruiz (Gerente)"
    assert etiqueta_institucion("Gobierno Regional", "GORE") == "GORE — Gobierno Regional"


def test_remitente_vigente():
    # Vinculado a una persona: su nombre y cargo de hoy; el cargo guardado solo si hoy no tiene.
    assert remitente_vigente("Ana Ruíz", "Gerenta", ("Ana Ruiz Pérez", "Gerente General")) == ("Ana Ruiz Pérez", "Gerente General")
    assert remitente_vigente("Ana", "Gerenta", ("Ana Ruiz", "")) == ("Ana Ruiz", "Gerenta")
    # Solo a una institución: su nombre de hoy.
    assert remitente_vigente("GORE Ayacucho", "", None, "Gobierno Regional de Ayacucho") == ("Gobierno Regional de Ayacucho", "")
    # Sin vínculo: lo registrado.
    assert remitente_vigente("Ciudadano X", "", None, None) == ("Ciudadano X", "")


def test_titulo_de_tarea_con_numero_vigente():
    assert recomponer_titulo_tarea("Firmar y subir el firmado de Oficio S/N-2026-2027-XX · Visita", "Oficio N°0128-2026", "Visita de trabajo") == \
        "Firmar y subir el firmado de Oficio N°0128-2026 · Visita de trabajo"
    assert recomponer_titulo_tarea("Redactar Oficio S/N-2026", "Oficio N°0001", "") == "Redactar Oficio N°0001"
    # Reescrito por una persona: se respeta.
    assert recomponer_titulo_tarea("Llamar a la gerencia", "Oficio N°0001", "x") == "Llamar a la gerencia"
    assert recomponer_titulo_tarea("Revisar con Ana el borrador · urgente", "Oficio N°0001", "x") == "Revisar con Ana el borrador · urgente"


def _u(**k):
    base = {"nombre_completo": "Ana Ruiz", "cargo": "", "rol": "asesor", "email": "", "telefono": "", "activo": True}
    return SimpleNamespace(**{**base, **k})


def test_la_cuenta_manda_en_su_ficha():
    dictado = cuentas.dictado_por_cuenta(_u(cargo="Asesora", email="ana@x.pe"))
    assert dictado["nombre"] == "Ana Ruiz" and dictado["cargo"] == "Asesora" and dictado["email"] == "ana@x.pe"
    assert "celular" not in dictado  # sin celular en la cuenta, el directorio lo puede llevar
    assert cuentas.conflictos_con_cuenta({"nombre": "ana  ruiz", "celular": "999"}, dictado) == []
    assert cuentas.conflictos_con_cuenta({"nombre": "Ana María Ruiz", "cargo": "Jefa"}, dictado) == ["nombre", "cargo"]
    assert cuentas.conflictos_con_cuenta({"activo": False}, dictado) == ["activo"]


def test_verificacion_ofrece_lo_del_directorio():
    campos = {"destinatario_nombre": "Juan Pérez", "destinatario_cargo": "Gerente", "asunto": "x"}
    persona = {"nombre": "Juan Pérez", "cargo": "Gerente General", "institucion": "GORE"}
    difs = verificacion.diferencias_destinatario(campos, persona)
    assert difs == {"destinatario_cargo": "Gerente General"}
    puntos = [{"id": "destinatario", "etiqueta": "A quién va", "clave": "destinatario_nombre", "valor": "Juan Pérez", "vacio": False, "confirmar": True}]
    anotados = verificacion.anotar_puntos(puntos, difs, campos)
    assert "directorio" not in anotados[0]
    assert anotados[1]["clave"] == "destinatario_cargo" and anotados[1]["directorio"] == "Gerente General" and not anotados[1]["confirmar"]
    assert verificacion.diferencias_destinatario(campos, None) == {}


def test_copias_con_cargo_vigente_y_homonimos():
    por_nombre = {"rosa diaz": [{"nombre": "Rosa Díaz", "cargo": "Oficial Mayor", "institucion": ""}],
                  "luis paz": [{"nombre": "Luis Paz", "cargo": "A", "institucion": "X"}, {"nombre": "Luis Paz", "cargo": "B", "institucion": "Y"}]}
    copias = [{"nombre": "Rosa Díaz", "cargo": "Oficial Mayor (e)"}, {"nombre": "Luis Paz", "cargo": "C"}, {"nombre": "Otra", "cargo": ""}]
    r = verificacion.anotar_copias(copias, por_nombre)
    assert r[0]["cargo_directorio"] == "Oficial Mayor"
    assert "cargo_directorio" not in r[1]  # dos homónimos con cargos distintos: no se adivina
    assert "cargo_directorio" not in r[2]

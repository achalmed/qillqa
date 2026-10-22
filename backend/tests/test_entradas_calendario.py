"""backend/tests/test_entradas_calendario.py — ficha automática de los documentos RECIBIDOS
(servicios/entradas.py): número STD, fecha, asunto, referencia, documento de origen,
clase, atención, remitente, plazo, duplicados y la cita desde un oficio propio.

Pruebas puras (sin base de datos). Los textos son INVENTADOS: ninguna institución,
persona ni número corresponde a un documento real.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_entradas_calendario.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from punku import entradas as e  # noqa: E402
from punku.entradas import nombre_archivo as nombre_entrada  # noqa: E402

OFICIO = """MUNICIPALIDAD DISTRITAL DE VILLA EJEMPLO
"Año de la Prueba Unitaria"

Villa Ejemplo, 3 de octubre de 2026

OFICIO N° 0456-2026-MDVE/A

Señor:
CONGRESISTA DE LA REPÚBLICA
Presente.-

ASUNTO     : Solicito apoyo para la gestión del proyecto de agua
             potable del centro poblado Los Pinos
REFERENCIA : Oficio N° 0031-2026-2027-XYZ-CD/CRP

De mi consideración:
Tengo el agrado de dirigirme a usted para saludarlo y, a la vez, solicitarle que
interponga sus buenos oficios ante el Ministerio de Prueba para el financiamiento.

Atentamente,
Rosa Elena Quispe Huamaní
Alcaldesa
"""

CARTA_SINDICATO = """SINDICATO UNIFICADO DE TRABAJADORES DE PRUEBA
Registro STD N° 2437652

Lima, 29 de setiembre del 2026

CARTA N° 012-2026-SUTP

Asunto: Pedimos no otorgar facultades legislativas en materia laboral
Ref.: Proyecto de Ley 1234/2026-PE

Por medio de la presente, solicitamos su voto en contra.
"""

INVITACION = """COLEGIO DE INGENIEROS DE EJEMPLO
Lima, 01/10/2026
INVITACIÓN
Tenemos el agrado de invitarle a la ceremonia de aniversario institucional.
"""


def test_plazo_en_dias_habiles():
    # 2026-10-02 es viernes: cinco días hábiles después sería el viernes 9, pero el jueves 8
    # (Combate de Angamos) es feriado y no cuenta (2026-10-10): cae el lunes 12.
    assert e.plazo_sugerido("responder", "2026-10-02") == "2026-10-12"
    assert e.plazo_sugerido("agendar", "2026-10-02") == "2026-10-06"
    assert e.plazo_sugerido("conocimiento", "2026-10-02") == ""


def test_ficha_completa_y_campana():
    previas = [("Pedimos no otorgar facultades legislativas al Ejecutivo", "Facultades legislativas")]
    f = e.construir_ficha("2437652-CARTA (2).pdf", CARTA_SINDICATO, hoy="2026-10-06", previas=previas)
    assert f.std_numero == "2437652"
    assert f.documento == "Carta N° 012-2026-SUTP"
    assert f.fecha_documento == "2026-09-29"
    assert f.fecha_recepcion == "2026-10-06"
    assert f.atencion == "responder"
    assert f.plazo == "2026-10-14"   # 5 hábiles desde el 6/10 saltando el feriado del 8/10
    assert f.campana == "Facultades legislativas"
    # La referencia cita un documento de la entidad (sus siglas): es una respuesta.
    f = e.construir_ficha("x.pdf", OFICIO, hoy="2026-10-06", siglas_propias="XYZ-CD/CRP")
    assert any("respuesta" in a for a in f.avisos)
    # Un escaneo sin texto: la ficha avisa y toma el asunto del nombre.
    f = e.construir_ficha("2437653-Pedido de reunion.pdf", "", hoy="2026-10-06")
    assert f.sin_texto and f.std_numero == "2437653" and f.asunto == "Pedido de reunion"


# --- el resumen del grupo (prompt de recepción) ---------------------------------------------
# Formatos del repo `prompts` (skills/documentos-administrativos/references/recepcion-comunicado-y-agenda.md).

COMUNICADO = """🗂️ ENRUTAMIENTO: 📋 COMUNICADO → grupo de documentos externos. (Origen: 🟧 EXTERNO)
(Línea de uso interno. No copiar al grupo.)

📌 NUEVO DOCUMENTO RECIBIDO

📄 OFICIO N.° 0234-2026-MDVE/A
🏛️ Remitente: Municipalidad Distrital de Villa Ejemplo — Alcalde, Juan Prueba Ficticio
📅 Fecha del documento: 12/08/2026
📥 Recibido: 14/08/2026 (Correo institucional)
🔖 Registro STD: N.° 0004521
👤 Dirigido a: Despacho Congresal [nombre]

📝 ASUNTO:
"Solicito interceder ante el MEF para el proyecto
de agua potable de Los Pinos"

🔍 CONTENIDO:
- Proyecto CUI N.° 1234567 por S/ 1 000 000.
- Gestiones previas ante el MEF sin respuesta.

📚 Información solicitada:
- Estado del expediente.

✅ ACCIÓN REQUERIDA: Gestionar ante el MEF la priorización del proyecto.
⏳ PLAZO: 22/08/2026 (8 días)
🚦 PRIORIDAD: 🟡 MEDIA"""

AGENDA = """🗓 AGENDA — NUEVA ACTIVIDAD

📌 Décima Sesión Ordinaria de la Comisión de Educación
🏛 Convoca: Comisión de Educación del Congreso — Presidencia
📅 Fecha: Jueves 03/09/2026
🕒 Hora: 6:30 p. m.
📍 Lugar: Sala Grau — Palacio Legislativo
💻 Modalidad: Virtual (Teams)
👤 Participa: Congresista [nombre]

📝 ASUNTO:
"Citación a la Décima Sesión Ordinaria de la Comisión de Educación"

🔍 DETALLE:
- Agenda: predictamen sobre infraestructura educativa rural.

✅ CONFIRMACIÓN: Requerida hasta 02/09/2026
📎 ACCIÓN PREVIA: Designar por escrito al suplente.
📄 Documento: OFICIO N.° 1120-2026-CR/CEA
🚦 PRIORIDAD: 🔴 ALTA"""


# --- Word e imágenes a PDF; unión de partes (si las herramientas están instaladas) ------------

import shutil  # noqa: E402

import pytest  # noqa: E402



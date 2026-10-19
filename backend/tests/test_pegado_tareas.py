"""backend/tests/test_pegado_tareas.py — el formato de pegado `plan-de-tareas` (2026-10-12): el esquema,
la lectura del bloque (vocabulario de prioridad con sinónimos, fechas, horas, listas), los errores
claros y las reglas puras con que `POST /api/tareas/pegar` casa al responsable y evita duplicados.

Pruebas puras (sin base de datos). Los textos y los nombres son INVENTADOS.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_pegado_tareas.py
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import pegado  # noqa: E402
from app.servicios import tareas_reglas as r  # noqa: E402

PLAN = """Resultado del acta:

```yaml
tipo: plan-de-tareas
version: 1
tareas:
  - titulo: "Remitir el oficio de invitación a la Municipalidad de Villa Ejemplo"
    descripcion: "Acordado en la reunión de coordinación del lunes"
    responsable: "María"
    vence: 2026-10-16
    hora: "15:00"
    prioridad: muy alta
    lista: "Comisión de Educación"
    vinculo: [doc:12, "pl: 3", "el oficio 0234"]
    etiquetas: [Comisión, oficios]
    pasos:
      - Redactar el borrador
      - Firmar
  - titulo: "Llamar a la directora de la UGEL"
    responsable: null
    vence: null
    hora: null
    prioridad: media
    lista: null
    vinculo: null
    etiquetas: []
    pasos: []
observaciones:
  - "No consta quién llama a la UGEL."
```
"""

EQUIPO = [
    {"id": 1, "usuario": "edison", "nombre": "Nombre Apellido"},
    {"id": 2, "usuario": "asesor1", "nombre": "María Elena Quispe Rojas"},
    {"id": 3, "usuario": "asesor2", "nombre": "Carlos Mamani Huamán"},
    {"id": 4, "usuario": "practicante", "nombre": "Carlos Pérez Soto"},
]


def test_el_esquema_carga_con_su_prompt_y_su_bloque():
    es = pegado.esquema_de("plan-de-tareas")
    assert es.modulo == "tareas" and es.version == 1
    assert es.prompt == "prompts/06 legislativo/prompt_18_plan_de_tareas.md"
    bloque = es.bloque("tarea")
    assert {"titulo", "descripcion", "responsable", "vence", "hora", "prioridad", "lista", "vinculo", "etiquetas", "pasos"} <= set(bloque)
    assert bloque["prioridad"]["valores"] == list(r.PRIORIDADES)   # los valores reales del modelo
    assert bloque["responsable"]["cruza"] == "equipo"
    assert any(f["tipo"] == "plan-de-tareas" for f in pegado.formatos())


def test_el_plan_se_lee_y_normaliza():
    le = pegado.interpretar(PLAN, ("plan-de-tareas",))
    assert le.valido and le.tipo == "plan-de-tareas" and le.fuente == "yaml"
    t1, t2 = le.valores["tareas"]
    assert t1["vence"] == "2026-10-16" and t1["hora"] == "15:00"
    assert t1["prioridad"] == "urgente"          # «muy alta» es sinónimo de urgente
    assert t2["prioridad"] == "normal"           # «media» es sinónimo de normal
    assert t1["vinculo"] == ["doc:12", "pl: 3", "el oficio 0234"]
    assert t1["pasos"] == ["Redactar el borrador", "Firmar"]
    assert "vence" not in t2 and "responsable" not in t2      # null = desconocido
    assert le.valores["observaciones"] == ["No consta quién llama a la UGEL."]


def test_errores_claros_sin_titulo_sin_tareas_y_fecha_ilegible():
    sin_titulo = "tipo: plan-de-tareas\nversion: 1\ntareas:\n  - responsable: María\n    vence: 2026-10-16\n"
    le = pegado.interpretar(sin_titulo, ("plan-de-tareas",))
    assert not le.valido and any("Tarea" in e for e in le.errores)
    vacio = "tipo: plan-de-tareas\nversion: 1\ntareas: []\n"
    assert not pegado.interpretar(vacio, ("plan-de-tareas",)).valido
    mala = "tipo: plan-de-tareas\nversion: 1\ntareas:\n  - titulo: Revisar\n    vence: algún día\n"
    le = pegado.interpretar(mala, ("plan-de-tareas",))
    assert not le.valido and any("fecha" in e for e in le.errores)
    # Una prioridad fuera del vocabulario no bloquea: queda como duda para elegir.
    rara = "tipo: plan-de-tareas\nversion: 1\ntareas:\n  - titulo: Revisar\n    prioridad: altísima con sobresalto\n"
    le = pegado.interpretar(rara, ("plan-de-tareas",))
    assert le.valido and "tareas[1].prioridad" in le.dudas
    # Otro formato pegado en Tareas es un error, no un rellenado raro.
    agenda = "tipo: agenda-actividades\nversion: 1\nactividades:\n  - titulo: Sesión\n    inicio: 2026-10-20 10:00\n"
    assert not pegado.interpretar(agenda, ("plan-de-tareas",)).valido


def test_casar_responsable_sin_ambiguedad():
    assert r.casar_responsable("María", EQUIPO)["id"] == 2
    assert r.casar_responsable("Lic. María Quispe", EQUIPO)["id"] == 2
    assert r.casar_responsable("@asesor2", EQUIPO)["id"] == 3
    assert r.casar_responsable("asesor2", EQUIPO)["id"] == 3
    assert r.casar_responsable("Nombre Apellido", EQUIPO)["id"] == 1
    assert r.casar_responsable("Carlos Mamani", EQUIPO)["id"] == 3
    assert r.casar_responsable("Carlos", EQUIPO) is None          # dos Carlos: que elija la persona
    assert r.casar_responsable("Rosa", EQUIPO) is None
    assert r.casar_responsable("", EQUIPO) is None


def test_clave_tarea_compara_sin_tildes_ni_puntuacion():
    assert r.clave_tarea("Remitir el oficio a la UGEL.") == r.clave_tarea("  remitir el OFICIO a la ugel ")
    assert r.clave_tarea("Llamar a Ñaña") == "llamar a ñaña"
    assert r.clave_tarea("Revisar") != r.clave_tarea("Revisar el PL")


def test_el_chat_lleva_el_plan_a_tareas():
    from app.servicios.chat import RUTA_MODULO

    assert RUTA_MODULO["plan-de-tareas"] == ("Tareas", "/tareas?pegar={mid}")

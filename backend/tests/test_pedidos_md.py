"""backend/tests/test_pedidos_md.py — los pedidos de una semana en Markdown (servicios/pedidos_md.py)."""
from app.servicios import pedidos_md


def test_semana_agrupa_por_actividad_y_resume_estados():
    semana = {"codigo": "SR-02", "tema": "Huanta", "fecha_inicio": "2026-09-14", "fecha_fin": "2026-09-19"}
    actividades = [{"codigo": "A-001", "datos": {"titulo": "Visita al hospital", "provincia": "Huanta", "distrito": "Huanta", "fecha": "2026-09-15"}}]
    pedidos = [
        {"codigo": "P-001", "datos": {"actividad": "A-001", "pedido": "Ambulancia |nueva|", "entidades": ["MINSA", "GORE"], "estado": "derivado"}, "oficio": "Oficio N°0080"},
        {"codigo": "P-002", "datos": {"pedido": "Agua potable", "plazo": "2026-12-01"}, "oficio": ""},
    ]
    md = pedidos_md.semana_md(semana, actividades, pedidos)
    assert md.startswith("# Pedidos de la SR-02 — Huanta")
    assert "del 14 de septiembre de 2026 al 19 de septiembre de 2026" in md
    assert "| Registrado | 1 |" in md and "| Derivado | 1 |" in md
    assert "## A-001 · Visita al hospital" in md and "## Sin actividad asociada" in md
    assert "**P-001.** Ambulancia /nueva/" in md  # «|» no rompe nada
    assert "- Entidades: MINSA, GORE" in md and "- Oficio: Oficio N°0080" in md
    assert "- Plazo: 1 de diciembre de 2026" in md
    assert md.index("A-001 ·") < md.index("Sin actividad")


def test_semana_sin_pedidos_y_varias():
    vacia = pedidos_md.semana_md({"codigo": "SR-03", "tema": "x"}, [], [])
    assert "_Sin pedidos registrados._" in vacia
    todo = pedidos_md.varias_md([({"codigo": "SR-03", "tema": "x"}, [], [])], "2026-10-05")
    assert todo.startswith("# Pedidos de las Semanas de Representación") and "## Pedidos de la SR-03" in todo


def test_opciones_filtran_y_agrupan():
    semana = {"codigo": "SR-02", "tema": "Huanta"}
    actividades = [
        {"codigo": "A-001", "datos": {"titulo": "Visita", "fecha": "2026-09-15"}},
        {"codigo": "A-002", "datos": {"titulo": "Reunión", "fecha": "2026-09-18"}},
    ]
    pedidos = [
        {"codigo": "P-001", "datos": {"actividad": "A-001", "pedido": "Ambulancia", "entidades": ["MINSA"], "responsable": "X"}, "oficio": ""},
        {"codigo": "P-002", "datos": {"actividad": "A-002", "pedido": "Agua", "entidades": ["Sedapal"]}, "oficio": ""},
    ]
    op = pedidos_md.Opciones.desde_consulta("fecha,entidades", "entidad", False, "2026-09-16", None, None, None, None)
    md = pedidos_md.semana_md(semana, actividades, pedidos, op=op)
    assert "P-002" in md and "P-001" not in md          # filtro por fecha
    assert "## Sedapal (1)" in md                       # agrupado por entidad
    assert "- Fecha: 18 de septiembre de 2026" in md    # solo los detalles elegidos
    assert "Responsable" not in md and "| Estado |" not in md
    solo_minsa = pedidos_md.semana_md(semana, actividades, pedidos, op=pedidos_md.Opciones(entidad="minsa", agrupar="ninguno"))
    assert "P-001" in solo_minsa and "P-002" not in solo_minsa

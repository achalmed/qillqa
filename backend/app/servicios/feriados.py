"""FERIADOS Y FECHAS CÍVICAS DEL PERÚ (2026-10-06), para la Agenda. Puras.

Tres clases, como las distingue el Estado (https://www.gob.pe/feriados):
- `feriado`: los 16 nacionales de ley (Código del Trabajo y leyes que los añadieron: 7 de junio y
  6 de agosto y 9 de diciembre desde 2022, 23 de julio desde 2023). Jueves y Viernes Santo se
  calculan desde la Pascua de cada año.
- `no_laborable`: días que el Ejecutivo declara cada año por decreto supremo para el sector
  público (se compensan; no son feriados). Cambian cada año: se añaden aquí cuando sale el decreto.
- `civica`: fechas que se celebran sin ser feriado (Día de la Madre, del Maestro…).
"""

from __future__ import annotations

from datetime import date, timedelta

FIJOS = (
    (1, 1, "Año Nuevo"),
    (5, 1, "Día del Trabajo"),
    (6, 7, "Batalla de Arica y Día de la Bandera"),
    (6, 29, "San Pedro y San Pablo"),
    (7, 23, "Día de la Fuerza Aérea del Perú"),
    (7, 28, "Fiestas Patrias"),
    (7, 29, "Fiestas Patrias"),
    (8, 6, "Batalla de Junín"),
    (8, 30, "Santa Rosa de Lima"),
    (10, 8, "Combate de Angamos"),
    (11, 1, "Día de Todos los Santos"),
    (12, 8, "Inmaculada Concepción"),
    (12, 9, "Batalla de Ayacucho"),
    (12, 25, "Navidad"),
)

# Días no laborables del sector público, por decreto supremo de cada año (gob.pe/feriados).
NO_LABORABLES: dict[int, tuple[tuple[str, str], ...]] = {
    2026: (("2026-01-02", "Día no laborable (sector público)"), ("2026-07-27", "Día no laborable (sector público)")),
}

CIVICAS_FIJAS = (
    (6, 24, "Día del Campesino"),
    (7, 6, "Día del Maestro"),
    (10, 31, "Día de la Canción Criolla"),
)


def pascua(anio: int) -> date:
    """Domingo de Pascua (calendario gregoriano; algoritmo de Meeus/Jones/Butcher)."""
    a, b, c = anio % 19, anio // 100, anio % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = (h + l - 7 * m + 114) % 31 + 1
    return date(anio, mes, dia)


def _enesimo_domingo(anio: int, mes: int, n: int) -> date:
    primero = date(anio, mes, 1)
    return primero + timedelta(days=(6 - primero.weekday()) % 7 + 7 * (n - 1))


def del_anio(anio: int) -> list[dict]:
    """[{fecha, nombre, tipo}] del año, ordenado por fecha."""
    salida = [{"fecha": date(anio, m, d).isoformat(), "nombre": n, "tipo": "feriado"} for m, d, n in FIJOS]
    p = pascua(anio)
    salida += [
        {"fecha": (p - timedelta(days=3)).isoformat(), "nombre": "Jueves Santo", "tipo": "feriado"},
        {"fecha": (p - timedelta(days=2)).isoformat(), "nombre": "Viernes Santo", "tipo": "feriado"},
    ]
    salida += [{"fecha": f, "nombre": n, "tipo": "no_laborable"} for f, n in NO_LABORABLES.get(anio, ())]
    salida += [{"fecha": date(anio, m, d).isoformat(), "nombre": n, "tipo": "civica"} for m, d, n in CIVICAS_FIJAS]
    salida += [
        {"fecha": _enesimo_domingo(anio, 5, 2).isoformat(), "nombre": "Día de la Madre", "tipo": "civica"},
        {"fecha": _enesimo_domingo(anio, 6, 3).isoformat(), "nombre": "Día del Padre", "tipo": "civica"},
    ]
    return sorted(salida, key=lambda x: (x["fecha"], x["tipo"] != "feriado"))


def entre(desde: date, hasta: date) -> list[dict]:
    """Las fechas de [desde, hasta], ambos incluidos."""
    salida = []
    for anio in range(desde.year, hasta.year + 1):
        salida += [x for x in del_anio(anio) if desde.isoformat() <= x["fecha"] <= hasta.isoformat()]
    return salida

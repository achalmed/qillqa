"""Territorio: distritos con su norma y fecha de creación (2026-10-06).

Pedido de Edison: «aniversarios de los distritos de Ayacucho». Son datos
PÚBLICOS (INEI, Directorio Nacional de Municipalidades, cuadro «Dispositivo
legal de creación del distrito»; El Peruano para los recientes), versionados en
`app/catalogos/distritos_<departamento>.csv` y leídos de ahí (sin tabla: el dato
es público y estable; cambiarlo es cambiar el CSV y su procedencia queda en
git).

El aniversario que se ofrece es el de la FECHA JURÍDICA de creación (la de la
norma). La planilla de origen advierte que muchos distritos celebran otra fecha
(fiesta patronal, acuerdo municipal): por eso la interfaz dice «por su ley de
creación» y no «aniversario oficial». Los distritos de la «Época de la
Independencia» no tienen fecha jurídica y no entran a los avisos.
"""
from __future__ import annotations

import csv
import re
from datetime import date
from pathlib import Path

DATOS = Path(__file__).resolve().parent.parent / "catalogos"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
_FECHA = re.compile(r"(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?", re.IGNORECASE)
_ANIO = re.compile(r"\b(1[5-9]\d\d|20\d\d)\b")


def leer_fecha(texto: str) -> tuple[int, int, int | None] | None:
    """«23 de noviembre de 1964» → (1964, 11, 23); «25 de abril (…, 1540)» → (1540, 4, 25).
    Sin día y mes reconocibles → None (p. ej. «Época de la Independencia»)."""
    m = _FECHA.search(texto or "")
    if not m or m.group(2).lower() not in MESES:
        return None
    dia, mes = int(m.group(1)), MESES[m.group(2).lower()]
    anio = int(m.group(3)) if m.group(3) else None
    if anio is None:
        a = _ANIO.search(texto[m.end():])
        anio = int(a.group(1)) if a else None
    try:
        date(2000, mes, dia)  # año bisiesto: admite el 29 de febrero
    except ValueError:
        return None
    return anio, mes, dia


def filas_csv() -> list[dict]:
    """Todas las filas de los CSV de `app/catalogos/distritos_*.csv`."""
    filas: list[dict] = []
    for archivo in sorted(DATOS.glob("distritos_*.csv")):
        with archivo.open(encoding="utf-8", newline="") as f:
            filas.extend(csv.DictReader(f))
    return filas


_CACHE: list[dict] | None = None


def distritos() -> list[dict]:
    """Los distritos de los CSV, con la fecha de creación leída (anio, mes, dia)."""
    global _CACHE
    if _CACHE is None:
        salida = []
        for i, f in enumerate(filas_csv(), start=1):
            fecha = leer_fecha(f.get("creacion", ""))
            anio, mes, dia = fecha if fecha else (None, None, None)
            salida.append({
                "id": i, "departamento": f["departamento"], "provincia": f["provincia"],
                "distrito": f["distrito"], "norma": f.get("norma", ""), "creacion": f.get("creacion", ""),
                "observacion": f.get("observacion", ""), "anio": anio, "mes": mes, "dia": dia,
            })
        _CACHE = salida
    return _CACHE


def proximo_aniversario(mes: int, dia: int, hoy: date) -> date:
    """La próxima fecha (hoy incluido) con ese día y mes; el 29 de febrero, el 28 en años comunes."""
    for anio in (hoy.year, hoy.year + 1):
        try:
            f = date(anio, mes, dia)
        except ValueError:
            f = date(anio, 2, 28)
        if f >= hoy:
            return f
    return date(hoy.year + 1, mes, min(dia, 28))


def aniversarios(distritos: list[dict], hoy: date, dias: int) -> list[dict]:
    """Distritos cuya fecha de creación cae en los próximos `dias` días, del más cercano al más lejano."""
    salida = []
    for d in distritos:
        if not d.get("mes") or not d.get("dia"):
            continue
        f = proximo_aniversario(d["mes"], d["dia"], hoy)
        faltan = (f - hoy).days
        if faltan <= dias:
            anios = f.year - d["anio"] if d.get("anio") else None
            salida.append({**d, "fecha_aniversario": f.isoformat(), "faltan": faltan, "anios": anios})
    return sorted(salida, key=lambda x: (x["faltan"], x["provincia"], x["distrito"]))

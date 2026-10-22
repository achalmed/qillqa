"""Diferencias campo a campo entre lo propuesto por el pegado y lo que el formulario ya
tiene (puras). Es lo que la web pinta como tabla y la persona acepta por fila.

Cada diferencia: {clave, etiqueta, actual, propuesto, estado, aceptar}, con `estado`:

- `nuevo`: el formulario estaba vacío y el pegado trae un valor (se acepta por omisión);
- `igual`: mismo valor (no se toca; no se lista salvo `incluir_iguales`);
- `distinto`: el formulario tenía otro valor (se acepta por omisión, pero se ve en rojo);
- `dudoso`: el valor no casó con el vocabulario o el cruce ofrece varios candidatos
  (no se acepta hasta que la persona elija).

`etiquetas` traduce el campo del formulario a su rótulo (se saca del esquema por
`destino`, o lo pasa el módulo cuando el campo no viene de una clave).
"""
from __future__ import annotations

from ..lectura import normalizar
from .esquemas import Esquema


def _igual(a, b) -> bool:
    if isinstance(a, (list, dict)) or isinstance(b, (list, dict)):
        return a == b
    na, nb = normalizar(str(a if a is not None else "")).strip(), normalizar(str(b if b is not None else "")).strip()
    return na == nb


def etiquetas_de(esquema: Esquema | None, extra: dict | None = None) -> dict[str, str]:
    """{campo del formulario: etiqueta} desde los `destino` del esquema, más `extra`."""
    et: dict[str, str] = {}
    if esquema:
        for clave, d in esquema.campos.items():
            destino = d.get("destino") if "destino" in d else clave
            if destino:
                et[destino] = d.get("etiqueta") or clave
    et.update(extra or {})
    return et


def comparar(
    propuesto: dict,
    actual: dict | None,
    etiquetas: dict[str, str] | None = None,
    dudosos: set[str] | None = None,
    incluir_iguales: bool = False,
) -> list[dict]:
    actual = actual or {}
    etiquetas = etiquetas or {}
    dudosos = dudosos or set()
    filas: list[dict] = []
    for campo, valor in propuesto.items():
        ahora = actual.get(campo)
        vacio_ahora = ahora in (None, "", [], {}) or ahora is False
        if campo in dudosos:
            estado = "dudoso"
        elif _igual(valor, ahora):
            estado = "igual"
        elif vacio_ahora:
            estado = "nuevo"
        else:
            estado = "distinto"
        if estado == "igual" and not incluir_iguales:
            continue
        filas.append({
            "clave": campo,
            "etiqueta": etiquetas.get(campo) or campo.replace("_", " ").capitalize(),
            "actual": ahora if not vacio_ahora else None,
            "propuesto": valor,
            "estado": estado,
            "aceptar": estado in ("nuevo", "distinto"),
        })
    return filas


def aplicar(diferencias: list[dict], actual: dict | None = None, aceptadas: set[str] | None = None) -> dict:
    """Lo que queda en el formulario tras aceptar unas filas: `actual` más lo aceptado
    (`aceptadas` = claves; None = las marcadas `aceptar`). Lo usa la web en memoria y las
    pruebas; el guardado sigue siendo del módulo."""
    salida = dict(actual or {})
    for d in diferencias:
        ok = d["clave"] in aceptadas if aceptadas is not None else d.get("aceptar")
        if ok:
            salida[d["clave"]] = d["propuesto"]
    return salida

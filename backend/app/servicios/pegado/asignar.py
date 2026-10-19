"""De las claves del esquema a los campos del formulario del módulo (puras).

`asignar(lectura)` → (`campos`, `anexos`, `informativos`):

- `campos`: {campo_del_formulario: valor} para las claves con `destino`;
- `anexos`: {campo_del_formulario: [líneas «Etiqueta: valor»]} para las claves con
  `destino: null` y `anexar_a` (prioridad, origen, acción requerida… van a `nota`);
- `informativos`: {clave: valor} para lo que solo se muestra (estado propuesto, pendientes,
  observaciones del modelo, bloques como `agenda` que el endpoint convierte en propuesta).

Un valor de lista va al formulario como texto con una línea por elemento cuando el
campo del módulo es texto (`referencia`, `anexo`…); el módulo decide si lo parte.
"""
from __future__ import annotations

from .lector import Lectura


def _texto(v) -> str:
    if isinstance(v, list):
        return "\n".join(str(x) for x in v)
    if isinstance(v, bool):
        return "sí" if v else "no"
    return "" if v is None else str(v)


def asignar_campos(valores: dict, definicion: dict) -> tuple[dict, dict, dict]:
    campos: dict = {}
    anexos: dict[str, list[str]] = {}
    informativos: dict = {}
    for clave, d in definicion.items():
        if clave not in valores:
            continue
        v = valores[clave]
        if v is None or v == "" or v == [] or v == {}:
            continue
        destino = d.get("destino")
        if "destino" not in d:
            destino = clave
        if destino:
            campos[destino] = v if d.get("tipo") in ("lista", "bloque", "lista_bloques", "entero", "booleano") else _texto(v)
        elif d.get("anexar_a"):
            anexos.setdefault(d["anexar_a"], []).append(f"{d.get('etiqueta') or clave}: {_texto(v)}")
        else:
            informativos[clave] = v
    return campos, anexos, informativos


def asignar(lectura: Lectura) -> tuple[dict, dict, dict]:
    if not lectura.esquema:
        return {}, {}, {}
    return asignar_campos(lectura.valores, lectura.esquema.campos)


def con_anexos(campos: dict, anexos: dict, actual: dict | None = None) -> dict:
    """Las líneas anexas, añadidas al final del campo correspondiente sin repetir las que ya
    están (en `actual` o en lo propuesto)."""
    salida = dict(campos)
    for campo, lineas in anexos.items():
        base = str(salida.get(campo) or (actual or {}).get(campo) or "")
        nuevas = [ln for ln in lineas if ln not in base]
        if nuevas:
            salida[campo] = (base + "\n" if base else "") + "\n".join(nuevas)
    return salida

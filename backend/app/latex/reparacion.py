"""backend/app/latex/reparacion.py — cuando un documento no compila, el sistema reconoce el error y
lo repara solo (2026-10-12, Edison: «conservar el PDF anterior también es un problema: va a
parecer que no actualiza; el sistema debe reconocer esos errores y solucionarlos»).

Escalera de reparaciones, de la que menos cambia a la que más: cada paso se prueba solo si el
anterior no compiló, y el primero que compila es el que queda. Ninguna toca lo guardado: actúan
sobre la copia que se compila, y la web dice qué se ajustó.

| paso | qué hace | pierde contenido |
|---|---|---|
| `formato` | quita los ajustes de formato (`fmt_*`) que no son números o medidas válidas | no |
| `texto` | limpia caracteres de control y símbolos que la fuente no tiene | no |
| `anexos` | compila sin las imágenes anexas que fallan | sí (las imágenes) |
| `cuerpo` | tablas como párrafos, notas al pie entre paréntesis, imágenes del cuerpo fuera | sí (la forma) |
| `plano` | el cuerpo como párrafos de texto sin formato | sí (el formato) |

`clasificar(mensaje)` mira el log de LaTeX y pone primero el paso que mejor encaja con el error
(una imagen que no se encuentra → `anexos`; una medida ilegal → `formato`…). Puras y probadas en
`backend/tests/test_reparacion.py`.
"""
from __future__ import annotations

import copy
import re
import unicodedata

PASOS = ("formato", "texto", "anexos", "cuerpo", "plano")
PIERDE = {"anexos", "cuerpo", "plano"}
DESCRIPCION = {
    "formato": "se usó el formato por omisión en los ajustes que no eran válidos",
    "texto": "se quitaron caracteres que la fuente no puede imprimir",
    "anexos": "se omitieron las imágenes anexas que no se pudieron incluir",
    "cuerpo": "las tablas y notas al pie se compusieron como texto",
    "plano": "el cuerpo se compuso como texto sin formato",
}

_PISTAS = [
    (re.compile(r"File .* not found|Unable to load picture|Cannot determine size of graphic|\.(png|jpe?g|pdf)'? not found", re.I), "anexos"),
    (re.compile(r"Illegal unit|Missing number|Dimension too large|Number too big|Illegal parameter number", re.I), "formato"),
    (re.compile(r"Missing character|Invalid UTF-8|Text line contains an invalid character|Undefined control sequence.*\\\\\?u", re.I), "texto"),
    (re.compile(r"Misplaced alignment tab|Extra alignment tab|Missing \\\\cr|tabular|longtable|footnote", re.I), "cuerpo"),
]
_MEDIDA = re.compile(r"^\s*-?\d+(?:[.,]\d+)?\s*(?:pt|cm|mm|em|ex|in)?\s*$")
_RAROS = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁯﻿-]")


_EXPLICACION = {
    "anexos": "una imagen anexa no se encuentra o no se puede leer: vuelva a subirla o quítela de los anexos",
    "formato": "un ajuste de formato tiene un valor que no es una medida (revise Formato general)",
    "texto": "el texto trae caracteres que la fuente no puede imprimir (símbolos o emoji pegados)",
    "cuerpo": "una tabla o nota al pie del cuerpo no se puede componer (revise la tabla pegada de Word)",
}


def explicar(log: str) -> str:
    """El error de LaTeX en palabras de la persona y qué hacer; vacío si no se reconoce."""
    primero = next((paso for patron, paso in _PISTAS if patron.search(log or "")), None)
    return _EXPLICACION.get(primero, "") if primero else ""


def clasificar(mensaje: str) -> list[str]:
    """El orden de los pasos para este error: el más probable primero, luego el resto en su orden."""
    primero = next((paso for patron, paso in _PISTAS if patron.search(mensaje or "")), None)
    return ([primero] if primero else []) + [p for p in PASOS if p != primero]


def _formato_valido(clave: str, valor) -> bool:
    """Un `fmt_*` vale si es vacío, una medida o número, o una palabra simple (sí/no, una familia)."""
    v = str(valor if valor is not None else "").strip()
    if not v:
        return True
    if _MEDIDA.match(v):
        return True
    return bool(re.match(r"^[\wáéíóúñÁÉÍÓÚÑ .\-]{1,40}$", v)) and not any(c in v for c in "\\{}$&#^_%~")


def reparar_formato(campos: dict) -> tuple[dict, list[str]]:
    salida, quitados = {}, []
    for k, v in (campos or {}).items():
        if k.startswith("fmt_") and not _formato_valido(k, v):
            quitados.append(k)
            continue
        salida[k] = v
    return salida, quitados


_SIMBOLOS_SI = set("•✓✗→←°±×≤≥≠§¶©®™€£$¢")


def _limpio(texto: str) -> str:
    """Sin caracteres de control ni invisibles, sin uso privado ni sin asignar, y sin pictogramas
    (emoji y símbolos que la fuente del marco no tiene); los símbolos de uso común se conservan."""
    t = _RAROS.sub("", unicodedata.normalize("NFC", texto or ""))
    salida = []
    for c in t:
        cat = unicodedata.category(c)
        if c in "\n\t" or c in _SIMBOLOS_SI:
            salida.append(c)
        elif cat in ("Cc", "Cf", "Co", "Cn"):
            continue
        elif cat == "So" or ord(c) >= 0x1F000:
            continue
        else:
            salida.append(c)
    return "".join(salida)


def _recorrer_texto(nodo, fn):
    if isinstance(nodo, dict):
        if nodo.get("type") == "text" and isinstance(nodo.get("text"), str):
            nodo["text"] = fn(nodo["text"])
        for hijo in nodo.get("content") or []:
            _recorrer_texto(hijo, fn)
        for k in ("attrs",):
            if isinstance(nodo.get(k), dict):
                for ak, av in list(nodo[k].items()):
                    if isinstance(av, str) and ak in ("texto", "nota", "titulo"):
                        nodo[k][ak] = fn(av)
    return nodo


def reparar_texto(campos: dict, cuerpo: dict) -> tuple[dict, dict]:
    campos2 = {k: (_limpio(v) if isinstance(v, str) and not k.startswith("fmt_") else v) for k, v in (campos or {}).items()}
    return campos2, _recorrer_texto(copy.deepcopy(cuerpo or {}), _limpio)


def _texto_de(nodo) -> str:
    if not isinstance(nodo, dict):
        return ""
    if nodo.get("type") == "text":
        return nodo.get("text") or ""
    if nodo.get("type") == "hardBreak":
        return " "
    partes = [_texto_de(h) for h in nodo.get("content") or []]
    sep = " · " if nodo.get("type") in ("tableRow",) else (" " if nodo.get("type") in ("paragraph", "heading", "tableCell", "tableHeader", "celda") else " ")
    return sep.join(p for p in partes if p).strip()


def _parrafo(texto: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": texto}]} if texto else {"type": "paragraph"}


def reparar_cuerpo(cuerpo: dict) -> dict:
    """Tablas → un párrafo por fila; notas al pie → «(nota: …)» en el texto; imágenes del cuerpo
    fuera; saltos de página fuera. Listas, títulos y negritas se conservan."""
    def nodo(n):
        if not isinstance(n, dict):
            return [n]
        t = n.get("type")
        if t == "table":
            return [_parrafo(_texto_de(fila)) for fila in n.get("content") or [] if _texto_de(fila)]
        if t in ("fotografia", "image", "saltoPagina"):
            return []
        if t == "footnote":
            interior = _texto_de(n) or str((n.get("attrs") or {}).get("nota") or "")
            return [{"type": "text", "text": f" (nota: {interior})"}] if interior else []
        nuevo = dict(n)
        if "content" in n:
            hijos = []
            for h in n["content"]:
                hijos.extend(nodo(h))
            nuevo["content"] = hijos
        return [nuevo]
    raiz = copy.deepcopy(cuerpo or {"type": "doc", "content": []})
    return nodo(raiz)[0] if raiz else raiz


def reparar_plano(cuerpo: dict) -> dict:
    """El cuerpo como párrafos de texto: uno por párrafo, título o elemento de lista."""
    bloques: list[dict] = []

    def juntar(n):
        if not isinstance(n, dict):
            return
        if n.get("type") in ("paragraph", "heading", "listItem", "tableRow"):
            t = _limpio(_texto_de(n))
            if t:
                bloques.append(_parrafo(t))
            return
        for h in n.get("content") or []:
            juntar(h)
    juntar(cuerpo or {})
    return {"type": "doc", "content": bloques or [_parrafo("")]}


def aplicar(paso: str, campos: dict, cuerpo: dict, anexos: list) -> tuple[dict, dict, list, str]:
    """Aplica UN paso sobre lo que se va a compilar. → (campos, cuerpo, anexos, detalle)."""
    if paso == "formato":
        c, quitados = reparar_formato(campos)
        return c, cuerpo, anexos, (", ".join(quitados) if quitados else "")
    if paso == "texto":
        c, cu = reparar_texto(campos, cuerpo)
        return c, cu, anexos, ""
    if paso == "anexos":
        return campos, cuerpo, [], (f"{len(anexos)} imagen(es)" if anexos else "")
    if paso == "cuerpo":
        return campos, reparar_cuerpo(cuerpo), anexos, ""
    if paso == "plano":
        return campos, reparar_plano(cuerpo), anexos, ""
    raise ValueError(paso)


def util(paso: str, campos: dict, cuerpo: dict, anexos: list) -> bool:
    """¿Cambia algo este paso? (Si no cambia nada, no vale la pena compilar otra vez.)"""
    c2, cu2, a2, _ = aplicar(paso, campos, cuerpo, anexos)
    return c2 != campos or cu2 != cuerpo or a2 != anexos


async def con_reparaciones(intento, campos: dict, cuerpo: dict, anexos: list, permitir_perdida: bool = True):
    """Compila y, si falla, repara y reintenta. `intento(campos, cuerpo, anexos)` es una corrutina que
    devuelve (resultado | None, error_de_nodo). → (resultado | None, campos, cuerpo, anexos,
    reparaciones, mensaje_original, error_final)."""
    resultado, error_nodo = await intento(campos, cuerpo, anexos)
    reparaciones: list[dict] = []
    if resultado is not None and resultado.exito:
        return resultado, campos, cuerpo, anexos, reparaciones, "", ""
    mensaje_original = error_nodo or (resultado.mensaje if resultado else "")
    log_latex = (getattr(resultado, "log", "") if resultado else "") or mensaje_original
    for paso in clasificar(log_latex):
        if paso in PIERDE and not permitir_perdida:
            continue
        if not util(paso, campos, cuerpo, anexos):
            continue
        campos, cuerpo, anexos, detalle = aplicar(paso, campos, cuerpo, anexos)
        reparaciones.append({"paso": paso, "descripcion": DESCRIPCION[paso], "detalle": detalle, "pierde": paso in PIERDE})
        resultado, error_nodo = await intento(campos, cuerpo, anexos)
        if resultado is not None and resultado.exito:
            return resultado, campos, cuerpo, anexos, reparaciones, mensaje_original, ""
    final = error_nodo or (resultado.mensaje if resultado else "") or mensaje_original
    explicacion = explicar((getattr(resultado, "log", "") if resultado else "") or log_latex)
    if explicacion:
        final = f"No se pudo componer: {explicacion}."
    return None, campos, cuerpo, anexos, reparaciones, mensaje_original, final

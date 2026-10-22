"""Validación y normalización de un bloque pegado contra su esquema (puras).

Entra el dict crudo que dio `yaml.safe_load` y sale `Resultado` con los valores ya en la
forma de Qillqa (fechas `AAAA-MM-DD`, horas `HH:MM`, fecha-hora ISO, opciones con el valor
del vocabulario) y tres listas: `errores` (una obligatoria ausente o un valor que no se
puede leer: no se aplica nada), `avisos` (una clave desconocida, un valor dudoso que se
dejó como texto) y `dudas` (claves cuyo valor no casó con el vocabulario: la persona elige).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

from ..lectura import _fecha_dma, _hora, normalizar
from .esquemas import Esquema

# --- los vínculos ----------------------------------------------------------------------------------------------

# Lo que se puede vincular a una tarea, un evento o un pegado («doc:12», «tarea:3»…; antes en servicios/referencias.py,
# hasta Qillqasqa Q3d). Tareas y Agenda tiene la misma lista (servicios/tareas_reglas.py); tests/test_fronteras.py
# comprueba que digan lo mismo (fase 10.2b).
PREFIJOS_VINCULO = ("doc", "pl", "sr", "persona", "inst", "foto", "pedido", "evento", "tarea", "entrada", "rend")
_VINCULO = re.compile(r"^(%s):\d{1,9}$" % "|".join(PREFIJOS_VINCULO))


def vinculo_valido(destino: str) -> bool:
    return bool(_VINCULO.match((destino or "").strip()))


# --- la cita en la Referencia y en «Adj.» (antes en servicios/referencias.py, hasta Qillqasqa Q3d) ----------------
# Edison, 2026-10-18: «de ahora en adelante no quiero esa información adicional». Un documento
# se cita por su denominación y su número («Oficio Múltiple N.º 007-2026-FREDDEH-HUANTA/P»):
# sin la fecha, sin «y anexos» y sin páginas ni folios. La fecha solo se queda cuando el
# documento no tiene número (un memorial s/n): es lo único que lo identifica.

_FECHA = (r"(?:\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|se?tiembre|octubre"
          r"|noviembre|diciembre)(?:\s+(?:de|del)\s+\d{4})?|\d{1,2}/\d{1,2}/\d{2,4})")
_RE_CON_NUMERO = re.compile(r"\bN\s*\.?\s*[°º]|\bN\.?\s*o\.?\s*\d|\bNro\.?\s*\d|\bNúm(?:ero)?\.?\s*\d", re.I)
_RE_EXTENSION = re.compile(r"\s*\((?:[^()]*?\b(?:p[áa]ginas?|p[áa]gs?\.|pp\.|folios?|fs\.|hojas?)\b[^()]*)\)", re.I)
_RE_ANEXOS = re.compile(r",?\s+(?:y|con|más)\s+(?:sus\s+|los\s+)?anexos(?:\s+adjuntos)?\b", re.I)
_RE_FECHA = (
    re.compile(rf"\s*\(\s*(?:de\s+fecha\s+|del?\s+|fecha\s*:?\s*)?{_FECHA}\s*\)", re.I),
    re.compile(rf"\s*,?\s*(?:de\s+fecha|del?|fechad[oa]\s+(?:el\s+)?)\s+{_FECHA}", re.I),
    re.compile(rf"\s*[–—-]\s*{_FECHA}(?=\s|$|[,.;/])", re.I),
)


def cita_documento(texto: str) -> str:
    """Una línea de Referencia o de «Adj.» con solo la denominación y el número del documento:
    «Oficio Múltiple Nº 007-2026-FREDDEH-HUANTA/P, de 15 de octubre de 2026, y anexos (31
    páginas del archivo remitido).» → «Oficio Múltiple Nº 007-2026-FREDDEH-HUANTA/P». Lo que
    no reconoce lo deja como está; la fecha de un documento sin número se conserva."""
    original = (texto or "").strip()
    t = _RE_EXTENSION.sub("", original)
    t = _RE_ANEXOS.sub("", t)
    if _RE_CON_NUMERO.search(t):
        for patron in _RE_FECHA:
            t = patron.sub("", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    if t != original:
        t = t.rstrip(" ,;:–—-").removesuffix(".").rstrip(" ,;")
    return t


_RE_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_RE_ISO_HORA = re.compile(r"^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$")
_RE_DMA_HORA = re.compile(r"^(\d{1,2}/\d{1,2}/\d{4})\s+(.+)$")
_VACIOS = {"", "null", "none", "no indica", "no consta", "desconocido", "n/a", "na", "-", "—", "ninguno", "ninguna"}
_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
_RE_LARGA = re.compile(r"(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+)?(\d{4})", re.I)


@dataclass
class Resultado:
    valores: dict = field(default_factory=dict)
    errores: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    dudas: dict[str, dict] = field(default_factory=dict)   # clave → {valor, opciones}


def es_vacio(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return normalizar(v).strip(" .") in _VACIOS
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


def fecha(v) -> str:
    """Cualquier forma razonable de fecha → `AAAA-MM-DD`; vacío si no se lee."""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v or "").strip()
    if not s:
        return ""
    if _RE_ISO.match(s):
        try:
            return date.fromisoformat(s).isoformat()
        except ValueError:
            return ""
    m = _RE_ISO_HORA.match(s)
    if m:
        return fecha(m.group(1))
    f = _fecha_dma(s)
    if f:
        return f
    m = _RE_LARGA.search(normalizar(s))
    if m and m.group(2) in _MESES:
        try:
            return date(int(m.group(3)), _MESES[m.group(2)], int(m.group(1))).isoformat()
        except ValueError:
            return ""
    return ""


def hora(v) -> str:
    if isinstance(v, datetime):
        return v.strftime("%H:%M")
    s = str(v or "").strip()
    if re.match(r"^\d{1,2}:\d{2}$", s):
        h, m = s.split(":")
        return f"{int(h):02d}:{m}" if int(h) < 24 and int(m) < 60 else ""
    return _hora(s)


def fecha_hora(v) -> tuple[str, str]:
    """→ (`AAAA-MM-DD`, `HH:MM` o ''); ('', '') si no se lee la fecha."""
    if isinstance(v, datetime):
        return v.date().isoformat(), v.strftime("%H:%M")
    if isinstance(v, date):
        return v.isoformat(), ""
    s = str(v or "").strip()
    m = _RE_ISO_HORA.match(s)
    if m:
        h = f"{int(m.group(2)):02d}:{m.group(3)}"
        return fecha(m.group(1)), h if int(m.group(2)) < 24 else ""
    m = _RE_DMA_HORA.match(s)
    if m:
        return fecha(m.group(1)), hora(m.group(2))
    f = fecha(s)
    if f:
        resto = re.sub(r"\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}", "", s)
        return f, hora(resto)
    return "", ""


def opcion(v, definicion: dict) -> str | None:
    """El valor del vocabulario que corresponde (por igualdad normalizada o por sinónimo);
    None si no casa."""
    n = normalizar(str(v or "")).strip()
    if not n:
        return None
    valores = [str(x) for x in definicion.get("valores") or []]
    for val in valores:
        if normalizar(val) == n or normalizar(val).replace("_", " ") == n:
            return val
    for val, sinonimos in (definicion.get("sinonimos") or {}).items():
        for s in sinonimos or []:
            ns = normalizar(str(s))
            if ns == n or (len(ns) >= 4 and ns in n):
                return str(val)
    for val in valores:  # «comisión ordinaria» casa con «comision»
        nv = normalizar(val).replace("_", " ")
        if len(nv) >= 4 and nv in n:
            return val
    return None


def entero(v) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    m = re.search(r"-?\d+", str(v or ""))
    return int(m.group(0)) if m else None


def importe(v) -> float | None:
    """Un monto en soles → número con dos decimales; None si no hay cifras («S/ 2,345.60», «40»,
    12.5, «12,50»). La regla de los separadores es la de yupay/rendicion.py, en su repositorio (`centimos`): Rendición es un
    módulo aislado (Yupay), así que el pegado tiene la suya y tests/test_fronteras.py comprueba que digan lo mismo."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    if not re.search(r"\d", str(v or "")):
        return None
    return centimos(v) / 100


def centimos(valor) -> int:
    """S/ como número o texto («S/ 2,345.60», «40», 12.5) → céntimos. Lo ilegible es 0. «2,345.60» y «2.345,60»:
    el último separador es el decimal si lo siguen 1 o 2 cifras (la misma regla que yupay/rendicion.py, en su repositorio)."""
    if valor is None or valor == "" or isinstance(valor, bool):
        return 0
    if isinstance(valor, int):
        return valor * 100
    if isinstance(valor, float):
        return int(round(valor * 100))
    s = re.sub(r"[^\d,.\-]", "", str(valor))
    if not s or s in "-.,":
        return 0
    m = re.match(r"^(-?)([\d.,]*?)(?:[.,](\d{1,2}))?$", s)
    if not m:
        return 0
    signo, entero, dec = m.group(1), re.sub(r"[.,]", "", m.group(2) or "0"), (m.group(3) or "0")
    total = int(entero or "0") * 100 + int(dec.ljust(2, "0"))
    return -total if signo else total


def booleano(v) -> bool | None:
    if isinstance(v, bool):
        return v
    n = normalizar(str(v or "")).strip()
    if n in {"si", "sí", "true", "verdadero", "1", "x"}:
        return True
    if n in {"no", "false", "falso", "0"}:
        return False
    return None


def lista(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x).strip() for x in v if not es_vacio(x) and not isinstance(x, (dict, list))]
    s = str(v).strip()
    if not s or es_vacio(s):
        return []
    partes = [p.strip(" -•·") for p in re.split(r"\n|;", s)]
    return [p for p in partes if p]


def _texto(v) -> str:
    if isinstance(v, (list, tuple)):
        return "\n".join(str(x).strip() for x in v if not es_vacio(x))
    if isinstance(v, (date, datetime)):
        return fecha(v)
    return re.sub(r"[ \t]+", " ", str(v)).strip()


def validar_campos(datos: dict, campos: dict, esquema: Esquema, prefijo: str = "") -> Resultado:
    """Un dict crudo contra una definición de campos (los del esquema o los de un bloque)."""
    r = Resultado()
    datos = datos if isinstance(datos, dict) else {}
    conocidas = set(campos)
    for clave in datos:
        if str(clave) not in conocidas and str(clave) not in ("tipo", "version"):
            r.avisos.append(f"Clave desconocida «{prefijo}{clave}»: se ignora.")
    for clave, d in campos.items():
        etiqueta = d.get("etiqueta") or clave
        crudo = datos.get(clave)
        if es_vacio(crudo):
            if d.get("obligatorio"):
                r.errores.append(f"Falta «{etiqueta}» ({prefijo}{clave}), que es obligatorio.")
            continue
        t = d.get("tipo", "texto")
        if t in ("texto", "texto_largo"):
            r.valores[clave] = _texto(crudo)
        elif t == "fecha":
            f = fecha(crudo)
            if f:
                r.valores[clave] = f
            else:
                r.errores.append(f"«{etiqueta}» no es una fecha legible: {crudo!r} (se espera AAAA-MM-DD).")
        elif t == "hora":
            h = hora(crudo)
            if h:
                r.valores[clave] = h
            else:
                r.avisos.append(f"«{etiqueta}» no es una hora legible: {crudo!r}; se deja vacía.")
        elif t == "fecha_hora":
            f, h = fecha_hora(crudo)
            if f:
                r.valores[clave] = f"{f}T{h}:00" if h else f
            else:
                r.errores.append(f"«{etiqueta}» no es una fecha legible: {crudo!r} (se espera AAAA-MM-DD HH:MM).")
        elif t == "opcion":
            o = opcion(crudo, d)
            if o is not None:
                r.valores[clave] = o
            else:
                r.dudas[prefijo + clave] = {"valor": _texto(crudo), "opciones": list(d.get("valores") or [])}
                r.avisos.append(f"«{etiqueta}»: {crudo!r} no está entre {', '.join(d.get('valores') or [])}; elija uno.")
        elif t == "entero":
            n = entero(crudo)
            if n is not None:
                r.valores[clave] = n
            else:
                r.avisos.append(f"«{etiqueta}» no es un número: {crudo!r}; se deja vacío.")
        elif t == "importe":
            m = importe(crudo)
            if m is not None:
                r.valores[clave] = m
            elif d.get("obligatorio"):
                r.errores.append(f"«{etiqueta}» no es un monto legible: {crudo!r} (se espera 12.50).")
            else:
                r.avisos.append(f"«{etiqueta}» no es un monto: {crudo!r}; se deja vacío.")
        elif t == "booleano":
            b = booleano(crudo)
            if b is not None:
                r.valores[clave] = b
            else:
                r.avisos.append(f"«{etiqueta}» no es sí/no: {crudo!r}; se deja vacío.")
        elif t == "lista":
            r.valores[clave] = lista(crudo)
        if d.get("forma") == "cita" and clave in r.valores:
            _a_cita(r, clave, etiqueta)
        elif t == "bloque":
            sub = validar_campos(crudo, esquema.bloque(d["esquema"]), esquema, f"{prefijo}{clave}.")
            r.valores[clave] = sub.valores
            r.errores += sub.errores
            r.avisos += sub.avisos
            r.dudas.update(sub.dudas)
        elif t == "lista_bloques":
            filas = crudo if isinstance(crudo, list) else [crudo]
            salida = []
            for i, fila in enumerate(filas, 1):
                if es_vacio(fila):
                    continue
                if not isinstance(fila, dict):
                    r.avisos.append(f"«{etiqueta}» n.º {i} no es un bloque de claves; se ignora.")
                    continue
                sub = validar_campos(fila, esquema.bloque(d["esquema"]), esquema, f"{prefijo}{clave}[{i}].")
                salida.append(sub.valores)
                r.errores += sub.errores
                r.avisos += sub.avisos
                r.dudas.update(sub.dudas)
            r.valores[clave] = salida
            if d.get("obligatorio") and not salida:
                r.errores.append(f"«{etiqueta}» no trae ningún elemento.")
    return r


def _a_cita(r: Resultado, clave: str, etiqueta: str) -> None:
    """`forma: cita` (Referencia, «Adj.»): solo la denominación y el número del documento;
    la fecha, «y anexos» y las páginas se quitan, con un aviso (referencias.cita_documento)."""
    v = r.valores[clave]
    limpio = [cita_documento(x) for x in v] if isinstance(v, list) else "\n".join(cita_documento(x) for x in v.split("\n"))
    if limpio != v:
        r.valores[clave] = [x for x in limpio if x] if isinstance(limpio, list) else limpio
        r.avisos.append(f"«{etiqueta}»: se dejó solo la denominación y el número (sin fecha, anexos ni páginas).")


def validar(datos: dict, esquema: Esquema) -> Resultado:
    """El bloque entero contra su esquema. `version` distinta a la del esquema es un aviso
    (las claves se leen igual; lo que no exista se avisa como desconocido)."""
    r = validar_campos(datos, esquema.campos, esquema)
    v = datos.get("version") if isinstance(datos, dict) else None
    if v is not None and str(v) != str(esquema.version):
        r.avisos.append(
            f"El bloque dice version {v} y el sistema espera {esquema.version}: revise las claves."
        )
    return r

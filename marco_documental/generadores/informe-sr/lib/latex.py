"""lib/latex.py — Utilidades de texto para emitir LaTeX seguro (una responsabilidad).

- escapar(): caracteres especiales de LaTeX.
- md_a_tex(): Markdown mínimo (negrita, cursiva, listas, párrafos) → LaTeX.
- fechas y horas en español (formato del despacho).
"""
from __future__ import annotations

import datetime as dt
import re
import unicodedata

from config import DIAS_ES, MESES_ES

_ESC = {
    "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
    "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}


# Limpieza del texto pegado de Word: la MISMA que `sgdp/backend/app/latex/serializador.py`
# (el generador corre aparte y no puede importarla); `sgdp/backend/tests/test_simbolos_word.py`
# comprueba que las dos copias dan lo mismo.
_INVISIBLES = {
    " ": " ",   # espacio no separable (nbsp de Word)
    " ": " ",   # nbsp fino
    " ": " ",   # espacio de cifra
    " ": " ",   # espacio fino
    "\t": " ",
    "​": "",    # ancho cero
    "‌": "",
    "‍": "",
    "﻿": "",    # BOM
    "­": "",    # guion suave
    "\r": "",
}


# Word escribe los símbolos de sus fuentes Symbol y Wingdings en la zona de USO PRIVADO
# (U+F000–U+F0FF): el «°» de Symbol llega como U+F0B0, la viñeta como U+F0B7… Ninguna fuente
# del marco los dibuja y desaparecían del PDF. Se traducen al carácter real; el resto de la
# zona privada se descarta.
_PRIVADOS_WORD = {
    "\uf0b0": "°", "\uf0b7": "•", "\uf0a7": "•", "\uf0a8": "•", "\uf076": "•", "\uf0d8": "•",
    "\uf0fc": "✓", "\uf0fb": "✗", "\uf0e0": "→", "\uf0ae": "→", "\uf0ac": "←", "\uf0b1": "±",
    "\uf0b4": "×", "\uf0a3": "≤", "\uf0b3": "≥", "\uf0b9": "≠", "\uf02d": "-", "\uf02a": "*",
}
# Lo que las fuentes del marco (Source Serif 4, Archivo, Inter) no tienen: se compone en modo
# matemático, que sí lo dibuja.
_SIN_GLIFO = {
    "→": r"\ensuremath{\rightarrow}", "←": r"\ensuremath{\leftarrow}", "↔": r"\ensuremath{\leftrightarrow}",
    "⇒": r"\ensuremath{\Rightarrow}", "≤": r"\ensuremath{\leq}", "≥": r"\ensuremath{\geq}",
    "≠": r"\ensuremath{\neq}", "≈": r"\ensuremath{\approx}", "✓": r"\ensuremath{\surd}",
    "✔": r"\ensuremath{\surd}", "✗": "x", "✘": "x", "\u2011": "-", "−": "-",
}


def _visible(c: str) -> bool:
    """Fuera: controles C0 (salvo salto de línea) y C1, selectores de variante, zona privada y
    emoji (ninguna fuente del marco los tiene)."""
    o = ord(c)
    if c == "\n":
        return True
    if o < 32 or 0x7F <= o <= 0x9F or 0xFE00 <= o <= 0xFE0F or 0xE000 <= o <= 0xF8FF:
        return False
    return not (0x1F000 <= o <= 0x1FAFF or 0x2600 <= o <= 0x26FF or 0x2700 <= o <= 0x27BF and c not in _SIN_GLIFO)


def limpiar(texto: str) -> str:
    """Texto pegado de Word o de la web → texto limpio: forma Unicode compuesta (NFC: la «é»
    de dos piezas pasa a una), invisibles y espacios raros, separadores de línea Unicode, los
    símbolos de las fuentes de Word y fuera lo que no se puede imprimir."""
    texto = unicodedata.normalize("NFC", texto or "")
    texto = texto.replace("\u2028", "\n").replace("\u2029", "\n")
    texto = "".join(_PRIVADOS_WORD.get(c, _INVISIBLES.get(c, c)) for c in texto)
    return "".join(c for c in texto if _visible(c))


def escapar(texto) -> str:
    """Limpia lo pegado de Word y escapa los caracteres reservados de LaTeX. None → cadena vacía."""
    if texto is None:
        return ""
    return "".join(_ESC.get(c) or _SIN_GLIFO.get(c, c) for c in limpiar(str(texto)))


def _inline(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\\emph{\1}", s)
    return s


def md_a_tex(texto) -> str:
    """Markdown mínimo → LaTeX. Se escapa ANTES de interpretar las marcas.

    Soporta: párrafos (línea en blanco), **negrita**, *cursiva*, listas con «- ».
    Pensado para los textos narrativos de informe.yaml (presentación,
    metodología, conclusiones)."""
    if not texto:
        return ""
    bloques, lista, salida = [], [], []
    for linea in escapar(texto).splitlines():
        if linea.strip().startswith("- "):
            lista.append(linea.strip()[2:].strip())
            continue
        if lista:
            salida.append("\\begin{itemize}\n" + "\n".join(f"  \\item {_inline(i)}" for i in lista) + "\n\\end{itemize}")
            lista = []
        if linea.strip() == "":
            if bloques:
                salida.append(_inline(" ".join(bloques)))
                bloques = []
        else:
            bloques.append(linea.strip())
    if lista:
        salida.append("\\begin{itemize}\n" + "\n".join(f"  \\item {_inline(i)}" for i in lista) + "\n\\end{itemize}")
    if bloques:
        salida.append(_inline(" ".join(bloques)))
    return "\n\n".join(salida)


# --- Fechas y horas -----------------------------------------------------------------
def a_fecha(v) -> dt.date | None:
    if v in (None, ""):
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return dt.date.fromisoformat(str(v)[:10])


def fecha_larga(v, con_dia=True) -> str:
    d = a_fecha(v)
    if d is None:
        return ""
    base = f"{d.day} de {MESES_ES[d.month]} de {d.year}"
    return f"{DIAS_ES[d.weekday()]} {base}" if con_dia else base


def dia_nombre(v, capital=False) -> str:
    d = a_fecha(v)
    n = DIAS_ES[d.weekday()] if d else ""
    return n.capitalize() if capital else n


def mes_nombre(mes: int, capital=False) -> str:
    n = MESES_ES[mes]
    return n.capitalize() if capital else n


def _minutos(h) -> int | None:
    if h in (None, ""):
        return None
    hh, mm = str(h).split(":")
    return int(hh) * 60 + int(mm)


def hora_rango(ini, fin) -> str:
    """'09:30–11:30' · 'desde las 11:47' · '' si no consta."""
    if ini and fin:
        return f"{ini}–{fin}"
    if ini:
        return f"desde las {ini}"
    return ""


def duracion_min(ini, fin) -> int | None:
    a, b = _minutos(ini), _minutos(fin)
    if a is None or b is None or b < a:
        return None
    return b - a


def duracion_texto(ini, fin) -> str:
    m = duracion_min(ini, fin)
    if m is None:
        return ""
    h, r = divmod(m, 60)
    if h and r:
        return f"{h} h {r:02d} min"
    if h:
        return f"{h} h"
    return f"{r} min"


def horas_texto(minutos: int) -> str:
    """Total de minutos → '9 h 10 min' / '9 h'."""
    h, r = divmod(int(minutos), 60)
    return f"{h} h {r:02d} min" if r else f"{h} h"


def horas_decimal(minutos: int) -> str:
    """Total de minutos → '25,8 h' (cifra compacta para las cajas de dato)."""
    return f"{int(minutos) / 60:.1f}".replace(".", ",") + " h"


def lista_es(items: list[str], conj="y") -> str:
    """['a','b','c'] → 'a, b y c'."""
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" {conj} " + items[-1]

#!/usr/bin/env python3
"""scripts/importar_proyecto_ley.py — un PROYECTO DE LEY en PDF o en Word (.docx) pasa a un proyecto del SGDP.

Piloto de la plataforma (2026-10-01). Lee el PDF con `pdftotext`, quita los
encabezados que se repiten en cada página, separa las PARTES por sus rótulos
oficiales (Artículo 1.-, DISPOSICIONES COMPLEMENTARIAS…, I. FUNDAMENTOS, II.
EFECTO…, III. ANÁLISIS COSTO-BENEFICIO…), convierte las notas al pie en notas
reales del editor (en su lugar del texto) y en FUENTES del proyecto, y lo carga
todo por la API — el mismo camino que la web, con su bitácora.

Lo propio del despacho (autor, adherentes, número, borrador) NO está aquí: llega
en un archivo de ficha JSON (`--ficha`), que vive en el despacho.

Un .docx (2026-10-01, segunda proposición del despacho) se lee DIRECTO, sin pasar por PDF:
la numeración automática de Word («1.», «a)») se materializa desde numbering.xml y las
negritas marcan los rótulos; el resto del camino (partes, textos citados, carga) es el mismo.
Uso:
  SGDP_API=http://127.0.0.1:8000 SGDP_USUARIO=… SGDP_CLAVE=… \\
    python3 scripts/importar_proyecto_ley.py PL.pdf|PL.docx --ficha ficha.json [--simular]
  --simular  solo analiza y muestra el reparto en partes, sin escribir nada.
Las TABLAS del PDF se reconstruyen con PyMuPDF (`pymupdf`): córrase con un
Python que lo tenga (el `python3` del sistema); sin él, entran como texto.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

# --- 1. Texto ----------------------------------------------------------------

# Una nota al pie es «N Texto» (número, espacio opcional y texto) o el número
# solo en su línea. Nunca «1. Texto» ni «1) Texto»: esos son incisos de la
# ley, y tomarlos por notas los sacaba del articulado (hallado en el piloto).
RE_NOTA = re.compile(r"^(\d{1,3})(?:\s?([^\s.\d)].*))?$")


# Tablas del PDF (paso 3.4, 2026-10-01): las detecta PyMuPDF por sus líneas y
# su texto se reemplaza en el flujo por la marca «§TABLA n§», que `parrafos`
# convierte en una tabla del editor. Sin PyMuPDF el importador sigue igual
# (las tablas salen como texto corrido) y lo avisa.
TABLAS: dict[int, list[list[str]]] = {}
MARCA_TABLA = re.compile(r"^§TABLA (\d+)§$")
# Fotos de un Word (2026-10-05): la imagen sale del .docx y su párrafo es la marca
# «§FOTO n§»; el rótulo «FOTOGRAFÍA — N° …» que la sigue lo numera la clase.
FOTOS: dict[int, dict] = {}
MARCA_FOTO = re.compile(r"^§FOTO (\d+)§$")
RE_ROTULO_FOTO = re.compile(r"^FOTOGRAF[ÍI]A\b", re.IGNORECASE)
# Llamada a una nota al pie de Word dentro del texto: «⟦id⟧» (el id del footnotes.xml).
MARCA_NOTA = re.compile(r"⟦(\d+)⟧")


def reiniciar() -> None:
    """Vacía el estado de una lectura anterior (la API reutiliza el módulo)."""
    TABLAS.clear()
    FOTOS.clear()


def _pdftotext(pdf: Path, *opciones: str) -> str:
    return subprocess.run(["pdftotext", *opciones, str(pdf), "-"], capture_output=True, text=True, check=True).stdout


def tablas_pdf(pdf: Path) -> dict[int, list[tuple[float, float, list[list[str]]]]]:
    """{página: [(y0, y1, filas)]}, sin la falsa «tabla» del membrete (la
    misma caja repetida en muchas páginas)."""
    try:
        import pymupdf
    except ImportError:
        print("Aviso: sin PyMuPDF (pymupdf) las tablas del PDF entran como texto corrido.")
        return {}
    from collections import Counter

    doc = pymupdf.open(str(pdf))
    halladas = []
    for i, pagina in enumerate(doc):
        for t in pagina.find_tables().tables:
            filas = [[re.sub(r"\s+", " ", c or "").strip() for c in f] for f in t.extract()]
            halladas.append((i, t.bbox, filas))
    caja = Counter(tuple(round(x) for x in b) for _, b, _ in halladas)
    por_pagina: dict[int, list[tuple[float, float, list[list[str]]]]] = {}
    for i, b, filas in halladas:
        if caja[tuple(round(x) for x in b)] >= 3 or len(filas) < 2 or len(filas[0]) < 2:
            continue
        por_pagina.setdefault(i, []).append((b[1], b[3], filas))
    return {i: sorted(v) for i, v in por_pagina.items()}


def _continuar(filas: list[list[str]], nuevas: list[list[str]]) -> None:
    """Une el trozo de una tabla que sigue en la página siguiente: una fila
    cuyas primeras celdas vienen vacías es la misma fila partida por el salto."""
    for f in nuevas:
        if filas and f and not f[0] and any(f):
            filas[-1] = [(a + " " + b).strip() for a, b in zip(filas[-1], f)]
        else:
            filas.append(f)


def texto_pdf(pdf: Path) -> list[str]:
    paginas = _pdftotext(pdf).split("\f")
    tablas = tablas_pdf(pdf)
    if not tablas:
        return paginas
    ancho, alto = 612.0, 792.0
    try:
        import pymupdf

        ancho, alto = pymupdf.open(str(pdf))[0].rect.width, pymupdf.open(str(pdf))[0].rect.height
    except Exception:
        pass
    # Recorte de la página: sin -x/-W, pdftotext toma ancho 0 y no devuelve nada.
    caja = ["-x", "0", "-W", str(int(ancho) + 1)]
    anterior: tuple[int, float, int] | None = None  # (página, y1, n.º de tabla) de la última tabla
    for i in sorted(tablas):
        trozos: list[str] = []
        y = 0.0
        for y0, y1, filas in tablas[i]:
            trozos.append(_pdftotext(pdf, "-f", str(i + 1), "-l", str(i + 1), *caja, "-y", str(int(y)), "-H", str(max(1, int(y0 - y)))))
            # ¿Sigue la tabla de la página anterior? Empieza arriba, la otra
            # terminaba abajo y tiene las mismas columnas.
            if anterior and anterior[0] == i - 1 and anterior[1] > alto * 0.75 and y0 < alto * 0.2 and len(filas[0]) == len(TABLAS[anterior[2]][0]):
                _continuar(TABLAS[anterior[2]], filas)
                n = anterior[2]
            else:
                n = len(TABLAS) + 1
                TABLAS[n] = [list(f) for f in filas]
                trozos.append(f"\n§TABLA {n}§\n")
            anterior = (i, y1, n)
            y = y1 + 1
        trozos.append(_pdftotext(pdf, "-f", str(i + 1), "-l", str(i + 1), *caja, "-y", str(int(y)), "-H", str(int(alto - y) + 1)))
        paginas[i] = "".join(t.rstrip("\f") for t in trozos)
    return paginas


def limpiar(paginas: list[str]) -> tuple[list[str], dict[int, str]]:
    """Líneas del cuerpo (sin encabezados repetidos) y notas al pie {n: texto}."""
    primeras = [l.strip() for l in paginas[0].splitlines() if l.strip()][:3]
    cabecera = {l for l in primeras if sum(l in p for p in paginas) > len(paginas) // 2}
    cuerpo: list[str] = []
    notas: dict[int, str] = {}
    esperada = 1
    for pagina in paginas:
        lineas = [l.rstrip() for l in pagina.splitlines()]
        lineas = [l for l in lineas if l.strip() not in cabecera]
        # Las notas están al final de la página: desde la primera línea que
        # empieza con el número de nota esperado.
        corte = len(lineas)
        for i, l in enumerate(lineas):
            m = RE_NOTA.match(l.strip())
            if m and int(m.group(1)) in (esperada, esperada + 1) and i > len(lineas) * 0.3:
                corte = i
                break
        cuerpo.extend(lineas[:corte])
        actual = None
        for l in lineas[corte:]:
            m = RE_NOTA.match(l.strip())
            if m and int(m.group(1)) in (esperada, esperada + 1):
                actual = int(m.group(1))
                notas[actual] = (m.group(2) or "").strip()
                esperada = actual + 1
            elif actual is not None and l.strip():
                notas[actual] += " " + l.strip()
    return cuerpo, notas


# --- 2. Partes ---------------------------------------------------------------

# (clave de la parte, patrón del rótulo que la abre). El orden es el del PDF.
CORTES = [
    ("titulo", r"^FÓRMULA LEGAL:?$"),
    # «TÍTULO PRELIMINAR» es su propia parte; «TÍTULO I»/«CAPÍTULO I» abren la
    # sustantiva (antes se iban con el título de la ley y se perdían).
    ("preliminar", r"^T[ÍI]TULO PRELIMINAR\b"),
    ("sustantiva", r"^(Artículo 1\.?-|T[ÍI]TULO I$|CAP[ÍI]TULO I$)"),
    ("dcm", r"^DISPOSICI[OÓ]N(ES)? COMPLEMENTARIAS? MODIFICATORIAS?"),
    ("dcf", r"^DISPOSICI[OÓ]N(ES)? COMPLEMENTARIAS? FINAL(ES)?"),
    ("dct", r"^DISPOSICI[OÓ]N(ES)? COMPLEMENTARIAS? TRANSITORIAS?"),
    ("dcd", r"^DISPOSICI[OÓ]N(ES)? COMPLEMENTARIAS? DEROGATORIAS?"),
    # El rótulo «EXPOSICIÓN DE MOTIVOS» cierra la fórmula legal (no es contenido).
    ("_exposicion", r"^EXPOSICI[OÓ]N DE MOTIVOS$"),
    # Con o sin el romano (un Word no siempre numera igual: 2026-10-05).
    ("fundamentos", r"^([IVX]+\.\s*)?FUNDAMENTOS"),
    ("efecto", r"^([IVX]+\.\s*)?EFECTO DE LA VIGENCIA"),
    ("costo-beneficio", r"^([IVX]+\.\s*)?AN[AÁ]LISIS (DEL? )?COSTO"),
    ("ambiental", r"^([IVX]+\.\s*)?INCIDENCIA AMBIENTAL"),
    ("agenda", r"^([IVX]+\.\s*)?RELACI[OÓ]N CON LA AGENDA"),
    ("conclusion", r"^([IVX]+\.\s*)?CONCLUSI[OÓ]N"),
]
# Dentro de los fundamentos, el apartado de antecedentes pasa a su parte.
ANTECEDENTES = r"^I\.\d+\.\s+Antecedentes legislativos"
FIN_ANTECEDENTES = r"^I\.\d+\.\s+(?!Antecedentes)"
RE_RUBRO = re.compile(
    # Guion o raya: el PDF real escribe «PRIMERA. -» y «SEGUNDA. –» (hallado en el piloto).
    # Un artículo CITADO de otra norma abre con comillas («“Artículo 359-D.-»).
    r"^[“\"]Artículo \d+[A-Z]?(-[A-Z])?\.\s+[A-ZÁÉÍÓÚ]|"
    r"^[“\"]?(Artículo \d+[A-Z]?(-[A-Z])?\.?\s?[-–]|(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA|ÚNICA)\.? ?[-–]|"
    r"[IVX]+\.(\d+\.)*\s|DISPOSICI|EXPOSICI)"
)
RE_ITEM = re.compile(r"^([a-z]\)|\d+(-[A-Z])?\.\d+\.?\s|\d{1,2}\.\s+[A-ZÁÉÍÓÚ]|•|-\s)")


def partes(lineas: list[str]) -> dict[str, list[str]]:
    trozos: dict[str, list[str]] = {}
    actual = "_presentacion"
    for l in lineas:
        s = l.strip()
        for clave, patron in CORTES:
            if re.match(patron, s) and clave not in trozos:
                actual = clave
                break
        trozos.setdefault(actual, []).append(s)
    if "fundamentos" in trozos:
        f = trozos["fundamentos"]
        ini = next((i for i, l in enumerate(f) if re.match(ANTECEDENTES, l)), None)
        if ini is not None:
            fin = next((i for i in range(ini + 1, len(f)) if re.match(FIN_ANTECEDENTES, f[i])), len(f))
            trozos["antecedentes"] = f[ini:fin]
            trozos["fundamentos"] = f[:ini] + f[fin:]
    # Lo que sigue a «EXPOSICIÓN DE MOTIVOS» antes de un rótulo conocido (una
    # exposición con su propio esquema) va a los fundamentos: antes se perdía.
    sueltas = [l for l in trozos.pop("_exposicion", [])[1:] if l]
    if sueltas:
        trozos["fundamentos"] = sueltas + trozos.get("fundamentos", [])
    # El rótulo «FÓRMULA LEGAL» no es contenido; el título de la ley sí.
    if "titulo" in trozos:
        trozos["titulo"] = [l for l in trozos["titulo"] if l and not re.match(r"^FÓRMULA LEGAL:?$", l)]
    return trozos


def parrafos(lineas: list[str]) -> list[tuple[str, str]]:
    """[(tipo, texto)] con tipo 'rubro' o 'p'. Une las líneas cortadas."""
    salida: list[tuple[str, str]] = []
    buf = ""
    tipo = "p"

    def cerrar():
        nonlocal buf, tipo
        if buf.strip():
            salida.append((tipo, re.sub(r"\s+", " ", buf).strip()))
        buf, tipo = "", "p"

    rubro_abierto = False
    for l in lineas:
        if not l:
            continue
        # Un rótulo que llenó su línea sigue en la siguiente, más corta y sin
        # punto final («…de la participación» / «democrática»; «…Ley que
        # regula la» / «responsabilidad…»). El cuerpo que sigue a un rótulo
        # llena la línea (≥ 88) o es una oración cerrada.
        if (
            rubro_abierto and not buf and len(salida[-1][1]) >= 65 and len(l) < 88
            and not l.endswith((".", ":", ";")) and not RE_RUBRO.match(l) and not RE_ITEM.match(l)
        ):
            salida[-1] = ("rubro", f"{salida[-1][1]} {l}")
            rubro_abierto = False
            continue
        rubro_abierto = False
        if MARCA_TABLA.match(l.strip()):
            cerrar()
            salida.append(("tabla", MARCA_TABLA.match(l.strip()).group(1)))
            continue
        nuevo = (
            RE_RUBRO.match(l)
            or RE_ITEM.match(l)
            # Fin de oración, también tras la comilla que cierra una cita («….”»).
            or (buf.rstrip().endswith((".", ":", ";", ".”", ".»", '."')) and l[:1].isupper())
            # Tras «en los siguientes términos:» abre el texto citado.
            or (buf.rstrip().endswith(":") and l[:1] in "“\"«")
            # «(...)» o «(…)»: lo omitido de la norma citada, en su línea.
            or l.startswith(("(...)", "(…)"))
            or buf.strip() in ("(...)", "(…)")
        )
        if nuevo:
            cerrar()
            if RE_RUBRO.match(l) and len(l) < 140 and not l.endswith(","):
                # Un rótulo («Artículo 5.- Garantías…») va solo en su línea.
                tipo = "rubro"
                buf = l
                cerrar()
                rubro_abierto = True
                continue
        buf = f"{buf} {l}" if buf else l
    cerrar()
    return salida


# --- 2 bis. Word (.docx) --------------------------------------------------------

# Divisiones de la fórmula legal: van como rótulo (el generador las centra).
RE_DIVISION = re.compile(r"^(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N)\s+([IVXLC]+|PRELIMINAR|[ÚU]NICO)\b", re.IGNORECASE)
_FORMATOS = {
    "decimal": str,
    "lowerLetter": lambda n: chr(96 + n),
    "upperLetter": lambda n: chr(64 + n),
    "lowerRoman": lambda n: _romano(n).lower(),
    "upperRoman": lambda n: _romano(n),
}


def _romano(n: int) -> str:
    salida = ""
    for v, l in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= v:
            salida += l
            n -= v
    return salida


def notas_docx(d) -> dict[int, str]:
    """{id: texto} de las notas al pie del Word (footnotes.xml), sin los separadores."""
    from docx.oxml import parse_xml
    from docx.oxml.ns import qn

    parte = next((r.target_part for r in d.part.rels.values() if r.reltype.endswith("/footnotes")), None)
    if parte is None:
        return {}
    raiz = parse_xml(parte.blob)
    notas: dict[int, str] = {}
    for f in raiz.findall(qn("w:footnote")):
        if f.get(qn("w:type")) in ("separator", "continuationSeparator", "continuationNotice"):
            continue
        texto = " ".join(" ".join(t.text or "" for t in par.iter(qn("w:t"))) for par in f.findall(qn("w:p")))
        texto = " ".join(texto.split())
        if texto:
            notas[int(f.get(qn("w:id")))] = texto
    return notas


def _texto_parrafo(p_el, d) -> tuple[str, list[int]]:
    """(texto del párrafo con las llamadas de nota como «⟦id⟧», fotos que trae).
    `Paragraph.text` omite las llamadas y las imágenes; aquí se recorren los runs."""
    from docx.oxml.ns import qn

    partes: list[str] = []
    fotos: list[int] = []
    for el in p_el.iter():
        if el.tag == qn("w:t"):
            partes.append(el.text or "")
        elif el.tag in (qn("w:tab"), qn("w:br")):
            partes.append(" ")
        elif el.tag == qn("w:footnoteReference"):
            partes.append(f"⟦{el.get(qn('w:id'))}⟧")
        elif el.tag.endswith("}blip"):
            rid = el.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
            parte = d.part.related_parts.get(rid) if rid else None
            tipo = getattr(parte, "content_type", "")
            if parte is not None and tipo in ("image/jpeg", "image/png"):
                n = len(FOTOS) + 1
                FOTOS[n] = {"datos": parte.blob, "ext": "png" if tipo == "image/png" else "jpg"}
                fotos.append(n)
    return " ".join("".join(partes).split()), fotos


def texto_docx(ruta: Path) -> tuple[list[str], set[str], dict[int, str]]:
    """(párrafos en orden, textos que son rótulos, notas al pie {id: texto}).
    Materializa la numeración automática de Word: un inciso «1.» o «a)» de una
    lista de Word no está en el texto del párrafo, sino en numbering.xml; sin
    esto se perdía. Las notas al pie quedan como «⟦id⟧» en su lugar (2026-10-05)
    y cada imagen JPG o PNG como un párrafo «§FOTO n§»."""
    import docx
    from docx.oxml.ns import qn

    reiniciar()
    d = docx.Document(str(ruta))
    niveles: dict[str, dict[int, tuple[str, str, int]]] = {}
    numeracion = getattr(d.part, "numbering_part", None)
    if numeracion is not None:
        raiz = numeracion.element
        abstractos = {}
        for a in raiz.findall(qn("w:abstractNum")):
            lv = {}
            for l in a.findall(qn("w:lvl")):
                fmt = l.find(qn("w:numFmt"))
                txt = l.find(qn("w:lvlText"))
                ini = l.find(qn("w:start"))
                lv[int(l.get(qn("w:ilvl")))] = (
                    fmt.get(qn("w:val")) if fmt is not None else "decimal",
                    txt.get(qn("w:val")) if txt is not None else "%1.",
                    int(ini.get(qn("w:val"))) if ini is not None else 1,
                )
            abstractos[a.get(qn("w:abstractNumId"))] = lv
        for n in raiz.findall(qn("w:num")):
            ref = n.find(qn("w:abstractNumId"))
            if ref is not None:
                niveles[n.get(qn("w:numId"))] = abstractos.get(ref.get(qn("w:val")), {})
    contadores: dict[str, list[int]] = {}

    def etiqueta(p) -> str:
        num = p._p.find(f"{qn('w:pPr')}/{qn('w:numPr')}")
        if num is None:
            return ""
        nid = num.find(qn("w:numId"))
        ilv = num.find(qn("w:ilvl"))
        nid = nid.get(qn("w:val")) if nid is not None else ""
        nivel = int(ilv.get(qn("w:val"))) if ilv is not None else 0
        lv = niveles.get(nid, {})
        if nid in ("", "0") or nivel not in lv:
            return ""
        fmt, plantilla, ini = lv[nivel]
        c = contadores.setdefault(nid, [0] * 9)
        c[nivel] = (c[nivel] or ini - 1) + 1
        for k in range(nivel + 1, 9):
            c[k] = 0
        if fmt == "bullet":
            return "•"
        texto = plantilla
        for k in range(nivel + 1):
            f = _FORMATOS.get(lv.get(k, ("decimal",))[0], str)
            texto = texto.replace(f"%{k + 1}", f(c[k] or lv.get(k, ("", "", 1))[2]))
        return texto

    parrafos: list[str] = []
    rotulos: set[str] = set()
    cuerpo = d.element.body
    for hijo in cuerpo.iterchildren():
        if hijo.tag == qn("w:p"):
            p = docx.text.paragraph.Paragraph(hijo, d)
            texto, fotos = _texto_parrafo(hijo, d)
            parrafos.extend(f"§FOTO {n}§" for n in fotos)
            if not texto:
                continue
            marca = etiqueta(p)
            if marca:
                texto = f"{marca} {texto}"
            runs = [r for r in p.runs if r.text.strip()]
            negrita = bool(runs) and all(r.bold or (r.style and r.style.font.bold) for r in runs)
            if (negrita and len(texto) < 220 and not marca) or RE_DIVISION.match(texto):
                rotulos.add(MARCA_NOTA.sub("", texto))
            parrafos.append(texto)
        elif hijo.tag == qn("w:tbl"):
            tabla = docx.table.Table(hijo, d)
            n = len(TABLAS) + 1
            TABLAS[n] = [[" ".join(c.text.split()) for c in fila.cells] for fila in tabla.rows]
            parrafos.append(f"§TABLA {n}§")
    return parrafos, rotulos, notas_docx(d)


def parrafos_docx(lineas: list[str], rotulos: set[str]) -> list[tuple[str, str]]:
    """Un párrafo de Word ya es un párrafo: no se unen líneas (eso es del PDF)."""
    salida: list[tuple[str, str]] = []
    lineas = [l for l in lineas if l]
    i = 0
    while i < len(lineas):
        l = lineas[i]
        i += 1
        f = MARCA_FOTO.match(l)
        if f:
            # «FOTOGRAFÍA — N° 3» y el título que la siguen son de la foto: la clase
            # pone el número y el título va con ella (su nota al pie es la fuente).
            foto = FOTOS[int(f.group(1))]
            if i < len(lineas) and RE_ROTULO_FOTO.match(MARCA_NOTA.sub("", lineas[i])):
                i += 1
                if i < len(lineas) and len(lineas[i]) < 300 and not MARCA_FOTO.match(lineas[i]) and not RE_RUBRO.match(lineas[i]):
                    foto["titulo"] = lineas[i]
                    i += 1
            salida.append(("foto", f.group(1)))
            continue
        m = MARCA_TABLA.match(l)
        if m:
            salida.append(("tabla", m.group(1)))
        elif MARCA_NOTA.sub("", l) in rotulos or (RE_RUBRO.match(l) and len(l) < 160 and not l.endswith((",", ";"))):
            salida.append(("rubro", l))
        else:
            salida.append(("p", l))
    return salida


# --- 3. Notas al pie dentro del texto ------------------------------------------


# La fórmula legal no lleva notas al pie (las llamadas «5.1», «I.1» son
# numerales): solo se buscan en la exposición de motivos.
CON_NOTAS = {"fundamentos", "antecedentes", "efecto", "costo-beneficio", "ambiental", "agenda", "conclusion"}
RE_NUMERAL = re.compile(r"(\d|\b[IVX]+)\.$")


def nodo_tabla(filas: list[list[str]]) -> dict:
    """Tabla del editor. La primera fila es encabezado si todas sus celdas
    son rótulos cortos («Norma | Efecto normativo | Resultado»)."""
    def celda(texto: str, tipo: str) -> dict:
        contenido = [{"type": "paragraph", "content": [{"type": "text", "text": texto}]}] if texto else [{"type": "paragraph"}]
        return {"type": tipo, "attrs": {"colspan": 1, "rowspan": 1}, "content": contenido}

    encabezado = bool(filas) and all(c and len(c) <= 40 for c in filas[0])
    return {
        "type": "table",
        "content": [
            {"type": "tableRow", "content": [celda(c, "tableHeader" if encabezado and i == 0 else "tableCell") for c in f]}
            for i, f in enumerate(filas)
        ],
    }


def con_notas(pars: list[tuple[str, str]], notas: dict[int, str], usadas: set[int], buscar: bool = True) -> list[dict]:
    """Párrafos TipTap; las llamadas de nota («…democrático15») se vuelven
    nodos `footnote` con su texto, en orden."""
    nodos: list[dict] = []
    for tipo, texto in pars:
        if tipo == "tabla":
            nodos.append(nodo_tabla(TABLAS.get(int(texto), [])))
            continue
        if tipo == "foto":
            nodos.append({"type": "fotografia", "attrs": {"foto": int(texto)}})
            continue
        piezas: list[dict] = []
        resto = texto
        while True:
            # La llamada que aparece PRIMERO entre las próximas notas libres:
            # una nota que no se encuentre no bloquea a las siguientes.
            libres = sorted(n for n in notas if n not in usadas)[:8] if buscar else []
            # Candidatas: una nota, o dos o tres consecutivas PEGADAS
            # («electoral.1516» = notas 15 y 16), que el PDF a veces junta.
            fichas: list[list[int]] = []
            for n in libres:
                for k in (3, 2, 1):
                    grupo = [n + i for i in range(k)]
                    if all(g in notas and g not in usadas for g in grupo):
                        fichas.append(grupo)
            hallazgos = [
                (m, g)
                for g in fichas
                for m in re.finditer(rf"(?<=[A-Za-zÁÉÍÓÚáéíóúñÑ”\"\)\.,;:]){''.join(map(str, g))}(?!\d)", resto)
                # «5.1» o «I.1» son numerales, no llamadas de nota.
                if not RE_NUMERAL.search(resto[max(0, m.start() - 4): m.start()])
            ]
            if not hallazgos:
                break
            # La más temprana; a igual posición, el grupo más largo.
            m, grupo = min(hallazgos, key=lambda x: (x[0].start(), -len(x[1])))
            antes = resto[: m.start()]
            if antes:
                piezas.append({"type": "text", "text": antes})
            for n in grupo:
                piezas.append({"type": "footnote", "attrs": {"texto": notas[n]}})
                usadas.add(n)
            resto = resto[m.end():]
        if resto:
            piezas.append({"type": "text", "text": resto})
        if tipo == "rubro":
            nodos.append({"type": "heading", "attrs": {"level": 3}, "content": piezas})
        else:
            nodos.append({"type": "paragraph", "content": piezas})
    return nodos


def tipo_fuente(t: str) -> str:
    if re.search(r"\bSTC\b|Tribunal Constitucional|Corte Interamericana", t):
        return "jurisprudencia"
    if re.search(r"Proyectos? de Ley|Senate Bill|Projeto|PL \d", t):
        return "proyecto"
    if re.search(r"^(Ley|Decreto|Código|Constitución|Reglamento|Acuerdo Nacional)", t):
        return "norma"
    if re.search(r"Universidad|vol\.|DOI|doi\.org|Revista|n\.º \d", t):
        return "estudio"
    if re.search(r"Infobae|Unitel|BioBio|Emol|El Comercio|RPP|OjoPúblico|Ojo Público|Comunicaciones", t):
        return "prensa"
    return "otro"


# --- 4. API ------------------------------------------------------------------


class Api:
    def __init__(self, base: str, usuario: str, clave: str):
        self.base = base.rstrip("/")
        self.token = self.pedir("/api/auth/login", {"usuario": usuario, "clave": clave})["token"]

    def pedir(self, ruta, datos=None, metodo=None, crudo=None, tipo="application/json"):
        cuerpo = crudo if crudo is not None else (json.dumps(datos).encode() if datos is not None else None)
        r = urllib.request.Request(self.base + ruta, data=cuerpo, method=metodo or ("POST" if cuerpo is not None else "GET"))
        if cuerpo is not None:
            r.add_header("Content-Type", tipo)
        if getattr(self, "token", None):
            r.add_header("Authorization", f"Bearer {self.token}")
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read() or b"null")

    def subir(self, ruta, archivo: Path, etiqueta: str, categoria: str):
        limite = uuid.uuid4().hex
        cab = (
            f"--{limite}\r\nContent-Disposition: form-data; name=\"etiqueta\"\r\n\r\n{etiqueta}\r\n"
            f"--{limite}\r\nContent-Disposition: form-data; name=\"categoria\"\r\n\r\n{categoria}\r\n"
            f"--{limite}\r\nContent-Disposition: form-data; name=\"archivo\"; filename=\"{archivo.name}\"\r\n"
            "Content-Type: application/octet-stream\r\n\r\n"
        ).encode()
        cuerpo = cab + archivo.read_bytes() + f"\r\n--{limite}--\r\n".encode()
        return self.pedir(ruta, crudo=cuerpo, tipo=f"multipart/form-data; boundary={limite}")

    def subir_imagen(self, pid: int, datos: bytes, ext: str) -> tuple[str, str]:
        limite = uuid.uuid4().hex
        cab = (f"--{limite}\r\nContent-Disposition: form-data; name=\"archivo\"; filename=\"foto.{ext}\"\r\n"
               "Content-Type: application/octet-stream\r\n\r\n").encode()
        r = self.pedir(f"/api/proyectos/{pid}/imagenes", crudo=cab + datos + f"\r\n--{limite}--\r\n".encode(),
                       tipo=f"multipart/form-data; boundary={limite}")
        return r["archivo"], r["url"]


# --- 4. Texto citado de otra norma ----------------------------------------------

RE_ABRE_CITA = re.compile(r"^[“\"«]")
RE_CIERRA_CITA = re.compile(r"[”\"»]\s*\.?$")
# Un rótulo SIN comillas (artículo o disposición del propio proyecto) cierra
# una cita aunque el PDF haya omitido la comilla de cierre (hallado en la
# disposición SEGUNDA del piloto: «“Artículo 1. … (...) a. 199, …» sin cierre).
RE_ROTULO_PROPIO = re.compile(r"^(Artículo \d|PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA|ÚNICA|DISPOSICI)")


def _texto(n: dict) -> str:
    return "".join(x.get("text", "") for x in n.get("content", []) or [])


def citas(nodos: list[dict]) -> list[dict]:
    """Agrupa en un `blockquote` el texto que el proyecto cita de otra norma
    (el que sigue a «en los siguientes términos:» y va entre comillas); la
    plantilla lo sangra. Solo la fórmula legal lo tiene."""
    salida: list[dict] = []
    i = 0
    while i < len(nodos):
        n = nodos[i]
        tras_cita = bool(salida) and salida[-1]["type"] == "blockquote"
        previo = "" if not salida or tras_cita else _texto(salida[-1]).rstrip()
        # Abre tras «…términos:» o justo después de otra cita (dos artículos
        # citados seguidos: «“Artículo 132.-…”» y «“Artículo 138.-…”»).
        if RE_ABRE_CITA.match(_texto(n)) and (previo.endswith(":") or tras_cita):
            bloque: list[dict] = []
            while i < len(nodos):
                t = _texto(nodos[i])
                if bloque and nodos[i]["type"] == "heading" and RE_ROTULO_PROPIO.match(t):
                    break
                bloque.append(nodos[i])
                i += 1
                if RE_CIERRA_CITA.search(t):
                    break
            salida.append({"type": "blockquote", "content": bloque})
            continue
        salida.append(n)
        i += 1
    return salida


# --- 5. Word de punta a punta (lo usan este script y la API /importar-word) -------------

def _con_notas_word(nodo: dict, notas: dict[int, str]) -> dict:
    """Cambia cada «⟦id⟧» de los textos por el nodo `footnote` con su texto."""
    hijos = nodo.get("content")
    if not hijos:
        return nodo
    nuevos: list[dict] = []
    for h in hijos:
        if h.get("type") == "text" and MARCA_NOTA.search(h.get("text", "")):
            resto = h["text"]
            pos = 0
            for m in MARCA_NOTA.finditer(resto):
                if m.start() > pos:
                    nuevos.append({**h, "text": resto[pos:m.start()]})
                texto = notas.get(int(m.group(1)))
                if texto:
                    nuevos.append({"type": "footnote", "attrs": {"texto": texto}})
                pos = m.end()
            if pos < len(resto):
                nuevos.append({**h, "text": resto[pos:]})
        else:
            nuevos.append(_con_notas_word(h, notas))
    return {**nodo, "content": nuevos}


def _fotos(nodo: dict, notas: dict[int, str]) -> dict:
    """`fotografia` con su título; la nota al pie del título es la fuente."""
    if nodo.get("type") == "fotografia" and "foto" in (nodo.get("attrs") or {}):
        n = nodo["attrs"]["foto"]
        titulo = FOTOS.get(n, {}).get("titulo", "")
        ids = [int(x) for x in MARCA_NOTA.findall(titulo)]
        fuente = " ".join(notas[i] for i in ids if i in notas)
        return {"type": "fotografia", "attrs": {"foto": n, "titulo": " ".join(MARCA_NOTA.sub("", titulo).split()), "fuente": fuente, "ancho": 0.8}}
    if nodo.get("content"):
        return {**nodo, "content": [_fotos(h, notas) for h in nodo["content"]]}
    return nodo


def asignar_fotos(contenido: dict[str, list[dict]], guardar) -> dict[str, list[dict]]:
    """Guarda cada foto con `guardar(datos, ext) -> (archivo, src)` y deja el nodo
    `fotografia` como lo espera el editor (sin el número interno)."""
    def rec(n: dict) -> dict:
        a = n.get("attrs") or {}
        if n.get("type") == "fotografia" and "foto" in a:
            foto = FOTOS[a["foto"]]
            archivo, src = guardar(foto["datos"], foto["ext"])
            return {"type": "fotografia", "attrs": {"archivo": archivo, "src": src, "titulo": a.get("titulo", ""), "fuente": a.get("fuente", ""), "ancho": a.get("ancho", 0.8)}}
        return {**n, "content": [rec(h) for h in n["content"]]} if n.get("content") else n
    return {c: [rec(n) for n in nodos] for c, nodos in contenido.items()}


def analizar_docx(ruta: Path) -> dict[str, list[dict]]:
    """{clave de la parte: nodos del editor} de un proyecto en Word, con sus notas al pie
    en su lugar y sus fotos como `fotografia` (attrs.foto = n de FOTOS; quien guarda la
    imagen pone `archivo` y `src`)."""
    cuerpo, rotulos, notas = texto_docx(ruta)
    trozos = partes(cuerpo)
    orden = [c for c, _ in CORTES]
    orden.insert(orden.index("fundamentos") + 1, "antecedentes")
    contenido = {
        clave: con_notas(parrafos_docx(trozos[clave], rotulos), {}, set(), buscar=False)
        for clave in orden
        if clave in trozos and not clave.startswith("_")
    }
    contenido = {c: (nodos if c in CON_NOTAS else citas(nodos)) for c, nodos in contenido.items()}
    return {c: [_con_notas_word(_fotos(n, notas), notas) for n in nodos] for c, nodos in contenido.items() if nodos}


def principal() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pdf", type=Path, help="el proyecto en PDF (presentado) o en Word (.docx)")
    ap.add_argument("--ficha", type=Path, help="JSON del despacho: titulo, datos, estado, numero_oficial, fecha_presentacion, fases_hechas, archivos, tareas")
    ap.add_argument("--simular", action="store_true")
    a = ap.parse_args()

    es_word = a.pdf.suffix.lower() == ".docx"
    notas: dict[int, str] = {}
    usadas: set[int] = set()
    if es_word:
        # Notas al pie y fotos del Word en su lugar (2026-10-05): ver analizar_docx.
        contenido = analizar_docx(a.pdf)
        trozos = {"titulo": [_texto(n) for n in contenido.get("titulo", [])]}
    else:
        cuerpo, notas = limpiar(texto_pdf(a.pdf))
        trozos = partes(cuerpo)
        # En el ORDEN DEL DOCUMENTO (los antecedentes salen de dentro de los
        # fundamentos): las llamadas de nota se buscan en ese mismo orden.
        orden = [c for c, _ in CORTES]
        orden.insert(orden.index("fundamentos") + 1, "antecedentes")
        contenido = {
            clave: con_notas(parrafos(trozos[clave]), notas, usadas, buscar=clave in CON_NOTAS)
            for clave in orden
            if clave in trozos and not clave.startswith("_")
        }
        contenido = {c: (nodos if c in CON_NOTAS else citas(nodos)) for c, nodos in contenido.items()}
    n_citas = sum(1 for nodos in contenido.values() for n in nodos if n["type"] == "blockquote")
    sin_ubicar = sorted(set(notas) - usadas)
    print(f"Notas al pie: {len(notas)} ({len(usadas)} en su lugar, {len(sin_ubicar)} sin ubicar)")
    print(f"Textos citados de otras normas: {n_citas}")
    for clave, nodos in contenido.items():
        palabras = sum(len(_texto(b).split()) for n in nodos for b in (n["content"] if n["type"] == "blockquote" else [n]))
        print(f"  {clave:16} {len(nodos):4} bloques  {palabras:6} palabras")
    if a.simular:
        return 0

    ficha = json.loads(a.ficha.read_text(encoding="utf-8")) if a.ficha else {}
    api = Api(os.environ.get("SGDP_API", "http://127.0.0.1:8000"), os.environ["SGDP_USUARIO"], os.environ["SGDP_CLAVE"])
    titulo = ficha.get("titulo") or " ".join(trozos.get("titulo", ["Proyecto de ley"]))
    pid = api.pedir("/api/proyectos", {"tipo": "proyecto_de_ley", "titulo": titulo})["id"]
    api.pedir(f"/api/proyectos/{pid}", {k: ficha[k] for k in ("datos", "numero_oficial", "fecha_presentacion") if k in ficha}, metodo="PATCH")

    if es_word:
        contenido = asignar_fotos(contenido, lambda datos, ext: api.subir_imagen(pid, datos, ext))
    p = api.pedir(f"/api/proyectos/{pid}")
    existentes = {s["clave"] for s in p["secciones"]}
    for clave, nodos in contenido.items():
        if clave not in existentes or not nodos:
            print(f"  (sin parte «{clave}» en la plantilla: se omite)")
            continue
        api.pedir(f"/api/proyectos/{pid}/secciones/{clave}/tomar", {})
        api.pedir(f"/api/proyectos/{pid}/secciones/{clave}", {"contenido": {"type": "doc", "content": nodos}, "version_base": 0, "nota": f"Importada del {'Word' if es_word else 'PDF presentado'} ({a.pdf.name})"}, metodo="PUT")
        api.pedir(f"/api/proyectos/{pid}/secciones/{clave}/soltar", {})
        if ficha.get("partes_aprobadas", True):
            api.pedir(f"/api/proyectos/{pid}/secciones/{clave}", {"estado": "aprobada"}, metodo="PATCH")

    for n, t in sorted(notas.items()):
        seccion = next((c for c, nodos in contenido.items() if any(x.get("type") == "footnote" and x["attrs"]["texto"] == t for nd in nodos for x in nd.get("content", []))), "")
        url = (re.search(r"https?://\S+", t) or [None])[0]
        api.pedir(f"/api/proyectos/{pid}/fuentes", {"tipo": tipo_fuente(t), "referencia": t[:2900], "url": (url or "").rstrip(").,;"), "seccion": seccion, "nota": f"Nota {n} del proyecto presentado"})

    hechas = set(ficha.get("fases_hechas", []))
    for f in p["fases"]:
        if f["clave"] in hechas:
            api.pedir(f"/api/proyectos/{pid}/fases/{f['id']}", {"estado": "hecha", "requisitos": [{**r, "hecho": True} for r in f["requisitos"]]}, metodo="PATCH")
        elif f["clave"] == ficha.get("fase_actual"):
            api.pedir(f"/api/proyectos/{pid}/fases/{f['id']}", {"estado": "en_curso"}, metodo="PATCH")
    fases = {f["clave"]: f["id"] for f in p["fases"]}
    for t in ficha.get("tareas", []):
        api.pedir(f"/api/proyectos/{pid}/tareas", {"titulo": t["titulo"], "detalle": t.get("detalle", ""), "fase_id": fases.get(t.get("fase", "")), "seccion": t.get("seccion", "")})
    if es_word:
        api.subir(f"/api/proyectos/{pid}/archivos", a.pdf, "Versión de origen en Word (antes de la migración)", "origen")
    else:
        api.subir(f"/api/proyectos/{pid}/archivos", a.pdf, "Proyecto de ley presentado (PDF firmado)", "presentado")
    for x in ficha.get("archivos", []):
        ruta = Path(x["ruta"]).expanduser()
        if ruta.is_file():
            api.subir(f"/api/proyectos/{pid}/archivos", ruta, x.get("etiqueta", ruta.stem), x.get("categoria", ""))
    if ficha.get("estado"):
        api.pedir(f"/api/proyectos/{pid}", {"estado": ficha["estado"]}, metodo="PATCH")
    if sin_ubicar:
        api.pedir(f"/api/proyectos/{pid}/comentarios", {"texto": f"Importación: las notas {', '.join(map(str, sin_ubicar))} no se pudieron ubicar en el texto; quedaron como fuentes. Revisar su lugar."})
    print(f"Proyecto creado: id {pid}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())

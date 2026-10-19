"""CUADRO COMPARATIVO del proyecto de ley: texto vigente frente a propuesto.

Edison 2026-10-01 (paso 3.3 de la hoja de ruta). El cuadro NO se escribe a
mano: se DERIVA de las disposiciones modificatorias. Cada texto citado (el
`blockquote` de la parte «dcm») da la columna «Texto propuesto»; el equipo solo
pega la columna «Texto vigente». Al volver a armarlo, lo que ya se pegó se
conserva (por norma y fila), y lo que el proyecto añade va en negrita.

Forma: una tabla TipTap normal (la edita el mismo editor, con versiones y
candado), con
  · una fila de encabezado «Texto vigente | Texto propuesto» (se repite en
    cada página del PDF);
  · por cada texto citado, una fila rótulo de ancho completo («Código Penal ·
    Artículo 359-D») y UNA FILA POR PÁRRAFO: longtable no parte una fila
    entre páginas, así que un artículo largo en una sola celda se saldría de
    la hoja (escollo del motor; ver marco_documental/docs/escollos-y-trampas.md).

Puro (sin base de datos): pruebas en tests/test_comparativo.py.
"""

from __future__ import annotations

import difflib
import re

NO_EXISTE = "(No existe)"
PEGAR = "[Pegue aquí el texto vigente]"
VIGENTE, PROPUESTO = "Texto vigente", "Texto propuesto"

# Norma citada en el epígrafe de la disposición, en su forma corta.
_NORMAS = [
    (re.compile(r"C[oó]digo Penal", re.I), "Código Penal"),
    (re.compile(r"Ley Org[aá]nica de Elecciones", re.I), "Ley Orgánica de Elecciones"),
    (re.compile(r"C[oó]digo Procesal Penal", re.I), "Código Procesal Penal"),
    (re.compile(r"\bLey\s+(N\.?[º°]\s*)?(\d{4,5})\b", re.I), None),
    (re.compile(r"Decreto Legislativo\s+(N\.?[º°]\s*)?(\d+)", re.I), None),
    (re.compile(r"Decreto Supremo\s+(N\.?[º°]\s*)?([\d-]+\w*)", re.I), None),
]
_ARTICULO = re.compile(r"Art[ií]culo\s+(\d+[A-Za-z]?(?:-[A-Z])?)")
_DISPOSICION = re.compile(
    r"^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA|D[EÉ]CIMA|[ÚU]NICA)\b", re.I
)


def _plano(n: dict) -> str:
    if n.get("type") == "text":
        return n.get("text", "")
    return "".join(_plano(h) for h in n.get("content", []) or [])


def _norma(epigrafe: str) -> str:
    for patron, nombre in _NORMAS:
        m = patron.search(epigrafe)
        if m:
            # «Ley N.º 28094» → «Ley 28094»: tipo + número, sin «N.º».
            return nombre or re.sub(r"\s*N\.?[º°]\s*", " ", m.group(0)).strip()
    return ""


def rotulo(epigrafe: str, cita: dict) -> str:
    """«Código Penal · Artículo 359-D» (corto: va en una fila de ancho completo)."""
    primero = _plano((cita.get("content") or [{}])[0])
    art = _ARTICULO.search(primero) or _ARTICULO.search(epigrafe)
    partes = [p for p in (_norma(epigrafe), f"Artículo {art.group(1)}" if art else "") if p]
    return " · ".join(partes) or primero.strip("“”\"« ")[:60]


def es_incorporacion(epigrafe: str) -> bool:
    """«Incorporación del artículo 34-A…»: el artículo entero es nuevo. Una
    incorporación de PÁRRAFOS a un artículo existente sí tiene texto vigente."""
    return bool(re.search(r"Incorporaci[oó]n\s+del\s+art[ií]culo", epigrafe, re.I))


def citas_de(dcm: list[dict]) -> list[tuple[str, dict]]:
    """[(epígrafe de la disposición, blockquote)] en orden."""
    salida: list[tuple[str, dict]] = []
    epigrafe = ""
    for n in dcm:
        if n.get("type") == "heading" and _DISPOSICION.match(_plano(n)):
            epigrafe = _plano(n)
        elif n.get("type") == "blockquote":
            salida.append((epigrafe, n))
    return salida


# --- tabla TipTap ---------------------------------------------------------------


def _parr(texto: str = "", piezas: list[dict] | None = None) -> dict:
    contenido = piezas if piezas is not None else ([{"type": "text", "text": texto}] if texto else [])
    return {"type": "paragraph", "content": contenido} if contenido else {"type": "paragraph"}


def _celda(parrafo: dict, tipo: str = "tableCell", colspan: int = 1, align: str | None = None) -> dict:
    attrs: dict = {"colspan": colspan, "rowspan": 1}
    if align:
        attrs["align"] = align
    return {"type": tipo, "attrs": attrs, "content": [parrafo]}


def _fila(*celdas: dict) -> dict:
    return {"type": "tableRow", "content": list(celdas)}


def _texto_sin_marcas(nodo: dict) -> list[dict]:
    """Las piezas de texto del párrafo citado, sin la negrita de un armado
    anterior (se recalcula)."""
    piezas = []
    for h in nodo.get("content", []) or []:
        if h.get("type") == "text":
            marcas = [m for m in h.get("marks", []) or [] if m.get("type") != "bold"]
            piezas.append({**h, "marks": marcas} if marcas else {"type": "text", "text": h.get("text", "")})
        elif h.get("type") != "footnote":
            piezas.append(h)
    return piezas


def _resaltar(vigente: str, propuesto: str) -> list[dict]:
    """El texto propuesto con las palabras AÑADIDAS (frente al vigente) en
    negrita: así se ve qué cambia sin buscarlo."""
    a, b = vigente.split(), propuesto.split()
    piezas: list[dict] = []
    for op, _i1, _i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if j1 == j2:
            continue
        trozo = " ".join(b[j1:j2])
        if piezas:
            trozo = " " + trozo
        if op in ("insert", "replace"):
            piezas.append({"type": "text", "text": trozo, "marks": [{"type": "bold"}]})
        else:
            piezas.append({"type": "text", "text": trozo})
    # Unir piezas vecinas de igual formato (el editor las une igual).
    unidas: list[dict] = []
    for p in piezas:
        if unidas and bool(unidas[-1].get("marks")) == bool(p.get("marks")):
            unidas[-1] = {**unidas[-1], "text": unidas[-1]["text"] + p["text"]}
        else:
            unidas.append(p)
    return unidas


def vigentes_de(tabla_actual: dict | None) -> dict[tuple[str, int], dict]:
    """Lo que el equipo ya pegó en la columna vigente, por (rótulo, fila)."""
    guardado: dict[tuple[str, int], dict] = {}
    if not tabla_actual:
        return guardado
    tablas = [n for n in tabla_actual.get("content", []) or [] if n.get("type") == "table"]
    if not tablas:
        return guardado
    grupo, i = "", 0
    for fila in tablas[0].get("content", []) or []:
        celdas = fila.get("content", []) or []
        if len(celdas) == 1:
            grupo, i = _plano(celdas[0]).strip(), 0
            continue
        if not celdas or celdas[0].get("type") == "tableHeader":
            continue
        parr = (celdas[0].get("content") or [_parr()])[0]
        if _plano(parr).strip() not in ("", PEGAR):
            guardado[(grupo, i)] = parr
        i += 1
    return guardado


def armar(dcm: list[dict], actual: dict | None = None) -> dict:
    """Documento TipTap de la parte «comparativo», derivado de las citas de
    las modificatorias y conservando la columna vigente ya escrita."""
    guardado = vigentes_de(actual)
    filas = [
        _fila(
            _celda(_parr(VIGENTE), "tableHeader", align="center"),
            _celda(_parr(PROPUESTO), "tableHeader", align="center"),
        )
    ]
    for epigrafe, cita in citas_de(dcm):
        grupo = rotulo(epigrafe, cita)
        rot = _parr(piezas=[{"type": "text", "text": grupo, "marks": [{"type": "bold"}]}])
        filas.append(_fila(_celda(rot, colspan=2, align="center")))
        nuevo = es_incorporacion(epigrafe)
        for i, bloque in enumerate(cita.get("content", []) or []):
            vigente = guardado.get((grupo, i))
            propuesto = _texto_sin_marcas(bloque)
            if vigente is not None and _plano(vigente).strip() != NO_EXISTE:
                propuesto = _resaltar(_plano(vigente), _plano(bloque)) or propuesto
            else:
                if vigente is None:
                    # Artículo nuevo: «(No existe)»; modificado: hay que pegarlo.
                    vigente = _parr((NO_EXISTE if nuevo else PEGAR) if i == 0 else "")
                if bloque.get("type") == "heading":
                    # El epígrafe del artículo citado, en negrita como en el texto.
                    propuesto = [{**x, "marks": [{"type": "bold"}]} if x.get("type") == "text" else x for x in propuesto]
            filas.append(_fila(_celda(vigente), _celda(_parr(piezas=propuesto))))
    return {
        "type": "doc",
        "content": [{"type": "table", "content": filas}] if len(filas) > 1 else [],
    }


def pendientes(doc: dict | None) -> int:
    """Celdas vigentes aún sin pegar (para el aviso al generar)."""
    if not doc:
        return 0
    return sum(
        1
        for n in doc.get("content", []) or []
        if n.get("type") == "table"
        for f in n.get("content", []) or []
        for c in (f.get("content", []) or [])[:1]
        if _plano(c).strip() == PEGAR
    )
